import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { CalendarDatePicker } from '@/components/calendar-date-picker';
import { NativePage } from '@/components/native-page';
import { StateView } from '@/components/state-view';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { useSellerIncomes } from './seller-finance-api';
import { colors } from '@/theme/tokens';
import { approvedLayout } from '@/theme/approved-layout';
import { chinaDate, revenueBounds, revenueMetrics, revenueMoney, type RevenueRange } from '../../../../../app/seller-workbench/revenue-model';

const ranges: RevenueRange[] = ['今日', '昨日', '本周', '本月', '本年', '累计', '自定义'];
const tools = [
  { label: '我的订单', icon: 'order', href: '/(seller-tabs)/orders' },
  { label: '资金明细', icon: 'wallet', href: '/seller/finance' },
  { label: '联系客服', icon: 'service', href: '/support' }
] as const;

export function SellerEarningsSummaryScreen() {
  const incomes = useSellerIncomes();
  const { fontScale } = useWindowDimensions();
  const [range, setRange] = useState<RevenueRange>('本月');
  const [customStart, setCustomStart] = useState(() => chinaDate(Date.now()));
  const [customEnd, setCustomEnd] = useState(() => chinaDate(Date.now()));
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [trend, setTrend] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const rows = useMemo(() => [...new Map((incomes.data?.pages.flatMap(page => page.items) ?? []).map(row => [row.id, row])).values()], [incomes.data]);
  const bounds = revenueBounds(range, customStart, customEnd, now);
  const metrics = revenueMetrics(rows, bounds);
  // A partial cursor page is not a complete financial report.
  const complete = Boolean(incomes.data) && !incomes.hasNextPage && !incomes.isError;
  const money = (value: bigint | null) => complete && bounds && value !== null ? revenueMoney(value) : '—';
  const count = (value: number | null) => complete && bounds && value !== null ? String(value) : '—';

  return <NativePage title="收益中心" subtitle="" onBack={() => router.canGoBack() ? router.back() : router.replace('/(seller-tabs)/mine')} refreshing={incomes.isRefetching} onRefresh={() => { setNow(new Date()); void incomes.refetch(); }} contentStyle={styles.content}>
    {incomes.isPending ? <StateView kind="loading" title="正在读取收益数据" /> : incomes.isError ? <StateView kind="error" title="收益数据加载失败" onRetry={() => void incomes.refetch()} /> : <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{ranges.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: range === item }} onPress={() => { setRange(item); setNow(new Date()); }} style={[styles.tab, range === item && styles.active]}><Text style={[styles.tabText, range === item && styles.activeText]}>{item === '累计' ? '全部' : item === '自定义' ? '范围' : item}</Text></Pressable>)}</ScrollView>
      {range === '自定义' ? <View style={styles.dates}><DateField label="开始日期" value={customStart} onPress={() => setDatePicker('start')} /><Text style={styles.note}>至</Text><DateField label="结束日期" value={customEnd} onPress={() => setDatePicker('end')} />{!bounds ? <Text style={styles.error}>请选择有效日期，开始不能晚于结束，结束不能晚于今天。</Text> : null}</View> : null}
      <View style={styles.panel}><View style={styles.hero}><Text style={styles.amount}>{money(metrics.net)}</Text><Text style={styles.title}>{range === '累计' ? '累计' : range}净收益（元）</Text><Text style={styles.note}>订单收入扣除平台服务费与退款扣减</Text></View>
        <View style={styles.grid}>{[
          ['订单收入', money(metrics.gross)], ['平台服务费', money(metrics.fees)], ['退款扣减', money(metrics.reversed)],
          ['收益订单', count(metrics.orders)], ['服务买家', count(metrics.buyers)], ['平均单笔收益', money(metrics.average)]
        ].map(([label, value]) => <View key={label} style={[styles.metric, fontScale > 1.3 && styles.metricLarge]}><Text style={styles.value}>{value}</Text><Text style={styles.note}>{label}</Text></View>)}</View>
      </View>
      {!complete ? <View style={styles.notice}><Text style={styles.note}>收益明细尚未加载完整，汇总暂不展示，避免将部分金额当作全部收益。</Text><Pressable accessibilityRole="button" disabled={incomes.isFetchingNextPage} style={styles.link} onPress={() => { if (!incomes.isFetchingNextPage) void incomes.fetchNextPage(); }}><Text style={styles.action}>{incomes.isFetchingNextPage ? '正在加载…' : '继续加载收益明细'}</Text></Pressable></View> : metrics.buyers === null ? <Text style={styles.note}>服务买家数暂不可用：当前接口未返回买家标识，不以订单数代替。</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: trend }} style={styles.link} onPress={() => setTrend(!trend)}><Text style={styles.action}>{trend ? '收起收益趋势' : '展开收益趋势'}</Text></Pressable>
      {trend ? <View style={styles.panel}>{!complete ? <Text style={styles.note}>请先加载完整收益明细</Text> : metrics.buckets.length ? metrics.buckets.map(bucket => <View key={bucket.key} style={styles.trendRow}><Text style={styles.note}>{bucket.key}</Text><Text style={styles.value}>{revenueMoney(bucket.value)}</Text></View>) : <Text style={styles.note}>当前区间暂无收益</Text>}</View> : null}
      <View style={styles.panel}><View style={styles.sectionHead}><Text style={styles.title}>收益明细</Text><Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/seller/finance/incomes')}><Text style={styles.action}>查看更多</Text></Pressable></View>
        {metrics.selected.slice(0, 3).map(item => <Pressable key={item.id} accessibilityRole="button" style={styles.income} onPress={() => router.push({ pathname: '/seller/orders/[id]', params: { id: item.order_id } })}><View style={styles.grow}><Text style={styles.title}>{item.service_title}</Text><Text style={styles.note}>{item.order_no} · {chinaDate(Date.parse(item.created_at))}</Text></View><Text style={styles.value}>{revenueMoney(BigInt(item.seller_amount_cent) - BigInt(item.reversed_amount_cent))}</Text></Pressable>)}
        {!metrics.selected.length ? <Text style={styles.note}>{complete ? '当前区间暂无收益记录' : '已加载记录中暂无当前区间收益'}</Text> : null}
      </View>
      <View style={styles.tools}>{tools.map(item => <Pressable key={item.label} accessibilityRole="button" onPress={() => router.push(item.href)} style={styles.tool}><ApprovedIllustration kind={item.icon} size={32} /><Text style={styles.note}>{item.label}</Text></Pressable>)}</View>
    </>}
    {datePicker ? <CalendarDatePicker visible title={datePicker === 'start' ? '选择开始日期' : '选择结束日期'} value={datePicker === 'start' ? customStart : customEnd} minimumDate={datePicker === 'end' ? customStart : undefined} maximumDate={datePicker === 'start' ? customEnd : chinaDate(now.getTime())} onSelect={datePicker === 'start' ? setCustomStart : setCustomEnd} onClose={() => setDatePicker(null)} /> : null}
  </NativePage>;
}
function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={`选择${label}，当前${value}`} style={styles.date} onPress={onPress}><Text style={styles.note}>{label}</Text><Text style={styles.title}>{value}</Text></Pressable>; }
const styles = StyleSheet.create({
  content: { gap: 14 }, tabs: { gap: 4 }, tab: { paddingHorizontal: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, active: { backgroundColor: colors.brand }, tabText: { color: colors.text, fontSize: 13 }, activeText: { color: '#fff' },
  panel: { padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.4)' }, hero: { alignItems: 'center', paddingVertical: 12, gap: 8 }, note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary }, amount: { fontSize: 38, color: '#b6584c', fontWeight: '700', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: approvedLayout.divider }, metric: { width: '33.333%', minHeight: 84, padding: 8, justifyContent: 'center', alignItems: 'center', gap: 8 }, metricLarge: { width: '50%' }, value: { fontSize: 17, color: colors.text, fontWeight: '600', flexShrink: 1 }, title: { fontSize: 15, color: colors.text, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, action: { color: colors.brandDeep, fontSize: 13 }, income: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: approvedLayout.divider }, grow: { flex: 1, gap: 5 },
  dates: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, date: { flex: 1, minWidth: 125, minHeight: 60, padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.5)' }, error: { width: '100%', color: colors.danger, fontSize: 12 }, notice: { padding: 12 }, trendRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }, tools: { flexDirection: 'row' }, tool: { flex: 1, alignItems: 'center', gap: 8, minHeight: 72 }
});
