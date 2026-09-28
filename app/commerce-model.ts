/** Presentation model only: API order states and transaction rules stay authoritative. */
export type CommerceOrder = { status: string; payment_status: string; after_sale_status: string };
export const buyerOrderTabs = ["全部", "待付款", "待接单", "待开始", "服务中", "待确认", "已完成", "已取消", "售后"] as const;
export const sellerOrderTabs = ["全部", "待付款", "新订单", "待开始", "服务中", "待确认", "已完成", "已关闭", "售后"] as const;
export const buyerOrderEntries = [
  { label: "待付款", icon: "wallet" },
  { label: "待接单", icon: "order" },
  { label: "服务中", icon: "service" },
  { label: "待确认", icon: "shield" },
  { label: "售后", icon: "message" },
] as const;

export function commerceOrderLabel(order: CommerceOrder, role: "buyer" | "seller" = "buyer") {
  if (order.payment_status === "REFUNDED") return "已退款";
  if (order.after_sale_status && order.after_sale_status !== "NONE") return "售后";
  const labels: Record<string, string> = {
    PENDING_PAYMENT: "待付款", PENDING_ACCEPT: role === "seller" ? "新订单" : "待接单",
    ACCEPTED: "待开始", IN_SERVICE: "服务中", PENDING_BUYER_CONFIRM: "待确认", COMPLETED: "已完成",
    CANCELLED: role === "seller" ? "已关闭" : "已取消",
    CLOSED: role === "seller" ? "已关闭" : "已取消",
    SELLER_REJECTED: role === "seller" ? "已关闭" : "已取消",
  };
  return labels[order.status] ?? order.status;
}

export function matchesOrderTab(order: CommerceOrder, tab: string, role: "buyer" | "seller" = "buyer") {
  const label = commerceOrderLabel(order, role);
  return tab === "全部" || label === tab || (tab === "售后" && label === "已退款");
}

export function sellerFulfillmentAction(order: CommerceOrder): "accept" | "start" | "complete" | null {
  if (order.payment_status !== "PAID" || (order.after_sale_status && order.after_sale_status !== "NONE")) return null;
  return ({ PENDING_ACCEPT: "accept", ACCEPTED: "start", IN_SERVICE: "complete" } as const)[order.status as "PENDING_ACCEPT" | "ACCEPTED" | "IN_SERVICE"] ?? null;
}
