import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient, chatOutboxStore } from "@/auth/runtime";
import { HttpPollingChatTransport } from "@/features/chat/chat-transport";
import { SupportCaseCreator, type SupportCreateInput } from "@/features/chat/support-case-creator";
import type { ConversationApiView, CursorPage, NotificationApiView, NotificationCategory, NotificationRelatedObjectType as RelatedObjectType, PublicUserApiView, SupportCaseApiView, SupportCaseDetailApiView } from "@/types/api";
import { notificationListPath } from "@/features/chat/chat-domain";

export const chatTransport = new HttpPollingChatTransport(apiClient);
export { chatOutboxStore };

export function useConversations(enabled: boolean, polling: boolean) {
  return useInfiniteQuery({
    queryKey: ["conversations"], enabled, initialPageParam: "", refetchInterval: polling ? 5_000 : false,
    queryFn: ({ pageParam, signal }) => apiClient.request<CursorPage<ConversationApiView>>(`/conversations?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}

export function useConversation(id: string, enabled: boolean, polling: boolean) {
  return useQuery({ queryKey: ["conversation", id], enabled: enabled && Boolean(id), refetchInterval: polling ? 5_000 : false, queryFn: ({ signal }) => apiClient.request<ConversationApiView>(`/conversations/${id}`, { signal }) });
}

export function useMessages(id: string, enabled: boolean, polling: boolean) {
  return useInfiniteQuery({
    queryKey: ["conversation-messages", id], enabled: enabled && Boolean(id), initialPageParam: "", refetchInterval: polling ? 5_000 : false,
    queryFn: ({ pageParam, signal }) => chatTransport.listMessages(id, pageParam || undefined, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}

export function useConversationUnread(enabled: boolean, polling: boolean) {
  return useQuery({ queryKey: ["conversation-unread"], enabled, refetchInterval: polling ? 5_000 : false, queryFn: ({ signal }) => apiClient.request<{ unread_count: number }>("/conversations/unread-count", { signal }) });
}

export function createConsultation(productId: string) { return apiClient.request<ConversationApiView>("/conversations/consultations", { method: "POST", body: JSON.stringify({ product_id: productId }) }); }
export function createOrderConversation(orderId: string) { return apiClient.request<ConversationApiView>("/conversations/orders", { method: "POST", body: JSON.stringify({ order_id: orderId }) }); }

export function useNotifications(enabled: boolean, polling: boolean, category?: NotificationCategory) {
  return useInfiniteQuery({
    queryKey: ["notifications", category], enabled, initialPageParam: "", refetchInterval: polling ? 10_000 : false,
    queryFn: ({ pageParam, signal }) => apiClient.request<CursorPage<NotificationApiView>>(notificationListPath(category, pageParam), { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
}
export function useNotification(id: string, enabled = true) { return useQuery({ queryKey: ["notification", id], enabled: enabled && Boolean(id), queryFn: ({ signal }) => apiClient.request<NotificationApiView>(`/notifications/${id}`, { signal }) }); }
export function useNotificationUnread(enabled: boolean, polling: boolean) { return useQuery({ queryKey: ["notification-unread"], enabled, refetchInterval: polling ? 10_000 : false, queryFn: ({ signal }) => apiClient.request<{ unread_count: number }>("/notifications/unread-count?include_feedback=true", { signal }) }); }
export function markNotificationRead(id: string) { return apiClient.request<NotificationApiView>(`/notifications/${id}/read`, { method: "POST" }); }
export function markAllNotificationsRead() { return apiClient.request<{ updated_count: number }>("/notifications/read-all?include_feedback=true", { method: "POST" }); }

export type { SupportCreateInput } from "@/features/chat/support-case-creator";
const supportCaseCreator = new SupportCaseCreator(chatOutboxStore, (body) => apiClient.request<SupportCaseApiView>("/support-cases", { method: "POST", body: JSON.stringify(body) }));
export function createSupportCase(input: SupportCreateInput, userId: string, isCurrent: () => boolean) { return supportCaseCreator.create(input, userId, isCurrent); }
export function useSupportCases(enabled = true) { return useInfiniteQuery({ queryKey: ["support-cases"], enabled, initialPageParam: "", queryFn: ({ pageParam, signal }) => apiClient.request<CursorPage<SupportCaseApiView>>(`/support-cases?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }), getNextPageParam: (page) => page.next_cursor ?? undefined }); }
export function useSupportCase(id: string, enabled = true) { return useQuery({ queryKey: ["support-case", id], enabled: enabled && Boolean(id), queryFn: ({ signal }) => apiClient.request<SupportCaseDetailApiView>(`/support-cases/${id}`, { signal }) }); }
export function reopenSupportCase(id: string, version: number, reason: string) { return apiClient.request<SupportCaseApiView>(`/support-cases/${id}/reopen`, { method: "POST", body: JSON.stringify({ version, reason }) }); }
export function usePublicUser(id: string, enabled = true) { return useQuery({ queryKey: ["public-user", id], enabled: enabled && Boolean(id), retry: false, queryFn: ({ signal }) => apiClient.publicRequest<PublicUserApiView>(`/users/${id}/public-profile`, { signal }) }); }

export async function verifyNotificationTarget(type: RelatedObjectType | null, id: string | null, variables: Record<string, unknown> = {}) {
  if (!id) {
    if (!type && typeof variables.conversation_id === "string") await apiClient.request(`/conversations/${variables.conversation_id}`);
    return;
  }
  if (type === "ORDER") await apiClient.request(`/orders/${id}`);
  else if (type === "REFUND") await apiClient.request(`/refunds/${id}`);
  else if (type === "COMPLAINT") await apiClient.request(`/complaints/${id}`);
  else if (type === "CONVERSATION") await apiClient.request(`/conversations/${id}`);
  else if (type === "SUPPORT_CASE") await apiClient.request(`/support-cases/${id}`);
  else if (type === "FEEDBACK") await apiClient.request(`/feedback/${encodeURIComponent(id)}`);
  else if (type === "ANNOUNCEMENT") await apiClient.publicRequest(`/announcements/${encodeURIComponent(id)}`);
}
