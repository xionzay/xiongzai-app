export function resolveQueryOnlineState(input: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  appEnvironment: "development" | "test" | "production";
}): boolean {
  if (input.isConnected === false) return false;
  if (input.appEnvironment !== "production") return true;
  return input.isInternetReachable !== false;
}
