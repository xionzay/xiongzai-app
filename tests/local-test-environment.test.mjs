import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("local environment commands cover start, stop, prepare, seed, doctor and guarded reset", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  for (const command of [
    "db:local:start", "db:local:stop", "db:local:setup", "db:local:verify", "db:local:reset",
    "storage:local:prepare", "storage:local:start", "storage:local:configure", "storage:local:verify",
    "local:prepare", "local:seed", "local:run", "local:doctor", "local:doctor:config",
  ]) assert.equal(typeof packageJson.scripts[command], "string", `missing ${command}`);
  assert.match(packageJson.scripts["db:local:reset"], /reset-local-development-database/u);
});

test("local setup explicitly creates isolated databases and mock-only provider settings", async () => {
  const setup = await source("packages/database/scripts/setup-local-postgres.mjs");
  assert.match(setup, /xiongzai_api_dev/u);
  assert.match(setup, /xiongzai_database_test/u);
  assert.match(setup, /PAYMENT_PROVIDER_MODE:\s*\(\)\s*=>\s*"mock"/u);
  assert.match(setup, /PAYOUT_PROVIDER_MODE:\s*\(\)\s*=>\s*"mock"/u);
  assert.match(setup, /SMS_PROVIDER_MODE:\s*\(\)\s*=>\s*"development"/u);
  assert.match(setup, /EVENT_PUBLISHER_MODE:\s*\(\)\s*=>\s*"log"/u);
});

test("local MinIO preparation defaults to loopback and only accepts an explicit private LAN host", async () => {
  const prepare = await source("apps/api/scripts/prepare-local-minio-env.mjs");
  assert.match(prepare, /LOCAL_LAN_HOST/u);
  assert.match(prepare, /validatePrivateLanHost/u);
  assert.match(prepare, /API_HOST:\s*lanHost\s*\?\s*"0\.0\.0\.0"\s*:\s*"127\.0\.0\.1"/u);
  assert.match(prepare, /FILE_STORAGE_ENDPOINT:\s*`http:\/\/\$\{storageHost\}:9000`/u);
  assert.match(prepare, /MINIO_CONSOLE_ADDRESS:\s*"127\.0\.0\.1:9001"/u);
});

test("manual test seed derives its migration expectation from the local migration manifest", async () => {
  const seed = await source("apps/api/scripts/seed-local-manual-test.mjs");
  assert.match(seed, /expectedMigrationCount/u);
  assert.match(seed, /packages\/database\/migrations/u);
  assert.doesNotMatch(seed, /migrations:\s*5\b/u);
});

test("local stack checks conflicts, orders services and owns process shutdown", async () => {
  const runner = await source("scripts/run-local-stack.mjs");
  const minio = runner.indexOf('start("minio"');
  const api = runner.indexOf('start("api"');
  const worker = runner.indexOf('start("worker"');
  const scheduler = runner.indexOf('start("scheduler"');
  const admin = runner.indexOf('start("admin"');
  assert.ok(minio >= 0 && minio < api && api < worker && worker < scheduler && scheduler < admin);
  for (const port of ["9000", "9001", "3002", "3001"]) assert.match(runner, new RegExp(port, "u"));
  assert.match(runner, /process\.kill\(-child\.pid, "SIGTERM"\)/u);
  assert.match(runner, /\.local", "logs/u);
});

test("the doctor reports only configuration key names and checks isolated local endpoints", async () => {
  const doctor = await source("scripts/local-test-doctor.mjs");
  assert.match(doctor, /TEST_DATABASE_URL/u);
  assert.match(doctor, /xiongzai_database_test/u);
  assert.match(doctor, /PAYMENT_PROVIDER_MODE/u);
  assert.match(doctor, /PAYOUT_PROVIDER_MODE/u);
  assert.match(doctor, /EXPO_PUBLIC_ENABLE_MOCK_PAYMENT/u);
  assert.match(doctor, /真机 API 与文件地址一致/u);
  assert.match(doctor, /storageEndpointHost === host/u);
  assert.doesNotMatch(doctor, /console\.log\([^\n]*(PASSWORD|SECRET|CODE)[^\n]*process\.env/iu);
});

test("development database cleanup is exact and requires an explicit confirmation flag", async () => {
  const reset = await source("packages/database/scripts/reset-local-development-database.mjs");
  assert.match(reset, /--confirm-local-dev-reset/u);
  assert.match(reset, /DROP DATABASE xiongzai_api_dev/u);
  assert.doesNotMatch(reset, /DROP DATABASE xiongzai_database_test/u);
  assert.doesNotMatch(reset, /DROP DATABASE\s+\$|DROP DATABASE.*config/u);
});
