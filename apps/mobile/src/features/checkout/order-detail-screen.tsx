import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { buyerDisplayState, shouldRefreshAfterConflict, type BuyerDisplayState } from "@/features/after-sale/after-sale-domain";
import { formatServiceTime, orderErrorMessage } from "@/features/checkout/checkout-domain";
import { cancelOrder, confirmOrderComplete, useOrderDetail } from "@/features/checkout/order-api";
import { createOrderConversation } from "@/features/chat/chat-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { OrderDetailApiView, OrderStatus, PaymentStatus } from "@/types/api";
import { formatCent } from "@/utils/money";
import { ShieldIcon } from "@/components/tab-icons";

const statusCopy: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待付款", PENDING_ACCEPT: "待陪玩接单", ACCEPTED: "待开始", IN_SERVICE: "服务中", PENDING_BUYER_CONFIRM: "待确认完成", COMPLETED: "已完成", CANCELLED: "已取消", CLOSED: "已关闭", SELLER_REJECTED: "陪玩未接单"
};

const paymentStatusCopy: Record<PaymentStatus, string> = {
  CREATED: "待支付", PAYING: "支付确认中", PAID: "已支付", FAILED: "支付失败", CLOSED: "支付已关闭", REFUNDING: "退款处理中", PARTIALLY_REFUNDED: "部分退款", REFUNDED: "已退款"
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

type ActionItem = { label: string; onPress: () => void; disabled?: boolean };

export function OrderDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const online = useOnlineStatus();
  const order = useOrderDetail(id);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (order.isPending) return <AppScreen><PageHeader title="订单详情" /><StateView kind="loading" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="订单详情" /><StateView kind="offline" onRetry={() => void order.refetch()} /></AppScreen>;
  if (order.isError || !order.data) return <AppScreen><PageHeader title="订单详情" /><StateView kind="error" title="订单加载失败" onRetry={() => void order.refetch()} /></AppScreen>;

  const current = order.data;
  const displayState = buyerDisplayState(current);
  const state = displayStateConfig(displayState, current);
  const activePayment = current.payments.find((item) => ["CREATED", "PAYING"].includes(item.status));
  const lastPaymentFailed = current.payments[0]?.status === "FAILED";
  const chatInMain = ["PENDING_ACCEPT", "ACCEPTED", "IN_SERVICE", "PENDING_BUYER_CONFIRM", "SELLER_REJECTED", "AFTER_SALE"].includes(displayState);
  const complaintInMain = ["IN_SERVICE", "PENDING_BUYER_CONFIRM", "AFTER_SALE"].includes(displayState);

  const performCancel = async () => {
    setCancelling(true);
    setNotice(null);
    try {
      await cancelOrder(current.id, current.version, "买家在付款前取消订单");
      await order.refetch();
      await queryClient.invalidateQueries({ queryKey: ["buyer-orders"] });
    } catch (error) {
      setNotice(orderErrorMessage(error instanceof ApiClientError ? error.code : ""));
    } finally {
      setCancelling(false);
    }
  };

  const confirmComplete = async () => {
    setConfirming(true);
    setNotice(null);
    try {
      await confirmOrderComplete(current.id, current.version);
      await order.refetch();
      await queryClient.invalidateQueries({ queryKey: ["buyer-orders"] });
    } catch (error) {
      if (error instanceof ApiClientError && shouldRefreshAfterConflict(error.code)) {
        await order.refetch();
        setNotice("订单状态刚刚发生变化，已为你刷新。");
      } else {
        setNotice(orderErrorMessage(error instanceof ApiClientError ? error.code : ""));
      }
    } finally {
      setConfirming(false);
    }
  };

  const openChat = async () => {
    setOpeningChat(true);
    setNotice(null);
    try {
      const conversation = await createOrderConversation(current.id);
      router.push({ pathname: "/conversations/[id]", params: { id: conversation.id } });
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message : "暂时无法打开订单会话");
    } finally {
      setOpeningChat(false);
    }
  };

  const askCancel = () => Alert.alert("取消订单", "取消后会释放预约时间，且无法恢复。", [{ text: "继续保留", style: "cancel" }, { text: "确认取消", style: "destructive", onPress: () => void performCancel() }]);
  const askConfirm = () => Alert.alert("确认服务完成", "确认后订单将完成，请核对服务结果。", [{ text: "再等等", style: "cancel" }, { text: "确认完成", onPress: () => void confirmComplete() }]);
  const openComplaint = () => router.push({ pathname: "/complaints/new", params: { orderId: current.id } });
  const openSupport = () => router.push({ pathname: "/support/new", params: { relatedType: "ORDER", relatedId: current.id } });
  const openService = () => router.push({ pathname: "/services/[id]", params: { id: current.product_id } });

  const mainActions: ActionItem[] = [];
  if (current.available_actions.includes("CANCEL")) mainActions.push({ label: cancelling ? "正在取消…" : "取消订单", disabled: cancelling, onPress: askCancel });
  if (current.available_actions.includes("REQUEST_REFUND")) mainActions.push({ label: "申请退款", onPress: () => router.push({ pathname: "/refunds/new", params: { orderId: current.id } }) });
  if (current.available_actions.includes("CREATE_COMPLAINT") && complaintInMain) mainActions.push({ label: "遇到问题", onPress: openComplaint });
  if (chatInMain) mainActions.push({ label: openingChat ? "打开会话…" : "联系陪玩", disabled: openingChat, onPress: () => void openChat() });
  if (current.available_actions.includes("VIEW_SERVICE") && ["ACCEPTED", "COMPLETED", "REVIEWED", "CANCELLED", "CLOSED", "REFUNDED"].includes(displayState)) mainActions.push({ label: "查看服务", onPress: openService });
  if (current.available_actions.includes("VIEW_REFUND") && current.refunds[0]) mainActions.push({ label: "查看退款", onPress: () => router.push({ pathname: "/refunds/[id]", params: { id: current.refunds[0]!.id } }) });
  if (current.available_actions.includes("CREATE_REVIEW")) mainActions.push({ label: "去评价", onPress: () => router.push({ pathname: "/reviews/new", params: { orderId: current.id } }) });
  if (current.available_actions.includes("VIEW_REVIEW") && current.review) mainActions.push({ label: "查看评价", onPress: () => router.push({ pathname: "/reviews/[id]", params: { id: current.review!.id } }) });
  if (current.available_actions.includes("CONFIRM_COMPLETE")) mainActions.push({ label: confirming ? "正在确认…" : "确认完成", disabled: confirming, onPress: askConfirm });
  if (current.available_actions.includes("PAY")) mainActions.push({ label: activePayment ? "查询支付结果" : lastPaymentFailed ? "重新支付" : "继续支付", onPress: () => activePayment ? router.push({ pathname: "/payments/[id]/processing", params: { id: activePayment.id, orderId: current.id } }) : router.push({ pathname: "/orders/[id]/pay", params: { id: current.id, ...(lastPaymentFailed ? { retry: "1" } : {}) } }) });
  if (mainActions.length === 0) mainActions.push({ label: "再次查看服务", onPress: openService });

  const moreAction = current.available_actions.includes("CREATE_COMPLAINT") ? openComplaint : openSupport;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <OrderBackdrop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={order.isRefetching} onRefresh={() => void order.refetch()} tintColor={colors.brand} />}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回订单列表" onPress={() => router.replace("/(buyer-tabs)/orders")} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>订单详情</Text><Text style={styles.headerSubtitle}>订单号 {current.order_no}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="更多订单操作" onPress={moreAction} style={styles.headerButton}><Text style={styles.more}>•••</Text></Pressable>
        </View>

        {notice ? <View style={styles.notice}><NoticeBanner tone="danger" message={notice} /></View> : null}

        <View style={[styles.statusHero, state.soft && styles.statusHeroSoft]} accessibilityRole="summary" accessibilityLabel={`订单状态${state.label}`}>
          <Text style={[styles.statusLabel, state.soft && styles.statusSoftText]}>{state.label}</Text>
          <Text style={[styles.statusTitle, state.soft && styles.statusSoftText]}>{state.title}</Text>
          <Text style={[styles.statusNote, state.soft && styles.statusSoftNote]}>{state.note}</Text>
        </View>

        <OrderTimeline active={state.active} />

        <Pressable accessibilityRole="button" accessibilityLabel={`查看陪玩${current.seller_name}主页`} onPress={() => router.push({ pathname: "/companions/[id]", params: { id: current.seller_id } })} style={styles.sellerCard}>
          <FileImage fileId={current.seller_avatar} style={styles.sellerAvatar} label={`${current.seller_name}头像`} />
          <View style={styles.sellerCopy}><Text style={styles.sellerName}>{current.seller_name}</Text><Text style={styles.sellerNote}>平台认证陪玩 · 交易保障中</Text></View>
          <Text style={styles.sellerLink}>查看陪玩主页 ›</Text>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel={`查看服务${current.product_title}`} onPress={openService} style={styles.serviceCard}>
          <FileImage fileId={current.product_image || null} style={styles.serviceImage} label={`${current.product_title}图片`} />
          <View style={styles.serviceCopy}><Text style={styles.serviceTitle} numberOfLines={2}>{current.product_title}</Text><Text style={styles.serviceMeta}>{current.sku_name} · 约 {current.sku_duration_minutes * current.quantity} 分钟</Text><Text style={styles.serviceTime}>{formatServiceTime(current.service_starts_at)}</Text></View>
          <Text style={styles.servicePrice}>{formatCent(current.payable_amount_cent)}</Text>
        </Pressable>

        <View style={styles.factsCard}>
          <InfoRow label="订单备注" value={current.buyer_note || "未填写"} />
          <InfoRow label="下单时间" value={new Date(current.created_at).toLocaleString("zh-CN")} />
          <InfoRow label="支付状态" value={paymentStatusCopy[current.payment_status]} />
          <InfoRow label="实付金额" value={formatCent(current.paid_amount_cent)} last />
        </View>

        <View style={styles.protectionCard}>
          <ShieldIcon size={42} />
          <View style={styles.protectionCopy}><Text style={styles.protectionTitle}>{["CANCELLED", "CLOSED", "REFUNDED"].includes(displayState) ? "订单记录由平台安全留存" : "平台交易保障中"}</Text><Text style={styles.protectionNote}>请勿绕过平台交易，聊天记录可作为售后处理依据。</Text></View>
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((value) => !value)} style={styles.detailsToggle}><Text style={styles.detailsToggleText}>完整金额与状态记录</Text><Text style={styles.detailsArrow}>{detailsOpen ? "⌃" : "⌄"}</Text></Pressable>
        {detailsOpen ? <View style={styles.detailsCard}><Text style={styles.detailsTitle}>金额明细</Text><InfoRow label="订单金额" value={formatCent(current.total_amount_cent)} /><InfoRow label="优惠" value={formatCent(current.discount_cent)} /><InfoRow label="应付金额" value={formatCent(current.payable_amount_cent)} strong /><InfoRow label="已退款" value={formatCent(current.refunded_amount_cent)} /><InfoRow label="可退金额" value={formatCent(current.available_refund_amount_cent)} last /><Text style={styles.detailsTitle}>状态记录</Text>{current.status_logs.map((log, index) => <View key={`${log.created_at}-${index}`} style={styles.log}><View style={styles.logDot} /><View style={styles.logCopy}><Text style={styles.logTitle}>{statusCopy[log.new_status as OrderStatus] ?? log.new_status}</Text><Text style={styles.logNote}>{log.remark || log.action} · {new Date(log.created_at).toLocaleString("zh-CN")}</Text></View></View>)}</View> : null}

        <View style={styles.actions}>{mainActions.map((action, index) => <Pressable key={action.label} accessibilityRole="button" disabled={action.disabled} onPress={action.onPress} style={[styles.action, index === mainActions.length - 1 && styles.actionPrimary, action.disabled && styles.disabled]}><Text style={[styles.actionText, index === mainActions.length - 1 && styles.actionPrimaryText]}>{action.label}</Text></Pressable>)}</View>

        <View style={styles.toolsCard}>
          {!chatInMain ? <ToolRow label={openingChat ? "正在打开订单会话…" : "联系陪玩"} onPress={() => void openChat()} disabled={openingChat} /> : null}
          {current.available_actions.includes("CREATE_COMPLAINT") && !complaintInMain ? <ToolRow label="提交投诉或申请平台介入" onPress={openComplaint} /> : null}
          <ToolRow label="联系平台客服" onPress={openSupport} />
          {current.complaints.map((item) => <ToolRow key={item.id} label={`查看投诉：${item.complaint_no}`} onPress={() => router.push({ pathname: "/complaints/[id]", params: { id: item.id } })} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function displayStateConfig(state: BuyerDisplayState, order: OrderDetailApiView): { label: string; title: string; note: string; active: number; soft?: boolean } {
  const progress = timelineProgress(order.status);
  const config: Record<BuyerDisplayState, { label: string; title: string; note: string; active: number; soft?: boolean }> = {
    PENDING_PAYMENT: { label: "待付款", title: "请尽快完成支付", note: `请在 ${new Date(order.expires_at).toLocaleString("zh-CN")} 前完成支付，超时订单将自动关闭`, active: -1 },
    PENDING_ACCEPT: { label: "等待陪玩接单", title: "订单已发送给陪玩", note: "支付已由服务端确认，陪玩接单后会更新订单状态", active: 0 },
    ACCEPTED: { label: "陪玩已接单 · 待开始", title: `预约${formatServiceTime(order.service_starts_at)}开始`, note: "陪玩已锁定本次预约时段，开始前可以继续确认段位和需求", active: 1, soft: true },
    IN_SERVICE: { label: "服务进行中", title: "已按约定时间开始服务", note: "如遇履约问题，请保留平台聊天记录并及时联系陪玩", active: 2 },
    PENDING_BUYER_CONFIRM: { label: "等待确认完成", title: "请确认本次服务结果", note: "确认后订单完成，平台将进入收益结算", active: 3 },
    COMPLETED: { label: "订单已完成", title: "本次服务等待评价", note: "每个完成订单只能提交一次真实评价", active: 3 },
    REVIEWED: { label: "订单已完成", title: "评价已经提交", note: "可以查看评价详情或再次查看该服务", active: 3 },
    CANCELLED: { label: "订单已取消", title: "订单未进入服务", note: "预约已经释放，如仍需要服务可以重新下单", active: progress },
    CLOSED: { label: "订单已关闭", title: "订单已结束", note: "订单已超时或状态发生变化，不会重复产生扣款", active: progress },
    SELLER_REJECTED: { label: "陪玩未接单", title: "订单已停止履约", note: "如已支付，退款将按平台规则原路退回", active: progress },
    AFTER_SALE: { label: "售后处理中", title: "退款或售后正在处理", note: "请在退款与投诉详情中查看双方响应和平台处理进度", active: progress },
    REFUNDED: { label: "订单已退款", title: "退款指令已经完成", note: "到账时间以支付渠道为准，平台将安全保留完整订单记录", active: progress }
  };
  return config[state];
}

function timelineProgress(status: OrderStatus): number {
  return ({ PENDING_PAYMENT: -1, PENDING_ACCEPT: 0, ACCEPTED: 1, IN_SERVICE: 2, PENDING_BUYER_CONFIRM: 3, COMPLETED: 3, CANCELLED: -1, CLOSED: -1, SELLER_REJECTED: 0 } as Record<OrderStatus, number>)[status];
}

function OrderBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

function OrderTimeline({ active }: { active: number }) {
  return <View style={styles.timeline}>{["已付款", "陪玩接单", "开始服务", "买家确认"].map((item, index) => { const done = index <= active; return <View key={item} style={styles.timelineStep}>{index < 3 ? <View style={[styles.timelineLine, index < active && styles.timelineLineDone]} /> : null}<View style={[styles.timelineMark, done && styles.timelineMarkDone]}><Text style={[styles.timelineMarkText, done && styles.timelineMarkTextDone]}>{index < active ? "✓" : index + 1}</Text></View><Text style={styles.timelineLabel}>{item}</Text></View>; })}</View>;
}

function InfoRow({ label, value, strong = false, last = false }: { label: string; value: string; strong?: boolean; last?: boolean }) { return <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue, strong && styles.infoStrong]} numberOfLines={3}>{value}</Text></View>; }

function ToolRow({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.toolRow, disabled && styles.disabled]}><Text style={styles.toolText}>{label}</Text><ChevronRightIcon size={20} /></Pressable>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;
const card = { borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EEF8FF" },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 28 },
  header: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingBottom: 11 },
  headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  more: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "900", letterSpacing: 1 },
  headerCopy: { flex: 1, alignItems: "center" },
  headerTitle: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "900", textAlign: "center" },
  headerSubtitle: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  notice: { marginHorizontal: 12, marginBottom: 10 },
  statusHero: { marginHorizontal: 12, marginBottom: 10, padding: 20, borderRadius: 20, backgroundColor: "#367FBC", ...softShadow },
  statusHeroSoft: { backgroundColor: "#EBF4E9" },
  statusLabel: { color: colors.white, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  statusTitle: { marginTop: 7, color: colors.white, fontSize: 25, lineHeight: 32, fontWeight: "900" },
  statusNote: { marginTop: 5, color: "#E2F2FF", fontSize: 12, lineHeight: 18 },
  statusSoftText: { color: colors.text },
  statusSoftNote: { color: "#6F756B" },
  timeline: { flexDirection: "row", marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 6, paddingTop: 15, paddingBottom: 12, ...card },
  timelineStep: { position: "relative", flex: 1, alignItems: "center" },
  timelineLine: { position: "absolute", zIndex: 0, left: "50%", top: 12, width: "100%", height: 2, backgroundColor: "#D9D4CC" },
  timelineLineDone: { backgroundColor: "#BADF28" },
  timelineMark: { zIndex: 2, width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#E5DFD6" },
  timelineMarkDone: { backgroundColor: "#BADF28" },
  timelineMarkText: { color: "#777777", fontSize: 12, fontWeight: "900" },
  timelineMarkTextDone: { color: "#34470F" },
  timelineLabel: { marginTop: 6, color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  sellerCard: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 12, marginBottom: 10, padding: 11, ...card },
  sellerAvatar: { width: 52, height: 52, borderRadius: 18 },
  sellerCopy: { flex: 1 },
  sellerName: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  sellerNote: { marginTop: 4, color: "#74767B", fontSize: 12, lineHeight: 16 },
  sellerLink: { color: "#3277B2", fontSize: 12, lineHeight: 16, fontWeight: "800", textAlign: "right" },
  serviceCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 10, padding: 10, ...card },
  serviceImage: { width: 100, height: 100, borderRadius: 13 },
  serviceCopy: { minWidth: 0, flex: 1 },
  serviceTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "900" },
  serviceMeta: { marginTop: 6, color: "#74767B", fontSize: 12, lineHeight: 17 },
  serviceTime: { marginTop: 6, color: "#5947AD", fontSize: 12, lineHeight: 17 },
  servicePrice: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "900" },
  factsCard: { marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 15, ...card },
  infoRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: "#74767B", fontSize: 13, lineHeight: 18 },
  infoValue: { maxWidth: "66%", color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900", textAlign: "right" },
  infoStrong: { color: colors.accent, fontSize: 16 },
  protectionCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 10, padding: 13, ...card },
  protectionCopy: { flex: 1 },
  protectionTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  protectionNote: { marginTop: 4, color: "#74767B", fontSize: 12, lineHeight: 18 },
  detailsToggle: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 12, paddingHorizontal: 15, ...card },
  detailsToggleText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  detailsArrow: { color: "#3277B2", fontSize: 18, fontWeight: "900" },
  detailsCard: { marginHorizontal: 12, marginTop: 8, paddingHorizontal: 15, paddingBottom: 8, ...card },
  detailsTitle: { marginTop: 15, marginBottom: 4, color: colors.text, fontSize: 14, fontWeight: "900" },
  log: { flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  logDot: { width: 10, height: 10, marginTop: 4, borderWidth: 2, borderColor: colors.white, borderRadius: 5, backgroundColor: colors.brand },
  logCopy: { flex: 1 },
  logTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  logNote: { marginTop: 4, color: "#74767B", fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 10 },
  action: { minWidth: 104, flexGrow: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D4CBC0", borderRadius: 14, paddingHorizontal: 11, backgroundColor: colors.white },
  actionPrimary: { borderWidth: 0, backgroundColor: colors.accent },
  actionText: { color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  actionPrimaryText: { color: colors.white },
  disabled: { opacity: 0.55 },
  toolsCard: { marginHorizontal: 12, paddingHorizontal: 14, ...card },
  toolRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  toolText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  toolArrow: { color: "#74767B", fontSize: 20 }
});
