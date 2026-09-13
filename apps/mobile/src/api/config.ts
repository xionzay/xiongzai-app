export interface ApiEnvironmentInput {
  configuredUrl?: string;
  appEnvironment: "development" | "test" | "production";
  platform: "ios" | "android" | "other";
  isPhysicalDevice?: boolean;
}

export function resolveApiBaseUrl(input: ApiEnvironmentInput): string {
  const configured = input.configuredUrl?.trim().replace(/\/$/u, "");
  const fallback = input.platform === "android"
    ? "http://10.0.2.2:3002/api/v1"
    : "http://127.0.0.1:3002/api/v1";
  const useSimulatorLoopback = input.appEnvironment !== "production"
    && input.isPhysicalDevice === false
    && (input.platform === "ios" || input.platform === "android");
  if (input.isPhysicalDevice === true && !configured) {
    throw new Error("实体手机测试缺少 EXPO_PUBLIC_API_BASE_URL，请配置开发电脑的私有局域网 API 地址");
  }
  const url = useSimulatorLoopback ? fallback : configured || fallback;

  if (input.appEnvironment === "production" && !url.startsWith("https://")) {
    throw new Error("生产 App 只允许访问 HTTPS API");
  }
  return url;
}
