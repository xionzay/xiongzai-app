import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SellerSectionPage } from '@/components/seller-section-page';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { StateView } from '@/components/state-view';
import { useSellerProfile } from './seller-api';
import { useCompanionReviews } from '@/features/discovery/discovery-api';
import { flattenUniqueById } from '@/features/discovery/discovery-domain';
import { colors } from '@/theme/tokens';
import { approvedLayout } from '@/theme/approved-layout';

export function SellerReviewsScreen() {
  const profile = useSellerProfile();
  const reviews = useCompanionReviews(profile.data?.id ?? '', profile.data?.status === 'APPROVED');
  const items = flattenUniqueById(reviews.data?.pages ?? []);
  const loadMore = () => { if (!reviews.isFetchingNextPage && reviews.hasNextPage) void reviews.fetchNextPage({ cancelRefetch: false }); };
  return <SellerSectionPage title="评价管理">
    {profile.isPending ? <StateView kind="loading" /> : profile.isError ? <StateView kind="error" onRetry={() => void profile.refetch()} /> : profile.data?.status !== 'APPROVED' ? <StateView kind="error" title="当前没有陪玩经营权限" /> : reviews.isPending ? <StateView kind="loading" /> : reviews.isError && !items.length ? <StateView kind="error" onRetry={() => void reviews.refetch()} /> : <FlatList
      data={items} keyExtractor={item => item.id} refreshing={reviews.isRefetching} onRefresh={() => void reviews.refetch()}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<>
        <View style={styles.head}><Text accessibilityRole="header" style={styles.title}>买家评价</Text><Text style={styles.note}>{reviews.hasNextPage || reviews.isError ? '已加载 ' : ''}{items.length} 条</Text></View>
        <Text style={styles.note}>仅展示已公开评价；暂不支持回复或编辑。</Text>
        {reviews.isError ? <Pressable accessibilityRole="button" accessibilityLabel="评价同步失败，重试" style={styles.link} onPress={() => void reviews.refetch()}><Text style={styles.note}>同步失败，保留已加载评价，点击重试。</Text></Pressable> : null}
      </>}
      ListEmptyComponent={<Text style={styles.note}>暂无买家评价，不自动生成好评。</Text>}
      renderItem={({ item }) => <View style={styles.row}><View style={styles.head}><Text style={[styles.title, styles.copy]}>{item.display_nickname}</Text><Text accessibilityLabel={`评分 ${item.rating} 分`} style={styles.rating}>{item.rating}.0 分</Text></View><Text style={styles.body}>{item.content || '买家未填写文字评价'}</Text><Pressable accessibilityRole="button" disabled={!item.order_id} style={styles.link} onPress={() => { if (item.order_id) router.push({ pathname: '/seller/orders/[id]', params: { id: item.order_id } }); }}><Text style={[styles.body, styles.copy]}>{item.service_title}</Text><View style={styles.orderLink}><Text style={styles.note}>{item.order_id ? '查看订单' : '订单暂不可查看'}</Text>{item.order_id ? <ApprovedIllustration kind="chevron" rotation={-90} size={14} /> : null}</View></Pressable></View>}
      ListFooterComponent={reviews.hasNextPage ? <Pressable accessibilityRole="button" disabled={reviews.isFetchingNextPage} style={styles.link} onPress={loadMore}><Text style={styles.action}>{reviews.isFetchingNextPage ? '正在加载…' : reviews.isFetchNextPageError ? '重试加载评价' : '加载更多'}</Text></Pressable> : null}
    />}
  </SellerSectionPage>;
}
const styles = StyleSheet.create({ list: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 24 }, note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flexShrink: 1 }, row: { paddingVertical: 16, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, head: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, copy: { flex: 1 }, title: { fontSize: 15, color: colors.text, fontWeight: '600' }, rating: { fontSize: 14, color: colors.warning }, body: { fontSize: 14, lineHeight: 22, color: colors.text }, link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, orderLink: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }, action: { color: colors.brandDeep, fontSize: 13 } });
