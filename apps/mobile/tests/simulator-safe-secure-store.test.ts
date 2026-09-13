import assert from "node:assert/strict";
import test from "node:test";
import type { SecureStoreAdapter } from "../src/storage/secure-credentials";
import { createSimulatorSafeSecureStore } from "../src/storage/simulator-safe-secure-store";

function unavailableStore(): SecureStoreAdapter {
  const unavailable = async () => {
    throw new Error("Keychain entitlement unavailable");
  };
  return {
    getItemAsync: unavailable,
    setItemAsync: unavailable,
    deleteItemAsync: unavailable
  };
}

test("非生产 iOS 模拟器在 Keychain 不可用时只降级到进程内存", async () => {
  const store = createSimulatorSafeSecureStore(unavailableStore(), true);
  assert.equal(await store.getItemAsync("device"), null);
  await store.setItemAsync("device", "simulator-device");
  assert.equal(await store.getItemAsync("device"), "simulator-device");
  await store.deleteItemAsync("device");
  assert.equal(await store.getItemAsync("device"), null);
});

test("真机或生产环境不吞掉安全存储错误", async () => {
  const store = createSimulatorSafeSecureStore(unavailableStore(), false);
  await assert.rejects(store.getItemAsync("device"), /Keychain entitlement unavailable/u);
  await assert.rejects(store.setItemAsync("device", "unsafe"), /Keychain entitlement unavailable/u);
  await assert.rejects(store.deleteItemAsync("device"), /Keychain entitlement unavailable/u);
});
