import assert from "node:assert/strict";
import test from "node:test";
import { SupportCaseCreator, type SupportCreateInput, type SupportCreateRequest } from "../src/features/chat/support-case-creator";
import { ChatOutboxStore } from "../src/storage/chat-outbox";
import type { SupportCaseApiView } from "../src/types/api";
import { MemorySecureStore } from "./test-helpers";

const input: SupportCreateInput = { topic: "客服创建测试", priority: "NORMAL", initial_message: "测试环境请求协助", source_page: "mobile/support" };
const result = { id: "case-1", conversation_id: "conversation-1", status: "WAITING" } as SupportCaseApiView;

test("首条工单超时后重启页面/存储实例复用同一编号，不把新请求冒充重试", async () => {
  const adapter = new MemorySecureStore();
  const requests: SupportCreateRequest[] = [];
  let calls = 0;
  const request = async (body: SupportCreateRequest) => { requests.push(body); if (++calls === 1) throw new Error("synthetic timeout after persistence"); return result; };
  const first = new SupportCaseCreator(new ChatOutboxStore(adapter, () => "original-key"), request);
  await assert.rejects(first.create(input, "user-1", () => true));
  const restored = new SupportCaseCreator(new ChatOutboxStore(adapter, () => "must-not-replace"), request);
  assert.equal((await restored.create(input, "user-1", () => true)).id, result.id);
  assert.equal(requests[0]!.client_message_id, requests[1]!.client_message_id);
  assert.equal(requests[0]!.queue_key, "general");
  assert.equal(requests[0]!.initial_message, input.initial_message);
  assert.equal(requests[0]!.source_page, input.source_page);
});

test("不同主题、内容或关联对象生成新意图，不共享旧工单编号", async () => {
  const adapter = new MemorySecureStore(); let sequence = 0;
  const requests: SupportCreateRequest[] = [];
  const creator = new SupportCaseCreator(new ChatOutboxStore(adapter, () => `key-${++sequence}`), async body => { requests.push(body); throw new Error("synthetic timeout"); });
  for (const changed of [input, { ...input, topic: "主题已修改" }, { ...input, initial_message: "新的说明内容" }, { ...input, related_type: "ORDER" as const, related_id: "order-1" }]) await assert.rejects(creator.create(changed, "user-1", () => true));
  assert.equal(new Set(requests.map(body => body.client_message_id)).size, 4);
});

test("客户端账号隔离，退出清理同时清除首条工单待发送记录", async () => {
  const adapter = new MemorySecureStore(); let sequence = 0;
  const outbox = new ChatOutboxStore(adapter, () => `key-${++sequence}`);
  const requests: SupportCreateRequest[] = [];
  const creator = new SupportCaseCreator(outbox, async body => { requests.push(body); throw new Error("synthetic timeout"); });
  await assert.rejects(creator.create(input, "user-1", () => true));
  await assert.rejects(creator.create(input, "user-2", () => true));
  assert.notEqual(requests[0]!.client_message_id, requests[1]!.client_message_id);
  await outbox.clearAll();
  await assert.rejects(creator.create(input, "user-1", () => true));
  assert.notEqual(requests[0]!.client_message_id, requests[2]!.client_message_id);
});

test("准备安全存储失败不调用创建工单接口", async () => {
  const adapter = new MemorySecureStore();
  adapter.setItemAsync = async () => { throw new Error("synthetic secure storage failure"); };
  let requests = 0;
  const creator = new SupportCaseCreator(new ChatOutboxStore(adapter, () => "key"), async () => { requests++; return result; });
  await assert.rejects(creator.create(input, "user-1", () => true));
  assert.equal(requests, 0);
});

test("服务端已接收但本地清理失败，不能误报发送失败且重放保留编号", async () => {
  const adapter = new MemorySecureStore();
  adapter.deleteItemAsync = async () => { throw new Error("synthetic cleanup failure"); };
  const requests: SupportCreateRequest[] = [];
  const creator = new SupportCaseCreator(new ChatOutboxStore(adapter, () => "key"), async body => { requests.push(body); return result; });
  assert.equal((await creator.create(input, "user-1", () => true)).id, result.id);
  assert.equal((await creator.create(input, "user-1", () => true)).id, result.id);
  assert.equal(requests[0]!.client_message_id, requests[1]!.client_message_id);
});

test("准备期间页面或身份失效，不发送旧客服请求", async () => {
  const adapter = new MemorySecureStore(); let current = true;
  const originalWrite = adapter.setItemAsync.bind(adapter);
  adapter.setItemAsync = async (key, value) => { await originalWrite(key, value); current = false; };
  let requests = 0;
  const creator = new SupportCaseCreator(new ChatOutboxStore(adapter, () => "key"), async () => { requests++; return result; });
  await assert.rejects(creator.create(input, "user-1", () => current));
  assert.equal(requests, 0);
});

test("并发创建准备复用一个稳定编号，成功后的新意图生成新编号", async () => {
  const adapter = new MemorySecureStore(); let sequence = 0;
  const requests: SupportCreateRequest[] = [];
  const creator = new SupportCaseCreator(new ChatOutboxStore(adapter, () => `key-${++sequence}`), async body => { requests.push(body); throw new Error("synthetic timeout"); });
  await Promise.allSettled([creator.create(input, "user-1", () => true), creator.create(input, "user-1", () => true)]);
  assert.equal(requests[0]!.client_message_id, requests[1]!.client_message_id);
  const next = new SupportCaseCreator(new ChatOutboxStore(adapter, () => `key-${++sequence}`), async () => result);
  await next.create(input, "user-1", () => true);
  await assert.rejects(creator.create(input, "user-1", () => true));
  assert.notEqual(requests[0]!.client_message_id, requests[2]!.client_message_id);
});
