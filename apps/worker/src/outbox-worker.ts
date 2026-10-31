import { sql } from "drizzle-orm";
import { outboxEvents, type Database } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";

export interface ClaimedOutboxEvent {
  id: string;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: unknown;
  traceId: string | null;
  attempts: number;
}

export interface OutboxRepository {
  claim(batchSize: number): Promise<ClaimedOutboxEvent[]>;
  published(id: string, attempts: number): Promise<boolean>;
  failed(id: string, attempts: number, error: unknown): Promise<boolean>;
}

export interface EventPublisher {
  publish(event: ClaimedOutboxEvent): Promise<void>;
}

export class DrizzleOutboxRepository implements OutboxRepository {
  private readonly maxAttempts: number;
  private readonly lockTimeoutMs: number;

  constructor(private readonly database: Database, options: { maxAttempts?: number; lockTimeoutMs?: number } = {}) {
    this.maxAttempts = options.maxAttempts ?? 8;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 300_000;
  }

  async claim(batchSize: number): Promise<ClaimedOutboxEvent[]> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE outbox_events SET status = 'FAILED',
          last_error = 'lease_expired_attempts_exhausted', updated_at = now()
        WHERE status = 'PROCESSING' AND attempts >= ${this.maxAttempts}
          AND updated_at <= now() - (${this.lockTimeoutMs} * interval '1 millisecond')
      `);
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id FROM outbox_events
          WHERE attempts < ${this.maxAttempts}
            AND ((status IN ('PENDING', 'FAILED') AND available_at <= now())
             OR (status = 'PROCESSING' AND updated_at <= now() - (${this.lockTimeoutMs} * interval '1 millisecond')))
          ORDER BY available_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${batchSize}
        )
        UPDATE outbox_events AS event
        SET status = 'PROCESSING', attempts = event.attempts + 1, updated_at = now()
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.id, event.event_id, event.aggregate_type, event.aggregate_id,
          event.event_type, event.schema_version, event.payload_json, event.trace_id, event.attempts
      `);
      return result.rows.map((row) => ({
        id: String(row.id), eventId: String(row.event_id), aggregateType: String(row.aggregate_type),
        aggregateId: String(row.aggregate_id), eventType: String(row.event_type), schemaVersion: Number(row.schema_version),
        payload: row.payload_json, traceId: row.trace_id === null ? null : String(row.trace_id), attempts: Number(row.attempts),
      }));
    });
  }

  async published(id: string, attempts: number): Promise<boolean> {
    // Each claim increments attempts, fencing acknowledgements from older executions.
    const changed = await this.database.update(outboxEvents).set({ status: "PUBLISHED", publishedAt: new Date(), lastError: null, updatedAt: new Date() }).where(sql`${outboxEvents.id} = ${id} AND ${outboxEvents.status} = 'PROCESSING' AND ${outboxEvents.attempts} = ${attempts}`).returning({ id: outboxEvents.id });
    return changed.length === 1;
  }

  async failed(id: string, attempts: number, error: unknown): Promise<boolean> {
    const delayMs = outboxRetryDelayMs(attempts);
    const changed = await this.database.update(outboxEvents).set({
      status: "FAILED",
      lastError: errorCategory(error),
      availableAt: new Date(Date.now() + delayMs),
      updatedAt: new Date(),
    }).where(sql`${outboxEvents.id} = ${id} AND ${outboxEvents.status} = 'PROCESSING' AND ${outboxEvents.attempts} = ${attempts}`).returning({ id: outboxEvents.id });
    return changed.length === 1;
  }
}

export class OutboxWorker {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: EventPublisher,
    private readonly logger: JsonLogger,
    private readonly batchSize: number,
  ) {}

  async runOnce(): Promise<number> {
    const events = await this.repository.claim(this.batchSize);
    for (const event of events) {
      try {
        await this.publisher.publish(event);
        if (!await this.repository.published(event.id, event.attempts)) {
          this.logger.info("outbox_claim_lost", { event_id: event.eventId, attempt: event.attempts });
          continue;
        }
        this.logger.info("outbox_event_published", { event_id: event.eventId, event_type: event.eventType, aggregate_type: event.aggregateType, aggregate_id: event.aggregateId });
      } catch (error) {
        if (!await this.repository.failed(event.id, event.attempts, error)) {
          this.logger.info("outbox_claim_lost", { event_id: event.eventId, attempt: event.attempts });
          continue;
        }
        this.logger.error("outbox_event_publish_failed", { event_id: event.eventId, event_type: event.eventType, error_category: errorCategory(error) });
      }
    }
    return events.length;
  }
}

export class LoggingPublisher implements EventPublisher {
  constructor(private readonly logger: JsonLogger) {}
  async publish(event: ClaimedOutboxEvent): Promise<void> {
    this.logger.info("development_event_publisher", { event_id: event.eventId, event_type: event.eventType, schema_version: event.schemaVersion });
  }
}

export function outboxRetryDelayMs(attempts: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.min(Math.max(attempts, 0), 8));
}

function errorCategory(error: unknown): string {
  if (error && typeof error === "object" && "category" in error && typeof error.category === "string") return error.category.slice(0, 128);
  return "unclassified_publish_failure";
}
