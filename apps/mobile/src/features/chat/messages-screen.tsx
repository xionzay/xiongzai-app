import { router } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { FileImage } from "@/components/file-image";
import { OrderTabIcon } from "@/components/tab-icons";
import { ChevronRightIcon } from "@/components/ui-icons";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { shouldPollChat } from "@/features/chat/chat-domain";
import { useConversations, useConversationUnread, useNotificationUnread } from "@/features/chat/chat-api";
import { useServiceDetail } from "@/features/discovery/discovery-api";
import { colors } from "@/theme/tokens";
import type { ConversationApiView } from "@/types/api";
import xiongzaiIcon from "../../../assets/xiongzai-icon.png";

const messageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const from = ratio <= 0.56 ? [255, 250, 240] : [255, 253, 247];
  const to = ratio <= 0.56 ? [255, 253, 247] : [248, 241, 231];
  const progress = ratio <= 0.56 ? ratio / 0.56 : (ratio - 0.56) / 0.44;
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function MessagesScreen() {
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const polling = shouldPollChat(useAppActivity(), online);
  const conversations = useConversations(Boolean(user), polling);
  const chatUnread = useConversationUnread(Boolean(user), polling);
  const notificationUnread = useNotificationUnread(Boolean(user), polling);
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => void Promise.all([conversations.refetch(), chatUnread.refetch(), notificationUnread.refetch()]);

  const conversationContent = () => {
    if (status === "booting") return <MessagePanel title="正在加载消息…" message="请稍候，正在恢复账号会话。" />;
    if (!user) return <MessagePanel title="登录后查看消息" message="会话、通知和客服工单属于账号数据" action="去登录" onPress={() => router.push({ pathname: "/(auth)/required", params: { returnTo: "/(buyer-tabs)/messages", action: "查看消息" } })} />;
    if (conversations.isPending) return <MessagePanel title="正在加载会话…" message="正在同步最新文字消息。" />;
    if (conversations.isError) return <MessagePanel failed title="会话加载失败" message="暂时无法连接服务，请稍后重试" action="重试" onPress={() => void conversations.refetch()} />;
    return (
      <>
        <View style={styles.messageList}>{items.map((item, index) => <ConversationRow key={item.id} item={item} last={index === items.length - 1} />)}</View>
        {items.length === 0 ? <MessagePanel title="暂无会话" message="从服务详情发起咨询，或从订单详情进入订单会话。" /> : null}
        {conversations.hasNextPage ? <Pressable accessibilityRole="button" disabled={conversations.isFetchingNextPage} onPress={() => void conversations.fetchNextPage()} style={styles.loadMore}><Text style={styles.loadMoreText}>{conversations.isFetchingNextPage ? "正在加载…" : "加载更多会话"}</Text></Pressable> : null}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <MessageBackdrop />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={conversations.isRefetching && !conversations.isFetchingNextPage} onRefresh={refresh} tintColor={colors.accent} />}>
        <View style={styles.header}><Text style={styles.pageTitle}>消息</Text><Text style={styles.pageSubtitle}>第一阶段仅支持文字聊天</Text></View>
        <MessageEntry icon={<OrderTabIcon color="#FFFFFF" size={36} />} title="系统通知" note="订单、账户与平台消息统一查看" tail={notificationUnread.data?.unread_count ? `${notificationUnread.data.unread_count}` : ""} tone="system" onPress={() => router.push("/notifications")} />
        <MessageEntry icon={<Image source={xiongzaiIcon} style={styles.supportIcon} />} title="平台客服" note="订单、退款、投诉与账号问题" tail="在线" tone="support" onPress={() => router.push("/support")} />
        {!online ? <Text style={styles.offline}>当前离线，恢复网络后会自动同步</Text> : null}
        {conversationContent()}
        <MessagePanel title="交易安全提醒" message="请在平台内沟通与下单，聊天第一阶段仅支持文字，避免发送联系方式或线下交易。" />
      </ScrollView>
    </SafeAreaView>
  );
}

function MessageBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{messageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

function MessageEntry({ icon, title, note, tail, tone, onPress }: { icon: ReactNode; title: string; note: string; tail: string; tone: "system" | "support"; onPress(): void }) {
  const system = tone === "system";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}，${note}`} onPress={onPress} style={({ pressed }) => [styles.entry, system ? styles.systemEntry : styles.supportEntry, pressed && styles.pressed]}>
      <View style={[styles.entryIconWrap, system ? styles.systemIconWrap : styles.supportIconWrap]}>{icon}</View>
      <View style={styles.entryCopy}><Text style={styles.entryTitle}>{title}</Text><Text style={styles.entryNote} numberOfLines={1}>{note}</Text></View>
      <View style={styles.entryTrailing}><Text style={[styles.entryTail, system ? styles.systemTail : styles.supportTail]}>{tail}</Text><ChevronRightIcon size={18} color={system ? colors.accent : "#2C7AB8"} /></View>
    </Pressable>
  );
}

function ConversationRow({ item, last }: { item: ConversationApiView; last: boolean }) {
  const label = item.conversation_type === "ORDER" ? "订单会话" : item.conversation_type === "SUPPORT" ? "平台客服" : "服务咨询";
  const time = item.last_message_at ? new Date(item.last_message_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "新会话";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${item.unread_count}条未读`} onPress={() => router.push({ pathname: "/conversations/[id]", params: { id: item.id } })} style={[styles.row, item.unread_count > 0 && styles.rowUnread, !last && styles.rowBorder]}>
      <ConversationThumbnail item={item} />
      <View style={styles.rowCopy}><View style={styles.rowTop}><Text style={styles.rowTitle} numberOfLines={1}>{label}</Text><Text style={styles.time}>{time}</Text></View><Text style={styles.preview} numberOfLines={1}>{item.last_message_preview ?? "会话已创建"}</Text><Text style={styles.counterpart} numberOfLines={1}>{item.counterpart.nickname}</Text></View>
      {item.unread_count > 0 ? <Text style={styles.badge}>{item.unread_count > 99 ? "99+" : item.unread_count}</Text> : null}
    </Pressable>
  );
}

function ConversationThumbnail({ item }: { item: ConversationApiView }) {
  const service = useServiceDetail(item.product_id ?? "", Boolean(item.product_id));
  const serviceImageFileId = service.data?.cover_file_id
    ?? service.data?.images.find((image) => image.is_cover)?.file_id
    ?? service.data?.images[0]?.file_id
    ?? null;
  const fileId = serviceImageFileId ?? item.counterpart.avatar_file_id;
  if (item.counterpart.kind === "PLATFORM" && !item.product_id) {
    return <Image source={xiongzaiIcon} style={styles.avatar} accessibilityLabel="熊崽平台客服头像" />;
  }
  return <FileImage fileId={fileId} style={styles.avatar} label={item.product_id ? "会话商品图片" : `${item.counterpart.nickname}头像`} />;
}

function MessagePanel({ title, message, failed = false, action, onPress }: { title: string; message: string; failed?: boolean; action?: string; onPress?: () => void }) {
  return <View style={[styles.panel, failed && styles.panelFailed]}><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelMessage}>{message}</Text>{action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.panelAction}><Text style={styles.panelActionText}>{action}</Text></Pressable> : null}</View>;
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFAF0" },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 22 },
  header: { height: 76, justifyContent: "center", paddingHorizontal: 15, paddingBottom: 10 },
  pageTitle: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "800" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  entry: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 18, ...softShadow },
  systemEntry: { borderColor: "rgba(62,57,47,0.11)", backgroundColor: "#EEF8FF" },
  supportEntry: { borderColor: "#B9D9EF", backgroundColor: "#FFF2CF" },
  entryIconWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  systemIconWrap: { backgroundColor: "#4A9BEA" },
  supportIconWrap: { backgroundColor: colors.white },
  supportIcon: { width: 40, height: 40, borderRadius: 12, resizeMode: "cover" },
  entryCopy: { flex: 1 },
  entryTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  entryNote: { marginTop: 4, color: "#7B7D83", fontSize: 12, lineHeight: 16 },
  entryTail: { fontSize: 12, fontWeight: "900" },
  entryTrailing: { flexDirection: "row", alignItems: "center", gap: 7 },
  systemTail: { color: colors.accent },
  supportTail: { color: "#2C7AB8" },
  messageList: { overflow: "hidden", marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "#FFFDF8", ...softShadow },
  row: { position: "relative", minHeight: 88, flexDirection: "row", alignItems: "center", gap: 10 },
  rowUnread: { backgroundColor: "#FFF5ED" },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  avatar: { width: 58, height: 58, borderRadius: 15 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  time: { color: "#7B7D83", fontSize: 12 },
  preview: { marginTop: 7, color: "#7B7D83", fontSize: 12, lineHeight: 16 },
  counterpart: { marginTop: 3, color: "#4A9BEA", fontSize: 12, lineHeight: 16 },
  badge: { position: "absolute", right: 0, bottom: 18, minWidth: 20, height: 20, overflow: "hidden", paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.accent, color: colors.white, fontSize: 12, lineHeight: 20, textAlign: "center" },
  panel: { marginHorizontal: 12, marginBottom: 10, padding: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  panelFailed: { borderColor: "#F2A18A", backgroundColor: "#FFF7F3" },
  panelTitle: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  panelMessage: { marginTop: 6, color: "#7B7D83", fontSize: 12, lineHeight: 16 },
  panelAction: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: 10, paddingHorizontal: 17, borderRadius: 17, backgroundColor: colors.accent },
  panelActionText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  offline: { marginHorizontal: 12, marginBottom: 10, color: colors.danger, fontSize: 12, textAlign: "center" },
  loadMore: { minHeight: 44, alignItems: "center", justifyContent: "center", marginHorizontal: 12, marginBottom: 10, borderRadius: 14, backgroundColor: "#EAF6FF" },
  loadMoreText: { color: "#2C7AB8", fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.76 }
});
