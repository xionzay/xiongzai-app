import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { FinanceLedgerEngine } from "@xiongzai/application";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig, MockPaymentProvider, MockPayoutProvider } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_user_journey_${randomUUID().replaceAll("-", "")}`;
const paymentSecret = "journey-payment-webhook-secret-at-least-32";
const payoutSecret = "journey-payout-webhook-secret-at-least-32";
const deliveries = [];
const logs = [];
let migrationClient;
let database;
let app;
let buyer;
let seller;
let admin;
let finalAdmin;
let sellerId;
let productId;
let skuId;
let slotId;
let loginPolicyIds = [];
let paymentPolicyId;

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "journey-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "journey-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "journey-internal-token-secret-at-least-32", CURSOR_SIGNING_SECRET: "journey-cursor-signing-secret-at-least-32",
  PII_ENCRYPTION_KEY: "journey-pii-encryption-key-at-least-32", PII_HMAC_KEY: "journey-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "journey-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", PAYMENT_PROVIDER_MODE: "mock",
  PAYMENT_WEBHOOK_SECRET: paymentSecret, PAYOUT_PROVIDER_MODE: "mock", PAYOUT_WEBHOOK_SECRET: payoutSecret,
  ACCESS_TOKEN_TTL_SECONDS: "600", REFRESH_TOKEN_TTL_SECONDS: "3600", SMS_MINIMUM_INTERVAL_SECONDS: "1",
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
  await runMigration("0002_admin_stage2_permissions.sql");
  await runMigration("0003_admin_query_performance.sql");
  await runMigration("0004_payment_channels_voice_constraints.sql");
  await runMigration("0005_policy_acceptance_context.sql");
  await runMigration("0006_policy_version_bindings.sql");
  await runMigration("0009_clear_rhodey.sql"); await runMigration("0010_order_rule_version.sql");
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-user-journey-e2e", options: `-c search_path=${schemaName},public`, max: 16 });
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async (delivery) => deliveries.push({ ...delivery }) }, logger: new JsonLogger("user-journey-e2e", (line) => logs.push(line)) });
  admin = await seedAdmin(["order.read", "withdrawal.read", "withdrawal.manage", "withdrawal.review.initial"]);
  finalAdmin = await seedAdmin(["withdrawal.read", "withdrawal.review.final"]);
  await seedConfigs();
  ({ loginPolicyIds, paymentPolicyId } = await seedPolicies());
  seller = await loginUser("13900001001", "E2E陪玩");
  buyer = await loginUser("13900001002", "E2E买家");
  await seedCatalog();
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("用户端与陪玩端可完成从登录到提现、退款的真实全链路", { skip: !enabled }, async () => {
  const companions = await request(null, "GET", "/api/v1/companions?limit=20");
  const products = await request(null, "GET", "/api/v1/services?limit=20");
  assert.equal(companions.statusCode, 200, companions.body);
  assert.equal(products.statusCode, 200, products.body);
  assert.ok(companions.json().items.some((row) => row.id === sellerId));
  assert.ok(products.json().items.some((row) => row.id === productId));

  const favorite = await request(buyer, "PUT", `/api/v1/favorites/PRODUCT/${productId}`);
  assert.equal(favorite.statusCode, 200, favorite.body);
  const favorites = await request(buyer, "GET", "/api/v1/favorites");
  assert.equal(favorites.statusCode, 200, favorites.body);
  assert.equal(favorites.json().items.length, 1);
  assert.equal(favorites.json().next_cursor, null);

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const draft = { product_id: productId, sku_id: skuId, slot_id: slotId, quantity: 1, service_starts_at: start.toISOString(), buyer_note: "E2E 全链路预约" };
  const preview = await request(buyer, "POST", "/api/v1/orders/preview", draft);
  assert.equal(preview.statusCode, 201, preview.body);
  assert.deepEqual({ payable: preview.json().payable_amount_cent, discount: preview.json().discount_cent }, { payable: "2500", discount: "0" });
  const orderKey = `journey-order-${randomUUID()}`;
  const created = await request(buyer, "POST", "/api/v1/orders", draft, { "idempotency-key": orderKey });
  const replay = await request(buyer, "POST", "/api/v1/orders", draft, { "idempotency-key": orderKey });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(replay.json().id, created.json().id);
  let order = created.json();

  const acceptedPaymentRules = await request(buyer, "POST", "/api/v1/policies/acceptances", { acceptance_scene: "ORDER_PAYMENT", confirmation_method: "ONLINE_CONFIRM", policy_version_ids: [paymentPolicyId] });
  assert.equal(acceptedPaymentRules.statusCode, 201, acceptedPaymentRules.body);

  const payment = await request(buyer, "POST", "/api/v1/payments", { order_id: order.id, payment_channel: "WECHAT_APP" }, { "idempotency-key": `journey-payment-${randomUUID()}` });
  assert.equal(payment.statusCode, 201, payment.body);
  const paid = await request(buyer, "POST", `/api/v1/payments/${payment.json().id}/mock-confirm`);
  assert.equal(paid.statusCode, 201, paid.body);
  order = paid.json().order;
  assert.deepEqual([order.status, order.payment_status, order.paid_amount_cent], ["PENDING_ACCEPT", "PAID", "2500"]);

  const conversation = await request(buyer, "POST", "/api/v1/conversations/orders", { order_id: order.id });
  assert.equal(conversation.statusCode, 201, conversation.body);
  const clientMessageId = `journey-message-${randomUUID()}`;
  const message = await request(buyer, "POST", `/api/v1/conversations/${conversation.json().id}/messages`, { client_message_id: clientMessageId, content: "请按预约时间开始服务" });
  const messageReplay = await request(buyer, "POST", `/api/v1/conversations/${conversation.json().id}/messages`, { client_message_id: clientMessageId, content: "请按预约时间开始服务" });
  assert.equal(message.statusCode, 201, message.body);
  assert.equal(messageReplay.json().id, message.json().id);

  order = (await request(seller, "POST", `/api/v1/seller/orders/${order.id}/accept`, { version: order.version })).json();
  await migrationClient.query("UPDATE orders SET service_starts_at = now() - interval '1 minute' WHERE id = $1", [order.id]);
  order = (await request(seller, "POST", `/api/v1/seller/orders/${order.id}/start`, { version: order.version })).json();
  order = (await request(seller, "POST", `/api/v1/seller/orders/${order.id}/complete`, { version: order.version })).json();
  order = (await request(buyer, "POST", `/api/v1/orders/${order.id}/confirm`, { version: order.version })).json();
  assert.equal(order.status, "COMPLETED");

  const review = await request(buyer, "POST", "/api/v1/reviews", { order_id: order.id, rating: 5, content: "E2E 履约顺利，沟通清晰。", anonymous: false });
  assert.equal(review.statusCode, 201, review.body);
  const support = await request(buyer, "POST", "/api/v1/support-cases", { topic: "E2E 订单咨询", priority: "NORMAL", queue_key: "general", related_type: "ORDER", related_id: order.id, source_page: "e2e", initial_message: "请核对订单完成状态" });
  assert.equal(support.statusCode, 201, support.body);

  const incomeRow = await migrationClient.query("SELECT id FROM seller_incomes WHERE order_id=$1", [order.id]);
  assert.equal(incomeRow.rowCount, 1);
  const ledger = new FinanceLedgerEngine(database.db);
  assert.equal(await ledger.makeIncomeAvailable(incomeRow.rows[0].id, "journey-settlement"), true);
  const financeSummary = await request(seller, "GET", "/api/v1/seller/finance/summary");
  assert.equal(financeSummary.json().available_cent, "2250");

  const account = await request(seller, "POST", "/api/v1/seller/payout-accounts", { account_type: "ALIPAY", holder_name: "E2E收款人", account_token: "e2e-payout-account-001", is_default: true });
  assert.equal(account.statusCode, 201, account.body);
  const withdrawal = await request(seller, "POST", "/api/v1/seller/withdrawals", { payout_account_id: account.json().id, amount_cent: "2250" }, { "idempotency-key": `journey-withdrawal-${randomUUID()}` });
  assert.equal(withdrawal.statusCode, 201, withdrawal.body);
  const approved = await adminRequest("POST", `/admin-api/v1/withdrawals/${withdrawal.json().id}/approve`, { version: withdrawal.json().version, reason: "E2E 提现审核通过" });
  assert.equal(approved.statusCode, 201, approved.body);
  const payoutPayload = { event_id: randomUUID(), event_type: "PAYOUT_SUCCEEDED", withdrawal_no: approved.json().withdrawal_no, provider_payout_no: approved.json().provider_payout_no, amount_cent: approved.json().actual_amount_cent };
  const payoutProvider = new MockPayoutProvider(payoutSecret);
  const payout = await app.inject({ method: "POST", url: "/callbacks/v1/payouts/mock", headers: { "x-payout-signature": payoutProvider.sign(payoutPayload) }, payload: payoutPayload });
  assert.equal(payout.statusCode, 201, payout.body);
  assert.equal(payout.json().withdrawal.status, "COMPLETED");

  const refund = await request(buyer, "POST", "/api/v1/refunds", { order_id: order.id, amount_cent: "1000", reason_code: "SERVICE_ISSUE", reason_text: "E2E 部分退款", description: "验证退款、账务与欠款一致性" }, { "idempotency-key": `journey-refund-${randomUUID()}` });
  assert.equal(refund.statusCode, 201, refund.body);
  const refundApproved = await request(seller, "POST", `/api/v1/seller/refunds/${refund.json().id}/decision`, { version: refund.json().version, decision: "APPROVE", reason: "同意 E2E 部分退款" });
  assert.equal(refundApproved.statusCode, 201, refundApproved.body);
  const refundPayload = { event_id: randomUUID(), event_type: "REFUND_SUCCEEDED", refund_no: refundApproved.json().refund_no, provider_refund_no: refundApproved.json().provider_refund_no, amount_cent: "1000" };
  const paymentProvider = new MockPaymentProvider(paymentSecret);
  const refunded = await app.inject({ method: "POST", url: "/callbacks/v1/refunds/mock", headers: { "x-payment-signature": paymentProvider.signRefund(refundPayload) }, payload: refundPayload });
  assert.equal(refunded.statusCode, 201, refunded.body);
  assert.equal(refunded.json().refund.status, "REFUNDED");

  const buyerOrder = await request(buyer, "GET", `/api/v1/orders/${order.id}`);
  const adminOrder = await adminRequest("GET", `/admin-api/v1/orders/${order.id}`);
  assert.equal(adminOrder.statusCode, 200, adminOrder.body);
  assert.deepEqual(
    { id: buyerOrder.json().id, no: buyerOrder.json().order_no, status: buyerOrder.json().status, payment: buyerOrder.json().payment_status, refunded: buyerOrder.json().refunded_amount_cent },
    { id: adminOrder.json().id, no: adminOrder.json().order_no, status: adminOrder.json().status, payment: adminOrder.json().payment_status, refunded: adminOrder.json().refunded_amount_cent },
  );
  assert.equal(buyerOrder.json().refunded_amount_cent, "1000");
  const liability = await request(seller, "GET", "/api/v1/seller/finance/liabilities");
  assert.equal(liability.json()[0].outstanding_amount_cent, "900");

  const invariants = await migrationClient.query("SELECT (SELECT count(*) FROM outbox_events WHERE aggregate_id=$1)::integer outbox_count,(SELECT count(*) FROM messages WHERE client_message_id=$2)::integer message_count,(SELECT count(*) FROM support_cases WHERE id=$3)::integer support_count", [order.id, clientMessageId, support.json().id]);
  assert.ok(invariants.rows[0].outbox_count >= 6);
  assert.deepEqual({ message_count: invariants.rows[0].message_count, support_count: invariants.rows[0].support_count }, { message_count: 1, support_count: 1 });
  const unbalanced = await migrationClient.query("SELECT t.id FROM ledger_transactions t LEFT JOIN ledger_entries e ON e.transaction_id=t.id WHERE t.status='POSTED' GROUP BY t.id HAVING coalesce(sum(e.amount_cent) FILTER (WHERE e.side='DEBIT'),0)<>coalesce(sum(e.amount_cent) FILTER (WHERE e.side='CREDIT'),0) OR count(e.id)<2");
  assert.deepEqual(unbalanced.rows, []);
  assert.equal(logs.join("\n").includes("13900001001"), false);
  assert.equal(logs.join("\n").includes("13900001002"), false);
  assert.equal(logs.join("\n").includes(deliveries[0]?.code ?? "never"), false);
});

async function loginUser(phone, nickname) {
  const sent = await app.inject({ method: "POST", url: "/api/v1/auth/sms/send", payload: { phone } });
  assert.equal(sent.statusCode, 202, sent.body);
  const code = deliveries.findLast((delivery) => delivery.phone === phone)?.code;
  const loggedIn = await app.inject({ method: "POST", url: "/api/v1/auth/sms/login", payload: { phone, code, device_id: `e2e-${randomUUID()}`, device_type: "WEB", policy_version_ids: loginPolicyIds } });
  assert.equal(loggedIn.statusCode, 200, loggedIn.body);
  const actor = { id: loggedIn.json().user.id, cookies: cookieHeader(loggedIn) };
  const profile = await request(actor, "PATCH", "/api/v1/me/profile", { nickname, version: 0, user_version: loggedIn.json().user.version });
  assert.equal(profile.statusCode, 200, profile.body);
  return actor;
}

async function seedCatalog() {
  sellerId = randomUUID(); productId = randomUUID(); skuId = randomUUID(); slotId = randomUUID();
  await migrationClient.query("INSERT INTO seller_profiles (id,user_id,status,seller_nickname,introduction,game_rank,preferred_mode,accepting_orders,approved_at) VALUES ($1,$2,'APPROVED','E2E陪玩','全链路验收陪玩','无敌战神','和平精英',true,now())", [sellerId, seller.id]);
  await migrationClient.query("INSERT INTO products (id,seller_id,title,description,service_time_description,status,min_price_cent,approved_at) VALUES ($1,$2,'E2E 经典模式上分','用于上线前全链路验收','每天可预约','ON_SALE',2500,now())", [productId, sellerId]);
  await migrationClient.query("INSERT INTO product_skus (id,product_id,sku_name,description,price_cent,duration_minutes,status) VALUES ($1,$2,'E2E 一小时服务','一份 60 分钟',2500,60,'ACTIVE')", [skuId, productId]);
  await migrationClient.query("INSERT INTO seller_availability_slots (id,seller_id,starts_at,ends_at,status) VALUES ($1,$2,now()+interval '1 hour',now()+interval '7 days','OPEN')", [slotId, sellerId]);
}

async function seedAdmin(permissionKeys) {
  const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID();
  await migrationClient.query("INSERT INTO admin_accounts (id,username,display_name,password_hash) VALUES ($1,$2,'E2E管理员','not-used')", [id, `e2e-${id}`]);
  await migrationClient.query("INSERT INTO admin_sessions (id,admin_id,session_token_hash,ip,user_agent,expires_at) VALUES ($1,$2,$3,'127.0.0.1','e2e',now()+interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO roles (id,role_key,name) VALUES ($1,$2,'E2E角色')", [roleId, `e2e-role-${roleId}`]);
  await migrationClient.query("INSERT INTO admin_roles (admin_id,role_id) VALUES ($1,$2)", [id, roleId]);
  for (const key of permissionKeys) { const permission = await migrationClient.query("INSERT INTO permissions (id,permission_key) VALUES ($1,$2) ON CONFLICT (permission_key) DO UPDATE SET permission_key=excluded.permission_key RETURNING id", [randomUUID(), key]); await migrationClient.query("INSERT INTO role_permissions (role_id,permission_id) VALUES ($1,$2)", [roleId, permission.rows[0].id]); }
  const token = issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 600 });
  return { id, token };
}

async function seedConfigs() {
  for (const [key, value] of [["order.payment_timeout_seconds", 300], ["order.accept_timeout_seconds", 300], ["order.auto_confirm_seconds", 300], ["finance.commission_rate_bps", 1000], ["finance.settlement_delay_seconds", 0], ["finance.withdrawal_fee_bps", 100], ["finance.withdrawal_min_cent", 1], ["finance.withdrawal_max_cent", 1000000]]) {
    await migrationClient.query("INSERT INTO platform_configs (id,config_key,value_json,version_no,status,effective_at,created_by_admin_id) VALUES ($1,$2,$3,1,'ACTIVE',now(),$4)", [randomUUID(), key, { value }, admin.id]);
  }
}

async function seedPolicies() {
  const loginDefinitions = [
    ["USER_SERVICE_AGREEMENT", "用户服务协议"], ["PRIVACY_POLICY", "隐私政策"],
    ["PERSONAL_INFORMATION_COLLECTION_LIST", "个人信息收集清单"], ["THIRD_PARTY_SDK_SHARING_LIST", "第三方 SDK 及共享清单"],
    ["SYSTEM_PERMISSION_NOTICE", "系统权限说明"], ["MINOR_PROTECTION_NOTICE", "未成年人保护说明"],
  ];
  const ids = [];
  for (const [type, title] of loginDefinitions) {
    const id = randomUUID(); ids.push(id);
    await migrationClient.query("INSERT INTO policy_versions (id,policy_type,title,content,version_no,status,published_at,effective_at,created_by_admin_id) VALUES ($1,$2,$3,$4,1,'PUBLISHED',now(),now(),$5)", [id, type, title, `${title} E2E 测试版`, admin.id]);
  }
  const paymentId = randomUUID();
  await migrationClient.query("INSERT INTO policy_versions (id,policy_type,title,content,version_no,status,published_at,effective_at,created_by_admin_id) VALUES ($1,'ORDER_PAYMENT_REFUND_RULES','交易和退款规则','交易和退款规则 E2E 测试版',1,'PUBLISHED',now(),now(),$2)", [paymentId, admin.id]);
  return { loginPolicyIds: ids, paymentPolicyId: paymentId };
}

function request(actor, method, url, payload, headers = {}) { return app.inject({ method, url, headers: { ...(actor ? { cookie: actor.cookies } : {}), ...headers }, ...(payload === undefined ? {} : { payload }) }); }
async function adminRequest(method, url, payload) { const first=await app.inject({ method, url, headers: { authorization: `Bearer ${admin.token}` }, ...(payload === undefined ? {} : { payload }) });if(method==="POST"&&url.endsWith("/approve")&&first.statusCode===201&&first.json().status==="RISK_REVIEW")return app.inject({method:"POST",url:url.replace(/\/approve$/u,"/final-approve"),headers:{authorization:`Bearer ${finalAdmin.token}`},payload:{...payload,version:first.json().version,reason:`独立复核：${payload.reason}`}});return first; }
function cookieHeader(response) { const values = Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"] : [response.headers["set-cookie"]]; return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; "); }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(name) { let source = await readFile(new URL(`../../../packages/database/migrations/${name}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
