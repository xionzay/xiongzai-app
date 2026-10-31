import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "../packages/database/node_modules/pg/lib/index.js";
import { archiveSha256 } from "./backup-local-database.mjs";

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL("../", import.meta.url));

export async function validateBackupDirectory(directory) {
  const allowed = await realpath(join(root, ".local/backups"));
  const target = await realpath(resolve(directory));
  if (!target.startsWith(`${allowed}${sep}before-migration-`) || target.slice(allowed.length + 1).includes(sep)) {
    throw new Error("RESTORE_BACKUP_DIRECTORY_INVALID");
  }
  if (await realpath(join(target, "database.dump")) !== join(target, "database.dump")) {
    throw new Error("RESTORE_BACKUP_ARCHIVE_SYMLINK_REJECTED");
  }
  if (await realpath(join(target, "manifest.json")) !== join(target, "manifest.json")) throw new Error("RESTORE_BACKUP_MANIFEST_SYMLINK_REJECTED");
  return target;
}

export async function rehearseRestore(directory) {
  const backup = await validateBackupDirectory(directory);
  const manifest = JSON.parse(await readFile(join(backup, "manifest.json"), "utf8"));
  assert.equal(manifest.snapshot_consistent, true);
  assert.equal(manifest.archive_readable, true);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(await archiveSha256(join(backup, "database.dump")), manifest.sha256, "backup archive hash changed");
  const sandbox = await mkdtemp("/private/tmp/xz-restore-");
  await chmod(sandbox, 0o700);
  const marker = "xiongzai-isolated-restore-rehearsal-v1";
  await writeFile(join(sandbox, "owner"), marker, { flag: "wx", mode: 0o600 });
  const data = join(sandbox, "data");
  const socket = join(sandbox, "socket");
  await mkdir(socket, { mode: 0o700 });
  const bin = resolve(process.env.LOCAL_POSTGRES_BACKUP_BIN ?? join(root, ".local/postgres16/bin"));
  const env = {
    PATH: process.env.PATH, LANG: "C", LC_ALL: "C",
    DYLD_LIBRARY_PATH: resolve(bin, "../lib"),
    PGHOST: socket, PGPORT: "55439", PGDATABASE: "postgres", PGUSER: "restore_rehearsal",
    PGCONNECT_TIMEOUT: "5",
  };
  const run = (name, args, timeout = 60000) => execFile(join(bin, name), args, { env, timeout, maxBuffer: 4 * 1024 * 1024 });
  let started = false;
  let safeToRemove = true;
  let result;
  let failure;
  try {
    await run("initdb", ["-D", data, "-U", "restore_rehearsal", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"]);
    // No TCP listener. Trust applies only inside our mode-0700 socket directory.
    safeToRemove = false;
    await run("pg_ctl", ["-D", data, "-l", join(sandbox, "postgres.log"), "-o", `-h '' -k '${socket}' -p 55439 -c unix_socket_permissions=0700`, "-w", "start"]);
    started = true;
    await run("pg_restore", ["--no-password", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname=postgres", join(backup, "database.dump")], 120000);
    const client = new pg.Client({ host: socket, port: 55439, user: "restore_rehearsal", database: "postgres" });
    await client.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout='30s'");
      const server = (await client.query("SELECT current_database() AS database,current_user AS role,inet_server_addr() AS address")).rows[0];
      assert.deepEqual(server, { database: "postgres", role: "restore_rehearsal", address: null });
      const counts = {};
      for (const table of ["users", "orders", "payments", "refunds", "ledger_transactions", "ledger_entries", "outbox_events", "scheduled_jobs", "admin_accounts", "messages", "files"]) {
        counts[table] = (await client.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows[0].count;
      }
      assert.deepEqual(counts, manifest.business_counts, "restored business counts differ from backup snapshot");
      const migrationCount = (await client.query("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations")).rows[0].count;
      assert.equal(migrationCount, manifest.applied_migrations);
      const tables = (await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].count;
      result = { restore_rehearsed: true, separate_cluster: true, tcp_listener: false, business_counts_match: true, applied_migrations: migrationCount, public_tables: tables };
      await client.query("ROLLBACK");
    } finally { await client.end(); }
  } catch {
    // Child output may contain SQL data. Never print or attach it to the error.
    failure = new Error("RESTORE_REHEARSAL_FAILED");
  } finally {
    if (started) {
      try {
        await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
        safeToRemove = true;
      } catch {
        safeToRemove = false;
      }
    }
    if (!safeToRemove) {
      failure = new Error("RESTORE_CLUSTER_STOP_UNCONFIRMED_PRESERVED");
    } else {
      assert.match(sandbox, /^\/private\/tmp\/xz-restore-[A-Za-z0-9]+$/u);
      assert.equal(await readFile(join(sandbox, "owner"), "utf8"), marker);
      // Only the exact mkdtemp-owned, stopped rehearsal cluster is removed.
      await rm(sandbox, { recursive: true });
    }
  }
  if (failure) throw failure;
  const receipt = { ...result, archive_sha256: manifest.sha256, temporary_cluster_removed: true, checked_at: new Date().toISOString() };
  await writeFile(join(backup, `restore-receipt-${Date.now()}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearseRestore(process.argv[2])
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      const code = /^RESTORE_[A-Z_]+$/u.test(error?.message ?? "") ? error.message : "RESTORE_REHEARSAL_FAILED";
      process.stderr.write(`${code}; shared database was not modified\n`);
      process.exitCode = 1;
    });
}
