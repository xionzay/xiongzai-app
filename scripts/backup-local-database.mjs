import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, chmod, stat, writeFile } from "node:fs/promises";
import { constants, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "../packages/database/node_modules/pg/lib/index.js";
import { inspectMigrationArtifacts } from "./migration-status.mjs";

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL("../", import.meta.url));

export function validateBackupTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("BACKUP_DATABASE_CONFIG_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || decodeURIComponent(url.pathname.slice(1)) !== "xiongzai_api_dev"
    || url.search || url.hash) throw new Error("BACKUP_LOCAL_DEVELOPMENT_DATABASE_ONLY");
  return url;
}

export function backupChildEnvironment(url, libraryDirectory) {
  // Do not inherit PGHOSTADDR/PGSERVICE/PGOPTIONS: they can override a validated URL.
  return {
    PATH: process.env.PATH, LANG: "C", LC_ALL: "C",
    PGHOST: url.hostname.replace(/^\[|\]$/gu, ""), PGPORT: url.port || "5432",
    PGDATABASE: "xiongzai_api_dev", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGOPTIONS: "-c default_transaction_read_only=on", PGCONNECT_TIMEOUT: "5",
    DYLD_LIBRARY_PATH: libraryDirectory,
  };
}

export async function archiveSha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function backupLocalDatabase(value) {
  const url = validateBackupTarget(value);
  const bin = resolve(process.env.LOCAL_POSTGRES_BACKUP_BIN ?? join(root, ".local/postgres16/bin"));
  const base = join(root, ".local/backups");
  try {
    await access(join(bin, "pg_dump"), constants.X_OK);
    await access(join(bin, "pg_restore"), constants.X_OK);
  } catch {
    throw new Error("BACKUP_LOCAL_POSTGRES_TOOLS_MISSING");
  }
  // Ensure this sensitive artifact cannot appear in the suggested Git file list.
  await execFile("git", ["check-ignore", "--quiet", ".local/backups/database.dump"], { cwd: root });
  await mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(base, "before-migration-"));
  await chmod(directory, 0o700);
  const archive = join(directory, "database.dump");
  await writeFile(archive, "", { flag: "wx", mode: 0o600 });
  const client = new pg.Client({ connectionString: value, application_name: "local-migration-backup-readonly" });
  let metadata;
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    const expected = await inspectMigrationArtifacts();
    const applied = (await client.query("SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id")).rows;
    if (applied.length > expected.length || applied.some((row, i) => row.hash !== expected[i].hash || Number(row.created_at) !== expected[i].createdAt)) {
      throw new Error("BACKUP_APPLIED_MIGRATION_HISTORY_MISMATCH");
    }
    const counts = {};
    for (const table of ["users", "orders", "payments", "refunds", "ledger_transactions", "ledger_entries", "outbox_events", "scheduled_jobs", "admin_accounts", "messages", "files"]) {
      counts[table] = (await client.query(`SELECT count(*)::text AS count FROM "${table}"`)).rows[0].count;
    }
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
    // Credentials go only through libpq environment, never process arguments/output.
    const childEnv = backupChildEnvironment(url, resolve(bin, "../lib"));
    try {
      await execFile(join(bin, "pg_dump"), ["--no-password", "--format=custom", "--no-owner", "--no-privileges", `--snapshot=${snapshot}`, `--file=${archive}`], { env: childEnv, timeout: 120000 });
      // Validate readability without restoring or exposing archive contents.
      await execFile(join(bin, "pg_restore"), ["--list", archive], { env: childEnv, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    } catch {
      throw new Error("BACKUP_ARCHIVE_CREATION_OR_READ_CHECK_FAILED");
    }
    const file = await stat(archive);
    if (!file.size || (file.mode & 0o077) !== 0) throw new Error("BACKUP_ARCHIVE_PERMISSIONS_INVALID");
    metadata = {
      created_at: new Date().toISOString(), applied_migrations: applied.length,
      pending_migrations: expected.length - applied.length, business_counts: counts,
      snapshot_consistent: true, archive_readable: true, restore_rehearsed: false,
      bytes: file.size, sha256: await archiveSha256(archive), secrets_in_report: false,
    };
    await writeFile(join(directory, "manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
  return { backup_directory: directory, ...metadata };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backupLocalDatabase(process.env.DATABASE_URL)
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    // Do not print driver/child errors, which may contain configuration or data.
    .catch(error => {
      const code = /^BACKUP_[A-Z_]+$/u.test(error?.message ?? "") ? error.message : "LOCAL_DATABASE_BACKUP_FAILED";
      process.stderr.write(`${code}; shared database was not modified\n`);
      process.exitCode = 1;
    });
}
