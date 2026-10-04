import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("public/assets/chat-stickers/bear-v1/manifest.json"));
function load(file, globals = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith(".json")) return JSON.parse(read(file));
  const cjs = { exports: {} }; cache.set(file, cjs.exports);
  const js = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module: cjs, exports: cjs.exports, ...globals, require: (id) => {
    if (!id.startsWith(".")) return require(id);
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(file), id));
    if (!path.extname(target)) target += /Sticker/.test(path.basename(target)) ? ".tsx" : ".ts";
    return load(target, globals, cache);
  } });
  return cjs.exports;
}
const { stickerSummary } = load("app/chat-stickers/manifest.ts");
const { stickerDemoReducer, emptyDemo } = load("app/chat-stickers/demo-adapter.ts");
test("35 sticker IDs, names, original GIF hashes and 320px PNG thumbnails are complete", () => {
  assert.equal(manifest.length, 35);
  assert.equal(new Set(manifest.map(x => x.id)).size, 35);
  assert.equal(new Set(manifest.map(x => x.name)).size, 35);
  assert.equal(new Set(manifest.map(x => x.sha256)).size, 35);
  assert.equal(readdirSync(path.join(root, "public/assets/chat-stickers/bear-v1/gif")).length, 35);
  assert.equal(readdirSync(path.join(root, "public/assets/chat-stickers/bear-v1/thumbnails")).length, 35);
  for (const [index, item] of manifest.entries()) {
    assert.equal(item.id, `bear-v1/${String(index + 1).padStart(3, "0")}`);
    assert.equal(item.pack_id, "bear-v1"); assert.equal(item.version, 1);
    assert.equal(item.width, 320); assert.equal(item.height, 320); assert.equal(item.duration_ms, 3000);
    assert.equal(item.source_loop, 0); assert.equal(item.opaque, true);
    assert.ok(item.accessibility_description.includes(item.name));
    const gif = readFileSync(path.join(root, "public", item.gif_url));
    assert.equal(createHash("sha256").update(gif).digest("hex"), item.sha256);
    assert.equal(gif.readUInt16LE(6), 320); assert.equal(gif.readUInt16LE(8), 320);
    const png = readFileSync(path.join(root, "public", item.thumbnail_url));
    assert.equal(png.readUInt32BE(16), 320); assert.equal(png.readUInt32BE(20), 320);
  }
});
test("display summaries use names and unknown IDs never expose internal paths", () => {
  assert.equal(stickerSummary("bear-v1/001"), "[表情：你好]");
  assert.equal(stickerSummary("/internal/file.gif"), "[表情暂不可用]");
});

function gestureHarness() {
  const events = [], timers = new Map(); let sequence = 0, now = 1000;
  const { createStickerGesture } = load("app/chat-stickers/gesture.ts", { Date: { now: () => now }, setTimeout: (callback) => { timers.set(++sequence, callback); return sequence; }, clearTimeout: id => timers.delete(id) });
  const control = createStickerGesture({ preview: () => events.push("preview"), close: () => events.push("close"), send: () => events.push("send") });
  return { control, events, timers, advance() { now += 1000; }, long() { [...timers.values()].forEach(fn => fn()); timers.clear(); } };
}
test("pointer tap sends once and synthetic click/repeated rapid tap cannot double-send", () => {
  const h = gestureHarness(); h.control.down(1, 20, 20); h.control.up(1); h.control.click(1);
  h.control.down(2, 20, 20); h.control.up(2); assert.deepEqual(h.events, ["send"]);
  h.advance(); h.control.click(0); assert.deepEqual(h.events, ["send", "send"]); h.control.dispose();
});
test("long press opens preview then closes on release, with no trailing send", () => {
  const h = gestureHarness(); h.control.down(1, 20, 20); h.long(); h.control.up(1); h.control.click(1);
  assert.deepEqual(h.events, ["preview", "close"]); assert.equal(h.timers.size, 0);
});
test("scroll movement, pointer cancellation, multitouch and unmount cancel the gesture", () => {
  for (const kind of ["move", "cancel", "second-pointer", "dispose"]) {
    const h = gestureHarness(); h.control.down(1, 10, 10);
    if (kind === "move") h.control.move(1, 20, 20);
    if (kind === "cancel") h.control.cancel();
    if (kind === "second-pointer") h.control.down(2, 10, 10);
    if (kind === "dispose") h.control.dispose();
    h.long(); h.control.up(1); h.control.click(1); assert.deepEqual(h.events, []); assert.equal(h.timers.size, 0);
  }
  const h = gestureHarness(); h.control.down(1, 0, 0); h.long(); h.control.move(1, 0, 30); assert.deepEqual(h.events, ["preview", "close"]);
});

class Events {
  handlers = new Map();
  addEventListener(name, fn) { const set = this.handlers.get(name) ?? new Set(); set.add(fn); this.handlers.set(name, set); }
  removeEventListener(name, fn) { this.handlers.get(name)?.delete(fn); }
  emit(name) { for (const fn of this.handlers.get(name) ?? []) fn(); }
  get size() { return [...this.handlers.values()].reduce((n, s) => n + s.size, 0); }
}
function playerHarness({ reduced = false, progress = { played: false, failed: false } } = {}) {
  const image = new Events(), document = new Events(), media = new Events();
  Object.assign(image, { dataset: {}, complete: false, naturalWidth: 320 });
  document.hidden = false; media.matches = reduced;
  let src = manifest[0].thumbnail_url, observer, count = 0, unavailable = 0;
  const requests = [], timers = new Map();
  Object.defineProperty(image, "src", { get: () => src, set: value => { src = value; requests.push(value); } });
  const { mountStickerPlayback } = load("app/chat-stickers/playback.ts", { document, window: { matchMedia: () => media }, setTimeout: (callback, delay) => { timers.set(++count, { callback, delay }); return count; }, clearTimeout: id => timers.delete(id), IntersectionObserver: class {
    constructor(callback) { observer = { callback, disconnected: false }; }
    observe() {} disconnect() { observer.disconnected = true; }
  } });
  const player = mountStickerPlayback(image, manifest[0], progress, () => unavailable++);
  return { image, document, media, requests, timers, player, progress, visible: (value = true) => observer.callback([{ isIntersecting: value }]),
    finish: () => { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(t => t.callback()); }, get observer() { return observer; }, get unavailable() { return unavailable; } };
}
test("chat GIF plays one supplied round, rerenders/visibility callbacks do not restart, explicit replay works", () => {
  const h = playerHarness(); assert.equal(h.requests.length, 0); h.visible(); h.image.emit("load");
  assert.equal([...h.timers.values()][0].delay, 3000); const first = h.image.src;
  h.visible(); h.image.emit("load"); assert.equal(h.image.src, first); assert.equal(h.timers.size, 1);
  h.finish(); assert.match(h.image.src, /thumbnails\/001.png$/); h.visible(); assert.equal(h.requests.filter(x => x.includes(".gif")).length, 1);
  h.player.replay(); assert.notEqual(h.image.src, first); assert.equal(h.requests.filter(x => x.includes(".gif")).length, 2); h.player.dispose();
});
test("offscreen/background stop and historical progress survives remount", () => {
  for (const background of [false, true]) {
    const h = playerHarness(); h.visible(); h.image.emit("load");
    if (background) { h.document.hidden = true; h.document.emit("visibilitychange"); } else h.visible(false);
    assert.equal(h.timers.size, 0); assert.match(h.image.src, /\.png$/);
    h.document.hidden = false; h.document.emit("visibilitychange"); h.visible();
    assert.equal(h.requests.filter(x => x.includes(".gif")).length, 1); h.player.dispose();
    const next = playerHarness({ progress: h.progress }); next.visible(); assert.equal(next.requests.length, 0); next.player.dispose();
  }
});
test("reduced motion stays static including explicit replay; dynamic preference change stops playback", () => {
  const h = playerHarness({ reduced: true }); h.visible(); h.player.replay(); assert.equal(h.requests.length, 0); h.player.dispose();
  const live = playerHarness(); live.visible(); live.image.emit("load"); live.media.matches = true; live.media.emit("change");
  assert.match(live.image.src, /\.png$/); assert.equal(live.timers.size, 0); live.player.dispose();
});
test("GIF error falls back to thumbnail, missing thumbnail becomes accessible unavailable text", () => {
  const h = playerHarness(); h.visible(); h.image.emit("error"); assert.match(h.image.src, /\.png$/); assert.equal(h.progress.failed, true);
  h.visible(); assert.equal(h.requests.filter(x => x.includes(".gif")).length, 1); h.image.emit("error"); assert.equal(h.unavailable, 1); h.player.dispose();
  const { StickerImage } = load("app/chat-stickers/StickerImage.tsx");
  const html = renderToStaticMarkup(React.createElement(StickerImage, { stickerId: "internal-path", progress: { played: false, failed: false } }));
  assert.match(html, /\[表情暂不可用\]/); assert.doesNotMatch(html, /internal-path|<img/);
});
test("unmount releases decoder, listeners, observer and timer; late callback cannot revive playback", () => {
  const h = playerHarness(); h.visible(); h.image.emit("load"); const late = [...h.timers.values()][0].callback;
  h.player.dispose(); assert.equal(h.image.size + h.document.size + h.media.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.observer.disconnected, true);
  const requests = h.requests.length; late(); h.visible(); h.player.replay(); assert.equal(h.requests.length, requests); assert.equal(h.image.dataset.playback, "stopped");
});
test("demo reducer is session-only, deduplicates taps and retries in place with explicit status controls", () => {
  const action = { type: "send", scope: "chat-a", id: "bear-v1/001", localId: "local-1", at: 1000, time: "12:00", status: "failed" };
  const first = stickerDemoReducer(emptyDemo("chat-a"), action);
  const duplicate = stickerDemoReducer(first, { ...action, at: 1200 }); assert.equal(duplicate.messages.length, 1);
  const retry = stickerDemoReducer(first, { type: "retry", scope: "chat-a", localId: "local-1" });
  assert.equal(retry.messages.length, 1); assert.equal(retry.messages[0].status, "sending"); assert.equal(retry.messages[0].localId, "local-1");
  assert.equal(retry.messages[0].progress, first.messages[0].progress);
  assert.equal(stickerDemoReducer(retry, { type: "status", scope: "chat-a", localId: "local-1", status: "local" }).messages[0].status, "local");
  assert.equal(stickerDemoReducer(first, { ...action, scope: "chat-b", localId: "local-2" }).messages.length, 1);
  assert.equal(stickerDemoReducer(first, { type: "clear", scope: "chat-a" }).messages.length, 0);
});
test("normal and support chat separate V3 transport from legacy demo and keep text input", () => {
  const page = read("app/page.tsx");
  const normal = page.slice(page.indexOf("function ChatScreen"), page.indexOf("function CustomerServiceScreen"));
  const support = page.slice(page.indexOf("function CustomerServiceScreen"), page.indexOf("function FavoritesScreen"));
  for (const source of [normal, support]) {
    assert.match(source, /<StickerToggle control=\{stickers\}/); assert.match(source, /<PendingBearStickers sender=\{bear\}/); assert.doesNotMatch(source, /<StickerDemoMessages/); assert.match(source, /message_type: "STICKER"/);
    assert.match(source, /onFocus=\{stickers.closePanel\}/); assert.match(source, /value=\{text\}/);
    assert.doesNotMatch(source, /JSON.stringify\([^\n]*stickerId/);
  }
  for (const file of readdirSync(path.join(root, "app/chat-stickers")).filter(x => /\.tsx?$/.test(x) && !["StandardEmoji.tsx", "standard-emoji.ts", "useEmojiComposer.ts"].includes(x))) {
    assert.doesNotMatch(read(`app/chat-stickers/${file}`), /\b(fetch|apiRequest|localStorage|sessionStorage|indexedDB|WebSocket)\b|onComplete|onDelivered|setUnreadCount/, file);
  }
  const { StickerPanel } = load("app/chat-stickers/StickerPanel.tsx");
  const html = renderToStaticMarkup(React.createElement(StickerPanel, { onSendSticker() {}, onPreview() {}, onClose() {} }));
  assert.equal((html.match(/class="sticker-pick"/g) ?? []).length, 35);
  assert.equal((html.match(/thumbnails\//g) ?? []).length, 35); assert.doesNotMatch(html, /gif\//);
});
