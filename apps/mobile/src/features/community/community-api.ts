import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/auth/runtime";
import { CommunityClient } from "./community-client";

export const communityClient = new CommunityClient(apiClient);
export function useFeedbackPolicy(userId: string) {
  return useQuery({ queryKey: ["feedback-policy", userId], queryFn: ({ signal }) => communityClient.policy(signal), staleTime: 0, retry: false });
}
export function useFeedback(userId: string) {
  return useInfiniteQuery({ queryKey: ["feedback", userId], initialPageParam: "", queryFn: ({ pageParam, signal }) => communityClient.feedback(pageParam, signal), getNextPageParam: page => page.next_cursor ?? undefined, staleTime: 0, gcTime: 0, retry: false });
}
export function useFeedbackDetail(userId: string, id: string) {
  return useQuery({ queryKey: ["feedback-detail", userId, id], enabled: Boolean(id), queryFn: ({ signal }) => communityClient.feedbackDetail(id, signal), staleTime: 0, gcTime: 0, retry: false });
}
export function useAnnouncements() {
  return useInfiniteQuery({ queryKey: ["public-announcements"], initialPageParam: "", queryFn: ({ pageParam, signal }) => communityClient.announcements(pageParam, signal), getNextPageParam: page => page.next_cursor ?? undefined, staleTime: 0, gcTime: 0, retry: false });
}
export function useAnnouncement(id: string) {
  return useQuery({ queryKey: ["public-announcement", id], enabled: Boolean(id), queryFn: ({ signal }) => communityClient.announcement(id, signal), staleTime: 0, gcTime: 0, retry: false });
}
