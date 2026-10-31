import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, type PaymentChannel } from "@xiongzai/contracts";
import type { MockTransferStore } from "./mock-transfer-store.js";
import type { TransferResult } from "./durable-transfers.js";

export type PaymentCallbackPayload = {
  event_id: string;
  event_type: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED";
  payment_no: string;
  provider_transaction_id: string;
  amount_cent: string;
};

export type RefundCallbackPayload = {
  event_id: string;
  event_type: "REFUND_SUCCEEDED" | "REFUND_FAILED";
  refund_no: string;
  provider_refund_no: string;
  amount_cent: string;
};

export interface PaymentProvider {
  readonly channel: PaymentChannel;
  readonly mode: "mock" | "live";
  createPayment(input: { paymentNo: string; orderNo: string; amountCent: bigint; expiresAt: Date }): Promise<{ providerRequestId: string; clientPayload: Record<string, unknown> }>;
  queryPayment?(input: { paymentNo: string; providerTransactionId: string | null; platformStatus: string }): Promise<{ status: "PENDING" | "SUCCEEDED" | "FAILED" | "CLOSED"; providerTransactionId?: string }>;
  verifyCallback(payload: PaymentCallbackPayload, signature: string | undefined): boolean;
  /** Must be idempotent for the same refundNo, including retries after an unknown outcome. */
  createRefund?(input: { refundNo: string; paymentNo: string; providerTransactionId: string | null; amountCent: bigint; idempotencyKey?:string }): Promise<{ providerRefundNo: string }>;
  queryRefund?(input:{refundNo:string;idempotencyKey:string}):Promise<TransferResult>;
  verifyRefundCallback?(payload: RefundCallbackPayload, signature: string | undefined): boolean;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly mode = "mock";
  private transferStore?:MockTransferStore;
  bindTransferStore(store:MockTransferStore){this.transferStore=store;return this;}
  private readonly paymentStates = new Map<string, { status: "PENDING" | "SUCCEEDED" | "FAILED" | "CLOSED"; providerTransactionId?: string }>();

  constructor(private readonly webhookSecret: string, readonly channel: PaymentChannel = "WECHAT_APP") {}

  async createPayment(input: { paymentNo: string; orderNo: string; amountCent: bigint; expiresAt: Date }) {
    this.paymentStates.set(input.paymentNo, { status: "PENDING" });
    return {
      providerRequestId: `mock-${this.channel.toLowerCase()}-${input.paymentNo}`,
      clientPayload: { mode: "mock", payment_channel: this.channel, payment_no: input.paymentNo, order_no: input.orderNo, amount_cent: input.amountCent.toString(), expires_at: input.expiresAt.toISOString() },
    };
  }

  async queryPayment(input: { paymentNo: string; providerTransactionId: string | null; platformStatus: string }) {
    const persistedStatus = ["PAID", "REFUNDING", "PARTIALLY_REFUNDED", "REFUNDED"].includes(input.platformStatus)
      ? "SUCCEEDED" as const
      : input.platformStatus === "FAILED" ? "FAILED" as const : input.platformStatus === "CLOSED" ? "CLOSED" as const : "PENDING" as const;
    return this.paymentStates.get(input.paymentNo) ?? { status: persistedStatus, ...(input.providerTransactionId ? { providerTransactionId: input.providerTransactionId } : {}) };
  }

  recordPaymentCallback(payload: PaymentCallbackPayload): void {
    this.paymentStates.set(payload.payment_no, {
      status: payload.event_type === "PAYMENT_SUCCEEDED" ? "SUCCEEDED" : "FAILED",
      providerTransactionId: payload.provider_transaction_id,
    });
  }

  recordPaymentClosed(paymentNo: string): void {
    this.paymentStates.set(paymentNo, { status: "CLOSED" });
  }

  verifyCallback(payload: PaymentCallbackPayload, signature: string | undefined): boolean {
    if (!signature || !/^[a-f0-9]{64}$/u.test(signature)) return false;
    const expected = Buffer.from(this.sign(payload), "hex");
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async createRefund(input: { refundNo: string; paymentNo: string; providerTransactionId: string | null; amountCent: bigint;idempotencyKey?:string }) {
    const key=input.idempotencyKey??input.refundNo,providerRefundNo=`mock-refund-${key}`;
    if(this.transferStore)await this.transferStore.create("REFUND",this.channel,key,input,providerRefundNo);
    return { providerRefundNo };
  }

  async queryRefund(input:{refundNo:string;idempotencyKey:string}):Promise<TransferResult>{
    return this.transferStore?this.transferStore.query("REFUND",this.channel,input.idempotencyKey):{status:"UNKNOWN"};
  }

  verifyRefundCallback(payload: RefundCallbackPayload, signature: string | undefined): boolean {
    if (!signature || !/^[a-f0-9]{64}$/u.test(signature)) return false;
    const expected = Buffer.from(this.signRefund(payload), "hex");
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  sign(payload: PaymentCallbackPayload): string {
    return createHmac("sha256", this.webhookSecret).update(JSON.stringify(payload)).digest("hex");
  }


  signRefund(payload: RefundCallbackPayload): string {
    return createHmac("sha256", this.webhookSecret).update(JSON.stringify(payload)).digest("hex");
  }
}

export class PaymentProviderRouter {
  private readonly providers = new Map<PaymentChannel, PaymentProvider>();

  constructor(providers: readonly PaymentProvider[]) {
    for (const provider of providers) {
      if (!provider || !["WECHAT_APP", "ALIPAY_APP"].includes(provider.channel)) continue;
      if (this.providers.has(provider.channel)) throw new Error(`Duplicate payment provider: ${provider.channel}`);
      this.providers.set(provider.channel, provider);
    }
  }

  get(channel: PaymentChannel | string): PaymentProvider {
    const provider = this.providers.get(channel as PaymentChannel);
    if (!provider) throw new AppError({ code: "PAYMENT_CHANNEL_UNAVAILABLE", message: "所选支付渠道暂不可用", statusCode: 503 });
    return provider;
  }
}
