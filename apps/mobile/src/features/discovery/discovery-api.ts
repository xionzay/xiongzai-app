import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/auth/runtime";
import { buildSortedSearchPath, searchQueryKey, type SearchKind, type SearchSort } from "@/features/discovery/discovery-domain";
import type { AvailabilityApiView, CompanionApiView, CompanionDetailApiView, CompanionVoiceAccessApiView, CursorPage, ReviewApiView, ServiceApiView, ServiceDetailApiView } from "@/types/api";

export function useDiscoverySearch(kind: SearchKind, keyword: string, sort: SearchSort, enabled = true) {
  return useInfiniteQuery({
    queryKey: searchQueryKey(kind, keyword, sort),
    enabled,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => apiClient.publicRequest<CursorPage<CompanionApiView | ServiceApiView>>(
      buildSortedSearchPath({ kind, keyword, sort, cursor: pageParam || undefined }), { signal }
    ),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}

export function useCompanionReviews(sellerId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["companion-reviews", sellerId], enabled: enabled && Boolean(sellerId), initialPageParam: "",
    queryFn: ({ pageParam, signal }) => apiClient.publicRequest<CursorPage<ReviewApiView>>(`/companions/${sellerId}/reviews?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}

export function useCompanionDetail(id: string, enabled: boolean) {
  return useQuery({ queryKey: ["companion", id], enabled: enabled && Boolean(id), queryFn: ({ signal }) => apiClient.publicRequest<CompanionDetailApiView>(`/companions/${id}`, { signal }) });
}

export function getCompanionVoiceAccess(id: string, signal?: AbortSignal) {
  return apiClient.publicRequest<CompanionVoiceAccessApiView>(`/companions/${id}/voice`, { signal });
}

export function useServiceDetail(id: string, enabled: boolean) {
  return useQuery({ queryKey: ["service", id], enabled: enabled && Boolean(id), queryFn: ({ signal }) => apiClient.publicRequest<ServiceDetailApiView>(`/services/${id}`, { signal }) });
}

export function useAvailability(sellerId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["availability", sellerId], enabled: enabled && Boolean(sellerId),
    queryFn: ({ signal }) => apiClient.publicRequest<AvailabilityApiView[]>(`/companions/${sellerId}/availability`, { signal })
  });
}

export function useProductReviews(productId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["reviews", productId], enabled: enabled && Boolean(productId), initialPageParam: "",
    queryFn: ({ pageParam, signal }) => apiClient.publicRequest<CursorPage<ReviewApiView>>(`/products/${productId}/reviews?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}
