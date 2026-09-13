import { useMemo, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { afterSaleIntentStore } from "@/auth/runtime";
import { AppScreen } from "@/components/app-screen";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { createRefund } from "@/features/after-sale/after-sale-api";
import { isRefundAmountAllowed, parseYuanToCent } from "@/features/after-sale/after-sale-domain";
import { useOrderDetail } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import { formatCent } from "@/utils/money";

const reasons = ["陪玩长时间未接单", "预约时间无法履约", "服务与描述不符", "双方协商一致", "其他原因"] as const;

const pageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const firstStop = 0.55;
  const from = ratio <= firstStop ? [238, 248, 255] : [255, 250, 240];
  const to = ratio <= firstStop ? [255, 250, 240] : [247, 251, 255];
  const progress = ratio <= firstStop ? ratio / firstStop : (ratio - firstStop) / (1 - firstStop);
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function RefundCreateScreen() {
  const { orderId = "" } = useLocalSearchParams<{ orderId: string }>();
  const online = useOnlineStatus();
  const order = useOrderDetail(orderId);
  const [amount, setAmount] = useState<string | null>(null);
  const [reason, setReason] = useState<(typeof reasons)[number]>(reasons[0]);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const amountValue = amount ?? (order.data ? centToInput(order.data.available_refund_amount_cent) : "");
  const amountCent = useMemo(() => parseYuanToCent(amountValue), [amountValue]);

  if (!online) return <AppScreen><PageHeader title="申请退款" /><StateView kind="offline" message="恢复网络后重新读取订单可退金额" onRetry={() => void order.refetch()} /></AppScreen>;
  if (order.isPending) return <AppScreen><PageHeader title="申请退款" /><StateView kind="loading" /></AppScreen>;
  if (!order.data || order.isError) return <AppScreen><PageHeader title="申请退款" /><StateView kind="error" onRetry={() => void order.refetch()} /></AppScreen>;

  const current = order.data;
  const allowed = current.available_actions.includes("REQUEST_REFUND");
  const amountError = amountValue.length > 0 && !isRefundAmountAllowed(amountCent, current.available_refund_amount_cent)
    ? "请输入大于 0 且不超过可退金额的数值，最多两位小数"
    : null;
  const valid = allowed && isRefundAmountAllowed(amountCent, current.available_refund_amount_cent) && reason.trim().length >= 2;

  const submit = async () => {
    if (!valid || !amountCent || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const fingerprint = `${orderId}:${amountCent}:${reason.trim()}:${description.trim()}`;
      const intentKey = await afterSaleIntentStore.refundKey(fingerprint);
      const result = await createRefund({ order_id: orderId, amount_cent: amountCent, reason_code: "BUYER_REQUEST", reason_text: reason.trim(), ...(description.trim() ? { description: description.trim() } : {}) }, intentKey);
      await afterSaleIntentStore.clearRefund();
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["order", orderId] }), queryClient.invalidateQueries({ queryKey: ["buyer-orders"] })]);
      router.replace({ pathname: "/refunds/[id]", params: { id: result.id } });
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message : "退款申请提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <RefundBackdrop />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回订单详情" onPress={() => router.replace({ pathname: "/orders/[id]", params: { id: orderId } })} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
            <View style={styles.headerCopy}><Text style={styles.headerTitle}>申请退款</Text><Text style={styles.headerSubtitle}>订单 {current.order_no}</Text></View>
            <View style={styles.headerButton} />
          </View>

          {notice ? <View style={styles.notice}><NoticeBanner tone="danger" message={notice} /></View> : null}

          <View style={styles.amountHero} accessibilityRole="summary" accessibilityLabel={`本次最多可退${formatCent(current.available_refund_amount_cent)}`}>
            <Text style={styles.amountLabel}>本次最多可退</Text>
            <Text style={styles.amountValue}>{formatCent(current.available_refund_amount_cent)}</Text>
            <Text style={styles.amountNote}>退款将原路返回支付账户</Text>
          </View>

          {!allowed ? <View style={styles.notice}><NoticeBanner tone="danger" message="当前订单状态不允许申请退款，请返回订单详情刷新状态。" /></View> : null}

          <View style={[styles.formCard, reasonOpen && styles.formCardOpen]}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>本次退款金额</Text>
              <View style={[styles.amountInputWrap, amountError && styles.inputError]}><Text style={styles.yuan}>¥</Text><TextInput accessibilityLabel="退款金额（元）" value={amountValue} onChangeText={setAmount} editable={allowed && !submitting} keyboardType="decimal-pad" placeholder="例如 29.90" placeholderTextColor="#9A9892" style={styles.amountInput} /></View>
              <Text style={[styles.fieldHelp, amountError && styles.fieldError]}>{amountError ?? "默认申请全部可退金额，也可以修改为部分退款"}</Text>
            </View>

            <View style={[styles.reasonField, reasonOpen && styles.reasonFieldOpen]}>
              <Text style={styles.fieldLabel}>退款原因</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: reasonOpen }} disabled={!allowed || submitting} onPress={() => setReasonOpen((value) => !value)} style={[styles.reasonButton, reasonOpen && styles.reasonButtonOpen]}><Text style={styles.reasonButtonText}>{reason}</Text><Text style={[styles.reasonArrow, reasonOpen && styles.reasonArrowOpen]}>⌄</Text></Pressable>
              {reasonOpen ? <View accessibilityRole="list" style={styles.reasonMenu}>{reasons.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === reason }} onPress={() => { setReason(item); setReasonOpen(false); }} style={[styles.reasonOption, item === reason && styles.reasonOptionActive]}><Text style={[styles.reasonOptionText, item === reason && styles.reasonOptionTextActive]}>{item}</Text><View style={[styles.reasonCheck, item !== reason && styles.reasonCheckEmpty]}><Text style={styles.reasonCheckText}>{item === reason ? "✓" : ""}</Text></View></Pressable>)}</View> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>补充说明</Text>
              <TextInput accessibilityLabel="退款补充说明" value={description} onChangeText={setDescription} editable={allowed && !submitting} multiline maxLength={200} placeholder="请描述退款原因，便于陪玩和平台处理" placeholderTextColor="#9A9892" textAlignVertical="top" style={styles.description} />
              <Text style={styles.counter}>{description.length}/200</Text>
            </View>
          </View>

          <View style={styles.ruleCard}><Text style={styles.ruleTitle}>退款规则</Text><Text style={styles.ruleText}>同一订单可存在多次历史部分退款，但同时只能处理一笔；累计退款不会超过实付金额。</Text></View>

          <Pressable accessibilityRole="button" accessibilityLabel="提交退款申请" disabled={!valid || submitting} onPress={() => void submit()} style={[styles.submit, (!valid || submitting) && styles.disabled]}><Text style={styles.submitText}>{submitting ? "正在提交…" : "提交退款申请"}</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function centToInput(value: string): string {
  const cents = BigInt(value);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function RefundBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;
const card = { borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EEF8FF" },
  flex: { flex: 1 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 30 },
  header: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingBottom: 11 },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center" },
  headerTitle: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "900", textAlign: "center" },
  headerSubtitle: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  notice: { marginHorizontal: 12, marginBottom: 10 },
  amountHero: { marginHorizontal: 12, marginBottom: 10, padding: 20, borderRadius: 20, backgroundColor: "#3A86C2", ...softShadow },
  amountLabel: { color: colors.white, fontSize: 12, lineHeight: 16 },
  amountValue: { marginVertical: 6, color: colors.white, fontSize: 31, lineHeight: 38, fontWeight: "900" },
  amountNote: { color: "#E3F3FF", fontSize: 12, lineHeight: 16 },
  formCard: { position: "relative", zIndex: 2, marginHorizontal: 12, marginBottom: 10, padding: 15, ...card },
  formCardOpen: { zIndex: 30, elevation: 20 },
  field: { position: "relative", marginBottom: 18 },
  fieldLabel: { marginBottom: 8, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  amountInputWrap: { height: 50, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#D8D1C6", borderRadius: 15, paddingHorizontal: 14, backgroundColor: "#F7F3EC" },
  yuan: { marginRight: 7, color: colors.accent, fontSize: 18, fontWeight: "900" },
  amountInput: { flex: 1, height: 48, paddingVertical: 0, color: colors.text, fontSize: 15, fontWeight: "800" },
  inputError: { borderColor: colors.danger },
  fieldHelp: { marginTop: 6, color: "#74767B", fontSize: 12, lineHeight: 16 },
  fieldError: { color: colors.danger },
  reasonField: { position: "relative", zIndex: 3, marginBottom: 18 },
  reasonFieldOpen: { zIndex: 50, elevation: 22 },
  reasonButton: { position: "relative", height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 2, borderColor: "#B9D8EE", borderRadius: 15, paddingHorizontal: 14, backgroundColor: "#F7FCFF" },
  reasonButtonOpen: { borderColor: "#77B4E0" },
  reasonButtonText: { color: "#26333D", fontSize: 13, fontWeight: "900" },
  reasonArrow: { color: "#377FB8", fontSize: 20, fontWeight: "900" },
  reasonArrowOpen: { transform: [{ rotate: "180deg" }] },
  reasonMenu: { position: "absolute", zIndex: 60, top: 82, left: 0, right: 0, borderWidth: 2, borderColor: "#77B4E0", borderRadius: 18, padding: 7, backgroundColor: "#FFFAF0", shadowColor: "#2F597B", shadowOffset: { width: 0, height: 17 }, shadowOpacity: 0.2, shadowRadius: 30, elevation: 24 },
  reasonOption: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 11, paddingHorizontal: 11 },
  reasonOptionActive: { backgroundColor: "#E3F3FF" },
  reasonOptionText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  reasonOptionTextActive: { color: "#2678B7" },
  reasonCheck: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#BADF28" },
  reasonCheckEmpty: { backgroundColor: "transparent" },
  reasonCheckText: { color: "#33460C", fontSize: 12, fontWeight: "900" },
  description: { minHeight: 105, borderWidth: 1, borderColor: "#D8D1C6", borderRadius: 15, padding: 13, paddingBottom: 28, backgroundColor: "#F7F3EC", color: colors.text, fontSize: 13, lineHeight: 19 },
  counter: { position: "absolute", right: 11, bottom: 8, color: "#74767B", fontSize: 12 },
  ruleCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card },
  ruleTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "900" },
  ruleText: { marginTop: 10, color: "#74767B", fontSize: 12, lineHeight: 17 },
  submit: { minHeight: 50, alignItems: "center", justifyContent: "center", marginHorizontal: 12, marginTop: 5, marginBottom: 18, borderRadius: 16, backgroundColor: colors.accent, shadowColor: "#FF4F15", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 4 },
  submitText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.48 }
});
