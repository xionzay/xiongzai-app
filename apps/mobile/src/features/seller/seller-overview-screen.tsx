import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { FileImage } from '@/components/file-image';
import { StateView } from '@/components/state-view';
import { useSellerOverview } from './seller-api';
import { useSellerOrders } from './seller-order-api';
import { SellerIdentity } from './seller-identity';
import { sellerHomeTasks, type SellerHomeFilter } from './seller-home-model';
import { sellerOrderStatusLabel } from './seller-order-domain';
import { colors } from '@/theme/tokens';
import { approvedLayout } from '@/theme/approved-layout';
import { formatCent } from '@/utils/money';
import type { OrderApiView } from '@/types/api';

export function SellerOverviewScreen() {
  const query = useSellerOverview();
  const ordersQuery = useSellerOrders(Boolean(query.data));
  const { fontScale } = useWindowDimensions();
  const data = query.data;
  const rows = ordersQuery.data?.pages.flatMap(page => page.items) ?? [];
  const tasks = sellerHomeTasks(rows);
  const complete = Boolean(ordersQuery.data) && !ordersQuery.hasNextPage && !ordersQuery.isError;
  const refundCount = complete ? new Set(rows.filter(row => row.after_sale_status === 'IN_PROGRESS').map(row => row.id)).size : null;
  const openOrders = (filter: SellerHomeFilter) => router.push({ pathname: '/(seller-tabs)/orders', params: { filter } });
  const refresh = () => { void query.refetch(); void ordersQuery.refetch(); };

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><BrandBackdrop seller />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching || ordersQuery.isRefetching} onRefresh={refresh} />}>
      {query.isPending ? <StateView kind="loading" title="正在读取经营数据" /> : query.isError || !data ? <StateView kind="error" title="工作台加载失败" onRetry={refresh} /> : <>
        <SellerIdentity seller={data.seller} />
        <View style={styles.section}>
          <View style={styles.titleRow}><Text style={styles.title}>今日经营</Text><Pressable accessibilityRole="button" accessibilityLabel="查看经营数据" style={styles.linkButton} onPress={() => router.push('/(seller-tabs)/earnings')}><Text style={styles.link}>查看数据</Text><Arrow /></Pressable></View>
          <View style={styles.stats}><View style={[styles.stat, styles.turnoverStat]}><Text style={styles.note}>今日成交额（元）</Text><Text style={styles.number}>—</Text></View><View style={[styles.stat, styles.paidStat]}><Text style={styles.note}>支付订单</Text><Text style={styles.number}>—</Text></View></View>
          <Text style={styles.note}>今日成交统计暂未提供，不能以余额或累计订单代替。</Text>
          <View style={styles.counts}>
            <Count label="待付款" value={data.order_counts.PENDING_PAYMENT ?? 0} large={fontScale > 1.3} />
            <Count label="待服务" value={data.order_counts.PENDING_SERVICE ?? 0} large={fontScale > 1.3} onPress={() => openOrders('PENDING_SERVICE')} />
            <Count label="服务中" value={data.order_counts.IN_SERVICE ?? 0} large={fontScale > 1.3} onPress={() => openOrders('IN_SERVICE')} />
            <Count label="待收货" value={data.order_counts.PENDING_BUYER_CONFIRM ?? 0} large={fontScale > 1.3} onPress={() => openOrders('PENDING_BUYER_CONFIRM')} />
            <Count label="退款售后" value={refundCount} large={fontScale > 1.3} onPress={() => openOrders('AFTER_SALE')} />
          </View>
          <Text style={styles.note}>待付款仅展示数量，付款后才可查看买家订单。</Text>
        </View>
        <View style={styles.tools}>
          <Tool label="商品管理" icon="product" href="/(seller-tabs)/services" large={fontScale > 1.3} />
          <Tool label="评价管理" icon="message" href="/seller/reviews" large={fontScale > 1.3} />
          <Tool label="售后处理" icon="shield" href="/seller/refunds" large={fontScale > 1.3} />
          <Tool label="经营数据" icon="data" href="/(seller-tabs)/earnings" large={fontScale > 1.3} />
        </View>
        {data.finance.withdrawal_paused ? <Text style={styles.warning}>存在欠款 {formatCent(data.finance.liability_cent)}，提现已暂停。请到“我的 → 资金与结算明细”查看。</Text> : null}
        <View style={styles.titleRow}><Text style={styles.title}>{complete ? '待办事项' : '已加载待办'} {ordersQuery.isPending || ordersQuery.isError ? '—' : tasks.length}</Text><Text style={styles.note}>按已知时限排序</Text></View>
        {ordersQuery.isPending ? <StateView kind="loading" title="正在读取订单待办" /> : ordersQuery.isError ? <StateView kind="error" title="待办读取失败" onRetry={() => void ordersQuery.refetch()} /> : <>
          {tasks.map(order => <Task key={order.id} order={order} />)}
          {!tasks.length ? <View style={styles.empty}><ApprovedIllustration kind="shield" size={48} /><Text style={styles.title}>{complete ? '暂无订单待办' : '已加载订单中暂无待办'}</Text><Text style={styles.note}>{complete ? '有新的订单或售后时会显示在这里。' : '还有历史订单未加载，请继续查看。'}</Text></View> : null}
          {ordersQuery.hasNextPage ? <Pressable accessibilityRole="button" accessibilityLabel="加载更多订单待办" disabled={ordersQuery.isFetchingNextPage} style={styles.loadMore} onPress={() => void ordersQuery.fetchNextPage()}><Text style={styles.link}>{ordersQuery.isFetchingNextPage ? '加载中…' : '加载更多订单待办'}</Text></Pressable> : null}
        </>}
        {(data.service_counts.REVIEW_REJECTED ?? 0) > 0 ? <Pressable accessibilityRole="button" style={styles.task} onPress={() => router.push('/(seller-tabs)/services')}><Text style={styles.title}>{data.service_counts.REVIEW_REJECTED} 个服务审核未通过</Text><Text style={styles.note}>查看审核意见并修改</Text></Pressable> : null}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
function Arrow() { return <ApprovedIllustration kind="chevron" rotation={-90} size={16} />; }
function Count({ label, value, onPress, large }: { label: string; value: number | null; onPress?: () => void; large: boolean }) {
  const content = <><Text style={styles.countNumber}>{value ?? '—'}</Text><Text style={styles.countLabel}>{label}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`查看${label}订单`} onPress={onPress} style={({ pressed }) => [styles.count, large && styles.largeCell, pressed && styles.pressed]}>{content}</Pressable> : <View style={[styles.count, large && styles.largeCell]}>{content}</View>;
}
function Tool({ label, icon, href, large }: { label: string; icon: 'product'|'message'|'shield'|'data'; href: Href; large: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} style={({ pressed }) => [styles.tool, large && styles.largeCell, pressed && styles.pressed]}><ApprovedIllustration kind={icon} size={36} /><Text style={styles.toolLabel}>{label}</Text></Pressable>;
}
function Task({ order }: { order: OrderApiView }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${sellerOrderStatusLabel(order)}，${order.product_title}，查看订单`} onPress={() => router.push({ pathname: '/seller/orders/[id]', params: { id: order.id } })} style={({ pressed }) => [styles.task, pressed && styles.pressed]}>
    <Text style={styles.title}>{sellerOrderStatusLabel(order)}</Text>
    <View style={styles.product}><FileImage fileId={order.product_image} label={`${order.product_title}主图`} compact style={styles.cover} /><View style={styles.copy}><Text style={styles.productName}>{order.product_title}</Text><Text style={styles.note}>{order.sku_name}</Text><Text style={styles.note}>买家实付 <Text style={styles.productName}>{formatCent(order.paid_amount_cent)}</Text></Text></View><Arrow /></View>
    <View style={styles.titleRow}><Text style={[styles.note, styles.copy]}>{order.buyer?.nickname ?? '平台买家'}</Text><Text style={styles.link}>查看订单</Text></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { paddingHorizontal: approvedLayout.gutter, paddingBottom: 24 }, section: { paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48 }, title: { color: colors.text, fontSize: 16, fontWeight: '700' }, note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }, link: { color: colors.brandDeep, fontSize: 12 }, linkButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }, stats: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, stat: { gap: 8, paddingHorizontal: 8 }, turnoverStat: { flex: 1.4 }, paidStat: { flex: 1, paddingLeft: 30, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: approvedLayout.divider }, number: { color: colors.text, fontSize: 29, fontWeight: '700' }, counts: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 12 }, count: { width: '20%', minHeight: 64, justifyContent: 'center', alignItems: 'center', gap: 6 }, countNumber: { color: colors.text, fontSize: 21, fontWeight: '600' }, countLabel: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' }, tools: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, tool: { width: '25%', minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 6 }, toolLabel: { color: colors.text, fontSize: 13, textAlign: 'center' }, largeCell: { width: '50%', paddingVertical: 8 }, task: { gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, product: { flexDirection: 'row', alignItems: 'center', gap: 10 }, cover: { width: 62, height: 62, borderRadius: 8 }, copy: { flex: 1, gap: 4 }, productName: { color: colors.text, fontSize: 14, fontWeight: '600' }, empty: { alignItems: 'center', paddingVertical: 32, gap: 10 }, loadMore: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, warning: { color: colors.danger, fontSize: 13, lineHeight: 20, paddingVertical: 12 }, pressed: { opacity: 0.7 }
});
