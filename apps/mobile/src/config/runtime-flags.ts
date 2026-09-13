export type AppEnvironment = "development" | "test" | "production";

export interface RuntimeFlags {
  appEnvironment: AppEnvironment;
  enableMockPayment: boolean;
}

export function resolveRuntimeFlags(env: Record<string, string | undefined>): RuntimeFlags {
  const appEnvironment = parseAppEnvironment(env.EXPO_PUBLIC_APP_ENV);
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

export const runtimeFlags = resolveRuntimeFlags(process.env);
