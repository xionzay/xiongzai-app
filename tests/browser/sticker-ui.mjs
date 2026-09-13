// Run against the local Web prototype. Own ephemeral Chromium profile; no real message writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const base = process.env.STICKER_PREVIEW_URL || "http://127.0.0.1:3001";
const output = new URL("../../design-output/bear-chat-stickers/screenshots/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1120, height: 960 } });
const page = await context.newPage();
const apiRequests = [], errors = [], gifRequests = [], checks = [];
page.on("request", request => {
  if (request.resourceType() === "fetch" || request.resourceType() === "xhr") {
    if (!request.url().includes("/@") && !request.url().includes("__vite")) apiRequests.push(request.url());
  }
  if (/\/chat-stickers\/.*\.gif/.test(request.url())) gifRequests.push(request.url());
});
page.on("pageerror", error => errors.push(error.message));
const screenshot = async name => { await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true }); };
try {
  await page.goto(`${base}/sticker-preview`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "打开熊崽表情面板" })).toBeVisible();
  await screenshot("01-chat-entry");
  const input = page.getByRole("textbox", { name: "本地演示文字输入" });
  await input.fill("这段未发送文字要保留");
  await page.getByRole("button", { name: "打开熊崽表情面板" }).click();
  await expect(page.locator(".sticker-pick")).toHaveCount(35);
  await expect.poll(() => page.locator(".sticker-pick img").first().evaluate(img => img.complete && img.naturalWidth === 320)).toBe(true);
  assert.equal(gifRequests.length, 0);
  await expect(input).not.toBeFocused();
  await screenshot("02-sticker-panel");
  await page.getByRole("button", { name: "关闭表情面板" }).click();
  await expect(input).toHaveValue("这段未发送文字要保留");
  await expect(input).toBeFocused();
  checks.push("打开/关闭面板不丢草稿，输入焦点与面板互斥；35格只有静态缩略图");

  await page.getByRole("button", { name: "打开熊崽表情面板" }).click();
  const hello = page.getByRole("button", { name: "演示发送表情：你好", exact: true });
  await hello.click();
  await expect(page.locator(".sticker-message")).toHaveCount(1);
  await hello.click();
  await expect(page.locator(".sticker-message")).toHaveCount(1);
  const art = page.locator(".sticker-message .sticker-art img").first();
  await expect(art).toHaveAttribute("data-playback", "static", { timeout: 6500 });
  const gifCount = gifRequests.length;
  await input.fill("改变草稿不重播历史表情");
  assert.equal(gifRequests.length, gifCount);
  await page.getByRole("button", { name: "重播表情：你好" }).click();
  await expect(art).toHaveAttribute("data-playback", "once");
  checks.push("轻点本地展示一次、快速重复点击去重；播放3秒后静止；修改草稿不重播；显式重播可用");

  await page.getByRole("button", { name: "打开熊崽表情面板" }).click();
  const second = page.getByRole("button", { name: "演示发送表情：在吗", exact: true });
  const box = await second.boundingBox(); assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await expect(page.getByText("松开关闭，不会发送", { exact: true })).toBeVisible();
  await screenshot("03-long-press-preview");
  await page.mouse.up();
  await expect(page.locator(".sticker-preview-overlay")).toHaveCount(0);
  await expect(page.locator(".sticker-message")).toHaveCount(1);
  await page.getByRole("button", { name: "预览表情：你好", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "熊崽表情放大预览" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "预览表情：你好", exact: true })).toBeFocused();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 10, box.y + 50); await page.mouse.up();
  await expect(page.locator(".sticker-message")).toHaveCount(1);
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
  await hello.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", isPrimary: false, button: 0, bubbles: true });
  await page.mouse.up();
  await expect(page.locator(".sticker-message")).toHaveCount(1);
  checks.push("长按松开不发送；桌面预览可Esc关闭并恢复焦点；拖动和第二根手指取消手势不误发送");
  await page.getByRole("button", { name: "关闭表情面板" }).click();

  await page.getByText("演示状态控制", { exact: true }).click();
  await page.getByRole("button", { name: "对方发送", exact: true }).click();
  await expect(page.locator(".sticker-message.theirs")).toHaveCount(1);
  await expect.poll(() => page.locator(".sticker-message.theirs .sticker-avatar img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await screenshot("04-self-and-other-bubbles");
  await page.getByRole("button", { name: "发送失败", exact: true }).click();
  const failed = page.locator(".sticker-message").last();
  const localId = await failed.getAttribute("data-local-sticker-message");
  const rowCount = await page.locator(".sticker-message").count();
  await failed.getByRole("button", { name: "原位重试（演示）" }).click();
  await expect(failed).toContainText("演示发送中");
  assert.equal(await failed.getAttribute("data-local-sticker-message"), localId);
  assert.equal(await page.locator(".sticker-message").count(), rowCount);
  await page.getByRole("button", { name: "完成最近一次演示" }).click();
  await expect(failed).toContainText("仅本地展示");
  await page.getByRole("button", { name: "未知表情 ID" }).click();
  await expect(page.locator(".sticker-message").last()).toContainText("[表情暂不可用]");
  await page.getByRole("button", { name: "动画加载失败", exact: true }).click();
  await expect(page.locator(".sticker-message").last().locator("img")).toHaveAttribute("src", /thumbnails\/005\.png/);
  await screenshot("05-errors-and-fallback");
  checks.push("本人/对方气泡；失败原位重试不增加消息；演示完成仅由按钮触发；未知ID与GIF失败回退");
  await input.fill("表情之后的本地文字");
  await page.getByRole("button", { name: "本地展示文字" }).click();
  await expect(page.locator(".sticker-demo-messages > div").last()).toContainText("表情之后的本地文字");
  await page.getByRole("button", { name: "清空本地演示" }).click();
  await expect(page.locator(".sticker-message, .sticker-local-text")).toHaveCount(0);
  checks.push("演示文字和表情按时间排序，清空同时清除两类本地记录");

  await page.getByRole("button", { name: "平台客服", exact: true }).click();
  await page.getByText("演示状态控制", { exact: true }).click();
  await page.getByRole("button", { name: "对方发送", exact: true }).click();
  await page.getByRole("button", { name: "本人发送", exact: true }).click();
  await page.getByRole("button", { name: "打开熊崽表情面板" }).click();
  await screenshot("06-support-panel-and-bubbles");
  await expect(page.locator(".customer-service-screen .sticker-message")).toHaveCount(2);
  checks.push("平台客服复用同一面板和表情气泡，演示记录与普通聊天隔离");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "演示发送表情：收到", exact: true }).click();
  const reducedImage = page.locator(".sticker-message").last().locator(".sticker-art img");
  await expect(reducedImage).toHaveAttribute("src", /\.png$/);
  await page.getByRole("button", { name: "重播表情：收到" }).last().click();
  await expect(reducedImage).toHaveAttribute("src", /\.png$/);
  checks.push("减少动态效果下新消息和重播均只显示PNG");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator(".phone-shell").scrollIntoViewIfNeeded();
  const measure = await page.locator(".phone-shell").evaluate(shell => {
    const pane = shell.querySelector(".chat-scroll-content").getBoundingClientRect();
    const input = shell.querySelector("input").getBoundingClientRect();
    const panel = shell.querySelector(".sticker-panel").getBoundingClientRect();
    const screen = shell.querySelector(".app-screen");
    return { documentWidth: document.documentElement.scrollWidth, width: innerWidth, overflow: screen.scrollWidth > screen.clientWidth, paneHeight: pane.height, noOverlap: pane.bottom <= input.top, inputAbovePanel: input.bottom <= panel.top };
  });
  assert.equal(measure.documentWidth, 320); assert.equal(measure.overflow, false); assert.ok(measure.paneHeight >= 120); assert.ok(measure.noOverlap && measure.inputAbovePanel);
  await screenshot("07-small-screen-320");
  checks.push({ smallScreen: measure });
  await page.addStyleTag({ content: "html{font-size:24px!important}" });
  await expect(page.getByRole("button", { name: "关闭表情面板" })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await screenshot("08-large-text");
  checks.push("320px小屏与150%根字号无横向溢出；消息区、输入区和面板不重叠");
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(errors, []);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".sticker-message")).toHaveCount(0);
  checks.push("独立预览全程没有fetch/XHR业务请求或页面异常；刷新不恢复演示历史");
  await writeFile(new URL("../browser-checks.json", output), JSON.stringify({ passed: true, checks, apiRequests, pageErrors: errors, animatedRequests: gifRequests.length }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await screenshot("failure-debug"); console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
