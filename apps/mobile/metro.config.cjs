const { createHash } = require("node:crypto");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = require("node:path").dirname(require.resolve("./package.json"));
const config = getDefaultConfig(projectRoot);
// Concurrent local Metros must not share transformed virtual environment modules.
// Only public build configuration is hashed; no secrets or credentials belong here.
const environmentScope = createHash("sha256").update(JSON.stringify([
  process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENT ?? "false",
  process.env.EXPO_PUBLIC_ANDROID_USB_REVERSE ?? "false",
  process.env.EXPO_NO_DOTENV ?? "0"
])).digest("hex").slice(0, 24);
config.cacheVersion = `${config.cacheVersion ?? ""}:xiongzai-env-${environmentScope}`;
// SDK 57's dev virtual env module independently imports .env files via
// require.context, even when CLI dotenv loading is disabled. Honor the explicit
// no-dotenv option at resolution too; never edit/rename the user's .env.local.
if (process.env.EXPO_NO_DOTENV === "1") {
  const previous = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
    /[/\\]\.env(?:\.[^/\\]*)?$/
  ];
}

module.exports = config;
