import type { OrderApiView, OrderStatus } from '@/types/api';

export type SellerHomeFilter = 'ALL' | 'PENDING_SERVICE' | 'PENDING_ACCEPT' | 'ACCEPTED' | 'IN_SERVICE' | 'PENDING_BUYER_CONFIRM' | 'COMPLETED' | 'AFTER_SALE';
export function resolveSellerHomeFilter(value: string | string[] | undefined): SellerHomeFilter | undefined {
  switch (value) {
    case 'ALL': case 'PENDING_SERVICE': case 'PENDING_ACCEPT': case 'ACCEPTED': case 'IN_SERVICE': case 'PENDING_BUYER_CONFIRM': case 'COMPLETED': case 'AFTER_SALE': return value;
    default: return undefined;
  }
}
const taskStates = new Set<OrderStatus>(['PENDING_SERVICE', 'PENDING_ACCEPT', 'ACCEPTED', 'IN_SERVICE', 'PENDING_BUYER_CONFIRM']);
export type SellerTaskOrder = Pick<OrderApiView, 'id' | 'status'> & Partial<Pick<OrderApiView, 'after_sale_status' | 'fulfillment_due_at' | 'service_starts_at' | 'auto_confirm_at'>>;
export function sellerHomeTasks<T extends SellerTaskOrder>(orders: readonly T[]): T[] {
  const seen = new Set<string>();
  return orders.filter(order => {
    if (seen.has(order.id)) return false;
    seen.add(order.id);
    return order.after_sale_status === 'IN_PROGRESS' || taskStates.has(order.status);
  }).sort((a, b) => deadline(a) - deadline(b));
}
function deadline(order: SellerTaskOrder) {
  const date = order.fulfillment_due_at ?? order.service_starts_at ?? order.auto_confirm_at;
  const time = date ? Date.parse(date) : NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}
