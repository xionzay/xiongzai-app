import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "production"]);

const apiConfigSchema = z.object({
  environment: environmentSchema,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  databaseUrl: z.url(),
  databaseMaxConnections: z.number().int().positive(),
  databaseConnectionTimeoutMs: z.number().int().positive(),
  userTokenSecret: z.string().min(32),
  adminTokenSecret: z.string().min(32),
  internalTokenSecret: z.string().min(32),
  cursorSigningSecret: z.string().min(32),
  piiEncryptionKey: z.string().min(32),
  piiHmacKey: z.string().min(32),
  authHmacKey: z.string().min(32),
  smsProviderMode: z.enum(["development", "injected"]),
  paymentProviderMode: z.enum(["mock", "injected"]),
  paymentWebhookSecret: z.string().min(32),
  payoutProviderMode: z.enum(["mock", "injected"]),
  payoutWebhookSecret: z.string().min(32),
  smsDevelopmentCode: z.string().regex(/^\d{6}$/),
  smsCodeTtlSeconds: z.number().int().min(60).max(900),
  smsMaxAttempts: z.number().int().min(1).max(10),
  smsMinimumIntervalSeconds: z.number().int().min(1).max(300),
  accessTokenTtlSeconds: z.number().int().min(60).max(3600),
  refreshTokenTtlSeconds: z.number().int().min(3600).max(31_536_000),
  corsOrigins: z.array(z.url()).min(1),
  tokenIssuer: z.string().min(1),
  userTokenAudience: z.string().min(1),
  adminTokenAudience: z.string().min(1),
  internalTokenAudience: z.string().min(1),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const input = {
    environment: env.NODE_ENV ?? "development",
    host: env.API_HOST ?? "0.0.0.0",
    port: integer(env.API_PORT, 3002),
    databaseUrl: env.DATABASE_URL,
    databaseMaxConnections: integer(env.DATABASE_MAX_CONNECTIONS, 10),
    databaseConnectionTimeoutMs: integer(env.DATABASE_CONNECTION_TIMEOUT_MS, 5_000),
    userTokenSecret: env.USER_TOKEN_SECRET,
    adminTokenSecret: env.ADMIN_TOKEN_SECRET,
    internalTokenSecret: env.INTERNAL_TOKEN_SECRET,
    cursorSigningSecret: env.CURSOR_SIGNING_SECRET,
    piiEncryptionKey: env.PII_ENCRYPTION_KEY,
    piiHmacKey: env.PII_HMAC_KEY,
    authHmacKey: env.AUTH_HMAC_KEY,
    smsProviderMode: env.SMS_PROVIDER_MODE ?? "development",
    paymentProviderMode: env.PAYMENT_PROVIDER_MODE ?? "mock",
    paymentWebhookSecret: env.PAYMENT_WEBHOOK_SECRET ?? (env.NODE_ENV === "production" ? undefined : "development-payment-webhook-secret-32-bytes"),
    payoutProviderMode: env.PAYOUT_PROVIDER_MODE ?? "mock",
    payoutWebhookSecret: env.PAYOUT_WEBHOOK_SECRET ?? (env.NODE_ENV === "production" ? undefined : "development-payout-webhook-secret-32-bytes"),
    smsDevelopmentCode: env.SMS_DEVELOPMENT_CODE ?? "246810",
    smsCodeTtlSeconds: integer(env.SMS_CODE_TTL_SECONDS, 300),
    smsMaxAttempts: integer(env.SMS_MAX_ATTEMPTS, 5),
    smsMinimumIntervalSeconds: integer(env.SMS_MINIMUM_INTERVAL_SECONDS, 60),
    accessTokenTtlSeconds: integer(env.ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTokenTtlSeconds: integer(env.REFRESH_TOKEN_TTL_SECONDS, 2_592_000),
    corsOrigins: (env.API_CORS_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001").split(",").map((value) => value.trim()).filter(Boolean),
    tokenIssuer: env.TOKEN_ISSUER ?? "xiongzai-api",
    userTokenAudience: env.USER_TOKEN_AUDIENCE ?? "xiongzai-user",
    adminTokenAudience: env.ADMIN_TOKEN_AUDIENCE ?? "xiongzai-admin",
    internalTokenAudience: env.INTERNAL_TOKEN_AUDIENCE ?? "xiongzai-internal",
  };
  const result = apiConfigSchema.safeParse(input);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid API configuration: ${names}`);
  }
  if (result.data.environment === "production" && result.data.smsProviderMode === "development") {
    throw new Error("Invalid API configuration: smsProviderMode");
  }
  if (result.data.environment === "production" && result.data.paymentProviderMode === "mock") {
    throw new Error("Invalid API configuration: paymentProviderMode");
  }
  if (result.data.environment === "production" && result.data.payoutProviderMode === "mock") {
    throw new Error("Invalid API configuration: payoutProviderMode");
  }
  return result.data;
}

function integer(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  return Number(raw);
}
