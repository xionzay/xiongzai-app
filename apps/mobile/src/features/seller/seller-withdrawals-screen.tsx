import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { NativeBackdrop, NativeButton, NativeHeader, NativePage, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { useWithdrawal, useWithdrawals } from "@/features/seller/seller-finance-api";
import { withdrawalStatusCopy } from "@/features/seller/seller-finance-domain";
import { colors } from "@/theme/tokens";
import { formatCent } from "@/utils/money";

export function SellerWithdrawalsScreen() {
  const query = useWithdrawals();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (query.isPending) return <NativePage title="提现记录" subtitle="查看申请进度与处理结果"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (query.isError) return <NativePage title="提现记录" subtitle="查看申请进度与处理结果"><View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View></NativePage>;
  const action = <Pressable accessibilityRole="button" accessibilityLabel="申请提现" onPress={() => router.push("/seller/finance/withdraw")} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><Text style={styles.headerActionText}>提现</Text></Pressable>;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <NativeBackdrop />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<NativeHeader title="提现记录" subtitle="查看申请进度与处理结果" action={action} />}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${withdrawalStatusCopy[item.status]}，${formatCent(item.amount_cent)}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => router.push({ pathname: "/seller/finance/withdrawals/[id]", params: { id: item.id } })}>
            <View style={styles.row}><Text style={styles.title}>{formatCent(item.amount_cent)}</Text><Text style={styles.status}>{withdrawalStatusCopy[item.status]}</Text></View>
            <Text style={styles.meta}>{item.withdrawal_no}</Text>
            <Text style={styles.meta}>{new Date(item.created_at).toLocaleString("zh-CN")}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<View style={styles.state}><StateView kind="empty" title="暂无提现记录" /></View>}
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.brand} />}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
        onEndReachedThreshold={0.25}
        ListFooterComponent={query.hasNextPage ? <NativeButton tone="secondary" label={query.isFetchingNextPage ? "加载中…" : "加载更多"} disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
      />
    </SafeAreaView>
  );
}

export function SellerWithdrawalDetailScreen({ id }: { id: string }) {
  const query = useWithdrawal(id);
  if (query.isPending) return <NativePage title="提现记录详情" subtitle="资金处理进度与结果"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!query.data || query.isError) return <NativePage title="提现记录详情" subtitle="资金处理进度与结果"><View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View></NativePage>;
  const item = query.data;
  const terminal = ["COMPLETED", "REJECTED", "FAILED", "CLOSED"].includes(item.status);
  return (
    <NativePage title="提现记录详情" subtitle={`提现单 ${item.withdrawal_no}`} contentStyle={styles.content} refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={[styles.hero, item.status === "COMPLETED" && styles.heroSuccess]}>
        <Text style={styles.heroStatus}>{withdrawalStatusCopy[item.status]}</Text>
        <Text style={styles.heroAmount}>{formatCent(item.amount_cent)}</Text>
        <Text style={styles.heroNote}>{terminal ? "当前为终态，以平台账务记录为准" : "处理中，最终结果以平台与渠道回调为准"}</Text>
      </View>
      <View style={styles.card}>
        <Row label="提现编号" value={item.withdrawal_no} />
        <Row label="申请金额" value={formatCent(item.amount_cent)} />
        <Row label="手续费" value={formatCent(item.fee_cent)} />
        <Row label="实际到账" value={formatCent(item.actual_amount_cent)} />
        <Row label="收款方式" value={item.payout_account.account_type === "WECHAT" ? "微信" : "支付宝"} />
        <Row label="脱敏账户" value={item.payout_account.display_mask} />
        <Row label="风险状态" value={item.risk_status} />
        {item.reject_reason ? <Row label="失败/拒绝原因" value={item.reject_reason} /> : null}
      </View>
      <Text style={styles.heading}>处理进度</Text>
      {item.logs.map((log, index) => (
        <View key={log.id} style={styles.timeline}>
          <View style={[styles.timelineMark, index === item.logs.length - 1 && styles.timelineActive]}><Text style={styles.timelineNumber}>{index + 1}</Text></View>
          <View style={styles.timelineCopy}><Text style={styles.timelineTitle}>{withdrawalStatusCopy[log.new_status]}</Text><Text style={styles.meta}>{new Date(log.created_at).toLocaleString("zh-CN")} · {log.operator_role}</Text><Text style={styles.meta}>{log.reason ?? log.action}</Text></View>
        </View>
      ))}
      <NativeButton tone="secondary" label="联系平台客服" onPress={() => router.push({ pathname: "/support/new", params: { relatedType: "WITHDRAWAL", relatedId: item.id } })} />
    </NativePage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.factRow}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DEF0FF" },
  content: { gap: 13 },
  list: { gap: 12, paddingHorizontal: 12, paddingBottom: 24 },
  headerAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.brand },
  headerActionText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  state: { minHeight: 230, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  card: { gap: 8, padding: 15, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  title: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  status: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  meta: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  hero: { alignItems: "center", padding: 22, borderWidth: 1, borderColor: "rgba(39,143,232,0.14)", borderRadius: 19, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow },
  heroSuccess: { borderColor: "rgba(43,164,113,0.20)", backgroundColor: "rgba(230,248,237,0.95)" },
  heroStatus: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  heroAmount: { marginTop: 8, color: colors.text, fontSize: 31, lineHeight: 38, fontWeight: "900" },
  heroNote: { marginTop: 7, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  factRow: { minHeight: 34, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  value: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "700", textAlign: "right" },
  heading: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  timeline: { minHeight: 62, flexDirection: "row", gap: 11 },
  timelineMark: { width: 29, height: 29, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#EAF6FF" },
  timelineActive: { backgroundColor: colors.brand },
  timelineNumber: { color: colors.text, fontSize: 12, fontWeight: "900" },
  timelineCopy: { flex: 1, gap: 3 },
  timelineTitle: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  pressed: { opacity: 0.72 }
});
