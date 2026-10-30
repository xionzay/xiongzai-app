import type { BuyerOrderAction, ComplaintStatus, OrderDetailApiView, RefundStatus, ReviewStatus } from "@/types/api";

export const refundStatusCopy: Record<RefundStatus, string> = {
  REQUESTED: "等待陪玩处理", SELLER_APPROVED: "陪玩已同意", SELLER_REJECTED: "陪玩已拒绝",
  NEGOTIATING: "协商中", PLATFORM_REVIEW: "平台介入中", REFUND_PROCESSING: "渠道退款中",
  REFUNDED: "退款完成", REJECTED: "平台已驳回", CANCELLED: "退款已取消",
};
export const complaintStatusCopy: Record<ComplaintStatus, string> = { SUBMITTED: "已提交", ACCEPTED: "平台已受理", PROCESSING: "处理中", NEED_MORE_EVIDENCE: "等待补充证据", COMPLETED: "已完成", CLOSED: "已关闭" };
export const reviewStatusCopy: Record<ReviewStatus, string> = { PENDING: "审核中", PUBLIC: "已公开", HIDDEN: "未展示" };

export function parseYuanToCent(value: string): string | null {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(normalized)) return null;
  const [yuan, fraction = ""] = normalized.split(".");
  return (BigInt(yuan!) * 100n + BigInt(fraction.padEnd(2, "0") || "0")).toString();
}

export function isRefundAmountAllowed(amountCent: string | null, availableCent: string): boolean {
  if (!amountCent) return false;
  return BigInt(amountCent) > 0n && BigInt(amountCent) <= BigInt(availableCent);
}

export function hasOrderAction(order: Pick<OrderDetailApiView, "available_actions">, action: BuyerOrderAction) { return order.available_actions.includes(action); }
export function shouldRefreshAfterConflict(code: string) { return code === "RESOURCE_VERSION_CONFLICT"; }

export type BuyerDisplayState = "PENDING_PAYMENT" | "PENDING_ACCEPT" | "ACCEPTED" | "PENDING_SERVICE" | "IN_SERVICE" | "PENDING_BUYER_CONFIRM" | "COMPLETED" | "REVIEWED" | "CANCELLED" | "CLOSED" | "SELLER_REJECTED" | "AFTER_SALE" | "REFUNDED";
export function buyerDisplayState(order: Pick<OrderDetailApiView, "status" | "payment_status" | "after_sale_status" | "review">): BuyerDisplayState {
  if (order.payment_status === "REFUNDED") return "REFUNDED";
  if (order.after_sale_status === "IN_PROGRESS") return "AFTER_SALE";
  if (order.status === "COMPLETED" && order.review) return "REVIEWED";
  return order.status;
}

export function safeComplaintFiles(uploadAvailable: boolean, selectedFileIds: string[]) { return uploadAvailable ? selectedFileIds : []; }
