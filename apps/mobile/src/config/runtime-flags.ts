export type AppEnvironment = "development" | "test" | "production";

export interface RuntimeFlags {
  appEnvironment: AppEnvironment;
  enableMockPayment: boolean;
}

export function resolveRuntimeFlags(env: Record<string, string | undefined>): RuntimeFlags {
  const configuredEnvironment = parseAppEnvironment(env.EXPO_PUBLIC_APP_ENV);
  const releaseBuild = env.NODE_ENV === "production" || env.EAS_BUILD_PROFILE === "production";
  const appEnvironment = releaseBuild && configuredEnvironment !== "test" ? "production" : configuredEnvironment;
  const mockPaymentRequested = env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENT === "true";

  if (appEnvironment === "production" && mockPaymentRequested) {
    throw new Error("生产构建禁止启用 Mock Payment Provider");
  }

  return {
    appEnvironment,
    enableMockPayment: appEnvironment !== "production" && mockPaymentRequested
  };
}

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  if (value === undefined || value === "") return "development";
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error(`EXPO_PUBLIC_APP_ENV 配置无效：${value}`);
}

// Expo only tracks/inlines public variables referenced with static dot notation.
// Passing the whole process.env object loses these values on a native device.
export const runtimeFlags = resolveRuntimeFlags({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_ENABLE_MOCK_PAYMENT: process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENT,
  NODE_ENV: process.env.NODE_ENV,
  EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE
});
