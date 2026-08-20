import { createHmac, timingSafeEqual } from "node:crypto";

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
  readonly channel: string;
  createPayment(input: { paymentNo: string; orderNo: string; amountCent: bigint; expiresAt: Date }): Promise<{ providerRequestId: string; clientPayload: Record<string, unknown> }>;
  verifyCallback(payload: PaymentCallbackPayload, signature: string | undefined): boolean;
  /** Must be idempotent for the same refundNo, including retries after an unknown outcome. */
  createRefund?(input: { refundNo: string; paymentNo: string; providerTransactionId: string | null; amountCent: bigint }): Promise<{ providerRefundNo: string }>;
  verifyRefundCallback?(payload: RefundCallbackPayload, signature: string | undefined): boolean;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly channel = "MOCK";
  constructor(private readonly webhookSecret: string) {}

  async createPayment(input: { paymentNo: string; orderNo: string; amountCent: bigint; expiresAt: Date }) {
    return {
      providerRequestId: `mock-${input.paymentNo}`,
      clientPayload: { mode: "mock", payment_no: input.paymentNo, order_no: input.orderNo, amount_cent: input.amountCent.toString(), expires_at: input.expiresAt.toISOString() },
    };
  }

  verifyCallback(payload: PaymentCallbackPayload, signature: string | undefined): boolean {
    if (!signature || !/^[a-f0-9]{64}$/u.test(signature)) return false;
    const expected = Buffer.from(this.sign(payload), "hex");
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async createRefund(input: { refundNo: string; paymentNo: string; providerTransactionId: string | null; amountCent: bigint }) {
    return { providerRefundNo: `mock-refund-${input.refundNo}` };
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
