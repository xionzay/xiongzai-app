import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { OutboxService } from "@xiongzai/application";
import { AppError, decodeCursor, encodeCursor } from "@xiongzai/contracts";
import { adminOperationLogs, announcements, deliveryLogs, feedbacks, files, fileUsages, idempotencyKeys, notifications, users, uuidv7, type DatabaseClient, type DatabaseTransaction } from "@xiongzai/database";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import { cursorColumns, cursorTimeValue } from "./cursor-time.js";
import { FileStorageService } from "./file-storage.service.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { API_CONFIG, DATABASE_CLIENT } from "./tokens.js";

type Feedback = typeof feedbacks.$inferSelect;
type Announcement = typeof announcements.$inferSelect;
type PageInput = { cursor?: string; limit: number };
type Draft = { title: string; content: string; cover_file_id?: string | null; reason: string };
type Change = { version: number; reason: string };

@Injectable()
export class CommunityService {
  private readonly outbox = new OutboxService();
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly fileStorage: FileStorageService,
  ) {}

  feedbackPolicy() {
    return { max_characters: this.config.feedbackMaxCharacters, hourly_limit: this.config.feedbackHourlyLimit, text_only: true, response_sla: null };
  }

  async createFeedback(userId: string, input: { client_request_id: string; content: string }, metadata: RequestMetadata) {
    if ([...input.content].length > this.config.feedbackMaxCharacters) throw failure("FEEDBACK_CONTENT_TOO_LONG", "留言超过当前字数上限", 400);
    return this.database.db.transaction(async tx => {
      // One per-user DB lock covers both rate limiting and duplicate requests across API instances.
      await lock(tx, `feedback-user:${userId}`);
      const [existing] = await tx.select().from(feedbacks).where(and(eq(feedbacks.userId, userId), eq(feedbacks.clientRequestId, input.client_request_id))).limit(1);
      if (existing) {
        if (existing.content !== input.content) throw idempotencyConflict();
        return feedbackView(existing);
      }
      const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId)).for("share");
      if (user?.status !== "NORMAL") throw failure("USER_DISABLED", "当前账号不可操作", 403);
      const [recent] = await tx.select({ count: sql<number>`count(*)::int` }).from(feedbacks)
        .where(and(eq(feedbacks.userId, userId), gt(feedbacks.createdAt, sql`now() - interval '1 hour'`)));
      if ((recent?.count ?? 0) >= this.config.feedbackHourlyLimit) throw failure("FEEDBACK_RATE_LIMITED", "提交过于频繁，请稍后再试", 429);
      const [created] = await tx.insert(feedbacks).values({ id: uuidv7(), userId, clientRequestId: input.client_request_id, content: input.content }).returning();
      await this.event(tx, "FEEDBACK", created!.id, "FeedbackSubmitted", 0, metadata);
      return feedbackView(created!);
    });
  }

  async feedbackByRequest(userId: string, requestId: string) {
    const [row] = await this.database.db.select().from(feedbacks).where(and(eq(feedbacks.userId, userId), eq(feedbacks.clientRequestId, requestId))).limit(1);
    if (!row) throw feedbackMissing();
    return feedbackView(row);
  }

  async feedbackDetail(userId: string, id: string) {
    const [row] = await this.database.db.select().from(feedbacks).where(and(eq(feedbacks.id, id), eq(feedbacks.userId, userId))).limit(1);
    if (!row) throw feedbackMissing();
    return feedbackView(row);
  }

  async listFeedback(input: PageInput & { userId?: string; status?: Feedback["status"] }) {
    const scope = `feedback:${input.userId ?? "admin"}:${input.status ?? "all"}`;
    const cursor = this.cursor(input.cursor, scope);
    const rows = await this.database.db.select(cursorColumns(feedbacks)).from(feedbacks).where(and(
      input.userId ? eq(feedbacks.userId, input.userId) : undefined,
      input.status ? eq(feedbacks.status, input.status) : undefined,
      cursor ? or(lt(feedbacks.createdAt, cursorTimeValue(cursor.sort_value)), and(eq(feedbacks.createdAt, cursorTimeValue(cursor.sort_value)), lt(feedbacks.id, cursor.id))) : undefined,
    )).orderBy(desc(feedbacks.createdAt), desc(feedbacks.id)).limit(input.limit + 1);
    return this.page(rows, input.limit, scope, row => ({ ...feedbackView(row), ...(!input.userId ? { user_id: row.userId } : {}) }));
  }

  async adminFeedbackDetail(id: string) {
    const [row] = await this.database.db.select().from(feedbacks).where(eq(feedbacks.id, id)).limit(1);
    if (!row) throw feedbackMissing();
    return { ...feedbackView(row), user_id: row.userId, processing_records: await this.history("FEEDBACK", id) };
  }

  async processFeedback(adminId: string, id: string, input: Change, key: string, metadata: RequestMetadata) {
    return this.feedbackMutation(adminId, id, "FEEDBACK_PROCESSING", input, key, metadata);
  }

  async replyFeedback(adminId: string, id: string, input: Change & { reply: string }, key: string, metadata: RequestMetadata) {
    return this.feedbackMutation(adminId, id, "FEEDBACK_REPLIED", input, key, metadata);
  }

  private async feedbackMutation(adminId: string, id: string, action: string, input: Change & { reply?: string }, key: string, metadata: RequestMetadata) {
    await this.adminWrite(adminId, action, { id, ...input }, key, async tx => {
      const [current] = await tx.select().from(feedbacks).where(eq(feedbacks.id, id)).for("update");
      if (!current) throw feedbackMissing();
      assertVersion(current, input.version);
      if (current.status === "REPLIED" || (input.reply === undefined && current.status !== "SUBMITTED")) throw failure("FEEDBACK_STATUS_INVALID", "当前反馈状态不能执行此操作", 409);
      const now = new Date();
      const [updated] = await tx.update(feedbacks).set({
        status: input.reply === undefined ? "PROCESSING" : "REPLIED",
        ...(input.reply !== undefined ? { reply: input.reply, repliedAt: now, repliedByAdminId: adminId } : {}),
        version: sql`${feedbacks.version} + 1`, updatedAt: now,
      }).where(and(eq(feedbacks.id, id), eq(feedbacks.status, current.status), eq(feedbacks.version, input.version))).returning();
      if (!updated) throw versionConflict();
      await this.audit(tx, adminId, action, "FEEDBACK", id, current, updated, metadata);
      await this.event(tx, "FEEDBACK", id, input.reply === undefined ? "FeedbackProcessing" : "FeedbackReplied", updated.version, metadata);
      if (input.reply !== undefined) {
        // Do not copy private free text into notifications, audit snapshots or Outbox.
        const [notification] = await tx.insert(notifications).values({
          id: uuidv7(), userId: current.userId, category: "FEEDBACK", notificationType: "FEEDBACK_REPLIED",
          title: "你的意见反馈收到官方回复", contentTemplateId: "feedback.replied.v1", contentVariablesJson: { feedback_id: id },
          relatedType: "FEEDBACK", relatedId: id, idempotencyKey: `feedback-replied:${id}`,
        }).onConflictDoNothing().returning();
        if (notification) await tx.insert(deliveryLogs).values({ id: uuidv7(), notificationId: notification.id, channel: "IN_APP", status: "SENT", attemptCount: 1, sentAt: now });
      }
      return { id, type: "FEEDBACK" };
    });
    return this.adminFeedbackDetail(id);
  }

  async listAnnouncements(input: PageInput & { publicOnly?: boolean; status?: Announcement["status"] }) {
    const scope = `announcements:${input.publicOnly ? "public" : "admin"}:${input.status ?? "all"}`;
    const cursor = this.cursor(input.cursor, scope);
    const rows = await this.database.db.select(cursorColumns(announcements)).from(announcements).where(and(
      input.publicOnly ? eq(announcements.status, "PUBLISHED") : input.status ? eq(announcements.status, input.status) : undefined,
      cursor ? or(lt(announcements.createdAt, cursorTimeValue(cursor.sort_value)), and(eq(announcements.createdAt, cursorTimeValue(cursor.sort_value)), lt(announcements.id, cursor.id))) : undefined,
    )).orderBy(desc(announcements.createdAt), desc(announcements.id)).limit(input.limit + 1);
    return this.page(rows, input.limit, scope, row => input.publicOnly ? publicAnnouncementView(row) : adminAnnouncementView(row));
  }

  async announcementDetail(id: string, publicOnly = false) {
    const [row] = await this.database.db.select().from(announcements).where(and(eq(announcements.id, id), publicOnly ? eq(announcements.status, "PUBLISHED") : undefined)).limit(1);
    if (!row) throw announcementMissing();
    return publicOnly ? publicAnnouncementView(row) : { ...adminAnnouncementView(row), processing_records: await this.history("ANNOUNCEMENT", id) };
  }

  async announcementCover(id: string) {
    return this.fileStorage.getAnnouncementCoverAccess(id);
  }

  async createAnnouncement(adminId: string, input: Draft, key: string, metadata: RequestMetadata) {
    const id = await this.adminWrite(adminId, "ANNOUNCEMENT_DRAFT_CREATED", input, key, async tx => {
      const id = uuidv7();
      await this.bindCover(tx, id, input.cover_file_id ?? null);
      const [created] = await tx.insert(announcements).values({ id, title: input.title, content: input.content, coverFileId: input.cover_file_id, createdByAdminId: adminId }).returning();
      await this.audit(tx, adminId, "ANNOUNCEMENT_DRAFT_CREATED", "ANNOUNCEMENT", id, null, created!, metadata);
      await this.event(tx, "ANNOUNCEMENT", id, "AnnouncementDraftCreated", 0, metadata);
      return { id, type: "ANNOUNCEMENT" };
    });
    return this.announcementDetail(id);
  }

  async changeAnnouncement(adminId: string, id: string, action: "EDIT" | "PUBLISH" | "RETIRE", input: Change & Partial<Draft>, key: string, metadata: RequestMetadata) {
    await this.adminWrite(adminId, `ANNOUNCEMENT_${action}`, { id, ...input }, key, async tx => {
      const [current] = await tx.select().from(announcements).where(eq(announcements.id, id)).for("update");
      if (!current) throw announcementMissing();
      assertVersion(current, input.version);
      if ((action === "RETIRE" && current.status !== "PUBLISHED") || (action !== "RETIRE" && current.status !== "DRAFT")) throw failure("ANNOUNCEMENT_STATUS_INVALID", "已发布内容不可覆盖修改；请创建新草稿", 409);
      const now = new Date();
      if (action === "EDIT") await this.bindCover(tx, id, input.cover_file_id === undefined ? current.coverFileId : input.cover_file_id);
      if (action === "PUBLISH") {
        if (!current.coverFileId) throw failure("ANNOUNCEMENT_COVER_REQUIRED", "发布公告前必须添加已审核封面", 409);
        await this.bindCover(tx, id, current.coverFileId);
      }
      const [updated] = await tx.update(announcements).set({
        ...(action === "EDIT" ? { title: input.title, content: input.content, coverFileId: input.cover_file_id } : {}),
        ...(action === "PUBLISH" ? { status: "PUBLISHED" as const, publishedAt: now } : {}),
        ...(action === "RETIRE" ? { status: "RETIRED" as const, retiredAt: now } : {}),
        version: sql`${announcements.version} + 1`, updatedAt: now,
      }).where(and(eq(announcements.id, id), eq(announcements.status, current.status), eq(announcements.version, input.version))).returning();
      if (!updated) throw versionConflict();
      await this.audit(tx, adminId, `ANNOUNCEMENT_${action}`, "ANNOUNCEMENT", id, current, updated, metadata);
      await this.event(tx, "ANNOUNCEMENT", id, `Announcement${action === "EDIT" ? "Edited" : action === "PUBLISH" ? "Published" : "Retired"}`, updated.version, metadata);
      return { id, type: "ANNOUNCEMENT" };
    });
    return this.announcementDetail(id);
  }

  private async bindCover(tx: DatabaseTransaction, id: string, fileId: string | null) {
    if (fileId) {
      const [file] = await tx.select().from(files).where(and(eq(files.id, fileId), eq(files.fileType, "ANNOUNCEMENT_IMAGE"), eq(files.uploadStatus, "VERIFIED"), eq(files.moderationStatus, "APPROVED"), eq(files.visibility, "SIGNED"), isNull(files.ownerUserId), isNull(files.deletedAt))).for("update");
      if (!file) throw failure("ANNOUNCEMENT_COVER_INVALID", "封面用途、归属、校验或审核状态不符合要求", 409);
    }
    await tx.update(fileUsages).set({ deletedAt: new Date() }).where(and(eq(fileUsages.targetType, "ANNOUNCEMENT"), eq(fileUsages.targetId, id), eq(fileUsages.usageType, "COVER"), isNull(fileUsages.deletedAt)));
    if (fileId) await tx.insert(fileUsages).values({ id: uuidv7(), fileId, usageType: "COVER", targetType: "ANNOUNCEMENT", targetId: id });
  }

  private async adminWrite(adminId: string, action: string, input: unknown, key: string, write: (tx: DatabaseTransaction) => Promise<{ id: string; type: "FEEDBACK" | "ANNOUNCEMENT" }>) {
    const scope = `community:${adminId}`;
    const digest = (value: unknown) => createHmac("sha256", this.config.authHmacKey).update(JSON.stringify(value)).digest("hex");
    const requestHash = digest([action, input]);
    return this.database.db.transaction(async tx => {
      await lock(tx, `${scope}:${key}`);
      const [existing] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.idempotencyKey, key))).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) throw idempotencyConflict();
        if (existing.status !== "COMPLETED" || !existing.resourceId) throw failure("IDEMPOTENCY_REQUEST_IN_PROGRESS", "请求正在处理中，请查询最新状态", 409);
        return existing.resourceId;
      }
      const resource = await write(tx);
      // Store only a keyed digest and resource identity, never the request/reply body.
      await tx.insert(idempotencyKeys).values({ id: uuidv7(), scope, idempotencyKey: key, requestHash, status: "COMPLETED", resourceType: resource.type, resourceId: resource.id, expiresAt: new Date(Date.now() + 365 * 86400_000) });
      return resource.id;
    });
  }

  private async history(targetType: "FEEDBACK" | "ANNOUNCEMENT", id: string) {
    return this.database.db.select({ action: adminOperationLogs.action, admin_id: adminOperationLogs.adminId, created_at: adminOperationLogs.createdAt }).from(adminOperationLogs)
      .where(and(eq(adminOperationLogs.targetType, targetType), eq(adminOperationLogs.targetId, id))).orderBy(desc(adminOperationLogs.createdAt), desc(adminOperationLogs.id)).limit(100);
  }

  private async audit(tx: DatabaseTransaction, adminId: string, action: string, targetType: "FEEDBACK" | "ANNOUNCEMENT", id: string, before: { status: string; version: number } | null, after: { status: string; version: number }, metadata: RequestMetadata) {
    await tx.insert(adminOperationLogs).values({ id: uuidv7(), adminId, action, targetType, targetId: id, reason: "独立反馈与公告管理操作（正文不进入审计）", beforeJson: before ? { status: before.status, version: before.version } : null, afterJson: { status: after.status, version: after.version }, requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent });
  }

  private async event(tx: DatabaseTransaction, aggregateType: string, id: string, eventType: string, version: number, metadata: RequestMetadata) {
    await this.outbox.enqueue(tx, { aggregateType, aggregateId: id, eventType, payload: { id, version }, traceId: metadata.traceId });
  }

  private cursor(value: string | undefined, scope: string) {
    if (!value) return undefined;
    const cursor = decodeCursor(value, this.config.cursorSigningSecret);
    if (cursor.scope !== scope || !/^[0-9a-f-]{36}$/iu.test(cursor.id)) throw failure("VALIDATION_FAILED", "分页游标不属于当前查询", 400);
    return cursor;
  }

  private page<T extends { id: string; createdAt: Date }, R>(rows: T[], limit: number, scope: string, view: (row: T) => R) {
    const page = rows.slice(0, limit), last = page.at(-1);
    return { items: page.map(view), next_cursor: rows.length > limit && last ? encodeCursor({ id: last.id, sort_value: last.createdAt.toISOString(), scope }, this.config.cursorSigningSecret) : null };
  }
}

function feedbackView(row: Feedback) { return { id: row.id, client_request_id: row.clientRequestId, content: row.content, status: row.status, reply: row.reply, replied_at: row.repliedAt, created_at: row.createdAt, version: row.version }; }
function publicAnnouncementView(row: Announcement) { return { id: row.id, title: row.title, content: row.content, cover_file_id: row.coverFileId, cover_access_path: `/api/v1/announcements/${row.id}/cover`, published_at: row.publishedAt, version: row.version }; }
function adminAnnouncementView(row: Announcement) { return { ...publicAnnouncementView(row), status: row.status, created_by_admin_id: row.createdByAdminId, created_at: row.createdAt, retired_at: row.retiredAt }; }
async function lock(tx: DatabaseTransaction, key: string) { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`); }
function failure(code: string, message: string, statusCode: number) { return new AppError({ code: code as `${Uppercase<string>}_${Uppercase<string>}`, message, statusCode }); }
function feedbackMissing() { return failure("FEEDBACK_NOT_FOUND", "反馈不存在或无权查看", 404); }
function announcementMissing() { return failure("ANNOUNCEMENT_NOT_FOUND", "公告不存在或未发布", 404); }
function versionConflict() { return failure("RESOURCE_VERSION_CONFLICT", "记录已更新，请刷新后重试", 409); }
function idempotencyConflict() { return failure("IDEMPOTENCY_KEY_CONFLICT", "请求幂等号已用于不同内容", 409); }
function assertVersion(row: { version: number }, version: number) { if (row.version !== version) throw versionConflict(); }
