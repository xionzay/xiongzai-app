import assert from "node:assert/strict";
import test from "node:test";
import { JsonLogger } from "@xiongzai/observability";
import { OutboxWorker } from "../dist/index.js";

const event = { id: "1", eventId: "2", aggregateType: "ORDER", aggregateId: "3", eventType: "OrderCreated", schemaVersion: 1, payload: {}, traceId: null, attempts: 1 };

test("worker marks a published event only after publisher succeeds", async () => {
  const calls = [];
  const repository = { claim: async () => [event], published: async (id) => calls.push(["published", id]), failed: async () => calls.push(["failed"]) };
  const publisher = { publish: async () => calls.push(["publish"]) };
  const worker = new OutboxWorker(repository, publisher, new JsonLogger("test", () => {}), 10);
  assert.equal(await worker.runOnce(), 1);
  assert.deepEqual(calls, [["publish"], ["published", "1"]]);
});

test("worker records failure and leaves the event retryable", async () => {
  const calls = [];
  const repository = { claim: async () => [event], published: async () => calls.push(["published"]), failed: async (id, attempts) => calls.push(["failed", id, attempts]) };
  const worker = new OutboxWorker(repository, { publish: async () => { throw new Error("broker unavailable"); } }, new JsonLogger("test", () => {}), 10);
  assert.equal(await worker.runOnce(), 1);
  assert.deepEqual(calls, [["failed", "1", 1]]);
});
