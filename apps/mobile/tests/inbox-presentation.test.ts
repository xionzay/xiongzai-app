import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as presentation from "../src/features/chat/inbox-presentation";
import type { ConversationApiView } from "../src/types/api";

function conversation(id: string, member_role: ConversationApiView["member_role"] = "BUYER", extra: Partial<ConversationApiView> = {}): ConversationApiView {
  return { id, conversation_no: id, conversation_type: "CONSULTATION", member_role, product_id: null, order_id: null, last_message_preview: "今晚一起开黑", last_message_at: null, unread_count: 2, version: 1, created_at: "", can_send: true, send_block_reason: null, support_case: null, counterpart: { user_id: "other", kind: "SELLER", nickname: "晚风 Alex", avatar_file_id: "avatar-real-id", seller_id: "seller", account_status: "NORMAL" }, ...extra };
}

test("消息列表分开买家与卖家身份，客服工单保留在独立客服入口", () => {
  const rows = [conversation("buyer"), conversation("seller", "SELLER"), conversation("support", "BUYER", { conversation_type: "SUPPORT" })];
  assert.deepEqual(presentation.inboxRows(rows, false, "").map(item => item.id), ["buyer"]);
  assert.deepEqual(presentation.inboxRows(rows, true, "").map(item => item.id), ["seller"]);
});

test("已加载会话搜索支持中文名称、大小写和摘要，不伪造历史记录结果", () => {
  const row = conversation("one");
  for (const keyword of ["晚风", " ALEX ", "开黑", "  "]) assert.deepEqual(presentation.inboxRows([row], false, keyword), [row]);
  assert.deepEqual(presentation.inboxRows([row], false, "未加载的历史文字"), []);
  assert.deepEqual(presentation.inboxRows([conversation("empty", "BUYER", { last_message_preview: null })], false, "开黑"), []);
});

test("消息分页去重保持服务端顺序，不改变未读数或源数组", () => {
  const one = conversation("one"); const two = conversation("two");
  const rows = Object.freeze([one, two, one]);
  assert.deepEqual(presentation.inboxRows(rows, false, ""), [one, two]);
  assert.equal(one.unread_count, 2); assert.equal(rows.length, 3);
});

test("消息时间使用稳定24小时显示，无效时间不显示 Invalid Date", () => {
  assert.equal(presentation.inboxTime(null), "");
  assert.equal(presentation.inboxTime("invalid"), "");
  assert.equal(presentation.inboxTime(new Date(2030, 0, 1, 9, 5).toISOString()), "09:05");
});

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function screen(options: { seller?: boolean; guest?: boolean; error?: boolean; pending?: boolean; loadingMore?: boolean; moreError?: boolean; online?: boolean; empty?: boolean } = {}) {
  const require = createRequire(import.meta.url);
  const values: unknown[] = []; let index = 0; let fetches = 0; let refreshed = 0;
  const navigations: unknown[] = [];
  const items = options.empty ? [] : [conversation("buyer"), conversation("seller", "SELLER")];
  const query = { data: options.error ? undefined : { pages: [{ items }] }, isPending: options.pending, isError: options.error || options.moreError, hasNextPage: !options.error, isFetchingNextPage: options.loadingMore, isFetchNextPageError: options.moreError, refetch: async () => { refreshed++; }, fetchNextPage: async () => { fetches++; } };
  const source = readFileSync(new URL("../src/features/chat/messages-screen.tsx", import.meta.url), "utf8");
  const context = { exports: {} as { MessagesScreen: () => unknown }, require(name: string) {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react") return { useState: (initial: unknown) => { const position = index++; if (position >= values.length) values.push(initial); return [values[position], (value: unknown) => { values[position] = value; }]; } };
    if (name === "react-native") return { ...Object.fromEntries(["FlatList", "Pressable", "RefreshControl", "Text", "TextInput", "View"].map(key => [key, key])), Keyboard: { dismiss() {} }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } };
    if (name === "react-native-safe-area-context") return { SafeAreaView: "SafeAreaView" };
    if (name === "expo-router") return { useSegments: () => [options.seller ? "(seller-tabs)" : "(buyer-tabs)"], router: { push: (target: unknown) => { navigations.push(target); } } };
    if (name === "@/auth/auth-provider") return { useAuth: () => ({ status: options.guest ? "anonymous" : "authenticated", user: options.guest ? null : { id: "test" } }) };
    if (name === "@/hooks/use-app-activity") return { useAppActivity: () => "active" };
    if (name === "@/hooks/use-online-status") return { useOnlineStatus: () => options.online ?? true };
    if (name === "./chat-domain") return { shouldPollChat: () => false };
    if (name === "./chat-api") return { useConversations: () => query, useConversationUnread: () => ({ refetch: async () => {} }) };
    if (name === "./inbox-presentation") return presentation;
    if (name === "@/theme/tokens") return { colors: {} };
    if (name.startsWith("@/components/")) return Object.fromEntries(["BrandBackdrop", "FileImage", "JellyIcon", "StateView", "ApprovedIllustration"].map(key => [key, key]));
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = () => { index = 0; return elements(context.exports.MessagesScreen()); };
  return { render, navigations, get fetches() { return fetches; }, get refreshed() { return refreshed; } };
}

test("实际消息组件可展开、收起和清除搜索，收起不丢查询状态", () => {
  const harness = screen();
  const action = (label: string) => harness.render().find(node => node.props.accessibilityLabel === label)!;
  (action("搜索会话").props.onPress as () => void)();
  const input = harness.render().find(node => node.type === "TextInput")!;
  (input.props.onChangeText as (value: string) => void)("no-match");
  assert.equal((harness.render().find(node => node.type === "FlatList")!.props.data as unknown[]).length, 0);
  (action("收起会话搜索").props.onPress as () => void)();
  assert.equal(harness.render().some(node => node.type === "TextInput"), false);
  assert.ok(action("清除会话搜索"));
  (action("清除会话搜索").props.onPress as () => void)();
  assert.equal((harness.render().find(node => node.type === "FlatList")!.props.data as unknown[]).length, 1);
});

test("消息组件游客返回买家或卖家原页面，错误状态保留真实刷新", () => {
  for (const seller of [false, true]) {
    const harness = screen({ guest: true, seller });
    const list = harness.render().find(node => node.type === "FlatList")!;
    const empty = list.props.ListEmptyComponent as Element;
    (empty.props.onRetry as () => void)();
    assert.deepEqual(harness.navigations.map(value => JSON.parse(JSON.stringify(value))), [{ pathname: "/(auth)/required", params: { returnTo: seller ? "/(seller-tabs)/messages" : "/(buyer-tabs)/messages", action: "查看消息" } }]);
  }
  const harness = screen({ error: true });
  const empty = harness.render().find(node => node.type === "FlatList")!.props.ListEmptyComponent as Element;
  assert.equal(empty.props.kind, "error");
  (empty.props.onRetry as () => void)();
  assert.equal(harness.refreshed, 1);
});

test("消息分页按钮加载中禁止重复请求，失败后允许真实重试", () => {
  for (const loadingMore of [false, true]) {
    const harness = screen({ loadingMore, moreError: true });
    assert.equal((harness.render().find(node => node.type === "FlatList")!.props.data as unknown[]).length, 1, "后续分页失败不能清空已加载会话");
    const footer = harness.render().find(node => node.type === "FlatList")!.props.ListFooterComponent as Element;
    assert.equal(Boolean(footer.props.disabled), loadingMore);
    (footer.props.onPress as () => void)();
    assert.equal(harness.fetches, loadingMore ? 0 : 1);
  }
});

test("实际会话行使用对方头像、昵称和真实ID跳转，不再请求商品封面", () => {
  const harness = screen();
  const list = harness.render().find(node => node.type === "FlatList")!;
  const item = (list.props.data as ConversationApiView[])[0]!;
  const rowElement = (list.props.renderItem as (props: { item: ConversationApiView }) => Element)({ item });
  const row = elements((rowElement.type as (props: unknown) => unknown)(rowElement.props));
  assert.equal(row.find(node => node.type === "FileImage")!.props.fileId, "avatar-real-id");
  const pressable = row.find(node => node.type === "Pressable")!;
  assert.equal(pressable.props.accessibilityLabel, "晚风 Alex，2条未读");
  (pressable.props.onPress as () => void)();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.navigations[0])), { pathname: "/conversations/[id]", params: { id: "buyer" } });
});

test("真实空会话与搜索无结果使用设计稿轻量文案，不显示巨型占位符", () => {
  const harness = screen({ empty: true });
  const empty = () => harness.render().find(node => node.type === "FlatList")!.props.ListEmptyComponent as Element;
  assert.equal(empty().type, "View");
  const texts = elements(empty()).filter(node => node.type === "Text");
  assert.equal(texts[0]!.props.children, "暂无会话，从服务或订单详情发起聊天。");
  assert.equal(texts[0]!.props.accessibilityLiveRegion, "polite");
  assert.match(String(texts[1]!.props.children), /审核通过.*不支持实时通话/);
  const style = empty().props.style as Record<string, unknown>;
  assert.equal(style.paddingVertical, 24);
  assert.equal((texts[0]!.props.style as Record<string, unknown>).fontSize, 13);
  assert.equal(style.minHeight, undefined);
  const trigger = harness.render().find(node => node.props.accessibilityLabel === "搜索会话")!;
  (trigger.props.onPress as () => void)();
  (harness.render().find(node => node.type === "TextInput")!.props.onChangeText as (value: string) => void)("不存在");
  assert.match(String(elements(empty()).find(node => node.type === "Text")!.props.children), /没有找到相关会话.*仅搜索已加载/);
});

test("紧凑空会话不会掩盖加载、错误、离线或游客登录状态", () => {
  const pending = screen({ pending: true, empty: true });
  assert.equal((pending.render().find(node => node.type === "FlatList")!.props.ListEmptyComponent as Element).props.kind, "loading");
  const failed = screen({ error: true, empty: true });
  assert.equal((failed.render().find(node => node.type === "FlatList")!.props.ListEmptyComponent as Element).props.kind, "error");
  assert.ok(screen({ empty: true, online: false }).render().some(node => node.props.accessibilityRole === "alert" && String(node.props.children).includes("当前离线")));
  assert.equal((screen({ guest: true, empty: true }).render().find(node => node.type === "FlatList")!.props.ListEmptyComponent as Element).props.actionLabel, "去登录");
});


test("平台客服固定在两端会话列表头，游客、加载和失败状态都保留入口", () => {
  for (const seller of [false, true]) for (const state of [{ empty: true }, { guest: true }, { pending: true }, { error: true }]) {
    const h = screen({ seller, ...state });
    const list = h.render().find(node => node.type === 'FlatList')!;
    const header = elements(list.props.ListHeaderComponent);
    const support = header.find(node => node.props.accessibilityLabel === '进入平台客服')!;
    assert.ok(support);
    (support.props.onPress as () => void)();
    assert.deepEqual(JSON.parse(JSON.stringify(h.navigations)), [{ pathname: '/support', params: { role: seller ? 'seller' : 'buyer' } }]);
    assert.equal(h.fetches, 0);
  }
});

test("客服摘要按会话去重、汇总真实未读，不混入商家消息", () => {
  const old = conversation('support-old', 'BUYER', { conversation_type: 'SUPPORT', unread_count: 2, last_message_at: '2026-10-29T10:00:00Z' });
  const latest = conversation('support-new', 'BUYER', { conversation_type: 'SUPPORT', unread_count: 3, last_message_at: '2026-10-30T10:00:00Z' });
  const rows = Object.freeze([old, conversation('shop'), latest, old]);
  const summary = presentation.supportInboxSummary(rows);
  assert.equal(summary.latest, latest); assert.equal(summary.unread, 5);
  assert.equal(rows.length, 4);
  assert.deepEqual(presentation.supportInboxSummary([]), { latest: null, unread: 0 });
});
