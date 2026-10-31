import type { SecureStoreAdapter } from "@/storage/secure-credentials";
import type { ChatMedia, LocalMessage } from "@/features/chat/chat-domain";

export class ChatOutboxStore {
  private operations: Promise<void> = Promise.resolve();
  private epoch = 0;
  private readonly messageEpochs = new WeakMap<LocalMessage, number>();

  constructor(private readonly adapter: SecureStoreAdapter, private readonly createId: () => string) {}

  prepare(conversationId: string, content: string, stickerId?: string, media?: ChatMedia): Promise<LocalMessage> {
    const epoch = this.epoch;
    return this.serialize(async () => {
      if (epoch !== this.epoch) throw new Error("聊天会话已失效，请重新登录后发送");
      const current = await this.readMessage(conversationId);
      const next: LocalMessage = current?.content === content && current?.stickerId === stickerId && current?.media?.type === media?.type && current?.media?.fileId === media?.fileId
        ? { ...current, state: "SENDING" }
        : { clientMessageId: `mobile-${this.createId()}`, content, ...(stickerId ? { stickerId } : {}), ...(media ? { media } : {}), state: "SENDING", createdAt: new Date().toISOString() };
      await this.write(conversationId, next);
      // clearAll invalidates immediately, even while a storage operation is in flight.
      if (epoch !== this.epoch) throw new Error("聊天会话已失效，请重新登录后发送");
      this.messageEpochs.set(next, epoch);
      return next;
    });
  }

  failed(conversationId: string, message: LocalMessage): Promise<LocalMessage> {
    const epoch = this.messageEpochs.get(message);
    return this.serialize(async () => {
      const next: LocalMessage = { ...message, state: "FAILED" };
      if (epoch !== this.epoch) return next;
      const current = await this.readMessage(conversationId);
      if (current?.clientMessageId !== message.clientMessageId) return next;
      await this.write(conversationId, next);
      this.messageEpochs.set(next, epoch);
      return next;
    });
  }

  read(conversationId: string): Promise<LocalMessage | null> {
    const epoch = this.epoch;
    return this.serialize(async () => {
      const value = await this.readMessage(conversationId);
      if (epoch !== this.epoch) return null;
      if (value) this.messageEpochs.set(value, epoch);
      return value;
    });
  }

  clear(conversationId: string, clientMessageId?: string): Promise<void> {
    const epoch = this.epoch;
    return this.serialize(async () => {
      if (epoch !== this.epoch) return;
      if (clientMessageId && (await this.readMessage(conversationId))?.clientMessageId !== clientMessageId) return;
      await this.adapter.deleteItemAsync(this.key(conversationId));
      const ids = await this.readIndex();
      await this.adapter.setItemAsync(ChatOutboxStore.indexKey, JSON.stringify(ids.filter((id) => id !== conversationId)));
    });
  }

  clearAll(): Promise<void> {
    this.epoch++;
    return this.serialize(async () => {
      const ids = await this.readIndex();
      // Keep the index if any deletion fails so a later cleanup can retry it.
      await Promise.all(ids.map((id) => this.adapter.deleteItemAsync(this.key(id))));
      await this.adapter.deleteItemAsync(ChatOutboxStore.indexKey);
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readMessage(conversationId: string): Promise<LocalMessage | null> {
    const raw = await this.adapter.getItemAsync(this.key(conversationId));
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as LocalMessage;
      return typeof value.clientMessageId === "string" && Boolean(value.clientMessageId)
        && typeof value.content === "string" && Boolean(value.content)
        && (value.stickerId === undefined || (typeof value.stickerId === "string" && Boolean(value.stickerId)))
        && (value.media === undefined || (!value.stickerId && ["IMAGE", "VOICE"].includes(value.media.type) && typeof value.media.fileId === "string" && /^[a-f0-9-]{36}$/iu.test(value.media.fileId)))
        && typeof value.createdAt === "string" && ["SENDING", "FAILED"].includes(value.state) ? value : null;
    } catch { return null; }
  }

  private async write(conversationId: string, value: LocalMessage) {
    const ids = await this.readIndex();
    // Index first: failed indexing must never leave an untracked private message.
    if (!ids.includes(conversationId)) await this.adapter.setItemAsync(ChatOutboxStore.indexKey, JSON.stringify([...ids, conversationId]));
    await this.adapter.setItemAsync(this.key(conversationId), JSON.stringify(value));
  }
  private async readIndex(): Promise<string[]> { const raw = await this.adapter.getItemAsync(ChatOutboxStore.indexKey); if (!raw) return []; try { const value = JSON.parse(raw) as unknown; return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; } }
  private key(conversationId: string) { return `xiongzai.chat.outbox.${conversationId}`; }
  private static readonly indexKey = "xiongzai.chat.outbox.index";
}
