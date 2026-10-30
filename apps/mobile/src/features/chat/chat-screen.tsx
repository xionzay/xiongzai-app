import { ChatBackdrop } from "@/components/chat-backdrop";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatControlIcon } from "@/components/chat-control-icon";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { FileImage } from "@/components/file-image";
import xiongzaiAvatar from "../../../assets/xiongzai-icon.png";
import { chatOutboxStore, chatTransport, useConversation, useMessages } from "@/features/chat/chat-api";
import { maxSequence, mergeServerMessages, recoverPendingMessage, sentMessageState, shouldPollChat, type LocalMessage, type ChatMedia } from "@/features/chat/chat-domain";
import type { ChatSendScope } from "@/features/chat/chat-send-scope";
import { useChatSendScope } from "@/features/chat/use-chat-send-scope";
import { useServiceDetail } from "@/features/discovery/discovery-api";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import { approvedLayout } from "@/theme/approved-layout";
import type { MessageApiView } from "@/types/api";
import { getBearSticker, bearStickerSummary } from "@xiongzai/contracts/bear-stickers";
import { StickerPanel, StickerPicture } from "@/features/chat/sticker-panel";
import { ChatMediaPanel } from "@/features/chat/chat-media-panel";
import { ChatMediaMessage } from "@/features/chat/chat-media-message";


export function ChatScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const sendScope = useChatSendScope(`${user?.id ?? "guest"}:${id}`);
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
  const [localRecord, setLocalRecord] = useState<{ scope: ChatSendScope; item: LocalMessage } | null>(null);
  const local = localRecord?.scope === sendScope ? localRecord.item : null;
  const [busyScope, setBusyScope] = useState<ChatSendScope | null>(null);
  const busy = busyScope === sendScope;
  const [notice, setNotice] = useState<string | null>(null);
  const serverMessages = useMemo(() => mergeServerMessages(messages.data?.pages ?? []), [messages.data?.pages]);
  const latestOwnMessageId = serverMessages.find((item) => item.sender_user_id === user?.id)?.id ?? null;

  useEffect(() => {
    if (!conversation.isSuccess) return;
    let live = true;
    void chatOutboxStore.read(id)
      .then((value) => { const recovered = recoverPendingMessage(value); if (live) setLocalRecord(recovered ? { scope: sendScope, item: recovered } : null); })
      .catch(() => { if (live) setNotice("无法读取待发送记录，请解锁设备后重试。"); });
    return () => { live = false; };
  }, [conversation.isSuccess, id, sendScope]);

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

  const send = useCallback(async (retry?: LocalMessage, selectedStickerId?: string, selectedMedia?: ChatMedia): Promise<boolean> => {
    const media = retry?.media ?? selectedMedia;
    const stickerId = retry?.stickerId ?? selectedStickerId;
    const sticker = stickerId ? getBearSticker(stickerId) : undefined;
    if (stickerId && !sticker) { setNotice("表情暂不可用，请重新选择"); return false; }
    const content = retry?.content ?? (media ? media.type === "IMAGE" ? "[图片]" : "[语音]" : sticker ? bearStickerSummary(sticker) : text.trim());
    if (!user || !content || !online || !conversation.data?.can_send) return false;
    const operation = sendScope.begin();
    if (!operation) return false;
    setBusyScope(sendScope);
    setNotice(null);
    let pending: LocalMessage | undefined;
    let acknowledged = false;
    try {
      pending = media ? await chatOutboxStore.prepare(id, content, undefined, media) : await chatOutboxStore.prepare(id, content, stickerId);
      if (!operation.isCurrent()) return false;
      setLocalRecord({ scope: sendScope, item: pending });
      await chatTransport.sendMessage(id, pending.clientMessageId, pending.content, pending.stickerId, pending.media);
      acknowledged = true;
      if (!operation.isCurrent()) return true;
      setLocalRecord(null);
      if (!stickerId && !media) setText("");
      await chatOutboxStore.clear(id, pending.clientMessageId);
      if (!operation.isCurrent()) return true;
      await Promise.all([
        messages.refetch(),
        conversation.refetch(),
        queryClient.invalidateQueries({ queryKey: ["conversations"] })
      ]);
      return true;
    } catch (error) {
      if (!operation.isCurrent()) return acknowledged;
      if (acknowledged) {
        setNotice("消息已由服务端接收，暂未完成本地同步；请勿重复发送，可返回后重新查看。");
        return true;
      }
      if (!pending) {
        setNotice("无法安全保存待发送消息，本次未发送；请解锁设备后重试。");
        return false;
      }
      const fallback: LocalMessage = { ...pending, state: "FAILED" };
      const failed = await chatOutboxStore.failed(id, pending).catch(() => fallback);
      if (!operation.isCurrent()) return false;
      setLocalRecord({ scope: sendScope, item: failed });
      setNotice(error instanceof ApiClientError ? error.message : "消息发送失败，请恢复网络后原位重试");
      return false;
    } finally {
      operation.finish();
      if (operation.isCurrent()) setBusyScope(null);
    }
  }, [conversation, id, messages, online, sendScope, text, user]);

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
  const title = current.conversation_type === "ORDER" ? "订单会话" : current.conversation_type === "SUPPORT" ? "平台客服" : "商品咨询";
  const disabled = !text.trim() || !online || !current.can_send || busy;
  const visibleLocal = local && !serverMessages.some((item) => item.client_message_id === local.clientMessageId) ? local : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ChatBackdrop />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ChatHeader title={title} profileLabel={target.nickname} avatarId={target.avatar_file_id} onProfile={openProfile} />
        <View style={styles.security}><ChatControlIcon kind="shield" size={14} /><Text style={styles.securityText}>请在平台内沟通，保障交易安全</Text></View>
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
            ListHeaderComponent={visibleLocal ? <LocalBubble item={visibleLocal} avatarId={user.profile?.avatar_file_id ?? null} initial={user.profile?.nickname?.slice(0, 1) || "我"} onRetry={() => void send(visibleLocal)} /> : null}
            ListFooterComponent={messages.isFetchingNextPage ? <Text style={styles.history}>正在加载历史消息…</Text> : null}
          />
        )}
        {productId ? <ServiceContext productId={productId} title={service.data?.title} coverFileId={serviceCoverFileId} loading={service.isPending} /> : null}
        <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
          <View style={styles.composer}>
            <ChatMediaPanel key={`voice:${user.id}:${id}`} trigger="voice" disabled={!online || !current.can_send || busy} onSend={media => send(undefined, undefined, media)} />
            <TextInput
              value={text}
              onChangeText={setText}
              editable={current.can_send && !busy}
              maxLength={500}
              multiline
              placeholder={current.can_send ? "输入消息…" : "当前不可发送"}
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              accessibilityLabel="消息内容"
            />
            <StickerPanel key={id} conversation={current} disabled={!online || !current.can_send || busy} onSend={async (stickerId) => { await send(undefined, stickerId); }} />
            {text.trim() || busy ? <Pressable accessibilityRole="button" accessibilityLabel="发送消息" accessibilityState={{ disabled, busy }} disabled={disabled} onPress={() => void send()} style={({ pressed }) => [styles.send, disabled && styles.sendDisabled, pressed && styles.pressed]}><Text style={styles.sendText}>{busy ? "发送中…" : "发送"}</Text></Pressable> : <ChatMediaPanel key={`more:${user.id}:${id}`} trigger="more" disabled={!online || !current.can_send || busy} onSend={media => send(undefined, undefined, media)} />}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatHeader({ title, profileLabel, avatarId, onProfile }: { title: string; profileLabel: string; avatarId?: string | null; onProfile?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChatControlIcon kind="back" size={23} /></Pressable>
      <Pressable accessibilityRole={onProfile ? "button" : undefined} accessibilityLabel={onProfile ? `查看${profileLabel}公开主页` : title} disabled={!onProfile} onPress={onProfile} style={({ pressed }) => [styles.profileAction, pressed && styles.pressed]}>{avatarId ? <FileImage fileId={avatarId} style={styles.avatar} label={profileLabel} compact /> : <Image source={xiongzaiAvatar} style={styles.avatar} accessible={false} />}</Pressable>
      <View style={styles.headerCopy}><Text style={styles.pageTitle} numberOfLines={1}>{profileLabel}</Text></View>
    </View>
  );
}

function MessageBubble({ item, mine, showDeliveryStatus, ownAvatarId, ownInitial, targetAvatarId, targetInitial }: { item: MessageApiView; mine: boolean; showDeliveryStatus: boolean; ownAvatarId: string | null; ownInitial: string; targetAvatarId: string | null; targetInitial: string }) {
  if (item.message_type === "SYSTEM") return <View style={styles.system}><Text style={styles.systemText}>{item.content}</Text></View>;
  return (
    <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
      {!mine ? <ChatAvatar fileId={targetAvatarId} initial={targetInitial} label="对方头像" /> : null}
      <View style={[styles.bubbleWrap, mine && styles.mineWrap]}>
        <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirsBubble, item.message_type === "STICKER" && styles.stickerBubble]}>{item.message_type === "STICKER" ? <StickerPicture key={item.id} id={item.sticker?.id} /> : item.message_type === "IMAGE" || item.message_type === "VOICE" ? <ChatMediaMessage item={item} /> : <Text style={[styles.messageBody, mine && styles.mineText]}>{item.content}</Text>}</View>
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
    : <Image source={xiongzaiAvatar} style={styles.avatar} accessibilityLabel={`${label}（${initial}的默认头像）`} />;
}

function deliveryStateLabel(item: MessageApiView) {
  const state = sentMessageState(item);
  return state === "READ" ? "已读" : state === "FAILED" ? "发送失败" : "已发送";
}

function ServiceContext({ productId, title, coverFileId, loading }: { productId: string; title?: string; coverFileId?: string | null; loading: boolean }) {
  return (
    <View style={styles.serviceCard}>
      <FileImage fileId={coverFileId} style={styles.serviceCover} label="咨询中的服务" compact />
      <View style={styles.serviceCopy}><Text numberOfLines={2} style={styles.serviceTitle}>{loading ? "正在加载关联服务…" : title ?? "关联服务"}</Text><Text style={styles.serviceNote}>商品状态与价格以详情页为准</Text></View>
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
  bottomSafe: { backgroundColor: colors.surfaceBlue },
  keyboard: { flex: 1 },
  messageScroller: { flex: 1, minHeight: 0 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", marginHorizontal: 6, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { flex: 1, justifyContent: "center", marginLeft: 8 },
  pageTitle: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: "700" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  profileAction: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  security: { minHeight: 24, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", marginHorizontal: 13, marginBottom: 8, paddingHorizontal: 10 },
  securityText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  alert: { marginHorizontal: 13, marginBottom: 7, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: "#F2A18A", borderRadius: 11, backgroundColor: "#FFF7F3" },
  alertText: { color: colors.danger, fontSize: 12, lineHeight: 16, textAlign: "center" },
  messageList: { flexGrow: 1, paddingHorizontal: 15, paddingVertical: 6 },
  messageRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 7, marginVertical: 8 },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  bubbleWrap: { maxWidth: "72%", alignItems: "flex-start" },
  mineWrap: { alignItems: "flex-end" },
  bubble: { paddingHorizontal: 12, paddingVertical: 10 },
  mineBubble: { borderTopLeftRadius: 15, borderTopRightRadius: 4, borderBottomLeftRadius: 15, borderBottomRightRadius: 15, backgroundColor: approvedLayout.chatBubble },
  theirsBubble: { borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 4, borderBottomRightRadius: 15, backgroundColor: colors.white },
  localBubble: { borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 15, borderBottomRightRadius: 4, backgroundColor: "#DFF1FF" },
  localBubbleText: { color: colors.text, fontSize: 16, lineHeight: 24 },
  failedBubble: { borderWidth: 2, borderColor: "#FF9877", backgroundColor: "#DFF1FF" },
  messageBody: { color: colors.text, fontSize: 16, lineHeight: 24 },
  mineText: { color: approvedLayout.chatInk, fontSize: 16, lineHeight: 24 },
  stickerBubble: { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: "transparent" },
  messageMeta: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  mineMeta: { textAlign: "right" },
  failedMeta: { color: colors.danger, fontWeight: "800" },
  retryMessage: { marginTop: 2, color: "#D9481D", fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "right" },
  avatar: { width: 40, height: 40, borderRadius: 20 },
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
  serviceAction: { minWidth: 48, height: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.surfaceBlue },
  serviceActionText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  composer: { minHeight: 58, flexDirection: "row", alignItems: "flex-end", gap: 0, paddingHorizontal: 4, paddingVertical: 5, backgroundColor: "rgba(234,246,255,0.94)", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white, color: colors.text, fontSize: 16, lineHeight: 24 },
  send: { minWidth: 54, minHeight: 48, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.brandDeep },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: colors.white, fontSize: 14, fontWeight: "700" },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.accent },
  retryText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  pageState: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, padding: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.12)", borderRadius: 18, backgroundColor: "#FFFDF8", ...softShadow },
  pageStateFailed: { borderColor: "#F2A18A", backgroundColor: "#FFF7F3" },
  pageStateCopy: { flex: 1 },
  pageStateTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  pageStateMessage: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.72 }
});
