import type { SecureStoreAdapter } from "@/storage/secure-credentials";

type Intent = { fingerprint: string; idempotencyKey: string };
const key = "xiongzai.refund.intent.v1";

export class AfterSaleIntentStore {
  constructor(private readonly store: SecureStoreAdapter, private readonly createId: () => string) {}
  async refundKey(fingerprint: string) {
    const current = await this.read();
    if (current?.fingerprint === fingerprint) return current.idempotencyKey;
    const next = { fingerprint, idempotencyKey: `refund-${this.createId()}` };
    await this.store.setItemAsync(key, JSON.stringify(next));
    return next.idempotencyKey;
  }
  async clearRefund() { await this.store.deleteItemAsync(key); }
  private async read(): Promise<Intent | null> { const raw = await this.store.getItemAsync(key); if (!raw) return null; try { const value = JSON.parse(raw) as Intent; return value.fingerprint && value.idempotencyKey ? value : null; } catch { return null; } }
}
