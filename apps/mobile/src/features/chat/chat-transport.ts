import type { ApiClient } from "@/api/client";
import { getBearSticker } from "@xiongzai/contracts/bear-stickers";
import type { CursorPage, MessageApiView } from "@/types/api";
import type { ChatMedia } from "./chat-domain";

export interface ChatTransport {
  readonly mode: "WEBSOCKET" | "HTTP_POLLING";
  listMessages(conversationId: string, cursor?: string, signal?: AbortSignal): Promise<CursorPage<MessageApiView>>;
  sendMessage(conversationId: string, clientMessageId: string, content: string, stickerId?: string, media?: ChatMedia): Promise<MessageApiView>;
  markRead(conversationId: string, sequenceNo: string): Promise<{ conversation_id: string; last_read_sequence_no: string; unread_count: number }>;
}

export class HttpPollingChatTransport implements ChatTransport {
  readonly mode = "HTTP_POLLING" as const;
  constructor(private readonly client: ApiClient) {}
  listMessages(conversationId: string, cursor?: string, signal?: AbortSignal) { return this.client.request<CursorPage<MessageApiView>>(`/conversations/${conversationId}/messages?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }); }
  sendMessage(conversationId: string, clientMessageId: string, content: string, stickerId?: string, media?: ChatMedia) {
    if (stickerId !== undefined && !getBearSticker(stickerId)) throw new Error("表情暂不可用，请重新选择");
    if (media) {
      if (stickerId || !["IMAGE", "VOICE"].includes(media.type) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(media.fileId)) throw new Error("聊天附件无效，请重新选择");
      return this.client.request<MessageApiView>(`/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ client_message_id: clientMessageId, message_type: media.type, file_id: media.fileId }) });
    }
    return this.client.request<MessageApiView>(`/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify(stickerId ? { client_message_id: clientMessageId, message_type: "STICKER", sticker_id: stickerId } : { client_message_id: clientMessageId, content }) });
  }
  markRead(conversationId: string, sequenceNo: string) { return this.client.request<{ conversation_id: string; last_read_sequence_no: string; unread_count: number }>(`/conversations/${conversationId}/read`, { method: "POST", body: JSON.stringify({ last_read_sequence_no: sequenceNo }) }); }
}
