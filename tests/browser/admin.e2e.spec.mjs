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

test.beforeEach(async ({ context }) => {
  const targetPort = env("E2E_API_PORT");
  await context.route(`${apiBase}/**`, async (route) => {
    const targetUrl = new URL(route.request().url());
    targetUrl.port = targetPort;
    const response = await route.fetch({ url: targetUrl.toString() });
    await route.fulfill({ response });
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
    ["实名认证审核", ["通过", "驳回"]], ["陪玩审核", ["通过", "驳回"]], ["服务审核", ["通过", "驳回"]], ["退款管理", ["批准", "驳回"]],
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
  await nav(page, "服务审核").click();
  const serviceReviewRow = page.getByRole("row").filter({ hasText: "浏览器真实服务" });
  await expect(serviceReviewRow).toBeVisible();
  await serviceReviewRow.getByRole("button", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "浏览器真实服务" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "用户上传的服务图片" })).toBeVisible();
  await expect(page.getByAltText("浏览器真实服务主图")).toBeVisible();
  await expect(page.getByText("服务图片通过受控管理接口读取")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await openRealDetail(page, "服务管理", "浏览器真实服务", "浏览器真实服务");
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
  await expect(page.getByText("¥ 200.00").first()).toBeVisible();

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

  await nav(page, "服务审核").click();
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
  await expect(page.getByText("服务审核结果已由服务端保存")).toHaveCount(0);
  releaseResponse();
  await productResponse;
  await expect(page.getByText("服务审核结果已由服务端保存")).toBeVisible();
  await context.unroute(`**/admin-api/v1${productEndpoint}`);
  await performTableAction(page, { rowText: "浏览器待驳回服务", button: "驳回", dialogTitle: "驳回服务审核", confirm: "确认驳回", reason: "浏览器服务驳回原因", endpoint: `/products/${env("E2E_REJECTED_PRODUCT_ID")}/review`, success: "服务审核结果已由服务端保存" });
  const staleProduct = await postJson(page, `/products/${env("E2E_PRODUCT_ID")}/review`, { action: "REJECT", version: 0, reason: "过期服务审核" });
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

test("[real backend E2E] support, withdrawal, risk and config operations complete against PostgreSQL and local mock providers", async ({ page }) => {
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
  await expect(page.getByText("用户请求人工客服", { exact: true }).last()).toBeVisible();
  await page.getByLabel("回复用户").fill("浏览器客服真实回复内容");
  const replyResponse = page.waitForResponse((candidate) => candidate.url().endsWith(`/support-cases/${env("E2E_SUPPORT_CASE_ID")}/reply`) && candidate.request().method() === "POST");
  await page.getByRole("button", { name: "发送回复" }).click();
  expect((await replyResponse).status()).toBe(201);
  await expect(page.getByText("回复已由服务端保存并同步给用户。")).toBeVisible();
  await expect(page.locator('[class*="supportMessages"]').getByText("浏览器客服真实回复内容", { exact: true })).toBeVisible();
  const messages = await page.evaluate(async ({ base, id }) => { const response = await fetch(`${base}/support-cases/${id}/messages?limit=100`, { credentials: "include" }); return { status: response.status, body: await response.json() }; }, { base: apiBase, id: env("E2E_SUPPORT_CASE_ID") });
  expect(messages.status).toBe(200);
  expect(messages.body.items.some((message) => message.content === "浏览器客服真实回复内容" && message.sender_role === "ADMIN")).toBe(true);
  await page.getByRole("button", { name: "转交", exact: true }).click();
  supportDialog = page.getByRole("dialog");
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

  await page.evaluate(async (base) => fetch(`${base}/auth/logout`, { method: "POST", credentials: "include" }), apiBase);
  await page.reload();
  await login(page, "WITHDRAWAL_INITIAL", false);
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

  await expectAudited(page, env("E2E_SUPPORT_CASE_ID"), "SUPPORT_CASE_TRANSFER", "浏览器转交客服原因");
  await expectAudited(page, env("E2E_SUPPORT_CASE_ID"), "SUPPORT_CASE_CLOSE", "浏览器关闭客服原因");
  await expectAudited(page, env("E2E_APPROVED_WITHDRAWAL_ID"), "WITHDRAWAL_INITIAL_APPROVE", "浏览器提现初审原因");
  await expectAudited(page, env("E2E_APPROVED_WITHDRAWAL_ID"), "WITHDRAWAL_FINAL_APPROVE", "浏览器独立复核原因");
  await expectAudited(page, env("E2E_REJECTED_WITHDRAWAL_ID"), "WITHDRAWAL_REJECT", "浏览器驳回提现原因");
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
    return route.continue();
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
