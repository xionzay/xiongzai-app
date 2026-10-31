import { BrandBackdrop } from "@/components/brand-backdrop";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StateBear } from '@/components/state-bear';
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { AppScreen } from "@/components/app-screen";
import { StateView } from "@/components/state-view";
import { runtimeFlags } from "@/config/runtime-flags";
import { paymentChannelLabel, paymentPollDelay, resolvePaymentOutcome } from "@/features/checkout/checkout-domain";
import { cancelMockPayment, confirmMockPayment, failMockPayment, useOrderDetail, usePayment } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import { formatCent } from "@/utils/money";
import { ShieldIcon } from "@/components/tab-icons";



export function PaymentProcessingScreen() {
  const { id = "", orderId = "" } = useLocalSearchParams<{ id: string; orderId: string }>();
  const payment = usePayment(id);
  const order = useOrderDetail(orderId);
  const online = useOnlineStatus();
  const [attempt, setAttempt] = useState(0);
  const [mockAction, setMockAction] = useState<"success" | "failed" | "cancelled" | null>(null);
  const outcome = resolvePaymentOutcome(payment.data, order.data);
  const timedOut = paymentPollDelay(attempt) === null;
  const refetchPayment = payment.refetch;
  const refetchOrder = order.refetch;

  useEffect(() => {
    if (payment.isPending || order.isPending || payment.isError || order.isError) return;
    if (outcome !== "processing") {
      router.replace({ pathname: "/payments/[id]/result", params: { id, orderId } });
      return;
    }
    const delay = paymentPollDelay(attempt);
    if (delay === null) return;
    const timer = setTimeout(() => {
      void Promise.all([refetchPayment(), refetchOrder()]).finally(() => setAttempt((value) => value + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [attempt, id, orderId, outcome, refetchOrder, refetchPayment, payment.isPending, order.isPending, payment.isError, order.isError]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setAttempt(0);
        void refetchPayment();
        void refetchOrder();
      }
    });
    return () => subscription.remove();
  }, [refetchOrder, refetchPayment]);

  const queryAgain = () => {
    setAttempt(0);
    void refetchPayment();
    void refetchOrder();
  };

  const runMockAction = async (action: "success" | "failed" | "cancelled") => {
    if (mockAction) return;
    setMockAction(action);
    try {
      if (action === "success") await confirmMockPayment(id);
      else if (action === "failed") await failMockPayment(id);
      else await cancelMockPayment(id);
      await Promise.all([refetchPayment(), refetchOrder()]);
      router.replace({ pathname: "/payments/[id]/result", params: { id, orderId } });
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : "UNKNOWN";
      router.push({ pathname: "/payment-error", params: { code, orderId } });
    } finally {
      setMockAction(null);
    }
  };

  if (payment.isPending || order.isPending) return <AppScreen><StateView kind="loading" title="正在向服务端查询支付状态" /></AppScreen>;
  if (!online) return <AppScreen><StateView kind="offline" onRetry={() => { void refetchPayment(); void refetchOrder(); }} /></AppScreen>;
  if (payment.isError || order.isError || !payment.data || !order.data) return <AppScreen><StateView kind="error" title="支付状态查询失败" onRetry={queryAgain} /></AppScreen>;

  const querying = payment.isFetching || order.isFetching;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ProcessingBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回订单" onPress={() => router.replace({ pathname: "/orders/[id]", params: { id: orderId } })} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>{runtimeFlags.enableMockPayment ? '正在确认测试支付' : '正在确认支付'}</Text><Text style={styles.headerSubtitle}>{runtimeFlags.enableMockPayment ? '测试支付，不会真实扣款' : '请勿重复付款或关闭页面'}</Text></View>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.hero} accessibilityRole="progressbar" accessibilityLabel="正在向服务端查询支付结果">
          <StateBear kind="waiting" size={176} />
          <Text style={styles.heroTitle}>{timedOut ? "暂未查询到最终结果" : "支付处理中"}</Text>
          <Text style={styles.heroNote}>{timedOut ? "自动查询已结束，可手动查询或稍后在订单中查看" : "正在向支付渠道确认结果，通常只需几秒"}</Text>
          <Text style={styles.amount}>{formatCent(order.data.payable_amount_cent)}</Text>
        </View>

        <View style={styles.progressCard}>
          <InfoRow label="订单编号" value={order.data.order_no} />
          <InfoRow label="支付方式" value={paymentChannelLabel(payment.data.channel)} />
          <InfoRow label="当前状态" value={timedOut ? "等待重新查询" : `服务端查询中 · 第 ${attempt + 1} 次`} active />
        </View>

        <View style={styles.securityCard}><ShieldIcon size={40} /><Text style={styles.securityText}>支付结果以平台服务端查询为准。即使离开本页，也可以稍后在订单中查看结果。</Text></View>

        {runtimeFlags.enableMockPayment ? <View style={styles.mockPanel}><Text style={styles.mockTitle}>测试支付操作</Text><Text style={styles.mockNote}>以下操作由本地后端写入 Mock 支付状态，不产生真实扣款；结果页仍会重新查询服务端。</Text><Pressable accessibilityRole="button" disabled={Boolean(mockAction)} onPress={() => void runMockAction("success")} style={[styles.mockConfirm, mockAction && styles.disabled]}><Text style={styles.mockConfirmText}>{mockAction === "success" ? "正在提交…" : "模拟服务端支付成功"}</Text></Pressable><View style={styles.mockSecondaryRow}><Pressable accessibilityRole="button" disabled={Boolean(mockAction)} onPress={() => void runMockAction("failed")} style={[styles.mockSecondary, mockAction && styles.disabled]}><Text style={styles.mockSecondaryText}>{mockAction === "failed" ? "提交中…" : "模拟失败"}</Text></Pressable><Pressable accessibilityRole="button" disabled={Boolean(mockAction)} onPress={() => void runMockAction("cancelled")} style={[styles.mockSecondary, mockAction && styles.disabled]}><Text style={styles.mockSecondaryText}>{mockAction === "cancelled" ? "提交中…" : "模拟取消"}</Text></Pressable></View></View> : null}

        <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/orders/[id]", params: { id: orderId } })} style={styles.secondary}><Text style={styles.secondaryText}>稍后查看订单</Text></Pressable><Pressable accessibilityRole="button" disabled={querying} onPress={queryAgain} style={[styles.primary, querying && styles.disabled]}><Text style={styles.primaryText}>{querying ? "正在查询…" : "查询支付结果"}</Text></Pressable></View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProcessingBackdrop() { return <BrandBackdrop />; }

function InfoRow({ label, value, active = false }: { label: string; value: string; active?: boolean }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue, active && styles.infoActive]} numberOfLines={2}>{value}</Text></View>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center", marginLeft: 0, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  headerSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  hero: { alignItems: "center", marginHorizontal: 12, marginVertical: 12, paddingHorizontal: 16, paddingVertical: 20, borderRadius: 10, backgroundColor: "#FFFFFF" },
  orbit: { position: "relative", width: 72, height: 72, marginBottom: 15, borderWidth: 6, borderColor: "#B9DDF6", borderTopColor: "#2F8FE5", borderRadius: 36 },
  dot: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFB83E" },
  dotOne: { top: 3, right: 7 },
  dotTwo: { bottom: 7, left: 5 },
  dotThree: { right: -7, bottom: 17 },
  heroTitle: { color: colors.text, fontSize: 24, lineHeight: 31, fontWeight: "900", textAlign: "center" },
  heroNote: { marginTop: 7, color: "#74767B", fontSize: 12, lineHeight: 18, textAlign: "center" },
  amount: { marginTop: 14, color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: "900" },
  progressCard: { marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  infoRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  infoLabel: { color: "#74767B", fontSize: 12 },
  infoValue: { maxWidth: "65%", color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800", textAlign: "right" },
  infoActive: { color: "#237BBF" },
  securityCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 10, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  securityText: { flex: 1, color: "#74767B", fontSize: 12, lineHeight: 16 },
  mockPanel: { marginHorizontal: 12, marginBottom: 10, padding: 13, borderWidth: 1, borderColor: "#B9DDF6", borderRadius: 17, backgroundColor: "#EDF7FF", ...softShadow },
  mockTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  mockNote: { marginTop: 5, color: "#557188", fontSize: 12, lineHeight: 16 },
  mockConfirm: { height: 46, alignItems: "center", justifyContent: "center", marginTop: 10, borderRadius: 14, backgroundColor: "#2F8FE5" },
  mockConfirmText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  mockSecondaryRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  mockSecondary: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#8CBFE5", borderRadius: 12, backgroundColor: colors.white },
  mockSecondaryText: { color: "#346D99", fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 9, marginHorizontal: 12, marginTop: 12 },
  secondary: { flex: 1, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7CFC3", borderRadius: 15, backgroundColor: colors.white },
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  primary: { flex: 1.2, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.accent },
  primaryText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.55 }
});
