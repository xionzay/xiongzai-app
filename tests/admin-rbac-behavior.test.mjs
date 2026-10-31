import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";

function compile(path, require) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require, AbortController, URL, Set, Map, React });
  return exports;
}
function harness(request, props = {}) {
  const hooks = []; let cursor = 0; let dirty = true; let tree; let modal; const effects = [];
  const equal = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === "function" ? initial() : initial }; return [hooks[index].value, value => { const next = typeof value === "function" ? value(hooks[index].value) : value; if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; } }]; },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useCallback(callback, deps) { const index = cursor++; if (!equal(hooks[index]?.deps, deps)) hooks[index] = { deps, callback }; return hooks[index].callback; },
    useEffect(callback, deps) { const index = cursor++; if (!equal(hooks[index]?.deps, deps)) { hooks[index]?.cleanup?.(); const slot = { deps }; hooks[index] = slot; effects.push(() => { slot.cleanup = callback(); }); } },
  };
  const api = compile("app/admin/admin-api.ts", () => { throw new Error("Unexpected API dependency"); });
  api.adminApiRequest = request;
  const data = compile("app/admin/rbac-data.ts", () => api);
  // JSX runtime uses (type, props, key), whereas createElement's third argument is a child.
  const runtime = { jsx: (type, value, key) => React.createElement(type, { ...value, ...(key === undefined ? {} : { key }) }), Fragment: React.Fragment }; runtime.jsxs = runtime.jsx;
  const actual = compile("app/admin/rbac-management.tsx", name => name === "react" ? react : name === "react/jsx-runtime" ? runtime : name === "./rbac-data" ? data : name === "./admin-api" ? api : { default: new Proxy({}, { get: (_, key) => String(key) }) });
  const input = { mode: "admins", canManage: true, rows: [{ id: "a", display_name: "测试管理员甲", username: "local-a" }, { id: "b", display_name: "测试管理员乙", username: "local-b" }], reload() {}, setModal(value) { modal = value; }, runAction: async (action, { reload }) => { try { await action(); await reload(); } catch (error) { if (error.status === 409) await reload(); throw error; } }, ...props };
  async function flush() { for (let i = 0; i < 12; i++) { if (dirty) { dirty = false; cursor = 0; tree = actual.RbacManagementPanel(input); for (const effect of effects.splice(0)) effect(); } await new Promise(resolve => setImmediate(resolve)); } return tree; }
  function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function text(node) { if (node === null || node === undefined) return ""; if (Array.isArray(node)) return node.map(text).join(""); return typeof node === "object" ? text(node.props?.children) : String(node); }
  return { api, data, flush, nodes: () => nodes(tree), text, get modal() { return modal; }, button(label) { return nodes(tree).find(node => node.type === "button" && text(node) === label); }, select(id) { nodes(tree).find(node => node.type === "select").props.onChange({ target: { value: id } }); }, toggle(id, checked) { const node = nodes(tree).find(node => node.type === "label" && text(node).includes(id)); nodes(node).find(child => child.type === "input").props.onChange({ target: { checked } }); }, dispose() { for (const hook of hooks) hook?.cleanup?.(); } };
}
const roles = [{ id: "r1", key: "reviewer", name: "审核员" }, { id: "r2", key: "operator", name: "运营员" }];
function requestFor({ failOptions = false, patch, detail } = {}) {
  return async (path, init = {}) => {
    if (path.startsWith("/rbac/roles?")) { if (failOptions) throw new Error("offline"); return { items: roles, next_cursor: null }; }
    if (path === "/rbac/permissions") return [{ key: "dashboard.read" }];
    if (init.method === "PATCH") return patch?.(path, JSON.parse(init.body)) ?? {};
    if (path.startsWith("/rbac/admins/")) return detail?.(path) ?? { id: path.split("/").at(-1), display_name: "本地管理员", version: 7, roles: [roles[0]] };
    throw new Error("Unexpected request");
  };
}

test("actual role component disables saving after option failure and supports retry", async () => {
  let fail = true; let writes = 0;
  const h = harness(async (path, init) => { if (fail && path.startsWith("/rbac/roles?")) throw new Error("offline"); return requestFor({ patch() { writes++; } })(path, init); });
  await h.flush(); assert.equal(h.button("保存角色分配").props.disabled, true); assert.ok(h.button("重新加载角色数据"));
  h.button("保存角色分配").props.onClick(); assert.equal(h.modal, undefined); assert.equal(writes, 0);
  fail = false; h.button("重新加载角色数据").props.onClick(); await h.flush(); h.select("a"); await h.flush();
  assert.equal(h.button("保存角色分配").props.disabled, true); h.toggle("operator", true); await h.flush(); assert.equal(h.button("保存角色分配").props.disabled, false); h.dispose();
});
test("all role pages load atomically, and a later page failure never publishes partial options", async () => {
  const h = harness(requestFor()); let pages = 0;
  const items = Array.from({ length: 201 }, (_, i) => ({ id: `role-${i}`, key: `role_${i}`, name: `角色${i}` }));
  const request = async path => path === "/rbac/permissions" ? [] : { items: items.slice(pages * 100, ++pages * 100), next_cursor: pages < 3 ? `page-${pages}` : null };
  const options = await h.data.loadRbacOptions(new AbortController().signal, request); assert.equal(options.roles.length, 201); assert.equal(pages, 3);
  await assert.rejects(h.data.loadRbacOptions(new AbortController().signal, async path => path === "/rbac/permissions" ? [] : path.includes("cursor=") ? Promise.reject(new Error("failed page")) : { items: [roles[0]], next_cursor: "next" }));
  await assert.rejects(h.data.loadRbacOptions(new AbortController().signal, async path => path === "/rbac/permissions" ? [] : { items: [roles[0]], next_cursor: "repeated" })); h.dispose();
});
test("late administrator detail cannot replace the newly selected administrator", async () => {
  let resolveA; const h = harness(requestFor({ detail: path => path.endsWith("/a") ? new Promise(resolve => { resolveA = resolve; }) : { id: "b", display_name: "管理员乙", version: 12, roles: [roles[1]] } }));
  await h.flush(); h.select("a"); await h.flush(); h.select("b"); await h.flush(); resolveA({ id: "a", display_name: "管理员甲", version: 3, roles: [roles[0]] }); await h.flush();
  const checks = h.nodes().filter(node => node.type === "input" && node.props.type === "checkbox"); assert.deepEqual(checks.map(node => node.props.checked), [false, true]); assert.equal(h.button("保存角色分配").props.disabled, true); h.dispose();
});
test("empty assignment needs explicit confirmation and carries latest version; duplicate submits write once", async () => {
  const writes = []; let resolveWrite; const h = harness(requestFor({ patch: (path, body) => { writes.push(body); return new Promise(resolve => { resolveWrite = resolve; }); } }));
  await h.flush(); h.select("a"); await h.flush(); h.toggle("reviewer", false); await h.flush(); assert.equal(h.button("保存角色分配").props.disabled, true);
  h.toggle("我明确确认清空", true); await h.flush(); h.button("保存角色分配").props.onClick(); const first = h.modal.onConfirm("本地测试明确清空"); await h.modal.onConfirm("重复提交");
  assert.equal(writes.length, 1); assert.equal(writes[0].version, 7); assert.equal(writes[0].confirm_empty_roles, true); assert.equal(writes[0].role_ids.length, 0); resolveWrite({}); await first; h.dispose();
});
test("read-only administrator does not load role mutation options or expose save actions", async () => {
  let calls = 0; const h = harness(async () => { calls++; }, { canManage: false }); await h.flush(); assert.equal(calls, 0); assert.equal(h.button("保存角色分配"), undefined); h.dispose();
});
test("409 refreshes server roles/version without reporting success", async () => {
  let version = 7; let current = [roles[0]]; let successes = 0;
  const h = harness(requestFor({ detail: path => ({ id: path.split("/").at(-1), display_name: "测试管理员", version, roles: current }), patch: () => { version = 8; current = [roles[1]]; throw new h.api.AdminApiError("版本冲突", "RESOURCE_VERSION_CONFLICT", 409); } }), { runAction: async (request, { reload }) => { try { await request(); await reload(); successes++; } catch (error) { if (error.status === 409) await reload(); throw error; } } });
  await h.flush(); h.select("a"); await h.flush(); h.toggle("operator", true); await h.flush(); h.button("保存角色分配").props.onClick(); await assert.rejects(h.modal.onConfirm("验证冲突刷新")); await h.flush();
  assert.equal(successes, 0); assert.deepEqual(h.nodes().filter(node => node.type === "input" && node.props.type === "checkbox").map(node => node.props.checked), [false, true]); assert.equal(h.button("保存角色分配").props.disabled, true); h.dispose();
});
test("403 and offline option failures remain visible and cannot enable writes", async () => {
  for (const status of [403, 0]) {
    let h; h = harness(async () => { throw new h.api.AdminApiError(status === 403 ? "权限不足" : "网络断开", status === 403 ? "DENIED" : "ADMIN_NETWORK_OFFLINE", status); });
    await h.flush(); assert.ok(h.nodes().some(node => node.props?.role === "alert")); assert.equal(h.button("保存角色分配").props.disabled, true); h.dispose();
  }
});
