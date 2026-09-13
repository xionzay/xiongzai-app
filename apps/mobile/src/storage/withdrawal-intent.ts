import type { SecureStoreAdapter } from "@/storage/secure-credentials";

type WithdrawalIntent = { fingerprintHash: string; idempotencyKey: string };
const storageKey = "xiongzai.withdrawal.intent.v1";

export class WithdrawalIntentStore {
  constructor(private readonly store: SecureStoreAdapter, private readonly createId: () => string) {}
  async keyFor(fingerprintHash: string): Promise<string> {
    const current = await this.read();
    if (current?.fingerprintHash === fingerprintHash) return current.idempotencyKey;
    const next = { fingerprintHash, idempotencyKey: `withdrawal-${this.createId()}` };
    await this.store.setItemAsync(storageKey, JSON.stringify(next));
    return next.idempotencyKey;
  }
  clear(): Promise<void> { return this.store.deleteItemAsync(storageKey); }
  private async read(): Promise<WithdrawalIntent | null> {
    const raw = await this.store.getItemAsync(storageKey); if (!raw) return null;
    try { const value = JSON.parse(raw) as WithdrawalIntent; return value.fingerprintHash && value.idempotencyKey ? value : null; } catch { return null; }
  }
}

