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
  assert.match(page, /0 张可用/);
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
  assert.match(page, /search-scope-select/);
  assert.match(page, /搜索陪玩昵称或ID/);
  assert.match(page, /result-scope-label/);
  assert.doesNotMatch(page, /className="segmented result-tabs"/);
  assert.match(page, /refund-reason-menu/);
  assert.match(page, /complaint-type-menu/);
  assert.match(page, /const \[phone, setPhone\] = useState\(""\)/);
  assert.match(page, /placeholder="请输入手机号码"/);
  assert.match(page, /placeholder="请输入陪玩昵称"/);
  assert.match(page, /placeholder="介绍擅长模式、服务风格和沟通特点"/);
  assert.match(page, /placeholder="填写当前段位和星级"/);
  assert.match(page, /已下\{spec\.sold\}单/);
  assert.match(page, /咨询陪玩/);
  assert.match(page, /ui-star-rounded\.jpg/);
  assert.match(page, /ui-coupon-rounded\.jpg/);
  assert.match(page, /function RatingStar\(\{ selected \}/);
  assert.match(page, /function CompanionFavoriteIcon\(\{ selected \}/);
  assert.match(page, /fill=\{selected \? color : "transparent"\}/);
  assert.match(page, /aria-pressed=\{favorite\}/);
  assert.match(page, /className="companion-message-svg"/);
  assert.match(page, /strokeWidth="6" strokeLinejoin="round"/);
  assert.match(page, /className="icon-action consult-service-action"/);
  assert.match(page, /className=\{`icon-action favorite-service-action/);
  assert.match(page, /className="message-order-notice-icon" src="\/assets\/icon-order\.png"/);
  assert.match(page, /className="apply-media-upload"/);
  assert.match(page, /<RatingStar selected=\{star <= rating\}/);
  assert.match(page, /type RatingStarState = "StarOutline" \| "StarFilled"/);
  assert.match(page, /fill=\{state === "StarFilled" \? RATING_STAR_COLOR : "transparent"\}/);
  assert.match(page, /stroke=\{RATING_STAR_COLOR\}/);
  assert.match(page, /strokeLinejoin="round" strokeLinecap="round"/);
  assert.doesNotMatch(page, /<b>服务内容<\/b>/);
  assert.match(page, /卖家自主设计/);
  assert.match(page, /availability-menu/);
  assert.match(page, /formatCent\(order\.priceCent\)/);
  assert.match(page, /服务已提交审核，可在审核中查看/);
  assert.match(page, /counts\[name\] \?\? 0/);
  assert.doesNotMatch(page, /className="seller-publish-fixed"/);
  assert.match(page, /ui-person-outline\.jpg/);
  assert.match(page, /等待陪玩响应/);
  assert.match(page, /formatCent\(spec\.priceCent\)/);
  assert.match(page, /选择陪玩可接单的时间/);
  assert.match(page, /payment-account-switch/);
  assert.match(page, /range === "累计" \? <section className="earnings-date-range"/);
  assert.match(page, /type="date" value=\{effectiveStart\}/);
  assert.match(page, /type="date" value=\{customEnd\}/);
  assert.doesNotMatch(page, /EarningsPicker label=/);
  assert.match(page, /预计 24h 内/);
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
    "/orders/preview", "/orders", "/payments", "/mock-confirm", "/seller/orders", "/availability",
  ]) assert.match(page, new RegExp(endpoint.replaceAll("/", "\\/")), `missing transaction UI connection ${endpoint}`);
  assert.match(page, /"idempotency-key"/);
  assert.match(page, /payment_channel:\s*paymentChannel/);
  assert.match(page, /WECHAT_APP/);
  assert.match(page, /ALIPAY_APP/);
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
    "/conversations?limit=50", "/conversations/consultations", "/conversations/orders",
    "/support-cases", "/notifications?limit=50", "/notifications/${item.id}/read",
  ]) assert.ok(page.includes(endpoint), `missing chat UI connection ${endpoint}`);
  assert.match(page, /client_message_id/);
  assert.match(page, /last_read_sequence_no/);
  assert.match(page, /CursorResponse<SupportCaseApiView>/);
  assert.match(page, /page\.items\.find/);
  assert.match(controller, /evidence-view/);
  assert.match(controller, /RequirePermissions\("conversation\.evidence\.read"\)/);
});

test("connects web account lifecycle pages to real APIs without unavailable placeholders", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const endpoint of ["/me/phone-change-requests", "/me/data-exports", "/download", "/me/account-cancellations/eligibility", "/me/account-cancellations"])
    assert.ok(page.includes(endpoint), `missing account lifecycle API ${endpoint}`);
  assert.match(page, /\$\{side\}-code\/send/u);
  assert.match(page, /\$\{side\}-code\/verify/u);
  for (const label of ["验证当前手机号", "验证新手机号", "个人数据下载", "服务端实时条件", "撤销注销申请"])
    assert.match(page, new RegExp(label, "u"));
  assert.doesNotMatch(page, /手机号换绑暂未开放|数据导出暂未开放|账号注销暂未开放/u);
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\/companions\/\$\{seller\.id\}\/voice/u);
  assert.match(page, /response\.access\.url/u);
  assert.match(page, /audioRef\.current/u);
  assert.match(page, /await audio\.play\(\)/u);
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
  assert.match(page, /const \[channel, setChannel\] = useState<"微信支付" \| "支付宝" \| null>\(null\)/);
  assert.match(page, /本地测试支付/);
  assert.match(page, /不会发起真实扣款/);
  assert.match(page, /支付确认超时/);
  assert.match(page, /协议加载失败，已禁止继续支付/);
  assert.match(page, /不会默认勾选/);
  assert.match(page, /function PolicyCenterScreen/);
  assert.match(page, /function PolicyAcceptancesScreen/);
  assert.match(page, /function SellerPolicyConfirmScreen/);
  assert.match(page, /acceptSelectedPolicies\("SELLER_ONBOARDING"/);
  assert.match(page, /acceptSelectedPolicies\("IDENTITY_VERIFICATION"/);
  assert.match(page, /acceptSelectedPolicies\("VOICE_SAMPLE_UPLOAD"/);
  assert.match(page, /录制 \/ 试听 \/ 上传/);
  assert.match(page, /\["未上传", "上传中", "审核中", "可试听", "未通过"\]/);
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
