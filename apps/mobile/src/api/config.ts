export interface ApiEnvironmentInput {
  configuredUrl?: string;
  appEnvironment: "development" | "test" | "production";
  platform: "ios" | "android" | "other";
  isPhysicalDevice?: boolean;
  androidUsbReverse?: string;
}

export function resolveApiBaseUrl(input: ApiEnvironmentInput): string {
  const configured = input.configuredUrl?.trim().replace(/\/$/u, "");
  const configuredAddress = configured ? parseApiUrl(configured) : undefined;
  if (input.androidUsbReverse !== undefined && !["", "false", "true"].includes(input.androidUsbReverse)) {
    throw new Error("EXPO_PUBLIC_ANDROID_USB_REVERSE 配置无效");
  }
  const usbReverse = input.androidUsbReverse === "true";
  // Explicit test-only ADB reverse transport. Never relax normal device or release rules.
  if (usbReverse && (input.appEnvironment !== "test" || input.platform !== "android"
    || input.isPhysicalDevice !== true || !configuredAddress
    || configuredAddress.protocol !== "http:" || configuredAddress.hostname !== "127.0.0.1"
    || Number(configuredAddress.port) < 1024 || configuredAddress.port === "3002"
    || configuredAddress.pathname !== "/api/v1")) {
    throw new Error("USB 调试连接仅允许 Android test 真机显式配置 127.0.0.1 的独立测试端口 /api/v1");
  }
  const fallback = input.platform === "android"
    ? "http://10.0.2.2:3002/api/v1"
    : "http://127.0.0.1:3002/api/v1";
  const useSimulatorLoopback = input.appEnvironment !== "production"
    && input.isPhysicalDevice === false
    && (input.platform === "ios" || input.platform === "android");
  if (input.isPhysicalDevice === true && !configured) {
    throw new Error("实体手机测试缺少 EXPO_PUBLIC_API_BASE_URL，请配置开发电脑的私有局域网 API 地址");
  }
  // Dedicated isolated acceptance servers must not silently hit shared :3002.
  // Keep the stale LAN-address fallback, and permit explicit local test ports only.
  const isolatedSimulatorAddress = useSimulatorLoopback && input.appEnvironment === "test"
    && configuredAddress && /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10\.0\.2\.2)$/u.test(configuredAddress.hostname);
  const url = useSimulatorLoopback && !isolatedSimulatorAddress ? fallback : configured || fallback;
  const parsed = parseApiUrl(url);
  if (input.isPhysicalDevice === true && !usbReverse && /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10\.0\.2\.2)$/u.test(parsed.hostname)) {
    throw new Error("实体手机不能使用回环或模拟器地址，请配置开发电脑的私有局域网 API 地址");
  }

  if (input.appEnvironment === "production" && !url.startsWith("https://")) {
    throw new Error("生产 App 只允许访问 HTTPS API");
  }
  return url;
}

function parseApiUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("EXPO_PUBLIC_API_BASE_URL 配置无效"); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !["http:", "https:"].includes(parsed.protocol)) throw new Error("EXPO_PUBLIC_API_BASE_URL 配置无效");
  return parsed;
}
