import { execFile as execFileCallback } from "node:child_process";
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const localRoot = path.join(repositoryRoot, ".local");
const postgresRoot = path.join(localRoot, "postgres16");
const postgresBin = path.join(postgresRoot, "bin");
const postgresData = path.join(localRoot, "postgres-data");
const postgresSocket = path.join(localRoot, "postgres-socket");
const postgresLog = path.join(localRoot, "postgres.log");
const pgCtl = path.join(postgresBin, "pg_ctl");
const initdb = path.join(postgresBin, "initdb");
const pgVersion = path.join(postgresData, "PG_VERSION");

const postgresEnvironment = {
  ...process.env,
  PATH: `${postgresBin}:${process.env.PATH ?? ""}`,
  DYLD_LIBRARY_PATH: [path.join(postgresRoot, "lib"), process.env.DYLD_LIBRARY_PATH]
    .filter(Boolean)
    .join(":"),
};

function canConnect(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function commandStatus(command, args) {
  try {
    await execFile(command, args, { cwd: repositoryRoot, env: postgresEnvironment });
    return true;
  } catch {
    return false;
  }
}

async function expectedClusterIsListening() {
  try {
    const lines = (await readFile(path.join(postgresData, "postmaster.pid"), "utf8")).split(/\r?\n/u);
    const pid = Number(lines[0]);
    const dataDirectory = lines[1];
    const port = Number(lines[3]);
    if (!Number.isInteger(pid) || pid < 2 || dataDirectory !== postgresData || port !== 5432) return false;
    const { stdout: workingDirectory } = await execFile("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
      cwd: repositoryRoot,
      env: postgresEnvironment,
    });
    const { stdout: listener } = await execFile("/usr/sbin/lsof", ["-nP", "-a", "-p", String(pid), "-iTCP:5432", "-sTCP:LISTEN", "-Fn"], {
      cwd: repositoryRoot,
      env: postgresEnvironment,
    });
    return workingDirectory.split(/\r?\n/u).includes(`n${postgresData}`)
      && listener.split(/\r?\n/u).some((line) => line === "n127.0.0.1:5432" || line === "n*:5432");
  } catch {
    return false;
  }
}

async function initializeCluster() {
  if (await canConnect("127.0.0.1", 5432)) {
    throw new Error("TCP 端口 5432 已被其他进程占用，拒绝初始化本地 PostgreSQL。");
  }

  await mkdir(postgresData, { recursive: true, mode: 0o700 });
  await mkdir(postgresSocket, { recursive: true, mode: 0o700 });
  await execFile(
    initdb,
    [
      "--pgdata",
      postgresData,
      "--username=xiongzai_bootstrap",
      "--auth-local=trust",
      "--auth-host=reject",
      "--encoding=UTF8",
      "--locale=C",
    ],
    { cwd: repositoryRoot, env: postgresEnvironment },
  );

  const socketPath = postgresSocket.replaceAll("'", "''");
  await appendFile(
    path.join(postgresData, "postgresql.conf"),
    [
      "",
      "# 熊崽电竞本地测试环境（由 db:local:start 初始化）",
      "listen_addresses = '127.0.0.1'",
      "port = 5432",
      `unix_socket_directories = '${socketPath}'`,
      "password_encryption = 'scram-sha-256'",
      "",
    ].join("\n"),
    "utf8",
  );
}

await access(pgCtl);
await access(initdb);
await mkdir(postgresSocket, { recursive: true, mode: 0o700 });

try {
  await readFile(pgVersion, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await initializeCluster();
  console.log("本地 PostgreSQL 数据目录已初始化。");
}

if (await commandStatus(pgCtl, ["-D", postgresData, "status"])) {
  console.log("本地 PostgreSQL 已运行：127.0.0.1:5432");
  process.exit(0);
}

if (await expectedClusterIsListening()) {
  console.log("本地 PostgreSQL 已运行：127.0.0.1:5432（已核对 PID 数据目录）");
  process.exit(0);
}

if (await canConnect("127.0.0.1", 5432)) {
  throw new Error("TCP 端口 5432 已被其他进程占用，拒绝启动本项目 PostgreSQL。");
}

await execFile(pgCtl, ["-D", postgresData, "-l", postgresLog, "-w", "start"], {
  cwd: repositoryRoot,
  env: postgresEnvironment,
});

console.log("本地 PostgreSQL 已启动：127.0.0.1:5432");
console.log(`日志：${path.relative(repositoryRoot, postgresLog)}`);
