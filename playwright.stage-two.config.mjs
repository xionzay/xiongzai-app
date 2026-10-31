import base from "./playwright.config.mjs";
process.env.STAGE_TWO_E2E = "1";
export default { ...base, testMatch: "**/*.stage-two.spec.mjs", timeout: 120_000 };
