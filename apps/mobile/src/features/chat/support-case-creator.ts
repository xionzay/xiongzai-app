import type { SupportPriority } from "@xiongzai/contracts";
import type { ChatOutboxStore } from "@/storage/chat-outbox";
import type { RelatedObjectType, SupportCaseApiView } from "@/types/api";

export type SupportCreateInput = { topic: string; priority: SupportPriority; initial_message: string; related_type?: Extract<RelatedObjectType, "ORDER" | "PAYMENT" | "REFUND" | "COMPLAINT" | "WITHDRAWAL">; related_id?: string; source_page?: string };
export type SupportCreateRequest = SupportCreateInput & { queue_key: "general"; client_message_id: string };

/** Creation retries use secure, account-scoped outbox storage, just like messages. */
export class SupportCaseCreator {
  constructor(private readonly outbox: ChatOutboxStore, private readonly request: (body: SupportCreateRequest) => Promise<SupportCaseApiView>) {}

  async create(input: SupportCreateInput, userId: string, isCurrent: () => boolean): Promise<SupportCaseApiView> {
    if (!userId || !isCurrent()) throw new Error("登录状态已变化，请重新打开客服页面");
    const scope = `support-create.${userId}.${input.source_page?.replace(/[^a-zA-Z0-9_.-]/g, ".") ?? "general"}.${input.related_type ?? "none"}.${input.related_id ?? "none"}`;
    const payload = {
      topic: input.topic.trim(), priority: input.priority, queue_key: "general" as const,
      initial_message: input.initial_message.trim(), related_type: input.related_type,
      related_id: input.related_id, source_page: input.source_page
    };
    const pending = await this.outbox.prepare(scope, JSON.stringify(payload));
    if (!isCurrent()) throw new Error("登录状态已变化，本次未发送客服请求");
    const result = await this.request({ ...payload, client_message_id: pending.clientMessageId });
    // The server already acknowledged creation. A local cleanup failure must
    // not become a false send failure; retaining the ID is safe for replay.
    await this.outbox.clear(scope, pending.clientMessageId).catch(() => undefined);
    return result;
  }
}
