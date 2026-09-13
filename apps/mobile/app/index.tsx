import { Redirect } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { resolveInitialRoute } from "@/auth/route-guard";
import { SplashScreen } from "@/features/splash/splash-screen";

export default function IndexRoute() {
  const { status, user, bootstrapError, retryBootstrap } = useAuth();
  const route = resolveInitialRoute(status, user);
  if (route === "/") return <SplashScreen error={bootstrapError} onRetry={() => void retryBootstrap()} />;
  return <Redirect href={route} />;
}
