import assert from "node:assert/strict";
import test from "node:test";
import { ChatOutboxStore } from "../src/storage/chat-outbox";
import { ChatSendScope } from "../src/features/chat/chat-send-scope";
import { MemorySecureStore } from "./test-helpers";

test("并发准备同一条消息只生成一个稳定编号", async () => {
  let ids = 0;
  const store = new ChatOutboxStore(new MemorySecureStore(), () => String(++ids));
  const messages = await Promise.all(Array.from({ length: 8 }, () => store.prepare("conversation-a", "同一条消息")));
  assert.equal(new Set(messages.map((item) => item.clientMessageId)).size, 1);
  assert.equal(ids, 1);
});

test("不同会话并发写入不丢失清理索引，退出后全部移除", async () => {
  const adapter = new MemorySecureStore();
  const store = new ChatOutboxStore(adapter, () => "id");
  await Promise.all([store.prepare("a", "消息甲"), store.prepare("b", "消息乙")]);
  await store.clearAll();
  assert.equal(adapter.values.size, 0);
});

test("退出后迟到的失败回调不重新写入旧账号消息", async () => {
  const adapter = new MemorySecureStore();
  const store = new ChatOutboxStore(adapter, () => "id");
  const pending = await store.prepare("a", "旧账号消息");
  await store.clearAll();
  await store.failed("a", pending);
  assert.equal(adapter.values.size, 0);
});

test("新消息不能被旧消息的迟到失败覆盖", async () => {
  let ids = 0;
  const store = new ChatOutboxStore(new MemorySecureStore(), () => String(++ids));
  const previous = await store.prepare("a", "上一条消息");
  const current = await store.prepare("a", "这一条消息");
  await store.failed("a", previous);
  assert.equal((await store.read("a"))?.clientMessageId, current.clientMessageId);
});

test("索引写入失败不遗留无法被退出清理的消息，后续写入可恢复", async () => {
  class FailingIndexStore extends MemorySecureStore {
    fail = true;
    override async setItemAsync(key: string, value: string) {
      if (this.fail && key.endsWith(".index")) throw new Error("synthetic storage failure");
      return super.setItemAsync(key, value);
    }
  }
  const adapter = new FailingIndexStore();
  const store = new ChatOutboxStore(adapter, () => "id");
  await assert.rejects(store.prepare("a", "不应发送的消息"));
  assert.equal(adapter.values.has("xiongzai.chat.outbox.a"), false);
  adapter.fail = false;
  await store.prepare("a", "可恢复的消息");
  await store.clearAll();
  assert.equal(adapter.values.size, 0);
});

test("旧发送成功的清理回调不能删除下一条消息", async () => {
  let ids = 0;
  const store = new ChatOutboxStore(new MemorySecureStore(), () => String(++ids));
  const previous = await store.prepare("a", "上一条消息");
  const current = await store.prepare("a", "这一条消息");
  await store.clear("a", previous.clientMessageId);
  assert.equal((await store.read("a"))?.clientMessageId, current.clientMessageId);
});

test("退出期间正在等待安全存储的准备任务不能继续发送或遗留记录", async () => {
  let release = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  class DelayedStore extends MemorySecureStore {
    override async setItemAsync(key: string, value: string) {
      if (!key.endsWith(".index")) await waiting;
      await super.setItemAsync(key, value);
    }
  }
  const adapter = new DelayedStore();
  const store = new ChatOutboxStore(adapter, () => "id");
  const pending = store.prepare("a", "不能跨账号发送");
  const rejection = assert.rejects(pending, /聊天会话已失效/u);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const cleanup = store.clearAll();
  release();
  await Promise.all([rejection, cleanup]);
  assert.equal(adapter.values.size, 0);
});

test("安全存储删除失败保留索引供再次退出清理，不吞掉失败", async () => {
  class FailingDeleteStore extends MemorySecureStore {
    fail = true;
    override async deleteItemAsync(key: string) {
      if (this.fail && key.endsWith(".a")) throw new Error("synthetic delete failure");
      return super.deleteItemAsync(key);
    }
  }
  const adapter = new FailingDeleteStore();
  const store = new ChatOutboxStore(adapter, () => "id");
  await store.prepare("a", "待清理");
  await assert.rejects(store.clearAll());
  assert.equal(adapter.values.has("xiongzai.chat.outbox.index"), true);
  adapter.fail = false;
  await store.clearAll();
  assert.equal(adapter.values.size, 0);
});

test("发送门闩在第一个await之前阻断连点，失败后可释放重试", () => {
  const scope = new ChatSendScope("conversation-a");
  const first = scope.begin();
  assert.ok(first);
  assert.equal(scope.begin(), null);
  first.finish();
  assert.ok(scope.begin());
});

test("卸载或账号切换使旧发送失效，StrictMode重新挂载也不复活旧回调", () => {
  const scope = new ChatSendScope("user-a:conversation-a");
  const previous = scope.begin();
  assert.ok(previous);
  scope.dispose();
  assert.equal(previous.isCurrent(), false);
  assert.equal(scope.begin(), null);
  scope.activate();
  const current = scope.begin();
  assert.ok(current);
  previous.finish();
  assert.equal(previous.isCurrent(), false);
  assert.equal(scope.begin(), null);
  current.finish();
  assert.ok(scope.begin());
});
