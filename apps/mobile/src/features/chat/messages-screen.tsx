import { useState } from "react";
import { router, useSegments } from "expo-router";
import { FlatList, Keyboard, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { FileImage } from "@/components/file-image";
import { JellyIcon } from "@/components/jelly-icon";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { StateView } from "@/components/state-view";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { shouldPollChat } from "./chat-domain";
import { useConversations, useConversationUnread } from "./chat-api";
import { inboxRows, inboxTime, supportInboxSummary } from "./inbox-presentation";
import { colors } from "@/theme/tokens";
import type { ConversationApiView } from "@/types/api";

export function MessagesScreen() {
  const { status, user } = useAuth();
  const segments: readonly string[] = useSegments();
  const seller = segments.includes("(seller-tabs)");
  const online = useOnlineStatus();
  const polling = shouldPollChat(useAppActivity(), online);
  const conversations = useConversations(Boolean(user), polling);
  const unread = useConversationUnread(Boolean(user), polling);
  const [searching, setSearching] = useState(false);
  const [keyword, setKeyword] = useState("");
  const items = conversations.data?.pages.flatMap(page => page.items) ?? [];
  const rows = inboxRows(items, seller, keyword);
  const support = supportInboxSummary(items);
  const refresh = () => { if (user) void Promise.all([conversations.refetch(), unread.refetch()]); };
  const closeSearch = () => { setSearching(false); Keyboard.dismiss(); };
  const empty = status === "booting" || (Boolean(user) && conversations.isPending)
    ? <StateView kind="loading" />
    : !user
      ? <StateView kind="empty" title="登录后查看消息" message="会话属于账号数据" actionLabel="去登录" onRetry={() => router.push({ pathname: "/(auth)/required", params: { returnTo: seller ? "/(seller-tabs)/messages" : "/(buyer-tabs)/messages", action: "查看消息" } })} />
      : conversations.isError && !conversations.data
        ? <StateView kind="error" title="会话加载失败" onRetry={() => void conversations.refetch()} />
        : <View style={styles.emptyCopy}>
          <Text accessibilityLiveRegion="polite" style={styles.emptyText}>{keyword.trim() ? "没有找到相关会话。仅搜索已加载会话的名称和最近消息摘要，可继续加载或换个关键词。" : "暂无会话，从服务或订单详情发起聊天。"}</Text>
          {!keyword.trim() ? <Text style={styles.mediaHint}>支持文字、平台表情及审核通过的图片和语音；不支持实时通话，请勿引导线下交易。</Text> : null}
        </View>;
  return <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
    <BrandBackdrop seller={seller} />
    <View style={styles.header}>
      <View style={styles.headerSlot} />
      <Text accessibilityRole="header" style={styles.title}>聊天</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={searching ? "关闭会话搜索" : "搜索会话"} accessibilityState={{ expanded: searching }} style={({ pressed }) => [styles.headerSlot, pressed && styles.pressed]} onPress={() => searching ? closeSearch() : setSearching(true)}>
        <JellyIcon kind="search" size={24} /><Text style={styles.searchLabel}>搜索</Text>
      </Pressable>
    </View>
    {searching ? <View style={styles.searchForm}>
      <TextInput autoFocus accessibilityLabel="搜索已加载会话的名称或最近消息摘要" placeholder="对方名称、最近消息" placeholderTextColor={colors.textSecondary} value={keyword} onChangeText={setKeyword} maxLength={100} returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()} style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="收起会话搜索" style={styles.textButton} onPress={closeSearch}><Text style={styles.link}>收起</Text></Pressable>
    </View> : null}
    {keyword ? <View style={styles.searchSummary}><Text style={styles.hint}>已加载会话搜索：{keyword}</Text><Pressable accessibilityRole="button" accessibilityLabel="清除会话搜索" onPress={() => setKeyword("")} style={styles.textButton}><Text style={styles.link}>清除</Text></Pressable></View> : null}
    {!online ? <Text accessibilityRole="alert" style={styles.offline}>当前离线，恢复网络后会自动同步</Text> : null}
    <FlatList data={user && !conversations.isPending ? rows : []} keyExtractor={item => item.id} renderItem={({ item }) => <ConversationRow item={item} />} ListEmptyComponent={empty}
      ListHeaderComponent={<>
        <Pressable accessibilityRole="button" accessibilityLabel={`进入平台客服${support.unread ? `，${support.unread}条未读` : ''}`} onPress={() => router.push({ pathname: '/support', params: { role: seller ? 'seller' : 'buyer' } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.avatarWrap}><ApprovedIllustration kind="service" size={48} />{support.unread > 0 ? <Text style={styles.badge}>{support.unread > 99 ? '99+' : support.unread}</Text> : null}</View>
          <View style={styles.rowCopy}><View style={styles.rowTop}><View style={styles.supportTitle}><Text style={styles.supportName}>平台客服</Text><Text style={styles.official}>官方</Text></View><Text style={styles.time}>{inboxTime(support.latest?.last_message_at ?? null)}</Text></View><Text style={styles.preview} numberOfLines={1}>{support.latest?.last_message_preview || '订单咨询与问题反馈'}</Text></View>
        </Pressable>
        {user && conversations.isError && conversations.data && !conversations.isFetchNextPageError ? <Pressable accessibilityRole="button" accessibilityLabel="会话同步失败，点击重试" style={styles.loadMore} onPress={() => void conversations.refetch()}><Text style={styles.offline}>同步失败，保留已加载会话，点击重试</Text></Pressable> : null}
      </>}
      contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={conversations.isRefetching && !conversations.isFetchingNextPage} onRefresh={refresh} tintColor={colors.brand} />}
      ListFooterComponent={user && conversations.hasNextPage ? <Pressable accessibilityRole="button" disabled={conversations.isFetchingNextPage} style={styles.loadMore} onPress={() => { if (!conversations.isFetchingNextPage) void conversations.fetchNextPage({ cancelRefetch: false }); }}><Text style={styles.link}>{conversations.isFetchingNextPage ? "正在加载…" : conversations.isFetchNextPageError ? "加载失败，重试更多会话" : "加载更多会话"}</Text></Pressable> : null} />
  </SafeAreaView>;
}

function ConversationRow({ item }: { item: ConversationApiView }) {
  const label = item.counterpart.nickname || (item.conversation_type === "ORDER" ? "订单会话" : "商品咨询");
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${item.unread_count}条未读`} onPress={() => router.push({ pathname: "/conversations/[id]", params: { id: item.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.avatarWrap}>
      <FileImage fileId={item.counterpart.avatar_file_id} style={styles.avatar} label={`${label}头像`} />
      {item.unread_count > 0 ? <Text style={styles.badge}>{item.unread_count > 99 ? "99+" : item.unread_count}</Text> : null}
    </View>
    <View style={styles.rowCopy}><View style={styles.rowTop}><Text style={styles.rowTitle} numberOfLines={1}>{label}</Text><Text style={styles.time}>{inboxTime(item.last_message_at)}</Text></View><Text style={styles.preview} numberOfLines={1}>{item.last_message_preview ?? "会话已创建"}</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  headerSlot: { width: 48, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 2 },
  title: { flex: 1, color: colors.text, textAlign: "center", fontSize: 19, lineHeight: 26, fontWeight: "600" },
  searchLabel: { color: colors.text, fontSize: 11 },
  searchForm: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 6 },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.90)", color: colors.text, fontSize: 14 },
  textButton: { minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" },
  searchSummary: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  hint: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  link: { color: colors.brandDeep, fontSize: 14 },
  content: { flexGrow: 1, paddingBottom: 12 },
  emptyCopy: { paddingVertical: 24, paddingHorizontal: 16, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 22, textAlign: "center" },
  mediaHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 20, textAlign: "center" },
  row: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  avatarWrap: { width: 48, height: 48 }, avatar: { width: 48, height: 48, borderRadius: 10 },
  rowCopy: { flex: 1, minWidth: 0 }, rowTop: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  rowTitle: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  supportTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  supportName: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  official: { color: '#2365a3', backgroundColor: '#d8edfd', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, fontSize: 11, lineHeight: 17 },
  time: { color: colors.textSecondary, fontSize: 11, fontVariant: ["tabular-nums"] },
  preview: { marginTop: 6, color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  badge: { position: "absolute", right: -5, top: -4, minWidth: 18, paddingHorizontal: 4, borderRadius: 10, overflow: "hidden", backgroundColor: "#EE5B62", color: colors.white, fontSize: 10, lineHeight: 18, textAlign: "center" },
  offline: { paddingHorizontal: 16, paddingVertical: 8, color: colors.danger, fontSize: 12, textAlign: "center" },
  loadMore: { minHeight: 48, justifyContent: "center", alignItems: "center", padding: 12 },
  pressed: { backgroundColor: "rgba(255,255,255,0.27)" }
});
