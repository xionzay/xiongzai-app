export const payoutAccountTypes = ["WECHAT", "ALIPAY"] as const;
export const sellerBusinessPeriods = ["TODAY", "YESTERDAY", "WEEK", "MONTH", "YEAR", "ALL"] as const;
export type SellerBusinessPeriod = (typeof sellerBusinessPeriods)[number];
export interface SellerBusinessStatistics {
  period: SellerBusinessPeriod;
  timezone: "Asia/Shanghai";
  attribution: "ORDER_CREATED_AT";
  scope: string;
  start_at: string | null;
  end_at_exclusive: string;
  server_time: string;
  created_order_count: string;
  paid_order_count: string;
  paid_amount_cent: string;
  refunded_amount_cent: string;
}
export const payoutVerificationStatuses = ["PENDING", "VERIFIED", "REJECTED", "REVOKED"] as const;
export const withdrawalStatuses = [
  "CREATED", "RISK_REVIEW", "APPROVED", "PAYOUT_PROCESSING",
  "COMPLETED", "REJECTED", "FAILED", "CLOSED",
] as const;
export const activeWithdrawalStatuses = ["CREATED", "RISK_REVIEW", "PAYOUT_PROCESSING"] as const;
export const reservedWithdrawalStatuses = ["APPROVED", "CLOSED"] as const;
export const sellerIncomeStatuses = ["PENDING_SETTLEMENT", "AVAILABLE", "WITHDRAWAL_LOCKED", "WITHDRAWN", "REVERSED"] as const;
export const ledgerTransactionStatuses = ["PENDING", "POSTED", "REVERSED"] as const;

export type PayoutAccountType = (typeof payoutAccountTypes)[number];
export type PayoutVerificationStatus = (typeof payoutVerificationStatuses)[number];
export type WithdrawalStatus = (typeof withdrawalStatuses)[number];
export type SellerIncomeStatus = (typeof sellerIncomeStatuses)[number];
export type LedgerTransactionStatus = (typeof ledgerTransactionStatuses)[number];
