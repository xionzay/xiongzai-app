import { access } from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredAdminQualityKeys = [
  "TEST_DATABASE_URL", "FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID",
  "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET",
];

export const adminQualitySteps = [
  { name: "根前端生产构建", command: "pnpm", args: ["run", "build"] },
  { name: "根 TypeScript", command: "node", args: ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--noEmit"] },
  { name: "全工作区 TypeScript", command: "pnpm", args: ["-r", "--if-present", "typecheck"] },
  { name: "后端构建", command: "pnpm", args: ["run", "backend:build"] },
  { name: "管理员契约、SSR 与门禁单元测试", command: "node", args: ["--test", "tests/admin-ui.test.mjs", "tests/admin-quality.test.mjs", "tests/admin-rbac-behavior.test.mjs", "tests/admin-remediation.test.mjs", "tests/admin-commerce-alignment.test.mjs", "tests/community-ui.test.mjs", "tests/admin-after-sale-cases.test.mjs", "apps/api/tests/admin-safety.unit.test.mjs"] },
  { name: "管理员真实浏览器 E2E", command: "pnpm", args: ["run", "admin:e2e"] },
  { name: "管理员治理 PostgreSQL 集成", command: "node", args: ["--test", "--test-concurrency=1", "apps/api/tests/admin-governance.integration.test.mjs"] },
  { name: "财务 PostgreSQL 集成", command: "node", args: ["--test", "--test-concurrency=1", "apps/api/tests/finance.integration.test.mjs"] },
  { name: "商家商品集成", command: "node", args: ["--test", "--test-concurrency=1", "apps/api/tests/seller-product.integration.test.mjs"] },
  { name: "售后与客服集成", command: "node", args: ["--test", "--test-concurrency=1", "apps/api/tests/after-sale.integration.test.mjs", "apps/api/tests/chat-support-notification.integration.test.mjs"] },
  { name: "文件单元测试", command: "node", args: ["--test", "apps/api/tests/file-storage.unit.test.mjs"] },
  { name: "文件 PostgreSQL 与 MinIO 集成", command: "node", args: ["--test", "--test-concurrency=1", "apps/api/tests/file-storage.integration.test.mjs"] },
  { name: "管理员查询性能测试", command: "node", args: ["--test", "--test-concurrency=1", "packages/database/tests/admin-performance.integration.test.mjs"] },
  { name: "管理员定向 ESLint", command: "pnpm", args: ["exec", "eslint", "app/admin", "apps/api/src/admin-governance.controllers.ts", "apps/api/src/admin-governance.service.ts", "apps/api/src/finance.controllers.ts", "apps/api/src/finance.service.ts", "apps/api/src/file-storage.controllers.ts", "apps/api/src/file-storage.service.ts", "apps/api/src/object-storage-provider.ts", "apps/api/src/preview-concurrency-limiter.ts", "tests/browser", "scripts/admin-quality.mjs", "tests/admin-quality.test.mjs", "--ignore-pattern", "**/dist/**", "--ignore-pattern", ".vinext/**"] },
  { name: "Git 差异格式检查", command: "git", args: ["diff", "--check"] },
];

const defaultChromePaths = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
];

export async function validateAdminQualityEnvironment(environment, options = {}) {
  const missing = requiredAdminQualityKeys.filter((key) => !environment[key]);
  const invalid = [];
  const targets = [];
  for (const [key, defaultPort] of [["TEST_DATABASE_URL", 5432], ["FILE_STORAGE_ENDPOINT", 9000]]) {
    const value = environment[key];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!isLoopback(url.hostname)) invalid.push(key);
      else targets.push({ key, host: url.hostname, port: Number(url.port || defaultPort) });
    } catch { invalid.push(key); }
  }
  const chromeCandidates = [environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, ...(options.chromePaths ?? defaultChromePaths)].filter(Boolean);
  const fileAccess = options.fileAccess ?? access;
  const chromeAvailable = await firstAccessible(chromeCandidates, fileAccess);
  return { ok: missing.length === 0 && invalid.length === 0 && chromeAvailable, missing, invalid, chromeAvailable, targets };
}

export function formatEnvironmentFailure(report) {
  const lines = ["管理员质量门禁本地依赖检查失败。"];
  if (report.missing.length) lines.push(`缺少配置键：${report.missing.join(", ")}`);
  if (report.invalid.length) lines.push(`必须是有效本机地址的配置键：${report.invalid.join(", ")}`);
  if (!report.chromeAvailable) lines.push("缺少本地 Google Chrome 可执行程序（键：PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH，可选）。");
  return lines.join("\n");
}

export async function runAdminQualitySteps(steps = adminQualitySteps, runner = runProcess) {
  for (const [index, step] of steps.entries()) {
    process.stdout.write(`\n[admin:quality ${index + 1}/${steps.length}] ${step.name}\n`);
    const exitCode = await runner(step);
    if (exitCode !== 0) throw new Error(`质量门禁步骤失败：${step.name}（退出码 ${exitCode}）`);
  }
}

export async function adminQualityMain(options = {}) {
  const environment = options.environment ?? process.env;
  const report = await validateAdminQualityEnvironment(environment, options);
  if (!report.ok) throw new Error(formatEnvironmentFailure(report));
  const connector = options.connector ?? connectLocal;
  for (const target of report.targets) {
    const reachable = await connector(target);
    if (!reachable) throw new Error(`本地依赖不可达，配置键：${target.key}`);
  }
  await runAdminQualitySteps(options.steps ?? adminQualitySteps, options.runner ?? runProcess);
}

async function firstAccessible(paths, fileAccess) {
  for (const path of paths) {
    try { await fileAccess(path); return true; }
    catch { /* continue */ }
  }
  return false;
}

function isLoopback(hostname) {
  const normalized = hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(normalized);
}

function connectLocal({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => { socket.destroy(); resolve(result); };
    socket.setTimeout(2_000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function runProcess(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    child.once("error", (error) => { process.stderr.write(`无法启动步骤 ${step.name}：${error.code ?? "SPAWN_ERROR"}\n`); resolve(1); });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  adminQualityMain().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "管理员质量门禁失败"}\n`); process.exitCode = 1; });
}
