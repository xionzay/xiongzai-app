import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { OrderJobProcessor, ORDER_JOB_TYPES } from "@xiongzai/application";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig, MockPaymentProvider } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_order_payment_${randomUUID().replaceAll("-", "")}`;
const webhookSecret = "order-payment-webhook-secret-at-least-32-bytes";
let migrationClient;
let database;
let app;
let seller;
let sellerProfileId;
let productId;
let skuId;
let slotId;
let buyers;
let slotSequence = 0;

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "order-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "order-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "order-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "order-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "order-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "order-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "order-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", PAYMENT_PROVIDER_MODE: "mock",
  PAYMENT_WEBHOOK_SECRET: webhookSecret, ACCESS_TOKEN_TTL_SECONDS: "300", REFRESH_TOKEN_TTL_SECONDS: "3600",
  API_CORS_ORIGINS: "http://localhost:3001",
});

before(async () => {
  if (!enabled) return;
  migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  await migrationClient.query(`CREATE SCHEMA "${schemaName}"`);
  await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql");
  await runMigration("0001_core_invariants.sql");
  await runMigration("0004_payment_channels_voice_constraints.sql");
  await runMigration("0005_policy_acceptance_context.sql");
  await runMigration("0006_policy_version_bindings.sql");
  await runMigration("0009_clear_rhodey.sql"); await runMigration("0010_order_rule_version.sql");
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-order-payment-test", options: `-c search_path=${schemaName},public`, max: 8 });
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async () => {} }, logger: new JsonLogger("order-payment-test", () => {}) });
  seller = await seedUser("seller");
  buyers = await Promise.all([seedUser("buyer-a"), seedUser("buyer-b"), seedUser("buyer-c")]);
  await seedPolicies();
  await seedCatalog();
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("preview and order creation preserve bigint snapshots, disable discounts, and replay idempotently", { skip: !enabled }, async () => {
  const draft = nextDraft(2);
  const availability = await app.inject({ method: "GET", url: `/api/v1/companions/${sellerProfileId}/availability` });
  assert.equal(availability.statusCode, 200, availability.body);
  assert.equal(availability.json()[0].id, slotId);
  const preview = await userRequest(buyers[0], "POST", "/api/v1/orders/preview", draft);
  assert.equal(preview.statusCode, 201, preview.body);
  assert.equal(preview.json().total_amount_cent, "5000");
  assert.equal(preview.json().discount_cent, "0");
  assert.equal(preview.json().payable_amount_cent, "5000");

  const key = `order-${randomUUID()}`;
  const first = await userRequest(buyers[0], "POST", "/api/v1/orders", draft, { "idempotency-key": key });
  const replay = await userRequest(buyers[0], "POST", "/api/v1/orders", draft, { "idempotency-key": key });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().id, first.json().id);
  assert.equal(first.json().discount_cent, "0");
  const sellerList = await userRequest(seller, "GET", "/api/v1/seller/orders");
  assert.equal(sellerList.statusCode, 200, sellerList.body);
  assert.equal(sellerList.json().items.some((item) => item.id === first.json().id), false);
  const sellerUnpaidDetail = await userRequest(seller, "GET", `/api/v1/seller/orders/${first.json().id}`);
  assert.equal(sellerUnpaidDetail.statusCode, 404);
  const stored = await migrationClient.query("SELECT count(*) over()::integer AS count, product_title_snapshot, sku_price_cent_snapshot::text, quantity, discount_cent::text FROM orders WHERE id = $1", [first.json().id]);
  assert.deepEqual(stored.rows[0], { count: 1, product_title_snapshot: "和平精英经典模式上分", sku_price_cent_snapshot: "2500", quantity: 2, discount_cent: "0" });
  const atomic = await migrationClient.query("SELECT (SELECT count(*) FROM order_status_logs WHERE order_id = $1)::integer AS logs, (SELECT count(*) FROM outbox_events WHERE aggregate_id = $1)::integer AS outbox, (SELECT count(*) FROM scheduled_jobs WHERE target_id = $1 AND job_type = 'ORDER_PAYMENT_TIMEOUT')::integer AS jobs", [first.json().id]);
  assert.deepEqual(atomic.rows[0], { logs: 1, outbox: 1, jobs: 1 });
});

test("GiST exclusion allows only one concurrent buyer to reserve the same seller time", { skip: !enabled }, async () => {
  const draft = nextDraft(1);
  const [left, right] = await Promise.all([
    userRequest(buyers[0], "POST", "/api/v1/orders", draft, { "idempotency-key": `race-a-${randomUUID()}` }),
    userRequest(buyers[1], "POST", "/api/v1/orders", draft, { "idempotency-key": `race-b-${randomUUID()}` }),
  ]);
  assert.deepEqual([left.statusCode, right.statusCode].sort(), [201, 409], `${left.body}\n${right.body}`);
  assert.equal([left, right].find((response) => response.statusCode === 409).json().code, "ORDER_SLOT_CONFLICT");
  const count = await migrationClient.query("SELECT count(*)::integer AS count FROM order_slot_reservations WHERE starts_at = $1 AND status IN ('HELD','CONFIRMED')", [draft.service_starts_at]);
  assert.equal(count.rows[0].count, 1);
});

test("order creation rejects a price changed after preview without writing an order", { skip: !enabled }, async () => {
  const draft = nextDraft(1);
  const preview = await userRequest(buyers[0], "POST", "/api/v1/orders/preview", draft);
  assert.equal(preview.statusCode, 201, preview.body);
  await migrationClient.query("UPDATE product_skus SET price_cent = 2600 WHERE id = $1", [skuId]);
  try {
    const created = await userRequest(buyers[0], "POST", "/api/v1/orders", { ...draft, expected_payable_amount_cent: preview.json().payable_amount_cent }, { "idempotency-key": `price-change-${randomUUID()}` });
    assert.equal(created.statusCode, 409, created.body);
    assert.equal(created.json().code, "ORDER_PRICE_CHANGED");
    const count = await migrationClient.query("SELECT count(*)::integer AS count FROM orders WHERE buyer_id = $1 AND service_starts_at = $2", [buyers[0].id, draft.service_starts_at]);
    assert.equal(count.rows[0].count, 0);
  } finally {
    await migrationClient.query("UPDATE product_skus SET price_cent = 2500 WHERE id = $1", [skuId]);
  }
});

test("same-party purchases and illegal state-machine transitions are rejected", { skip: !enabled }, async () => {
  const ownOrder = await userRequest(seller, "POST", "/api/v1/orders", nextDraft(1), { "idempotency-key": `same-party-${randomUUID()}` });
  assert.equal(ownOrder.statusCode, 409);
  assert.equal(ownOrder.json().code, "ORDER_PARTIES_SAME");

  const paid = await createPaidOrder(buyers[0]);
  const illegal = await userRequest(seller, "POST", `/api/v1/seller/orders/${paid.order.id}/start`, { version: paid.order.version });
  assert.equal(illegal.statusCode, 409);
  assert.equal(illegal.json().code, "ORDER_STATE_INVALID");
  const accepted = await userRequest(seller, "POST", `/api/v1/seller/orders/${paid.order.id}/accept`, { version: paid.order.version });
  assert.equal(accepted.statusCode, 201, accepted.body);
  assert.equal(accepted.json().status, "ACCEPTED");
  const stale = await userRequest(seller, "POST", `/api/v1/seller/orders/${paid.order.id}/start`, { version: paid.order.version });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, "RESOURCE_VERSION_CONFLICT");
  const early = await userRequest(seller, "POST", `/api/v1/seller/orders/${paid.order.id}/start`, { version: accepted.json().version });
  assert.equal(early.statusCode, 409);
  assert.equal(early.json().code, "ORDER_SERVICE_NOT_STARTED");
});

test("payment creation and callbacks are idempotent and reject mismatched amounts", { skip: !enabled }, async () => {
  const draft = nextDraft(1);
  const orderResponse = await userRequest(buyers[1], "POST", "/api/v1/orders", draft, { "idempotency-key": `payment-order-${randomUUID()}` });
  const paymentKey = `payment-${randomUUID()}`;
  const payment = await userRequest(buyers[1], "POST", "/api/v1/payments", { order_id: orderResponse.json().id, payment_channel: "WECHAT_APP" }, { "idempotency-key": paymentKey });
  const replay = await userRequest(buyers[1], "POST", "/api/v1/payments", { order_id: orderResponse.json().id, payment_channel: "WECHAT_APP" }, { "idempotency-key": paymentKey });
  assert.equal(payment.statusCode, 201, payment.body);
  assert.equal(replay.json().id, payment.json().id);
  assert.equal(payment.json().channel, "WECHAT_APP");
  assert.equal(payment.json().client_payload.payment_channel, "WECHAT_APP");
  const policyBinding = await migrationClient.query("SELECT transaction_policy_version_id, refund_policy_version_id FROM orders WHERE id = $1", [orderResponse.json().id]);
  assert.ok(policyBinding.rows[0].transaction_policy_version_id);
  assert.equal(policyBinding.rows[0].refund_policy_version_id, policyBinding.rows[0].transaction_policy_version_id);
  const channelConflict = await userRequest(buyers[1], "POST", "/api/v1/payments", { order_id: orderResponse.json().id, payment_channel: "ALIPAY_APP" }, { "idempotency-key": paymentKey });
  assert.equal(channelConflict.statusCode, 409, channelConflict.body);
  assert.equal(channelConflict.json().code, "PAYMENT_IDEMPOTENCY_CONFLICT");
  const pendingQuery = await userRequest(buyers[1], "POST", `/api/v1/payments/${payment.json().id}/query`);
  assert.equal(pendingQuery.statusCode, 201, pendingQuery.body);
  assert.equal(pendingQuery.json().provider_result.status, "PENDING");

  const provider = new MockPaymentProvider(webhookSecret, "WECHAT_APP");
  const callback = { event_id: `event-${randomUUID()}`, event_type: "PAYMENT_SUCCEEDED", payment_no: payment.json().payment_no, provider_transaction_id: `tx-${randomUUID()}`, amount_cent: payment.json().amount_cent };
  const first = await callbackRequest(callback, provider.sign(callback), "WECHAT_APP");
  const duplicate = await callbackRequest(callback, provider.sign(callback), "WECHAT_APP");
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().order.status, "PENDING_ACCEPT");
  assert.equal(duplicate.statusCode, 201, duplicate.body);
  assert.equal(duplicate.json().duplicate, true);
  const eventCount = await migrationClient.query("SELECT count(*)::integer AS count FROM payment_events WHERE payment_id = $1", [payment.json().id]);
  assert.equal(eventCount.rows[0].count, 1);
  const succeededQuery = await userRequest(buyers[1], "POST", `/api/v1/payments/${payment.json().id}/query`);
  assert.equal(succeededQuery.json().provider_result.status, "SUCCEEDED");

  const mismatchOrder = await userRequest(buyers[2], "POST", "/api/v1/orders", nextDraft(1), { "idempotency-key": `mismatch-order-${randomUUID()}` });
  const mismatchPayment = await userRequest(buyers[2], "POST", "/api/v1/payments", { order_id: mismatchOrder.json().id, payment_channel: "ALIPAY_APP" }, { "idempotency-key": `mismatch-payment-${randomUUID()}` });
  assert.equal(mismatchPayment.json().channel, "ALIPAY_APP");
  const alipayProvider = new MockPaymentProvider(webhookSecret, "ALIPAY_APP");
  const bad = { event_id: `event-${randomUUID()}`, event_type: "PAYMENT_SUCCEEDED", payment_no: mismatchPayment.json().payment_no, provider_transaction_id: `tx-${randomUUID()}`, amount_cent: "1" };
  const wrongChannel = await callbackRequest(bad, alipayProvider.sign(bad), "WECHAT_APP");
  assert.equal(wrongChannel.statusCode, 409);
  assert.equal(wrongChannel.json().code, "PAYMENT_CHANNEL_MISMATCH");
  const rejected = await callbackRequest(bad, alipayProvider.sign(bad), "ALIPAY_APP");
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.json().code, "PAYMENT_AMOUNT_MISMATCH");
  const unchanged = await migrationClient.query("SELECT p.status AS payment_status, o.status AS order_status, e.processing_error FROM payments p JOIN orders o ON o.id = p.order_id JOIN payment_events e ON e.payment_id = p.id WHERE p.id = $1", [mismatchPayment.json().id]);
  assert.deepEqual(unchanged.rows[0], { payment_status: "PAYING", order_status: "PENDING_PAYMENT", processing_error: "PAYMENT_AMOUNT_MISMATCH" });

  const failedOrder = await userRequest(buyers[2], "POST", "/api/v1/orders", nextDraft(1), { "idempotency-key": `failed-order-${randomUUID()}` });
  const failedPayment = await userRequest(buyers[2], "POST", "/api/v1/payments", { order_id: failedOrder.json().id, payment_channel: "ALIPAY_APP" }, { "idempotency-key": `failed-payment-${randomUUID()}` });
  const failedPayload = { event_id: `event-${randomUUID()}`, event_type: "PAYMENT_FAILED", payment_no: failedPayment.json().payment_no, provider_transaction_id: `tx-${randomUUID()}`, amount_cent: failedPayment.json().amount_cent };
  const failed = await callbackRequest(failedPayload, alipayProvider.sign(failedPayload), "ALIPAY_APP");
  assert.equal(failed.statusCode, 201, failed.body);
  assert.equal(failed.json().status, "FAILED", failed.body);
  const failedQuery = await userRequest(buyers[2], "POST", `/api/v1/payments/${failedPayment.json().id}/query`);
  assert.equal(failedQuery.json().payment.channel, "ALIPAY_APP");
  assert.equal(failedQuery.json().provider_result.status, "FAILED");

  const cancelOrder = await userRequest(buyers[0], "POST", "/api/v1/orders", nextDraft(1), { "idempotency-key": `cancel-order-${randomUUID()}` });
  const cancelPayment = await userRequest(buyers[0], "POST", "/api/v1/payments", { order_id: cancelOrder.json().id, payment_channel: "WECHAT_APP" }, { "idempotency-key": `cancel-payment-${randomUUID()}` });
  const cancelled = await userRequest(buyers[0], "POST", `/api/v1/payments/${cancelPayment.json().id}/mock-cancel`);
  assert.equal(cancelled.statusCode, 201, cancelled.body);
  assert.equal(cancelled.json().status, "CLOSED");
  const cancelledOrder = await userRequest(buyers[0], "GET", `/api/v1/orders/${cancelOrder.json().id}`);
  assert.equal(cancelledOrder.json().payment_status, "FAILED");
  const retryPayment = await userRequest(buyers[0], "POST", "/api/v1/payments", { order_id: cancelOrder.json().id, payment_channel: "ALIPAY_APP" }, { "idempotency-key": `retry-payment-${randomUUID()}` });
  assert.equal(retryPayment.statusCode, 201, retryPayment.body);
  const mockFailed = await userRequest(buyers[0], "POST", `/api/v1/payments/${retryPayment.json().id}/mock-fail`);
  assert.equal(mockFailed.statusCode, 201, mockFailed.body);
  assert.equal(mockFailed.json().status, "FAILED");
});

test("payment-timeout job closes the order, payment and reservation exactly once", { skip: !enabled }, async () => {
  const created = await userRequest(buyers[0], "POST", "/api/v1/orders", nextDraft(1), { "idempotency-key": `timeout-order-${randomUUID()}` });
  const payment = await userRequest(buyers[0], "POST", "/api/v1/payments", { order_id: created.json().id, payment_channel: "WECHAT_APP" }, { "idempotency-key": `timeout-payment-${randomUUID()}` });
  assert.equal(payment.statusCode, 201, payment.body);
  await migrationClient.query("UPDATE orders SET expires_at = now() - interval '1 second' WHERE id = $1", [created.json().id]);
  const processor = new OrderJobProcessor(database.db);
  assert.equal(await processor.process(ORDER_JOB_TYPES.PAYMENT_TIMEOUT, created.json().id, "timeout-test"), true);
  assert.equal(await processor.process(ORDER_JOB_TYPES.PAYMENT_TIMEOUT, created.json().id, "timeout-test-replay"), false);
  const closed = await migrationClient.query("SELECT o.status, o.payment_status, r.status AS reservation_status, p.status AS payment_row_status, (SELECT count(*) FROM order_status_logs WHERE order_id = o.id AND action = 'PAYMENT_TIMEOUT')::integer AS timeout_logs FROM orders o JOIN order_slot_reservations r ON r.order_id = o.id JOIN payments p ON p.order_id = o.id WHERE o.id = $1", [created.json().id]);
  assert.deepEqual(closed.rows[0], { status: "CLOSED", payment_status: "CLOSED", reservation_status: "RELEASED", payment_row_status: "CLOSED", timeout_logs: 1 });
});

test("accept-timeout and auto-confirm jobs are idempotent and release reservations", { skip: !enabled }, async () => {
  const acceptTimedOut = await createPaidOrder(buyers[1]);
  const processor = new OrderJobProcessor(database.db);
  assert.equal(await processor.process(ORDER_JOB_TYPES.ACCEPT_TIMEOUT, acceptTimedOut.order.id, "accept-timeout-test"), true);
  assert.equal(await processor.process(ORDER_JOB_TYPES.ACCEPT_TIMEOUT, acceptTimedOut.order.id, "accept-timeout-replay"), false);
  const acceptState = await migrationClient.query("SELECT o.status, r.status AS reservation_status FROM orders o JOIN order_slot_reservations r ON r.order_id = o.id WHERE o.id = $1", [acceptTimedOut.order.id]);
  assert.deepEqual(acceptState.rows[0], { status: "CLOSED", reservation_status: "RELEASED" });

  const completing = await createPaidOrder(buyers[2]);
  const accepted = await userRequest(seller, "POST", `/api/v1/seller/orders/${completing.order.id}/accept`, { version: completing.order.version });
  await migrationClient.query("UPDATE orders SET service_starts_at = now() - interval '1 minute' WHERE id = $1", [completing.order.id]);
  const started = await userRequest(seller, "POST", `/api/v1/seller/orders/${completing.order.id}/start`, { version: accepted.json().version });
  const completedBySeller = await userRequest(seller, "POST", `/api/v1/seller/orders/${completing.order.id}/complete`, { version: started.json().version });
  assert.equal(completedBySeller.statusCode, 201, completedBySeller.body);
  await migrationClient.query("UPDATE orders SET auto_confirm_at = now() - interval '1 second' WHERE id = $1", [completing.order.id]);
  assert.equal(await processor.process(ORDER_JOB_TYPES.AUTO_CONFIRM, completing.order.id, "auto-confirm-test"), true);
  assert.equal(await processor.process(ORDER_JOB_TYPES.AUTO_CONFIRM, completing.order.id, "auto-confirm-replay"), false);
  const autoState = await migrationClient.query("SELECT o.status, r.status AS reservation_status, (SELECT count(*) FROM scheduled_jobs WHERE target_id = o.id AND job_type = 'ORDER_AUTO_CONFIRM')::integer AS jobs FROM orders o JOIN order_slot_reservations r ON r.order_id = o.id WHERE o.id = $1", [completing.order.id]);
  assert.deepEqual(autoState.rows[0], { status: "COMPLETED", reservation_status: "RELEASED", jobs: 1 });
});

async function createPaidOrder(account) {
  const created = await userRequest(account, "POST", "/api/v1/orders", nextDraft(1), { "idempotency-key": `paid-order-${randomUUID()}` });
  assert.equal(created.statusCode, 201, created.body);
  const payment = await userRequest(account, "POST", "/api/v1/payments", { order_id: created.json().id, payment_channel: "WECHAT_APP" }, { "idempotency-key": `paid-payment-${randomUUID()}` });
  assert.equal(payment.statusCode, 201, payment.body);
  const confirmed = await userRequest(account, "POST", `/api/v1/payments/${payment.json().id}/mock-confirm`);
  assert.equal(confirmed.statusCode, 201, confirmed.body);
  return confirmed.json();
}

function nextDraft(quantity) {
  const serviceStartsAt = new Date(Date.now() + 2 * 86_400_000 + slotSequence * 4 * 3_600_000);
  slotSequence += 1;
  return { product_id: productId, sku_id: skuId, slot_id: slotId, quantity, service_starts_at: serviceStartsAt.toISOString(), buyer_note: "集成测试订单" };
}

async function seedCatalog() {
  sellerProfileId = randomUUID(); productId = randomUUID(); skuId = randomUUID(); slotId = randomUUID();
  await migrationClient.query("INSERT INTO seller_profiles (id, user_id, status, seller_nickname, accepting_orders, approved_at) VALUES ($1, $2, 'APPROVED', '测试陪玩熊仔', true, now())", [sellerProfileId, seller.id]);
  await migrationClient.query("INSERT INTO products (id, seller_id, title, description, status, min_price_cent, approved_at) VALUES ($1, $2, '和平精英经典模式上分', '订单快照测试商品说明', 'ON_SALE', 2500, now())", [productId, sellerProfileId]);
  await migrationClient.query("INSERT INTO product_skus (id, product_id, sku_name, description, price_cent, duration_minutes, status) VALUES ($1, $2, '经典模式一小时', '每份 60 分钟', 2500, 60, 'ACTIVE')", [skuId, productId]);
  await migrationClient.query("INSERT INTO seller_availability_slots (id, seller_id, starts_at, ends_at, status) VALUES ($1, $2, now() + interval '1 day', now() + interval '30 days', 'OPEN')", [slotId, sellerProfileId]);
}

async function seedPolicies() {
  const adminId = randomUUID();
  await migrationClient.query("INSERT INTO admin_accounts (id, username, display_name, password_hash) VALUES ($1, $2, '配置管理员', 'not-used')", [adminId, `config-${adminId}`]);
  const configs = [["order.payment_timeout_seconds", 300], ["order.accept_timeout_seconds", 300], ["order.auto_confirm_seconds", 300], ["finance.commission_rate_bps", 1000], ["finance.settlement_delay_seconds", 0]];
  for (const [key, value] of configs) await migrationClient.query("INSERT INTO platform_configs (id, config_key, value_json, version_no, status, effective_at, created_by_admin_id) VALUES ($1, $2, $3, 1, 'ACTIVE', now(), $4)", [randomUUID(), key, { value }, adminId]);
  const policyVersionId = randomUUID();
  await migrationClient.query("INSERT INTO policy_versions (id, policy_type, title, content, version_no, status, published_at, effective_at, created_by_admin_id) VALUES ($1, 'ORDER_PAYMENT_REFUND_RULES', '交易和退款规则', '订单支付集成测试规则', 1, 'PUBLISHED', now(), now(), $2)", [policyVersionId, adminId]);
  for (const buyer of buyers) {
    await migrationClient.query("INSERT INTO user_policy_acceptances (user_id, policy_version_id, acceptance_scene, confirmation_method, ip, user_agent) VALUES ($1, $2, 'ORDER_PAYMENT', 'ONLINE_CONFIRM', '127.0.0.1', 'integration-test')", [buyer.id, policyVersionId]);
  }
}

async function seedUser(label) {
  const id = randomUUID(); const sessionId = randomUUID();
  await migrationClient.query("INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask) VALUES ($1, 'encrypted', $2, '138****0000')", [id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO auth_sessions (id, user_id, refresh_token_hash, device_id, device_type, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, 'WEB', '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2), `device-${label}`]);
  const token = issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 });
  return { id, sessionId, token };
}

function userRequest(account, method, url, payload, extraHeaders = {}) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}`, ...extraHeaders }, ...(payload === undefined ? {} : { payload }) }); }
function callbackRequest(payload, signature, channel = "mock") { return app.inject({ method: "POST", url: `/callbacks/v1/payments/${channel}`, headers: { "x-payment-signature": signature }, payload }); }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
