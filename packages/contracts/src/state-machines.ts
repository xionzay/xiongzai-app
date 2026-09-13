import type { AfterSaleStatus, OrderStatus, PaymentStatus, RefundStatus } from "./commerce.js";
import type { LedgerTransactionStatus, SellerIncomeStatus, WithdrawalStatus } from "./finance.js";

export interface StateTransition<TState extends string> {
  from: TState;
  to: TState;
  action: string;
}

export const orderStatusTransitions = [
  { from: "PENDING_PAYMENT", to: "PENDING_ACCEPT", action: "PAYMENT_SUCCEEDED" },
  { from: "PENDING_PAYMENT", to: "CANCELLED", action: "BUYER_CANCEL" },
  { from: "PENDING_PAYMENT", to: "CLOSED", action: "PAYMENT_TIMEOUT" },
  { from: "PENDING_ACCEPT", to: "ACCEPTED", action: "SELLER_ACCEPT" },
  { from: "PENDING_ACCEPT", to: "SELLER_REJECTED", action: "SELLER_REJECT" },
  { from: "PENDING_ACCEPT", to: "CLOSED", action: "ACCEPT_TIMEOUT" },
  { from: "ACCEPTED", to: "IN_SERVICE", action: "SELLER_START" },
  { from: "IN_SERVICE", to: "PENDING_BUYER_CONFIRM", action: "SELLER_COMPLETE" },
  { from: "PENDING_BUYER_CONFIRM", to: "COMPLETED", action: "BUYER_CONFIRM" },
  { from: "PENDING_BUYER_CONFIRM", to: "COMPLETED", action: "AUTO_CONFIRM" },
] as const satisfies readonly StateTransition<OrderStatus>[];

export const paymentStatusTransitions = [
  { from: "CREATED", to: "PAYING", action: "PROVIDER_INTENT_CREATED" },
  { from: "CREATED", to: "FAILED", action: "PROVIDER_INTENT_FAILED" },
  { from: "CREATED", to: "CLOSED", action: "CLOSE" },
  { from: "PAYING", to: "PAID", action: "PAYMENT_SUCCEEDED" },
  { from: "PAYING", to: "FAILED", action: "PAYMENT_FAILED" },
  { from: "PAYING", to: "CLOSED", action: "CLOSE" },
  { from: "PAID", to: "REFUNDING", action: "REFUND_SUBMITTED" },
  { from: "PARTIALLY_REFUNDED", to: "REFUNDING", action: "REFUND_SUBMITTED" },
  { from: "REFUNDING", to: "PAID", action: "REFUND_FAILED_WITH_ZERO_COMPLETED" },
  { from: "REFUNDING", to: "PARTIALLY_REFUNDED", action: "PARTIAL_REFUND_SUCCEEDED" },
  { from: "REFUNDING", to: "REFUNDED", action: "FULL_REFUND_SUCCEEDED" },
] as const satisfies readonly StateTransition<PaymentStatus>[];

export const refundStatusTransitions = [
  { from: "REQUESTED", to: "SELLER_APPROVED", action: "SELLER_APPROVE" },
  { from: "REQUESTED", to: "SELLER_REJECTED", action: "SELLER_REJECT" },
  { from: "SELLER_APPROVED", to: "REFUND_PROCESSING", action: "PROVIDER_REFUND_CREATED" },
  { from: "SELLER_REJECTED", to: "PLATFORM_REVIEW", action: "BUYER_ESCALATE" },
  { from: "SELLER_REJECTED", to: "REJECTED", action: "ADMIN_REJECT" },
  { from: "SELLER_REJECTED", to: "REFUND_PROCESSING", action: "ADMIN_APPROVE" },
  { from: "NEGOTIATING", to: "PLATFORM_REVIEW", action: "BUYER_ESCALATE" },
  { from: "NEGOTIATING", to: "REJECTED", action: "ADMIN_REJECT" },
  { from: "NEGOTIATING", to: "REFUND_PROCESSING", action: "ADMIN_APPROVE" },
  { from: "PLATFORM_REVIEW", to: "REJECTED", action: "ADMIN_REJECT" },
  { from: "PLATFORM_REVIEW", to: "REFUND_PROCESSING", action: "ADMIN_APPROVE" },
  { from: "REFUND_PROCESSING", to: "REFUNDED", action: "REFUND_SUCCEEDED" },
  { from: "REFUND_PROCESSING", to: "PLATFORM_REVIEW", action: "REFUND_FAILED" },
] as const satisfies readonly StateTransition<RefundStatus>[];

export const afterSaleStatusTransitions = [
  { from: "NONE", to: "IN_PROGRESS", action: "REFUND_REQUESTED" },
  { from: "IN_PROGRESS", to: "RESOLVED", action: "REFUND_FINALIZED" },
  { from: "RESOLVED", to: "IN_PROGRESS", action: "REFUND_ESCALATED" },
] as const satisfies readonly StateTransition<AfterSaleStatus>[];

export const sellerIncomeStatusTransitions = [
  { from: "PENDING_SETTLEMENT", to: "AVAILABLE", action: "SETTLEMENT_AVAILABLE" },
  { from: "PENDING_SETTLEMENT", to: "REVERSED", action: "FULL_REFUND" },
  { from: "AVAILABLE", to: "AVAILABLE", action: "PARTIAL_WITHDRAWAL_LOCK_OR_COMPLETE" },
  { from: "AVAILABLE", to: "WITHDRAWAL_LOCKED", action: "WITHDRAWAL_LOCK" },
  { from: "AVAILABLE", to: "REVERSED", action: "FULL_REFUND_OR_LIABILITY_OFFSET" },
  { from: "WITHDRAWAL_LOCKED", to: "WITHDRAWN", action: "PAYOUT_SUCCEEDED" },
  { from: "WITHDRAWAL_LOCKED", to: "WITHDRAWAL_LOCKED", action: "PAYOUT_SUCCEEDED_WITH_OTHER_LOCKS" },
  { from: "WITHDRAWAL_LOCKED", to: "AVAILABLE", action: "PAYOUT_RELEASED" },
] as const satisfies readonly StateTransition<SellerIncomeStatus>[];

export const withdrawalStatusTransitions = [
  { from: "CREATED", to: "RISK_REVIEW", action: "ADMIN_INITIAL_APPROVE" },
  { from: "CREATED", to: "REJECTED", action: "ADMIN_REJECT" },
  { from: "RISK_REVIEW", to: "PAYOUT_PROCESSING", action: "INDEPENDENT_ADMIN_FINAL_APPROVE" },
  { from: "PAYOUT_PROCESSING", to: "COMPLETED", action: "PAYOUT_SUCCEEDED" },
  { from: "PAYOUT_PROCESSING", to: "FAILED", action: "PAYOUT_FAILED" },
] as const satisfies readonly StateTransition<WithdrawalStatus>[];

export const ledgerTransactionStatusTransitions = [
  { from: "PENDING", to: "POSTED", action: "BALANCED_POST" },
  { from: "POSTED", to: "REVERSED", action: "APPEND_REVERSAL" },
] as const satisfies readonly StateTransition<LedgerTransactionStatus>[];

export function allowsTransition<TState extends string>(
  transitions: readonly StateTransition<TState>[],
  from: TState,
  to: TState,
): boolean {
  return transitions.some((transition) => transition.from === from && transition.to === to);
}
