import type { MessageApiView, NotificationApiView, RelatedObjectType } from "@/types/api";

export type LocalMessage = { clientMessageId: string; content: string; state: "SENDING" | "FAILED"; createdAt: string };
export const CHAT_POLL_INTERVAL_MS = 5_000;

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
