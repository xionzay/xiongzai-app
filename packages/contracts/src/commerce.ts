export const orderStatuses = [
  "PENDING_PAYMENT", "PENDING_ACCEPT", "ACCEPTED", "PENDING_SERVICE", "IN_SERVICE",
  "PENDING_BUYER_CONFIRM", "COMPLETED", "CANCELLED", "CLOSED", "SELLER_REJECTED",
] as const;

export const paymentStatuses = [
  "CREATED", "PAYING", "PAID", "FAILED", "CLOSED", "REFUNDING", "PARTIALLY_REFUNDED", "REFUNDED",
] as const;

export const paymentChannels = ["WECHAT_APP", "ALIPAY_APP"] as const;

export const productGames = ["PEACE_ELITE", "DELTA_FORCE", "HONOR_OF_KINGS", "VALORANT"] as const;
export type ProductGame = typeof productGames[number];
export const productGameLabels: Record<ProductGame, string> = { PEACE_ELITE: "和平精英", DELTA_FORCE: "三角洲行动", HONOR_OF_KINGS: "王者荣耀", VALORANT: "无畏契约" };
/** Submission requirements; drafts may omit these. Media/identity/policy gates stay server-side. */
export const sellerApplicationRequiredFields = ["seller_avatar_file_id", "introduction", "preferred_mode"] as const;
export function sellerApplicationMissingFields(profile: Partial<Record<typeof sellerApplicationRequiredFields[number], unknown>>) {
  return sellerApplicationRequiredFields.filter(key => profile[key] == null || (typeof profile[key] === "string" && !profile[key].trim()));
}
export function fulfillmentDurationLabel(seconds: number | null | undefined): string {
  if (seconds == null) return "旧预约规则";
  if (!Number.isSafeInteger(seconds) || seconds < 1) return "完成时限无效";
  const parts: string[] = [];
  for (const [unit, size] of [["天", 86400], ["小时", 3600], ["分钟", 60], ["秒", 1]] as const) {
    const amount = Math.floor(seconds / size); if (amount) parts.push(`${amount}${unit}`); seconds %= size;
  }
  return `付款后 ${parts.join("")}内`;
}
/** The API exposes the immutable snapshot as fulfillment_seconds. Legacy V3.1 bookings have null. */
export function isFulfillmentOrder(order: { rule_version?: string; fulfillment_seconds?: number | null; fulfillment_seconds_snapshot?: number | null }): boolean {
  const snapshot = "fulfillment_seconds_snapshot" in order ? order.fulfillment_seconds_snapshot : order.fulfillment_seconds;
  return order.rule_version === "V3.1" && snapshot != null;
}
export const CURRENT_ORDER_RULE_VERSION = "V3.1" as const;
export const NORMAL_CONFIRM_SECONDS = 72 * 3600;
export const RECEIPT_EXTENSION_SECONDS = 24 * 3600;
export const MAX_FULFILLMENT_SECONDS = 7 * 24 * 3600;

/** Round-trip an integer-second snapshot displayed as decimal hours; never handles money. */
export function fulfillmentHoursToSeconds(hours: string): number {
  if (!/^\d+(\.\d{1,24})?$/.test(hours)) throw new Error("完成时限须为有效小时数");
  const seconds = Number(hours) * 3600, rounded = Math.round(seconds);
  if (!Number.isSafeInteger(rounded) || Math.abs(seconds - rounded) > 1e-7 || rounded < 1 || rounded > MAX_FULFILLMENT_SECONDS) throw new Error("完成时限须为整数秒且不超过 168 小时");
  return rounded;
}

export function fulfillmentEvidenceError(files: { id: string; file_type: string; upload_status: string; moderation_status: string; visibility: string; bound_order_id?: string | null }[], selected: string[], paidCent: string): string {
  if (new Set(selected).size !== selected.length || files.filter(file => selected.includes(file.id)).length !== selected.length) return "所选凭证已变化，请刷新后重新选择";
  const chosen = files.filter(file => selected.includes(file.id));
  if (chosen.some(file => file.visibility !== "PRIVATE" || file.bound_order_id || file.upload_status !== "VERIFIED" || file.moderation_status !== "APPROVED" || !["ORDER_FULFILLMENT_IMAGE", "ORDER_FULFILLMENT_VIDEO"].includes(file.file_type))) return "凭证须为当前卖家未绑定、已校验且人工审核通过的私有履约文件";
  if (chosen.filter(file => file.file_type === "ORDER_FULFILLMENT_IMAGE").length < 5) return "至少需要五张已审核截图";
  if (BigInt(paidCent) >= 20000n && !chosen.some(file => file.file_type === "ORDER_FULFILLMENT_VIDEO")) return "实付达到200元须增加已审核连续录屏";
  return "";
}

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
  "CREATE_COMPLAINT", "CREATE_REVIEW", "VIEW_REVIEW", "VIEW_SERVICE", "EXTEND_RECEIPT", "REMIND_SELLER",
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
