import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { contractDependencies } from './helpers/commerce-contract.mjs';

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const chatCss = await readFile(new URL("../app/chat-redesign.css", import.meta.url), "utf8");
const source = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// Exercise the real presentational components without mounting the app or calling its APIs.
const componentNames = new Set(["Header", "IconButton", "MineScreen", "SectionTitle"]);
const components = source.statements.filter((node) => ts.isFunctionDeclaration(node) && componentNames.has(node.name?.text));
assert.equal(components.length, componentNames.size);
const compiled = ts.transpileModule(components.map((node) => node.getText(source)).join("\n"), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commerceSource = await readFile(new URL("../app/commerce-model.ts", import.meta.url),"utf8");
const commerceContext={exports:{},require:name=>contractDependencies[name]};
vm.runInNewContext(ts.transpileModule(commerceSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,commerceContext);
const stub = () => null;
const chatHeaderSource = await readFile(new URL("../app/ChatHeader.tsx", import.meta.url), "utf8");
const chatHeaderContext = { exports: {}, React, require: (name) => {
  if (name === "react") return React;
  if (name === "./ChatIcon") return { ChatIcon: stub };
  throw new Error(`Unexpected chat header dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(chatHeaderSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText, chatHeaderContext);
const { ChatHeader } = chatHeaderContext.exports;
const iconContext={exports:{},React};
const iconSource=await readFile(new URL("../app/ui/CartoonIcon.tsx",import.meta.url),"utf8");
vm.runInNewContext(ts.transpileModule(iconSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,iconContext);
const { Header, MineScreen } = vm.runInNewContext(`${compiled}\n({ Header, MineScreen });`, {
  React, creamJellyIconUrl:iconContext.exports.creamJellyIconUrl, JellyLabel:iconContext.exports.JellyLabel, BuyerIdentity: stub, apiRequest: stub, mineOrderIcon: {}, buyerOrderEntries: commerceContext.exports.buyerOrderEntries, StatusBar: stub, CartoonIcon: stub, Avatar: stub, AppIcon: stub, BuyerNav: stub, companions: [{}], DEFAULT_PLAYER_IMAGE: "/assets/placeholders/player.svg",
});

function* elements(node) {
  if (!React.isValidElement(node)) return;
  yield node;
  for (const child of React.Children.toArray(node.props.children)) yield* elements(child);
}

test("ordinary headers omit visible page titles and descriptions while keeping actions", () => {
  let backCount = 0;
  const header = Header({ title: "我的", subtitle: "个人资料与常用功能", back: () => backCount++, actions: React.createElement("button", { type: "button" }, "设置") });
  const markup = renderToStaticMarkup(header);
  assert.doesNotMatch(markup, /<h1|<p[\s>]|个人资料与常用功能/);
  assert.match(markup, /aria-label="我的"/);
  assert.match(markup, /aria-label="返回"/);
  assert.match(markup, />设置<\/button>/);
  const back = [...elements(header)].find((element) => element.props.label === "返回");
  back.props.onClick();
  assert.equal(backCount, 1);
});

test("headers with no controls collapse and dedicated chat identity stays available", () => {
  const plain = renderToStaticMarkup(Header({ title: "消息", subtitle: "说明" }));
  assert.match(plain, /page-toolbar-empty/);
  assert.doesNotMatch(plain, /<h1|<p[\s>]/);
  const identity = renderToStaticMarkup(Header({ title: "平台客服", subtitle: "等待客服接入", variant: "identity" }));
  assert.match(identity, /<h1>平台客服<\/h1>/);
  assert.match(identity, /<p>等待客服接入<\/p>/);
  assert.doesNotMatch(identity, /page-toolbar/);
  assert.equal((page.match(/<ChatHeader\s/g) || []).length, 2);
  const chat = renderToStaticMarkup(React.createElement(ChatHeader, {
    title: "平台客服", subtitle: "等待客服接入", avatar: React.createElement("img", { src: "/local-test.png", alt: "客服头像" }),
    onBack() {}, actions: [{ label: "客服记录", onClick() {} }],
  }));
  assert.match(chat, /class="screen-header chat-navigation"/);
  assert.match(chat, /<h1 title="平台客服">平台客服<\/h1>/);
  assert.match(chat, /<p>等待客服接入<\/p>/);
  assert.match(chat, /alt="客服头像"/);
  assert.match(chat, /aria-label="返回消息列表"/);
  assert.match(chat, /<summary aria-label="会话更多功能"/);
  assert.match(chat, />客服记录<\/button>/);
  assert.doesNotMatch(chat, /page-toolbar/);
  const longTitle = "本地测试长会话名称".repeat(20);
  const longChat = renderToStaticMarkup(React.createElement(ChatHeader, { title: longTitle, onBack() {} }));
  assert.ok(longChat.includes(`title="${longTitle}"`));
  assert.ok(longChat.includes(`>${longTitle}</h1>`));
  assert.doesNotMatch(longChat, /<summary|<p>/);
});

test("the entire avatar, nickname and ID card opens edit profile using a native button", () => {
  const destinations = [];
  const screen = MineScreen({ go: (page) => destinations.push(page), viewer: { profile: { nickname: "测试玩家", public_user_no: "12345", avatar_file_id: "viewer-avatar" } } });
  const card = [...elements(screen)].find((element) => element.props.className === "mine-profile mine-profile-edit");
  assert.ok(card);
  const avatar = [...elements(card)].find((element) => element.props.companion);
  assert.equal(avatar.props.companion.avatarFileId, "viewer-avatar");
  assert.equal(avatar.props.companion.online, false);
  assert.equal(card.type, "button");
  assert.equal(card.props.type, "button");
  assert.equal(card.props["aria-label"], "编辑个人资料");
  const markup = renderToStaticMarkup(card);
  assert.match(markup, /测试玩家/);
  assert.match(markup, /账号：12345/);
  assert.equal([...elements(card)].filter((element) => element.type === "button").length, 1);
  card.props.onClick();
  assert.deepEqual(destinations, ["editProfile"]);
  assert.match(css, /\.phone-shell \.mine-profile-edit\s*\{[^}]*width: calc\(100% - 28px\);[^}]*text-align: left;[^}]*cursor: pointer;/);
});

function toolbarRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g"))];
  assert.equal(matches.length, 1, `expected one shared rule for ${selector}`);
  return matches[0][1];
}

test("orders and profile explicitly opt into centered titles; inbox owns its header", () => {
  for (const [componentName, title] of [["MineScreen", "我的"], ["OrdersScreen", "我的订单"], ["NotificationsScreen", "官方通知"]]) {
    const component = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === componentName);
    assert.ok(component);
    assert.ok(component.getText(source).includes(`<Header variant="centered" title="${title}"`));
    const header = Header({ title, variant: "centered", subtitle: "不展示的说明" });
    const markup = renderToStaticMarkup(header);
    assert.match(markup, new RegExp(`<h1>${title}</h1>`));
    assert.doesNotMatch(markup, /page-toolbar-empty|不展示的说明/);
    assert.deepEqual(React.Children.toArray(header.props.children).map((child) => child.type), ["div", "h1", "div"]);
  }
  assert.equal((page.match(/<Header variant="centered"/g) || []).length, 3);
});

test("centered titles keep their centerline and usable right action without duplicate safe-area padding", () => {
  let refreshed = 0;
  const header = Header({ title: "我的订单", variant: "centered", actions: React.createElement("button", { type: "button", onClick: () => refreshed++ }, "刷新") });
  const action = [...elements(header)].find((element) => element.type === "button");
  assert.ok(action);
  action.props.onClick();
  assert.equal(refreshed, 1);
  const rule = toolbarRule(".phone-shell .app-screen .screen-header.page-titlebar");
  assert.match(rule, /grid-template-columns:\s*44px minmax\(0, 1fr\) 44px;/);
  assert.match(rule, /min-height:\s*52px;/);
  assert.match(rule, /padding:\s*0 calc\(14px \+ var\(--device-safe-right\)\) 8px calc\(14px \+ var\(--device-safe-left\)\);/);
  assert.doesNotMatch(rule, /var\(--device-safe-top\)/);
  assert.match(toolbarRule(".page-titlebar > h1"), /margin: 0;[^}]*text-align: center;/);
});

test("ordinary toolbars keep 44px targets and 8px spacing without a second top safe area", () => {
  const toolbar = toolbarRule(".phone-shell .app-screen .screen-header.page-toolbar");
  assert.match(toolbar, /min-height:\s*52px;/);
  assert.match(toolbar, /padding:\s*0 calc\(14px \+ var\(--device-safe-right\)\) 8px calc\(14px \+ var\(--device-safe-left\)\);/);
  assert.doesNotMatch(toolbar, /var\(--device-safe-top\)/);
  const button = toolbarRule(".phone-shell .app-screen .page-toolbar .icon-button");
  for (const property of ["width", "min-width", "height"]) {
    assert.match(button, new RegExp(`${property}:\\s*44px;`));
  }
  // The outer screen must still own the notch/cutout inset, including real mobile insets.
  assert.match(css, /\.app-screen\s*\{\s*padding-top:\s*var\(--device-safe-top\)!important;/);
  assert.match(css, /--device-safe-top:\s*32px;/);
  assert.match(css, /--device-safe-top:\s*max\(env\(safe-area-inset-top, 0px\), 12px\);/);
});

test("empty toolbars have zero height, zero minimum height and zero padding", () => {
  const empty = toolbarRule(".phone-shell .app-screen .screen-header.page-toolbar-empty");
  for (const property of ["min-height", "height", "padding"]) {
    assert.match(empty, new RegExp(`${property}:\\s*0;`));
  }
  assert.doesNotMatch(empty, /var\(--device-safe-top\)/);
});

test("back-only, actions-only and combined toolbars do not collapse or lose callbacks", () => {
  for (const [hasBack, hasAction] of [[true, false], [false, true], [true, true]]) {
    const calls = [];
    const header = Header({
      title: "操作栏",
      back: hasBack ? () => calls.push("back") : undefined,
      actions: hasAction ? React.createElement("button", { type: "button", onClick: () => calls.push("action") }, "设置") : undefined,
    });
    assert.equal(header.props.className, "screen-header page-toolbar");
    for (const element of elements(header)) element.props.onClick?.();
    assert.deepEqual(calls, [...(hasBack ? ["back"] : []), ...(hasAction ? ["action"] : [])]);
  }
});

test("chat and support retain their independently owned safe area outside ordinary toolbars", () => {
  assert.doesNotMatch(chatCss, /page-toolbar/);
  assert.match(chatCss, /\.phone-shell \.chat-screen,\s*\.phone-shell \.customer-service-screen\s*\{[^}]*padding:\s*0 !important;/);
  const top = chatCss.match(/\.phone-shell \.chat-screen \.chat-topbar,\s*\.phone-shell \.customer-service-screen \.chat-topbar\s*\{([^}]+)\}/)?.[1];
  const bottom = chatCss.match(/\.phone-shell \.chat-screen \.chat-compose-dock,\s*\.phone-shell \.customer-service-screen \.chat-compose-dock\s*\{([^}]+)\}/)?.[1];
  assert.ok(top, "both chat headers must share safe-area ownership");
  assert.ok(bottom, "both chat composers must share safe-area ownership");
  for (const [rule, edge] of [[top, "top"], [bottom, "bottom"]]) {
    for (const side of [edge, "left", "right"]) {
      const inset = rule.match(new RegExp(`calc\\((\\d+)px \\+ var\\(--device-safe-${side}\\)\\)`));
      assert.ok(inset, `missing ${side} safe area`);
      assert.ok(Number(inset[1]) > 0, `${side} safe area needs positive base spacing`);
    }
  }
});


test("profile shortcuts use current navigation groups including review without rewriting historical statuses", () => {
  const targets = [];
  const modern = MineScreen({ go() {}, onOrders: filter => targets.push(filter), viewer: { profile: { public_user_no: "LOCAL-TEST" } }, v31: true });
  const modernMarkup = renderToStaticMarkup(modern);
  assert.match(modernMarkup, /待服务/);
  assert.match(modernMarkup, /待收货/);
  assert.doesNotMatch(modernMarkup, /LOCAL-TEST|待接单|待确认/);
  const shortcut = [...elements(modern)].find(element => element.type === "button" && renderToStaticMarkup(element).includes("待收货"));
  shortcut.props.onClick();
  assert.deepEqual(targets, ["待收货"]);
  const legacy = renderToStaticMarkup(MineScreen({ go() {}, onOrders() {}, viewer: null, v31: false }));
  assert.match(legacy, /待服务/);
  assert.match(legacy, /待收货/);
  assert.match(legacy, /待评价/);
});


test("mine consolidates profile/settings while account links and unauthenticated guards remain reachable", () => {
  const calls = [];
  const screen = MineScreen({ go: p => calls.push(p), viewer: { id: 'buyer', profile: { nickname: '买家' } }, unreadCount: 7 });
  const markup = renderToStaticMarkup(screen);
  assert.doesNotMatch(markup, /文字消息|设置与隐私|陪玩身份申请入口|0 张可用/);
  assert.match(markup, /前往领券中心/);
  assert.equal((markup.match(/aria-label="编辑个人资料"/g) ?? []).length, 1);
  for (const label of ['我的收藏', '优惠券', '消息', '平台规则', '平台客服']) {
    const row = [...elements(screen)].find(e => e.type === 'button' && renderToStaticMarkup(e).includes(label));
    row.props.onClick();
  }
  assert.deepEqual(calls, ['favorites', 'coupons', 'messages', 'rules', 'customerService']);
  const signedOut = MineScreen({ go: p => calls.push(p), viewer: null });
  [...elements(signedOut)].find(e => e.props['aria-label'] === '登录账号').props.onClick();
  assert.equal(calls.at(-1), 'auth');
  assert.doesNotMatch(renderToStaticMarkup(signedOut), /10086|熊崽玩家 K|条未读/);
});

test("mine all-orders entry opens all statuses and guards signed-out buyers", () => {
  const filters = [], destinations = [];
  for (const viewer of [{ id: 'buyer', profile: {} }, null]) {
    const screen = MineScreen({ viewer, onOrders: filter => filters.push(filter), go: target => destinations.push(target) });
    const entries = [...elements(screen)].filter(element => element.props['aria-label'] === '全部订单');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, 'button');
    assert.equal(entries[0].props.type, 'button');
    const row = [...elements(screen)].find(element => element.props.className === 'commerce-order-entries');
    const buttons = [...elements(row)].filter(element => element.type === 'button');
    assert.equal(buttons[0].props['aria-label'], '全部订单');
    assert.match(renderToStaticMarkup(buttons[1]), /待付款/);
    entries[0].props.onClick();
  }
  assert.deepEqual(filters, ['全部']);
  assert.deepEqual(destinations, ['auth']);
});

test("mine remembers its own scroll without capturing nested scrollers", () => {
  let current = 0; const scrollState = { read: () => current, write: value => { current = value; } };
  const screen = MineScreen({ go() {}, viewer: null, scrollState });
  const screenNode = { scrollTop: 140 };
  screen.props.onScroll({ target: screenNode, currentTarget: screenNode });
  assert.equal(scrollState.read(), 140);
  screen.props.onScroll({ target: {}, currentTarget: { scrollTop: 0 } });
  assert.equal(scrollState.read(), 140);
  const remount = MineScreen({ go() {}, viewer: null, scrollState });
  const restored = { scrollTop: 0 };
  remount.props.ref(restored);
  assert.equal(restored.scrollTop, 140);
});
