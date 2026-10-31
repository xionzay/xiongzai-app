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
    "companion", "service", "specs", "favorites", "allReviews", "reviewDetail",
    "messages", "notifications", "notificationDetail", "chat", "customerService",
    "checkout", "payment", "paymentResult", "orders", "orderDetail",
    "refundApply", "refundDetail", "complaint", "complaintDetail", "review",
    "transactionStates", "mine", "buyerProfile", "coupons", "editProfile",
    "privacySecurity", "rules", "settings", "globalStates",
  ];
  const sellerPages = [
    "sellerApplyForm", "sellerApplyStatus", "seller", "sellerProfile",
    "sellerPublish", "sellerServices", "sellerServiceEdit", "sellerOrders",
    "sellerOrderDetail", "sellerEarnings", "incomeDetails", "withdraw",
    "payoutAccounts", "withdrawals", "sellerStateMatrix",
  ];
  for (const route of [...buyerPages, ...sellerPages]) {
    assert.match(page, new RegExp(`case "${route}"|page: "${route}"`), `missing route ${route}`);
  }
  assert.match(page, /买家端、陪玩中心与全局状态已整合/);
  assert.match(page, /支付成功/);
  assert.match(page, /投诉与平台介入/);
  assert.match(page, /收益提现/);
  assert.match(page, /系统通知/);
  assert.match(page, /投诉详情/);
  assert.match(page, /收款账户管理/);
  assert.match(page, /<ConnectedProductForm request=\{apiRequest\}/);
  const form = await readFile(new URL("../app/seller-workbench/ConnectedProductForm.tsx", import.meta.url), "utf8");
  for (const label of ["ConnectedFiles", "保存草稿", "提交商品审核"]) assert.ok(form.includes(label));
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
    "ui-star-outline.jpg", "ui-coupon-outline.jpg", "ui-person-outline.jpg",
    "ui-star-latest.jpg", "ui-coupon-latest.jpg", "ui-star-rounded.jpg", "ui-coupon-rounded.jpg",
  ].map((name) => access(new URL(`../public/assets/${name}`, import.meta.url))));
});

test("includes the refined buyer and seller interactions", async () => {
  const [page, css, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  const search = await readFile(new URL("../app/SearchDiscovery.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ SearchDiscovery, SearchToolbar \} from "\.\/SearchDiscovery"/);
  assert.match(page, /<SearchDiscovery\b/);
  assert.match(page, /<SearchToolbar\b/);
  assert.match(search, /className="discovery-scope" role="group" aria-label="搜索范围"/);
  assert.match(search, /aria-pressed=\{scope === item\}/);
  assert.match(search, /onClick=\{\(\) => onDraft\(item, query\)\}/);
  const [description, actions, profiles, form, payment] = await Promise.all([
    "ProductDetailUi.tsx", "ProductDetailUi.tsx", "storefront/ProfileEditor.tsx",
    "seller-workbench/ConnectedProductForm.tsx", "ConnectedTransaction.tsx",
  ].map(path => readFile(new URL("../app/" + path, import.meta.url), "utf8")));
  assert.match(page, /搜索店铺|搜索商品|搜索店铺名称/);
  for (const marker of ["refund-reason-menu", "complaint-type-menu", "apply-media-upload", "RatingStar", "formatCent(spec.priceCent)", "payment-account-switch"]) assert.ok(page.includes(marker), marker);
  // The earnings calendar now lives in a dedicated component. Verify the real
  // connection instead of restoring an obsolete class to the page source.
  const [revenue, dateRange] = await Promise.all(["seller-workbench/RevenueDashboard.tsx", "seller-workbench/RevenueDateRange.tsx"].map(path => readFile(new URL("../app/" + path, import.meta.url), "utf8")));
  assert.match(page, /<RevenueDashboard rows=\{data.rows\}/);
  assert.match(revenue, /<RevenueDateRange start=\{start\} end=\{end\} today=\{today\} onChange=/);
  assert.match(dateRange, /className="revenue-date-range" role="group" aria-label="自定义收益日期范围"/);
  assert.match(description, /description/);
  assert.match(actions, /favorite/); assert.match(actions, /unavailable/);
  for (const field of ["seller_nickname", "introduction", "game_rank", "voice_file_id"]) assert.ok(profiles.includes(field), field);
  assert.match(profiles, /validateProfile/); assert.match(profiles, /revisionPayload/);
  assert.match(profiles, /voiceSelected.includes/); assert.match(profiles, /\/policies\/acceptances/);
  assert.match(form, /game/); assert.match(form, /fulfillment_seconds/);
  assert.match(form, /pricing_mode/); assert.match(form, /提交商品审核/);
  assert.match(page, /ProductReviewPreview/); assert.match(page, /hasNoSpecs/);
  assert.match(page, /detailState\?\.error/);
  assert.match(payment, /WECHAT_APP/); assert.match(payment, /ALIPAY_APP/);
  assert.match(payment, /result.payment.order_id === order.id/);
  assert.match(page, /<RatingStar selected=\{star <= rating\}/);
  assert.doesNotMatch(page, /className="seller-publish-fixed"/);
  assert.match(page, /counts\[name\] \?\? 0/);
  assert.match(dateRange, /\(\['start', 'end'\] as const\)\.map\(key/);
  assert.match(dateRange, /onChange\(field, draft\)/);
  assert.match(css, /\.chat-messages \.message \{ align-items: center; \}/);
  assert.match(css, /\.profile-fields \.profile-nickname-field input[^}]+text-align: left/);
  assert.match(css, /\.income-filters button \{ height: 42px; font-size: 13px; \}/);
  assert.match(css, /\.buyer-assets \.nav-favorite::before/);
  assert.match(css, /\.product-hero \{ height: auto; aspect-ratio: 1 \/ 1; \}/);
  assert.match(css, /\.withdraw-record-list article b \{ font-size: 23px; \}/);
  assert.match(css, /\.withdraw-form label > div:focus-within/);
  assert.match(css, /\.big-search i \{ font-size: 28px/);
  assert.match(css, /\.chat-input \{ height: calc\(58px \+ var\(--device-safe-bottom\)\)/);
  assert.match(css, /\.buyer-assets \.favorite-upload \{ background: var\(--orange\)/);
  assert.match(css, /\.buyer-assets \.coupon-upload \{ background: var\(--blue\)/);
  assert.match(css, /\.publish-cover button \{ min-width: 96px; height: 44px/);
  assert.match(css, /\.store-actions \.nav-symbol > img \{[\s\S]*filter: none;[\s\S]*mix-blend-mode: multiply;/);
  assert.match(css, /\.spec-full\.selected \{[\s\S]*border-color: var\(--orange\)/);
  assert.match(css, /\.buyer-assets \.favorite-upload \{ background: #ffb3a3; \}/);
  assert.match(css, /\.buyer-assets \.coupon-upload \{ background: #acdafe; \}/);
  assert.match(css, /\.seller-buyer-order-actions button \{ font-size: 13px; \}/);
  assert.match(css, /\.rating-panel > div \{ gap: 10px; \}/);
  assert.match(css, /\.rating-star-svg \{[\s\S]*width: 46px;[\s\S]*height: 46px;/);
  assert.match(css, /\.rating-panel button\.active \{ background: transparent; clip-path: none; \}/);
  assert.match(css, /\.buyer-assets \.favorite-upload,\.buyer-assets \.coupon-upload \{[\s\S]*clip-path: none;/);
  assert.match(css, /\.seller-service-tabs \{ display: grid; grid-template-columns: repeat\(2,1fr\)/);
  assert.match(css, /--device-safe-top:\s*max\(env\(safe-area-inset-top, 0px\), 12px\)/);
  assert.match(css, /padding-bottom:\s*calc\(88px \+ var\(--device-safe-bottom\)\)/);
  assert.match(css, /\.bottom-nav \{[\s\S]*height:\s*calc\(86px \+ var\(--device-safe-bottom\)\)/);
  assert.match(layout, /viewportFit:\s*"cover"/);
});

test("includes the latest page-scoped accessibility polish", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.complaint-detail-screen \.case-timeline > \.section-title \{[\s\S]*display: flex;[\s\S]*writing-mode: horizontal-tb;/);
  assert.match(css, /\.privacy-screen \.security-list button,[\s\S]*min-height: 72px;/);
  assert.match(css, /\.settings-screen \.identity-settings button b,[\s\S]*font-size: 15px;/);
  assert.match(css, /\.companion-screen \.store-actions \.follow-action,[\s\S]*background: transparent!important;[\s\S]*box-shadow: none!important;/);
  assert.match(css, /\.companion-action-icon \{[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.companion-action-label \{[\s\S]*align-items: center;[\s\S]*min-height: 34px;/);
  assert.match(css, /\.companion-message-svg \{[\s\S]*color: #2f8fe5;/);
  assert.match(css, /\.service-actions \.favorite-service-action,[\s\S]*color: #ff5a1f;/);
  assert.match(css, /\.favorite-companion-list \.shop-copy \{[\s\S]*grid-template-rows: 22px 19px 32px 20px;/);
  assert.match(css, /\.seller-apply-form-screen \.apply-form \.apply-media-upload \{[\s\S]*aspect-ratio: 1 \/ 1;/);
  assert.match(css, /\.payment-result-screen \.result-hero > span \{[\s\S]*transform: none;/);
  assert.match(css, /\.privacy-switch-list button\[role="switch"\] \{[\s\S]*height: 22px;/);
  assert.match(css, /\.seller-order-detail-screen \.order-facts span \{[\s\S]*font-size: 13px;/);
  assert.match(css, /\.seller-refund-screen \.seller-refund-evidence p \{[\s\S]*font-size: 13px;/);
  assert.match(css, /\.withdrawal-detail-screen \.withdrawal-detail-facts b \{[\s\S]*font-size: 14px;/);
  assert.match(css, /\.seller-service-edit-screen \.edit-review-notice b \{[\s\S]*font-size: 14px;/);
  assert.match(css, /\.withdraw-screen \.withdraw-form label > div:focus-within \{[\s\S]*box-shadow: none;/);
  assert.match(css, /\.withdraw-screen \.withdraw-form label > div > input:focus-visible \{[\s\S]*outline: 0!important;[\s\S]*box-shadow: none!important;/);
  assert.match(css, /\.payout-accounts-screen \.account-list article > button \{[\s\S]*border: 1px solid #7eb6e5;[\s\S]*font-size: 12px;/);
  assert.match(css, /\.search-results-screen \.result-search em \{[\s\S]*font-size: 13px;/);
  assert.match(css, /\.seller-screen \.header-actions \.icon-button,[\s\S]*place-items: center;/);
});

test("covers every newly completed MVP state route and PRD transition", async () => {
  const [page, css, prd] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../docs/熊崽电竞-和平精英C2C游戏陪玩交易平台-PRD-V2.0.md", import.meta.url), "utf8"),
  ]);
  const routes = [
    "agreementDetail", "authGuard", "serviceUnavailable", "bookingSchedule", "paymentExceptions",
    "paymentProcessing", "paymentFailure", "paymentCancelled", "paymentClosed",
    "orderPendingPayment", "orderAccepted", "orderInService", "orderPendingConfirm", "orderCompleted",
    "orderReviewed", "orderCancelled", "orderSellerRejected", "orderAfterSale", "orderRefunded",
    "refundRejected", "refundPlatform", "refundProcessing", "refundCompleted", "refundClosed",
    "complaintEvidence", "complaintCompleted", "complaintClosed",
    "reviewStates", "chatStates", "mediaWorkflow", "permissionCenter",
    "phoneSecurity", "privacySettings", "dataExport", "accountCancellation",
    "sellerApplyReview", "sellerApplySupplement", "sellerApplyRejected", "sellerApplySuspended",
    "serviceAuditDetail", "sellerOrderAccepted", "sellerOrderInService", "sellerOrderPendingConfirm", "sellerOrderCompleted",
    "sellerOrderClosed", "sellerOrderRefunded", "sellerRefund", "withdrawalDetail",
    "emptySearch", "emptyOrders", "emptyMessages", "emptyFavorites", "emptyIncome", "restrictedAccess",
  ];
  for (const route of routes) assert.match(page, new RegExp(`case "${route}"`), `missing completed route ${route}`);
  assert.match(page, /function PaymentProcessingScreen/);
  assert.match(page, /function ServiceAuditDetailScreen/);
  assert.match(page, /function SellerRefundScreen/);
  assert.match(page, /function WithdrawalDetailScreen/);
  assert.match(page, /function CustomerServiceScreen/);
  assert.match(page, /function ContextStateScreen/);
  assert.match(page, /function AgreementDetailScreen/);
  assert.match(page, /function BookingScheduleScreen/);
  assert.match(page, /function ServiceUnavailableScreen/);
  assert.match(page, /function PaymentExceptionsScreen/);
  assert.match(page, /function MediaWorkflowScreen/);
  assert.match(page, /function PermissionCenterScreen/);
  assert.match(page, /function ChatStatesScreen/);
  assert.match(page, /function ReviewStatesScreen/);
  assert.match(page, /const \[acceptedPolicyIds, setAcceptedPolicyIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(page, /"\/auth\/sms\/login"[\s\S]*policy_version_ids: acceptedPolicyIds/);
  assert.match(css, /\.flow-overlay/);
  assert.match(css, /\.security-subpage-screen/);
  assert.match(css, /\.context-state-body/);
  assert.match(css, /\.booking-slots button\.active/);
  assert.match(css, /\.disabled-purchase-bar/);
  assert.match(css, /\.media-canvas/);
  assert.match(css, /\.permission-list/);
  assert.match(css, /\.order-state-accepted/);
  assert.match(prd, /B39 \| 注销账号/);
  assert.match(prd, /B40 \| 平台客服/);
  assert.match(prd, /B43 \| 预约时间/);
  assert.match(prd, /B47 \| 消息发送全状态/);
  assert.doesNotMatch(prd, /\| B36 \| 登录设备管理/);
  assert.doesNotMatch(prd, /\| B39 \| 黑名单管理/);
  assert.match(prd, /S17 \| 服务审核详情/);
  assert.match(prd, /S19 \| 卖家订单待开始/);
  assert.match(prd, /G09 \| 媒体上传与裁剪/);
  assert.match(prd, /G10 \| 系统权限说明/);
  assert.match(prd, /状态页跳转补充/);
});

test("connects login, profile, privacy, policy and identity screens to the real API without browser token storage", async () => {
  const [page, controller] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/src/identity-user.controllers.ts", import.meta.url), "utf8"),
  ]);
  for (const endpoint of [
    "/auth/sms/send", "/auth/sms/login", "/auth/token/refresh", "/auth/logout",
    "/me/profile", "/me/privacy-settings", "/me/identity-verification",
    "/policies/current", "/policies/acceptances",
  ]) assert.match(page, new RegExp(endpoint.replaceAll("/", "\\/")), `missing API connection ${endpoint}`);
  assert.match(page, /credentials:\s*"include"/);
  assert.match(controller, /token_transport:\s*"http_only_cookie"/);
  assert.doesNotMatch(page, /localStorage\.(setItem|getItem)\([^)]*(access|refresh|token)/i);
});

test("connects buyer checkout, payment, order views and seller fulfillment actions to the real API", async () => {
  const [page, orderController, sellerController] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/src/order-payment.controllers.ts", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/src/seller-product.controllers.ts", import.meta.url), "utf8"),
  ]);
  for (const endpoint of [
    "/orders/preview", "/orders", "/seller/orders", "/availability",
  ]) assert.match(page, new RegExp(endpoint.replaceAll("/", "\\/")), `missing transaction UI connection ${endpoint}`);
  assert.match(page, /"idempotency-key"/);
  const payment = await readFile(new URL("../app/ConnectedTransaction.tsx", import.meta.url), "utf8");
  assert.match(payment, /payment_channel: channel/);
  assert.match(payment, /current.payment_status === 'PAID'/);
  assert.match(payment, /result.payment.order_id === order.id/);
  assert.match(page, /<ConnectedPayment request=\{apiRequest\}/);
  assert.match(payment, /WECHAT_APP/);
  assert.match(payment, /ALIPAY_APP/);
  assert.match(page, /discount_cent/);
  assert.doesNotMatch(page, /Number\(BigInt\([^)]*(?:cent|amount)/u);
  assert.match(orderController, /Idempotency-Key 必须为 8 到 128 个字符/);
  for (const route of ["accept", "start", "complete"]) assert.match(orderController, new RegExp(`:orderId/${route}`));
  assert.match(sellerController, /:sellerId\/availability/);
});

test("does not replace empty core API responses with demo transactions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /const buyerOrders\s*=/);
  assert.doesNotMatch(page, /const fallbackVisible\s*=/);
  assert.match(page, /useState<Companion\[\]>\(\[\]\)/);
  assert.match(page, /useState<Service\[\]>\(\[\]\)/);
  assert.match(page, /className="paper-panel live-data-state failed"/);
  assert.match(page, /onRetry=\{\(\) => void loadDiscovery\(\)\}/);
  assert.doesNotMatch(page, /favoriteCompanions\s*\?\?\s*companions/u);
  assert.doesNotMatch(page, /favoriteServices\s*\?\?\s*services/u);
});

test("connects chat, support cases and notifications to the real API", async () => {
  const [page, controller] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/src/chat-support-notification.controllers.ts", import.meta.url), "utf8"),
  ]);
  for (const endpoint of [
    "/conversations/consultations", "/conversations/orders",
    "/support-cases", "/notifications?limit=50", "/notifications/${item.id}/read",
  ]) assert.ok(page.includes(endpoint), `missing chat UI connection ${endpoint}`);
  assert.match(page, /client_message_id/);
  assert.match(page, /last_read_sequence_no/);
  assert.match(page, /loadCursorItems<ConversationApiView>\("\/conversations"\)/);
  assert.match(page, /loadCursorItems<SupportCaseApiView>\("\/support-cases"\)/);
  assert.match(page, /cursor = page\.next_cursor/);
  assert.match(page, /while \(cursor\)/);
  assert.match(controller, /evidence-view/);
  assert.match(controller, /RequirePermissions\("conversation\.evidence\.read"\)/);
});

test("preserves account lifecycle implementations while keeping the approved local-test entry points closed", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const endpoint of ["/me/phone-change-requests", "/me/data-exports", "/download", "/me/account-cancellations/eligibility", "/me/account-cancellations"])
    assert.ok(page.includes(endpoint), `missing account lifecycle API ${endpoint}`);
  assert.match(page, /\$\{side\}-code\/send/u);
  assert.match(page, /\$\{side\}-code\/verify/u);
  for (const label of ["验证当前手机号", "验证新手机号", "个人数据下载", "服务端实时条件", "撤销注销申请"])
    assert.match(page, new RegExp(label, "u"));
  assert.match(page, /手机号换绑暂未开放/u);
  const capabilities = await readFile(new URL("../app/local-test-capabilities.ts", import.meta.url), "utf8");
  assert.match(capabilities, /localAccountLifecycleEnabled = false/u);
  assert.match(page, /localAccountLifecycleEnabled \? <DataExportWorkflowScreen/u);
  assert.match(page, /localAccountLifecycleEnabled \? <AccountCancellationWorkflowScreen/u);
});

test("connects refunds, complaints and immutable reviews to the real API", async () => {
  const [page, controller] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/api/src/after-sale.controllers.ts", import.meta.url), "utf8"),
  ]);
  for (const endpoint of ["/refunds", "/seller/refunds", "/complaints", "/reviews", "/reviews?limit=100"]) {
    assert.ok(page.includes(endpoint), `missing after-sale UI connection ${endpoint}`);
  }
  assert.match(page, /requested_amount_cent/);
  assert.match(page, /target_type:\s*"ORDER"/);
  assert.match(controller, /approved_amount_cent/);
  assert.match(controller, /:complaintId\/evidences/);
  assert.match(controller, /rating:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(5\)/);
  assert.match(controller, /:reviewId\/moderation/);
  assert.doesNotMatch(page, />修改后重新提交<\/button>/);
  assert.match(page, /同一订单不能重新提交第二条评价/);
});

test("web companion voice uses the controlled short-lived API instead of an animation placeholder", async () => {
  const page = await readFile(new URL("../app/storefront/PublicStorefront.tsx", import.meta.url), "utf8");
  assert.match(page, /\/companions\/\$\{seller\.id\}\/voice/u);
  assert.match(page, /result\.access\.url/u);
  assert.match(page, /<audio src=\{voice\} controls autoPlay/u);
  assert.doesNotMatch(page, /localStorage|sessionStorage|console\./u);
});

test("live service cards use API seller facts instead of a static catalog seller fallback", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /sellerName: row\.seller\?\.seller_nickname/);
  assert.match(source, /service\.sellerName \?\?/);
  assert.match(source, /serviceCounts\.get\(row\.id\)/);
});

test("connects seller income, payout accounts and withdrawals to bigint finance APIs", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const endpoint of ["/seller/finance/summary", "/seller/finance/incomes", "/seller/finance/liabilities", "/seller/payout-accounts", "/seller/withdrawals"]) {
    assert.ok(page.includes(endpoint), `missing finance UI connection ${endpoint}`);
  }
  assert.match(page, /amount_cent:amountCent/);
  assert.match(page, /"idempotency-key"/);
  assert.match(page, /提现申请已提交，收益已按 FIFO 锁定/);
  assert.doesNotMatch(page, /const fee = Number\(amount/);
});

test("covers the local-test payment and explicit policy consent remediation", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const route of ["policyCenter", "policyAcceptances", "sellerPolicyConfirm", "paymentTimeout"]) {
    assert.match(page, new RegExp(`case "${route}"`), `missing remediation route ${route}`);
    assert.match(page, new RegExp(`page: "${route}"`), `missing remediation catalog item ${route}`);
  }
  const payment = await readFile(new URL("../app/ConnectedTransaction.tsx", import.meta.url), "utf8");
  assert.match(payment, /useState<Payment\['channel'\] \| ''>\(''\)/);
  assert.match(payment, /本地模拟，不真实扣款/);
  assert.match(payment, /模拟成功/);
  assert.match(payment, /mockEnabled && active/);
  assert.match(page, /支付确认超时/);
  assert.match(page, /policyError/);
  assert.match(page, /acceptSelectedPolicies\("ORDER_PAYMENT"/);
  assert.match(page, /不会默认勾选/);
  assert.match(page, /function PolicyCenterScreen/);
  assert.match(page, /function PolicyAcceptancesScreen/);
  assert.match(page, /function SellerPolicyConfirmScreen/);
  assert.match(page, /acceptSelectedPolicies\("SELLER_ONBOARDING"/);
  assert.match(page, /acceptSelectedPolicies\("IDENTITY_VERIFICATION"/);
  assert.match(page, /acceptSelectedPolicies\("VOICE_SAMPLE_UPLOAD"/);
  const profile = await readFile(new URL("../app/storefront/ProfileEditor.tsx", import.meta.url), "utf8");
  assert.match(profile, /声音名片/);
  assert.match(profile, /voicePolicies.some/);
  assert.match(profile, /暂不提供重新录音/);
  assert.doesNotMatch(page, /银行卡/);
  assert.match(page, /account_type==="WECHAT"\|\|item\.account_type==="ALIPAY"/);
  assert.match(css, /\.payment-methods > button\.selected/);
  assert.match(css, /\.policy-document-state\.failed/);
  assert.match(css, /\.auth-form \.agreement-check > label/);
  assert.match(css, /grid-template-columns: 24px minmax\(0, 1fr\)/);
  assert.match(css, /\.auth-form \.agreement-check > label > button[\s\S]*min-height: 48px/);
  assert.match(css, /var\(--device-safe-bottom\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /min-height: 44px/);
});
