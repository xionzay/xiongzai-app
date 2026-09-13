import type { OrderApiView, SellerOrderAction } from "@/types/api";

export const sellerOrderLabels = {
  PENDING_PAYMENT: "待付款",
  PENDING_ACCEPT: "新订单 / 待接单",
  ACCEPTED: "已接单 / 待开始",
  IN_SERVICE: "服务中",
  PENDING_BUYER_CONFIRM: "待买家确认",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  CLOSED: "已关闭",
  SELLER_REJECTED: "已拒单"
} as const;

export function sellerOrderStatusLabel(order: OrderApiView): string {
  if (order.payment_status === "REFUNDED") return "已退款";
  if (order.after_sale_status === "IN_PROGRESS") return "售后中";
  return sellerOrderLabels[order.status];
}

export function sellerActions(order: OrderApiView): SellerOrderAction[] {
  return order.seller_available_actions ?? [];
}

export function scheduledStartReached(order: Pick<OrderApiView, "service_starts_at">, now = Date.now()): boolean {
  return new Date(order.service_starts_at).getTime() <= now;
}

export function sellerActionError(code: string): string {
  const copy: Record<string, string> = {
    RESOURCE_VERSION_CONFLICT: "订单已在其他设备更新，已重新加载最新状态，请确认后再操作。",
    ORDER_SERVICE_NOT_STARTED: "预约时间还未到，不能提前开始服务。",
    ORDER_STATE_INVALID: "订单状态已经变化，当前操作不可执行。",
    ORDER_NOT_FOUND: "订单不存在或你没有访问权限。"
  };
  return copy[code] ?? "操作未完成，请刷新订单状态后重试。";
}

