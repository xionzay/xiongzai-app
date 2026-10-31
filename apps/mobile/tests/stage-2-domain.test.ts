import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSearchPath, buildSortedSearchPath, consumePendingIntent, flattenUniqueById, getSearchSnapshot, isServerKeywordSupported, isServerSortSupported, purchaseBlock, saveSearchSnapshot, searchQueryKey, setPendingIntent, sortSupportedForKind } from "../src/features/discovery/discovery-domain";
import { optimisticFavorites } from "../src/features/favorites/favorites-domain";
import { resolveInternalReturnTo } from "../src/auth/return-to";
import type { ServiceDetailApiView } from "../src/types/api";

const serviceDetailSource = readFileSync(fileURLToPath(new URL("../src/features/discovery/service-detail-screen.tsx", import.meta.url).href), "utf8");

const service = (overrides: Partial<ServiceDetailApiView> = {}): ServiceDetailApiView => ({
  id: "p1", seller_id: "s1", title: "王牌陪玩", description: "服务说明文字", service_time_description: "提前预约", cover_file_id: null,
  min_price_cent: "1200", sold_count: 9, rating_avg: "4.90", review_count: 2, status: "ON_SALE", version: 1, images: [],
  skus: [{ id: "sku1", product_id: "p1", sku_name: "一小时", description: null, price_cent: "1200", duration_minutes: 60, status: "ACTIVE", sort_order: 0, version: 1 }],
  seller: { id: "s1", user_id: "seller-user", status: "APPROVED", seller_nickname: "小熊", seller_avatar_file_id: null, cover_file_id: null, introduction: null, game_rank: null, preferred_mode: null, play_style: null, accepting_orders: true, rating_avg: "4.90", review_count: 2, completed_order_count: 9, favorite_count: 3, version: 1 },
  ...overrides
});

test("搜索只发送后端支持的参数并原样携带签名 Cursor", () => {
  assert.equal(buildSearchPath({ kind: "services", keyword: " 上分 ", cursor: "signed+/=" }), "/services?limit=20&cursor=signed%2B%2F%3D&keyword=%E4%B8%8A%E5%88%86");
  assert.equal(buildSearchPath({ kind: "companions", keyword: "小熊" }), "/companions?limit=20&keyword=%E5%B0%8F%E7%86%8A");
  assert.equal(buildSortedSearchPath({ kind: "services", keyword: "上分", sort: "price_desc" }), "/services?limit=20&keyword=%E4%B8%8A%E5%88%86&sort=price_desc");
  assert.equal(isServerKeywordSupported("services"), true);
  assert.equal(isServerKeywordSupported("companions"), true);
  assert.equal(isServerSortSupported("comprehensive"), true);
  assert.equal(isServerSortSupported("sales"), true);
  assert.equal(sortSupportedForKind("companions", "price_asc"), false);
  assert.equal(sortSupportedForKind("services", "price_asc"), true);
});

test("快速切换搜索词形成不同 Query Key，旧结果不会覆盖新结果", () => {
  assert.notDeepEqual(searchQueryKey("services", "上分"), searchQueryKey("services", "护航"));
  assert.notDeepEqual(searchQueryKey("services", "上分", "sales"), searchQueryKey("services", "上分", "price_asc"));
  assert.deepEqual(searchQueryKey("services", " 上分 "), ["discovery", "services", "上分", "comprehensive"]);
});

test("Cursor 多页合并按资源 ID 去重", () => {
  assert.deepEqual(flattenUniqueById([{ items: [{ id: "1" }, { id: "2" }] }, { items: [{ id: "2" }, { id: "3" }] }]).map((item) => item.id), ["1", "2", "3"]);
});

test("搜索条件、分类、排序和滚动位置可恢复", () => {
  saveSearchSnapshot({ keyword: "上分", kind: "services", sort: "comprehensive", scrollOffset: 428 }, "test");
  assert.deepEqual(getSearchSnapshot("test"), { keyword: "上分", kind: "services", sort: "comprehensive", scrollOffset: 428 });
});

test("不可购买状态矩阵由真实服务、陪玩、SKU、时段与用户数据计算", () => {
  assert.equal(purchaseBlock(service(), [{ id: "a", starts_at: "2026-08-22", ends_at: "2026-08-22", status: "OPEN", version: 1 }]), null);
  assert.equal(purchaseBlock(service({ status: "OFF_SALE" }), []), "SERVICE_UNAVAILABLE");
  assert.equal(purchaseBlock(service({ seller: { ...service().seller, accepting_orders: false } }), []), "SELLER_PAUSED");
  assert.equal(purchaseBlock(service({ skus: [] }), []), "NO_SKU");
  assert.equal(purchaseBlock(service(), [], "seller-user"), "OWN_SERVICE");
  assert.equal(purchaseBlock(service(), []), "NO_AVAILABILITY");
});

test("游客收藏意图仅由目标详情消费一次", () => {
  setPendingIntent({ kind: "favorite", targetType: "PRODUCT", targetId: "p1", returnTo: "/services/p1" });
  assert.equal(consumePendingIntent("SELLER", "s1"), null);
  assert.equal(consumePendingIntent("PRODUCT", "p1")?.returnTo, "/services/p1");
  assert.equal(consumePendingIntent("PRODUCT", "p1"), null);
});

test("首次注册资料初始化后只允许返回 App 内部原页面", () => {
  assert.equal(resolveInternalReturnTo("/services/p1"), "/services/p1");
  assert.equal(resolveInternalReturnTo("/companions/seller-1/reviews"), "/companions/seller-1/reviews");
  assert.equal(resolveInternalReturnTo("/checkout/schedule?productId=p1&skuId=s1"), "/checkout/schedule?productId=p1&skuId=s1");
  assert.equal(resolveInternalReturnTo("/checkout/confirm?productId=p1&skuId=s1&slotId=t1&startsAt=2026-08-22T12%3A00%3A00.000Z"), "/checkout/confirm?productId=p1&skuId=s1&slotId=t1&startsAt=2026-08-22T12%3A00%3A00.000Z");
  assert.equal(resolveInternalReturnTo("https://evil.example"), "/(buyer-tabs)");
  assert.equal(resolveInternalReturnTo("xiongzai://orders/1"), "/(buyer-tabs)");
  assert.equal(resolveInternalReturnTo("//evil.example"), "/(buyer-tabs)");
  assert.equal(resolveInternalReturnTo("/unknown-page"), "/(buyer-tabs)");
  assert.equal(resolveInternalReturnTo("/%2f%2fevil.example"), "/(buyer-tabs)");
  assert.equal(resolveInternalReturnTo("/checkout/schedule?productId=p1"), "/(buyer-tabs)");
  assert.equal(resolveInternalReturnTo("/checkout/schedule?productId=p1&skuId=s1&next=https%3A%2F%2Fevil.example"), "/(buyer-tabs)");
});

test("收藏乐观更新支持添加、删除，调用方可用原快照回滚", () => {
  const original = [{ id: "f1", target_type: "SELLER" as const, seller_id: "s1", product_id: null, created_at: "2026-01-01" }];
  const added = optimisticFavorites(original, "PRODUCT", "p1", false);
  assert.equal(added[0]?.product_id, "p1");
  assert.deepEqual(optimisticFavorites(original, "SELLER", "s1", true), []);
  assert.deepEqual(original, [{ id: "f1", target_type: "SELLER", seller_id: "s1", product_id: null, created_at: "2026-01-01" }]);
});

test("服务详情按最新 UI 使用全宽主图、规格弹窗、店铺入口和四段底部操作", () => {
  assert.match(serviceDetailSource, /aspectRatio: 1/u);
  for (const label of ["商品详情", "服务说明", "商品评价", "平台保障", "在线接单", "店铺", "客服", "立即购买"]) assert.match(serviceDetailSource, new RegExp(label, "u"));
  assert.match(serviceDetailSource, /sheetOpen \? <PurchaseSpecSheet/u);
  assert.match(serviceDetailSource, /skus=\{activeSkus\}/u);
  assert.doesNotMatch(serviceDetailSource, /activeSkus\.map/u);
  assert.match(serviceDetailSource, /resizeMode="contain"/u);
  assert.match(serviceDetailSource, /appearance="service-action"/u);
  assert.match(serviceDetailSource, /createConsultation\(service\.id\)/u);
  assert.match(serviceDetailSource, /\/checkout\/schedule/u);
  assert.match(serviceDetailSource, /purchaseBlock\(service, availability\.data/u);
  assert.doesNotMatch(serviceDetailSource, /Kirito|经典模式单排一局|每天 08:00|可约时间|未来 14 天/u);
});
