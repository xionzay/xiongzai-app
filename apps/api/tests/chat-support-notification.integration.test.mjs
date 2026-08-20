import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { NotificationInboxConsumer } from "@xiongzai/application";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_chat_support_${randomUUID().replaceAll("-", "")}`;
let migrationClient;
let database;
let app;
let buyer;
let seller;
let stranger;
let adminA;
let adminB;
let auditAdmin;
let readOnlyAdmin;
let productId;
let orderId;

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "chat-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "chat-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "chat-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "chat-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "chat-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "chat-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "chat-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", PAYMENT_PROVIDER_MODE: "mock",
  PAYMENT_WEBHOOK_SECRET: "chat-payment-webhook-secret-at-least-32-bytes", ACCESS_TOKEN_TTL_SECONDS: "300", REFRESH_TOKEN_TTL_SECONDS: "3600",
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
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-chat-support-test", options: `-c search_path=${schemaName},public`, max: 10 });
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async () => {} }, logger: new JsonLogger("chat-support-test", () => {}) });
  buyer = await seedUser("buyer"); seller = await seedUser("seller"); stranger = await seedUser("stranger");
  adminA = await seedAdmin("support-a", ["support.read", "support.manage", "support.reply"]);
  adminB = await seedAdmin("support-b", ["support.read", "support.manage", "support.reply"]);
  auditAdmin = await seedAdmin("audit", ["conversation.evidence.read"]);
  readOnlyAdmin = await seedAdmin("readonly", ["support.read"]);
  await seedOrderCatalog();
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("consultation messages are idempotent, paginated, readable, and private to members", { skip: !enabled }, async () => {
  const conversation = await userRequest(buyer, "POST", "/api/v1/conversations/consultations", { product_id: productId });
  assert.equal(conversation.statusCode, 201, conversation.body);
  assert.equal(conversation.json().conversation_type, "CONSULTATION");
  const payload = { client_message_id: `buyer-${randomUUID()}`, content: "今晚八点可以提供这项服务吗？" };
  const first = await userRequest(buyer, "POST", `/api/v1/conversations/${conversation.json().id}/messages`, payload);
  const duplicate = await userRequest(buyer, "POST", `/api/v1/conversations/${conversation.json().id}/messages`, payload);
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(duplicate.json().id, first.json().id);
  assert.equal(first.json().sequence_no, "2");
  const count = await migrationClient.query("SELECT count(*)::integer AS count FROM messages WHERE sender_user_id = $1 AND client_message_id = $2", [buyer.id, payload.client_message_id]);
  assert.equal(count.rows[0].count, 1);

  const denied = await userRequest(stranger, "GET", `/api/v1/conversations/${conversation.json().id}/messages?limit=20`);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().code, "CONVERSATION_ACCESS_DENIED");
  const sellerMessages = await userRequest(seller, "GET", `/api/v1/conversations/${conversation.json().id}/messages?limit=1`);
  assert.equal(sellerMessages.statusCode, 200, sellerMessages.body);
  assert.equal(sellerMessages.json().items.length, 1);
  assert.ok(sellerMessages.json().next_cursor);
  const marked = await userRequest(seller, "POST", `/api/v1/conversations/${conversation.json().id}/read`, { last_read_sequence_no: "2" });
  assert.equal(marked.json().unread_count, 0);
});

test("order conversations are unique and administrator evidence access requires a reason and audit permission", { skip: !enabled }, async () => {
  const first = await userRequest(buyer, "POST", "/api/v1/conversations/orders", { order_id: orderId });
  const second = await userRequest(seller, "POST", "/api/v1/conversations/orders", { order_id: orderId });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(second.json().id, first.json().id);
  await userRequest(buyer, "POST", `/api/v1/conversations/${first.json().id}/messages`, { client_message_id: `order-chat-${randomUUID()}`, content: "订单服务开始前请先确认段位。" });

  const noReason = await adminRequest(auditAdmin, "POST", `/admin-api/v1/conversations/${first.json().id}/evidence-view`, {});
  assert.equal(noReason.statusCode, 400);
  const noPermission = await adminRequest(readOnlyAdmin, "POST", `/admin-api/v1/conversations/${first.json().id}/evidence-view`, { reason: "处理订单争议，需要核验平台聊天" });
  assert.equal(noPermission.statusCode, 403);
  const viewed = await adminRequest(auditAdmin, "POST", `/admin-api/v1/conversations/${first.json().id}/evidence-view`, { reason: "处理订单争议，需要核验平台聊天" });
  assert.equal(viewed.statusCode, 201, viewed.body);
  assert.ok(viewed.json().messages.length >= 2);
  const audit = await migrationClient.query("SELECT id, reason FROM admin_operation_logs WHERE action = 'ORDER_CHAT_EVIDENCE_VIEW' AND target_id = $1", [first.json().id]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].reason, "处理订单争议，需要核验平台聊天");
  await assert.rejects(migrationClient.query("UPDATE admin_operation_logs SET reason = 'tampered' WHERE id = $1", [audit.rows[0].id]), /append-only|immutable/i);
});

test("support receive and transfer races use CAS while reply records first response, close time, and complete history", { skip: !enabled }, async () => {
  const created = await userRequest(buyer, "POST", "/api/v1/support-cases", { topic: "订单履约问题", priority: "HIGH", queue_key: "trade", related_type: "ORDER", related_id: orderId, source_page: "order-detail", initial_message: "陪玩还没有回复，请平台客服协助确认。" });
  assert.equal(created.statusCode, 201, created.body);
  const caseId = created.json().id;
  const [receiveA, receiveB] = await Promise.all([
    adminRequest(adminA, "POST", `/admin-api/v1/support-cases/${caseId}/receive`, { version: 0 }),
    adminRequest(adminB, "POST", `/admin-api/v1/support-cases/${caseId}/receive`, { version: 0 }),
  ]);
  assert.deepEqual([receiveA.statusCode, receiveB.statusCode].sort(), [201, 409], `${receiveA.body}\n${receiveB.body}`);
  const winner = receiveA.statusCode === 201 ? adminA : adminB;
  const loser = winner === adminA ? adminB : adminA;
  const deniedMessages = await adminRequest(loser, "GET", `/admin-api/v1/support-cases/${caseId}/messages?limit=20`);
  assert.equal(deniedMessages.statusCode, 403);

  const replyClientId = `reply-${randomUUID()}`;
  const replied = await adminRequest(winner, "POST", `/admin-api/v1/support-cases/${caseId}/reply`, { client_message_id: replyClientId, content: "您好，我正在核验订单与平台聊天记录。" });
  assert.equal(replied.statusCode, 201, replied.body);
  assert.ok(replied.json().first_response_at);
  const replyVersion = replied.json().support_case_version;
  const duplicateReply = await adminRequest(winner, "POST", `/admin-api/v1/support-cases/${caseId}/reply`, { client_message_id: replyClientId, content: "您好，我正在核验订单与平台聊天记录。" });
  assert.equal(duplicateReply.statusCode, 201, duplicateReply.body);
  assert.equal(duplicateReply.json().duplicate, true);
  assert.equal(duplicateReply.json().support_case_version, replyVersion);
  const [transferOne, transferTwo] = await Promise.all([
    adminRequest(winner, "POST", `/admin-api/v1/support-cases/${caseId}/transfer`, { version: replyVersion, queue_key: "risk", reason: "需要风控核验关联账号" }),
    adminRequest(winner, "POST", `/admin-api/v1/support-cases/${caseId}/transfer`, { version: replyVersion, queue_key: "finance", reason: "需要财务核验支付记录" }),
  ]);
  assert.deepEqual([transferOne.statusCode, transferTwo.statusCode].sort(), [201, 409], `${transferOne.body}\n${transferTwo.body}`);
  const transferred = (transferOne.statusCode === 201 ? transferOne : transferTwo).json();
  assert.equal(transferred.status, "TRANSFERRED");
  const receivedAgain = await adminRequest(loser, "POST", `/admin-api/v1/support-cases/${caseId}/receive`, { version: transferred.version });
  assert.equal(receivedAgain.statusCode, 201, receivedAgain.body);
  const closed = await adminRequest(loser, "POST", `/admin-api/v1/support-cases/${caseId}/close`, { version: receivedAgain.json().version, reason: "订单记录已核验并向用户说明处理结果" });
  assert.equal(closed.statusCode, 201, closed.body);
  assert.ok(closed.json().closed_at);
  assert.ok(closed.json().first_response_at);

  const detail = await userRequest(buyer, "GET", `/api/v1/support-cases/${caseId}`);
  assert.deepEqual(detail.json().logs.map((log) => log.action), ["CREATED", "RECEIVED", "REPLIED", "TRANSFERRED", "RECEIVED", "CLOSED"]);
  const reopened = await userRequest(buyer, "POST", `/api/v1/support-cases/${caseId}/reopen`, { version: closed.json().version, reason: "还有一个订单状态问题需要继续咨询" });
  assert.equal(reopened.statusCode, 201, reopened.body);
  assert.equal(reopened.json().status, "WAITING");
  assert.equal(reopened.json().closed_at, null);
  const logCount = await migrationClient.query("SELECT count(*)::integer AS count FROM support_case_logs WHERE support_case_id = $1", [caseId]);
  assert.equal(logCount.rows[0].count, 7);
});

test("Inbox duplicate consumption creates one notification and one in-app delivery log", { skip: !enabled }, async () => {
  const eventId = randomUUID(); const consumer = new NotificationInboxConsumer(database.db);
  const input = { eventId, userId: buyer.id, category: "ORDER", notificationType: "ORDER_ACCEPTED", title: "陪玩已接单", contentTemplateId: "order.accepted", contentVariables: { content: "陪玩已经接下订单", order_no: "TEST" }, relatedType: "ORDER", relatedId: orderId };
  const first = await consumer.consume(input);
  const duplicate = await consumer.consume(input);
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.notificationId, first.notificationId);
  const counts = await migrationClient.query("SELECT (SELECT count(*) FROM inbox_events WHERE event_id = $1)::integer AS inbox, (SELECT count(*) FROM notifications WHERE id = $2)::integer AS notifications, (SELECT count(*) FROM delivery_logs WHERE notification_id = $2)::integer AS deliveries", [eventId, first.notificationId]);
  assert.deepEqual(counts.rows[0], { inbox: 1, notifications: 1, deliveries: 1 });
  const list = await userRequest(buyer, "GET", "/api/v1/notifications?category=ORDER&limit=50");
  assert.equal(list.statusCode, 200, list.body);
  assert.ok(list.json().items.some((item) => item.id === first.notificationId));
  const read = await userRequest(buyer, "POST", `/api/v1/notifications/${first.notificationId}/read`);
  assert.equal(read.json().read_status, "READ");
});

async function seedOrderCatalog() {
  const sellerId = randomUUID(); productId = randomUUID(); const skuId = randomUUID(); orderId = randomUUID();
  await migrationClient.query("INSERT INTO seller_profiles (id, user_id, status, seller_nickname, accepting_orders, approved_at) VALUES ($1, $2, 'APPROVED', '聊天测试陪玩', true, now())", [sellerId, seller.id]);
  await migrationClient.query("INSERT INTO products (id, seller_id, title, description, status, min_price_cent, approved_at) VALUES ($1, $2, '聊天咨询测试服务', '用于测试普通咨询与订单会话的服务商品', 'ON_SALE', 2500, now())", [productId, sellerId]);
  await migrationClient.query("INSERT INTO product_skus (id, product_id, sku_name, description, price_cent, duration_minutes, status) VALUES ($1, $2, '一小时服务', '测试规格', 2500, 60, 'ACTIVE')", [skuId, productId]);
  await migrationClient.query("INSERT INTO orders (id, order_no, buyer_id, seller_user_id, seller_id, product_id, sku_id, product_title_snapshot, product_image_snapshot, product_description_snapshot, seller_name_snapshot, sku_name_snapshot, sku_description_snapshot, sku_price_cent_snapshot, sku_duration_minutes_snapshot, quantity, total_amount_cent, discount_cent, payable_amount_cent, commission_rate_bps_snapshot, platform_fee_cent, seller_income_cent, service_starts_at, service_ends_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, '聊天咨询测试服务', '', '快照说明', '聊天测试陪玩', '一小时服务', '测试规格', 2500, 60, 1, 2500, 0, 2500, 1000, 250, 2250, now() + interval '2 days', now() + interval '2 days 1 hour', now() + interval '10 minutes')", [orderId, `XZCHAT${randomUUID().replaceAll("-", "").slice(0, 20)}`, buyer.id, seller.id, sellerId, productId, skuId]);
}

async function seedUser(label) {
  const id = randomUUID(); const sessionId = randomUUID();
  await migrationClient.query("INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask) VALUES ($1, 'encrypted', $2, '138****0000')", [id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO auth_sessions (id, user_id, refresh_token_hash, device_id, device_type, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, 'WEB', '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2), `device-${label}`]);
  const token = issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 });
  return { id, token };
}

async function seedAdmin(label, permissionKeys) {
  const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID();
  await migrationClient.query("INSERT INTO admin_accounts (id, username, display_name, password_hash) VALUES ($1, $2, $3, 'not-used')", [id, `${label}-${id}`, `客服 ${label}`]);
  await migrationClient.query("INSERT INTO admin_sessions (id, admin_id, session_token_hash, ip, user_agent, expires_at) VALUES ($1, $2, $3, '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO roles (id, role_key, name) VALUES ($1, $2, $3)", [roleId, `role-${label}-${roleId}`, `角色 ${label}`]);
  await migrationClient.query("INSERT INTO admin_roles (admin_id, role_id) VALUES ($1, $2)", [id, roleId]);
  for (const key of permissionKeys) { const permission = await migrationClient.query("INSERT INTO permissions (id, permission_key) VALUES ($1, $2) ON CONFLICT (permission_key) DO UPDATE SET permission_key = excluded.permission_key RETURNING id", [randomUUID(), key]); await migrationClient.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleId, permission.rows[0].id]); }
  const token = issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 });
  return { id, token };
}

function userRequest(account, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function adminRequest(account, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
