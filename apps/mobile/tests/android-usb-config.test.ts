import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveApiBaseUrl, type ApiEnvironmentInput } from "../src/api/config";

const input: ApiEnvironmentInput = { platform: "android", appEnvironment: "test", isPhysicalDevice: true,
  configuredUrl: "http://127.0.0.1:3303/api/v1", androidUsbReverse: "true" };

test("Android 真机 USB 转发须显式启用且不回退共享 API", () => {
  assert.equal(resolveApiBaseUrl(input), input.configuredUrl);
  for (const androidUsbReverse of [undefined, "", "false", "TRUE", "1"]) {
    assert.throws(() => resolveApiBaseUrl({ ...input, androidUsbReverse }));
  }
});

test("USB test 开关不放宽生产、普通开发、iOS 或模拟器限制", () => {
  for (const appEnvironment of ["production", "development"] as const) {
    assert.throws(() => resolveApiBaseUrl({ ...input, appEnvironment }), /USB/u);
  }
  for (const platform of ["ios", "other"] as const) assert.throws(() => resolveApiBaseUrl({ ...input, platform }), /USB/u);
  for (const isPhysicalDevice of [false, undefined]) assert.throws(() => resolveApiBaseUrl({ ...input, isPhysicalDevice }), /USB/u);
});

test("USB 配置禁止远程地址、模拟器桥接、默认/共享端口和不合法 URL", () => {
  for (const configuredUrl of [undefined, "http://127.0.0.1/api/v1", "http://127.0.0.1:3002/api/v1",
    "http://10.0.2.2:3303/api/v1", "http://localhost:3303/api/v1", "http://192.168.1.2:3303/api/v1",
    "https://example.com/api/v1", "http://127.0.0.1:3303/other", "http://a:b@127.0.0.1:3303/api/v1",
    "http://127.0.0.1:3303/api/v1?token=x", "http://127.0.0.1:3303/api/v1#x", "file:///tmp/test"]) {
    assert.throws(() => resolveApiBaseUrl({ ...input, configuredUrl }));
  }
});

test("不启用 USB 的正常真机 HTTPS 配置保持有效", () => {
  assert.equal(resolveApiBaseUrl({ ...input, appEnvironment: "production", androidUsbReverse: undefined,
    configuredUrl: "https://api.example.com/api/v1" }), "https://api.example.com/api/v1");
});

test("运行时 USB 开关使用 Expo 支持的静态环境变量引用", () => {
  assert.match(readFileSync(new URL("../src/auth/runtime.ts", import.meta.url), "utf8"),
    /androidUsbReverse: process\.env\.EXPO_PUBLIC_ANDROID_USB_REVERSE/u);
});
