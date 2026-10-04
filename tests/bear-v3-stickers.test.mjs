import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const read = file => readFileSync(path.join(root, file), "utf8");
function load(file, globals = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  const code = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, ...globals, require(id) {
    if (!id.startsWith(".")) return globals.modules?.[id] ?? require(id);
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(file), id)).replace(/\.js$/, ".ts");
    if (!path.extname(target)) target += target.endsWith("BearStickers") ? ".tsx" : ".ts";
    return load(target, globals, cache);
  } });
  return module.exports;
}
const registry = load("packages/contracts/src/bear-stickers.ts");
test("70 final V3 GIFs are byte-identical, versioned, transparent-source assets with two complete packs", () => {
  const original = JSON.parse(read("表情包资料/双端表情包-V3-全动态/manifest/全动态素材清单-v3.json"));
  const published = JSON.parse(read("public/assets/chat-stickers/bear-v3/manifest.json"));
  assert.equal(published.length, 70); assert.equal(new Set(published.map(row => row.id)).size, 70);
  for (const side of ["buyer", "seller"]) {
    assert.equal(registry.bearStickersFor(side).length, 35);
    assert.equal(readdirSync(path.join(root, "public/assets/chat-stickers/bear-v3", side)).length, 35);
  }
  for (const item of published) {
    const source = original.find(row => row.key === `${item.side}-${item.id.slice(-3)}`);
    assert.equal(item.sha256, source.sha256); assert.equal(source.true_transparency, true);
    const bytes = readFileSync(path.join(root, "public", item.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
    assert.equal(bytes.readUInt16LE(6), 384); assert.equal(bytes.readUInt16LE(8), 384);
    assert.equal(item.duration_ms, 2800); assert.ok(item.frames > 1);
    assert.deepEqual(JSON.parse(JSON.stringify(registry.getBearSticker(item.id))), item);
  }
  assert.doesNotMatch(JSON.stringify(published), /\/Applications|PNG|base64/);
});
test("structured persisted IDs resolve both packs and unknown IDs never become resource URLs", () => {
  for (const item of registry.bearStickers) assert.equal(registry.decodeBearSticker(registry.encodeBearSticker(item.id)).url, item.url);
  for (const content of ["not-json", '{"pack":"old","id":"bear-v3/buyer/001"}', '{"pack":"bear-v3","id":"/private.gif"}']) assert.equal(registry.decodeBearSticker(content), undefined);
});
test("formal seller inbox and fallback conversation preserve the sender role instead of using local sticker demos", () => {
  const page = read("app/page.tsx");
  assert.match(page, /const visible = conversations\.filter\(item => item\.conversation_type !== "SUPPORT" && \(seller \? item\.member_role === "SELLER" : item\.member_role !== "SELLER"\)\)/);
  const fallback = page.match(/else if \(!selected\) selected =[^\n]+/)[0];
  assert.match(fallback, /seller \? item\.member_role === "SELLER" : item\.member_role !== "SELLER"/);
  assert.match(page, /case "sellerMessages": return <MessagesScreen seller/);
  assert.match(page, /case "customerService": return <CustomerServiceScreen[^\n]+seller=\{sellerTheme\}/);
  const localWorkbench = page.slice(page.indexOf("const renderScreen"), page.indexOf('case "sellerMessages"'));
  assert.doesNotMatch(localWorkbench, /\['seller'[^\n]*'sellerMessages'/);
});
test("each panel contains only its 35 GIFs with no duplicated visible caption or PNG substitution", () => {
  const { BearStickerPanel, BearStickerImage } = load("app/chat-stickers/BearStickers.tsx");
  for (const side of ["buyer", "seller"]) {
    const html = renderToStaticMarkup(React.createElement(BearStickerPanel, { sender: { side, disabled: false, sending: false, send() {} } }));
    assert.equal((html.match(/class="bear-v3-panel-art"/g) ?? []).length, 35);
    assert.equal((html.match(/aria-label="发送/g) ?? []).length, 35);
    assert.ok(html.includes(`/bear-v3/${side}/`));
    assert.ok(!html.includes(`/bear-v3/${side === "buyer" ? "seller" : "buyer"}/`));
    assert.doesNotMatch(html, /\.png|thumbnails|本地演示/);
  }
  assert.equal(renderToStaticMarkup(React.createElement(BearStickerImage, { id: "/private/path.gif" })), '<span role="status">表情暂不可用</span>');
});
test("real sender blocks rapid repeats, retains failed GIF and retries with the same message key", async () => {
  const states = [], refs = []; let stateIndex = 0, refIndex = 0;
  const hooks = { ...React, useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], update => { states[index] = typeof update === "function" ? update(states[index]) : update; }]; }, useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; } };
  const { useBearStickerSender } = load("app/chat-stickers/BearStickers.tsx", { crypto: { randomUUID }, modules: { react: hooks } });
  const calls = []; let resolve, reject;
  const transport = (id, key) => { calls.push({ id, key }); return new Promise((yes, no) => { resolve = yes; reject = no; }); };
  const render = (enabled = true, scope = "conversation") => { stateIndex = 0; refIndex = 0; return useBearStickerSender(scope, "buyer", enabled, transport); };
  let control = render(); control.send("bear-v3/seller/001"); assert.equal(calls.length, 0);
  control.send("bear-v3/buyer/001"); control.send("bear-v3/buyer/001"); assert.equal(calls.length, 1);
  assert.equal(render().pending[0].status, "sending");
  reject(new Error("网络暂时不可用")); await new Promise(done => setImmediate(done));
  control = render(); assert.equal(control.pending[0].status, "failed"); assert.equal(control.pending[0].error, "网络暂时不可用");
  control.retry(control.pending[0]); assert.equal(calls[1].key, calls[0].key);
  resolve(); await new Promise(done => setImmediate(done)); assert.equal(render().pending.length, 0);
  render(false).send("bear-v3/buyer/002"); assert.equal(calls.length, 2);
});
test("panel and keyboard resizing keep the latest GIF visible without pulling a history reader to the bottom", () => {
  let effect, resized, onScroll, disconnected = false;
  const frames = new Map(); let frameId = 0;
  const flushFrames = () => { while(frames.size) { const rows = [...frames.entries()]; frames.clear(); rows.forEach(([,callback]) => callback()); } };
  const styles = new Map();
  const element = { clientHeight: 500, scrollHeight: 1000, scrollTop: 500, style: {setProperty(key,value) {styles.set(key,value);}, removeProperty(key) {styles.delete(key);}},
    scrollTo({top}) { this.scrollTop = Math.min(top, this.scrollHeight - this.clientHeight); },
    addEventListener(_name, handler) { onScroll = handler; }, removeEventListener() { onScroll = undefined; }
  };
  const { useChatViewportAnchor } = load("app/chat-stickers/BearStickers.tsx", { requestAnimationFrame(callback) { const id = ++frameId; frames.set(id,callback); return id; }, cancelAnimationFrame(id) { frames.delete(id); }, ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} disconnect() { disconnected = true; } }, modules: { react: { ...React, useEffect(callback) { effect = callback; } } } });
  useChatViewportAnchor({current:element}, true); const cleanup = effect();
  element.clientHeight = 260; resized(); assert.equal(element.scrollTop, 740);
  assert.equal(styles.get("--chat-visible-height"), "260px");
  element.scrollHeight = 1100; onScroll(); flushFrames(); assert.equal(element.scrollTop,840);
  element.scrollTop = 100; onScroll(); element.clientHeight = 400; resized(); assert.equal(element.scrollTop, 100);
  cleanup(); assert.equal(disconnected, true); assert.equal(onScroll, undefined); assert.equal(styles.size,0);
});
