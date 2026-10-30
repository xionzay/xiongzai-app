import { notificationCategories, relatedObjectTypes } from "./messaging.js";

/** Opt-in contracts: existing notification clients keep their exhaustive unions. */
export const notificationCategoriesWithFeedback = [...notificationCategories, "FEEDBACK"] as const;
export const relatedObjectTypesWithCommunity = [...relatedObjectTypes, "FEEDBACK", "ANNOUNCEMENT"] as const;
export type CommunityNotificationCategory = typeof notificationCategoriesWithFeedback[number];
export type CommunityRelatedObjectType = typeof relatedObjectTypesWithCommunity[number];

/** Plain text only. Clients must never render these fields as HTML. */
export const feedbackStatuses = ["SUBMITTED", "PROCESSING", "REPLIED"] as const;
export const announcementStatuses = ["DRAFT", "PUBLISHED", "RETIRED"] as const;

export interface CreateFeedbackRequest {
  client_request_id: string;
  content: string;
}

export interface FeedbackResponse {
  id: string;
  client_request_id: string;
  content: string;
  status: typeof feedbackStatuses[number];
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  version: number;
}

export interface AnnouncementDraftRequest {
  title: string;
  content: string;
  cover_file_id?: string | null;
  reason: string;
}

export interface PublicAnnouncementResponse {
  id: string;
  title: string;
  content: string;
  cover_file_id: string | null;
  cover_access_path: string;
  published_at: string;
  version: number;
}
