import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "staging", "production"]);

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
  trustedProxyCidrs: z.array(z.string().trim().min(1).max(128)).max(32),
  requestBodyLimitBytes: z.number().int().min(16_384).max(10 * 1_024 * 1_024),
  tokenIssuer: z.string().min(1),
  userTokenAudience: z.string().min(1),
  adminTokenAudience: z.string().min(1),
  internalTokenAudience: z.string().min(1),
  publicAssetBaseUrl: z.url().optional(),
  publicAssetPathMode: z.enum(["bucket-and-key", "key-only"]),
  fileStorageProvider: z.enum(["disabled", "minio", "aliyun-oss", "injected"]),
  fileStorageEndpoint: z.url().optional(),
  fileStorageRegion: z.string().min(1).max(64),
  fileStorageAccessKeyId: z.string().min(1).optional(),
  fileStorageSecretAccessKey: z.string().min(8).optional(),
  filePublicBucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,62}$/u),
  filePrivateBucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,62}$/u),
  fileQuarantineBucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,62}$/u),
  fileUploadUrlTtlSeconds: z.number().int().min(60).max(3600),
  fileUploadSessionTtlSeconds: z.number().int().min(300).max(86_400),
  fileDownloadUrlTtlSeconds: z.number().int().min(30).max(3600),
  fileUploadHourlyLimit: z.number().int().min(1).max(1000),
  fileLifecycleMaxAttempts: z.number().int().min(1).max(20),
  fileLifecycleSweepBatchSize: z.number().int().min(1).max(1_000),
  fileLifecycleSweepIntervalSeconds: z.number().int().min(5).max(86_400),
  fileOrphanAuditPageSize: z.number().int().min(1).max(1_000),
  fileOrphanAuditMaxObjects: z.number().int().min(1).max(10_000),
  fileRejectedRetentionSeconds: z.number().int().min(0).max(31_536_000),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type ApiEnvironment = ApiConfig["environment"];

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const environment = env.DEPLOYMENT_ENV ?? env.NODE_ENV ?? "development";
  const input = {
    environment,
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
    paymentWebhookSecret: env.PAYMENT_WEBHOOK_SECRET ?? (isProtectedEnvironment(environment) ? undefined : "development-payment-webhook-secret-32-bytes"),
    payoutProviderMode: env.PAYOUT_PROVIDER_MODE ?? "mock",
    payoutWebhookSecret: env.PAYOUT_WEBHOOK_SECRET ?? (isProtectedEnvironment(environment) ? undefined : "development-payout-webhook-secret-32-bytes"),
    smsDevelopmentCode: env.SMS_DEVELOPMENT_CODE ?? "246810",
    smsCodeTtlSeconds: integer(env.SMS_CODE_TTL_SECONDS, 300),
    smsMaxAttempts: integer(env.SMS_MAX_ATTEMPTS, 5),
    smsMinimumIntervalSeconds: integer(env.SMS_MINIMUM_INTERVAL_SECONDS, 60),
    accessTokenTtlSeconds: integer(env.ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTokenTtlSeconds: integer(env.REFRESH_TOKEN_TTL_SECONDS, 2_592_000),
    corsOrigins: (env.API_CORS_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001").split(",").map((value) => value.trim()).filter(Boolean),
    trustedProxyCidrs: (env.API_TRUSTED_PROXY_CIDRS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    requestBodyLimitBytes: integer(env.API_BODY_LIMIT_BYTES, 1_048_576),
    tokenIssuer: env.TOKEN_ISSUER ?? "xiongzai-api",
    userTokenAudience: env.USER_TOKEN_AUDIENCE ?? "xiongzai-user",
    adminTokenAudience: env.ADMIN_TOKEN_AUDIENCE ?? "xiongzai-admin",
    internalTokenAudience: env.INTERNAL_TOKEN_AUDIENCE ?? "xiongzai-internal",
    publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL?.trim() || undefined,
    publicAssetPathMode: env.FILE_PUBLIC_ASSET_PATH_MODE ?? "bucket-and-key",
    fileStorageProvider: env.FILE_STORAGE_PROVIDER ?? "disabled",
    fileStorageEndpoint: env.FILE_STORAGE_ENDPOINT?.trim() || undefined,
    fileStorageRegion: env.FILE_STORAGE_REGION ?? "auto",
    fileStorageAccessKeyId: env.FILE_STORAGE_ACCESS_KEY_ID?.trim() || undefined,
    fileStorageSecretAccessKey: env.FILE_STORAGE_SECRET_ACCESS_KEY?.trim() || undefined,
    filePublicBucket: env.FILE_PUBLIC_BUCKET ?? "xiongzai-public-media",
    filePrivateBucket: env.FILE_PRIVATE_BUCKET ?? "xiongzai-private-media",
    fileQuarantineBucket: env.FILE_QUARANTINE_BUCKET ?? "xiongzai-quarantine-media",
    fileUploadUrlTtlSeconds: integer(env.FILE_UPLOAD_URL_TTL_SECONDS, 600),
    fileUploadSessionTtlSeconds: integer(env.FILE_UPLOAD_SESSION_TTL_SECONDS, 3600),
    fileDownloadUrlTtlSeconds: integer(env.FILE_DOWNLOAD_URL_TTL_SECONDS, 300),
    fileUploadHourlyLimit: integer(env.FILE_UPLOAD_HOURLY_LIMIT, 20),
    fileLifecycleMaxAttempts: integer(env.FILE_LIFECYCLE_MAX_ATTEMPTS, 8),
    fileLifecycleSweepBatchSize: integer(env.FILE_LIFECYCLE_SWEEP_BATCH_SIZE, 100),
    fileLifecycleSweepIntervalSeconds: integer(env.FILE_LIFECYCLE_SWEEP_INTERVAL_SECONDS, 60),
    fileOrphanAuditPageSize: integer(env.FILE_ORPHAN_AUDIT_PAGE_SIZE, 100),
    fileOrphanAuditMaxObjects: integer(env.FILE_ORPHAN_AUDIT_MAX_OBJECTS, 1_000),
    fileRejectedRetentionSeconds: integer(env.FILE_REJECTED_RETENTION_SECONDS, 0),
  };
  const result = apiConfigSchema.safeParse(input);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => environmentKey(String(issue.path[0] ?? "configuration"))))].join(", ");
    throw new Error(`Invalid API configuration: ${names}`);
  }
  const protectedEnvironment = isProtectedEnvironment(result.data.environment);
  const invalidProtectedKeys: string[] = [];
  if (protectedEnvironment && result.data.smsProviderMode !== "injected") invalidProtectedKeys.push("SMS_PROVIDER_MODE");
  if (protectedEnvironment && result.data.paymentProviderMode !== "injected") invalidProtectedKeys.push("PAYMENT_PROVIDER_MODE");
  if (protectedEnvironment && result.data.payoutProviderMode !== "injected") invalidProtectedKeys.push("PAYOUT_PROVIDER_MODE");
  if (protectedEnvironment && result.data.fileStorageProvider === "disabled") invalidProtectedKeys.push("FILE_STORAGE_PROVIDER");
  if (protectedEnvironment) {
    for (const [key, value] of protectedSecrets(result.data)) if (looksLikePlaceholder(value)) invalidProtectedKeys.push(key);
    for (const key of ["API_CORS_ORIGINS", "API_TRUSTED_PROXY_CIDRS", "FILE_STORAGE_PROVIDER", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET"] as const) if (!env[key]) invalidProtectedKeys.push(key);
    if (result.data.trustedProxyCidrs.length === 0 || result.data.trustedProxyCidrs.some(isUnsafeProxyRange)) invalidProtectedKeys.push("API_TRUSTED_PROXY_CIDRS");
    if (isLoopbackUrl(result.data.databaseUrl)) invalidProtectedKeys.push("DATABASE_URL");
    if (result.data.corsOrigins.some((origin) => !origin.startsWith("https://") || isLoopbackUrl(origin))) invalidProtectedKeys.push("API_CORS_ORIGINS");
  }
  if (result.data.fileStorageProvider === "minio" && (!result.data.fileStorageEndpoint || !result.data.fileStorageAccessKeyId || !result.data.fileStorageSecretAccessKey)) {
    throw new Error("Invalid API configuration: FILE_STORAGE_ENDPOINT, FILE_STORAGE_ACCESS_KEY_ID, FILE_STORAGE_SECRET_ACCESS_KEY");
  }
  if (result.data.fileStorageProvider === "aliyun-oss" && (!result.data.fileStorageEndpoint || result.data.fileStorageRegion === "auto" || !result.data.fileStorageAccessKeyId || !result.data.fileStorageSecretAccessKey)) {
    throw new Error("Invalid API configuration: FILE_STORAGE_ENDPOINT, FILE_STORAGE_REGION, FILE_STORAGE_ACCESS_KEY_ID, FILE_STORAGE_SECRET_ACCESS_KEY");
  }
  if (protectedEnvironment && result.data.fileStorageProvider !== "injected" && result.data.fileStorageEndpoint && (!result.data.fileStorageEndpoint.startsWith("https://") || isLoopbackUrl(result.data.fileStorageEndpoint))) {
    invalidProtectedKeys.push("FILE_STORAGE_ENDPOINT");
  }
  if (new Set([result.data.filePublicBucket, result.data.filePrivateBucket, result.data.fileQuarantineBucket]).size !== 3) {
    throw new Error("Invalid API configuration: FILE_PUBLIC_BUCKET, FILE_PRIVATE_BUCKET, FILE_QUARANTINE_BUCKET");
  }
  if (protectedEnvironment && result.data.publicAssetBaseUrl && (!result.data.publicAssetBaseUrl.startsWith("https://") || isLoopbackUrl(result.data.publicAssetBaseUrl))) {
    invalidProtectedKeys.push("PUBLIC_ASSET_BASE_URL");
  }
  if (invalidProtectedKeys.length > 0) throw new Error(`Invalid API configuration: ${[...new Set(invalidProtectedKeys)].join(", ")}`);
  return result.data;
}

export function isProtectedEnvironment(environment: string): environment is "staging" | "production" {
  return environment === "staging" || environment === "production";
}

function protectedSecrets(config: ApiConfig): Array<[string, string]> {
  return [
    ["USER_TOKEN_SECRET", config.userTokenSecret], ["ADMIN_TOKEN_SECRET", config.adminTokenSecret], ["INTERNAL_TOKEN_SECRET", config.internalTokenSecret],
    ["CURSOR_SIGNING_SECRET", config.cursorSigningSecret], ["PII_ENCRYPTION_KEY", config.piiEncryptionKey], ["PII_HMAC_KEY", config.piiHmacKey],
    ["AUTH_HMAC_KEY", config.authHmacKey], ["PAYMENT_WEBHOOK_SECRET", config.paymentWebhookSecret], ["PAYOUT_WEBHOOK_SECRET", config.payoutWebhookSecret],
  ];
}

function looksLikePlaceholder(value: string): boolean {
  return /(development|change[-_]?me|replace[-_]?me|example|sample|default|test[-_]?secret)/iu.test(value);
}

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(host);
  } catch { return true; }
}

function isUnsafeProxyRange(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "*" || normalized === "true" || normalized === "0.0.0.0/0" || normalized === "::/0";
}

function environmentKey(property: string): string {
  return ({
    environment: "DEPLOYMENT_ENV", host: "API_HOST", port: "API_PORT", databaseUrl: "DATABASE_URL", databaseMaxConnections: "DATABASE_MAX_CONNECTIONS",
    databaseConnectionTimeoutMs: "DATABASE_CONNECTION_TIMEOUT_MS", userTokenSecret: "USER_TOKEN_SECRET", adminTokenSecret: "ADMIN_TOKEN_SECRET",
    internalTokenSecret: "INTERNAL_TOKEN_SECRET", cursorSigningSecret: "CURSOR_SIGNING_SECRET", piiEncryptionKey: "PII_ENCRYPTION_KEY",
    piiHmacKey: "PII_HMAC_KEY", authHmacKey: "AUTH_HMAC_KEY", smsProviderMode: "SMS_PROVIDER_MODE", paymentProviderMode: "PAYMENT_PROVIDER_MODE",
    paymentWebhookSecret: "PAYMENT_WEBHOOK_SECRET", payoutProviderMode: "PAYOUT_PROVIDER_MODE", payoutWebhookSecret: "PAYOUT_WEBHOOK_SECRET",
    corsOrigins: "API_CORS_ORIGINS", trustedProxyCidrs: "API_TRUSTED_PROXY_CIDRS", requestBodyLimitBytes: "API_BODY_LIMIT_BYTES",
    fileStorageProvider: "FILE_STORAGE_PROVIDER", fileStorageEndpoint: "FILE_STORAGE_ENDPOINT", fileStorageRegion: "FILE_STORAGE_REGION",
    fileStorageAccessKeyId: "FILE_STORAGE_ACCESS_KEY_ID", fileStorageSecretAccessKey: "FILE_STORAGE_SECRET_ACCESS_KEY",
    filePublicBucket: "FILE_PUBLIC_BUCKET", filePrivateBucket: "FILE_PRIVATE_BUCKET", fileQuarantineBucket: "FILE_QUARANTINE_BUCKET",
  } as Record<string, string>)[property] ?? property;
}

function integer(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  return Number(raw);
}
