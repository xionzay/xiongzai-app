import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "@xiongzai/contracts";
import { files, fileUsages, scheduledJobs, uuidv7, type DatabaseClient } from "@xiongzai/database";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { JsonLogger } from "@xiongzai/observability";
import type { ApiConfig } from "./config.js";
import type { ObjectLocation, ObjectStorageProvider } from "./object-storage-provider.js";
import { API_CONFIG, API_LOGGER, DATABASE_CLIENT, OBJECT_STORAGE_PROVIDER } from "./tokens.js";

export const FILE_LIFECYCLE_JOB_TYPES = {
  DELETE_OBJECT: "FILE_OBJECT_DELETE",
  CLEANUP_UPLOAD: "FILE_UPLOAD_CLEANUP",
  DELETE_STALE_OBJECT: "FILE_STALE_OBJECT_DELETE",
} as const;

export type FileLifecycleJobType = typeof FILE_LIFECYCLE_JOB_TYPES[keyof typeof FILE_LIFECYCLE_JOB_TYPES];

export interface FileLifecycleClaimedJob {
  id: string;
  jobType: string;
  targetId: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export type OrphanCategory =
  | "database_soft_deleted_object_present"
  | "database_task_failed_object_present"
  | "storage_without_database_record"
  | "database_record_object_missing";

export interface OrphanAuditReport {
  readOnly: true;
  scannedObjects: number;
  checkedDatabaseRecords: number;
  truncated: boolean;
  counts: Record<OrphanCategory, number>;
  findings: Array<{ category: OrphanCategory; locationId: string; fileId: string | null }>;
}

@Injectable()
export class FileLifecycleService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    @Inject(API_LOGGER) private readonly logger: JsonLogger,
  ) {}

  async requestOwnedDeletion(userId: string, fileId: string): Promise<{ id: string; deleted: true }> {
    const now = new Date();
    const result = await this.database.db.transaction(async (tx) => {
      const [row] = await tx.select().from(files).where(and(eq(files.id, fileId), eq(files.ownerUserId, userId))).limit(1).for("update");
      if (!row) throw new AppError({ code: "FILE_NOT_FOUND", message: "文件不存在或无权访问", statusCode: 404 });
      const [usage] = await tx.select({ id: fileUsages.id }).from(fileUsages).where(and(eq(fileUsages.fileId, fileId), isNull(fileUsages.deletedAt))).limit(1);
      if (usage) throw new AppError({ code: "FILE_IN_USE", message: "文件仍被业务对象使用，不能删除", statusCode: 409 });
      if (!row.deletedAt) {
        await tx.update(files).set({ uploadStatus: "DELETED", deletedAt: now, updatedAt: now }).where(eq(files.id, fileId));
      }
      const jobId = uuidv7();
      const inserted = await tx.insert(scheduledJobs).values({
        id: jobId,
        jobKey: deleteJobKey(fileId),
        jobType: FILE_LIFECYCLE_JOB_TYPES.DELETE_OBJECT,
        targetType: "PLATFORM",
        targetId: fileId,
        payloadJson: {},
        runAt: now,
        maxAttempts: this.config.fileLifecycleMaxAttempts,
      }).onConflictDoNothing({ target: scheduledJobs.jobKey }).returning({ id: scheduledJobs.id });
      const [existing] = inserted.length > 0 ? inserted : await tx.select({ id: scheduledJobs.id }).from(scheduledJobs).where(eq(scheduledJobs.jobKey, deleteJobKey(fileId))).limit(1);
      return { jobId: existing?.id ?? null };
    });
    if (result.jobId) await this.runSpecificJob(result.jobId, "api-immediate-delete", now);
    return { id: fileId, deleted: true };
  }

  async enqueueDueJobs(now = new Date()): Promise<{ enqueued: number; expiredUploads: number; deletedFiles: number; elapsedMs: number }> {
    const startedAt = Date.now();
    const cutoff = new Date(now.getTime() - this.config.fileUploadSessionTtlSeconds * 1_000);
    const uploadCandidates = await this.database.db.select({ id: files.id, uploadStatus: files.uploadStatus }).from(files).where(and(
      eq(files.bucket, this.config.fileQuarantineBucket),
      isNull(files.deletedAt),
      or(
        and(inArray(files.uploadStatus, ["PENDING", "UPLOADED"]), lt(files.createdAt, cutoff)),
        eq(files.uploadStatus, "FAILED"),
        this.config.fileRejectedRetentionSeconds > 0
          ? and(eq(files.uploadStatus, "VERIFIED"), eq(files.moderationStatus, "REJECTED"), lt(files.updatedAt, new Date(now.getTime() - this.config.fileRejectedRetentionSeconds * 1_000)))
          : undefined,
      ),
    )).limit(this.config.fileLifecycleSweepBatchSize);
    const deletedCandidates = await this.database.db.select({ id: files.id }).from(files).where(and(eq(files.uploadStatus, "DELETED"), sql`${files.deletedAt} IS NOT NULL`)).limit(this.config.fileLifecycleSweepBatchSize);

    const values = [
      ...uploadCandidates.map((row) => ({
        id: uuidv7(), jobKey: cleanupJobKey(row.id), jobType: FILE_LIFECYCLE_JOB_TYPES.CLEANUP_UPLOAD,
        targetType: "PLATFORM" as const, targetId: row.id,
        payloadJson: { reason: row.uploadStatus === "FAILED" ? "FAILED_UPLOAD" : row.uploadStatus === "VERIFIED" ? "REJECTED_RETENTION" : "EXPIRED_UPLOAD" },
        runAt: now, maxAttempts: this.config.fileLifecycleMaxAttempts,
      })),
      ...deletedCandidates.map((row) => ({
        id: uuidv7(), jobKey: deleteJobKey(row.id), jobType: FILE_LIFECYCLE_JOB_TYPES.DELETE_OBJECT,
        targetType: "PLATFORM" as const, targetId: row.id, payloadJson: {}, runAt: now, maxAttempts: this.config.fileLifecycleMaxAttempts,
      })),
    ];
    const inserted = values.length === 0 ? [] : await this.database.db.insert(scheduledJobs).values(values).onConflictDoNothing({ target: scheduledJobs.jobKey }).returning({ id: scheduledJobs.id });
    const result = { enqueued: inserted.length, expiredUploads: uploadCandidates.filter((row) => row.uploadStatus === "PENDING" || row.uploadStatus === "UPLOADED").length, deletedFiles: deletedCandidates.length, elapsedMs: Date.now() - startedAt };
    this.logger.info("file_lifecycle_sweep_completed", { enqueued_count: result.enqueued, expired_upload_count: result.expiredUploads, deleted_file_count: result.deletedFiles, elapsed_ms: result.elapsedMs });
    return result;
  }

  async runSpecificJob(jobId: string, workerId: string, now = new Date()): Promise<"completed" | "retry_scheduled" | "permanent_failure" | "not_claimed"> {
    const startedAt = Date.now();
    const claimed = await this.database.db.execute(sql`
      UPDATE scheduled_jobs
      SET status = 'RUNNING', attempts = attempts + 1, locked_at = ${now}, locked_by = ${workerId}, updated_at = ${now}
      WHERE id = ${jobId} AND status = 'PENDING' AND run_at <= ${now}
      RETURNING id, job_type, target_id, payload_json, attempts, max_attempts
    `);
    const row = claimed.rows[0];
    if (!row) return "not_claimed";
    const job: FileLifecycleClaimedJob = {
      id: String(row.id), jobType: String(row.job_type), targetId: String(row.target_id), payload: row.payload_json,
      attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts),
    };
    try {
      await this.handleClaimedJob(job, now);
      await this.database.db.update(scheduledJobs).set({ status: "COMPLETED", completedAt: now, lockedAt: null, lockedBy: null, lastError: null, updatedAt: now }).where(and(eq(scheduledJobs.id, job.id), eq(scheduledJobs.status, "RUNNING"), eq(scheduledJobs.lockedBy, workerId)));
      this.logger.info("file_lifecycle_job_completed", { job_id: job.id, job_type: job.jobType, attempts: job.attempts, elapsed_ms: Date.now() - startedAt });
      return "completed";
    } catch (error) {
      const failure = classifyFailure(error);
      const exhausted = !failure.retryable || job.attempts >= job.maxAttempts;
      const nextRunAt = new Date(now.getTime() + retryDelayMs(job.attempts, job.id));
      await this.database.db.update(scheduledJobs).set({
        status: exhausted ? "FAILED" : "PENDING",
        runAt: exhausted ? undefined : nextRunAt,
        lockedAt: null,
        lockedBy: null,
        lastError: failure.category,
        updatedAt: now,
      }).where(and(eq(scheduledJobs.id, job.id), eq(scheduledJobs.status, "RUNNING"), eq(scheduledJobs.lockedBy, workerId)));
      this.logger.warn("file_lifecycle_job_failed", { job_id: job.id, job_type: job.jobType, attempts: job.attempts, error_category: failure.category, retryable: failure.retryable, exhausted, elapsed_ms: Date.now() - startedAt });
      return exhausted ? "permanent_failure" : "retry_scheduled";
    }
  }

  async handleClaimedJob(job: FileLifecycleClaimedJob, now = new Date()): Promise<void> {
    if (job.jobType === FILE_LIFECYCLE_JOB_TYPES.DELETE_OBJECT) return this.deleteSoftDeletedObject(job.targetId);
    if (job.jobType === FILE_LIFECYCLE_JOB_TYPES.CLEANUP_UPLOAD) return this.cleanupUpload(job.targetId, job.payload, now);
    if (job.jobType === FILE_LIFECYCLE_JOB_TYPES.DELETE_STALE_OBJECT) return this.deleteStaleObject(job.targetId, job.payload);
    throw new FileLifecycleTaskError("unsupported_job_type", false);
  }

  async metrics(now = new Date()): Promise<{ pendingDeletes: number; retrying: number; permanentFailures: number; expiredUploads: number }> {
    const cutoff = new Date(now.getTime() - this.config.fileUploadSessionTtlSeconds * 1_000);
    const [jobCounts] = await this.database.db.select({
      pendingDeletes: sql<number>`count(*) FILTER (WHERE ${scheduledJobs.jobType} IN (${FILE_LIFECYCLE_JOB_TYPES.DELETE_OBJECT}, ${FILE_LIFECYCLE_JOB_TYPES.DELETE_STALE_OBJECT}) AND ${scheduledJobs.status} = 'PENDING')::int`,
      retrying: sql<number>`count(*) FILTER (WHERE ${scheduledJobs.status} = 'PENDING' AND ${scheduledJobs.attempts} > 0)::int`,
      permanentFailures: sql<number>`count(*) FILTER (WHERE ${scheduledJobs.status} = 'FAILED')::int`,
    }).from(scheduledJobs).where(inArray(scheduledJobs.jobType, Object.values(FILE_LIFECYCLE_JOB_TYPES)));
    const [uploadCounts] = await this.database.db.select({ count: sql<number>`count(*)::int` }).from(files).where(and(eq(files.bucket, this.config.fileQuarantineBucket), isNull(files.deletedAt), inArray(files.uploadStatus, ["PENDING", "UPLOADED"]), lt(files.createdAt, cutoff)));
    return { pendingDeletes: jobCounts?.pendingDeletes ?? 0, retrying: jobCounts?.retrying ?? 0, permanentFailures: jobCounts?.permanentFailures ?? 0, expiredUploads: uploadCounts?.count ?? 0 };
  }

  async auditOrphans(input: { buckets?: string[]; prefix?: string; maxObjects?: number; pageSize?: number } = {}): Promise<OrphanAuditReport> {
    const allowedBuckets = new Set([this.config.fileQuarantineBucket, this.config.filePublicBucket, this.config.filePrivateBucket]);
    const buckets = input.buckets ?? [...allowedBuckets];
    if (buckets.some((bucket) => !allowedBuckets.has(bucket))) throw new AppError({ code: "FILE_STORAGE_INVALID_LOCATION", message: "孤儿审计 Bucket 不在允许范围内", statusCode: 400 });
    const maximum = Math.min(Math.max(input.maxObjects ?? this.config.fileOrphanAuditMaxObjects, 1), this.config.fileOrphanAuditMaxObjects);
    const pageSize = Math.min(Math.max(input.pageSize ?? this.config.fileOrphanAuditPageSize, 1), this.config.fileOrphanAuditPageSize);
    const findings: OrphanAuditReport["findings"] = [];
    let scannedObjects = 0;
    let checkedDatabaseRecords = 0;
    let truncated = false;

    for (const bucket of buckets) {
      let cursor: string | undefined;
      do {
        const remaining = maximum - scannedObjects;
        if (remaining <= 0) { truncated = true; break; }
        const page = await this.storage.listObjects({ bucket, prefix: input.prefix, cursor, limit: Math.min(pageSize, remaining) });
        for (const object of page.objects) {
          scannedObjects += 1;
          const [record] = await this.database.db.select({ id: files.id, deletedAt: files.deletedAt }).from(files).where(and(eq(files.bucket, bucket), eq(files.objectKey, object.objectKey))).limit(1);
          if (!record) {
            findings.push({ category: "storage_without_database_record", locationId: locationId(bucket, object.objectKey), fileId: null });
            continue;
          }
          const [failedTask] = await this.database.db.select({ id: scheduledJobs.id }).from(scheduledJobs).where(and(eq(scheduledJobs.targetId, record.id), inArray(scheduledJobs.jobType, Object.values(FILE_LIFECYCLE_JOB_TYPES)), eq(scheduledJobs.status, "FAILED"))).limit(1);
          if (failedTask) findings.push({ category: "database_task_failed_object_present", locationId: locationId(bucket, object.objectKey), fileId: record.id });
          else if (record.deletedAt) findings.push({ category: "database_soft_deleted_object_present", locationId: locationId(bucket, object.objectKey), fileId: record.id });
        }
        cursor = page.truncated && page.nextCursor ? page.nextCursor : undefined;
        if (page.truncated && !cursor) { truncated = true; break; }
      } while (cursor);
      if (scannedObjects >= maximum) { truncated = true; break; }
    }

    const databaseRows = await this.database.db.select({ id: files.id, bucket: files.bucket, objectKey: files.objectKey }).from(files).where(inArray(files.bucket, buckets)).limit(maximum);
    for (const row of databaseRows) {
      checkedDatabaseRecords += 1;
      try { await this.storage.headObject({ bucket: row.bucket, objectKey: row.objectKey }); }
      catch (error) {
        if (isObjectMissing(error)) findings.push({ category: "database_record_object_missing", locationId: locationId(row.bucket, row.objectKey), fileId: row.id });
        else throw error;
      }
    }
    const counts: Record<OrphanCategory, number> = { database_soft_deleted_object_present: 0, database_task_failed_object_present: 0, storage_without_database_record: 0, database_record_object_missing: 0 };
    for (const finding of findings) counts[finding.category] += 1;
    return { readOnly: true, scannedObjects, checkedDatabaseRecords, truncated, counts, findings };
  }

  async deleteStage6TestObject(location: ObjectLocation): Promise<void> {
    if (location.bucket !== this.config.fileQuarantineBucket || !/^stage6-tests\/[0-9a-f-]{36}\/[a-z0-9._-]+$/u.test(location.objectKey)) {
      throw new AppError({ code: "FILE_STORAGE_INVALID_LOCATION", message: "仅允许精确清理阶段 6 唯一测试前缀对象", statusCode: 400 });
    }
    await this.storage.deleteObject(location);
  }

  private async deleteSoftDeletedObject(fileId: string): Promise<void> {
    const [row] = await this.database.db.select().from(files).where(eq(files.id, fileId)).limit(1);
    if (!row) return;
    if (!row.deletedAt || row.uploadStatus !== "DELETED") throw new FileLifecycleTaskError("file_not_soft_deleted", false);
    await this.assertNoUsage(fileId);
    this.assertManagedLocation(row);
    await this.deleteExact({ bucket: row.bucket, objectKey: row.objectKey });
  }

  private async cleanupUpload(fileId: string, payload: unknown, now: Date): Promise<void> {
    const reason = cleanupReason(payload);
    const cutoff = new Date(now.getTime() - this.config.fileUploadSessionTtlSeconds * 1_000);
    const row = await this.database.db.transaction(async (tx) => {
      const [candidate] = await tx.select().from(files).where(eq(files.id, fileId)).limit(1).for("update");
      if (!candidate) return null;
      if (candidate.bucket !== this.config.fileQuarantineBucket) throw new FileLifecycleTaskError("cleanup_outside_quarantine", false);
      const [usage] = await tx.select({ id: fileUsages.id }).from(fileUsages).where(and(eq(fileUsages.fileId, fileId), isNull(fileUsages.deletedAt))).limit(1);
      if (usage) throw new FileLifecycleTaskError("file_still_in_use", false);
      if (reason === "REJECTED_RETENTION") {
        const retentionCutoff = new Date(now.getTime() - this.config.fileRejectedRetentionSeconds * 1_000);
        if (this.config.fileRejectedRetentionSeconds === 0 || candidate.uploadStatus !== "VERIFIED" || candidate.moderationStatus !== "REJECTED" || candidate.updatedAt >= retentionCutoff) return null;
        await tx.update(files).set({ uploadStatus: "DELETED", deletedAt: now, updatedAt: now }).where(eq(files.id, fileId));
        return candidate;
      }
      if ((candidate.uploadStatus === "PENDING" || candidate.uploadStatus === "UPLOADED") && candidate.createdAt >= cutoff) throw new FileLifecycleTaskError("upload_not_expired", true);
      if (candidate.uploadStatus === "PENDING" || candidate.uploadStatus === "UPLOADED") {
        await tx.update(files).set({ uploadStatus: "FAILED", updatedAt: now }).where(eq(files.id, fileId));
        return candidate;
      }
      if (candidate.uploadStatus === "FAILED" || candidate.uploadStatus === "DELETED") return candidate;
      return null;
    });
    if (!row) return;
    this.assertManagedLocation(row);
    await this.deleteExact({ bucket: row.bucket, objectKey: row.objectKey });
  }

  private async deleteStaleObject(fileId: string, payload: unknown): Promise<void> {
    const location = staleLocation(payload);
    const [row] = await this.database.db.select({ bucket: files.bucket, objectKey: files.objectKey }).from(files).where(eq(files.id, fileId)).limit(1);
    if (!row) throw new FileLifecycleTaskError("file_record_missing", false);
    if (row.bucket === location.bucket && row.objectKey === location.objectKey) throw new FileLifecycleTaskError("stale_location_is_current", false);
    this.assertManagedLocation(location);
    await this.deleteExact(location);
  }

  private async assertNoUsage(fileId: string): Promise<void> {
    const [usage] = await this.database.db.select({ id: fileUsages.id }).from(fileUsages).where(and(eq(fileUsages.fileId, fileId), isNull(fileUsages.deletedAt))).limit(1);
    if (usage) throw new FileLifecycleTaskError("file_still_in_use", false);
  }

  private assertManagedLocation(location: ObjectLocation): void {
    if (![this.config.fileQuarantineBucket, this.config.filePublicBucket, this.config.filePrivateBucket].includes(location.bucket) || !location.objectKey || location.objectKey.includes("\0") || location.objectKey.includes("\\")) {
      throw new FileLifecycleTaskError("invalid_object_location", false);
    }
  }

  private async deleteExact(location: ObjectLocation): Promise<void> {
    try { await this.storage.deleteObject(location); }
    catch (error) {
      if (isObjectMissing(error)) return;
      const failure = classifyFailure(error);
      throw new FileLifecycleTaskError(failure.category, failure.retryable);
    }
  }
}

export class FileLifecycleTaskError extends Error {
  constructor(readonly category: string, readonly retryable: boolean) { super(category); this.name = "FileLifecycleTaskError"; }
}

export function retryDelayMs(attempts: number, stableSeed: string): number {
  const base = Math.min(300_000, 2_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 8));
  const hash = createHash("sha256").update(`${stableSeed}:${attempts}`).digest();
  const jitter = 0.75 + (hash.readUInt16BE(0) / 65_535) * 0.5;
  return Math.max(1_000, Math.round(base * jitter));
}

function classifyFailure(error: unknown): { category: string; retryable: boolean } {
  if (error instanceof FileLifecycleTaskError) return { category: error.category, retryable: error.retryable };
  const code = error instanceof AppError
    ? error.code
    : error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : null;
  if (code && ["FILE_STORAGE_PERMISSION_DENIED", "FILE_STORAGE_INVALID_LOCATION", "FILE_STORAGE_UNAVAILABLE"].includes(code)) return { category: code.toLowerCase(), retryable: false };
  if (code === "FILE_OBJECT_NOT_FOUND") return { category: "object_already_absent", retryable: false };
  if (code === "FILE_STORAGE_DELETE_FAILED") return { category: "storage_temporary_failure", retryable: true };
  return { category: "storage_unknown_failure", retryable: true };
}

function isObjectMissing(error: unknown): boolean { return error instanceof AppError ? error.code === "FILE_OBJECT_NOT_FOUND" : Boolean(error && typeof error === "object" && "code" in error && error.code === "FILE_OBJECT_NOT_FOUND"); }
function deleteJobKey(fileId: string): string { return `file:delete:${fileId}`; }
function cleanupJobKey(fileId: string): string { return `file:upload-cleanup:${fileId}`; }
export function staleDeleteJobKey(fileId: string, location: ObjectLocation): string { return `file:stale-delete:${fileId}:${locationId(location.bucket, location.objectKey)}`; }
function cleanupReason(payload: unknown): "EXPIRED_UPLOAD" | "FAILED_UPLOAD" | "REJECTED_RETENTION" {
  if (payload && typeof payload === "object" && "reason" in payload && ["EXPIRED_UPLOAD", "FAILED_UPLOAD", "REJECTED_RETENTION"].includes(String(payload.reason))) return String(payload.reason) as "EXPIRED_UPLOAD" | "FAILED_UPLOAD" | "REJECTED_RETENTION";
  throw new FileLifecycleTaskError("invalid_cleanup_payload", false);
}
function staleLocation(payload: unknown): ObjectLocation {
  if (!payload || typeof payload !== "object" || !("bucket" in payload) || !("object_key" in payload) || typeof payload.bucket !== "string" || typeof payload.object_key !== "string") {
    throw new FileLifecycleTaskError("invalid_stale_location_payload", false);
  }
  return { bucket: payload.bucket, objectKey: payload.object_key };
}
function locationId(bucket: string, objectKey: string): string { return createHash("sha256").update(bucket).update("\0").update(objectKey).digest("hex").slice(0, 16); }
