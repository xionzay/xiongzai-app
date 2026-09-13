import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { colors } from "@/theme/tokens";
import { ShieldIcon } from "@/components/tab-icons";

const backgroundBands = Array.from({ length: 52 }, (_, index) => {
  const ratio = index / 51;
  const from = ratio < 0.20 ? [222, 240, 255] : [255, 252, 246];
  const to = ratio < 0.20 ? [255, 252, 246] : [249, 244, 235];
  const progress = ratio < 0.20 ? ratio / 0.20 : (ratio - 0.20) / 0.80;
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function SecurityScreen() {
  const { user } = useAuth();
  const identity = identityStatus(user?.identity_verification?.status);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <SecurityBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.pageTitle}>隐私与安全</Text><Text style={styles.pageSubtitle}>保护账号和个人数据</Text></View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusIconWrap}><ShieldIcon size={42} /></View>
          <View style={styles.statusCopy}><Text style={styles.statusTitle}>账号安全状态良好</Text><Text style={styles.statusText}>建议定期核对手机号码与隐私设置</Text></View>
        </View>

        <View style={styles.menuCard}>
          <SecurityRow label="手机号码" value={user?.phone_mask ?? "--"} onPress={() => router.push("/settings/identity")} />
          <SecurityRow label="实名认证" value={identity} onPress={() => router.push("/settings/identity")} />
          <SecurityRow label="隐私设置" value="在线状态、个性化推荐" onPress={() => router.push("/settings/privacy")} />
          <SecurityRow label="个人数据下载" value="申请数据副本" onPress={() => router.push("/settings/data-export")} last />
        </View>

        <View style={styles.dangerCard}>
          <SecurityRow label="注销账号" value="永久删除账号与个人资料" danger onPress={() => router.push("/settings/account-cancellation")} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SecurityBackdrop() {
  return <View pointerEvents="none" style={styles.backdrop}>{backgroundBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>;
}

function SecurityRow({ label, value, onPress, danger = false, last = false }: { label: string; value: string; onPress(): void; danger?: boolean; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${value}`} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}>
      <View style={styles.rowCopy}><Text style={[styles.rowLabel, danger && styles.dangerLabel]}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>
      <ChevronRightIcon size={20} />
    </Pressable>
  );
}

function identityStatus(status?: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "REVOKED") {
  if (status === "VERIFIED") return "已认证";
  if (status === "PENDING") return "审核中";
  if (status === "REJECTED") return "未通过";
  if (status === "EXPIRED") return "已过期";
  if (status === "REVOKED") return "已撤销";
  return "未认证";
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DEF0FF" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 24 },
  header: { minHeight: 76, flexDirection: "row", alignItems: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 14, backgroundColor: "#FFFDF8", ...softShadow },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { marginLeft: 11 },
  pageTitle: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: "800" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  statusCard: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 19, backgroundColor: "rgba(255,248,221,0.93)", ...softShadow },
  statusIconWrap: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#DCEEFF" },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  statusText: { marginTop: 6, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  menuCard: { marginTop: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.95)", ...softShadow },
  dangerCard: { marginTop: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.95)", ...softShadow },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  rowCopy: { flex: 1 },
  rowLabel: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  dangerLabel: { color: colors.danger },
  rowValue: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  arrow: { color: colors.textSecondary, fontSize: 26, lineHeight: 30 },
  pressed: { opacity: 0.72 },
});
