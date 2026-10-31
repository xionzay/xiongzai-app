import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(path, globals={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Map,BigInt,Set,URL,Response,...globals});
  return exports;
}

test("history merging retains old pages, removes overlap, and orders bigint sequences exactly",()=>{
  const {mergeSupportMessages}=load("app/admin/support-messages.ts");
  const old=[{id:"one",sequence_no:"9007199254740993"},{id:"two",sequence_no:"9007199254740994"}];
  const current=mergeSupportMessages(old,[{id:"two",sequence_no:"9007199254740994"},{id:"three",sequence_no:"9007199254740995"}]);
  assert.deepEqual(Array.from(current,row=>row.id),["one","two","three"]);
  assert.equal(old.length,2);
});

test("different pending categories targeting the same module add up instead of overwriting",()=>{
  const {todoCounts}=load("apps/api/src/todo-counts.ts");
  const counts=todoCounts([{target_module:"logs",count:2},{target_module:"logs",count:3},{target_module:"files",count:1}]);
  assert.equal(counts.get("logs"),5);assert.equal(counts.get("files"),1);assert.equal(counts.has("orders"),false);
});

test("protocol datetime-local round-trips in Shanghai and DST timezones without UTC slicing",()=>{
  const original=process.env.TZ;
  try {for(const timezone of ["Asia/Shanghai","America/New_York"]){process.env.TZ=timezone;const {localDateTime}=load("app/admin/support-messages.ts");const iso="2026-10-16T03:14:00.000Z";assert.equal(new Date(localDateTime(iso)).toISOString(),iso);assert.equal(localDateTime(null),"");}}
  finally {if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});

test("shared request layer emits invalidation only after real server success",async()=>{
  let status=503;const api=load("app/admin/admin-api.ts",{fetch:async()=>new Response(JSON.stringify({message:"测试失败"}),{status}),navigator:{onLine:true}});
  const events=[];api.subscribeAdminApi(event=>events.push(event.type));
  await assert.rejects(api.adminApiRequest("/governance/configs",{method:"POST",body:"{}"}));assert.equal(events.length,0);
  status=200;await api.adminApiRequest("/governance/configs",{method:"POST",body:"{}"});assert.deepEqual(events,["data-changed"]);
  await api.adminApiRequest("/auth/login",{method:"POST",body:"{}"});assert.equal(events.length,1);
  status=401;await assert.rejects(api.adminApiRequest("/users"));assert.deepEqual(events,["data-changed","session-expired"]);
});

test("invalid successful API bodies never report mutation success or expose raw responses", async () => {
  for (const body of ["<html>local-private-response</html>", "{\"status\":", "null", "\"local-private-response\""]) {
    const api = load("app/admin/admin-api.ts", { fetch: async () => new Response(body, { status: 200, headers: { "x-request-id": "local-format-test" } }) });
    const events = []; api.subscribeAdminApi(event => events.push(event.type));
    await assert.rejects(api.adminApiRequest("/governance/configs", { method: "POST", body: "{}" }), error => {
      assert.equal(error.code, "ADMIN_RESPONSE_INVALID");
      assert.equal(error.requestId, "local-format-test");
      assert.doesNotMatch(error.message, /local-private-response|<html>/);
      return true;
    });
    assert.equal(events.length, 0);
    await assert.rejects(api.adminApiRequest("/users"), error => error.code === "ADMIN_RESPONSE_INVALID");
  }
});

test("empty 204 logout remains valid and malformed 401 still invalidates identity", async () => {
  let status = 204;
  const api = load("app/admin/admin-api.ts", { fetch: async () => new Response(status === 204 ? null : "<html>unauthorized</html>", { status }) });
  const events = []; api.subscribeAdminApi(event => events.push(event.type));
  await api.adminApiRequest("/auth/logout", { method: "POST" });
  assert.equal(events.length, 0);
  status = 401;
  await assert.rejects(api.adminApiRequest("/users"), error => error.status === 401);
  assert.deepEqual(events, ["session-expired"]);
});

function navigationModule() {
  const exports = {};
  const require = name => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    throw new Error("Unexpected component import");
  };
  vm.runInNewContext(ts.transpileModule(readFileSync("app/admin/admin-navigation.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require, Set });
  return exports;
}

test("navigation grouping preserves every module exactly once without adding business routes", () => {
  const { ADMIN_NAV_GROUPS } = navigationModule();
  const grouped = Array.from(ADMIN_NAV_GROUPS).flatMap(group => Array.from(group.modules));
  const page = readFileSync("app/admin/page.tsx", "utf8");
  const navSource = page.slice(page.indexOf("const NAV:"), page.indexOf("const STATUS_LABELS:"));
  const existing = Array.from(navSource.matchAll(/id: "([a-zA-Z]+)"/g), match => match[1]);
  assert.equal(new Set(grouped).size, grouped.length);
  assert.deepEqual(grouped.toSorted(), existing.toSorted());
});

test("navigation SSR only renders allowed modules and server counts, with accessible active identity", () => {
  const { AdminNavigation } = navigationModule();
  const html = renderToStaticMarkup(React.createElement(AdminNavigation, {
    items: [{ id: "users", label: "用户管理", icon: "/assets/icon-mine.png" }], active: "users",
    counts: new Map([["users", 27], ["finance", 999]]), onNavigate() {},
  }));
  assert.match(html, /用户与陪玩/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-label="用户管理"/);
  assert.match(html, /27 项待办/);
  assert.doesNotMatch(html, /财务与资金|999|工作台/);
  const empty = renderToStaticMarkup(React.createElement(AdminNavigation, { items: [], active: "dashboard", counts: new Map(), onNavigate() {} }));
  assert.doesNotMatch(empty, /<section|<button/);
});
