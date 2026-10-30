import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo/package.json"));
const presetRequire = createRequire(expoRequire.resolve("babel-preset-expo"));
const { expoInlineEnvVars } = presetRequire(path.join(path.dirname(presetRequire.resolve("babel-preset-expo")), "plugins/inline-env-vars.js"));
const babel: { transformSync(source: string, options: Record<string, unknown>): { code?: string | null; metadata: Record<string, unknown> } } = expoRequire("@babel/core");
const source = readFileSync(new URL("../src/config/runtime-flags.ts", import.meta.url), "utf8");

function compileFlags(environment: string, mockPayment: string, nodeEnvironment: string) {
  const keys = ["EXPO_PUBLIC_APP_ENV", "EXPO_PUBLIC_ENABLE_MOCK_PAYMENT"] as const;
  const previous = keys.map(key => process.env[key]);
  try {
    process.env.EXPO_PUBLIC_APP_ENV = environment;
    process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENT = mockPayment;
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const compiled = babel.transformSync(js, { filename: "runtime-flags.js", babelrc: false, configFile: false, caller: { name: "metro", isDev: false }, plugins: [expoInlineEnvVars] });
    assert.ok(compiled.code);
    assert.deepEqual(new Set(compiled.metadata.publicEnvVars as string[]), new Set(keys));
    // The device does not inherit the development computer's environment.
    const context = { exports: {} as { runtimeFlags: { appEnvironment: string; enableMockPayment: boolean } }, process: { env: { NODE_ENV: nodeEnvironment } } };
    vm.runInNewContext(compiled.code, context);
    return context.exports.runtimeFlags;
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
}

test("Expo 实际编译后测试环境开关仍生效，不依赖设备 process.env", () => {
  const flags = compileFlags("test", "true", "production");
  assert.equal(flags.appEnvironment, "test");
  assert.equal(flags.enableMockPayment, true);
});

test("Expo 实际编译后生产环境继续拒绝 Mock，不因变量丢失降级为开发", () => {
  assert.throws(() => compileFlags("production", "true", "production"), /生产构建禁止/u);
  const flags = compileFlags("production", "false", "production");
  assert.equal(flags.appEnvironment, "production");
  assert.equal(flags.enableMockPayment, false);
});

test("Expo 实际编译后非法环境值仍明确报错", () => {
  assert.throws(() => compileFlags("staging", "false", "development"), /配置无效/u);
});
