import { router } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { BrandHeader } from "@/components/brand-header";
import { StateView } from "@/components/state-view";
import { EmptyBusinessTab } from "@/features/placeholder/empty-business-tab";
import { spacing } from "@/theme/tokens";

export function ProtectedEmptyTab({ title, mark, message, returnTo }: { title: string; mark: string; message: string; returnTo: string }) {
  const { status, user } = useAuth();
  if (status === "booting") return <AppScreen><BrandHeader subtitle={title} /><StateView kind="loading" /></AppScreen>;
  if (!user) return <AppScreen contentContainerStyle={{ paddingTop: spacing.md }}><BrandHeader subtitle={title} /><StateView kind="empty" title="登录后查看" message={`${title}属于账号数据`} actionLabel="去登录" onRetry={() => router.push({ pathname: "/(auth)/required", params: { returnTo, action: `查看${title}` } })} /></AppScreen>;
  return <EmptyBusinessTab title={title} mark={mark} message={message} />;
}
