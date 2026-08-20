import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, errorCodes } from "@xiongzai/contracts";

export type PrincipalType = "user" | "admin" | "service";

export interface AccessTokenClaims {
  sub: string;
  principal_type: PrincipalType;
  token_use: "access" | "internal";
  session_id: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  permissions?: string[];
  mfa_verified?: boolean;
}
export interface TokenVerificationOptions {
  secret: string;
  issuer: string;
  audience: string;
  principalType: PrincipalType;
  tokenUse?: "access" | "internal";
  nowSeconds?: number;
}

export function issueAccessToken(
  claims: Omit<AccessTokenClaims, "iat" | "exp" | "iss" | "aud">,
  options: { secret: string; issuer: string; audience: string; expiresInSeconds: number; nowSeconds?: number },
): string {
  assertSecret(options.secret);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = encodePart({ alg: "HS256", typ: "JWT" });
  const payload = encodePart({ ...claims, iss: options.issuer, aud: options.audience, iat: now, exp: now + options.expiresInSeconds });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned, options.secret)}`;
}

export function verifyAccessToken(token: string, options: TokenVerificationOptions): AccessTokenClaims {
  assertSecret(options.secret);
  const [headerPart, payloadPart, signaturePart, extra] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart || extra) throw invalidToken();

  const unsigned = `${headerPart}.${payloadPart}`;
  const expected = Buffer.from(sign(unsigned, options.secret), "base64url");
  let actual: Buffer;
  try {
    actual = Buffer.from(signaturePart, "base64url");
  } catch {
    throw invalidToken();
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalidToken();

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    throw invalidToken();
  }
  if (!isRecord(header) || header.alg !== "HS256" || !isClaims(payload)) throw invalidToken();

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new AppError({ code: errorCodes.AUTH_TOKEN_EXPIRED, message: "登录已过期，请重新登录", statusCode: 401 });
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const expectedUse = options.tokenUse ?? (options.principalType === "service" ? "internal" : "access");
  if (
    payload.iss !== options.issuer ||
    !audiences.includes(options.audience) ||
    payload.principal_type !== options.principalType ||
    payload.token_use !== expectedUse
  ) {
    throw invalidToken();
  }
  return payload;
}

export function extractBearerToken(authorization: string | string[] | undefined): string {
  if (typeof authorization !== "string") throw authRequired();
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) throw authRequired();
  return match[1];
}

export function hasPermissions(granted: readonly string[] | undefined, required: readonly string[]): boolean {
  if (required.length === 0) return true;
  const permissionSet = new Set(granted ?? []);
  return required.every((permission) => permissionSet.has(permission));
}

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(unsigned: string, secret: string): string {
  return createHmac("sha256", secret).update(unsigned).digest("base64url");
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret) < 32) throw new Error("Token secret must be at least 32 bytes.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClaims(value: unknown): value is AccessTokenClaims {
  if (!isRecord(value)) return false;
  const audienceValid = typeof value.aud === "string" || (Array.isArray(value.aud) && value.aud.every((item) => typeof item === "string"));
  return (
    typeof value.sub === "string" &&
    ["user", "admin", "service"].includes(String(value.principal_type)) &&
    ["access", "internal"].includes(String(value.token_use)) &&
    typeof value.session_id === "string" &&
    typeof value.iss === "string" &&
    audienceValid &&
    Number.isInteger(value.iat) &&
    Number.isInteger(value.exp) &&
    (value.permissions === undefined || (Array.isArray(value.permissions) && value.permissions.every((item) => typeof item === "string"))) &&
    (value.mfa_verified === undefined || typeof value.mfa_verified === "boolean")
  );
}

function invalidToken(): AppError {
  return new AppError({ code: errorCodes.AUTH_TOKEN_INVALID, message: "登录凭证无效", statusCode: 401 });
}

function authRequired(): AppError {
  return new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 });
}
