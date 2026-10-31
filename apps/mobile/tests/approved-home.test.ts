import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { catalogItems, catalogPath, offersCompanion, shopFacts } from "../src/features/home/home-domain";
import type { CompanionApiView } from "../src/types/api";
import { hotItemWidth } from "../src/theme/approved-layout";

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const shop = { id: "shop-test", seller_nickname: "本地测试", introduction: "可以提供陪玩", main_games: ["DELTA_FORCE"], rating_avg: "5.00", review_count: 0, completed_order_count: 0 } as CompanionApiView;
test("首页空响应不会回退样例，游标分页去重且保持服务端排序", () => {
  assert.deepEqual(catalogItems(), []);
  assert.deepEqual(catalogItems([{ items: [], next_cursor: null }]), []);
  assert.deepEqual(catalogItems([{ items: [{ id: "b" }, { id: "a" }], next_cursor: "next" }, { items: [{ id: "a" }, { id: "c" }], next_cursor: null }]).map(item => item.id), ["b", "a", "c"]);
});
test("排序、游戏和游标传给真实 API；店铺不误传商品筛选", () => {
  const path = new URL(`http://local.test${catalogPath("services", "price_desc", "DELTA_FORCE", "cursor&x")}`);
  assert.equal(path.searchParams.get("sort"), "price_desc"); assert.equal(path.searchParams.get("game"), "DELTA_FORCE"); assert.equal(path.searchParams.get("cursor"), "cursor&x");
  assert.ok(!catalogPath("companions", "rating", "DELTA_FORCE").includes("game="));
});
test("店铺未知商品数不伪装为零；无评价不伪装成五分", () => {
  assert.equal(shopFacts(shop).productCount, null); assert.equal(shopFacts(shop).rating, "暂无评价");
  assert.deepEqual(shopFacts(shop).games, ["三角洲行动"]);
  assert.equal(shopFacts({ ...shop, public_product_count: 0 }).productCount, "0 件商品");
  assert.equal(shopFacts({ ...shop, public_product_count: 37 }).productCount, "37 件商品");
});
test("快速匹配只展示真实主营游戏且明确提供陪玩的店铺", () => {
  assert.equal(offersCompanion(shop, "DELTA_FORCE"), true);
  assert.equal(offersCompanion(shop, "PEACE_ELITE"), false);
  for (const introduction of ["不提供陪玩", "不接陪玩", "不做陪玩", "没有陪玩", "商品代练"]) assert.equal(offersCompanion({ ...shop, introduction }, "DELTA_FORCE"), false);
});

function renderHome(online: boolean, rows: { items: unknown[]; next_cursor: string | null }[], failed = false, pending = false) {
  const require = createRequire(import.meta.url);
  const calls: string[] = [];
  const context = { exports: {} as { HomeScreen(): unknown }, requestAnimationFrame: (fn: () => void) => fn(), require: (name: string) => {
    if (name === "react") return { useState: (initial: unknown) => [initial, () => {}], useRef: () => ({ current: {} }) };
    if (name === "react-native") return { useWindowDimensions: () => ({ width: 375, fontScale: 1 }), Image: "Image", Pressable: "Pressable", RefreshControl: "RefreshControl", ScrollView: "ScrollView", Text: "Text", View: "View", StyleSheet: { create: (x: unknown) => x } };
    if (name === "expo-router") return { router: { push: (path: string) => calls.push(path) } };
    if (name === "react-native-safe-area-context") return { SafeAreaView: "SafeAreaView" };
    if (name.endsWith("home-api")) return { useCatalog: () => ({ data: { pages: rows }, isError: failed, isPending: pending, refetch: () => calls.push("retry"), hasNextPage: false }) };
    if (name.endsWith("home-domain")) return { catalogItems };
    if (name.endsWith("use-online-status")) return { useOnlineStatus: () => online };
    if (name.endsWith("theme/tokens")) return { colors: {} };
    if (name.endsWith("theme/approved-layout")) return { hotItemWidth };
    if (name.endsWith("utils/money")) return { formatCent: () => "¥0.00" };
    if (name.endsWith(".png")) return name;
    if (name.startsWith("@/components/") || name.endsWith("catalog-card") || name.endsWith("home-announcements")) return new Proxy({}, { get: (_obj, key) => key });
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(source("src/features/home/catalog-home-screen.tsx"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const nodes: { type: unknown; props: Record<string, unknown> }[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const node = value as typeof nodes[number]; nodes.push(node);
    if (typeof node.type === "function") visit(node.type(node.props)); else visit(node.props.children);
  };
  visit(context.exports.HomeScreen());
  return { nodes, calls, text: nodes.filter(node => node.type === "Text").map(node => node.props.children).join(" ") };
}
test("真实首页组件空数组显示空状态和五个已确认入口，不生成业务卡片", () => {
  const view = renderHome(true, [{ items: [], next_cursor: null }]);
  assert.match(view.text, /暂无可展示店铺/); assert.doesNotMatch(view.text, /1234|本地测试陪玩|AndroidTest/);
  assert.match(view.text, /暂无可展示商品/);
  const loading = renderHome(true, [], false, true);
  assert.match(loading.text, /正在加载熊崽热卖/); assert.doesNotMatch(loading.text, /暂无可展示/);
  for (const label of ["快速匹配", "领券中心", "平台规则", "意见反馈", "官方通知"]) {
    const node = view.nodes.find(item => item.props.accessibilityLabel === label)!; assert.ok(node); (node.props.onPress as () => void)();
  }
  assert.deepEqual(view.calls, ["/quick-match", "/coupons", "/rules", "/feedback", "/notifications"]);
});
test("真实首页组件失败和离线保留明确重试，不冒充成功空数据", () => {
  const failed = renderHome(true, [], true); assert.match(failed.text, /加载失败/); assert.doesNotMatch(failed.text, /暂无可展示/);
  const retry = failed.nodes.find(node => node.type === "Pressable" && (node.props.children as { props?: { children?: string } })?.props?.children === "重新加载")!;
  assert.ok(retry); (retry.props.onPress as () => void)(); assert.equal(failed.calls[0], "retry");
  assert.match(renderHome(false, []).text, /当前离线/);
});
test("原版图标与 Web 源素材完全相同；不引用固定在线人数 banner", () => {
  for (const file of ["cartoon-icons-v1.png", "shortcuts/quick-match.png", "shortcuts/coupon-center.png", "shortcuts/app-rules.png", "shortcuts/feedback.png", "shortcuts/official-notices.png"]) {
    const native = readFileSync(new URL(`../assets/approved-ui/${file}`, import.meta.url));
    const web = readFileSync(new URL(`../../../public/assets/${file.replace("shortcuts/", "home-shortcuts/")}`, import.meta.url));
    assert.equal(createHash("sha256").update(native).digest("hex"), createHash("sha256").update(web).digest("hex"));
  }
  assert.doesNotMatch(source("src/features/home/catalog-home-screen.tsx"), /home-hero|1234|在线人数/);
  assert.match(source("src/features/home/home-api.ts"), /useInfiniteQuery/);
});
test("领券仍未开放；反馈已有独立 API，路由按账号挂载真实页面", () => {
  const feedback = source("app/feedback.tsx"); assert.match(feedback, /FeedbackScreen key=\{user.id\}/); assert.match(feedback, /authenticated/);
  assert.match(source("app/coupons.tsx"), /未开放|未接通/);
});
