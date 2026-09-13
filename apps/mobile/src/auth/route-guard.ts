import type { Viewer } from "@/types/api";

export type AuthStatus = "booting" | "anonymous" | "authenticated";
export type InitialRoute = "/" | "/(auth)/login" | "/(auth)/profile-setup" | "/(buyer-tabs)";

export function resolveInitialRoute(status: AuthStatus, user: Viewer | null): InitialRoute {
  if (status === "booting") return "/";
  if (status === "anonymous" || !user) return "/(buyer-tabs)";
  return user.profile_initialized ? "/(buyer-tabs)" : "/(auth)/profile-setup";
}
