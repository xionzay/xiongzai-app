import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { createDatabaseClient } from "@xiongzai/database";
import { DrizzleOutboxRepository } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_outbox_${randomUUID().replaceAll("-", "")}`;
let database;

before(async () => {
  if (!enabled) return;
  database = createDatabaseClient({
    connectionString: databaseUrl,
    application_name: "xiongzai-outbox-preprod-test",
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

test("two outbox consumers claim once and a stale processing lease recovers after restart", { skip: !enabled }, async () => {
  const repositoryA = new DrizzleOutboxRepository(database.db, { maxAttempts: 4, lockTimeoutMs: 1_000 });
  const repositoryB = new DrizzleOutboxRepository(database.db, { maxAttempts: 4, lockTimeoutMs: 1_000 });
  const eventId = await insertEvent();
  const [claimedA, claimedB] = await Promise.all([repositoryA.claim(1), repositoryB.claim(1)]);
  assert.equal(claimedA.length + claimedB.length, 1);
  assert.equal((await repositoryA.claim(1)).length, 0);

  await database.pool.query("UPDATE outbox_events SET status='PROCESSING', updated_at=now()-interval '2 seconds' WHERE event_id=$1", [eventId]);
  const recovered = await repositoryB.claim(1);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].eventId, eventId);
  assert.equal(recovered[0].attempts, 2);
  await repositoryB.published(recovered[0].id);
  assert.equal((await repositoryA.claim(1)).length, 0);
  const state = await database.pool.query("SELECT status, attempts, last_error FROM outbox_events WHERE event_id=$1", [eventId]);
  assert.deepEqual(state.rows, [{ status: "PUBLISHED", attempts: 2, last_error: null }]);
});

test("outbox retry is bounded and stored errors contain only a safe category", { skip: !enabled }, async () => {
  const repository = new DrizzleOutboxRepository(database.db, { maxAttempts: 2, lockTimeoutMs: 1_000 });
  const eventId = await insertEvent();
  const first = (await repository.claim(1))[0];
  await repository.failed(first.id, first.attempts, new Error("token=must-not-be-stored"));
  await database.pool.query("UPDATE outbox_events SET available_at=now()-interval '1 second' WHERE event_id=$1", [eventId]);
  const second = (await repository.claim(1))[0];
  assert.equal(second.attempts, 2);
  await repository.failed(second.id, second.attempts, { category: "broker_unavailable", detail: "secret-value" });
  await database.pool.query("UPDATE outbox_events SET available_at=now()-interval '1 second' WHERE event_id=$1", [eventId]);
  assert.equal((await repository.claim(1)).length, 0);
  const state = await database.pool.query("SELECT status, attempts, last_error FROM outbox_events WHERE event_id=$1", [eventId]);
  assert.deepEqual(state.rows, [{ status: "FAILED", attempts: 2, last_error: "broker_unavailable" }]);
});

async function insertEvent() {
  const id = randomUUID();
  const eventId = randomUUID();
  await database.pool.query(
    "INSERT INTO outbox_events(id,event_id,aggregate_type,aggregate_id,event_type,payload_json,available_at) VALUES($1,$2,'ORDER',$3,'ORDER_UPDATED',$4,now()-interval '1 second')",
    [id, eventId, randomUUID(), { amount_cent: "100", idempotency_key: randomUUID() }],
  );
  return eventId;
}

async function runMigration(fileName) {
  let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await database.pool.query(statement);
}
