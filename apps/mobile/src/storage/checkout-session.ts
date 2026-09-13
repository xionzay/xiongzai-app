import type { SecureStoreAdapter } from "@/storage/secure-credentials";
import type { PaymentChannel } from "@xiongzai/contracts";

export interface CheckoutSession {
  userId: string;
  fingerprint: string;
  orderKey: string;
  orderId?: string;
  paymentKey?: string;
  paymentId?: string;
  paymentChannel?: PaymentChannel;
}

export class CheckoutSessionStore {
  constructor(private readonly adapter: SecureStoreAdapter, private readonly key = "xiongzai.checkout.session") {}

  async read(): Promise<CheckoutSession | null> {
    const raw = await this.adapter.getItemAsync(this.key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<CheckoutSession>;
      return typeof value.userId === "string" && typeof value.fingerprint === "string" && typeof value.orderKey === "string" ? value as CheckoutSession : null;
    } catch {
      return null;
    }
  }

  async getOrCreateOrderIntent(userId: string, fingerprint: string, createKey: () => string): Promise<CheckoutSession> {
    const current = await this.read();
    if (current?.userId === userId && current.fingerprint === fingerprint) return current;
    const next: CheckoutSession = { userId, fingerprint, orderKey: createKey() };
    await this.write(next);
    return next;
  }

  async attachOrder(orderId: string): Promise<CheckoutSession> {
    const current = await this.requireSession();
    const next = { ...current, orderId };
    await this.write(next);
    return next;
  }

  async getOrCreatePaymentIntent(userId: string, orderId: string, paymentChannel: PaymentChannel, createKey: () => string): Promise<CheckoutSession> {
    const current = await this.read();
    if (current?.userId === userId && current.orderId === orderId && current.paymentChannel === paymentChannel && current.paymentKey) return current;
    const base: CheckoutSession = current?.userId === userId ? current : { userId, fingerprint: `order:${orderId}`, orderKey: `resume:${orderId}` };
    const next = { ...base, orderId, paymentChannel, paymentKey: createKey(), paymentId: undefined };
    await this.write(next);
    return next;
  }

  async attachPayment(paymentId: string): Promise<CheckoutSession> {
    const current = await this.requireSession();
    const next = { ...current, paymentId };
    await this.write(next);
    return next;
  }

  async rotatePaymentIntent(orderId: string, paymentChannel: PaymentChannel, createKey: () => string): Promise<CheckoutSession> {
    const current = await this.requireSession();
    const next = { ...current, orderId, paymentChannel, paymentKey: createKey(), paymentId: undefined };
    await this.write(next);
    return next;
  }

  clear(): Promise<void> {
    return this.adapter.deleteItemAsync(this.key);
  }

  private async requireSession(): Promise<CheckoutSession> {
    const current = await this.read();
    if (!current) throw new Error("结算会话不存在，请重新选择服务");
    return current;
  }

  private write(value: CheckoutSession): Promise<void> {
    return this.adapter.setItemAsync(this.key, JSON.stringify(value));
  }
}
