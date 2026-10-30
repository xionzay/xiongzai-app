import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { notificationCategoriesWithFeedback, supportPriorities } from "@xiongzai/contracts";
import { fileURLToPath } from "node:url";
import type { ApiClient } from "../src/api/client";
import { maxSequence, mergeServerMessages, notificationCategoryCopy, notificationDestination, notificationListPath, sentMessageState, shouldPollChat } from "../src/features/chat/chat-domain";
import { HttpPollingChatTransport } from "../src/features/chat/chat-transport";
import { canSendSupport } from "../src/features/chat/support-domain";
import { ChatOutboxStore } from "../src/storage/chat-outbox";
import type { MessageApiView } from "../src/types/api";
import { MemorySecureStore } from "./test-helpers";

const messagesScreenSource = readFileSync(fileURLToPath(new URL("../src/features/chat/messages-screen.tsx", import.meta.url).href), "utf8");
const notificationsScreenSource = readFileSync(fileURLToPath(new URL("../src/features/chat/notifications-screen.tsx", import.meta.url).href), "utf8");
const notificationDetailSource = readFileSync(fileURLToPath(new URL("../src/features/chat/notification-detail-screen.tsx", import.meta.url).href), "utf8");
const chatScreenSource = readFileSync(fileURLToPath(new URL("../src/features/chat/chat-screen.tsx", import.meta.url).href), "utf8");
const supportListSource = readFileSync(fileURLToPath(new URL("../src/features/chat/support-list-screen.tsx", import.meta.url).href), "utf8");
const chatApiSource = readFileSync(fileURLToPath(new URL("../src/features/chat/chat-api.ts", import.meta.url).href), "utf8");
const supportCreatorSource = readFileSync(fileURLToPath(new URL("../src/features/chat/support-case-creator.ts", import.meta.url).href), "utf8");

function message(id: string, sequence: string, extra: Partial<MessageApiView> = {}): MessageApiView { return { id, conversation_id: "conversation-1", client_message_id: `client-${id}`, sequence_no: sequence, sender_user_id: "user-1", sender_admin_id: null, sender_role: "BUYER", message_type: "TEXT", content: id, send_status: "SENT", moderation_status: "APPROVED", created_at: "2026-01-01T00:00:00.000Z", read_by_recipient: false, ...extra }; }

test("同一失败消息原位重试复用 client_message_id，新内容生成新编号", async () => {
  let ids = 0; const store = new ChatOutboxStore(new MemorySecureStore(), () => `id-${++ids}`);
  const first = await store.prepare("conversation-1", "你好"); const failed = await store.failed("conversation-1", first); const retry = await store.prepare("conversation-1", "你好"); const changed = await store.prepare("conversation-1", "新的消息");
  assert.equal(first.clientMessageId, failed.clientMessageId); assert.equal(retry.clientMessageId, first.clientMessageId); assert.equal(retry.state, "SENDING"); assert.notEqual(changed.clientMessageId, first.clientMessageId); assert.equal(ids, 2);
  await store.clearAll(); assert.equal(await store.read("conversation-1"), null);
});

test("消息 Cursor 页面去重并保持服务端倒序，历史加载可保持可见锚点", () => {
  const merged = mergeServerMessages([{ items: [message("m3", "3"), message("m2", "2")] }, { items: [message("m2", "2"), message("m1", "1")] }]);
  assert.deepEqual(merged.map((item) => item.id), ["m3", "m2", "m1"]); assert.equal(maxSequence(merged), "3");
});

test("发送状态只从服务端持久化结果和收件人已读进度推导", () => {
  assert.equal(sentMessageState(message("a", "1")), "SENT"); assert.equal(sentMessageState(message("a", "1", { read_by_recipient: true })), "READ"); assert.equal(sentMessageState(message("a", "1", { send_status: "FAILED" })), "FAILED");
});

test("HTTP 降级只在前台联网时轮询，客服关闭后不可发送", () => {
  assert.equal(shouldPollChat("active", true), true); assert.equal(shouldPollChat("background", true), false); assert.equal(shouldPollChat("active", false), false); assert.equal(canSendSupport("CLOSED"), false); assert.equal(canSendSupport("TRANSFERRED"), true);
});

test("客服优先级复用服务端共享契约并包含 MEDIUM，不包含不存在的 LOW", () => {
  assert.deepEqual(supportPriorities, ["NORMAL", "MEDIUM", "HIGH", "URGENT"]);
  assert.match(supportCreatorSource, /import type \{ SupportPriority \} from "@xiongzai\/contracts"/u);
  assert.match(supportCreatorSource, /priority: SupportPriority/u);
  assert.match(chatApiSource, /SupportCaseCreator, type SupportCreateInput/u);
  assert.doesNotMatch(supportCreatorSource, /priority: "LOW"/u);
});

test("通知深链覆盖订单、退款、投诉、会话、客服及账户安全降级", () => {
  assert.equal(notificationDestination("ORDER", "o1", {})?.pathname, "/orders/[id]"); assert.equal(notificationDestination("REFUND", "r1", {})?.pathname, "/refunds/[id]"); assert.equal(notificationDestination("COMPLAINT", "c1", {})?.pathname, "/complaints/[id]"); assert.equal(notificationDestination("CONVERSATION", "v1", {})?.pathname, "/conversations/[id]"); assert.equal(notificationDestination("SUPPORT_CASE", "s1", {})?.pathname, "/support/[id]"); assert.equal(notificationDestination("WITHDRAWAL", "w1", {})?.pathname, "/(buyer-tabs)/mine"); assert.equal(notificationDestination(null, null, { conversation_id: "v2" })?.params?.id, "v2"); assert.equal(notificationDestination(null, null, {}), null);
});

test("通知分类覆盖共享契约、反馈回复和未知类型，列表详情共用中文显示", () => {
  const expected = { ORDER: "订单通知", ACCOUNT: "账户通知", PLATFORM: "平台通知", FEEDBACK: "反馈通知" };
  for (const category of notificationCategoriesWithFeedback) {
    assert.equal(notificationCategoryCopy(category).label, expected[category]);
    assert.equal(notificationCategoryCopy(category).badge.length, 1);
  }
  assert.deepEqual(notificationCategoryCopy("FUTURE_KIND"), { badge: "通", label: "其他通知" });
  assert.deepEqual(notificationCategoryCopy("__proto__"), { badge: "通", label: "其他通知" });
  assert.deepEqual(notificationCategoryCopy(""), { badge: "通", label: "其他通知" });
  assert.match(notificationsScreenSource, /notificationCategoryCopy\(item.category\)/u);
  assert.match(notificationDetailSource, /notificationCategoryCopy\(item.category\).label/u);
  assert.match(notificationsScreenSource, /key: "FEEDBACK", label: "反馈"/u);
  assert.deepEqual(notificationDestination("FEEDBACK", "feedback-test", {}), { pathname: "/feedback", params: { id: "feedback-test" } });
});

test("新版通知列表、未读和全部已读显式协商反馈能力，分页保留分类与签名游标", () => {
  for (const category of [undefined, ...notificationCategoriesWithFeedback]) {
    const target = new URL(notificationListPath(category, "signed+cursor=/&x"), "http://local.invalid");
    assert.equal(target.searchParams.get("include_feedback"), "true");
    assert.equal(target.searchParams.get("category"), category ?? null);
    assert.equal(target.searchParams.get("cursor"), "signed+cursor=/&x");
    assert.equal(target.searchParams.get("limit"), "20");
    assert.equal(target.searchParams.size, category ? 4 : 3);
  }
  assert.equal(new URL(notificationListPath(), "http://local.invalid").searchParams.has("cursor"), false);
  assert.match(chatApiSource, /notificationListPath\(category, pageParam\)/u);
  assert.match(chatApiSource, /notifications\/unread-count\?include_feedback=true/u);
  assert.match(chatApiSource, /notifications\/read-all\?include_feedback=true/u);
});

test("ChatTransport 使用真实 HTTP 路径并提交已读序号", async () => {
  const calls: { path: string; body?: string }[] = []; const client = { request: async (path: string, options: RequestInit = {}) => { calls.push({ path, body: typeof options.body === "string" ? options.body : undefined }); if (path.endsWith("/messages") && options.method === "POST") return message("sent", "5"); if (path.endsWith("/read")) return { conversation_id: "conversation-1", last_read_sequence_no: "5", unread_count: 0 }; return { items: [message("m1", "1")], next_cursor: null }; } } as unknown as ApiClient;
  const transport = new HttpPollingChatTransport(client); assert.equal(transport.mode, "HTTP_POLLING"); await transport.listMessages("conversation-1", "signed-cursor"); await transport.sendMessage("conversation-1", "client-fixed", "消息内容"); await transport.markRead("conversation-1", "5");
  assert.match(calls[0]!.path, /cursor=signed-cursor/); assert.deepEqual(JSON.parse(calls[1]!.body!), { client_message_id: "client-fixed", content: "消息内容" }); assert.deepEqual(JSON.parse(calls[2]!.body!), { last_read_sequence_no: "5" });
});

test("消息首页对齐昵称头像平铺列表，客服移到聊天列表、通知保留首页", () => {
  const mine = readFileSync(new URL("../src/features/account/mine-screen.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/features/home/catalog-home-screen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(mine, /label="平台客服"/u);
  assert.match(messagesScreenSource, /进入平台客服/u);
  assert.match(messagesScreenSource, /pathname: '\/support'/u);
  assert.match(home, /path: "\/notifications"/u);
  assert.match(messagesScreenSource, /minHeight:\s*68/u);
  assert.match(messagesScreenSource, /minHeight:\s*82/u);
  assert.match(messagesScreenSource, /fileId=\{item.counterpart.avatar_file_id\}/u);
  assert.match(messagesScreenSource, /<FlatList/u);
  assert.match(messagesScreenSource, /搜索已加载会话的名称或最近消息摘要/u);
  assert.match(messagesScreenSource, /暂无会话/u);
  assert.match(chatScreenSource, /请.*平台|交易/u);
});

test("站内通知页保留真实分类、未读和分页能力并标记推送未接入", () => {
  for (const label of ["站内通知", "订单、账户与平台消息", "系统推送尚未接入", "全部", "订单", "账户", "平台", "暂无通知", "订单、账户与平台消息会显示在这里。", "全部已读"]) assert.match(notificationsScreenSource, new RegExp(label, "u"));
  assert.match(notificationsScreenSource, /useNotifications\(canRead, polling && canRead, category\)/u);
  assert.match(notificationsScreenSource, /useNotificationUnread\(canRead, polling && canRead\)/u);
  assert.match(notificationsScreenSource, /status === "authenticated" && Boolean\(user\)/u);
  assert.match(notificationsScreenSource, /returnTo: "\/notifications"/u);
  assert.match(notificationsScreenSource, /filter === "ALL" \? undefined : filter/u);
  assert.match(notificationsScreenSource, /markAllNotificationsRead\(\)/u);
  assert.match(notificationsScreenSource, /item\.read_status === "UNREAD"/u);
  assert.match(notificationsScreenSource, /notificationBody\(item\)/u);
  assert.match(notificationsScreenSource, /query\.fetchNextPage\(\)/u);
  assert.match(notificationsScreenSource, /pathname: "\/notifications\/\[id\]"/u);
  assert.match(notificationsScreenSource, /flattenNotifications\(query\.data\?\.pages \?\? \[\]\)/u);
  assert.doesNotMatch(notificationsScreenSource, /fake|sampleNotification|demoNotification/u);
});

test("通知详情页对齐原设计并保留自动已读、权限验证和真实深链", () => {
  for (const label of ["通知详情", "消息已送达并记录", "关联订单", "关联退款", "关联投诉", "关联会话", "关联客服工单", "查看订单", "查看退款详情", "查看投诉详情", "进入会话", "查看客服工单"]) assert.match(notificationDetailSource, new RegExp(label, "u"));
  assert.match(notificationDetailSource, /useNotification\(id, canRead\)/u);
  assert.match(notificationDetailSource, /!canRead \|\| notificationStatus !== "UNREAD"/u);
  assert.match(notificationDetailSource, /returnTo: `\/notifications\/\$\{id\}`/u);
  assert.match(notificationDetailSource, /markNotificationRead\(id\)/u);
  assert.match(notificationDetailSource, /notificationBody\(item\)/u);
  assert.match(notificationDetailSource, /notificationDestination\(item\.related_type, item\.related_id, item\.content_variables\)/u);
  assert.match(notificationDetailSource, /verifyNotificationTarget\(item\.related_type, item\.related_id, item\.content_variables\)/u);
  assert.match(notificationDetailSource, /router\.push\(destination as never\)/u);
  assert.doesNotMatch(notificationDetailSource, /services\[0\]|fake|sampleNotification|demoNotification/u);
});

test("文字聊天页对齐原设计并保留真实历史、已读、重试和服务上下文", () => {
  for (const label of ["订单会话", "平台客服", "商品咨询", "请在平台内沟通，保障交易安全", "商品状态与价格以详情页为准", "输入消息…", "发送", "发送中…", "发送失败", "点击重试", "正在加载历史消息…"]) assert.match(chatScreenSource, new RegExp(label, "u"));
  assert.match(chatScreenSource, /<ChatBackdrop/u);
  assert.match(chatScreenSource, /backgroundColor: approvedLayout.chatBubble/u);
  assert.match(chatScreenSource, /trigger="voice"/u);
  assert.match(chatScreenSource, /trigger="more"/u);
  assert.doesNotMatch(chatScreenSource, /可直接下单/u);
  assert.match(chatScreenSource, /styles\.pageTitle\} numberOfLines=\{1\}>\{profileLabel\}/u);
  assert.match(chatScreenSource, /messageBody: \{[^}]*fontSize: 16/u);
  assert.match(chatScreenSource, /input: \{[^}]*minHeight: 48/u);
  assert.match(chatScreenSource, /useConversation\(id, Boolean\(user\), polling\)/u);
  assert.match(chatScreenSource, /useMessages\(id, Boolean\(user\) && conversation\.isSuccess, polling\)/u);
  assert.match(chatScreenSource, /useServiceDetail\(productId, Boolean\(productId\)\)/u);
  assert.match(chatScreenSource, /mergeServerMessages\(messages\.data\?\.pages \?\? \[\]\)/u);
  assert.match(chatScreenSource, /chatTransport\.markRead\(id, sequence\)/u);
  assert.match(chatScreenSource, /chatOutboxStore\.prepare\(id, content, stickerId\)/u);
  assert.match(chatScreenSource, /chatOutboxStore\.failed\(id, pending\)/u);
  assert.match(chatScreenSource, /latestOwnMessageId = serverMessages\.find\(\(item\) => item\.sender_user_id === user\?\.id\)\?\.id \?\? null/u);
  assert.match(chatScreenSource, /mine && showDeliveryStatus \? ` · \$\{deliveryStateLabel\(item\)\}` : ""/u);
  assert.match(chatScreenSource, /state === "READ" \? "已读" : state === "FAILED" \? "发送失败" : "已发送"/u);
  assert.match(chatScreenSource, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/u);
  assert.match(chatScreenSource, /pathname: "\/services\/\[id\]", params: \{ id: productId \}/u);
  assert.doesNotMatch(chatScreenSource, /companions\[|services\[0\]|fake|sampleMessage|demoMessage/u);
});

test("平台客服页对齐原设计并保留真实工单、消息、订单和重开入口", () => {
  for (const label of ["平台客服", "订单咨询与问题反馈", "客服记录", "熊崽客服中心", "服务时间 09:00–24:00 · 平台内沟通", "关联订单", "尚未关联订单", "支付或扣款问题", "订单与履约问题", "退款/投诉进度", "账号与实名认证", "人工客服排队中", "人工客服已接入", "重新打开客服工单", "转人工客服", "涉及资金或争议的问题将由人工客服处理", "输入问题或订单号…", "发送"]) assert.match(supportListSource, new RegExp(label, "u"));
  assert.match(supportListSource, /useSupportCases\(Boolean\(user\)\)/u);
  assert.match(supportListSource, /useMessages\(conversationId, Boolean\(user\) && Boolean\(conversationId\), polling\)/u);
  assert.match(supportListSource, /createSupportCase\(\{ topic: content\.slice\(0, 100\), priority: "NORMAL", initial_message: content, source_page: "mobile\/support" \}, user\.id, operation\.isCurrent\)/u);
  assert.match(supportCreatorSource, /client_message_id: pending\.clientMessageId/u);
  assert.match(supportCreatorSource, /this\.outbox\.prepare\(scope, JSON\.stringify\(payload\)\)/u);
  assert.match(supportListSource, /chatOutboxStore\.prepare\(conversationId, content\)/u);
  assert.match(supportListSource, /chatOutboxStore\.failed\(conversationId, pending\)/u);
  assert.match(supportListSource, /chatTransport\.sendMessage\(conversationId, pending\.clientMessageId, pending\.content\)/u);
  assert.match(supportListSource, /chatTransport\.markRead\(conversationId, maxSequence\(serverMessages\)\)/u);
  assert.match(supportListSource, /useOrderDetail\(orderId, Boolean\(orderId\)\)/u);
  assert.match(supportListSource, /pathname: "\/support\/\[id\]"/u);
  assert.match(supportListSource, /pathname: "\/conversations\/\[id\]"/u);
  assert.match(supportListSource, /pathname: "\/orders\/\[id\]"/u);
  assert.doesNotMatch(supportListSource, /companions\[|services\[0\]|fake|sampleSupport|demoSupport/u);
});
