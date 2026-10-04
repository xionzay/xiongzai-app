import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { FinanceLedgerEngine, IdempotencyService, InboxService, OutboxService, ScheduledJobService, ORDER_JOB_TYPES } from "@xiongzai/application";
import { AppError, decodeCursor, encodeCursor, errorCodes, normalizePageSize, toApiJson, type PaymentChannel } from "@xiongzai/contracts";
import {
  adminOperationLogs,
  complaintEvidences,
  complaintLogs,
  complaints,
  files,
  fileUsages,
  orders,
  orderStatusLogs,
  orderSlotReservations,
  payments,
  products,
  ratingAggregates,
  refundLogs,
  refunds,
  reviews,
  sellerProfiles,
  userProfiles,
  uuidv7,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@xiongzai/database";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, type AnyColumn } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { PaymentProviderRouter, type RefundCallbackPayload } from "./payment-provider.js";
import { API_CONFIG, DATABASE_CLIENT, PAYMENT_PROVIDER_ROUTER } from "./tokens.js";

type RefundStatus = typeof refunds.$inferSelect.status;
type ComplaintStatus = typeof complaints.$inferSelect.status;
type ComplaintTarget = typeof complaints.$inferSelect.targetType;

@Injectable()
export class AfterSaleService {
  private readonly idempotency = new IdempotencyService();
  private readonly inbox = new InboxService();
  private readonly outbox = new OutboxService();
  private readonly finance: FinanceLedgerEngine;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(PAYMENT_PROVIDER_ROUTER) private readonly paymentProviders: PaymentProviderRouter,
  ) { this.finance = new FinanceLedgerEngine(database.db); }

  async createRefund(userId: string, input: { orderId: string; amountCent: bigint; reasonCode: string; reasonText: string; description?: string }, idempotencyKey: string, metadata: RequestMetadata) {
    try {
      return await this.database.db.transaction(async (tx) => {
        const reservation = await this.idempotency.reserve(tx, { scope: `refund:create:${userId}`, key: idempotencyKey, request: input, expiresAt: new Date(Date.now() + 86_400_000) });
        if (reservation.replay?.body) return reservation.replay.body;
        const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1).for("update");
        if (!order || order.buyerId !== userId) throw notFound("ORDER_NOT_FOUND", "订单不存在");
        if (!["PENDING_ACCEPT", "ACCEPTED", "IN_SERVICE", "PENDING_BUYER_CONFIRM", "COMPLETED", "SELLER_REJECTED", "CLOSED"].includes(order.status)) throw conflict("REFUND_ORDER_STATE_INVALID", "当前订单状态不能申请退款");
        if (order.ruleVersion === "V3.1" && (order.completedAt || order.status === "COMPLETED")) throw conflict("REFUND_REQUIRES_SUPPORT_CASE", "交易已终结，请通过客服核验特殊售后，普通退款入口已关闭");
        if (input.amountCent <= 0n || input.amountCent > order.paidAmountCent - order.refundedAmountCent) throw conflict("REFUND_AMOUNT_EXCEEDS_REMAINING", "退款金额超过订单剩余可退金额");
        const [payment] = await tx.select().from(payments).where(and(eq(payments.orderId, order.id), or(eq(payments.status, "PAID"), eq(payments.status, "PARTIALLY_REFUNDED")))).orderBy(desc(payments.createdAt)).limit(1).for("update");
        if (!payment) throw conflict("REFUND_PAYMENT_UNAVAILABLE", "订单没有可退款的支付记录");
        const [created] = await tx.insert(refunds).values({ id: uuidv7(), refundNo: externalNo("RF"), orderId: order.id, paymentId: payment.id, applicantId: userId, requestedAmountCent: input.amountCent, reasonCode: input.reasonCode, reasonText: input.reasonText, description: input.description }).returning();
        await tx.update(orders).set({ afterSaleStatus: "IN_PROGRESS", version: sql`${orders.version} + 1`, updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.version, order.version)));
        await this.refundLog(tx, created!, null, "REQUESTED", "BUYER", "REFUND_REQUESTED", input.reasonText, metadata, { userId });
        await this.outbox.enqueue(tx, { aggregateType: "REFUND", aggregateId: created!.id, eventType: "RefundRequested", payload: { refund_id: created!.id, order_id: order.id, amount_cent: input.amountCent }, traceId: metadata.traceId });
        const view = refundView(created!);
        await this.idempotency.complete(tx, reservation.id, { statusCode: 201, body: view, resourceType: "REFUND", resourceId: created!.id });
        return view;
      });
    } catch (error) {
      if (isPgCode(error, "23505")) throw conflict("REFUND_ACTIVE_EXISTS", "该订单已有正在处理的退款申请");
      throw error;
    }
  }

  async listUserRefunds(userId: string, input: { cursor?: string; limit?: unknown; order_id?: string }) {
    const limit = normalizePageSize(input.limit, 20); const scope = `user-refunds:${userId}:${input.order_id ?? "all"}`;
    const cursor = this.userCursor(input.cursor, scope, "退款");
    const rows = await this.database.db.select().from(refunds).where(and(eq(refunds.applicantId, userId), input.order_id ? eq(refunds.orderId, input.order_id) : undefined, cursorCondition(refunds.createdAt, refunds.id, cursor))).orderBy(desc(refunds.createdAt), desc(refunds.id)).limit(limit + 1);
    return cursorPage(rows, limit, scope, this.config.cursorSigningSecret, refundView);
  }

  async getUserRefund(userId: string, refundId: string) {
    const row = await this.refundForUser(userId, refundId); return this.refundDetail(row);
  }

  async listSellerRefunds(userId: string) {
    const rows = await this.database.db.select({ refund: refunds }).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).where(eq(orders.sellerUserId, userId)).orderBy(desc(refunds.createdAt)).limit(100);
    return rows.map((row) => refundView(row.refund));
  }

  async sellerDecide(userId: string, refundId: string, input: { version: number; decision: "APPROVE" | "REJECT"; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockRefund(tx, refundId); const [order] = await tx.select().from(orders).where(eq(orders.id, row.orderId)).limit(1).for("update");
      if (!order || order.sellerUserId !== userId) throw notFound("REFUND_NOT_FOUND", "退款申请不存在");
      if (row.status !== "REQUESTED") throw invalidRefundState(row.status, "陪玩处理");
      if (row.version !== input.version) throw versionConflict("退款申请");
      if (input.decision === "REJECT") {
        const [updated] = await tx.update(refunds).set({ sellerDecision: "REJECT", sellerReason: input.reason, sellerProcessedAt: new Date(), status: "SELLER_REJECTED", version: sql`${refunds.version} + 1`, updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, "REQUESTED"), eq(refunds.version, input.version))).returning();
        if (!updated) throw versionConflict("退款申请");
        await this.refundLog(tx, updated, "REQUESTED", "SELLER_REJECTED", "SELLER", "SELLER_REJECTED", input.reason, metadata, { userId });
        // A seller rejection is not final: the buyer can still escalate to platform review.
        await tx.update(orders).set({ afterSaleStatus: "IN_PROGRESS", version: sql`${orders.version} + 1`, updatedAt: new Date() }).where(eq(orders.id, order.id));
        return refundView(updated);
      }
      const remaining = order.paidAmountCent - order.refundedAmountCent;
      if (row.requestedAmountCent > remaining) throw conflict("REFUND_AMOUNT_EXCEEDS_REMAINING", "退款金额超过订单剩余可退金额");
      // Keep the row lock until the provider accepts the refund. This ensures that
      // stale, concurrent, or non-owner requests cannot create an external side effect.
      const provider = await this.prepareProviderRefund(tx, refundId);
      const [approved] = await tx.update(refunds).set({ sellerDecision: "APPROVE", sellerReason: input.reason, sellerProcessedAt: new Date(), approvedAmountCent: row.requestedAmountCent, status: "SELLER_APPROVED", version: sql`${refunds.version} + 1`, updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, "REQUESTED"), eq(refunds.version, input.version))).returning();
      if (!approved) throw versionConflict("退款申请");
      await this.refundLog(tx, approved, "REQUESTED", "SELLER_APPROVED", "SELLER", "SELLER_APPROVED", input.reason, metadata, { userId });
      const [processing] = await tx.update(refunds).set({ status: "REFUND_PROCESSING", providerRefundNo: provider!.providerRefundNo, version: sql`${refunds.version} + 1`, updatedAt: new Date() }).where(and(eq(refunds.id, approved.id), eq(refunds.status, "SELLER_APPROVED"), eq(refunds.version, approved.version))).returning();
      await tx.update(payments).set({ status: "REFUNDING", version: sql`${payments.version} + 1`, updatedAt: new Date() }).where(eq(payments.id, row.paymentId));
      await this.refundLog(tx, processing!, "SELLER_APPROVED", "REFUND_PROCESSING", "SYSTEM", "CHANNEL_REFUND_SUBMITTED", provider!.providerRefundNo, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "REFUND", aggregateId: row.id, eventType: "RefundProcessing", payload: { refund_id: row.id, provider_refund_no: provider!.providerRefundNo }, traceId: metadata.traceId });
      return refundView(processing!);
    });
  }

  async escalateRefund(userId: string, refundId: string, version: number, reason: string, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockRefund(tx, refundId); if (row.applicantId !== userId) throw notFound("REFUND_NOT_FOUND", "退款申请不存在");
      if (!inStatus(row.status, ["SELLER_REJECTED", "NEGOTIATING"])) throw invalidRefundState(row.status, "申请平台介入");
      if (row.version !== version) throw versionConflict("退款申请");
      const [updated] = await tx.update(refunds).set({ status: "PLATFORM_REVIEW", escalatedAt: new Date(), version: sql`${refunds.version} + 1`, updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, row.status), eq(refunds.version, version))).returning();
      if (!updated) throw versionConflict("退款申请");
      await tx.update(orders).set({ afterSaleStatus: "IN_PROGRESS", version: sql`${orders.version} + 1`, updatedAt: new Date() }).where(eq(orders.id, row.orderId));
      await this.refundLog(tx, updated, row.status, "PLATFORM_REVIEW", "BUYER", "PLATFORM_INTERVENTION_REQUESTED", reason, metadata, { userId });
      await this.outbox.enqueue(tx, { aggregateType: "REFUND", aggregateId: row.id, eventType: "RefundEscalated", payload: { refund_id: row.id, order_id: row.orderId }, traceId: metadata.traceId });
      return refundView(updated);
    });
  }

  async listAdminRefunds(input:{status?:RefundStatus;keyword?:string;cursor?:string;limit?:unknown;sort:"created_desc"|"created_asc"}) {
    const limit=normalizePageSize(input.limit,20);const scope=`admin-refunds:${input.status??""}:${input.keyword??""}:${input.sort}`;const cursor=this.userCursor(input.cursor,scope,"退款");const ascending=input.sort==="created_asc";const rows=await this.database.db.select().from(refunds).where(and(input.status?eq(refunds.status,input.status):undefined,input.keyword?or(ilike(refunds.refundNo,`%${input.keyword}%`),sql<boolean>`${refunds.orderId}::text ILIKE ${`%${input.keyword}%`}`):undefined,adminCursorCondition(refunds.createdAt,refunds.id,cursor,ascending))).orderBy(ascending?asc(refunds.createdAt):desc(refunds.createdAt),ascending?asc(refunds.id):desc(refunds.id)).limit(limit+1);return cursorPage(rows,limit,scope,this.config.cursorSigningSecret,refundView);
  }

  async getAdminRefund(refundId: string) { const [row] = await this.database.db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1); if (!row) throw notFound("REFUND_NOT_FOUND", "退款申请不存在"); return this.refundDetail(row); }

  async adminDecideRefund(adminId: string, refundId: string, input: { version: number; decision: "APPROVE" | "REJECT"; approvedAmountCent?: bigint; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockRefund(tx, refundId); const [order] = await tx.select().from(orders).where(eq(orders.id, row.orderId)).limit(1).for("update");
      if (!order) throw notFound("ORDER_NOT_FOUND", "订单不存在");
      if (!inStatus(row.status, ["PLATFORM_REVIEW", "SELLER_REJECTED", "NEGOTIATING"])) throw invalidRefundState(row.status, "平台处理");
      if (row.version !== input.version) throw versionConflict("退款申请");
      if (input.decision === "REJECT") {
        const [updated] = await tx.update(refunds).set({ adminDecision: "REJECT", adminReason: input.reason, assignedAdminId: adminId, status: "REJECTED", version: sql`${refunds.version} + 1`, updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, row.status), eq(refunds.version, input.version))).returning();
        if (!updated) throw versionConflict("退款申请");
        await this.refundLog(tx, updated, row.status, "REJECTED", "ADMIN", "ADMIN_REFUND_REJECTED", input.reason, metadata, { adminId });
        // Retain the pre-case acceptance remainder. A consumed old job must not strand the order.
        const resumeAt = order.status === "PENDING_BUYER_CONFIRM" && order.autoConfirmAt
          ? new Date(Date.now() + Math.max(0, order.autoConfirmAt.getTime() - row.createdAt.getTime())) : undefined;
        await tx.update(orders).set({ afterSaleStatus: "RESOLVED", ...(resumeAt ? { autoConfirmAt: resumeAt } : {}), version: sql`${orders.version} + 1`, updatedAt: new Date() }).where(eq(orders.id, order.id));
        if (resumeAt) await new ScheduledJobService().schedule(tx, { jobKey: `order:${order.id}:resume-confirm:${row.id}:${updated.version}`, jobType: ORDER_JOB_TYPES.AUTO_CONFIRM, targetType: "ORDER", targetId: order.id, payload: { order_id: order.id }, runAt: resumeAt });
        await this.finance.resumePendingIncome(tx, order.id, `rejected:${row.id}:${updated.version}`);
        await this.audit(tx, adminId, "REFUND_REJECT", "REFUND", row.id, input.reason, row, updated, metadata);
        return refundView(updated);
      }
      const amount = input.approvedAmountCent ?? row.requestedAmountCent; const remaining = order.paidAmountCent - order.refundedAmountCent;
      if (amount <= 0n || amount > row.requestedAmountCent || amount > remaining) throw conflict("REFUND_AMOUNT_EXCEEDS_REMAINING", "批准退款金额超过申请金额或订单剩余可退金额");
      const provider = await this.prepareProviderRefund(tx, refundId, amount);
      const [updated] = await tx.update(refunds).set({ adminDecision: "APPROVE", adminReason: input.reason, assignedAdminId: adminId, approvedAmountCent: amount, providerRefundNo: provider!.providerRefundNo, status: "REFUND_PROCESSING", version: sql`${refunds.version} + 1`, updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, row.status), eq(refunds.version, input.version))).returning();
      if (!updated) throw versionConflict("退款申请");
      await tx.update(payments).set({ status: "REFUNDING", version: sql`${payments.version} + 1`, updatedAt: new Date() }).where(eq(payments.id, row.paymentId));
      await this.refundLog(tx, updated, row.status, "REFUND_PROCESSING", "ADMIN", "ADMIN_REFUND_APPROVED", input.reason, metadata, { adminId });
      await this.audit(tx, adminId, "REFUND_APPROVE", "REFUND", row.id, input.reason, row, updated, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "REFUND", aggregateId: row.id, eventType: "RefundProcessing", payload: { refund_id: row.id, amount_cent: amount, provider_refund_no: provider!.providerRefundNo }, traceId: metadata.traceId });
      return refundView(updated);
    });
  }

  async processRefundCallback(requestedChannel: PaymentChannel | "mock", payload: RefundCallbackPayload, signature: string | undefined, metadata: RequestMetadata) {
    if (requestedChannel === "mock" && !["development", "test"].includes(this.config.environment)) throw notFound("MOCK_REFUND_DISABLED", "Mock 退款回调未启用");
    const [stored] = await this.database.db.select({ channel: payments.channel, refundId: refunds.id }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).where(eq(refunds.refundNo, payload.refund_no)).limit(1);
    if (!stored) throw notFound("REFUND_NOT_FOUND", "退款申请不存在");
    if (requestedChannel !== "mock" && stored.channel !== requestedChannel) throw conflict("REFUND_CHANNEL_MISMATCH", "退款回调渠道与原支付渠道不一致");
    const paymentProvider = this.paymentProviders.get(stored.channel);
    if ((requestedChannel === "mock" || paymentProvider.mode === "mock") && !["development", "test"].includes(this.config.environment)) throw notFound("MOCK_REFUND_DISABLED", "Mock 退款回调未启用");
    if (!paymentProvider.verifyRefundCallback?.(payload, signature)) throw new AppError({ code: "REFUND_CALLBACK_SIGNATURE_INVALID", message: "退款回调签名无效", statusCode: 401 });
    const consumerName = `refund-callback:${stored.channel}`;
    return this.database.db.transaction(async (tx) => {
      const claimed = await this.inbox.claim(tx, { eventId: payload.event_id, consumerName, payload });
      const row = await this.lockRefund(tx, stored.refundId);
      if (!row) throw notFound("REFUND_NOT_FOUND", "退款申请不存在");
      if (!claimed) return { refund: refundView(row), duplicate: true };
      if (row.providerRefundNo !== payload.provider_refund_no) throw conflict("REFUND_PROVIDER_NO_MISMATCH", "渠道退款编号不一致");
      const amount = BigInt(payload.amount_cent); const approved = row.approvedAmountCent ?? row.requestedAmountCent;
      if (amount !== approved) throw conflict("REFUND_CALLBACK_AMOUNT_MISMATCH", "退款回调金额与批准金额不一致");
      // Some channels resend the same successful refund with a new event ID.
      // Verify the business identity and amount before acknowledging that replay.
      if (row.status === "REFUNDED" && payload.event_type === "REFUND_SUCCEEDED") {
        await this.inbox.complete(tx, payload.event_id, consumerName);
        return { refund: refundView(row), duplicate: true };
      }
      if (row.status !== "REFUND_PROCESSING") throw invalidRefundState(row.status, "处理渠道退款回调");
      const [order] = await tx.select().from(orders).where(eq(orders.id, row.orderId)).limit(1).for("update");
      const [payment] = await tx.select().from(payments).where(eq(payments.id, row.paymentId)).limit(1).for("update");
      if (!order || !payment) throw notFound("REFUND_PAYMENT_UNAVAILABLE", "订单支付记录不存在");
      if (payload.event_type === "REFUND_FAILED") {
        const [failed] = await tx.update(refunds).set({ status: "PLATFORM_REVIEW", version: sql`${refunds.version} + 1`, updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, "REFUND_PROCESSING"), eq(refunds.version, row.version))).returning();
        await tx.update(payments).set({ status: payment.refundedAmountCent > 0n ? "PARTIALLY_REFUNDED" : "PAID", version: sql`${payments.version} + 1`, updatedAt: new Date() }).where(eq(payments.id, payment.id));
        await this.refundLog(tx, failed!, "REFUND_PROCESSING", "PLATFORM_REVIEW", "PAYMENT_PROVIDER", "CHANNEL_REFUND_FAILED", payload.provider_refund_no, metadata);
        await this.inbox.complete(tx, payload.event_id, consumerName);
        return { refund: refundView(failed!), duplicate: false };
      }
      const orderTotal = order.refundedAmountCent + amount; const paymentTotal = payment.refundedAmountCent + amount;
      if (orderTotal > order.paidAmountCent || paymentTotal > payment.amountCent) throw conflict("REFUND_AMOUNT_EXCEEDS_PAID", "累计退款金额不能超过实付金额");
      const now = new Date(); const [completed] = await tx.update(refunds).set({ status: "REFUNDED", completedAt: now, version: sql`${refunds.version} + 1`, updatedAt: now }).where(and(eq(refunds.id, row.id), eq(refunds.status, "REFUND_PROCESSING"), eq(refunds.version, row.version))).returning();
      await tx.update(orders).set({ ...(order.ruleVersion === "V3.1" ? { status: "COMPLETED" as const, completedAt: order.completedAt ?? now, autoConfirmAt: null } : {}), refundedAmountCent: orderTotal, paymentStatus: orderTotal === order.paidAmountCent ? "REFUNDED" : "PARTIALLY_REFUNDED", afterSaleStatus: "RESOLVED", version: sql`${orders.version} + 1`, updatedAt: now }).where(and(eq(orders.id, order.id), eq(orders.version, order.version)));
      await tx.update(payments).set({ refundedAmountCent: paymentTotal, status: paymentTotal === payment.amountCent ? "REFUNDED" : "PARTIALLY_REFUNDED", version: sql`${payments.version} + 1`, updatedAt: now }).where(and(eq(payments.id, payment.id), eq(payments.version, payment.version)));
      if (order.ruleVersion === "V3.1" && order.status !== "COMPLETED") {
        await tx.insert(orderStatusLogs).values({id:uuidv7(),orderId:order.id,oldStatus:order.status,newStatus:"COMPLETED",operatorRole:"PAYMENT_PROVIDER",action:"REFUND_TERMINATED",remark:"退款成功，终止剩余履约义务；保留首次终结时间及原规则快照",requestId:metadata.requestId});
        await tx.update(orderSlotReservations).set({status:"RELEASED",releasedAt:now,version:sql`${orderSlotReservations.version} + 1`,updatedAt:now}).where(and(eq(orderSlotReservations.orderId,order.id),inArray(orderSlotReservations.status,["HELD","CONFIRMED"])));
      }
      await this.finance.recordRefund(tx, completed!, order, amount, order.refundedAmountCent, metadata.traceId);
      await this.finance.resumePendingIncome(tx, order.id, `refunded:${row.id}:${completed!.version}`);
      await this.refundLog(tx, completed!, "REFUND_PROCESSING", "REFUNDED", "PAYMENT_PROVIDER", "CHANNEL_REFUND_SUCCEEDED", payload.provider_refund_no, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "REFUND", aggregateId: row.id, eventType: "RefundCompleted", payload: { refund_id: row.id, order_id: order.id, amount_cent: amount, cumulative_refunded_cent: orderTotal }, traceId: metadata.traceId });
      await this.inbox.complete(tx, payload.event_id, consumerName);
      return { refund: refundView(completed!), duplicate: false };
    });
  }

  async createComplaint(userId: string, input: { targetType: ComplaintTarget; targetId: string; orderId?: string; complaintType: string; description: string; fileIds: string[] }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const target: Partial<typeof complaints.$inferInsert> = {};
      if (input.targetType === "ORDER") { const [order] = await tx.select().from(orders).where(eq(orders.id, input.targetId)).limit(1); if (!order || ![order.buyerId, order.sellerUserId].includes(userId)) throw notFound("ORDER_NOT_FOUND", "订单不存在"); target.orderId = order.id; }
      else if (input.targetType === "SELLER") target.targetSellerId = input.targetId;
      else if (input.targetType === "PRODUCT") target.targetProductId = input.targetId;
      else target.targetUserId = input.targetId;
      const [created] = await tx.insert(complaints).values({ id: uuidv7(), complaintNo: externalNo("CP"), reporterId: userId, targetType: input.targetType, complaintType: input.complaintType, description: input.description, ...target }).returning();
      await this.complaintLog(tx, created!, null, "SUBMITTED", "BUYER", "COMPLAINT_SUBMITTED", input.description, metadata, { userId });
      for (const fileId of input.fileIds) await this.addComplaintEvidenceTx(tx, created!, userId, fileId, "投诉初始证据");
      await this.outbox.enqueue(tx, { aggregateType: "COMPLAINT", aggregateId: created!.id, eventType: "ComplaintSubmitted", payload: { complaint_id: created!.id, target_type: input.targetType, target_id: input.targetId }, traceId: metadata.traceId });
      return complaintView(created!);
    });
  }

  async listUserComplaints(userId: string, input: { cursor?: string; limit?: unknown; order_id?: string }) {
    const limit = normalizePageSize(input.limit, 20); const scope = `user-complaints:${userId}:${input.order_id ?? "all"}`;
    const cursor = this.userCursor(input.cursor, scope, "投诉");
    const rows = await this.database.db.select().from(complaints).where(and(eq(complaints.reporterId, userId), input.order_id ? eq(complaints.orderId, input.order_id) : undefined, cursorCondition(complaints.createdAt, complaints.id, cursor))).orderBy(desc(complaints.createdAt), desc(complaints.id)).limit(limit + 1);
    return cursorPage(rows, limit, scope, this.config.cursorSigningSecret, complaintView);
  }
  async getUserComplaint(userId: string, complaintId: string) { const row = await this.complaintForUser(userId, complaintId); return this.complaintDetail(row); }

  async addComplaintEvidence(userId: string, complaintId: string, version: number, fileId: string, description: string | undefined, metadata: RequestMetadata) {
    try { return await this.database.db.transaction(async (tx) => {
      const row = await this.lockComplaint(tx, complaintId); if (row.reporterId !== userId) throw notFound("COMPLAINT_NOT_FOUND", "投诉不存在");
      if (inStatus(row.status, ["COMPLETED", "CLOSED"])) throw invalidComplaintState(row.status, "补充证据"); if (row.version !== version) throw versionConflict("投诉");
      const evidence = await this.addComplaintEvidenceTx(tx, row, userId, fileId, description);
      if (evidence.duplicate) return { complaint: complaintView(row), evidence: evidence.row, duplicate: true };
      const next: ComplaintStatus = row.status === "NEED_MORE_EVIDENCE" ? "PROCESSING" : row.status;
      const [updated] = await tx.update(complaints).set({ status: next, version: sql`${complaints.version} + 1`, updatedAt: new Date() }).where(and(eq(complaints.id, row.id), eq(complaints.status, row.status), eq(complaints.version, version))).returning();
      await this.complaintLog(tx, updated!, row.status, next, "BUYER", "EVIDENCE_ADDED", description ?? "用户补充证据", metadata, { userId });
      await this.outbox.enqueue(tx, { aggregateType: "COMPLAINT", aggregateId: row.id, eventType: "ComplaintEvidenceAdded", payload: { complaint_id: row.id, evidence_id: evidence.row.id }, traceId: metadata.traceId });
      return { complaint: complaintView(updated!), evidence: evidence.row, duplicate: false };
    }); } catch (error) {
      if (isComplaintEvidenceLimit(error)) throw new AppError({ code: "COMPLAINT_EVIDENCE_LIMIT_REACHED", message: "每个投诉最多只能提交 20 条证据", statusCode: 409 });
      throw error;
    }
  }

  async listAdminComplaints(input:{status?:ComplaintStatus;keyword?:string;cursor?:string;limit?:unknown;sort:"created_desc"|"created_asc"}) {
    const limit=normalizePageSize(input.limit,20);const scope=`admin-complaints:${input.status??""}:${input.keyword??""}:${input.sort}`;const cursor=this.userCursor(input.cursor,scope,"投诉");const ascending=input.sort==="created_asc";
    const rows=await this.database.db.select().from(complaints).where(and(input.status?eq(complaints.status,input.status):undefined,input.keyword?or(ilike(complaints.complaintNo,`%${input.keyword}%`),ilike(complaints.description,`%${input.keyword}%`)):undefined,adminCursorCondition(complaints.createdAt,complaints.id,cursor,ascending))).orderBy(ascending?asc(complaints.createdAt):desc(complaints.createdAt),ascending?asc(complaints.id):desc(complaints.id)).limit(limit+1);
    const selected=rows.slice(0,limit);const orderIds=selected.map((row)=>row.orderId).filter((value):value is string=>Boolean(value));const related=orderIds.length?await this.database.db.select().from(orders).where(inArray(orders.id,orderIds)):[];const byId=new Map(related.map((order)=>[order.id,order]));const last=selected.at(-1);
    return {items:selected.map((row)=>complaintAdminView(row,row.orderId?byId.get(row.orderId):undefined)),next_cursor:rows.length>limit&&last?encodeCursor({sort_value:last.createdAt.toISOString(),id:last.id,scope},this.config.cursorSigningSecret):null};
  }
  async getAdminComplaint(complaintId: string) { const [row] = await this.database.db.select().from(complaints).where(eq(complaints.id, complaintId)).limit(1); if (!row) throw notFound("COMPLAINT_NOT_FOUND", "投诉不存在"); const [order]=row.orderId?await this.database.db.select().from(orders).where(eq(orders.id,row.orderId)).limit(1):[];return {...await this.complaintDetail(row),...complaintAdminAssociations(row,order)}; }

  async adminTransitionComplaint(adminId: string, complaintId: string, input: { version: number; action: "ACCEPT" | "START_PROCESSING" | "REQUEST_EVIDENCE" | "COMPLETE" | "CLOSE"; reason: string; result?: string }, metadata: RequestMetadata) {
    const transitions: Record<typeof input.action, { from: ComplaintStatus[]; to: ComplaintStatus }> = {
      ACCEPT: { from: ["SUBMITTED"], to: "ACCEPTED" }, START_PROCESSING: { from: ["ACCEPTED"], to: "PROCESSING" }, REQUEST_EVIDENCE: { from: ["ACCEPTED", "PROCESSING"], to: "NEED_MORE_EVIDENCE" }, COMPLETE: { from: ["PROCESSING", "NEED_MORE_EVIDENCE"], to: "COMPLETED" }, CLOSE: { from: ["SUBMITTED", "ACCEPTED", "PROCESSING", "NEED_MORE_EVIDENCE"], to: "CLOSED" },
    };
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockComplaint(tx, complaintId); const rule = transitions[input.action];
      if (!rule.from.includes(row.status)) throw invalidComplaintState(row.status, input.action); if (row.version !== input.version) throw versionConflict("投诉");
      const now = new Date(); const [updated] = await tx.update(complaints).set({ status: rule.to, assignedAdminId: adminId, adminResult: input.action === "COMPLETE" || input.action === "CLOSE" ? input.result ?? input.reason : row.adminResult, processedAt: row.processedAt ?? now, completedAt: input.action === "COMPLETE" ? now : row.completedAt, version: sql`${complaints.version} + 1`, updatedAt: now }).where(and(eq(complaints.id, row.id), eq(complaints.status, row.status), eq(complaints.version, input.version))).returning();
      if (!updated) throw versionConflict("投诉");
      await this.complaintLog(tx, updated, row.status, rule.to, "ADMIN", `COMPLAINT_${input.action}`, input.reason, metadata, { adminId });
      await this.audit(tx, adminId, `COMPLAINT_${input.action}`, "COMPLAINT", row.id, input.reason, row, updated, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "COMPLAINT", aggregateId: row.id, eventType: `Complaint${toPascal(input.action)}`, payload: { complaint_id: row.id, old_status: row.status, new_status: rule.to }, traceId: metadata.traceId });
      return complaintView(updated);
    });
  }

  async createReview(userId: string, input: { orderId: string; rating: number; content?: string; anonymous: boolean }, metadata: RequestMetadata) {
    try {
      return await this.database.db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1).for("update"); if (!order || order.buyerId !== userId) throw notFound("ORDER_NOT_FOUND", "订单不存在");
        if (order.status !== "COMPLETED") throw conflict("REVIEW_ORDER_STATE_INVALID", "只有已完成订单可以评价");
        if (order.ruleVersion === "V3.1" && (!order.completedAt || Date.now() >= order.completedAt.getTime() + 7 * 24 * 3600000)) throw conflict("REVIEW_WINDOW_EXPIRED", "首次交易终结后的七天评价期限已结束");
        const [profile] = await tx.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
        const [created] = await tx.insert(reviews).values({ id: uuidv7(), orderId: order.id, productId: order.productId, sellerId: order.sellerId, buyerId: userId, rating: input.rating, content: input.content, anonymous: input.anonymous, status: "PUBLIC", displayNicknameSnapshot: input.anonymous ? "匿名玩家" : profile?.nickname ?? "熊崽玩家", serviceTitleSnapshot: order.productTitleSnapshot, skuNameSnapshot: order.skuNameSnapshot }).returning();
        await this.recomputeRatings(tx, order.sellerId, order.productId);
        await this.outbox.enqueue(tx, { aggregateType: "REVIEW", aggregateId: created!.id, eventType: "ReviewPublished", payload: { review_id: created!.id, order_id: order.id, rating: input.rating }, traceId: metadata.traceId });
        return reviewView(created!);
      });
    } catch (error) { if (isPgCode(error, "23505")) throw conflict("REVIEW_ALREADY_EXISTS", "该订单已经评价，评价隐藏后也不能重新提交"); throw error; }
  }

  async listMyReviews(userId: string, input: { cursor?: string; limit?: unknown; order_id?: string }) {
    const limit = normalizePageSize(input.limit, 20); const scope = `user-reviews:${userId}:${input.order_id ?? "all"}`;
    const cursor = this.userCursor(input.cursor, scope, "评价");
    const rows = await this.database.db.select().from(reviews).where(and(eq(reviews.buyerId, userId), input.order_id ? eq(reviews.orderId, input.order_id) : undefined, cursorCondition(reviews.createdAt, reviews.id, cursor))).orderBy(desc(reviews.createdAt), desc(reviews.id)).limit(limit + 1);
    return cursorPage(rows, limit, scope, this.config.cursorSigningSecret, reviewView);
  }

  async getMyReview(userId: string, reviewId: string) {
    const [row] = await this.database.db.select().from(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.buyerId, userId))).limit(1);
    if (!row) throw notFound("REVIEW_NOT_FOUND", "评价不存在");
    return reviewView(row);
  }

  async listPublicReviews(productId: string, input: { cursor?: string; limit?: unknown }) {
    const limit = normalizePageSize(input.limit, 20); const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== `product-reviews:${productId}`) throw validation("cursor", "分页游标与当前服务不匹配");
    const rows = await this.database.db.select().from(reviews).where(and(eq(reviews.productId, productId), eq(reviews.status, "PUBLIC"), isNull(reviews.deletedAt), cursor ? or(lt(reviews.createdAt, new Date(cursor.sort_value)), and(eq(reviews.createdAt, new Date(cursor.sort_value)), lt(reviews.id, cursor.id))) : undefined)).orderBy(desc(reviews.createdAt), desc(reviews.id)).limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1); return { items: page.map(reviewView), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope: `product-reviews:${productId}` }, this.config.cursorSigningSecret) : null };
  }

  async listPublicSellerReviews(sellerId: string, input: { cursor?: string; limit?: unknown }) {
    const [seller] = await this.database.db.select({ id: sellerProfiles.id }).from(sellerProfiles).where(and(eq(sellerProfiles.id, sellerId), eq(sellerProfiles.status, "APPROVED"))).limit(1);
    if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩主页不存在");
    const limit = normalizePageSize(input.limit, 20); const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== `seller-reviews:${sellerId}`) throw validation("cursor", "分页游标与当前陪玩不匹配");
    const rows = await this.database.db.select().from(reviews).where(and(eq(reviews.sellerId, sellerId), eq(reviews.status, "PUBLIC"), isNull(reviews.deletedAt), cursor ? or(lt(reviews.createdAt, new Date(cursor.sort_value)), and(eq(reviews.createdAt, new Date(cursor.sort_value)), lt(reviews.id, cursor.id))) : undefined)).orderBy(desc(reviews.createdAt), desc(reviews.id)).limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1); return { items: page.map(reviewView), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope: `seller-reviews:${sellerId}` }, this.config.cursorSigningSecret) : null };
  }

  async listAdminReviews(input:{status?:typeof reviews.$inferSelect.status;keyword?:string;cursor?:string;limit?:unknown;sort:"created_desc"|"created_asc"}) {const limit=normalizePageSize(input.limit,20);const scope=`admin-reviews:${input.status??""}:${input.keyword??""}:${input.sort}`;const cursor=this.userCursor(input.cursor,scope,"评价");const ascending=input.sort==="created_asc";const rows=await this.database.db.select().from(reviews).where(and(input.status?eq(reviews.status,input.status):undefined,input.keyword?or(ilike(reviews.serviceTitleSnapshot,`%${input.keyword}%`),ilike(reviews.displayNicknameSnapshot,`%${input.keyword}%`),sql<boolean>`${reviews.orderId}::text ILIKE ${`%${input.keyword}%`}`):undefined,adminCursorCondition(reviews.createdAt,reviews.id,cursor,ascending))).orderBy(ascending?asc(reviews.createdAt):desc(reviews.createdAt),ascending?asc(reviews.id):desc(reviews.id)).limit(limit+1);return cursorPage(rows,limit,scope,this.config.cursorSigningSecret,reviewView);}
  async getAdminReview(reviewId:string){const [row]=await this.database.db.select().from(reviews).where(eq(reviews.id,reviewId)).limit(1);if(!row)throw notFound("REVIEW_NOT_FOUND","评价不存在");return reviewView(row);}

  async moderateReview(adminId: string, reviewId: string, input: { action: "HIDE" | "RESTORE" | "SOFT_DELETE"; version: number; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1).for("update"); if (!row) throw notFound("REVIEW_NOT_FOUND", "评价不存在");
      if(row.version!==input.version)throw versionConflict("评价");
      if(input.action==="RESTORE"&&row.deletedAt)throw conflict("REVIEW_SOFT_DELETED","违规评价已永久隐藏，不能恢复");
      const expected = input.action === "HIDE" ? "PUBLIC" : input.action === "RESTORE" ? "HIDDEN" : row.status; const next = input.action === "RESTORE" ? "PUBLIC" : "HIDDEN"; if (row.status !== expected || (input.action==="SOFT_DELETE"&&row.deletedAt)) throw conflict("REVIEW_STATE_INVALID", "当前评价状态不能执行该治理操作");
      const now=new Date();const [updated] = await tx.update(reviews).set({ status: next, hiddenAt: input.action === "RESTORE" ? null : now, hiddenByAdminId: input.action === "RESTORE" ? null : adminId, hiddenReason: input.action === "RESTORE" ? null : input.reason,deletedAt:input.action==="SOFT_DELETE"?now:row.deletedAt,version:sql`${reviews.version} + 1` }).where(and(eq(reviews.id, row.id), eq(reviews.status, expected),eq(reviews.version,input.version))).returning();
      if(!updated)throw versionConflict("评价");
      await this.recomputeRatings(tx, row.sellerId, row.productId);
      await this.audit(tx, adminId, `REVIEW_${input.action}`, "REVIEW", row.id, input.reason, row, updated, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "REVIEW", aggregateId: row.id, eventType: input.action === "HIDE" ? "ReviewHidden" : input.action==="RESTORE"?"ReviewRestored":"ReviewSoftDeleted", payload: { review_id: row.id, seller_id: row.sellerId, product_id: row.productId }, traceId: metadata.traceId });
      return reviewView(updated!);
    });
  }

  private async prepareProviderRefund(tx: DatabaseTransaction, refundId: string, approvedAmount?: bigint) {
    const [row] = await tx.select({ refund: refunds, payment: payments, order: orders }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).innerJoin(orders, eq(orders.id, refunds.orderId)).where(eq(refunds.id, refundId)).limit(1); if (!row) throw notFound("REFUND_NOT_FOUND", "退款申请不存在");
    const paymentProvider = this.paymentProviders.get(row.payment.channel);
    if (!paymentProvider.createRefund) throw new AppError({ code: "REFUND_PROVIDER_UNAVAILABLE", message: "退款渠道尚未配置", statusCode: 503 });
    const amount = approvedAmount ?? row.refund.requestedAmountCent; const remaining = row.order.paidAmountCent - row.order.refundedAmountCent;
    if (amount <= 0n || amount > row.refund.requestedAmountCent || amount > remaining) throw conflict("REFUND_AMOUNT_EXCEEDS_REMAINING", "退款金额超过申请金额或订单剩余可退金额");
    return paymentProvider.createRefund({ refundNo: row.refund.refundNo, paymentNo: row.payment.paymentNo, providerTransactionId: row.payment.providerTransactionId, amountCent: amount });
  }

  private async recomputeRatings(tx: DatabaseTransaction, sellerId: string, productId: string) {
    await tx.select({ id: sellerProfiles.id }).from(sellerProfiles).where(eq(sellerProfiles.id, sellerId)).limit(1).for("update"); await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1).for("update");
    for (const subject of [{ type: "SELLER" as const, sellerId, productId: null }, { type: "PRODUCT" as const, sellerId: null, productId }]) {
      const condition = subject.type === "SELLER" ? eq(reviews.sellerId, sellerId) : eq(reviews.productId, productId);
      const [aggregate] = await tx.select({ count: sql<number>`count(*)::integer`, sum: sql<bigint>`coalesce(sum(${reviews.rating}), 0)::bigint`, star1: sql<number>`count(*) filter (where ${reviews.rating} = 1)::integer`, star2: sql<number>`count(*) filter (where ${reviews.rating} = 2)::integer`, star3: sql<number>`count(*) filter (where ${reviews.rating} = 3)::integer`, star4: sql<number>`count(*) filter (where ${reviews.rating} = 4)::integer`, star5: sql<number>`count(*) filter (where ${reviews.rating} = 5)::integer` }).from(reviews).where(and(condition, eq(reviews.status, "PUBLIC")));
      const count = aggregate?.count ?? 0; const sum = BigInt(aggregate?.sum ?? 0); const average = count === 0 ? "0.00" : (Number(sum) / count).toFixed(2);
      const [existing] = await tx.select().from(ratingAggregates).where(subject.type === "SELLER" ? eq(ratingAggregates.sellerId, sellerId) : eq(ratingAggregates.productId, productId)).limit(1);
      const values = { ratingCount: count, ratingSum: sum, ratingAvg: average, star1Count: aggregate?.star1 ?? 0, star2Count: aggregate?.star2 ?? 0, star3Count: aggregate?.star3 ?? 0, star4Count: aggregate?.star4 ?? 0, star5Count: aggregate?.star5 ?? 0, updatedAt: new Date() };
      if (existing) await tx.update(ratingAggregates).set(values).where(eq(ratingAggregates.id, existing.id)); else await tx.insert(ratingAggregates).values({ id: uuidv7(), subjectType: subject.type, sellerId: subject.sellerId, productId: subject.productId, ...values });
      if (subject.type === "SELLER") await tx.update(sellerProfiles).set({ ratingAvg: average, reviewCount: count, updatedAt: new Date() }).where(eq(sellerProfiles.id, sellerId)); else await tx.update(products).set({ ratingAvg: average, reviewCount: count, updatedAt: new Date() }).where(eq(products.id, productId));
    }
  }

  private async addComplaintEvidenceTx(tx: DatabaseTransaction, complaint: typeof complaints.$inferSelect, userId: string, fileId: string, description: string | undefined) {
    const [file] = await tx.select().from(files).where(and(eq(files.id, fileId), eq(files.ownerUserId, userId), eq(files.fileType, "COMPLAINT_EVIDENCE"), eq(files.visibility, "PRIVATE"), eq(files.uploadStatus, "VERIFIED"), eq(files.moderationStatus, "APPROVED"), isNull(files.deletedAt))).limit(1); if (!file) throw notFound("EVIDENCE_FILE_NOT_FOUND", "投诉证据不存在、用途或可见性不匹配，或尚未完成校验与人工审核");
    const inserted = await tx.insert(complaintEvidences).values({ id: uuidv7(), complaintId: complaint.id, fileId, submittedByUserId: userId, description }).onConflictDoNothing().returning();
    if (!inserted[0]) { const [existing] = await tx.select().from(complaintEvidences).where(and(eq(complaintEvidences.complaintId, complaint.id), eq(complaintEvidences.fileId, fileId))).limit(1); return { row: evidenceView(existing!), duplicate: true }; }
    await tx.insert(fileUsages).values({ id: uuidv7(), fileId, usageType: "EVIDENCE", targetType: "COMPLAINT", targetId: complaint.id }).onConflictDoNothing();
    return { row: evidenceView(inserted[0]), duplicate: false };
  }

  private userCursor(value: string | undefined, scope: string, subject: string) {
    const cursor = value ? decodeCursor(value, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== scope) throw validation("cursor", `分页游标与当前${subject}列表不匹配`);
    return cursor;
  }

  private async refundForUser(userId: string, refundId: string) { const [row] = await this.database.db.select({ refund: refunds, order: orders }).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).where(and(eq(refunds.id, refundId), or(eq(orders.buyerId, userId), eq(orders.sellerUserId, userId)))).limit(1); if (!row) throw notFound("REFUND_NOT_FOUND", "退款申请不存在"); return row.refund; }
  private async complaintForUser(userId: string, complaintId: string) { const [row] = await this.database.db.select().from(complaints).where(and(eq(complaints.id, complaintId), eq(complaints.reporterId, userId))).limit(1); if (!row) throw notFound("COMPLAINT_NOT_FOUND", "投诉不存在"); return row; }
  private async lockRefund(tx: DatabaseTransaction, refundId: string) {
    const [lookup] = await tx.select({ orderId: refunds.orderId }).from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!lookup) throw notFound("REFUND_NOT_FOUND", "退款申请不存在");
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, lookup.orderId)).limit(1).for("update");
    const [row] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1).for("update");
    if (!row) throw notFound("REFUND_NOT_FOUND", "退款申请不存在");
    return row;
  }
  private async lockComplaint(tx: DatabaseTransaction, complaintId: string) { const [row] = await tx.select().from(complaints).where(eq(complaints.id, complaintId)).limit(1).for("update"); if (!row) throw notFound("COMPLAINT_NOT_FOUND", "投诉不存在"); return row; }
  private async refundDetail(row: typeof refunds.$inferSelect) { const logs = await this.database.db.select().from(refundLogs).where(eq(refundLogs.refundId, row.id)).orderBy(refundLogs.createdAt); return { ...refundView(row), available_actions: ["SELLER_REJECTED", "NEGOTIATING"].includes(row.status) ? ["ESCALATE", "CREATE_COMPLAINT"] : ["CREATE_COMPLAINT"], logs: logs.map(refundLogView) }; }
  private async complaintDetail(row: typeof complaints.$inferSelect) { const [logs, evidences] = await Promise.all([this.database.db.select().from(complaintLogs).where(eq(complaintLogs.complaintId, row.id)).orderBy(complaintLogs.createdAt), this.database.db.select().from(complaintEvidences).where(eq(complaintEvidences.complaintId, row.id)).orderBy(complaintEvidences.createdAt)]); return { ...complaintView(row), logs: logs.map(complaintLogView), evidences: evidences.map(evidenceView) }; }
  private async refundLog(tx: DatabaseTransaction, row: typeof refunds.$inferSelect, oldStatus: RefundStatus | null, newStatus: RefundStatus, role: typeof refundLogs.$inferInsert.operatorRole, action: string, reason: string, metadata: RequestMetadata, actor: { userId?: string; adminId?: string } = {}) { await tx.insert(refundLogs).values({ id: uuidv7(), refundId: row.id, oldStatus, newStatus, operatorUserId: actor.userId, operatorAdminId: actor.adminId, operatorRole: role, action, reason, requestId: metadata.requestId }); }
  private async complaintLog(tx: DatabaseTransaction, row: typeof complaints.$inferSelect, oldStatus: ComplaintStatus | null, newStatus: ComplaintStatus, role: typeof complaintLogs.$inferInsert.operatorRole, action: string, reason: string, metadata: RequestMetadata, actor: { userId?: string; adminId?: string } = {}) { await tx.insert(complaintLogs).values({ id: uuidv7(), complaintId: row.id, oldStatus, newStatus, operatorUserId: actor.userId, operatorAdminId: actor.adminId, operatorRole: role, action, reason, requestId: metadata.requestId }); }
  private async audit(tx: DatabaseTransaction, adminId: string, action: string, targetType: typeof adminOperationLogs.$inferInsert.targetType, targetId: string, reason: string, before: unknown, after: unknown, metadata: RequestMetadata) { await tx.insert(adminOperationLogs).values({ id: uuidv7(), adminId, action, targetType, targetId, reason, beforeJson: toApiJson(before) as Record<string, unknown> | null, afterJson: toApiJson(after) as Record<string, unknown> | null, requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent }); }
}

function refundView(row: typeof refunds.$inferSelect) { return { id: row.id, refund_no: row.refundNo, order_id: row.orderId, payment_id: row.paymentId, applicant_id: row.applicantId, requested_amount_cent: row.requestedAmountCent, approved_amount_cent: row.approvedAmountCent, reason_code: row.reasonCode, reason_text: row.reasonText, description: row.description, seller_decision: row.sellerDecision, seller_reason: row.sellerReason, admin_decision: row.adminDecision, admin_reason: row.adminReason, assigned_admin_id: row.assignedAdminId, status: row.status, provider_refund_no: row.providerRefundNo, seller_processed_at: row.sellerProcessedAt, escalated_at: row.escalatedAt, completed_at: row.completedAt, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function refundLogView(row: typeof refundLogs.$inferSelect) { return { id: row.id, old_status: row.oldStatus, new_status: row.newStatus, operator_user_id: row.operatorUserId, operator_admin_id: row.operatorAdminId, operator_role: row.operatorRole, action: row.action, reason: row.reason, created_at: row.createdAt }; }
function complaintView(row: typeof complaints.$inferSelect) { return { id: row.id, complaint_no: row.complaintNo, reporter_id: row.reporterId, target_type: row.targetType, target_user_id: row.targetUserId, target_seller_id: row.targetSellerId, target_product_id: row.targetProductId, order_id: row.orderId, complaint_type: row.complaintType, description: row.description, status: row.status, assigned_admin_id: row.assignedAdminId, admin_result: row.adminResult, processed_at: row.processedAt, completed_at: row.completedAt, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function complaintAdminAssociations(row:typeof complaints.$inferSelect,order?:typeof orders.$inferSelect){if(!order)return {target_user_id:row.targetUserId,target_seller_id:row.targetSellerId,target_product_id:row.targetProductId};const counterpartId=row.reporterId===order.buyerId?order.sellerUserId:order.buyerId;return {target_user_id:row.targetUserId??counterpartId,target_seller_id:row.targetSellerId??order.sellerId,target_product_id:row.targetProductId??order.productId};}
function complaintAdminView(row:typeof complaints.$inferSelect,order?:typeof orders.$inferSelect){return {...complaintView(row),...complaintAdminAssociations(row,order)};}
function complaintLogView(row: typeof complaintLogs.$inferSelect) { return { id: row.id, old_status: row.oldStatus, new_status: row.newStatus, operator_user_id: row.operatorUserId, operator_admin_id: row.operatorAdminId, operator_role: row.operatorRole, action: row.action, reason: row.reason, created_at: row.createdAt }; }
function evidenceView(row: typeof complaintEvidences.$inferSelect) { return { id: row.id, complaint_id: row.complaintId, file_id: row.fileId, submitted_by_user_id: row.submittedByUserId, submitted_by_admin_id: row.submittedByAdminId, description: row.description, created_at: row.createdAt }; }
function isComplaintEvidenceLimit(error: unknown) { let current: unknown = error; for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) { const message = "message" in current && typeof current.message === "string" ? current.message : ""; if (message.includes("complaint evidence limit of 20 reached")) return true; current = "cause" in current ? current.cause : undefined; } return false; }
function reviewView(row: typeof reviews.$inferSelect) { return { id: row.id, order_id: row.orderId, product_id: row.productId, seller_id: row.sellerId, buyer_id: row.buyerId, rating: row.rating, content: row.content, anonymous: row.anonymous, status: row.status, display_nickname: row.displayNicknameSnapshot, service_title: row.serviceTitleSnapshot, sku_name: row.skuNameSnapshot, hidden_at: row.hiddenAt, hidden_reason: row.hiddenReason, deleted_at:row.deletedAt,version:row.version, created_at: row.createdAt }; }
function cursorCondition(createdAt: AnyColumn, id: AnyColumn, cursor: ReturnType<typeof decodeCursor> | undefined) { return cursor ? or(lt(createdAt, new Date(cursor.sort_value)), and(eq(createdAt, new Date(cursor.sort_value)), lt(id, cursor.id))) : undefined; }
function adminCursorCondition(createdAt:AnyColumn,id:AnyColumn,cursor:ReturnType<typeof decodeCursor>|undefined,ascending:boolean){return !cursor?undefined:ascending?or(gt(createdAt,new Date(cursor.sort_value)),and(eq(createdAt,new Date(cursor.sort_value)),gt(id,cursor.id))):cursorCondition(createdAt,id,cursor);}
function cursorPage<T extends { id: string; createdAt: Date }, V>(rows: T[], limit: number, scope: string, secret: string, view: (row: T) => V) { const page = rows.slice(0, limit); const last = page.at(-1); return { items: page.map(view), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope }, secret) : null }; }
function externalNo(prefix: string) { const date = new Date().toISOString().slice(0, 10).replaceAll("-", ""); return `${prefix}${date}${randomBytes(8).toString("hex").toUpperCase()}`; }
function toPascal(value: string) { return value.toLowerCase().split("_").map((item) => item[0]!.toUpperCase() + item.slice(1)).join(""); }
function inStatus<T extends string>(value: string, allowed: readonly T[]): value is T { return allowed.includes(value as T); }
function isPgCode(value: unknown, code: string): boolean { if (typeof value !== "object" || value === null) return false; if ("code" in value && (value as { code?: unknown }).code === code) return true; return "cause" in value && isPgCode((value as { cause?: unknown }).cause, code); }
function notFound(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 404 }); }
function conflict(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function validation(field: string, message: string) { return new AppError({ code: errorCodes.VALIDATION_FAILED, message: "请求参数校验失败", statusCode: 400, fieldErrors: [{ field, code: "INVALID", message }] }); }
function invalidRefundState(status: string, action: string) { return conflict("REFUND_STATE_INVALID", `退款状态 ${status} 不能执行${action}`); }
function invalidComplaintState(status: string, action: string) { return conflict("COMPLAINT_STATE_INVALID", `投诉状态 ${status} 不能执行${action}`); }
function versionConflict(subject: string) { return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: `${subject}已被其他操作更新，请刷新后重试`, statusCode: 409 }); }
