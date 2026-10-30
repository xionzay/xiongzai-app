import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { NativeRow } from '@/components/native-page';
import { SellerSectionPage } from '@/components/seller-section-page';
import { PrimaryButton } from '@/components/primary-button';
import { StateView } from '@/components/state-view';
import { useFinanceSummary, useSellerIncomes } from './seller-finance-api';
import { formatCent } from '@/utils/money';
import { colors } from '@/theme/tokens';
import type { SellerIncomeApiView } from '@/types/api';

export const fundIncomeStatus: Record<SellerIncomeApiView['status'], string> = { PENDING_SETTLEMENT: '待结算', AVAILABLE: '可提现', WITHDRAWAL_LOCKED: '提现锁定', WITHDRAWN: '已提现', REVERSED: '已冲回' };

export function SellerFundsScreen() {
  const query = useFinanceSummary();
  const incomes = useSellerIncomes();
  const [expanded, setExpanded] = useState(false);
  const data = query.data;
  const rows = incomes.data?.pages.flatMap(page => page.items) ?? [];
  const refresh = () => { void Promise.all([query.refetch(), incomes.refetch()]); };
  const more = () => { if (!incomes.isFetchingNextPage) void incomes.fetchNextPage({ cancelRefetch: false }); };
  return <SellerSectionPage title="账户资金">
    {query.isPending ? <StateView kind="loading" /> : !data ? <StateView kind="error" onRetry={() => void query.refetch()} /> : <FlatList
      data={rows} keyExtractor={item => item.id} renderItem={({ item }) => <FundIncomeRow item={item} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={query.isRefetching || incomes.isRefetching} onRefresh={refresh} tintColor={colors.brand} />}
      ListHeaderComponent={<>
        {query.isError ? <Text accessibilityRole="alert" style={styles.error}>余额同步失败，下拉重试；下方保留上次读取的数据。</Text> : null}
        <View style={styles.balance}>
          <Text style={styles.label}>可申请提现（元）</Text><Text accessibilityLabel={`可申请提现 ${formatCent(data.available_cent)}`} style={styles.amount}>{formatCent(data.available_cent).replace(/^¥/, '')}</Text>
          <Text style={styles.note}>测试提现，不会真实打款；可申请金额不代表即时到账。</Text>
        </View>
        <View style={styles.metrics}>
          <Metric label="待结算" amount={data.pending_cent} /><Metric label="锁定金额" amount={data.locked_cent} />
        </View>
        <Text style={styles.note}>锁定金额以服务端账务为准，不等同于售后冻结。</Text>
        {data.withdrawal_paused || BigInt(data.liability_cent) > 0n ? <Text accessibilityRole="alert" style={styles.error}>欠款 {formatCent(data.liability_cent)}{data.withdrawal_paused ? ' · 提现已暂停，请查看风险或欠款状态。' : ' · 请查看欠款明细。'}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="其他资金汇总" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.disclosure}><Text style={styles.label}>累计收益、已提现与欠款</Text><Text style={styles.link}>{expanded ? '收起' : '展开'}</Text></Pressable>
        {expanded ? <View style={styles.metrics}><Metric label="累计收益" amount={data.total_earned_cent} /><Metric label="已提现" amount={data.withdrawn_cent} /><Metric label="欠款" amount={data.liability_cent} /></View> : null}
        <Text accessibilityRole="header" style={styles.heading}>逐笔资金明细</Text>
        <Text style={styles.note}>买家实付与陪玩收益分别展示，均来自服务端记录。</Text>
        {incomes.isError && rows.length ? <Pressable accessibilityRole="button" accessibilityLabel="资金明细同步失败，重试" onPress={() => void incomes.refetch()} style={styles.disclosure}><Text style={styles.error}>同步失败，保留已加载明细，点击重试</Text></Pressable> : null}
      </>}
      ListEmptyComponent={incomes.isPending ? <StateView kind="loading" /> : incomes.isError ? <StateView kind="error" title="资金明细加载失败" onRetry={() => void incomes.refetch()} /> : <View style={styles.empty}><Text style={styles.label}>暂无资金明细</Text><Text style={styles.note}>订单产生真实收益记录后会显示在这里。</Text></View>}
      ListFooterComponent={<>
        {incomes.hasNextPage ? <PrimaryButton tone="plain" label={incomes.isFetchNextPageError ? '重试加载明细' : '加载更多明细'} loading={incomes.isFetchingNextPage} disabled={incomes.isFetchingNextPage} onPress={more} /> : null}
        <PrimaryButton tone="plain" label="测试提现" disabled={data.withdrawal_paused || query.isError} onPress={() => router.push('/seller/finance/withdraw')} />
        <NativeRow label="收款账户" note="微信、支付宝" onPress={() => router.push('/seller/finance/accounts')} />
        <NativeRow label="提现记录" onPress={() => router.push('/seller/finance/withdrawals')} />
        <NativeRow label="收益与欠款明细" last onPress={() => router.push('/seller/finance/incomes')} />
      </>}
    />}
  </SellerSectionPage>;
}

function Metric({ label, amount }: { label: string; amount: string }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text accessibilityLabel={`${label} ${formatCent(amount)}`} style={styles.metricAmount}>{formatCent(amount)}</Text></View>; }

export function FundIncomeRow({ item }: { item: SellerIncomeApiView }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.service_title}，${fundIncomeStatus[item.status]}，买家实付 ${formatCent(item.order_amount_cent)}，查看订单`} onPress={() => router.push({ pathname: '/seller/orders/[id]', params: { id: item.order_id } })} style={({ pressed }) => [styles.incomeRow, pressed && styles.pressed]}>
    <View style={styles.incomeCopy}><Text style={styles.productTitle}>{item.service_title}</Text><Text style={styles.note}>{item.order_no} · {fundIncomeStatus[item.status]}</Text></View>
    <View style={styles.incomeAmount}><Text style={styles.note}>买家实付</Text><Text style={styles.metricAmount}>{formatCent(item.order_amount_cent)}</Text><Text style={styles.note}>陪玩收益 {formatCent(item.seller_amount_cent)}</Text></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingBottom: 24 }, balance: { padding: 12, gap: 10, borderWidth: 1, borderColor: colors.divider, borderRadius: 12 },
  label: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 }, amount: { color: colors.text, fontSize: 30, lineHeight: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 12 },
  metric: { width: '50%', padding: 12, gap: 6 }, metricAmount: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: '600', fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, paddingVertical: 12 }, disclosure: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  link: { color: colors.brandDeep, fontSize: 13 }, heading: { color: colors.text, fontSize: 16, fontWeight: '600', paddingTop: 12, paddingBottom: 8 },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 8 }, incomeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  incomeCopy: { flex: 1, minWidth: 120, gap: 6 }, incomeAmount: { alignItems: 'flex-end', flexShrink: 1, gap: 4 }, productTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' }, pressed: { opacity: 0.7 }
});
