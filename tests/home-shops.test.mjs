import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { contractDependencies } from './helpers/commerce-contract.mjs';

async function compileModule(file, dependencies = contractDependencies) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const context = { exports: {}, require: name => {
    if (!(name in dependencies)) throw new Error(`Unstubbed dependency: ${name}`);
    return dependencies[name];
  }};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const decisions = await compileModule("../app/product-decisions.ts");
const model = await compileModule("../app/home-shop-model.ts", { "./product-decisions": decisions });
const productModel = await compileModule("../app/home-product-model.ts");
const shop = { id: "stable-seller-id", name: "店铺", image: "/original-avatar.jpg", tags: [], introduction: "认真沟通，耐心配合。" };

test("unknown counts and ratings never become zero, five stars or no reviews", () => {
  const facts = model.homeShopFacts({ ...shop, rating: "5.0" });
  assert.equal(facts.productText, undefined);
  assert.equal(facts.completedText, undefined);
  assert.equal(facts.hasRating, false);
  assert.equal(facts.ratingText, "评价暂不可用");
  for (const value of [undefined, null, -1, NaN, Infinity, 1.5, "0"]) {
    const invalid = model.homeShopFacts({ ...shop, completed: value, publicProductCount: value });
    assert.equal(invalid.productText, undefined);
    assert.equal(invalid.completedText, undefined);
  }
});
test("zero reviews override a stale average; completed orders retain their precise label", () => {
  const facts = model.homeShopFacts({ ...shop, reviewCount: 0, rating: "5.0", publicProductCount: 0, completed: 0 });
  assert.equal(facts.ratingText, "暂无评价");
  assert.equal(facts.hasRating, false);
  assert.equal(facts.productText, "0 件商品");
  assert.equal(facts.completedText, "已完成 0 单");
});
test("real ratings require a valid review count and an average within the five-point scale", () => {
  const facts = model.homeShopFacts({ ...shop, reviewCount: 27, rating: "4.82" });
  assert.equal(facts.ratingText, "4.8 分");
  assert.equal(facts.ratingDescription, "27 条评价");
  for (const rating of ["0", "6", "invalid", "Infinity"]) assert.equal(model.homeShopFacts({ ...shop, reviewCount: 27, rating }).hasRating, false);
});
test("main games never come from introduction, rank, service counts or a default game", () => {
  const facts = model.homeShopFacts({ ...shop, introduction: "和平精英高手，也喜欢王者荣耀", tags: ["技术型", "经典模式"] });
  assert.deepEqual(Array.from(facts.games), []);
});
test("explicit games are deduplicated and the seller introduction is neither rewritten nor repeated as a tag", () => {
  const row = { ...shop, tags: ["和平精英", "王者荣耀", "和平精英", "其他游戏"], introduction: "和平精英组队陪玩。认真报点。" };
  const before = JSON.stringify(row);
  const facts = model.homeShopFacts(row);
  assert.deepEqual(Array.from(facts.games), ["和平精英", "王者荣耀"]);
  assert.deepEqual(Array.from(facts.gameLabels), ["王者荣耀"]);
  assert.equal(facts.introduction, row.introduction);
  assert.equal(JSON.stringify(row), before);
});
test("partial catalog results cannot establish a total, including an apparent zero", () => {
  assert.equal(model.completePublicProductCounts([{ sellerId: "a" }], "next-page"), null);
  assert.equal(model.completePublicProductCounts([], undefined), null);
  const complete = model.completePublicProductCounts([{ sellerId: "a" }, { sellerId: "a" }, { sellerId: "b" }], null);
  assert.equal(complete.get("a"), 2);
  assert.equal(complete.get("b"), 1);
  assert.equal(complete.get("absent") ?? 0, 0);
});
test("recommendation preserves the existing order, and more only appears for actual additional content", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: i }));
  assert.deepEqual(Array.from(model.homeShopRecommendation(rows, false).items, row => row.id), [0, 1, 2, 3, 4, 5]);
  assert.equal(model.homeShopRecommendation(rows, false).hasMore, true);
  assert.equal(model.homeShopRecommendation(rows.slice(0, 6), false).hasMore, false);
  assert.equal(model.homeShopRecommendation(rows.slice(0, 6), true).hasMore, true);
  assert.equal(model.homeShopRecommendation([], false).hasMore, false);
});
test("pagination deduplicates by seller ID, preserving distinct shops with the same name and existing order", () => {
  const rows = model.mergeHomeShopPages([{ id: "a", name: "同名", completed: 1 }, { id: "b", name: "同名" }], [{ id: "a", name: "同名", completed: 2 }, { id: "c", name: "同名" }]);
  assert.deepEqual(Array.from(rows, row => row.id), ["a", "b", "c"]);
  assert.equal(rows[0].completed, 2);
});

const { HomeShopCard } = await compileModule("../app/HomeShopCard.tsx", {
  "react/jsx-runtime": await import("react/jsx-runtime"),
  "./home-shop-model": model,
  "./CatalogImage": { CatalogImage: props => React.createElement("img", Object.fromEntries(Object.entries(props).filter(([key]) => ["src", "alt", "className"].includes(key)))) },
});
test("shop identity shows explicit games beside the name even when the introduction includes them", () => {
  const markup = renderToStaticMarkup(HomeShopCard({ shop: { ...shop, tags: ["和平精英"], introduction: "和平精英组队陪玩。", reviewCount: 0 }, onOpen: () => {} }));
  assert.match(markup, /home-shop-identity[^]*home-shop-name[^]*home-shop-games[^]*和平精英/);
  assert.equal((markup.match(/class="home-shop-games"/g) || []).length, 1);
  assert.match(markup, /和平精英组队陪玩。/);
});
test("a whole native row opens the exact seller, keeps its original avatar and exposes the complete long name", () => {
  const long = { ...shop, name: "名称很长但详情必须显示完整的真实店铺名称", reviewCount: 0 };
  let opened;
  const card = HomeShopCard({ shop: long, onOpen: () => { opened = long.id; } });
  assert.equal(card.type, "button");
  card.props.onClick();
  assert.equal(opened, "stable-seller-id");
  const markup = renderToStaticMarkup(card);
  assert.match(markup, /src="\/original-avatar.jpg"/);
  assert.match(markup, /title="名称很长但详情必须显示完整的真实店铺名称"/);
  assert.doesNotMatch(markup, /件商品|已完成|性别|五星|5\.0/);
});

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "HomeScreen");
function homeHarness(preview = false) {
  const states = [], refs = [], effects = [];
  let stateIndex, refIndex, effectIndex;
  const noop = () => null;
  const fakeReact = { ...React };
  const source = ts.transpileModule(home.getText(ast), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const HomeScreen = vm.runInNewContext(`${source}\nHomeScreen;`, {
    setTimeout, React: fakeReact, ...model, ...productModel,
    useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useRef: initial => { const i = refIndex++; return refs[i] ??= { current: initial }; },
    useLayoutEffect: (fn, deps) => { const i = effectIndex++; if (!effects[i] || deps.some((dep, index) => dep !== effects[i].deps[index])) effects[i] = { fn, deps, pending: true }; },
    useSyncExternalStore: () => preview, useHomeModeMotion: noop,
    subscribeLocalPreview: noop, getLocalPreview: noop, getServerPreview: noop,
    previewCompanions: [shop], previewServices: [{ sellerId: shop.id, id: 'local-product', gameCategory: '和平精英', priceCent: '3000' }],
    publicGames: decisions.publicGames, PRODUCT_GAMES: decisions.PRODUCT_GAMES,
    HomeFeedFooter: noop, StatusBar: noop, CartoonIcon: noop, PublicAnnouncements: noop, apiRequest: noop,
    HomeShortcuts: noop, HomeHotSale: noop, LoadingState: noop, RequestErrorBear: noop,
    ContextStateScreen: noop, SectionTitle: noop, CompanionCard: noop, SortBar: noop,
    GameFilter: noop, HomeProductGameFilter: noop, HomeProductCard: noop, ServiceCard: noop, BuyerNav: noop, homeAnnouncements: [],
  });
  function render(props) {
    stateIndex = refIndex = effectIndex = 0;
    const tree = HomeScreen({ go: noop, notify: noop, onAnnouncementOpen: noop, ...props });
    tree.props.ref.current ??= { scrollTop: 0 };
    effects.forEach(effect => { if (effect.pending) { effect.pending = false; effect.fn(); } });
    return tree;
  }
  return { render, states, refs };
}
function* elements(node) {
  if (!React.isValidElement(node)) return;
  yield node;
  for (const child of React.Children.toArray(node.props.children)) yield* elements(child);
}
test("more opens the real shop mode at its own scroll position; returning restores recommendation scroll", () => {
  const harness = homeHarness();
  const props = { companionItems: Array.from({ length: 7 }, (_, i) => ({ ...shop, id: i })) };
  let tree = harness.render(props);
  harness.refs[0].current.scrollTop = 420;
  const section = [...elements(tree)].find(el => el.props.title === "热门店铺");
  section.props.onAction();
  tree = harness.render(props);
  assert.equal(harness.states[1], "店铺");
  assert.equal(harness.refs[0].current.scrollTop, 0);
  assert.ok([...elements(tree)].find(el => el.props["aria-label"] === "全部店铺"));
  harness.refs[0].current.scrollTop = 300;
  [...elements(tree)].find(el => el.type === "button" && el.props.children === "推荐").props.onClick();
  harness.render(props);
  assert.equal(harness.refs[0].current.scrollTop, 420);
});
test("complete preview has no fake more entry or sample-count message inside the phone", () => {
  const tree = homeHarness(true).render({});
  const section = [...elements(tree)].find(el => el.props.title === "热门店铺");
  assert.equal(section.props.action, undefined);
  assert.equal(section.props.onAction, undefined);
  assert.doesNotMatch(renderToStaticMarkup(tree), /样例店铺|已展示全部/);
});
test("pagination exposes the remaining cursor and blocks concurrent loads", async () => {
  const harness = homeHarness();
  let calls = 0;
  const props = { companionItems: [shop], hasMoreShops: true, onMoreShops: async () => { calls++; throw new Error("网络失败"); } };
  let tree = harness.render(props);
  const footer = [...elements(tree)].find(el => el.props.onLoadMore);
  assert.equal(footer.props.hasMore, true);
  await assert.rejects(footer.props.onLoadMore(), /网络失败/);
  assert.equal(calls, 1);
  tree = harness.render({ ...props, loadingMoreShops: true });
  assert.equal([...elements(tree)].find(el => el.props.onLoadMore).props.blocked, true);
});
test("loaded rows reveal in batches before requesting another cursor", async () => {
  const harness = homeHarness(); let calls = 0;
  const props = { companionItems: Array.from({length: 9}, (_, id) => ({...shop, id})), onMoreShops: async () => { calls++; } };
  let tree = harness.render(props);
  const shops = tree => [...elements(tree)].filter(el => el.props.companion);
  assert.equal(shops(tree).length, 6);
  await [...elements(tree)].find(el => el.props.onLoadMore).props.onLoadMore();
  tree = harness.render(props);
  assert.equal(shops(tree).length, 9);
  assert.equal(calls, 0);
  assert.equal([...elements(tree)].find(el => el.props.onLoadMore).props.hasMore, false);
});
test("product filtering distinguishes an empty game from an in-flight request or failure", () => {
  const harness = homeHarness();
  const props = { serviceItems: [{ id: 'one', gameCategory: '和平精英', priceCent: '3000' }] };
  let tree = harness.render(props);
  [...elements(tree)].find(el => el.type === 'button' && el.props.children === '商品').props.onClick();
  harness.states[0] = '无畏契约';
  tree = harness.render(props);
  assert.match(renderToStaticMarkup(tree), /该游戏暂无可展示商品/);
  for (const state of [{loading:true},{error:'网络失败'}]) {
    tree = harness.render({...props,...state});
    assert.doesNotMatch(renderToStaticMarkup(tree), /该游戏暂无可展示商品/);
  }
});
test("local preview empty-game feedback is not suppressed by unrelated API errors", () => {
  const harness = homeHarness(true);
  let tree = harness.render({});
  [...elements(tree)].find(el => el.type === 'button' && el.props.children === '商品').props.onClick();
  harness.states[0] = '无畏契约';
  assert.match(renderToStaticMarkup(harness.render({loading:true,error:'接口不可用'})), /该游戏暂无可展示商品/);
});
