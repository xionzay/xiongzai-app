import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { validateLocalTestDatabaseUrl } from "../dist/testing.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("0009 local admin completion migration has a working isolated rollback", { skip: !databaseUrl }, async () => {
  const schemaName = `xiongzai_rollback_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: validateLocalTestDatabaseUrl(databaseUrl) });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await runForward(client, schemaName, "0000_initial_schema.sql");
    await runForward(client, schemaName, "0009_clear_rhodey.sql");

    const before = await columns(client, schemaName);
    assert.ok(before.includes("reviews.deleted_at"));
    assert.ok(before.includes("withdrawals.initial_review_admin_id"));

    const rollback = await readFile(new URL("../migrations/rollback/0009_clear_rhodey.down.sql", import.meta.url), "utf8");
    await client.query(rollback);

    const after = await columns(client, schemaName);
    assert.equal(after.includes("reviews.deleted_at"), false);
    assert.equal(after.includes("withdrawals.initial_review_admin_id"), false);
    const permissions = await client.query("SELECT permission_key FROM permissions WHERE permission_key IN ('finance.export', 'withdrawal.review.initial', 'withdrawal.review.final')");
    assert.equal(permissions.rowCount, 0);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  }
});

async function runForward(client, schemaName, fileName) {
  let source = await readFile(new URL(`../migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await client.query(statement);
}

async function columns(client, schemaName) {
  const result = await client.query(
    "SELECT table_name || '.' || column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('reviews', 'withdrawals')",
    [schemaName],
  );
  return result.rows.map((row) => row.name);
}
