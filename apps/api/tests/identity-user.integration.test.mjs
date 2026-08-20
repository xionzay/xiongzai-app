import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig, SensitiveDataProtector } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_identity_${randomUUID().replaceAll("-", "")}`;
const deliveries = [];
const logLines = [];
let migrationClient;
let database;
let app;

const config = loadApiConfig({
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "identity-user-token-secret-at-least-32-bytes",
  ADMIN_TOKEN_SECRET: "identity-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "identity-internal-token-secret-at-least-32-bytes",
  CURSOR_SIGNING_SECRET: "identity-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "identity-pii-encryption-key-at-least-32-bytes",
  PII_HMAC_KEY: "identity-pii-hmac-key-at-least-32-bytes-long",
  AUTH_HMAC_KEY: "identity-auth-hmac-key-at-least-32-bytes-long",
  SMS_PROVIDER_MODE: "injected",
  SMS_DEVELOPMENT_CODE: "246810",
  SMS_CODE_TTL_SECONDS: "300",
  SMS_MAX_ATTEMPTS: "3",
  SMS_MINIMUM_INTERVAL_SECONDS: "1",
  ACCESS_TOKEN_TTL_SECONDS: "300",
  REFRESH_TOKEN_TTL_SECONDS: "3600",
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

  database = createDatabaseClient({
    connectionString: databaseUrl,
    application_name: "xiongzai-identity-api-test",
    options: `-c search_path=${schemaName},public`,
    max: 4,
  });
  app = await createApiApp({
    config,
    databaseClient: database,
    smsProvider: { sendCode: async (delivery) => { deliveries.push({ ...delivery }); } },
    logger: new JsonLogger("identity-api-test", (line) => logLines.push(line)),
  });
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("SMS codes expire, cannot be reused, and enforce the attempt limit", { skip: !enabled }, async () => {
  const expiredPhone = "13100000001";
  await sendCode(expiredPhone);
  const expiredCode = lastCode(expiredPhone);
  await migrationClient.query("UPDATE sms_codes SET expires_at = now() - interval '1 second' WHERE id = (SELECT id FROM sms_codes ORDER BY created_at DESC LIMIT 1)");
  const expired = await login(expiredPhone, expiredCode);
  assert.equal(expired.statusCode, 400);
  assert.equal(expired.json().code, "AUTH_SMS_CODE_EXPIRED");

  const attemptsPhone = "13100000002";
  await sendCode(attemptsPhone);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await login(attemptsPhone, "000000");
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, attempt === 3 ? "AUTH_SMS_ATTEMPTS_EXCEEDED" : "AUTH_SMS_CODE_INVALID");
  }
  const locked = await login(attemptsPhone, lastCode(attemptsPhone));
  assert.equal(locked.json().code, "AUTH_SMS_ATTEMPTS_EXCEEDED");

  const consumedPhone = "13100000003";
  await sendCode(consumedPhone);
  const code = lastCode(consumedPhone);
  const first = await login(consumedPhone, code);
  assert.equal(first.statusCode, 200);
  const repeated = await login(consumedPhone, code);
  assert.equal(repeated.statusCode, 400);
  assert.equal(repeated.json().code, "AUTH_SMS_CODE_INVALID");
});

test("login keeps tokens out of JSON, rotates refresh tokens, revokes sessions, and keeps phone hashes unique", { skip: !enabled }, async () => {
  const phone = "13200000001";
  await sendCode(phone);
  const loginResponse = await login(phone, lastCode(phone));
  assert.equal(loginResponse.statusCode, 200);
  assert.equal(loginResponse.json().token_transport, "http_only_cookie");
  assert.equal(JSON.stringify(loginResponse.json()).includes(phone), false);
  assert.equal(JSON.stringify(loginResponse.json()).includes("access_token"), false);
  assert.equal(JSON.stringify(loginResponse.json()).includes("refresh_token"), false);
  const initialCookies = cookieHeader(loginResponse);

  const rotated = await app.inject({ method: "POST", url: "/api/v1/auth/token/refresh", headers: { cookie: initialCookies } });
  assert.equal(rotated.statusCode, 200);
  const rotatedCookies = cookieHeader(rotated);
  assert.notEqual(rotatedCookies, initialCookies);
  const replay = await app.inject({ method: "POST", url: "/api/v1/auth/token/refresh", headers: { cookie: initialCookies } });
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.json().code, "AUTH_REFRESH_INVALID");

  const logout = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie: rotatedCookies } });
  assert.equal(logout.statusCode, 204);
  const revoked = await app.inject({ method: "POST", url: "/api/v1/auth/token/refresh", headers: { cookie: rotatedCookies } });
  assert.equal(revoked.statusCode, 401);

  const protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  const phoneHash = protector.piiHash("phone", protector.normalizePhone(phone));
  const stored = await migrationClient.query("SELECT count(*)::integer AS count, min(phone_ciphertext) AS ciphertext FROM users WHERE phone_hash = $1", [phoneHash]);
  assert.equal(stored.rows[0].count, 1);
  assert.equal(stored.rows[0].ciphertext.includes(phone), false);

  const expiring = await createSession("13200000002");
  await migrationClient.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE id = $1", [expiring.sessionId]);
  const expiredSession = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: expiring.cookies } });
  assert.equal(expiredSession.statusCode, 401);
  assert.equal(expiredSession.json().code, "AUTH_SESSION_INVALID");

  const removable = await createSession("13200000003");
  const sessions = await app.inject({ method: "GET", url: "/api/v1/me/sessions", headers: { cookie: removable.cookies } });
  assert.equal(sessions.statusCode, 200);
  assert.ok(sessions.json().some((item) => item.id === removable.sessionId));
  const removed = await app.inject({ method: "DELETE", url: `/api/v1/me/sessions/${removable.sessionId}`, headers: { cookie: removable.cookies } });
  assert.equal(removed.statusCode, 204);
  const removedSession = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: removable.cookies } });
  assert.equal(removedSession.statusCode, 401);
});

test("profile, policy acceptance and privacy updates use authenticated ownership and optimistic locks", { skip: !enabled }, async () => {
  const policyIds = await seedPolicies();
  const currentPolicies = await app.inject({ method: "GET", url: "/api/v1/policies/current" });
  assert.equal(currentPolicies.statusCode, 200);
  assert.equal(currentPolicies.json().length, 3);

  const session = await createSession("13300000001");
  const unauthorized = await app.inject({ method: "GET", url: "/api/v1/me" });
  assert.equal(unauthorized.statusCode, 401);

  const profile = await app.inject({
    method: "PATCH", url: "/api/v1/me/profile", headers: { cookie: session.cookies },
    payload: { nickname: "集成测试玩家", version: 0, user_version: session.user.version },
  });
  assert.equal(profile.statusCode, 200);
  assert.equal(profile.json().profile.nickname, "集成测试玩家");

  const accepted = await app.inject({
    method: "POST", url: "/api/v1/policies/acceptances", headers: { cookie: session.cookies }, payload: { policy_version_ids: policyIds },
  });
  assert.equal(accepted.statusCode, 201);
  const acceptanceCount = await migrationClient.query("SELECT count(*)::integer AS count FROM user_policy_acceptances WHERE user_id = $1", [session.user.id]);
  assert.equal(acceptanceCount.rows[0].count, 3);

  const privacy = await app.inject({ method: "GET", url: "/api/v1/me/privacy-settings", headers: { cookie: session.cookies } });
  assert.equal(privacy.statusCode, 200);
  const updated = await app.inject({
    method: "PATCH", url: "/api/v1/me/privacy-settings", headers: { cookie: session.cookies },
    payload: { show_online_status: false, version: privacy.json().version },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().show_online_status, false);
  const stale = await app.inject({
    method: "PATCH", url: "/api/v1/me/privacy-settings", headers: { cookie: session.cookies },
    payload: { personalized_recommendations: false, version: privacy.json().version },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, "RESOURCE_VERSION_CONFLICT");
});

test("identity data stays encrypted and masked while admin review is versioned and audited", { skip: !enabled }, async () => {
  const session = await createSession("13400000001");
  const legalName = "张安全";
  const documentNumber = "110101199001011234";
  const submitted = await app.inject({
    method: "POST", url: "/api/v1/me/identity-verification", headers: { cookie: session.cookies },
    payload: { legal_name: legalName, document_number: documentNumber },
  });
  assert.equal(submitted.statusCode, 201);
  assert.equal(submitted.json().status, "PENDING");
  assert.equal(submitted.body.includes(legalName), false);
  assert.equal(submitted.body.includes(documentNumber), false);
  const verificationId = submitted.json().id;

  const stored = await migrationClient.query("SELECT * FROM identity_verifications WHERE id = $1", [verificationId]);
  assert.equal(stored.rows[0].legal_name_ciphertext.includes(legalName), false);
  assert.equal(stored.rows[0].document_ciphertext.includes(documentNumber), false);
  assert.match(stored.rows[0].legal_name_hash, /^[a-f0-9]{64}$/);
  assert.match(stored.rows[0].document_hash, /^[a-f0-9]{64}$/);

  const admin = await seedIdentityReviewer();
  const reviewed = await app.inject({
    method: "POST", url: `/admin-api/v1/identity-verifications/${verificationId}/review`,
    headers: { authorization: `Bearer ${admin.token}` },
    payload: { decision: "VERIFIED", version: submitted.json().version, reason: "材料一致，完成基础审核" },
  });
  assert.equal(reviewed.statusCode, 201);
  assert.equal(reviewed.json().status, "VERIFIED");
  assert.equal(reviewed.body.includes(legalName), false);
  assert.equal(reviewed.body.includes(documentNumber), false);

  const audit = await migrationClient.query("SELECT before_json, after_json FROM admin_operation_logs WHERE admin_id = $1", [admin.id]);
  assert.equal(audit.rowCount, 1);
  assert.equal(JSON.stringify(audit.rows).includes(legalName), false);
  assert.equal(JSON.stringify(audit.rows).includes(documentNumber), false);
  assert.equal(logLines.join("\n").includes(legalName), false);
  assert.equal(logLines.join("\n").includes(documentNumber), false);

  await migrationClient.query("UPDATE users SET status = 'DISABLED', version = version + 1 WHERE id = $1", [session.user.id]);
  const blocked = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: session.cookies } });
  assert.equal(blocked.statusCode, 401);
  assert.equal(blocked.json().code, "AUTH_SESSION_INVALID");
});

async function sendCode(phone) {
  const response = await app.inject({ method: "POST", url: "/api/v1/auth/sms/send", payload: { phone } });
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.includes("code"), false);
  assert.equal(response.body.includes(phone), false);
  return response;
}

async function login(phone, code) {
  return app.inject({
    method: "POST", url: "/api/v1/auth/sms/login",
    payload: { phone, code, device_id: `web-${randomUUID()}`, device_type: "WEB" },
  });
}

async function createSession(phone) {
  await sendCode(phone);
  const response = await login(phone, lastCode(phone));
  assert.equal(response.statusCode, 200);
  return { cookies: cookieHeader(response), user: response.json().user, sessionId: response.json().session_id };
}

function lastCode(phone) {
  return deliveries.findLast((delivery) => delivery.phone === phone)?.code;
}

function cookieHeader(response) {
  const values = Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"] : [response.headers["set-cookie"]];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
}

async function seedPolicies() {
  const rows = [
    ["USER_AGREEMENT", "用户协议"], ["PRIVACY_POLICY", "隐私政策"], ["TRANSACTION_RULES", "交易规则"],
  ].map(([type, title]) => ({ id: randomUUID(), type, title }));
  for (const row of rows) {
    await migrationClient.query(
      "INSERT INTO policy_versions (id, policy_type, title, content, version_no, status, published_at) VALUES ($1, $2, $3, $4, 1, 'PUBLISHED', now())",
      [row.id, row.type, row.title, `${row.title}集成测试版本`],
    );
  }
  return rows.map((row) => row.id);
}

async function seedIdentityReviewer() {
  const adminId = randomUUID();
  const sessionId = randomUUID();
  const roleId = randomUUID();
  await migrationClient.query("INSERT INTO admin_accounts (id, username, display_name, password_hash) VALUES ($1, $2, '实名审核员', 'not-used')", [adminId, `reviewer-${adminId}`]);
  await migrationClient.query("INSERT INTO admin_sessions (id, admin_id, session_token_hash, ip, user_agent, expires_at) VALUES ($1, $2, $3, '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, adminId, "a".repeat(64)]);
  await migrationClient.query("INSERT INTO roles (id, role_key, name) VALUES ($1, $2, '实名审核')", [roleId, `identity-review-${roleId}`]);
  await migrationClient.query("INSERT INTO admin_roles (admin_id, role_id) VALUES ($1, $2)", [adminId, roleId]);
  for (const permissionKey of ["identity.read", "identity.review"]) {
    const permissionId = randomUUID();
    await migrationClient.query("INSERT INTO permissions (id, permission_key) VALUES ($1, $2)", [permissionId, permissionKey]);
    await migrationClient.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleId, permissionId]);
  }
  return {
    id: adminId,
    token: issueAccessToken(
      { sub: adminId, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true },
      { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 },
    ),
  };
}

function splitMigration(sql) {
  return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
}

async function runMigration(fileName) {
  let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of splitMigration(source)) await migrationClient.query(statement);
}
