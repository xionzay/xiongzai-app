import type { OrderApiView, OrderStatus } from '@/types/api';
export type BuyerOrderFilter = OrderStatus | 'AFTER_SALE' | 'PENDING_REVIEW' | 'ALL';
export function orderFilterRequest(filter: BuyerOrderFilter) {
  return { status: filter === 'ALL' || filter === 'AFTER_SALE' ? undefined : filter === 'PENDING_REVIEW' ? 'COMPLETED' as const : filter,
    afterSale: filter === 'AFTER_SALE' ? 'IN_PROGRESS' as const : undefined };
}
export function visibleBuyerOrders(items: OrderApiView[], filter: BuyerOrderFilter) {
  // Only explicit server facts qualify; never infer "not reviewed" from missing data.
  return filter === 'PENDING_REVIEW' ? items.filter(item => item.status === 'COMPLETED' && item.reviewed === false) : items;
}
