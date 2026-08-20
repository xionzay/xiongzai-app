import { and, eq, inArray, sql } from "drizzle-orm";
import { orderSlotReservations, orders, orderStatusLogs, payments, uuidv7, type Database } from "@xiongzai/database";
import { OutboxService } from "./reliability.js";
import { FinanceLedgerEngine } from "./finance-ledger.js";

export const ORDER_JOB_TYPES = {
  PAYMENT_TIMEOUT: "ORDER_PAYMENT_TIMEOUT",
  ACCEPT_TIMEOUT: "ORDER_ACCEPT_TIMEOUT",
  AUTO_CONFIRM: "ORDER_AUTO_CONFIRM",
} as const;

export class OrderJobProcessor {
  private readonly outbox = new OutboxService();
  private readonly finance: FinanceLedgerEngine;
  constructor(private readonly database: Database) { this.finance = new FinanceLedgerEngine(database); }

  async process(jobType: string, orderId: string, requestId: string): Promise<boolean> {
    if (jobType === ORDER_JOB_TYPES.PAYMENT_TIMEOUT) return this.closeForPaymentTimeout(orderId, requestId);
    if (jobType === ORDER_JOB_TYPES.ACCEPT_TIMEOUT) return this.closeForAcceptTimeout(orderId, requestId);
    if (jobType === ORDER_JOB_TYPES.AUTO_CONFIRM) return this.autoConfirm(orderId, requestId);
    throw new Error(`Unsupported order job type: ${jobType}`);
  }

  private async closeForPaymentTimeout(orderId: string, requestId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
      if (!order || order.status !== "PENDING_PAYMENT" || order.expiresAt > new Date()) return false;
      const changed = await tx.update(orders).set({ status: "CLOSED", paymentStatus: "CLOSED", closedAt: new Date(), cancelReason: "PAYMENT_TIMEOUT", version: sql`${orders.version} + 1`, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT"), eq(orders.version, order.version))).returning({ id: orders.id });
      if (!changed[0]) return false;
      await tx.update(payments).set({ status: "CLOSED", closedAt: new Date(), version: sql`${payments.version} + 1`, updatedAt: new Date() })
        .where(and(eq(payments.orderId, orderId), inArray(payments.status, ["CREATED", "PAYING"])));
      await releaseReservation(tx, orderId);
      await appendOrderLog(tx, orderId, order.status, "CLOSED", "PAYMENT_TIMEOUT", requestId, "支付超时自动关单");
      await this.outbox.enqueue(tx, { aggregateType: "ORDER", aggregateId: orderId, eventType: "OrderPaymentTimedOut", payload: { order_id: orderId, order_no: order.orderNo } });
      return true;
    });
  }

  private async closeForAcceptTimeout(orderId: string, requestId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
      if (!order || order.status !== "PENDING_ACCEPT") return false;
      const changed = await tx.update(orders).set({ status: "CLOSED", closedAt: new Date(), cancelReason: "SELLER_ACCEPT_TIMEOUT", version: sql`${orders.version} + 1`, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_ACCEPT"), eq(orders.version, order.version))).returning({ id: orders.id });
      if (!changed[0]) return false;
      await releaseReservation(tx, orderId);
      await appendOrderLog(tx, orderId, order.status, "CLOSED", "ACCEPT_TIMEOUT", requestId, "陪玩接单超时自动关单");
      await this.outbox.enqueue(tx, { aggregateType: "ORDER", aggregateId: orderId, eventType: "OrderAcceptTimedOut", payload: { order_id: orderId, order_no: order.orderNo } });
      return true;
    });
  }

  private async autoConfirm(orderId: string, requestId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
      if (!order || order.status !== "PENDING_BUYER_CONFIRM" || !order.autoConfirmAt || order.autoConfirmAt > new Date()) return false;
      const changed = await tx.update(orders).set({ status: "COMPLETED", completedAt: new Date(), version: sql`${orders.version} + 1`, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_BUYER_CONFIRM"), eq(orders.version, order.version))).returning();
      if (!changed[0]) return false;
      await releaseReservation(tx, orderId);
      await appendOrderLog(tx, orderId, order.status, "COMPLETED", "AUTO_CONFIRM", requestId, "买家确认超时，系统自动完成");
      await this.finance.recordOrderCompleted(tx, changed[0], requestId);
      await this.outbox.enqueue(tx, { aggregateType: "ORDER", aggregateId: orderId, eventType: "OrderAutoConfirmed", payload: { order_id: orderId, order_no: order.orderNo } });
      return true;
    });
  }
}

async function releaseReservation(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], orderId: string) {
  const [reservation] = await tx.select().from(orderSlotReservations).where(eq(orderSlotReservations.orderId, orderId)).limit(1).for("update");
  if (!reservation || !["HELD", "CONFIRMED"].includes(reservation.status)) return;
  await tx.update(orderSlotReservations).set({ status: "RELEASED", releasedAt: new Date(), version: sql`${orderSlotReservations.version} + 1`, updatedAt: new Date() })
    .where(and(eq(orderSlotReservations.id, reservation.id), eq(orderSlotReservations.status, reservation.status), eq(orderSlotReservations.version, reservation.version)));
}

async function appendOrderLog(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], orderId: string, oldStatus: typeof orders.$inferSelect.status, newStatus: typeof orders.$inferSelect.status, action: string, requestId: string, remark: string) {
  await tx.insert(orderStatusLogs).values({ id: uuidv7(), orderId, oldStatus, newStatus, operatorRole: "SYSTEM", action, remark, requestId });
}
