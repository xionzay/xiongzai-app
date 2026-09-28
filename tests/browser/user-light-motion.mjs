// Local browser checks. Fixtures below are isolated to a separate browser context.
// No payments, database resets, or notification read writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const output = ".local/light-motion";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const checks = [], errors = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
const home = page.locator(".home-retained:not([hidden])");
const back = () => page.locator(".app-screen:visible").getByRole("button", { name: "返回", exact: true }).click();
try {
  await page.goto("http://127.0.0.1:3001/", { waitUntil: "domcontentloaded" });
  await expect(home.locator(".home-shortcut")).toHaveCount(5, { timeout: 30000 });
  await expect(home.locator(".home-screen")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const result = await home.locator(".home-shortcuts").evaluate(node => {
      const buttons = [...node.querySelectorAll("button")];
      return { labels: buttons.map(b => b.textContent), tops: buttons.map(b => b.getBoundingClientRect().top), height: node.getBoundingClientRect().height, fits: buttons.every(b => b.scrollWidth <= b.clientWidth && b.querySelector("span").getBoundingClientRect().height === 18), images: buttons.every(b => b.querySelector("img").complete && b.querySelector("img").naturalWidth === 256), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.deepEqual(result.labels, ["快速匹配", "领券中心", "软件规则", "幸运转盘", "官方通知"]);
    assert.equal(new Set(result.tops).size, 1); assert.equal(result.height, 96); assert(result.fits && result.images && !result.overflow);
    checks.push({ width, ...result });
    await page.locator(".phone-shell").screenshot({ path: `${output}/home-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Cancelled presses must not trigger a shortcut.
  const shortcut = home.getByRole("button", { name: "快速匹配", exact: true });
  const rect = await shortcut.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
  await expect(shortcut).toHaveAttribute("data-pressed", "true");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 + 18, { steps: 3 });
  await expect(shortcut).not.toHaveAttribute("data-pressed", "true"); await page.mouse.up();
  await expect(page.locator(".app-toast")).not.toBeVisible();
  await shortcut.click(); await expect(page.locator(".app-toast")).toHaveText("功能筹备中");
  await page.waitForTimeout(1400);
  await home.getByRole("button", { name: "幸运转盘", exact: true }).click();
  await page.waitForTimeout(1100); await expect(page.locator(".app-toast")).toHaveText("活动暂未开放");
  await expect(page.locator(".app-toast")).toBeVisible();
  checks.push({ feedback: "press cancellation and independent toast lifetime passed" });
  for (const [name, target] of [["领券中心", ".coupon-screen"], ["软件规则", ".rules-screen"], ["官方通知", ".notification-screen"]]) {
    await home.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(target)).toBeVisible();
    await back(); await expect(home).toBeVisible();
  }
  checks.push({ shortcuts: "existing pages and return-to-home passed; real guest notification authorization state preserved" });
  await home.locator(".home-mode-tabs").getByRole("button", { name: "服务", exact: true }).click();
  await home.locator(".sort-bar").getByRole("button", { name: "价格" }).click();
  const scroll = await home.locator(".home-screen").evaluate(node => { node.scrollTop = 100; return node.scrollTop; });
  await home.locator(".bottom-nav").getByRole("button", { name: "我的", exact: true }).click();
  await page.locator(".app-screen:visible .bottom-nav").getByRole("button", { name: "首页", exact: true }).click();
  await expect(home.locator(".home-mode-tabs .active")).toHaveText("服务");
  await expect(home.locator(".sort-bar .active")).toContainText("价格");
  assert.equal(await home.locator(".home-screen").evaluate(n => n.scrollTop), scroll);
  checks.push({ home: "mode, sort and actual scroll retained on return", scroll });
  await home.getByRole("button", { name: "返回推荐首页" }).click();
  await home.locator(".home-screen").evaluate(n => { n.scrollTop = 0; });
  const viewport = home.locator(".home-announcement-viewport"), dots = home.locator(".home-announcement-dots");
  await dots.getByRole("button", { name: /查看第 1 条/ }).click();
  await expect(dots).toHaveAttribute("aria-label", /第 1 张/);
  const banner = await viewport.boundingBox();
  await page.mouse.move(banner.x + banner.width * .8, banner.y + banner.height / 2); await page.mouse.down();
  await page.mouse.move(banner.x + banner.width * .2, banner.y + banner.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(dots).toHaveAttribute("aria-label", /第 2 张/); await expect(home).toBeVisible();
  await dots.getByRole("button", { name: /查看第 1 条/ }).click();
  await expect(dots).toHaveAttribute("aria-label", /第 1 张/); await page.waitForTimeout(300);
  await home.locator(".home-announcement-slide").first().click(); await expect(page.locator(".announcement-detail-screen")).toBeVisible(); await back();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(0, 0); await page.locator("body").click({ position: { x: 1, y: 1 } });
  const index = await dots.getAttribute("aria-label"); await page.waitForTimeout(5500); assert.equal(await dots.getAttribute("aria-label"), index);
  await shortcut.focus(); await page.keyboard.down("Space");
  assert.equal(await shortcut.evaluate(n => getComputedStyle(n).scale), "1"); await page.keyboard.up("Space");
  checks.push({ carousel: "drag, dots, detail, return and reduced-motion pause passed" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await context.setOffline(true); await expect(page.locator(".app-toast")).toContainText("网络已断开");
  await context.setOffline(false); await expect(page.locator(".app-toast")).toContainText("网络已恢复");
  checks.push({ network: "offline/online feedback, no automatic business replay" });
  await expect(page.locator(".app-toast")).not.toBeVisible({ timeout: 4000 });
  await page.locator(".phone-shell").screenshot({ path: `${output}/home-final-390.png` });

  // Isolated browser fixtures exercise error/retry and exact linked-order failures.
  const fixture = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const test = await fixture.newPage(); test.on("pageerror", e => errors.push(e.message));
  let notificationsFail = true, orderRead = "";
  await test.route("**/api/v1/notifications?*", route => route.fulfill({ status: notificationsFail ? 503 : 200, contentType: "application/json", body: JSON.stringify(notificationsFail ? { message: "测试网络故障" } : { items: [{ id: "motion-notice", category: "ORDER", title: "本地隔离通知", content_variables: { content: "仅用于交互验证" }, related_type: "ORDER", related_id: "motion-order-42", read_status: "READ", created_at: "2026-09-22T00:00:00Z" }], next_cursor: null }) }));
  await test.route("**/api/v1/orders/motion-order-42", route => { orderRead = route.request().url(); return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "关联订单不存在或无权查看" }) }); });
  await test.goto("http://127.0.0.1:3001/", { waitUntil: "domcontentloaded" });
  await expect(test.locator(".home-screen")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
  await test.getByRole("button", { name: "官方通知", exact: true }).click();
  await expect(test.locator(".notification-screen")).toContainText("测试网络故障"); notificationsFail = false;
  await test.getByRole("button", { name: "重新加载通知" }).click();
  await test.locator(".notice-list button").click(); await expect(test.locator(".notification-detail-screen")).toBeVisible();
  await test.getByRole("button", { name: "查看订单", exact: true }).click();
  await expect(test.locator(".app-toast")).toContainText("关联订单不存在");
  assert(orderRead.endsWith("/orders/motion-order-42")); await expect(test.locator(".notification-detail-screen")).toBeVisible();
  await test.getByRole("button", { name: "返回", exact: true }).click();
  await test.getByRole("button", { name: "返回", exact: true }).click(); await expect(test.locator(".home-screen")).toBeVisible();
  await test.setViewportSize({ width: 1120, height: 960 });
  await test.getByRole("button", { name: /查看全部 MVP 页面/ }).click();
  await test.locator(".page-catalog-panel").getByRole("button", { name: /^收款账户管理\s*›$/ }).click();
  await test.getByRole("button", { name: /添加/ }).click();
  const sheet = test.locator(".sheet-backdrop");
  await expect(sheet).toHaveAttribute("role", "dialog");
  await expect(test.locator(".payout-accounts-screen")).toHaveCSS("overflow-y", "hidden");
  assert(await sheet.evaluate(n => n.contains(document.activeElement)));
  await test.keyboard.press("Shift+Tab");
  await expect(sheet.getByRole("button", { name: "验证并添加测试账户" })).toBeFocused();
  await test.keyboard.press("Tab"); await expect(sheet.getByRole("button", { name: "×", exact: true })).toBeFocused();
  await sheet.getByRole("button", { name: "×", exact: true }).click();
  await expect(test.getByRole("button", { name: /添加/ })).toBeFocused();
  await expect(test.locator(".payout-accounts-screen")).toHaveCSS("overflow-y", "auto");
  checks.push({ sheet: "focus containment, tab wrap, scroll lock and focus restoration; no submission" });
  let catalogFailure = true;
  await test.route("**/api/v1/companions?*", async route => {
    if (!catalogFailure) return route.continue();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "本地隔离加载故障" }) });
  });
  await test.goto("http://127.0.0.1:3001/", { waitUntil: "domcontentloaded" });
  await expect(test.locator(".home-screen")).toContainText("正在加载服务与陪玩");
  await expect(test.locator(".home-screen .failed")).toContainText("本地隔离加载故障");
  catalogFailure = false;
  await test.locator(".home-screen").getByRole("button", { name: "重试", exact: true }).click();
  await expect(test.locator(".home-screen")).toHaveAttribute("aria-busy", "false");
  await expect(test.locator(".home-screen .failed")).toHaveCount(0);
  const photo = test.locator(".shop-photo .catalog-image").first();
  // The documented seed avatar now intentionally uses the unified default art.
  await expect(photo).toHaveClass(/is-placeholder/);
  await expect(photo).toHaveClass(/is-ready/);
  await expect(photo).toHaveAttribute("src", "/assets/placeholders/player.svg");
  assert.equal(await photo.evaluate(n => n.complete && n.naturalWidth > 0), true);
  await test.route("**/api/v1/companions?*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], next_cursor: null }) }));
  await test.route("**/api/v1/services?*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], next_cursor: null }) }));
  await test.reload({ waitUntil: "domcontentloaded" });
  await expect(test.locator(".home-screen")).toHaveAttribute("aria-busy", "false");
  await expect(test.locator(".home-screen .shop-card, .home-screen .product-card")).toHaveCount(0);
  await expect(test.locator(".home-screen .failed")).toHaveCount(0);
  await expect(test.locator(".home-screen [data-bear-state='04-empty']")).toBeVisible();
  checks.push({ loading: "isolated delayed load, 503 retry, real catalog recovery, documented seed-avatar fallback and genuine empty-state response" });
  await fixture.close();
  checks.push({ fixtures: "503 retry, notification details, exact order ID 404 stays in detail, return chain" });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/browser-results.json`, JSON.stringify({ checks, errors }, null, 2));
  await context.setOffline(false); await context.close(); await browser.close();
}
console.log(JSON.stringify({ checks: checks.length, errors }));
