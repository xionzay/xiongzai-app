import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { FileImage } from "@/components/file-image";
import { NativeBackdrop } from "@/components/native-page";
import { OrderTabIcon } from "@/components/tab-icons";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { chatOutboxStore, chatTransport, createSupportCase, useMessages, useSupportCases } from "@/features/chat/chat-api";
import { maxSequence, mergeServerMessages, recoverPendingMessage, shouldPollChat, type LocalMessage } from "@/features/chat/chat-domain";
import { supportStatusCopy } from "@/features/chat/support-domain";
import type { ChatSendScope } from "@/features/chat/chat-send-scope";
import { useChatSendScope } from "@/features/chat/use-chat-send-scope";
import { useOrderDetail } from "@/features/checkout/order-api";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { CursorPage, MessageApiView, OrderDetailApiView, OrderStatus, SupportCaseApiView } from "@/types/api";
import xiongzaiIcon from "../../../assets/xiongzai-icon.png";

const quickIssues = ["支付或扣款问题", "订单与履约问题", "退款/投诉进度", "账号与实名认证"] as const;

const orderStatusCopy: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待付款",
  PENDING_ACCEPT: "待陪玩接单",
  ACCEPTED: "待开始",
  PENDING_SERVICE: "待服务",
  IN_SERVICE: "服务中",
  PENDING_BUYER_CONFIRM: "待确认完成",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  CLOSED: "已关闭",
  SELLER_REJECTED: "陪玩未接单"
};

export function SupportListScreen() {
  const { user } = useAuth();
  const sendScope = useChatSendScope(user?.id ?? "guest");
  const online = useOnlineStatus();
  const polling = shouldPollChat(useAppActivity(), online);
  const cases = useSupportCases(Boolean(user));
  const caseItems = flattenCases(cases.data?.pages ?? []);
  const [createdCase, setCreatedCase] = useState<SupportCaseApiView | null>(null);
  const freshCreatedCase = createdCase ? caseItems.find((item) => item.id === createdCase.id) ?? createdCase : null;
  const selectedCase = freshCreatedCase ?? caseItems.find((item) => item.status !== "CLOSED") ?? caseItems[0] ?? null;
  const conversationId = selectedCase?.conversation_id ?? "";
  const messages = useMessages(conversationId, Boolean(user) && Boolean(conversationId), polling);
  const serverMessages = useMemo(() => mergeServerMessages(messages.data?.pages ?? []), [messages.data?.pages]);
  const orderId = selectedCase?.related_type === "ORDER" ? selectedCase.related_id ?? "" : "";
  const order = useOrderDetail(orderId, Boolean(orderId));
  const [text, setText] = useState("");
  const [localRecord, setLocalRecord] = useState<{ scope: ChatSendScope; conversationId: string; item: LocalMessage } | null>(null);
  const local = localRecord?.scope === sendScope && localRecord.conversationId === conversationId ? localRecord.item : null;
  const [busyScope, setBusyScope] = useState<ChatSendScope | null>(null);
  const busy = busyScope === sendScope;
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    let live = true;
    void chatOutboxStore.read(conversationId)
      .then((value) => { const recovered = recoverPendingMessage(value); if (live) setLocalRecord(recovered ? { scope: sendScope, conversationId, item: recovered } : null); })
      .catch(() => { if (live) setNotice("无法读取待发送记录，请解锁设备后重试。"); });
    return () => { live = false; };
  }, [conversationId, sendScope]);

  useEffect(() => {
    if (!polling || !conversationId || serverMessages.length === 0) return;
    void chatTransport.markRead(conversationId, maxSequence(serverMessages))
      .then(() => Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation-unread"] })
      ]))
      .catch(() => undefined);
  }, [conversationId, polling, serverMessages]);

  const send = async (raw = text, retry?: LocalMessage) => {
    const content = retry?.content ?? raw.trim();
    if (!user || content.length < 2 || busy || !online || selectedCase?.status === "CLOSED") return;
    const operation = sendScope.begin();
    if (!operation) return;
    setBusyScope(sendScope);
    setNotice(null);
    let pending: LocalMessage | undefined;
    let acknowledged = false;
    try {
      if (!selectedCase) {
        const created = await createSupportCase({ topic: content.slice(0, 100), priority: "NORMAL", initial_message: content, source_page: "mobile/support" }, user.id, operation.isCurrent);
        acknowledged = true;
        if (!operation.isCurrent()) return;
        setCreatedCase(created);
        setText("");
        await cases.refetch();
      } else {
        pending = await chatOutboxStore.prepare(conversationId, content);
        if (!operation.isCurrent()) return;
        setLocalRecord({ scope: sendScope, conversationId, item: pending });
        await chatTransport.sendMessage(conversationId, pending.clientMessageId, pending.content);
        acknowledged = true;
        if (!operation.isCurrent()) return;
        setLocalRecord(null);
        setText("");
        await chatOutboxStore.clear(conversationId, pending.clientMessageId);
        if (!operation.isCurrent()) return;
        await Promise.all([messages.refetch(), cases.refetch(), queryClient.invalidateQueries({ queryKey: ["conversations"] })]);
      }
    } catch (error) {
      if (!operation.isCurrent()) return;
      if (acknowledged) {
        setNotice("客服已收到请求，暂未完成本地同步；请勿重复发送，可返回后重新查看。");
        return;
      }
      if (pending) {
        const fallback: LocalMessage = { ...pending, state: "FAILED" };
        const failed = await chatOutboxStore.failed(conversationId, pending).catch(() => fallback);
        if (!operation.isCurrent()) return;
        setLocalRecord({ scope: sendScope, conversationId, item: failed });
      }
      setNotice(error instanceof ApiClientError ? error.message : "客服消息发送失败，请稍后重试");
    } finally {
      operation.finish();
      if (operation.isCurrent()) setBusyScope(null);
    }
  };

  const openRecords = () => {
    if (selectedCase) router.push({ pathname: "/support/[id]", params: { id: selectedCase.id } });
    else setNotice("暂无客服记录，可以直接描述你遇到的问题。");
  };

  const transfer = () => {
    if (!selectedCase) { void send("请求人工客服协助"); return; }
    if (selectedCase.status === "CLOSED") { router.push({ pathname: "/support/[id]", params: { id: selectedCase.id } }); return; }
    router.push({ pathname: "/conversations/[id]", params: { id: selectedCase.conversation_id } });
  };

  const closed = selectedCase?.status === "CLOSED";
  const waiting = selectedCase?.status === "WAITING" || selectedCase?.status === "TRANSFERRED";
  const serving = selectedCase?.status === "SERVING";
  const sendDisabled = !user || text.trim().length < 2 || busy || !online || closed;
  const visibleLocal = local && !serverMessages.some((item) => item.client_message_id === local.clientMessageId) ? local : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <NativeBackdrop />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <SupportHeader subtitle={serving ? "人工客服 · 服务中" : waiting ? "工单排队中" : "订单咨询与问题反馈"} onRecords={openRecords} />
        <SupportStatus supportCase={selectedCase} />
        {notice ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        {!online ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>当前离线，恢复网络后才能发送客服消息。</Text></View> : null}
        <OrderContext order={order.data} loading={Boolean(orderId) && order.isPending} />
        <View style={styles.quickGrid}>
          {quickIssues.map((item) => <Pressable key={item} accessibilityRole="button" disabled={busy || closed || !online} onPress={() => void send(item)} style={({ pressed }) => [styles.quickButton, (busy || closed || !online) && styles.disabled, pressed && styles.pressed]}><Text style={styles.quickText}>{item}</Text></Pressable>)}
        </View>
        {messages.isPending && conversationId ? (
          <View style={styles.messageState}><ActivityIndicator color={colors.brand} /><Text style={styles.messageStateText}>正在加载客服消息…</Text></View>
        ) : (
          <FlatList
            style={styles.messageScroller}
            inverted
            data={serverMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <SupportMessage item={item} mine={item.sender_user_id === user?.id} ownAvatarId={user?.profile?.avatar_file_id ?? null} ownInitial={user?.profile?.nickname?.slice(0, 1) || "我"} />}
            contentContainerStyle={styles.messageList}
            refreshControl={<RefreshControl refreshing={messages.isRefetching && !messages.isFetchingNextPage} onRefresh={() => void Promise.all([messages.refetch(), cases.refetch()])} tintColor={colors.brand} />}
            onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && void messages.fetchNextPage()}
            onEndReachedThreshold={0.2}
            ListHeaderComponent={visibleLocal ? <SupportLocalMessage item={visibleLocal} ownAvatarId={user?.profile?.avatar_file_id ?? null} ownInitial={user?.profile?.nickname?.slice(0, 1) || "我"} onRetry={() => void send(visibleLocal.content, visibleLocal)} /> : null}
            ListFooterComponent={messages.isFetchingNextPage ? <Text style={styles.history}>正在加载历史客服消息…</Text> : null}
          />
        )}
        <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
          <View style={styles.transferRow}>
            <Pressable accessibilityRole="button" disabled={busy || waiting || serving} onPress={transfer} style={({ pressed }) => [styles.transferButton, serving && styles.transferConnected, (busy || waiting || serving) && styles.disabled, pressed && styles.pressed]}><Text style={styles.transferText}>{serving ? "人工客服已接入" : waiting ? "人工客服排队中" : closed ? "重新打开客服工单" : "转人工客服"}</Text></Pressable>
            <Text style={styles.transferNote}>涉及资金或争议的问题将由人工客服处理</Text>
          </View>
          <View style={styles.composer}>
            <TextInput value={text} onChangeText={setText} editable={!busy && !closed} maxLength={500} multiline placeholder={closed ? "请先重新打开客服工单" : "输入问题或订单号…"} placeholderTextColor="#88837B" style={styles.input} accessibilityLabel="客服问题" />
            <Pressable accessibilityRole="button" accessibilityLabel="发送客服消息" accessibilityState={{ disabled: sendDisabled, busy }} disabled={sendDisabled} onPress={() => void send()} style={({ pressed }) => [styles.send, sendDisabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.sendText}>{busy ? "发送中…" : "发送"}</Text></Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SupportHeader({ subtitle, onRecords }: { subtitle: string; onRecords(): void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
      <View style={styles.headerCopy}><Text style={styles.pageTitle}>平台客服</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="客服记录" onPress={onRecords} style={({ pressed }) => [styles.records, pressed && styles.pressed]}><OrderTabIcon color="#171A21" size={34} /></Pressable>
    </View>
  );
}

function SupportStatus({ supportCase }: { supportCase: SupportCaseApiView | null }) {
  const waiting = supportCase?.status === "WAITING" || supportCase?.status === "TRANSFERRED";
  const serving = supportCase?.status === "SERVING";
  const closed = supportCase?.status === "CLOSED";
  return (
    <View style={styles.statusCard}>
      <Image source={xiongzaiIcon} style={styles.supportIcon} />
      <View style={styles.statusCopy}><Text style={styles.statusTitle}>{serving ? "人工客服已接入" : waiting ? "已进入人工客服队列" : closed ? "本次客服会话已结束" : "熊崽客服中心"}</Text><Text style={styles.statusNote}>服务时间 09:00–24:00 · 平台内沟通</Text></View>
      <Text style={styles.statusBadge}>{supportCase ? supportStatusCopy[supportCase.status] : "在线"}</Text>
    </View>
  );
}

function OrderContext({ order, loading }: { order: OrderDetailApiView | undefined; loading: boolean }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeading}><Text style={styles.orderHeadingText}>关联订单</Text><Text style={styles.orderHeadingMeta}>{loading ? "正在读取订单" : order ? orderStatusCopy[order.status] : "尚未关联订单"}</Text></View>
      <View style={styles.orderContent}>
        {order ? <FileImage fileId={order.product_image || null} style={styles.orderCover} label={`${order.product_title}图片`} /> : <View style={[styles.orderCover, styles.orderFallback]}><Text style={styles.orderFallbackText}>单</Text></View>}
        <View style={styles.orderCopy}><Text numberOfLines={1} style={styles.orderTitle}>{loading ? "正在加载关联订单…" : order?.product_title ?? "可在消息中说明相关订单号"}</Text><Text numberOfLines={1} style={styles.orderMeta}>{order ? `${order.order_no} · ${order.sku_name}` : "客服会根据订单号为你查询"}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="查看关联订单" disabled={!order} onPress={() => order && router.push({ pathname: "/orders/[id]", params: { id: order.id } })} style={({ pressed }) => [styles.orderAction, !order && styles.disabled, pressed && styles.pressed]}><Text style={styles.orderActionText}>查看</Text><ChevronRightIcon size={13} color="#2F78BC" /></Pressable>
      </View>
    </View>
  );
}

function SupportMessage({ item, mine, ownAvatarId, ownInitial }: { item: MessageApiView; mine: boolean; ownAvatarId: string | null; ownInitial: string }) {
  if (item.message_type === "SYSTEM") return <View style={styles.systemMessage}><Text style={styles.systemMessageText}>{item.content}</Text></View>;
  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      {!mine ? <Image source={xiongzaiIcon} style={styles.messageAvatar} /> : null}
      <View style={[styles.messageBubble, mine ? styles.mineBubble : styles.supportBubble]}><Text style={[styles.messageText, mine && styles.mineText]}>{item.content}</Text></View>
      {mine ? <UserAvatar fileId={ownAvatarId} initial={ownInitial} /> : null}
    </View>
  );
}

function SupportLocalMessage({ item, ownAvatarId, ownInitial, onRetry }: { item: LocalMessage; ownAvatarId: string | null; ownInitial: string; onRetry(): void }) {
  return (
    <View style={[styles.messageRow, styles.messageRowMine]}>
      <View><View style={[styles.messageBubble, styles.mineBubble, item.state === "FAILED" && styles.failedBubble]}><Text style={styles.mineText}>{item.content}</Text></View>{item.state === "FAILED" ? <Pressable accessibilityRole="button" accessibilityLabel="重试发送客服消息" onPress={onRetry}><Text style={styles.retryMessage}>发送失败 · 点击重试</Text></Pressable> : <Text style={styles.sendingMessage}>发送中…</Text>}</View>
      <UserAvatar fileId={ownAvatarId} initial={ownInitial} />
    </View>
  );
}

function UserAvatar({ fileId, initial }: { fileId: string | null; initial: string }) {
  return fileId ? <FileImage fileId={fileId} style={styles.messageAvatar} label="我的头像" /> : <View style={[styles.messageAvatar, styles.userFallback]}><Text style={styles.userInitial}>{initial}</Text></View>;
}

function flattenCases(pages: CursorPage<SupportCaseApiView>[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.items).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  keyboard: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, minHeight: 60, paddingBottom: 4, height: undefined },
  back: { alignItems: "center", justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  headerCopy: { flex: 1, marginLeft: 0, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, fontSize: 13, lineHeight: 18, textAlign: "center", color: colors.textSecondary },
  records: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  statusCard: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 9, padding: 10, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "#FFF2CF", ...softShadow },
  supportIcon: { width: 48, height: 48, borderRadius: 14 },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  statusNote: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  statusBadge: { overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: "#EAF6D7", color: "#4D7B1D", fontSize: 12, fontWeight: "800" },
  notice: { marginHorizontal: 12, marginBottom: 7, padding: 9, borderWidth: 1, borderColor: "#F2A18A", borderRadius: 12, backgroundColor: "#FFF7F3" },
  noticeText: { color: colors.danger, fontSize: 12, lineHeight: 17, textAlign: "center" },
  orderCard: { marginHorizontal: 12, marginBottom: 9, padding: 10, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  orderHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  orderHeadingText: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  orderHeadingMeta: { color: colors.textSecondary, fontSize: 12 },
  orderContent: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 8 },
  orderCover: { width: 58, height: 48, borderRadius: 9 },
  orderFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#E4F2FF" },
  orderFallbackText: { color: "#2F78BC", fontSize: 15, fontWeight: "900" },
  orderCopy: { flex: 1, minWidth: 0 },
  orderTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  orderMeta: { marginTop: 4, color: colors.accent, fontSize: 12, lineHeight: 16 },
  orderAction: { minWidth: 64, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 11, backgroundColor: "#EAF6FF" },
  orderActionText: { color: "#2F78BC", fontSize: 12, fontWeight: "800" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginHorizontal: 12, marginBottom: 7 },
  quickButton: { width: "48.9%", minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 7, borderWidth: 1, borderColor: "#B7D2E8", borderRadius: 11, backgroundColor: "#F2F8FC" },
  quickText: { color: "#2C638E", fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  messageScroller: { flex: 1, minHeight: 0 },
  messageList: { flexGrow: 1, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  messageState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  messageStateText: { color: colors.textSecondary, fontSize: 12 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 7, marginVertical: 5 },
  messageRowMine: { justifyContent: "flex-end" },
  messageAvatar: { width: 32, height: 32, borderRadius: 11 },
  userFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#E4F2FF" },
  userInitial: { color: "#2F78BC", fontSize: 12, fontWeight: "900" },
  messageBubble: { maxWidth: "72%", paddingHorizontal: 11, paddingVertical: 9, ...softShadow },
  supportBubble: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomRightRadius: 14, borderBottomLeftRadius: 4, backgroundColor: colors.white },
  mineBubble: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 4, backgroundColor: colors.brand },
  failedBubble: { borderWidth: 2, borderColor: "#FF9877" },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  mineText: { color: colors.white, fontSize: 14, lineHeight: 20 },
  systemMessage: { alignSelf: "center", marginVertical: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(111,107,101,0.14)" },
  systemMessageText: { color: colors.textSecondary, fontSize: 12 },
  retryMessage: { minHeight: 44, paddingTop: 7, color: colors.danger, fontSize: 12, fontWeight: "800", textAlign: "right" },
  sendingMessage: { marginTop: 3, color: colors.textSecondary, fontSize: 12, textAlign: "right" },
  history: { paddingVertical: 12, color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  bottomSafe: { backgroundColor: colors.dock, shadowOpacity: 0, elevation: 0, borderTopColor: colors.divider },
  transferRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: colors.dock, shadowOpacity: 0, elevation: 0, borderTopColor: colors.divider },
  transferButton: { minWidth: 110, height: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#8FB8D9", borderRadius: 11, backgroundColor: "#F2F8FC" },
  transferConnected: { borderColor: "#A7CD74", backgroundColor: "#EAF6D7" },
  transferText: { color: "#2C638E", fontSize: 12, fontWeight: "800" },
  transferNote: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  composer: { minHeight: 68, flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 10, shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -6 }, shadowRadius: 18, backgroundColor: colors.dock, shadowOpacity: 0, elevation: 0, borderTopColor: colors.divider },
  input: { flex: 1, maxHeight: 92, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, color: colors.text, lineHeight: 20, backgroundColor: colors.input, borderColor: colors.controlBorder, borderRadius: 10, fontSize: 16, minHeight: 48, shadowOpacity: 0, elevation: 0 },
  send: { width: 66, height: 47, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.brand },
  sendText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 }
});
