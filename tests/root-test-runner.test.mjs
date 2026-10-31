import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { rootTestPlan, runRootTestPlan } from "../scripts/run-root-tests.mjs";

test("every current root test is scheduled exactly once, with runtime artifacts in their own final phase", async () => {
  const files = (await readdir("tests")).filter(name => name.endsWith(".test.mjs")).map(name => `tests/${name}`);
  const plan = rootTestPlan(files);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].args.slice(0, 2), ["--test", "--test-concurrency=4"]);
  assert.deepEqual(plan[1].args, ["--test", "--test-concurrency=1", "tests/admin-production-runtime.test.mjs"]);
  assert.deepEqual(plan.flatMap(step => step.args.slice(2)).sort(), files.sort());
});
test("root plan refuses missing artifact coverage or duplicate files", () => {
  assert.throws(() => rootTestPlan(["tests/example.test.mjs"]));
  assert.throws(() => rootTestPlan(["tests/admin-production-runtime.test.mjs"]));
  assert.throws(() => rootTestPlan(["tests/admin-production-runtime.test.mjs", "tests/example.test.mjs", "tests/example.test.mjs"]));
});
test("unit-phase failure stops before launching any artifact, while retaining its nonzero exit", async () => {
  const called = [];
  const code = await runRootTestPlan([{ name: "unit" }, { name: "runtime" }], async step => { called.push(step.name); return 7; });
  assert.equal(code, 7); assert.deepEqual(called, ["unit"]);
});
test("runtime failure is not converted into a successful root command", async () => {
  const called = [];
  const code = await runRootTestPlan([{ name: "unit" }, { name: "runtime" }], async step => { called.push(step.name); return step.name === "runtime" ? 1 : 0; });
  assert.equal(code, 1); assert.deepEqual(called, ["unit", "runtime"]);
});
test("normal root command still builds and then runs the complete resource-aware plan", async () => {
  const { scripts } = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(scripts.test, "pnpm run build && node --env-file-if-exists=.env.backend.local scripts/run-root-tests.mjs");
});
