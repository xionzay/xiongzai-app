import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import * as Crypto from "expo-crypto";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { checkoutSessionStore } from "@/auth/runtime";
import { AppScreen } from "@/components/app-screen";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { runtimeFlags } from "@/config/runtime-flags";
import { acceptPolicies, usePolicies } from "@/features/account/account-api";
import { PolicyConfirmationList } from "@/features/account/policy-confirmation-list";
import { allPoliciesConfirmed } from "@/features/account/policy-confirmation-domain";
import { canPayOrder, SingleFlight } from "@/features/checkout/checkout-domain";
import { createPayment, useOrderDetail } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import { formatCent } from "@/utils/money";
import type { PaymentChannel } from "@xiongzai/contracts";
import { ShieldIcon } from "@/components/tab-icons";



export function PaymentScreen() {
  const { id = "", retry } = useLocalSearchParams<{ id: string; retry?: string }>();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const order = useOrderDetail(id);
  const transactionPolicies = usePolicies("ORDER_PAYMENT");
  const [now, setNow] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<PaymentChannel>("WECHAT_APP");
  const [confirmedPolicyIds, setConfirmedPolicyIds] = useState<string[]>([]);
  const [policyNotice, setPolicyNotice] = useState<string | null>(null);
  const flight = useRef(new SingleFlight()).current;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const seconds = useMemo(() => order.data && now > 0 ? Math.max(0, Math.ceil((new Date(order.data.expires_at).getTime() - now) / 1_000)) : null, [now, order.data]);
  if (order.isPending) return <AppScreen><PageHeader title="收银台" /><StateView kind="loading" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="收银台" /><StateView kind="offline" onRetry={() => void order.refetch()} /></AppScreen>;
  if (order.isError || !order.data) return <AppScreen><PageHeader title="收银台" /><StateView kind="error" title="订单加载失败" onRetry={() => void order.refetch()} /></AppScreen>;

  const current = order.data;
  const activePayment = current.payments.find((item) => ["CREATED", "PAYING"].includes(item.status));
  const retryPayment = retry === "1" ? [...current.payments].reverse().find((item) => ["FAILED", "CLOSED"].includes(item.status)) : undefined;
  const paymentChannel = activePayment?.channel ?? retryPayment?.channel ?? selectedChannel;
  const payable = canPayOrder(current) && (seconds === null || seconds > 0) && runtimeFlags.enableMockPayment;
  const policiesConfirmed = allPoliciesConfirmed(transactionPolicies.data, confirmedPolicyIds);
  const canSubmitPayment = payable && (Boolean(activePayment) || policiesConfirmed);
  const countdown = seconds === null ? "--:--" : `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const expiresTime = new Date(current.expires_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

  const submit = () => {
    if (flight.busy || !user || !canSubmitPayment) return;
    if (activePayment) {
      router.replace({ pathname: "/payments/[id]/processing", params: { id: activePayment.id, orderId: current.id } });
      return;
    }
    void flight.run(async () => {
      setSubmitting(true);
      setPolicyNotice(null);
      try {
        await acceptPolicies(confirmedPolicyIds, "ORDER_PAYMENT");
        const createKey = () => `payment-${Crypto.randomUUID()}`;
        const session = retry === "1"
          ? await checkoutSessionStore.rotatePaymentIntent(current.id, paymentChannel, createKey).catch(() => checkoutSessionStore.getOrCreatePaymentIntent(user.id, current.id, paymentChannel, createKey))
          : await checkoutSessionStore.getOrCreatePaymentIntent(user.id, current.id, paymentChannel, createKey);
        const payment = await createPayment(current.id, paymentChannel, session.paymentKey!);
        await checkoutSessionStore.attachPayment(payment.id);
        router.replace({ pathname: "/payments/[id]/processing", params: { id: payment.id, orderId: current.id } });
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : "UNKNOWN";
        if (code.startsWith("POLICY_")) {
          setConfirmedPolicyIds([]);
          setPolicyNotice("交易规则已更新或暂时不可用，请刷新并重新逐份确认。协议不可用时不会创建支付。");
          await transactionPolicies.refetch();
        } else {
          router.push({ pathname: "/payment-error", params: { code, orderId: current.id } });
        }
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <PaymentBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>收银台</Text><Text style={styles.headerSubtitle}>请在 {expiresTime} 前完成支付</Text></View>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>订单应付</Text>
          <Text style={styles.amount} accessibilityLabel={`应付金额${formatCent(current.payable_amount_cent)}`}>{formatCent(current.payable_amount_cent)}</Text>
          <Text style={[styles.guarantee, seconds !== null && seconds <= 60 && styles.urgent]} accessibilityLiveRegion="polite">熊崽电竞平台交易保障 · 剩余 {countdown}</Text>
        </View>

        <View style={styles.orderCard}><View style={styles.orderCopy}><Text style={styles.orderTitle} numberOfLines={2}>{current.product_title}</Text><Text style={styles.orderNo}>订单号 {current.order_no}</Text></View><Text style={styles.orderPrice}>{formatCent(current.payable_amount_cent)}</Text></View>

        {runtimeFlags.enableMockPayment ? <View style={styles.methods} accessibilityRole="radiogroup"><Text style={styles.sectionTitle}>选择支付方式</Text><NoticeBanner message="测试支付，不会真实扣款。微信支付和支付宝支付均由本地后端 Mock；失败后重试会保持原支付渠道，并继续使用幂等保护。" />{(["WECHAT_APP", "ALIPAY_APP"] as const).map((channel) => { const checked = paymentChannel === channel; const wechat = channel === "WECHAT_APP"; const channelLocked = Boolean(activePayment || retryPayment); return <Pressable key={channel} accessibilityRole="radio" accessibilityLabel={`${wechat ? "微信支付" : "支付宝支付"}，测试支付，不会真实扣款`} accessibilityState={{ checked, disabled: channelLocked }} disabled={channelLocked} onPress={() => setSelectedChannel(channel)} style={[styles.method, checked && styles.methodSelected]}><View style={[styles.methodMark, wechat ? styles.wechatMark : styles.alipayMark]}><Text style={styles.methodMarkText}>{wechat ? "微" : "支"}</Text></View><View style={styles.methodCopy}><Text style={styles.methodTitle}>{wechat ? "微信支付" : "支付宝支付"}<Text style={styles.testTag}> · 测试</Text></Text><Text style={styles.methodNote}>{retryPayment && checked ? "失败重试保持此渠道，使用新的稳定幂等支付意图" : "本地 Mock 渠道，不产生真实扣款"}</Text></View><View style={[styles.check, !checked && styles.checkEmpty]}>{checked ? <Text style={styles.checkText}><JellyIcon kind="check" label="已选" /></Text> : null}</View></Pressable>; })}</View> : <NoticeBanner tone="danger" message="当前构建未配置可用支付渠道，已禁止创建支付。" />}

        {!activePayment ? <View style={styles.policyWrap}><PolicyConfirmationList title="交易与售后规则确认" hint="创建支付前必须保存当前已发布版本的接受记录。" policies={transactionPolicies.data} isPending={transactionPolicies.isPending} isError={transactionPolicies.isError} confirmedIds={confirmedPolicyIds} disabled={submitting} onChange={setConfirmedPolicyIds} onRetry={() => void transactionPolicies.refetch()} /></View> : null}
        {policyNotice ? <View style={styles.policyWrap}><NoticeBanner tone="danger" message={policyNotice} /></View> : null}

        <View style={styles.securityCard}><ShieldIcon size={40} /><Text style={styles.securityText}>付款资金由平台保障。服务完成并经买家确认后，平台再结算给陪玩；支付结果只以服务端查询为准。</Text></View>

        {!payable && runtimeFlags.enableMockPayment ? <NoticeBanner tone="danger" message={current.payment_status === "PAID" ? "订单已经支付，不能重复支付。" : "订单已关闭或超过支付时间，不能继续支付。"} /> : null}

        <Pressable accessibilityRole="button" accessibilityLabel={activePayment ? "查询原测试支付结果" : `确认测试支付${formatCent(current.payable_amount_cent)}`} disabled={!canSubmitPayment || submitting} onPress={submit} style={[styles.payButton, (!canSubmitPayment || submitting) && styles.payDisabled]}><Text style={styles.payText}>{submitting ? "正在创建测试支付…" : activePayment ? "查询原测试支付结果" : policiesConfirmed ? `确认测试支付 ${formatCent(current.payable_amount_cent)}` : "请先在线确认交易规则"}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/orders/[id]", params: { id: current.id } })} style={styles.later}><Text style={styles.laterText}>暂不支付，查看订单</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function PaymentBackdrop() { return <BrandBackdrop />; }

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 20 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center", marginLeft: 0, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  headerSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  amountSection: { alignItems: "center", paddingHorizontal: 12, paddingTop: 13, paddingBottom: 24 },
  amountLabel: { color: "#74767B", fontSize: 12 },
  amount: { marginVertical: 8, color: colors.text, fontSize: 42, lineHeight: 50, fontWeight: "900" },
  guarantee: { color: "#3479B5", fontSize: 12, fontWeight: "700" },
  urgent: { color: colors.danger },
  orderCard: { minHeight: 74, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 12, marginBottom: 10, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  orderCopy: { flex: 1 },
  orderTitle: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  orderNo: { marginTop: 4, color: "#74767B", fontSize: 12 },
  orderPrice: { color: colors.accent, fontSize: 16, fontWeight: "900" },
  methods: { marginHorizontal: 12, marginBottom: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, backgroundColor: "transparent" },
  sectionTitle: { minHeight: 38, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  method: { minHeight: 67, flexDirection: "row", alignItems: "center", gap: 10 },
  methodSelected: { borderRadius: 14, backgroundColor: "#F4FAFF" },
  methodMark: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#32C875" },
  wechatMark: { backgroundColor: "#20B863" },
  alipayMark: { backgroundColor: "#1677FF" },
  methodMarkText: { color: colors.white, fontSize: 16, fontWeight: "900" },
  methodCopy: { flex: 1 },
  methodTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  testTag: { color: colors.danger, fontSize: 12, fontWeight: "900" },
  methodNote: { marginTop: 4, color: "#74767B", fontSize: 12, lineHeight: 16 },
  check: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.accent, borderRadius: 11, backgroundColor: colors.accent },
  checkText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  checkEmpty: { borderColor: "#BBB8B0", backgroundColor: "transparent" },
  securityCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 10, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  policyWrap: { marginHorizontal: 12, marginBottom: 10 },
  securityText: { flex: 1, color: "#74767B", fontSize: 12, lineHeight: 16 },
  payButton: { height: 52, alignItems: "center", justifyContent: "center", marginHorizontal: 12, marginTop: 5, borderRadius: 17, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 5 },
  payDisabled: { backgroundColor: "#C9C8C4", shadowOpacity: 0 },
  payText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  later: { minHeight: 46, alignItems: "center", justifyContent: "center", marginHorizontal: 12, marginTop: 4 },
  laterText: { color: "#74767B", fontSize: 12, fontWeight: "700" }
});
