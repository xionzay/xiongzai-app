import { spawn } from "node:child_process";

validateLocalDatabase("DATABASE_URL", process.env.DATABASE_URL, "xiongzai_api_dev");
validateLocalDatabase("TEST_DATABASE_URL", process.env.TEST_DATABASE_URL, "xiongzai_database_test");
if (process.argv.length < 3) throw new Error("缺少 pnpm 子命令参数");

const child = spawn("pnpm", process.argv.slice(2), { env: process.env, stdio: "inherit", shell: false });
child.once("error", (error) => { throw error; });
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});

function validateLocalDatabase(key, value, expectedDatabase) {
  if (!value) throw new Error(`缺少配置键：${key}`);
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error(`无效配置键：${key}`); }
  const host = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) throw new Error(`${key} 拒绝连接非本机数据库`);
  if (decodeURIComponent(parsed.pathname.slice(1)) !== expectedDatabase) throw new Error(`${key} 必须指向 ${expectedDatabase}`);
}
