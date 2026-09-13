import { createHash, randomInt } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { OutboxService } from "@xiongzai/application";
import { AppError, decodeCursor, encodeCursor, errorCodes, normalizePageSize, type ErrorCode } from "@xiongzai/contracts";
import {
  accountCancellationRequests,
  adminOperationLogs,
  authSessions,
  fileUsages,
  files,
  personalDataExportJobs,
  phoneChangeRequests,
  platformConfigs,
  privacySettings,
  scheduledJobs,
  securityLogs,
  smsCodes,
  userPolicyAcceptances,
  userProfiles,
  users,
  uuidv7,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@xiongzai/database";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import type { RequestMetadata } from "./identity-user.service.js";
import type { ObjectStorageProvider } from "./object-storage-provider.js";
import { SensitiveDataProtector } from "./sensitive-data.js";
import type { SmsProvider } from "./sms-provider.js";
import { API_CONFIG, DATABASE_CLIENT, OBJECT_STORAGE_PROVIDER, SMS_PROVIDER } from "./tokens.js";

export const USER_LIFECYCLE_JOB_TYPES = {
  PHONE_CHANGE_EXPIRE: "PHONE_CHANGE_EXPIRE",
  DATA_EXPORT_GENERATE: "PERSONAL_DATA_EXPORT_GENERATE",
  DATA_EXPORT_EXPIRE: "PERSONAL_DATA_EXPORT_EXPIRE",
  ACCOUNT_CANCELLATION_COMPLETE: "ACCOUNT_CANCELLATION_COMPLETE",
} as const;

type PhoneStatus = typeof phoneChangeRequests.$inferSelect.status;
type ExportStatus = typeof personalDataExportJobs.$inferSelect.status;
type CancellationStatus = typeof accountCancellationRequests.$inferSelect.status;
type SmsPurpose = "PHONE_CHANGE_OLD" | "PHONE_CHANGE_NEW";
type SmsResult = { ok: true; id: string } | { ok: false; code: "INVALID" | "EXPIRED" | "ATTEMPTS" };

const PHONE_REQUEST_TTL_MS = 30 * 60_000;
const EXPORT_RETENTION_MS = 24 * 60 * 60_000;
const CANCELLATION_WAITING_MS = 7 * 24 * 60 * 60_000;

@Injectable()
export class UserLifecycleService {
  private readonly protector: SensitiveDataProtector;
  private readonly outbox = new OutboxService();

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
  ) {
    this.protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  }

  async createPhoneChange(userId: string, rawNewPhone: string, idempotencyKey: string, metadata: RequestMetadata) {
    const newPhone = this.protector.normalizePhone(rawNewPhone);
    const newPhoneHash = this.protector.piiHash("phone", newPhone);
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(phoneChangeRequests).where(and(eq(phoneChangeRequests.userId, userId), eq(phoneChangeRequests.idempotencyKey, idempotencyKey))).limit(1);
      if (existing) {
        if (existing.newPhoneHash !== newPhoneHash) throw idempotencyConflict();
        return phoneChangeView(existing);
      }
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
      if (!user || user.status !== "NORMAL") throw unavailableUser();
      const [active] = await tx.select({ id: phoneChangeRequests.id }).from(phoneChangeRequests).where(and(eq(phoneChangeRequests.userId, userId), inArray(phoneChangeRequests.status, ["PENDING_OLD_VERIFICATION", "PENDING_NEW_VERIFICATION", "READY"]))).limit(1);
      if (active) throw lifecycleConflict("PHONE_CHANGE_ALREADY_ACTIVE", "当前已有进行中的手机号换绑申请");
      if (user.phoneHash === newPhoneHash) throw validation("new_phone", "新手机号不能与当前手机号相同");
      const [occupied] = await tx.select({ id: users.id }).from(users).where(eq(users.phoneHash, newPhoneHash)).limit(1);
      if (occupied) throw new AppError({ code: "PHONE_ALREADY_BOUND", message: "该手机号已被其他账号使用", statusCode: 409 });
      const now = new Date();
      const expiresAt = new Date(now.getTime() + PHONE_REQUEST_TTL_MS);
      const id = uuidv7();
      const [created] = await tx.insert(phoneChangeRequests).values({
        id, userId, idempotencyKey,
        oldPhoneCiphertext: user.phoneCiphertext, oldPhoneHash: user.phoneHash, oldPhoneMask: user.phoneMask,
        newPhoneCiphertext: this.protector.encrypt("phone", newPhone), newPhoneHash, newPhoneMask: this.protector.maskPhone(newPhone),
        userVersionAtRequest: user.version, expiresAt,
      }).returning();
      await tx.insert(scheduledJobs).values({
        id: uuidv7(), jobKey: `phone-change-expire:${id}`, jobType: USER_LIFECYCLE_JOB_TYPES.PHONE_CHANGE_EXPIRE,
        targetType: "USER", targetId: id, payloadJson: {}, runAt: expiresAt, maxAttempts: 5,
      });
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: userId, eventType: "PhoneChangeRequested", payload: { user_id: userId, request_id: id }, traceId: metadata.traceId });
      await this.recordPhoneSecurityEvent(tx, userId, id, "USER_PHONE_CHANGE_REQUESTED", "RESOLVED", 10, metadata);
      return phoneChangeView(created!);
    });
  }

  async listPhoneChanges(userId: string) {
    const rows = await this.database.db.select().from(phoneChangeRequests).where(eq(phoneChangeRequests.userId, userId)).orderBy(desc(phoneChangeRequests.createdAt)).limit(50);
    return rows.map(phoneChangeView);
  }

  async sendPhoneChangeCode(userId: string, requestId: string, side: "old" | "new", metadata: RequestMetadata) {
    const expectedStatus: PhoneStatus = side === "old" ? "PENDING_OLD_VERIFICATION" : "PENDING_NEW_VERIFICATION";
    const purpose: SmsPurpose = side === "old" ? "PHONE_CHANGE_OLD" : "PHONE_CHANGE_NEW";
    const [request] = await this.database.db.select().from(phoneChangeRequests).where(and(eq(phoneChangeRequests.id, requestId), eq(phoneChangeRequests.userId, userId), eq(phoneChangeRequests.status, expectedStatus))).limit(1);
    if (!request) throw lifecycleConflict("PHONE_CHANGE_STATUS_INVALID", "当前换绑状态不能发送该验证码");
    if (request.expiresAt <= new Date()) throw lifecycleConflict("PHONE_CHANGE_EXPIRED", "手机号换绑申请已过期");
    const phoneHash = side === "old" ? request.oldPhoneHash : request.newPhoneHash;
    const phone = this.protector.decrypt("phone", side === "old" ? request.oldPhoneCiphertext : request.newPhoneCiphertext);
    await this.issueSmsCode(phone, phoneHash, purpose);
    await this.recordPhoneSecurityEvent(this.database.db, userId, requestId, side === "old" ? "USER_PHONE_CHANGE_OLD_CODE_SENT" : "USER_PHONE_CHANGE_NEW_CODE_SENT", "RESOLVED", 10, metadata);
    return { expires_in_seconds: this.config.smsCodeTtlSeconds, retry_after_seconds: this.config.smsMinimumIntervalSeconds };
  }

  async verifyPhoneChangeCode(userId: string, requestId: string, side: "old" | "new", code: string, version: number, metadata: RequestMetadata) {
    const expectedStatus: PhoneStatus = side === "old" ? "PENDING_OLD_VERIFICATION" : "PENDING_NEW_VERIFICATION";
    const purpose: SmsPurpose = side === "old" ? "PHONE_CHANGE_OLD" : "PHONE_CHANGE_NEW";
    const result = await this.database.db.transaction(async (tx) => {
      const [request] = await tx.select().from(phoneChangeRequests).where(and(eq(phoneChangeRequests.id, requestId), eq(phoneChangeRequests.userId, userId))).limit(1).for("update");
      if (!request || request.status !== expectedStatus || request.version !== version) throw versionConflict("手机号换绑申请");
      if (request.expiresAt <= new Date()) throw lifecycleConflict("PHONE_CHANGE_EXPIRED", "手机号换绑申请已过期");
      const phoneHash = side === "old" ? request.oldPhoneHash : request.newPhoneHash;
      const verification = await this.consumeSmsCode(tx, phoneHash, purpose, code);
      if (!verification.ok) {
        const countColumn = side === "old" ? phoneChangeRequests.oldAttemptCount : phoneChangeRequests.newAttemptCount;
        const currentAttempts = side === "old" ? request.oldAttemptCount : request.newAttemptCount;
        if (currentAttempts < request.maxAttempts) {
          const updated = await tx.update(phoneChangeRequests).set({
            [side === "old" ? "oldAttemptCount" : "newAttemptCount"]: sql`${countColumn} + 1`,
            version: sql`${phoneChangeRequests.version} + 1`, updatedAt: new Date(),
          }).where(and(eq(phoneChangeRequests.id, request.id), eq(phoneChangeRequests.status, expectedStatus), eq(phoneChangeRequests.version, version))).returning({ version: phoneChangeRequests.version });
          if (!updated[0]) throw versionConflict("手机号换绑申请");
        }
        await this.recordPhoneSecurityEvent(tx, userId, requestId, side === "old" ? "USER_PHONE_CHANGE_OLD_CODE_FAILED" : "USER_PHONE_CHANGE_NEW_CODE_FAILED", "OPEN", 35, metadata);
        return { verification } as const;
      }
      const now = new Date();
      if (side === "old") {
        const [updated] = await tx.update(phoneChangeRequests).set({
          oldSmsCodeId: verification.id, oldVerifiedAt: now, status: "PENDING_NEW_VERIFICATION",
          version: sql`${phoneChangeRequests.version} + 1`, updatedAt: now,
        }).where(and(eq(phoneChangeRequests.id, request.id), eq(phoneChangeRequests.status, "PENDING_OLD_VERIFICATION"), eq(phoneChangeRequests.version, version))).returning();
        if (!updated) throw versionConflict("手机号换绑申请");
        await this.recordPhoneSecurityEvent(tx, userId, requestId, "USER_PHONE_CHANGE_OLD_VERIFIED", "RESOLVED", 10, metadata);
        return { row: updated } as const;
      }
      const [ready] = await tx.update(phoneChangeRequests).set({
        newSmsCodeId: verification.id, newVerifiedAt: now, status: "READY",
        version: sql`${phoneChangeRequests.version} + 1`, updatedAt: now,
      }).where(and(eq(phoneChangeRequests.id, request.id), eq(phoneChangeRequests.status, "PENDING_NEW_VERIFICATION"), eq(phoneChangeRequests.version, version))).returning();
      if (!ready) throw versionConflict("手机号换绑申请");
      const changedUsers = await tx.update(users).set({
        phoneCiphertext: request.newPhoneCiphertext, phoneHash: request.newPhoneHash, phoneMask: request.newPhoneMask,
        version: sql`${users.version} + 1`, updatedAt: now,
      }).where(and(eq(users.id, userId), eq(users.status, "NORMAL"), eq(users.version, request.userVersionAtRequest))).returning({ id: users.id });
      if (!changedUsers[0]) throw versionConflict("用户");
      const [completed] = await tx.update(phoneChangeRequests).set({
        status: "COMPLETED", completedAt: now, version: sql`${phoneChangeRequests.version} + 1`, updatedAt: now,
      }).where(and(eq(phoneChangeRequests.id, request.id), eq(phoneChangeRequests.status, "READY"), eq(phoneChangeRequests.version, ready.version))).returning();
      if (!completed) throw versionConflict("手机号换绑申请");
      await tx.update(authSessions).set({ revokedAt: now, lastUsedAt: now }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: userId, eventType: "UserPhoneChanged", payload: { user_id: userId, request_id: request.id }, traceId: metadata.traceId });
      await this.recordPhoneSecurityEvent(tx, userId, requestId, "USER_PHONE_CHANGE_COMPLETED", "RESOLVED", 20, metadata);
      return { row: completed } as const;
    });
    if ("verification" in result && result.verification) throwSmsError(result.verification);
    return phoneChangeView(result.row);
  }

  async cancelPhoneChange(userId: string, requestId: string, status: PhoneStatus, version: number, metadata: RequestMetadata) {
    if (!(["PENDING_OLD_VERIFICATION", "PENDING_NEW_VERIFICATION", "READY"] as PhoneStatus[]).includes(status)) throw lifecycleConflict("PHONE_CHANGE_STATUS_INVALID", "当前换绑状态不能取消");
    const now = new Date();
    const rows = await this.database.db.transaction(async (tx) => {
      const updated = await tx.update(phoneChangeRequests).set({ status: "CANCELLED", cancelledAt: now, version: sql`${phoneChangeRequests.version} + 1`, updatedAt: now })
        .where(and(eq(phoneChangeRequests.id, requestId), eq(phoneChangeRequests.userId, userId), eq(phoneChangeRequests.status, status), eq(phoneChangeRequests.version, version))).returning();
      if (!updated[0]) throw versionConflict("手机号换绑申请");
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: userId, eventType: "PhoneChangeCancelled", payload: { user_id: userId, request_id: requestId }, traceId: metadata.traceId });
      await this.recordPhoneSecurityEvent(tx, userId, requestId, "USER_PHONE_CHANGE_CANCELLED", "RESOLVED", 5, metadata);
      return updated;
    });
    return phoneChangeView(rows[0]!);
  }

  async createDataExport(userId: string, idempotencyKey: string, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(personalDataExportJobs).where(and(eq(personalDataExportJobs.userId, userId), eq(personalDataExportJobs.idempotencyKey, idempotencyKey))).limit(1);
      if (existing) return exportView(existing);
      const [user] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1).for("update");
      if (!user || user.status !== "NORMAL") throw unavailableUser();
      const [active] = await tx.select({ id: personalDataExportJobs.id }).from(personalDataExportJobs).where(and(eq(personalDataExportJobs.userId, userId), inArray(personalDataExportJobs.status, ["PENDING", "PROCESSING"]))).limit(1);
      if (active) throw lifecycleConflict("DATA_EXPORT_ALREADY_ACTIVE", "当前已有正在生成的数据导出任务");
      const now = new Date(); const expiresAt = new Date(now.getTime() + EXPORT_RETENTION_MS); const id = uuidv7();
      const [created] = await tx.insert(personalDataExportJobs).values({ id, userId, idempotencyKey, requestedAt: now, expiresAt }).returning();
      await tx.insert(scheduledJobs).values({ id: uuidv7(), jobKey: `data-export-generate:${id}`, jobType: USER_LIFECYCLE_JOB_TYPES.DATA_EXPORT_GENERATE, targetType: "USER", targetId: id, payloadJson: {}, runAt: now, maxAttempts: 5 });
      await tx.insert(scheduledJobs).values({ id: uuidv7(), jobKey: `data-export-expire:${id}`, jobType: USER_LIFECYCLE_JOB_TYPES.DATA_EXPORT_EXPIRE, targetType: "USER", targetId: id, payloadJson: {}, runAt: expiresAt, maxAttempts: 5 });
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: userId, eventType: "PersonalDataExportRequested", payload: { user_id: userId, export_id: id }, traceId: metadata.traceId });
      return exportView(created!);
    });
  }

  async listDataExports(userId: string) {
    const rows = await this.database.db.select().from(personalDataExportJobs).where(eq(personalDataExportJobs.userId, userId)).orderBy(desc(personalDataExportJobs.createdAt)).limit(50);
    return rows.map(exportView);
  }

  async dataExportDownload(userId: string, exportId: string) {
    const [row] = await this.database.db.select({ job: personalDataExportJobs, file: files }).from(personalDataExportJobs)
      .leftJoin(files, eq(files.id, personalDataExportJobs.outputFileId))
      .where(and(eq(personalDataExportJobs.id, exportId), eq(personalDataExportJobs.userId, userId))).limit(1);
    if (!row || row.job.status !== "COMPLETED" || !row.file || row.job.expiresAt <= new Date() || row.file.deletedAt) throw new AppError({ code: "DATA_EXPORT_NOT_READY", message: "导出文件尚未生成或已经过期", statusCode: 409 });
    const signed = await this.storage.createDownloadUrl({ bucket: row.file.bucket, objectKey: row.file.objectKey, expiresInSeconds: this.config.fileDownloadUrlTtlSeconds });
    return { id: row.job.id, download_url: signed.url, download_expires_at: signed.expiresAt, sha256: row.file.sha256, size_bytes: row.file.sizeBytes.toString() };
  }

  async createCancellation(userId: string, reason: string, idempotencyKey: string, metadata: RequestMetadata) {
    const [replay] = await this.database.db.select().from(accountCancellationRequests).where(and(eq(accountCancellationRequests.userId, userId), eq(accountCancellationRequests.idempotencyKey, idempotencyKey))).limit(1);
    if (replay) return cancellationView(replay);
    const blockers = await this.cancellationBlockers(userId);
    if (blockers.length) throw cancellationBlocked(blockers);
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(accountCancellationRequests).where(and(eq(accountCancellationRequests.userId, userId), eq(accountCancellationRequests.idempotencyKey, idempotencyKey))).limit(1);
      if (existing) return cancellationView(existing);
      const [user] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1).for("update");
      if (!user || user.status !== "NORMAL") throw unavailableUser();
      const [active] = await tx.select({ id: accountCancellationRequests.id }).from(accountCancellationRequests).where(and(eq(accountCancellationRequests.userId, userId), inArray(accountCancellationRequests.status, ["REQUESTED", "PROCESSING"]))).limit(1);
      if (active) throw lifecycleConflict("ACCOUNT_CANCELLATION_ALREADY_ACTIVE", "当前已有进行中的账号注销申请");
      const waitingMs = await this.cancellationWaitingMs(tx);
      const now = new Date(); const waitingPeriodEndsAt = new Date(now.getTime() + waitingMs); const id = uuidv7();
      const [created] = await tx.insert(accountCancellationRequests).values({ id, userId, idempotencyKey, reason, requestedAt: now, waitingPeriodEndsAt }).returning();
      await tx.insert(scheduledJobs).values({ id: uuidv7(), jobKey: `account-cancellation-complete:${id}`, jobType: USER_LIFECYCLE_JOB_TYPES.ACCOUNT_CANCELLATION_COMPLETE, targetType: "USER", targetId: id, payloadJson: {}, runAt: waitingPeriodEndsAt, maxAttempts: 20 });
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: userId, eventType: "AccountCancellationRequested", payload: { user_id: userId, request_id: id, waiting_period_ends_at: waitingPeriodEndsAt.toISOString() }, traceId: metadata.traceId });
      return cancellationView(created!);
    });
  }

  async listCancellations(userId: string) {
    const rows = await this.database.db.select().from(accountCancellationRequests).where(eq(accountCancellationRequests.userId, userId)).orderBy(desc(accountCancellationRequests.createdAt)).limit(50);
    return rows.map(cancellationView);
  }

  async cancelCancellation(userId: string, requestId: string, version: number, metadata: RequestMetadata) {
    const now = new Date();
    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx.update(accountCancellationRequests).set({ status: "CANCELLED", cancelledAt: now, version: sql`${accountCancellationRequests.version} + 1`, updatedAt: now })
        .where(and(eq(accountCancellationRequests.id, requestId), eq(accountCancellationRequests.userId, userId), eq(accountCancellationRequests.status, "REQUESTED"), eq(accountCancellationRequests.version, version))).returning();
      if (!updated) throw versionConflict("账号注销申请");
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: userId, eventType: "AccountCancellationRevoked", payload: { user_id: userId, request_id: requestId }, traceId: metadata.traceId });
      return cancellationView(updated);
    });
  }

  async adminListCancellations(input: { status?: CancellationStatus; cursor?: string; limit?: number; keyword?: string; sort: "created_desc" | "created_asc" }) {
    const limit = normalizePageSize(input.limit, 20);
    const scope = `admin-account-cancellations:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort}`;
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== scope) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "分页游标与账号注销筛选条件不匹配", statusCode: 400 });
    const ascending = input.sort === "created_asc";
    const cursorDate = cursor ? new Date(cursor.sort_value) : undefined;
    const keyword = input.keyword ? `%${input.keyword}%` : undefined;
    const rows = await this.database.db.select({
      request: accountCancellationRequests,
      nickname: userProfiles.nickname,
      publicUserNo: userProfiles.publicUserNo,
      phoneMask: users.phoneMask,
      userStatus: users.status,
    }).from(accountCancellationRequests)
      .innerJoin(users, eq(users.id, accountCancellationRequests.userId))
      .leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(and(
        input.status ? eq(accountCancellationRequests.status, input.status) : undefined,
        keyword ? or(
          ilike(userProfiles.nickname, keyword), ilike(userProfiles.publicUserNo, keyword), ilike(users.phoneMask, keyword),
          ilike(accountCancellationRequests.reason, keyword), sql<boolean>`${accountCancellationRequests.id}::text ILIKE ${keyword}`,
        ) : undefined,
        cursor && cursorDate ? ascending
          ? or(gt(accountCancellationRequests.createdAt, cursorDate), and(eq(accountCancellationRequests.createdAt, cursorDate), gt(accountCancellationRequests.id, cursor.id)))
          : or(lt(accountCancellationRequests.createdAt, cursorDate), and(eq(accountCancellationRequests.createdAt, cursorDate), lt(accountCancellationRequests.id, cursor.id)))
          : undefined,
      ))
      .orderBy(ascending ? asc(accountCancellationRequests.createdAt) : desc(accountCancellationRequests.createdAt), ascending ? asc(accountCancellationRequests.id) : desc(accountCancellationRequests.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(adminCancellationView),
      next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.request.createdAt.toISOString(), id: last.request.id, scope }, this.config.cursorSigningSecret) : null,
    };
  }

  async adminCancellationDetail(requestId: string) {
    const [row] = await this.database.db.select({
      request: accountCancellationRequests,
      nickname: userProfiles.nickname,
      publicUserNo: userProfiles.publicUserNo,
      phoneMask: users.phoneMask,
      userStatus: users.status,
    }).from(accountCancellationRequests)
      .innerJoin(users, eq(users.id, accountCancellationRequests.userId))
      .leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(eq(accountCancellationRequests.id, requestId)).limit(1);
    if (!row) throw new AppError({ code: "RESOURCE_NOT_FOUND", message: "账号注销申请不存在", statusCode: 404 });
    return { ...adminCancellationView(row), blocker_codes: await this.cancellationBlockers(row.request.userId) };
  }

  async adminRejectCancellation(adminId: string, requestId: string, version: number, reason: string, metadata: RequestMetadata) {
    const now = new Date();
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(accountCancellationRequests).where(eq(accountCancellationRequests.id, requestId)).limit(1).for("update");
      if (!current || current.status !== "REQUESTED" || current.version !== version) throw versionConflict("账号注销申请");
      const logId = uuidv7();
      await tx.insert(adminOperationLogs).values({ id: logId, adminId, action: "ACCOUNT_CANCELLATION_REJECTED", targetType: "USER", targetId: current.userId, reason, beforeJson: { request_id: requestId, status: current.status, version: current.version }, afterJson: { request_id: requestId, status: "REJECTED", version: current.version + 1 }, requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent });
      const [updated] = await tx.update(accountCancellationRequests).set({ status: "REJECTED", rejectedAt: now, rejectionReason: reason, decisionAdminOperationLogId: logId, version: sql`${accountCancellationRequests.version} + 1`, updatedAt: now })
        .where(and(eq(accountCancellationRequests.id, requestId), eq(accountCancellationRequests.status, "REQUESTED"), eq(accountCancellationRequests.version, version))).returning();
      if (!updated) throw versionConflict("账号注销申请");
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: current.userId, eventType: "AccountCancellationRejected", payload: { user_id: current.userId, request_id: requestId }, traceId: metadata.traceId });
      return cancellationView(updated);
    });
  }

  async cancellationEligibility(userId: string) {
    const [blockerCodes, waitingPeriodMs] = await Promise.all([
      this.cancellationBlockers(userId),
      this.database.db.transaction((tx) => this.cancellationWaitingMs(tx)),
    ]);
    return {
      eligible: blockerCodes.length === 0,
      blocker_codes: blockerCodes,
      waiting_period_seconds: Math.floor(waitingPeriodMs / 1_000),
      checked_at: new Date(),
    };
  }

  async adminListPhoneChanges(input: { status?: PhoneStatus; cursor?: string; limit?: number; keyword?: string; sort: "created_desc" | "created_asc" }) {
    const limit = normalizePageSize(input.limit, 20);
    const scope = `admin-phone-change:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort}`;
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== scope) throw validation("cursor", "分页游标与手机号换绑筛选条件不匹配");
    const ascending = input.sort === "created_asc";
    const cursorDate = cursor ? new Date(cursor.sort_value) : undefined;
    const keyword = input.keyword ? `%${input.keyword.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : undefined;
    const rows = await this.database.db.select({ request: phoneChangeRequests, nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, userStatus: users.status })
      .from(phoneChangeRequests)
      .innerJoin(users, eq(users.id, phoneChangeRequests.userId))
      .leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(and(
        input.status ? eq(phoneChangeRequests.status, input.status) : undefined,
        keyword ? or(ilike(userProfiles.nickname, keyword), ilike(userProfiles.publicUserNo, keyword), ilike(phoneChangeRequests.oldPhoneMask, keyword), ilike(phoneChangeRequests.newPhoneMask, keyword), sql<boolean>`${phoneChangeRequests.id}::text ILIKE ${keyword}`) : undefined,
        cursor && cursorDate ? ascending
          ? or(gt(phoneChangeRequests.createdAt, cursorDate), and(eq(phoneChangeRequests.createdAt, cursorDate), gt(phoneChangeRequests.id, cursor.id)))
          : or(lt(phoneChangeRequests.createdAt, cursorDate), and(eq(phoneChangeRequests.createdAt, cursorDate), lt(phoneChangeRequests.id, cursor.id)))
          : undefined,
      ))
      .orderBy(ascending ? asc(phoneChangeRequests.createdAt) : desc(phoneChangeRequests.createdAt), ascending ? asc(phoneChangeRequests.id) : desc(phoneChangeRequests.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1);
    return { items: page.map(adminPhoneChangeView), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.request.createdAt.toISOString(), id: last.request.id, scope }, this.config.cursorSigningSecret) : null };
  }

  async adminPhoneChangeDetail(requestId: string) {
    const [row] = await this.database.db.select({ request: phoneChangeRequests, nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, userStatus: users.status })
      .from(phoneChangeRequests).innerJoin(users, eq(users.id, phoneChangeRequests.userId)).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(eq(phoneChangeRequests.id, requestId)).limit(1);
    if (!row) throw new AppError({ code: "RESOURCE_NOT_FOUND", message: "手机号换绑记录不存在", statusCode: 404 });
    const history = await this.database.db.select({ id: securityLogs.id, eventType: securityLogs.eventType, status: securityLogs.status, riskScore: securityLogs.riskScore, metadataJson: securityLogs.metadataJson, createdAt: securityLogs.createdAt })
      .from(securityLogs).where(and(eq(securityLogs.userId, row.request.userId), sql<boolean>`${securityLogs.metadataJson}->>'phone_change_request_id' = ${requestId}`)).orderBy(desc(securityLogs.createdAt)).limit(50);
    return { ...adminPhoneChangeView(row), security_history: history.map((entry) => ({ id: entry.id, event_type: entry.eventType, status: entry.status, risk_score: entry.riskScore, request_id: phoneSecurityRequestId(entry.metadataJson), created_at: entry.createdAt })) };
  }

  async adminListDataExports(input: { status?: ExportStatus; cursor?: string; limit?: number; keyword?: string; sort: "created_desc" | "created_asc" }) {
    const limit = normalizePageSize(input.limit, 20);
    const scope = `admin-data-exports:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort}`;
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== scope) throw validation("cursor", "分页游标与数据导出筛选条件不匹配");
    const ascending = input.sort === "created_asc"; const cursorDate = cursor ? new Date(cursor.sort_value) : undefined;
    const keyword = input.keyword ? `%${input.keyword.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : undefined;
    const rows = await this.database.db.select({ job: personalDataExportJobs, nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, phoneMask: users.phoneMask, userStatus: users.status })
      .from(personalDataExportJobs).innerJoin(users, eq(users.id, personalDataExportJobs.userId)).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(and(
        input.status ? eq(personalDataExportJobs.status, input.status) : undefined,
        keyword ? or(ilike(userProfiles.nickname, keyword), ilike(userProfiles.publicUserNo, keyword), ilike(users.phoneMask, keyword), sql<boolean>`${personalDataExportJobs.id}::text ILIKE ${keyword}`) : undefined,
        cursor && cursorDate ? ascending
          ? or(gt(personalDataExportJobs.createdAt, cursorDate), and(eq(personalDataExportJobs.createdAt, cursorDate), gt(personalDataExportJobs.id, cursor.id)))
          : or(lt(personalDataExportJobs.createdAt, cursorDate), and(eq(personalDataExportJobs.createdAt, cursorDate), lt(personalDataExportJobs.id, cursor.id)))
          : undefined,
      ))
      .orderBy(ascending ? asc(personalDataExportJobs.createdAt) : desc(personalDataExportJobs.createdAt), ascending ? asc(personalDataExportJobs.id) : desc(personalDataExportJobs.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit); const last = page.at(-1);
    return { items: page.map(adminDataExportView), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.job.createdAt.toISOString(), id: last.job.id, scope }, this.config.cursorSigningSecret) : null };
  }

  async adminDataExportDetail(exportId: string) {
    const [row] = await this.database.db.select({ job: personalDataExportJobs, nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, phoneMask: users.phoneMask, userStatus: users.status })
      .from(personalDataExportJobs).innerJoin(users, eq(users.id, personalDataExportJobs.userId)).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(eq(personalDataExportJobs.id, exportId)).limit(1);
    if (!row) throw new AppError({ code: "RESOURCE_NOT_FOUND", message: "个人数据导出任务不存在", statusCode: 404 });
    return adminDataExportView(row);
  }

  async cancellationBlockers(userId: string): Promise<string[]> {
    const result = await this.database.db.execute(sql`
      SELECT array_remove(ARRAY[
        CASE WHEN EXISTS (SELECT 1 FROM orders WHERE (buyer_id = ${userId} OR seller_user_id = ${userId}) AND status NOT IN ('COMPLETED','CANCELLED','CLOSED','SELLER_REJECTED')) THEN 'ACTIVE_ORDER' END,
        CASE WHEN EXISTS (SELECT 1 FROM refunds r JOIN orders o ON o.id = r.order_id WHERE (o.buyer_id = ${userId} OR o.seller_user_id = ${userId}) AND r.status IN ('REQUESTED','SELLER_APPROVED','SELLER_REJECTED','NEGOTIATING','PLATFORM_REVIEW','REFUND_PROCESSING')) THEN 'ACTIVE_REFUND' END,
        CASE WHEN EXISTS (SELECT 1 FROM complaints c LEFT JOIN seller_profiles sp ON sp.id = c.target_seller_id WHERE (c.reporter_id = ${userId} OR c.target_user_id = ${userId} OR sp.user_id = ${userId}) AND c.status NOT IN ('COMPLETED','CLOSED')) THEN 'ACTIVE_COMPLAINT' END,
        CASE WHEN EXISTS (SELECT 1 FROM withdrawals w JOIN seller_profiles sp ON sp.id = w.seller_id WHERE sp.user_id = ${userId} AND w.status IN ('CREATED','RISK_REVIEW','APPROVED','PAYOUT_PROCESSING')) THEN 'ACTIVE_WITHDRAWAL' END,
        CASE WHEN EXISTS (SELECT 1 FROM seller_incomes i JOIN seller_profiles sp ON sp.id = i.seller_id WHERE sp.user_id = ${userId} AND (i.available_amount_cent > 0 OR i.locked_amount_cent > 0)) THEN 'SELLER_BALANCE' END,
        CASE WHEN EXISTS (SELECT 1 FROM seller_liabilities l JOIN seller_profiles sp ON sp.id = l.seller_id WHERE sp.user_id = ${userId} AND l.outstanding_amount_cent > 0) THEN 'SELLER_LIABILITY' END
      ], NULL) AS blockers
    `);
    const value = result.rows[0]?.blockers;
    return Array.isArray(value) ? value.map(String) : [];
  }

  private async issueSmsCode(phone: string, phoneHash: string, purpose: SmsPurpose) {
    const minimumCreatedAt = new Date(Date.now() - this.config.smsMinimumIntervalSeconds * 1_000);
    const [recent] = await this.database.db.select({ id: smsCodes.id }).from(smsCodes).where(and(eq(smsCodes.phoneHash, phoneHash), eq(smsCodes.purpose, purpose), sql`${smsCodes.createdAt} > ${minimumCreatedAt}`)).orderBy(desc(smsCodes.createdAt)).limit(1);
    if (recent) throw new AppError({ code: errorCodes.AUTH_SMS_RATE_LIMITED, message: "验证码发送过于频繁，请稍后重试", statusCode: 429 });
    const code = this.config.smsProviderMode === "development" ? this.config.smsDevelopmentCode : String(randomInt(100_000, 1_000_000));
    const expiresAt = new Date(Date.now() + this.config.smsCodeTtlSeconds * 1_000);
    await this.database.db.insert(smsCodes).values({ id: uuidv7(), phoneHash, purpose, codeHash: this.smsCodeHash(phoneHash, purpose, code), maxAttempts: this.config.smsMaxAttempts, expiresAt });
    await this.smsProvider.sendCode({ phone, code, expiresInSeconds: this.config.smsCodeTtlSeconds, purpose });
  }

  private recordPhoneSecurityEvent(tx: Pick<DatabaseTransaction, "insert">, userId: string, phoneChangeRequestId: string, eventType: string, status: "OPEN" | "RESOLVED", riskScore: number, metadata: RequestMetadata) {
    return tx.insert(securityLogs).values({ id: uuidv7(), userId, eventType, status, riskScore, metadataJson: { phone_change_request_id: phoneChangeRequestId, request_id: metadata.requestId }, ip: metadata.ip, userAgent: metadata.userAgent });
  }

  private async consumeSmsCode(tx: DatabaseTransaction, phoneHash: string, purpose: SmsPurpose, code: string): Promise<SmsResult> {
    const [record] = await tx.select().from(smsCodes).where(and(eq(smsCodes.phoneHash, phoneHash), eq(smsCodes.purpose, purpose))).orderBy(desc(smsCodes.createdAt)).limit(1).for("update");
    if (!record || record.consumedAt) return { ok: false, code: "INVALID" };
    if (record.expiresAt <= new Date()) return { ok: false, code: "EXPIRED" };
    if (record.attemptCount >= record.maxAttempts) return { ok: false, code: "ATTEMPTS" };
    if (!this.protector.hashesEqual(record.codeHash, this.smsCodeHash(phoneHash, purpose, code))) {
      await tx.update(smsCodes).set({ attemptCount: sql`${smsCodes.attemptCount} + 1` }).where(and(eq(smsCodes.id, record.id), isNull(smsCodes.consumedAt)));
      return { ok: false, code: record.attemptCount + 1 >= record.maxAttempts ? "ATTEMPTS" : "INVALID" };
    }
    const consumedAt = new Date();
    const rows = await tx.update(smsCodes).set({ consumedAt }).where(and(eq(smsCodes.id, record.id), isNull(smsCodes.consumedAt))).returning({ id: smsCodes.id });
    return rows[0] ? { ok: true, id: rows[0].id } : { ok: false, code: "INVALID" };
  }

  private smsCodeHash(phoneHash: string, purpose: SmsPurpose, code: string) { return this.protector.authHash("sms-code", `${phoneHash}:${purpose}:${code}`); }

  private async cancellationWaitingMs(tx: DatabaseTransaction) {
    const [row] = await tx.select({ value: platformConfigs.valueJson }).from(platformConfigs).where(and(eq(platformConfigs.configKey, "account_cancellation_waiting_seconds"), eq(platformConfigs.status, "ACTIVE"))).limit(1);
    const seconds = row?.value && typeof row.value === "object" && "seconds" in row.value ? Number((row.value as { seconds?: unknown }).seconds) : NaN;
    return Number.isInteger(seconds) && seconds >= 60 && seconds <= 31_536_000 ? seconds * 1_000 : CANCELLATION_WAITING_MS;
  }
}

export class UserLifecycleJobProcessor {
  private readonly outbox = new OutboxService();
  constructor(private readonly database: DatabaseClient, private readonly config: ApiConfig, private readonly storage: ObjectStorageProvider) {}

  async process(jobType: string, targetId: string, traceId?: string) {
    if (jobType === USER_LIFECYCLE_JOB_TYPES.PHONE_CHANGE_EXPIRE) return this.expirePhoneChange(targetId);
    if (jobType === USER_LIFECYCLE_JOB_TYPES.DATA_EXPORT_GENERATE) return this.generateExport(targetId, traceId);
    if (jobType === USER_LIFECYCLE_JOB_TYPES.DATA_EXPORT_EXPIRE) return this.expireExport(targetId, traceId);
    if (jobType === USER_LIFECYCLE_JOB_TYPES.ACCOUNT_CANCELLATION_COMPLETE) return this.completeCancellation(targetId, traceId);
    throw new LifecycleTaskError("unsupported_user_lifecycle_job", false);
  }

  private async expirePhoneChange(id: string) {
    const [row] = await this.database.db.select().from(phoneChangeRequests).where(eq(phoneChangeRequests.id, id)).limit(1);
    if (!row || (["COMPLETED", "CANCELLED", "EXPIRED"] as PhoneStatus[]).includes(row.status)) return;
    const updated = await this.database.db.update(phoneChangeRequests).set({ status: "EXPIRED", version: sql`${phoneChangeRequests.version} + 1`, updatedAt: new Date() })
      .where(and(eq(phoneChangeRequests.id, id), eq(phoneChangeRequests.status, row.status), eq(phoneChangeRequests.version, row.version), sql`${phoneChangeRequests.expiresAt} <= now()`)).returning({ id: phoneChangeRequests.id });
    if (!updated[0]) throw new LifecycleTaskError("phone_change_expiry_race", true);
  }

  private async generateExport(id: string, traceId?: string) {
    const [job] = await this.database.db.select().from(personalDataExportJobs).where(eq(personalDataExportJobs.id, id)).limit(1);
    if (!job || job.status === "COMPLETED" || job.status === "EXPIRED") return;
    if (!(["PENDING", "PROCESSING"] as ExportStatus[]).includes(job.status)) throw new LifecycleTaskError("data_export_terminal", false);
    let processing = job;
    if (job.status === "PENDING") {
      const [updated] = await this.database.db.update(personalDataExportJobs).set({ status: "PROCESSING", startedAt: new Date(), version: sql`${personalDataExportJobs.version} + 1`, updatedAt: new Date() })
        .where(and(eq(personalDataExportJobs.id, id), eq(personalDataExportJobs.status, "PENDING"), eq(personalDataExportJobs.version, job.version))).returning();
      if (!updated) throw new LifecycleTaskError("data_export_claim_race", true);
      processing = updated;
    }
    const bytes = Buffer.from(JSON.stringify(await this.exportPayload(processing.userId), null, 2), "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const fileId = uuidv7(); const objectKey = `data-exports/${processing.userId}/${processing.id}.json`;
    const upload = await this.storage.createUploadRequest({ bucket: this.config.filePrivateBucket, objectKey, contentType: "application/json", sizeBytes: bytes.byteLength, sha256, expiresInSeconds: 60 });
    const response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: bytes });
    if (!response.ok) throw new LifecycleTaskError("data_export_object_write_failed", true);
    await this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(personalDataExportJobs).where(eq(personalDataExportJobs.id, id)).limit(1).for("update");
      if (!current || current.status === "COMPLETED") return;
      if (current.status !== "PROCESSING") throw new LifecycleTaskError("data_export_status_changed", false);
      await tx.insert(files).values({ id: fileId, ownerUserId: current.userId, bucket: this.config.filePrivateBucket, objectKey, fileType: "DATA_EXPORT", mimeType: "application/json", sizeBytes: BigInt(bytes.byteLength), sha256, uploadStatus: "VERIFIED", moderationStatus: "APPROVED", visibility: "SIGNED" });
      await tx.insert(fileUsages).values({ id: uuidv7(), fileId, usageType: "EXPORT", targetType: "USER", targetId: current.userId });
      const now = new Date();
      const updated = await tx.update(personalDataExportJobs).set({ status: "COMPLETED", outputFileId: fileId, finishedAt: now, version: sql`${personalDataExportJobs.version} + 1`, updatedAt: now })
        .where(and(eq(personalDataExportJobs.id, id), eq(personalDataExportJobs.status, "PROCESSING"), eq(personalDataExportJobs.version, current.version))).returning({ id: personalDataExportJobs.id });
      if (!updated[0]) throw new LifecycleTaskError("data_export_completion_race", true);
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: current.userId, eventType: "PersonalDataExportReady", payload: { user_id: current.userId, export_id: id, file_id: fileId }, traceId });
    });
  }

  private async expireExport(id: string, traceId?: string) {
    const [row] = await this.database.db.select().from(personalDataExportJobs).where(eq(personalDataExportJobs.id, id)).limit(1);
    if (!row || row.status === "EXPIRED") return;
    if (row.expiresAt > new Date()) throw new LifecycleTaskError("data_export_not_due", true);
    if (row.status !== "COMPLETED" || !row.outputFileId) throw new LifecycleTaskError("data_export_not_ready_at_expiry", true);
    await this.database.db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.update(personalDataExportJobs).set({ status: "EXPIRED", version: sql`${personalDataExportJobs.version} + 1`, updatedAt: now })
        .where(and(eq(personalDataExportJobs.id, id), eq(personalDataExportJobs.status, "COMPLETED"), eq(personalDataExportJobs.version, row.version))).returning({ userId: personalDataExportJobs.userId });
      if (!updated[0]) return;
      await tx.update(fileUsages).set({ deletedAt: now }).where(and(eq(fileUsages.fileId, row.outputFileId!), eq(fileUsages.usageType, "EXPORT"), isNull(fileUsages.deletedAt)));
      await tx.update(files).set({ uploadStatus: "DELETED", deletedAt: now, updatedAt: now }).where(and(eq(files.id, row.outputFileId!), isNull(files.deletedAt)));
      await tx.insert(scheduledJobs).values({ id: uuidv7(), jobKey: `file:delete:${row.outputFileId}`, jobType: "FILE_OBJECT_DELETE", targetType: "PLATFORM", targetId: row.outputFileId!, payloadJson: {}, runAt: now, maxAttempts: this.config.fileLifecycleMaxAttempts }).onConflictDoNothing({ target: scheduledJobs.jobKey });
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: updated[0].userId, eventType: "PersonalDataExportExpired", payload: { user_id: updated[0].userId, export_id: id }, traceId });
    });
  }

  private async completeCancellation(id: string, traceId?: string) {
    const [candidate] = await this.database.db.select().from(accountCancellationRequests).where(eq(accountCancellationRequests.id, id)).limit(1);
    if (!candidate || candidate.status === "COMPLETED" || candidate.status === "CANCELLED" || candidate.status === "REJECTED") return;
    if (candidate.waitingPeriodEndsAt > new Date()) throw new LifecycleTaskError("account_cancellation_not_due", true);
    const blockers = await cancellationBlockers(this.database, candidate.userId);
    if (blockers.length) throw new LifecycleTaskError("account_cancellation_blocked", true);
    await this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(accountCancellationRequests).where(eq(accountCancellationRequests.id, id)).limit(1).for("update");
      if (!current || current.status !== "REQUESTED") return;
      const now = new Date();
      const [processing] = await tx.update(accountCancellationRequests).set({ status: "PROCESSING", processingAt: now, version: sql`${accountCancellationRequests.version} + 1`, updatedAt: now })
        .where(and(eq(accountCancellationRequests.id, id), eq(accountCancellationRequests.status, "REQUESTED"), eq(accountCancellationRequests.version, current.version))).returning();
      if (!processing) throw new LifecycleTaskError("account_cancellation_claim_race", true);
      const [user] = await tx.select({ version: users.version, status: users.status }).from(users).where(eq(users.id, current.userId)).limit(1).for("update");
      if (!user || user.status !== "NORMAL") throw new LifecycleTaskError("account_cancellation_user_invalid", false);
      const changed = await tx.update(users).set({ status: "CANCELLED", cancelledAt: now, version: sql`${users.version} + 1`, updatedAt: now })
        .where(and(eq(users.id, current.userId), eq(users.status, "NORMAL"), eq(users.version, user.version))).returning({ id: users.id });
      if (!changed[0]) throw new LifecycleTaskError("account_cancellation_user_race", true);
      const completed = await tx.update(accountCancellationRequests).set({ status: "COMPLETED", completedAt: now, version: sql`${accountCancellationRequests.version} + 1`, updatedAt: now })
        .where(and(eq(accountCancellationRequests.id, id), eq(accountCancellationRequests.status, "PROCESSING"), eq(accountCancellationRequests.version, processing.version))).returning({ id: accountCancellationRequests.id });
      if (!completed[0]) throw new LifecycleTaskError("account_cancellation_completion_race", true);
      await tx.update(authSessions).set({ revokedAt: now, lastUsedAt: now }).where(and(eq(authSessions.userId, current.userId), isNull(authSessions.revokedAt)));
      await this.outbox.enqueue(tx, { aggregateType: "USER", aggregateId: current.userId, eventType: "AccountCancellationCompleted", payload: { user_id: current.userId, request_id: id, completed_at: now.toISOString() }, traceId });
    });
  }

  private async exportPayload(userId: string) {
    const [user, profile, privacy, acceptances] = await Promise.all([
      this.database.db.select({ id: users.id, phoneMask: users.phoneMask, status: users.status, profileInitialized: users.profileInitialized, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1),
      this.database.db.select({ nickname: userProfiles.nickname, bio: userProfiles.bio, publicUserNo: userProfiles.publicUserNo, createdAt: userProfiles.createdAt }).from(userProfiles).where(and(eq(userProfiles.userId, userId), isNull(userProfiles.deletedAt))).limit(1),
      this.database.db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1),
      this.database.db.select({ policyVersionId: userPolicyAcceptances.policyVersionId, scene: userPolicyAcceptances.acceptanceScene, method: userPolicyAcceptances.confirmationMethod, acceptedAt: userPolicyAcceptances.acceptedAt }).from(userPolicyAcceptances).where(eq(userPolicyAcceptances.userId, userId)),
    ]);
    if (!user[0]) throw new LifecycleTaskError("data_export_user_missing", false);
    return { schema_version: 1, generated_at: new Date().toISOString(), account: { ...user[0], phone: user[0].phoneMask }, profile: profile[0] ?? null, privacy_settings: privacy[0] ?? null, policy_acceptances: acceptances };
  }
}

class LifecycleTaskError extends Error { constructor(readonly category: string, readonly retryable: boolean) { super(category); } }

async function cancellationBlockers(database: DatabaseClient, userId: string) {
  const result = await database.db.execute(sql`
    SELECT array_remove(ARRAY[
      CASE WHEN EXISTS (SELECT 1 FROM orders WHERE (buyer_id = ${userId} OR seller_user_id = ${userId}) AND status NOT IN ('COMPLETED','CANCELLED','CLOSED','SELLER_REJECTED')) THEN 'ACTIVE_ORDER' END,
      CASE WHEN EXISTS (SELECT 1 FROM refunds r JOIN orders o ON o.id = r.order_id WHERE (o.buyer_id = ${userId} OR o.seller_user_id = ${userId}) AND r.status IN ('REQUESTED','SELLER_APPROVED','SELLER_REJECTED','NEGOTIATING','PLATFORM_REVIEW','REFUND_PROCESSING')) THEN 'ACTIVE_REFUND' END,
      CASE WHEN EXISTS (SELECT 1 FROM complaints c LEFT JOIN seller_profiles sp ON sp.id = c.target_seller_id WHERE (c.reporter_id = ${userId} OR c.target_user_id = ${userId} OR sp.user_id = ${userId}) AND c.status NOT IN ('COMPLETED','CLOSED')) THEN 'ACTIVE_COMPLAINT' END,
      CASE WHEN EXISTS (SELECT 1 FROM withdrawals w JOIN seller_profiles sp ON sp.id = w.seller_id WHERE sp.user_id = ${userId} AND w.status IN ('CREATED','RISK_REVIEW','APPROVED','PAYOUT_PROCESSING')) THEN 'ACTIVE_WITHDRAWAL' END,
      CASE WHEN EXISTS (SELECT 1 FROM seller_incomes i JOIN seller_profiles sp ON sp.id = i.seller_id WHERE sp.user_id = ${userId} AND (i.available_amount_cent > 0 OR i.locked_amount_cent > 0)) THEN 'SELLER_BALANCE' END,
      CASE WHEN EXISTS (SELECT 1 FROM seller_liabilities l JOIN seller_profiles sp ON sp.id = l.seller_id WHERE sp.user_id = ${userId} AND l.outstanding_amount_cent > 0) THEN 'SELLER_LIABILITY' END
    ], NULL) AS blockers
  `);
  const value = result.rows[0]?.blockers;
  return Array.isArray(value) ? value.map(String) : [];
}

function phoneChangeView(row: typeof phoneChangeRequests.$inferSelect) { return { id: row.id, old_phone_mask: row.oldPhoneMask, new_phone_mask: row.newPhoneMask, status: row.status, expires_at: row.expiresAt, completed_at: row.completedAt, cancelled_at: row.cancelledAt, version: row.version, created_at: row.createdAt }; }
function exportView(row: typeof personalDataExportJobs.$inferSelect) { return { id: row.id, status: row.status, requested_at: row.requestedAt, started_at: row.startedAt, finished_at: row.finishedAt, expires_at: row.expiresAt, failure_code: row.failureCode, version: row.version }; }
function cancellationView(row: typeof accountCancellationRequests.$inferSelect) { return { id: row.id, user_id: row.userId, status: row.status, reason: row.reason, requested_at: row.requestedAt, waiting_period_ends_at: row.waitingPeriodEndsAt, cancelled_at: row.cancelledAt, completed_at: row.completedAt, rejected_at: row.rejectedAt, rejection_reason: row.rejectionReason, version: row.version }; }
function adminCancellationView(row: {
  request: typeof accountCancellationRequests.$inferSelect;
  nickname: string | null;
  publicUserNo: string | null;
  phoneMask: string;
  userStatus: typeof users.$inferSelect.status;
}) {
  const request = row.request;
  return {
    id: request.id,
    user_id: request.userId,
    user: { nickname: row.nickname ?? "未初始化用户", public_user_no: row.publicUserNo, phone_mask: row.phoneMask, status: row.userStatus },
    status: request.status,
    reason: request.reason,
    requested_at: request.requestedAt,
    waiting_period_ends_at: request.waitingPeriodEndsAt,
    processing_at: request.processingAt,
    cancelled_at: request.cancelledAt,
    completed_at: request.completedAt,
    rejected_at: request.rejectedAt,
    rejection_reason: request.rejectionReason,
    decision_admin_operation_log_id: request.decisionAdminOperationLogId,
    version: request.version,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
  };
}
function adminPhoneChangeView(row: { request: typeof phoneChangeRequests.$inferSelect; nickname: string | null; publicUserNo: string | null; userStatus: typeof users.$inferSelect.status }) {
  return {
    ...phoneChangeView(row.request), user_id: row.request.userId,
    user: { nickname: row.nickname ?? "未初始化用户", public_user_no: row.publicUserNo, status: row.userStatus },
    old_attempt_count: row.request.oldAttemptCount, new_attempt_count: row.request.newAttemptCount, max_attempts: row.request.maxAttempts,
    old_verified_at: row.request.oldVerifiedAt, new_verified_at: row.request.newVerifiedAt, updated_at: row.request.updatedAt,
  };
}
function adminDataExportView(row: { job: typeof personalDataExportJobs.$inferSelect; nickname: string | null; publicUserNo: string | null; phoneMask: string; userStatus: typeof users.$inferSelect.status }) {
  return {
    ...exportView(row.job), user_id: row.job.userId,
    user: { nickname: row.nickname ?? "未初始化用户", public_user_no: row.publicUserNo, phone_mask: row.phoneMask, status: row.userStatus },
    updated_at: row.job.updatedAt,
  };
}
function phoneSecurityRequestId(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return null; const requestId = (value as Record<string, unknown>).request_id; return typeof requestId === "string" ? requestId : null; }
function versionConflict(subject: string) { return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: `${subject}已变化，请刷新后重试`, statusCode: 409 }); }
function lifecycleConflict(code: ErrorCode, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function unavailableUser() { return new AppError({ code: errorCodes.USER_DISABLED, message: "账号当前不可执行该操作", statusCode: 403 }); }
function idempotencyConflict() { return new AppError({ code: errorCodes.IDEMPOTENCY_KEY_CONFLICT, message: "相同幂等键对应了不同请求", statusCode: 409 }); }
function validation(field: string, message: string) { return new AppError({ code: errorCodes.VALIDATION_FAILED, message, statusCode: 400, fieldErrors: [{ field, code: "INVALID", message }] }); }
function cancellationBlocked(blockers: string[]) { return new AppError({ code: "ACCOUNT_CANCELLATION_BLOCKED", message: "当前账号存在未完成业务，暂不能申请注销", statusCode: 409, details: { blocker_codes: blockers } }); }
function throwSmsError(result: Exclude<SmsResult, { ok: true }>): never { if (result.code === "EXPIRED") throw new AppError({ code: errorCodes.AUTH_SMS_CODE_EXPIRED, message: "验证码已过期", statusCode: 400 }); if (result.code === "ATTEMPTS") throw new AppError({ code: errorCodes.AUTH_SMS_ATTEMPTS_EXCEEDED, message: "验证码错误次数过多，请重新获取", statusCode: 400 }); throw new AppError({ code: errorCodes.AUTH_SMS_CODE_INVALID, message: "验证码错误或已使用", statusCode: 400 }); }
