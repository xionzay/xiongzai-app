import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

async function bootstrap(readFails: boolean) {
  const require = createRequire(import.meta.url), effects: (() => void)[] = [], queued: (() => void)[] = [];
  const states: unknown[] = [], calls: string[] = [];
  const clear = async () => { calls.push("clear"); };
  const runtime = { credentialsStore: { getRefreshToken: async () => { if (readFails) throw new Error("synthetic-unavailable"); return null; } }, apiClient: { clearAuthentication: clear, setAuthFailureHandler: () => {}, refresh: async () => { calls.push("refresh"); } }, checkoutSessionStore: { clear }, afterSaleIntentStore: { clearRefund: clear }, chatOutboxStore: { clearAll: clear }, withdrawalIntentStore: { clear } };
  const context = { exports: {} as { AuthProvider(props: object): unknown }, queueMicrotask: (fn: () => void) => queued.push(fn), require: (name: string) => {
    if (name === "react") return { createContext: () => ({ Provider: "Provider" }), useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(), useState: (initial: unknown) => { const i = states.length; states.push(initial); return [initial, (value: unknown) => { states[i] = value; }]; }, useEffect: (fn: () => void) => effects.push(fn) };
    if (name.endsWith("auth/runtime")) return runtime;
    if (name.endsWith("api/api-error")) return { ApiClientError: class extends Error {} };
    if (name.endsWith("mobile-login-request")) return {};
    if (name.endsWith("query-client")) return { queryClient: {} };
    if (name.endsWith("session-cache")) return { clearSessionScopedCache: () => calls.push("cache-clear") };
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/auth/auth-provider.tsx", import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  context.exports.AuthProvider({}); effects[0]!(); queued[0]!();
  await new Promise(resolve => setImmediate(resolve));
  return { states, calls };
}
test("实际 AuthProvider 安全存储读取失败保留凭证，并提供解锁重试而非误判退出", async () => {
  const result = await bootstrap(true);
  assert.equal(result.states[0], "booting"); assert.match(String(result.states[2]), /无法读取系统安全存储/);
  assert.deepEqual(result.calls, []);
});
test("实际 AuthProvider 确认没有凭证时才清理私有缓存并回到匿名状态", async () => {
  const result = await bootstrap(false);
  assert.equal(result.states[0], "anonymous"); assert.equal(result.states[2], null);
  assert.ok(result.calls.includes("cache-clear")); assert.ok(!result.calls.includes("refresh"));
});
