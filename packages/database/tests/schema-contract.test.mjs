import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const initialMigration = await readFile(
  new URL("../migrations/0000_initial_schema.sql", import.meta.url),
  "utf8",
);
const invariantMigration = await readFile(
  new URL("../migrations/0001_core_invariants.sql", import.meta.url),
  "utf8",
);
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
