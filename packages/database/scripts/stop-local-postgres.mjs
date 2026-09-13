import { execFile as execFileCallback } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const postgresRoot = path.join(repositoryRoot, ".local", "postgres16");
const postgresBin = path.join(postgresRoot, "bin");
const postgresData = path.join(repositoryRoot, ".local", "postgres-data");
const pgCtl = path.join(postgresBin, "pg_ctl");
const postgresEnvironment = {
  ...process.env,
  PATH: `${postgresBin}:${process.env.PATH ?? ""}`,
  DYLD_LIBRARY_PATH: [path.join(postgresRoot, "lib"), process.env.DYLD_LIBRARY_PATH]
    .filter(Boolean)
    .join(":"),
};

await access(pgCtl);

try {
  await execFile(pgCtl, ["-D", postgresData, "status"], {
    cwd: repositoryRoot,
    env: postgresEnvironment,
  });
} catch {
  console.log("本项目的本地 PostgreSQL 当前未运行。");
  process.exit(0);
}

await execFile(pgCtl, ["-D", postgresData, "-m", "fast", "-w", "stop"], {
  cwd: repositoryRoot,
  env: postgresEnvironment,
});

console.log("本项目的本地 PostgreSQL 已安全停止。");
