import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { NativePage, nativeShadow } from "@/components/native-page";
import { FileImage } from "@/components/file-image";
import { MessageTabIcon, MineTabIcon, OrderTabIcon, ServiceTabIcon, WithdrawTabIcon } from "@/components/tab-icons";
import { StateView } from "@/components/state-view";
import { useSellerOverview } from "@/features/seller/seller-api";
import { colors } from "@/theme/tokens";
import { formatCent } from "@/utils/money";

export function SellerOverviewScreen() {
  const query = useSellerOverview();
  const data = query.data;
  const services = data?.service_counts ?? {};
  const orders = data?.order_counts ?? {};

  return (
    <NativePage
      title="陪玩中心"
      subtitle={data ? `${data.seller.seller_nickname} 的经营工作台` : "经营数据与待办事项"}
      action={<Pressable accessibilityRole="button" accessibilityLabel="刷新数据" onPress={() => void query.refetch()} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><MessageTabIcon color={colors.text} size={29} /></Pressable>}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      onBack={() => router.replace("/(buyer-tabs)/mine")}
      contentStyle={styles.content}
    >
      {query.isPending ? <View style={styles.state}><StateView kind="loading" title="正在读取真实经营数据" /></View> : null}
      {query.isError || (!query.isPending && !data) ? <View style={styles.state}><StateView kind="error" title="陪玩中心加载失败" onRetry={() => void query.refetch()} /></View> : null}
      {data ? (
        <>
          <View style={styles.finance}>
            <Text style={styles.financeLabel}>可提现收益</Text>
            <Text style={styles.amount}>{formatCent(data.finance.available_cent)}</Text>
            <Text style={styles.financeMeta}>待结算 {formatCent(data.finance.pending_cent)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="查看收益" onPress={() => router.push("/(seller-tabs)/earnings")} style={({ pressed }) => [styles.financeButton, pressed && styles.pressed]}><Text style={styles.financeButtonText}>查看收益 ›</Text></Pressable>
          </View>

          {data.finance.withdrawal_paused ? <View style={styles.danger}><Text style={styles.dangerText}>存在欠款 {formatCent(data.finance.liability_cent)}，提现已暂停。</Text></View> : null}

          <View style={styles.metrics}>
            <Metric label="新订单" value={orders.PENDING_ACCEPT ?? 0} />
            <Metric label="服务中" value={orders.IN_SERVICE ?? 0} />
            <Metric label="待确认" value={orders.PENDING_BUYER_CONFIRM ?? 0} />
            <Metric label="在售服务" value={services.ON_SALE ?? 0} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>经营工具</Text>
            <View style={styles.tools}>
              <Tool icon={<OrderTabIcon color="#2877B9" size={32} />} label="卖家订单" onPress={() => router.push("/(seller-tabs)/orders")} />
              <Tool icon={<ServiceTabIcon color="#2877B9" size={32} />} label="服务管理" onPress={() => router.push("/(seller-tabs)/services")} />
              <Tool icon={<MineTabIcon color="#2877B9" size={32} />} label="主页管理" onPress={() => router.push("/seller/profile")} />
              <Tool icon={<WithdrawTabIcon color="#2877B9" size={32} />} label="收益提现" onPress={() => router.push("/(seller-tabs)/earnings")} />
            </View>
          </View>

          <View style={styles.todo}>
            <View style={styles.todoTitleRow}><Text style={styles.sectionTitle}>待处理事项</Text><Text style={styles.live}>实时</Text></View>
            <Todo label={`${orders.PENDING_ACCEPT ?? 0} 个新订单等待接单`} note="请按订单中的接单截止时间处理" action="处理" onPress={() => router.push("/(seller-tabs)/orders")} />
            <Todo label={`${services.REVIEW_REJECTED ?? 0} 个服务审核未通过`} note="根据审核意见修改后重新提交" action="查看" onPress={() => router.push("/(seller-tabs)/services")} last />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="查看我的公开陪玩主页" onPress={() => router.push("/seller/preview")} style={({ pressed }) => [styles.preview, pressed && styles.pressed]}>
            <View style={styles.previewAvatar}><FileImage fileId={data.seller.seller_avatar_file_id} style={styles.previewMark} label="陪玩头像" /><View accessibilityLabel="在线" style={styles.onlineDot} /></View>
            <View style={styles.previewCopy}><Text style={styles.previewTitle}>查看我的公开陪玩主页</Text><Text style={styles.previewNote}>买家看到的主页效果</Text></View>
            <Text style={styles.previewAction}>预览 ›</Text>
          </Pressable>
        </>
      ) : null}
    </NativePage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Tool({ icon, label, onPress }: { icon: ReactNode; label: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tool, pressed && styles.pressed]}><View style={styles.toolMark}>{icon}</View><Text style={styles.toolLabel}>{label}</Text></Pressable>;
}

function Todo({ label, note, action, onPress, last = false }: { label: string; note: string; action: string; onPress(): void; last?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${note}`} onPress={onPress} style={({ pressed }) => [styles.todoRow, !last && styles.todoBorder, pressed && styles.pressed]}><View style={styles.todoCopy}><Text style={styles.todoLabel}>{label}</Text><Text style={styles.todoNote}>{note}</Text></View><Text style={styles.todoAction}>{action} ›</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  headerAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#FFFDF8" },
  state: { minHeight: 260, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  finance: { position: "relative", minHeight: 168, justifyContent: "center", paddingHorizontal: 22, paddingVertical: 18, borderRadius: 20, backgroundColor: "#367FBF", ...nativeShadow },
  financeLabel: { color: "#FFFFFF", fontSize: 14, lineHeight: 19, fontWeight: "800" },
  amount: { marginTop: 4, color: "#FFFFFF", fontSize: 41, lineHeight: 45, fontWeight: "900" },
  financeMeta: { marginTop: 5, color: "#D7ECFF", fontSize: 12, lineHeight: 16 },
  financeButton: { position: "absolute", right: 18, bottom: 18, minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#CFF20B" },
  financeButtonText: { color: "#29390B", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  metrics: { flexDirection: "row", minHeight: 86, overflow: "hidden", paddingVertical: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 16, backgroundColor: "#FFFDF8", ...nativeShadow },
  metric: { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "rgba(62,57,47,0.12)" },
  metricValue: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "900" },
  metricLabel: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  section: { padding: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  sectionTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  tools: { flexDirection: "row", gap: 8, marginTop: 13 },
  tool: { flex: 1, minHeight: 96, alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#D8E8F5", borderRadius: 15, backgroundColor: "#F3F8FC" },
  toolMark: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#C6DEF1", borderRadius: 14, backgroundColor: "#E1F1FF" },
  toolLabel: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800", textAlign: "center" },
  todo: { overflow: "hidden", paddingTop: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  todoTitleRow: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8 },
  live: { color: colors.textSecondary, fontSize: 10, lineHeight: 14 },
  todoRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 9 },
  todoBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  todoCopy: { flex: 1 },
  todoLabel: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  todoNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  todoAction: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  preview: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,248,221,0.95)", ...nativeShadow },
  previewAvatar: { position: "relative" },
  previewMark: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#E4F2FF" },
  onlineDot: { position: "absolute", right: -2, bottom: -2, width: 13, height: 13, borderWidth: 2, borderColor: "#FFFDF8", borderRadius: 7, backgroundColor: "#39C868" },
  previewCopy: { flex: 1 },
  previewTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  previewNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  previewAction: { color: colors.brandDeep, fontSize: 12, fontWeight: "900" },
  arrow: { color: colors.textSecondary, fontSize: 26 },
  danger: { padding: 13, borderRadius: 14, backgroundColor: "rgba(255,240,232,0.96)" },
  dangerText: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.72 }
});
