import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/auth/runtime';
import { ApiClientError } from '@/api/api-error';
import { useAuth } from '@/auth/auth-provider';
import { NativeButton, NativePage } from '@/components/native-page';
import { NoticeBanner } from '@/components/notice-banner';
import { StateView } from '@/components/state-view';
import { FavoriteCatalogCard } from './favorite-catalog-card';
import { useFavorites } from './favorites-api';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { colors } from '@/theme/tokens';
import type { CompanionDetailApiView, ServiceDetailApiView } from '@/types/api';

export type FavoriteResource =
  | { kind: 'SELLER'; item: CompanionDetailApiView }
  | { kind: 'PRODUCT'; item: ServiceDetailApiView };

export function FavoritesScreen() {
  const [tab, setTab] = useState<'SELLER' | 'PRODUCT'>('SELLER');
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const favorites = useFavorites(status === 'authenticated');
  const items = useMemo(() => [...new Map(favorites.items.map(item => [item.id, item])).values()], [favorites.items]);
  const resources = useQueries({
    queries: items.map(favorite => ({
      queryKey: ['favorite-resource', user?.id, favorite.target_type, favorite.seller_id, favorite.product_id],
      enabled: status === 'authenticated',
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<FavoriteResource> => {
        if (favorite.target_type === 'SELLER' && favorite.seller_id) {
          const item = await apiClient.publicRequest<CompanionDetailApiView>(`/companions/${encodeURIComponent(favorite.seller_id)}`, { signal });
          return { kind: 'SELLER', item };
        }
        if (favorite.target_type === 'PRODUCT' && favorite.product_id) {
          const item = await apiClient.publicRequest<ServiceDetailApiView>(`/services/${encodeURIComponent(favorite.product_id)}`, { signal });
          return { kind: 'PRODUCT', item };
        }
        throw new ApiClientError('RESOURCE_NOT_FOUND', '收藏目标不存在', 404);
      }
    }))
  });
  // Only confirmed permission/deletion responses are unavailable, never network failures.
  const unavailable = resources.filter(result => result.error instanceof ApiClientError && [403, 404, 410].includes(result.error.status));
  const failed = favorites.isError || resources.some(result => result.isError && !unavailable.includes(result));
  const pending = favorites.isPending || resources.some(result => result.isPending);
  const visible = resources.flatMap(result => !unavailable.includes(result) && result.data?.kind === tab ? [result.data] : []);
  const refresh = () => { void favorites.refetch(); for (const result of resources) void result.refetch(); };
  const refreshing = favorites.isRefetching || resources.some(result => result.isRefetching);

  if (status !== 'authenticated') return <NativePage title="我的收藏" subtitle="陪玩和服务分别收藏" contentStyle={styles.content}>
    <StateView kind={status === 'booting' ? 'loading' : 'empty'} title={status === 'booting' ? '正在恢复登录' : '登录后查看收藏'} message={status === 'booting' ? undefined : '收藏属于账号数据，请先登录'} />
    {status === 'anonymous' ? <NativeButton label="去登录" onPress={() => router.replace({ pathname: '/(auth)/login', params: { returnTo: '/favorites' } })} /> : null}
  </NativePage>;

  return <NativePage title="我的收藏" subtitle="陪玩和服务分别收藏" contentStyle={styles.content} refreshing={refreshing} onRefresh={refresh}>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {(['SELLER', 'PRODUCT'] as const).map(kind => <Pressable key={kind} accessibilityRole="tab" accessibilityLabel={kind === 'SELLER' ? '收藏的陪玩' : '收藏的服务'} accessibilityState={{ selected: tab === kind }} onPress={() => setTab(kind)} style={[styles.tab, tab === kind && styles.activeTab]}>
        <Text style={[styles.tabText, tab === kind && styles.activeText]}>收藏的{kind === 'SELLER' ? '陪玩' : '服务'} {items.filter(item => item.target_type === kind).length}</Text>
      </Pressable>)}
    </View>
    {!online ? <NoticeBanner message="网络已断开，已加载的收藏仍可查看；连接恢复后可下拉刷新。" /> : null}
    {online && failed ? <View><NoticeBanner tone="danger" message="部分收藏暂时读取失败，请重试；这不表示商品已经下架。" /><NativeButton label="重试读取收藏" tone="secondary" onPress={refresh} /></View> : null}
    {online && pending && !visible.length ? <StateView kind="loading" title="正在加载收藏" /> : null}
    {unavailable.length ? <NoticeBanner message={`${unavailable.length} 个收藏目标不存在或无权访问，未展示失效内容。`} /> : null}
    {visible.length ? <View style={tab === 'PRODUCT' ? styles.grid : styles.list}>{visible.map(resource => <View key={resource.item.id} style={tab === 'PRODUCT' ? styles.gridItem : undefined}><FavoriteCatalogCard resource={resource} /></View>)}</View> : null}
    {online && !pending && !failed && !visible.length ? <StateView kind="empty" illustrationSize={176} title={`还没有收藏的${tab === 'SELLER' ? '陪玩' : '服务'}`} message="收藏后会显示在这里" /> : null}
    {favorites.hasNextPage ? <NativeButton label={favorites.isFetchingNextPage ? '加载中…' : '加载更多收藏'} tone="secondary" disabled={!online || favorites.isFetching} onPress={() => { if (online && !favorites.isFetching) void favorites.fetchNextPage(); }} /> : null}
  </NativePage>;
}
const styles = StyleSheet.create({
  content: { gap: 13 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  tab: { flex: 1, minHeight: 48, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: colors.brand }, tabText: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, textAlign: 'center' }, activeText: { color: colors.brandDeep, fontWeight: '700' },
  list: { gap: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '3%', rowGap: 10 }, gridItem: { width: '48.5%' }
});
