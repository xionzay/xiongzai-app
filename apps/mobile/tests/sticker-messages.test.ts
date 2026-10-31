import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { bearStickers } from "@xiongzai/contracts";
import type { ApiClient } from "../src/api/client";
import { HttpPollingChatTransport } from "../src/features/chat/chat-transport";
import { ChatOutboxStore } from "../src/storage/chat-outbox";
import { MemorySecureStore } from "./test-helpers";

test("表情 POST 使用服务端契约，不提交文字或任意素材 URL", async () => {
  const calls: { path: string; body: string }[] = [];
  const client = { request: async (path: string, options: { body: string }) => { calls.push({ path, body: options.body }); return {}; } } as unknown as ApiClient;
  const transport = new HttpPollingChatTransport(client);
  await transport.sendMessage("c1", "stable-client-1", "摘要", "bear-v3/buyer/001");
  assert.deepEqual(calls, [{ path: "/conversations/c1/messages", body: JSON.stringify({ client_message_id: "stable-client-1", message_type: "STICKER", sticker_id: "bear-v3/buyer/001" }) }]);
  assert.throws(() => transport.sendMessage("c1", "stable-client-1", "", "https://invalid.example/asset"));
  assert.equal(calls.length, 1);
});

test("冷启动表情重试复用编号；同文案文字、不同表情是新的发送意图", async () => {
  const storage = new MemorySecureStore(); let count = 0;
  const createId = () => `unique-${++count}`;
  const store = new ChatOutboxStore(storage, createId);
  const first = await store.prepare("c1", "同文案", "bear-v3/buyer/001");
  await store.failed("c1", first);
  const restored = new ChatOutboxStore(storage, createId);
  const retry = await restored.prepare("c1", "同文案", "bear-v3/buyer/001");
  assert.equal(retry.clientMessageId, first.clientMessageId);
  const text = await restored.prepare("c1", "同文案");
  assert.notEqual(text.clientMessageId, first.clientMessageId);
  const other = await restored.prepare("c1", "同文案", "bear-v3/buyer/002");
  assert.notEqual(other.clientMessageId, text.clientMessageId);
  await restored.clearAll(); assert.equal(await restored.read("c1"), null);
});

test("原生素材全部指向共享确认素材且校验摘要一致", () => {
  const mapping = readFileSync(new URL("../src/features/chat/sticker-assets.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mapping, /\brequire\s*\(/);
  assert.equal([...mapping.matchAll(/^import \w+ from ".*\.gif";/gm)].length, bearStickers.length);
  const imports = new Map([...mapping.matchAll(/^import (\w+) from "([^"]+)";/gm)].map(match => [match[1], match[2]]));
  const entries = new Map([...mapping.matchAll(/"(bear-v3\/(?:buyer|seller)\/\d+)": (\w+)/g)].map(match => [match[1], match[2]]));
  for (const sticker of bearStickers) {
    assert.ok(mapping.includes(JSON.stringify(sticker.id)));
    assert.ok(mapping.includes(`public${sticker.url}`));
    assert.equal(imports.get(entries.get(sticker.id)), `../../../../../public${sticker.url}`);
    const data = readFileSync(new URL(`../../../public${sticker.url}`, import.meta.url));
    assert.equal(createHash("sha256").update(data).digest("hex"), sticker.sha256);
  }
});
