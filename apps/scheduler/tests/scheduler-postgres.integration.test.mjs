import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { createDatabaseClient, scheduledJobs } from "@xiongzai/database";
import { DrizzleScheduledJobRepository } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_scheduler_${randomUUID().replaceAll("-", "")}`;
let database;

before(async () => {
  if (!enabled) return;
  database = createDatabaseClient({
    connectionString: databaseUrl,
    application_name: "xiongzai-scheduler-stage6-test",
    options: `-c search_path=${schemaName},public`,
    max: 6,
  });
  await database.pool.query(`CREATE SCHEMA "${schemaName}"`);
  await runMigration("0000_initial_schema.sql");
  await runMigration("0001_core_invariants.sql");
});

after(async () => {
  if (!database) return;
  await database.pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await database.close();
});

test("two workers claim a due job exactly once and stale locks recover without sleeps", { skip: !enabled }, async () => {
  const repositoryA = new DrizzleScheduledJobRepository(database.db, { lockTimeoutMs: 1_000 });
  const repositoryB = new DrizzleScheduledJobRepository(database.db, { lockTimeoutMs: 1_000 });
  const dueId = randomUUID();
  await insertJob({ id: dueId, key: `stage6:concurrent:${dueId}` });

  const [claimedA, claimedB] = await Promise.all([
    repositoryA.claim(1, "stage6-worker-a"),
    repositoryB.claim(1, "stage6-worker-b"),
  ]);
  assert.equal(claimedA.length + claimedB.length, 1);
  assert.equal((await repositoryA.claim(1, "stage6-worker-c")).length, 0);

  await database.pool.query(
    "UPDATE scheduled_jobs SET status = 'RUNNING', locked_at = now() - interval '2 seconds', locked_by = 'crashed-worker' WHERE id = $1",
    [dueId],
  );
  const recovered = await repositoryB.claim(1, "stage6-recovery-worker");
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, dueId);
  assert.equal(recovered[0].attempts, 2);
  await repositoryB.complete(dueId);
  assert.equal((await repositoryA.claim(1, "stage6-worker-d")).length, 0);
  const state = await database.pool.query("SELECT status, attempts, locked_at, locked_by FROM scheduled_jobs WHERE id = $1", [dueId]);
  assert.deepEqual(state.rows, [{ status: "COMPLETED", attempts: 2, locked_at: null, locked_by: null }]);
});

test("retry scheduling is finite and permanent failures are not reclaimed", { skip: !enabled }, async () => {
  const clock = new Date("2026-08-22T00:00:00.000Z");
  const repository = new DrizzleScheduledJobRepository(database.db, { now: () => clock, lockTimeoutMs: 1_000 });
  const retryId = randomUUID();
  await insertJob({ id: retryId, key: `stage6:retry:${retryId}`, maxAttempts: 3 });
  const [first] = await repository.claim(1, "stage6-retry-worker");
  assert.equal(first.id, retryId);
  await repository.fail(first.id, first.attempts, first.maxAttempts, { category: "storage_temporary_failure", retryable: true });
  const pending = await database.pool.query("SELECT status, attempts, run_at > $2 AS future, last_error FROM scheduled_jobs WHERE id = $1", [retryId, clock]);
  assert.deepEqual(pending.rows, [{ status: "PENDING", attempts: 1, future: true, last_error: "storage_temporary_failure" }]);
  await database.pool.query("UPDATE scheduled_jobs SET run_at = now() - interval '1 second' WHERE id = $1", [retryId]);
  const [second] = await repository.claim(1, "stage6-retry-worker");
  await repository.fail(second.id, second.attempts, second.maxAttempts, { category: "configuration_error", retryable: false });
  const failed = await database.pool.query("SELECT status, attempts, last_error FROM scheduled_jobs WHERE id = $1", [retryId]);
  assert.deepEqual(failed.rows, [{ status: "FAILED", attempts: 2, last_error: "configuration_error" }]);
  assert.equal((await repository.claim(1, "stage6-retry-worker")).length, 0);
});

test("a transaction rollback cannot leave a partial scheduled job", { skip: !enabled }, async () => {
  const rolledBackId = randomUUID();
  await assert.rejects(database.db.transaction(async (tx) => {
    await tx.insert(scheduledJobs).values({
      id: rolledBackId,
      jobKey: `stage6:rollback:${rolledBackId}`,
      jobType: "FILE_OBJECT_DELETE",
      targetType: "PLATFORM",
      targetId: randomUUID(),
      runAt: new Date(),
      maxAttempts: 3,
    });
    throw new Error("synthetic rollback");
  }));
  const result = await database.pool.query("SELECT count(*)::int AS count FROM scheduled_jobs WHERE id = $1", [rolledBackId]);
  assert.equal(result.rows[0].count, 0);
});

async function insertJob({ id, key, maxAttempts = 3 }) {
  await database.pool.query(
    "INSERT INTO scheduled_jobs (id,job_key,job_type,target_type,target_id,run_at,max_attempts) VALUES ($1,$2,'FILE_OBJECT_DELETE','PLATFORM',$3,now() - interval '1 second',$4)",
    [id, key, randomUUID(), maxAttempts],
  );
}

function splitMigration(source) {
  return source.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
}

async function runMigration(fileName) {
  let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of splitMigration(source)) await database.pool.query(statement);
}
