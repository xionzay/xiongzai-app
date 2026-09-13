import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
function loadTs(file, globals = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const cjsModule = { exports: {} };
  cache.set(file, cjsModule.exports);
  const js = ts.transpileModule(read(`app/${file}`), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(js, { module: cjsModule, exports: cjsModule.exports, ...globals, require: (id) => id.startsWith("./")
    ? loadTs(`${id.slice(2)}${id.includes("Image") ? ".tsx" : ".ts"}`, globals, cache) : require(id) });
  return cjsModule.exports;
}
const { bearClips, bearScenes, financeBearScene } = loadTs("bear-state-config.ts");
const manifest = JSON.parse(read("design-output/bear-ui-motion-v2/asset-manifest.json"));

test("all ten V2 assets are byte-identical, with delivered timing/loops and only runtime directories", () => {
  assert.deepEqual(readdirSync(new URL("public/assets/bear-states-v2/", root)).sort(), ["assets", "end", "posters"]);
  assert.equal(Object.keys(bearClips).length, 10);
  const hash = (file) => createHash("sha256").update(readFileSync(new URL(file, root))).digest("hex");
  for (const asset of manifest.assets) {
    assert.equal(bearClips[asset.id].durationMs, asset.durationMs);
    assert.equal(asset.formats.webp.loopCount, asset.playback === "loop" ? 0 : 1);
    for (const path of [asset.webp, asset.gif, asset.poster, asset.endPoster]) {
      assert.equal(hash(`public/assets/bear-states-v2/${path}`), hash(`design-output/bear-ui-motion-v2/${path}`), path);
    }
    assert.equal(hash(`public/assets/bear-states-v2/${asset.webp}`), asset.formats.webp.sha256);
  }
});

test("semantic mapping distinguishes waiting, rejection, cancellation, completed and optional bears", () => {
  const expected = { loading: "01-loading", error: "02-error", offline: "05-offline", orders: "04-empty",
    favorites: "04-empty", paymentProcessing: "06-waiting", paymentResult: "03-success", paymentFailure: "02-error",
    paymentCancelled: "09-neutral", paymentClosed: "09-neutral", sellerApplyReview: "06-waiting",
    sellerApplyStatus: "03-success", sellerApplyRejected: "02-error", sellerApplySupplement: "09-neutral",
    sellerApplySuspended: "09-neutral", financeCompleted: "10-confirm-calm", authGuard: "09-neutral" };
  for (const [scene, id] of Object.entries(expected)) assert.equal(bearScenes[scene].id, id, scene);
  assert.equal(bearScenes.paymentTimeout.mode, undefined);
  assert.equal(bearScenes.financePending.mode, undefined);
  for (const scene of Object.values(bearScenes)) assert.ok(!["07-welcome", "08-encourage"].includes(scene.id));
  for (const status of ["REQUESTED", "SELLER_APPROVED", "NEGOTIATING", "PLATFORM_REVIEW", "REFUND_PROCESSING"]) assert.equal(financeBearScene("refund", status), "financePending");
  for (const status of ["CREATED", "RISK_REVIEW", "APPROVED", "PAYOUT_PROCESSING"]) assert.equal(financeBearScene("withdrawal", status), "financePending");
  for (const status of ["SELLER_REJECTED", "REJECTED", "CANCELLED"]) assert.equal(financeBearScene("refund", status), "financeNeutral");
  for (const status of ["FAILED", "REJECTED", "CLOSED"]) assert.equal(financeBearScene("withdrawal", status), "financeNeutral");
  assert.equal(financeBearScene("refund", "REFUNDED"), "financeCompleted");
  assert.equal(financeBearScene("withdrawal", "COMPLETED"), "financeCompleted");
  assert.equal(financeBearScene("refund", "COMPLETED"), null);
  assert.equal(financeBearScene("withdrawal", "UNKNOWN"), null);
});

class Events {
  handlers = new Map();
  addEventListener(name, callback) { const set = this.handlers.get(name) ?? new Set(); set.add(callback); this.handlers.set(name, set); }
  removeEventListener(name, callback) { this.handlers.get(name)?.delete(callback); }
  emit(name) { for (const callback of this.handlers.get(name) ?? []) callback(); }
  get listenerCount() { return [...this.handlers.values()].reduce((sum, value) => sum + value.size, 0); }
}
function harness(id = "03-success", { reduced = false, observerSupported = true, brokenPoster = false, currentClips = false, progress = { played: false, failed: false } } = {}) {
  const image = new Events(); const document = new Events(); const media = new Events();
  Object.assign(image, { dataset: {}, style: {}, complete: brokenPoster, naturalWidth: brokenPoster ? 0 : 480 });
  document.hidden = false; media.matches = reduced;
  const requests = []; let src = `/assets/bear-states-v2/posters/${id}.png`;
  Object.defineProperty(image, "src", { get: () => src, set: (value) => { src = value; requests.push(value); } });
  const timers = new Map(); let observer; let timerId = 0;
  const globals = { document, window: { matchMedia: () => media },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(key) { timers.delete(key); },
    ...(observerSupported ? { IntersectionObserver: class {
      constructor(callback) { observer = { callback, disconnected: false }; }
      observe(target) { assert.equal(target, image); }
      disconnect() { observer.disconnected = true; }
    } } : {}),
  };
  // Retain regression coverage for archived once clips; production V3 now loops all states.
  const clips = currentClips ? bearClips : Object.fromEntries(manifest.assets.map(asset => [asset.id, { durationMs: asset.durationMs, loop: asset.playback === 'loop' }]));
  const cache = new Map([["bear-state-config.ts", { bearClips: clips }]]);
  const { mountBearPlayback } = loadTs("bear-playback.ts", globals, cache);
  const player = mountBearPlayback(image, id, "/assets/bear-states-v2", progress);
  const visible = (value = true) => observer?.callback([{ isIntersecting: value }]);
  const options = (active = true, mode = "auto") => player.update({ active, mode });
  const finish = () => { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(({ callback }) => callback()); };
  return { image, document, media, player, requests, timers, visible, options, finish, progress, get observer() { return observer; } };
}

test("once clip starts only when visible, then freezes to its delivered end PNG", () => {
  const h = harness(); h.options(); assert.equal(h.requests.length, 0);
  h.visible(); assert.match(h.image.src, /03-success\.webp\?play=/); assert.equal(h.image.dataset.playback, "once");
  h.image.emit("load"); assert.equal([...h.timers.values()][0].delay, 2580);
  h.finish(); assert.match(h.image.src, /end\/03-success\.png$/); assert.equal(h.timers.size, 0); h.player.dispose();
});

test("every current state loops without an end timer, stops hidden/reduced and cleans up", () => {
  for (const id of Object.keys(bearClips)) {
    const h = harness(id, { currentClips: true }); h.options(); h.visible(); h.image.emit('load');
    assert.equal(h.image.dataset.playback, 'loop', id); assert.equal(h.timers.size, 0);
    const source = h.image.src; h.options(); h.visible(); assert.equal(h.image.src, source);
    h.document.hidden = true; h.document.emit('visibilitychange'); assert.equal(h.image.dataset.playback, 'poster');
    h.document.hidden = false; h.document.emit('visibilitychange'); assert.equal(h.image.dataset.playback, 'loop');
    h.media.matches = true; h.media.emit('change'); assert.equal(h.image.dataset.playback, 'poster');
    h.player.dispose(); assert.equal(h.image.listenerCount + h.document.listenerCount + h.media.listenerCount, 0);
  }
});

test("ordinary updates and repeated observer/load callbacks never replay a one-shot", () => {
  const h = harness(); h.options(); h.visible(); h.image.emit("load"); const first = h.image.src;
  for (let i = 0; i < 5; i++) { h.options(); h.visible(); h.image.emit("load"); }
  assert.equal(h.image.src, first); assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 1);
  h.finish(); h.options(); h.visible(); assert.equal(h.requests.filter((path) => path.includes(".webp")).length, 1); h.player.dispose();
});

test("loading and waiting use native loops, pause hidden, resume visible without changing encoded timing", () => {
  for (const id of ["01-loading", "06-waiting"]) {
    const h = harness(id); h.options(); h.visible(); h.image.emit("load");
    assert.equal(h.image.dataset.playback, "loop"); assert.equal(h.timers.size, 0);
    const first = h.image.src; h.document.hidden = true; h.document.emit("visibilitychange");
    assert.match(h.image.src, /posters\/.*\.png$/);
    h.document.hidden = false; h.document.emit("visibilitychange"); assert.notEqual(h.image.src, first); h.player.dispose();
  }
});

test("offscreen, inactive, and hidden one-shot stops and cannot replay on return", () => {
  for (const reason of ["offscreen", "inactive", "hidden"]) {
    const h = harness(); h.options(); h.visible(); h.image.emit("load");
    if (reason === "offscreen") h.visible(false);
    if (reason === "inactive") h.options(false);
    if (reason === "hidden") { h.document.hidden = true; h.document.emit("visibilitychange"); }
    assert.match(h.image.src, /end\/03-success\.png$/); assert.equal(h.timers.size, 0);
    h.document.hidden = false; h.document.emit("visibilitychange"); h.options(); h.visible();
    assert.equal(h.requests.filter((path) => path.includes(".webp")).length, 1); h.player.dispose();
  }
});

test("static mode, reduced motion and missing visibility support do not request an animation", () => {
  for (const settings of [{ reduced: true }, { observerSupported: false }, {}]) {
    const h = harness("06-waiting", settings); h.options(true, Object.keys(settings).length ? "auto" : "static"); h.visible();
    assert.equal(h.requests.length, 0); h.player.dispose();
  }
});

test("changing reduced motion stops a playing clip and cleans the timer", () => {
  const h = harness(); h.options(); h.visible(); h.image.emit("load");
  h.media.matches = true; h.media.emit("change"); assert.match(h.image.src, /posters\/03-success\.png$/); assert.equal(h.timers.size, 0);
  h.media.matches = false; h.media.emit("change"); assert.match(h.image.src, /end\/03-success\.png$/); h.player.dispose();
});

test("failed WebP falls back to PNG, never requests GIF; missing fallback has no broken-image icon", () => {
  const h = harness(); h.options(); h.visible(); h.image.emit("error");
  assert.match(h.image.src, /posters\/03-success\.png$/); h.options(); h.visible();
  assert.equal(h.requests.filter((path) => path.includes(".webp")).length, 1);
  assert.ok(h.requests.every((path) => !path.includes(".gif")));
  h.image.emit("error"); assert.equal(h.image.style.visibility, "hidden"); h.player.dispose();
  const early = harness("02-error", { brokenPoster: true }); early.options(); early.visible();
  assert.equal(early.requests.length, 0); assert.equal(early.image.style.visibility, "hidden"); early.player.dispose();
});

test("unmount clears listeners, observer, decoder and timers; late callbacks cannot restart", () => {
  const h = harness(); h.options(); h.visible(); h.image.emit("load"); const late = [...h.timers.values()][0].callback;
  h.player.dispose(); const count = h.requests.length;
  assert.equal(h.timers.size, 0); assert.equal(h.observer.disconnected, true);
  assert.equal(h.image.listenerCount + h.document.listenerCount + h.media.listenerCount, 0);
  late(); h.visible(); h.options(); assert.equal(h.requests.length, count); assert.equal(h.image.dataset.playback, "stopped");
});

test("effect remount with retained progress does not replay; a new semantic event can play", () => {
  const first = harness(); first.options(); first.visible(); first.player.dispose();
  const remount = harness("03-success", { progress: first.progress }); remount.options(); remount.visible();
  assert.ok(remount.requests.every((path) => !path.includes(".webp"))); remount.player.dispose();
  const nextEvent = harness(); nextEvent.options(); nextEvent.visible(); assert.match(nextEvent.image.src, /\.webp/); nextEvent.player.dispose();
});

test("real React component SSR is decorative square PNG; keys follow events not renders", () => {
  const { BearStateImage, StateBear } = loadTs("BearStateImage.tsx");
  const html = renderToStaticMarkup(React.createElement(StateBear, { scene: "paymentTimeout" }));
  assert.match(html, /posters\/06-waiting\.png/); assert.match(html, /alt=""/); assert.match(html, /aria-hidden="true"/);
  assert.match(html, /width="176" height="176"/); assert.doesNotMatch(html, /\.webp|\.gif/);
  const a = BearStateImage({ id: "03-success", eventKey: "order-a", size: 128 });
  const b = BearStateImage({ id: "03-success", eventKey: "order-a", size: 176 });
  assert.equal(a.key, b.key); assert.notEqual(a.key, BearStateImage({ id: "03-success", eventKey: "order-b" }).key);
});

test("UI integration preserves raw payment association, isolated empty previews and failure gates", () => {
  const page = read("app/page.tsx");
  assert.match(page, /suppliedPayment\?\.order_id === order\?\.id/);
  assert.match(page, /key="preview-empty-orders"/); assert.match(page, /key="preview-empty-favorites"/);
  assert.match(page, /loaded && !loadError && conversations.length === 0/);
  assert.match(page, /loaded && !loadError && visible.length === 0/);
  assert.match(page, /loading=\{discoveryLoading\} error=\{discoveryError\}/);
  assert.match(read("app/BearStatusSupport.tsx"), /测试支付，不会真实扣款/);
  assert.match(page, /apiDetail\?\.id === serviceId && Array\.isArray\(apiDetail\?\.skus\) && apiSpecs\?\.length === 0/);
  assert.match(page, /disabled=\{!apiSpecs\?\.length\}/);
  assert.doesNotMatch(read("app/BearStateImage.tsx") + read("app/bear-playback.ts"), /onComplete|onSuccess|apiRequest|fetch\(/);
});

test("rendered payment status ignores an old order's successful payment", () => {
  const source = ts.createSourceFile("page.tsx", read("app/page.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PaymentResultScreen");
  const js = ts.transpileModule(fn.getText(source), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const PaymentResultScreen = vm.runInNewContext(`${js}\nPaymentResultScreen`, {
    // This isolated render stub accepts only the scene supplied by the typed production component.
    // eslint-disable-next-line react/prop-types
    React, StateBear: ({ scene }) => React.createElement("i", { "data-scene": scene }),
    DemoStateNotice: () => null, AppIcon: () => null, ContextStateScreen: () => null,
    formatCent: (value) => (Number(value) / 100).toFixed(2),
  });
  const order = { id: "order-b", payment_status: "UNPAID", payable_amount_cent: "2500", service_starts_at: "2026-09-06T10:00:00Z" };
  const render = (payment, extra = {}) => renderToStaticMarkup(React.createElement(PaymentResultScreen, { go() {}, order, payment, ...extra }));
  const stale = render({ id: "payment-a", order_id: "order-a", status: "PAID" });
  assert.match(stale, /data-scene="paymentTimeout"/); assert.doesNotMatch(stale, /data-scene="paymentResult"/);
  assert.match(render({ order_id: "order-b", status: "PAID" }), /data-scene="paymentResult"/);
  assert.match(render({ order_id: "order-b", status: "FAILED" }), /data-scene="paymentFailure"/);
  assert.match(render({ order_id: "order-b", status: "CLOSED" }), /data-scene="paymentClosed"/);
  assert.match(render(null, { order: { ...order, status: "CLOSED" } }), /data-scene="paymentClosed"/);
  assert.match(render(null, { order: { ...order, status: "CANCELLED" } }), /data-scene="paymentCancelled"/);
  assert.match(render(null, { order: { ...order, status: "CANCELLED" } }), /订单已取消/);
  assert.doesNotMatch(render(null, { order: { ...order, status: "CANCELLED" } }), /订单仍在待付款状态/);
  assert.doesNotMatch(render({ order_id: "order-b", status: "FAILED" }), /支付渠道暂时繁忙/);
  assert.match(render(null, { preview: true, outcome: "cancelled" }), /data-scene="paymentCancelled"/);
});

test("offline cache display does not replace loaded lists with large error art", () => {
  const page = read("app/page.tsx");
  assert.match(page, /if \(navigator.onLine !== false\) setLiveOrders\(\[\]\)/);
  assert.match(page, /if \(navigator.onLine !== false\) setOrders\(\[\]\)/);
  assert.match(page, /\(!loading && !loadError\) \|\| liveOrders.length > 0/);
  assert.match(page, /\(!loading && !loadError\) \|\| orders.length > 0/);
  assert.match(page, /hasContent=\{companionRows.length \+ serviceRows.length > 0\}/);
  assert.match(read("app/BearStatusSupport.tsx"), /if \(offline && hasContent && !restricted\) return <p/);
});
