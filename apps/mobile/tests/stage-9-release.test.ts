import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseAppEnvironment, resolveRuntimeFlags } from "../src/config/runtime-flags";
import { queryClient } from "../src/query/query-client";
import { resolveIosTransportSecurity } from "../src/config/native-security";

test("生产构建拒绝 Mock Payment Provider", () => {
  assert.throws(() => resolveRuntimeFlags({
    EXPO_PUBLIC_APP_ENV: "production",
    EXPO_PUBLIC_ENABLE_MOCK_PAYMENT: "true"
  }), /生产构建禁止/u);
});

test("Mock 支付只能由非生产环境显式开启", () => {
  assert.equal(resolveRuntimeFlags({ EXPO_PUBLIC_APP_ENV: "development" }).enableMockPayment, false);
  assert.equal(resolveRuntimeFlags({
    EXPO_PUBLIC_APP_ENV: "test",
    EXPO_PUBLIC_ENABLE_MOCK_PAYMENT: "true"
  }).enableMockPayment, true);
});

test("生产环境不会因未设置开关而默认开启 Mock 支付", () => {
  assert.equal(resolveRuntimeFlags({ EXPO_PUBLIC_APP_ENV: "production" }).enableMockPayment, false);
});

test("iOS 仅在本地开发和测试环境允许 HTTP，生产环境继续强制安全传输", () => {
  assert.deepEqual(resolveIosTransportSecurity("development"), {
    NSAllowsArbitraryLoads: true,
    NSAllowsLocalNetworking: true
  });
  assert.deepEqual(resolveIosTransportSecurity("production"), {
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: false
  });
});

test("App 环境只接受三个明确值，缺失时回退开发环境，非法值立即失败", () => {
  assert.equal(parseAppEnvironment(undefined), "development");
  assert.equal(parseAppEnvironment(""), "development");
  assert.equal(parseAppEnvironment("development"), "development");
  assert.equal(parseAppEnvironment("test"), "test");
  assert.equal(parseAppEnvironment("production"), "production");
  assert.throws(() => parseAppEnvironment("staging"), /EXPO_PUBLIC_APP_ENV 配置无效/u);
  assert.throws(() => resolveRuntimeFlags({ EXPO_PUBLIC_APP_ENV: "Production" }), /EXPO_PUBLIC_APP_ENV 配置无效/u);
});

test("全局只自动重试读请求，写请求禁止自动重试", () => {
  const defaults = queryClient.getDefaultOptions();
  assert.equal(defaults.queries?.retry, 1);
  assert.equal(defaults.queries?.refetchOnReconnect, true);
  assert.equal(defaults.queries?.refetchOnWindowFocus, true);
  assert.equal(defaults.mutations?.retry, false);
});

test("生产 Mobile 源码不含普通存储凭证、调试日志或不受信 WebView 入口", () => {
  const roots = ["../src", "../app"].map((value) => fileURLToPath(new URL(value, import.meta.url).href));
  const source = roots.flatMap(sourceFiles).map((file) => readFileSync(file, "utf8")).join("\n");
  for (const forbidden of [/AsyncStorage/u, /localStorage/u, /console\.(?:log|debug|info|warn|error)\s*\(/u, /\bWebView\b/u, /Linking\.openURL\s*\(/u]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("PRD 追踪矩阵完整列出 B01–B47、S01–S19 和 G01–G10", () => {
  const matrix = readFileSync(fileURLToPath(new URL("../docs/prd-route-api-test-matrix.md", import.meta.url).href), "utf8");
  for (let index = 1; index <= 47; index += 1) assert.match(matrix, new RegExp(`\\| B${String(index).padStart(2, "0")} `, "u"));
  for (let index = 1; index <= 19; index += 1) assert.match(matrix, new RegExp(`\\| S${String(index).padStart(2, "0")} `, "u"));
  for (let index = 1; index <= 10; index += 1) assert.match(matrix, new RegExp(`\\| G${String(index).padStart(2, "0")} `, "u"));
});

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = `${root}/${name}`;
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/u.test(name) ? [path] : [];
  });
}
