import assert from "node:assert/strict";
import test from "node:test";
import { JsonLogger } from "@xiongzai/observability";
import { Scheduler } from "../dist/index.js";

const job = { id: "1", jobKey: "close:1", jobType: "close-order", targetType: "ORDER", targetId: "2", payload: {}, attempts: 1, maxAttempts: 5 };

test("scheduler completes a registered idempotent handler", async () => {
  const calls = [];
  const repository = { claim: async () => [job], complete: async (id) => calls.push(["complete", id]), fail: async () => calls.push(["fail"]) };
  const scheduler = new Scheduler(repository, new JsonLogger("test", () => {}), "scheduler-1", 10);
  scheduler.register("close-order", async (claimed) => calls.push(["handle", claimed.id]));
  assert.equal(await scheduler.runOnce(), 1);
  assert.deepEqual(calls, [["handle", "1"], ["complete", "1"]]);
});

test("scheduler records unknown handlers as retryable failures", async () => {
  const calls = [];
  const repository = { claim: async () => [job], complete: async () => calls.push(["complete"]), fail: async (id, attempts, maxAttempts) => calls.push(["fail", id, attempts, maxAttempts]) };
  const scheduler = new Scheduler(repository, new JsonLogger("test", () => {}), "scheduler-1", 10);
  assert.equal(await scheduler.runOnce(), 1);
  assert.deepEqual(calls, [["fail", "1", 1, 5]]);
});
