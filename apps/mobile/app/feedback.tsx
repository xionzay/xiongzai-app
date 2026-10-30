import { useAuth } from "@/auth/auth-provider";
import { NativePage } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { FeedbackScreen } from "@/features/community/feedback-screen";
import { router, useLocalSearchParams } from "expo-router";

export default function FeedbackRoute() {
  const { status, user, bootstrapError, retryBootstrap } = useAuth();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  if (status !== "authenticated" || !user) return <NativePage title="意见反馈" subtitle="官方留言与回复">
    <NoticeBanner message={status === "booting" ? (bootstrapError ? "登录状态恢复失败，请重试。" : "正在恢复登录状态…") : "登录后可以提交建议并查看自己的反馈与回复。"} />
    {bootstrapError ? <PrimaryButton label="重试登录恢复" onPress={() => void retryBootstrap()} /> : status !== "booting" ? <PrimaryButton label="去登录" onPress={() => router.push({ pathname: "/(auth)/required", params: { returnTo: id ? `/feedback?id=${encodeURIComponent(id)}` : "/feedback", action: "意见反馈" } })} /> : null}
  </NativePage>;
  return <FeedbackScreen key={user.id} userId={user.id} selectedId={id} />;
}
