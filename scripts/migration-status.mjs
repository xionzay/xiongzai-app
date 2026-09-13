import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import { readMigrationFiles } from "../packages/database/node_modules/drizzle-orm/migrator.js";
import pg from "../packages/database/node_modules/pg/lib/index.js";

export const defaultMigrationsFolder = fileURLToPath(new URL("../packages/database/migrations", import.meta.url));

export async function inspectMigrationArtifacts(folder = defaultMigrationsFolder) {
  const journal = JSON.parse(await readFile(resolve(folder, "meta/_journal.json"), "utf8"));
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  if (entries.length === 0) throw new Error("Migration artifact check failed: MIGRATION_JOURNAL");
  const tags = entries.map((entry) => String(entry.tag));
  if (new Set(tags).size !== tags.length || entries.some((entry, index) => entry.idx !== index || !Number.isSafeInteger(entry.when) || entry.when <= 0)) {
    throw new Error("Migration artifact check failed: MIGRATION_JOURNAL");
  }
  const sqlFiles = (await readdir(folder)).filter((name) => /^\d+_.+\.sql$/u.test(name)).sort();
  const expectedFiles = tags.map((tag) => `${tag}.sql`).sort();
  if (JSON.stringify(sqlFiles) !== JSON.stringify(expectedFiles)) throw new Error("Migration artifact check failed: MIGRATION_FILES");
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  if (migrations.length !== entries.length || migrations.some((migration) => !/^[a-f0-9]{64}$/u.test(migration.hash))) {
    throw new Error("Migration artifact check failed: MIGRATION_HASHES");
  }
  return migrations.map((migration, index) => ({ tag: tags[index], hash: migration.hash, createdAt: migration.folderMillis }));
}

export function compareMigrationStatus(expected, appliedRows) {
  const applied = appliedRows.map((row) => ({ hash: String(row.hash), createdAt: Number(row.created_at) }));
  const current = expected.length === applied.length && expected.every((migration, index) => migration.hash === applied[index]?.hash && migration.createdAt === applied[index]?.createdAt);
  return { current, expectedCount: expected.length, appliedCount: applied.length, pendingCount: Math.max(0, expected.length - applied.length) };
}

export function validateReadonlyMigrationTarget(connectionString, allowExternal = false) {
  if (!connectionString) throw new Error("缺少配置键：DATABASE_URL");
  let url;
  try { url = new URL(connectionString); }
  catch { throw new Error("无效配置键：DATABASE_URL"); }
  if (!allowExternal && !isLoopback(url.hostname)) throw new Error("外部迁移状态检查未授权；如已取得只读审批，仅设置键：MIGRATION_STATUS_ALLOW_EXTERNAL");
  return { host: url.hostname, port: Number(url.port || 5432) };
}

export async function readMigrationStatus(connectionString, options = {}) {
  validateReadonlyMigrationTarget(connectionString, options.allowExternal === true);
  const expected = await inspectMigrationArtifacts(options.folder ?? defaultMigrationsFolder);
  const client = new pg.Client({ connectionString, application_name: "xiongzai-migration-readonly-status" });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const table = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present");
    if (!table.rows[0]?.present) return { current: false, expectedCount: expected.length, appliedCount: 0, pendingCount: expected.length, migrationTablePresent: false };
    const applied = await client.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id");
    return { ...compareMigrationStatus(expected, applied.rows), migrationTablePresent: true };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

function isLoopback(hostname) {
  const normalized = hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(normalized);
}

async function main() {
  if (process.argv.includes("--artifacts-only")) {
    const migrations = await inspectMigrationArtifacts();
    process.stdout.write(`${JSON.stringify({ migration_artifacts: migrations.length, consistent: true })}\n`);
    return;
  }
  const status = await readMigrationStatus(process.env.DATABASE_URL, { allowExternal: process.env.MIGRATION_STATUS_ALLOW_EXTERNAL === "1" });
  process.stdout.write(`${JSON.stringify(status)}\n`);
  if (!status.current) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "迁移状态检查失败"}\n`); process.exitCode = 1; });
}
