import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { AppScreen } from "@/components/app-screen";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { escalateRefund, useRefund } from "@/features/after-sale/after-sale-api";
import { refundStatusCopy, shouldRefreshAfterConflict } from "@/features/after-sale/after-sale-domain";
import { paymentChannelLabel } from "@/features/checkout/checkout-domain";
import { useOrderDetail } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { RefundApiView, RefundStatus } from "@/types/api";
import { formatCent } from "@/utils/money";
import { ShieldIcon } from "@/components/tab-icons";



export function RefundDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const online = useOnlineStatus();
  const query = useRefund(id);
  const order = useOrderDetail(query.data?.order_id ?? "", Boolean(query.data?.order_id));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!online) return <AppScreen><PageHeader title="退款详情" /><StateView kind="offline" message="恢复网络后重新读取退款进度" onRetry={() => void query.refetch()} /></AppScreen>;
  if (query.isPending) return <AppScreen><PageHeader title="退款详情" /><StateView kind="loading" /></AppScreen>;
  if (!query.data || query.isError) return <AppScreen><PageHeader title="退款详情" /><StateView kind="error" onRetry={() => void query.refetch()} /></AppScreen>;

  const refund = query.data;
  const state = refundState(refund);
  const canEscalate = refund.available_actions.includes("ESCALATE");
  const rejectionReason = refund.seller_reason ?? refund.admin_reason;
  const approvedAmount = refund.approved_amount_cent ?? refund.requested_amount_cent;
  const originalPayment = order.data?.payments.find((payment) => payment.id === refund.payment_id);
  const refundMethod = originalPayment
    ? `${paymentChannelLabel(originalPayment.channel)}原路退回`
    : order.isError ? "原支付渠道读取失败，请重试" : "正在读取原支付渠道…";

  const refresh = async () => {
    setNotice(null);
    try {
      await Promise.all([query.refetch(), order.refetch()]);
    } catch {
      setNotice("退款进度刷新失败，请稍后重试");
    }
  };

  const escalate = async () => {
    if (reason.trim().length < 2 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await escalateRefund(id, refund.version, reason.trim());
      await Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: ["order", refund.order_id] }), queryClient.invalidateQueries({ queryKey: ["buyer-orders"] })]);
      setReason("");
    } catch (error) {
      if (error instanceof ApiClientError && shouldRefreshAfterConflict(error.code)) {
        await query.refetch();
        setNotice("退款状态刚刚发生变化，已为你刷新，请重新确认。");
      } else {
        setNotice(error instanceof ApiClientError ? error.message : "提交平台介入失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const openSupport = () => router.push({ pathname: "/support/new", params: { relatedType: "REFUND", relatedId: refund.id } });
  const primaryLabel = canEscalate
    ? busy ? "正在提交…" : "申请平台介入"
    : ["PLATFORM_REVIEW", "NEGOTIATING"].includes(refund.status)
      ? "联系客服"
      : ["SELLER_APPROVED", "REFUND_PROCESSING", "REQUESTED"].includes(refund.status)
        ? query.isFetching ? "正在刷新…" : "刷新退款进度"
        : "返回订单";
  const primaryDisabled = busy || (canEscalate && reason.trim().length < 2) || query.isFetching;
  const primaryAction = canEscalate
    ? () => void escalate()
    : ["PLATFORM_REVIEW", "NEGOTIATING"].includes(refund.status)
      ? openSupport
      : ["SELLER_APPROVED", "REFUND_PROCESSING", "REQUESTED"].includes(refund.status)
        ? () => void refresh()
        : () => router.replace({ pathname: "/orders/[id]", params: { id: refund.order_id } });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <RefundBackdrop />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={query.isRefetching || order.isRefetching} onRefresh={() => void refresh()} tintColor={colors.brand} />}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回订单详情" onPress={() => router.replace({ pathname: "/orders/[id]", params: { id: refund.order_id } })} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
            <View style={styles.headerCopy}><Text style={styles.headerTitle}>退款详情</Text><Text style={styles.headerSubtitle}>退款单 {refund.refund_no}</Text></View>
            <View style={styles.headerButton} />
          </View>

          {notice ? <View style={styles.notice}><NoticeBanner tone="danger" message={notice} /></View> : null}

          <View style={styles.hero} accessibilityRole="summary" accessibilityLabel={`退款状态${state.title}`}>
            <ShieldIcon size={52} />
            <View style={styles.heroCopy}><Text style={styles.heroTitle}>{state.title}</Text><Text style={styles.heroNote}>{state.note}</Text></View>
          </View>

          <RefundProgress progress={state.progress} completed={refund.status === "REFUNDED"} refund={refund} />

          <View style={styles.summaryCard}>
            <InfoRow label="退款金额" value={formatCent(approvedAmount)} />
            <InfoRow label="退款原因" value={refund.reason_text} />
            <InfoRow label="退款方式" value={refundMethod} />
            <InfoRow label="当前状态" value={refundStatusCopy[refund.status]} last />
          </View>

          {rejectionReason || ["SELLER_REJECTED", "REJECTED"].includes(refund.status) ? <View style={styles.rejectionCard}><Text style={styles.sectionTitle}>处理意见</Text><Text style={styles.rejectionText}>{rejectionReason ?? "退款申请暂未通过，可查看处理记录或申请平台介入。"}</Text></View> : null}

          <View style={styles.logCard}>
            <Text style={styles.sectionTitle}>处理记录</Text>
            {[...refund.logs].reverse().map((log) => <View key={log.id} style={styles.logRow}><View style={styles.logDot} /><View style={styles.logCopy}><Text style={styles.logTitle}>{refundStatusCopy[log.new_status]}</Text><Text style={styles.logNote}>{new Date(log.created_at).toLocaleString("zh-CN")} · {log.reason || log.action}</Text></View></View>)}
            {refund.logs.length === 0 ? <View style={styles.logRow}><View style={styles.logDot} /><View style={styles.logCopy}><Text style={styles.logTitle}>退款申请已提交</Text><Text style={styles.logNote}>{new Date(refund.created_at).toLocaleString("zh-CN")} · 等待服务端处理</Text></View></View> : null}
          </View>

          {canEscalate ? <View style={styles.escalateCard}><Text style={styles.sectionTitle}>申请平台介入原因</Text><TextInput accessibilityLabel="申请平台介入原因" value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={1000} placeholder="请说明争议情况和希望平台协助处理的内容" placeholderTextColor="#9A9892" textAlignVertical="top" style={styles.reasonInput} /><Text style={styles.counter}>{reason.length}/1000</Text></View> : null}

          <View style={styles.actions}><Pressable accessibilityRole="button" disabled={primaryDisabled} onPress={primaryAction} style={[styles.primary, primaryDisabled && styles.disabled]}><Text style={styles.primaryText}>{primaryLabel}</Text></Pressable></View>

          <View style={styles.toolsCard}>
            <ToolRow label="提交订单投诉" onPress={() => router.push({ pathname: "/complaints/new", params: { orderId: refund.order_id, refundId: refund.id } })} />
            <ToolRow label="联系平台客服" onPress={openSupport} last />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function refundState(refund: RefundApiView): { title: string; note: string; progress: 1 | 2 } {
  const config: Record<RefundStatus, { title: string; note: string; progress: 1 | 2 }> = {
    REQUESTED: { title: "等待陪玩处理", note: "退款申请已提交，正在等待陪玩响应。", progress: 1 },
    SELLER_APPROVED: { title: "陪玩已同意退款", note: "平台将向支付渠道提交退款指令。", progress: 2 },
    SELLER_REJECTED: { title: "陪玩拒绝退款", note: "陪玩已提交处理意见，你可以申请平台介入。", progress: 1 },
    NEGOTIATING: { title: "退款协商中", note: "双方正在协商退款方案，可联系平台客服了解进度。", progress: 1 },
    PLATFORM_REVIEW: { title: "平台处理中", note: "平台正在核验订单、聊天记录和双方提交的材料。", progress: 1 },
    REFUND_PROCESSING: { title: "退款处理中", note: "退款指令已提交支付渠道，请等待到账结果。", progress: 2 },
    REFUNDED: { title: "退款已完成", note: `${formatCent(refund.approved_amount_cent ?? refund.requested_amount_cent)} 已按原支付方式退回，到账时间以支付渠道为准。`, progress: 2 },
    REJECTED: { title: "退款申请未通过", note: "平台已完成核验，请查看处理意见和处理记录。", progress: 1 },
    CANCELLED: { title: "退款申请已关闭", note: "本次申请已撤销或关闭，订单记录仍由平台安全留存。", progress: 1 }
  };
  return config[refund.status];
}

function RefundProgress({ progress, completed, refund }: { progress: 1 | 2; completed: boolean; refund: RefundApiView }) {
  const items = [
    { title: "买家申请", note: new Date(refund.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) },
    { title: "陪玩/平台处理", note: refundStatusCopy[refund.status] },
    { title: "退款结果", note: completed ? "已完成" : progress >= 2 ? "渠道处理中" : "等待处理" }
  ];
  return <View style={styles.progressCard}>{items.map((item, index) => { const active = index <= progress; return <View key={item.title} style={styles.progressStep}>{index < 2 ? <View style={[styles.progressLine, index < progress && styles.progressLineDone]} /> : null}<View style={[styles.progressMark, active && styles.progressMarkActive]}><Text style={[styles.progressMarkText, active && styles.progressMarkTextActive]}>{index < progress || completed && index === 2 ? <JellyIcon kind="check" label="已选" /> : index + 1}</Text></View><Text style={styles.progressTitle}>{item.title}</Text><Text style={styles.progressNote} numberOfLines={2}>{item.note}</Text></View>; })}</View>;
}

function RefundBackdrop() { return <BrandBackdrop />; }

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={3}>{value}</Text></View>; }

function ToolRow({ label, onPress, last = false }: { label: string; onPress: () => void; last?: boolean }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.toolRow, last && styles.toolRowLast]}><Text style={styles.toolText}>{label}</Text><ChevronRightIcon size={20} /></Pressable>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;
const card = { ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
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
  hero: { flexDirection: "row", alignItems: "center", gap: 13, marginHorizontal: 12, marginBottom: 10, padding: 20, borderRadius: 20, backgroundColor: "#3A86C2", ...softShadow },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.white, fontSize: 20, lineHeight: 26, fontWeight: "900" },
  heroNote: { marginTop: 5, color: "#E1F2FF", fontSize: 12, lineHeight: 17 },
  progressCard: { flexDirection: "row", marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 8, paddingVertical: 18, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  progressStep: { position: "relative", flex: 1, alignItems: "center" },
  progressLine: { position: "absolute", zIndex: 0, left: "50%", top: 16, width: "100%", height: 2, backgroundColor: "#D9D4CC" },
  progressLineDone: { backgroundColor: "#BADF28" },
  progressMark: { zIndex: 2, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#E8E2D9" },
  progressMarkActive: { backgroundColor: "#BADF28" },
  progressMarkText: { color: "#777777", fontSize: 12, fontWeight: "900" },
  progressMarkTextActive: { color: "#34470F" },
  progressTitle: { marginTop: 8, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900", textAlign: "center" },
  progressNote: { marginTop: 5, color: "#74767B", fontSize: 12, lineHeight: 16, fontWeight: "700", textAlign: "center" },
  summaryCard: { marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  infoRow: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: "#74767B", fontSize: 13, lineHeight: 18 },
  infoValue: { maxWidth: "68%", color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "900", textAlign: "right" },
  rejectionCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, borderWidth: 1, borderColor: "#F2A18A", borderRadius: 17, backgroundColor: "#FFF7F3", ...softShadow },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "900" },
  rejectionText: { marginTop: 8, color: "#6B4D46", fontSize: 12, lineHeight: 20 },
  logCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  logRow: { flexDirection: "row", gap: 13, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  logDot: { width: 12, height: 12, marginTop: 5, borderWidth: 3, borderColor: colors.white, borderRadius: 6, backgroundColor: colors.brand, shadowColor: "#9BC8EB", shadowOpacity: 1, shadowRadius: 2 },
  logCopy: { flex: 1 },
  logTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  logNote: { marginTop: 6, color: "#74767B", fontSize: 12, lineHeight: 17 },
  escalateCard: { position: "relative", marginHorizontal: 12, marginBottom: 10, padding: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  reasonInput: { marginTop: 10, borderWidth: 1, padding: 12, paddingBottom: 28, color: colors.text, lineHeight: 18, backgroundColor: colors.input, borderColor: colors.controlBorder, borderRadius: 10, fontSize: 16, minHeight: 48, shadowOpacity: 0, elevation: 0 },
  counter: { position: "absolute", right: 25, bottom: 21, color: "#74767B", fontSize: 12 },
  actions: { marginHorizontal: 12, marginTop: 2, marginBottom: 10 },
  primary: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.accent },
  primaryText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  toolsCard: { marginHorizontal: 12, paddingHorizontal: 14, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  toolRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  toolRowLast: { borderBottomWidth: 0 },
  toolText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  toolArrow: { color: "#74767B", fontSize: 20 }
});
