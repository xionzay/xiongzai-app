import assert from "node:assert/strict";
import test from "node:test";
import { JsonLogger } from "@xiongzai/observability";
import { loadSchedulerConfig, retryDelayMs, Scheduler } from "../dist/index.js";

const job = { id: "1", jobKey: "close:1", jobType: "close-order", targetType: "ORDER", targetId: "2", payload: {}, attempts: 1, maxAttempts: 5 };

test("scheduler completes a registered idempotent handler", async () => {
  const calls = [];
  const repository = { claim: async () => [job], complete: async (id, attempt) => { calls.push(["complete", id, attempt]); return true; }, fail: async () => calls.push(["fail"]) };
  const scheduler = new Scheduler(repository, new JsonLogger("test", () => {}), "scheduler-1", 10);
  scheduler.register("close-order", async (claimed) => calls.push(["handle", claimed.id]));
  assert.equal(await scheduler.runOnce(), 1);
  assert.deepEqual(calls, [["handle", "1"], ["complete", "1", 1]]);
});

test("scheduler records unknown handlers as retryable failures", async () => {
  const calls = [];
  const repository = { claim: async () => [job], complete: async () => calls.push(["complete"]), fail: async (id, attempts, maxAttempts) => calls.push(["fail", id, attempts, maxAttempts]) };
  const scheduler = new Scheduler(repository, new JsonLogger("test", () => {}), "scheduler-1", 10);
  assert.equal(await scheduler.runOnce(), 1);
  assert.deepEqual(calls, [["fail", "1", 1, 5]]);
});

test("scheduler retry delay is deterministic, jittered and bounded", () => {
  assert.equal(retryDelayMs(3, "stable-job"), retryDelayMs(3, "stable-job"));
  assert.notEqual(retryDelayMs(3, "stable-job"), retryDelayMs(3, "different-job"));
  assert.ok(retryDelayMs(1, "stable-job") >= 1_000);
  assert.ok(retryDelayMs(99, "stable-job") <= 375_000);
});

test("scheduler logs only a safe failure category", async () => {
  const records = [];
  const repository = { claim: async () => [job], complete: async () => true, fail: async () => true };
  const scheduler = new Scheduler(repository, new JsonLogger("test", (record) => records.push(record)), "scheduler-1", 10);
  scheduler.register("close-order", async () => { throw Object.assign(new Error("sensitive endpoint and key must not be logged"), { category: "storage_temporary_failure", retryable: true }); });
  await scheduler.runOnce();
  const output = JSON.stringify(records);
  assert.match(output, /storage_temporary_failure/u);
  assert.doesNotMatch(output, /sensitive endpoint|object_key|presigned/iu);
});

test("lost scheduler claim is not reported as a completed job", async () => {
  const records = [];
  const repository = { claim: async () => [job], complete: async () => false, fail: async () => { throw new Error("must not retry lost claim"); } };
  const scheduler = new Scheduler(repository, new JsonLogger("test", (record) => records.push(record)), "scheduler-1", 10);
  scheduler.register(job.jobType, async () => {});
  await scheduler.runOnce();
  assert.match(JSON.stringify(records), /scheduled_job_claim_lost/u);
  assert.doesNotMatch(JSON.stringify(records), /scheduled_job_completed/u);
});

test("scheduler protected environments reject loopback database configuration by key name", () => {
  assert.throws(() => loadSchedulerConfig({ DEPLOYMENT_ENV: "staging", DATABASE_URL: "postgresql://service:credential@127.0.0.1/x" }), /DATABASE_URL/u);
  assert.equal(loadSchedulerConfig({ DEPLOYMENT_ENV: "test", DATABASE_URL: "postgresql://service:credential@127.0.0.1/x" }).environment, "test");
});
