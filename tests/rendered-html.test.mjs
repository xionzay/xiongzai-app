import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 熊崽电竞 MVP experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /熊崽电竞/);
  assert.match(html, /买家 App \+ 陪玩中心/);
  assert.match(html, /查看全部 MVP 页面/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/);
});

test("contains all buyer and seller MVP route groups", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const buyerPages = [
    "splash", "auth", "profileSetup", "home", "search", "searchResults",
    "companion", "service", "specs", "favorites", "messages", "chat",
    "checkout", "payment", "paymentResult", "orders", "orderDetail",
    "refundApply", "refundDetail", "complaint", "review", "mine",
    "editProfile", "rules", "settings",
  ];
  const sellerPages = [
    "sellerApplyForm", "sellerApplyStatus", "seller", "sellerProfile",
    "sellerPublish", "sellerServices", "sellerServiceEdit", "sellerOrders",
    "sellerOrderDetail", "sellerEarnings", "incomeDetails", "withdraw", "withdrawals",
  ];
  for (const route of [...buyerPages, ...sellerPages]) {
    assert.match(page, new RegExp(`case "${route}"|page: "${route}"`), `missing route ${route}`);
  }
  assert.match(page, /买家端 25 页 · 陪玩中心 14 页/);
  assert.match(page, /支付成功/);
  assert.match(page, /投诉与平台介入/);
  assert.match(page, /收益提现/);
});

test("keeps the established brand assets and design tokens", async () => {
  const [css, layout] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /--orange:\s*#ff5a1f/);
  assert.match(css, /--lime:\s*#c7ef20/);
  assert.match(css, /--blue:\s*#4a9bea/);
  assert.match(css, /--violet:\s*#815ef4/);
  assert.match(css, /\.page-catalog-panel/);
  assert.match(layout, /熊崽电竞 · 和平精英陪玩交易/);
  await Promise.all([
    "xiongzai-logo.png", "xiongzai-icon.png", "home-hero.png", "product-hero.png",
    "icon-home.png", "icon-order.png", "icon-message.png", "icon-mine.png",
  ].map((name) => access(new URL(`../public/assets/${name}`, import.meta.url))));
});

test("includes the refined buyer and seller interactions", async () => {
  const [page, css, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /search-scope-select/);
  assert.match(page, /搜索陪玩昵称或ID/);
  assert.match(page, /refund-reason-menu/);
  assert.match(page, /服务已提交审核，可在审核中查看/);
  assert.match(page, /draft-box-fixed/);
  assert.match(page, /payment-account-switch/);
  assert.match(page, /EarningsPicker label="年份"/);
  assert.match(page, /EarningsPicker label="月份"/);
  assert.match(page, /EarningsPicker label="周次"/);
  assert.match(page, /预计 24h 内/);
  assert.match(css, /\.chat-messages \.message \{ align-items: center; \}/);
  assert.match(css, /\.profile-fields \.profile-nickname-field input[^}]+text-align: left/);
  assert.match(css, /\.income-filters button \{ height: 42px; font-size: 13px; \}/);
  assert.match(css, /\.buyer-assets \.nav-favorite::before/);
  assert.match(css, /\.product-hero \{ height: auto; aspect-ratio: 1 \/ 1; \}/);
  assert.match(css, /\.withdraw-record-list article b \{ font-size: 23px; \}/);
  assert.match(css, /--device-safe-top:\s*max\(env\(safe-area-inset-top, 0px\), 12px\)/);
  assert.match(css, /padding-bottom:\s*calc\(88px \+ var\(--device-safe-bottom\)\)/);
  assert.match(css, /\.bottom-nav \{[\s\S]*height:\s*calc\(86px \+ var\(--device-safe-bottom\)\)/);
  assert.match(layout, /viewportFit:\s*"cover"/);
});
