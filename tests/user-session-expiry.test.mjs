import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const page = ts.createSourceFile("page.tsx", readFileSync("app/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = name => page.statements.find(node => node.name?.text === name).getText(page);
function bus() {
  const context = { exports: {} };
  vm.runInNewContext(compile(readFileSync("app/user-session-expiry.ts", "utf8")), context);
  return context.exports;
}
function requestHarness(responses) {
  const events = bus(), calls = [];
  let expirations = 0;
  events.subscribeUserSessionExpiry(() => { expirations++; });
  const context = { ...events, URL, exports: {}, fetch: async (url, init) => {
    calls.push({ path: new URL(url).pathname, method: init.method ?? "GET", credentials: init.credentials });
    assert.ok(responses.length, "no unexpected retry");
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next();
    return new Response(JSON.stringify({ code: "LOCAL_TEST_RESPONSE" }), { status: next });
  } };
  // The same production API resolver is shared with controlled review images.
  vm.runInNewContext(compile(readFileSync("app/user-api-location.ts", "utf8")), context);
  vm.runInNewContext(compile(["ApiClientError", "apiRequest"].map(declaration).join("\n")) + ";exports.request=apiRequest;", context);
  return { request: context.exports.request, calls, get expirations() { return expirations; } };
}

test("final protected 401 after rejected refresh emits expiry and does not replay a write", async () => {
  const h = requestHarness([401, 401]);
  await assert.rejects(h.request("/seller/services", { method: "POST", body: "{}" }), error => error.status === 401);
  assert.equal(h.expirations, 1);
  assert.deepEqual(h.calls.map(call => call.path), ["/api/v1/seller/services", "/api/v1/auth/token/refresh"]);
  assert.ok(h.calls.every(call => call.credentials === "include"));
});
test("successful refresh and successful retry keep the existing normal session", async () => {
  const h = requestHarness([401, 200, 200]);
  await h.request("/seller/profile");
  assert.equal(h.expirations, 0); assert.equal(h.calls.length, 3);
});
test("a retry still returning 401 expires once and cannot loop", async () => {
  const h = requestHarness([401, 200, 401]);
  await assert.rejects(h.request("/seller/profile"), error => error.status === 401);
  assert.equal(h.expirations, 1); assert.equal(h.calls.length, 3);
});
test("parallel protected 401s share one cookie refresh rather than racing its server rotation", async () => {
  const h = requestHarness([401, 401, 200, 200, 200]);
  await Promise.all([h.request("/seller/profile"), h.request("/seller/orders")]);
  assert.equal(h.calls.filter(call => call.path === "/api/v1/auth/token/refresh").length, 1);
  assert.equal(h.calls.length, 5); assert.equal(h.expirations, 0);
});
test("a late old 401 reuses the completed cookie refresh and does not expire a valid session", async () => {
  let deliverLate;
  const late = new Promise(resolve => { deliverLate = resolve; });
  const h = requestHarness([() => late, 401, 200, 200, 200]);
  const slow = h.request("/seller/orders");
  await h.request("/seller/profile");
  deliverLate(new Response("{}", { status: 401 })); await slow;
  assert.equal(h.calls.filter(call => call.path === "/api/v1/auth/token/refresh").length, 1);
  assert.equal(h.expirations, 0);
});
test("failed shared refresh can be retried later without retaining the failed in-flight request", async () => {
  const events = bus(); let attempts = 0;
  const revision = events.userSessionRefreshRevision();
  assert.equal(await events.refreshUserSession(revision, async () => { attempts++; return false; }), false);
  assert.equal(await events.refreshUserSession(revision, async () => { attempts++; return true; }), true);
  assert.equal(attempts, 2);
  assert.equal(events.userSessionRefreshRevision(), revision + 1);
});
for (const path of ["/auth/sms/send", "/auth/sms/login", "/auth/token/refresh"]) test(`authentication rejection at ${path} is not a session-expiry loop`, async () => {
  const h = requestHarness([401]);
  await assert.rejects(h.request(path, { method: "POST" }), error => error.status === 401);
  assert.equal(h.expirations, 0); assert.equal(h.calls.length, 1);
});
for (const status of [403, 409, 503]) test(`${status} retains the session and surfaces the original error`, async () => {
  const h = requestHarness([status]);
  await assert.rejects(h.request("/seller/profile"), error => error.status === status);
  assert.equal(h.expirations, 0); assert.equal(h.calls.length, 1);
});
test("network/refresh transport failures are not fabricated authentication failures", async () => {
  for (const responses of [[new Error("local offline")], [401, new Error("local refresh offline")]]) {
    const h = requestHarness(responses);
    await assert.rejects(h.request("/seller/profile"), /local .*offline/);
    assert.equal(h.expirations, 0);
  }
});

// Execute the actual Page subscription with setter probes; this is a hook
// behavior harness, not a browser login or authenticated acceptance fixture.
let expiryEffect;
function locate(node) {
  if (ts.isCallExpression(node) && node.expression.getText(page) === "useEffect" && node.arguments[0]?.getText(page).includes("subscribeUserSessionExpiry")) expiryEffect = node.getText(page);
  ts.forEachChild(node, locate);
}
locate(page);
function pageHarness(viewer) {
  assert.ok(expiryEffect);
  const events = bus(), changes = {}, messages = [], storefrontLoginReturn = { current: "sellerProfile" };
  let cleanup;
  const context = { ...events, viewer, storefrontLoginReturn, notify: message => messages.push(message), useEffect: effect => { cleanup = effect(); } };
  const setters = ["setViewer", "setUnreadCount", "setCurrentOrder", "setCurrentRefund", "setCurrentComplaint", "setCurrentReview", "setCurrentPayment", "setSelectedConversation", "setSelectedSupportConversationId", "setSelectedNotification", "setPage"];
  for (const setter of setters) context[setter] = value => { changes[setter] = value; };
  vm.runInNewContext(compile(expiryEffect), context);
  return { events, changes, messages, storefrontLoginReturn, cleanup, setters };
}
test("expired logged-in Page clears identity, unread count and private record/preview state before normal login", () => {
  const h = pageHarness({ id: "local-test-viewer" });
  h.events.emitUserSessionExpiry();
  for (const setter of h.setters) assert.equal(h.changes[setter], setter === "setPage" ? "auth" : setter === "setUnreadCount" ? 0 : null, setter);
  assert.equal(h.storefrontLoginReturn.current, null);
  assert.deepEqual(h.messages, ["登录状态已失效，请重新登录"]);
  h.cleanup();
});
test("anonymous public browsing is not forced into login by an unauthorized background request", () => {
  const h = pageHarness(null);
  h.events.emitUserSessionExpiry();
  assert.deepEqual(h.changes, {}); assert.deepEqual(h.messages, []);
  h.cleanup();
});
test("unmounted/old subscription is removed and cannot alter the next page", () => {
  const h = pageHarness({ id: "local-test-viewer" });
  h.cleanup(); h.events.emitUserSessionExpiry();
  assert.deepEqual(h.changes, {}); assert.deepEqual(h.messages, []);
});
