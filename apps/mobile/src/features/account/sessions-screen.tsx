import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { NativeButton, NativePage, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { revokeSession, useSessions } from "@/features/account/account-api";
import { colors } from "@/theme/tokens";
import type { SessionApiView } from "@/types/api";

export function SessionsScreen() {
  const query = useSessions();
  const { clearRevokedSession } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const remove = async (item: SessionApiView) => {
    setBusy(item.id);
    setNotice(null);
    try {
      await revokeSession(item.id);
      if (item.current) {
        await clearRevokedSession();
        router.replace("/(auth)/login");
      } else {
        await query.refetch();
      }
    } catch {
      setNotice("设备撤销失败，请刷新后重试。");
    } finally {
      setBusy(null);
    }
  };

  return (
    <NativePage title="登录设备" subtitle="查看并管理账号登录状态" contentStyle={styles.content} refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>设备安全</Text>
        <Text style={styles.heroText}>只保留你认识的设备；撤销当前设备后将立即退出登录。</Text>
      </View>
      {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      {query.isPending ? <View style={styles.state}><StateView kind="loading" /></View> : null}
      {query.isError || (!query.isPending && !query.data) ? <View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View> : null}
      {query.data?.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.top}>
            <View style={styles.deviceIcon}><Text style={styles.deviceMark}>{item.device_type === "IOS" ? "苹" : item.device_type === "ANDROID" ? "安" : "网"}</Text></View>
            <View style={styles.deviceCopy}>
              <Text style={styles.title}>{deviceName(item.device_type)}{item.current ? "（当前设备）" : ""}</Text>
              <Text style={styles.meta}>设备标识 {item.device_id_mask}</Text>
              <Text style={styles.meta}>最后活动 {new Date(item.last_used_at).toLocaleString("zh-CN")}</Text>
            </View>
            <Text style={[styles.stateText, Boolean(item.revoked_at) && styles.inactive]}>{sessionState(item)}</Text>
          </View>
          {!item.revoked_at ? (
            <NativeButton
              tone="secondary"
              label={item.current ? "撤销当前设备并退出" : "撤销此设备"}
              disabled={busy !== null}
              onPress={() => Alert.alert(
                item.current ? "撤销当前设备" : "撤销设备",
                item.current ? "撤销后将立即清理本机认证状态并返回登录页。" : "该设备将无法继续刷新登录状态。",
                [
                  { text: "取消", style: "cancel" },
                  { text: "确认撤销", style: "destructive", onPress: () => void remove(item) }
                ]
              )}
            />
          ) : null}
        </View>
      ))}
    </NativePage>
  );
}

function deviceName(type: SessionApiView["device_type"]) {
  if (type === "IOS") return "iPhone / iPad";
  if (type === "ANDROID") return "Android 设备";
  return "网页设备";
}

function sessionState(item: SessionApiView) {
  if (item.revoked_at) return "已撤销";
  if (new Date(item.expires_at) <= new Date()) return "已过期";
  return "有效";
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  hero: { padding: 17, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: 18, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow },
  heroTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  heroText: { marginTop: 6, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  card: { gap: 13, padding: 15, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  deviceIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#EAF6FF" },
  deviceMark: { color: colors.brandDeep, fontSize: 15, fontWeight: "900" },
  deviceCopy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  meta: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  stateText: { color: colors.success, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  inactive: { color: colors.textSecondary },
  state: { minHeight: 200, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  notice: { padding: 13, borderRadius: 14, backgroundColor: "rgba(255,240,232,0.96)" },
  noticeText: { color: colors.danger, fontSize: 12, lineHeight: 16 }
});
