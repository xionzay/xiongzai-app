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
const schemaName = `xiongzai_mobile_auth_${randomUUID().replaceAll("-", "")}`;
const deliveries = [];
const logLines = [];
let migrationClient;
let database;
let app;
let loginPolicyIds = [];

const config = loadApiConfig({
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "mobile-user-token-secret-at-least-32-bytes",
  ADMIN_TOKEN_SECRET: "mobile-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "mobile-internal-token-secret-at-least-32-bytes",
  CURSOR_SIGNING_SECRET: "mobile-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "mobile-pii-encryption-key-at-least-32-bytes",
  PII_HMAC_KEY: "mobile-pii-hmac-key-at-least-32-bytes-long",
  AUTH_HMAC_KEY: "mobile-auth-hmac-key-at-least-32-bytes-long",
  SMS_PROVIDER_MODE: "injected",
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
  await runMigration("0002_admin_stage2_permissions.sql");
  await runMigration("0003_admin_query_performance.sql");
  await runMigration("0004_payment_channels_voice_constraints.sql");
  await runMigration("0005_policy_acceptance_context.sql");
  await runMigration("0006_policy_version_bindings.sql"); await runMigration("0010_order_rule_versions.sql"); await runMigration("0011_service_categories.sql");
  loginPolicyIds = await seedLoginPolicies();

  database = createDatabaseClient({
    connectionString: databaseUrl,
    application_name: "xiongzai-mobile-auth-test",
    options: `-c search_path=${schemaName},public`,
    max: 8,
  });
  app = await createApiApp({
    config,
    databaseClient: database,
    smsProvider: { sendCode: async (delivery) => { deliveries.push({ ...delivery }); } },
    logger: new JsonLogger("mobile-auth-test", (line) => logLines.push(line)),
  });
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("mobile SMS login returns Bearer tokens without cookies and consumes the code once", { skip: !enabled }, async () => {
  const phone = "13500000001";
  await sendCode(phone);
  const code = lastCode(phone);

  const invalid = await mobileLogin(phone, "000000", mobileDevice("invalid-code"));
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().code, "AUTH_SMS_CODE_INVALID");
  assert.equal(invalid.headers["cache-control"], "no-store");
  assert.equal(invalid.body.includes(phone), false);
  assert.equal(invalid.body.includes("000000"), false);

  const response = await mobileLogin(phone, code, mobileDevice("login"));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(response.json().token_type, "Bearer");
  assert.equal(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(response.json().access_token), true);
  assert.equal(response.json().refresh_token.length >= 64, true);
  assert.ok(response.json().access_token_expires_in_seconds > 0);
  assert.ok(response.json().refresh_token_expires_in_seconds > response.json().access_token_expires_in_seconds);
  assert.equal(response.body.includes(phone), false);
  assert.equal(response.json().user.phone_mask, "135****0001");

  const stored = await migrationClient.query(
    "SELECT refresh_token_hash FROM auth_sessions WHERE id = $1",
    [response.json().session_id],
  );
  assert.match(stored.rows[0].refresh_token_hash, /^[a-f0-9]{64}$/);
  assert.equal(stored.rows[0].refresh_token_hash === response.json().refresh_token, false);

  const replay = await mobileLogin(phone, code, mobileDevice("replay"));
  assert.equal(replay.statusCode, 400);
  assert.equal(replay.json().code, "AUTH_SMS_CODE_INVALID");

  assertSensitiveValuesAbsent([phone, code, response.json().access_token, response.json().refresh_token], [
    logLines.join("\n"),
    invalid.body,
    replay.body,
    JSON.stringify((await migrationClient.query("SELECT metadata_json FROM security_logs")).rows),
  ]);
});

test("Bearer access supports me and unsafe writes without Cookie CSRF rules", { skip: !enabled }, async () => {
  const session = await createMobileSession("13500000002", "bearer");
  const me = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().id, session.user.id);

  const privacy = await app.inject({
    method: "GET",
    url: "/api/v1/me/privacy-settings",
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const updated = await app.inject({
    method: "PATCH",
    url: "/api/v1/me/privacy-settings",
    headers: { authorization: `Bearer ${session.accessToken}`, origin: "https://native-app.invalid" },
    payload: { show_online_status: false, version: privacy.json().version },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().show_online_status, false);

  const cookieOnly = await app.inject({
    method: "POST",
    url: "/api/v1/auth/mobile/logout",
    headers: { cookie: `xiongzai_access=${session.accessToken}` },
  });
  assert.equal(cookieOnly.statusCode, 401);
  assert.equal(cookieOnly.json().code, "AUTH_REQUIRED");
});

test("mobile refresh validates the device and atomically rotates exactly once", { skip: !enabled }, async () => {
  const session = await createMobileSession("13500000003", "rotation");
  const mismatch = await refresh(session.refreshToken, `${session.deviceId}-other`);
  assert.equal(mismatch.statusCode, 401);
  assert.equal(mismatch.json().code, "AUTH_REFRESH_INVALID");
  assert.equal(mismatch.headers["cache-control"], "no-store");

  const rotated = await refresh(session.refreshToken, session.deviceId);
  assert.equal(rotated.statusCode, 200);
  assert.equal(rotated.headers["cache-control"], "no-store");
  assert.equal(rotated.json().access_token === session.accessToken, false);
  assert.equal(rotated.json().refresh_token === session.refreshToken, false);

  const oldReplay = await refresh(session.refreshToken, session.deviceId);
  assert.equal(oldReplay.statusCode, 401);
  assert.equal(oldReplay.json().code, "AUTH_REFRESH_INVALID");

  const concurrentSession = await createMobileSession("13500000004", "concurrent");
  const concurrent = await Promise.all([
    refresh(concurrentSession.refreshToken, concurrentSession.deviceId),
    refresh(concurrentSession.refreshToken, concurrentSession.deviceId),
  ]);
  assert.deepEqual(concurrent.map((response) => response.statusCode).sort(), [200, 401]);
  assert.equal(concurrent.filter((response) => response.statusCode === 200).length, 1);
  assert.equal(concurrent.filter((response) => response.statusCode === 401)[0].json().code, "AUTH_REFRESH_INVALID");
});

test("revoked sessions and disabled users reject both access and refresh", { skip: !enabled }, async () => {
  const revoked = await createMobileSession("13500000005", "revoked");
  const revoke = await app.inject({
    method: "DELETE",
    url: `/api/v1/me/sessions/${revoked.sessionId}`,
    headers: { authorization: `Bearer ${revoked.accessToken}` },
  });
  assert.equal(revoke.statusCode, 204);
  assert.equal((await refresh(revoked.refreshToken, revoked.deviceId)).statusCode, 401);
  assert.equal((await bearerMe(revoked.accessToken)).json().code, "AUTH_SESSION_INVALID");

  const disabled = await createMobileSession("13500000006", "disabled");
  await migrationClient.query("UPDATE users SET status = 'DISABLED', version = version + 1 WHERE id = $1", [disabled.user.id]);
  const blockedAccess = await bearerMe(disabled.accessToken);
  assert.equal(blockedAccess.statusCode, 401);
  assert.equal(blockedAccess.json().code, "AUTH_SESSION_INVALID");
  const blockedRefresh = await refresh(disabled.refreshToken, disabled.deviceId);
  assert.equal(blockedRefresh.statusCode, 401);
  assert.equal(blockedRefresh.json().code, "AUTH_REFRESH_INVALID");

  const revokedDevice = await createMobileSession("13500000008", "revoked-device");
  await migrationClient.query(
    "UPDATE user_devices SET revoked_at = now() WHERE user_id = $1 AND device_id = $2",
    [revokedDevice.user.id, revokedDevice.deviceId],
  );
  const deviceRefresh = await refresh(revokedDevice.refreshToken, revokedDevice.deviceId);
  assert.equal(deviceRefresh.statusCode, 401);
  assert.equal(deviceRefresh.json().code, "AUTH_REFRESH_INVALID");
});

test("mobile logout revokes the session and repeat use has no additional side effects", { skip: !enabled }, async () => {
  const session = await createMobileSession("13500000007", "logout");
  const logout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/mobile/logout",
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(logout.statusCode, 204);
  assert.equal(logout.headers["cache-control"], "no-store");
  assert.equal((await bearerMe(session.accessToken)).statusCode, 401);
  assert.equal((await refresh(session.refreshToken, session.deviceId)).statusCode, 401);

  const repeated = await app.inject({
    method: "POST",
    url: "/api/v1/auth/mobile/logout",
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(repeated.statusCode, 401);
  assert.equal(repeated.json().code, "AUTH_SESSION_INVALID");
  const logoutLogs = await migrationClient.query(
    "SELECT count(*)::integer AS count FROM security_logs WHERE user_id = $1 AND event_type = 'LOGOUT'",
    [session.user.id],
  );
  assert.equal(logoutLogs.rows[0].count, 1);
});

test("malformed and expired Bearer tokens use the unified error contract", { skip: !enabled }, async () => {
  const malformed = await bearerMe("not-a-valid-token");
  assert.equal(malformed.statusCode, 401);
  assert.equal(malformed.json().code, "AUTH_TOKEN_INVALID");
  assert.equal(typeof malformed.json().request_id, "string");
  assert.deepEqual(malformed.json().field_errors, []);
  assert.equal(malformed.body.includes("not-a-valid-token"), false);

  const expired = issueAccessToken(
    { sub: randomUUID(), principal_type: "user", token_use: "access", session_id: randomUUID() },
    {
      secret: config.userTokenSecret,
      issuer: config.tokenIssuer,
      audience: config.userTokenAudience,
      expiresInSeconds: 60,
      nowSeconds: Math.floor(Date.now() / 1000) - 120,
    },
  );
  const expiredResponse = await bearerMe(expired);
  assert.equal(expiredResponse.statusCode, 401);
  assert.equal(expiredResponse.json().code, "AUTH_TOKEN_EXPIRED");
  assert.equal(expiredResponse.body.includes(expired), false);
});

test("production mobile token endpoints reject plain HTTP", async (t) => {
  const productionConfig = loadApiConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://service:credential@db.production.internal:5432/xiongzai",
    USER_TOKEN_SECRET: "production-user-token-secret-at-least-32-bytes",
    ADMIN_TOKEN_SECRET: "production-admin-token-secret-at-least-32-bytes",
    INTERNAL_TOKEN_SECRET: "production-internal-token-secret-at-least-32-bytes",
    CURSOR_SIGNING_SECRET: "production-cursor-secret-at-least-32-bytes",
    PII_ENCRYPTION_KEY: "production-pii-encryption-key-at-least-32-bytes",
    PII_HMAC_KEY: "production-pii-hmac-key-at-least-32-bytes-long",
    AUTH_HMAC_KEY: "production-auth-hmac-key-at-least-32-bytes-long",
    SMS_PROVIDER_MODE: "injected",
    PAYMENT_PROVIDER_MODE: "injected",
    PAYMENT_WEBHOOK_SECRET: "production-payment-webhook-secret-at-least-32-bytes",
    PAYOUT_PROVIDER_MODE: "injected",
    PAYOUT_WEBHOOK_SECRET: "production-payout-webhook-secret-at-least-32-bytes",
    API_CORS_ORIGINS: "https://staging.example.invalid",
    API_TRUSTED_PROXY_CIDRS: "10.20.0.0/16",
    FILE_STORAGE_PROVIDER: "aliyun-oss",
    FILE_STORAGE_ENDPOINT: "https://oss.production.internal",
    FILE_STORAGE_REGION: "production-region-1",
    FILE_STORAGE_ACCESS_KEY_ID: "production-storage-access",
    FILE_STORAGE_SECRET_ACCESS_KEY: "production-storage-credential",
    FILE_PUBLIC_BUCKET: "xiongzai-production-public",
    FILE_PRIVATE_BUCKET: "xiongzai-production-private",
    FILE_QUARANTINE_BUCKET: "xiongzai-production-quarantine",
  });
  const productionApp = await createApiApp({
    config: productionConfig,
    databaseClient: { db: {}, pool: {}, close: async () => {} },
    smsProvider: { sendCode: async () => {} },
    paymentProvider: { createIntent: async () => { throw new Error("unused"); }, createRefund: async () => { throw new Error("unused"); } },
    payoutProvider: { createPayout: async () => { throw new Error("unused"); } },
    logger: new JsonLogger("production-mobile-auth-test", () => {}),
  });
  t.after(() => productionApp.close());
  const response = await productionApp.inject({
    method: "POST",
    url: "/api/v1/auth/mobile/token/refresh",
    payload: { refresh_token: "x".repeat(64), device_id: "device-production-test" },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "AUTH_INSECURE_TRANSPORT");
  const paymentCallback = await productionApp.inject({
    method: "POST", url: "/callbacks/v1/payments/mock", payload: {
      event_id: "event-production-disabled", event_type: "PAYMENT_SUCCEEDED", payment_no: "PAYPRODUCTIONDISABLED",
      provider_transaction_id: "TXPRODUCTIONDISABLED", amount_cent: "100",
    },
  });
  assert.equal(paymentCallback.statusCode, 404);
  assert.equal(paymentCallback.json().code, "MOCK_PAYMENT_DISABLED");
  const refundCallback = await productionApp.inject({
    method: "POST", url: "/callbacks/v1/refunds/mock", payload: {
      event_id: randomUUID(), event_type: "REFUND_SUCCEEDED", refund_no: "RFPRODUCTIONDISABLED",
      provider_refund_no: "PRFPRODUCTIONDISABLED", amount_cent: "100",
    },
  });
  assert.equal(refundCallback.statusCode, 404);
  assert.equal(refundCallback.json().code, "MOCK_REFUND_DISABLED");
  const payoutCallback = await productionApp.inject({
    method: "POST", url: "/callbacks/v1/payouts/mock", payload: {
      event_id: randomUUID(), event_type: "PAYOUT_SUCCEEDED", withdrawal_no: "WDPRODUCTIONDISABLED",
      provider_payout_no: "PAYOUTPRODUCTIONDISABLED", amount_cent: "100",
    },
  });
  assert.equal(payoutCallback.statusCode, 404);
  assert.equal(payoutCallback.json().code, "MOCK_PAYOUT_DISABLED");
});

async function sendCode(phone) {
  const response = await app.inject({ method: "POST", url: "/api/v1/auth/sms/send", payload: { phone } });
  assert.equal(response.statusCode, 202);
}

async function mobileLogin(phone, code, device) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/mobile/sms/login",
    payload: {
      phone,
      code,
      device_id: device.deviceId,
      device_name: device.deviceName,
      platform: device.platform,
      app_version: "1.0.0-test",
      policy_version_ids: loginPolicyIds,
    },
  });
}

async function createMobileSession(phone, label) {
  const device = mobileDevice(label);
  await sendCode(phone);
  const response = await mobileLogin(phone, lastCode(phone), device);
  assert.equal(response.statusCode, 200);
  return {
    accessToken: response.json().access_token,
    refreshToken: response.json().refresh_token,
    sessionId: response.json().session_id,
    user: response.json().user,
    ...device,
  };
}

function mobileDevice(label) {
  return {
    deviceId: `ios-${label}-${randomUUID()}`,
    deviceName: `Test device ${label}`,
    platform: "IOS",
  };
}

function refresh(refreshToken, deviceId) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/mobile/token/refresh",
    payload: { refresh_token: refreshToken, device_id: deviceId },
  });
}

function bearerMe(accessToken) {
  return app.inject({ method: "GET", url: "/api/v1/me", headers: { authorization: `Bearer ${accessToken}` } });
}

function lastCode(phone) {
  return deliveries.findLast((delivery) => delivery.phone === phone)?.code;
}

function assertSensitiveValuesAbsent(values, sources) {
  for (const value of values) {
    for (const source of sources) assert.equal(source.includes(value), false);
  }
}

async function seedLoginPolicies() {
  const definitions = [
    ["USER_SERVICE_AGREEMENT", "用户服务协议"],
    ["PRIVACY_POLICY", "隐私政策"],
    ["PERSONAL_INFORMATION_COLLECTION_LIST", "个人信息收集清单"],
    ["THIRD_PARTY_SDK_SHARING_LIST", "第三方 SDK 及共享清单"],
    ["SYSTEM_PERMISSION_NOTICE", "系统权限说明"],
    ["MINOR_PROTECTION_NOTICE", "未成年人保护说明"],
  ];
  const ids = [];
  for (const [type, title] of definitions) {
    const id = randomUUID(); ids.push(id);
    await migrationClient.query(
      "INSERT INTO policy_versions (id, policy_type, title, content, version_no, status, published_at, effective_at) VALUES ($1, $2, $3, $4, 1, 'PUBLISHED', now(), now())",
      [id, type, title, `${title}移动端集成测试版本`],
    );
  }
  return ids;
}

function splitMigration(sql) {
  return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
}

async function runMigration(fileName) {
  let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of splitMigration(source)) await migrationClient.query(statement);
}
