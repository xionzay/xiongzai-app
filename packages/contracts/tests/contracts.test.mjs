import assert from "node:assert/strict";
import test from "node:test";
import {
  AppError, allowsTransition, decodeCursor, encodeCursor, ledgerTransactionStatusTransitions,
  normalizePageSize, orderStatusTransitions, paymentChannels, payoutAccountTypes,
  policyAcceptanceScenes, policyConfirmationMethods, policyTypes, policyTypesByScene,
  refundStatusTransitions, stringifyApiJson, withdrawalStatusTransitions,
} from "../dist/index.js";

test("serializes bigint money as decimal strings and dates as UTC ISO strings", () => {
  const serialized = stringifyApiJson({ amount_cent: 9_007_199_254_740_993n, at: new Date("2026-08-20T12:00:00-07:00") });
  assert.equal(serialized, '{"amount_cent":"9007199254740993","at":"2026-08-20T19:00:00.000Z"}');
});

test("signed cursor round-trips and rejects tampering", () => {
  const secret = "cursor-test-secret-that-is-at-least-32-bytes";
  const cursor = encodeCursor({ sort_value: "2026-08-20T00:00:00.000Z", id: "01912345-0000-7000-8000-000000000001" }, secret);
  assert.equal(decodeCursor(cursor, secret).id, "01912345-0000-7000-8000-000000000001");
  assert.throws(() => decodeCursor(`${cursor}x`, secret), AppError);
});

test("signed cursor preserves an optional query scope", () => {
  const secret = "cursor-test-secret-that-is-at-least-32-bytes";
  const cursor = encodeCursor({ sort_value: "4.90", id: "seller-1", scope: "companions:rating" }, secret);
  assert.deepEqual(decodeCursor(cursor, secret), { sort_value: "4.90", id: "seller-1", scope: "companions:rating" });
});

test("page size is bounded", () => {
  assert.equal(normalizePageSize(undefined), 20);
  assert.equal(normalizePageSize("50"), 50);
  assert.throws(() => normalizePageSize(101), AppError);
});

test("client payment channels are closed to the two supported App choices", () => {
  assert.deepEqual(paymentChannels, ["WECHAT_APP", "ALIPAY_APP"]);
  assert.equal(paymentChannels.includes("MOCK"), false);
});

test("payout accounts are closed to WeChat and Alipay without bank support", () => {
  assert.deepEqual(payoutAccountTypes, ["WECHAT", "ALIPAY"]);
  assert.equal(payoutAccountTypes.includes("BANK"), false);
});

test("policy scenes use explicit version sets and online confirmation only", () => {
  assert.deepEqual(policyConfirmationMethods, ["ONLINE_CONFIRM"]);
  assert.equal(policyAcceptanceScenes.includes("LOGIN"), true);
  assert.equal(policyAcceptanceScenes.includes("ORDER_PAYMENT"), true);
  assert.equal(policyAcceptanceScenes.includes("SELLER_ONBOARDING"), true);
  assert.equal(policyAcceptanceScenes.includes("VOICE_SAMPLE_UPLOAD"), true);
  assert.deepEqual(new Set(Object.values(policyTypesByScene).flat()), new Set(policyTypes));
});

test("published transition matrices match local reachable business paths", () => {
  assert.equal(allowsTransition(orderStatusTransitions, "PENDING_PAYMENT", "PENDING_ACCEPT"), true);
  assert.equal(allowsTransition(orderStatusTransitions, "PENDING_PAYMENT", "COMPLETED"), false);
  assert.equal(allowsTransition(refundStatusTransitions, "REFUND_PROCESSING", "REFUNDED"), true);
  assert.equal(allowsTransition(withdrawalStatusTransitions, "CREATED", "RISK_REVIEW"), true);
  assert.equal(allowsTransition(withdrawalStatusTransitions, "RISK_REVIEW", "PAYOUT_PROCESSING"), true);
  assert.equal(allowsTransition(withdrawalStatusTransitions, "CREATED", "PAYOUT_PROCESSING"), false);
  assert.equal(allowsTransition(withdrawalStatusTransitions, "CREATED", "COMPLETED"), false);
  assert.equal(allowsTransition(ledgerTransactionStatusTransitions, "POSTED", "REVERSED"), true);
});
