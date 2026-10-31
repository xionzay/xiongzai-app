import { test, expect } from "@playwright/test";
import { totpCode } from "../../apps/api/dist/index.js";

// Isolated synthetic accounts only. This is not a human account/device login result.
const env = key => { if (!process.env[key]) throw new Error(`Missing local test key: ${key}`); return process.env[key]; };
const api = "http://127.0.0.1:3002";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
test.describe.configure({ mode: "serial" });
async function actor(browser, user = false) {
  const context = await browser.newContext({ baseURL: process.env.ADMIN_E2E_FRONTEND_ORIGIN, viewport: { width: 1280, height: 940 } });
  await context.route("**/*", route => /^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/u.test(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await context.route(`${api}/**`, async route => { const url = new URL(route.request().url()); url.port = env("E2E_API_PORT"); await route.continue({ url: url.href }); });
  if (user) await context.addCookies([{ name: "xiongzai_access", value: env("E2E_COMMUNITY_USER_ACCESS"), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  return { context, page: await context.newPage() };
}
async function login(page, role = "FULL") {
  await page.goto("/admin"); await page.getByLabel("账号").fill(env(`E2E_${role}_USERNAME`)); await page.getByLabel("密码").fill(env(`E2E_${role}_PASSWORD`)); await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByLabel("动态验证码").fill(totpCode(env("E2E_TOTP_SECRET"))); await page.getByRole("button", { name: "完成验证" }).click();
  await expect(page.locator('nav[aria-label="后台模块"]')).toBeVisible();
}
function nav(page, label) { return page.locator('nav[aria-label="后台模块"] button').getByText(label, { exact: true }); }
async function confirm(page, action) { const dialog = page.getByRole("dialog"); await dialog.locator("textarea").fill("隔离本地浏览器验收原因"); await dialog.getByRole("button", { name: action, exact: true }).click(); await expect(dialog).toHaveCount(0); }
async function apiRequest(page, path) { return page.evaluate(async ({ api, path }) => { const r = await fetch(api + path, { credentials: "include" }); return { status: r.status, body: await r.json() }; }, { api, path }); }

test("[real local community] feedback UI survives lost response, admin processes/replies and user reads reply notification", async ({ browser }) => {
  test.setTimeout(90_000);
  const user = await actor(browser, true), admin = await actor(browser);
  try {
    await user.page.goto("/"); await user.page.getByRole("button", { name: "意见反馈", exact: true }).click();
    await user.page.getByRole("textbox", { name: "文字建议" }).fill("本地测试：改进订单失败时的提示（独立反馈）");
    let lost = true;
    await user.context.route(`${api}/api/v1/feedback`, async route => {
      if (route.request().method() !== "POST" || !lost) return route.fallback();
      lost = false; const target = new URL(route.request().url()); target.port = env("E2E_API_PORT"); const response = await route.fetch({ url: target.href });
      if (!response.ok()) { const body = await response.json(); await route.fulfill({ response }); throw new Error(`Local lost-response setup failed: ${response.status()} ${body.code ?? "unknown"}`); }
      await route.abort("failed");
    });
    await user.page.getByRole("button", { name: "提交建议", exact: true }).click();
    await expect(user.page.getByRole("textbox", { name: "文字建议" })).toBeDisabled();
    await user.page.getByRole("button", { name: "查询并重试原建议" }).click(); await expect(user.page.getByRole("heading", { name: "反馈详情", exact: true })).toBeVisible();
    const feedbacks = await apiRequest(user.page, "/api/v1/feedback"); expect(feedbacks.status).toBe(200); expect(feedbacks.body.items).toHaveLength(1); const id = feedbacks.body.items[0].id;
    await login(admin.page); await nav(admin.page, "意见反馈").click(); await admin.page.getByRole("button", { name: "查看反馈" }).click();
    await admin.page.getByRole("button", { name: "标记处理中" }).click(); await confirm(admin.page, "确认处理");
    await admin.page.getByLabel("回复正文").fill("本地测试官方回复：已记录，感谢建议。<script>不执行</script>");
    await admin.page.getByRole("button", { name: "发送官方回复" }).click(); await confirm(admin.page, "确认回复"); await expect(admin.page.getByRole("button", { name: "发送官方回复" })).toHaveCount(0);
    await user.page.bringToFront(); await user.page.getByRole("button", { name: "刷新反馈详情" }).click(); await expect(user.page.getByText("本地测试官方回复：已记录，感谢建议。<script>不执行</script>", { exact: true })).toBeVisible();
    const notifications = await apiRequest(user.page, "/api/v1/notifications?include_feedback=true"); expect(notifications.body.items.filter(row => row.related_type === "FEEDBACK" && row.related_id === id)).toHaveLength(1);
    const replyNotice = notifications.body.items.find(row => row.related_type === "FEEDBACK" && row.related_id === id);
    await user.page.goto("/"); await user.page.getByRole("button", { name: "官方通知", exact: true }).click();
    await user.page.getByRole("button").filter({ hasText: replyNotice.title }).click();
    await user.page.getByRole("button", { name: "查看反馈回复", exact: true }).click();
    await expect(user.page.getByRole("heading", { name: "反馈详情", exact: true })).toBeVisible();
    await expect(user.page.getByText("本地测试官方回复：已记录，感谢建议。<script>不执行</script>", { exact: true })).toBeVisible();
    const readNotices = await apiRequest(user.page, "/api/v1/notifications?include_feedback=true");
    expect(readNotices.body.items.find(row => row.id === replyNotice.id).read_status).toBe("READ");
    await admin.page.screenshot({ path: "test-results/admin-browser/community-feedback-after.png", fullPage: true });
    await user.page.screenshot({ path: "test-results/admin-browser/community-feedback-user.png", fullPage: true });
  } finally { await user.context.close(); await admin.context.close(); }
});

test("[real PostgreSQL + MinIO community] upload, manual cover review, draft, publish, user detail and retire", async ({ browser }) => {
  test.setTimeout(120_000); const admin = await actor(browser), user = await actor(browser);
  try {
    await login(admin.page); await nav(admin.page, "文件管理").click(); await admin.page.getByLabel("上传用途").selectOption("ANNOUNCEMENT_IMAGE");
    await admin.page.locator('input[type="file"]').setInputFiles({ name: "local-test-announcement.png", mimeType: "image/png", buffer: png });
    const complete = admin.page.waitForResponse(r => /\/files\/[^/]+\/complete$/u.test(new URL(r.url()).pathname) && r.request().method() === "POST");
    await admin.page.getByRole("button", { name: "上传公告封面", exact: true }).click(); const response = await complete; expect(response.ok()).toBe(true);
    const row = admin.page.getByRole("row").filter({ hasText: "公告封面" }).first(); await row.getByRole("button", { name: "查看 / 审核" }).click();
    const drawer = admin.page.getByRole("dialog"); await expect(drawer.getByRole("img", { name: "待审核文件预览" })).toBeVisible();
    await drawer.getByRole("button", { name: "通过文件", exact: true }).click();
    const review = admin.page.getByRole("dialog", { name: "确认文件审核" }); await review.locator("textarea").fill("实际查看合成公告封面，仅用于本地测试"); await review.getByRole("button", { name: "确认提交", exact: true }).click(); await expect(review).toHaveCount(0); await expect(drawer.getByText("已通过", { exact: true }).first()).toBeVisible(); await drawer.getByRole("button", { name: "关闭", exact: true }).click();
    await nav(admin.page, "公共公告").click(); await admin.page.getByRole("button", { name: "新建公告草稿" }).click();
    await admin.page.getByLabel("公告标题", { exact: true }).fill("本地测试公共公告（隔离数据）"); await admin.page.getByLabel("公告正文", { exact: true }).fill("此公告只用于本地联调，不承诺奖励或服务。<script>不能执行</script>");
    const select = admin.page.getByLabel("已审核公告封面"); await expect(select.locator("option")).toHaveCount(2); await select.selectOption({ index: 1 });
    await admin.page.getByRole("button", { name: "保存公告草稿" }).click(); await confirm(admin.page, "确认保存");
    await user.page.goto("/"); await expect(user.page.getByText("暂无已发布公告", { exact: true }).first()).toBeVisible();
    await admin.page.bringToFront(); await admin.page.getByRole("button", { name: "发布公告", exact: true }).click(); await confirm(admin.page, "确认发布");
    await expect(admin.page.getByLabel("公告正文", { exact: true })).toBeDisabled();
    await user.page.bringToFront(); await user.page.reload(); await user.page.getByRole("button", { name: "打开公告详情：本地测试公共公告（隔离数据）" }).click();
    await expect(user.page.getByRole("heading", { name: "本地测试公共公告（隔离数据）" })).toBeVisible(); await expect(user.page.getByText("此公告只用于本地联调，不承诺奖励或服务。<script>不能执行</script>", { exact: true })).toBeVisible();
    const published = await apiRequest(user.page, "/api/v1/announcements");
    expect(published.status).toBe(200); expect(published.body.items).toHaveLength(1);
    const announcementId = published.body.items[0].id;
    await admin.page.screenshot({ path: "test-results/admin-browser/community-announcement-after.png", fullPage: true });
    await user.page.screenshot({ path: "test-results/admin-browser/community-announcement-user.png", fullPage: true });
    await admin.page.bringToFront(); await admin.page.getByRole("button", { name: "停用公告", exact: true }).click(); await confirm(admin.page, "确认停用");
    const retired = await apiRequest(user.page, `/api/v1/announcements/${announcementId}`);
    expect(retired.status).toBe(404); expect(retired.body.code).toBe("ANNOUNCEMENT_NOT_FOUND");
    const retiredCover = await apiRequest(user.page, `/api/v1/announcements/${announcementId}/cover`);
    expect(retiredCover.status).toBe(404); expect(retiredCover.body.code).toBe("ANNOUNCEMENT_NOT_FOUND");
    await user.page.reload(); await expect(user.page.getByText("暂无已发布公告", { exact: true }).first()).toBeVisible();
  } finally { await admin.context.close(); await user.context.close(); }
});

test("[real RBAC + injected failures] read-only community, empty/error states, 403/409 and no unauthorized writes", async ({ browser }) => {
  const read = await actor(browser), admin = await actor(browser);
  try {
    await login(read.page, "COMMUNITYREAD"); await nav(read.page, "意见反馈").click(); await expect(read.page.getByRole("button", { name: "发送官方回复" })).toHaveCount(0);
    await nav(read.page, "公共公告").click(); await expect(read.page.getByRole("button", { name: "新建公告草稿" })).toHaveCount(0);
    const forbidden = await read.page.evaluate(async base => { const r = await fetch(base + "/admin-api/v1/announcements", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ title: "不应保存", content: "不应保存", reason: "验证权限" }) }); return r.status; }, api); expect(forbidden).toBe(403);
    await login(admin.page); let fail = true;
    await admin.context.route(`${api}/admin-api/v1/announcements?*`, route => fail ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "本地公告故障注入", request_id: "community-test-request" }), headers: { "access-control-allow-origin": process.env.ADMIN_E2E_FRONTEND_ORIGIN, "access-control-allow-credentials": "true" } }) : route.fallback());
    await nav(admin.page, "公共公告").click(); await expect(admin.page.getByRole("alert")).toContainText("本地公告故障注入"); fail = false; await admin.page.getByRole("button", { name: "重新加载", exact: true }).click(); await expect(admin.page.getByRole("alert")).toHaveCount(0);
    await admin.page.getByRole("button", { name: "新建公告草稿" }).click(); await admin.page.getByLabel("公告标题", { exact: true }).fill("本地冲突测试草稿"); await admin.page.getByLabel("公告正文", { exact: true }).fill("本地冲突测试正文"); await admin.page.getByRole("button", { name: "保存公告草稿" }).click(); await confirm(admin.page, "确认保存");
    let writes = 0; await admin.context.route(`${api}/admin-api/v1/announcements/*/edit`, route => { writes++; return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "RESOURCE_VERSION_CONFLICT", message: "本地版本冲突" }), headers: { "access-control-allow-origin": process.env.ADMIN_E2E_FRONTEND_ORIGIN, "access-control-allow-credentials": "true" } }); });
    await admin.page.getByLabel("公告正文", { exact: true }).fill("未保存的修改"); await admin.page.getByRole("button", { name: "保存公告草稿" }).click();
    const dialog = admin.page.getByRole("dialog"); await dialog.locator("textarea").fill("本地冲突原因"); await dialog.getByRole("button", { name: "确认保存", exact: true }).click(); await expect(dialog.getByRole("alert")).toContainText("已重新读取"); expect(writes).toBe(1); await dialog.getByRole("button", { name: "取消", exact: true }).click(); await expect(admin.page.getByLabel("公告正文", { exact: true })).toHaveValue("本地冲突测试正文");
    for (const width of [1063, 800]) { await admin.page.setViewportSize({ width, height: 940 }); expect(await admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  } finally { await read.context.close(); await admin.context.close(); }
});
