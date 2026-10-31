import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { observeProcessExit, stopTestProcess, waitForLocalHttp, waitForTestExit } from "../scripts/production-test-process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("API production artifact starts, rejects anonymous admin access and shuts down cleanly", async () => {
  assert.ok(process.env.TEST_DATABASE_URL, "缺少配置键：TEST_DATABASE_URL");
  const port = await availablePort();
  const marker = randomBytes(24).toString("base64url");
  const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
    cwd: root,
    env: runtimeEnvironment(port, marker),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = capture(child);
  const exited = observeProcessExit(child);
  try {
    const live = await waitForLocalHttp(`http://127.0.0.1:${port}/health/live`, child);
    assert.equal(live.status, 200); await live.body?.cancel();
    const response = await fetch(`http://127.0.0.1:${port}/admin-api/v1/auth/session`);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
    assert.match(response.headers.get("x-request-id") ?? "", /^[A-Za-z0-9._:-]{8,128}$/u);
  } finally {
    const result = await stopTestProcess(child, exited);
    assert.equal(controlledExit(result), true, "API artifact must stop cleanly");
  }
  assert.equal(output.text().includes(marker), false);
  assert.equal(/postgres(?:ql)?:\/\//iu.test(output.text()), false, "API logs must not expose a database URL");
});

test("frontend production artifact serves /admin and shuts down cleanly", async () => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = capture(child);
  const exited = observeProcessExit(child);
  try {
    const response = await waitForLocalHttp(`http://127.0.0.1:${port}/admin`, child);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /熊崽电竞|管理员/u);
  } finally {
    const result = await stopTestProcess(child, exited);
    assert.equal(controlledExit(result), true, "frontend artifact must stop cleanly");
  }
  assert.equal(/postgres(?:ql)?:\/\//iu.test(output.text()), false, "frontend logs must not expose a database URL");
});

test("protected API startup fails non-zero with key-only diagnostics", async () => {
  const port = await availablePort();
  const marker = `never-print-${randomBytes(18).toString("base64url")}`;
  const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
    cwd: root,
    env: {
      ...runtimeEnvironment(port, marker),
      DEPLOYMENT_ENV: "staging",
      DATABASE_URL: `postgresql://service:${marker}@database.staging.internal:5432/xiongzai`,
      ADMIN_TOKEN_SECRET: "",
      PAYMENT_PROVIDER_MODE: "mock",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = capture(child);
  const exited = observeProcessExit(child);
  let result;
  try { result = await waitForTestExit(child, exited); }
  finally { await stopTestProcess(child, exited); }
  assert.notEqual(result.code, 0);
  assert.equal(/ADMIN_TOKEN_SECRET|PAYMENT_PROVIDER_MODE/u.test(output.text()), true, "protected startup must report configuration key names");
  assert.equal(output.text().includes(marker), false);
  assert.equal(/postgres(?:ql)?:\/\//iu.test(output.text()), false, "protected startup logs must not expose a database URL");
});

function runtimeEnvironment(port, marker) {
  const secret = () => `${marker}-${randomBytes(32).toString("base64url")}`;
  return {
    ...process.env,
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    API_HOST: "127.0.0.1",
    API_PORT: String(port),
    USER_TOKEN_SECRET: secret(),
    ADMIN_TOKEN_SECRET: secret(),
    INTERNAL_TOKEN_SECRET: secret(),
    CURSOR_SIGNING_SECRET: secret(),
    PII_ENCRYPTION_KEY: secret(),
    PII_HMAC_KEY: secret(),
    AUTH_HMAC_KEY: secret(),
    PAYMENT_WEBHOOK_SECRET: secret(),
    PAYOUT_WEBHOOK_SECRET: secret(),
    SMS_PROVIDER_MODE: "development",
    PAYMENT_PROVIDER_MODE: "mock",
    PAYOUT_PROVIDER_MODE: "mock",
    API_CORS_ORIGINS: "http://127.0.0.1:3001",
    FILE_STORAGE_PROVIDER: "disabled",
  };
}

function capture(child) {
  let value = "";
  child.stdout.on("data", (chunk) => { value += chunk.toString(); });
  child.stderr.on("data", (chunk) => { value += chunk.toString(); });
  return { text: () => value };
}

function controlledExit(result) {
  return result.code === 0 || (result.code === null && result.signal === "SIGTERM");
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("could not allocate a loopback port")); return; }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
