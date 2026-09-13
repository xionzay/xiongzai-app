import { access, readFile, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const configOnly = process.argv.includes("--config-only");
const failures = [];
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, status: ok ? "ok" : "failed", detail });
  if (!ok) failures.push(name);
}

function has(name, source = process.env) {
  const ok = typeof source[name] === "string" && source[name].length > 0;
  record(`环境变量 ${name}`, ok, ok ? "已配置" : "缺失");
  return ok;
}

function localDatabaseUrl(name, expectedDatabase) {
  const raw = process.env[name];
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const localHost = ["127.0.0.1", "localhost", "::1"].includes(url.hostname.replace(/^\[|\]$/gu, ""));
    const exactDatabase = url.pathname === `/${expectedDatabase}`;
    const ok = url.protocol === "postgresql:" && localHost && exactDatabase;
    record(`${name} 本地隔离`, ok, ok ? `仅连接 ${expectedDatabase}` : "必须使用指定的本地数据库");
    return ok;
  } catch {
    record(`${name} 本地隔离`, false, "URL 格式无效");
    return false;
  }
}

async function readEnvFile(relativePath) {
  try {
    return parseEnv(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
  } catch {
    record(`${relativePath} 文件`, false, "无法读取");
    return {};
  }
}

async function privateFile(relativePath) {
  try {
    const info = await stat(path.join(repositoryRoot, relativePath));
    const ok = (info.mode & 0o077) === 0;
    record(`${relativePath} 权限`, ok, ok ? "仅当前用户可读写" : "权限过宽，应设为 0600");
  } catch {
    record(`${relativePath} 权限`, false, "文件不存在");
  }
}

async function fileExists(relativePath) {
  try {
    await access(path.join(repositoryRoot, relativePath));
    record(relativePath, true, "存在");
  } catch {
    record(relativePath, false, "缺失");
  }
}

function tcp(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function http(name, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    const ok = response.ok;
    record(name, ok, ok ? `HTTP ${response.status}` : `HTTP ${response.status}`);
  } catch {
    record(name, false, "无法连接");
  }
}

for (const key of [
  "NODE_ENV", "DEPLOYMENT_ENV", "DATABASE_URL", "TEST_DATABASE_URL", "API_HOST", "API_PORT",
  "USER_TOKEN_SECRET", "ADMIN_TOKEN_SECRET", "INTERNAL_TOKEN_SECRET", "CURSOR_SIGNING_SECRET",
  "PII_ENCRYPTION_KEY", "PII_HMAC_KEY", "AUTH_HMAC_KEY", "SMS_PROVIDER_MODE",
  "SMS_DEVELOPMENT_CODE", "PAYMENT_PROVIDER_MODE", "PAYMENT_WEBHOOK_SECRET",
  "PAYOUT_PROVIDER_MODE", "PAYOUT_WEBHOOK_SECRET", "EVENT_PUBLISHER_MODE",
  "WORKER_ID", "WORKER_BATCH_SIZE", "WORKER_POLL_INTERVAL_MS", "OUTBOX_MAX_ATTEMPTS",
  "SCHEDULER_ID", "SCHEDULER_BATCH_SIZE", "SCHEDULER_POLL_INTERVAL_MS",
  "FILE_STORAGE_PROVIDER", "FILE_STORAGE_ENDPOINT", "FILE_STORAGE_ACCESS_KEY_ID",
  "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET",
]) has(key);

const environment = process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV;
record("运行环境允许 Mock", ["development", "test"].includes(environment), "仅 development/test 可通过");
record("短信开发模式", process.env.SMS_PROVIDER_MODE === "development", "应为 development");
record("微信/支付宝支付 Mock", process.env.PAYMENT_PROVIDER_MODE === "mock", "两个渠道共用隔离 Mock 路由");
record("提现 Mock", process.env.PAYOUT_PROVIDER_MODE === "mock", "应为 mock");
record("Worker 本地发布器", process.env.EVENT_PUBLISHER_MODE === "log", "应为 log");
record("MinIO 存储模式", process.env.FILE_STORAGE_PROVIDER === "minio", "应为 minio");
localDatabaseUrl("DATABASE_URL", "xiongzai_api_dev");
localDatabaseUrl("TEST_DATABASE_URL", "xiongzai_database_test");
record("开发库与测试库隔离", process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL, "连接串不得相同");

try {
  const endpoint = new URL(process.env.FILE_STORAGE_ENDPOINT ?? "");
  const storageHost = endpoint.hostname.replace(/^\[|\]$/gu, "");
  const localStorageHost = ["127.0.0.1", "localhost", "::1"].includes(storageHost) || /^10\./u.test(storageHost) || /^192\.168\./u.test(storageHost) || /^172\.(1[6-9]|2\d|3[01])\./u.test(storageHost);
  record("MinIO 本地端点", localStorageHost, "必须是回环或私有局域网地址");
} catch {
  record("MinIO 本地端点", false, "URL 格式无效");
}

await privateFile(".env.backend.local");
await privateFile(".env.manual-test.local");
await privateFile(".env.minio.local");
await fileExists(".local/postgres16/bin/postgres");
await fileExists(".local/postgres16/bin/pg_ctl");
await fileExists(".local/postgres16/bin/initdb");
await fileExists(".local/minio/bin/minio");
await fileExists(".local/minio/bin/mc");

const minio = await readEnvFile(".env.minio.local");
for (const key of ["MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "MINIO_ADDRESS", "MINIO_CONSOLE_ADDRESS", "MINIO_VOLUMES", "MINIO_LICENSE_PATH"]) has(key, minio);
record("MinIO 凭证一致", Boolean(minio.MINIO_ROOT_USER) && minio.MINIO_ROOT_USER === process.env.FILE_STORAGE_ACCESS_KEY_ID && minio.MINIO_ROOT_PASSWORD === process.env.FILE_STORAGE_SECRET_ACCESS_KEY, "只比较，不输出值");
const minioBindHost = (minio.MINIO_ADDRESS ?? "").split(":")[0];
const storageEndpointHost = (() => { try { return new URL(process.env.FILE_STORAGE_ENDPOINT ?? "").hostname; } catch { return ""; } })();
record("MinIO 真机绑定一致", storageEndpointHost === "127.0.0.1" ? minioBindHost === "127.0.0.1" : minioBindHost === "0.0.0.0", "局域网端点要求MinIO监听本地网卡");

const mobile = await readEnvFile("apps/mobile/.env.local");
for (const key of ["EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_APP_ENV", "EXPO_PUBLIC_ENABLE_MOCK_PAYMENT"]) has(key, mobile);
record("移动端 Mock 开关", mobile.EXPO_PUBLIC_ENABLE_MOCK_PAYMENT === "true" && ["development", "test"].includes(mobile.EXPO_PUBLIC_APP_ENV), "production 会拒绝");
try {
  const mobileUrl = new URL(mobile.EXPO_PUBLIC_API_BASE_URL ?? "");
  const host = mobileUrl.hostname.replace(/^\[|\]$/gu, "");
  const localOrLan = ["127.0.0.1", "localhost", "::1", "10.0.2.2"].includes(host) || /^10\./u.test(host) || /^192\.168\./u.test(host) || /^172\.(1[6-9]|2\d|3[01])\./u.test(host);
  record("移动端 API 地址隔离", localOrLan && mobileUrl.port === "3002", "仅允许本机、模拟器桥接或私有局域网地址");
  const privateLan = /^10\./u.test(host) || /^192\.168\./u.test(host) || /^172\.(1[6-9]|2\d|3[01])\./u.test(host);
  record("真机 API 与文件地址一致", !privateLan || (process.env.API_HOST === "0.0.0.0" && storageEndpointHost === host && minioBindHost === "0.0.0.0"), "私有局域网真机要求API监听本地网卡且MinIO签名主机一致");
} catch {
  record("移动端 API 地址隔离", false, "URL 格式无效");
  record("真机 API 与文件地址一致", false, "移动端地址无法解析");
}

if (!configOnly) {
  record("PostgreSQL TCP", await tcp("127.0.0.1", 5432), "127.0.0.1:5432");
  await http("MinIO 存活", "http://127.0.0.1:9000/minio/health/live");
  await http("MinIO 就绪", "http://127.0.0.1:9000/minio/health/ready");
  await http("API 存活", "http://127.0.0.1:3002/health/live");
  await http("API 就绪", "http://127.0.0.1:3002/health/ready");
  await http("管理员后台", "http://localhost:3001/");
}

console.log(JSON.stringify({
  mode: configOnly ? "config-only" : "runtime",
  ok: failures.length === 0,
  checks,
  failure_count: failures.length,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/u).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
