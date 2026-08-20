import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import pg from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_test_${randomUUID().replaceAll("-", "")}`;
let client;

function splitMigration(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runMigration(fileName) {
  let sql = await readFile(new URL(`../migrations/${fileName}`, import.meta.url), "utf8");
  sql = sql.replaceAll('"public".', `"${schemaName}".`);

  for (const statement of splitMigration(sql)) {
    await client.query(statement);
  }
}

before(async () => {
  if (!enabled) return;

  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql");
  await runMigration("0001_core_invariants.sql");
});

after(async () => {
  if (!client) return;
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.end();
});

test("all migrations apply to an empty PostgreSQL 16 database", { skip: !enabled }, async () => {
  const result = await client.query(
    `SELECT count(*)::integer AS count
       FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    [schemaName],
  );

  assert.equal(result.rows[0].count, 67);
});

test("critical constraints, partial indexes and deferred triggers exist", { skip: !enabled }, async () => {
  const exclusion = await client.query(
    `SELECT conname, contype
       FROM pg_constraint
      WHERE connamespace = $1::regnamespace
        AND conname = 'order_slot_reservations_no_overlap'`,
    [schemaName],
  );
  assert.deepEqual(exclusion.rows, [
    { conname: "order_slot_reservations_no_overlap", contype: "x" },
  ]);

  const deferredTriggers = await client.query(
    `SELECT count(*)::integer AS count
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND t.tgconstraint <> 0 AND t.tgdeferrable`,
    [schemaName],
  );
  assert.ok(deferredTriggers.rows[0].count >= 7);

  const indexes = await client.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = $1
        AND indexname IN (
          'refunds_one_active_per_order_uq',
          'payout_accounts_default_type_uq',
          'reviews_order_uq',
          'payment_events_provider_uq'
        )`,
    [schemaName],
  );
  assert.equal(indexes.rowCount, 4);
});

test("critical cursor and worker queries can use their composite indexes", { skip: !enabled }, async () => {
  await client.query("SET enable_seqscan = off");
  const probes = [
    ["orders_buyer_created_idx", "SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20", [randomUUID()]],
    ["orders_seller_created_idx", "SELECT * FROM orders WHERE seller_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20", [randomUUID()]],
    ["messages_conversation_created_idx", "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 100", [randomUUID()]],
    ["notifications_user_unread_idx", "SELECT * FROM notifications WHERE user_id = $1 AND read_status = 'UNREAD' ORDER BY created_at DESC LIMIT 50", [randomUUID()]],
    ["outbox_events_dispatch_idx", "SELECT * FROM outbox_events WHERE status = 'PENDING' AND available_at <= now() ORDER BY available_at LIMIT 100", []],
    ["scheduled_jobs_dispatch_idx", "SELECT * FROM scheduled_jobs WHERE status = 'PENDING' AND run_at <= now() ORDER BY run_at LIMIT 100", []],
  ];
  for (const [indexName, query, values] of probes) {
    const plan = await client.query(`EXPLAIN (FORMAT JSON) ${query}`, values);
    assert.match(JSON.stringify(plan.rows[0]["QUERY PLAN"]), new RegExp(indexName), `query cannot use ${indexName}`);
  }
  await client.query("RESET enable_seqscan");
});

test("phone hash and command/event idempotency keys are unique", { skip: !enabled }, async () => {
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  const phoneHash = "a".repeat(64);

  await client.query(
    `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
     VALUES ($1, 'ciphertext', $2, '138****0000')`,
    [firstUserId, phoneHash],
  );

  await assert.rejects(
    client.query(
      `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
       VALUES ($1, 'other-ciphertext', $2, '139****0000')`,
      [secondUserId, phoneHash],
    ),
    /users_phone_hash_uq/,
  );

  const idempotencyId = randomUUID();
  await client.query(
    `INSERT INTO idempotency_keys
       (id, scope, idempotency_key, request_hash, expires_at)
     VALUES ($1, 'create-order', 'same-command', $2, now() + interval '1 hour')`,
    [idempotencyId, "b".repeat(64)],
  );
  await assert.rejects(
    client.query(
      `INSERT INTO idempotency_keys
         (id, scope, idempotency_key, request_hash, expires_at)
       VALUES ($1, 'create-order', 'same-command', $2, now() + interval '1 hour')`,
      [randomUUID(), "b".repeat(64)],
    ),
    /idempotency_keys_scope_key_uq/,
  );

  const eventId = randomUUID();
  await client.query(
    `INSERT INTO inbox_events (id, event_id, consumer_name, payload_sha256)
     VALUES ($1, $2, 'notification-worker', $3)`,
    [randomUUID(), eventId, "c".repeat(64)],
  );
  await assert.rejects(
    client.query(
      `INSERT INTO inbox_events (id, event_id, consumer_name, payload_sha256)
       VALUES ($1, $2, 'notification-worker', $3)`,
      [randomUUID(), eventId, "c".repeat(64)],
    ),
    /inbox_events_consumer_event_uq/,
  );
});

test("business writes and Outbox events commit and roll back atomically", { skip: !enabled }, async () => {
  const rolledBackUserId = randomUUID();
  const rolledBackEventId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
     VALUES ($1, 'rollback-ciphertext', $2, '136****0000')`,
    [rolledBackUserId, randomUUID().replaceAll("-", "").padEnd(64, "0")],
  );
  await client.query(
    `INSERT INTO outbox_events
       (id, event_id, aggregate_type, aggregate_id, event_type, payload_json)
     VALUES ($1, $2, 'USER', $3, 'UserCreated', '{}')`,
    [randomUUID(), rolledBackEventId, rolledBackUserId],
  );
  await client.query("ROLLBACK");
  const rolledBack = await client.query(
    `SELECT
       (SELECT count(*)::integer FROM users WHERE id = $1) AS users,
       (SELECT count(*)::integer FROM outbox_events WHERE event_id = $2) AS events`,
    [rolledBackUserId, rolledBackEventId],
  );
  assert.deepEqual(rolledBack.rows[0], { users: 0, events: 0 });

  const committedUserId = randomUUID();
  const committedEventId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
     VALUES ($1, 'commit-ciphertext', $2, '137****0000')`,
    [committedUserId, randomUUID().replaceAll("-", "").padEnd(64, "1")],
  );
  await client.query(
    `INSERT INTO outbox_events
       (id, event_id, aggregate_type, aggregate_id, event_type, payload_json)
     VALUES ($1, $2, 'USER', $3, 'UserCreated', '{}')`,
    [randomUUID(), committedEventId, committedUserId],
  );
  await client.query("COMMIT");
  const committed = await client.query(
    `SELECT
       (SELECT count(*)::integer FROM users WHERE id = $1) AS users,
       (SELECT count(*)::integer FROM outbox_events WHERE event_id = $2) AS events`,
    [committedUserId, committedEventId],
  );
  assert.deepEqual(committed.rows[0], { users: 1, events: 1 });
});

test("posted ledger transactions balance and remain append-only", { skip: !enabled }, async () => {
  const debitAccountId = randomUUID();
  const creditAccountId = randomUUID();

  await client.query(
    `INSERT INTO ledger_accounts
       (id, owner_type, system_key, account_type)
     VALUES
       ($1, 'PLATFORM', 'integration-debit', 'PLATFORM_RECEIVABLE'),
       ($2, 'PLATFORM', 'integration-credit', 'PLATFORM_COMMISSION')`,
    [debitAccountId, creditAccountId],
  );

  const balancedTransactionId = randomUUID();
  const debitEntryId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO ledger_transactions
       (id, transaction_no, transaction_type, source_type, source_id,
        idempotency_key, description, occurred_at)
     VALUES ($1, $2, 'ADJUSTMENT', 'PLATFORM', $3, $4, 'integration balance', now())`,
    [balancedTransactionId, `LT-${balancedTransactionId}`, randomUUID(), `ledger-${balancedTransactionId}`],
  );
  await client.query(
    `INSERT INTO ledger_entries
       (id, transaction_id, account_id, side, amount_cent)
     VALUES
       ($1, $2, $3, 'DEBIT', 100),
       ($4, $2, $5, 'CREDIT', 100)`,
    [debitEntryId, balancedTransactionId, debitAccountId, randomUUID(), creditAccountId],
  );
  await client.query(
    `UPDATE ledger_transactions SET status = 'POSTED', posted_at = now() WHERE id = $1`,
    [balancedTransactionId],
  );
  await client.query("COMMIT");

  await assert.rejects(
    client.query(`UPDATE ledger_entries SET amount_cent = 101 WHERE id = $1`, [debitEntryId]),
    /append-only/,
  );

  const unbalancedTransactionId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO ledger_transactions
       (id, transaction_no, transaction_type, source_type, source_id,
        idempotency_key, description, occurred_at)
     VALUES ($1, $2, 'ADJUSTMENT', 'PLATFORM', $3, $4, 'integration imbalance', now())`,
    [unbalancedTransactionId, `LT-${unbalancedTransactionId}`, randomUUID(), `ledger-${unbalancedTransactionId}`],
  );
  await client.query(
    `INSERT INTO ledger_entries
       (id, transaction_id, account_id, side, amount_cent)
     VALUES ($1, $2, $3, 'DEBIT', 100)`,
    [randomUUID(), unbalancedTransactionId, debitAccountId],
  );
  await client.query(
    `UPDATE ledger_transactions SET status = 'POSTED', posted_at = now() WHERE id = $1`,
    [unbalancedTransactionId],
  );
  await assert.rejects(client.query("COMMIT"), /unbalanced/);
  await client.query("ROLLBACK");
});
