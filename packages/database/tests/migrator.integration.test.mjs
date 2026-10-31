import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { validateLocalTestDatabaseUrl } from "../dist/testing.js";

const migrations = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
});
const enabled = Boolean(process.env.TEST_DATABASE_URL);

async function isolatedMigrationTest(run) {
  const schema = `xiongzai_migrator_${randomUUID().replaceAll("-", "")}`;
  const journalSchema = `${schema}_journal`;
  const client = new pg.Client({
    connectionString: validateLocalTestDatabaseUrl(process.env.TEST_DATABASE_URL),
    application_name: "xiongzai-isolated-migrator-test",
  });
  await client.connect();
  try {
    // Fail closed if the extension is not already provisioned by local test setup.
    // Never install or relocate a database-wide extension from a test schema.
    const extension = await client.query("SELECT 1 FROM pg_extension WHERE extname='btree_gist'");
    assert.equal(extension.rowCount, 1, "local test database requires preinstalled btree_gist");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    const db = drizzle(client, { logger: false });
    const isolated = migrations.map(migration => ({
      ...migration,
      // Preserve original hashes/timestamps. Only relocate schema-qualified SQL;
      // transactions and journal writes use the same engine as production migrate().
      sql: migration.sql.map(statement => statement.replaceAll('"public".', `"${schema}".`)),
    }));
    const apply = batch => db.dialect.migrate(batch, db.session, { migrationsSchema: journalSchema });
    const journal = async () => (await client.query(`SELECT hash, created_at FROM "${journalSchema}".__drizzle_migrations ORDER BY created_at, id`)).rows;
    await run({ client, schema, isolated, apply, journal });
  } finally {
    try {
      await client.query("ROLLBACK");
      // Both names are generated locally, never supplied by a URL or user.
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.query(`DROP SCHEMA IF EXISTS "${journalSchema}" CASCADE`);
      const remaining = await client.query("SELECT nspname FROM pg_namespace WHERE nspname=ANY($1::text[])", [[schema, journalSchema]]);
      assert.equal(remaining.rowCount, 0, "isolated migration schemas must be cleaned up");
    } finally {
      await client.end();
    }
  }
}

function expectedJournal(batch) {
  return batch.map(migration => ({ hash: migration.hash, created_at: String(migration.folderMillis) }));
}

test("Drizzle migrator applies the full journal in one transaction on an empty isolated schema", { skip: !enabled }, async () => {
  await isolatedMigrationTest(async ({ client, isolated, apply, journal }) => {
    await apply(isolated);
    assert.deepEqual(await journal(), expectedJournal(isolated));
    const result = await client.query("SELECT to_regclass('feedbacks') IS NOT NULL AS feedbacks, to_regclass('announcements') IS NOT NULL AS announcements");
    assert.deepEqual(result.rows, [{ feedbacks: true, announcements: true }]);
    const media = await client.query("SELECT media_file_id FROM messages LIMIT 0");
    assert.equal(media.fields[0].name, "media_file_id");
  });
});

test("pending migrations roll back DDL, enums, permissions and journal together; retry preserves existing data", { skip: !enabled }, async () => {
  await isolatedMigrationTest(async ({ client, schema, isolated, apply, journal }) => {
    // Reproduce the local development baseline through 0014, without modifying it.
    const baseline = isolated.slice(0, 15);
    assert.ok(isolated.length > baseline.length, "expected forward migrations after 0014");
    await apply(baseline);
    const userId = randomUUID();
    await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'test-only-ciphertext',$2,'***test***')", [userId, randomUUID().replaceAll("-", "").padEnd(64, "0")]);
    const userBefore = (await client.query("SELECT * FROM users WHERE id=$1", [userId])).rows;
    const beforeJournal = await journal();
    const enumValues = async () => (await client.query("SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 ORDER BY t.typname,e.enumsortorder", [schema])).rows;
    const beforeEnums = await enumValues();
    const permissions = async () => (await client.query("SELECT * FROM permissions ORDER BY permission_key")).rows;
    const beforePermissions = await permissions();
    const last = isolated.at(-1);
    const failing = [...isolated.slice(0, -1), { ...last, sql: [...last.sql, "SELECT 1 / 0"] }];
    await assert.rejects(apply(failing), error => error?.cause?.code === "22012" || error?.code === "22012");
    assert.deepEqual(await journal(), beforeJournal);
    assert.deepEqual(await enumValues(), beforeEnums);
    assert.deepEqual(await permissions(), beforePermissions);
    assert.deepEqual((await client.query("SELECT to_regclass('feedbacks') AS feedbacks, to_regclass('announcements') AS announcements")).rows, [{ feedbacks: null, announcements: null }]);
    assert.equal((await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='messages' AND column_name='media_file_id'", [schema])).rowCount, 0);
    assert.deepEqual((await client.query("SELECT * FROM users WHERE id=$1", [userId])).rows, userBefore);

    await apply(isolated);
    assert.deepEqual(await journal(), expectedJournal(isolated));
    assert.deepEqual((await client.query("SELECT * FROM users WHERE id=$1", [userId])).rows, userBefore);
    const appliedPermissions = await permissions();
    assert.equal(appliedPermissions.length, beforePermissions.length + 7);
    assert.ok(appliedPermissions.some(row => row.permission_key === "refund.review.supervisor"));
    assert.ok(appliedPermissions.some(row => row.permission_key === "feedback.reply"));
    const afterEnums = await enumValues();
    for (const label of ["ANNOUNCEMENT_IMAGE", "CHAT_IMAGE", "CHAT_VOICE", "IMAGE", "VOICE"]) {
      assert.ok(afterEnums.some(row => row.enumlabel === label));
    }

    // Replaying the complete journal must not execute DDL or duplicate grants/data.
    await apply(isolated);
    assert.deepEqual(await journal(), expectedJournal(isolated));
    assert.deepEqual(await permissions(), appliedPermissions);
    assert.deepEqual(await enumValues(), afterEnums);
    assert.deepEqual((await client.query("SELECT * FROM users WHERE id=$1", [userId])).rows, userBefore);
  });
});
