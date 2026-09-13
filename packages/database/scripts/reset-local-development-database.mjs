import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const confirmation = "--confirm-local-dev-reset";
if (!process.argv.includes(confirmation)) {
  throw new Error(`拒绝清理：必须显式传入 ${confirmation}。`);
}

const config = parseEnv(await readFile(resolve(workspaceRoot, ".env.backend.local"), "utf8"));
checkedLocalUrl(config.DATABASE_URL, "xiongzai_api_dev", "DATABASE_URL");
checkedLocalUrl(config.TEST_DATABASE_URL, "xiongzai_database_test", "TEST_DATABASE_URL");
if (config.DATABASE_URL === config.TEST_DATABASE_URL) throw new Error("拒绝清理：DATABASE_URL 与 TEST_DATABASE_URL 不得相同。");

const bootstrap = new pg.Client({
  host: resolve(workspaceRoot, ".local/postgres-socket"),
  database: "postgres",
  user: "xiongzai_bootstrap",
});
await bootstrap.connect();
try {
  await bootstrap.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", ["xiongzai_api_dev"]);
  await bootstrap.query("DROP DATABASE xiongzai_api_dev");
  await bootstrap.query("CREATE DATABASE xiongzai_api_dev OWNER xiongzai_app");
  await bootstrap.query("REVOKE CONNECT, TEMPORARY ON DATABASE xiongzai_api_dev FROM PUBLIC");
  await bootstrap.query("GRANT CONNECT, TEMPORARY ON DATABASE xiongzai_api_dev TO xiongzai_app");
} finally {
  await bootstrap.end();
}

console.log("仅本机开发数据库 xiongzai_api_dev 已重建；独立测试数据库未改动。");
console.log("下一步请运行迁移、协议种子和人工测试种子命令。");

function checkedLocalUrl(raw, expectedDatabase, key) {
  if (!raw) throw new Error(`拒绝清理：缺少 ${key}。`);
  const url = new URL(raw);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.pathname !== `/${expectedDatabase}` || url.username !== "xiongzai_app") {
    throw new Error(`拒绝清理：${key} 不是预期的本地隔离数据库。`);
  }
  return url;
}

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/u).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
