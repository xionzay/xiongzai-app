import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig, MockPaymentProvider } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_after_sale_${randomUUID().replaceAll("-", "")}`;
const webhookSecret = "after-sale-webhook-secret-at-least-32-bytes";
let migrationClient;
let database;
let app;
let buyer;
let seller;
let admin;
let sellerProfileId;
let productId;
let skuId;
let paymentProvider;

class TrackingPaymentProvider extends MockPaymentProvider {
  refundCalls = [];
  async createRefund(input) { this.refundCalls.push(input.refundNo); return super.createRefund(input); }
}

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "after-sale-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "after-sale-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "after-sale-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "after-sale-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "after-sale-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "after-sale-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "after-sale-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", PAYMENT_PROVIDER_MODE: "mock",
  PAYMENT_WEBHOOK_SECRET: webhookSecret, ACCESS_TOKEN_TTL_SECONDS: "300", REFRESH_TOKEN_TTL_SECONDS: "3600", API_CORS_ORIGINS: "http://localhost:3001",
});

before(async () => {
  if (!enabled) return;
  migrationClient = new pg.Client({ connectionString: databaseUrl }); await migrationClient.connect(); await migrationClient.query(`CREATE SCHEMA "${schemaName}"`); await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql"); await runMigration("0001_core_invariants.sql");
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-after-sale-test", options: `-c search_path=${schemaName},public`, max: 12 });
  paymentProvider = new TrackingPaymentProvider(webhookSecret);
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async () => {} }, paymentProvider, logger: new JsonLogger("after-sale-test", () => {}) });
  buyer = await seedUser("buyer"); seller = await seedUser("seller"); admin = await seedAdmin("after-sale", ["refund.read", "refund.manage", "complaint.read", "complaint.manage", "review.read", "review.manage"]); await seedCatalog();
});

after(async () => { if (!enabled) return; await app?.close(); await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`); await migrationClient.end(); });

test("two historical partial refunds update cumulative amounts atomically and a duplicate callback is harmless", { skip: !enabled }, async () => {
  const firstOrder = await seedCompletedOrder(10_000n);
  const first = await createRefund(firstOrder.orderId, 3_000n, "第一次部分退款");
  const approved = await userRequest(seller, "POST", `/api/v1/seller/refunds/${first.id}/decision`, { version: first.version, decision: "APPROVE", reason: "同意退还未履约部分" });
  assert.equal(approved.statusCode, 201, approved.body); assert.equal(approved.json().status, "REFUND_PROCESSING");
  const callback = refundCallback(approved.json(), 3_000n); const callbackFirst = await callbackRequest(callback); const callbackReplay = await callbackRequest(callback);
  assert.equal(callbackFirst.statusCode, 201, callbackFirst.body); assert.equal(callbackFirst.json().refund.status, "REFUNDED"); assert.equal(callbackReplay.json().duplicate, true);

  const second = await createRefund(firstOrder.orderId, 2_000n, "第二次部分退款");
  const rejected = await userRequest(seller, "POST", `/api/v1/seller/refunds/${second.id}/decision`, { version: second.version, decision: "REJECT", reason: "需要平台核验" });
  const escalated = await userRequest(buyer, "POST", `/api/v1/refunds/${second.id}/escalate`, { version: rejected.json().version, reason: "申请平台介入核验服务记录" });
  const adminApproved = await adminRequest(admin, "POST", `/admin-api/v1/refunds/${second.id}/decision`, { version: escalated.json().version, decision: "APPROVE", approved_amount_cent: "2000", reason: "核验后支持部分退款" });
  assert.equal(adminApproved.statusCode, 201, adminApproved.body); assert.equal(adminApproved.json().status, "REFUND_PROCESSING");
  const secondCallback = await callbackRequest(refundCallback(adminApproved.json(), 2_000n)); assert.equal(secondCallback.statusCode, 201, secondCallback.body);

  const totals = await migrationClient.query("SELECT o.refunded_amount_cent::text AS order_refunded, o.payment_status, p.refunded_amount_cent::text AS payment_refunded, p.status AS payment_status, (SELECT count(*) FROM refunds WHERE order_id = o.id AND status = 'REFUNDED')::integer AS completed_refunds FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1", [firstOrder.orderId]);
  assert.deepEqual(totals.rows[0], { order_refunded: "5000", payment_status: "PARTIALLY_REFUNDED", payment_refunded: "5000", completed_refunds: 2 });
  const duplicateFacts = await migrationClient.query("SELECT (SELECT count(*) FROM inbox_events WHERE event_id = $1)::integer AS inbox, (SELECT count(*) FROM refund_logs WHERE refund_id = $2 AND action = 'CHANNEL_REFUND_SUCCEEDED')::integer AS success_logs", [callback.event_id, first.id]);
  assert.deepEqual(duplicateFacts.rows[0], { inbox: 1, success_logs: 1 });
  const audit = await migrationClient.query("SELECT count(*)::integer AS count FROM admin_operation_logs WHERE target_id = $1 AND action = 'REFUND_APPROVE'", [second.id]); assert.equal(audit.rows[0].count, 1);
});

test("concurrent refund requests allow one active flow and cumulative refunds cannot exceed paid amount", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(4_000n);
  const [left, right] = await Promise.all([
    userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(order.orderId, 1_000n, "并发申请 A"), { "idempotency-key": `refund-race-a-${randomUUID()}` }),
    userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(order.orderId, 1_000n, "并发申请 B"), { "idempotency-key": `refund-race-b-${randomUUID()}` }),
  ]);
  assert.deepEqual([left.statusCode, right.statusCode].sort(), [201, 409], `${left.body}\n${right.body}`);
  const excessiveOrder = await seedCompletedOrder(2_500n); const excessive = await userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(excessiveOrder.orderId, 2_501n, "超过实付"), { "idempotency-key": `refund-excess-${randomUUID()}` });
  assert.equal(excessive.statusCode, 409); assert.equal(excessive.json().code, "REFUND_AMOUNT_EXCEEDS_REMAINING");
});

test("invalid or concurrent refund approvals cannot duplicate provider side effects", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(4_000n);
  const refund = await createRefund(order.orderId, 1_000n, "渠道调用并发保护");
  const callsBefore = paymentProvider.refundCalls.length;
  const nonOwner = await userRequest(buyer, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version, decision: "APPROVE", reason: "非归属卖家不能批准" });
  assert.equal(nonOwner.statusCode, 404, nonOwner.body);
  const stale = await userRequest(seller, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version + 1, decision: "APPROVE", reason: "过期版本不能批准" });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(paymentProvider.refundCalls.length, callsBefore);
  const [left, right] = await Promise.all([
    userRequest(seller, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version, decision: "APPROVE", reason: "并发批准 A" }),
    userRequest(seller, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version, decision: "APPROVE", reason: "并发批准 B" }),
  ]);
  assert.deepEqual([left.statusCode, right.statusCode].sort(), [201, 409], `${left.body}\n${right.body}`);
  assert.equal(paymentProvider.refundCalls.length, callsBefore + 1);
});

test("complaints retain evidence, SLA transitions, immutable logs and administrator audit", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(3_000n); const firstFile = await seedEvidenceFile("first"); const secondFile = await seedEvidenceFile("second");
  const created = await userRequest(buyer, "POST", "/api/v1/complaints", { target_type: "ORDER", target_id: order.orderId, complaint_type: "履约争议", description: "陪玩没有按照预约时间完成服务，需要平台核验。", file_ids: [firstFile] });
  assert.equal(created.statusCode, 201, created.body);
  const accepted = await adminAction(created.json(), "ACCEPT", "客服已受理投诉"); const processing = await adminAction(accepted.json(), "START_PROCESSING", "开始核验订单与聊天记录"); const needEvidence = await adminAction(processing.json(), "REQUEST_EVIDENCE", "请补充预约时间截图");
  const evidence = await userRequest(buyer, "POST", `/api/v1/complaints/${created.json().id}/evidences`, { version: needEvidence.json().version, file_id: secondFile, description: "补充预约时间截图" });
  assert.equal(evidence.statusCode, 201, evidence.body); assert.equal(evidence.json().complaint.status, "PROCESSING");
  const completed = await adminAction(evidence.json().complaint, "COMPLETE", "证据核验完成", "确认存在履约异常，投诉成立"); assert.equal(completed.json().status, "COMPLETED");
  const detail = await userRequest(buyer, "GET", `/api/v1/complaints/${created.json().id}`); assert.equal(detail.json().evidences.length, 2); assert.deepEqual(detail.json().logs.map((log) => log.action), ["COMPLAINT_SUBMITTED", "COMPLAINT_ACCEPT", "COMPLAINT_START_PROCESSING", "COMPLAINT_REQUEST_EVIDENCE", "EVIDENCE_ADDED", "COMPLAINT_COMPLETE"]);
  const immutable = await migrationClient.query("UPDATE complaint_logs SET reason = 'tampered' WHERE complaint_id = $1", [created.json().id]).then(() => null, (error) => error); assert.match(String(immutable?.message), /append-only/);
  const audit = await migrationClient.query("SELECT count(*)::integer AS count FROM admin_operation_logs WHERE target_id = $1", [created.json().id]); assert.equal(audit.rows[0].count, 4);
});

test("reviews are order-unique, validate 1-5, and hiding/restoring recomputes rating aggregates", { skip: !enabled }, async () => {
  const orderFive = await seedCompletedOrder(2_000n); const orderOne = await seedCompletedOrder(2_000n);
  const invalid = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 6, content: "无效评分", anonymous: false }); assert.equal(invalid.statusCode, 400);
  const five = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 5, content: "技术稳定，沟通顺畅。", anonymous: false }); const one = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderOne.orderId, rating: 1, content: "本次服务没有达到预期。", anonymous: true });
  assert.equal(five.statusCode, 201, five.body); assert.equal(one.statusCode, 201, one.body);
  const duplicate = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 4, content: "再次评价", anonymous: false }); assert.equal(duplicate.statusCode, 409); assert.equal(duplicate.json().code, "REVIEW_ALREADY_EXISTS");
  assert.deepEqual(await aggregate(), { rating_count: 2, rating_sum: "6", rating_avg: "3.00", star_1_count: 1, star_5_count: 1 });
  const hidden = await adminRequest(admin, "POST", `/admin-api/v1/reviews/${five.json().id}/moderation`, { action: "HIDE", reason: "评价包含需要复核的内容" }); assert.equal(hidden.statusCode, 201, hidden.body); assert.deepEqual(await aggregate(), { rating_count: 1, rating_sum: "1", rating_avg: "1.00", star_1_count: 1, star_5_count: 0 });
  const afterHiddenDuplicate = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 3, content: "隐藏后再次评价", anonymous: false }); assert.equal(afterHiddenDuplicate.statusCode, 409);
  const restored = await adminRequest(admin, "POST", `/admin-api/v1/reviews/${five.json().id}/moderation`, { action: "RESTORE", reason: "复核后确认内容合规" }); assert.equal(restored.statusCode, 201, restored.body); assert.deepEqual(await aggregate(), { rating_count: 2, rating_sum: "6", rating_avg: "3.00", star_1_count: 1, star_5_count: 1 });
  const audit = await migrationClient.query("SELECT action FROM admin_operation_logs WHERE target_id = $1 ORDER BY created_at", [five.json().id]); assert.deepEqual(audit.rows.map((row) => row.action), ["REVIEW_HIDE", "REVIEW_RESTORE"]);
});

async function createRefund(orderId, amount, reason) { const response = await userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(orderId, amount, reason), { "idempotency-key": `refund-${randomUUID()}` }); assert.equal(response.statusCode, 201, response.body); return response.json(); }
function refundPayload(orderId, amount, reason) { return { order_id: orderId, amount_cent: amount.toString(), reason_code: "SERVICE_ISSUE", reason_text: reason, description: "集成测试退款申请" }; }
function refundCallback(refund, amount) { return { event_id: randomUUID(), event_type: "REFUND_SUCCEEDED", refund_no: refund.refund_no, provider_refund_no: refund.provider_refund_no, amount_cent: amount.toString() }; }
async function callbackRequest(payload) { const provider = new MockPaymentProvider(webhookSecret); return app.inject({ method: "POST", url: "/callbacks/v1/refunds/mock", headers: { "x-payment-signature": provider.signRefund(payload) }, payload }); }
async function adminAction(complaint, action, reason, result) { return adminRequest(admin, "POST", `/admin-api/v1/complaints/${complaint.id}/actions`, { version: complaint.version, action, reason, ...(result ? { result } : {}) }); }
async function aggregate() { const result = await migrationClient.query("SELECT rating_count, rating_sum::text, rating_avg::text, star_1_count, star_5_count FROM rating_aggregates WHERE product_id = $1", [productId]); return result.rows[0]; }

async function seedCompletedOrder(amount) {
  const orderId = randomUUID(); const paymentId = randomUUID(); const orderNo = `XZAS${randomUUID().replaceAll("-", "").slice(0, 24)}`; const paymentNo = `PAYAS${randomUUID().replaceAll("-", "").slice(0, 24)}`; const platformFee = amount / 10n;
  await migrationClient.query("INSERT INTO orders (id, order_no, buyer_id, seller_user_id, seller_id, product_id, sku_id, product_title_snapshot, product_image_snapshot, product_description_snapshot, seller_name_snapshot, sku_name_snapshot, sku_description_snapshot, sku_price_cent_snapshot, sku_duration_minutes_snapshot, quantity, total_amount_cent, discount_cent, payable_amount_cent, paid_amount_cent, commission_rate_bps_snapshot, platform_fee_cent, seller_income_cent, service_starts_at, service_ends_at, expires_at, status, payment_status, after_sale_status, paid_at, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'售后测试服务','','服务快照','售后测试陪玩','一小时服务','测试规格',$8,60,1,$8,0,$8,$8,1000,$9,$10,now()-interval '2 hours',now()-interval '1 hour',now()-interval '3 hours','COMPLETED','PAID','NONE',now()-interval '3 hours',now()-interval '30 minutes')", [orderId, orderNo, buyer.id, seller.id, sellerProfileId, productId, skuId, amount.toString(), platformFee.toString(), (amount - platformFee).toString()]);
  await migrationClient.query("INSERT INTO payments (id, order_id, payment_no, channel, provider_transaction_id, idempotency_key, amount_cent, status, paid_at) VALUES ($1,$2,$3,'MOCK',$4,$5,$6,'PAID',now()-interval '3 hours')", [paymentId, orderId, paymentNo, `tx-${randomUUID()}`, `payment-${randomUUID()}`, amount.toString()]); return { orderId, paymentId };
}

async function seedCatalog() { sellerProfileId = randomUUID(); productId = randomUUID(); skuId = randomUUID(); await migrationClient.query("INSERT INTO seller_profiles (id,user_id,status,seller_nickname,accepting_orders,approved_at) VALUES ($1,$2,'APPROVED','售后测试陪玩',true,now())", [sellerProfileId, seller.id]); await migrationClient.query("INSERT INTO products (id,seller_id,title,description,status,min_price_cent,approved_at) VALUES ($1,$2,'售后测试服务','退款投诉评价集成测试','ON_SALE',2000,now())", [productId, sellerProfileId]); await migrationClient.query("INSERT INTO product_skus (id,product_id,sku_name,description,price_cent,duration_minutes,status) VALUES ($1,$2,'一小时服务','测试规格',2000,60,'ACTIVE')", [skuId, productId]); }
async function seedEvidenceFile(label) { const id = randomUUID(); await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility) VALUES ($1,$2,'test',$3,'COMPLAINT_EVIDENCE','image/png',1024,$4,'VERIFIED','APPROVED','PRIVATE')", [id, buyer.id, `evidence/${label}-${id}.png`, randomUUID().replaceAll("-", "").repeat(2)]); return id; }
async function seedUser(label) { const id = randomUUID(); const sessionId = randomUUID(); await migrationClient.query("INSERT INTO users (id,phone_ciphertext,phone_hash,phone_mask,profile_initialized) VALUES ($1,'encrypted',$2,'138****0000',true)", [id, randomUUID().replaceAll("-", "").repeat(2)]); await migrationClient.query("INSERT INTO user_profiles (user_id,public_user_no,nickname) VALUES ($1,$2,$3)", [id, `U${randomUUID().replaceAll("-", "").slice(0, 14)}`, `测试用户${label}`]); await migrationClient.query("INSERT INTO auth_sessions (id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES ($1,$2,$3,$4,'WEB','127.0.0.1','integration-test',now()+interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2), `device-${label}`]); const token = issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 }); return { id, token }; }
async function seedAdmin(label, permissionKeys) { const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID(); await migrationClient.query("INSERT INTO admin_accounts (id,username,display_name,password_hash) VALUES ($1,$2,$3,'not-used')", [id, `${label}-${id}`, `管理员 ${label}`]); await migrationClient.query("INSERT INTO admin_sessions (id,admin_id,session_token_hash,ip,user_agent,expires_at) VALUES ($1,$2,$3,'127.0.0.1','integration-test',now()+interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]); await migrationClient.query("INSERT INTO roles (id,role_key,name) VALUES ($1,$2,$3)", [roleId, `role-${label}-${roleId}`, `角色 ${label}`]); await migrationClient.query("INSERT INTO admin_roles (admin_id,role_id) VALUES ($1,$2)", [id, roleId]); for (const key of permissionKeys) { const permission = await migrationClient.query("INSERT INTO permissions (id,permission_key) VALUES ($1,$2) ON CONFLICT (permission_key) DO UPDATE SET permission_key=excluded.permission_key RETURNING id", [randomUUID(), key]); await migrationClient.query("INSERT INTO role_permissions (role_id,permission_id) VALUES ($1,$2)", [roleId, permission.rows[0].id]); } const token = issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 }); return { id, token }; }
function userRequest(account, method, url, payload, extraHeaders = {}) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}`, ...extraHeaders }, ...(payload === undefined ? {} : { payload }) }); }
function adminRequest(account, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
