import type { MessageApiView, NotificationApiView, NotificationCategory, NotificationRelatedObjectType as RelatedObjectType } from "@/types/api";

const notificationCopies: Record<NotificationCategory, { badge: string; label: string }> = {
  ORDER: { badge: "订", label: "订单通知" },
  ACCOUNT: { badge: "账", label: "账户通知" },
  PLATFORM: { badge: "平", label: "平台通知" },
  FEEDBACK: { badge: "反", label: "反馈通知" }
};

export function notificationCategoryCopy(category: string): { badge: string; label: string } {
  return Object.hasOwn(notificationCopies, category)
    ? notificationCopies[category as NotificationCategory]
    : { badge: "通", label: "其他通知" };
}

export function notificationListPath(category?: NotificationCategory, cursor?: string): string {
  return `/notifications?limit=20&include_feedback=true${category ? `&category=${category}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
}

export type ChatMedia = { type: "IMAGE" | "VOICE"; fileId: string };
export type LocalMessage = { clientMessageId: string; content: string; stickerId?: string; media?: ChatMedia; state: "SENDING" | "FAILED"; createdAt: string };
export const CHAT_POLL_INTERVAL_MS = 5_000;

// A restored in-flight record has no running request in this screen. Offer a
// same-ID retry instead of leaving its bubble stuck on “发送中”.
export function recoverPendingMessage(message: LocalMessage | null): LocalMessage | null {
  return message ? { ...message, state: "FAILED" } : null;
}

export function mergeServerMessages(pages: { items: MessageApiView[] }[]): MessageApiView[] {
  const seen = new Set<string>(); const result: MessageApiView[] = [];
  for (const message of pages.flatMap((page) => page.items)) if (!seen.has(message.id)) { seen.add(message.id); result.push(message); }
  return result.sort((left, right) => Number(BigInt(right.sequence_no) - BigInt(left.sequence_no)));
}

export function shouldPollChat(appState: string, online: boolean) { return appState === "active" && online; }
export function sentMessageState(message: Pick<MessageApiView, "send_status" | "read_by_recipient">) { if (message.send_status === "FAILED") return "FAILED"; return message.read_by_recipient ? "READ" : "SENT"; }
export function maxSequence(messages: Pick<MessageApiView, "sequence_no">[]) { return messages.reduce((max, item) => BigInt(item.sequence_no) > BigInt(max) ? item.sequence_no : max, "0"); }

export type NotificationDestination = { pathname: string; params?: Record<string, string> } | null;
export function notificationDestination(type: RelatedObjectType | null, id: string | null, variables: Record<string, unknown>): NotificationDestination {
  if (type === "FEEDBACK") return id ? { pathname: "/feedback", params: { id } } : null;
  if (type === "ANNOUNCEMENT") return id ? { pathname: "/announcements/[id]", params: { id } } : null;
  if (type === "ORDER" && id) return { pathname: "/orders/[id]", params: { id } };
  if (type === "REFUND" && id) return { pathname: "/refunds/[id]", params: { id } };
  if (type === "COMPLAINT" && id) return { pathname: "/complaints/[id]", params: { id } };
  if (type === "CONVERSATION" && id) return { pathname: "/conversations/[id]", params: { id } };
  if (type === "SUPPORT_CASE" && id) return { pathname: "/support/[id]", params: { id } };
  if (type === "WITHDRAWAL" && id) return { pathname: "/(buyer-tabs)/mine" };
  if (type === "USER" || type === "PLATFORM") return { pathname: "/(buyer-tabs)/mine" };
  const conversationId = typeof variables.conversation_id === "string" ? variables.conversation_id : null;
  return conversationId ? { pathname: "/conversations/[id]", params: { id: conversationId } } : null;
}

export function notificationBody(notification: Pick<NotificationApiView, "content_variables" | "title">) { const content = notification.content_variables.content ?? notification.content_variables.message; return typeof content === "string" && content.trim() ? content : notification.title; }
