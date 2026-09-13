import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { allPoliciesConfirmed, togglePolicyConfirmation } from "../src/features/account/policy-confirmation-domain";
import type { PolicyApiView } from "../src/types/api";

const mobileRoot = fileURLToPath(new URL("..", import.meta.url));
const source = (relative: string) => readFileSync(join(mobileRoot, relative), "utf8");

const policies: PolicyApiView[] = [
  { id: "policy-a", policy_type: "USER_SERVICE_AGREEMENT", title: "用户服务协议", content: "测试草案", version_no: 1, published_at: "2026-08-27T00:00:00.000Z" },
  { id: "policy-b", policy_type: "PRIVACY_POLICY", title: "隐私政策", content: "测试草案", version_no: 2, published_at: "2026-08-27T00:00:00.000Z" }
];

test("协议确认没有默认勾选，且必须逐份确认当前服务端版本", () => {
  assert.equal(allPoliciesConfirmed(undefined, []), false);
  assert.equal(allPoliciesConfirmed([], []), false);
  assert.equal(allPoliciesConfirmed(policies, []), false);
  assert.equal(allPoliciesConfirmed(policies, ["policy-a"]), false);
  assert.equal(allPoliciesConfirmed(policies, ["policy-a", "policy-b"]), true);
  assert.deepEqual(togglePolicyConfirmation([], "policy-a"), ["policy-a"]);
  assert.deepEqual(togglePolicyConfirmation(["policy-a", "policy-b"], "policy-a"), ["policy-b"]);
});

test("协议与隐私中心覆盖全部清单，并提供真实接受记录页面", () => {
  const center = source("src/features/account/rules-screen.tsx");
  const detail = source("src/features/account/policy-detail-screen.tsx");
  const records = source("src/features/account/policy-acceptance-records-screen.tsx");
  const api = source("src/features/account/account-api.ts");
  const route = "app/settings/policy-acceptances.tsx";
  for (const type of [
    "USER_SERVICE_AGREEMENT", "PRIVACY_POLICY", "PERSONAL_INFORMATION_COLLECTION_LIST",
    "THIRD_PARTY_SDK_SHARING_LIST", "SYSTEM_PERMISSION_NOTICE", "MINOR_PROTECTION_NOTICE",
    "ORDER_PAYMENT_REFUND_RULES", "CHAT_CONTENT_MANAGEMENT_RULES", "SELLER_ONBOARDING_AGREEMENT",
    "SELLER_FULFILLMENT_RULES", "SERVICE_FEE_SETTLEMENT_WITHDRAWAL_RULES",
    "IDENTITY_INFORMATION_SEPARATE_CONSENT", "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION",
    "COMPLAINT_DISPUTE_RULES"
  ]) assert.match(center, new RegExp(type, "u"));
  assert.equal(existsSync(join(mobileRoot, route)), true);
  assert.match(api, /\/policies\/current/u);
  assert.match(api, /\/policies\/acceptances/u);
  assert.match(records, /在线确认并同意/u);
  assert.match(center, /本地测试后端发布的协议草案/u);
  assert.match(detail, /LOCAL TEST POLICY/u);
  assert.match(detail, /不代表正式商业签署、第三方电子签或真实渠道授权/u);
  assert.doesNotMatch(detail, /OFFICIAL POLICY/u);
  assert.match(records, /StateView kind="loading"/u);
  assert.match(records, /StateView kind="error"/u);
  assert.match(records, /StateView kind="empty"/u);
  assert.doesNotMatch(api, /acceptCurrentPolicies/u);
});

test("订单确认和收银台均由服务端发布规则阻断，支付渠道及重试保持正确", () => {
  const confirm = source("src/features/checkout/confirm-order-screen.tsx");
  const cashier = source("src/features/checkout/payment-screen.tsx");
  assert.match(confirm, /usePolicies\("ORDER_PAYMENT"\)/u);
  assert.match(confirm, /协议不可用时不能继续创建订单或支付/u);
  assert.match(confirm, /pathname: "\/policies\/\[id\]"/u);
  assert.match(cashier, /\["WECHAT_APP", "ALIPAY_APP"\]/u);
  assert.match(cashier, /createPayment\(current\.id, paymentChannel, session\.paymentKey!\)/u);
  assert.match(cashier, /retryPayment\?\.channel \?\? selectedChannel/u);
  assert.match(cashier, /acceptPolicies\(confirmedPolicyIds, "ORDER_PAYMENT"\)/u);
  assert.match(cashier, /PolicyConfirmationList/u);
  assert.match(cashier, /协议不可用时不会创建支付/u);
  assert.match(cashier, /测试支付，不会真实扣款/u);
});

test("陪玩入驻按场景逐份在线确认，包含投诉规则且有声音名片时强制声音授权", () => {
  const application = source("src/features/seller/seller-application-screen.tsx");
  for (const scene of ["SELLER_ONBOARDING", "IDENTITY_VERIFICATION", "VOICE_SAMPLE_UPLOAD", "COMPLAINT_SUBMISSION"]) {
    assert.match(application, new RegExp(`usePolicies\\("${scene}"\\)`, "u"));
    assert.match(application, new RegExp(`acceptPolicies\\([^;]+"${scene}"\\)`, "u"));
  }
  assert.match(application, /needsVoiceAuthorization = Boolean\(saved\?\.voice_file_id\)/u);
  assert.match(application, /!needsVoiceAuthorization \|\| allPoliciesConfirmed/u);
  assert.match(application, /在线确认并同意后提交审核/u);
  assert.match(application, /投诉与违规处理规则/u);
  assert.match(application, /投诉、争议、补证和违规处置规则/u);
  assert.match(application, /协议加载失败时不能提交申请/u);
  assert.doesNotMatch(application, /电子签完成/u);
});

test("声音名片在上传前单独确认授权，录制、上传、审核、重传和受控试听保持完整", () => {
  const voice = source("src/features/files/voice-upload-slot.tsx");
  const recorder = source("src/features/files/voice-recorder-panel.native.tsx");
  assert.match(voice, /usePolicies\("VOICE_SAMPLE_UPLOAD"\)/u);
  assert.match(voice, /acceptPolicies\(confirmedPolicyIds, "VOICE_SAMPLE_UPLOAD"\)/u);
  assert.match(voice, /disabled=\{!policies\.data \|\| asset\.durationMs == null \|\| !voiceAuthorizationConfirmed\}/u);
  for (const copy of ["10–30 秒", "现场录制", "从文件选择声音名片", "上传到隔离区", "等待管理员审核", "重新选择音频", "只重试服务端确认", "申请短时试听地址"]) {
    assert.match(`${voice}\n${recorder}`, new RegExp(copy, "u"));
  }
  assert.match(voice, /SIGNED 受控访问/u);
});

test("退款通过 payment_id 展示原支付渠道，不猜测渠道", () => {
  const refund = source("src/features/after-sale/refund-detail-screen.tsx");
  assert.match(refund, /payments\.find\(\(payment\) => payment\.id === refund\.payment_id\)/u);
  assert.match(refund, /paymentChannelLabel\(originalPayment\.channel\)/u);
  assert.match(refund, /原路退回/u);
  assert.match(refund, /order\.isError \? "原支付渠道读取失败，请重试"/u);
});
