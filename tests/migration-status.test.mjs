import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareMigrationStatus, inspectMigrationArtifacts, validateReadonlyMigrationTarget } from "../scripts/migration-status.mjs";

test("migration artifacts are complete, ordered and represented by the journal", async () => {
  const migrations = await inspectMigrationArtifacts();
  assert.equal(migrations.length, 21);
  assert.deepEqual(migrations.map((migration) => migration.tag), ["0000_initial_schema", "0001_core_invariants", "0002_admin_stage2_permissions", "0003_admin_query_performance", "0004_payment_channels_voice_constraints", "0005_policy_acceptance_context", "0006_policy_version_bindings", "0007_user_lifecycle_requests", "0008_user_lifecycle_invariants", "0009_clear_rhodey", "0010_order_rule_version", "0011_bear_sticker_messages", "0012_tan_dark_beast", "0013_dapper_ultimatum", "0014_brave_fixer", "0015_community_feedback_announcements", "0016_chat_private_media", "0017_supreme_blindfold", "0018_rainy_solo", "0019_bright_orphan", "0020_orange_smasher"]);
});

test("read-only migration comparison detects exact, pending and divergent targets", async () => {
  const expected = await inspectMigrationArtifacts();
  const exact = expected.map((migration) => ({ hash: migration.hash, created_at: migration.createdAt }));
  assert.deepEqual(compareMigrationStatus(expected, exact), { current: true, expectedCount: expected.length, appliedCount: expected.length, pendingCount: 0 });
  assert.deepEqual(compareMigrationStatus(expected, exact.slice(0, 2)), { current: false, expectedCount: expected.length, appliedCount: 2, pendingCount: expected.length - 2 });
  assert.equal(compareMigrationStatus(expected, exact.map((row, index) => index === 1 ? { ...row, hash: "0".repeat(64) } : row)).current, false);
});

test("migration target validation refuses missing, invalid and unapproved external addresses without values", () => {
  assert.throws(() => validateReadonlyMigrationTarget(undefined), /DATABASE_URL/u);
  assert.throws(() => validateReadonlyMigrationTarget("not-a-url"), /DATABASE_URL/u);
  const external = "postgresql://credential@database.example/xiongzai";
  assert.throws(() => validateReadonlyMigrationTarget(external), (error) => error.message.includes("MIGRATION_STATUS_ALLOW_EXTERNAL") && !error.message.includes(external));
  assert.deepEqual(validateReadonlyMigrationTarget("postgresql://local@127.0.0.1:5432/xiongzai"), { host: "127.0.0.1", port: 5432 });
});

test("migration status implementation opens a read-only transaction and never invokes migration execution", async () => {
  const source = await readFile(new URL("../scripts/migration-status.mjs", import.meta.url), "utf8");
  assert.match(source, /BEGIN READ ONLY/u);
  assert.doesNotMatch(source, /\bmigrate\s*\(/u);
});
