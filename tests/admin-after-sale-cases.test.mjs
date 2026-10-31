import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

function compile(path, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, { exports, require, React, crypto: webcrypto, AbortController, window: { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} }, document: { visibilityState: "visible" }, clearTimeout });
  return exports;
}
const api = compile("app/admin/admin-api.ts", () => ({}));
const data = compile("app/admin/after-sale-case-data.ts", () => api);
const contract = compile("packages/contracts/src/after-sale-cases.ts", () => ({}));
const row = { id: "synthetic-case", order_id: "synthetic-order", state: "P01", case_type: "NORMAL", version: 7, deadline_at: "2026-10-31T12:00:00Z", paused_at: "2026-10-30T12:00:00Z", original_fulfillment_due_at: null, requested_amount_cent: "20000", modifications: 0, negotiation_rounds: 0, review_level: 0, evidence_file_ids: [], available_actions: ["MATERIALS_COMPLETE"] };
const reply = { operation_result: { version: 8 }, current_case: { ...row, version: 8, available_actions: ["DECIDE"] } };

test("case labels distinguish execution from arrival, safely handle unknown states, and format integer money", () => {
  assert.match(data.caseLabel("F01"), /未确认到账/u); assert.match(data.caseLabel("EXECUTION_PENDING"), /不代表到账/u);
  assert.equal(data.caseMoney("9223372036854775807"), "¥ 92233720368547758.07");
  assert.equal(data.caseMoney("20000"), "¥ 200.00"); assert.equal(data.caseMoney("0.1"), "金额不可用");
  for (const state of contract.afterSaleCaseStates) assert.doesNotMatch(data.caseLabel(state), /未识别/u);
  assert.match(data.caseLabel("UNKNOWN"), /未识别/u);
});
test("admin actions require read+manage and server capability; supervisor extension is independently gated", () => {
  for (const permissions of [[], ["refund.read"], ["refund.manage"]]) assert.equal(data.adminCaseActions(row, new Set(permissions)).length, 0);
  const record = { ...row, available_actions: ["MATERIALS_COMPLETE", "EXTEND_MATERIALS", "USER_ONLY", "UNKNOWN"] };
  assert.deepEqual(Array.from(data.adminCaseActions(record, new Set(["refund.read", "refund.manage"]))), ["MATERIALS_COMPLETE"]);
  assert.deepEqual(Array.from(data.adminCaseActions(record, new Set(["refund.read", "refund.manage", "refund.review.supervisor"]))), ["MATERIALS_COMPLETE", "EXTEND_MATERIALS"]);
});
test("uncertain case write retries identical body and key, requires reason and validates the server result", async () => {
  const calls = []; let fail = true;
  const write = data.caseWrite(row, { action: "MATERIALS_COMPLETE" }, async (path, init) => { calls.push({ path, ...init }); if (fail) { fail = false; throw new Error("network"); } return reply; });
  await assert.rejects(write("")); assert.equal(calls.length, 0);
  await assert.rejects(write("已人工核验材料"), /network/u);
  await assert.rejects(write("另一个原因"), /原原因/u);
  assert.equal((await write("已人工核验材料")).current_case.version, 8);
  await write("已人工核验材料"); assert.equal(calls.length, 2);
  assert.equal(calls[0].headers["Idempotency-Key"], calls[1].headers["Idempotency-Key"]);
  assert.equal(calls[0].body, calls[1].body); assert.equal(JSON.parse(calls[0].body).version, 7);
  assert.equal(calls[0].path, "/after-sale/cases/synthetic-case/actions");
  await assert.rejects(data.caseWrite(row, { action: "MATERIALS_COMPLETE" }, async () => ({}))("已人工核验材料"), /有效案件结果/u);
});
test("409 permanently invalidates that confirmation, while duplicate pending submits do not send another request", async () => {
  let count = 0;
  const conflict = data.caseWrite(row, { action: "MATERIALS_COMPLETE" }, async () => { count++; throw new api.AdminApiError("冲突", "RESOURCE_VERSION_CONFLICT", 409); });
  await assert.rejects(conflict("版本测试原因"), error => error.status === 409);
  await assert.rejects(conflict("版本测试原因"), /关闭确认框/u); assert.equal(count, 1);
  let release; count = 0;
  const write = data.caseWrite(row, { action: "MATERIALS_COMPLETE" }, () => { count++; return new Promise(resolve => { release = resolve; }); });
  const pending = write("并发测试原因"); await assert.rejects(write("并发测试原因"), /重复提交/u); assert.equal(count, 1); release(reply); await pending;
});
test("decision uses the case version, explicit evidence selection and the confirmation reason", async () => {
  let body;
  await data.caseWrite(row, { action: "DECIDE", decision: { outcome: "NO_REFUND", amount_cent: "0", facts: "核验事实", evidence_file_ids: [] } }, async (_path, init) => { body = JSON.parse(init.body); return reply; })("核验裁决理由");
  assert.equal(body.version, 7); assert.equal(body.decision.reason, "核验裁决理由"); assert.equal(body.decision.amount_cent, "0"); assert.equal(body.reason, undefined);
});

function harness(request, permissions = ["refund.read", "refund.manage"]) {
  const hooks = []; const effects = []; let cursor = 0, dirty = true, tree, modal;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    useState(initial) { const i = cursor++; hooks[i] ??= { value: typeof initial === "function" ? initial() : initial }; return [hooks[i].value, next => { const value = typeof next === "function" ? next(hooks[i].value) : next; if (!Object.is(value, hooks[i].value)) { hooks[i].value = value; dirty = true; } }]; },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!equal(hooks[i]?.deps, deps)) hooks[i] = { fn, deps }; return hooks[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!equal(hooks[i]?.deps, deps)) { hooks[i]?.cleanup?.(); const slot = { deps }; hooks[i] = slot; effects.push(() => { slot.cleanup = fn(); }); } },
  };
  const actualApi = { ...api, adminApiRequest: request }, actualData = compile("app/admin/after-sale-case-data.ts", () => actualApi);
  // Use the real child introduced by the parallel after-sale work, not a null placeholder.
  const intake = compile("app/admin/after-sale-special-intake.tsx", key => key === "react" ? React : key === "./admin-api" ? actualApi : actualData);
  const component = compile("app/admin/after-sale-case-management.tsx", key => key === "react" ? react : key === "./after-sale-special-intake" ? intake : key.endsWith("/after-sale-cases") ? contract : key === "./admin-api" ? actualApi : key === "./after-sale-case-data" ? actualData : { default: new Proxy({}, { get: (_, key) => String(key) }) });
  const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const text = node => node == null ? "" : Array.isArray(node) ? node.map(text).join("") : typeof node === "object" ? text(node.props?.children) : String(node);
  const props = { permissions: new Set(permissions), setDetail() {}, setModal(value) { modal = value; }, runAction: async (write, { reload }) => { try { await write(); await reload(); } catch (error) { if (error.status === 409) await reload(); throw error; } } };
  return { get modal() { return modal; }, nodes: () => nodes(tree), button: label => nodes(tree).find(node => node.type === "button" && text(node) === label), html: () => renderToStaticMarkup(tree), async flush() { for (let i = 0; i < 18; i++) { if (dirty) { dirty = false; cursor = 0; tree = component.AfterSaleCaseManagement(props); effects.splice(0).forEach(fn => fn()); } await new Promise(resolve => setTimeout(resolve, 1)); } }, dispose() { hooks.forEach(hook => hook?.cleanup?.()); } };
}
test("case module without read permission does not query; empty/error/403 do not generate records", async () => {
  let calls = 0; const denied = harness(async () => { calls++; }, ["refund.manage"]); await denied.flush(); assert.equal(calls, 0); assert.match(denied.html(), /没有售后案件读取权限/u); denied.dispose();
  const empty = harness(async () => ({ items: [], next_after_id: null })); await empty.flush(); assert.match(empty.html(), /暂无符合条件/u); assert.equal(empty.button("查看案件"), undefined); empty.dispose();
  const error = harness(async () => { throw new api.AdminApiError("无权读取", "FORBIDDEN", 403); }); await error.flush(); assert.match(error.html(), /无权读取/u); assert.equal(error.button("查看案件"), undefined); error.dispose();
});
test("real component paginates cases/history, suppresses management for read-only roles, and cancels stale details", async () => {
  const paths = []; let resolveA;
  const h = harness(async path => { paths.push(path); if (path.includes("/history")) return path.endsWith("=-1") ? { items: [{ version: 0, action: "CREATE", data: { to: "S01" }, created_at: row.paused_at }], next_after_version: 0 } : { items: [{ version: 1, action: "ESCALATE", data: { to: "P01" }, created_at: row.paused_at }], next_after_version: null }; if (path === "/after-sale/cases/a") return new Promise(resolve => { resolveA = resolve; }); if (path === "/after-sale/cases/b") return { ...row, id: "b" }; return path.includes("after_id=") ? { items: [{ ...row, id: "c" }], next_after_id: null } : { items: [{ ...row, id: "a" }, { ...row, id: "b" }], next_after_id: "b" }; }, ["refund.read"]);
  await h.flush(); h.button("加载更多案件").props.onClick(); await h.flush(); assert.ok(paths.some(path => path.includes("after_id=b")));
  let buttons = h.nodes().filter(node => node.type === "button" && node.props.children === "查看案件"); buttons[0].props.onClick(); await h.flush(); buttons[1].props.onClick(); await h.flush(); resolveA({ ...row, id: "a" }); await h.flush();
  assert.match(h.html(), /案件编号：b/u); assert.doesNotMatch(h.html(), /案件编号：a/u); assert.equal(h.button("确认补证结束"), undefined);
  h.button("加载更多案件历史").props.onClick(); await h.flush(); assert.ok(paths.includes("/after-sale/cases/b/history?after_version=0")); assert.match(h.html(), /请求平台介入/u); h.dispose();
});
test("material completion opens confirmation only; 409 refreshes real case and never resubmits stale command", async () => {
  let current = row, writes = 0;
  const h = harness(async (path, init = {}) => { if (init.method === "POST") { writes++; current = { ...row, version: 8, available_actions: ["DECIDE"] }; throw new api.AdminApiError("版本冲突", "RESOURCE_VERSION_CONFLICT", 409); } if (path.includes("/history")) return { items: [], next_after_version: null }; return path.includes("?") ? { items: [current], next_after_id: null } : current; });
  await h.flush(); h.button("查看案件").props.onClick(); await h.flush(); h.button("确认补证结束").props.onClick(); assert.equal(writes, 0); assert.equal(h.modal.reasonRequired, true);
  await assert.rejects(h.modal.onConfirm("本地版本冲突核验"), error => error.status === 409); await h.flush(); assert.match(h.html(), /案件版本 8/u); assert.equal(h.button("提交裁决").props.disabled, true);
  await assert.rejects(h.modal.onConfirm("本地版本冲突核验"), /关闭确认框/u); assert.equal(writes, 1); h.dispose();
});
test("privacy sharing requires independent evidence choice and explicit manual obscuring confirmation", async () => {
  const file="00000000-0000-4000-8000-000000000001";
  const current={...row,evidence_file_ids:[file],available_actions:["MARK_EVIDENCE_SHAREABLE"]};let body,writes=0;
  const h=harness(async(path,init={})=>{if(init.method==="POST"){writes++;body=JSON.parse(init.body);return reply;}if(path.includes('/history'))return{items:[],next_after_version:null};return path.includes('?')?{items:[current],next_after_id:null}:current;});
  await h.flush();h.button('查看案件').props.onClick();await h.flush();
  const label=data.caseActionLabels.MARK_EVIDENCE_SHAREABLE;
  assert.equal(h.button(label).props.disabled,true);
  let checks=h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checks.length,2);assert.equal(checks[1].props.checked,false);
  checks[0].props.onChange({target:{checked:true}});await h.flush();assert.equal(h.button(label).props.disabled,true);
  checks=h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox');checks[1].props.onChange({target:{checked:true}});await h.flush();assert.equal(h.button(label).props.disabled,false);
  h.button(label).props.onClick();assert.equal(writes,0);await h.modal.onConfirm('已人工核验脱敏材料');assert.equal(writes,1);assert.deepEqual(body.file_ids,[file]);assert.equal(body.sensitive_information_obscured,true);assert.equal(body.version,7);h.dispose();
});
