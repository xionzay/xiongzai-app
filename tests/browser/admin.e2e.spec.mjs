import { expect, test } from "@playwright/test";
import { totpCode } from "../../apps/api/dist/index.js";

const apiBase = "http://127.0.0.1:3002/admin-api/v1";
const frontendOrigin = process.env.ADMIN_E2E_FRONTEND_ORIGIN ?? "http://127.0.0.1:3101";
const corsHeaders = {
  "access-control-allow-origin": frontendOrigin,
  "access-control-allow-credentials": "true",
  "access-control-expose-headers": "x-request-id",
  "content-type": "application/json; charset=utf-8",
};

test.describe.configure({ mode: "serial" });

test("[real backend E2E] responsive shell, todo navigation and keyboard-safe confirmation", async ({page})=>{
  await login(page,"FULL");
  const brand = page.locator('[class*="sideBrand"] img');
  await expect(brand).toHaveAttribute("src", "/assets/xiongzai-app-icon-approved.png");
  await expect(brand).toHaveAttribute("alt", "熊崽电竞");
  await expect.poll(() => brand.evaluate(image => image.complete && image.naturalWidth === 1254 && image.naturalHeight === 1254)).toBe(true);
  await page.setViewportSize({width:1280,height:940});
  await expect(page.getByRole("heading", { name: "待办快照", exact: true })).toBeVisible();
  await page.screenshot({path:"test-results/admin-browser/admin-dashboard-1280.png",fullPage:true});
  for(const width of [1063,1280,1440]){await page.setViewportSize({width,height:940});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);const profile=page.locator('[class*="adminProfile"]').first();const box=await profile.boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(width);}
  await page.setViewportSize({width:1063,height:940});
  const chrome=await page.context().newCDPSession(page);
  await chrome.send("Emulation.setPageScaleFactor",{pageScaleFactor:1.25});
  expect(await page.evaluate(()=>window.visualViewport.scale)).toBeCloseTo(1.25);
  await page.locator('[class*="adminProfile"]').first().scrollIntoViewIfNeeded();
  await expect(page.locator('[class*="adminProfile"]').first()).toBeInViewport();
  await chrome.send("Emulation.setPageScaleFactor",{pageScaleFactor:1});await chrome.detach();
  await page.locator('[class*="todoCard"]').getByRole("button",{name:/待审核陪玩/}).click();
  await expect(page.getByRole("heading",{name:"陪玩申请审核"})).toBeVisible();await expect(page.getByLabel("审核状态")).toHaveValue("PENDING");
  await nav(page,"用户管理").click();const trigger=page.getByRole("button",{name:"禁用",exact:true}).first();await trigger.click();
  const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  for(let i=0;i<8;i++){await page.keyboard.press("Tab");expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await page.screenshot({path:"test-results/admin-browser/admin-responsive-1063.png",fullPage:true});
});

test("[real backend E2E] versioned after-sale case, independent confirmation, conflict refresh and read-only permission", async ({ page, context }) => {
  await login(page, "FULL");
  await nav(page, "退款管理").click(); await page.getByRole("button", { name: "新规则售后案件", exact: true }).click();
  const caseRow = page.getByRole("row").filter({ hasText: env("E2E_ADMIN_CASE_ID") });
  await caseRow.getByRole("button", { name: "查看案件" }).click();
  const detail = page.getByRole("complementary", { name: "售后案件详情" });
  await expect(detail).toContainText("平台初判"); await expect(detail).toContainText("¥ 50.00");
  const materials = detail.getByRole("button", { name: "确认补证结束", exact: true });
  await materials.click(); let dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(materials).toBeVisible();
  let conflict = true, writes = 0;
  await context.route(`**/admin-api/v1/after-sale/cases/${env("E2E_ADMIN_CASE_ID")}/actions`, async route => {
    if (route.request().method() !== "POST") return route.fallback(); writes++;
    if (conflict) { conflict = false; return route.fulfill(jsonResponse(409, { code: "RESOURCE_VERSION_CONFLICT", message: "本地冲突故障注入" })); }
    return route.fallback();
  });
  await materials.click(); dialog = page.getByRole("dialog"); await dialog.locator("textarea").fill("本地测试材料核验"); await dialog.getByRole("button", { name: "确认提交案件操作" }).click();
  await expect(dialog).toContainText("重新读取"); expect(writes).toBe(1);
  await dialog.getByRole("button", { name: "确认提交案件操作" }).click(); await expect(dialog).toContainText("关闭确认框"); expect(writes).toBe(1);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await materials.click(); dialog = page.getByRole("dialog"); await dialog.locator("textarea").fill("本地测试材料确已核验"); await dialog.getByRole("button", { name: "确认提交案件操作" }).click();
  await expect(dialog).toHaveCount(0); await expect(detail).toContainText("当前阶段：审核");
  await detail.getByLabel("裁决结果", { exact: true }).selectOption("NO_REFUND"); await detail.getByLabel("裁决金额（整数分）", { exact: true }).fill("0");
  for (const label of ["已核验事实", "适用规则", "责任认定", "剩余义务与终止范围", "执行条件"]) await detail.getByLabel(label, { exact: true }).fill(`隔离本地测试：${label}，不代表真实案件结论`);
  await detail.getByRole("button", { name: "提交裁决", exact: true }).click(); dialog = page.getByRole("dialog"); await dialog.locator("textarea").fill("本地测试裁决，仅验证保存与回应期"); await dialog.getByRole("button", { name: "确认提交案件操作" }).click();
  await expect(dialog).toHaveCount(0); await expect(detail).toContainText("裁决回应期"); await expect(detail.getByRole("heading", { name: "当前裁决（不等于已执行）" })).toBeVisible();
  await expectAudited(page, env("E2E_ADMIN_CASE_ID"), "AFTER_SALE_DECIDE", "本地测试裁决，仅验证保存与回应期");
  await page.goto("/admin?module=refunds&refund_view=cases"); await expect(page.getByRole("heading", { name: "售后案件", exact: true })).toBeVisible();
  await page.getByLabel("案件状态", { exact: true }).selectOption("P02"); await expect(page.getByRole("row").filter({ hasText: env("E2E_ADMIN_CASE_ID") })).toBeVisible();
  await page.getByLabel("案件状态", { exact: true }).selectOption("S01"); await expect(page.getByText("暂无符合条件的售后案件", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /管理员账户：/ }).click(); await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(page, "OPERATIONS_READ"); await nav(page, "退款管理").click(); await page.getByRole("button", { name: "新规则售后案件", exact: true }).click(); await page.getByRole("row").filter({ hasText: env("E2E_ADMIN_CASE_ID") }).getByRole("button", { name: "查看案件" }).click();
  await expect(detail.getByRole("heading", { name: "案件详情", exact: true })).toBeVisible();
  for (const name of ["确认补证结束", "提交裁决", "延长补证期限"]) await expect(detail.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/admin-browser/after-sale-case-readonly-isolated.png", fullPage: false });
});

test("[real backend E2E] first policy draft works from empty category and config options recover from failure",async({page,context})=>{
  await login(page,"FULL");await nav(page,"协议与隐私管理").click();await page.getByLabel("协议分类",{exact:true}).first().selectOption("MINOR_PROTECTION_NOTICE");
  await expect(page.locator("tbody tr")).toHaveCount(0);await page.getByRole("button",{name:"新建草稿"}).click();
  const editor=page.locator('article[class*="configCard"]');await editor.getByLabel("协议分类").selectOption("MINOR_PROTECTION_NOTICE");await editor.getByLabel("标题",{exact:true}).fill("本地空分类首个测试草稿");await editor.getByLabel("协议正文").fill("仅用于本地浏览器回归，不属于法律审核结果。");await editor.getByRole("button",{name:"创建草稿"}).click();
  await page.getByRole("dialog").locator("textarea").fill("验证空列表创建首个协议草稿");await page.getByRole("button",{name:"确认创建",exact:true}).click();await expect(page.getByRole("row").filter({hasText:"本地空分类首个测试草稿"})).toBeVisible();
  let fail=true;await context.route("**/admin-api/v1/governance/config-definitions",async route=>{if(fail){fail=false;await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"本地选项故障注入"})});}else await route.fallback();});
  await nav(page,"平台配置").click();await expect(page.getByRole("alert")).toContainText("本地选项故障注入");await expect(page.getByRole("button",{name:"发布新版本",exact:true})).toBeDisabled();await page.getByRole("button",{name:"重新加载配置选项"}).click();await expect(page.getByText("仅旧预约规则；新商品订单固定 10%",{exact:false})).toBeVisible();
});

test("[real backend E2E] polished overview, grouped navigation and shared toolbar layout preserve all routes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 940 });
  await login(page, "FULL");
  await expect(page.getByRole("region", { name: "核心经营指标" }).locator("article")).toHaveCount(4);
  const todo = page.getByRole("heading", { name: "待办快照", exact: true });
  await expect(todo).toBeInViewport();
  for (const label of ["用户与商品", "累计交易", "审核与风险"]) {
    const group = page.locator("details").filter({ has: page.locator("summary", { hasText: label }) });
    await expect(group).not.toHaveAttribute("open", "");
    await group.locator("summary").click();
    await expect(group.locator("article").first()).toBeVisible();
  }
  await expect(page.locator('[class*="metricCard"]')).toHaveCount(18);
  await page.goto("/admin?module=dashboard");
  await expect(todo).toBeInViewport();
  await page.screenshot({ path: "test-results/admin-browser/ui-dashboard-after-1280.png", fullPage: false });

  const people = page.getByRole("button", { name: "用户与陪玩", exact: true });
  await people.click(); await expect(people).toHaveAttribute("aria-expanded", "false");
  await expect(nav(page, "用户管理")).toBeHidden();
  await page.locator('[class*="todoCard"]').getByRole("button", { name: /待审核陪玩/ }).click();
  await expect(people).toHaveAttribute("aria-expanded", "true");
  await expect(nav(page, "陪玩审核")).toHaveAttribute("aria-current", "page");
  await expect(nav(page, "用户管理")).toBeVisible();
  for (const label of ["用户管理", "陪玩审核", "商品审核", "订单管理", "支付管理", "财务数据", "文件管理", "治理日志"]) {
    await nav(page, label).click();
    await expect(nav(page, label)).toHaveAttribute("aria-current", "page");
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const toolbar = page.locator('[class*="toolbar"]').first();
    if (await toolbar.count()) {
      for (const control of await toolbar.locator("input,select,button").all()) {
        if (!await control.isVisible()) continue;
        const box = await control.boundingBox(); expect(box.width).toBeGreaterThan(24); expect(box.x + box.width).toBeLessThanOrEqual(1281);
      }
    }
    if (label === "用户管理") {
      const search = await page.locator('[class*="searchField"]').first().boundingBox();
      const filter = await page.locator('select[class*="filterButton"]').first().boundingBox();
      expect(Math.abs(search.y - filter.y)).toBeLessThan(5); expect(filter.width).toBeLessThan(240);
      const font = await page.locator("tbody td").first().evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize)); expect(font).toBeGreaterThanOrEqual(13);
      await page.screenshot({ path: "test-results/admin-browser/ui-users-after-1280.png", fullPage: false });
    }
    if (label === "财务数据") await page.screenshot({ path: "test-results/admin-browser/ui-finance-after-1280.png", fullPage: false });
  }
  await page.goto("/admin?module=payments"); await expect(page.getByRole("heading", { name: "支付管理", exact: true })).toBeVisible();
  await expect(nav(page, "支付管理")).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 820, height: 940 });
  await page.getByRole("button", { name: "收起或展开导航" }).click();
  const menu = page.getByRole("dialog", { name: "完整后台导航" }); await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "支付管理", exact: true })).toBeVisible();
  for (let i = 0; i < 10; i++) { await page.keyboard.press("Tab"); expect(await menu.evaluate(node => node.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0); await expect(page.getByRole("button", { name: "收起或展开导航" })).toBeFocused();
  await page.getByRole("button", { name: "收起或展开导航" }).click();
  await menu.getByRole("button", { name: "用户管理", exact: true }).click(); await expect(menu).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "用户管理", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/admin-browser/ui-users-after-820.png", fullPage: false });
});

test("[real backend E2E] long identity, narrow layouts and explicit visual zoom remain usable without new permissions", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "FINANCEREAD");
  await expect(page.getByRole("navigation", { name: "后台模块" }).getByRole("region", { name: "用户与陪玩" })).toHaveCount(0);
  await expect(nav(page, "用户管理")).toHaveCount(0);
  const profile = page.getByRole("button", { name: /^管理员账户：浏览器财务只读员/ });
  await expect(profile).toHaveAttribute("title", /超长管理员名称/);
  const chrome = await page.context().newCDPSession(page);
  try {
    for (const width of [1063, 1280, 1440, 820]) {
      await page.setViewportSize({ width, height: 940 });
      for (const scale of [1, 1.25, 1.5]) {
        // Layout equivalent of zoom, in addition to visual viewport scaling below.
        await page.setViewportSize({ width: Math.floor(width / scale), height: Math.floor(940 / scale) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(profile).toBeVisible();
        await page.setViewportSize({ width, height: 940 });
        // Visual viewport / pinch emulation, explicitly NOT desktop menu zoom.
        await chrome.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
        expect(await page.evaluate(() => window.visualViewport.scale)).toBeCloseTo(scale);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await profile.scrollIntoViewIfNeeded(); await expect(profile).toBeInViewport();
        // Keyboard activation remains coordinate-independent under pinch emulation.
        await profile.press("Enter"); await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
        await profile.press("Enter"); await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
      }
      await chrome.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
      const box = await profile.boundingBox(); expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 1063, height: 940 });
    await page.screenshot({ path: "test-results/admin-browser/ui-long-name-after-1063.png", fullPage: false });
  } finally {
    await chrome.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }); await chrome.detach(); await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test("[browser mock errors] boot connection failure is centered, explicit and retryable without demo data", async ({ page }) => {
  let blocked = true;
  await page.route(`${apiBase}/auth/session`, async route => blocked ? route.fulfill({ status: 503, headers: corsHeaders, body: JSON.stringify({ code: "LOCAL_TEST_FAILURE", message: "本地连接故障注入" }) }) : route.fallback());
  await page.setViewportSize({ width: 1063, height: 940 }); await page.goto("/admin");
  const failure = page.getByRole("alert"); await expect(failure).toContainText("本地连接故障注入");
  const box = await failure.boundingBox(); expect(box.width).toBeGreaterThan(400); expect(Math.abs(box.x + box.width / 2 - 1063 / 2)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/admin-browser/ui-boot-error-after-1063.png", fullPage: false });
  blocked = false; await failure.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByRole("heading", { name: "管理员登录", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "数据总览", exact: true })).toHaveCount(0);
});

test.beforeEach(async ({ context }) => {
  const targetPort = env("E2E_API_PORT");
  await context.route(`${apiBase}/**`, async (route) => {
    const targetUrl = new URL(route.request().url());
    targetUrl.port = targetPort;
    // Native continuation preserves abort/stream semantics. Fetch + fulfill can
    // race a legitimate client AbortController and try to handle a closed route.
    await route.continue({ url: targetUrl.toString() });
  });
});

test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});

test("[real backend E2E] password, TOTP, HttpOnly session and expiry traverse the real admin API", async ({ page, context }) => {
  const consoleMessages = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();

  await page.getByLabel("账号").fill(env("E2E_FULL_USERNAME"));
  await page.getByLabel("密码").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "安全登录" }).click();
  await expect(page.getByRole("alert")).toContainText("账号或密码错误");

  await page.getByLabel("密码").fill(env("E2E_FULL_PASSWORD"));
  await page.getByRole("button", { name: "安全登录" }).click();
  await expect(page.getByRole("heading", { name: "安全验证" })).toBeVisible();
  const mfaBlocked = await page.evaluate(async (base) => { const response = await fetch(`${base}/refunds?limit=1`, { credentials: "include" }); return { status: response.status, body: await response.json() }; }, apiBase);
  expect(mfaBlocked.status).toBe(401);
  expect(mfaBlocked.body.code).toBe("AUTH_REQUIRED");
  await page.getByLabel("动态验证码").fill("000000");
  await page.getByRole("button", { name: "完成验证" }).click();
  await expect(page.getByRole("alert")).toContainText("动态验证码无效或已过期");
  await page.getByLabel("动态验证码").fill(totpCode(env("E2E_TOTP_SECRET")));
  await page.getByRole("button", { name: "完成验证" }).click();
  await expect(page.getByRole("heading", { name: "数据总览" })).toBeVisible();

  const browserState = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    cookie: document.cookie,
  }));
  expect(JSON.stringify(browserState.local)).not.toMatch(/token|bearer|authorization/iu);
  expect(JSON.stringify(browserState.session)).not.toMatch(/token|bearer|authorization/iu);
  expect(browserState.cookie).not.toContain("xiongzai_admin_access");
  const adminCookie = (await context.cookies()).find((cookie) => cookie.name === "xiongzai_admin_access");
  expect(adminCookie?.httpOnly).toBe(true);
  expect(consoleMessages.join("\n")).not.toMatch(/bearer|access[_-]?token|refresh[_-]?token|secret|cookie=/iu);

  const logoutStatus = await page.evaluate(async (base) => (await fetch(`${base}/auth/logout`, { method: "POST", credentials: "include" })).status, apiBase);
  expect(logoutStatus).toBe(204);
  await page.reload();
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
});

test("[real backend E2E] navigation, direct module access and dangerous actions honor RBAC", async ({ page }) => {
  const businessRequests = [];
  page.on("request", (request) => {
    if (request.url().startsWith(apiBase)) businessRequests.push(request.url());
  });
  await login(page, "VIEWER");
  await expect(nav(page, "用户管理")).toHaveCount(0);
  businessRequests.length = 0;
  await page.goto("/admin?module=users");
  await expect(page.getByRole("heading", { name: "数据总览" })).toBeVisible();
  expect(businessRequests.some((url) => /\/users(?:\?|$)/u.test(url))).toBe(false);
  expect(businessRequests.some((url) => url.includes("/system/health"))).toBe(false);
  await expect(page.getByText("当前账号没有 system_health.read 权限，未发出健康检查请求。")).toBeVisible();
  const forbidden = await page.evaluate(async ({ base, userId }) => {
    const response = await fetch(`${base}/users/${userId}`, { credentials: "include" });
    return { status: response.status, body: await response.json() };
  }, { base: apiBase, userId: env("E2E_TARGET_USER_ID") });
  expect(forbidden.status).toBe(403);
  expect(forbidden.body.code).toBe("ADMIN_PERMISSION_DENIED");

  await page.evaluate(async (base) => fetch(`${base}/auth/logout`, { method: "POST", credentials: "include" }), apiBase);
  await page.reload();
  await login(page, "USER_READ", false);
  await nav(page, "用户管理").click();
  await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "禁用" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "解禁" })).toHaveCount(0);
});

test("[real backend E2E] account cancellation is masked and read-only except for versioned audited rejection", async ({ page }) => {
  await login(page, "USER_READ");
  await nav(page, "账号注销").click();
  await expect(page.getByRole("heading", { name: "账号注销" })).toBeVisible();
  let row = page.getByRole("row").filter({ hasText: "浏览器用户 07" });
  await expect(row).toContainText("138****0007");
  await expect(row).toContainText("浏览器账号注销人工审核");
  await expect(row.getByRole("button", { name: "拒绝申请" })).toHaveCount(0);
  await row.getByRole("button", { name: "查看" }).click();
  const drawer = page.locator('[class*="drawerBody"]');
  await expect(drawer).toContainText("138****0007");
  const detailText = await drawer.textContent();
  expect(detailText).toContain("注销阻塞条件");
  expect(detailText).not.toMatch(/idempotency|phone_ciphertext|139\d{8}|new_phone/iu);
  await page.getByRole("button", { name: "关闭" }).click();

  const forbidden = await postJson(page, `/account-cancellations/${env("E2E_ACCOUNT_CANCELLATION_ID")}/reject`, { version: 0, reason: "只读管理员不得拒绝" });
  expect(forbidden.status).toBe(403);
  expect(forbidden.body.code).toBe("ADMIN_PERMISSION_DENIED");
  await page.evaluate(async (base) => fetch(`${base}/auth/logout`, { method: "POST", credentials: "include" }), apiBase);
  await page.reload();
  await login(page, "FULL", false);
  await nav(page, "账号注销").click();
  row = page.getByRole("row").filter({ hasText: "浏览器用户 07" });
  await row.getByRole("button", { name: "拒绝申请" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "确认拒绝" }).click();
  await expect(dialog.getByRole("alert")).toContainText("请填写至少 2 个字符");
  await dialog.locator("textarea").fill("浏览器账号注销拒绝原因");
  const response = page.waitForResponse((candidate) => candidate.url().endsWith(`/account-cancellations/${env("E2E_ACCOUNT_CANCELLATION_ID")}/reject`) && candidate.request().method() === "POST");
  await dialog.getByRole("button", { name: "确认拒绝" }).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByText("账号注销申请已由服务端拒绝并记录审计")).toBeVisible();
  await page.locator('select[class*="filterButton"]').first().selectOption("REJECTED");
  await expect(page.getByRole("row").filter({ hasText: "浏览器用户 07" })).toContainText("管理员已拒绝");

  const stale = await postJson(page, `/account-cancellations/${env("E2E_ACCOUNT_CANCELLATION_ID")}/reject`, { version: 0, reason: "过期版本拒绝" });
  expect(stale.status).toBe(409);
  const unsupportedApproval = await postJson(page, `/account-cancellations/${env("E2E_ACCOUNT_CANCELLATION_ID")}/approve`, { version: 1, reason: "后台不应能批准注销" });
  expect(unsupportedApproval.status).toBe(404);
  await expectAudited(page, env("E2E_ACCOUNT_CANCELLATION_USER_ID"), "ACCOUNT_CANCELLATION_REJECTED", "浏览器账号注销拒绝原因");
});

test("[real backend E2E] read-only operations role sees facts but no dangerous controls and direct writes remain forbidden", async ({ page }) => {
  await login(page, "OPERATIONS_READ");
  const checks = [
    ["实名认证审核", ["通过", "驳回"]], ["陪玩审核", ["通过", "驳回"]], ["商品审核", ["通过", "驳回"]], ["退款管理", ["批准", "驳回"]],
    ["投诉管理", ["推进处理"]], ["客服中心", ["接入工单", "发送回复", "转交", "关闭"]], ["提现管理", ["初审通过", "最终复核", "驳回"]],
  ];
  for (const [moduleLabel, actionLabels] of checks) {
    await nav(page, moduleLabel).click();
    for (const actionLabel of actionLabels) await expect(page.getByRole("button", { name: actionLabel, exact: true })).toHaveCount(0);
  }
  await nav(page, "支付管理").click();
  await expect(page.getByText("BROWSER-PAY-001")).toBeVisible();
  await expect(page.getByText("模拟支付渠道").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /修改|补单|改状态|确认支付/u })).toHaveCount(0);
  await nav(page, "协议与隐私管理").click();
  await expect(page.getByText("本地测试草案，尚未法律审核")).toBeVisible();
  await expect(page.getByRole("button", { name: "新建草稿" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /保存草稿|发布新版本|停用版本/u })).toHaveCount(0);
  await nav(page, "治理日志").click();
  await page.getByRole("button", { name: "风险事件", exact: true }).click();
  await expect(page.getByRole("button", { name: "处理", exact: true })).toHaveCount(0);
  await nav(page, "平台配置").click();
  await expect(page.getByRole("button", { name: "发布新版本" })).toHaveCount(0);
  const forbidden = await page.evaluate(async ({ base, applicationId }) => {
    const response = await fetch(`${base}/seller-applications/${applicationId}/review`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "APPROVE", version: 0, reason: "只读账号不应成功" }) });
    return { status: response.status, body: await response.json() };
  }, { base: apiBase, applicationId: env("E2E_SELLER_APPLICATION_ID") });
  expect(forbidden.status).toBe(403);
  expect(forbidden.body.code).toBe("ADMIN_PERMISSION_DENIED");
});

test("[real backend E2E] signed cursor pagination, server sorting, safe state and audited user mutation use real PostgreSQL", async ({ page }) => {
  await login(page, "FULL");
  await nav(page, "用户管理").click();
  await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.locator("tbody tr").first()).toContainText("浏览器用户 27");
  const nextPageRequest = page.waitForRequest((request) => request.url().includes("/users?") && request.url().includes("cursor="));
  await page.getByRole("button", { name: "加载更多" }).click();
  expect((await nextPageRequest).url()).toContain("cursor=");
  await expect(page.locator("tbody tr")).toHaveCount(27);
  const ids = await page.locator("tbody tr td:nth-child(1) small").allTextContents();
  expect(new Set(ids).size).toBe(ids.length);

  await page.getByLabel("服务端排序").selectOption("created_asc");
  await expect(page.locator("tbody tr").first()).toContainText("浏览器用户 01");
  await page.reload();
  await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();
  await expect(page.getByLabel("服务端排序")).toHaveValue("created_asc");
  expect(new URL(page.url()).searchParams.get("module")).toBe("users");

  const search = page.getByLabel("搜索昵称、用户编号或脱敏手机号");
  await search.fill("138****0027");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(page.url()).not.toContain("138");
  await search.fill("");
  await page.getByLabel("服务端排序").selectOption("created_desc");
  const targetRow = page.getByRole("row").filter({ hasText: "浏览器用户 27" });
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "浏览器用户 27" })).toBeVisible();
  const record = page.getByRole("heading", { name: "服务端真实记录" }).locator("..");
  await expect(record.getByText("BROWSER-27")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  await targetRow.getByRole("button", { name: "禁用" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("浏览器 E2E 验证服务端审计原因");
  await expect(page.getByText("用户状态已由服务端更新")).toHaveCount(0);
  const refreshedUsers = page.waitForResponse((response) => response.url().includes("/admin-api/v1/users?") && !response.url().includes("cursor=") && response.status() === 200);
  await dialog.getByRole("button", { name: "确认禁用" }).click();
  await expect(page.getByText("用户状态已由服务端更新")).toBeVisible();
  await refreshedUsers;
  const audit = await page.evaluate(async ({ base, targetId }) => {
    const response = await fetch(`${base}/governance/operation-logs?target_id=${encodeURIComponent(targetId)}&limit=20`, { credentials: "include" });
    return response.json();
  }, { base: apiBase, targetId: env("E2E_TARGET_USER_ID") });
  expect(audit.items.some((item) => item.action === "USER_STATUS_CHANGED" && item.reason === "浏览器 E2E 验证服务端审计原因")).toBe(true);
});

test("[real backend E2E] core detail drawers read seller, service, review, risk, security, admin and role facts from PostgreSQL", async ({ page }) => {
  await login(page, "FULL");
  await nav(page, "陪玩审核").click();
  const sellerReviewRow = page.getByRole("row").filter({ hasText: "浏览器陪玩" });
  await expect(sellerReviewRow).toBeVisible();
  await sellerReviewRow.getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "浏览器陪玩" })).toBeVisible();
  await expect(page.getByAltText("浏览器陪玩陪玩头像")).toBeVisible();
  await expect(page.getByAltText("浏览器陪玩主页封面")).toBeVisible();
  await expect(page.getByRole("heading", { name: "主页介绍" })).toBeVisible();
  await expect(page.getByText("本地浏览器真实详情测试")).toBeVisible();
  await expect(page.getByText("审核展示使用提交时快照")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  const sellerApplication = await page.evaluate(async ({ base, id }) => (await fetch(`${base}/seller-applications/${id}`, { credentials: "include" })).json(), { base: apiBase, id: env("E2E_SELLER_APPLICATION_ID") });
  expect(sellerApplication.onboarding_policy).toMatchObject({ policy_type: "SELLER_ONBOARDING_AGREEMENT", version_no: 1 });
  expect(sellerApplication.voice_authorization_policy).toMatchObject({ policy_type: "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION", version_no: 1 });
  await openRealDetail(page, "陪玩管理", "浏览器陪玩", "浏览器陪玩");
  await nav(page, "商品审核").click();
  await page.getByLabel("审核状态").selectOption("");
  const serviceReviewRow = page.getByRole("row").filter({ hasText: "浏览器真实服务" });
  await expect(serviceReviewRow).toBeVisible();
  await serviceReviewRow.getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "浏览器真实服务" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "用户上传的服务图片" })).toBeVisible();
  await expect(page.getByAltText("浏览器真实服务主图")).toBeVisible();
  await expect(page.getByText("服务图片通过受控管理接口读取")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await openRealDetail(page, "商品管理", "浏览器真实服务", "浏览器真实服务");
  await openRealDetail(page, "评价管理", "浏览器真实评价内容", "浏览器真实服务");
  const linkedDetails = await page.evaluate(async ({ base, userId, orderId }) => {
    const [user, order] = await Promise.all([fetch(`${base}/users/${userId}`, { credentials: "include" }), fetch(`${base}/orders/${orderId}`, { credentials: "include" })]);
    return { user: await user.json(), order: await order.json() };
  }, { base: apiBase, userId: env("E2E_POLICY_USER_ID"), orderId: env("E2E_ORDER_ID") });
  expect(linkedDetails.user.policy_acceptances).toEqual(expect.arrayContaining([expect.objectContaining({ policy_type: "ORDER_PAYMENT_REFUND_RULES", version_no: 1, acceptance_scene: "ORDER_PAYMENT" })]));
  expect(linkedDetails.order.transaction_policy).toMatchObject({ id: env("E2E_POLICY_TRANSACTION_ID"), policy_type: "ORDER_PAYMENT_REFUND_RULES", version_no: 1 });

  await nav(page, "治理日志").click();
  await page.getByRole("button", { name: "风险事件", exact: true }).click();
  await openVisibleTableDetail(page, "BROWSER_RISK", "BROWSER_RISK");
  await page.getByRole("button", { name: "安全日志", exact: true }).click();
  // Normal login/logout security events can move the historical fixture beyond page one.
  await page.getByPlaceholder("搜索安全日志", { exact: true }).fill("BROWSER_SECURITY_EVENT");
  await openVisibleTableDetail(page, "BROWSER_SECURITY_EVENT", "BROWSER_SECURITY_EVENT");
  await page.getByRole("button", { name: "管理员", exact: true }).click();
  await openVisibleTableDetail(page, "浏览器全权管理员", "浏览器全权管理员");
  await page.getByRole("button", { name: "角色权限", exact: true }).click();
  await openVisibleTableDetail(page, "浏览器全权管理员角色", "浏览器全权管理员角色");
});

test("[real backend E2E] masked identity review and read-only Mock payments use real PostgreSQL facts", async ({ page }) => {
  await login(page, "FULL");

  await nav(page, "实名认证审核").click();
  await expect(page.getByRole("heading", { name: "实名认证审核" })).toBeVisible();
  const identityRow = page.getByRole("row").filter({ hasText: "浏览器用户 03" });
  await expect(identityRow).toContainText("浏****人");
  await expect(identityRow).toContainText("**************1234");
  await identityRow.getByRole("button", { name: "查看" }).click();
  const identityDrawer = page.locator('[class*="drawerBody"]');
  await expect(identityDrawer.getByText("浏****人")).toBeVisible();
  const identityText = await identityDrawer.textContent();
  expect(identityText).toContain("浏****人");
  expect(identityText).not.toContain("浏览器实名测试人");
  expect(identityText).not.toContain("110101199001011234");
  expect(identityText).not.toMatch(/ciphertext|document_hash|legal_name_hash/iu);
  await page.getByRole("button", { name: "关闭" }).click();

  await identityRow.getByRole("button", { name: "通过", exact: true }).click();
  const identityDialog = page.getByRole("dialog");
  await identityDialog.locator("textarea").fill("浏览器实名认证人工复核通过原因");
  const identityResponse = page.waitForResponse((response) => response.url().endsWith(`/identity-verifications/${env("E2E_IDENTITY_VERIFICATION_ID")}/review`) && response.status() === 201);
  await identityDialog.getByRole("button", { name: "确认通过" }).click();
  await identityResponse;
  await expect(page.getByText("实名认证已由服务端审核通过并记录审计")).toBeVisible();
  const staleIdentity = await postJson(page, `/identity-verifications/${env("E2E_IDENTITY_VERIFICATION_ID")}/review`, { decision: "REJECTED", version: 0, rejection_code: "STALE", rejection_reason: "过期审核", reason: "过期实名认证审核" });
  expect(staleIdentity.status).toBe(409);
  await expectAudited(page, env("E2E_RISK_TARGET_ID"), "IDENTITY_VERIFIED", "浏览器实名认证人工复核通过原因");

  await nav(page, "支付管理").click();
  await expect(page.getByRole("heading", { name: "支付管理" })).toBeVisible();
  const paymentRow = page.getByRole("row").filter({ hasText: "BROWSER-PAY-001" });
  await expect(paymentRow).toContainText("BROWSER-ORDER-001");
  await expect(paymentRow).toContainText("浏览器用户 02");
  await expect(paymentRow).toContainText("微信支付测试");
  await expect(paymentRow).toContainText("模拟支付渠道");
  await expect(paymentRow).toContainText("¥ 100.00");
  await paymentRow.getByRole("button", { name: "查看" }).click();
  const paymentDrawer = page.locator('[class*="drawerBody"]');
  await expect(paymentDrawer.getByText("BROWSER-ORDER-001")).toBeVisible();
  const paymentText = await paymentDrawer.textContent();
  expect(paymentText).toMatch(/渠道流水号/u);
  expect(paymentText).not.toMatch(/idempotency|payment-key|secret|token|cookie/iu);
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByRole("row").filter({ hasText: "BROWSER-PAY-002" })).toContainText("支付宝支付测试");
  await expect(page.getByRole("button", { name: /修改|补单|改状态|确认支付/u })).toHaveCount(0);
});

test("[real backend E2E] policy drafts, preview, publish, retire, counts and audit use real PostgreSQL facts", async ({ page }) => {
  await login(page, "FULL");
  await nav(page, "协议与隐私管理").click();
  await expect(page.getByRole("heading", { name: "协议与隐私管理" })).toBeVisible();
  await expect(page.getByText("本地测试草案，尚未法律审核")).toBeVisible();

  const transactionRow = page.getByRole("row").filter({ hasText: "订单支付退款规则" });
  await expect(transactionRow).toContainText("2");
  await transactionRow.getByRole("button", { name: "预览" }).click();
  await expect(page.locator('[class*="drawerBody"]')).toContainText("本地浏览器测试交易规则正文");
  await page.getByRole("button", { name: "关闭" }).click();

  let draftRow = page.getByRole("row").filter({ hasText: "本地隐私政策草稿" });
  await draftRow.getByRole("button", { name: "选择" }).click();
  await page.getByLabel("标题").fill("本地隐私政策草稿（已校对）");
  await page.getByLabel("协议正文").fill("本地浏览器校对后的隐私协议正文");
  await page.getByRole("button", { name: "保存草稿" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("浏览器校对协议草稿原因");
  const editResponse = page.waitForResponse((response) => response.url().endsWith(`/policies/${env("E2E_POLICY_DRAFT_ID")}`) && response.request().method() === "PATCH");
  await dialog.getByRole("button", { name: "确认保存" }).click();
  expect((await editResponse).status()).toBe(200);
  await expect(page.getByText("协议草稿已由服务端保存并审计")).toBeVisible();

  draftRow = page.getByRole("row").filter({ hasText: "本地隐私政策草稿（已校对）" });
  await expect(draftRow).toBeVisible();
  await draftRow.getByRole("button", { name: "选择" }).click();
  await page.getByLabel("计划生效时间").fill("2026-09-01T00:00");
  await page.getByLabel("要求用户重新同意").check();
  await page.getByRole("button", { name: "发布新版本" }).click();
  dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("浏览器发布隐私协议原因");
  const publishResponse = page.waitForResponse((response) => response.url().endsWith(`/policies/${env("E2E_POLICY_DRAFT_ID")}/publish`));
  await dialog.getByRole("button", { name: "确认发布" }).click();
  expect((await publishResponse).status()).toBe(201);
  await expect(page.getByText("协议版本已由服务端发布并审计")).toBeVisible();

  draftRow = page.getByRole("row").filter({ hasText: "本地隐私政策草稿（已校对）" });
  await draftRow.getByRole("button", { name: "选择" }).click();
  await expect(page.getByLabel("协议正文")).toBeDisabled();
  await page.getByRole("button", { name: "停用版本" }).click();
  dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("浏览器停用隐私协议原因");
  const retireResponse = page.waitForResponse((response) => response.url().endsWith(`/policies/${env("E2E_POLICY_DRAFT_ID")}/retire`));
  await dialog.getByRole("button", { name: "确认停用" }).click();
  expect((await retireResponse).status()).toBe(201);
  await expect(page.getByText("协议版本已由服务端停用并审计")).toBeVisible();
  await expectAudited(page, env("E2E_POLICY_DRAFT_ID"), "POLICY_DRAFT_EDITED", "浏览器校对协议草稿原因");
  await expectAudited(page, env("E2E_POLICY_DRAFT_ID"), "POLICY_PUBLISHED", "浏览器发布隐私协议原因");
  await expectAudited(page, env("E2E_POLICY_DRAFT_ID"), "POLICY_RETIRED", "浏览器停用隐私协议原因");
});

test("[real backend E2E] todos, health, selected trends and same-origin MinIO file preview remain server-controlled", async ({ page }) => {
  const trendRequests = [];
  page.on("request", (request) => { if (request.url().includes("/governance/dashboard/trends")) trendRequests.push(request.url()); });
  await login(page, "FULL");
  await expect(page.getByText(/服务端健康检查通过/u)).toBeVisible();
  await expect(page.getByText("当前权限范围内没有待办。")).toHaveCount(0);
  expect(trendRequests).toHaveLength(0);
  await page.getByLabel("开始日期").fill("2026-08-01");
  await page.getByLabel("结束日期").fill("2026-08-16");
  expect(trendRequests).toHaveLength(0);
  await page.getByRole("button", { name: "查询真实趋势" }).click();
  await expect.poll(() => trendRequests.length).toBe(1);
  await expect(page.getByRole("cell", { name: "2026-08-16" })).toBeVisible();
  await page.getByLabel("结束日期").fill("2026-08-15");
  await expect(page.getByText("日期已变更，请重新查询。")).toBeVisible();
  await expect(page.getByRole("cell", { name: "2026-08-16" })).toHaveCount(0);
  await page.getByLabel("开始日期").fill("2026-01-01");
  await page.getByLabel("结束日期").fill("2026-08-15");
  await page.getByRole("button", { name: "查询真实趋势" }).click();
  await expect(page.getByText(/最多 90 天/u)).toBeVisible();
  const cumulative = page.locator("details").filter({ has: page.locator("summary", { hasText: "累计交易" }) });
  await cumulative.locator("summary").click();
  await expect(cumulative).toHaveAttribute("open", "");
  // Two legacy ¥100 fixtures plus the new versioned-case ¥100 fixture; an open case does not erase paid GMV.
  await expect(cumulative.getByText("¥ 300.00", { exact: true })).toBeVisible();
  await expect(cumulative.locator("article").filter({ hasText: "累计订单" }).locator("b")).toHaveText("3");

  await nav(page, "文件管理").click();
  await expect(page.getByRole("heading", { name: "文件管理与人工审核" })).toBeVisible();
  const previewResponse = page.waitForResponse((response) => response.url().endsWith(`/files/${env("E2E_FILE_ID")}/preview`) && response.status() === 200);
  const fileId = env("E2E_FILE_ID");
  const fileRow = page.getByRole("row").filter({ hasText: `${fileId.slice(0, 8)}…${fileId.slice(-4)}` });
  await fileRow.getByRole("button", { name: "查看 / 审核" }).click();
  const response = await previewResponse;
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-type"]).toContain("image/png");
  const previewImage = page.getByRole("img", { name: "待审核文件预览" });
  await expect(previewImage).toBeVisible();
  expect(await previewImage.getAttribute("src")).toMatch(/^blob:/u);
  await expect.poll(() => previewImage.evaluate((image) => image.naturalWidth)).toBe(1);
  expect(page.url()).not.toMatch(/object_key|bucket|X-Amz/iu);
  const storageState = await page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) }));
  expect(storageState).not.toMatch(/object_key|bucket|X-Amz|https?:\/\//iu);

  await page.getByRole("button", { name: "通过文件" }).click();
  const decision = page.getByRole("dialog", { name: "确认文件审核" });
  await decision.locator("textarea").fill("浏览器 E2E 文件预览与审核验证");
  await expect(page.getByText("文件已通过审核，结果已写入审计日志。")).toHaveCount(0);
  await decision.getByRole("button", { name: "确认提交" }).click();
  await expect(page.getByText("文件已通过审核，结果已写入审计日志。")).toBeVisible();
  const fileAudit = await page.evaluate(async ({ base, fileId }) => (await fetch(`${base}/governance/operation-logs?target_id=${fileId}&limit=20`, { credentials: "include" })).json(), { base: apiBase, fileId: env("E2E_FILE_ID") });
  expect(fileAudit.items.some((item) => item.action === "FILE_PREVIEWED")).toBe(true);
  expect(fileAudit.items.some((item) => item.action === "FILE_APPROVED" && item.reason === "浏览器 E2E 文件预览与审核验证")).toBe(true);
  expect(JSON.stringify(fileAudit)).not.toMatch(/object_key|bucket|X-Amz|https?:\/\//iu);

  await page.getByRole("dialog", { name: /^文件详情 / }).getByRole("button", { name: "关闭", exact: true }).click();
  const reviewFileId = env("E2E_REVIEW_FILE_ID");
  const reviewRow = page.getByRole("row").filter({ hasText: `${reviewFileId.slice(0,8)}…${reviewFileId.slice(-4)}` });
  await expect(reviewRow.getByText("评价图片", { exact: true })).toBeVisible();
  await expect(reviewRow.getByText("其他业务文件", { exact: true })).toHaveCount(0);
  const reviewPreview = page.waitForResponse(response => response.url().endsWith(`/files/${reviewFileId}/preview`) && response.status() === 200);
  await reviewRow.getByRole("button", { name: "查看 / 审核" }).click();
  const reviewResponse = await reviewPreview;
  expect(reviewResponse.headers()["cache-control"]).toContain("no-store");
  const reviewDrawer = page.getByRole("dialog", { name: /^文件详情 / });
  await expect(reviewDrawer.getByText("评价图片", { exact: true })).toBeVisible();
  await expect.poll(() => reviewDrawer.getByRole("img", { name: "待审核文件预览" }).evaluate(image => image.naturalWidth)).toBe(1);
  expect(await reviewDrawer.getByRole("img").getAttribute("src")).toMatch(/^blob:/u);
  // Previewing a pending file must not silently approve it.
  await expect(reviewDrawer.getByRole("button", { name: "通过文件", exact: true })).toBeVisible();
  await page.screenshot({path:"test-results/admin-browser/review-image-purpose-isolated.png",fullPage:false});
});

test("[real backend E2E] seller, service, refund and complaint mutations enforce server state, versions and audits", async ({ page, context }) => {
  await login(page, "FULL");

  await nav(page, "陪玩审核").click();
  await performTableAction(page, { rowText: "浏览器陪玩", button: "通过", dialogTitle: "通过陪玩申请", confirm: "确认通过", reason: "浏览器陪玩批准原因", endpoint: `/seller-applications/${env("E2E_SELLER_APPLICATION_ID")}/review`, success: "陪玩审核结果已由服务端保存" });
  const conflictRow = page.getByRole("row").filter({ hasText: "浏览器待驳回陪玩" });
  await conflictRow.getByRole("button", { name: "通过", exact: true }).click();
  const conflictDialog = page.getByRole("dialog");
  await conflictDialog.locator("textarea").fill("这个过期批准请求不能覆盖最终结果");
  const otherAdminResult = await page.evaluate(async ({ base, id }) => { const response = await fetch(`${base}/seller-applications/${id}/review`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "REJECT", version: 0, reason: "其他管理员真实驳回原因" }) }); return { status: response.status, body: await response.json() }; }, { base: apiBase, id: env("E2E_REJECTED_SELLER_APPLICATION_ID") });
  expect(otherAdminResult.status).toBe(201);
  const staleResponse = page.waitForResponse((response) => response.url().endsWith(`/seller-applications/${env("E2E_REJECTED_SELLER_APPLICATION_ID")}/review`) && response.request().method() === "POST" && response.status() === 409);
  await conflictDialog.getByRole("button", { name: "确认通过" }).click();
  await staleResponse;
  await expect(conflictDialog.getByRole("alert")).toContainText("已重新读取服务端数据");
  await conflictDialog.getByRole("button", { name: "取消" }).click();
  await expect(conflictRow.getByRole("button", { name: "通过", exact: true })).toHaveCount(0);

  await nav(page, "商品审核").click();
  const productEndpoint = `/products/${env("E2E_PRODUCT_ID")}/review`;
  let productWriteCount = 0; let reachedServer; let releaseResponse;
  const reached = new Promise((resolve) => { reachedServer = resolve; });
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  await context.route(`**/admin-api/v1${productEndpoint}`, async (route) => {
    productWriteCount += 1;
    const targetUrl = new URL(route.request().url()); targetUrl.port = env("E2E_API_PORT");
    const realResponse = await route.fetch({ url: targetUrl.toString() });
    reachedServer(); await release; await route.fulfill({ response: realResponse });
  });
  const productRow = page.getByRole("row").filter({ hasText: "浏览器真实服务" });
  await productRow.getByRole("button", { name: "通过", exact: true }).click();
  const productDialog = page.getByRole("dialog");
  await productDialog.locator("textarea").fill("浏览器服务批准原因");
  const productResponse = page.waitForResponse((response) => response.url().endsWith(productEndpoint) && response.status() === 201);
  await productDialog.getByRole("button", { name: "确认通过" }).click();
  await reached;
  const submitting = productDialog.getByRole("button", { name: "提交中…" });
  await expect(submitting).toBeDisabled();
  await submitting.click({ force: true });
  expect(productWriteCount).toBe(1);
  await expect(page.getByText("商品审核结果已由服务端保存")).toHaveCount(0);
  releaseResponse();
  await productResponse;
  await expect(page.getByText("商品审核结果已由服务端保存")).toBeVisible();
  await context.unroute(`**/admin-api/v1${productEndpoint}`);
  await performTableAction(page, { rowText: "浏览器待驳回服务", button: "驳回", dialogTitle: "驳回商品审核", confirm: "确认驳回", reason: "浏览器服务驳回原因", endpoint: `/products/${env("E2E_REJECTED_PRODUCT_ID")}/review`, success: "商品审核结果已由服务端保存" });
  const staleProduct = await postJson(page, `/products/${env("E2E_PRODUCT_ID")}/review`, { action: "REJECT", version: 0, reason: "过期商品审核" });
  expect(staleProduct.status).toBe(409);

  await nav(page, "退款管理").click();
  const overAmount = await postJson(page, `/refunds/${env("E2E_APPROVED_REFUND_ID")}/decision`, { decision: "APPROVE", version: 0, approved_amount_cent: "10001", reason: "超过实付金额不应成功" });
  expect(overAmount.status).toBe(409);
  expect(overAmount.body.code).toBe("REFUND_AMOUNT_EXCEEDS_REMAINING");
  await performTableAction(page, { rowText: "BROWSER-REFUND-APPROVE", button: "批准", dialogTitle: "批准退款", confirm: "确认批准", reason: "浏览器批准退款原因", endpoint: `/refunds/${env("E2E_APPROVED_REFUND_ID")}/decision`, success: "退款处理结果已由服务端保存" });
  await performTableAction(page, { rowText: "BROWSER-REFUND-REJECT", button: "驳回", dialogTitle: "驳回退款", confirm: "确认驳回", reason: "浏览器驳回退款原因", endpoint: `/refunds/${env("E2E_REJECTED_REFUND_ID")}/decision`, success: "退款处理结果已由服务端保存" });
  const duplicateRefund = await postJson(page, `/refunds/${env("E2E_APPROVED_REFUND_ID")}/decision`, { decision: "APPROVE", version: 0, approved_amount_cent: "6000", reason: "重复退款不应触发渠道" });
  expect(duplicateRefund.status).toBe(409);

  await nav(page, "投诉管理").click();
  await performTableAction(page, { rowText: "BROWSER-COMPLAINT-001", button: "推进处理", dialogTitle: "推进投诉处理", confirm: "确认提交", reason: "浏览器受理投诉原因", endpoint: `/complaints/${env("E2E_COMPLAINT_ID")}/actions`, success: "投诉状态已由服务端更新" });
  const staleComplaint = await postJson(page, `/complaints/${env("E2E_COMPLAINT_ID")}/actions`, { version: 0, action: "START_PROCESSING", reason: "过期投诉操作" });
  expect(staleComplaint.status).toBe(409);
  await performTableAction(page, { rowText: "BROWSER-COMPLAINT-001", button: "推进处理", dialogTitle: "推进投诉处理", confirm: "确认提交", reason: "浏览器开始处理投诉", endpoint: `/complaints/${env("E2E_COMPLAINT_ID")}/actions`, success: "投诉状态已由服务端更新" });
  await performTableAction(page, { rowText: "BROWSER-COMPLAINT-001", button: "推进处理", dialogTitle: "推进投诉处理", confirm: "确认提交", reason: "浏览器完成投诉结论", endpoint: `/complaints/${env("E2E_COMPLAINT_ID")}/actions`, success: "投诉状态已由服务端更新" });

  await expectAudited(page, env("E2E_SELLER_ID"), "SELLER_REVIEW_APPROVE", "浏览器陪玩批准原因");
  await expectAudited(page, env("E2E_REJECTED_SELLER_ID"), "SELLER_REVIEW_REJECT", "其他管理员真实驳回原因");
  await expectAudited(page, env("E2E_PRODUCT_ID"), "PRODUCT_REVIEW_APPROVE", "浏览器服务批准原因");
  await expectAudited(page, env("E2E_REJECTED_PRODUCT_ID"), "PRODUCT_REVIEW_REJECT", "浏览器服务驳回原因");
  await expectAudited(page, env("E2E_APPROVED_REFUND_ID"), "REFUND_APPROVE", "浏览器批准退款原因");
  await expectAudited(page, env("E2E_REJECTED_REFUND_ID"), "REFUND_REJECT", "浏览器驳回退款原因");
  await expectAudited(page, env("E2E_COMPLAINT_ID"), "COMPLAINT_COMPLETE", "浏览器完成投诉结论");
});

// Keep the same serial business workflow and every assertion, but give each
// independently observable phase its existing 45-second budget. No retries or
// larger timeouts conceal a failed phase; later serial phases still stop.
test("[real backend E2E] support history and lost-response reply remain paged and idempotent", async ({ page }) => {
  await login(page, "FULL");

  await nav(page, "客服中心").click();
  const supportSession = page.getByRole("button").filter({ hasText: "BROWSER-SUPPORT-001" });
  await expect(supportSession).toBeVisible();
  await supportSession.click();
  await expect(page.getByText("接入后才能读取用户消息")).toBeVisible();
  await page.getByRole("button", { name: "接入工单", exact: true }).click();
  let supportDialog = page.getByRole("dialog");
  await expect(supportDialog.getByRole("heading", { name: "接入客服工单" })).toBeVisible();
  const receiveResponse = page.waitForResponse((candidate) => candidate.url().endsWith(`/support-cases/${env("E2E_SUPPORT_CASE_ID")}/receive`) && candidate.request().method() === "POST");
  await supportDialog.getByRole("button", { name: "确认接入" }).click();
  expect((await receiveResponse).status()).toBe(201);
  await expect(page.getByText("工单已接入，现在可以查看消息并回复用户。")).toBeVisible();
  await page.getByRole("button",{name:"加载更早消息"}).click();
  await expect(page.locator('[class*="supportMessages"]').getByText("用户请求人工客服",{exact:true})).toBeVisible();
  await expect(page.getByText("用户请求人工客服", { exact: true }).last()).toBeVisible();
  const messagePane=page.locator('[class*="supportMessages"]');
  await messagePane.evaluate(node=>{node.scrollTop=200;node.dispatchEvent(new Event("scroll"));});
  const previousScroll=await messagePane.evaluate(node=>node.scrollTop);
  await page.waitForResponse(response=>response.url().includes(`/support-cases/${env("E2E_SUPPORT_CASE_ID")}/messages?limit=100`)&&response.request().method()==="GET");
  expect(await messagePane.evaluate(node=>node.scrollTop)).toBe(previousScroll);
  await expect(messagePane.getByText("用户请求人工客服",{exact:true})).toBeVisible();
  const replyIds=[];
  await page.context().route(`**/admin-api/v1/support-cases/${env("E2E_SUPPORT_CASE_ID")}/reply`,async route=>{
    replyIds.push(route.request().postDataJSON().client_message_id);
    const target=new URL(route.request().url());target.port=env("E2E_API_PORT");const response=await route.fetch({url:target.toString()});expect(response.status()).toBe(201);
    if(replyIds.length===1)await route.abort("failed");else await route.fulfill({response});
  });
  await page.getByLabel("回复用户").fill("浏览器客服真实回复内容");
  await page.getByRole("button", { name: "发送回复" }).click();
  await expect(page.getByRole("alert")).toContainText("无法连接管理服务");
  const replyResponse = page.waitForResponse((candidate) => candidate.url().endsWith(`/support-cases/${env("E2E_SUPPORT_CASE_ID")}/reply`) && candidate.request().method() === "POST");
  await page.getByRole("button", { name: "发送回复" }).click();
  expect((await replyResponse).status()).toBe(201);
  expect(replyIds).toHaveLength(2);expect(replyIds[1]).toBe(replyIds[0]);
  await expect(page.getByText("回复已由服务端保存并同步给用户。")).toBeVisible();
  await expect(page.locator('[class*="supportMessages"]').getByText("浏览器客服真实回复内容", { exact: true })).toBeVisible();
  const messages = await page.evaluate(async ({ base, id }) => { const response = await fetch(`${base}/support-cases/${id}/messages?limit=100`, { credentials: "include" }); return { status: response.status, body: await response.json() }; }, { base: apiBase, id: env("E2E_SUPPORT_CASE_ID") });
  expect(messages.status).toBe(200);
  expect(messages.body.items.filter((message) => message.content === "浏览器客服真实回复内容" && message.sender_role === "ADMIN")).toHaveLength(1);
});

test("[real backend E2E] support transfer and close preserve allocation and separate audits", async ({ page }) => {
  await login(page, "FULL");
  await nav(page, "客服中心").click();
  await page.getByRole("button").filter({ hasText: "BROWSER-SUPPORT-001" }).click();
  await expect(page.getByText("你是当前接入客服", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "转交", exact: true }).click();
  let supportDialog = page.getByRole("dialog");
  await supportDialog.getByLabel("目标队列").selectOption("priority");
  await supportDialog.locator("textarea").fill("浏览器转交客服原因");
  const transferResponse = page.waitForResponse((candidate) => candidate.url().endsWith(`/support-cases/${env("E2E_SUPPORT_CASE_ID")}/transfer`) && candidate.request().method() === "POST");
  await supportDialog.getByRole("button", { name: "确认转交" }).click();
  expect((await transferResponse).status()).toBe(201);
  await expect(page.getByText("工单已完成转交。")).toBeVisible();
  await page.getByRole("button", { name: "接入工单", exact: true }).click();
  supportDialog = page.getByRole("dialog");
  const receiveAgainResponse = page.waitForResponse((candidate) => candidate.url().endsWith(`/support-cases/${env("E2E_SUPPORT_CASE_ID")}/receive`) && candidate.request().method() === "POST");
  await supportDialog.getByRole("button", { name: "确认接入" }).click();
  expect((await receiveAgainResponse).status()).toBe(201);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  supportDialog = page.getByRole("dialog");
  await supportDialog.locator("textarea").fill("浏览器关闭客服原因");
  const closeResponse = page.waitForResponse((candidate) => candidate.url().endsWith(`/support-cases/${env("E2E_SUPPORT_CASE_ID")}/close`) && candidate.request().method() === "POST");
  await supportDialog.getByRole("button", { name: "确认关闭" }).click();
  expect((await closeResponse).status()).toBe(201);
  await expect(page.getByText("工单已关闭。消息历史仍会保留。")).toBeVisible();
  await expectAudited(page, env("E2E_SUPPORT_CASE_ID"), "SUPPORT_CASE_TRANSFER", "浏览器转交客服原因");
  await expectAudited(page, env("E2E_SUPPORT_CASE_ID"), "SUPPORT_CASE_CLOSE", "浏览器关闭客服原因");
});

test("[real backend E2E] withdrawal double review preserves masks, same-admin denial and audit", async ({ page }) => {
  await login(page, "WITHDRAWAL_INITIAL");
  await nav(page, "提现管理").click();
  const approveWithdrawalRow = page.getByRole("row").filter({ hasText: "BROWSER-WITHDRAW-APPROVE" });
  await approveWithdrawalRow.getByRole("button", { name: "查看" }).click();
  const withdrawalDrawer = page.locator('[class*="drawerBody"]');
  await expect(withdrawalDrawer.getByText("bro********01")).toBeVisible();
  const serializedWithdrawal = await withdrawalDrawer.textContent();
  expect(serializedWithdrawal).not.toContain("browser-payout-account-001");
  expect(serializedWithdrawal).not.toMatch(/ciphertext|account_token_hash/iu);
  await page.getByRole("button", { name: "关闭" }).click();
  await performTableAction(page, { rowText: "BROWSER-WITHDRAW-APPROVE", button: "初审通过", dialogTitle: "提现初审通过", confirm: "确认初审通过", reason: "浏览器提现初审原因", endpoint: `/withdrawals/${env("E2E_APPROVED_WITHDRAWAL_ID")}/initial-review`, success: "提现已进入独立复核队列" });
  await performTableAction(page, { rowText: "BROWSER-WITHDRAW-REJECT", button: "驳回", dialogTitle: "驳回提现", confirm: "确认驳回", reason: "浏览器驳回提现原因", endpoint: `/withdrawals/${env("E2E_REJECTED_WITHDRAWAL_ID")}/reject`, success: "提现已由服务端驳回并释放锁定资金" });
  const duplicateInitial = await postJson(page, `/withdrawals/${env("E2E_APPROVED_WITHDRAWAL_ID")}/initial-review`, { version: 0, reason: "重复初审不应产生第二条记录" });
  expect(duplicateInitial.status).toBe(201);
  expect(duplicateInitial.body.status).toBe("RISK_REVIEW");
  const sameAdminFinal = await postJson(page, `/withdrawals/${env("E2E_APPROVED_WITHDRAWAL_ID")}/final-approve`, { version: 1, reason: "初审人不得复核" });
  expect(sameAdminFinal.status).toBe(403);
  await page.evaluate(async (base) => fetch(`${base}/auth/logout`, { method: "POST", credentials: "include" }), apiBase);
  await page.reload();
  await login(page, "WITHDRAWAL_FINAL", false);
  await nav(page, "提现管理").click();
  await performTableAction(page, { rowText: "BROWSER-WITHDRAW-APPROVE", button: "最终复核", dialogTitle: "提现最终复核", confirm: "确认最终批准", reason: "浏览器独立复核原因", endpoint: `/withdrawals/${env("E2E_APPROVED_WITHDRAWAL_ID")}/final-approve`, success: "独立复核完成，本地 Mock 打款已由服务端触发" });

  await page.evaluate(async (base) => fetch(`${base}/auth/logout`, { method: "POST", credentials: "include" }), apiBase);
  await page.reload();
  await login(page, "FULL", false);
  await expectAudited(page, env("E2E_APPROVED_WITHDRAWAL_ID"), "WITHDRAWAL_INITIAL_APPROVE", "浏览器提现初审原因");
  await expectAudited(page, env("E2E_APPROVED_WITHDRAWAL_ID"), "WITHDRAWAL_FINAL_APPROVE", "浏览器独立复核原因");
  await expectAudited(page, env("E2E_REJECTED_WITHDRAWAL_ID"), "WITHDRAWAL_REJECT", "浏览器驳回提现原因");
});

test("[real backend E2E] risk and config mutations retain versions and separate audits", async ({ page }) => {
  await login(page, "FULL");
  await nav(page, "治理日志").click();
  await page.getByRole("button", { name: "风险事件", exact: true }).click();
  await performTableAction(page, { rowText: "BROWSER_RISK", button: "处理", dialogTitle: "处理风险事件", confirm: "确认处理", reason: "浏览器风险结案结论", endpoint: `/governance/risk-events/${env("E2E_RISK_ID")}/resolve`, success: "风险事件已由服务端处理并审计" });
  const staleRisk = await postJson(page, `/governance/risk-events/${env("E2E_RISK_ID")}/resolve`, { version: 0, resolution: "重复结案", reason: "重复结案" });
  expect(staleRisk.status).toBe(409);

  await nav(page, "平台配置").click();
  await page.getByLabel("配置项").selectOption("finance.commission_rate_bps");
  await page.getByLabel(/配置值/).fill("975");
  await page.getByRole("button", { name: "发布新版本" }).click();
  const configDialog = page.getByRole("dialog");
  await configDialog.locator("textarea").fill("浏览器发布配置原因");
  const configResponse = page.waitForResponse((response) => response.url().endsWith("/governance/configs") && response.request().method() === "POST" && response.status() === 201);
  await configDialog.getByRole("button", { name: "确认发布" }).click();
  await configResponse;
  await expect(page.getByText("配置新版本已由服务端校验、发布并审计")).toBeVisible();
  const configs = await page.evaluate(async (base) => (await fetch(`${base}/governance/configs`, { credentials: "include" })).json(), apiBase);
  const configVersions = configs.filter((item) => item.config_key === "finance.commission_rate_bps").sort((left, right) => left.version_no - right.version_no);
  expect(configVersions.map((item) => [item.version_no, item.status])).toEqual([[1, "RETIRED"], [2, "ACTIVE"]]);

  await expectAudited(page, env("E2E_RISK_TARGET_ID"), "RISK_EVENT_RESOLVED", "浏览器风险结案结论");
  await expectAudited(page, configVersions[1].id, "PLATFORM_CONFIG_PUBLISHED", "浏览器发布配置原因");
});

test("[browser mock errors] empty, first failure, offline, load-more failure, 404, 403 and 409 render without stale success", async ({ page, context }) => {
  await login(page, "FULL");
  await page.route("**/admin-api/v1/users?*", async (route) => {
    if (route.request().url().includes("cursor=")) return route.fulfill(jsonResponse(500, { code: "MOCK_PAGE_FAILURE", message: "浏览器拦截的加载更多失败" }, "mock-more"));
    return route.fulfill(jsonResponse(500, { code: "MOCK_INITIAL_FAILURE", message: "浏览器拦截的首次失败" }, "mock-initial"));
  });
  await nav(page, "用户管理").click();
  await expect(page.getByRole("heading", { name: "数据读取失败" })).toBeVisible();
  await expect(page.getByText("浏览器拦截的首次失败")).toBeVisible();
  await expect(page.getByText("请求编号：mock-initial")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);

  await page.unroute("**/admin-api/v1/users?*");
  await page.route("**/admin-api/v1/users?*", (route) => route.fulfill(jsonResponse(200, { items: [], next_cursor: null })));
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByRole("heading", { name: "暂无真实业务数据" })).toBeVisible();
  await page.unroute("**/admin-api/v1/users?*");

  await page.route("**/admin-api/v1/users?*", (route) => route.abort("internetdisconnected"));
  await context.setOffline(true);
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByRole("heading", { name: "网络连接已断开" })).toBeVisible();
  await context.setOffline(false);
  await page.unroute("**/admin-api/v1/users?*");
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);

  await page.route("**/admin-api/v1/users?*", async (route) => {
    if (route.request().url().includes("cursor=")) return route.fulfill(jsonResponse(500, { code: "MOCK_PAGE_FAILURE", message: "浏览器拦截的加载更多失败" }, "mock-more"));
    return route.fallback();
  });
  await page.getByRole("button", { name: "加载更多" }).click();
  await expect(page.getByRole("alert")).toContainText("浏览器拦截的加载更多失败");
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.unroute("**/admin-api/v1/users?*");

  const targetRow = page.getByRole("row").filter({ hasText: "浏览器用户 27" });
  await page.route(`**/admin-api/v1/users/${env("E2E_TARGET_USER_ID")}`, (route) => route.fulfill(jsonResponse(404, { code: "NOT_FOUND", message: "记录不存在" }, "mock-404")), { times: 1 });
  await targetRow.getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "数据读取失败" })).toBeVisible();
  await expect(page.getByText("记录不存在")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await page.route(`**/admin-api/v1/users/${env("E2E_TARGET_USER_ID")}`, (route) => route.fulfill(jsonResponse(403, { code: "ADMIN_PERMISSION_DENIED", message: "权限不足" }, "mock-403")), { times: 1 });
  await targetRow.getByRole("button", { name: "查看" }).click();
  await expect(page.getByText("权限不足")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  let detailCalls = 0;
  const detailStatuses = [];
  const captureDetailStatus = (response) => {
    if (response.url().endsWith(`/users/${env("E2E_TARGET_USER_ID")}`)) detailStatuses.push(response.status());
  };
  page.on("response", captureDetailStatus);
  await page.route(`**/admin-api/v1/users/${env("E2E_TARGET_USER_ID")}`, async (route) => {
    detailCalls += 1;
    if (detailCalls === 1) return route.fulfill(jsonResponse(409, { code: "RESOURCE_VERSION_CONFLICT", message: "版本冲突" }, "mock-409-detail"));
    return route.fallback();
  });
  await targetRow.getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "服务端真实记录" })).toBeVisible();
  await expect(page.locator('[class*="drawerBody"]').getByText("BROWSER-27")).toBeVisible();
  await expect.poll(() => detailStatuses).toEqual(expect.arrayContaining([409, 200]));
  page.off("response", captureDetailStatus);
  await page.getByRole("button", { name: "关闭" }).click();
  await page.unroute(`**/admin-api/v1/users/${env("E2E_TARGET_USER_ID")}`);

  const enabledRow = page.getByRole("row").filter({ hasText: "浏览器用户 26" });
  await enabledRow.getByRole("button", { name: "禁用" }).click();
  const conflictDialog = page.getByRole("dialog");
  await conflictDialog.locator("textarea").fill("浏览器拦截版本冲突");
  await page.route(`**/admin-api/v1/users/*/status`, (route) => route.fulfill(jsonResponse(409, { code: "RESOURCE_VERSION_CONFLICT", message: "版本冲突" }, "mock-409-write")), { times: 1 });
  await conflictDialog.getByRole("button", { name: "确认禁用" }).click();
  await expect(conflictDialog.getByRole("alert")).toContainText("已重新读取服务端数据");
  await expect(page.getByText("用户状态已由服务端更新")).toHaveCount(0);
});

test("[browser mock errors] delayed real write prevents early success and double submission; health 5xx never claims normal", async ({ page }) => {
  await page.route("**/admin-api/v1/system/health", (route) => route.fulfill(jsonResponse(503, { code: "SYSTEM_UNAVAILABLE", message: "浏览器拦截的健康检查失败" }, "mock-health")));
  await login(page, "FULL");
  await expect(page.getByText("浏览器拦截的健康检查失败")).toBeVisible();
  await expect(page.getByText("服务端健康检查通过")).toHaveCount(0);
  await page.unroute("**/admin-api/v1/system/health");

  await nav(page, "用户管理").click();
  const targetRow = page.getByRole("row").filter({ hasText: "浏览器用户 27" });
  await targetRow.getByRole("button", { name: "解禁" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("浏览器延迟真实服务端响应验证");
  let releaseResponse;
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  let requestReachedServer;
  const reached = new Promise((resolve) => { requestReachedServer = resolve; });
  await page.route("**/admin-api/v1/users/*/status", async (route) => {
    const targetUrl = new URL(route.request().url());
    targetUrl.port = env("E2E_API_PORT");
    const realResponse = await route.fetch({ url: targetUrl.toString() });
    requestReachedServer();
    await release;
    await route.fulfill({ response: realResponse });
  }, { times: 1 });
  const confirm = dialog.getByRole("button", { name: "确认解禁" });
  await confirm.click();
  await reached;
  await expect(dialog.getByRole("button", { name: "提交中…" })).toBeDisabled();
  await expect(page.getByText("用户状态已由服务端更新")).toHaveCount(0);
  releaseResponse();
  await expect(page.getByText("用户状态已由服务端更新")).toBeVisible();
});

test("[browser mock errors] malformed HTTP success never confirms a dangerous mutation", async ({ page }) => {
  await login(page, "FULL");
  await nav(page, "用户管理").click();
  const trigger = page.getByRole("button", { name: "禁用", exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("本地无效响应故障回归，不执行真实修改");
  let writes = 0;
  await page.route("**/admin-api/v1/users/*/status", async route => {
    writes++;
    await route.fulfill({ status: 200, headers: { ...corsHeaders, "content-type": "text/html", "x-request-id": "local-invalid-json" }, body: "<html>private-local-proxy-body</html>" });
  });
  await dialog.getByRole("button", { name: "确认禁用", exact: true }).click();
  await expect(page.getByText("管理服务响应格式异常，操作结果尚未确认，请重新读取记录后核对", { exact: true })).toBeVisible();
  await expect(page.getByText("用户状态已由服务端更新", { exact: true })).toHaveCount(0);
  await expect(page.getByText("private-local-proxy-body")).toHaveCount(0);
  expect(writes).toBe(1);
  await expect(dialog.getByRole("button", { name: "确认禁用", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(writes).toBe(1);
});

test("[real backend E2E] role failures disable saving, all pages load, and stale assignments refresh", async ({ page }) => {
  await login(page,"FULL");let blocked=true;let writes=0;
  page.on("request",request=>{if(request.method()==="PATCH"&&request.url().includes("/rbac/admins/"))writes++;});
  await page.route(`${apiBase}/rbac/roles?**`,async route=>{if(blocked)await route.fulfill({status:503,headers:corsHeaders,body:JSON.stringify({code:"LOCAL_TEST_FAILURE",message:"角色列表测试故障"})});else await route.fallback();});
  await page.goto("/admin?module=logs&logs_view=admins");
  await expect(page.getByRole("alert")).toContainText("角色列表测试故障");await expect(page.getByRole("button",{name:"保存角色分配"})).toBeDisabled();expect(writes).toBe(0);
  blocked=false;await page.getByRole("button",{name:"重新加载角色数据"}).click();
  const panel=page.getByText("管理员角色分配",{exact:true}).locator("xpath=ancestor::section[1]");
  await expect(panel.getByRole("combobox")).toBeEnabled();await panel.getByRole("combobox").selectOption(env("E2E_RBAC_TARGET_ID"));
  const added=panel.getByRole("checkbox",{name:/分页运营角色104 /});await expect(added).toBeEnabled();await added.check();
  await page.getByRole("button",{name:"保存角色分配"}).click();let dialog=page.getByRole("dialog");await dialog.locator("textarea").fill("浏览器真实角色分配");
  let response=page.waitForResponse(r=>r.request().method()==="PATCH"&&r.url().endsWith(`/rbac/admins/${env("E2E_RBAC_TARGET_ID")}/roles`));await dialog.getByRole("button",{name:"确认修改"}).click();expect((await response).status()).toBe(200);await expect(dialog).toHaveCount(0);await expect(added).toBeChecked();await expectAudited(page,env("E2E_RBAC_TARGET_ID"),"RBAC_ADMIN_ROLES_UPDATED","浏览器真实角色分配");
  const mutation=await page.evaluate(async({base,id})=>{const detail=await(await fetch(`${base}/rbac/admins/${id}`,{credentials:"include"})).json();const role=detail.roles.find(r=>r.name==="分页运营角色104");const r=await fetch(`${base}/rbac/admins/${id}/roles`,{method:"PATCH",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({role_ids:[role.id],version:detail.version,reason:"并发管理端测试修改"})});return r.status;},{base:apiBase,id:env("E2E_RBAC_TARGET_ID")});expect(mutation).toBe(200);
  const extra=panel.getByRole("checkbox",{name:/分页运营角色103 /});await extra.check();await page.getByRole("button",{name:"保存角色分配"}).click();dialog=page.getByRole("dialog");await dialog.locator("textarea").fill("验证真实旧版本冲突");response=page.waitForResponse(r=>r.request().method()==="PATCH"&&r.url().endsWith(`/rbac/admins/${env("E2E_RBAC_TARGET_ID")}/roles`));await dialog.getByRole("button",{name:"确认修改"}).click();expect((await response).status()).toBe(409);await expect(dialog.getByRole("alert")).toContainText("重新读取服务端数据");await expect(extra).not.toBeChecked();await expect(added).toBeChecked();
});

test("[real backend E2E] finance export requires both permissions in navigation, button and API",async({page})=>{
  for(const variant of["FINANCEREAD","FINANCEEXPORT"]){await login(page,variant);if(variant==="FINANCEREAD"){await nav(page,"财务数据").click();await expect(page.getByRole("button",{name:"导出当前筛选 CSV"})).toHaveCount(0);}else await expect(nav(page,"财务数据")).toHaveCount(0);
    const day=new Date().toISOString().slice(0,10);const denied=await postJson(page,"/finance/exports",{from:day,to:day,reason:"浏览器验证独立权限拒绝"});expect(denied.status).toBe(403);await page.evaluate(base=>fetch(`${base}/auth/logout`,{method:"POST",credentials:"include"}),apiBase);
  }
  await login(page,"FULL");await nav(page,"财务数据").click();await expect(page.getByRole("button",{name:"导出当前筛选 CSV"})).toBeVisible();
  await page.getByRole("button",{name:"导出当前筛选 CSV"}).click();const dialog=page.getByRole("dialog");await dialog.locator("textarea").fill("浏览器财务导出权限验收");const response=page.waitForResponse(r=>r.url().endsWith("/finance/exports")&&r.request().method()==="POST");const download=page.waitForEvent("download");await dialog.getByRole("button",{name:"确认导出"}).click();const exported=await response;expect(exported.status()).toBe(201);expect(exported.headers()["content-type"]).toContain("text/csv");await download;await expect(dialog).toHaveCount(0);
});

test("[real backend E2E] finance date filters, real empty results and network retry never use demo rows",async({page})=>{
  await login(page,"FULL");await nav(page,"财务数据").click();
  await page.getByLabel("开始",{exact:true}).fill("2050-01-01");await page.getByLabel("结束",{exact:true}).fill("2050-01-01");await expect(page.getByText("暂无真实业务数据",{exact:true})).toBeVisible();
  let blocked=true;await page.route(`${apiBase}/finance/report?**`,async route=>blocked?route.abort("internetdisconnected"):route.fallback());
  await page.getByLabel("支付渠道").selectOption("ALIPAY_APP");await expect(page.getByText("无法连接管理服务，请稍后重试",{exact:true})).toBeVisible();await expect(page.getByText("暂无真实业务数据",{exact:true})).toHaveCount(0);
  blocked=false;await page.getByRole("button",{name:"重新加载",exact:true}).click();await expect(page.getByText("暂无真实业务数据",{exact:true})).toBeVisible();
  await page.getByLabel("支付状态").selectOption("REFUNDING");await expect(page.getByText("暂无真实业务数据",{exact:true})).toBeVisible();await expect(page.getByText(/渠道与支付状态筛选仅适用于支付指标/u)).toBeVisible();
});

async function performTableAction(page, { rowText, button, dialogTitle, confirm, reason, secondary, endpoint, success }) {
  const row = page.getByRole("row").filter({ hasText: rowText });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: dialogTitle })).toBeVisible();
  if (secondary !== undefined) await dialog.getByLabel("目标队列").fill(secondary);
  await dialog.locator("textarea").fill(reason);
  const response = page.waitForResponse((candidate) => candidate.url().endsWith(endpoint) && candidate.request().method() === "POST");
  await dialog.getByRole("button", { name: confirm }).click();
  const completed = await response;
  expect(completed.status(), await completed.text()).toBe(201);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(success)).toBeVisible();
}

async function postJson(page, endpoint, body) {
  return page.evaluate(async ({ base, endpoint: target, body: payload }) => {
    const response = await fetch(`${base}${target}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  }, { base: apiBase, endpoint, body });
}

async function expectAudited(page, targetId, action, reason) {
  const audit = await page.evaluate(async ({ base, targetId: target }) => (await fetch(`${base}/governance/operation-logs?target_id=${encodeURIComponent(target)}&limit=100`, { credentials: "include" })).json(), { base: apiBase, targetId });
  expect(audit.items.some((item) => item.action === action && item.reason === reason)).toBe(true);
}

test("[real backend E2E] commerce game filters and order facts preserve existing read boundaries",async({page})=>{
  await login(page,"FULL");await nav(page,"商品审核").click();await page.getByLabel("审核状态").selectOption("");
  await page.getByLabel("商品游戏").selectOption("VALORANT");
  const row=page.getByRole("row").filter({hasText:"本地契约商品"});await expect(row).toBeVisible();
  await expect(row.getByText("无畏契约",{exact:true})).toBeVisible();await expect(row.getByText("单价",{exact:true})).toBeVisible();
  await row.getByRole("button",{name:"查看"}).click();const drawer=page.getByRole("dialog");
  await expect(drawer.getByText("无畏契约",{exact:true})).toBeVisible();await expect(drawer.getByText("付款后 1天1小时1分钟1秒内",{exact:true})).toBeVisible();
  await drawer.getByRole("button",{name:"关闭"}).click();await page.getByLabel("商品游戏").selectOption("DELTA_FORCE");
  await expect(page.getByText("暂无真实业务数据",{exact:false})).toBeVisible();
  await nav(page,"订单管理").click();await page.getByLabel("订单状态").selectOption("COMPLETED");await page.getByLabel("售后状态").selectOption("NONE");
  await expect(page.getByLabel("售后状态")).toHaveValue("NONE");await page.getByLabel("售后状态").selectOption("");
  const order=page.getByRole("row").filter({hasText:"BROWSER-ORDER-001"});await expect(order).toBeVisible();await order.getByRole("button",{name:"查看"}).click();
  await expect(page.getByRole("dialog").getByText("下单平台费用快照",{exact:true})).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button",{name:/BROWSER-COMPLAINT-001/})).toBeVisible();
  await page.screenshot({path:"test-results/admin-browser/contract-order-facts.png",fullPage:false,animations:"disabled"});
  await page.getByRole("dialog").getByRole("button",{name:"关闭"}).click();
});

test("[real backend E2E] limited order and mutation-only roles cannot read unrelated facts or start hidden governance",async({page})=>{
  await login(page,"ORDERAUDIT");await nav(page,"订单管理").click();
  await page.getByRole("row").filter({hasText:"BROWSER-ORDER-001"}).getByRole("button",{name:"查看"}).click();
  await expect(page.getByRole("heading",{name:"服务端真实记录"})).toBeVisible();
  const dialog=page.getByRole("dialog");await expect(dialog.getByText("下单平台费用快照",{exact:true})).toHaveCount(0);await expect(dialog.getByRole("button",{name:/BROWSER-REFUND/})).toHaveCount(0);
  await expect(dialog.getByRole("button",{name:/BROWSER-COMPLAINT-001/})).toBeVisible();
  await page.goto("/admin");await logout(page);await login(page,"GOVERNANCEONLY");await nav(page,"投诉管理").click();
  const complaint=page.getByRole("row").filter({hasText:"BROWSER-COMPLAINT-001"});await expect(complaint).toBeVisible();
  await expect(complaint.getByRole("button",{name:"禁用用户"})).toHaveCount(0);await expect(complaint.getByRole("button",{name:"关联订单"})).toHaveCount(0);
});

test("[browser mock errors] linked governance read failure retries, closing does not write, and conflict never replays automatically",async({page,context})=>{
  await login(page,"FULL");await nav(page,"投诉管理").click();
  let reads=0,writes=0,failRead=true;
  const routePattern="**/admin-api/v1/users/**";
  await context.route(routePattern,async route=>{
    if(route.request().method()==="PATCH"){writes++;await route.fulfill(jsonResponse(409,{code:"VERSION_CONFLICT",message:"本地故障注入版本冲突"}));return;}
    reads++;if(failRead){await route.fulfill(jsonResponse(503,{code:"LOCAL_TEST_READ_FAILURE",message:"本地故障注入读取失败"}));return;}await route.fallback();
  });
  const row=page.getByRole("row").filter({hasText:"BROWSER-COMPLAINT-001"});await row.getByRole("button",{name:"禁用用户"}).click();
  await expect(page.getByRole("alert")).toContainText("本地故障注入读取失败");expect(writes).toBe(0);
  failRead=false;await page.getByRole("button",{name:"重新读取关联对象"}).click();await expect(page.getByRole("heading",{name:"禁用关联用户"})).toBeVisible();
  await page.getByRole("button",{name:"取消",exact:true}).click();expect(writes).toBe(0);
  await row.getByRole("button",{name:"禁用用户"}).click();await page.getByRole("dialog").locator("textarea").fill("本地隔离版本冲突测试");await page.getByRole("button",{name:"确认治理",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("目标已变化");expect(writes).toBe(1);expect(reads).toBeGreaterThanOrEqual(4);
  await page.getByRole("button",{name:"取消",exact:true}).click();await context.unroute(routePattern);
});

async function logout(page) {
  await page.getByRole("button",{name:/管理员账户：/}).click();
  await page.getByRole("button",{name:"退出登录",exact:true}).click();
  await expect(page.getByRole("heading",{name:"管理员登录",exact:true})).toBeVisible();
}

async function login(page, variant, navigate = true) {
  if (navigate) await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
  await page.getByLabel("账号").fill(env(`E2E_${variant}_USERNAME`));
  await page.getByLabel("密码").fill(env(`E2E_${variant}_PASSWORD`));
  await page.getByRole("button", { name: "安全登录" }).click();
  await expect(page.getByRole("heading", { name: "安全验证" })).toBeVisible();
  await page.getByLabel("动态验证码").fill(totpCode(env("E2E_TOTP_SECRET")));
  await page.getByRole("button", { name: "完成验证" }).click();
  await expect(page.getByText(/浏览器.*管理员|浏览器.*观察员|浏览器.*审计员|浏览器.*只读员/u).first()).toBeVisible();
}

function nav(page, label) {
  return page.locator('nav[aria-label="后台模块"] button').filter({ hasText: label });
}

async function openRealDetail(page, navLabel, rowText, drawerTitle) {
  await nav(page, navLabel).click();
  await openVisibleTableDetail(page, rowText, drawerTitle);
}

async function openVisibleTableDetail(page, rowText, drawerTitle) {
  const row = page.getByRole("row").filter({ hasText: rowText });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: drawerTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: "服务端真实记录" })).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
}

function jsonResponse(status, body, requestId = "browser-mock") {
  return { status, headers: { ...corsHeaders, "x-request-id": requestId }, body: JSON.stringify(body) };
}

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing browser E2E runtime value: ${name}`);
  return value;
}
