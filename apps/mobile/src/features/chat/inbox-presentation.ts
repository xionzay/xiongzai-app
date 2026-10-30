import type { ConversationApiView } from "@/types/api";

export function supportInboxSummary(items: readonly ConversationApiView[]) {
  const unique = [...new Map(items.filter(item => item.conversation_type === 'SUPPORT').map(item => [item.id, item])).values()];
  const timestamp = (item: ConversationApiView) => Date.parse(item.last_message_at ?? item.created_at) || 0;
  const latest = unique.reduce<ConversationApiView | null>((current, item) => !current || timestamp(item) > timestamp(current) ? item : current, null);
  return { latest, unread: unique.reduce((total, item) => total + Math.max(0, item.unread_count), 0) };
}

/** Search only loaded summaries; never present this as full history search. */
export function inboxRows(items: readonly ConversationApiView[], seller: boolean, keyword: string) {
  const query = keyword.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    if (item.conversation_type === "SUPPORT" || (seller ? item.member_role !== "SELLER" : item.member_role === "SELLER")) return false;
    return !query || item.counterpart.nickname.toLocaleLowerCase().includes(query) || (item.last_message_preview ?? "").toLocaleLowerCase().includes(query);
  });
}

export function inboxTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
