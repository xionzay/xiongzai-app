import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { OutboxService } from "@xiongzai/application";
import { AppError, decodeCursor, encodeCursor, errorCodes, normalizePageSize } from "@xiongzai/contracts";
import {
  adminAccounts, adminOperationLogs, conversationMembers, conversations, deliveryLogs, messages, notifications, orders,
  products, sellerProfiles, supportCaseLogs, supportCases, uuidv7,
  type DatabaseClient, type DatabaseTransaction,
} from "@xiongzai/database";
import { and, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { API_CONFIG, DATABASE_CLIENT } from "./tokens.js";

type RelatedType = "ORDER" | "PAYMENT" | "REFUND" | "COMPLAINT" | "WITHDRAWAL";
type SupportPriority = typeof supportCases.$inferInsert.priority;

@Injectable()
export class ChatSupportNotificationService {
  private readonly outbox = new OutboxService();

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async createConsultation(userId: string, productId: string, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [target] = await tx.select({ product: products, seller: sellerProfiles }).from(products).innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
        .where(and(eq(products.id, productId), eq(products.status, "ON_SALE"), isNull(products.deletedAt), eq(sellerProfiles.status, "APPROVED"))).limit(1);
      if (!target) throw notFound("PRODUCT_NOT_FOUND", "咨询的服务不存在或已下架");
      if (target.seller.userId === userId) throw conflict("CONVERSATION_PARTIES_SAME", "不能咨询自己发布的服务");
      const conversation = await this.createConversation(tx, "CONSULTATION", { productId });
      await tx.insert(conversationMembers).values([
        { conversationId: conversation.id, userId, role: "USER" },
        { conversationId: conversation.id, userId: target.seller.userId, role: "SELLER" },
      ]);
      await this.appendSystemMessage(tx, conversation.id, "咨询会话已创建，请仅在平台内沟通并交易");
      await this.outbox.enqueue(tx, { aggregateType: "CONVERSATION", aggregateId: conversation.id, eventType: "ConsultationConversationCreated", payload: { conversation_id: conversation.id, product_id: productId }, traceId: metadata.traceId });
      return conversationView(conversation, 0, "USER");
    });
  }

  async createOrderConversation(userId: string, orderId: string, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
      if (!order || ![order.buyerId, order.sellerUserId].includes(userId)) throw notFound("ORDER_NOT_FOUND", "订单不存在");
      const inserted = await tx.insert(conversations).values({ id: uuidv7(), conversationNo: externalNo("CV"), conversationType: "ORDER", orderId }).onConflictDoNothing().returning();
      if (!inserted[0]) {
        const [existing] = await tx.select().from(conversations).where(and(eq(conversations.orderId, orderId), eq(conversations.conversationType, "ORDER"))).limit(1);
        if (!existing) throw new Error("Order conversation conflict could not be resolved.");
        const [member] = await tx.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, existing.id), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt))).limit(1);
        if (!member) throw forbidden("CONVERSATION_ACCESS_DENIED", "你不是该会话成员");
        return conversationView(existing, member.unreadCount, member.role);
      }
      const conversation = inserted[0];
      await tx.insert(conversationMembers).values([
        { conversationId: conversation.id, userId: order.buyerId, role: "BUYER" },
        { conversationId: conversation.id, userId: order.sellerUserId, role: "SELLER" },
      ]);
      await this.appendSystemMessage(tx, conversation.id, `订单 ${order.orderNo} 沟通会话已创建`);
      await this.outbox.enqueue(tx, { aggregateType: "CONVERSATION", aggregateId: conversation.id, eventType: "OrderConversationCreated", payload: { conversation_id: conversation.id, order_id: orderId }, traceId: metadata.traceId });
      return conversationView(conversation, 0, userId === order.buyerId ? "BUYER" : "SELLER");
    });
  }

  async listUserConversations(userId: string, input: { cursor?: string; limit?: unknown }) {
    const limit = normalizePageSize(input.limit, 20); const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const rows = await this.database.db.select({ conversation: conversations, member: conversationMembers }).from(conversationMembers).innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId)).where(and(
      eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt),
      cursor ? or(lt(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`, new Date(cursor.sort_value)), and(eq(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`, new Date(cursor.sort_value)), lt(conversations.id, cursor.id))) : undefined,
    )).orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`), desc(conversations.id)).limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1); const lastTime = last ? last.conversation.lastMessageAt ?? last.conversation.createdAt : null;
    return { items: page.map((row) => conversationView(row.conversation, row.member.unreadCount, row.member.role)), next_cursor: rows.length > limit && last && lastTime ? encodeCursor({ sort_value: lastTime.toISOString(), id: last.conversation.id }, this.config.cursorSigningSecret) : null };
  }

  async listUserMessages(userId: string, conversationId: string, input: { cursor?: string; limit?: unknown }) {
    await this.requireUserMember(this.database.db, userId, conversationId);
    return this.listMessages(conversationId, input);
  }

  async sendUserMessage(userId: string, conversationId: string, input: { clientMessageId: string; content: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const member = await this.requireUserMember(tx, userId, conversationId);
      if (member.role === "ADMIN" || member.role === "SYSTEM") throw forbidden("CONVERSATION_ACCESS_DENIED", "当前成员角色不能发送用户消息");
      const [support] = await tx.select({ status: supportCases.status }).from(supportCases).where(eq(supportCases.conversationId, conversationId)).limit(1);
      if (support?.status === "CLOSED") throw conflict("SUPPORT_CASE_CLOSED", "客服工单已结束，请先重新打开");
      return this.appendMessage(tx, conversationId, { senderUserId: userId, senderRole: member.role, clientMessageId: input.clientMessageId, content: input.content }, metadata);
    });
  }

  async markUserRead(userId: string, conversationId: string, lastReadSequenceNo: bigint) {
    return this.database.db.transaction(async (tx) => {
      const member = await this.requireUserMember(tx, userId, conversationId, true);
      const [conversation] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1).for("update");
      if (!conversation) throw notFound("CONVERSATION_NOT_FOUND", "会话不存在");
      const [last] = await tx.select({ sequenceNo: messages.sequenceNo }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.sequenceNo)).limit(1);
      const upper = last?.sequenceNo ?? BigInt(0); if (lastReadSequenceNo > upper) throw validation("last_read_sequence_no", "已读序号不能超过会话最后消息");
      const target = lastReadSequenceNo > member.lastReadSequenceNo ? lastReadSequenceNo : member.lastReadSequenceNo;
      const [countRow] = await tx.select({ count: sql<number>`count(*)::integer` }).from(messages).where(and(eq(messages.conversationId, conversationId), gt(messages.sequenceNo, target), or(isNull(messages.senderUserId), ne(messages.senderUserId, userId))));
      await tx.update(conversationMembers).set({ lastReadSequenceNo: target, unreadCount: countRow?.count ?? 0 }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
      return { conversation_id: conversationId, last_read_sequence_no: target, unread_count: countRow?.count ?? 0 };
    });
  }

  async createSupportCase(userId: string, input: { topic: string; priority: SupportPriority; queueKey: string; relatedType?: RelatedType; relatedId?: string; sourcePage?: string; initialMessage: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      if (input.relatedType === "ORDER" && input.relatedId) {
        const [order] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.id, input.relatedId), or(eq(orders.buyerId, userId), eq(orders.sellerUserId, userId)))).limit(1);
        if (!order) throw notFound("ORDER_NOT_FOUND", "关联订单不存在");
      } else if ((input.relatedType === undefined) !== (input.relatedId === undefined)) throw validation("related_id", "关联业务类型和编号必须同时填写");
      const conversation = await this.createConversation(tx, "SUPPORT", {});
      await tx.insert(conversationMembers).values({ conversationId: conversation.id, userId, role: "USER" });
      const [supportCase] = await tx.insert(supportCases).values({ id: uuidv7(), caseNo: externalNo("SC"), requesterId: userId, conversationId: conversation.id, topic: input.topic, priority: input.priority, queueKey: input.queueKey, relatedType: input.relatedType, relatedId: input.relatedId, sourcePage: input.sourcePage }).returning();
      await tx.insert(supportCaseLogs).values({ id: uuidv7(), supportCaseId: supportCase!.id, action: "CREATED", oldStatus: null, newStatus: "WAITING", newQueueKey: input.queueKey, operatorUserId: userId, reason: input.topic, requestId: metadata.requestId });
      await this.appendSystemMessage(tx, conversation.id, `客服工单 ${supportCase!.caseNo} 已创建，正在排队等待接入`);
      await this.appendMessage(tx, conversation.id, { senderUserId: userId, senderRole: "USER", clientMessageId: `support-initial-${supportCase!.id}`, content: input.initialMessage }, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "SUPPORT_CASE", aggregateId: supportCase!.id, eventType: "SupportCaseCreated", payload: { support_case_id: supportCase!.id, case_no: supportCase!.caseNo, queue_key: input.queueKey, priority: input.priority }, traceId: metadata.traceId });
      return supportCaseView(supportCase!);
    });
  }

  async listUserSupportCases(userId: string) {
    const rows = await this.database.db.select().from(supportCases).where(eq(supportCases.requesterId, userId)).orderBy(desc(supportCases.createdAt)).limit(100);
    return rows.map(supportCaseView);
  }

  async getUserSupportCase(userId: string, caseId: string) {
    const [row] = await this.database.db.select().from(supportCases).where(and(eq(supportCases.id, caseId), eq(supportCases.requesterId, userId))).limit(1);
    if (!row) throw notFound("SUPPORT_CASE_NOT_FOUND", "客服工单不存在");
    return this.supportCaseDetail(row);
  }

  async reopenUserSupportCase(userId: string, caseId: string, version: number, reason: string, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx.select().from(supportCases).where(and(eq(supportCases.id, caseId), eq(supportCases.requesterId, userId))).limit(1).for("update");
      if (!row) throw notFound("SUPPORT_CASE_NOT_FOUND", "客服工单不存在");
      if (row.status !== "CLOSED") throw conflict("SUPPORT_STATE_INVALID", "只有已结束的客服工单可以重新打开");
      if (row.version !== version) throw versionConflict();
      const [updated] = await tx.update(supportCases).set({ status: "WAITING", assignedAdminId: null, closedAt: null, closeReason: null, version: sql`${supportCases.version} + 1`, updatedAt: new Date() }).where(and(eq(supportCases.id, caseId), eq(supportCases.status, "CLOSED"), eq(supportCases.version, version))).returning();
      if (!updated) throw versionConflict();
      await tx.insert(supportCaseLogs).values({ id: uuidv7(), supportCaseId: caseId, action: "REOPENED", oldStatus: "CLOSED", newStatus: "WAITING", oldQueueKey: row.queueKey, newQueueKey: row.queueKey, operatorUserId: userId, reason, requestId: metadata.requestId });
      await this.appendSystemMessage(tx, row.conversationId, `用户重新打开客服工单：${reason}`);
      await this.outbox.enqueue(tx, { aggregateType: "SUPPORT_CASE", aggregateId: caseId, eventType: "SupportCaseReopened", payload: { support_case_id: caseId }, traceId: metadata.traceId });
      return supportCaseView(updated);
    });
  }

  async listAdminSupportCases(input: { status?: typeof supportCases.$inferSelect.status; queueKey?: string; limit?: unknown }) {
    const limit = normalizePageSize(input.limit, 50);
    const rows = await this.database.db.select().from(supportCases).where(and(input.status ? eq(supportCases.status, input.status) : undefined, input.queueKey ? eq(supportCases.queueKey, input.queueKey) : undefined)).orderBy(desc(supportCases.priority), desc(supportCases.createdAt)).limit(limit);
    return rows.map(supportCaseView);
  }

  async getAdminSupportCase(caseId: string) {
    const [row] = await this.database.db.select().from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
    if (!row) throw notFound("SUPPORT_CASE_NOT_FOUND", "客服工单不存在");
    return this.supportCaseDetail(row);
  }

  async receiveSupportCase(adminId: string, caseId: string, version: number, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockSupportCase(tx, caseId);
      if (!inStatus(row.status, ["WAITING", "TRANSFERRED"])) throw conflict("SUPPORT_STATE_INVALID", "客服工单已被其他客服接入或已结束");
      if (row.version !== version) throw versionConflict();
      const now = new Date(); const [updated] = await tx.update(supportCases).set({ status: "SERVING", assignedAdminId: adminId, version: sql`${supportCases.version} + 1`, updatedAt: now }).where(and(eq(supportCases.id, caseId), eq(supportCases.status, row.status), eq(supportCases.version, version))).returning();
      if (!updated) throw versionConflict();
      await this.activateAdminMember(tx, row.conversationId, adminId);
      await tx.insert(supportCaseLogs).values({ id: uuidv7(), supportCaseId: caseId, action: "RECEIVED", oldStatus: row.status, newStatus: "SERVING", oldQueueKey: row.queueKey, newQueueKey: row.queueKey, operatorAdminId: adminId, reason: "客服接入工单", requestId: metadata.requestId });
      await this.appendSystemMessage(tx, row.conversationId, "人工客服已接入会话");
      await this.audit(tx, adminId, "SUPPORT_CASE_RECEIVE", "SUPPORT_CASE", caseId, "接入客服工单", row, updated, metadata);
      return supportCaseView(updated);
    });
  }

  async transferSupportCase(adminId: string, caseId: string, input: { version: number; queueKey: string; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockSupportCase(tx, caseId);
      if (row.status !== "SERVING" || row.assignedAdminId !== adminId) throw conflict("SUPPORT_STATE_INVALID", "只有当前接入客服可以转交工单");
      if (row.version !== input.version) throw versionConflict();
      const [updated] = await tx.update(supportCases).set({ status: "TRANSFERRED", queueKey: input.queueKey, assignedAdminId: null, version: sql`${supportCases.version} + 1`, updatedAt: new Date() }).where(and(eq(supportCases.id, caseId), eq(supportCases.status, "SERVING"), eq(supportCases.assignedAdminId, adminId), eq(supportCases.version, input.version))).returning();
      if (!updated) throw versionConflict();
      await tx.update(conversationMembers).set({ leftAt: new Date() }).where(and(eq(conversationMembers.conversationId, row.conversationId), eq(conversationMembers.adminId, adminId), isNull(conversationMembers.leftAt)));
      await tx.insert(supportCaseLogs).values({ id: uuidv7(), supportCaseId: caseId, action: "TRANSFERRED", oldStatus: "SERVING", newStatus: "TRANSFERRED", oldQueueKey: row.queueKey, newQueueKey: input.queueKey, operatorAdminId: adminId, reason: input.reason, requestId: metadata.requestId });
      await this.appendSystemMessage(tx, row.conversationId, `客服工单已转交至 ${input.queueKey}：${input.reason}`);
      await this.audit(tx, adminId, "SUPPORT_CASE_TRANSFER", "SUPPORT_CASE", caseId, input.reason, row, updated, metadata);
      return supportCaseView(updated);
    });
  }

  async replySupportCase(adminId: string, caseId: string, input: { clientMessageId: string; content: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockSupportCase(tx, caseId);
      if (row.status !== "SERVING" || row.assignedAdminId !== adminId) throw conflict("SUPPORT_STATE_INVALID", "只有当前接入客服可以回复");
      const [existing] = await tx.select().from(messages).where(and(eq(messages.senderAdminId, adminId), eq(messages.clientMessageId, input.clientMessageId))).limit(1);
      if (existing) {
        if (existing.conversationId !== row.conversationId || existing.content !== input.content) throw conflict("MESSAGE_IDEMPOTENCY_CONFLICT", "client_message_id 已用于其他消息");
        return { message: messageView(existing), first_response_at: row.firstResponseAt, support_case_version: row.version, duplicate: true };
      }
      const message = await this.appendMessage(tx, row.conversationId, { senderAdminId: adminId, senderRole: "ADMIN", clientMessageId: input.clientMessageId, content: input.content }, metadata);
      const firstResponseAt = row.firstResponseAt ?? new Date();
      await tx.update(supportCases).set({ firstResponseAt, version: sql`${supportCases.version} + 1`, updatedAt: new Date() }).where(and(eq(supportCases.id, caseId), eq(supportCases.status, "SERVING"), eq(supportCases.assignedAdminId, adminId), eq(supportCases.version, row.version)));
      await tx.insert(supportCaseLogs).values({ id: uuidv7(), supportCaseId: caseId, action: "REPLIED", oldStatus: "SERVING", newStatus: "SERVING", oldQueueKey: row.queueKey, newQueueKey: row.queueKey, operatorAdminId: adminId, reason: "客服回复用户", requestId: metadata.requestId });
      await this.audit(tx, adminId, "SUPPORT_CASE_REPLY", "SUPPORT_CASE", caseId, "客服回复用户", { version: row.version }, { message_id: message.id, first_response_at: firstResponseAt }, metadata);
      return { message, first_response_at: firstResponseAt, support_case_version: row.version + 1, duplicate: false };
    });
  }

  async closeSupportCase(adminId: string, caseId: string, version: number, reason: string, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const row = await this.lockSupportCase(tx, caseId);
      if (row.status !== "SERVING" || row.assignedAdminId !== adminId) throw conflict("SUPPORT_STATE_INVALID", "只有当前接入客服可以结束工单");
      if (row.version !== version) throw versionConflict();
      const now = new Date(); const [updated] = await tx.update(supportCases).set({ status: "CLOSED", closedAt: now, closeReason: reason, version: sql`${supportCases.version} + 1`, updatedAt: now }).where(and(eq(supportCases.id, caseId), eq(supportCases.status, "SERVING"), eq(supportCases.assignedAdminId, adminId), eq(supportCases.version, version))).returning();
      if (!updated) throw versionConflict();
      await tx.insert(supportCaseLogs).values({ id: uuidv7(), supportCaseId: caseId, action: "CLOSED", oldStatus: "SERVING", newStatus: "CLOSED", oldQueueKey: row.queueKey, newQueueKey: row.queueKey, operatorAdminId: adminId, reason, requestId: metadata.requestId });
      await this.appendSystemMessage(tx, row.conversationId, `客服会话已结束：${reason}`);
      await this.audit(tx, adminId, "SUPPORT_CASE_CLOSE", "SUPPORT_CASE", caseId, reason, row, updated, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "SUPPORT_CASE", aggregateId: caseId, eventType: "SupportCaseClosed", payload: { support_case_id: caseId, close_reason: reason }, traceId: metadata.traceId });
      return supportCaseView(updated);
    });
  }

  async listAdminSupportMessages(adminId: string, caseId: string, input: { cursor?: string; limit?: unknown }) {
    const [row] = await this.database.db.select().from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
    if (!row) throw notFound("SUPPORT_CASE_NOT_FOUND", "客服工单不存在");
    if (row.assignedAdminId !== adminId) throw forbidden("SUPPORT_ACCESS_DENIED", "只有当前客服可以查看工单消息");
    return this.listMessages(row.conversationId, input);
  }

  async auditOrderConversationView(adminId: string, conversationId: string, reason: string, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.conversationType, "ORDER"))).limit(1);
      if (!conversation) throw notFound("ORDER_CONVERSATION_NOT_FOUND", "订单会话不存在");
      await this.audit(tx, adminId, "ORDER_CHAT_EVIDENCE_VIEW", "CONVERSATION", conversationId, reason, null, { order_id: conversation.orderId }, metadata);
      const rows = await tx.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.sequenceNo).limit(500);
      return { conversation: conversationView(conversation, 0, "ADMIN"), messages: rows.map(messageView), evidence_reason: reason };
    });
  }

  async listOrderConversations(limit: number) {
    const rows = await this.database.db.select({ conversation: conversations, orderNo: orders.orderNo, buyerId: orders.buyerId, sellerName: orders.sellerNameSnapshot })
      .from(conversations).innerJoin(orders, eq(orders.id, conversations.orderId))
      .where(eq(conversations.conversationType, "ORDER")).orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt)).limit(Math.min(100, Math.max(1, limit)));
    return rows.map((row) => ({ ...conversationView(row.conversation, 0, "ADMIN"), order_no: row.orderNo, buyer_id: row.buyerId, seller_name: row.sellerName }));
  }

  async listNotifications(userId: string, input: { category?: typeof notifications.$inferSelect.category; cursor?: string; limit?: unknown }) {
    const limit = normalizePageSize(input.limit, 20); const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const rows = await this.database.db.select().from(notifications).where(and(eq(notifications.userId, userId), input.category ? eq(notifications.category, input.category) : undefined, cursor ? or(lt(notifications.createdAt, new Date(cursor.sort_value)), and(eq(notifications.createdAt, new Date(cursor.sort_value)), lt(notifications.id, cursor.id))) : undefined)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1);
    return { items: page.map(notificationView), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id }, this.config.cursorSigningSecret) : null };
  }

  async getNotification(userId: string, notificationId: string) {
    const [row] = await this.database.db.select().from(notifications).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId))).limit(1);
    if (!row) throw notFound("NOTIFICATION_NOT_FOUND", "通知不存在"); return notificationView(row);
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const [row] = await this.database.db.update(notifications).set({ readStatus: "READ", readAt: sql`coalesce(${notifications.readAt}, now())` }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId))).returning();
    if (!row) throw notFound("NOTIFICATION_NOT_FOUND", "通知不存在"); return notificationView(row);
  }

  async markAllNotificationsRead(userId: string) {
    const rows = await this.database.db.update(notifications).set({ readStatus: "READ", readAt: new Date() }).where(and(eq(notifications.userId, userId), eq(notifications.readStatus, "UNREAD"))).returning({ id: notifications.id });
    return { updated_count: rows.length };
  }

  private async listMessages(conversationId: string, input: { cursor?: string; limit?: unknown }) {
    const limit = normalizePageSize(input.limit, 50); const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const rows = await this.database.db.select().from(messages).where(and(eq(messages.conversationId, conversationId), cursor ? lt(messages.sequenceNo, BigInt(cursor.sort_value)) : undefined)).orderBy(desc(messages.sequenceNo)).limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1);
    return { items: page.map(messageView), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.sequenceNo.toString(), id: last.id }, this.config.cursorSigningSecret) : null };
  }

  private async appendMessage(tx: DatabaseTransaction, conversationId: string, input: { senderUserId?: string; senderAdminId?: string; senderRole: typeof messages.$inferInsert.senderRole; clientMessageId: string; content: string }, metadata: RequestMetadata) {
    const [conversation] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1).for("update");
    if (!conversation) throw notFound("CONVERSATION_NOT_FOUND", "会话不存在");
    const existingCondition = input.senderUserId ? and(eq(messages.senderUserId, input.senderUserId), eq(messages.clientMessageId, input.clientMessageId)) : and(eq(messages.senderAdminId, input.senderAdminId!), eq(messages.clientMessageId, input.clientMessageId));
    const [existing] = await tx.select().from(messages).where(existingCondition).limit(1);
    if (existing) {
      if (existing.conversationId !== conversationId || existing.content !== input.content) throw conflict("MESSAGE_IDEMPOTENCY_CONFLICT", "client_message_id 已用于其他消息");
      return messageView(existing);
    }
    const [last] = await tx.select({ sequenceNo: messages.sequenceNo }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.sequenceNo)).limit(1);
    const sequenceNo = (last?.sequenceNo ?? BigInt(0)) + BigInt(1); const now = new Date();
    const [message] = await tx.insert(messages).values({ id: uuidv7(), conversationId, clientMessageId: input.clientMessageId, sequenceNo, senderUserId: input.senderUserId, senderAdminId: input.senderAdminId, senderRole: input.senderRole, messageType: "TEXT", content: input.content, moderationStatus: "PENDING" }).returning();
    const preview = input.content.slice(0, 200);
    await tx.update(conversations).set({ lastMessageId: message!.id, lastMessagePreview: preview, lastMessageAt: now, version: sql`${conversations.version} + 1`, updatedAt: now }).where(and(eq(conversations.id, conversationId), eq(conversations.version, conversation.version)));
    await tx.update(conversationMembers).set({ unreadCount: sql`${conversationMembers.unreadCount} + 1` }).where(and(eq(conversationMembers.conversationId, conversationId), isNull(conversationMembers.leftAt), input.senderUserId ? or(isNull(conversationMembers.userId), ne(conversationMembers.userId, input.senderUserId)) : or(isNull(conversationMembers.adminId), ne(conversationMembers.adminId, input.senderAdminId!))));
    if (input.senderUserId) await tx.update(conversationMembers).set({ lastReadSequenceNo: sequenceNo, unreadCount: 0 }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, input.senderUserId)));
    if (input.senderAdminId) await tx.update(conversationMembers).set({ lastReadSequenceNo: sequenceNo, unreadCount: 0 }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.adminId, input.senderAdminId)));
    const recipients = await tx.select({ userId: conversationMembers.userId }).from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), isNull(conversationMembers.leftAt), isNull(conversationMembers.adminId), input.senderUserId ? ne(conversationMembers.userId, input.senderUserId) : undefined));
    for (const recipient of recipients) if (recipient.userId) await this.createNotification(tx, { userId: recipient.userId, category: conversation.conversationType === "ORDER" ? "ORDER" : "PLATFORM", notificationType: "CHAT_MESSAGE", title: conversation.conversationType === "SUPPORT" ? "平台客服回复了你" : "你收到一条新消息", contentTemplateId: "chat.message", variables: { content: preview, conversation_id: conversationId }, relatedType: "CONVERSATION", relatedId: conversationId, idempotencyKey: `message:${message!.id}:user:${recipient.userId}` });
    await this.outbox.enqueue(tx, { aggregateType: "CONVERSATION", aggregateId: conversationId, eventType: "MessageSent", payload: { conversation_id: conversationId, message_id: message!.id, sequence_no: sequenceNo, sender_role: input.senderRole }, traceId: metadata.traceId });
    return messageView(message!);
  }

  private async appendSystemMessage(tx: DatabaseTransaction, conversationId: string, content: string) {
    const [conversation] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1).for("update");
    if (!conversation) throw notFound("CONVERSATION_NOT_FOUND", "会话不存在");
    const [last] = await tx.select({ sequenceNo: messages.sequenceNo }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.sequenceNo)).limit(1);
    const sequenceNo = (last?.sequenceNo ?? BigInt(0)) + BigInt(1); const now = new Date();
    const [message] = await tx.insert(messages).values({ id: uuidv7(), conversationId, clientMessageId: `system-${uuidv7()}`, sequenceNo, senderRole: "SYSTEM", messageType: "SYSTEM", content, moderationStatus: "APPROVED" }).returning();
    await tx.update(conversations).set({ lastMessageId: message!.id, lastMessagePreview: content.slice(0, 200), lastMessageAt: now, version: sql`${conversations.version} + 1`, updatedAt: now }).where(and(eq(conversations.id, conversationId), eq(conversations.version, conversation.version)));
    await tx.update(conversationMembers).set({ unreadCount: sql`${conversationMembers.unreadCount} + 1` }).where(and(eq(conversationMembers.conversationId, conversationId), isNull(conversationMembers.leftAt)));
    return message!;
  }

  private async requireUserMember(executor: DatabaseClient["db"] | DatabaseTransaction, userId: string, conversationId: string, lock = false) {
    let query = executor.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt))).limit(1);
    if (lock) query = query.for("update") as typeof query;
    const [member] = await query; if (!member) throw forbidden("CONVERSATION_ACCESS_DENIED", "你不是该会话成员"); return member;
  }

  private async createConversation(tx: DatabaseTransaction, type: typeof conversations.$inferInsert.conversationType, related: { productId?: string; orderId?: string }) {
    const [row] = await tx.insert(conversations).values({ id: uuidv7(), conversationNo: externalNo("CV"), conversationType: type, ...related }).returning(); return row!;
  }

  private async lockSupportCase(tx: DatabaseTransaction, caseId: string) {
    const [row] = await tx.select().from(supportCases).where(eq(supportCases.id, caseId)).limit(1).for("update"); if (!row) throw notFound("SUPPORT_CASE_NOT_FOUND", "客服工单不存在"); return row;
  }

  private async activateAdminMember(tx: DatabaseTransaction, conversationId: string, adminId: string) {
    const [existing] = await tx.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.adminId, adminId))).limit(1);
    if (existing) await tx.update(conversationMembers).set({ role: "ADMIN", leftAt: null, unreadCount: 0 }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.adminId, adminId)));
    else await tx.insert(conversationMembers).values({ conversationId, adminId, role: "ADMIN" });
  }

  private async supportCaseDetail(row: typeof supportCases.$inferSelect) {
    const [logs, assigned] = await Promise.all([
      this.database.db.select().from(supportCaseLogs).where(eq(supportCaseLogs.supportCaseId, row.id)).orderBy(supportCaseLogs.createdAt),
      row.assignedAdminId ? this.database.db.select({ id: adminAccounts.id, displayName: adminAccounts.displayName }).from(adminAccounts).where(eq(adminAccounts.id, row.assignedAdminId)).limit(1) : Promise.resolve([]),
    ]);
    return { ...supportCaseView(row), assigned_admin: assigned[0] ? { id: assigned[0].id, display_name: assigned[0].displayName } : null, logs: logs.map(supportLogView) };
  }

  private async createNotification(tx: DatabaseTransaction, input: { userId: string; category: typeof notifications.$inferInsert.category; notificationType: string; title: string; contentTemplateId: string; variables: Record<string, unknown>; relatedType: typeof notifications.$inferInsert.relatedType; relatedId: string; idempotencyKey: string }) {
    const [notification] = await tx.insert(notifications).values({ id: uuidv7(), userId: input.userId, category: input.category, notificationType: input.notificationType, title: input.title, contentTemplateId: input.contentTemplateId, contentVariablesJson: input.variables, relatedType: input.relatedType, relatedId: input.relatedId, idempotencyKey: input.idempotencyKey }).onConflictDoNothing().returning();
    if (notification) await tx.insert(deliveryLogs).values({ id: uuidv7(), notificationId: notification.id, channel: "IN_APP", status: "SENT", attemptCount: 1, sentAt: new Date() }).onConflictDoNothing();
  }

  private async audit(tx: DatabaseTransaction, adminId: string, action: string, targetType: typeof adminOperationLogs.$inferInsert.targetType, targetId: string, reason: string, before: unknown, after: unknown, metadata: RequestMetadata) {
    await tx.insert(adminOperationLogs).values({ id: uuidv7(), adminId, action, targetType, targetId, reason, beforeJson: before as Record<string, unknown> | null, afterJson: after as Record<string, unknown> | null, requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent });
  }
}

function conversationView(row: typeof conversations.$inferSelect, unreadCount: number, memberRole: string) { return { id: row.id, conversation_no: row.conversationNo, conversation_type: row.conversationType, product_id: row.productId, order_id: row.orderId, last_message_preview: row.lastMessagePreview, last_message_at: row.lastMessageAt, unread_count: unreadCount, member_role: memberRole, version: row.version, created_at: row.createdAt }; }
function messageView(row: typeof messages.$inferSelect) { return { id: row.id, conversation_id: row.conversationId, client_message_id: row.clientMessageId, sequence_no: row.sequenceNo, sender_user_id: row.senderUserId, sender_admin_id: row.senderAdminId, sender_role: row.senderRole, message_type: row.messageType, content: row.content, send_status: row.sendStatus, moderation_status: row.moderationStatus, created_at: row.createdAt }; }
function supportCaseView(row: typeof supportCases.$inferSelect) { return { id: row.id, case_no: row.caseNo, requester_id: row.requesterId, conversation_id: row.conversationId, topic: row.topic, priority: row.priority, status: row.status, queue_key: row.queueKey, assigned_admin_id: row.assignedAdminId, related_type: row.relatedType, related_id: row.relatedId, source_page: row.sourcePage, first_response_at: row.firstResponseAt, closed_at: row.closedAt, close_reason: row.closeReason, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function supportLogView(row: typeof supportCaseLogs.$inferSelect) { return { id: row.id, action: row.action, old_status: row.oldStatus, new_status: row.newStatus, old_queue_key: row.oldQueueKey, new_queue_key: row.newQueueKey, operator_admin_id: row.operatorAdminId, operator_user_id: row.operatorUserId, reason: row.reason, created_at: row.createdAt }; }
function notificationView(row: typeof notifications.$inferSelect) { return { id: row.id, category: row.category, notification_type: row.notificationType, title: row.title, content_template_id: row.contentTemplateId, content_variables: row.contentVariablesJson, related_type: row.relatedType, related_id: row.relatedId, read_status: row.readStatus, read_at: row.readAt, created_at: row.createdAt }; }
function externalNo(prefix: string) { const date = new Date().toISOString().slice(0, 10).replaceAll("-", ""); return `${prefix}${date}${randomBytes(8).toString("hex").toUpperCase()}`; }
function inStatus<T extends string>(value: string, allowed: readonly T[]): value is T { return allowed.includes(value as T); }
function notFound(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 404 }); }
function forbidden(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 403 }); }
function conflict(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function validation(field: string, message: string) { return new AppError({ code: errorCodes.VALIDATION_FAILED, message: "请求参数校验失败", statusCode: 400, fieldErrors: [{ field, code: "INVALID", message }] }); }
function versionConflict() { return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: "客服工单已被其他操作更新，请刷新后重试", statusCode: 409 }); }
