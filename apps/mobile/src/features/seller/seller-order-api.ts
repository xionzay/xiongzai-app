import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/auth/runtime";
import type { AfterSaleStatus, CursorPage, OrderApiView, OrderDetailApiView, OrderStatus, RefundApiView, RefundSummaryApiView } from "@/types/api";

export function useSellerOrders(enabled = true, status?: OrderStatus, afterSaleStatus?: AfterSaleStatus) {
  return useInfiniteQuery({
    queryKey: ["seller-orders", status, afterSaleStatus], enabled, initialPageParam: "",
    queryFn: ({ pageParam, signal }) => apiClient.request<CursorPage<OrderApiView>>(`/seller/orders?limit=20${status ? `&status=${status}` : ""}${afterSaleStatus ? `&after_sale_status=${afterSaleStatus}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}
export function useSellerOrder(id: string) { return useQuery({ queryKey: ["seller-order", id], enabled: Boolean(id), retry: false, queryFn: ({ signal }) => apiClient.request<OrderDetailApiView>(`/seller/orders/${id}`, { signal }) }); }
export function sellerOrderAction(id: string, action: "accept" | "start" | "complete", version: number) { return apiClient.request<OrderApiView>(`/seller/orders/${id}/${action}`, { method: "POST", body: JSON.stringify({ version }) }); }
export function rejectSellerOrder(id: string, version: number, reason: string) { return apiClient.request<OrderApiView>(`/seller/orders/${id}/reject`, { method: "POST", body: JSON.stringify({ version, reason }) }); }
export function useSellerRefunds() { return useQuery({ queryKey: ["seller-refunds"], queryFn: ({ signal }) => apiClient.request<RefundSummaryApiView[]>("/seller/refunds", { signal }) }); }
export function useSellerRefund(id: string) { return useQuery({ queryKey: ["seller-refund", id], enabled: Boolean(id), retry: false, queryFn: ({ signal }) => apiClient.request<RefundApiView>(`/seller/refunds/${id}`, { signal }) }); }
export function decideSellerRefund(id: string, input: { version: number; decision: "APPROVE" | "REJECT"; reason: string }) { return apiClient.request<RefundApiView>(`/seller/refunds/${id}/decision`, { method: "POST", body: JSON.stringify(input) }); }

