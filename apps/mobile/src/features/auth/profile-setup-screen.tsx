import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Image, Pressable, StyleSheet, Text } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { profileFormSchema, type ProfileFormValues } from "@/auth/validation";
import { AppScreen } from "@/components/app-screen";
import { FormField } from "@/components/form-field";
import { PaperCard } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { PrimaryButton } from "@/components/primary-button";
import { colors, spacing, typography } from "@/theme/tokens";
import xiongzaiIcon from "../../../assets/xiongzai-icon.png";
import { resolveInternalReturnTo } from "@/auth/return-to";

export function ProfileSetupScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const destination = resolveInternalReturnTo(returnTo);
  const { status, user, completeProfile, logout } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { nickname: user?.profile?.nickname ?? "" }
  });
  const nickname = useWatch({ control, name: "nickname" }) ?? "";

  if (status === "booting") return <Redirect href="/" />;
  if (status === "anonymous" || !user) return <Redirect href="/(auth)/login" />;
  if (user.profile_initialized) return <Redirect href={destination} />;

  const submit = handleSubmit(async ({ nickname }) => {
    setSubmitting(true);
    setMessage(null);
    try {
      await completeProfile(nickname);
      router.replace(destination);
    } catch (error) {
      setMessage(userFacingError(error));
    } finally {
      setSubmitting(false);
    }
  });

  const leave = async () => {
    setSubmitting(true);
    try {
      await logout();
      router.replace("/(auth)/login");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen contentContainerStyle={styles.content}>
      <PageHeader title="完善个人资料" />
      <Text style={styles.subtitle}>设置头像和昵称，方便大家认识你</Text>
      {message ? <NoticeBanner message={message} tone="danger" /> : null}
      <PaperCard style={styles.avatarCard}>
        <Image source={xiongzaiIcon} style={styles.avatar} />
        <Pressable accessibilityRole="button" accessibilityLabel="更换头像" onPress={() => setMessage("完成资料后，可在“我的－编辑个人资料”中更换头像。") } style={styles.changeAvatar}><Text style={styles.changeAvatarText}>更换头像</Text></Pressable>
        <Text style={styles.avatarNote}>建议使用清晰头像；请勿展示手机号、二维码或其他联系方式。</Text>
      </PaperCard>
      <PaperCard style={styles.formCard}>
      <Controller
        control={control}
        name="nickname"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormField label="昵称" placeholder="2–16 个字符" maxLength={16} onBlur={onBlur} onChangeText={onChange} value={value} error={errors.nickname?.message} />
        )}
      />
      <Text style={styles.counter}>{nickname.length}/16 · 请勿填写手机号或联系方式</Text>
      </PaperCard>
      <PaperCard style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>隐私保护</Text>
        <Text style={styles.privacyText}>你的手机号不会公开展示，平台仅使用昵称和头像向其他用户呈现身份。</Text>
      </PaperCard>
      <PrimaryButton label="完成并进入首页" loading={submitting} onPress={() => void submit()} />
      <PrimaryButton label="退出当前账号" tone="plain" disabled={submitting} onPress={() => void leave()} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: -20, marginLeft: 56 },
  avatarCard: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  avatar: { width: 96, height: 96, borderRadius: 28 },
  changeAvatar: { minHeight: 44, minWidth: 112, alignItems: "center", justifyContent: "center" },
  changeAvatarText: { ...typography.body, color: colors.brand, fontWeight: "900" },
  avatarNote: { ...typography.caption, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  formCard: { padding: spacing.lg },
  counter: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, textAlign: "right" },
  privacyCard: { gap: spacing.xs, padding: spacing.lg, backgroundColor: "#FFF2CF" },
  privacyTitle: { ...typography.cardTitle, color: colors.text },
  privacyText: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 }
});
