import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/ChatComposer.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function harness({ mobile = false, composing = false, viewport = null, ...props } = {}) {
  const effects = [], layoutEffects = [], listeners = new Map();
  let sent = 0, changed, closed = 0, opened = 0;
  const viewportListeners = new Map(), screenProperties = new Map();
  const screen = { getBoundingClientRect: () => ({ top: 10 }), style: { setProperty: (name, value) => screenProperties.set(name, value), removeProperty: name => screenProperties.delete(name) } };
  const input = { scrollHeight: 42, style: {}, closest: () => viewport ? screen : null };
  const browserWindow = {
    innerWidth: mobile ? 375 : 1024,
    visualViewport: viewport ? { ...viewport, addEventListener: (name, callback) => viewportListeners.set(name, callback), removeEventListener: (name, callback) => { if (viewportListeners.get(name) === callback) viewportListeners.delete(name); } } : undefined,
    matchMedia: () => ({ matches: mobile }),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); }
  };
  const control = {
    panel: null, hasAttachment: false, prepareSend() {},
    composer: { isComposing: () => composing },
    closePanel: () => { closed++; }, toggleMore: () => { opened++; },
    setAttachmentPending() {}, ...props.control
  };
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: cjsModule.exports, module: cjsModule,
    window: browserWindow,
    require(name) {
      if (name === "react") return { useEffect: fn => effects.push(fn), useLayoutEffect: fn => layoutEffects.push(fn), useRef: value => ({current:value}) };
      if (name === "./ProductDecisionPages") return { ChatPlusPanel: "AttachmentPanel" };
      if (name === "./ChatIcon") return { ChatIcon: "Icon" };
      if (name === "./chat-stickers/EmojiDraftInput") return { EmojiDraftInput: "DraftInput" };
      if (name === "./chat-stickers/StickerChat") return { StickerToggle: "EmojiToggle", StickerTray: "EmojiTray" };
      return require(name);
    }
  });
  const render = (extra = {}) => cjsModule.exports.ChatComposer({
    value: "中文😀", onChange: value => { changed = value; }, onSend: () => { sent++; },
    inputRef: { current: input }, ...props, ...extra, control
  });
  function* nodes(node) {
    if (!React.isValidElement(node)) return;
    yield node;
    for (const child of React.Children.toArray(node.props.children)) yield* nodes(child);
  }
  const find = (tree, predicate) => { const node = [...nodes(tree)].find(predicate); assert.ok(node); return node; };
  return { render, find, input, effects, layoutEffects, listeners, browserWindow, viewportListeners, screenProperties, stats: () => ({ sent, changed, closed, opened }) };
}

const textarea = node => node.type === "DraftInput";
const sendButton = node => node.type === "button" && node.props.className === "chat-submit";

test("实际共用输入组件在中文候选、229 和 Shift+Enter 时不误发，桌面 Enter 才发送", () => {
  for (const props of [{}, { support: true, label: "输入客服问题", sendLabel: "发送客服问题" }]) {
    for (const state of ["native-composition", "legacy-229", "hook-composition", "shift", "ordinary-key", "enter"]) {
      const view = harness({ ...props, composing: state === "hook-composition" });
      const field = view.find(view.render(), textarea);
      let prevented = 0;
      field.props.onKeyDown({ key: state === "ordinary-key" ? "a" : "Enter", shiftKey: state === "shift", nativeEvent: { isComposing: state === "native-composition", keyCode: state === "legacy-229" ? 229 : 13 }, preventDefault() { prevented++; } });
      assert.equal(view.stats().sent, state === "enter" ? 1 : 0, state);
      assert.equal(prevented, state === "enter" ? 1 : 0, state);
      assert.equal(field.props.value, "中文😀");
      assert.equal(field.props.label, props.label ?? "输入文字消息");
    }
  }
});

test("实际手机输入保留 Enter 换行，发送按钮仍能调用真实 onSend 回调", () => {
  const view = harness({ mobile: true });
  const tree = view.render();
  let prevented = 0;
  view.find(tree, textarea).props.onKeyDown({ key: "Enter", nativeEvent: {}, preventDefault() { prevented++; } });
  assert.equal(view.stats().sent, 0);
  assert.equal(prevented, 0);
  assert.equal(view.find(tree, textarea).props.disabled, false);
  view.find(tree, sendButton).props.onClick();
  assert.equal(view.stats().sent, 1);
});

test("实际输入组件忙碌、无权限和空文本时禁用按钮且回调不产生发送副作用", () => {
  for (const props of [{ sending: true }, { disabled: true }, { value: "  \n " }]) {
    const view = harness(props), tree = view.render();
    if (!tree.props.children[0].props.children.some(node => node?.props?.className === "chat-submit")) {
      assert.equal(Boolean(props.value.trim()), false);
      view.find(tree, node => node.props["aria-label"] === "聊天更多功能");
      assert.equal(view.stats().sent, 0); continue;
    }
    const button = view.find(tree, sendButton);
    assert.equal(button.props.disabled, true);
    button.props.onClick();
    assert.equal(view.stats().sent, 0);
    assert.equal(Boolean(button.props["aria-busy"]), Boolean(props.sending));
    if (props.sending || props.disabled) assert.equal(view.find(tree, textarea).props.disabled, true);
  }
});

test("实际输入、切回键盘和附件面板不会丢失 Unicode 草稿或真实媒体 API 绑定", () => {
  const mediaApi = { upload: async () => { throw new Error("Must not upload during render"); } };
  const items = [{ id: "synthetic-order", kind: "ORDER" }];
  const view = harness({ control: { panel: "more", hasAttachment: true }, items, mediaApi });
  const tree = view.render(), field = view.find(tree, textarea);
  field.props.onChange("换行\n中文😀");
  field.props.onFocus();
  assert.equal(view.stats().changed, "换行\n中文😀");
  assert.equal(view.stats().closed, 1);
  const more = view.find(tree, node => node.props["aria-label"] === "聊天更多功能");
  assert.equal(more.props["aria-expanded"], true);
  more.props.onClick(); assert.equal(view.stats().opened, 1);
  const panel = view.find(tree, node => node.type === "AttachmentPanel");
  assert.equal(panel.props.api, mediaApi); assert.equal(panel.props.items, items); assert.equal(panel.props.open, true);
});

test("实际草稿退出保护仅在有文字或附件时注册，并在卸载时移除监听", () => {
  for (const props of [{ value: "" }, { value: "文字" }, { value: "", control: { hasAttachment: true } }]) {
    const view = harness(props); view.render();
    const cleanups = view.effects.map(effect => effect()).filter(Boolean);
    const expected = Boolean(props.value || props.control?.hasAttachment);
    assert.equal(view.listeners.has("beforeunload"), expected);
    if (expected) {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      view.listeners.get("beforeunload")(event);
      assert.equal(event.prevented, true);
      assert.equal(event.returnValue, "");
    }
    for (const cleanup of cleanups) cleanup();
    assert.equal(view.listeners.size, 0);
  }
});

test("实际多行编辑器高度有限，清空后恢复一行", () => {
  const editor = readFileSync(new URL("../app/chat-stickers/EmojiDraftInput.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(editor, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for (const [scrollHeight,height] of [[10,"44px"],[100,"100px"],[500,"118px"]]) {
    const layouts=[], refs=[], element={scrollHeight,style:{},text:""};
    const scope={exports:{},document:{activeElement:null},require(name){
      if(name === "react") return {useRef(value){const ref={current:value};refs.push(ref);return ref;},useCallback:fn=>fn,useEffect(){},useImperativeHandle(){},useLayoutEffect:fn=>layouts.push(fn)};
      if(name === "./emoji-editor-dom") return {draftText:el=>el.text,paintDraft:(el,text)=>{el.text=text;},selectDraft(){}};
      if(name === "./standard-emoji") return {};
      return require(name);
    }};
    vm.runInNewContext(code,scope);
    const render=value=>{layouts.length=0;refs.length=0;scope.exports.EmojiDraftInput({value,inputRef:{current:null},onChange(){}});refs[0].current=element;layouts.forEach(fn=>fn());};
    render("长消息");assert.equal(element.style.height,height);
    element.scrollHeight=10;render("");assert.equal(element.style.height,"44px");
  }
});

test("实际手机可视区缩小时更新会话高度，桌面和卸载时移除尺寸与监听", () => {
  const view = harness({ mobile: true, viewport: { height: 500, offsetTop: 0 } });
  view.render();
  const cleanups = view.effects.map(effect => effect()).filter(Boolean);
  assert.equal(view.screenProperties.get("--chat-available-height"), "490px");
  view.browserWindow.visualViewport.height = 300;
  view.viewportListeners.get("resize")();
  assert.equal(view.screenProperties.get("--chat-available-height"), "290px");
  view.browserWindow.innerWidth = 1024;
  view.listeners.get("resize")();
  assert.equal(view.screenProperties.has("--chat-available-height"), false);
  for (const cleanup of cleanups) cleanup();
  assert.equal(view.viewportListeners.size, 0);
  assert.equal(view.listeners.size, 0);
});

test("实际离开确认弹窗的 Escape 监听只在打开时生效，并在卸载时清理", () => {
  const modalSource = readFileSync(new URL("../app/chat-stickers/StickerChat.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(modalSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const open of [false, true]) {
    const effects = [], listeners = new Map(); let cancelled = 0;
    const cjsModule = { exports: {} };
    vm.runInNewContext(code, {
      module: cjsModule, exports: cjsModule.exports,
      document: { addEventListener: (name, fn) => { assert.equal(listeners.has(name), false, "不能重复注册 Escape 监听"); listeners.set(name, fn); }, removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } },
      require: name => name === "react" ? { useEffect: fn => effects.push(fn) } : name.startsWith(".") ? {} : require(name)
    });
    cjsModule.exports.StickerChatPreview({ control: { preview: null, exitRequest: open ? () => {} : null, cancelExit: () => { cancelled++; } } });
    const cleanups = effects.map(effect => effect()).filter(Boolean);
    assert.equal(listeners.has("keydown"), open);
    if (open) {
      listeners.get("keydown")({ key: "Enter" }); assert.equal(cancelled, 0);
      listeners.get("keydown")({ key: "Escape" }); assert.equal(cancelled, 1);
    }
    for (const cleanup of cleanups) cleanup();
    assert.equal(listeners.size, 0);
  }
});
