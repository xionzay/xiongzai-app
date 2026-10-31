import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildStartOptions, checkoutFingerprint, orderErrorMessage, paymentPollDelay, previewFingerprint, resolvePaymentOutcome, SingleFlight } from "../src/features/checkout/checkout-domain";
import { CheckoutSessionStore } from "../src/storage/checkout-session";
import type { OrderApiView, OrderDraftApi, OrderPreviewApiView, PaymentApiView } from "../src/types/api";
import { MemorySecureStore } from "./test-helpers";

const ordersScreenSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/orders-screen.tsx", import.meta.url).href), "utf8");
const scheduleScreenSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/schedule-screen.tsx", import.meta.url).href), "utf8");
const confirmOrderSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/confirm-order-screen.tsx", import.meta.url).href), "utf8");
const paymentScreenSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/payment-screen.tsx", import.meta.url).href), "utf8");
const paymentProcessingSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/payment-processing-screen.tsx", import.meta.url).href), "utf8");
const paymentResultSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/payment-result-screen.tsx", import.meta.url).href), "utf8");
const paymentErrorSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/payment-error-screen.tsx", import.meta.url).href), "utf8");
const paymentErrorPresentation = readFileSync(fileURLToPath(new URL("../src/features/checkout/payment-error-presentation.ts", import.meta.url).href), "utf8");

const draft: OrderDraftApi = { product_id: "product-1", sku_id: "sku-1", slot_id: "slot-1", quantity: 1, service_starts_at: "2030-01-02T10:00:00.000Z", buyer_note: null };
const preview = (price = "2500"): OrderPreviewApiView => ({ product_id: "product-1", product_title: "上分服务", product_image_file_id: null, seller_id: "seller-1", seller_name: "小熊", sku_id: "sku-1", sku_name: "一小时", sku_price_cent: price, sku_duration_minutes: 60, quantity: 1, total_amount_cent: price, discount_cent: "0", payable_amount_cent: price, commission_rate_bps: 1000, platform_fee_cent: "250", seller_income_cent: "2250", service_starts_at: draft.service_starts_at!, service_ends_at: "2030-01-02T11:00:00.000Z" });

test("真实开放区间按规格时长生成可选开始时间并排除过期时段", () => {
  const slots = [{ id: "past", starts_at: "2029-01-01T10:00:00.000Z", ends_at: "2029-01-01T12:00:00.000Z", status: "OPEN" as const, version: 1 }, { id: "slot-1", starts_at: "2030-01-02T10:00:00.000Z", ends_at: "2030-01-02T12:00:00.000Z", status: "OPEN" as const, version: 1 }];
  const options = buildStartOptions(slots, 60, new Date("2030-01-01T00:00:00.000Z"));
  assert.deepEqual(options.map((item) => [item.slotId, item.startsAt, item.endsAt]), [["slot-1", "2030-01-02T10:00:00.000Z", "2030-01-02T11:00:00.000Z"], ["slot-1", "2030-01-02T10:30:00.000Z", "2030-01-02T11:30:00.000Z"], ["slot-1", "2030-01-02T11:00:00.000Z", "2030-01-02T12:00:00.000Z"]]);
});

test("预约时间页按原 UI 提供陪玩卡、三列时段、预约保护和底部确认栏", () => {
  for (const label of ["选择预约时间", "可预约时段", "下单后由陪玩确认", "预约保护", "已选", "确认时间"]) assert.match(scheduleScreenSource, new RegExp(label, "u"));
  assert.match(scheduleScreenSource, /buildStartOptions\(availability\.data \?\? \[\], sku\.duration_minutes \?\? 0\)/u);
  assert.match(scheduleScreenSource, /options\.find[\s\S]*\?\? options\[0\]/u);
  assert.match(scheduleScreenSource, /slotGrid[\s\S]*width: "31\.6%"/u);
  assert.match(scheduleScreenSource, /pathname: "\/checkout\/confirm"/u);
  assert.match(scheduleScreenSource, /slotId: option\.slotId, startsAt: option\.startsAt/u);
  assert.doesNotMatch(scheduleScreenSource, /Kirito|今晚 20:00|每天 08:00/u);
});

test("确认订单页按原 UI 展示服务、预约、备注、金额和固定提交栏", () => {
  for (const label of ["确认服务与预约时间", "期望服务时间", "订单备注", "服务金额", "优惠", "合计", "实付", "提交订单"]) assert.match(confirmOrderSource, new RegExp(label, "u"));
  assert.match(confirmOrderSource, /product_image_file_id/u);
  assert.match(confirmOrderSource, /maxLength=\{100\}/u);
  assert.match(confirmOrderSource, /pathname: "\/checkout\/schedule"/u);
  assert.match(confirmOrderSource, /previewOrder\(latestDraft\)/u);
  assert.match(confirmOrderSource, /previewFingerprint\(latest\) !== previewFingerprint\(currentPreview\)/u);
  assert.match(confirmOrderSource, /expected_payable_amount_cent: latest\.payable_amount_cent/u);
  assert.match(confirmOrderSource, /getOrCreateOrderIntent/u);
  assert.match(confirmOrderSource, /pathname: "\/orders\/\[id\]\/pay"/u);
  assert.doesNotMatch(confirmOrderSource, /Kirito|¥25\.00|今晚 20:00/u);
});

test("支付页展示微信和支付宝测试渠道、服务端字段及无真实扣款提示", () => {
  for (const label of ["收银台", "订单应付", "平台交易保障", "选择支付方式", "微信支付", "支付宝支付", "测试支付", "不产生真实扣款", "确认测试支付", "暂不支付，查看订单"]) assert.match(paymentScreenSource, new RegExp(label, "u"));
  assert.match(paymentScreenSource, /canPayOrder\(current\)/u);
  assert.match(paymentScreenSource, /current\.payments\.find/u);
  assert.match(paymentScreenSource, /getOrCreatePaymentIntent/u);
  assert.match(paymentScreenSource, /rotatePaymentIntent/u);
  assert.match(paymentScreenSource, /createPayment\(current\.id, paymentChannel, session\.paymentKey!\)/u);
  assert.match(paymentScreenSource, /pathname: "\/payments\/\[id\]\/processing"/u);
  assert.match(paymentScreenSource, /WECHAT_APP[\s\S]*ALIPAY_APP/u);
  assert.doesNotMatch(paymentScreenSource, /真实扣款成功/u);
});

test("支付处理中页按当前 UI 展示等待熊、状态明细、安全说明和查询动作", () => {
  for (const label of ["正在确认支付", "请勿重复付款或关闭页面", "支付处理中", "订单编号", "支付方式", "当前状态", "查询支付结果", "稍后查看订单"]) assert.match(paymentProcessingSource, new RegExp(label, "u"));
  assert.match(paymentProcessingSource, /<StateBear kind="waiting" size=\{176\}/u);
  assert.doesNotMatch(paymentProcessingSource, /Animated\.loop/u);
  assert.match(paymentProcessingSource, /paymentPollDelay\(attempt\)/u);
  assert.match(paymentProcessingSource, /Promise\.all\(\[refetchPayment\(\), refetchOrder\(\)\]\)/u);
  assert.match(paymentProcessingSource, /AppState\.addEventListener/u);
  assert.match(paymentProcessingSource, /resolvePaymentOutcome\(payment\.data, order\.data\)/u);
  assert.match(paymentProcessingSource, /confirmMockPayment\(id\)/u);
  assert.match(paymentProcessingSource, /pathname: "\/payments\/\[id\]\/result"/u);
  assert.match(paymentProcessingSource, /paymentChannelLabel\(payment\.data\.channel\)/u);
  assert.match(paymentProcessingSource, /cancelMockPayment|failMockPayment/u);
  assert.doesNotMatch(paymentProcessingSource, /clientCancelled|XZ202608180001|¥25\.00/u);
});

test("支付结果页按原 UI 展示五种真实结果、支付明细、沟通提示和恢复动作", () => {
  for (const label of ["支付成功", "支付失败", "已取消支付", "订单已关闭", "支付确认中", "订单编号", "支付单号", "服务陪玩", "预约时间", "结果信息", "可以先联系陪玩", "去沟通", "查看订单", "重新支付", "重新下单", "继续查询"]) assert.match(paymentResultSource, new RegExp(label, "u"));
  assert.match(paymentResultSource, /resolvePaymentOutcome\(payment\.data, order\.data\)/u);
  assert.match(paymentResultSource, /outcome === "success" \|\| outcome === "closed"/u);
  assert.match(paymentResultSource, /currentPayment\.payment_no/u);
  assert.match(paymentResultSource, /currentOrder\.seller_name/u);
  assert.match(paymentResultSource, /formatServiceTime\(currentOrder\.service_starts_at\)/u);
  assert.match(paymentResultSource, /createOrderConversation\(currentOrder\.id\)/u);
  assert.match(paymentResultSource, /pathname: "\/orders\/\[id\]\/pay"[\s\S]*retry: "1"/u);
  assert.match(paymentResultSource, /pathname: "\/payments\/\[id\]\/processing"/u);
  assert.match(paymentResultSource, /pathname: "\/services\/\[id\]"/u);
  assert.match(paymentResultSource, /paymentChannelLabel\(currentPayment\.channel\)/u);
  assert.doesNotMatch(paymentResultSource, /clientCancelled|XZ202608180001|¥25\.00|Kirito/u);
});

test("支付异常页按原 UI 自动映射真实错误并提供安全恢复路径", () => {
  for (const label of ["支付异常处理", "支付前再次核对金额与服务状态", "价格变化", "服务失效", "渠道异常", "订单金额已更新", "当前服务不可购买", "支付渠道暂时不可用", "订单服务", "陪玩", "原订单金额", "最新规格价格", "异常编号", "稍后处理", "确认新价格", "查看其他服务", "重新支付", "联系平台客服"]) assert.match(paymentErrorSource + paymentErrorPresentation, new RegExp(label, "u"));
  assert.match(paymentErrorSource, /exceptionKind\(code\)/u);
  assert.match(paymentErrorSource, /orderErrorMessage\(code\)/u);
  assert.match(paymentErrorSource, /useOrderDetail\(orderId, Boolean\(orderId\)\)/u);
  assert.match(paymentErrorSource, /useServiceDetail\(order\.data\?\.product_id \?\? "", kind === "价格变化"/u);
  assert.match(paymentErrorSource, /current\.available_actions\.includes\("PAY"\)/u);
  assert.match(paymentErrorSource, /canPayOrder\(current\) && kind !== "订单状态"/u);
  assert.match(paymentErrorSource, /pathname: "\/orders\/\[id\]\/pay"[\s\S]*retry: "1"/u);
  assert.match(paymentErrorSource, /pathname: "\/support\/new"/u);
  assert.doesNotMatch(paymentErrorSource, /微信支付|支付宝|¥25\.00|¥28\.00|Kirito/u);
});

test("订单幂等键在同一意图和页面恢复时复用，新意图生成新键", async () => {
  const store = new CheckoutSessionStore(new MemorySecureStore());
  let sequence = 0;
  const create = () => `order-key-${++sequence}`;
  const first = await store.getOrCreateOrderIntent("user-1", checkoutFingerprint(draft), create);
  const restored = await store.getOrCreateOrderIntent("user-1", checkoutFingerprint(draft), create);
  const changed = await store.getOrCreateOrderIntent("user-1", checkoutFingerprint({ ...draft, buyer_note: "新备注" }), create);
  assert.equal(first.orderKey, restored.orderKey);
  assert.notEqual(first.orderKey, changed.orderKey);
  assert.equal(sequence, 2);
});

test("支付幂等键保存订单和支付 ID，失败重试显式轮换", async () => {
  const store = new CheckoutSessionStore(new MemorySecureStore());
  await store.getOrCreateOrderIntent("user-1", checkoutFingerprint(draft), () => "order-key");
  await store.attachOrder("order-1");
  const first = await store.getOrCreatePaymentIntent("user-1", "order-1", "WECHAT_APP", () => "payment-key-1");
  await store.attachPayment("payment-1");
  const restored = await store.getOrCreatePaymentIntent("user-1", "order-1", "WECHAT_APP", () => "unused");
  const switched = await store.getOrCreatePaymentIntent("user-1", "order-1", "ALIPAY_APP", () => "payment-key-alipay");
  const rotated = await store.rotatePaymentIntent("order-1", "ALIPAY_APP", () => "payment-key-2");
  assert.equal(first.paymentKey, restored.paymentKey);
  assert.equal(restored.paymentId, "payment-1");
  assert.equal(switched.paymentChannel, "ALIPAY_APP");
  assert.equal(switched.paymentKey, "payment-key-alipay");
  assert.equal(rotated.paymentKey, "payment-key-2");
  assert.equal(rotated.paymentId, undefined);
});

test("服务端预览指纹识别价格变化，金额仍为十进制分字符串", () => {
  assert.notEqual(previewFingerprint(preview("2500")), previewFingerprint(preview("2600")));
  assert.equal(preview("2500").payable_amount_cent, "2500");
});

test("重复点击通过单例请求合并为一次下单", async () => {
  const flight = new SingleFlight();
  let calls = 0;
  const operation = () => new Promise<string>((resolve) => { calls += 1; setTimeout(() => resolve("order-1"), 5); });
  const [first, second] = await Promise.all([flight.run(operation), flight.run(operation)]);
  assert.equal(calls, 1);
  assert.equal(first, second);
});

test("支付轮询使用有限退避并在上限后停止", () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => paymentPollDelay(index)), [1000, 2000, 4000, 6000, 8000, 10000, null]);
});

test("支付成功、失败、取消和关闭只取服务端状态", () => {
  const paid = { status: "PAID" } as PaymentApiView;
  const pending = { status: "PENDING_PAYMENT", payment_status: "PAYING", expires_at: "2030-01-01" } as OrderApiView;
  assert.equal(resolvePaymentOutcome(paid, pending), "success");
  assert.equal(resolvePaymentOutcome({ status: "FAILED" } as PaymentApiView, pending), "failed");
  assert.equal(resolvePaymentOutcome({ status: "PAYING" } as PaymentApiView, pending), "processing");
  assert.equal(resolvePaymentOutcome({ status: "CLOSED" } as PaymentApiView, pending), "cancelled");
  assert.equal(resolvePaymentOutcome({ status: "CLOSED" } as PaymentApiView, { ...pending, status: "CLOSED" } as OrderApiView), "closed");
});

test("服务端订单和支付错误映射为明确用户状态", () => {
  assert.match(orderErrorMessage("ORDER_SLOT_CONFLICT"), /重新选择/u);
  assert.match(orderErrorMessage("ORDER_PRICE_CHANGED"), /最新金额/u);
  assert.match(orderErrorMessage("ORDER_SERVICE_UNAVAILABLE"), /下架/u);
  assert.match(orderErrorMessage("ORDER_SELLER_UNAVAILABLE"), /暂停接单/u);
  assert.match(orderErrorMessage("PAYMENT_PROVIDER_UNAVAILABLE"), /支付渠道/u);
});

test("买家订单筛选栏保持紧凑并保留原设计的售后入口", () => {
  assert.match(ordersScreenSource, /filtersViewport:\s*\{[^}]*flexGrow:\s*0[^}]*maxHeight:\s*50/u);
  assert.match(ordersScreenSource, /filterUnderline/u);
  assert.match(ordersScreenSource, /accessibilityLabel="搜索订单"/u);
  assert.match(ordersScreenSource, /useBuyerOrders\(status === "authenticated"/u);
  assert.doesNotMatch(ordersScreenSource, /useSellerOrders/u);
  assert.match(ordersScreenSource, /routeFilter \?\? manualFilter/u);
  assert.match(ordersScreenSource, /router\.setParams\(\{ filter: undefined \}\)/u);
  assert.match(ordersScreenSource, /售后与平台介入/u);
});
