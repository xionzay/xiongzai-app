import assert from "node:assert/strict";
import test from "node:test";
import { adminQualityMain, formatEnvironmentFailure, runAdminQualitySteps, validateAdminQualityEnvironment } from "../scripts/admin-quality.mjs";

const completeEnvironment = {
  TEST_DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  FILE_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  FILE_STORAGE_REGION: "local", FILE_STORAGE_ACCESS_KEY_ID: "test", FILE_STORAGE_SECRET_ACCESS_KEY: "not-printed",
  FILE_PUBLIC_BUCKET: "public", FILE_PRIVATE_BUCKET: "private", FILE_QUARANTINE_BUCKET: "quarantine",
};

test("admin quality preflight reports missing key names without values", async () => {
  const report = await validateAdminQualityEnvironment({ TEST_DATABASE_URL: completeEnvironment.TEST_DATABASE_URL }, { chromePaths: ["/test/chrome"], fileAccess: async () => undefined });
  assert.equal(report.ok, false);
  const message = formatEnvironmentFailure(report);
  assert.match(message, /FILE_STORAGE_ENDPOINT/u);
  assert.equal(message.includes(completeEnvironment.TEST_DATABASE_URL), false);
});

test("admin quality preflight refuses external database and object storage addresses", async () => {
  const report = await validateAdminQualityEnvironment({ ...completeEnvironment, TEST_DATABASE_URL: "postgresql://secret@example.com/db", FILE_STORAGE_ENDPOINT: "https://storage.example.com" }, { chromePaths: ["/test/chrome"], fileAccess: async () => undefined });
  assert.deepEqual(report.invalid.sort(), ["FILE_STORAGE_ENDPOINT", "TEST_DATABASE_URL"]);
  assert.equal(formatEnvironmentFailure(report).includes("example.com"), false);
});

test("admin quality stops immediately after the first failed step", async () => {
  const calls = [];
  await assert.rejects(() => runAdminQualitySteps([{ name: "first", command: "one", args: [] }, { name: "second", command: "two", args: [] }], async (step) => { calls.push(step.name); return 7; }), /first/u);
  assert.deepEqual(calls, ["first"]);
});

test("admin quality main refuses unreachable required local services before running commands", async () => {
  let ran = false;
  await assert.rejects(() => adminQualityMain({ environment: completeEnvironment, chromePaths: ["/test/chrome"], fileAccess: async () => undefined, connector: async ({ key }) => key !== "TEST_DATABASE_URL", steps: [{ name: "must-not-run", command: "none", args: [] }], runner: async () => { ran = true; return 0; } }), /TEST_DATABASE_URL/u);
  assert.equal(ran, false);
});
