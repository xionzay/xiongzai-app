import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { ApiClientError } from "../src/api/api-error";
import { CommunityClient, FeedbackAttempt, communityError, type CommunityTransport } from "../src/features/community/community-client";
import { notificationDestination } from "../src/features/chat/chat-domain";

const sample = { id: "feedback-one", client_request_id: "stable-id", content: "测试建议", status: "SUBMITTED", reply: null, replied_at: null, created_at: "2026-10-25T00:00:00Z", version: 0 };
function clientWith(handler: (path: string, options?: RequestInit) => Promise<unknown>) {
  const calls: { path: string; public: boolean; options?: RequestInit & { retryAfterRefresh?: boolean } }[] = [];
  const client = new CommunityClient({
    request: async (path, options) => { calls.push({ path, public: false, options }); return handler(path, options); },
    publicRequest: async (path, options) => { calls.push({ path, public: true, options }); return handler(path, options); }
  } as CommunityTransport);
  return { client, calls };
}

test("独立反馈端点鉴权，公告无需 Token，游标和 ID 不可注入路径", async () => {
  const { client, calls } = clientWith(async () => sample);
  await client.policy(); await client.feedback("next&role=admin"); await client.feedbackDetail("a/b");
  await client.feedbackByRequest("request/a"); await client.submit({ client_request_id: "fixed", content: "建议" });
  await client.announcements("next&status=DRAFT"); await client.announcement("a/b"); await client.cover("a/b");
  assert.deepEqual(calls.map(c => c.public), [false, false, false, false, false, true, true, true]);
  assert.equal(calls[1]!.path, "/feedback?limit=20&cursor=next%26role%3Dadmin");
  assert.equal(calls[2]!.path, "/feedback/a%2Fb");
  assert.equal(calls[7]!.path, "/announcements/a%2Fb/cover");
  assert.equal(calls[4]!.options!.retryAfterRefresh, false);
  assert.deepEqual(JSON.parse(String(calls[4]!.options!.body)), { client_request_id: "fixed", content: "建议" });
  assert.ok(calls.every(c => !c.path.includes("support-cases")));
});

test("连续点击共享一个提交；成功后新建议才生成新请求编号", async () => {
  let release!: (value: unknown) => void; let ids = 0;
  const { client, calls } = clientWith(() => new Promise(resolve => { release = resolve; }));
  const attempt = new FeedbackAttempt(client, () => `id-${++ids}`, () => true);
  const first = attempt.submit("  建议  "); const second = attempt.submit("重复点击");
  assert.equal(first, second); assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(String(calls[0]!.options!.body)), { client_request_id: "id-1", content: "建议" });
  release(sample); await first; assert.equal(attempt.pending, false);
  const next = attempt.submit("第二条"); release(sample); await next; assert.equal(ids, 2);
});

test("超时但已落库：查原请求即成功，不重复 POST", async () => {
  const { client, calls } = clientWith(async path => { if (path === "/feedback") throw new ApiClientError("NETWORK_TIMEOUT", "ignored", 408); return { ...sample, content: "原建议" }; });
  const attempt = new FeedbackAttempt(client, () => "stable-id", () => true);
  await assert.rejects(attempt.submit("原建议")); assert.equal(attempt.pending, true);
  assert.equal((await attempt.submit("不能覆盖原建议")).id, sample.id);
  assert.deepEqual(calls.map(c => c.path), ["/feedback", "/feedback/requests/stable-id"]);
});

test("超时且未落库：先查，再以相同 ID 与冻结正文重试", async () => {
  let posts = 0;
  const { client, calls } = clientWith(async path => {
    if (path.startsWith("/feedback/requests/")) throw new ApiClientError("FEEDBACK_NOT_FOUND", "missing", 404);
    if (++posts === 1) throw new TypeError("offline"); return sample;
  });
  const attempt = new FeedbackAttempt(client, () => "stable-id", () => true);
  await assert.rejects(attempt.submit("原建议")); await attempt.submit("被忽略的改变");
  assert.equal(calls[0]!.options!.body, calls[2]!.options!.body);
  assert.equal(calls[1]!.path, "/feedback/requests/stable-id");
});

test("查询失败不盲目重提；账号切换或卸载后不允许旧请求重试", async () => {
  let current = true;
  const { client, calls } = clientWith(async () => { throw new TypeError("offline"); });
  const attempt = new FeedbackAttempt(client, () => "stable-id", () => current);
  await assert.rejects(attempt.submit("建议")); await assert.rejects(attempt.submit("建议"));
  assert.equal(calls.length, 2); assert.equal(calls[1]!.path, "/feedback/requests/stable-id");
  current = false; await assert.rejects(attempt.submit("建议")); assert.equal(calls.length, 2);
  current = true; attempt.dispose(); await assert.rejects(attempt.submit("建议")); assert.equal(calls.length, 2);
  assert.equal(calls[0]!.options!.signal!.aborted, true);
});

test("重试明确被拒绝后可编辑；编号内容不匹配不能宣称提交成功", async () => {
  let posts = 0;
  const { client } = clientWith(async path => {
    if (path.startsWith("/feedback/requests/")) throw new ApiClientError("FEEDBACK_NOT_FOUND", "missing", 404);
    if (++posts === 1) throw new TypeError("offline");
    throw new ApiClientError("FEEDBACK_CONTENT_TOO_LONG", "too long", 400);
  });
  const attempt = new FeedbackAttempt(client, () => "stable-id", () => true);
  await assert.rejects(attempt.submit("建议")); await assert.rejects(attempt.submit("建议")); assert.equal(attempt.pending, false);
  const collisionClient = clientWith(async path => { if (path === "/feedback") throw new TypeError("offline"); return { ...sample, content: "不同的反馈" }; });
  const collision = new FeedbackAttempt(collisionClient.client, () => "stable-id", () => true);
  await assert.rejects(collision.submit("建议")); await assert.rejects(collision.submit("建议"), { code: "IDEMPOTENCY_KEY_CONFLICT" });
  assert.equal(collision.pending, true); assert.equal(collisionClient.calls.length, 2);
});

test("查询期间退出账号，不得将旧正文提交到新账号", async () => {
  let current = true; let count = 0;
  const { client, calls } = clientWith(async () => {
    if (++count === 1) throw new TypeError("offline");
    current = false; throw new ApiClientError("FEEDBACK_NOT_FOUND", "missing", 404);
  });
  const attempt = new FeedbackAttempt(client, () => "stable-id", () => current);
  await assert.rejects(attempt.submit("建议")); await assert.rejects(attempt.submit("建议")); assert.equal(calls.length, 2);
});

test("明确限流/校验拒绝允许编辑，不显示服务端错误中的隐私文本", async () => {
  const { client } = clientWith(async () => { throw new ApiClientError("FEEDBACK_RATE_LIMITED", "PRIVATE_PAYLOAD_SHOULD_NOT_RENDER", 429); });
  const attempt = new FeedbackAttempt(client, () => "stable-id", () => true);
  await assert.rejects(attempt.submit("建议")); assert.equal(attempt.pending, false);
  assert.match(communityError(new ApiClientError("FEEDBACK_RATE_LIMITED", "PRIVATE_PAYLOAD_SHOULD_NOT_RENDER", 429)), /频繁/);
  for (const error of [new Error("PRIVATE_PAYLOAD_SHOULD_NOT_RENDER"), new ApiClientError("UNKNOWN", "PRIVATE_PAYLOAD_SHOULD_NOT_RENDER", 500)]) assert.doesNotMatch(communityError(error), /PRIVATE_PAYLOAD/);
  for (const code of ["__proto__", "constructor", "toString"]) assert.equal(typeof communityError(new ApiClientError(code, "PRIVATE_PAYLOAD_SHOULD_NOT_RENDER", 500)), "string");
});

test("反馈/公告通知进入对应真实详情，不回退到账户或会话", () => {
  assert.deepEqual(notificationDestination("FEEDBACK", "f", {}), { pathname: "/feedback", params: { id: "f" } });
  assert.deepEqual(notificationDestination("ANNOUNCEMENT", "a", {}), { pathname: "/announcements/[id]", params: { id: "a" } });
  assert.equal(notificationDestination("FEEDBACK", null, { conversation_id: "wrong" }), null);
});

type Node = { type: unknown; props: Record<string, unknown> };
function render(file: string, name: string, hooks: Record<string, unknown>, props: Record<string, unknown> = {}) {
  const require = createRequire(import.meta.url);
  const calls: unknown[] = [];
  const context = { exports: {} as Record<string, (props: Record<string, unknown>) => unknown>, require: (module: string): unknown => {
    if (module === "react") return { useState: (value: unknown) => [typeof value === "function" ? value() : value, () => {}], useEffect: () => {}, useCallback: (callback: unknown) => callback, useRef: (value: unknown) => ({ current: value }) };
    if (module === "react-native") return { Image: "Image", ScrollView: "ScrollView", Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View", useWindowDimensions: () => ({ width: 390 }), StyleSheet: { create: (x: unknown) => x } };
    if (module === "expo-router") return { useFocusEffect: () => {}, router: { push: (target: unknown) => calls.push(target) }, useLocalSearchParams: () => ({}) };
    if (module.endsWith('use-app-activity')) return { useAppActivity: () => 'active' };
    if (module === "expo-crypto") return { randomUUID: () => "stable-id" };
    if (module.endsWith("community-api")) return hooks;
    if (module.endsWith("community-client")) return { communityError, FeedbackAttempt };
    if (module === "@tanstack/react-query") return { useQuery: () => hooks.cover };
    if (module.endsWith("auth-provider")) return { useAuth: () => hooks.auth };
    if (module.endsWith("feedback-screen")) return { FeedbackScreen: "FeedbackScreen" };
    if (module.endsWith("theme/tokens")) return { colors: {} };
    if (module.startsWith("@/components/")) return new Proxy({}, { get: (_obj, key) => key });
    return require(module);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const nodes: Node[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const node = value as Node; nodes.push(node);
    if (typeof node.type === "function") visit(node.type(node.props)); else visit(node.props.children);
  };
  visit(context.exports[name]!(props));
  return { nodes, calls, text: nodes.map(n => [n.props.message, n.props.label, n.type === "Text" ? n.props.children : null].flat().filter(v => typeof v === "string").join(" ")).join(" ") };
}
const loaded = { isPending: false, isError: false, refetch: () => {}, isFetching: false };
const announcementFile = "src/features/home/home-announcements.tsx";
test("真实公告组件分别显示加载、失败、空状态，不再回退静态草案", () => {
  const view = (query: unknown) => render(announcementFile, "HomeAnnouncements", { useAnnouncements: () => query });
  assert.match(view({ ...loaded, isPending: true }).text, /正在加载公告/);
  const failed = view({ ...loaded, isError: true }); assert.match(failed.text, /读取失败/); assert.match(failed.text, /重试/);
  assert.match(view({ ...loaded, data: { pages: [{ items: [] }] } }).text, /暂无已发布公告/);
  for (const v of [failed, view({ ...loaded, data: { pages: [{ items: [] }] } })]) assert.doesNotMatch(v.text, /奖励|reportTrade|antiFraud/);
});

test("公告详情读取服务端纯文本；停用/读取失败隐藏旧缓存", () => {
  const data = { id: "announcement", title: "本地发布公告", content: "<script>仅作为纯文本</script>", published_at: sample.created_at, cover_file_id: null };
  const detail = render(announcementFile, "AnnouncementDetailScreen", { useAnnouncement: () => ({ ...loaded, data }) }, { id: data.id });
  assert.match(detail.text, /本地发布公告/); assert.match(detail.text, /<script>仅作为纯文本<\/script>/);
  assert.equal(detail.nodes.some(n => n.type === "WebView"), false);
  const retired = render(announcementFile, "AnnouncementDetailScreen", { useAnnouncement: () => ({ ...loaded, data, isError: true, error: new ApiClientError("ANNOUNCEMENT_NOT_FOUND", "missing", 404) }) }, { id: data.id });
  assert.doesNotMatch(retired.text, /本地发布公告/); assert.match(retired.text, /停用或不存在/);
});

test("公告封面过期不渲染私有地址并提供重新获取入口", () => {
  const view = render(announcementFile, "AnnouncementCover", { cover: { ...loaded, data: { access: { url: "http://127.0.0.1:9000/test-only", expires_at: "2000-01-01T00:00:00Z" } } } }, { id: "a", title: "公告" });
  assert.equal(view.nodes.some(n => n.type === "Image"), false); assert.match(view.text, /重新获取封面/);
});

test('首页双公告使用真实封面、原生分页滑动和详情目标，不重复显示横幅下方标题', () => {
  const items = [{ id: 'a', title: '真实公告甲', cover_file_id: 'file-a', version: 0 }, { id: 'b', title: '真实公告乙', cover_file_id: 'file-b', version: 0 }];
  const view = render(announcementFile, 'HomeAnnouncements', { useAnnouncements: () => ({ ...loaded, data: { pages: [{ items }] } }), cover: { ...loaded, data: { access: { url: 'http://127.0.0.1:9000/test', expires_at: '2099-01-01T00:00:00Z' } } } });
  assert.equal(view.nodes.filter(n => n.type === 'Image').length, 2);
  assert.ok(view.nodes.some(n => n.type === 'ScrollView' && n.props.pagingEnabled));
  assert.ok(view.nodes.some(n => n.props.accessibilityLabel === '暂停自动轮播'));
  const open = view.nodes.find(n => n.props.accessibilityLabel === '查看公告：真实公告乙'); assert.ok(open);
  (open.props.onPress as () => void)();
  assert.deepEqual(JSON.parse(JSON.stringify(view.calls)), [{ pathname: '/announcements/[id]', params: { id: 'b' } }]);
  assert.equal(view.nodes.filter(n => n.type === 'Text' && n.props.children === '真实公告乙').length, 0);
});

test("未登录反馈页不挂载私人查询；账号 key 隔离表单", () => {
  const guest = render("app/feedback.tsx", "default", { auth: { status: "anonymous", user: null } });
  assert.match(guest.text, /登录后/); assert.equal(guest.nodes.some(n => n.type === "FeedbackScreen"), false);
  const member = render("app/feedback.tsx", "default", { auth: { status: "authenticated", user: { id: "user-a" } } });
  assert.equal(member.nodes.find(n => n.type === "FeedbackScreen")!.props.userId, "user-a");
});

test("反馈屏幕真实空状态和回复；规则失败时禁止创建新反馈", () => {
  const hooks = { useFeedbackPolicy: () => ({ ...loaded, data: { max_characters: 2000, hourly_limit: 5 } }), useFeedback: () => ({ ...loaded, data: { pages: [{ items: [] }] } }), useFeedbackDetail: () => loaded };
  const empty = render("src/features/community/feedback-screen.tsx", "FeedbackScreen", hooks, { userId: "u", selectedId: "" });
  assert.match(empty.text, /暂无反馈记录/); assert.match(empty.text, /不是客服工单/);
  const failed = render("src/features/community/feedback-screen.tsx", "FeedbackScreen", { ...hooks, useFeedbackPolicy: () => ({ ...loaded, isError: true }) }, { userId: "u", selectedId: "" });
  assert.equal(failed.nodes.find(n => n.props.label === "提交建议")!.props.disabled, true);
  const reply = render("src/features/community/feedback-screen.tsx", "FeedbackCard", {}, { item: { ...sample, status: "REPLIED", reply: "本地测试回复" } });
  assert.match(reply.text, /已回复/); assert.match(reply.text, /本地测试回复/);
});
