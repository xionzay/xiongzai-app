import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@xiongzai/contracts";
import { extractBearerToken, hasPermissions, issueAccessToken, verifyAccessToken } from "../dist/index.js";

const secret = "test-secret-at-least-thirty-two-bytes-long";

test("issues and verifies scoped user access tokens", () => {
  const token = issueAccessToken(
    { sub: "user-1", principal_type: "user", token_use: "access", session_id: "session-1" },
    { secret, issuer: "xiongzai", audience: "buyer", expiresInSeconds: 300, nowSeconds: 1000 },
  );
  const claims = verifyAccessToken(token, { secret, issuer: "xiongzai", audience: "buyer", principalType: "user", nowSeconds: 1001 });
  assert.equal(claims.sub, "user-1");
  assert.equal(extractBearerToken(`Bearer ${token}`), token);
});

test("rejects expired, tampered and wrong-principal tokens", () => {
  const token = issueAccessToken(
    { sub: "admin-1", principal_type: "admin", token_use: "access", session_id: "session-1", mfa_verified: true },
    { secret, issuer: "xiongzai", audience: "admin", expiresInSeconds: 10, nowSeconds: 1000 },
  );
  assert.throws(() => verifyAccessToken(token, { secret, issuer: "xiongzai", audience: "admin", principalType: "admin", nowSeconds: 1010 }), AppError);
  assert.throws(() => verifyAccessToken(`${token}x`, { secret, issuer: "xiongzai", audience: "admin", principalType: "admin", nowSeconds: 1001 }), AppError);
  assert.throws(() => verifyAccessToken(token, { secret, issuer: "xiongzai", audience: "buyer", principalType: "user", nowSeconds: 1001 }), AppError);
});

test("requires every RBAC permission", () => {
  assert.equal(hasPermissions(["orders.read", "orders.refund"], ["orders.read"]), true);
  assert.equal(hasPermissions(["orders.read"], ["orders.read", "orders.refund"]), false);
});
