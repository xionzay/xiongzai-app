import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { checkoutSessionStore } from "@/auth/runtime";
import { AppScreen } from "@/components/app-screen";
import { StateView } from "@/components/state-view";
import { formatServiceTime, paymentChannelLabel, resolvePaymentOutcome, type PaymentOutcome } from "@/features/checkout/checkout-domain";
import { useOrderDetail, usePayment } from "@/features/checkout/order-api";
import { createOrderConversation } from "@/features/chat/chat-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import { formatCent } from "@/utils/money";
import { MessageActionIcon, ShieldIcon } from "@/components/tab-icons";

const copy: Record<PaymentOutcome, { mark: string; title: string; message: string; tone: "success" | "danger" | "processing" }> = {
  success: { mark: "✓", title: "支付成功", message: "陪玩已收到新订单提醒，请等待接单", tone: "success" },
  failed: { mark: "!", title: "支付失败", message: "服务端未确认支付成功，可以重新发起支付", tone: "danger" },
  cancelled: { mark: "×", title: "已取消支付", message: "本次支付尚未完成，可继续查询支付结果", tone: "danger" },
  closed: { mark: "—", title: "订单已关闭", message: "预约已释放，本次订单无法继续支付", tone: "danger" },
  processing: { mark: "…", title: "支付确认中", message: "暂未获取最终结果，请勿重复付款", tone: "processing" }
};

const pageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const firstStop = 0.55;
  const from = ratio <= firstStop ? [238, 248, 255] : [255, 250, 240];
  const to = ratio <= firstStop ? [255, 250, 240] : [247, 251, 255];
  const progress = ratio <= firstStop ? ratio / firstStop : (ratio - firstStop) / (1 - firstStop);
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function PaymentResultScreen() {
  const { id = "", orderId = "" } = useLocalSearchParams<{ id: string; orderId: string }>();
  const payment = usePayment(id);
  const order = useOrderDetail(orderId);
  const online = useOnlineStatus();
  const [openingChat, setOpeningChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const outcome = resolvePaymentOutcome(payment.data, order.data);

  useEffect(() => {
    if (outcome === "success" || outcome === "closed") void checkoutSessionStore.clear();
  }, [outcome]);

  if (payment.isPending || order.isPending) return <AppScreen><StateView kind="loading" title="正在向服务端确认支付结果" /></AppScreen>;
  if (!online) return <AppScreen><StateView kind="offline" message="恢复网络后必须重新向服务端确认支付结果" onRetry={() => { void payment.refetch(); void order.refetch(); }} /></AppScreen>;
  if (payment.isError || order.isError || !payment.data || !order.data) return <AppScreen><StateView kind="error" title="支付结果查询失败" message="客户端返回参数不能作为支付结果，请重新查询服务端" onRetry={() => { void payment.refetch(); void order.refetch(); }} /></AppScreen>;

  const current = copy[outcome];
  const currentPayment = payment.data;
  const currentOrder = order.data;
  const goOrder = () => router.replace({ pathname: "/orders/[id]", params: { id: orderId } });
  const queryResult = () => router.replace({ pathname: "/payments/[id]/processing", params: { id, orderId } });
  const retryPayment = () => router.replace({ pathname: "/orders/[id]/pay", params: { id: orderId, retry: "1" } });
  const openChat = async () => {
    setOpeningChat(true);
    setChatError(null);
    try {
      const conversation = await createOrderConversation(currentOrder.id);
      router.push({ pathname: "/conversations/[id]", params: { id: conversation.id } });
    } catch (error) {
      setChatError(error instanceof ApiClientError ? error.message : "暂时无法打开订单会话");
    } finally {
      setOpeningChat(false);
    }
  };

  const resultInformation = outcome === "cancelled"
    ? `服务端已确认取消，支付状态：${currentPayment.status}`
    : outcome === "closed"
      ? `服务端订单状态：${currentOrder.status}`
      : `服务端支付状态：${currentPayment.status}`;

  const actions = outcome === "success"
    ? { secondary: "返回首页", onSecondary: () => router.replace("/(buyer-tabs)"), primary: "查看订单", onPrimary: goOrder }
    : outcome === "failed"
      ? { secondary: "查看订单", onSecondary: goOrder, primary: "重新支付", onPrimary: retryPayment }
      : outcome === "closed"
        ? { secondary: "查看订单", onSecondary: goOrder, primary: "重新下单", onPrimary: () => router.replace({ pathname: "/services/[id]", params: { id: currentOrder.product_id } }) }
        : { secondary: "查看订单", onSecondary: goOrder, primary: "继续查询", onPrimary: queryResult };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ResultBackdrop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero} accessibilityRole="summary" accessibilityLabel={current.title}>
          <View style={[styles.mark, current.tone === "success" ? styles.markSuccess : current.tone === "danger" ? styles.markDanger : styles.markProcessing]}><Text style={[styles.markText, current.tone === "success" ? styles.markTextSuccess : current.tone === "danger" ? styles.markTextDanger : styles.markTextProcessing]}>{current.mark}</Text></View>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.message}>{current.message}</Text>
          <Text style={styles.amount}>{formatCent(currentOrder.payable_amount_cent)}</Text>
        </View>

        <View style={styles.orderInfo}>
          <InfoRow label="订单编号" value={currentOrder.order_no} />
          <InfoRow label="支付单号" value={currentPayment.payment_no} />
          <InfoRow label="支付方式" value={paymentChannelLabel(currentPayment.channel)} />
          <InfoRow label="服务陪玩" value={currentOrder.seller_name} />
          <InfoRow label="预约时间" value={formatServiceTime(currentOrder.service_starts_at)} />
          <InfoRow label="结果信息" value={resultInformation} last />
        </View>

        {outcome === "success" ? (
          <View style={styles.tips}>
            <MessageActionIcon color="#2F8FE5" size={40} />
            <View style={styles.tipCopy}><Text style={styles.tipTitle}>可以先联系陪玩</Text><Text style={styles.tipNote}>在平台内确认段位、时间和服务预期</Text>{chatError ? <Text style={styles.errorText}>{chatError}</Text> : null}</View>
            <Pressable accessibilityRole="button" disabled={openingChat} onPress={() => void openChat()} style={[styles.chatButton, openingChat && styles.disabled]}><Text style={styles.chatButtonText}>{openingChat ? "打开中…" : "去沟通"}</Text></Pressable>
          </View>
        ) : (
          <View style={styles.recovery}>
            <ShieldIcon size={40} />
            <View style={styles.recoveryCopy}><Text style={styles.recoveryTitle}>{outcome === "closed" ? "服务没有被扣款" : "请以订单中的支付状态为准"}</Text><Text style={styles.recoveryNote}>{outcome === "closed" ? "本次支付已结束，可以重新选择服务下单" : "平台只认服务端支付结果，不会依据返回页面重复扣款"}</Text></View>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={actions.onSecondary} style={styles.secondary}><Text style={styles.secondaryText}>{actions.secondary}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={actions.onPrimary} style={styles.primary}><Text style={styles.primaryText}>{actions.primary}</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={3}>{value}</Text></View>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EEF8FF" },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 30 },
  hero: { alignItems: "center", paddingTop: 54, paddingHorizontal: 10, paddingBottom: 28 },
  mark: { width: 74, height: 74, alignItems: "center", justifyContent: "center", borderWidth: 7, borderRadius: 24, transform: [{ rotate: "-4deg" }], ...softShadow },
  markSuccess: { borderColor: "#EAFFB1", backgroundColor: "#BFE225" },
  markDanger: { borderColor: "#FFD8C7", backgroundColor: "#FFF0E8" },
  markProcessing: { borderColor: "#C7E7FF", backgroundColor: "#E7F4FF" },
  markText: { fontSize: 37, lineHeight: 43, fontWeight: "900" },
  markTextSuccess: { color: "#3B5510" },
  markTextDanger: { color: "#EA6847" },
  markTextProcessing: { color: "#2F8FE5" },
  title: { marginTop: 17, color: colors.text, fontSize: 28, lineHeight: 35, fontWeight: "900", textAlign: "center" },
  message: { marginTop: 7, color: "#74767B", fontSize: 12, lineHeight: 18, textAlign: "center" },
  amount: { marginTop: 14, color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: "900" },
  orderInfo: { paddingHorizontal: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  infoRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: "#74767B", fontSize: 13, lineHeight: 18 },
  infoValue: { maxWidth: "68%", color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800", textAlign: "right" },
  tips: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 10, padding: 13, borderWidth: 1, borderColor: "#B9DDF6", borderRadius: 17, backgroundColor: "#EDF7FF", ...softShadow },
  tipCopy: { flex: 1 },
  tipTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  tipNote: { marginTop: 3, color: "#557188", fontSize: 12, lineHeight: 16 },
  errorText: { marginTop: 3, color: colors.danger, fontSize: 12, lineHeight: 16 },
  chatButton: { minWidth: 68, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#2F8FE5" },
  chatButtonText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  recovery: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, padding: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  recoveryCopy: { flex: 1 },
  recoveryTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  recoveryNote: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: "row", gap: 9, marginTop: 12 },
  secondary: { flex: 1, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7CFC3", borderRadius: 15, backgroundColor: colors.white },
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  primary: { flex: 1.2, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.accent },
  primaryText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.55 }
});
