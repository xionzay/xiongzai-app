import { StyleSheet, Text, View } from "react-native";
import { NativePage, PaperCard, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { StateView } from "@/components/state-view";
import { usePolicyAcceptances } from "@/features/account/account-api";
import { policyAcceptanceSceneCopy } from "@/features/account/policy-confirmation-domain";
import { colors, spacing, typography } from "@/theme/tokens";

export function PolicyAcceptanceRecordsScreen() {
  const records = usePolicyAcceptances();
  return (
    <NativePage title="我的协议接受记录" subtitle="服务端保存的在线确认记录" refreshing={records.isRefetching} onRefresh={() => void records.refetch()} contentStyle={styles.content}>
      <NoticeBanner message="记录来自本地测试后端，确认方式统一为‘在线确认并同意’，不代表第三方电子签、实名认证或正式商业签署。" />
      {records.isPending ? <View style={styles.state}><StateView kind="loading" title="正在读取接受记录" /></View> : null}
      {records.isError ? <View style={styles.state}><StateView kind="error" title="接受记录加载失败" onRetry={() => void records.refetch()} /></View> : null}
      {records.data?.length === 0 ? <View style={styles.state}><StateView kind="empty" title="暂无协议接受记录" message="完成登录、支付或陪玩入驻等明确确认后会显示在这里。" /></View> : null}
      {records.data?.map((record) => (
        <PaperCard key={`${record.policy_version_id}-${record.acceptance_scene}`} style={styles.card}>
          <View style={styles.heading}><Text style={styles.title}>{record.title}</Text><Text style={styles.version}>V{record.version_no}</Text></View>
          <Text style={styles.meta}>使用场景：{policyAcceptanceSceneCopy[record.acceptance_scene]}</Text>
          <Text style={styles.meta}>确认方式：在线确认并同意</Text>
          <Text style={styles.meta}>确认时间：{new Date(record.accepted_at).toLocaleString("zh-CN")}</Text>
          <Text style={styles.meta}>发布时间：{new Date(record.published_at).toLocaleString("zh-CN")}</Text>
        </PaperCard>
      ))}
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  state: { minHeight: 220, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  card: { gap: spacing.sm, padding: spacing.lg, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { flex: 1, ...typography.sectionTitle, color: colors.text },
  version: { ...typography.caption, color: colors.brandDeep, fontWeight: "800" },
  meta: { ...typography.caption, color: colors.textSecondary }
});
