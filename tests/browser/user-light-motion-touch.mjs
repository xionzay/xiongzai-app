import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const checks = [], errors = [];
page.on("pageerror", e => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:3001/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".home-screen")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
  const cdp = await context.newCDPSession(page);
  const gesture = async (x, y, dx, dy, cancel = false) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / 10, y: y + dy * i / 10 }] }); await page.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
  };
  const banner = page.locator(".home-announcement-viewport"), dots = page.locator(".home-announcement-dots");
  let rect = await banner.boundingBox();
  await gesture(rect.x + rect.width * .8, rect.y + rect.height / 2, -220, 0);
  await expect(dots).toHaveAttribute("aria-label", /第 2 张/);
  await expect(page.locator(".home-screen")).toBeVisible();
  await dots.getByRole("button", { name: /查看第 1 条/ }).tap();
  await expect(dots).toHaveAttribute("aria-label", /第 1 张/); await page.waitForTimeout(350);
  rect = await banner.boundingBox();
  await gesture(rect.x + rect.width * .7, rect.y + rect.height / 2, -50, 0, true);
  await expect(dots).toHaveAttribute("aria-label", /第 1 张/);
  await expect(page.locator(".home-screen")).toBeVisible();
  await page.waitForTimeout(400);
  await gesture(rect.x + rect.width / 2, rect.y + rect.height * .75, 0, -100);
  await expect.poll(() => page.locator(".home-screen").evaluate(n => n.scrollTop)).toBeGreaterThan(20);
  await expect(page.locator(".announcement-detail-screen")).toHaveCount(0);
  checks.push("Touch horizontal swipe, pointercancel snap-back and vertical page scroll do not open a banner");
  await page.locator(".home-screen").evaluate(n => { n.scrollTop = 0; });
  await dots.getByRole("button", { name: /查看第 1 条/ }).tap();
  await page.evaluate(() => document.activeElement?.blur());
  await expect(dots).toHaveAttribute("aria-label", /第 2 张/, { timeout: 9000 });
  await page.getByRole("button", { name: "暂停自动轮播" }).tap();
  await page.evaluate(() => document.activeElement?.blur());
  const paused = await dots.getAttribute("aria-label"); await page.waitForTimeout(5500);
  assert.equal(await dots.getAttribute("aria-label"), paused);
  checks.push("Autoplay resumes after manual delay; explicit pause holds the current slide");
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  assert.equal(await page.evaluate(() => window.visualViewport.scale), 2);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  checks.push("Mobile viewport allows 200% page zoom; restored to 100%");
  assert.deepEqual(errors, []);
} finally {
  await writeFile(".local/light-motion/touch-results.json", JSON.stringify({ checks, errors }, null, 2));
  await context.close(); await browser.close();
}
console.log(JSON.stringify({ checks, errors }));
