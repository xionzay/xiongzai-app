import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiBaseUrl } from "../src/api/config";

test("隔离 test 模拟器显式本机端口不再偷偷连接共享 3002", () => {
  for (const [platform, configuredUrl] of [["android", "http://10.0.2.2:3303/api/v1"], ["ios", "http://127.0.0.1:3303/api/v1"]] as const) {
    assert.equal(resolveApiBaseUrl({ platform, configuredUrl, appEnvironment: "test", isPhysicalDevice: false }), configuredUrl);
  }
});

test("development 和 test 旧局域网地址仍保留模拟器安全回退", () => {
  for (const appEnvironment of ["development", "test"] as const) {
    assert.equal(resolveApiBaseUrl({ platform: "android", configuredUrl: "http://192.168.2.218:3003/api/v1", appEnvironment, isPhysicalDevice: false }), "http://10.0.2.2:3002/api/v1");
  }
});

test("隔离端口配置不放宽生产、实体机或 URL 凭据与跳转边界", () => {
  for (const configuredUrl of ["http://u:p@127.0.0.1:3303/api/v1", "http://127.0.0.1:3303/api/v1?token=x", "http://127.0.0.1:3303/api/v1#x", "file:///tmp/api", "not-a-url"]) {
    assert.throws(() => resolveApiBaseUrl({ platform: "android", configuredUrl, appEnvironment: "test", isPhysicalDevice: false }));
  }
  assert.throws(() => resolveApiBaseUrl({ platform: "android", configuredUrl: "http://10.0.2.2:3303/api/v1", appEnvironment: "production", isPhysicalDevice: false }));
  assert.throws(() => resolveApiBaseUrl({ platform: "android", configuredUrl: "http://10.0.2.2:3303/api/v1", appEnvironment: "test", isPhysicalDevice: true }));
});
