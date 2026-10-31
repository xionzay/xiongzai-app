import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppScreen } from "@/components/app-screen";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { useComplaint } from "@/features/after-sale/after-sale-api";
import { complaintStatusCopy } from "@/features/after-sale/after-sale-domain";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import type { ComplaintApiView, ComplaintStatus } from "@/types/api";
import { ShieldIcon } from "@/components/tab-icons";



export function ComplaintDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const online = useOnlineStatus();
  const query = useComplaint(id);
  const [notice, setNotice] = useState<string | null>(null);

  if (!online) return <AppScreen><PageHeader title="投诉详情" /><StateView kind="offline" message="恢复网络后重新读取投诉处理进度" onRetry={() => void query.refetch()} /></AppScreen>;
  if (query.isPending) return <AppScreen><PageHeader title="投诉详情" /><StateView kind="loading" /></AppScreen>;
  if (!query.data || query.isError) return <AppScreen><PageHeader title="投诉详情" /><StateView kind="error" onRetry={() => void query.refetch()} /></AppScreen>;

  const item = query.data;
  const state = complaintState(item.status);
  const completed = ["COMPLETED", "CLOSED"].includes(item.status);

  const refresh = async () => {
    setNotice(null);
    const result = await query.refetch();
    if (result.isError) setNotice("投诉进度刷新失败，请稍后重试");
  };

  const openSupport = () => router.push({ pathname: "/support/new", params: { relatedType: "COMPLAINT", relatedId: item.id } });
  const returnOrder = () => item.order_id ? router.replace({ pathname: "/orders/[id]", params: { id: item.order_id } }) : router.back();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ComplaintBackdrop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void refresh()} tintColor={colors.brand} />}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>投诉详情</Text><Text style={styles.headerSubtitle}>投诉单 {item.complaint_no}</Text></View>
          <View style={styles.headerButton} />
        </View>

        {notice ? <View style={styles.notice}><NoticeBanner tone="danger" message={notice} /></View> : null}
        {item.status === "NEED_MORE_EVIDENCE" ? <View style={styles.notice}><NoticeBanner tone="danger" message="平台正在等待补充证据。当前版本尚未开放详情页追加证据，请联系平台客服安全提交。" /></View> : null}

        <View style={styles.statusCard} accessibilityRole="summary" accessibilityLabel={`投诉状态${state.title}`}>
          <View style={styles.shieldWrap}><ShieldIcon size={43} /></View>
          <View style={styles.statusCopy}><Text style={styles.statusTitle}>{state.title}</Text><Text style={styles.statusNote}>{state.note}</Text></View>
        </View>

        <ComplaintProgress progress={state.progress} completed={completed} item={item} />

        <View style={styles.factsCard}>
          <InfoRow label="投诉类型" value={item.complaint_type} />
          <InfoRow label="关联订单" value={item.order_id ?? "未关联订单"} />
          <InfoRow label="提交时间" value={new Date(item.created_at).toLocaleString("zh-CN")} />
          <InfoRow label="当前处理人" value={item.status === "CLOSED" ? "平台系统" : "平台交易专员"} />
          <InfoRow label="当前状态" value={complaintStatusCopy[item.status]} last />
        </View>

        <View style={styles.descriptionCard}><Text style={styles.sectionTitle}>问题说明</Text><Text style={styles.descriptionText}>{item.description}</Text></View>

        {item.admin_result || completed ? <View style={styles.decisionCard}><Text style={styles.sectionTitle}>平台处理结论</Text><Text style={styles.decisionText}>{item.admin_result ?? (item.status === "CLOSED" ? "本次投诉已关闭，具体原因请查看处理记录。" : "平台已完成核验。")}</Text><Text style={styles.decisionNote}>完整处理过程以服务端记录为准。</Text></View> : null}

        <View style={styles.evidenceCard}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>证据材料</Text><Text style={styles.sectionCount}>{item.evidences.length} 份</Text></View>
          {item.evidences.map((evidence, index) => <View key={evidence.id} style={styles.evidenceRow}><View style={styles.evidenceIcon}><Text style={styles.evidenceIconText}>{index + 1}</Text></View><View style={styles.evidenceCopy}><Text style={styles.evidenceTitle}>{evidence.description || `私有图片证据 ${index + 1}`}</Text><Text style={styles.evidenceNote}>{new Date(evidence.created_at).toLocaleString("zh-CN")} · 仅平台处理人员可查看</Text></View></View>)}
          {item.evidences.length === 0 ? <Text style={styles.emptyEvidence}>本次投诉未单独上传图片，平台仍会依据关联订单和聊天记录核验。</Text> : null}
        </View>

        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>处理记录</Text>
          {[...item.logs].reverse().map((log) => <View key={log.id} style={styles.logRow}><View style={styles.logDot} /><View style={styles.logCopy}><Text style={styles.logTitle}>{complaintStatusCopy[log.new_status]}</Text><Text style={styles.logNote}>{new Date(log.created_at).toLocaleString("zh-CN")} · {log.reason || log.action}</Text></View></View>)}
          {item.logs.length === 0 ? <View style={styles.logRow}><View style={styles.logDot} /><View style={styles.logCopy}><Text style={styles.logTitle}>投诉已提交</Text><Text style={styles.logNote}>{new Date(item.created_at).toLocaleString("zh-CN")} · 等待平台受理</Text></View></View> : null}
        </View>

        <View style={styles.actions}>
          {item.status === "NEED_MORE_EVIDENCE" ? <><ActionButton label="联系客服补充证据" onPress={openSupport} /><ActionButton label={query.isFetching ? "正在刷新…" : "刷新状态"} primary disabled={query.isFetching} onPress={() => void refresh()} /></> : !completed ? <><ActionButton label={query.isFetching ? "正在刷新…" : "刷新进度"} disabled={query.isFetching} onPress={() => void refresh()} /><ActionButton label="联系客服" primary onPress={openSupport} /></> : <><ActionButton label="返回订单" onPress={returnOrder} /><ActionButton label={query.isFetching ? "正在刷新…" : "查看最新记录"} primary disabled={query.isFetching} onPress={() => void refresh()} /></>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function complaintState(status: ComplaintStatus): { title: string; note: string; progress: 1 | 2 } {
  const config: Record<ComplaintStatus, { title: string; note: string; progress: 1 | 2 }> = {
    SUBMITTED: { title: "投诉已提交", note: "平台已收到申请，正在等待受理。", progress: 1 },
    ACCEPTED: { title: "平台已受理", note: "平台交易专员将核对订单、聊天记录和证据。", progress: 1 },
    PROCESSING: { title: "平台处理中", note: "平台正在核验双方记录，请留意处理进度。", progress: 1 },
    NEED_MORE_EVIDENCE: { title: "需要补充证据", note: "平台需要更多材料才能继续核验。", progress: 1 },
    COMPLETED: { title: "投诉处理完成", note: "平台已给出处理结论并记录完整过程。", progress: 2 },
    CLOSED: { title: "投诉已关闭", note: "本次投诉已撤回或不符合继续处理条件。", progress: 2 }
  };
  return config[status];
}

function ComplaintProgress({ progress, completed, item }: { progress: 1 | 2; completed: boolean; item: ComplaintApiView }) {
  const steps = [
    { title: "提交投诉", note: new Date(item.created_at).toLocaleDateString("zh-CN") },
    { title: "平台处理", note: complaintStatusCopy[item.status] },
    { title: "处理结果", note: completed ? complaintStatusCopy[item.status] : "等待处理" }
  ];
  return <View style={styles.progressCard}>{steps.map((step, index) => { const active = index <= progress; return <View key={step.title} style={styles.progressStep}>{index < 2 ? <View style={[styles.progressLine, index < progress && styles.progressLineDone]} /> : null}<View style={[styles.progressMark, active && styles.progressMarkActive]}><Text style={[styles.progressMarkText, active && styles.progressMarkTextActive]}>{index < progress || completed && index === 2 ? <JellyIcon kind="check" label="已选" /> : index + 1}</Text></View><Text style={styles.progressTitle}>{step.title}</Text><Text style={styles.progressNote} numberOfLines={2}>{step.note}</Text></View>; })}</View>;
}

function ComplaintBackdrop() { return <BrandBackdrop />; }

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={3}>{value}</Text></View>; }

function ActionButton({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, primary && styles.actionPrimary, disabled && styles.disabled]}><Text style={[styles.actionText, primary && styles.actionPrimaryText]}>{label}</Text></Pressable>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;
const card = { ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center", marginLeft: 0, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  headerSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  notice: { marginHorizontal: 12, marginBottom: 10 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 10, borderRadius: 20, padding: 18, backgroundColor: "#DFF0FF", ...softShadow },
  shieldWrap: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#3A86C2" },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: "900" },
  statusNote: { marginTop: 5, color: "#4D6983", fontSize: 12, lineHeight: 17 },
  progressCard: { flexDirection: "row", marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 8, paddingVertical: 16, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  progressStep: { position: "relative", flex: 1, alignItems: "center" },
  progressLine: { position: "absolute", zIndex: 0, left: "50%", top: 16, width: "100%", height: 2, backgroundColor: "#D9D4CC" },
  progressLineDone: { backgroundColor: "#BADF28" },
  progressMark: { zIndex: 2, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#E8E2D9" },
  progressMarkActive: { backgroundColor: "#BADF28" },
  progressMarkText: { color: "#777777", fontSize: 12, fontWeight: "900" },
  progressMarkTextActive: { color: "#34470F" },
  progressTitle: { marginTop: 8, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900", textAlign: "center" },
  progressNote: { marginTop: 4, color: "#74767B", fontSize: 12, lineHeight: 16, fontWeight: "700", textAlign: "center" },
  factsCard: { marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  infoRow: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: "#74767B", fontSize: 12, lineHeight: 18 },
  infoValue: { maxWidth: "68%", color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "900", textAlign: "right" },
  descriptionCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "900" },
  descriptionText: { marginTop: 10, color: "#555B61", fontSize: 12, lineHeight: 20 },
  decisionCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  decisionText: { marginTop: 10, color: colors.text, fontSize: 13, lineHeight: 21, fontWeight: "800" },
  decisionNote: { marginTop: 8, color: "#647889", fontSize: 12, lineHeight: 16 },
  evidenceCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionCount: { color: "#3478B2", fontSize: 12, fontWeight: "900" },
  evidenceRow: { minHeight: 59, flexDirection: "row", alignItems: "center", gap: 11, marginTop: 10, borderRadius: 13, padding: 10, backgroundColor: "#F2F7FB" },
  evidenceIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#3A86C2" },
  evidenceIconText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  evidenceCopy: { flex: 1 },
  evidenceTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  evidenceNote: { marginTop: 4, color: "#74767B", fontSize: 12, lineHeight: 16 },
  emptyEvidence: { marginTop: 11, color: "#74767B", fontSize: 12, lineHeight: 17 },
  timelineCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  logRow: { flexDirection: "row", gap: 13, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  logDot: { width: 12, height: 12, marginTop: 5, borderWidth: 3, borderColor: colors.white, borderRadius: 6, backgroundColor: colors.brand, shadowColor: colors.brand, shadowOpacity: 1, shadowRadius: 2 },
  logCopy: { flex: 1 },
  logTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  logNote: { marginTop: 5, color: "#74767B", fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: "row", gap: 9, marginHorizontal: 12, marginBottom: 18 },
  actionButton: { minHeight: 48, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brand, borderRadius: 15, backgroundColor: colors.white },
  actionPrimary: { backgroundColor: colors.brand },
  actionText: { color: "#2F79BD", fontSize: 12, fontWeight: "900", textAlign: "center" },
  actionPrimaryText: { color: colors.white },
  disabled: { opacity: 0.48 }
});
