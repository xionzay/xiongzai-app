import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
  try {
    await waitForHttp(`http://127.0.0.1:${port}/health/live`, child, output);
    const response = await fetch(`http://127.0.0.1:${port}/admin-api/v1/auth/session`);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
    assert.match(response.headers.get("x-request-id") ?? "", /^[A-Za-z0-9._:-]{8,128}$/u);
  } finally {
    child.kill("SIGTERM");
  }
  const result = await waitForExit(child);
  assert.equal(controlledExit(result), true, output.text());
  assert.equal(output.text().includes(marker), false);
  assert.doesNotMatch(output.text(), /postgres(?:ql)?:\/\//iu);
});

test("frontend production artifact serves /admin and shuts down cleanly", async () => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = capture(child);
  try {
    const response = await waitForHttp(`http://127.0.0.1:${port}/admin`, child, output);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /熊崽电竞|管理员/u);
  } finally {
    child.kill("SIGTERM");
  }
  const result = await waitForExit(child);
  assert.equal(controlledExit(result), true, output.text());
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
  const result = await waitForExit(child);
  assert.notEqual(result.code, 0);
  assert.match(output.text(), /ADMIN_TOKEN_SECRET|PAYMENT_PROVIDER_MODE/u);
  assert.equal(output.text().includes(marker), false);
  assert.doesNotMatch(output.text(), /postgres(?:ql)?:\/\//iu);
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

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("local artifact process did not stop")); }, timeoutMs);
    child.once("error", reject);
    child.once("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
  });
}

async function waitForHttp(url, child, output, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`local artifact exited before readiness\n${output.text()}`);
    try { return await fetch(url); }
    catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw lastError ?? new Error("local artifact did not become ready");
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
