import assert from "node:assert/strict";
import pg from "pg";

if (!process.env.DATABASE_URL || !process.env.TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL and TEST_DATABASE_URL are required.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const version = await scalar("SHOW server_version");
  const tableCount = await scalar(`SELECT count(*)::integer FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
  const enumCount = await scalar(`SELECT count(*)::integer FROM pg_type type JOIN pg_namespace namespace ON namespace.oid = type.typnamespace WHERE namespace.nspname = 'public' AND type.typtype = 'e'`);
  const extensionCount = await scalar(`SELECT count(*)::integer FROM pg_extension WHERE extname = 'btree_gist'`);
  const foreignKeyCount = await scalar(`SELECT count(*)::integer FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f'`);
  const partialIndexCount = await scalar(`SELECT count(*)::integer FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '% WHERE %'`);
  const exclusionCount = await scalar(`SELECT count(*)::integer FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname = 'order_slot_reservations_no_overlap' AND contype = 'x'`);
  const deferredTriggerCount = await scalar(`SELECT count(*)::integer FROM pg_trigger trigger JOIN pg_class class ON class.oid = trigger.tgrelid JOIN pg_namespace namespace ON namespace.oid = class.relnamespace WHERE namespace.nspname = 'public' AND trigger.tgconstraint <> 0 AND trigger.tgdeferrable`);
  const migrationCount = await scalar(`SELECT count(*)::integer FROM drizzle.__drizzle_migrations`);
  const coreBusinessRowCount = await scalar(`SELECT (
    (SELECT count(*) FROM users) +
    (SELECT count(*) FROM orders) +
    (SELECT count(*) FROM payments) +
    (SELECT count(*) FROM ledger_transactions) +
    (SELECT count(*) FROM outbox_events) +
    (SELECT count(*) FROM scheduled_jobs) +
    (SELECT count(*) FROM admin_accounts)
  )::integer`);
  const role = (await client.query(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication FROM pg_roles WHERE rolname = current_user`)).rows[0];
  const developmentDatabase = (await client.query("SELECT current_database() AS database, current_user AS role")).rows[0];

  assert.match(String(version), /^16\./u);
  assert.equal(tableCount, 67);
  assert.equal(enumCount, 62);
  assert.equal(extensionCount, 1);
  assert.ok(foreignKeyCount > 0);
  assert.ok(partialIndexCount > 0);
  assert.equal(exclusionCount, 1);
  assert.ok(deferredTriggerCount >= 7);
  assert.equal(migrationCount, 2);
  assert.equal(coreBusinessRowCount, 0);
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolreplication: false });
  assert.deepEqual(developmentDatabase, { database: "xiongzai_api_dev", role: "xiongzai_app" });

  const testClient = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await testClient.connect();
  const testDatabase = await testClient.query("SELECT current_database() AS database, current_user AS role");
  await testClient.end();
  assert.deepEqual(testDatabase.rows[0], { database: "xiongzai_database_test", role: "xiongzai_app" });

  console.log(JSON.stringify({
    server_version: version,
    public_tables: tableCount,
    public_enums: enumCount,
    btree_gist: "installed",
    foreign_keys: foreignKeyCount,
    partial_indexes: partialIndexCount,
    reservation_exclusion_constraints: exclusionCount,
    deferred_constraint_triggers: deferredTriggerCount,
    applied_migrations: migrationCount,
    core_business_rows: coreBusinessRowCount,
    application_role_restricted: true,
    development_database: "reachable",
    test_database: testDatabase.rows[0]?.database === "xiongzai_database_test" ? "reachable" : "unexpected",
  }, null, 2));

  async function scalar(statement) {
    const result = await client.query(statement);
    return Object.values(result.rows[0])[0];
  }
} finally {
  await client.end();
}
