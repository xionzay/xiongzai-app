import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "@/components/primary-button";
import { useAuth } from "@/auth/auth-provider";
import { markNotificationRead, useNotification, verifyNotificationTarget } from "@/features/chat/chat-api";
import { notificationBody, notificationCategoryCopy, notificationDestination } from "@/features/chat/chat-domain";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { NotificationRelatedObjectType as RelatedObjectType } from "@/types/api";



const heroBands = Array.from({ length: 30 }, (_, index) => {
  const ratio = index / 29;
  const from = [223, 240, 255];
  const to = [255, 244, 217];
  const channel = (value: number, target: number) => Math.round(value + (target - value) * ratio);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function NotificationDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { status, user, bootstrapError, retryBootstrap } = useAuth();
  const canRead = status === "authenticated" && Boolean(user);
  const query = useNotification(id, canRead);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const notificationStatus = query.data?.read_status;
  const refetchNotification = query.refetch;

  useEffect(() => {
    if (!canRead || notificationStatus !== "UNREAD") return;
    void markNotificationRead(id)
      .then(() => Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notification-unread"] }),
        refetchNotification()
      ]))
      .catch(() => undefined);
  }, [canRead, id, notificationStatus, refetchNotification]);

  if (status === "booting") {
    return <NotificationDetailShell subtitle="系统消息">{bootstrapError ? <DetailState failed title="无法恢复登录状态" message={bootstrapError} action="重试" onPress={() => void retryBootstrap()} /> : <DetailState loading title="正在恢复登录状态" message="正在安全读取本机登录信息。" />}</NotificationDetailShell>;
  }
  if (!canRead) {
    return <NotificationDetailShell subtitle="系统消息"><DetailState title="登录后查看通知" message="通知详情只对当前登录账号开放。" action="去登录" onPress={() => router.replace({ pathname: "/(auth)/required", params: { returnTo: `/notifications/${id}`, action: "查看通知详情" } })} /></NotificationDetailShell>;
  }

  if (query.isPending) {
    return <NotificationDetailShell subtitle="系统消息"><DetailState loading title="正在加载通知" message="正在读取通知详情。" /></NotificationDetailShell>;
  }
  if (!query.data || query.isError) {
    return <NotificationDetailShell subtitle="系统消息"><DetailState failed title="通知不存在或无权访问" message="该通知可能已删除，或当前账号没有查看权限。" action="重新加载" onPress={() => void query.refetch()} /></NotificationDetailShell>;
  }

  const item = query.data;
  const destination = notificationDestination(item.related_type, item.related_id, item.content_variables);
  const open = async () => {
    if (!destination) return;
    setOpening(true);
    setNotice(null);
    try {
      await verifyNotificationTarget(item.related_type, item.related_id, item.content_variables);
      router.push(destination as never);
    } catch {
      setNotice("关联内容不存在、已删除，或当前账号没有访问权限。");
    } finally {
      setOpening(false);
    }
  };

  return (
    <NotificationDetailShell subtitle={notificationCategoryCopy(item.category).label}>
      {notice ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <View style={styles.heroFrame}>
        <View style={styles.hero}>
          <HeroBackdrop />
          <View style={styles.successIcon}><Text style={styles.successIconText}><JellyIcon kind="check" label="已选" /></Text></View>
          <Text style={styles.heroTitle}>{item.title}</Text>
          <Text style={styles.heroNote}>消息已送达并记录</Text>
        </View>
      </View>
      <View style={styles.bodyCard}>
        <Text selectable style={styles.body}>{notificationBody(item)}</Text>
        <Text style={styles.time}>{new Date(item.created_at).toLocaleString("zh-CN")}</Text>
      </View>
      {destination ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={relatedLabel(item.related_type)} onPress={() => void open()} style={({ pressed }) => [styles.relatedCard, pressed && styles.pressed]}>
            <View style={styles.relatedIcon}><Text style={styles.relatedIconText}>联</Text></View>
            <View style={styles.relatedCopy}><Text style={styles.relatedTitle}>{relatedLabel(item.related_type)}</Text><Text numberOfLines={1} style={styles.relatedId}>{item.related_id ?? relatedVariableId(item.content_variables)}</Text></View>
            <ChevronRightIcon size={20} />
          </Pressable>
          <PrimaryButton label={notificationActionLabel(item.related_type)} loading={opening} disabled={opening} onPress={() => void open()} />
        </>
      ) : null}
    </NotificationDetailShell>
  );
}

function NotificationDetailShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <DetailBackdrop />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={leaveNotificationDetail} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
        <View style={styles.headerCopy}><Text style={styles.pageTitle}>通知详情</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>
        <View style={styles.actionSpace} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

function leaveNotificationDetail() {
  if (router.canGoBack()) router.back();
  else router.replace("/notifications");
}

function DetailBackdrop() { return <BrandBackdrop />; }

function HeroBackdrop() {
  return <View pointerEvents="none" style={styles.heroBackdrop}>{heroBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.heroBand, { backgroundColor: color }]} />)}</View>;
}

function DetailState({ title, message, loading = false, failed = false, action, onPress }: { title: string; message: string; loading?: boolean; failed?: boolean; action?: string; onPress?: () => void }) {
  return (
    <View style={[styles.state, failed && styles.stateFailed]}>
      {loading ? <ActivityIndicator color={colors.brand} size="small" /> : null}
      <View style={styles.stateCopy}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateMessage}>{message}</Text></View>
      {action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.retry}><Text style={styles.retryText}>{action}</Text></Pressable> : null}
    </View>
  );
}

function relatedLabel(type: RelatedObjectType | null) {
  if (type === "FEEDBACK") return "关联反馈";
  if (type === "ANNOUNCEMENT") return "关联公告";
  if (type === "ORDER") return "关联订单";
  if (type === "REFUND") return "关联退款";
  if (type === "COMPLAINT") return "关联投诉";
  if (type === "CONVERSATION") return "关联会话";
  if (type === "SUPPORT_CASE") return "关联客服工单";
  if (type === "WITHDRAWAL") return "关联提现";
  if (type === "USER") return "关联账户";
  return "关联内容";
}

function notificationActionLabel(type: RelatedObjectType | null) {
  if (type === "FEEDBACK") return "查看反馈与回复";
  if (type === "ANNOUNCEMENT") return "查看公告";
  if (type === "ORDER") return "查看订单";
  if (type === "REFUND") return "查看退款详情";
  if (type === "COMPLAINT") return "查看投诉详情";
  if (type === "CONVERSATION") return "进入会话";
  if (type === "SUPPORT_CASE") return "查看客服工单";
  if (type === "WITHDRAWAL" || type === "USER" || type === "PLATFORM") return "查看账户";
  return "查看关联内容";
}

function relatedVariableId(variables: Record<string, unknown>) {
  return typeof variables.conversation_id === "string" ? variables.conversation_id : "平台关联消息";
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, minHeight: 60, paddingBottom: 4, height: undefined },
  back: { alignItems: "center", justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { flex: 1, justifyContent: "center", marginLeft: 0, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  actionSpace: { width: 55 },
  content: { gap: 12, paddingHorizontal: 12, paddingBottom: 28 },
  heroFrame: { borderRadius: 20, ...softShadow },
  hero: { position: "relative", minHeight: 170, overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 18, borderRadius: 20 },
  heroBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, flexDirection: "row" },
  heroBand: { flex: 1 },
  successIcon: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: colors.lime },
  successIconText: { color: colors.text, fontSize: 29, lineHeight: 34, fontWeight: "900" },
  heroTitle: { marginTop: 11, color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: "900", textAlign: "center" },
  heroNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  bodyCard: { minHeight: 76, justifyContent: "center", padding: 15, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  body: { color: colors.text, fontSize: 13, lineHeight: 22 },
  time: { marginTop: 13, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  relatedCard: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  relatedIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#E4F2FF" },
  relatedIconText: { color: "#2F78BC", fontSize: 15, fontWeight: "900" },
  relatedCopy: { flex: 1, minWidth: 0 },
  relatedTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  relatedId: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  chevron: { color: colors.text, fontSize: 22, lineHeight: 26 },
  notice: { padding: 12, borderWidth: 1, borderColor: "#F2A18A", borderRadius: 15, backgroundColor: "#FFF7F3" },
  noticeText: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  state: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(62,57,47,0.12)", borderRadius: 18, backgroundColor: "#FFFDF8", ...softShadow },
  stateFailed: { borderColor: "#F2A18A", backgroundColor: "#FFF7F3" },
  stateCopy: { flex: 1 },
  stateTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  stateMessage: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.accent },
  retryText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.72 }
});
