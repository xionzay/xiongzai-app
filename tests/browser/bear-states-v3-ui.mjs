// Read-only catalog navigation and explicitly local sticker demonstration; no credentials.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const base = process.env.STICKER_PREVIEW_URL || "http://127.0.0.1:3001";
const output = new URL("../../design-output/bear-ui-motion-v3/ui-verification/", import.meta.url);
const stickerOutput = new URL("../../design-output/bear-ui-motion-v3/ui-verification/screenshots/", import.meta.url);
await mkdir(new URL("screenshots/", output), { recursive: true });
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1120, height: 960 } });
const writes = [], checks = [], errors = [];
page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
page.on("pageerror", error => errors.push(error.message));
const go = async (label) => {
  await page.getByRole("button", { name: /查看全部 MVP 页面/ }).click();
  await page.locator(".page-catalog-panel").getByRole("button", { name: new RegExp(`^${label}\\s*›$`) }).click();
};
const shot = async (name, dir = new URL("screenshots/", output)) => {
  await page.locator(".phone-shell").screenshot({ path: fileURLToPath(new URL(`${name}.png`, dir)) });
};
const verifyBear = async (id, mode) => {
  const image = page.locator(`.phone-shell [data-bear-state="${id}"] img`).first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  if (mode) await expect(image).toHaveAttribute("data-playback", mode);
};
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await go("加载·失败·断网总览");
  for (const [label, id, file] of [
    ["加载中", "01-loading", "01-loading"], ["加载失败", "02-error", "02-error"], ["网络断开", "05-offline", "03-offline"],
  ]) {
    await page.locator(".global-tabs").getByRole("button", { name: label, exact: true }).click();
    await verifyBear(id, 'loop'); await shot(file); checks.push({ page: label, bear: id, mode: 'loop' });
  }
  for (const [label, id, file, mode] of [
    ["空订单", "04-empty", "04-empty-orders"],
    ["空收藏", "04-empty", "05-empty-favorites"],
    ["支付处理中", "06-waiting", "06-payment-processing", "loop"],
    ["支付成功", "03-success", "07-payment-success"],
    ["用户取消支付", "09-neutral", "08-payment-cancelled"],
    ["申请·审核中", "06-waiting", "09-application-review", "loop"],
    ["申请·审核未通过", "02-error", "10-application-rejected"],
    ["退款·已完成", "10-confirm-calm", "11-refund-completed"],
    ["支付确认超时", "06-waiting", "12-payment-timeout-loop", "loop"],
    ["退款·渠道处理中", "06-waiting", "13-refund-processing-loop", "loop"],
    ["申请·补充资料", "09-neutral", "14-application-supplement"],
    ["申请·审核通过", "03-success", "15-application-approved"],
    ["申请·资格暂停", "09-neutral", "16-application-suspended"],
    ["订单已关闭", "09-neutral", "17-payment-closed"],
  ]) {
    await go(label); await verifyBear(id, mode || 'loop');
    await expect(page.locator(".bear-demo-notice")).toContainText("设计稿演示状态");
    if (label.startsWith("支付") || label === "用户取消支付" || label === "订单已关闭") await expect(page.locator(".bear-demo-notice")).toContainText("测试支付，不会真实扣款");
    await shot(file); checks.push({ page: label, bear: id, mode: mode || "loop" });
  }
  for (const [label, className, filename] of [
    ["文字聊天", ".chat-screen", "09-existing-chat-panel"], ["平台客服", ".customer-service-screen", "10-existing-support-panel"],
  ]) {
    await go(label);
    const screen = page.locator(`.phone-shell ${className}`);
    const stateCard = screen.locator('.chat-empty-state:has(.bear-state-image)');
    await expect(stateCard).toBeVisible();
    await expect(stateCard).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(stateCard.locator('.bear-state-image')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(stateCard).toHaveCSS('backdrop-filter', 'none');
    await shot(className === '.chat-screen' ? '20-chat-matched-background' : '21-support-matched-background');
    checks.push({ page: label, background: 'Opaque state image and enclosing card match white; wallpaper unchanged' });
    await screen.getByRole("button", { name: "打开熊崽表情面板" }).click();
    await expect(screen.locator(".sticker-pick")).toHaveCount(35);
    await expect.poll(() => screen.locator(".sticker-pick img").first().evaluate(img => img.complete && img.naturalWidth === 320)).toBe(true);
    await screen.getByRole("button", { name: "演示发送表情：你好", exact: true }).click();
    await expect(screen.locator(".sticker-message")).toHaveCount(1);
    await expect(screen.locator(".sticker-message")).toContainText("仅本地展示");
    await expect.poll(() => screen.locator(".sticker-message .sticker-art img").evaluate(img => img.complete && img.naturalWidth === 320)).toBe(true);
    await shot(filename, stickerOutput);
    checks.push({ page: label, integration: "Existing screen, own draft/auth/text transport untouched; local sticker shown" });
  }
  await go("支付成功");
  const resultButton = page.locator(".result-actions").getByRole("button", { name: "查看订单", exact: true });
  await resultButton.scrollIntoViewIfNeeded();
  await resultButton.click({ trial: true });
  await shot("18-payment-actions-visible");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await go("支付处理中");
  await verifyBear("06-waiting", "poster");
  checks.push({ accessibility: "Reduced motion displays poster, no loop" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/assets/bear-states-v3/assets/03-success.webp*", route => route.abort());
  await go("支付成功");
  await verifyBear("03-success", "poster");
  await expect(page.locator(".phone-shell")).toContainText("支付成功");
  await resultButton.scrollIntoViewIfNeeded();
  await resultButton.click({ trial: true });
  checks.push({ fallback: "WebP failure displays PNG; result text and buttons remain" });
  await page.unroute("**/assets/bear-states-v3/assets/03-success.webp*");
  await page.setViewportSize({ width: 320, height: 568 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await resultButton.scrollIntoViewIfNeeded();
  await resultButton.click({ trial: true });
  await shot("19-small-screen-actions");
  checks.push({ smallScreen: "320px no horizontal overflow; result action scrolls into view and receives pointer events" });
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  await writeFile(new URL("browser-checks.json", output), JSON.stringify({ passed: true, checks, writes, pageErrors: errors, realTransactions: false }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, writes }, null, 2));
} catch (error) {
  await shot("failure-debug"); console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
