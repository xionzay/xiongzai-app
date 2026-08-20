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
  constructor(private readonly database: Database) {}

  async claim(batchSize: number, schedulerId: string): Promise<ClaimedJob[]> {
    return this.database.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id FROM scheduled_jobs
          WHERE (status = 'PENDING' AND run_at <= now())
             OR (status = 'RUNNING' AND locked_at <= now() - interval '5 minutes')
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
    await this.database.update(scheduledJobs).set({ status: "COMPLETED", completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null }).where(sql`${scheduledJobs.id} = ${id}`);
  }

  async fail(id: string, attempts: number, maxAttempts: number, error: unknown): Promise<void> {
    const exhausted = attempts >= maxAttempts;
    const delaySeconds = Math.min(300, 2 ** Math.min(attempts, 8));
    await this.database.update(scheduledJobs).set({
      status: exhausted ? "FAILED" : "PENDING",
      lastError: errorMessage(error),
      runAt: exhausted ? undefined : new Date(Date.now() + delaySeconds * 1_000),
      lockedAt: null,
      lockedBy: null,
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
    const jobs = await this.repository.claim(this.batchSize, this.schedulerId);
    for (const job of jobs) {
      try {
        const handler = this.handlers.get(job.jobType);
        if (!handler) throw new Error(`No handler registered for scheduled job type: ${job.jobType}`);
        await handler(job);
        await this.repository.complete(job.id);
        this.logger.info("scheduled_job_completed", { job_id: job.id, job_key: job.jobKey, job_type: job.jobType });
      } catch (error) {
        await this.repository.fail(job.id, job.attempts, job.maxAttempts, error);
        this.logger.error("scheduled_job_failed", { job_id: job.id, job_key: job.jobKey, job_type: job.jobType, error });
      }
    }
    return jobs.length;
  }
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}
