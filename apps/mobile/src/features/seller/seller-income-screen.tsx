import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeBackdrop, NativeHeader, NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { useSellerIncomes, useSellerLiabilities } from "@/features/seller/seller-finance-api";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { SellerIncomeApiView } from "@/types/api";
import { formatCent } from "@/utils/money";

const incomeStatus = { PENDING_SETTLEMENT: "待结算", AVAILABLE: "可提现", WITHDRAWAL_LOCKED: "提现锁定", WITHDRAWN: "已提现", REVERSED: "已冲回" } as const;

export function SellerIncomeScreen() {
  const incomes = useSellerIncomes();
  const liabilities = useSellerLiabilities();
  const items = incomes.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => Promise.all([incomes.refetch(), liabilities.refetch()]);
  if (incomes.isPending || liabilities.isPending) return <NativePage title="收益与欠款明细" subtitle="每笔收入与订单一一对应"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (incomes.isError || liabilities.isError || !liabilities.data) return <NativePage title="收益与欠款明细" subtitle="每笔收入与订单一一对应"><View style={styles.state}><StateView kind="error" onRetry={() => void refresh()} /></View></NativePage>;

  return <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
    <NativeBackdrop />
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <IncomeCard item={item} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={incomes.isRefetching || liabilities.isRefetching} onRefresh={() => void refresh()} tintColor={colors.brand} />}
      onEndReached={() => incomes.hasNextPage && !incomes.isFetchingNextPage && void incomes.fetchNextPage()}
      onEndReachedThreshold={0.25}
      ListHeaderComponent={<><NativeHeader title="收益与欠款明细" subtitle="每笔收入与订单一一对应" /><NoticeBanner message="平台费、可用、锁定、已提现和冲回金额均为服务端事实，不在 App 重新计算。" /><Text style={styles.heading}>收益明细</Text>{items.length === 0 ? <StateView kind="empty" title="暂无收益记录" /> : null}</>}
      ListFooterComponent={<><View style={styles.more}>{incomes.hasNextPage ? <PrimaryButton tone="plain" label={incomes.isFetchingNextPage ? "加载中…" : "加载更多收益"} loading={incomes.isFetchingNextPage} onPress={() => void incomes.fetchNextPage()} /> : null}</View><Text style={styles.heading}>欠款与负债</Text>{liabilities.data.length ? liabilities.data.map((item) => <View key={item.id} style={styles.card}><View style={styles.row}><Text style={styles.title}>{item.liability_no}</Text><Text style={styles.status}>{item.status}</Text></View><Row label="原始金额" value={formatCent(item.original_amount_cent)} /><Row label="待偿金额" value={formatCent(item.outstanding_amount_cent)} />{item.risk_hold ? <NoticeBanner tone="danger" message="该欠款触发提现风险冻结" /> : null}</View>) : <StateView kind="empty" title="没有欠款" message="当前没有服务端欠款记录" />}</>}
    />
  </SafeAreaView>;
}

function IncomeCard({ item }: { item: SellerIncomeApiView }) { return <View style={styles.card}><View style={styles.row}><Text style={styles.title}>{item.service_title}</Text><Text style={styles.status}>{incomeStatus[item.status]}</Text></View><Text style={styles.meta}>订单 {item.order_no}</Text><Row label="订单金额" value={formatCent(item.order_amount_cent)} /><Row label="平台费" value={formatCent(item.platform_fee_cent)} /><Row label="陪玩收益" value={formatCent(item.seller_amount_cent)} /><Row label="当前可用" value={formatCent(item.available_amount_cent)} /><Row label="当前锁定" value={formatCent(item.locked_amount_cent)} /><Row label="已提现" value={formatCent(item.withdrawn_amount_cent)} /><Row label="已冲回" value={formatCent(item.reversed_amount_cent)} /></View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: "#DEF0FF" }, state: { minHeight: 240, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, list: { gap: spacing.md, paddingHorizontal: 12, paddingBottom: spacing.xxl }, more: { paddingVertical: spacing.sm }, heading: { ...typography.sectionTitle, color: colors.text, marginTop: spacing.md }, card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.lg, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, title: { ...typography.cardTitle, color: colors.text, flex: 1 }, status: { ...typography.caption, color: colors.brand, fontWeight: "800" }, meta: { ...typography.caption, color: colors.textSecondary }, value: { ...typography.body, color: colors.text } });
