import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isAllowedInternalRoute, resolveInternalReturnTo } from "../src/auth/return-to";

const source = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url).href), "utf8");
const ordersSource = source("../src/features/checkout/orders-screen.tsx");
const protectedTabSource = source("../src/features/auth/protected-tab.tsx");
const notificationsSource = source("../src/features/chat/notifications-screen.tsx");
const notificationDetailSource = source("../src/features/chat/notification-detail-screen.tsx");
const serviceCreateSource = source("../src/features/seller/seller-service-create-screen.tsx");
const sellerLayoutSource = source("../app/(seller-tabs)/_layout.tsx");

test("游客订单、我的和通知进入登录拦截而不是接口错误", () => {
  assert.match(ordersSource, /kind="empty" title="登录后查看订单"/u);
  assert.match(ordersSource, /actionLabel="去登录"/u);
  assert.match(protectedTabSource, /kind="empty" title="登录后查看"/u);
  assert.match(protectedTabSource, /actionLabel="去登录"/u);
  assert.match(notificationsSource, /const canRead = status === "authenticated" && Boolean\(user\)/u);
  assert.match(notificationsSource, /useNotifications\(canRead, polling && canRead, category\)/u);
  assert.match(notificationDetailSource, /useNotification\(id, canRead\)/u);
});

test("登录回跳只接受内部白名单并覆盖发布服务冷启动路径", () => {
  assert.equal(isAllowedInternalRoute("/seller/services/new"), true);
  assert.equal(resolveInternalReturnTo("/seller/services/new"), "/seller/services/new");
  assert.equal(resolveInternalReturnTo("https://evil.example/phish"), "/(buyer-tabs)");
  assert.equal(resolveInternalReturnTo("//evil.example/phish"), "/(buyer-tabs)");
});

test("反馈登录后回到原页面或关联反馈，拒绝非 UUID、重复或额外回跳参数", () => {
  const id = "01a172c1-9e61-71fc-bdfd-e72889d63d22";
  for (const route of ["/feedback", `/feedback?id=${id}`]) {
    assert.equal(isAllowedInternalRoute(route), true);
    assert.equal(resolveInternalReturnTo(route), route);
  }
  for (const route of [
    "/feedback?id=", "/feedback?id=unknown", "/feedback?id=https%3A%2F%2Fevil.example",
    `/feedback?id=${id}&id=${id}`, `/feedback?id=${id}&next=home`,
    "/feedback?next=home", `/feedback?id=${id}#other`, "//feedback", "/feedback/other"
  ]) {
    assert.equal(isAllowedInternalRoute(route), false, route);
    assert.equal(resolveInternalReturnTo(route), "/(buyer-tabs)", route);
  }
});

test("发布服务冷启动返回、权限失败和登录恢复均有安全出口", () => {
  assert.match(serviceCreateSource, /router\.canGoBack\(\)/u);
  assert.match(serviceCreateSource, /router\.replace\("\/\(seller-tabs\)\/services"\)/u);
  assert.match(serviceCreateSource, /bootstrapError/u);
  assert.match(serviceCreateSource, /actionLabel="重试"/u);
  assert.match(serviceCreateSource, /seller\.error instanceof ApiClientError && seller\.error\.code === "SELLER_NOT_FOUND"/u);
  assert.match(sellerLayoutSource, /bootstrapError/u);
  assert.match(sellerLayoutSource, /retryBootstrap/u);
});
