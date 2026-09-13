import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppScreen } from "@/components/app-screen";
import { StateView } from "@/components/state-view";
import { orderErrorMessage } from "@/features/checkout/checkout-domain";
import { useOrderDetail } from "@/features/checkout/order-api";
import { useServiceDetail } from "@/features/discovery/discovery-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import { formatCent } from "@/utils/money";

type ExceptionKind = "价格变化" | "服务失效" | "渠道异常";

const categories: ExceptionKind[] = ["价格变化", "服务失效", "渠道异常"];
const serviceCodes = new Set(["ORDER_SERVICE_UNAVAILABLE", "ORDER_SELLER_UNAVAILABLE", "ORDER_SKU_UNAVAILABLE", "ORDER_SLOT_UNAVAILABLE", "ORDER_SLOT_CONFLICT", "ORDER_STATE_INVALID", "RESOURCE_VERSION_CONFLICT"]);

const pageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const firstStop = 0.55;
  const from = ratio <= firstStop ? [238, 248, 255] : [255, 250, 240];
  const to = ratio <= firstStop ? [255, 250, 240] : [247, 251, 255];
  const progress = ratio <= firstStop ? ratio / firstStop : (ratio - firstStop) / (1 - firstStop);
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

function exceptionKind(code: string): ExceptionKind {
  if (code === "ORDER_PRICE_CHANGED") return "价格变化";
  if (serviceCodes.has(code)) return "服务失效";
  return "渠道异常";
}

function exceptionTitle(code: string, kind: ExceptionKind): string {
  if (kind === "价格变化") return "订单金额已更新";
  if (code === "ORDER_SELLER_UNAVAILABLE") return "陪玩暂停接单";
  if (["ORDER_SLOT_UNAVAILABLE", "ORDER_SLOT_CONFLICT"].includes(code)) return "预约时间已失效";
  if (kind === "服务失效") return "当前服务不可购买";
  if (code === "PAYMENT_ALREADY_PAYING") return "已有支付正在确认中";
  if (code === "NETWORK_TIMEOUT") return "网络连接超时";
  return "支付渠道暂时不可用";
}

export function PaymentErrorScreen() {
  const { code = "UNKNOWN", orderId = "" } = useLocalSearchParams<{ code?: string; orderId?: string }>();
  const online = useOnlineStatus();
  const order = useOrderDetail(orderId, Boolean(orderId));
  const kind = exceptionKind(code);
  const service = useServiceDetail(order.data?.product_id ?? "", kind === "价格变化" && Boolean(order.data?.product_id));

  if (!orderId) return <AppScreen><StateView kind="error" title="缺少订单信息" message="请返回订单列表重新进入支付页面" onRetry={() => router.replace("/(buyer-tabs)/orders")} /></AppScreen>;
  if (!online) return <AppScreen><StateView kind="offline" message="恢复网络后重新读取订单与异常状态" onRetry={() => void order.refetch()} /></AppScreen>;
  if (order.isPending) return <AppScreen><StateView kind="loading" title="正在核对订单与支付状态" /></AppScreen>;
  if (order.isError || !order.data) return <AppScreen><StateView kind="error" title="订单信息读取失败" message="不能仅根据客户端错误判断订单状态，请重新查询服务端" onRetry={() => void order.refetch()} /></AppScreen>;

  const current = order.data;
  const latestSku = service.data?.skus.find((item) => item.id === current.sku_id && item.status === "ACTIVE");
  const canRetryPayment = current.available_actions.includes("PAY") && code !== "PAYMENT_ALREADY_PAYING";
  const primaryLabel = kind === "价格变化"
    ? "确认新价格"
    : kind === "服务失效"
      ? "查看其他服务"
      : code === "PAYMENT_ALREADY_PAYING"
        ? "查看支付状态"
        : canRetryPayment
          ? "重新支付"
          : "查看订单状态";
  const primaryAction = () => {
    if (kind === "价格变化") {
      router.replace({ pathname: "/services/[id]", params: { id: current.product_id } });
      return;
    }
    if (kind === "服务失效") {
      router.replace("/(buyer-tabs)");
      return;
    }
    if (canRetryPayment) {
      router.replace({ pathname: "/orders/[id]/pay", params: { id: current.id, retry: "1" } });
      return;
    }
    router.replace({ pathname: "/orders/[id]", params: { id: current.id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ExceptionBackdrop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回支付页" onPress={() => router.back()} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>支付异常处理</Text><Text style={styles.headerSubtitle}>支付前再次核对金额与服务状态</Text></View>
          <View style={styles.headerButton} />
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {categories.map((item) => <View key={item} accessibilityRole="tab" accessibilityState={{ selected: item === kind }} style={[styles.tab, item === kind && styles.tabActive]}><Text style={[styles.tabText, item === kind && styles.tabTextActive]}>{item}</Text></View>)}
        </View>

        <View style={styles.hero} accessibilityRole="alert">
          <View style={styles.alertMark}><Text style={styles.alertMarkText}>!</Text></View>
          <Text style={styles.heroTitle}>{exceptionTitle(code, kind)}</Text>
          <Text style={styles.heroMessage}>{orderErrorMessage(code)}</Text>
        </View>

        <View style={styles.orderCard}>
          <InfoRow label="订单服务" value={current.product_title} />
          <InfoRow label="陪玩" value={current.seller_name} />
          <InfoRow label="原订单金额" value={formatCent(current.payable_amount_cent)} />
          {kind === "价格变化" ? <InfoRow label="最新规格价格" value={latestSku ? `${formatCent(latestSku.price_cent)} / ${latestSku.sku_name}` : service.isPending ? "正在读取…" : "请在服务页重新确认"} changed /> : null}
          <InfoRow label="异常编号" value={code} last />
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/orders/[id]", params: { id: current.id } })} style={styles.secondary}><Text style={styles.secondaryText}>稍后处理</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={primaryAction} style={styles.primary}><Text style={styles.primaryText}>{primaryLabel}</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/support/new", params: { relatedType: "ORDER", relatedId: current.id } })} style={styles.support}><Text style={styles.supportText}>仍有疑问？联系平台客服</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ExceptionBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

function InfoRow({ label, value, changed = false, last = false }: { label: string; value: string; changed?: boolean; last?: boolean }) { return <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue, changed && styles.changedValue]} numberOfLines={3}>{value}</Text></View>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EEF8FF" },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 30 },
  header: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingBottom: 11 },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center" },
  headerTitle: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: "900", textAlign: "center" },
  headerSubtitle: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  tabs: { flexDirection: "row", gap: 7, paddingHorizontal: 14, paddingBottom: 12 },
  tab: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DFD5C5", borderRadius: 12, backgroundColor: "#FFFDF8" },
  tabActive: { borderColor: "#7EB8E8", backgroundColor: "#E7F4FF" },
  tabText: { color: "#77736C", fontSize: 12, fontWeight: "900" },
  tabTextActive: { color: "#2678B7" },
  hero: { alignItems: "center", marginHorizontal: 13, marginBottom: 12, paddingHorizontal: 18, paddingVertical: 22, borderRadius: 20, backgroundColor: "#FFF5E3", ...softShadow },
  alertMark: { width: 48, height: 48, alignItems: "center", justifyContent: "center", marginBottom: 9, borderRadius: 16, backgroundColor: "#FFB14B" },
  alertMarkText: { color: colors.white, fontSize: 25, lineHeight: 30, fontWeight: "900" },
  heroTitle: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: "900", textAlign: "center" },
  heroMessage: { marginTop: 7, color: "#6F6C66", fontSize: 12, lineHeight: 17, textAlign: "center" },
  orderCard: { marginHorizontal: 13, marginBottom: 14, paddingHorizontal: 15, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  infoRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEE5D8" },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: "#727477", fontSize: 12, lineHeight: 16 },
  infoValue: { maxWidth: "65%", color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "900", textAlign: "right" },
  changedValue: { color: colors.accent, fontSize: 18, lineHeight: 23 },
  actions: { flexDirection: "row", gap: 9, paddingHorizontal: 13 },
  secondary: { flex: 1, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7CFC3", borderRadius: 15, backgroundColor: colors.white },
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  primary: { flex: 1.2, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.accent },
  primaryText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  support: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 5 },
  supportText: { color: "#557188", fontSize: 12, fontWeight: "800" }
});
