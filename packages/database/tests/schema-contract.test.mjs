import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const initialMigration = await readFile(
  new URL("../migrations/0000_initial_schema.sql", import.meta.url),
  "utf8",
);
const invariantMigration = await readFile(
  new URL("../migrations/0001_core_invariants.sql", import.meta.url),
  "utf8",
);
const adminStageTwoMigration = await readFile(
  new URL("../migrations/0002_admin_stage2_permissions.sql", import.meta.url),
  "utf8",
);
const adminPerformanceMigration = await readFile(
  new URL("../migrations/0003_admin_query_performance.sql", import.meta.url),
  "utf8",
);
const localFinalizationMigration = await readFile(
  new URL("../migrations/0004_payment_channels_voice_constraints.sql", import.meta.url),
  "utf8",
);
const policyAcceptanceMigration = await readFile(
  new URL("../migrations/0005_policy_acceptance_context.sql", import.meta.url),
  "utf8",
);
const policyBindingMigration = await readFile(
  new URL("../migrations/0006_policy_version_bindings.sql", import.meta.url),
  "utf8",
);
const userLifecycleMigration = await readFile(
  new URL("../migrations/0007_user_lifecycle_requests.sql", import.meta.url),
  "utf8",
);
const userLifecycleInvariantMigration = await readFile(
  new URL("../migrations/0008_user_lifecycle_invariants.sql", import.meta.url),
  "utf8",
);
const adminLocalCompletionMigration = await readFile(
  new URL("../migrations/0009_clear_rhodey.sql", import.meta.url),
  "utf8",
);
const migrationJournal = JSON.parse(await readFile(
  new URL("../migrations/meta/_journal.json", import.meta.url),
  "utf8",
));
const latestSnapshot = JSON.parse(await readFile(
  new URL("../migrations/meta/0009_snapshot.json", import.meta.url),
  "utf8",
));
const schemaSource = await readFile(
  new URL("../src/schema.ts", import.meta.url),
  "utf8",
);

const expectedTables = [
  "admin_accounts",
  "admin_mfa_factors",
  "admin_operation_logs",
  "admin_roles",
  "admin_sessions",
  "auth_sessions",
  "complaint_evidences",
  "complaint_logs",
  "complaints",
  "conversation_members",
  "conversations",
  "delivery_logs",
  "favorites",
  "file_usages",
  "files",
  "idempotency_keys",
  "identity_verifications",
  "inbox_events",
  "ledger_accounts",
  "ledger_entries",
  "ledger_transactions",
  "messages",
  "notifications",
  "order_slot_reservations",
  "order_status_logs",
  "orders",
  "outbox_events",
  "payment_events",
  "payments",
  "payout_accounts",
  "permissions",
  "platform_configs",
  "policy_versions",
  "privacy_settings",
  "product_images",
  "product_review_logs",
  "product_skus",
  "product_versions",
  "products",
  "rating_aggregates",
  "reconciliation_items",
  "reconciliation_runs",
  "refund_logs",
  "refunds",
  "reviews",
  "risk_events",
  "role_permissions",
  "roles",
  "scheduled_jobs",
  "security_logs",
  "seller_applications",
  "seller_availability_slots",
  "seller_incomes",
  "seller_liabilities",
  "seller_liability_allocations",
  "seller_profiles",
  "seller_review_logs",
  "sms_codes",
  "support_case_logs",
  "support_cases",
  "user_devices",
  "user_policy_acceptances",
  "user_profiles",
  "users",
  "withdrawal_income_allocations",
  "withdrawal_logs",
  "withdrawals",
];

test("initial migration contains the complete MVP table set", () => {
  const actualTables = [...initialMigration.matchAll(/CREATE TABLE "([a-z0-9_]+)"/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(actualTables, expectedTables);
  assert.equal(actualTables.length, 67);
});

test("all native PostgreSQL enums are created before their tables", () => {
  const enumStatements = [...initialMigration.matchAll(/CREATE TYPE "public"\."([a-z0-9_]+)" AS ENUM/g)];
  const firstTablePosition = initialMigration.indexOf("CREATE TABLE");
  const lastEnumPosition = initialMigration.lastIndexOf("CREATE TYPE");

  assert.equal(enumStatements.length, 62);
  assert.ok(lastEnumPosition < firstTablePosition, "enums must exist before enum-backed columns");
  assert.match(initialMigration, /CREATE TYPE "public"\."user_status" AS ENUM/);
  assert.match(initialMigration, /CREATE TYPE "public"\."ledger_transaction_status" AS ENUM/);
});

test("coupon data model is intentionally absent and order discounts are disabled", () => {
  assert.doesNotMatch(schemaSource, /coupon/i);
  assert.doesNotMatch(initialMigration, /coupon/i);
  assert.match(
    initialMigration,
    /CONSTRAINT "orders_discount_disabled" CHECK \("orders"\."discount_cent" = 0\)/,
  );
});

test("money, ratings, parties and external identifiers have database constraints", () => {
  assert.match(initialMigration, /"amount_cent" bigint/);
  assert.match(initialMigration, /CONSTRAINT "orders_distinct_parties"/);
  assert.match(initialMigration, /CONSTRAINT "orders_refunded_cap"/);
  assert.match(initialMigration, /CONSTRAINT "reviews_rating_valid"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "users_phone_hash_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "orders_order_no_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "payments_payment_no_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "refunds_refund_no_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "complaints_complaint_no_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "support_cases_no_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "withdrawals_no_uq"/);
});

test("business idempotency and partial uniqueness rules are represented", () => {
  assert.match(initialMigration, /CREATE UNIQUE INDEX "payment_events_provider_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "messages_user_client_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "messages_admin_client_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "reviews_order_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "refunds_one_active_per_order_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "payout_accounts_default_type_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "seller_incomes_order_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "inbox_events_consumer_event_uq"/);
  assert.match(initialMigration, /CREATE UNIQUE INDEX "idempotency_keys_scope_key_uq"/);
});

test("PostgreSQL-only cross-row invariants are installed", () => {
  assert.match(invariantMigration, /CREATE EXTENSION IF NOT EXISTS btree_gist/);
  assert.match(invariantMigration, /EXCLUDE USING gist/);
  assert.match(invariantMigration, /tstzrange\("starts_at", "ends_at", '\[\)'\) WITH &&/);
  assert.match(invariantMigration, /DEFERRABLE INITIALLY DEFERRED/g);
  assert.match(invariantMigration, /assert_order_reference_integrity/);
  assert.match(invariantMigration, /assert_payment_order_amount/);
  assert.match(invariantMigration, /assert_refund_reference_integrity/);
  assert.match(invariantMigration, /assert_order_refund_total/);
  assert.match(invariantMigration, /assert_ledger_transaction_balanced/);
});

test("financial and audit history is append-only", () => {
  const protectedTables = [
    "ledger_entries",
    "order_status_logs",
    "refund_logs",
    "complaint_logs",
    "withdrawal_logs",
    "seller_review_logs",
    "product_review_logs",
    "support_case_logs",
    "admin_operation_logs",
  ];

  for (const table of protectedTables) {
    assert.match(
      invariantMigration,
      new RegExp(`BEFORE UPDATE OR DELETE ON "${table}"`),
      `${table} must be append-only`,
    );
  }

  assert.match(invariantMigration, /ledger_transactions_protect_posted/);
  assert.match(invariantMigration, /create a reversal transaction instead/);
});

test("admin stage two adds only the safe health-read permission", () => {
  assert.match(adminStageTwoMigration, /system_health\.read/);
  assert.match(adminStageTwoMigration, /ON CONFLICT \("permission_key"\) DO NOTHING/);
  assert.doesNotMatch(adminStageTwoMigration, /INSERT INTO "role_permissions"|GRANT|password|secret/iu);
});

test("admin performance indexes match stable keyset and moderation queue queries", () => {
  for (const indexName of [
    "users_status_created_id_idx",
    "files_admin_queue_created_id_idx",
    "admin_operation_logs_created_id_idx",
    "risk_events_status_created_id_idx",
    "security_logs_status_created_id_idx",
  ]) assert.match(adminPerformanceMigration, new RegExp(`CREATE INDEX "${indexName}"`));
  assert.match(adminPerformanceMigration, /"upload_status","moderation_status","created_at","id"/);
  assert.match(adminPerformanceMigration, /WHERE "files"\."deleted_at" IS NULL/);
  assert.doesNotMatch(adminPerformanceMigration, /\b(?:DROP|UPDATE|DELETE|INSERT)\b|password|secret/iu);
});

test("migration files, journal and latest snapshot are synchronized", async () => {
  const sqlFiles = (await readdir(new URL("../migrations", import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
  const journalFiles = migrationJournal.entries.map((entry) => `${entry.tag}.sql`).sort();
  assert.deepEqual(sqlFiles, journalFiles);
  assert.deepEqual(migrationJournal.entries.map((entry) => entry.idx), Array.from({ length: sqlFiles.length }, (_, index) => index));
  assert.equal(Object.keys(latestSnapshot.tables).length, 70);
  assert.equal(Object.keys(latestSnapshot.enums).length, 68);
});

test("admin local completion migration adds dual control, review evidence and scoped permissions", () => {
  for (const column of ["initial_review_admin_id", "initial_reviewed_at", "final_review_admin_id", "final_reviewed_at", "deleted_at", "version"])
    assert.match(adminLocalCompletionMigration, new RegExp(`ADD COLUMN "${column}"`));
  for (const permission of ["finance.export", "withdrawal.review.initial", "withdrawal.review.final"])
    assert.match(adminLocalCompletionMigration, new RegExp(permission.replaceAll(".", "\\.")));
  assert.match(adminLocalCompletionMigration, /withdrawals_dual_review_admins/);
  assert.doesNotMatch(adminLocalCompletionMigration, /DROP TABLE|TRUNCATE|DELETE FROM/iu);
});

test("local user lifecycle requests are minimal, versioned and reuse existing infrastructure", () => {
  for (const table of [
    "phone_change_requests",
    "personal_data_export_jobs",
    "account_cancellation_requests",
  ]) assert.match(userLifecycleMigration, new RegExp(`CREATE TABLE "${table}"`));

  for (const enumName of [
    "phone_change_request_status",
    "personal_data_export_status",
    "account_cancellation_status",
  ]) assert.match(userLifecycleMigration, new RegExp(`CREATE TYPE "public"\\."${enumName}" AS ENUM`));

  for (const reusedReference of [
    "old_sms_code_id_sms_codes_id_fk",
    "new_sms_code_id_sms_codes_id_fk",
    "output_file_id_files_id_fk",
    "decision_admin_operation_log_id_admin_operation_logs_id_fk",
  ]) assert.match(userLifecycleMigration, new RegExp(reusedReference));

  assert.match(userLifecycleMigration, /ALTER TYPE "public"\."file_type" ADD VALUE 'DATA_EXPORT'/);
  assert.match(userLifecycleMigration, /ALTER TYPE "public"\."file_usage_type" ADD VALUE 'EXPORT'/);
  assert.doesNotMatch(userLifecycleMigration, /presigned|https?:\/\//iu);
  assert.doesNotMatch(userLifecycleMigration, /phone_plain|plain_phone|mobile_number/iu);
});

test("lifecycle status transitions, concurrency and immutable evidence are database enforced", () => {
  for (const invariant of [
    "phone_change_requests_state_transition",
    "personal_data_export_jobs_state_transition",
    "account_cancellation_requests_state_transition",
    "phone_change_requests_integrity_trigger",
    "personal_data_export_jobs_file_trigger",
    "account_cancellation_requests_integrity_trigger",
    "complaint_evidences_limit_trigger",
    "complaint_evidences_file_trigger",
    "complaint_evidences_append_only",
  ]) assert.match(userLifecycleInvariantMigration, new RegExp(`"${invariant}"`));

  assert.match(userLifecycleInvariantMigration, /version must increase by exactly one/);
  assert.match(userLifecycleInvariantMigration, /complaint evidence limit of 20 reached/);
  assert.match(userLifecycleInvariantMigration, /PHONE_CHANGE_OLD/);
  assert.match(userLifecycleInvariantMigration, /PHONE_CHANGE_NEW/);
  assert.match(userLifecycleMigration, /complaint_evidences_submitter_xor/);
});

test("policy acceptance records capture scene and online confirmation without replacing history", () => {
  assert.match(policyAcceptanceMigration, /policy_acceptance_scene/);
  assert.match(policyAcceptanceMigration, /'LOGIN'.*'ORDER_PAYMENT'.*'SELLER_ONBOARDING'.*'VOICE_SAMPLE_UPLOAD'/s);
  assert.match(policyAcceptanceMigration, /policy_confirmation_method.*'ONLINE_CONFIRM'/s);
  assert.match(policyAcceptanceMigration, /ADD COLUMN "acceptance_scene"/);
  assert.match(policyAcceptanceMigration, /ADD COLUMN "confirmation_method"/);
  assert.match(policyAcceptanceMigration, /user_policy_acceptances_scene_idx/);
  assert.doesNotMatch(policyAcceptanceMigration, /\b(?:DELETE|TRUNCATE|DROP TABLE)\b/iu);
});

test("policy versions and business facts retain immutable legal-version context", () => {
  for (const column of [
    "effective_at",
    "requires_reacceptance",
    "onboarding_policy_version_id",
    "voice_authorization_policy_version_id",
    "transaction_policy_version_id",
    "refund_policy_version_id",
  ]) assert.match(policyBindingMigration, new RegExp(`"${column}"`));

  for (const invariant of [
    "policy_versions_protect_history",
    "user_policy_acceptances_validate_policy",
    "user_policy_acceptances_append_only",
    "seller_applications_policy_binding_trigger",
    "seller_profiles_voice_policy_binding_trigger",
    "orders_policy_binding_trigger",
  ]) assert.match(policyBindingMigration, new RegExp(`"${invariant}"`));

  assert.match(policyBindingMigration, /published or accepted policy version is immutable/);
  assert.match(policyBindingMigration, /only an effective published policy version can be accepted/);
  assert.match(policyBindingMigration, /SELLER_ONBOARDING_AGREEMENT/);
  assert.match(policyBindingMigration, /VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION/);
  assert.match(policyBindingMigration, /ORDER_PAYMENT_REFUND_RULES/);
  assert.match(policyBindingMigration, /orders_policy_versions_complete/);
  assert.doesNotMatch(policyBindingMigration, /\bBANK\b/u);
});

test("payment and payout channels are closed database enums", () => {
  assert.match(localFinalizationMigration, /CREATE TYPE "public"\."payment_channel" AS ENUM\('WECHAT_APP', 'ALIPAY_APP', 'MOCK'\)/);
  assert.match(localFinalizationMigration, /ALTER TABLE "payments" ALTER COLUMN "channel" SET DATA TYPE/);
  assert.match(localFinalizationMigration, /ALTER TABLE "payment_events" ALTER COLUMN "channel" SET DATA TYPE/);
  assert.match(schemaSource, /paymentChannelEnum\("channel"\)\.notNull\(\)/g);
  assert.match(initialMigration, /CREATE TYPE "public"\."payout_account_type" AS ENUM\('WECHAT', 'ALIPAY'\)/);
  assert.doesNotMatch(`${initialMigration}\n${localFinalizationMigration}`, /\bBANK\b/u);
});

test("voice samples keep typed metadata, moderation, binding and soft-delete support", () => {
  assert.match(initialMigration, /'VOICE_SAMPLE'/);
  for (const column of ["mime_type", "duration_ms", "moderation_status", "upload_status", "deleted_at"]) {
    assert.match(initialMigration, new RegExp(`"${column}"`));
  }
  assert.match(initialMigration, /CREATE TABLE "file_usages"/);
  assert.match(initialMigration, /'VOICE'/);
  assert.match(initialMigration, /"voice_file_id" uuid/);
  assert.match(localFinalizationMigration, /files_voice_metadata_valid/);
  assert.match(localFinalizationMigration, /audio\/aac.*audio\/mp4.*audio\/mpeg/);
  assert.match(localFinalizationMigration, /duration_ms" BETWEEN 10000 AND 30000/);
});

test("all cent-denominated columns remain bigint and core commands remain versioned/idempotent", () => {
  assert.doesNotMatch(schemaSource, /(?:real|doublePrecision|float)\([^\n]*(?:Cent|cent)/u);
  for (const table of ["orders", "payments", "refunds", "withdrawals"]) {
    assert.match(initialMigration, new RegExp(`CREATE TABLE "${table}"[\\s\\S]*?"version" integer DEFAULT 0 NOT NULL`));
  }
  for (const indexName of ["payments_idempotency_uq", "withdrawals_idempotency_uq", "idempotency_keys_scope_key_uq"]) {
    assert.match(initialMigration, new RegExp(`CREATE UNIQUE INDEX "${indexName}"`));
  }
});

test("chat, notification and event delivery identities are unique", () => {
  for (const indexName of [
    "messages_conversation_sequence_uq",
    "messages_user_client_uq",
    "messages_admin_client_uq",
    "notifications_idempotency_uq",
    "outbox_events_event_id_uq",
    "inbox_events_consumer_event_uq",
  ]) assert.match(initialMigration, new RegExp(`CREATE UNIQUE INDEX "${indexName}"`));
  assert.match(initialMigration, /conversation_members_unread_nonnegative/);
});
