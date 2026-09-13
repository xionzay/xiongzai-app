import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adminQualityMain } from "./admin-quality.mjs";

export const adminPreprodSteps = [
  { name: "管理员既有质量门禁", command: "pnpm", args: ["run", "admin:quality"] },
  { name: "部署配置、Mock 防误用、代理与日志契约", command: "node", args: ["--test", "apps/api/tests/api.test.mjs", "apps/worker/tests/outbox-worker.test.mjs", "tests/migration-status.test.mjs", "tests/sensitive-log-scan.test.mjs", "tests/admin-local-cleanup-audit.test.mjs", "tests/admin-preprod.test.mjs"] },
  { name: "生产构建产物启动与关闭", command: "node", args: ["--test", "tests/admin-production-runtime.test.mjs"] },
  { name: "生产前端真实 Chrome E2E", command: "node", args: ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.preprod.config.mjs"] },
  { name: "数据库迁移产物一致性", command: "node", args: ["scripts/migration-status.mjs", "--artifacts-only"] },
  { name: "文件流式预览稳定性", command: "node", args: ["--test", "apps/api/tests/file-storage.unit.test.mjs"] },
  { name: "后台任务恢复、退避与幂等", command: "node", args: ["--test", "--test-concurrency=1", "apps/scheduler/tests/scheduler.test.mjs", "apps/scheduler/tests/scheduler-postgres.integration.test.mjs", "apps/worker/tests/outbox-worker.test.mjs", "apps/worker/tests/outbox-worker-postgres.integration.test.mjs"] },
  { name: "敏感日志静态扫描", command: "node", args: ["scripts/check-sensitive-logs.mjs"] },
  { name: "临时 Schema 与 MinIO 对象只读残留审计", command: "node", args: ["scripts/admin-local-cleanup-audit.mjs"] },
  { name: "预发布新增文件 ESLint", command: "pnpm", args: ["exec", "eslint", "playwright.preprod.config.mjs", "scripts/admin-preprod.mjs", "scripts/migration-status.mjs", "scripts/check-sensitive-logs.mjs", "scripts/admin-local-cleanup-audit.mjs", "tests/admin-production-runtime.test.mjs", "tests/admin-preprod.test.mjs", "tests/migration-status.test.mjs", "tests/sensitive-log-scan.test.mjs", "tests/admin-local-cleanup-audit.test.mjs", "apps/api/src/config.ts", "apps/api/src/bootstrap.ts", "apps/api/src/health.controller.ts", "apps/api/src/http-context.middleware.ts", "apps/worker/src/config.ts", "apps/worker/src/main.ts", "apps/worker/src/outbox-worker.ts", "apps/worker/tests/outbox-worker-postgres.integration.test.mjs", "apps/scheduler/src/config.ts", "apps/scheduler/tests/scheduler.test.mjs", "--ignore-pattern", "**/dist/**", "--ignore-pattern", ".vinext/**"] },
  { name: "Git 差异格式检查", command: "git", args: ["diff", "--check"] },
];

export async function runAdminPreprodSteps(steps = adminPreprodSteps, runner = runProcess) {
  for (const [index, step] of steps.entries()) {
    process.stdout.write(`\n[admin:preprod ${index + 1}/${steps.length}] ${step.name}\n`);
    const exitCode = await runner(step);
    if (exitCode !== 0) throw new Error(`预发布门禁步骤失败：${step.name}（退出码 ${exitCode}）`);
  }
}

export async function adminPreprodMain(options = {}) {
  await adminQualityMain({ environment: options.environment ?? process.env, steps: [], connector: options.connector });
  await runAdminPreprodSteps(options.steps ?? adminPreprodSteps, options.runner ?? runProcess);
}

function runProcess(step) {
  return new Promise((resolveExit) => {
    const child = spawn(step.command, step.args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    child.once("error", (error) => { process.stderr.write(`无法启动步骤 ${step.name}：${error.code ?? "SPAWN_ERROR"}\n`); resolveExit(1); });
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  adminPreprodMain().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "管理员预发布门禁失败"}\n`); process.exitCode = 1; });
}
