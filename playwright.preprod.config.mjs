import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.mjs";

const productionFrontendPort = 3001;
const productionFrontendOrigin = `http://127.0.0.1:${productionFrontendPort}`;
const productionFrontendCommand = `${JSON.stringify(process.execPath)} node_modules/vinext/dist/cli.js start --hostname 127.0.0.1 --port ${productionFrontendPort}`;
process.env.ADMIN_E2E_FRONTEND_ORIGIN = productionFrontendOrigin;

export default defineConfig({
  ...baseConfig,
  outputDir: "test-results/admin-browser-production",
  use: {
    ...baseConfig.use,
    baseURL: productionFrontendOrigin,
  },
  webServer: {
    ...baseConfig.webServer,
    command: productionFrontendCommand,
    url: `${productionFrontendOrigin}/admin`,
    reuseExistingServer: false,
  },
});
