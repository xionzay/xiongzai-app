import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { FinanceLedgerEngine, IdempotencyService, ORDER_JOB_TYPES, OutboxService, ScheduledJobService, canonicalRequestHash } from "@xiongzai/application";
import { AppError, decodeCursor, encodeCursor, errorCodes, normalizePageSize, type BuyerOrderAction, type PaymentChannel } from "@xiongzai/contracts";
import {
  complaints, orderSlotReservations, orderStatusLogs, orders, paymentEvents, payments, platformConfigs, productImages, productSkus, refunds, reviews,
  products, sellerAvailabilitySlots, sellerProfiles, userProfiles, uuidv7, type Database, type DatabaseClient, type DatabaseTransaction,
} from "@xiongzai/database";
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import { IdentityUserService, type RequestMetadata } from "./identity-user.service.js";
import { type PaymentCallbackPayload, type PaymentProvider, PaymentProviderRouter } from "./payment-provider.js";
import { API_CONFIG, DATABASE_CLIENT, PAYMENT_PROVIDER_ROUTER } from "./tokens.js";

type OrderDraft = { productId: string; skuId: string; slotId: string; quantity: number; serviceStartsAt: Date; buyerNote?: string | null; expectedPayableAmountCent?: string };
type Policy = { paymentTimeoutSeconds: number; acceptTimeoutSeconds: number; autoConfirmSeconds: number; commissionRateBps: number };
type PurchaseContext = { product: typeof products.$inferSelect; seller: typeof sellerProfiles.$inferSelect; sku: typeof productSkus.$inferSelect; slot: typeof sellerAvailabilitySlots.$inferSelect; imageFileId: string | null };

@Injectable()
export class OrderPaymentService {
  private readonly outbox = new OutboxService();
  private readonly idempotency = new IdempotencyService();
  private readonly jobs = new ScheduledJobService();
  private readonly finance: FinanceLedgerEngine;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(PAYMENT_PROVIDER_ROUTER) private readonly paymentProviders: PaymentProviderRouter,
    private readonly identity: IdentityUserService,
  ) { this.finance = new FinanceLedgerEngine(database.db); }

  async preview(userId: string, input: OrderDraft) {
    const policy = await this.loadPolicy();
    const context = await this.loadPurchaseContext(this.database.db, userId, input);
    return previewView(context, policy, input.quantity, input.serviceStartsAt);
  }

  async createOrder(userId: string, input: OrderDraft, idempotencyKey: string, metadata: RequestMetadata) {
    const policy = await this.loadPolicy();
    try {
      return await this.database.db.transaction(async (tx) => {
        const reservation = await this.idempotency.reserve(tx, {
          scope: `user:${userId}:order:create`, key: idempotencyKey,
          request: { product_id: input.productId, sku_id: input.skuId, slot_id: input.slotId, quantity: input.quantity, service_starts_at: input.serviceStartsAt.toISOString(), buyer_note: input.buyerNote ?? null },
          expiresAt: new Date(Date.now() + 86_400_000),
        });
        if (reservation.replay) return reservation.replay.body;

        const context = await this.loadPurchaseContext(tx, userId, input, true);
        const calculated = previewView(context, policy, input.quantity, input.serviceStartsAt);
        if (input.expectedPayableAmountCent !== undefined && calculated.payable_amount_cent.toString() !== input.expectedPayableAmountCent) {
          throw conflict("ORDER_PRICE_CHANGED", "服务价格已变化，请确认最新金额后重新提交");
        }
        const orderId = uuidv7(); const orderNo = externalNo("XZ"); const now = new Date();
        const expiresAt = new Date(now.getTime() + policy.paymentTimeoutSeconds * 1000);
        const [order] = await tx.insert(orders).values({
          id: orderId, orderNo, buyerId: userId, sellerUserId: context.seller.userId, sellerId: context.seller.id,
          productId: context.product.id, skuId: context.sku.id, productTitleSnapshot: context.product.title,
          productImageSnapshot: context.imageFileId ?? "", productDescriptionSnapshot: context.product.description,
          sellerNameSnapshot: context.seller.sellerNickname, sellerAvatarSnapshot: context.seller.sellerAvatarFileId,
          skuNameSnapshot: context.sku.skuName, skuDescriptionSnapshot: context.sku.description,
          skuPriceCentSnapshot: context.sku.priceCent, skuDurationMinutesSnapshot: context.sku.durationMinutes,
          quantity: input.quantity, totalAmountCent: calculated.total_amount_cent, discountCent: 0n,
          payableAmountCent: calculated.payable_amount_cent, commissionRateBpsSnapshot: policy.commissionRateBps,
          platformFeeCent: calculated.platform_fee_cent, sellerIncomeCent: calculated.seller_income_cent,
          serviceStartsAt: input.serviceStartsAt, serviceEndsAt: calculated.service_ends_at, buyerNote: input.buyerNote,
          expiresAt,
        }).returning();
        await tx.insert(orderSlotReservations).values({ id: uuidv7(), orderId, slotId: context.slot.id, sellerId: context.seller.id, startsAt: input.serviceStartsAt, endsAt: calculated.service_ends_at, status: "HELD", expiresAt });
        await tx.insert(orderStatusLogs).values({ id: uuidv7(), orderId, oldStatus: null, newStatus: "PENDING_PAYMENT", operatorUserId: userId, operatorRole: "BUYER", action: "CREATE", remark: "买家创建订单并占用预约时段", requestId: metadata.requestId });
        await this.jobs.schedule(tx, { jobKey: `order:${orderId}:payment-timeout`, jobType: ORDER_JOB_TYPES.PAYMENT_TIMEOUT, targetType: "ORDER", targetId: orderId, payload: { order_id: orderId }, runAt: expiresAt });
        await this.outbox.enqueue(tx, { aggregateType: "ORDER", aggregateId: orderId, eventType: "OrderCreated", payload: { order_id: orderId, order_no: orderNo, buyer_id: userId, seller_id: context.seller.id, payable_amount_cent: calculated.payable_amount_cent }, traceId: metadata.traceId });
        const response = orderView(order!);
        await this.idempotency.complete(tx, reservation.id, { statusCode: 201, body: response, resourceType: "ORDER", resourceId: orderId });
        return response;
      });
    } catch (cause) {
      if (isPgCode(cause, "23P01")) throw conflict("ORDER_SLOT_CONFLICT", "该陪玩时段刚刚被其他订单占用，请重新选择");
      throw cause;
    }
  }

  async createPayment(userId: string, orderId: string, paymentChannel: PaymentChannel, idempotencyKey: string, metadata: RequestMetadata) {
    const paymentProvider = this.paymentProviders.get(paymentChannel);
    const storedKey = createHash("sha256").update(`${userId}:${idempotencyKey}`).digest("hex");
    const existing = await this.database.db.select().from(payments).where(eq(payments.idempotencyKey, storedKey)).limit(1);
    if (existing[0]) {
      if (existing[0].orderId !== orderId || existing[0].channel !== paymentChannel) throw conflict("PAYMENT_IDEMPOTENCY_CONFLICT", "支付幂等键已用于不同的订单或支付渠道");
      return { ...paymentView(existing[0]), client_payload: replayClientPayload(paymentProvider, existing[0]) };
    }
    const created = await this.database.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, userId))).limit(1).for("update");
      if (!order) throw notFound("ORDER_NOT_FOUND", "订单不存在");
      if (order.status !== "PENDING_PAYMENT" || order.expiresAt <= new Date()) throw invalidState("订单当前不可支付");
      if (order.paymentStatus === "PAYING") throw conflict("PAYMENT_ALREADY_PAYING", "订单已有支付正在处理中");
      const [transactionPolicy] = await this.identity.requirePolicyAcceptances(tx, userId, "ORDER_PAYMENT");
      const paymentId = uuidv7(); const paymentNo = externalNo("PAY");
      const [payment] = await tx.insert(payments).values({ id: paymentId, orderId, paymentNo, channel: paymentChannel, idempotencyKey: storedKey, amountCent: order.payableAmountCent, status: "CREATED" }).returning();
      const changed = await tx.update(orders).set({
        paymentStatus: "PAYING",
        transactionPolicyVersionId: transactionPolicy!.id,
        refundPolicyVersionId: transactionPolicy!.id,
        version: sql`${orders.version} + 1`, updatedAt: new Date(),
      })
        .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT"), eq(orders.version, order.version), inArray(orders.paymentStatus, ["CREATED", "FAILED"]))).returning({ id: orders.id });
      if (!changed[0]) throw versionConflict();
      await this.outbox.enqueue(tx, { aggregateType: "PAYMENT", aggregateId: paymentId, eventType: "PaymentCreated", payload: { payment_id: paymentId, payment_no: paymentNo, order_id: orderId, payment_channel: paymentChannel, amount_cent: order.payableAmountCent }, traceId: metadata.traceId });
      return { payment: payment!, order };
    });
    try {
      const provider = await paymentProvider.createPayment({ paymentNo: created.payment.paymentNo, orderNo: created.order.orderNo, amountCent: created.payment.amountCent, expiresAt: created.order.expiresAt });
      const [updated] = await this.database.db.update(payments).set({ status: "PAYING", version: sql`${payments.version} + 1`, updatedAt: new Date() }).where(and(eq(payments.id, created.payment.id), eq(payments.status, "CREATED"), eq(payments.version, created.payment.version))).returning();
      if (!updated) throw versionConflict();
      return { ...paymentView(updated), client_payload: provider.clientPayload };
    } catch (cause) {
      await this.database.db.transaction(async (tx) => {
        await tx.update(payments).set({ status: "FAILED", version: sql`${payments.version} + 1`, updatedAt: new Date() }).where(and(eq(payments.id, created.payment.id), inArray(payments.status, ["CREATED", "PAYING"])));
        await tx.update(orders).set({ paymentStatus: "FAILED", version: sql`${orders.version} + 1`, updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT"), eq(orders.paymentStatus, "PAYING")));
      });
      throw new AppError({ code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "支付渠道暂时不可用", statusCode: 503, cause });
    }
  }

  async processPaymentCallback(requestedChannel: PaymentChannel | "mock", payload: PaymentCallbackPayload, signature: string | undefined, metadata: RequestMetadata) {
    if (requestedChannel === "mock" && !["development", "test"].includes(this.config.environment)) throw notFound("MOCK_PAYMENT_DISABLED", "Mock 支付回调未启用");
    const [stored] = await this.database.db.select({ channel: payments.channel }).from(payments).where(eq(payments.paymentNo, payload.payment_no)).limit(1);
    if (!stored) throw notFound("PAYMENT_NOT_FOUND", "支付单不存在");
    if (requestedChannel !== "mock" && stored.channel !== requestedChannel) throw conflict("PAYMENT_CHANNEL_MISMATCH", "支付回调渠道与支付单不一致");
    const paymentProvider = this.paymentProviders.get(stored.channel);
    this.assertMockCallbackAllowed(requestedChannel, paymentProvider, "PAYMENT");
    if (!paymentProvider.verifyCallback(payload, signature)) throw new AppError({ code: "PAYMENT_SIGNATURE_INVALID", message: "支付回调签名无效", statusCode: 401 });
    const result = await this.database.db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(and(eq(payments.paymentNo, payload.payment_no), eq(payments.channel, stored.channel))).limit(1).for("update");
      if (!payment) throw notFound("PAYMENT_NOT_FOUND", "支付单不存在");
      const inserted = await tx.insert(paymentEvents).values({ id: uuidv7(), paymentId: payment.id, channel: payment.channel, providerEventId: payload.event_id, eventType: payload.event_type, signatureVerified: true, payloadSha256: canonicalRequestHash(payload) }).onConflictDoNothing().returning();
      if (!inserted[0]) return { duplicate: true, payment: paymentView(payment) } as const;
      let callbackAmount: bigint;
      try { callbackAmount = BigInt(payload.amount_cent); } catch { callbackAmount = -1n; }
      if (callbackAmount !== payment.amountCent) {
        await tx.update(paymentEvents).set({ processingError: "PAYMENT_AMOUNT_MISMATCH", processedAt: new Date() }).where(eq(paymentEvents.id, inserted[0].id));
        return { error: "PAYMENT_AMOUNT_MISMATCH" as const };
      }
      if (payload.event_type === "PAYMENT_FAILED") {
        if (inStatus(payment.status, ["CREATED", "PAYING"])) await tx.update(payments).set({ status: "FAILED", providerTransactionId: payload.provider_transaction_id, version: sql`${payments.version} + 1`, updatedAt: new Date() }).where(and(eq(payments.id, payment.id), eq(payments.status, payment.status), eq(payments.version, payment.version)));
        await tx.update(orders).set({ paymentStatus: "FAILED", version: sql`${orders.version} + 1`, updatedAt: new Date() }).where(and(eq(orders.id, payment.orderId), eq(orders.status, "PENDING_PAYMENT"), eq(orders.paymentStatus, "PAYING")));
        await tx.update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, inserted[0].id));
        return { duplicate: false, status: "FAILED" as const };
      }
      if (payment.status === "PAID") {
        await tx.update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, inserted[0].id));
        return { duplicate: false, payment: paymentView(payment) };
      }
      if (!inStatus(payment.status, ["CREATED", "PAYING"])) {
        await tx.update(paymentEvents).set({ processingError: "PAYMENT_STATE_INVALID", processedAt: new Date() }).where(eq(paymentEvents.id, inserted[0].id));
        return { error: "PAYMENT_STATE_INVALID" as const };
      }
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1).for("update");
      if (!order || order.status !== "PENDING_PAYMENT") {
        await tx.update(paymentEvents).set({ processingError: "ORDER_NOT_PAYABLE", processedAt: new Date() }).where(eq(paymentEvents.id, inserted[0].id));
        return { error: "ORDER_NOT_PAYABLE" as const };
      }
      const now = new Date();
      const paid = await tx.update(payments).set({ status: "PAID", providerTransactionId: payload.provider_transaction_id, paidAt: now, version: sql`${payments.version} + 1`, updatedAt: now })
        .where(and(eq(payments.id, payment.id), eq(payments.status, payment.status), eq(payments.version, payment.version))).returning();
      if (!paid[0]) throw versionConflict();
      const changed = await tx.update(orders).set({ status: "PENDING_ACCEPT", paymentStatus: "PAID", paidAmountCent: payment.amountCent, paidAt: now, version: sql`${orders.version} + 1`, updatedAt: now })
        .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_PAYMENT"), eq(orders.version, order.version))).returning();
      if (!changed[0]) throw versionConflict();
      const [slot] = await tx.select().from(orderSlotReservations).where(eq(orderSlotReservations.orderId, order.id)).limit(1).for("update");
      if (!slot || slot.status !== "HELD") throw invalidState("订单预约占用已失效");
      await tx.update(orderSlotReservations).set({ status: "CONFIRMED", version: sql`${orderSlotReservations.version} + 1`, updatedAt: now }).where(and(eq(orderSlotReservations.id, slot.id), eq(orderSlotReservations.status, "HELD"), eq(orderSlotReservations.version, slot.version)));
      const policy = await this.loadPolicy(tx);
      await this.jobs.schedule(tx, { jobKey: `order:${order.id}:accept-timeout`, jobType: ORDER_JOB_TYPES.ACCEPT_TIMEOUT, targetType: "ORDER", targetId: order.id, payload: { order_id: order.id }, runAt: new Date(now.getTime() + policy.acceptTimeoutSeconds * 1000) });
      await tx.insert(orderStatusLogs).values({ id: uuidv7(), orderId: order.id, oldStatus: "PENDING_PAYMENT", newStatus: "PENDING_ACCEPT", operatorRole: "PAYMENT_PROVIDER", action: "PAYMENT_SUCCEEDED", remark: "支付成功，等待陪玩接单", requestId: metadata.requestId });
      await tx.update(paymentEvents).set({ processedAt: now }).where(eq(paymentEvents.id, inserted[0].id));
      await this.outbox.enqueue(tx, { aggregateType: "ORDER", aggregateId: order.id, eventType: "OrderPaid", payload: { order_id: order.id, order_no: order.orderNo, payment_id: payment.id, amount_cent: payment.amountCent }, traceId: metadata.traceId });
      return { duplicate: false, payment: paymentView(paid[0]), order: orderView(changed[0]) };
    });
    if ("error" in result && result.error) {
      const message = result.error === "PAYMENT_AMOUNT_MISMATCH"
        ? "支付回调金额与订单金额不一致"
        : "支付单或订单状态不允许处理该回调";
      throw conflict(result.error, message);
    }
    if ("recordPaymentCallback" in paymentProvider && typeof paymentProvider.recordPaymentCallback === "function") paymentProvider.recordPaymentCallback(payload);
    return result;
  }

  async mockConfirm(userId: string, paymentId: string, metadata: RequestMetadata) {
    const payment = await this.requirePaymentForUser(userId, paymentId);
    return this.mockPaymentCallback(payment, "PAYMENT_SUCCEEDED", metadata);
  }

  async mockFail(userId: string, paymentId: string, metadata: RequestMetadata) {
    const payment = await this.requirePaymentForUser(userId, paymentId);
    return this.mockPaymentCallback(payment, "PAYMENT_FAILED", metadata);
  }

  async mockCancel(userId: string, paymentId: string) {
    this.assertMockMode();
    const payment = await this.requirePaymentForUser(userId, paymentId);
    const paymentProvider = this.paymentProviders.get(payment.channel);
    if (paymentProvider.mode !== "mock") throw notFound("MOCK_PAYMENT_DISABLED", "Mock 支付未启用");
    if (!["CREATED", "PAYING"].includes(payment.status)) throw conflict("PAYMENT_STATE_INVALID", "当前支付状态不能取消");
    const [closed] = await this.database.db.transaction(async (tx) => {
      const updated = await tx.update(payments).set({ status: "CLOSED", closedAt: new Date(), version: sql`${payments.version} + 1`, updatedAt: new Date() })
        .where(and(eq(payments.id, payment.id), inArray(payments.status, ["CREATED", "PAYING"]), eq(payments.version, payment.version))).returning();
      if (!updated[0]) throw versionConflict();
      await tx.update(orders).set({ paymentStatus: "FAILED", version: sql`${orders.version} + 1`, updatedAt: new Date() })
        .where(and(eq(orders.id, payment.orderId), eq(orders.status, "PENDING_PAYMENT"), eq(orders.paymentStatus, "PAYING")));
      return updated;
    });
    if ("recordPaymentClosed" in paymentProvider && typeof paymentProvider.recordPaymentClosed === "function") paymentProvider.recordPaymentClosed(payment.paymentNo);
    return paymentView(closed!);
  }

  async getPayment(userId: string, paymentId: string) { return paymentView(await this.requirePaymentForUser(userId, paymentId)); }

  async queryPayment(userId: string, paymentId: string) {
    const payment = await this.requirePaymentForUser(userId, paymentId);
    const provider = this.paymentProviders.get(payment.channel);
    if (!provider.queryPayment) throw new AppError({ code: "PAYMENT_QUERY_UNAVAILABLE", message: "当前支付渠道不支持主动查询", statusCode: 503 });
    return { payment: paymentView(payment), provider_result: await provider.queryPayment({ paymentNo: payment.paymentNo, providerTransactionId: payment.providerTransactionId, platformStatus: payment.status }) };
  }

  private assertMockCallbackAllowed(requestedChannel: PaymentChannel | "mock", provider: PaymentProvider, subject: "PAYMENT" | "REFUND") {
    if ((requestedChannel === "mock" || provider.mode === "mock") && !["development", "test"].includes(this.config.environment)) {
      throw notFound(`MOCK_${subject}_DISABLED`, `Mock ${subject === "PAYMENT" ? "支付" : "退款"}回调未启用`);
    }
  }

  private assertMockMode() {
    if (!["development", "test"].includes(this.config.environment) || this.config.paymentProviderMode !== "mock") throw notFound("MOCK_PAYMENT_DISABLED", "Mock 支付未启用");
  }

  private async mockPaymentCallback(payment: typeof payments.$inferSelect, eventType: PaymentCallbackPayload["event_type"], metadata: RequestMetadata) {
    this.assertMockMode();
    const paymentProvider = this.paymentProviders.get(payment.channel);
    if (paymentProvider.mode !== "mock" || !("sign" in paymentProvider)) throw notFound("MOCK_PAYMENT_DISABLED", "Mock 支付未启用");
    const payload: PaymentCallbackPayload = { event_id: `mock-event-${uuidv7()}`, event_type: eventType, payment_no: payment.paymentNo, provider_transaction_id: `mock-tx-${uuidv7()}`, amount_cent: payment.amountCent.toString() };
    const signature = (paymentProvider as PaymentProvider & { sign(value: PaymentCallbackPayload): string }).sign(payload);
    return this.processPaymentCallback(payment.channel as PaymentChannel, payload, signature, metadata);
  }

  async listBuyerOrders(userId: string, input: { cursor?: string; limit?: unknown; status?: typeof orders.$inferSelect.status; after_sale_status?: typeof orders.$inferSelect.afterSaleStatus }) {
    return this.listOrders("BUYER", userId, input);
  }
  async listSellerOrders(userId: string, input: { cursor?: string; limit?: unknown; status?: typeof orders.$inferSelect.status; after_sale_status?: typeof orders.$inferSelect.afterSaleStatus }) {
    const [seller] = await this.database.db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
    if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩资料不存在");
    return this.listOrders("SELLER", seller.id, input);
  }
  async sellerOrderSummary(userId: string) {
    const [seller] = await this.database.db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
    if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩资料不存在");
    if (seller.status !== "APPROVED") throw new AppError({ code: "SELLER_NOT_APPROVED", message: "只有已通过审核的陪玩可以进入陪玩中心", statusCode: 403 });
    const rows = await this.database.db.select({ status: orders.status, count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.sellerId, seller.id)).groupBy(orders.status);
    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  }

  async getOrder(userId: string, orderId: string) {
    const [order] = await this.database.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || (order.buyerId !== userId && order.sellerUserId !== userId) || (order.sellerUserId === userId && order.status === "PENDING_PAYMENT")) throw notFound("ORDER_NOT_FOUND", "订单不存在");
    const [reservation, paymentRows, logs, refundRows, complaintRows, reviewRows, buyerRows] = await Promise.all([
      this.database.db.select().from(orderSlotReservations).where(eq(orderSlotReservations.orderId, orderId)).limit(1),
      this.database.db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.createdAt)),
      this.database.db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, orderId)).orderBy(desc(orderStatusLogs.createdAt)),
      this.database.db.select().from(refunds).where(eq(refunds.orderId, orderId)).orderBy(desc(refunds.createdAt)),
      this.database.db.select().from(complaints).where(eq(complaints.orderId, orderId)).orderBy(desc(complaints.createdAt)),
      this.database.db.select().from(reviews).where(eq(reviews.orderId, orderId)).limit(1),
      this.database.db.select({ nickname: userProfiles.nickname, avatar_file_id: userProfiles.avatarFileId }).from(userProfiles).where(eq(userProfiles.userId, order.buyerId)).limit(1),
    ]);
    const isBuyer = order.buyerId === userId;
    const refundableAmount = order.paidAmountCent - order.refundedAmountCent;
    return {
      ...orderView(order),
      available_actions: isBuyer ? buyerActions(order, refundRows.length > 0, Boolean(reviewRows[0]), refundableAmount) : [],
      seller_available_actions: !isBuyer ? sellerActions(order) : [],
      buyer: buyerRows[0] ?? { nickname: "买家", avatar_file_id: null },
      available_refund_amount_cent: refundableAmount > 0n ? refundableAmount : 0n,
      reservation: reservation[0] ? reservationView(reservation[0]) : null,
      payments: paymentRows.map(paymentView),
      refunds: refundRows.map((row) => ({ id: row.id, refund_no: row.refundNo, status: row.status, requested_amount_cent: row.requestedAmountCent, approved_amount_cent: row.approvedAmountCent, version: row.version, created_at: row.createdAt })),
      complaints: complaintRows.map((row) => ({ id: row.id, complaint_no: row.complaintNo, status: row.status, complaint_type: row.complaintType, version: row.version, created_at: row.createdAt })),
      review: reviewRows[0] ? { id: reviewRows[0].id, status: reviewRows[0].status, rating: reviewRows[0].rating, created_at: reviewRows[0].createdAt } : null,
      status_logs: logs.map((row) => ({ old_status: row.oldStatus, new_status: row.newStatus, action: row.action, remark: row.remark, created_at: row.createdAt })),
    };
  }

  async cancelOrder(userId: string, orderId: string, version: number, reason: string, metadata: RequestMetadata) {
    return this.transition(userId, orderId, "BUYER", "PENDING_PAYMENT", "CANCELLED", version, "CANCEL", reason, metadata, { cancelledAt: new Date(), cancelReason: reason, paymentStatus: "CLOSED" }, true);
  }
  async sellerAccept(userId: string, orderId: string, version: number, metadata: RequestMetadata) { return this.transition(userId, orderId, "SELLER", "PENDING_ACCEPT", "ACCEPTED", version, "ACCEPT", "陪玩确认接单", metadata, { acceptedAt: new Date() }); }
  async sellerReject(userId: string, orderId: string, version: number, reason: string, metadata: RequestMetadata) { return this.transition(userId, orderId, "SELLER", "PENDING_ACCEPT", "SELLER_REJECTED", version, "REJECT", reason, metadata, { sellerRejectReason: reason, closedAt: new Date() }, true); }
  async startService(userId: string, orderId: string, version: number, metadata: RequestMetadata) {
    const [order] = await this.database.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.sellerUserId !== userId) throw notFound("ORDER_NOT_FOUND", "订单不存在");
    if (order.status === "ACCEPTED" && order.version !== version) throw versionConflict();
    if (order.status === "ACCEPTED" && order.serviceStartsAt > new Date()) throw conflict("ORDER_SERVICE_NOT_STARTED", "预约时间未到，不能提前开始服务");
    return this.transition(userId, orderId, "SELLER", "ACCEPTED", "IN_SERVICE", version, "START_SERVICE", "陪玩开始服务", metadata, { serviceStartedAt: new Date() });
  }
  async completeService(userId: string, orderId: string, version: number, metadata: RequestMetadata) {
    const policy = await this.loadPolicy(); const now = new Date(); const autoConfirmAt = new Date(now.getTime() + policy.autoConfirmSeconds * 1000);
    return this.transition(userId, orderId, "SELLER", "IN_SERVICE", "PENDING_BUYER_CONFIRM", version, "SELLER_COMPLETE", "陪玩提交服务完成", metadata, { sellerCompletedAt: now, autoConfirmAt }, false, { jobKey: `order:${orderId}:auto-confirm`, jobType: ORDER_JOB_TYPES.AUTO_CONFIRM, runAt: autoConfirmAt });
  }
  async buyerConfirm(userId: string, orderId: string, version: number, metadata: RequestMetadata) { return this.transition(userId, orderId, "BUYER", "PENDING_BUYER_CONFIRM", "COMPLETED", version, "BUYER_CONFIRM", "买家确认服务完成", metadata, { completedAt: new Date() }, true); }

  private async transition(userId: string, orderId: string, role: "BUYER" | "SELLER", expected: typeof orders.$inferSelect.status, next: typeof orders.$inferSelect.status, version: number, action: string, remark: string, metadata: RequestMetadata, fields: Partial<typeof orders.$inferInsert>, release = false, schedule?: { jobKey: string; jobType: string; runAt: Date }) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
      if (!order || (role === "BUYER" ? order.buyerId !== userId : order.sellerUserId !== userId)) throw notFound("ORDER_NOT_FOUND", "订单不存在");
      if (order.afterSaleStatus === "IN_PROGRESS" || order.paymentStatus === "REFUNDING") throw conflict("ORDER_AFTER_SALE_ACTIVE", "售后处理中，正常履约与收货操作已暂停");
      if (order.status !== expected) throw invalidState(`订单状态 ${order.status} 不能执行 ${action}`);
      if (order.version !== version) throw versionConflict();
      const [updated] = await tx.update(orders).set({ ...fields, status: next, version: sql`${orders.version} + 1`, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, expected), eq(orders.version, version))).returning();
      if (!updated) throw versionConflict();
      if (release) await this.releaseReservation(tx, orderId);
      if (schedule) await this.jobs.schedule(tx, { ...schedule, targetType: "ORDER", targetId: orderId, payload: { order_id: orderId } });
      if (next === "CANCELLED") await tx.update(payments).set({ status: "CLOSED", closedAt: new Date(), version: sql`${payments.version} + 1`, updatedAt: new Date() }).where(and(eq(payments.orderId, orderId), inArray(payments.status, ["CREATED", "PAYING"])));
      if (next === "COMPLETED") await this.finance.recordOrderCompleted(tx, updated, metadata.traceId);
      await tx.insert(orderStatusLogs).values({ id: uuidv7(), orderId, oldStatus: expected, newStatus: next, operatorUserId: userId, operatorRole: role, action, remark, requestId: metadata.requestId });
      await this.outbox.enqueue(tx, { aggregateType: "ORDER", aggregateId: orderId, eventType: `Order${toPascal(action)}`, payload: { order_id: orderId, order_no: order.orderNo, old_status: expected, new_status: next }, traceId: metadata.traceId });
      return orderView(updated);
    });
  }

  private async releaseReservation(tx: DatabaseTransaction, orderId: string) {
    const [slot] = await tx.select().from(orderSlotReservations).where(eq(orderSlotReservations.orderId, orderId)).limit(1).for("update");
    if (!slot || !inStatus(slot.status, ["HELD", "CONFIRMED"])) return;
    const released = await tx.update(orderSlotReservations).set({ status: "RELEASED", releasedAt: new Date(), version: sql`${orderSlotReservations.version} + 1`, updatedAt: new Date() })
      .where(and(eq(orderSlotReservations.id, slot.id), eq(orderSlotReservations.status, slot.status), eq(orderSlotReservations.version, slot.version))).returning({ id: orderSlotReservations.id });
    if (!released[0]) throw versionConflict();
  }

  private async listOrders(role: "BUYER" | "SELLER", actorId: string, input: { cursor?: string; limit?: unknown; status?: typeof orders.$inferSelect.status; after_sale_status?: typeof orders.$inferSelect.afterSaleStatus }) {
    const limit = normalizePageSize(input.limit, 20); const scope = `orders:${role}:${actorId}:${input.status ?? "all"}:${input.after_sale_status ?? "all"}`; const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== scope) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "分页游标与当前订单筛选不匹配", statusCode: 400 });
    const rows = await this.database.db.select().from(orders).where(and(role === "BUYER" ? eq(orders.buyerId, actorId) : eq(orders.sellerId, actorId), role === "SELLER" ? ne(orders.status, "PENDING_PAYMENT") : undefined, input.status ? eq(orders.status, input.status) : undefined, input.after_sale_status ? eq(orders.afterSaleStatus, input.after_sale_status) : undefined, cursor ? or(lt(orders.createdAt, new Date(cursor.sort_value)), and(eq(orders.createdAt, new Date(cursor.sort_value)), lt(orders.id, cursor.id))) : undefined)).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1);
    const [reviewRows, buyerRows, refundRows] = await Promise.all([
      page.length ? this.database.db.select({ orderId: reviews.orderId }).from(reviews).where(inArray(reviews.orderId, page.map((row) => row.id))) : [],
      role === "SELLER" && page.length ? this.database.db.select({ user_id: userProfiles.userId, nickname: userProfiles.nickname, avatar_file_id: userProfiles.avatarFileId }).from(userProfiles).where(inArray(userProfiles.userId, page.map((row) => row.buyerId))) : [],
      page.length ? this.database.db.select({ orderId: refunds.orderId }).from(refunds).where(inArray(refunds.orderId, page.map(row => row.id))) : [],
    ]);
    const reviewed = new Set(reviewRows.map((row) => row.orderId));
    const refunded = new Set(refundRows.map(row => row.orderId));
    const buyers = new Map(buyerRows.map((row) => [row.user_id, row]));
    return { items: page.map((row) => ({ ...orderView(row), reviewed: reviewed.has(row.id), available_actions: role === "BUYER" ? buyerActions(row, refunded.has(row.id), reviewed.has(row.id), row.paidAmountCent - row.refundedAmountCent) : [], ...(role === "SELLER" ? { seller_available_actions: sellerActions(row), buyer: buyers.get(row.buyerId) ?? { nickname: "买家", avatar_file_id: null } } : {}) })), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope }, this.config.cursorSigningSecret) : null };
  }

  private async requirePaymentForUser(userId: string, paymentId: string) {
    const [row] = await this.database.db.select({ payment: payments, order: orders }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).where(and(eq(payments.id, paymentId), or(eq(orders.buyerId, userId), eq(orders.sellerUserId, userId)))).limit(1);
    if (!row) throw notFound("PAYMENT_NOT_FOUND", "支付单不存在"); return row.payment;
  }

  private async loadPurchaseContext(executor: Database | DatabaseTransaction, userId: string, input: OrderDraft, lock = false): Promise<PurchaseContext> {
    let productQuery = executor.select().from(products).where(eq(products.id, input.productId)).limit(1); if (lock) productQuery = productQuery.for("share") as typeof productQuery;
    const [product] = await productQuery; if (!product || product.status !== "ON_SALE" || product.deletedAt) throw conflict("ORDER_SERVICE_UNAVAILABLE", "服务不存在或已下架");
    const [seller] = await executor.select().from(sellerProfiles).where(eq(sellerProfiles.id, product.sellerId)).limit(1);
    if (!seller || seller.status !== "APPROVED" || !seller.acceptingOrders) throw conflict("ORDER_SELLER_UNAVAILABLE", "陪玩当前不可接单");
    if (seller.userId === userId) throw conflict("ORDER_PARTIES_SAME", "不能购买自己发布的服务");
    const [sku] = await executor.select().from(productSkus).where(and(eq(productSkus.id, input.skuId), eq(productSkus.productId, product.id))).limit(1);
    if (!sku || sku.status !== "ACTIVE" || sku.deletedAt) throw conflict("ORDER_SKU_UNAVAILABLE", "服务规格不存在或已停用");
    const serviceEndsAt = new Date(input.serviceStartsAt.getTime() + sku.durationMinutes * input.quantity * 60_000);
    if (input.serviceStartsAt <= new Date()) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "预约开始时间必须晚于当前时间", statusCode: 400 });
    const [slot] = await executor.select().from(sellerAvailabilitySlots).where(and(eq(sellerAvailabilitySlots.id, input.slotId), eq(sellerAvailabilitySlots.sellerId, seller.id), eq(sellerAvailabilitySlots.status, "OPEN"), lte(sellerAvailabilitySlots.startsAt, input.serviceStartsAt), gte(sellerAvailabilitySlots.endsAt, serviceEndsAt))).limit(1);
    if (!slot) throw conflict("ORDER_SLOT_UNAVAILABLE", "所选时间不在陪玩的可接单时段内");
    const [image] = await executor.select({ fileId: productImages.fileId }).from(productImages).where(and(eq(productImages.productId, product.id), isNull(productImages.deletedAt))).orderBy(desc(productImages.isCover), productImages.sortOrder).limit(1);
    return { product, seller, sku, slot, imageFileId: image?.fileId ?? product.coverFileId };
  }

  private async loadPolicy(executor: Database | DatabaseTransaction = this.database.db): Promise<Policy> {
    const keys = ["order.payment_timeout_seconds", "order.accept_timeout_seconds", "order.auto_confirm_seconds", "finance.commission_rate_bps"];
    const rows = await executor.select({ key: platformConfigs.configKey, value: platformConfigs.valueJson }).from(platformConfigs).where(and(inArray(platformConfigs.configKey, keys), eq(platformConfigs.status, "ACTIVE")));
    const values = new Map(rows.map((row) => [row.key, configInteger(row.value)]));
    if (keys.some((key) => values.get(key) === undefined)) throw new AppError({ code: "PLATFORM_CONFIG_MISSING", message: "订单或财务平台配置尚未启用", statusCode: 503 });
    const policy = { paymentTimeoutSeconds: values.get(keys[0]!)!, acceptTimeoutSeconds: values.get(keys[1]!)!, autoConfirmSeconds: values.get(keys[2]!)!, commissionRateBps: values.get(keys[3]!)! };
    if (policy.paymentTimeoutSeconds < 60 || policy.acceptTimeoutSeconds < 60 || policy.autoConfirmSeconds < 60 || policy.commissionRateBps < 0 || policy.commissionRateBps > 10_000) throw new AppError({ code: "PLATFORM_CONFIG_INVALID", message: "订单或财务平台配置无效", statusCode: 503 });
    return policy;
  }
}

function previewView(context: PurchaseContext, policy: Policy, quantity: number, serviceStartsAt: Date) {
  const total = context.sku.priceCent * BigInt(quantity); const platformFee = total * BigInt(policy.commissionRateBps) / 10_000n;
  const serviceEndsAt = new Date(serviceStartsAt.getTime() + context.sku.durationMinutes * quantity * 60_000);
  return { product_id: context.product.id, product_title: context.product.title, product_image_file_id: context.imageFileId, seller_id: context.seller.id, seller_name: context.seller.sellerNickname, sku_id: context.sku.id, sku_name: context.sku.skuName, sku_price_cent: context.sku.priceCent, sku_duration_minutes: context.sku.durationMinutes, quantity, total_amount_cent: total, discount_cent: 0n, payable_amount_cent: total, commission_rate_bps: policy.commissionRateBps, platform_fee_cent: platformFee, seller_income_cent: total - platformFee, service_starts_at: serviceStartsAt, service_ends_at: serviceEndsAt };
}

function orderView(row: typeof orders.$inferSelect) { return { id: row.id, order_no: row.orderNo, buyer_id: row.buyerId, seller_user_id: row.sellerUserId, seller_id: row.sellerId, product_id: row.productId, sku_id: row.skuId, transaction_policy_version_id: row.transactionPolicyVersionId, refund_policy_version_id: row.refundPolicyVersionId, rule_version: row.ruleVersion, review_deadline_at: row.ruleVersion === "V3.1" && row.completedAt ? new Date(row.completedAt.getTime() + 7 * 24 * 3600000) : null, product_title: row.productTitleSnapshot, product_image: row.productImageSnapshot, product_description: row.productDescriptionSnapshot, seller_name: row.sellerNameSnapshot, seller_avatar: row.sellerAvatarSnapshot, sku_name: row.skuNameSnapshot, sku_description: row.skuDescriptionSnapshot, sku_price_cent: row.skuPriceCentSnapshot, sku_duration_minutes: row.skuDurationMinutesSnapshot, quantity: row.quantity, total_amount_cent: row.totalAmountCent, discount_cent: row.discountCent, payable_amount_cent: row.payableAmountCent, paid_amount_cent: row.paidAmountCent, refunded_amount_cent: row.refundedAmountCent, commission_rate_bps: row.commissionRateBpsSnapshot, platform_fee_cent: row.platformFeeCent, seller_income_cent: row.sellerIncomeCent, service_starts_at: row.serviceStartsAt, service_ends_at: row.serviceEndsAt, buyer_note: row.buyerNote, status: row.status, payment_status: row.paymentStatus, after_sale_status: row.afterSaleStatus, expires_at: row.expiresAt, auto_confirm_at: row.autoConfirmAt, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function paymentView(row: typeof payments.$inferSelect) { return { id: row.id, payment_no: row.paymentNo, order_id: row.orderId, channel: row.channel, amount_cent: row.amountCent, currency: row.currency, status: row.status, provider_transaction_id: row.providerTransactionId, paid_at: row.paidAt, closed_at: row.closedAt, version: row.version, created_at: row.createdAt }; }
function replayClientPayload(provider: PaymentProvider, row: typeof payments.$inferSelect) { return { mode: provider.mode, payment_channel: row.channel, payment_no: row.paymentNo }; }
function reservationView(row: typeof orderSlotReservations.$inferSelect) { return { id: row.id, slot_id: row.slotId, starts_at: row.startsAt, ends_at: row.endsAt, status: row.status, expires_at: row.expiresAt, released_at: row.releasedAt, version: row.version }; }
function buyerActions(order: typeof orders.$inferSelect, hasRefund: boolean, hasReview: boolean, refundableAmount: bigint): BuyerOrderAction[] {
  const actions: BuyerOrderAction[] = ["VIEW_SERVICE"];
  if (order.status === "PENDING_PAYMENT" && order.expiresAt > new Date() && ["CREATED", "FAILED"].includes(order.paymentStatus)) actions.push("PAY", "CANCEL");
  if (order.status === "PENDING_BUYER_CONFIRM" && order.afterSaleStatus !== "IN_PROGRESS" && order.paymentStatus !== "REFUNDING") actions.push("CONFIRM_COMPLETE");
  const paidServiceState = ["PENDING_ACCEPT", "ACCEPTED", "IN_SERVICE", "PENDING_BUYER_CONFIRM", "COMPLETED", "SELLER_REJECTED", "CLOSED"].includes(order.status);
  if (hasRefund) actions.push("VIEW_REFUND"); else if (paidServiceState && !(order.ruleVersion === "V3.1" && order.completedAt) && refundableAmount > 0n && order.afterSaleStatus !== "IN_PROGRESS") actions.push("REQUEST_REFUND");
  if (paidServiceState) actions.push("CREATE_COMPLAINT");
  if (order.status === "COMPLETED" && (hasReview || order.ruleVersion !== "V3.1" || order.completedAt && Date.now() < order.completedAt.getTime() + 7 * 24 * 3600000)) actions.push(hasReview ? "VIEW_REVIEW" : "CREATE_REVIEW");
  return actions;
}
function sellerActions(order: typeof orders.$inferSelect) {
  const actions: ("ACCEPT" | "REJECT" | "START" | "COMPLETE" | "PROCESS_REFUND" | "CONTACT_BUYER")[] = ["CONTACT_BUYER"];
  if (order.afterSaleStatus === "IN_PROGRESS" || order.paymentStatus === "REFUNDING") { actions.push("PROCESS_REFUND"); return actions; }
  if (order.status === "PENDING_ACCEPT") actions.push("ACCEPT", "REJECT");
  if (order.status === "ACCEPTED" && order.serviceStartsAt <= new Date()) actions.push("START");
  if (order.status === "IN_SERVICE") actions.push("COMPLETE");
  return actions;
}
function externalNo(prefix: string) { const date = new Date().toISOString().slice(0, 10).replaceAll("-", ""); return `${prefix}${date}${randomBytes(8).toString("hex").toUpperCase()}`; }
function configInteger(value: unknown): number | undefined { if (typeof value !== "object" || value === null || !("value" in value)) return undefined; const parsed = Number((value as { value: unknown }).value); return Number.isSafeInteger(parsed) ? parsed : undefined; }
function inStatus<T extends string>(value: string, allowed: readonly T[]): value is T { return allowed.includes(value as T); }
function toPascal(value: string) { return value.toLowerCase().split("_").map((item) => item[0]!.toUpperCase() + item.slice(1)).join(""); }
function isPgCode(value: unknown, code: string): boolean {
  if (typeof value !== "object" || value === null) return false;
  if ("code" in value && (value as { code?: unknown }).code === code) return true;
  return "cause" in value && isPgCode((value as { cause?: unknown }).cause, code);
}
function notFound(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 404 }); }
function conflict(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function invalidState(message: string) { return new AppError({ code: "ORDER_STATE_INVALID", message, statusCode: 409 }); }
function versionConflict() { return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: "订单或支付状态已更新，请刷新后重试", statusCode: 409 }); }
