import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

async function renderAdmin() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("admin-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/admin", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the protected admin route", async () => {
  const response = await renderAdmin();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /熊崽电竞/);
  assert.match(html, /管理后台 · 熊崽电竞/);
});

test("keeps the top-right administrator identity inside its account control", async () => {
  const css = await source("../app/admin/admin.module.css");
  assert.match(css, /\.adminProfile>span:first-child \{/);
  assert.match(css, /\.adminProfile>span:first-child:before \{/);
  assert.match(css, /\.adminProfile>span:first-child:after \{/);
  assert.match(css, /\.adminProfile>span:nth-child\(2\) \{ min-width:0;max-width:126px;/);
  assert.match(css, /\.adminProfile b \{[^}]*text-overflow:ellipsis;[^}]*white-space:nowrap;/);
  assert.match(css, /\.adminProfile small \{ display:none; \}/);
  assert.doesNotMatch(css, /\.adminProfile>span \{/);
});

test("keeps all admin modules and routes their data through the shared admin API", async () => {
  const [page, support, sellerReview, serviceReview, api] = await Promise.all([source("../app/admin/page.tsx"), source("../app/admin/support-workspace.tsx"), source("../app/admin/seller-review-drawer.tsx"), source("../app/admin/service-review-drawer.tsx"), source("../app/admin/admin-api.ts")]);
  const adminSource = `${page}\n${support}\n${sellerReview}\n${serviceReview}`;
  const modules = ["数据总览", "用户管理", "手机号换绑记录", "数据导出任务", "账号注销", "实名认证审核", "陪玩审核", "陪玩管理", "服务审核", "服务管理", "订单管理", "支付管理", "退款管理", "投诉管理", "客服中心", "站内通知记录", "评价管理", "财务数据", "提现管理", "文件管理", "协议与隐私管理", "平台配置", "操作日志"];
  for (const name of modules) assert.match(page, new RegExp(name), `missing admin module ${name}`);
  for (const endpoint of ["/auth/session", "/users?", "/phone-change-requests?", "/data-export-jobs?", "/account-cancellations?", "/identity-verifications?", "/seller-applications", "/product-reviews", "/catalog/sellers", "/catalog/products", "/orders?", "/payments?", "/refunds", "/complaints", "/support-cases?", "/notification-deliveries?", "/reviews?", "/finance/ledger-transactions", "/finance/reconciliation-runs", "/withdrawals", "/policies", "/governance/configs", "/governance/risk-events", "/governance/security-logs", "/governance/operation-logs", "/todos", "/system/health", "/governance/dashboard/trends"])
    assert.ok(adminSource.includes(endpoint), `missing protected API ${endpoint}`);
  assert.match(api, /credentials: "include"/);
  assert.doesNotMatch(adminSource, /fetch\s*\(/);
  assert.doesNotMatch(adminSource, /localStorage|sessionStorage/);
});

test("empty and failed API responses never fall back to demo business records", async () => {
  const page = await source("../app/admin/page.tsx");
  assert.match(page, /function arrayPayload/);
  assert.match(page, /setRows\(next\); setNextCursor\([^;]+\); setState\(next\.length \? "success" : "empty"\)/);
  assert.match(page, /setRows\(\[\]\); setNextCursor\(null\); setFailure\(problem\); setState\(problem\.state\)/);
  assert.doesNotMatch(page, /const (sellerApps|serviceRows|supportSessions|initialSupportMessages|initialLogs|tableConfigs)/);
  assert.doesNotMatch(page, /SA2026|SV2026|CS2026|LOG-|林鹿鹿|Kirito|¥ 28,640|¥ 182,960|¥ 786,420/);
  assert.doesNotMatch(page, /状态演示|演示数据|已按所选日期重新计算/);
});

test("centralizes 401, 403, request ID and network error handling", async () => {
  const [page, api] = await Promise.all([source("../app/admin/page.tsx"), source("../app/admin/admin-api.ts")]);
  assert.match(api, /response\.status === 401/);
  assert.match(api, /emit\(\{ type: "session-expired" \}\)/);
  assert.match(api, /response\.status === 403|cause\.status === 403/);
  assert.match(api, /ADMIN_NETWORK_OFFLINE/);
  assert.match(api, /ADMIN_NETWORK_UNAVAILABLE/);
  assert.match(api, /x-request-id/);
  assert.match(page, /subscribeAdminApi/);
  assert.match(page, /管理员会话已失效|setSession\(null\)/);
  assert.match(page, /failure\?\.requestId/);
  assert.doesNotMatch(page, /REQ-2026|requestId:\s*"[A-Za-z0-9-]+"/);
});

test("refreshes real records on 409 and only reports success after the server resolves", async () => {
  const page = await source("../app/admin/page.tsx");
  assert.match(page, /cause instanceof AdminApiError && cause\.status === 409/);
  assert.match(page, /await options\.reload\(\)/);
  assert.match(page, /记录版本发生冲突，已重新读取服务端数据/);
  assert.match(page, /try \{ await request\(\); await options\.reload\(\); showToast\(options\.success\); \}/);
  assert.doesNotMatch(page, /setLogs\(|initialLogs|fakeAudit|mockSuccess/);
});

test("hides navigation and management actions using session permissions", async () => {
  const page = await source("../app/admin/page.tsx");
  for (const permission of ["dashboard.read", "user.read", "identity.read", "seller_application.read", "product.read", "order.read", "payment.read", "refund.read", "complaint.read", "support.read", "review.read", "finance.read", "withdrawal.read", "file.read", "policy.read", "config.read", "risk.read", "security_log.read", "admin_log.read", "global_search.read"])
    assert.ok(page.includes(`"${permission}"`), `missing read permission ${permission}`);
  for (const permission of ["user.status.manage", "identity.review", "seller_application.review", "seller.status.manage", "product.review", "refund.manage", "complaint.manage", "support.manage", "support.reply", "review.manage", "finance.manage", "finance.export", "withdrawal.review.initial", "withdrawal.review.final", "policy.manage", "config.manage", "risk.manage"])
    assert.ok(page.includes(`permissions.has("${permission}")`), `missing action permission ${permission}`);
  assert.match(page, /NAV\.filter\(\(item\) => hasPermission\(permissions, item\.permissions\)\)/);
  assert.match(page, /allowedNav\.some\(\(item\) => item\.id === active\)/);
});

test("uses the real todo API for navigation and notifications without fixed counts", async () => {
  const page = await source("../app/admin/page.tsx");
  assert.match(page, /adminApiRequest<TodoResponse>\("\/todos"/);
  assert.match(page, /todoCountByModule\.get\(item\.id\)/);
  assert.match(page, /notificationCount > 0/);
  assert.match(page, /todos \? todoCountByModule\.get\("files"\) \?\? 0 : null/);
  assert.doesNotMatch(page, /系统运行正常|99\.98%|少于 8 分钟|count:\s*\d+/);
  assert.doesNotMatch(page, /CartoonDatePicker|className=\{styles\.dateControl\}|selectedDate|className=\{styles\.customRange\}/);
});

test("reports real asynchronous queue facts without claiming worker or scheduler liveness", async () => {
  const service = await source("../apps/api/src/admin-governance.service.ts");
  assert.match(service, /FROM outbox_events WHERE status='PENDING'/u);
  assert.match(service, /FROM scheduled_jobs WHERE status='PENDING'/u);
  assert.match(service, /process_liveness:"NOT_MEASURED"/u);
  assert.match(service, /Worker任务队列/u);
  assert.match(service, /Scheduler任务队列/u);
  assert.match(service, /进程在线状态未测量/u);
});

test("uses real detail endpoints and clears stale drawer data before each request", async () => {
  const [page, sellerReview, serviceReview] = await Promise.all([source("../app/admin/page.tsx"), source("../app/admin/seller-review-drawer.tsx"), source("../app/admin/service-review-drawer.tsx")]);
  const adminSource = `${page}\n${sellerReview}\n${serviceReview}`;
  for (const path of ["/users/${row.id}", "/account-cancellations/${row.id}", "/identity-verifications/${row.id}", "/seller-applications/${row.id}", "/sellers/${id}", "/products/${id}", "/payments/${row.id}", "/reviews/${row.id}", "/governance/operation-logs/${id}", "/governance/risk-events/${id}", "/governance/security-logs/${id}", "/rbac/admins/${id}", "/rbac/roles/${id}"])
    assert.ok(adminSource.includes(path), `missing real detail path ${path}`);
  assert.match(page, /setData\(null\); setState\("loading"\)/);
  assert.match(page, /controller\.abort\(\)/);
  assert.match(page, /retryConflict && cause instanceof AdminApiError && cause\.status === 409/);
  assert.match(page, /await read\(false\)/);
  assert.match(page, /key=\{detail\.path \?\? detail\.title\}/);
});

test("uses signed cursor load-more and preserves loaded rows when the next page fails", async () => {
  const [page, files] = await Promise.all([source("../app/admin/page.tsx"), source("../app/admin/file-management.tsx")]);
  assert.match(page, /sort=\$\{sort\}/);
  assert.match(page, /最新优先/);
  assert.match(page, /cursor=\$\{encodeURIComponent\(nextCursor\)\}/);
  assert.match(page, /setRows\(\(current\) => \{/);
  assert.match(page, /setMoreFailure\(adminFailure\(cause\)\)/);
  assert.doesNotMatch(page, /setMoreFailure[^\n]+setRows\(\[\]\)/);
  assert.match(files, /next_cursor/);
  assert.match(files, /query\.set\("sort", sort\)/);
  assert.match(files, /load\(nextCursor\)/);
  assert.match(files, /target_id=\$\{encodeURIComponent\(file\.id\)\}/);
  assert.doesNotMatch(files, /limit=100|all\.filter/);
});

test("health and trends use explicit permissions, safe failures, and user-selected dates", async () => {
  const page = await source("../app/admin/page.tsx");
  assert.match(page, /permissions\.has\("system_health\.read"\)/);
  assert.match(page, /if \(!canReadHealth\)/);
  assert.match(page, /adminApiRequest<SystemHealth>\("\/system\/health"/);
  assert.match(page, /服务端报告组件不可用/);
  assert.match(page, /async function queryTrend\(\)/);
  assert.match(page, /type="date"/);
  assert.match(page, /days > 90/);
  assert.match(page, /onClick=\{\(\) => void queryTrend\(\)\}/);
  assert.doesNotMatch(page, /7天|30天|最近七天|最近三十天/);
});

test("keeps safe module and non-sensitive filter URL state with server-side governance filtering", async () => {
  const [page, support, files, urlState] = await Promise.all([source("../app/admin/page.tsx"), source("../app/admin/support-workspace.tsx"), source("../app/admin/file-management.tsx"), source("../app/admin/url-state.ts")]);
  const pageModules = `${page}\n${support}`;
  assert.match(page, /URLSearchParams\(window\.location\.search\)\.get\("module"\)/);
  assert.match(page, /history\.replaceState/);
  for (const parameter of ["sort", "users_status", "account_cancellation_status", "identity_status", "orders_view", "orders_status", "payments_status", "support_status", "finance_view", "logs_view", "trend_from", "trend_to"])
    assert.ok(pageModules.includes(`"${parameter}"`), `missing safe URL parameter ${parameter}`);
  for (const parameter of ["files_upload_status", "files_moderation_status"])
    assert.ok(files.includes(`"${parameter}"`), `missing safe file URL parameter ${parameter}`);
  assert.match(urlState, /allowedValues\.includes\(candidate\)/);
  assert.match(urlState, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
  assert.doesNotMatch(urlState, /localStorage|sessionStorage/);
  assert.doesNotMatch(page, /useSafeUrlChoice\("(?:query|keyword|phone|reason)"/i);
  assert.match(page, /active\.path\}\?limit=20/);
  assert.doesNotMatch(page, /JSON\.stringify\(row\)\.toLowerCase\(\)/);
});

test("protects details from sensitive fields and keeps file previews in memory", async () => {
  const [page, files, api, css] = await Promise.all([source("../app/admin/page.tsx"), source("../app/admin/file-management.tsx"), source("../app/admin/admin-api.ts"), source("../app/admin/admin.module.css")]);
  assert.match(page, /const SENSITIVE_KEY/);
  assert.match(page, /function sanitizeRecord/);
  assert.match(page, /const sanitized = sanitizeRecord\(data\) as ApiRecord/u);
  assert.match(page, /<RecordFields data=\{sanitized\}/u);
  assert.doesNotMatch(page, /password_hash|phone_ciphertext|account_token_ciphertext|secret_access_key|database_url/i);
  assert.match(files, /permissions\.includes\("file\.read"\)/);
  assert.match(files, /permissions\.includes\("file\.review"\)/);
  assert.match(files, /permissions\.includes\("admin_log\.read"\)/);
  assert.match(files, /adminApiBlob\(`\/files\/\$\{encodeURIComponent\(file\.id\)\}\/preview`\)/);
  assert.match(files, /URL\.createObjectURL\(blob\)/);
  assert.match(files, /URL\.revokeObjectURL/);
  assert.match(files, /缺少 file\.review 权限，未请求文件字节/);
  assert.match(files, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(files, /\/files\/\$\{encodeURIComponent\(file\.id\)\}\/access|presigned|signed_url|localStorage|sessionStorage|console\.|object_key|secret_access/i);
  assert.match(api, /AdminApiError/);
  assert.match(api, /export async function adminApiBlob/);
  assert.match(css, /\.filePreview/);
  assert.match(css, /\.fileDecision/);
});

test("keeps audited reasons and version fields on dangerous writes", async () => {
  const page = await source("../app/admin/page.tsx");
  assert.match(page, /current_status: row\.status, next_status: next, version: row\.version, reason/);
  assert.match(page, /decision, version: row\.version/);
  assert.match(page, /rejection_code: "MANUAL_REJECTED", rejection_reason: reason/);
  assert.match(page, /approved_amount_cent: row\.requested_amount_cent/);
  assert.match(page, /version: row\.version, decision/);
  assert.match(page, /version: row\.version, action, reason/);
  assert.match(page, /version: row\.version, reason/);
  assert.match(page, /reasonRequired: true/);
  assert.match(page, /evidence-view/);
});

test("keeps account cancellation facts read-only and exposes only a versioned audited rejection", async () => {
  const [page, controller, service] = await Promise.all([
    source("../app/admin/page.tsx"), source("../apps/api/src/user-lifecycle.controllers.ts"), source("../apps/api/src/user-lifecycle.service.ts"),
  ]);
  const cancellationModule = page.slice(page.indexOf("function AccountCancellationsModule"), page.indexOf("function IdentityReviewModule"));
  assert.match(cancellationModule, /列表和详情只读/);
  assert.match(cancellationModule, /不能批准、强制注销、改手机号或绕过服务端阻塞条件/);
  assert.match(cancellationModule, /body: JSON\.stringify\(\{ version: row\.version, reason \}\)/);
  assert.match(cancellationModule, /reasonRequired: true/);
  assert.match(cancellationModule, /canReject && row\.status === "REQUESTED"/);
  assert.doesNotMatch(cancellationModule, /\/approve|\/complete|phone-change|new_phone|current_status|next_status/);
  assert.match(controller, /@Get\(":id"\) @RequirePermissions\("user\.read"\)/);
  assert.match(controller, /@Post\(":id\/reject"\) @RequirePermissions\("user\.status\.manage"\)/);
  assert.match(controller, /reason: z\.string\(\)\.trim\(\)\.min\(2\)/);
  assert.match(service, /ACCOUNT_CANCELLATION_REJECTED/);
  assert.match(service, /blocker_codes: await this\.cancellationBlockers/);
  assert.doesNotMatch(service, /async admin(?:Approve|Complete|Force)Cancellation/);
});

test("keeps identity review masked and payment governance read-only in local Mock mode", async () => {
  const page = await source("../app/admin/page.tsx");
  const paymentModule = page.slice(page.indexOf("function PaymentsModule"), page.indexOf("const POLICY_TYPES"));
  assert.match(page, /legal_name_mask/);
  assert.match(page, /document_mask/);
  assert.doesNotMatch(page, /legal_name_ciphertext|document_number_ciphertext|document_number_hash/);
  assert.match(paymentModule, /微信支付测试/);
  assert.match(paymentModule, /支付宝支付测试/);
  assert.match(paymentModule, /模拟支付渠道/);
  assert.match(paymentModule, /支付单只读展示/);
  assert.doesNotMatch(paymentModule, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
  assert.match(page, /account_type: "WECHAT" \| "ALIPAY"/);
  assert.doesNotMatch(page, /account_type:\s*"BANK"|银行卡/);
});

test("renders a real support chat workspace and controlled service image previews", async () => {
  const [support, serviceReview] = await Promise.all([source("../app/admin/support-workspace.tsx"), source("../app/admin/service-review-drawer.tsx")]);
  for (const endpoint of ["/support-cases?", "/messages?limit=100", "/reply", "/receive", "/transfer", "/close"])
    assert.ok(support.includes(endpoint), `missing support API ${endpoint}`);
  assert.match(support, /aria-label="回复用户"/);
  assert.match(support, /5_000/);
  assert.match(support, /assigned_admin_id === adminId/);
  assert.match(support, /回复已由服务端保存并同步给用户/);
  assert.doesNotMatch(support, /initialSupportMessages|演示消息|mockSuccess|localStorage|sessionStorage/);

  assert.match(serviceReview, /adminApiRequest<ServiceDetail>\(`\/products\/\$\{productId\}`/);
  assert.match(serviceReview, /adminApiBlob\(`\/files\/\$\{encodeURIComponent\(image\.file_id\)\}\/preview`/);
  assert.match(serviceReview, /URL\.createObjectURL\(blob\)/);
  assert.match(serviceReview, /URL\.revokeObjectURL/);
  assert.match(serviceReview, /用户上传的服务图片/);
  assert.match(serviceReview, /!canPreviewMedia/);
  assert.match(serviceReview, /未发出图片预览请求/);
  assert.match(serviceReview, /该服务没有上传主图|当前服务没有绑定任何图片/);
  assert.doesNotMatch(serviceReview, /presigned|signed_url|object_key|演示图片|localStorage|sessionStorage/i);
});

test("renders seller application profile media from the immutable submitted snapshot", async () => {
  const sellerReview = await source("../app/admin/seller-review-drawer.tsx");
  assert.match(sellerReview, /adminApiRequest<SellerApplicationDetail>\(`\/seller-applications\/\$\{applicationId\}`/);
  assert.match(sellerReview, /snapshot\.seller_avatar_file_id/);
  assert.match(sellerReview, /snapshot\.cover_file_id/);
  assert.match(sellerReview, /snapshot\?\.seller_nickname/);
  assert.match(sellerReview, /snapshot\.introduction/);
  assert.match(sellerReview, /adminApiBlob\(`\/files\/\$\{encodeURIComponent\(item\.fileId\)\}\/preview`/);
  assert.match(sellerReview, /URL\.createObjectURL\(blob\)/);
  assert.match(sellerReview, /URL\.revokeObjectURL/);
  for (const label of ["陪玩头像", "陪玩昵称", "主页介绍", "主页封面", "声音名片", "审核展示使用提交时快照"]) assert.match(sellerReview, new RegExp(label));
  for (const label of ["当前公开版本与待审核版本", "审核通过才会发布新主页", "已修改"]) assert.match(sellerReview, new RegExp(label));
  for (const marker of ["媒体版本对比", "current-avatar", "proposed-avatar", "current-cover", "proposed-cover", "current-voice", "proposed-voice"]) assert.match(sellerReview, new RegExp(marker));
  assert.doesNotMatch(sellerReview, /presigned|signed_url|object_key|演示图片|localStorage|sessionStorage/i);
});

test("renders recursive Chinese detail fields and only loads protected media on demand", async () => {
  const page = await source("../app/admin/page.tsx");
  assert.match(page, /服务端真实记录/u);
  assert.match(page, /function RecordFields/u);
  assert.match(page, /FIELD_LABELS/u);
  assert.match(page, /未知状态（\$\{value\}）/u);
  assert.match(page, /detailMediaReferences/u);
  assert.match(page, /点击后读取，未点击时不会请求文件内容/u);
  assert.match(page, /adminApiBlob\(`\/files\/\$\{encodeURIComponent\(reference\.fileId\)\}\/preview`/u);
  assert.match(page, /URL\.revokeObjectURL/u);
  assert.match(page, /当前管理员没有文件读取与审核权限，未发出文件预览请求/u);
  for (const label of ["实名认证", "风险记录", "安全记录", "账号治理历史"]) assert.match(page, new RegExp(label, "u"));
});

test("governs policy drafts and immutable published versions through dedicated permissions", async () => {
  const [page, controller, service, migration] = await Promise.all([
    source("../app/admin/page.tsx"), source("../apps/api/src/policy-governance.controller.ts"),
    source("../apps/api/src/policy-governance.service.ts"), source("../packages/database/migrations/0006_policy_version_bindings.sql"),
  ]);
  assert.match(page, /本地测试草案，尚未法律审核/);
  assert.match(page, /acceptance_count/);
  assert.match(page, /requires_reacceptance/);
  assert.match(page, /\/policies\/\$\{row\.id\}\/publish/);
  assert.match(page, /\/policies\/\$\{row\.id\}\/retire/);
  assert.match(controller, /RequirePermissions\("policy\.read"\)/);
  assert.match(controller, /RequirePermissions\("policy\.manage"\)/);
  assert.match(service, /POLICY_DRAFT_CREATED/);
  assert.match(service, /POLICY_DRAFT_EDITED/);
  assert.match(service, /POLICY_PUBLISHED/);
  assert.match(service, /POLICY_RETIRED/);
  assert.match(migration, /published or accepted policy version is immutable/);
  assert.match(migration, /user_policy_acceptances_append_only/);
});

test("requires verified identity for seller review and retains manual media governance", async () => {
  const [seller, storage, afterSale, finance, financeContracts] = await Promise.all([
    source("../apps/api/src/seller-product.service.ts"),
    source("../apps/api/src/file-storage.service.ts"),
    source("../apps/api/src/after-sale.service.ts"),
    source("../apps/api/src/finance.controllers.ts"),
    source("../packages/contracts/src/finance.ts"),
  ]);
  assert.match(seller, /eq\(identityVerifications\.status, "VERIFIED"\)/);
  assert.match(seller, /SELLER_IDENTITY_REQUIRED/);
  for (const type of ["USER_AVATAR", "SELLER_AVATAR", "SELLER_COVER", "PRODUCT_IMAGE", "VOICE_SAMPLE"])
    assert.match(storage, new RegExp(type), `missing governed file type ${type}`);
  assert.match(seller, /row\.moderationStatus === "APPROVED"/);
  assert.match(afterSale, /eq\(files\.fileType, "COMPLAINT_EVIDENCE"\)/);
  assert.match(storage, /FILE_APPROVED/);
  assert.match(storage, /FILE_REJECTED/);
  assert.match(finance, /account_type:z\.enum\(payoutAccountTypes\)/);
  assert.match(financeContracts, /payoutAccountTypes = \["WECHAT", "ALIPAY"\] as const/);
  assert.doesNotMatch(`${finance}\n${financeContracts}`, /account_type:z\.enum\([^\n]*BANK|payoutAccountTypes[^\n]*BANK/);
});

test("retains the existing admin visual assets", async () => {
  const css = await source("../app/admin/admin.module.css");
  assert.match(css, /@media\(max-width:1280px\)/);
  assert.match(css, /\.modalBackdrop/);
  assert.match(css, /\.detailDrawer/);
  await Promise.all(["home", "mine", "shield", "service", "order", "wallet", "favorite", "withdraw", "setting", "message"].map((name) => access(new URL(`../public/assets/admin-icons/icon-${name}.png`, import.meta.url))));
});
