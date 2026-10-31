import { BrandBackdrop } from "@/components/brand-backdrop";
import { useState } from "react";
import { ChevronRightIcon } from "@/components/ui-icons";
import { NativeHeader } from "@/components/native-page";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { colors } from "@/theme/tokens";


export function SettingsScreen() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const signOut = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await logout();
      router.replace("/(auth)/login");
    } catch (error) {
      setNotice(userFacingError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <BrandBackdrop seller={role === 'seller'} />
      <NativeHeader title="设置" subtitle="" />
      <ScrollView
        contentContainerStyle={styles.content}
      >
        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}

        <View style={styles.menuCard}>
          <SettingsMenuRow label="个人资料" note="头像、昵称、手机号" onPress={() => router.push("/settings/profile")} />
          <SettingsMenuRow label="隐私与安全" note="手机号、实名认证、隐私设置" onPress={() => router.push("/settings/security")} />
          <SettingsMenuRow label="协议与隐私中心" note="协议、隐私清单、权限和接受记录" onPress={() => router.push("/rules")} />
          <SettingsMenuRow label="平台规则" note="交易、退款与评价规范" onPress={() => router.push("/rules")} />
          <SettingsMenuRow label="切换身份" value={role === 'seller' ? '卖家' : '买家'} onPress={() => router.push({ pathname: '/settings/switch-identity', params: { role: role === 'seller' ? 'seller' : 'buyer' } })} />
          <SettingsMenuRow label={busy ? "正在退出…" : "退出登录"} danger last disabled={busy} onPress={() => Alert.alert("退出登录", "将清理本机认证状态和未发送消息，确认退出吗？", [
            { text: "取消", style: "cancel" },
            { text: "确认退出", style: "destructive", onPress: () => void signOut() }
          ])} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsMenuRow({ label, note, value, onPress, danger = false, disabled = false, last = false }: {
  label: string;
  note?: string;
  value?: string;
  onPress(): void;
  danger?: boolean;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[label, note, value].filter(Boolean).join("，")} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.menuRow, !last && styles.menuBorder, disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuLabel, danger && styles.dangerLabel]}>{label}</Text>
        {note ? <Text style={styles.menuNote}>{note}</Text> : null}
      </View>
      {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      <ChevronRightIcon size={20} />
    </Pressable>
  );
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingBottom: 4, height: undefined },
  back: { alignItems: "center", justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { flex: 1, marginLeft: 0, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  notice: { marginBottom: 10, padding: 12, borderWidth: 1, borderColor: "rgba(229,72,77,0.22)", borderRadius: 14, backgroundColor: "rgba(255,240,232,0.94)" },
  noticeText: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  sellerCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  sellerCopy: { flex: 1, alignItems: "flex-start" },
  eyebrow: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 1.2 },
  sellerTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  sellerDescription: { maxWidth: 238, marginTop: 9, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  sellerStatus: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  statusDanger: { color: colors.danger },
  sellerAction: { minHeight: 44, justifyContent: "center", marginTop: 13, paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.lime },
  sellerActionText: { color: "#314300", fontSize: 12, lineHeight: 16, fontWeight: "800" },
  sellerImage: { width: 36, height: 36, resizeMode: "contain" },
  menuCard: { paddingHorizontal: 0, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  menuRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 9 },
  menuBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  menuCopy: { flex: 1 },
  menuLabel: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  dangerLabel: { color: colors.text },
  menuNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  menuValue: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  arrow: { color: colors.textSecondary, fontSize: 24, lineHeight: 28 },
  disabled: { opacity: 0.46 },
  pressed: { opacity: 0.72 }
});
