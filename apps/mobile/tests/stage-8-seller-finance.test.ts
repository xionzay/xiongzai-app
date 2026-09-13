import assert from "node:assert/strict";
import test from "node:test";
import { scheduledStartReached, sellerActionError, sellerActions, sellerOrderStatusLabel } from "../src/features/seller/seller-order-domain";
import { formatBps, isMaskedAccount, SingleFlightAction, validateWithdrawalCent, withdrawalStatusCopy, yuanInputToCent } from "../src/features/seller/seller-finance-domain";
import { WithdrawalIntentStore } from "../src/storage/withdrawal-intent";
import { formatCent } from "../src/utils/money";
import type { OrderApiView, SellerOrderAction, WithdrawalStatus } from "../src/types/api";
import { MemorySecureStore } from "./test-helpers";

function order(actions: SellerOrderAction[] = []): OrderApiView {
  return { id: "order-1", order_no: "O1", buyer_id: "buyer-1", seller_user_id: "seller-user", seller_id: "seller-1", product_id: "p1", sku_id: "s1", product_title: "双排上分", product_image: "", product_description: "snapshot", seller_name: "陪玩", seller_avatar: null, sku_name: "一小时", sku_description: null, sku_price_cent: "1000", sku_duration_minutes: 60, quantity: 1, total_amount_cent: "1000", discount_cent: "0", payable_amount_cent: "1000", paid_amount_cent: "1000", refunded_amount_cent: "0", commission_rate_bps: 1000, platform_fee_cent: "100", seller_income_cent: "900", service_starts_at: "2026-08-21T10:00:00.000Z", service_ends_at: "2026-08-21T11:00:00.000Z", buyer_note: null, status: "PENDING_ACCEPT", payment_status: "PAID", after_sale_status: "NONE", expires_at: "2026-08-21T09:00:00.000Z", auto_confirm_at: null, version: 1, created_at: "2026-08-21T00:00:00.000Z", updated_at: "2026-08-21T00:00:00.000Z", seller_available_actions: actions };
}

test("卖家订单仅展示服务端授权动作，退款与退款完成覆盖列表状态", () => {
  const pending = order(["ACCEPT", "REJECT", "CONTACT_BUYER"]);
  assert.deepEqual(sellerActions(pending), ["ACCEPT", "REJECT", "CONTACT_BUYER"]);
  assert.equal(sellerOrderStatusLabel(pending), "新订单 / 待接单");
  assert.deepEqual(sellerActions({ ...pending, seller_available_actions: undefined }), []);
  assert.equal(sellerOrderStatusLabel({ ...pending, after_sale_status: "IN_PROGRESS" }), "售后中");
  assert.equal(sellerOrderStatusLabel({ ...pending, payment_status: "REFUNDED" }), "已退款");
});

test("待开始不允许客户端提前开放，CAS 冲突和服务时间错误有安全提示", () => {
  const pending = order();
  assert.equal(scheduledStartReached(pending, new Date("2026-08-21T09:59:59.999Z").getTime()), false);
  assert.equal(scheduledStartReached(pending, new Date("2026-08-21T10:00:00.000Z").getTime()), true);
  assert.match(sellerActionError("RESOURCE_VERSION_CONFLICT"), /重新加载/u);
  assert.match(sellerActionError("ORDER_SERVICE_NOT_STARTED"), /不能提前/u);
});

test("金额使用 BigInt 分字符串，超安全整数仍可精确展示和校验", () => {
  assert.equal(yuanInputToCent("9007199254740993.99"), "900719925474099399");
  assert.equal(formatCent("900719925474099399"), "¥9,007,199,254,740,993.99");
  assert.equal(validateWithdrawalCent("10000", "9999", "100", "999999"), "可提现余额不足");
  assert.equal(validateWithdrawalCent("99", "9999", "100", "999999"), "提现金额低于平台最低限额");
  assert.equal(yuanInputToCent("1.999"), null);
  assert.equal(formatBps(125), "1.25%");
});

test("同一次提现意图复用幂等键，新意图换键且安全存储不含金额或账户", async () => {
  const secure = new MemorySecureStore(); let sequence = 0;
  const store = new WithdrawalIntentStore(secure, () => `id-${++sequence}`);
  const fingerprint1 = "7b63f4299a4ec6fd8fd98d638cf55f9a";
  const first = await store.keyFor(fingerprint1); const retry = await store.keyFor(fingerprint1); const second = await store.keyFor("another-hash");
  assert.equal(first, retry); assert.notEqual(first, second);
  const persisted = [...secure.values.values()].join("");
  assert.equal(persisted.includes("6222021234567890"), false); assert.equal(persisted.includes("8888"), false);
  await store.clear(); assert.equal(secure.values.size, 0);
});

test("单例动作阻止重复点击产生两次提现请求", async () => {
  const gate = new SingleFlightAction(); let calls = 0; let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const a = gate.run(async () => { calls++; await wait; return "ok"; });
  const b = gate.run(async () => { calls++; return "duplicate"; });
  assert.equal(calls, 1); release(); assert.equal(await a, "ok"); assert.equal(await b, "ok");
});

test("提现全状态和收款账户脱敏规则完整", () => {
  const states: WithdrawalStatus[] = ["CREATED", "RISK_REVIEW", "APPROVED", "PAYOUT_PROCESSING", "COMPLETED", "REJECTED", "FAILED", "CLOSED"];
  for (const status of states) assert.ok(withdrawalStatusCopy[status]);
  assert.equal(isMaskedAccount("ali***890"), true);
  assert.equal(isMaskedAccount("full-account@example.com"), false);
});
