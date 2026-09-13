import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import { issueAccessToken } from "@xiongzai/auth";
import { JsonLogger } from "@xiongzai/observability";
import { AuthenticationGuard, createApiApp, isProtectedEnvironment, loadApiConfig } from "../dist/index.js";

const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "user-secret-that-is-at-least-32-bytes-long",
  ADMIN_TOKEN_SECRET: "admin-secret-that-is-at-least-32-bytes-long",
  INTERNAL_TOKEN_SECRET: "internal-secret-that-is-at-least-32-bytes-long",
  CURSOR_SIGNING_SECRET: "cursor-secret-that-is-at-least-32-bytes-long",
  PII_ENCRYPTION_KEY: "pii-encryption-secret-that-is-at-least-32-bytes",
  PII_HMAC_KEY: "pii-hmac-secret-that-is-at-least-32-bytes-long",
  AUTH_HMAC_KEY: "auth-hmac-secret-that-is-at-least-32-bytes",
  SMS_PROVIDER_MODE: "development",
  SMS_DEVELOPMENT_CODE: "246810",
};
const testConfig = loadApiConfig(testEnv);
const stagingEnv = {
  DEPLOYMENT_ENV: "staging",
  DATABASE_URL: "postgresql://service:credential@db.staging.internal:5432/xiongzai",
  USER_TOKEN_SECRET: "SafeUserKey-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ADMIN_TOKEN_SECRET: "SafeAdminKey-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  INTERNAL_TOKEN_SECRET: "SafeInternalKey-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  CURSOR_SIGNING_SECRET: "SafeCursorKey-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  PII_ENCRYPTION_KEY: "SafePiiEncryptionKey-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  PII_HMAC_KEY: "SafePiiHmacKey-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  AUTH_HMAC_KEY: "SafeAuthHmacKey-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  SMS_PROVIDER_MODE: "injected", PAYMENT_PROVIDER_MODE: "injected", PAYOUT_PROVIDER_MODE: "injected",
  PAYMENT_WEBHOOK_SECRET: "SafePaymentWebhook-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  PAYOUT_WEBHOOK_SECRET: "SafePayoutWebhook-2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  API_CORS_ORIGINS: "https://admin.staging.internal", API_TRUSTED_PROXY_CIDRS: "10.20.0.0/16",
  FILE_STORAGE_PROVIDER: "aliyun-oss", FILE_STORAGE_ENDPOINT: "https://oss.staging.internal", FILE_STORAGE_REGION: "staging-region-1",
  FILE_STORAGE_ACCESS_KEY_ID: "staging-storage-access", FILE_STORAGE_SECRET_ACCESS_KEY: "SafeStorageCredential-2026",
  FILE_PUBLIC_BUCKET: "xiongzai-staging-public", FILE_PRIVATE_BUCKET: "xiongzai-staging-private", FILE_QUARANTINE_BUCKET: "xiongzai-staging-quarantine",
};

function fakeDatabase(query) {
  return { db: {}, pool: { query }, close: async () => {} };
}

test("live and ready checks expose request identifiers and UTC JSON", async (t) => {
  const lines = [];
  const app = await createApiApp({ config: testConfig, databaseClient: fakeDatabase(async () => ({ rows: [{ "?column?": 1 }] })), logger: new JsonLogger("api-test", (line) => lines.push(line)) });
  t.after(() => app.close());

  const live = await app.inject({ method: "GET", url: "/health/live", headers: { "x-request-id": "request-test-123" } });
  assert.equal(live.statusCode, 200);
  assert.equal(live.headers["x-request-id"], "request-test-123");
  assert.match(live.json().time, /Z$/);

  const ready = await app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(ready.statusCode, 200);
  assert.deepEqual(ready.json().checks, { database: "ok", object_storage: "not_configured", rejected_file_retention: "disabled" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(lines.some((line) => JSON.parse(line).message === "http_request_completed"));
});

test("browser preflight permits every mutable API method used by the user app", async (t) => {
  const app = await createApiApp({ config: testConfig, databaseClient: fakeDatabase(async () => ({ rows: [] })), logger: new JsonLogger("api-cors-test", () => {}) });
  t.after(() => app.close());

  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/favorites/SELLER/00000000-0000-4000-8000-000000000000",
      headers: {
        origin: testConfig.corsOrigins[0],
        "access-control-request-method": method,
      },
    });
    assert.equal(response.statusCode, 204);
    assert.match(response.headers["access-control-allow-methods"], new RegExp(`(?:^|,\\s*)${method}(?:,|$)`));
  }
});

test("readiness performs a minimal read-only object-storage check when configured", async (t) => {
  const calls = [];
  const storage = { listObjects: async (input) => { calls.push(input); return { objects: [], truncated: false }; } };
  const app = await createApiApp({ config: { ...testConfig, fileStorageProvider: "injected" }, databaseClient: fakeDatabase(async () => ({ rows: [] })), objectStorageProvider: storage, logger: new JsonLogger("api-test", () => {}) });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().checks, { database: "ok", object_storage: "ok", rejected_file_retention: "disabled" });
  assert.deepEqual(calls, [{ bucket: testConfig.fileQuarantineBucket, prefix: "health/readiness/", limit: 1 }]);
});

test("MinIO readiness requires an effective published voice playback policy", async (t) => {
  const queries = [];
  const storage = { listObjects: async () => ({ objects: [], truncated: false }) };
  const databaseClient = fakeDatabase(async (sql, parameters) => {
    queries.push({ sql, parameters });
    return { rows: sql === "select 1" ? [{ "?column?": 1 }] : [] };
  });
  const app = await createApiApp({ config: { ...testConfig, fileStorageProvider: "minio", fileRejectedRetentionSeconds: 86_400 }, databaseClient, objectStorageProvider: storage, logger: new JsonLogger("api-test", () => {}) });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "POLICY_CONFIGURATION_INCOMPLETE");
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[1].parameters, ["VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION"]);
});

test("MinIO readiness reports storage and voice policy after both checks pass", async (t) => {
  const calls = [];
  const storage = { listObjects: async (input) => { calls.push(input); return { objects: [], truncated: false }; } };
  const databaseClient = fakeDatabase(async (sql) => ({ rows: sql === "select 1" ? [{ "?column?": 1 }] : [{ "?column?": 1 }] }));
  const app = await createApiApp({ config: { ...testConfig, fileStorageProvider: "minio", fileRejectedRetentionSeconds: 86_400 }, databaseClient, objectStorageProvider: storage, logger: new JsonLogger("api-test", () => {}) });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().checks, { database: "ok", object_storage: "ok", rejected_file_retention: "configured", voice_playback_policy: "ok" });
  assert.deepEqual(calls, [{ bucket: testConfig.fileQuarantineBucket, prefix: "health/readiness/", limit: 1 }]);
});

test("readiness failure uses the unified error contract", async (t) => {
  const app = await createApiApp({ config: testConfig, databaseClient: fakeDatabase(async () => { throw new Error("offline"); }), logger: new JsonLogger("api-test", () => {}) });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "DATABASE_UNAVAILABLE");
  assert.equal(response.json().request_id, response.headers["x-request-id"]);
  assert.deepEqual(response.json().field_errors, []);
});

test("invalid configuration fails without exposing connection values", () => {
  assert.throws(() => loadApiConfig({ DATABASE_URL: "not-a-url" }), /Invalid API configuration/);
});

test("staging and production reject mock providers, missing secrets, placeholders and loopback deployment endpoints", () => {
  const valid = loadApiConfig(stagingEnv);
  assert.equal(valid.environment, "staging");
  assert.equal(isProtectedEnvironment(valid.environment), true);
  for (const [key, value] of [["SMS_PROVIDER_MODE", "development"], ["PAYMENT_PROVIDER_MODE", "mock"], ["PAYOUT_PROVIDER_MODE", "mock"]]) {
    assert.throws(() => loadApiConfig({ ...stagingEnv, [key]: value }), (error) => error.message.includes(key) && !error.message.includes(stagingEnv.DATABASE_URL));
  }
  assert.throws(() => loadApiConfig({ ...stagingEnv, ADMIN_TOKEN_SECRET: undefined }), /ADMIN_TOKEN_SECRET/u);
  assert.throws(() => loadApiConfig({ ...stagingEnv, ADMIN_TOKEN_SECRET: "change-me-change-me-change-me-change-me" }), /ADMIN_TOKEN_SECRET/u);
  assert.throws(() => loadApiConfig({ ...stagingEnv, DATABASE_URL: "postgresql://service:credential@127.0.0.1:5432/xiongzai" }), /DATABASE_URL/u);
  assert.throws(() => loadApiConfig({ ...stagingEnv, API_TRUSTED_PROXY_CIDRS: "0.0.0.0/0" }), /API_TRUSTED_PROXY_CIDRS/u);
  assert.throws(() => loadApiConfig({ ...stagingEnv, API_CORS_ORIGINS: "http://admin.staging.internal" }), /API_CORS_ORIGINS/u);
});

test("admin responses are no-store, request bodies are bounded, and shutdown closes the database", async () => {
  let closeCount = 0;
  const database = { db: {}, pool: { query: async () => ({ rows: [] }) }, close: async () => { closeCount += 1; } };
  const app = await createApiApp({ config: { ...testConfig, requestBodyLimitBytes: 16_384 }, databaseClient: database, logger: new JsonLogger("api-test", () => {}) });
  const admin = await app.inject({ method: "GET", url: "/admin-api/v1/auth/session" });
  assert.equal(admin.statusCode, 401);
  assert.match(admin.headers["cache-control"], /no-store/u);
  const oversized = await app.inject({ method: "POST", url: "/api/v1/auth/sms/send", payload: { phone: `1${"2".repeat(20_000)}` } });
  assert.equal(oversized.statusCode, 413);
  await app.close();
  assert.equal(closeCount, 1);
});

test("file storage configuration separates disabled, MinIO and Aliyun OSS providers", () => {
  assert.equal(loadApiConfig({ ...testEnv, FILE_STORAGE_PROVIDER: "disabled" }).fileStorageProvider, "disabled");
  const minio = loadApiConfig({
    ...testEnv,
    FILE_STORAGE_PROVIDER: "minio",
    FILE_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    FILE_STORAGE_REGION: "us-east-1",
    FILE_STORAGE_ACCESS_KEY_ID: "local-access",
    FILE_STORAGE_SECRET_ACCESS_KEY: "local-secret-value",
  });
  assert.equal(minio.fileStorageProvider, "minio");
  assert.throws(() => loadApiConfig({ ...testEnv, FILE_STORAGE_PROVIDER: "minio" }), /Invalid API configuration/);
  assert.throws(() => loadApiConfig({
    ...testEnv,
    FILE_STORAGE_PROVIDER: "aliyun-oss",
    FILE_STORAGE_ENDPOINT: "https://oss-cn-hangzhou.aliyuncs.com",
    FILE_STORAGE_REGION: "auto",
    FILE_STORAGE_ACCESS_KEY_ID: "future-access",
    FILE_STORAGE_SECRET_ACCESS_KEY: "future-secret-value",
  }), /Invalid API configuration/);
});

test("admin authentication checks the active session, database RBAC and MFA", async () => {
  const token = issueAccessToken({
    sub: "admin-1", principal_type: "admin", token_use: "access", session_id: "session-1",
    permissions: ["untrusted.token.permission"], mfa_verified: true,
  }, { secret: testConfig.adminTokenSecret, issuer: testConfig.tokenIssuer, audience: testConfig.adminTokenAudience, expiresInSeconds: 300 });
  const request = { url: "/admin-api/v1/orders", headers: { authorization: `Bearer ${token}` } };
  const handler = () => {};
  Reflect.defineMetadata("xiongzai:permissions", ["order.read"], handler);
  Reflect.defineMetadata("xiongzai:mfa-required", true, handler);
  const context = executionContext(handler, request);
  const guard = new AuthenticationGuard(new Reflector(), testConfig, {
    authorize: async () => ({ permissions: ["order.read"], accountMfaRequired: true }),
  });
  assert.equal(await guard.canActivate(context), true);
  assert.equal(request.principal.sub, "admin-1");
});

test("admin authentication rejects permissions not granted by database RBAC", async () => {
  const token = issueAccessToken({
    sub: "admin-1", principal_type: "admin", token_use: "access", session_id: "session-1", mfa_verified: true,
  }, { secret: testConfig.adminTokenSecret, issuer: testConfig.tokenIssuer, audience: testConfig.adminTokenAudience, expiresInSeconds: 300 });
  const handler = () => {};
  Reflect.defineMetadata("xiongzai:permissions", ["finance.withdrawal.approve"], handler);
  const guard = new AuthenticationGuard(new Reflector(), testConfig, {
    authorize: async () => ({ permissions: ["order.read"], accountMfaRequired: true }),
  });
  await assert.rejects(guard.canActivate(executionContext(handler, { url: "/admin-api/v1/withdrawals", headers: { authorization: `Bearer ${token}` } })), /没有执行此操作的权限/);
});

test("cookie-authenticated unsafe requests reject cross-site origins", async () => {
  const token = issueAccessToken({
    sub: "user-1", principal_type: "user", token_use: "access", session_id: "session-1",
  }, { secret: testConfig.userTokenSecret, issuer: testConfig.tokenIssuer, audience: testConfig.userTokenAudience, expiresInSeconds: 300 });
  const guard = new AuthenticationGuard(new Reflector(), testConfig, {
    authorize: async () => ({ permissions: [], accountMfaRequired: false }),
  });
  const untrusted = executionContext(() => {}, {
    method: "POST", url: "/api/v1/orders", headers: { cookie: `xiongzai_access=${token}`, origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  });
  await assert.rejects(guard.canActivate(untrusted), (error) => error.code === "AUTH_CSRF_REJECTED" && error.statusCode === 403);

  const trustedRequest = { method: "POST", url: "/api/v1/orders", headers: { cookie: `xiongzai_access=${token}`, origin: "http://localhost:3001", "sec-fetch-site": "same-origin" } };
  assert.equal(await guard.canActivate(executionContext(() => {}, trustedRequest)), true);
  assert.equal(trustedRequest.principal.sub, "user-1");

  const bearerRequest = { method: "POST", url: "/api/v1/orders", headers: { authorization: `Bearer ${token}`, origin: "https://api-client.example" } };
  assert.equal(await guard.canActivate(executionContext(() => {}, bearerRequest)), true);
});

function executionContext(handler, request) {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
}
