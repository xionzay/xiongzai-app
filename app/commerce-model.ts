import { isFulfillmentOrder } from "../packages/contracts/src/commerce";
/** Presentation model only: API order states and transaction rules stay authoritative. */
export type CommerceOrder = { status: string; payment_status: string; after_sale_status: string; rule_version?: string; fulfillment_seconds?: number | null; fulfillment_seconds_snapshot?: number | null; can_review?: boolean; available_actions?: string[]; seller_available_actions?: string[]; review_deadline_at?: string | null };
export function paymentStatusLabel(value?: string | null): string {
  if (!value) return "待确认";
  return ({ CREATED:"待支付",PAYING:"支付处理中",PAID:"已支付",FAILED:"支付失败",CLOSED:"支付已关闭",REFUNDING:"退款处理中",PARTIALLY_REFUNDED:"部分退款",REFUNDED:"已退款" } as Record<string,string>)[value] ?? "未知支付状态";
}
export const buyerOrderTabs = ["全部", "待付款", "待服务", "服务中", "待收货", "待评价", "售后中", "已完成"] as const;
export const sellerOrderTabs = ["全部", "待付款", "待服务", "新订单", "待开始", "服务中", "待收货", "待确认", "已完成", "已关闭", "售后"] as const;
export const buyerOrderEntries = [
  { label: "待付款", icon: "wallet" },
  { label: "待服务", icon: "order" },
  { label: "服务中", icon: "service" },
  { label: "待收货", icon: "shield" },
  { label: "待评价", icon: "review" },
  { label: "售后中", icon: "message" },
] as const;

export function commerceOrderLabel(order: CommerceOrder, role: "buyer" | "seller" = "buyer") {
  if (order.payment_status === "REFUNDING" || order.after_sale_status === "REFUND_PROCESSING") return "退款处理中";
  if (order.payment_status === "REFUNDED") return "已退款";
  if (order.after_sale_status === "IN_PROGRESS") return "售后";
  if (isFulfillmentOrder(order)) {
    const current: Record<string,string> = {PENDING_SERVICE:"待服务",IN_SERVICE:"服务中",PENDING_BUYER_CONFIRM:"待收货"};
    if (current[order.status]) return current[order.status];
  }
  const labels: Record<string, string> = {
    PENDING_PAYMENT: "待付款", PENDING_ACCEPT: role === "seller" ? "新订单" : "待接单",
    ACCEPTED: "待开始", PENDING_SERVICE: "待服务", IN_SERVICE: "服务中", PENDING_BUYER_CONFIRM: "待确认", COMPLETED: "已完成",
    CANCELLED: role === "seller" ? "已关闭" : "已取消",
    CLOSED: role === "seller" ? "已关闭" : "已取消",
    SELLER_REJECTED: role === "seller" ? "已关闭" : "已取消",
  };
  return labels[order.status] ?? order.status;
}

export function matchesOrderTab(order: CommerceOrder, tab: string, role: "buyer" | "seller" = "buyer") {
  const label = commerceOrderLabel(order, role);
  if (role === "buyer") {
    if (tab === "待评价") return (order.available_actions?.includes("CREATE_REVIEW") ?? order.can_review === true) && (order.rule_version !== "V3.1" || !!order.review_deadline_at && Date.parse(order.review_deadline_at) > Date.now());
    if (tab === "已完成") return ["已完成", "已退款", "已关闭", "已取消"].includes(label);
    if (tab === "售后中") return ["售后", "售后中", "退款处理中"].includes(label);
    if (tab === "待服务") return ["待接单", "待开始", "待服务"].includes(label);
    if (tab === "待收货") return ["待确认", "待收货"].includes(label);
  }
  return tab === "全部" || label === tab || (tab === "售后" && ["已退款", "退款处理中"].includes(label));
}

export function sellerFulfillmentAction(order: CommerceOrder): "accept" | "start" | "complete" | null {
  if (order.payment_status !== "PAID" || !["NONE", "RESOLVED"].includes(order.after_sale_status || "NONE")) return null;
  if (order.seller_available_actions) {
    if (order.seller_available_actions.includes("ACCEPT")) return "accept";
    if (order.seller_available_actions.includes("START")) return "start";
    if (order.seller_available_actions.includes("COMPLETE")) return "complete";
    return null;
  }
  return ({ PENDING_ACCEPT: "accept", ACCEPTED: "start", IN_SERVICE: "complete" } as const)[order.status as "PENDING_ACCEPT" | "ACCEPTED" | "IN_SERVICE"] ?? null;
}
