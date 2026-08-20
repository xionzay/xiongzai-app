import { createHash } from "node:crypto";
import { and, eq, lt, or } from "drizzle-orm";
import {
  idempotencyKeys,
  inboxEvents,
  outboxEvents,
  scheduledJobs,
  uuidv7,
  type Database,
  type DatabaseTransaction,
} from "@xiongzai/database";
import { AppError, errorCodes, toApiJson, type JsonValue } from "@xiongzai/contracts";

export type DatabaseExecutor = Database | DatabaseTransaction;

export function canonicalRequestHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export class OutboxService {
  async enqueue(executor: DatabaseExecutor, event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
    traceId?: string;
    schemaVersion?: number;
    availableAt?: Date;
  }): Promise<string> {
    const id = uuidv7();
    await executor.insert(outboxEvents).values({
      id,
      eventId: uuidv7(),
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payloadJson: toApiJson(event.payload) ?? null,
      traceId: event.traceId,
      schemaVersion: event.schemaVersion ?? 1,
      availableAt: event.availableAt ?? new Date(),
    });
    return id;
  }
}

export class InboxService {
  async claim(executor: DatabaseExecutor, input: { eventId: string; consumerName: string; payload: unknown }): Promise<boolean> {
    const payloadSha256 = canonicalRequestHash(input.payload);
    const inserted = await executor.insert(inboxEvents).values({
      id: uuidv7(),
      eventId: input.eventId,
      consumerName: input.consumerName,
      payloadSha256,
    }).onConflictDoNothing().returning({ id: inboxEvents.id });
    if (inserted.length === 1) return true;
    const [existing] = await executor.select().from(inboxEvents)
      .where(and(eq(inboxEvents.eventId, input.eventId), eq(inboxEvents.consumerName, input.consumerName))).limit(1);
    if (!existing || existing.payloadSha256 !== payloadSha256) {
      throw new AppError({ code: errorCodes.INBOX_PAYLOAD_CONFLICT, message: "事件编号对应的内容摘要不一致", statusCode: 409 });
    }
    if (existing.status !== "FAILED") return false;
    const reclaimed = await executor.update(inboxEvents).set({ status: "PROCESSING", processingError: null, processedAt: null })
      .where(and(eq(inboxEvents.id, existing.id), eq(inboxEvents.status, "FAILED"))).returning({ id: inboxEvents.id });
    return reclaimed.length === 1;
  }

  async complete(executor: DatabaseExecutor, eventId: string, consumerName: string): Promise<void> {
    await executor.update(inboxEvents).set({ status: "COMPLETED", processedAt: new Date(), processingError: null })
      .where(and(eq(inboxEvents.eventId, eventId), eq(inboxEvents.consumerName, consumerName)));
  }

  async fail(executor: DatabaseExecutor, eventId: string, consumerName: string, error: unknown): Promise<void> {
    await executor.update(inboxEvents).set({ status: "FAILED", processingError: errorMessage(error) })
      .where(and(eq(inboxEvents.eventId, eventId), eq(inboxEvents.consumerName, consumerName)));
  }
}

export class IdempotencyService {
  async reserve(executor: DatabaseExecutor, input: {
    scope: string;
    key: string;
    request: unknown;
    expiresAt: Date;
  }): Promise<{ id: string; replay?: { statusCode: number; body: JsonValue | null } }> {
    const requestHash = canonicalRequestHash(input.request);
    const id = uuidv7();
    const inserted = await executor.insert(idempotencyKeys).values({
      id,
      scope: input.scope,
      idempotencyKey: input.key,
      requestHash,
      expiresAt: input.expiresAt,
    }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
    if (inserted.length === 1) return { id };

    const [existing] = await executor.select().from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, input.scope), eq(idempotencyKeys.idempotencyKey, input.key))).limit(1);
    if (!existing || existing.requestHash !== requestHash) {
      throw new AppError({ code: errorCodes.IDEMPOTENCY_KEY_CONFLICT, message: "幂等键已用于其他请求", statusCode: 409 });
    }
    if (existing.status === "COMPLETED" && existing.responseCode !== null) {
      return { id: existing.id, replay: { statusCode: existing.responseCode, body: existing.responseBodyJson as JsonValue | null } };
    }
    const reclaimed = await executor.update(idempotencyKeys).set({
      status: "PROCESSING",
      requestHash,
      responseCode: null,
      responseBodyJson: null,
      resourceType: null,
      resourceId: null,
      expiresAt: input.expiresAt,
    }).where(and(eq(idempotencyKeys.id, existing.id), or(eq(idempotencyKeys.status, "FAILED"), lt(idempotencyKeys.expiresAt, new Date()))))
      .returning({ id: idempotencyKeys.id });
    if (reclaimed.length === 1) return { id: existing.id };
    throw new AppError({ code: errorCodes.IDEMPOTENCY_REQUEST_IN_PROGRESS, message: "相同请求正在处理中", statusCode: 409 });
  }

  async complete(executor: DatabaseExecutor, id: string, input: {
    statusCode: number;
    body: unknown;
    resourceType?: typeof idempotencyKeys.$inferInsert.resourceType;
    resourceId?: string;
  }): Promise<void> {
    await executor.update(idempotencyKeys).set({
      status: "COMPLETED",
      responseCode: input.statusCode,
      responseBodyJson: toApiJson(input.body) ?? null,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    }).where(eq(idempotencyKeys.id, id));
  }

  async fail(executor: DatabaseExecutor, id: string): Promise<void> {
    await executor.update(idempotencyKeys).set({ status: "FAILED" }).where(eq(idempotencyKeys.id, id));
  }
}

export class ScheduledJobService {
  async schedule(executor: DatabaseExecutor, input: {
    jobKey: string;
    jobType: string;
    targetType: typeof scheduledJobs.$inferInsert.targetType;
    targetId: string;
    payload?: unknown;
    runAt: Date;
    maxAttempts?: number;
  }): Promise<string> {
    const id = uuidv7();
    const inserted = await executor.insert(scheduledJobs).values({
      id,
      jobKey: input.jobKey,
      jobType: input.jobType,
      targetType: input.targetType,
      targetId: input.targetId,
      payloadJson: toApiJson(input.payload ?? {}) ?? {},
      runAt: input.runAt,
      maxAttempts: input.maxAttempts ?? 8,
    }).onConflictDoNothing().returning({ id: scheduledJobs.id });
    if (inserted[0]) return inserted[0].id;
    const [existing] = await executor.select({ id: scheduledJobs.id }).from(scheduledJobs).where(eq(scheduledJobs.jobKey, input.jobKey)).limit(1);
    if (!existing) throw new Error("Scheduled job conflict could not be resolved.");
    return existing.id;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return JSON.stringify(value.toString(10));
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}
