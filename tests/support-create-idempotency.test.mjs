import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual Web first-text handler, with only HTTP/UI boundaries stubbed.
function harness({ refreshFails = false } = {}) {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const support = page.slice(page.indexOf("function CustomerServiceScreen"), page.indexOf("function FavoritesScreen"));
  const handler = support.slice(support.indexOf("  const createCase ="), support.indexOf("  const send ="));
  const requests = [], notices = [];
  let sequence = 0, fail = true, cases = [], selected;
  const context = {
    viewerId: "user-1", order: undefined,
    window: { crypto: { randomUUID: () => `test-id-${++sequence}` } },
    sendKey: { current: { content: "", key: "", conversationId: "" } },
    apiRequest: async (path, options) => {
      assert.equal(path, "/support-cases");
      requests.push(JSON.parse(options.body));
      if (fail) throw new Error("synthetic response timeout");
      return { id: "case-1", conversation_id: "conversation-1", status: "WAITING" };
    },
    setSupportCase: (value) => { selected = value; },
    setSupportCases: (update) => { cases = update(cases); },
    loadMessages: async () => { if (refreshFails) throw new Error("synthetic history failure"); },
    notify: (value) => notices.push(value)
  };
  vm.runInNewContext(ts.transpileModule(`${handler}\nglobalThis.create = createCase;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { context, requests, notices, create: (content) => context.create(content), acknowledge: () => { fail = false; }, state: () => ({ cases, selected }) };
}

test("Web 首条文字工单超时重试复用 client_message_id，成功重放不重复插入列表", async () => {
  const view = harness();
  await assert.rejects(view.create("本地测试咨询"));
  view.acknowledge();
  await view.create("本地测试咨询");
  await view.create("本地测试咨询");
  assert.equal(new Set(view.requests.map(row => row.client_message_id)).size, 1);
  assert.equal(view.requests[0].initial_message, "本地测试咨询");
  assert.equal(view.state().cases.length, 1);
});

test("Web 修改首条内容、账号或关联订单时使用新的工单意图编号", async () => {
  const view = harness();
  await assert.rejects(view.create("问题一"));
  await assert.rejects(view.create("问题二"));
  view.context.order = { id: "order-1" };
  await assert.rejects(view.create("问题二"));
  view.context.viewerId = "user-2";
  await assert.rejects(view.create("问题二"));
  assert.equal(new Set(view.requests.map(row => row.client_message_id)).size, 4);
  assert.equal(view.requests[2].related_type, "ORDER");
  assert.equal(view.requests[2].related_id, "order-1");
});

test("Web 工单已创建但历史同步失败时保留真实工单，不误报首条发送失败", async () => {
  const view = harness({ refreshFails: true });
  view.acknowledge();
  assert.equal((await view.create("已持久化的测试消息")).id, "case-1");
  assert.equal(view.state().selected.id, "case-1");
  assert.match(view.notices[0], /工单已创建.*请勿重复发送/u);
});
