import { defineConfig } from "@playwright/test";

const frontendPort = Number(process.env.ADMIN_E2E_FRONTEND_PORT ?? "3101");
if (!Number.isSafeInteger(frontendPort) || frontendPort < 1024 || frontendPort > 65_535) throw new Error("ADMIN_E2E_FRONTEND_PORT is invalid");
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
process.env.ADMIN_E2E_FRONTEND_ORIGIN = frontendOrigin;
const frontendCommand = `${JSON.stringify(process.execPath)} node_modules/vinext/dist/cli.js start --hostname 127.0.0.1 --port ${frontendPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  globalSetup: "./tests/browser/global-setup.mjs",
  outputDir: "test-results/admin-browser",
  reporter: [["line"]],
  use: {
    baseURL: frontendOrigin,
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command: frontendCommand,
    url: `${frontendOrigin}/admin`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
