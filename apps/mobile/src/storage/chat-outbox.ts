import type { SecureStoreAdapter } from "@/storage/secure-credentials";
import type { LocalMessage } from "@/features/chat/chat-domain";

export class ChatOutboxStore {
  constructor(private readonly adapter: SecureStoreAdapter, private readonly createId: () => string) {}
  async prepare(conversationId: string, content: string): Promise<LocalMessage> { const current = await this.read(conversationId); if (current?.content === content) { const retry = { ...current, state: "SENDING" as const }; await this.write(conversationId, retry); return retry; } const next: LocalMessage = { clientMessageId: `mobile-${this.createId()}`, content, state: "SENDING", createdAt: new Date().toISOString() }; await this.write(conversationId, next); return next; }
  async failed(conversationId: string, message: LocalMessage) { const next = { ...message, state: "FAILED" as const }; await this.write(conversationId, next); return next; }
  async read(conversationId: string): Promise<LocalMessage | null> { const raw = await this.adapter.getItemAsync(this.key(conversationId)); if (!raw) return null; try { const value = JSON.parse(raw) as LocalMessage; return value.clientMessageId && value.content && ["SENDING", "FAILED"].includes(value.state) ? value : null; } catch { return null; } }
  async clear(conversationId: string) { await this.adapter.deleteItemAsync(this.key(conversationId)); const ids = await this.readIndex(); await this.adapter.setItemAsync(ChatOutboxStore.indexKey, JSON.stringify(ids.filter((id) => id !== conversationId))); }
  async clearAll() { const ids = await this.readIndex(); await Promise.all(ids.map((id) => this.adapter.deleteItemAsync(this.key(id)))); await this.adapter.deleteItemAsync(ChatOutboxStore.indexKey); }
  private async write(conversationId: string, value: LocalMessage) { await this.adapter.setItemAsync(this.key(conversationId), JSON.stringify(value)); const ids = await this.readIndex(); if (!ids.includes(conversationId)) await this.adapter.setItemAsync(ChatOutboxStore.indexKey, JSON.stringify([...ids, conversationId])); }
  private async readIndex(): Promise<string[]> { const raw = await this.adapter.getItemAsync(ChatOutboxStore.indexKey); if (!raw) return []; try { const value = JSON.parse(raw) as unknown; return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; } }
  private key(conversationId: string) { return `xiongzai.chat.outbox.${conversationId}`; }
  private static readonly indexKey = "xiongzai.chat.outbox.index";
}
