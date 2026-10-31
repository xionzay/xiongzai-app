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
  complete(id: string, attempts: number): Promise<boolean>;
  fail(id: string, attempts: number, maxAttempts: number, error: unknown): Promise<boolean>;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

export class DrizzleScheduledJobRepository implements ScheduledJobRepository {
  constructor(private readonly database: Database, private readonly options: { now?: () => Date; lockTimeoutMs?: number } = {}) {}

  async claim(batchSize: number, schedulerId: string): Promise<ClaimedJob[]> {
    return this.database.transaction(async (tx) => {
      const lockTimeoutMs = this.options.lockTimeoutMs ?? 300_000;
      // A crash on the last attempt must not leave RUNNING forever or exceed the retry budget.
      await tx.execute(sql`
        UPDATE scheduled_jobs SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
          last_error = 'lease_expired_attempts_exhausted', updated_at = now()
        WHERE attempts >= max_attempts
          AND ((status = 'RUNNING' AND locked_at <= now() - (${lockTimeoutMs} * interval '1 millisecond'))
            OR status = 'PENDING')
      `);
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id FROM scheduled_jobs
          WHERE attempts < max_attempts
            AND ((status = 'PENDING' AND run_at <= now())
             OR (status = 'RUNNING' AND locked_at <= now() - (${lockTimeoutMs} * interval '1 millisecond')))
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

  async complete(id: string, attempts: number): Promise<boolean> {
    const now = this.options.now?.() ?? new Date();
    // Claim increments attempts atomically: it is the fencing generation, never reset on retry.
    const changed = await this.database.update(scheduledJobs).set({ status: "COMPLETED", completedAt: now, lockedAt: null, lockedBy: null, lastError: null, updatedAt: now }).where(sql`${scheduledJobs.id} = ${id} AND ${scheduledJobs.status} = 'RUNNING' AND ${scheduledJobs.attempts} = ${attempts}`).returning({ id: scheduledJobs.id });
    return changed.length === 1;
  }

  async fail(id: string, attempts: number, maxAttempts: number, error: unknown): Promise<boolean> {
    const failure = safeFailure(error);
    const exhausted = !failure.retryable || attempts >= maxAttempts;
    const now = this.options.now?.() ?? new Date();
    const changed = await this.database.update(scheduledJobs).set({
      status: exhausted ? "FAILED" : "PENDING",
      lastError: failure.message,
      runAt: exhausted ? undefined : new Date(now.getTime() + retryDelayMs(attempts, id)),
      lockedAt: null,
      lockedBy: null,
      updatedAt: now,
    }).where(sql`${scheduledJobs.id} = ${id} AND ${scheduledJobs.status} = 'RUNNING' AND ${scheduledJobs.attempts} = ${attempts}`).returning({ id: scheduledJobs.id });
    return changed.length === 1;
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
        if (!await this.repository.complete(job.id, job.attempts)) {
          this.logger.info("scheduled_job_claim_lost", { job_id: job.id, attempt: job.attempts });
          continue;
        }
        completedCount += 1;
        this.logger.info("scheduled_job_completed", { job_id: job.id, job_key: job.jobKey, job_type: job.jobType, elapsed_ms: Date.now() - jobStartedAt });
      } catch (error) {
        if (!await this.repository.fail(job.id, job.attempts, job.maxAttempts, error)) {
          this.logger.info("scheduled_job_claim_lost", { job_id: job.id, attempt: job.attempts });
          continue;
        }
        failedCount += 1;
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
