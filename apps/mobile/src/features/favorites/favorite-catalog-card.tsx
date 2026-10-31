import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { FileImage } from '@/components/file-image';
import { JellyIcon } from '@/components/jelly-icon';
import { colors } from '@/theme/tokens';
import { formatCent } from '@/utils/money';
import { shopFacts } from '@/features/home/home-domain';
import { productGameLabels } from '@xiongzai/contracts/commerce';
import type { FavoriteResource } from './favorites-screen';

/** Uses the same shop row / two-column product hierarchy as Web FavoritesScreen. */
export function FavoriteCatalogCard({ resource }: { resource: FavoriteResource }) {
  const { width, fontScale } = useWindowDimensions();
  if (resource.kind === 'SELLER') {
    const item = resource.item, facts = shopFacts(item);
    const size = width < 370 || fontScale > 1.3 ? 80 : 96;
    return <Pressable accessibilityRole="button" accessibilityLabel={`查看陪玩${item.seller_nickname}的主页`} onPress={() => router.push({ pathname: '/companions/[id]', params: { id: item.id } })} style={({ pressed }) => [styles.shop, pressed && styles.pressed]}>
      <FileImage fileId={item.seller_avatar_file_id} style={{ width: size, height: size, borderRadius: 12 }} label={`${item.seller_nickname}头像`} />
      <View style={styles.shopCopy}><Text style={styles.name} numberOfLines={1}>{item.seller_nickname}</Text><Text style={styles.intro} numberOfLines={2}>{facts.introduction}</Text><Text style={styles.meta}>{item.review_count ? `${item.rating_avg} 分 · ${item.review_count} 条评价` : '暂无评价'}</Text><View style={styles.tags}>{facts.games.map(game => <Text key={game} style={styles.tag}>{game}</Text>)}</View><Text style={styles.meta}>{facts.productCount ?? `${item.services.filter(service => service.status === 'ON_SALE').length} 件在售商品`}</Text></View>
      <JellyIcon kind="back" right size={16} />
    </Pressable>;
  }
  const item = resource.item;
  return <Pressable accessibilityRole="button" accessibilityLabel={`查看商品${item.title}，${formatCent(item.min_price_cent)}`} onPress={() => router.push({ pathname: '/services/[id]', params: { id: item.id } })} style={({ pressed }) => [styles.product, pressed && styles.pressed]}>
    <FileImage fileId={item.cover_file_id} resizeMode="contain" style={styles.cover} label={`${item.title}封面`} />
    <View style={styles.productCopy}><Text numberOfLines={1} style={styles.productName}>{item.title}</Text><Text numberOfLines={1} style={styles.meta}>{item.service_time_description || (item.fulfillment_seconds == null ? '预约商品' : `付款后 ${item.fulfillment_seconds / 3600} 小时内完成`)}</Text>{item.game ? <View style={styles.tags}><Text style={styles.tag}>{productGameLabels[item.game]}</Text></View> : null}<View style={styles.priceRow}><Text style={styles.price}>{formatCent(item.min_price_cent)}{item.pricing_mode === 'MULTI' ? <Text style={styles.meta}> 起</Text> : null}</Text><Text style={styles.meta}>已售 {item.sold_count}</Text></View>
      <View style={styles.seller}><FileImage fileId={item.seller.seller_avatar_file_id} style={styles.avatar} label={`${item.seller.seller_nickname}头像`} /><Text numberOfLines={1} style={styles.sellerName}>{item.seller.seller_nickname}</Text></View><Text style={styles.meta}>{item.review_count ? `${item.rating_avg} 分` : '暂无评价'}</Text>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  shop: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 9, minHeight: 118, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, shopCopy: { flex: 1, gap: 3, minWidth: 0 }, name: { fontSize: 15, lineHeight: 22, color: colors.text, fontWeight: '700' }, intro: { fontSize: 13, lineHeight: 20, color: colors.textSecondary }, meta: { fontSize: 12, lineHeight: 18, color: colors.textSecondary }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 3 }, tag: { fontSize: 12, lineHeight: 18, color: '#23639D', backgroundColor: '#E6F3FF', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 8 },
  product: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, cover: { width: '100%', aspectRatio: 1 }, productCopy: { padding: 10, gap: 3 }, productName: { fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '700' }, priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 6 }, price: { fontSize: 16, lineHeight: 24, color: colors.brand, fontWeight: '700' }, seller: { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, marginTop: 8, paddingTop: 7 }, avatar: { width: 22, height: 22, borderRadius: 11 }, sellerName: { flex: 1, fontSize: 12, color: colors.text }, pressed: { opacity: .72 }
});
