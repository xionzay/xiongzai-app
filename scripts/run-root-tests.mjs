import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeFile = "tests/admin-production-runtime.test.mjs";

export function rootTestPlan(files) {
  if (!files.includes(runtimeFile) || new Set(files).size !== files.length) throw new Error("根测试清单无效");
  const unitFiles = files.filter(file => file !== runtimeFile).sort();
  if (!unitFiles.length) throw new Error("根测试清单为空");
  return [
    { name: "组件、SSR、契约与单元测试（最多四个文件并行）", args: ["--test", "--test-concurrency=4", ...unitFiles] },
    { name: "生产产物启动与退出（独立串行）", args: ["--test", "--test-concurrency=1", runtimeFile] },
  ];
}

export async function runRootTestPlan(plan, runner) {
  for (const step of plan) {
    const code = await runner(step);
    if (code !== 0) return code || 1;
  }
  return 0;
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = (await readdir(resolve(root, "tests"))).filter(file => file.endsWith(".test.mjs")).map(file => `tests/${file}`);
  process.exitCode = await runRootTestPlan(rootTestPlan(files), step => new Promise(resolveCode => {
    process.stdout.write(`\n[root:test] ${step.name}\n`);
    const child = spawn(process.execPath, step.args, { cwd: root, env: process.env, stdio: "inherit" });
    child.once("error", () => resolveCode(1));
    child.once("close", code => resolveCode(code ?? 1));
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write("根测试执行失败\n"); process.exitCode = 1; });
}
