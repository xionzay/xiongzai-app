import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { paymentChannelLabel } from "../src/features/checkout/checkout-domain";

const mobileRoot = fileURLToPath(new URL("..", import.meta.url));
const source = (relative: string) => readFileSync(join(mobileRoot, relative), "utf8");
const collect = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? collect(path) : /\.(?:ts|tsx|json|xml|plist)$/u.test(entry.name) ? [path] : [];
});

test("微信和支付宝测试支付提交共享契约字段且页面明确不真实扣款", () => {
  const api = source("src/features/checkout/order-api.ts");
  const cashier = source("src/features/checkout/payment-screen.tsx");
  const processing = source("src/features/checkout/payment-processing-screen.tsx");
  const result = source("src/features/checkout/payment-result-screen.tsx");
  assert.equal(paymentChannelLabel("WECHAT_APP"), "微信支付（测试）");
  assert.equal(paymentChannelLabel("ALIPAY_APP"), "支付宝支付（测试）");
  assert.match(api, /payment_channel: paymentChannel/u);
  assert.match(cashier, /WECHAT_APP[\s\S]*ALIPAY_APP/u);
  assert.match(cashier, /测试支付，不会真实扣款/u);
  assert.match(api, /mock-confirm[\s\S]*mock-fail[\s\S]*mock-cancel/u);
  assert.match(result, /服务端支付状态/u);
  assert.doesNotMatch(`${processing}\n${result}`, /clientCancelled/u);
});

test("买家与陪玩本地验收主流程路由均存在", () => {
  const routes = [
    "app/(auth)/login.tsx", "app/(buyer-tabs)/index.tsx", "app/search.tsx", "app/services/[id].tsx",
    "app/checkout/schedule.tsx", "app/checkout/confirm.tsx", "app/orders/[id]/pay.tsx",
    "app/payments/[id]/processing.tsx", "app/payments/[id]/result.tsx", "app/(buyer-tabs)/orders.tsx",
    "app/conversations/[id].tsx", "app/refunds/new.tsx", "app/complaints/new.tsx", "app/reviews/new.tsx",
    "app/seller/apply.tsx", "app/settings/identity.tsx", "app/seller/profile.tsx",
    "app/seller/services/new.tsx", "app/(seller-tabs)/orders.tsx", "app/(seller-tabs)/earnings.tsx",
    "app/seller/finance/accounts.tsx", "app/seller/finance/withdraw.tsx"
  ];
  for (const route of routes) assert.equal(existsSync(join(mobileRoot, route)), true, route);
});

test("收款账户仅保留微信和支付宝并明确使用本地 Mock 提现", () => {
  const accounts = source("src/features/seller/seller-payout-accounts-screen.tsx");
  const withdraw = source("src/features/seller/seller-withdraw-screen.tsx");
  assert.match(accounts, /\["WECHAT", "ALIPAY"\]/u);
  assert.match(accounts, /本地测试仅支持微信和支付宝/u);
  assert.match(withdraw, /Mock Payout Provider/u);
  assert.match(withdraw, /不会向微信或支付宝真实打款/u);
  assert.doesNotMatch(`${accounts}\n${withdraw}`, /银行卡|BANK|bank card/ui);
});

test("声音名片保留录制、选择、上传、审核、重传和受控试听且限制10至30秒", () => {
  const slot = source("src/features/files/voice-upload-slot.tsx");
  const recorder = source("src/features/files/voice-recorder-panel.native.tsx");
  const domain = source("src/features/files/voice-upload-domain.ts");
  const companion = source("src/features/discovery/companion-detail-screen.tsx");
  const appConfig = source("app.config.ts");
  for (const value of ["从文件选择声音名片", "重新选择音频", "上传到隔离区", "等待管理员审核", "刷新审核状态", "试听"]) assert.match(`${slot}\n${companion}`, new RegExp(value, "u"));
  assert.match(recorder, /现场录制声音名片/u);
  assert.match(domain, /minimum_duration_ms[\s\S]*maximum_duration_ms/u);
  assert.match(appConfig, /10–30 秒声音名片/u);
});

test("陪玩主页封面不使用半屏黑色遮罩", () => {
  const companion = source("src/features/discovery/companion-detail-screen.tsx");
  assert.doesNotMatch(companion, /heroShade|rgba\(10,20,35,0\.58\)/u);
});

test("工程不包含实时通话、RTC、拨号或电话权限", () => {
  const files = collect(join(mobileRoot, "src")).concat([join(mobileRoot, "package.json"), join(mobileRoot, "app.config.ts"), join(mobileRoot, "android/app/src/main/AndroidManifest.xml"), join(mobileRoot, "ios/app/Info.plist")]);
  const all = files.filter(existsSync).map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(all, /react-native-webrtc|livekit|agora|twilio|RTCPeerConnection|RTCView|tel:|CALL_PHONE|READ_PHONE_STATE/ui);
  assert.match(all, /RECORD_AUDIO|麦克风/u);
});

test("本地账号安全能力走服务端状态并保留外部能力边界", () => {
  const phone = source("src/features/account/phone-change-screen.tsx");
  const exportPage = source("src/features/account/data-export-screen.tsx");
  const cancellation = source("src/features/account/account-cancellation-screen.tsx");
  const unavailable = source("src/features/account/unavailable-screen.tsx");
  const identity = source("src/features/account/identity-screen.tsx");
  const notifications = source("src/features/chat/notifications-screen.tsx");
  assert.match(unavailable, /功能暂未开放/u);
  assert.match(phone, /usePhoneChangeRequests/u);
  assert.match(phone, /发送开发验证码/u);
  assert.match(exportPage, /usePersonalDataExports/u);
  assert.match(exportPage, /安全下载/u);
  assert.doesNotMatch(exportPage, /Linking\.openURL/u);
  assert.match(cancellation, /useAccountCancellationEligibility/u);
  assert.match(cancellation, /冷静期/u);
  assert.match(identity, /不连接真实实名服务/u);
  assert.match(identity, /勿输入真实姓名或证件号/u);
  assert.match(notifications, /站内通知/u);
  assert.match(notifications, /系统推送尚未接入/u);
});

test("关键交易页面保留断网、错误、重复点击、安全区和小屏滚动处理", () => {
  const cashier = source("src/features/checkout/payment-screen.tsx");
  const processing = source("src/features/checkout/payment-processing-screen.tsx");
  const withdraw = source("src/features/seller/seller-withdraw-screen.tsx");
  assert.match(cashier, /StateView kind="offline"/u);
  assert.match(cashier, /StateView kind="error"/u);
  assert.match(cashier, /SingleFlight/u);
  assert.match(cashier, /SafeAreaView/u);
  assert.match(cashier, /ScrollView/u);
  assert.match(processing, /disabled=\{Boolean\(mockAction\)\}/u);
  assert.match(withdraw, /SingleFlightAction/u);
  assert.doesNotMatch(`${cashier}\n${processing}\n${withdraw}`, /allowFontScaling=\{false\}/u);
});
