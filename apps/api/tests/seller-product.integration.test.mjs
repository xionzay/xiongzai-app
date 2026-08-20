import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_seller_product_${randomUUID().replaceAll("-", "")}`;
let migrationClient;
let database;
let app;
let user;
let admin;
let readOnlyAdmin;

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "seller-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "seller-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "seller-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "seller-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "seller-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "seller-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "seller-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", SMS_DEVELOPMENT_CODE: "246810",
  SMS_CODE_TTL_SECONDS: "300", SMS_MAX_ATTEMPTS: "3", SMS_MINIMUM_INTERVAL_SECONDS: "1", ACCESS_TOKEN_TTL_SECONDS: "300",
  REFRESH_TOKEN_TTL_SECONDS: "3600", API_CORS_ORIGINS: "http://localhost:3001",
});

before(async () => {
  if (!enabled) return;
  migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  await migrationClient.query(`CREATE SCHEMA "${schemaName}"`);
  await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql");
  await runMigration("0001_core_invariants.sql");
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-seller-product-test", options: `-c search_path=${schemaName},public`, max: 4 });
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async () => {} }, logger: new JsonLogger("seller-product-test", () => {}) });
  user = await seedUser(true);
  admin = await seedAdmin(["seller_application.read", "seller_application.review", "seller.status.manage", "product.read", "product.review"]);
  readOnlyAdmin = await seedAdmin(["seller_application.read", "product.read"]);
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("seller application snapshots are immutable and admin review is permission-checked and audited", { skip: !enabled }, async () => {
  const unauthorized = await app.inject({ method: "GET", url: "/api/v1/seller/profile" });
  assert.equal(unauthorized.statusCode, 401);

  const created = await userRequest("POST", "/api/v1/seller/profile", {
    seller_nickname: "测试陪玩", introduction: "稳定沟通，全程平台内交易", game_rank: "无敌战神", kd: "6.80", preferred_mode: "经典模式", accepting_orders: true,
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().version, 0);

  const submitted = await userRequest("POST", "/api/v1/seller/applications", { version: 0 });
  assert.equal(submitted.statusCode, 201, submitted.body);
  assert.equal(submitted.json().version_no, 1);
  const duplicate = await userRequest("POST", "/api/v1/seller/applications", { version: 1 });
  assert.equal(duplicate.statusCode, 409);

  const denied = await adminRequest(readOnlyAdmin, "POST", `/admin-api/v1/seller-applications/${submitted.json().id}/review`, { action: "APPROVE", version: 0 });
  assert.equal(denied.statusCode, 403);
  const approved = await adminRequest(admin, "POST", `/admin-api/v1/seller-applications/${submitted.json().id}/review`, { action: "APPROVE", version: 0 });
  assert.equal(approved.statusCode, 201, approved.body);
  assert.equal(approved.json().status, "APPROVED");

  const seller = await userRequest("GET", "/api/v1/seller/profile");
  const changed = await userRequest("PATCH", "/api/v1/seller/profile", {
    seller_nickname: "改名后的陪玩", introduction: "新的介绍仍在平台交易", game_rank: "无敌战神", kd: "6.80", preferred_mode: "经典模式", accepting_orders: true, version: seller.json().version,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const snapshots = await migrationClient.query("SELECT snapshot_json, count(*) over()::integer AS count FROM seller_applications WHERE seller_id = $1", [seller.json().id]);
  assert.equal(snapshots.rows[0].count, 1);
  assert.equal(snapshots.rows[0].snapshot_json.seller_nickname, "测试陪玩");
  const logs = await migrationClient.query("SELECT (SELECT count(*) FROM seller_review_logs)::integer AS review_count, (SELECT count(*) FROM admin_operation_logs WHERE target_type = 'SELLER')::integer AS audit_count");
  assert.equal(logs.rows[0].review_count, 2);
  assert.equal(logs.rows[0].audit_count, 1);
});

test("product versions, bigint cents, SKU state and off-sale discovery rules work end to end", { skip: !enabled }, async () => {
  const created = await userRequest("POST", "/api/v1/seller/services", { title: "经典模式排位上分", description: "按局服务，稳定沟通，全程使用平台聊天。", service_time_description: "每天 18:00 后" });
  assert.equal(created.statusCode, 201, created.body);
  const productId = created.json().id;
  const sku = await userRequest("POST", `/api/v1/seller/services/${productId}/skus`, { sku_name: "单排一局", description: "约 30 分钟", price_cent: "2500", duration_minutes: 30, sort_order: 0 });
  assert.equal(sku.statusCode, 201, sku.body);
  assert.equal(sku.json().price_cent, "2500");
  const draft = await userRequest("GET", `/api/v1/seller/services/${productId}`);
  assert.equal(draft.json().min_price_cent, "2500");

  const submitted = await userRequest("POST", `/api/v1/seller/services/${productId}/submit-review`, { version: draft.json().version });
  assert.equal(submitted.statusCode, 201, submitted.body);
  assert.equal(submitted.json().current_version_no, 1);
  const conflict = await userRequest("POST", `/api/v1/seller/services/${productId}/submit-review`, { version: submitted.json().version });
  assert.equal(conflict.statusCode, 409);
  const approved = await adminRequest(admin, "POST", `/admin-api/v1/products/${productId}/review`, { action: "APPROVE", version: submitted.json().version });
  assert.equal(approved.statusCode, 201, approved.body);
  assert.equal(approved.json().status, "ON_SALE");

  const publicDetail = await app.inject({ method: "GET", url: `/api/v1/services/${productId}` });
  assert.equal(publicDetail.statusCode, 200, publicDetail.body);
  assert.equal(publicDetail.json().skus[0].price_cent, "2500");
  const offSale = await userRequest("POST", `/api/v1/seller/services/${productId}/off-sale`, { version: approved.json().version });
  assert.equal(offSale.statusCode, 201, offSale.body);
  assert.equal((await app.inject({ method: "GET", url: `/api/v1/services/${productId}` })).statusCode, 404);

  const updated = await userRequest("PATCH", `/api/v1/seller/services/${productId}`, { title: "经典模式双排上分", description: "更新后的服务说明，继续只在平台内沟通。", service_time_description: "周末全天", version: offSale.json().version });
  assert.equal(updated.statusCode, 200, updated.body);
  const resubmitted = await userRequest("POST", `/api/v1/seller/services/${productId}/submit-review`, { version: updated.json().version });
  assert.equal(resubmitted.json().current_version_no, 2);
  const versions = await migrationClient.query("SELECT version_no, snapshot_json->'product'->>'title' AS title FROM product_versions WHERE product_id = $1 ORDER BY version_no", [productId]);
  assert.deepEqual(versions.rows.map((row) => [row.version_no, row.title]), [[1, "经典模式排位上分"], [2, "经典模式双排上分"]]);
  const audit = await migrationClient.query("SELECT count(*)::integer AS count FROM admin_operation_logs WHERE target_type = 'PRODUCT' AND target_id = $1", [productId]);
  assert.equal(audit.rows[0].count, 1);
});

test("favorites stay unique and availability rejects overlapping open slots", { skip: !enabled }, async () => {
  const productRows = await migrationClient.query("SELECT id, version FROM products ORDER BY created_at LIMIT 1");
  const productId = productRows.rows[0].id;
  const waiting = await adminRequest(admin, "POST", `/admin-api/v1/products/${productId}/review`, { action: "APPROVE", version: productRows.rows[0].version });
  assert.equal(waiting.statusCode, 201, waiting.body);

  const first = await userRequest("PUT", `/api/v1/favorites/PRODUCT/${productId}`);
  const duplicate = await userRequest("PUT", `/api/v1/favorites/PRODUCT/${productId}`);
  assert.equal(first.json().created, true);
  assert.equal(duplicate.json().created, false);
  const count = await migrationClient.query("SELECT count(*)::integer AS count FROM favorites WHERE user_id = $1 AND product_id = $2", [user.id, productId]);
  assert.equal(count.rows[0].count, 1);

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const slot = await userRequest("POST", "/api/v1/seller/availability", { starts_at: start.toISOString(), ends_at: end.toISOString(), status: "OPEN" });
  assert.equal(slot.statusCode, 201, slot.body);
  const overlap = await userRequest("POST", "/api/v1/seller/availability", { starts_at: new Date(start.getTime() + 600_000).toISOString(), ends_at: new Date(end.getTime() + 600_000).toISOString(), status: "OPEN" });
  assert.equal(overlap.statusCode, 409);
  const adjacent = await userRequest("POST", "/api/v1/seller/availability", { starts_at: end.toISOString(), ends_at: new Date(end.getTime() + 3_600_000).toISOString(), status: "OPEN" });
  assert.equal(adjacent.statusCode, 201, adjacent.body);
});

async function seedUser(verified) {
  const id = randomUUID(); const sessionId = randomUUID();
  await migrationClient.query("INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask) VALUES ($1, 'encrypted', $2, '138****0000')", [id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO auth_sessions (id, user_id, refresh_token_hash, device_id, device_type, ip, user_agent, expires_at) VALUES ($1, $2, $3, 'seller-test-device', 'WEB', '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, id, "b".repeat(64)]);
  if (verified) await migrationClient.query("INSERT INTO identity_verifications (id, user_id, provider, provider_reference, legal_name_ciphertext, legal_name_hash, legal_name_mask, document_ciphertext, document_hash, document_mask, status, verified_at) VALUES ($1, $2, 'test', $3, 'encrypted', $4, '测*', 'encrypted', $5, '11**************22', 'VERIFIED', now())", [randomUUID(), id, randomUUID(), "c".repeat(64), "d".repeat(64)]);
  return { id, sessionId, token: issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 }) };
}

async function seedAdmin(permissionKeys) {
  const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID();
  await migrationClient.query("INSERT INTO admin_accounts (id, username, display_name, password_hash) VALUES ($1, $2, '业务审核员', 'not-used')", [id, `reviewer-${id}`]);
  await migrationClient.query("INSERT INTO admin_sessions (id, admin_id, session_token_hash, ip, user_agent, expires_at) VALUES ($1, $2, $3, '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO roles (id, role_key, name) VALUES ($1, $2, '业务审核')", [roleId, `seller-product-${roleId}`]);
  await migrationClient.query("INSERT INTO admin_roles (admin_id, role_id) VALUES ($1, $2)", [id, roleId]);
  for (const key of permissionKeys) { const permission = await migrationClient.query("INSERT INTO permissions (id, permission_key) VALUES ($1, $2) ON CONFLICT (permission_key) DO UPDATE SET permission_key = excluded.permission_key RETURNING id", [randomUUID(), key]); await migrationClient.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleId, permission.rows[0].id]); }
  return { id, token: issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 }) };
}

function userRequest(method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${user.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function adminRequest(account, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
