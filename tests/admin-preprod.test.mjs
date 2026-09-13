import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { adminPreprodSteps, runAdminPreprodSteps } from "../scripts/admin-preprod.mjs";

test("admin preprod contains every required serial gate", () => {
  const names = adminPreprodSteps.map((step) => step.name).join(" ");
  for (const expected of ["质量门禁", "部署配置", "生产构建", "真实 Chrome", "迁移", "文件流式", "后台任务", "敏感日志", "残留", "ESLint", "Git"]) assert.match(names, new RegExp(expected, "u"));
});

test("admin preprod stops immediately at the first failed step", async () => {
  const visited = [];
  await assert.rejects(runAdminPreprodSteps([
    { name: "one", command: "noop", args: [] },
    { name: "two", command: "noop", args: [] },
    { name: "three", command: "noop", args: [] },
  ], async (step) => { visited.push(step.name); return step.name === "two" ? 7 : 0; }), /two.*7/u);
  assert.deepEqual(visited, ["one", "two"]);
});

test("generated browser and production build test artifacts remain Git ignored", async () => {
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  for (const path of ["/test-results/", "/playwright-report/", "/blob-report/", "/playwright/.auth/", "/.vinext/"]) assert.ok(ignore.includes(path));
});
