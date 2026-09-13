export function resolveIosTransportSecurity(appEnvironment: "development" | "test" | "production") {
  const allowLocalDevelopmentHttp = appEnvironment !== "production";
  return {
    NSAllowsArbitraryLoads: allowLocalDevelopmentHttp,
    NSAllowsLocalNetworking: allowLocalDevelopmentHttp
  };
}
