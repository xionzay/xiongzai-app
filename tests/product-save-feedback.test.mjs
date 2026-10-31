import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { commerceContract } from "./helpers/commerce-contract.mjs";

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
function harness(request) {
  const states = [], refs = [], dependencies = [], effects = [];
  let index = 0, refIndex = 0, effectIndex = 0, dirty = true, tree, focusCount = 0;
  const hooks = {
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; dirty = true; }]; },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useEffect(effect, next) { const i = effectIndex++, previous = dependencies[i]; if (!previous || next.some((value, j) => !Object.is(value, previous[j]))) { dependencies[i] = next; effects.push(effect); } },
  };
  const load = (path, dependencies) => {
    const context = { exports: {}, require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name) };
    vm.runInNewContext(compile(readFileSync(path, "utf8")), context); return context.exports;
  };
  const commerce = load("app/connected-commerce.ts", { "../packages/contracts/src/commerce": commerceContract });
  const files = load("app/ConnectedFiles.tsx", { react: hooks, "./connected-commerce": commerce });
  const { ConnectedProductForm } = load("app/seller-workbench/ConnectedProductForm.tsx", { react: hooks, "../ConnectedFiles": files, "../connected-commerce": commerce });
  const initial = { id: "local-test-product", title: "本地验收商品", description: "仅用于本地人工验收的合成测试商品", game: "PEACE_ELITE", fulfillment_seconds: 86400, pricing_mode: "SINGLE", status: "DRAFT", version: 0, skus: [{ price_cent: "20000" }], images: [] };
  const nodes = () => { const found = []; function walk(value) { if (Array.isArray(value)) return value.forEach(walk); if (!value || typeof value !== "object" || !value.type) return; found.push(value); walk(value.props.children); } walk(tree); return found; };
  const render = () => {
    index = refIndex = effectIndex = 0; dirty = false;
    tree = ConnectedProductForm({ initial, request, back() {} });
    for (const node of nodes()) if (node.props.role === "alert" && node.props.ref) node.props.ref.current = { focus() { focusCount++; } };
    while (effects.length) effects.shift()();
  };
  const flush = async () => { for (let i = 0; i < 5; i++) { if (dirty) render(); await new Promise(resolve => setImmediate(resolve)); } if (dirty) render(); };
  render();
  return { nodes, flush, clickSave: () => nodes().find(node => node.type === "button" && node.props.children === "保存草稿").props.onClick(), get focusCount() { return focusCount; } };
}

test("actual failed save retains the Chinese server-gate message and focuses its alert instead of silently staying at the footer", async () => {
  const calls = [];
  const h = harness(async path => { calls.push(path); throw { code: "ORDER_ADULT_VERIFICATION_REQUIRED" }; });
  h.clickSave(); await h.flush();
  const alert = h.nodes().find(node => node.props.role === "alert");
  assert.equal(alert.props.children, "交易双方须满足实名成年条件");
  assert.equal(alert.props.tabIndex, -1); assert.equal(h.focusCount, 1);
  assert.deepEqual(calls, ["/seller/services/local-test-product"]);
  assert.ok(!h.nodes().some(node => node.props.children === "草稿已真实保存"));
});
test("a pending save cannot announce or focus a fabricated success", async () => {
  let reject;
  const h = harness(() => new Promise((_, fail) => { reject = fail; }));
  h.clickSave(); await h.flush();
  assert.equal(h.focusCount, 0); assert.ok(!h.nodes().some(node => node.props.role === "alert"));
  reject({ code: "UNAUTHORIZED" }); await h.flush();
  assert.equal(h.focusCount, 1); assert.equal(h.nodes().find(node => node.props.role === "alert").props.children, "请先登录");
});
test("a 409 is focused and requires a fresh record; it does not replay the write", async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw { code: "RESOURCE_VERSION_CONFLICT" }; });
  h.clickSave(); await h.flush(); h.clickSave(); await h.flush();
  assert.equal(calls, 1); assert.equal(h.focusCount, 1);
  assert.ok(h.nodes().some(node => node.type === "button" && node.props.children === "返回列表重新读取最新版本"));
});
test("compact product header keeps a short visible back label and its full accessible destination", () => {
  const h = harness(async () => { throw new Error("navigation must not submit"); });
  const back = h.nodes().find(node => node.props["aria-label"] === "返回商品管理");
  assert.equal(back.type, "button"); assert.equal(back.props.type, "button");
  assert.equal(back.props.children, "返回"); assert.equal(typeof back.props.onClick, "function");
});
