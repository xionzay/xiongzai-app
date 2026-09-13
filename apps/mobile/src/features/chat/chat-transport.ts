import type { ApiClient } from "@/api/client";
import type { CursorPage, MessageApiView } from "@/types/api";

export interface ChatTransport {
  readonly mode: "WEBSOCKET" | "HTTP_POLLING";
  listMessages(conversationId: string, cursor?: string, signal?: AbortSignal): Promise<CursorPage<MessageApiView>>;
  sendMessage(conversationId: string, clientMessageId: string, content: string): Promise<MessageApiView>;
  markRead(conversationId: string, sequenceNo: string): Promise<{ conversation_id: string; last_read_sequence_no: string; unread_count: number }>;
}

export class HttpPollingChatTransport implements ChatTransport {
  readonly mode = "HTTP_POLLING" as const;
  constructor(private readonly client: ApiClient) {}
  listMessages(conversationId: string, cursor?: string, signal?: AbortSignal) { return this.client.request<CursorPage<MessageApiView>>(`/conversations/${conversationId}/messages?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }); }
  sendMessage(conversationId: string, clientMessageId: string, content: string) { return this.client.request<MessageApiView>(`/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ client_message_id: clientMessageId, content }) }); }
  markRead(conversationId: string, sequenceNo: string) { return this.client.request<{ conversation_id: string; last_read_sequence_no: string; unread_count: number }>(`/conversations/${conversationId}/read`, { method: "POST", body: JSON.stringify({ last_read_sequence_no: sequenceNo }) }); }
}
