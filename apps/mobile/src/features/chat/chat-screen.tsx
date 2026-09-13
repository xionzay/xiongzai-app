import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { FileImage } from "@/components/file-image";
import { MineTabIcon } from "@/components/tab-icons";
import { chatOutboxStore, chatTransport, useConversation, useMessages } from "@/features/chat/chat-api";
import { maxSequence, mergeServerMessages, sentMessageState, shouldPollChat, type LocalMessage } from "@/features/chat/chat-domain";
import { useServiceDetail } from "@/features/discovery/discovery-api";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { MessageApiView } from "@/types/api";

const backgroundBands = Array.from({ length: 58 }, (_, index) => {
  const ratio = index / 57;
  const from = ratio <= 0.34 ? [214, 236, 255] : [248, 241, 231];
  const to = ratio <= 0.34 ? [248, 241, 231] : [255, 250, 240];
  const progress = ratio <= 0.34 ? ratio / 0.34 : (ratio - 0.34) / 0.66;
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function ChatScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const appState = useAppActivity();
  const polling = shouldPollChat(appState, online);
  const conversation = useConversation(id, Boolean(user), polling);
  const messages = useMessages(id, Boolean(user) && conversation.isSuccess, polling);
  const productId = conversation.data?.product_id ?? "";
  const service = useServiceDetail(productId, Boolean(productId));
  const serviceCoverFileId = service.data?.cover_file_id
    ?? service.data?.images.find((image) => image.is_cover)?.file_id
    ?? service.data?.images[0]?.file_id
    ?? null;
  const [text, setText] = useState("");
  const [local, setLocal] = useState<LocalMessage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const serverMessages = useMemo(() => mergeServerMessages(messages.data?.pages ?? []), [messages.data?.pages]);
  const latestOwnMessageId = serverMessages.find((item) => item.sender_user_id === user?.id)?.id ?? null;

  useEffect(() => {
    if (!conversation.isSuccess) return;
    let live = true;
    void chatOutboxStore.read(id).then((value) => { if (live) setLocal(value); });
    return () => { live = false; };
  }, [conversation.isSuccess, id]);

  useEffect(() => {
    if (!polling || serverMessages.length === 0) return;
    const sequence = maxSequence(serverMessages);
    void chatTransport.markRead(id, sequence)
      .then(() => Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation-unread"] })
      ]))
      .catch(() => undefined);
  }, [id, polling, serverMessages]);

  const send = useCallback(async (retry?: LocalMessage) => {
    const content = retry?.content ?? text.trim();
    if (!content || !online || !conversation.data?.can_send) return;
    setNotice(null);
    const pending = retry ? { ...retry, state: "SENDING" as const } : await chatOutboxStore.prepare(id, content);
    setLocal(pending);
    try {
      await chatTransport.sendMessage(id, pending.clientMessageId, pending.content);
      await chatOutboxStore.clear(id);
      setLocal(null);
      setText("");
      await Promise.all([
        messages.refetch(),
        conversation.refetch(),
        queryClient.invalidateQueries({ queryKey: ["conversations"] })
      ]);
    } catch (error) {
      const failed = await chatOutboxStore.failed(id, pending);
      setLocal(failed);
      setNotice(error instanceof ApiClientError ? error.message : "消息发送失败，请恢复网络后原位重试");
    }
  }, [conversation, id, messages, online, text]);

  if (!user) return <ChatPageState title="需要登录" message="登录后才能查看平台文字会话。" />;
  if (conversation.isPending) return <ChatPageState loading title="正在加载会话" message="正在同步会话成员和消息权限。" />;
  if (conversation.isError || !conversation.data) return <ChatPageState failed title="无法访问会话" message="会话不存在、已删除，或当前账号没有权限。" action="重新加载" onPress={() => void conversation.refetch()} />;

  const current = conversation.data;
  const target = current.counterpart;
  const openProfile = target.kind === "SELLER" && target.seller_id
    ? () => router.push({ pathname: "/companions/[id]", params: { id: target.seller_id! } })
    : target.kind === "BUYER" && target.user_id
      ? () => router.push({ pathname: "/users/[id]", params: { id: target.user_id! } })
      : undefined;
  const title = current.conversation_type === "ORDER" ? "订单会话" : current.conversation_type === "SUPPORT" ? "平台客服" : "服务咨询";
  const disabled = !text.trim() || !online || !current.can_send || local?.state === "SENDING";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ChatBackdrop />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ChatHeader title={title} profileLabel={target.nickname} onProfile={openProfile} />
        <View style={styles.security}><Text style={styles.securityText}>交易沟通请留在平台内 · 仅支持文字消息</Text></View>
        {!online ? <ChatAlert message="当前离线，已停止同步；恢复网络后会自动刷新。" /> : null}
        {notice ? <ChatAlert message={notice} /> : null}
        {!current.can_send ? <ChatAlert message={current.send_block_reason ?? "当前会话只能查看历史消息"} /> : null}
        {messages.isPending ? (
          <View style={styles.listState}><ActivityIndicator color={colors.brand} /><Text style={styles.listStateText}>正在加载消息…</Text></View>
        ) : messages.isError ? (
          <View style={styles.listState}><Text style={styles.listStateTitle}>消息加载失败</Text><Pressable accessibilityRole="button" onPress={() => void messages.refetch()} style={styles.retry}><Text style={styles.retryText}>重新加载</Text></Pressable></View>
        ) : (
          <FlatList
            style={styles.messageScroller}
            inverted
            data={serverMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                item={item}
                mine={item.sender_user_id === user.id}
                showDeliveryStatus={item.id === latestOwnMessageId}
                ownAvatarId={user.profile?.avatar_file_id ?? null}
                ownInitial={user.profile?.nickname?.slice(0, 1) || "我"}
                targetAvatarId={target.avatar_file_id}
                targetInitial={target.nickname.slice(0, 1) || "熊"}
              />
            )}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && void messages.fetchNextPage()}
            onEndReachedThreshold={0.2}
            ListHeaderComponent={local ? <LocalBubble item={local} avatarId={user.profile?.avatar_file_id ?? null} initial={user.profile?.nickname?.slice(0, 1) || "我"} onRetry={() => void send(local)} /> : null}
            ListFooterComponent={messages.isFetchingNextPage ? <Text style={styles.history}>正在加载历史消息…</Text> : null}
          />
        )}
        {productId ? <ServiceContext productId={productId} title={service.data?.title} coverFileId={serviceCoverFileId} loading={service.isPending} /> : null}
        <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              editable={current.can_send && local?.state !== "SENDING"}
              maxLength={500}
              multiline
              placeholder={current.can_send ? "输入文字消息…" : "当前不可发送"}
              placeholderTextColor="#88837B"
              style={styles.input}
              accessibilityLabel="消息内容"
            />
            <Pressable accessibilityRole="button" accessibilityLabel="发送消息" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void send()} style={({ pressed }) => [styles.send, disabled && styles.sendDisabled, pressed && styles.pressed]}><Text style={styles.sendText}>发送</Text></Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatBackdrop() {
  return <View pointerEvents="none" style={styles.backdrop}>{backgroundBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>;
}

function ChatHeader({ title, profileLabel, onProfile }: { title: string; profileLabel: string; onProfile?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
      <View style={styles.headerCopy}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>平台文字会话 · 全程留痕</Text></View>
      <Pressable accessibilityRole={onProfile ? "button" : undefined} accessibilityLabel={onProfile ? `查看${profileLabel}公开主页` : "平台客服"} disabled={!onProfile} onPress={onProfile} style={({ pressed }) => [styles.profileAction, pressed && styles.pressed]}><MineTabIcon color="#171A21" size={32} /></Pressable>
    </View>
  );
}

function MessageBubble({ item, mine, showDeliveryStatus, ownAvatarId, ownInitial, targetAvatarId, targetInitial }: { item: MessageApiView; mine: boolean; showDeliveryStatus: boolean; ownAvatarId: string | null; ownInitial: string; targetAvatarId: string | null; targetInitial: string }) {
  if (item.message_type === "SYSTEM") return <View style={styles.system}><Text style={styles.systemText}>{item.content}</Text></View>;
  return (
    <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
      {!mine ? <ChatAvatar fileId={targetAvatarId} initial={targetInitial} label="对方头像" /> : null}
      <View style={[styles.bubbleWrap, mine && styles.mineWrap]}>
        <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirsBubble]}><Text style={[styles.messageBody, mine && styles.mineText]}>{item.content}</Text></View>
        <Text style={[styles.messageMeta, mine && styles.mineMeta]}>{new Date(item.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}{mine && showDeliveryStatus ? ` · ${deliveryStateLabel(item)}` : ""}</Text>
      </View>
      {mine ? <ChatAvatar fileId={ownAvatarId} initial={ownInitial} label="我的头像" /> : null}
    </View>
  );
}

function LocalBubble({ item, avatarId, initial, onRetry }: { item: LocalMessage; avatarId: string | null; initial: string; onRetry(): void }) {
  return (
    <View style={[styles.messageRow, styles.messageRowMine]}>
      <View style={[styles.bubbleWrap, styles.mineWrap]}>
        <View style={[styles.bubble, styles.localBubble, item.state === "FAILED" && styles.failedBubble]}><Text style={styles.localBubbleText}>{item.content}</Text></View>
        {item.state === "FAILED" ? <><Text style={[styles.messageMeta, styles.mineMeta, styles.failedMeta]}>发送失败</Text><Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="重试发送消息"><Text style={styles.retryMessage}>点击重试</Text></Pressable></> : <Text style={[styles.messageMeta, styles.mineMeta]}>发送中…</Text>}
      </View>
      <ChatAvatar fileId={avatarId} initial={initial} label="我的头像" />
    </View>
  );
}

function ChatAvatar({ fileId, initial, label }: { fileId: string | null; initial: string; label: string }) {
  return fileId
    ? <FileImage fileId={fileId} style={styles.avatar} label={label} />
    : <View accessibilityRole="image" accessibilityLabel={label} style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarInitial}>{initial}</Text></View>;
}

function deliveryStateLabel(item: MessageApiView) {
  const state = sentMessageState(item);
  return state === "READ" ? "已读" : state === "FAILED" ? "发送失败" : "已发送";
}

function ServiceContext({ productId, title, coverFileId, loading }: { productId: string; title?: string; coverFileId?: string | null; loading: boolean }) {
  return (
    <View style={styles.serviceCard}>
      <FileImage fileId={coverFileId} style={styles.serviceCover} label="咨询中的服务" />
      <View style={styles.serviceCopy}><Text numberOfLines={2} style={styles.serviceTitle}>{loading ? "正在加载关联服务…" : title ?? "关联服务"}</Text><Text style={styles.serviceNote}>平台担保交易 · 可直接下单</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="查看服务" onPress={() => router.push({ pathname: "/services/[id]", params: { id: productId } })} style={({ pressed }) => [styles.serviceAction, pressed && styles.pressed]}><Text style={styles.serviceActionText}>查看</Text></Pressable>
    </View>
  );
}

function ChatAlert({ message }: { message: string }) {
  return <View accessibilityRole="alert" style={styles.alert}><Text style={styles.alertText}>{message}</Text></View>;
}

function ChatPageState({ title, message, loading = false, failed = false, action, onPress }: { title: string; message: string; loading?: boolean; failed?: boolean; action?: string; onPress?: () => void }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <ChatBackdrop />
      <ChatHeader title="文字会话" profileLabel="平台客服" />
      <View style={[styles.pageState, failed && styles.pageStateFailed]}>
        {loading ? <ActivityIndicator color={colors.brand} /> : null}
        <View style={styles.pageStateCopy}><Text style={styles.pageStateTitle}>{title}</Text><Text style={styles.pageStateMessage}>{message}</Text></View>
        {action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.retry}><Text style={styles.retryText}>{action}</Text></Pressable> : null}
      </View>
    </SafeAreaView>
  );
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#D6ECFF" },
  bottomSafe: { backgroundColor: "#FFFCF5" },
  keyboard: { flex: 1 },
  messageScroller: { flex: 1, minHeight: 0 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  header: { minHeight: 76, flexDirection: "row", alignItems: "center", marginHorizontal: 12, paddingBottom: 7 },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 14, backgroundColor: "#FFFDF8", ...softShadow },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { flex: 1, justifyContent: "center", marginLeft: 11 },
  pageTitle: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: "800" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  profileAction: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  security: { minHeight: 28, justifyContent: "center", marginHorizontal: 13, marginBottom: 8, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "#FFF5C8" },
  securityText: { color: "#7B6C39", fontSize: 12, lineHeight: 16, textAlign: "center" },
  alert: { marginHorizontal: 13, marginBottom: 7, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: "#F2A18A", borderRadius: 11, backgroundColor: "#FFF7F3" },
  alertText: { color: colors.danger, fontSize: 12, lineHeight: 16, textAlign: "center" },
  messageList: { flexGrow: 1, paddingHorizontal: 15, paddingVertical: 6 },
  messageRow: { width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 7, marginVertical: 6 },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  bubbleWrap: { maxWidth: "72%", alignItems: "flex-start" },
  mineWrap: { alignItems: "flex-end" },
  bubble: { paddingHorizontal: 12, paddingVertical: 10, ...softShadow },
  mineBubble: { borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 15, borderBottomRightRadius: 4, backgroundColor: colors.accent },
  theirsBubble: { borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 4, borderBottomRightRadius: 15, backgroundColor: colors.white },
  localBubble: { borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 15, borderBottomRightRadius: 4, backgroundColor: "#DFF1FF" },
  localBubbleText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  failedBubble: { borderWidth: 2, borderColor: "#FF9877", backgroundColor: "#DFF1FF" },
  messageBody: { color: colors.text, fontSize: 12, lineHeight: 18 },
  mineText: { color: colors.white, fontSize: 12, lineHeight: 18 },
  messageMeta: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  mineMeta: { textAlign: "right" },
  failedMeta: { color: colors.danger, fontWeight: "800" },
  retryMessage: { marginTop: 2, color: "#D9481D", fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "right" },
  avatar: { width: 34, height: 34, borderRadius: 12 },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#E4F2FF" },
  avatarInitial: { color: "#2F78BC", fontSize: 13, fontWeight: "900" },
  system: { alignSelf: "center", marginVertical: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(111,107,101,0.14)" },
  systemText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  history: { paddingVertical: 10, color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  listState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 },
  listStateTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  listStateText: { color: colors.textSecondary, fontSize: 12 },
  serviceCard: { minHeight: 63, flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginBottom: 8, padding: 7, borderWidth: 1, borderColor: "rgba(62,57,47,0.12)", borderRadius: 14, backgroundColor: "#FFFDF8", ...softShadow },
  serviceCover: { width: 65, height: 47, borderRadius: 9 },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceTitle: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  serviceNote: { marginTop: 3, color: colors.accent, fontSize: 12, lineHeight: 16 },
  serviceAction: { minWidth: 48, height: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.lime },
  serviceActionText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  composer: { minHeight: 58, flexDirection: "row", alignItems: "flex-end", gap: 7, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 7, backgroundColor: "rgba(255,252,245,0.98)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.07, shadowRadius: 18, elevation: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 96, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(62,57,47,0.14)", borderRadius: 12, backgroundColor: "#F5F1EA", color: colors.text, fontSize: 13, lineHeight: 18 },
  send: { width: 58, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.accent },
  retryText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  pageState: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, padding: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.12)", borderRadius: 18, backgroundColor: "#FFFDF8", ...softShadow },
  pageStateFailed: { borderColor: "#F2A18A", backgroundColor: "#FFF7F3" },
  pageStateCopy: { flex: 1 },
  pageStateTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  pageStateMessage: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.72 }
});
