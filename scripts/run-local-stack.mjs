import { execFile as execFileCallback, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const logsDirectory = path.join(repositoryRoot, ".local", "logs");
const children = new Map();
let postgresStartedHere = false;
let shuttingDown = false;

function tcp(host, port, timeoutMs = 500) {
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

async function waitHttp(url, name, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // 服务仍在启动。
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${name} 未在 ${timeoutMs}ms 内就绪。`);
}

function start(name, command, args) {
  const logPath = path.join(logsDirectory, `${name}.log`);
  const logFd = openSync(logPath, "a", 0o600);
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  children.set(name, { child, logFd });
  child.once("error", (error) => {
    console.error(`${name} 启动失败：${error.message}`);
    void shutdown(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(name);
    closeSync(logFd);
    if (!shuttingDown) {
      console.error(`${name} 意外退出（code=${code ?? "null"}, signal=${signal ?? "null"}），正在停止本地栈。`);
      void shutdown(1);
    }
  });
  return child;
}

async function runNode(relativeScript, extraArgs = []) {
  await execFile(process.execPath, [...extraArgs, path.join(repositoryRoot, relativeScript)], {
    cwd: repositoryRoot,
    env: process.env,
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("正在停止本地服务……");

  for (const { child } of children.values()) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // 已退出。
    }
  }

  const deadline = Date.now() + 5_000;
  while (children.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const { child } of children.values()) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // 已退出。
    }
  }

  if (postgresStartedHere) {
    try {
      await runNode("packages/database/scripts/stop-local-postgres.mjs");
    } catch (error) {
      console.error(`PostgreSQL 停止失败：${error.message}`);
      exitCode = 1;
    }
  }

  console.log("本地栈已停止；日志保留在 .local/logs/。 ");
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void shutdown(0));

try {
  await mkdir(logsDirectory, { recursive: true, mode: 0o700 });

  const conflicts = [];
  for (const [name, port] of [["MinIO API", 9000], ["MinIO Console", 9001], ["API", 3002], ["管理员后台", 3001]]) {
    if ((await tcp("127.0.0.1", port)) || (await tcp("::1", port))) conflicts.push(`${name}:${port}`);
  }
  if (conflicts.length > 0) {
    throw new Error(`端口已被占用：${conflicts.join("、")}。请先在旧终端按 Ctrl+C 停止对应进程。`);
  }

  postgresStartedHere = !(await tcp("127.0.0.1", 5432));
  await runNode("packages/database/scripts/start-local-postgres.mjs");

  start("minio", process.execPath, [path.join(repositoryRoot, "apps/api/scripts/start-local-minio.mjs")]);
  await waitHttp("http://127.0.0.1:9000/minio/health/ready", "MinIO");
  await runNode("apps/api/scripts/configure-local-minio.mjs");

  start("api", process.execPath, ["--env-file=.env.backend.local", "--enable-source-maps", "apps/api/dist/main.js"]);
  await waitHttp("http://127.0.0.1:3002/health/ready", "API");

  start("worker", process.execPath, ["--env-file=.env.backend.local", "--enable-source-maps", "apps/worker/dist/main.js"]);
  start("scheduler", process.execPath, ["--env-file=.env.backend.local", "--enable-source-maps", "apps/scheduler/dist/main.js"]);
  start("admin", "pnpm", ["dev"]);
  await waitHttp("http://127.0.0.1:3001/", "管理员后台", 60_000);

  console.log("熊崽电竞本地测试栈已就绪：");
  console.log("- API：http://127.0.0.1:3002");
  console.log("- 管理员后台：http://127.0.0.1:3001");
  console.log("- MinIO Console：http://127.0.0.1:9001");
  console.log("- 日志：.local/logs/");
  console.log("在当前终端按 Ctrl+C 可停止由本命令启动的服务。");
  process.stdin.resume();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await shutdown(1);
}
