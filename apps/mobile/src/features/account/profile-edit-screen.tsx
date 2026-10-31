import { BrandBackdrop } from "@/components/brand-backdrop";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { profileEditSchema, type ProfileEditValues } from "@/features/account/account-domain";
import { colors } from "@/theme/tokens";
import { ShieldIcon } from "@/components/tab-icons";



export function ProfileEditScreen() {
  const { user, updateProfile, refreshUser } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<ProfileEditValues>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: { nickname: user?.profile?.nickname ?? "", bio: user?.profile?.bio ?? "" },
  });

  if (!user?.profile) return <AppScreen><PageHeader title="编辑个人资料" /><NoticeBanner tone="danger" message="个人资料尚未初始化" /></AppScreen>;

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    setNotice(null);
    try {
      await updateProfile({ nickname: values.nickname, bio: values.bio || null, avatarFileId: user.profile!.avatar_file_id, profileVersion: user.profile!.version, userVersion: user.version });
      router.back();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") {
        await refreshUser();
        setNotice("资料已被其他设备修改，已加载服务端最新版本。请返回后重新进入编辑，避免覆盖新数据。");
      } else {
        setNotice(error instanceof ApiClientError ? error.message : "资料保存失败");
      }
    } finally {
      setBusy(false);
    }
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <ProfileBackdrop />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
            <View style={styles.headerCopy}><Text style={styles.pageTitle}>编辑个人资料</Text><Text style={styles.pageSubtitle}>公开资料将在陪玩和聊天中展示</Text></View>
          </View>

          {notice ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}

          <Pressable accessibilityRole="button" accessibilityLabel="更换当前头像" onPress={() => router.push("/settings/media-avatar")} style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
            <FileImage fileId={user.profile.avatar_file_id} style={styles.avatar} label="当前头像" />
            <Text style={styles.changeBadge}>更换</Text>
          </Pressable>
          <Text style={styles.avatarHint}>支持 JPG、PNG，建议使用清晰头像</Text>

          <View style={styles.formCard}>
            <View style={styles.nicknameRow}>
              <View style={styles.fieldCopy}><Text style={styles.fieldLabel}>昵称</Text><Text style={styles.fieldHint}>2–16 个字符</Text></View>
              <Controller control={control} name="nickname" render={({ field }) => <TextInput accessibilityLabel="昵称" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} maxLength={16} autoCapitalize="none" placeholder="请输入昵称" placeholderTextColor="#AAA49A" style={[styles.nicknameInput, errors.nickname && styles.inputError]} />} />
            </View>
            {errors.nickname ? <Text accessibilityRole="alert" style={styles.fieldError}>{errors.nickname.message}</Text> : null}
            <View style={styles.divider} />
            <Pressable accessibilityRole="button" accessibilityLabel="手机号与实名认证" onPress={() => router.push("/settings/identity")} style={({ pressed }) => [styles.phoneRow, pressed && styles.pressed]}>
              <View style={styles.fieldCopy}><Text style={styles.fieldLabel}>手机号码</Text><Text style={styles.fieldHint}>用于登录与交易安全</Text></View>
              <Text style={styles.phoneValue}>{user.phone_mask}</Text><ChevronRightIcon size={20} />
            </Pressable>
          </View>

          <View style={styles.safetyCard}>
            <View style={styles.shield}><ShieldIcon size={29} /></View>
            <View style={styles.safetyCopy}><Text style={styles.safetyTitle}>资料安全</Text><Text style={styles.safetyText}>手机号码不会公开展示；昵称与头像需通过内容安全检查。</Text></View>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="保存资料" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.save, busy && styles.disabled, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>保存资料</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProfileBackdrop() { return <BrandBackdrop />; }

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  keyboard: { flex: 1 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingBottom: 4, height: undefined },
  back: { alignItems: "center", justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { marginLeft: 0, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  notice: { marginBottom: 12, padding: 11, borderWidth: 1, borderColor: "#F2A18A", borderRadius: 13, backgroundColor: "#FFF5F1" },
  noticeText: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  avatarButton: { position: "relative", alignSelf: "center", marginTop: 12 },
  avatar: { width: 88, height: 88, borderWidth: 4, borderColor: colors.white, borderRadius: 44, ...softShadow },
  changeBadge: { position: "absolute", right: -11, bottom: 5, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.lime, color: "#40500A", fontSize: 12, fontWeight: "900" },
  avatarHint: { marginTop: 13, marginBottom: 27, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  formCard: { paddingHorizontal: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  nicknameRow: { minHeight: 86, flexDirection: "row", alignItems: "center", gap: 12 },
  phoneRow: { minHeight: 86, flexDirection: "row", alignItems: "center", gap: 12 },
  fieldCopy: { width: 118 },
  fieldLabel: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  fieldHint: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  nicknameInput: { flex: 1, height: 48, paddingHorizontal: 12, borderWidth: 1, color: colors.text, backgroundColor: colors.input, borderColor: colors.controlBorder, borderRadius: 10, fontSize: 16, minHeight: 48, shadowOpacity: 0, elevation: 0 },
  inputError: { borderColor: colors.danger },
  fieldError: { marginTop: -10, marginBottom: 10, marginLeft: 130, color: colors.danger, fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(62,57,47,0.12)" },
  phoneValue: { flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: "700", textAlign: "right" },
  safetyCard: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.95)", ...softShadow },
  shield: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.12)", borderRadius: 13, backgroundColor: "#F5F1EA" },
  safetyCopy: { flex: 1 },
  safetyTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  safetyText: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  save: { height: 54, alignItems: "center", justifyContent: "center", marginTop: 17, borderRadius: 15, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.20, shadowRadius: 15, elevation: 5 },
  saveText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
});
