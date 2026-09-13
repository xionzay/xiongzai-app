import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { scheduledJobs, type Database } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";

export interface ClaimedJob {
  id: string;
  jobKey: string;
  jobType: string;
  targetType: string;
  targetId: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export interface ScheduledJobRepository {
  claim(batchSize: number, schedulerId: string): Promise<ClaimedJob[]>;
  complete(id: string): Promise<void>;
  fail(id: string, attempts: number, maxAttempts: number, error: unknown): Promise<void>;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

export class DrizzleScheduledJobRepository implements ScheduledJobRepository {
  constructor(private readonly database: Database, private readonly options: { now?: () => Date; lockTimeoutMs?: number } = {}) {}

  async claim(batchSize: number, schedulerId: string): Promise<ClaimedJob[]> {
    return this.database.transaction(async (tx) => {
      const lockTimeoutMs = this.options.lockTimeoutMs ?? 300_000;
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id FROM scheduled_jobs
          WHERE (status = 'PENDING' AND run_at <= now())
             OR (status = 'RUNNING' AND locked_at <= now() - (${lockTimeoutMs} * interval '1 millisecond'))
          ORDER BY run_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${batchSize}
        )
        UPDATE scheduled_jobs AS job
        SET status = 'RUNNING', attempts = job.attempts + 1,
          locked_at = now(), locked_by = ${schedulerId}, updated_at = now()
        FROM candidates
        WHERE job.id = candidates.id
        RETURNING job.id, job.job_key, job.job_type, job.target_type, job.target_id,
          job.payload_json, job.attempts, job.max_attempts
      `);
      return result.rows.map((row) => ({
        id: String(row.id), jobKey: String(row.job_key), jobType: String(row.job_type),
        targetType: String(row.target_type), targetId: String(row.target_id), payload: row.payload_json,
        attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts),
      }));
    });
  }

  async complete(id: string): Promise<void> {
    const now = this.options.now?.() ?? new Date();
    await this.database.update(scheduledJobs).set({ status: "COMPLETED", completedAt: now, lockedAt: null, lockedBy: null, lastError: null, updatedAt: now }).where(sql`${scheduledJobs.id} = ${id}`);
  }

  async fail(id: string, attempts: number, maxAttempts: number, error: unknown): Promise<void> {
    const failure = safeFailure(error);
    const exhausted = !failure.retryable || attempts >= maxAttempts;
    const now = this.options.now?.() ?? new Date();
    await this.database.update(scheduledJobs).set({
      status: exhausted ? "FAILED" : "PENDING",
      lastError: failure.message,
      runAt: exhausted ? undefined : new Date(now.getTime() + retryDelayMs(attempts, id)),
      lockedAt: null,
      lockedBy: null,
      updatedAt: now,
    }).where(sql`${scheduledJobs.id} = ${id}`);
  }
}

export class Scheduler {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(
    private readonly repository: ScheduledJobRepository,
    private readonly logger: JsonLogger,
    private readonly schedulerId: string,
    private readonly batchSize: number,
  ) {}

  register(jobType: string, handler: JobHandler): void {
    if (this.handlers.has(jobType)) throw new Error(`Handler already registered: ${jobType}`);
    this.handlers.set(jobType, handler);
  }

  async runOnce(): Promise<number> {
    const batchStartedAt = Date.now();
    const jobs = await this.repository.claim(this.batchSize, this.schedulerId);
    let completedCount = 0;
    let failedCount = 0;
    for (const job of jobs) {
      const jobStartedAt = Date.now();
      try {
        const handler = this.handlers.get(job.jobType);
        if (!handler) throw new Error(`No handler registered for scheduled job type: ${job.jobType}`);
        await handler(job);
        await this.repository.complete(job.id);
        completedCount += 1;
        this.logger.info("scheduled_job_completed", { job_id: job.id, job_key: job.jobKey, job_type: job.jobType, elapsed_ms: Date.now() - jobStartedAt });
      } catch (error) {
        failedCount += 1;
        await this.repository.fail(job.id, job.attempts, job.maxAttempts, error);
        const failure = safeFailure(error);
        this.logger.error("scheduled_job_failed", { job_id: job.id, job_key: job.jobKey, job_type: job.jobType, error_category: failure.message, retryable: failure.retryable, attempt: job.attempts, elapsed_ms: Date.now() - jobStartedAt });
      }
    }
    if (jobs.length > 0) {
      this.logger.info("scheduled_job_batch_completed", {
        claimed_count: jobs.length,
        success_count: completedCount,
        failure_count: failedCount,
        elapsed_ms: Date.now() - batchStartedAt,
      });
    }
    return jobs.length;
  }
}

function safeFailure(error: unknown): { message: string; retryable: boolean } {
  if (error && typeof error === "object" && "category" in error && typeof error.category === "string") {
    return { message: error.category.slice(0, 128), retryable: !("retryable" in error) || error.retryable !== false };
  }
  return { message: "unclassified_failure", retryable: true };
}

export function retryDelayMs(attempts: number, stableSeed: string): number {
  const base = Math.min(300_000, 2_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 8));
  const hash = createHash("sha256").update(`${stableSeed}:${attempts}`).digest();
  const jitter = 0.75 + (hash.readUInt16BE(0) / 65_535) * 0.5;
  return Math.max(1_000, Math.round(base * jitter));
}
