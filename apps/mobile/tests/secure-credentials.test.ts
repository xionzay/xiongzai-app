import assert from "node:assert/strict";
import test from "node:test";
import { SecureCredentialsStore } from "../src/storage/secure-credentials";
import { MemorySecureStore } from "./test-helpers";

test("SecureStore 保存 Refresh Token 并稳定复用 device_id", async () => {
  const adapter = new MemorySecureStore();
  const store = new SecureCredentialsStore(adapter);
  await store.setRefreshToken("refresh-secret");
  const first = await store.getOrCreateDeviceId(() => "device-stable");
  const second = await store.getOrCreateDeviceId(() => "must-not-be-used");
  assert.equal(await store.getRefreshToken(), "refresh-secret");
  assert.equal(first, "device-stable");
  assert.equal(second, "device-stable");
});

test("清理 Session 删除 Refresh Token 但保留稳定 device_id", async () => {
  const adapter = new MemorySecureStore();
  const store = new SecureCredentialsStore(adapter);
  await store.setRefreshToken("refresh-secret");
  await store.getOrCreateDeviceId(() => "device-stable");
  await store.clearSession();
  assert.equal(await store.getRefreshToken(), null);
  assert.equal(await store.getDeviceId(), "device-stable");
});
