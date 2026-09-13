export const orderStatuses = [
  "PENDING_PAYMENT", "PENDING_ACCEPT", "ACCEPTED", "IN_SERVICE",
  "PENDING_BUYER_CONFIRM", "COMPLETED", "CANCELLED", "CLOSED", "SELLER_REJECTED",
] as const;

export const paymentStatuses = [
  "CREATED", "PAYING", "PAID", "FAILED", "CLOSED", "REFUNDING", "PARTIALLY_REFUNDED", "REFUNDED",
] as const;

export const paymentChannels = ["WECHAT_APP", "ALIPAY_APP"] as const;

export const refundStatuses = [
  "REQUESTED", "SELLER_APPROVED", "SELLER_REJECTED", "NEGOTIATING",
  "PLATFORM_REVIEW", "REFUND_PROCESSING", "REFUNDED", "REJECTED", "CANCELLED",
] as const;

export const complaintStatuses = [
  "SUBMITTED", "ACCEPTED", "PROCESSING", "NEED_MORE_EVIDENCE", "COMPLETED", "CLOSED",
] as const;

export const reviewStatuses = ["PENDING", "PUBLIC", "HIDDEN"] as const;
export const afterSaleStatuses = ["NONE", "IN_PROGRESS", "RESOLVED"] as const;

export const buyerOrderActions = [
  "PAY", "CANCEL", "CONFIRM_COMPLETE", "REQUEST_REFUND", "VIEW_REFUND",
  "CREATE_COMPLAINT", "CREATE_REVIEW", "VIEW_REVIEW", "VIEW_SERVICE",
] as const;

export const buyerRefundActions = ["ESCALATE", "CREATE_COMPLAINT"] as const;

export type OrderStatus = typeof orderStatuses[number];
export type PaymentStatus = typeof paymentStatuses[number];
export type PaymentChannel = typeof paymentChannels[number];
export type RefundStatus = typeof refundStatuses[number];
export type ComplaintStatus = typeof complaintStatuses[number];
export type ReviewStatus = typeof reviewStatuses[number];
export type AfterSaleStatus = typeof afterSaleStatuses[number];
export type BuyerOrderAction = typeof buyerOrderActions[number];
export type BuyerRefundAction = typeof buyerRefundActions[number];
