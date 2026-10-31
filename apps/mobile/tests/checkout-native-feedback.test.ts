import assert from "node:assert/strict";
import test from "node:test";
import { buildStartOptions, formatServiceTime, orderErrorMessage, resolvePaymentOutcome } from "../src/features/checkout/checkout-domain";
import { exceptionKind, exceptionTitle } from "../src/features/checkout/payment-error-presentation";
import type { OrderApiView, PaymentApiView } from "../src/types/api";

test("预约中文日期不依赖设备 Intl 语言包，也不改变服务端时间", (t) => {
  t.mock.method(Date.prototype, "toLocaleDateString", () => "Wed, Jan 2");
  t.mock.method(Date.prototype, "toLocaleTimeString", () => "10:05 AM");
  t.mock.method(Date.prototype, "toLocaleString", () => "Wed, January 2 at 10:05 AM");
  const start = new Date(2030, 0, 2, 10, 5);
  const end = new Date(2030, 0, 2, 11, 5);
  const options = buildStartOptions([{ id: "slot", starts_at: start.toISOString(), ends_at: end.toISOString(), status: "OPEN", version: 1 }], 60, new Date(2030, 0, 1));
  assert.equal(options[0]?.dayLabel, "1月2日 周三");
  assert.equal(options[0]?.timeLabel, "10:05–11:05");
  assert.equal(options[0]?.startsAt, start.toISOString());
  assert.equal(options[0]?.endsAt, end.toISOString());
  assert.equal(formatServiceTime(start.toISOString()), "1月2日 周三 10:05");
});

test("预约跨年和午夜仍按设备本地时间显示并保留日期差异", () => {
  const start = new Date(2030, 11, 31, 23, 30);
  const end = new Date(2031, 0, 1, 0, 30);
  const [option] = buildStartOptions([{ id: "overnight", starts_at: start.toISOString(), ends_at: end.toISOString(), status: "OPEN", version: 1 }], 60, new Date(2030, 11, 30));
  assert.equal(option?.dayLabel, "12月31日 周二");
  assert.equal(option?.timeLabel, "23:30–00:30");
  assert.equal(formatServiceTime(end.toISOString()), "1月1日 周三 00:30");
});

test("无预约与无效预约时间提供明确文案，不显示 Invalid Date", () => {
  assert.equal(formatServiceTime(null), "无预约时间");
  assert.equal(formatServiceTime(undefined), "无预约时间");
  assert.equal(formatServiceTime("not-an-iso-time"), "预约时间不可用");
});

test("服务端拒绝过期或状态冲突支付时提示核对订单，不误称渠道故障", () => {
  assert.match(orderErrorMessage("ORDER_NOT_PAYABLE"), /订单.*无法支付.*已付款.*过期/u);
  assert.match(orderErrorMessage("PAYMENT_STATE_INVALID"), /支付状态.*变化.*查询/u);
  assert.doesNotMatch(orderErrorMessage("ORDER_NOT_PAYABLE"), /渠道/u);
});

test("订单不可支付和支付状态冲突归入订单状态，不能误导成服务下架", () => {
  for (const code of ["ORDER_NOT_PAYABLE", "PAYMENT_STATE_INVALID"]) {
    const kind = exceptionKind(code);
    assert.equal(kind, "订单状态");
    assert.doesNotMatch(exceptionTitle(code, kind), /渠道|服务不可购买/u);
  }
  assert.equal(exceptionTitle("ORDER_NOT_PAYABLE", exceptionKind("ORDER_NOT_PAYABLE")), "订单当前无法支付");
  assert.equal(exceptionTitle("PAYMENT_STATE_INVALID", exceptionKind("PAYMENT_STATE_INVALID")), "支付状态已变化");
});

test("支付异常仍区分价格、服务、真实渠道故障和未知请求失败", () => {
  assert.equal(exceptionKind("ORDER_PRICE_CHANGED"), "价格变化");
  assert.equal(exceptionKind("ORDER_SLOT_CONFLICT"), "服务失效");
  assert.equal(exceptionTitle("ORDER_SLOT_CONFLICT", "服务失效"), "预约时间已失效");
  assert.equal(exceptionTitle("PAYMENT_ALREADY_PAYING", "渠道异常"), "已有支付正在确认中");
  assert.equal(exceptionTitle("NETWORK_TIMEOUT", "渠道异常"), "网络连接超时");
  assert.equal(exceptionTitle("PAYMENT_PROVIDER_UNAVAILABLE", "渠道异常"), "支付渠道暂时不可用");
  assert.equal(exceptionTitle("UNKNOWN", "渠道异常"), "支付请求未完成");
});

test("新支付不能继承订单缓存中上一笔失败结果，也不提前跳出处理页", () => {
  const staleOrder = { status: "PENDING_PAYMENT", payment_status: "FAILED" } as OrderApiView;
  assert.equal(resolvePaymentOutcome(undefined, staleOrder), "processing");
  assert.equal(resolvePaymentOutcome({ status: "CREATED" } as PaymentApiView, staleOrder), "processing");
  assert.equal(resolvePaymentOutcome({ status: "PAYING" } as PaymentApiView, staleOrder), "processing");
  assert.equal(resolvePaymentOutcome({ status: "FAILED" } as PaymentApiView, staleOrder), "failed");
  assert.equal(resolvePaymentOutcome({ status: "CLOSED" } as PaymentApiView, staleOrder), "cancelled");
  assert.equal(resolvePaymentOutcome({ status: "PAID" } as PaymentApiView, staleOrder), "success");
});
