import { ReviewImages } from "../after-sale/review-images";
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { NativeHeader } from '@/components/native-page';
import { StateView } from '@/components/state-view';
import { JellyIcon } from '@/components/jelly-icon';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { colors } from '@/theme/tokens';
import { useProductReviews } from './discovery-api';
import { flattenUniqueById } from './discovery-domain';

/** Product reviews must never silently open a seller-wide review list. */
export function ProductReviewsScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { status } = useAuth();
  const online = useOnlineStatus();
  const query = useProductReviews(id, status !== 'booting');
  const items = useMemo(() => flattenUniqueById(query.data?.pages ?? []), [query.data]);
  const more = () => { if (online && query.hasNextPage && !query.isFetching) void query.fetchNextPage(); };
  return <SafeAreaView style={styles.safe}><BrandBackdrop /><NativeHeader title="全部评价" subtitle="商品评价 · 来自真实完成订单" />
    <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.content} refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()}
      ListHeaderComponent={!online ? <StateView kind="offline" onRetry={() => void query.refetch()} /> : query.isError ? <StateView kind="error" onRetry={() => void query.refetch()} /> : null}
      ListEmptyComponent={online && !query.isError ? <StateView kind={query.isPending ? 'loading' : 'empty'} illustrationSize={96} title={query.isPending ? '正在读取评价' : '暂无评价'} /> : null}
      renderItem={({ item }) => <View style={styles.review}><View style={styles.row}><Text style={styles.name}>{item.display_nickname}</Text><Text accessibilityLabel={`${item.rating} 星`}>{Array.from({ length: item.rating }, (_, index) => <JellyIcon key={index} kind="star" />)}</Text></View><Text style={styles.body}>{item.content || '未填写文字评价'}</Text><ReviewImages review={item} /><Text style={styles.meta}>{item.sku_name} · {new Date(item.created_at).toLocaleDateString('zh-CN')}</Text></View>}
      onEndReached={() => { if (!query.isError) more(); }} onEndReachedThreshold={.35}
      ListFooterComponent={query.hasNextPage ? <Pressable accessibilityRole="button" disabled={!online || query.isFetching} onPress={more} style={styles.more}><Text style={styles.meta}>{query.isFetchingNextPage ? '加载中…' : '加载更多评价'}</Text></Pressable> : null} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: 16, flexGrow: 1 }, review: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, name: { flex: 1, fontSize: 14, color: colors.text }, body: { fontSize: 14, lineHeight: 23, marginVertical: 8, color: colors.text }, meta: { fontSize: 12, color: colors.textSecondary }, more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
