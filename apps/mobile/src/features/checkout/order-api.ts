import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/auth/runtime";
import type { AfterSaleStatus, CursorPage, OrderApiView, OrderDetailApiView, OrderDraftApi, OrderPreviewApiView, OrderStatus, PaymentApiView } from "@/types/api";
import type { PaymentChannel } from "@xiongzai/contracts";

export function previewOrder(draft: OrderDraftApi, signal?: AbortSignal) {
  return apiClient.request<OrderPreviewApiView>("/orders/preview", { method: "POST", body: JSON.stringify(draft), signal });
}

export function createOrder(draft: OrderDraftApi, idempotencyKey: string) {
  return apiClient.request<OrderApiView>("/orders", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify(draft) });
}

export function createPayment(orderId: string, paymentChannel: PaymentChannel, idempotencyKey: string) {
  return apiClient.request<PaymentApiView>("/payments", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify({ order_id: orderId, payment_channel: paymentChannel }) });
}

export function confirmMockPayment(paymentId: string) {
  return apiClient.request<{ payment: PaymentApiView; order: OrderApiView }>(`/payments/${paymentId}/mock-confirm`, { method: "POST" });
}

export function failMockPayment(paymentId: string) {
  return apiClient.request<unknown>(`/payments/${paymentId}/mock-fail`, { method: "POST" });
}

export function cancelMockPayment(paymentId: string) {
  return apiClient.request<PaymentApiView>(`/payments/${paymentId}/mock-cancel`, { method: "POST" });
}

export function cancelOrder(orderId: string, version: number, reason: string) {
  return apiClient.request<OrderApiView>(`/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify({ version, reason }) });
}
export function confirmOrderComplete(orderId: string, version: number) { return apiClient.request<OrderApiView>(`/orders/${orderId}/confirm`, { method: "POST", body: JSON.stringify({ version }) }); }
export function buyerClockAction(orderId: string, action: "extend-receipt" | "remind", version: number) { return apiClient.request<OrderApiView>(`/orders/${orderId}/${action}`, { method: "POST", body: JSON.stringify({ version }) }); }

export function useOrderPreview(draft: OrderDraftApi | null) {
  return useQuery({
    queryKey: ["order-preview", draft], enabled: Boolean(draft), retry: false,
    queryFn: ({ signal }) => previewOrder(draft!, signal)
  });
}

export function useOrderDetail(orderId: string, enabled = true) {
  return useQuery({ queryKey: ["order", orderId], enabled: enabled && Boolean(orderId), queryFn: ({ signal }) => apiClient.request<OrderDetailApiView>(`/orders/${orderId}`, { signal }) });
}

export function usePayment(paymentId: string, enabled = true) {
  return useQuery({ queryKey: ["payment", paymentId], enabled: enabled && Boolean(paymentId), retry: false, queryFn: ({ signal }) => apiClient.request<PaymentApiView>(`/payments/${paymentId}`, { signal }) });
}

export function useBuyerOrders(enabled = true, status?: OrderStatus, afterSaleStatus?: AfterSaleStatus) {
  return useInfiniteQuery({
    queryKey: ["buyer-orders", status, afterSaleStatus], enabled, initialPageParam: "",
    queryFn: ({ pageParam, signal }) => apiClient.request<CursorPage<OrderApiView>>(`/orders?limit=20${status ? `&status=${status}` : ""}${afterSaleStatus ? `&after_sale_status=${afterSaleStatus}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}
