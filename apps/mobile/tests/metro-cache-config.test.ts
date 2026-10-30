import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
function scope(env: Record<string, string>) {
  const cjsModule = { exports: {} as { cacheVersion: string; resolver: { blockList?: RegExp[] } } };
  const dependency = Object.assign((name: string) => name === "expo/metro-config"
    ? { getDefaultConfig: () => ({ cacheVersion: "expo-default", resolver: { assetExts: ["png"] } }) }
    : require(name), { resolve: () => "/synthetic/mobile/package.json" });
  vm.runInNewContext(readFileSync(new URL("../metro.config.cjs", import.meta.url), "utf8"), {
    module: cjsModule, process: { env }, require: dependency
  });
  return cjsModule.exports;
}

test("并行 Metro 按公共环境和 API 地址隔离缓存，不复用共享后端配置", () => {
  const shared = scope({ EXPO_PUBLIC_APP_ENV: "development", EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:3002/api/v1" });
  const isolated = scope({ EXPO_PUBLIC_APP_ENV: "test", EXPO_PUBLIC_API_BASE_URL: "http://10.0.2.2:3303/api/v1", EXPO_PUBLIC_ENABLE_MOCK_PAYMENT: "true" });
  assert.notEqual(shared.cacheVersion, isolated.cacheVersion);
  assert.match(isolated.cacheVersion, /^expo-default:xiongzai-env-[a-f0-9]{24}$/u);
  assert.equal(isolated.cacheVersion.includes("3303"), false);
  assert.equal(scope({ EXPO_PUBLIC_APP_ENV: "test" }).cacheVersion, scope({ EXPO_PUBLIC_APP_ENV: "test", USER_TOKEN_SECRET: "must-not-enter-cache" }).cacheVersion);
  assert.ok("resolver" in isolated);
  assert.notEqual(scope({}).cacheVersion, scope({ EXPO_PUBLIC_ANDROID_USB_REVERSE: "true" }).cacheVersion);
});

test("显式关闭 dotenv 时 SDK 开发虚拟模块不再覆盖隔离地址，默认开发仍加载本地配置", () => {
  assert.equal(scope({}).resolver.blockList, undefined);
  const blocked = scope({ EXPO_NO_DOTENV: "1" }).resolver.blockList!;
  for (const file of ["/synthetic/mobile/.env", "/synthetic/mobile/.env.local", "/synthetic/mobile/.env.development.local"]) {
    assert.equal(blocked.some(rule => rule.test(file)), true);
  }
  assert.equal(blocked.some(rule => rule.test("/synthetic/mobile/src/auth/runtime.ts")), false);
  assert.notEqual(scope({}).cacheVersion, scope({ EXPO_NO_DOTENV: "1" }).cacheVersion);
});
