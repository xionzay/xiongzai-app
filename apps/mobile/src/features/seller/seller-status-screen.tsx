import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellySymbol, JellyIcon } from "../../components/jelly-icon";
import { useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { StateView } from "@/components/state-view";
import { useSellerApplications, useSellerProfile } from "@/features/seller/seller-api";
import { sellerEntry, type SellerEntry } from "@/features/seller/seller-domain";
import { colors } from "@/theme/tokens";
import type { SellerApplicationApiView } from "@/types/api";



const statusCopy: Record<SellerEntry, { symbol: string; title: string; description: string; tone: "success" | "warning" | "danger" | "plain" }> = {
  APPLY: { symbol: "1", title: "尚未申请陪玩身份", description: "完成陪玩资料并提交平台审核后，当前买家账号会增加陪玩能力。", tone: "plain" },
  EDIT_DRAFT: { symbol: "1", title: "陪玩申请资料待提交", description: "申请草稿尚未提交，可以继续完善基本资料、游戏资料和声音名片。", tone: "plain" },
  WAITING: { symbol: "…", title: "陪玩身份审核中", description: "平台正在审核本次申请，审核完成前不能进入经营功能。", tone: "warning" },
  SUPPLEMENT: { symbol: "!", title: "申请需要补充资料", description: "请根据平台要求补充真实资料并重新提交审核。", tone: "warning" },
  REJECTED: { symbol: "!", title: "陪玩身份审核未通过", description: "请查看真实审核原因，修改资料后可以重新提交。", tone: "danger" },
  CENTER: { symbol: "✓", title: "陪玩身份审核已通过", description: "你已经可以创建公开陪玩主页、发布服务和处理卖家订单。", tone: "success" },
  SUSPENDED: { symbol: "!", title: "陪玩资格已暂停", description: "暂停期间不能进入经营功能或新增交易，请查看平台处理原因。", tone: "danger" },
  BANNED: { symbol: "!", title: "陪玩资格已封禁", description: "当前不能进入经营功能，如需申诉请联系平台客服。", tone: "danger" }
};

export function SellerStatusScreen() {
  const { user } = useAuth();
  const profile = useSellerProfile();
  const notApplied = profile.error instanceof ApiClientError && profile.error.code === "SELLER_NOT_FOUND";
  const applications = useSellerApplications(Boolean(profile.data));
  const [showHistory, setShowHistory] = useState(false);
  const latest = profile.data?.latest_application ?? applications.data?.[0] ?? null;
  const entry = sellerEntry(profile.data?.status ?? "NOT_APPLIED", latest?.status);
  const presentation = statusCopy[entry];
  const loadFailed = profile.isError && !notApplied;
  const basicComplete = Boolean(profile.data?.seller_nickname && profile.data?.introduction && profile.data?.seller_avatar_file_id);
  const gameComplete = Boolean(profile.data?.game_rank && profile.data?.kd && profile.data?.preferred_mode && profile.data?.play_style && profile.data?.game_experience && profile.data?.voice_file_id);

  const refresh = async () => {
    await Promise.all([profile.refetch(), profile.data ? applications.refetch() : Promise.resolve()]);
  };

  const primaryAction = () => {
    if (entry === "CENTER") return { label: "进入陪玩中心", onPress: () => router.push("/(seller-tabs)") };
    if (["APPLY", "EDIT_DRAFT", "SUPPLEMENT", "REJECTED"].includes(entry)) return { label: entry === "APPLY" ? "开始申请" : "修改申请资料", onPress: () => router.push("/seller/apply") };
    if (["SUSPENDED", "BANNED"].includes(entry)) return { label: "联系平台客服", onPress: () => router.push({ pathname: "/support/new", params: { sourcePage: "seller-status" } }) };
    return null;
  };
  const primary = primaryAction();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={profile.isRefetching || applications.isRefetching} onRefresh={() => void refresh()} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.pageTitle}>陪玩申请状态</Text><Text style={styles.pageSubtitle}>审核通过后开启陪玩中心</Text></View>
        </View>

        <View style={styles.steps}>
          <StatusStep complete={basicComplete} active={!basicComplete} value="1" label="基本资料" />
          <View style={styles.stepLine} />
          <StatusStep complete={gameComplete} active={basicComplete && !gameComplete} value="2" label="游戏资料" />
          <View style={styles.stepLine} />
          <StatusStep complete={entry === "CENTER"} active={gameComplete && entry !== "CENTER"} value="3" label="平台审核" />
        </View>

        {profile.isPending ? (
          <View style={styles.stateCard}><StateView kind="loading" title="正在读取真实申请状态" /></View>
        ) : loadFailed ? (
          <View style={styles.stateCard}><StateView kind="error" title="陪玩身份加载失败" onRetry={() => void profile.refetch()} /></View>
        ) : (
          <>
            <View style={styles.resultCard}>
              <View style={[styles.resultIcon, styles[`resultIcon_${presentation.tone}`]]}><Text style={styles.resultSymbol}><JellySymbol symbol={presentation.symbol} size={30} /></Text></View>
              <Text style={styles.resultTitle}>{presentation.title}</Text>
              <Text style={styles.resultDescription}>{presentation.description}</Text>
              {latest?.rejection_reason ? <View style={styles.reasonBox}><Text style={styles.reasonText}>审核原因：{latest.rejection_reason}</Text></View> : null}
              {latest?.required_fields?.length ? <View style={styles.reasonBox}><Text style={styles.reasonText}>需补充：{latest.required_fields.join("、")}</Text></View> : null}
              {profile.data?.suspended_reason ? <View style={styles.reasonBox}><Text style={styles.reasonText}>平台原因：{profile.data.suspended_reason}</Text></View> : null}
              {primary ? <Pressable accessibilityRole="button" accessibilityLabel={primary.label} onPress={primary.onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryText}>{primary.label}</Text></Pressable> : null}
            </View>

            <View style={styles.materialCard}>
              <View style={styles.materialHeader}><Text style={styles.materialTitle}>{profile.data ? "已提交资料" : "申请资料"}</Text><Text style={styles.version}>{latest ? `版本 V${latest.version_no}` : "尚未提交"}</Text></View>
              <MaterialRow label="真实姓名认证" value={identityCopy(user?.identity_verification?.status)} />
              <MaterialRow label="和平精英资料" value={gameProfileCopy(profile.data?.game_rank, profile.data?.preferred_mode)} />
              <MaterialRow label="声音名片" value={voiceCopy(profile.data?.voice_file_id, profile.data?.voice_duration_ms)} last />
            </View>

            {profile.data ? <Text style={styles.auditMeta}>SellerStatus：{profile.data.status} · 资料版本 {profile.data.version}</Text> : null}

            {applications.isPending ? <Text style={styles.historyMeta}>正在读取审核记录…</Text> : null}
            {applications.isError ? <Text style={styles.historyError}>审核记录加载失败，申请状态仍以当前结果为准。</Text> : null}
            {applications.data?.length ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel={showHistory ? "收起审核记录" : "查看审核记录"} onPress={() => setShowHistory((value) => !value)} style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}>
                  <Text style={styles.historyButtonText}>{showHistory ? "收起审核记录" : "查看审核记录"}</Text>
                </Pressable>
                {showHistory ? <View style={styles.historyCard}><Text style={styles.historyTitle}>审核记录</Text>{applications.data.map((item, index) => <ApplicationHistory key={item.id} item={item} last={index === applications.data!.length - 1} />)}</View> : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusBackdrop() { return <BrandBackdrop seller />; }

function StatusStep({ complete, active, value, label }: { complete: boolean; active: boolean; value: string; label: string }) {
  return <View style={styles.step}><View style={[styles.stepCircle, complete && styles.stepComplete, active && styles.stepActive]}><Text style={styles.stepValue}>{complete ? <JellyIcon kind="check" label="已选" /> : value}</Text></View><Text style={styles.stepLabel}>{label}</Text></View>;
}

function MaterialRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.materialRow, !last && styles.materialBorder]}><Text style={styles.materialLabel}>{label}</Text><Text style={styles.materialValue}>{value}</Text></View>;
}

function ApplicationHistory({ item, last }: { item: SellerApplicationApiView; last: boolean }) {
  return (
    <View style={[styles.historyRow, !last && styles.materialBorder]}>
      <View style={styles.historyRowTop}><Text style={styles.historyVersion}>版本 V{item.version_no}</Text><Text style={styles.historyStatus}>{applicationStatusCopy(item.status)}</Text></View>
      <Text style={styles.historyDate}>{item.reviewed_at ? `审核于 ${new Date(item.reviewed_at).toLocaleString("zh-CN")}` : item.submitted_at ? `提交于 ${new Date(item.submitted_at).toLocaleString("zh-CN")}` : "申请草稿"}</Text>
      {item.rejection_reason ? <Text style={styles.historyReason}>原因：{item.rejection_reason}</Text> : null}
      {item.required_fields?.length ? <Text style={styles.historyReason}>需补充：{item.required_fields.join("、")}</Text> : null}
    </View>
  );
}

function identityCopy(status?: string) {
  if (status === "VERIFIED") return "已完成";
  if (status === "PENDING") return "审核中";
  if (status === "REJECTED") return "未通过";
  if (status === "EXPIRED") return "已过期";
  if (status === "REVOKED") return "已撤销";
  return "未完成";
}

function gameProfileCopy(rank?: string | null, mode?: string | null) {
  if (rank && mode) return `${rank} · ${mode}`;
  return rank ?? mode ?? "未提交";
}

function voiceCopy(fileId?: string | null, durationMs?: number | null) {
  if (!fileId) return "未提交";
  return durationMs ? `${Math.round(durationMs / 1000)} 秒 · 已提交` : "已提交";
}

function applicationStatusCopy(status: SellerApplicationApiView["status"]) {
  const labels: Record<SellerApplicationApiView["status"], string> = { DRAFT: "草稿", SUBMITTED: "已提交", UNDER_REVIEW: "审核中", NEEDS_SUPPLEMENT: "待补充", APPROVED: "已通过", REJECTED: "未通过" };
  return labels[status];
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
  steps: { height: 86, flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, paddingTop: 7 },
  step: { width: 70, alignItems: "center" },
  stepCircle: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#C7C1B8" },
  stepComplete: { backgroundColor: colors.accent },
  stepActive: { backgroundColor: colors.accent },
  stepValue: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  stepLabel: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  stepLine: { flex: 1, height: 1, marginTop: 17, backgroundColor: "rgba(62,57,47,0.20)" },
  stateCard: { minHeight: 220, justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  resultCard: { alignItems: "center", padding: 20, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  resultIcon: { width: 62, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 31 },
  resultIcon_success: { backgroundColor: colors.lime },
  resultIcon_warning: { backgroundColor: "#FFD27A" },
  resultIcon_danger: { backgroundColor: "#FFD6D6" },
  resultIcon_plain: { backgroundColor: "#DCEEFF" },
  resultSymbol: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "900" },
  resultTitle: { marginTop: 15, color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: "900", textAlign: "center" },
  resultDescription: { marginTop: 9, color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: "center" },
  reasonBox: { alignSelf: "stretch", marginTop: 10, padding: 10, borderRadius: 11, backgroundColor: "rgba(255,240,232,0.96)" },
  reasonText: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  primaryButton: { minHeight: 44, justifyContent: "center", marginTop: 15, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.accent },
  primaryText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  materialCard: { marginTop: 13, paddingHorizontal: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  materialHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  materialTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  version: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  materialRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12 },
  materialBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  materialLabel: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16 },
  materialValue: { maxWidth: "58%", color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "700", textAlign: "right" },
  auditMeta: { marginTop: 9, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  historyMeta: { marginTop: 10, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  historyError: { marginTop: 10, color: colors.danger, fontSize: 12, lineHeight: 16, textAlign: "center" },
  historyButton: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 13, borderWidth: 1, borderColor: "rgba(39,143,232,0.35)", borderRadius: 14, backgroundColor: "rgba(234,246,255,0.92)" },
  historyButtonText: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  historyCard: { marginTop: 10, paddingHorizontal: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  historyTitle: { paddingTop: 15, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  historyRow: { paddingVertical: 14 },
  historyRowTop: { flexDirection: "row", alignItems: "center" },
  historyVersion: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  historyStatus: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  historyDate: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  historyReason: { marginTop: 5, color: colors.danger, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.72 }
});
