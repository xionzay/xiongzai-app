import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FileImage } from '@/components/file-image';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { StateView } from '@/components/state-view';
import { useSellerServices } from './seller-api';
import { ProductQuickActions } from './product-quick-actions';
import { MerchantHeader, merchantStyles } from './merchant-page';
import { productTabs, visibleSellerProducts } from './product-list-model';
import { colors } from '@/theme/tokens';
import { approvedLayout } from '@/theme/approved-layout';
import type { SellerServiceApiView } from '@/types/api';
import { formatCent } from '@/utils/money';

export function SellerServicesScreen() {
  const query = useSellerServices();
  const [filter, setFilter] = useState('在售');
  const [keyword, setKeyword] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [priceAscending, setPriceAscending] = useState(false);
  const rows = visibleSellerProducts(query.data ?? [], filter, keyword, priceAscending);
  const header = <>
    {searchOpen ? <View style={styles.search}><TextInput autoFocus accessibilityLabel="搜索商品" value={keyword} onChangeText={setKeyword} placeholder="商品名称或编号" style={[merchantStyles.input, styles.grow]} /><Pressable accessibilityRole="button" accessibilityLabel="清空并关闭搜索" style={merchantStyles.iconButton} onPress={() => { setKeyword(''); setSearchOpen(false); }}><ApprovedIllustration kind="close" size={22} /></Pressable></View> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{productTabs.map(tab => <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: filter === tab.label }} onPress={() => setFilter(tab.label)} style={[styles.tab, filter === tab.label && styles.activeTab]}><Text style={[styles.tabText, filter === tab.label && styles.activeText]}>{tab.label}（{query.data ? query.data.filter(row => tab.values.includes(row.status)).length : '—'}）</Text></Pressable>)}</ScrollView>
    <View style={styles.sort}><Text style={merchantStyles.note}>{query.isPending || query.isError ? '—' : rows.length} 个商品</Text><Pressable accessibilityRole="button" accessibilityLabel="切换商品排序" style={styles.sortButton} onPress={() => setPriceAscending(value => !value)}><Text style={merchantStyles.note}>{priceAscending ? '价格从低到高' : '最近更新'}</Text><ApprovedIllustration kind="chevron" size={16} /></Pressable></View>
  </>;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><BrandBackdrop seller />
    <MerchantHeader title="商品管理" onBack={() => router.replace('/(seller-tabs)')} action={<Pressable accessibilityRole="button" accessibilityLabel="搜索商品" accessibilityState={{ expanded: searchOpen }} onPress={() => setSearchOpen(value => !value)} style={merchantStyles.iconButton}><ApprovedIllustration kind="search" size={25} /></Pressable>} />
    <FlatList data={query.isError ? [] : rows} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      renderItem={({ item }) => <ProductCard item={item} />}
      ListEmptyComponent={query.isPending ? <StateView kind="loading" /> : query.isError ? <StateView kind="error" onRetry={() => void query.refetch()} /> : <StateView kind="empty" title={`暂无${filter}商品`} message={keyword ? '试试其他关键词。' : '发布服务，让买家了解你的专长。'} />} />
    <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel="发布服务" onPress={() => router.push("/seller/services/new")} style={({ pressed }) => [merchantStyles.button, merchantStyles.primary, pressed && styles.pressed]}><View style={styles.publish}><ApprovedIllustration kind="plus" size={20} /><Text style={[merchantStyles.buttonText, merchantStyles.primaryText]}>发布商品</Text></View></Pressable></View>
  </SafeAreaView>;
}
function ProductCard({ item }: { item: SellerServiceApiView }) {
  const edit = () => router.push({ pathname: '/seller/services/[id]/edit', params: { id: item.id } });
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看商品：${item.title}`} onPress={edit} style={styles.product}><FileImage fileId={item.cover_file_id} style={styles.image} label={`${item.title}主图`} compact /><View style={styles.grow}><Text style={styles.title} numberOfLines={2}>{item.title}</Text><Text style={merchantStyles.note}>已售 {item.sold_count} 单</Text><Text style={styles.money}>{formatCent(item.min_price_cent)} 起</Text></View></Pressable>
    {item.status === 'REVIEW_REJECTED' ? <Text style={styles.warning}>驳回原因：{item.rejection_reason || '请查看审核详情'}。修改后可重新提交。</Text> : null}
    {item.status === 'PENDING_REVIEW' ? <Text style={merchantStyles.note}>平台审核中，审核完成前暂不可编辑。</Text> : null}
    {item.status === 'ADMIN_OFF_SALE' ? <Text style={styles.warning}>平台下架，请查看审核详情。</Text> : null}
    <ProductQuickActions item={item} />
  </View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, list: { paddingHorizontal: approvedLayout.gutter, paddingBottom: 24 }, grow: { flex: 1, gap: 6 }, search: { flexDirection: 'row', alignItems: 'center', gap: 6 }, tabs: { flexDirection: 'row', gap: 4 }, tab: { minHeight: 48, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: colors.brandDeep }, tabText: { color: colors.textSecondary, fontSize: 13 }, activeText: { color: colors.brandDeep, fontWeight: '700' }, sort: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sortButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }, card: { gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, product: { flexDirection: 'row', alignItems: 'center', gap: 12 }, image: { width: 76, height: 76, borderRadius: 8 }, title: { color: colors.text, fontSize: 15, fontWeight: '600' }, money: { color: colors.text, fontSize: 16, fontWeight: '700' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }, footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: approvedLayout.divider }, publish: { flexDirection: 'row', alignItems: 'center', gap: 6 }, warning: { color: colors.danger, fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.7 }
});
