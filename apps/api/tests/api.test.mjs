import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import { issueAccessToken } from "@xiongzai/auth";
import { JsonLogger } from "@xiongzai/observability";
import { AuthenticationGuard, createApiApp, loadApiConfig } from "../dist/index.js";

const testConfig = loadApiConfig({
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
});

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
  assert.equal(ready.json().database, "ok");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(lines.some((line) => JSON.parse(line).message === "http_request_completed"));
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
