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
  published(id: string): Promise<void>;
  failed(id: string, attempts: number, error: unknown): Promise<void>;
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

  async published(id: string): Promise<void> {
    await this.database.update(outboxEvents).set({ status: "PUBLISHED", publishedAt: new Date(), lastError: null }).where(sql`${outboxEvents.id} = ${id}`);
  }

  async failed(id: string, attempts: number, error: unknown): Promise<void> {
    const delayMs = outboxRetryDelayMs(attempts);
    await this.database.update(outboxEvents).set({
      status: "FAILED",
      lastError: errorCategory(error),
      availableAt: new Date(Date.now() + delayMs),
    }).where(sql`${outboxEvents.id} = ${id}`);
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
        await this.repository.published(event.id);
        this.logger.info("outbox_event_published", { event_id: event.eventId, event_type: event.eventType, aggregate_type: event.aggregateType, aggregate_id: event.aggregateId });
      } catch (error) {
        await this.repository.failed(event.id, event.attempts, error);
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
