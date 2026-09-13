import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ApiClientError } from "@/api/api-error";
import { NativePage, NativeRow, PaperCard, SectionHeading } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { reopenSupportCase, useSupportCase } from "@/features/chat/chat-api";
import { canSendSupport, supportStatusCopy } from "@/features/chat/support-domain";
import { colors, spacing, typography } from "@/theme/tokens";

export function SupportDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const query = useSupportCase(id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (query.isPending) return <NativePage title="客服工单" subtitle="正在获取处理进度"><StateView kind="loading" /></NativePage>;
  if (!query.data || query.isError) return <NativePage title="客服工单" subtitle="查看平台处理记录"><StateView kind="error" title="工单不存在或无权访问" onRetry={() => void query.refetch()} /></NativePage>;
  const item = query.data;

  const reopen = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await reopenSupportCase(item.id, item.version, "用户仍需要平台协助");
      await query.refetch();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") {
        await query.refetch();
        setNotice("工单刚刚发生变化，已刷新最新状态。");
      } else {
        setNotice(error instanceof ApiClientError ? error.message : "工单重开失败");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <NativePage title="客服工单" subtitle="查看平台处理记录" refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.content}>
        {notice ? <NoticeBanner tone="danger" message={notice} /> : null}
        <PaperCard style={styles.hero}>
          <Text style={styles.status}>{supportStatusCopy[item.status]}</Text>
          <Text style={styles.title}>{item.topic}</Text>
          <Text style={styles.meta}>工单编号 {item.case_no}</Text>
        </PaperCard>
        <PaperCard>
          <SectionHeading title="工单信息" note="客服分配和关联业务" />
          <NativeRow label="客服队列" value={item.queue_key} />
          <NativeRow label="当前客服" value={item.assigned_admin?.display_name ?? "等待分配"} />
          <NativeRow label="关联业务" value={item.related_type && item.related_id ? `${item.related_type} · ${item.related_id}` : "无"} last={!item.close_reason} />
          {item.close_reason ? <NativeRow label="关闭原因" value={item.close_reason} last /> : null}
        </PaperCard>
        {canSendSupport(item.status) ? (
          <PrimaryButton label="进入客服会话" onPress={() => router.push({ pathname: "/conversations/[id]", params: { id: item.conversation_id } })} />
        ) : (
          <>
            <NoticeBanner tone="danger" message="工单已关闭，不能继续发送消息；如仍需协助请先重开。" />
            <PrimaryButton label="重新打开工单" loading={busy} disabled={busy} onPress={() => void reopen()} />
          </>
        )}
        <PaperCard>
          <SectionHeading title="处理进度" note={`${item.logs.length} 条状态记录`} />
          <View style={styles.timeline}>
            {item.logs.map((log, index) => (
              <View key={log.id} style={[styles.log, index < item.logs.length - 1 && styles.logBorder]}>
                <View style={styles.dot} />
                <View style={styles.logCopy}>
                  <Text style={styles.body}>{supportStatusCopy[log.new_status]}</Text>
                  <Text style={styles.meta}>{log.reason || log.action}</Text>
                  <Text style={styles.time}>{new Date(log.created_at).toLocaleString("zh-CN")}</Text>
                </View>
              </View>
            ))}
          </View>
        </PaperCard>
      </View>
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  hero: { gap: spacing.xs, padding: spacing.xl, backgroundColor: colors.surfaceBlue },
  status: { ...typography.pageTitle, color: colors.brandDeep },
  title: { ...typography.cardTitle, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  timeline: { paddingHorizontal: spacing.lg },
  log: { minHeight: 76, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md },
  logBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot: { width: 12, height: 12, marginTop: 4, borderWidth: 3, borderColor: colors.brand, borderRadius: 6, backgroundColor: colors.white },
  logCopy: { flex: 1, gap: 3 },
  body: { ...typography.body, color: colors.text, fontWeight: "800" },
  time: { ...typography.caption, color: colors.textSecondary }
});
