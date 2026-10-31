import { BrandBackdrop } from "@/components/brand-backdrop";
import { StateBear } from '@/components/state-bear';
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { markAllNotificationsRead, useNotifications, useNotificationUnread } from "@/features/chat/chat-api";
import { useAuth } from "@/auth/auth-provider";
import { notificationBody, notificationCategoryCopy, shouldPollChat } from "@/features/chat/chat-domain";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { CursorPage, NotificationApiView, NotificationCategory } from "@/types/api";

type NotificationFilter = "ALL" | NotificationCategory;

const filters: readonly { key: NotificationFilter; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "ORDER", label: "订单" },
  { key: "ACCOUNT", label: "账户" },
  { key: "PLATFORM", label: "平台" },
  { key: "FEEDBACK", label: "反馈" }
];



export function NotificationsScreen() {
  const { status, user, bootstrapError, retryBootstrap } = useAuth();
  const online = useOnlineStatus();
  const polling = shouldPollChat(useAppActivity(), online);
  const [filter, setFilter] = useState<NotificationFilter>("ALL");
  const [marking, setMarking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const category = filter === "ALL" ? undefined : filter;
  const canRead = status === "authenticated" && Boolean(user);
  const query = useNotifications(canRead, polling && canRead, category);
  const unread = useNotificationUnread(canRead, polling && canRead);
  const items = flattenNotifications(query.data?.pages ?? []);

  const readAll = async () => {
    if (!canRead) return;
    setMarking(true);
    setFailure(null);
    try {
      await markAllNotificationsRead();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notification-unread"] })
      ]);
    } catch {
      setFailure("全部已读操作失败，请稍后重试");
    } finally {
      setMarking(false);
    }
  };

  if (status === "booting") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <NotificationBackdrop />
        <NotificationHeader actionDisabled onAction={() => undefined} />
        <View style={styles.stateInset}>
          {bootstrapError
            ? <NotificationState failed title="无法恢复登录状态" message={bootstrapError} action="重试" onPress={() => void retryBootstrap()} />
            : <NotificationState loading title="正在恢复登录状态" message="正在安全读取本机登录信息。" />}
        </View>
      </SafeAreaView>
    );
  }

  if (!canRead) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <NotificationBackdrop />
        <NotificationHeader actionDisabled onAction={() => undefined} />
        <View style={styles.stateInset}>
          <NotificationState title="登录后查看通知" message="订单、账户和平台通知只对当前登录账号开放。" action="去登录" onPress={() => router.replace({ pathname: "/(auth)/required", params: { returnTo: "/notifications", action: "查看站内通知" } })} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <NotificationBackdrop />
      <NotificationHeader
        actionLabel={(unread.data?.unread_count ?? 0) > 0 ? (marking ? "处理中" : "全部已读") : undefined}
        actionDisabled={marking || !online}
        onAction={() => void readAll()}
      />
      <View accessibilityRole="tablist" style={styles.tabs}>
        {filters.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => { setFailure(null); setFilter(item.key); }}
              style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {!online ? <Text style={styles.offline}>当前离线，恢复网络后会自动同步</Text> : null}
      {failure ? <Text accessibilityRole="alert" style={styles.failure}>{failure}</Text> : null}
      {query.isPending ? (
        <View style={styles.stateInset}><NotificationState loading title="正在加载通知" message="正在同步订单、账户与平台消息。" /></View>
      ) : query.isError ? (
        <View style={styles.stateInset}><NotificationState failed title="通知加载失败" message="暂时无法连接服务，请稍后重试。" action="重新加载" onPress={() => void query.refetch()} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <NotificationRow item={item} first={index === 0} last={index === items.length - 1} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.accent} />}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
          onEndReachedThreshold={0.25}
          ListEmptyComponent={<NotificationState empty title="暂无通知" message="订单、账户与平台消息会显示在这里。" />}
          ListFooterComponent={query.isFetchingNextPage ? <Text style={styles.more}>正在加载更多…</Text> : null}
        />
      )}
    </SafeAreaView>
  );
}

function NotificationBackdrop() { return <BrandBackdrop />; }

function NotificationHeader({ actionLabel, actionDisabled, onAction }: { actionLabel?: string; actionDisabled: boolean; onAction(): void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={leaveNotifications} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <ChevronLeftIcon size={23} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.pageTitle}>站内通知</Text>
        <Text style={styles.pageSubtitle}>订单、账户与平台消息 · 系统推送尚未接入</Text>
      </View>
      {actionLabel ? (
        <Pressable accessibilityRole="button" disabled={actionDisabled} onPress={onAction} style={({ pressed }) => [styles.readAll, actionDisabled && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.readAllText}>{actionLabel}</Text>
        </Pressable>
      ) : <View style={styles.actionSpace} />}
    </View>
  );
}

function leaveNotifications() {
  if (router.canGoBack()) router.back();
  else router.replace("/(buyer-tabs)/messages");
}

function NotificationRow({ item, first, last }: { item: NotificationApiView; first: boolean; last: boolean }) {
  const unread = item.read_status === "UNREAD";
  const copy = notificationCategoryCopy(item.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "未读" : "已读"}${copy.label}：${item.title}`}
      onPress={() => router.push({ pathname: "/notifications/[id]", params: { id: item.id } })}
      style={({ pressed }) => [styles.row, first && styles.rowFirst, last && styles.rowLast, pressed && styles.pressed]}
    >
      {unread ? <View style={styles.unreadDot} /> : null}
      <View style={styles.categoryIcon}><Text style={styles.categoryIconText}>{copy.badge}</Text></View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={[styles.rowTitle, unread && styles.rowTitleUnread]}>{item.title}</Text>
          <Text style={styles.time}>{formatNotificationTime(item.created_at)}</Text>
        </View>
        <Text numberOfLines={2} style={styles.body}>{notificationBody(item)}</Text>
      </View>
      <ChevronRightIcon size={20} />
    </Pressable>
  );
}

function NotificationState({ title, message, loading = false, failed = false, empty = false, action, onPress }: { title: string; message: string; loading?: boolean; failed?: boolean; empty?: boolean; action?: string; onPress?: () => void }) {
  if (empty) return <View style={styles.bearEmpty}><StateBear kind="empty" size={160} /><Text style={styles.bearTitle}>{title}</Text><Text style={styles.bearMessage}>{message}</Text></View>;
  return (
    <View style={[styles.state, failed && styles.stateFailed]}>
      {loading ? <ActivityIndicator color={colors.brand} size="small" /> : null}
      <View style={styles.stateCopy}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateMessage}>{message}</Text></View>
      {action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.retry}><Text style={styles.retryText}>{action}</Text></Pressable> : null}
    </View>
  );
}

function flattenNotifications(pages: CursorPage<NotificationApiView>[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.items).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  bearEmpty: { marginVertical: 12, paddingVertical: 16, paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: 10, alignItems: 'center' },
  bearTitle: { marginTop: 12, fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  bearMessage: { marginTop: 6, fontSize: 12, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, minHeight: 60, paddingBottom: 4, height: undefined },
  back: { alignItems: "center", justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { flex: 1, justifyContent: "center", marginLeft: 0, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  readAll: { minWidth: 66, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  readAllText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  actionSpace: { width: 66 },
  tabs: { flexDirection: "row", gap: 5, marginHorizontal: 12, marginBottom: 12, padding: 4, backgroundColor: "transparent", borderRadius: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, height: undefined, minHeight: 48 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  tabActive: { ...softShadow, backgroundColor: "transparent", borderRadius: 0, borderBottomWidth: 2, borderBottomColor: colors.brandDeep, shadowOpacity: 0, elevation: 0 },
  tabText: { color: "#6F6B65", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: colors.accent },
  list: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 28 },
  row: { position: "relative", minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "rgba(62,57,47,0.12)", backgroundColor: "#FFFDF8" },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, ...softShadow },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  unreadDot: { position: "absolute", top: 14, left: 6, width: 7, height: 7, zIndex: 1, borderRadius: 4, backgroundColor: colors.accent },
  categoryIcon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#E4F2FF" },
  categoryIconText: { color: "#2F78BC", fontSize: 15, lineHeight: 20, fontWeight: "900" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  rowTitleUnread: { color: colors.text, fontWeight: "900" },
  time: { color: "#8A8680", fontSize: 12, lineHeight: 16 },
  body: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  chevron: { color: colors.text, fontSize: 22, lineHeight: 26 },
  stateInset: { marginHorizontal: 12 },
  state: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(62,57,47,0.12)", borderRadius: 18, backgroundColor: "#FFFDF8", ...softShadow },
  stateFailed: { borderColor: "#F2A18A", backgroundColor: "#FFF7F3" },
  stateCopy: { flex: 1 },
  stateTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  stateMessage: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.accent },
  retryText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  offline: { marginHorizontal: 12, marginBottom: 8, color: colors.danger, fontSize: 12, textAlign: "center" },
  failure: { marginHorizontal: 12, marginBottom: 8, color: colors.danger, fontSize: 12, textAlign: "center" },
  more: { paddingVertical: 14, color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 }
});
