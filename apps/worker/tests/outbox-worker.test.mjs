import assert from "node:assert/strict";
import test from "node:test";
import { JsonLogger } from "@xiongzai/observability";
import { loadWorkerConfig, outboxRetryDelayMs, OutboxWorker } from "../dist/index.js";

const event = { id: "1", eventId: "2", aggregateType: "ORDER", aggregateId: "3", eventType: "OrderCreated", schemaVersion: 1, payload: {}, traceId: null, attempts: 1 };

test("worker marks a published event only after publisher succeeds", async () => {
  const calls = [];
  const repository = { claim: async () => [event], published: async (id, attempt) => { calls.push(["published", id, attempt]); return true; }, failed: async () => calls.push(["failed"]) };
  const publisher = { publish: async () => calls.push(["publish"]) };
  const worker = new OutboxWorker(repository, publisher, new JsonLogger("test", () => {}), 10);
  assert.equal(await worker.runOnce(), 1);
  assert.deepEqual(calls, [["publish"], ["published", "1", 1]]);
});

test("worker records failure and leaves the event retryable", async () => {
  const calls = [];
  const repository = { claim: async () => [event], published: async () => calls.push(["published"]), failed: async (id, attempts) => calls.push(["failed", id, attempts]) };
  const worker = new OutboxWorker(repository, { publish: async () => { throw new Error("broker unavailable"); } }, new JsonLogger("test", () => {}), 10);
  assert.equal(await worker.runOnce(), 1);
  assert.deepEqual(calls, [["failed", "1", 1]]);
});

test("worker protected environments reject the logging publisher and retry delay is finite", () => {
  assert.throws(() => loadWorkerConfig({ DEPLOYMENT_ENV: "staging", DATABASE_URL: "postgresql://service:credential@db.internal/x", EVENT_PUBLISHER_MODE: "log" }), /EVENT_PUBLISHER_MODE/u);
  assert.throws(() => loadWorkerConfig({ DEPLOYMENT_ENV: "production", DATABASE_URL: "postgresql://service:credential@127.0.0.1/x", EVENT_PUBLISHER_MODE: "log" }), /DATABASE_URL/u);
  assert.ok(outboxRetryDelayMs(1) >= 1_000);
  assert.ok(outboxRetryDelayMs(100) <= 300_000);
});

test("worker logs never include publisher error text or payload", async () => {
  const records = [];
  const repository = { claim: async () => [{ ...event, payload: { token: "must-not-log" } }], published: async () => true, failed: async () => true };
  const worker = new OutboxWorker(repository, { publish: async () => { throw Object.assign(new Error("secret endpoint"), { category: "broker_unavailable" }); } }, new JsonLogger("test", (line) => records.push(line)), 10);
  await worker.runOnce();
  const output = records.join("\n");
  assert.doesNotMatch(output, /must-not-log|secret endpoint/iu);
});

test("outbox stale acknowledgement is not logged as published", async () => {
  const records = [];
  const repository = { claim: async () => [event], published: async () => false, failed: async () => { throw new Error("must not retry lost claim"); } };
  await new OutboxWorker(repository, { publish: async () => {} }, new JsonLogger("test", (line) => records.push(line)), 10).runOnce();
  assert.match(records.join("\n"), /outbox_claim_lost/u);
  assert.doesNotMatch(records.join("\n"), /outbox_event_published/u);
});
