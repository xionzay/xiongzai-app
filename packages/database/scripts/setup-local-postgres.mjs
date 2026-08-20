import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const envPath = resolve(workspaceRoot, ".env.backend.local");
const hbaPath = resolve(workspaceRoot, ".local/postgres-data/pg_hba.conf");
const socketPath = resolve(workspaceRoot, ".local/postgres-socket");
const applicationRole = "xiongzai_app";
const bootstrapRole = "xiongzai_bootstrap";
const databases = ["xiongzai_api_dev", "xiongzai_database_test"];

await mkdir(resolve(workspaceRoot, ".local"), { recursive: true });

let localConfig;
let configChanged = false;
try {
  localConfig = parseEnv(await readFile(envPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  const databasePassword = secret(32);
  localConfig = {
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl(databases[0], databasePassword),
    TEST_DATABASE_URL: databaseUrl(databases[1], databasePassword),
    API_HOST: "127.0.0.1",
    API_PORT: "3002",
    USER_TOKEN_SECRET: secret(48),
    ADMIN_TOKEN_SECRET: secret(48),
    INTERNAL_TOKEN_SECRET: secret(48),
    CURSOR_SIGNING_SECRET: secret(48),
    PII_ENCRYPTION_KEY: secret(48),
    PII_HMAC_KEY: secret(48),
    AUTH_HMAC_KEY: secret(48),
    SMS_PROVIDER_MODE: "development",
    SMS_DEVELOPMENT_CODE: "246810",
    SMS_CODE_TTL_SECONDS: "300",
    SMS_MAX_ATTEMPTS: "5",
    SMS_MINIMUM_INTERVAL_SECONDS: "60",
    ACCESS_TOKEN_TTL_SECONDS: "900",
    REFRESH_TOKEN_TTL_SECONDS: "2592000",
    API_CORS_ORIGINS: "http://localhost:3001,http://127.0.0.1:3001",
    EVENT_PUBLISHER_MODE: "log",
  };
  await writeFile(envPath, renderEnv(localConfig), { encoding: "utf8", mode: 0o600, flag: "wx" });
}

const localDefaults = {
  PII_ENCRYPTION_KEY: () => secret(48),
  PII_HMAC_KEY: () => secret(48),
  AUTH_HMAC_KEY: () => secret(48),
  SMS_PROVIDER_MODE: () => "development",
  SMS_DEVELOPMENT_CODE: () => "246810",
  SMS_CODE_TTL_SECONDS: () => "300",
  SMS_MAX_ATTEMPTS: () => "5",
  SMS_MINIMUM_INTERVAL_SECONDS: () => "60",
  ACCESS_TOKEN_TTL_SECONDS: () => "900",
  REFRESH_TOKEN_TTL_SECONDS: () => "2592000",
  API_CORS_ORIGINS: () => "http://localhost:3001,http://127.0.0.1:3001",
};
for (const [key, createValue] of Object.entries(localDefaults)) {
  if (!localConfig[key]) {
    localConfig[key] = createValue();
    configChanged = true;
  }
}
if (configChanged) await writeFile(envPath, renderEnv(localConfig), { encoding: "utf8", mode: 0o600 });

const applicationUrl = new URL(localConfig.DATABASE_URL);
if (applicationUrl.username !== applicationRole || applicationUrl.hostname !== "127.0.0.1") {
  throw new Error("Existing local configuration is not scoped to the expected local application role.");
}
const databasePassword = decodeURIComponent(applicationUrl.password);
if (databasePassword.length < 32) throw new Error("Local database password must be at least 32 characters.");

const bootstrap = new pg.Client({ host: socketPath, database: "postgres", user: bootstrapRole });
await bootstrap.connect();
try {
  const role = await bootstrap.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [applicationRole]);
  if (role.rowCount === 0) {
    await bootstrap.query(`CREATE ROLE ${applicationRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD ${literal(databasePassword)}`);
  } else {
    await bootstrap.query(`ALTER ROLE ${applicationRole} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD ${literal(databasePassword)}`);
  }

  for (const database of databases) {
    const exists = await bootstrap.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (exists.rowCount === 0) await bootstrap.query(`CREATE DATABASE ${database} OWNER ${applicationRole}`);
    await bootstrap.query(`REVOKE CONNECT, TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
    await bootstrap.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${database} TO ${applicationRole}`);
  }

  await writeFile(hbaPath, [
    "# Managed by packages/database/scripts/setup-local-postgres.mjs",
    `local all ${bootstrapRole} trust`,
    "local all all reject",
    `host ${databases.join(",")} ${applicationRole} 127.0.0.1/32 scram-sha-256`,
    "host all all 127.0.0.1/32 reject",
    "host all all ::1/128 reject",
    "",
  ].join("\n"), { encoding: "utf8", mode: 0o600 });
  await bootstrap.query("SELECT pg_reload_conf()");
} finally {
  await bootstrap.end();
}

await chmod(envPath, 0o600);
console.log("Local PostgreSQL role, databases, authentication rules and ignored environment file are ready.");

function secret(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function databaseUrl(database, password) {
  const url = new URL(`postgresql://${applicationRole}@127.0.0.1:5432/${database}`);
  url.password = password;
  return url.toString();
}

function literal(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/u).filter((line) => line && !line.startsWith("#")).map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error("Invalid local environment file.");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function renderEnv(config) {
  return [
    "# Generated local-only configuration. Never commit this file.",
    ...Object.entries(config).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
}
