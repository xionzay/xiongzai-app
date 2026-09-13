import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { useSellerProfile } from "@/features/seller/seller-api";
import { sellerEntry, type SellerEntry } from "@/features/seller/seller-domain";
import { colors } from "@/theme/tokens";
import xiongzaiIcon from "../../../assets/xiongzai-icon.png";

const backgroundBands = Array.from({ length: 52 }, (_, index) => {
  const ratio = index / 51;
  const from = [255, 252, 246];
  const to = [249, 244, 235];
  const channel = (value: number, target: number) => Math.round(value + (target - value) * ratio);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

const sellerStatusCopy: Record<SellerEntry, { current: string; menu: string; action: string }> = {
  APPLY: { current: "尚未申请", menu: "未申请", action: "开始申请" },
  EDIT_DRAFT: { current: "申请资料待提交", menu: "草稿", action: "继续申请" },
  WAITING: { current: "平台审核中", menu: "审核中", action: "查看审核进度" },
  SUPPLEMENT: { current: "等待补充资料", menu: "待补充", action: "补充申请资料" },
  REJECTED: { current: "审核未通过", menu: "未通过", action: "修改申请资料" },
  CENTER: { current: "审核已通过", menu: "已通过", action: "进入陪玩中心" },
  SUSPENDED: { current: "陪玩资格已暂停", menu: "已暂停", action: "查看身份状态" },
  BANNED: { current: "陪玩资格已封禁", menu: "已封禁", action: "查看身份状态" }
};

export function SettingsScreen() {
  const { logout } = useAuth();
  const seller = useSellerProfile();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const notApplied = seller.error instanceof ApiClientError && seller.error.code === "SELLER_NOT_FOUND";
  const entry = sellerEntry(seller.data?.status ?? "NOT_APPLIED", seller.data?.latest_application?.status);
  const sellerCopy = sellerStatusCopy[entry];
  const sellerUnavailable = seller.isError && !notApplied;

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

  const openSeller = () => {
    if (entry === "CENTER") router.push("/(seller-tabs)");
    else router.push("/seller/status");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <SettingsBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={seller.isRefetching} onRefresh={() => void seller.refetch()} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <ChevronLeftIcon size={23} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.pageTitle}>设置</Text>
            <Text style={styles.pageSubtitle}>账号、隐私与身份</Text>
          </View>
        </View>

        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}

        <View style={styles.sellerCard}>
          <View style={styles.sellerCopy}>
            <Text style={styles.eyebrow}>SELLER IDENTITY</Text>
            <Text style={styles.sellerTitle}>陪玩身份</Text>
            <Text style={styles.sellerDescription}>通过审核后，才可以拥有陪玩主页、发布服务并处理卖家订单。</Text>
            <Text style={[styles.sellerStatus, sellerUnavailable && styles.statusDanger]}>
              当前状态：{seller.isPending ? "正在读取" : sellerUnavailable ? "读取失败" : sellerCopy.current}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={sellerCopy.action} disabled={seller.isPending || sellerUnavailable} onPress={openSeller} style={({ pressed }) => [styles.sellerAction, (seller.isPending || sellerUnavailable) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.sellerActionText}>{sellerCopy.action}</Text>
            </Pressable>
          </View>
          <Image source={xiongzaiIcon} style={styles.sellerImage} accessibilityLabel="熊崽电竞陪玩认证" />
        </View>

        <View style={styles.menuCard}>
          <SettingsMenuRow label="申请成为陪玩" note="查看申请资料和审核记录" value={seller.isPending ? "读取中" : sellerUnavailable ? "读取失败" : sellerCopy.menu} onPress={() => router.push("/seller/status")} />
          <SettingsMenuRow label="个人资料" note="头像、昵称、手机号" onPress={() => router.push("/settings/profile")} />
          <SettingsMenuRow label="隐私与安全" note="手机号、实名认证、隐私设置" onPress={() => router.push("/settings/security")} />
          <SettingsMenuRow label="协议与隐私中心" note="协议、隐私清单、权限和接受记录" onPress={() => router.push("/rules")} />
          <SettingsMenuRow label={busy ? "正在退出…" : "退出登录"} danger last disabled={busy} onPress={() => Alert.alert("退出登录", "将清理本机认证状态和未发送消息，确认退出吗？", [
            { text: "取消", style: "cancel" },
            { text: "确认退出", style: "destructive", onPress: () => void signOut() }
          ])} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsBackdrop() {
  return <View pointerEvents="none" style={styles.backdrop}>{backgroundBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>;
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
  safe: { flex: 1, backgroundColor: "#FFFCF6" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 24 },
  header: { minHeight: 76, flexDirection: "row", alignItems: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 14, backgroundColor: "#FFFDF8", ...softShadow },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { flex: 1, marginLeft: 11 },
  pageTitle: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: "800" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  notice: { marginBottom: 10, padding: 12, borderWidth: 1, borderColor: "rgba(229,72,77,0.22)", borderRadius: 14, backgroundColor: "rgba(255,240,232,0.94)" },
  noticeText: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  sellerCard: { minHeight: 190, flexDirection: "row", alignItems: "center", padding: 18, borderWidth: 1, borderColor: "rgba(39,143,232,0.12)", borderRadius: 19, backgroundColor: "rgba(190,224,252,0.95)", ...softShadow },
  sellerCopy: { flex: 1, alignItems: "flex-start" },
  eyebrow: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 1.2 },
  sellerTitle: { marginTop: 8, color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  sellerDescription: { maxWidth: 238, marginTop: 9, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  sellerStatus: { marginTop: 7, color: "#438C22", fontSize: 12, lineHeight: 16, fontWeight: "800" },
  statusDanger: { color: colors.danger },
  sellerAction: { minHeight: 44, justifyContent: "center", marginTop: 13, paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.lime },
  sellerActionText: { color: "#314300", fontSize: 12, lineHeight: 16, fontWeight: "800" },
  sellerImage: { width: 82, height: 82, marginLeft: 8, borderRadius: 20, resizeMode: "contain" },
  menuCard: { overflow: "hidden", marginTop: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  menuRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 9 },
  menuBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  menuCopy: { flex: 1 },
  menuLabel: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  dangerLabel: { color: colors.text },
  menuNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  menuValue: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  arrow: { color: colors.textSecondary, fontSize: 24, lineHeight: 28 },
  disabled: { opacity: 0.46 },
  pressed: { opacity: 0.72 }
});
