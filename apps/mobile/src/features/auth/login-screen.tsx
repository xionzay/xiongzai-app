import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { loginFormSchema, phoneSchema, type LoginFormValues } from "@/auth/validation";
import { AppScreen } from "@/components/app-screen";
import { FormField } from "@/components/form-field";
import { PaperCard, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { PrimaryButton } from "@/components/primary-button";
import { PolicyConsentCheckbox } from "@/components/policy-consent-checkbox";
import { verificationRequestMessage } from "@/auth/auth-copy";
import { runtimeFlags } from "@/config/runtime-flags";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import xiongzaiLogo from "../../../assets/xiongzai-logo.png";
import { resolveInternalReturnTo } from "@/auth/return-to";
import { usePolicies } from "@/features/account/account-api";

export function LoginScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const destination = resolveInternalReturnTo(returnTo);
  const { status, user, sendSms, login, bootstrapError } = useAuth();
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [notice, setNotice] = useState<string | null>(bootstrapError);
  const [noticeTone, setNoticeTone] = useState<"danger" | "success">("danger");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [acceptedPolicyIds, setAcceptedPolicyIds] = useState<string[]>([]);
  const policies = usePolicies("LOGIN");
  const { control, handleSubmit, getValues, setError, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { phone: "", code: "" }
  });

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    router.replace(user.profile_initialized ? destination : { pathname: "/(auth)/profile-setup", params: { returnTo: destination } });
  }, [destination, status, user]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const requestCode = async () => {
    const parsed = phoneSchema.safeParse(getValues("phone"));
    if (!parsed.success) {
      setError("phone", { message: parsed.error.issues[0]?.message ?? "请输入正确手机号" });
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      await sendSms(parsed.data);
      setCountdown(60);
      setNoticeTone("success");
      setNotice(verificationRequestMessage(runtimeFlags.appEnvironment));
    } catch (error) {
      setNoticeTone("danger");
      setNotice(userFacingError(error));
    } finally {
      setSending(false);
    }
  };

  const submit = handleSubmit(async (values) => {
    if (!policies.data?.length) { setNoticeTone("danger"); setNotice("当前无法获取已发布协议，请稍后重试"); return; }
    if (policies.data.some((policy) => !acceptedPolicyIds.includes(policy.id))) { setNoticeTone("danger"); setNotice("请逐份阅读并确认当前登录场景要求的协议"); return; }
    setSubmitting(true);
    setNotice(null);
    try {
      const currentUser = await login(values.phone, values.code, policies.data.map((item) => item.id));
      router.replace(currentUser.profile_initialized ? destination : { pathname: "/(auth)/profile-setup", params: { returnTo: destination } });
    } catch (error) {
      setNoticeTone("danger");
      setNotice(userFacingError(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <AppScreen contentContainerStyle={styles.content}>
      <PageHeader title="欢迎来到熊崽电竞" />
      <Text style={styles.subtitle}>登录后即可下单、聊天并管理服务</Text>
      <View style={styles.brandBlock}>
        <Image source={xiongzaiLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.slogan}>找陪玩 · 选服务 · 安心下单</Text>
      </View>
      <PaperCard style={styles.formCard}>
        <View style={styles.tabs}>
          {(["login", "register"] as const).map((item) => {
            const selected = mode === item;
            return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setMode(item)} style={[styles.tab, selected && styles.tabActive]}><Text style={[styles.tabText, selected && styles.tabTextActive]}>{item === "login" ? "登录" : "注册"}</Text></Pressable>;
          })}
        </View>
      {notice ? <NoticeBanner message={notice} tone={noticeTone} /> : null}
      <View style={styles.phoneRow}>
        <View style={styles.countryCode}><Text style={styles.countryCodeText}>+86</Text></View>
        <View style={styles.phoneField}><Controller control={control} name="phone" render={({ field: { onChange, onBlur, value } }) => <FormField label="手机号" placeholder="请输入 11 位手机号" keyboardType="phone-pad" maxLength={11} autoComplete="tel" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.phone?.message} />} /></View>
      </View>
      <View style={styles.codeRow}>
        <View style={styles.codeField}>
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField label="短信验证码" placeholder="6 位验证码" keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.code?.message} />
            )}
          />
        </View>
        <View style={[styles.codeButton, errors.code?.message ? styles.codeButtonWithError : null]}>
          <PrimaryButton tone="plain" label={countdown > 0 ? `${countdown}s` : "获取验证码"} loading={sending} disabled={countdown > 0} onPress={() => void requestCode()} />
        </View>
      </View>
      <View style={styles.agreementList}>
        <Text style={styles.agreementText}>请逐份阅读并在线确认当前版本：</Text>
        {policies.isPending ? <Text style={styles.agreementText}>正在加载协议…</Text> : policies.isError || !policies.data?.length ? <Pressable accessibilityRole="button" accessibilityLabel="重试加载登录协议" onPress={() => void policies.refetch()} style={styles.policyLinkTarget}><Text style={styles.policyError}>协议加载失败，点击重试</Text></Pressable> : policies.data.map((policy) => { const checked = acceptedPolicyIds.includes(policy.id); return <View key={policy.id} style={styles.policyRow}><PolicyConsentCheckbox label={`同意${policy.title}V${policy.version_no}`} checked={checked} disabled={submitting} onPress={() => setAcceptedPolicyIds((current) => checked ? current.filter((id) => id !== policy.id) : [...current, policy.id])} /><Pressable accessibilityRole="link" accessibilityLabel={`查看${policy.title}V${policy.version_no}`} style={styles.policyLinkTarget} onPress={() => router.push({ pathname: "/policies/[id]", params: { id: policy.id } })}><Text style={styles.policyLink}>《{policy.title}》V{policy.version_no}</Text></Pressable></View>; })}
      </View>
      <PrimaryButton label="登录 / 注册" loading={submitting} disabled={policies.isPending || policies.isError || !policies.data?.length} onPress={() => void submit()} />
      </PaperCard>
      <Pressable accessibilityRole="button" accessibilityLabel="先逛逛，稍后登录" onPress={() => router.replace("/(buyer-tabs)")} style={styles.guest}><Text style={styles.guestText}>先逛逛，稍后登录</Text></Pressable>
      <Text style={styles.security}>登录凭证使用系统安全存储。开发模拟器不可用时仅暂存进程内存，重载后需重新登录。</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: -20, marginLeft: 56 },
  brandBlock: { alignItems: "center", gap: 2, marginVertical: 8 },
  logo: { width: 176, height: 94 },
  slogan: { ...typography.caption, color: colors.brandDeep, fontWeight: "800" },
  formCard: { gap: spacing.md, padding: spacing.lg, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  tabs: { flexDirection: "row", padding: 4, backgroundColor: "transparent", borderRadius: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, height: undefined, minHeight: 48 },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.sm },
  tabActive: { ...nativeShadow, backgroundColor: "transparent", borderRadius: 0, borderBottomWidth: 2, borderBottomColor: colors.brandDeep, shadowOpacity: 0, elevation: 0 },
  tabText: { ...typography.body, color: colors.textSecondary, fontWeight: "800" },
  tabTextActive: { color: colors.brandDeep },
  phoneRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  countryCode: { width: 64, height: 48, alignItems: "center", justifyContent: "center", marginBottom: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceCard },
  countryCodeText: { ...typography.body, color: colors.text, fontWeight: "800" },
  phoneField: { flex: 1 },
  codeRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  codeField: { flex: 1 },
  codeButton: { width: 122 },
  codeButtonWithError: { paddingBottom: 21 },
  agreementList: { gap: spacing.sm },
  policyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  policyLinkTarget: { flex: 1, minWidth: 48, minHeight: 48, justifyContent: "center", paddingVertical: spacing.xs },
  agreementText: { ...typography.caption, flex: 1, color: colors.textSecondary },
  policyLink: { ...typography.caption, color: colors.brand, fontWeight: "700" },
  policyError: { ...typography.caption, color: colors.danger, fontWeight: "700" },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, marginLeft: 29 },
  guest: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  guestText: { ...typography.body, color: colors.brand, fontWeight: "900" },
  security: { ...typography.caption, color: colors.textSecondary, textAlign: "center", paddingHorizontal: spacing.md }
});
