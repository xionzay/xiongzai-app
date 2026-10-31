import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { FileImage } from '@/components/file-image';
import { JellyIcon } from '@/components/jelly-icon';
import { NoticeBanner } from '@/components/notice-banner';
import { PrimaryButton } from '@/components/primary-button';
import { colors } from '@/theme/tokens';
import type { CompanionDetailApiView } from '@/types/api';
import { productGameLabels } from '@xiongzai/contracts/commerce';
import { formatCent } from '@/utils/money';
import { useCompanionReviews } from './discovery-api';
import { flattenUniqueById } from './discovery-domain';

type Props = { item: CompanionDetailApiView; owner: boolean; preview: boolean; notice: string | null; refreshing: boolean; onRefresh(): void; voice: ReactNode; favorite: ReactNode; consulting: boolean; onContact(): void };
const tabs = ['商品', '评价', '介绍'] as const;
export function StorefrontView({ item, owner, preview, notice, refreshing, onRefresh, voice, favorite, consulting, onContact }: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('商品');
  const [expanded, setExpanded] = useState(false);
  const [shareError, setShareError] = useState('');
  const reviews = useCompanionReviews(item.id, tab === '评价');
  const rows = useMemo(() => flattenUniqueById(reviews.data?.pages ?? []), [reviews.data]);
  const products = item.services.filter(product => product.status === 'ON_SALE');
  const tags = [item.preferred_mode, item.play_style].filter((value): value is string => Boolean(value));
  const share = async () => { try { await Share.share({ message: `熊崽电竞店铺：${item.seller_nickname}\nxiongzai://companions/${encodeURIComponent(item.id)}` }); } catch { setShareError('暂时无法分享，请稍后重试。'); } };
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><BrandBackdrop />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { onRefresh(); if (tab === '评价') void reviews.refetch(); }} />}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.headerButton}><JellyIcon kind="back" size={28} /></Pressable><Text accessibilityRole="header" style={styles.heading}>店铺主页</Text><Pressable accessibilityRole="button" accessibilityLabel="分享主页" onPress={() => void share()} style={[styles.headerButton, { alignItems: "center" }]}><JellyIcon kind="share" size={28} /></Pressable></View>
      {preview ? <NoticeBanner message="公开主页预览；不执行收藏、咨询和购买操作。" /> : null}
      {notice || shareError ? <NoticeBanner message={notice || shareError} tone="danger" /> : null}
      <View style={styles.identity}><FileImage fileId={item.seller_avatar_file_id} style={styles.avatar} label={`${item.seller_nickname}头像`} /><View style={styles.identityCopy}><Text style={styles.name}>{item.seller_nickname}</Text><View style={styles.status}><View style={[styles.dot, item.accepting_orders && styles.openDot]} /><Text style={styles.muted}>{item.accepting_orders ? '接待中' : '暂停接待'}</Text></View></View>{!preview ? owner ? <Pressable accessibilityRole="button" onPress={() => router.push('/seller/profile')} style={styles.outline}><Text style={styles.actionText}>编辑主页</Text></Pressable> : favorite : null}</View>
      <View style={styles.metrics}>
        <Metric value={item.review_count ? Number(item.rating_avg).toFixed(1) : '暂无'} label={item.review_count ? '评分' : '评价'} onPress={() => setTab('评价')} />
        <Metric value={String(item.review_count)} label="条评价" onPress={() => setTab('评价')} />
        <Metric value={String(item.completed_order_count)} label="完成订单" />
        <Pressable accessibilityRole="button" onPress={() => router.push('/rules')} style={styles.rule}><Text style={styles.link}>交易保障 <JellyIcon kind="back" right /></Text></Pressable>
      </View>
      <View style={styles.about}><Text style={styles.intro} numberOfLines={expanded ? undefined : 2}>{item.introduction || '卖家还没有填写介绍'}</Text>{(item.introduction?.length ?? 0) > 50 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.linkButton}><Text style={styles.link}>{expanded ? '收起' : '展开介绍'}</Text></Pressable> : null}{tags.length ? <View style={styles.tags}>{tags.map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View> : null}{voice}</View>
      <View accessibilityRole="tablist" style={styles.tabs}>{tabs.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value} accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.activeTab]}><Text style={[styles.tabText, tab === value && styles.activeTabText]}>{value}</Text></Pressable>)}</View>
      {tab === '商品' ? <View style={styles.grid}>{products.map(product => <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`${product.title}，${formatCent(product.min_price_cent)}`} disabled={preview} onPress={() => router.push(`/services/${product.id}`)} style={styles.product}><FileImage fileId={product.cover_file_id} style={styles.productImage} label={product.title} /><Text numberOfLines={2} style={styles.productTitle}>{product.title}</Text><Text numberOfLines={1} style={styles.productNote}>{product.service_time_description || (product.fulfillment_seconds != null ? `付款后 ${product.fulfillment_seconds / 3600} 小时内完成` : '预约服务')}</Text><Text style={styles.price}>{formatCent(product.min_price_cent)}{product.pricing_mode !== 'SINGLE' ? <Text style={styles.priceSuffix}> 起</Text> : null}</Text></Pressable>)}{!products.length ? <Text style={styles.empty}>暂无在售商品</Text> : null}</View> : null}
      {tab === '介绍' ? <View style={styles.details}><Text style={styles.sectionTitle}>店铺介绍</Text><Text style={styles.intro}>{item.introduction || '卖家还没有填写介绍'}</Text><Text style={styles.sectionTitle}>主营游戏</Text><Text style={styles.intro}>{(item.main_games ?? []).map(game => productGameLabels[game]).join(' · ') || '暂未填写'}</Text>{tags.map(tag => <Text key={tag} style={styles.intro}>{tag}</Text>)}</View> : null}
      {tab === '评价' ? <View>{rows.map(review => <View key={review.id} style={styles.review}><View style={styles.reviewHeading}><Text style={styles.reviewer}>{review.display_nickname}</Text><Text style={styles.reviewDate}>{new Date(review.created_at).toLocaleDateString('zh-CN')}</Text></View><Text style={styles.link}>{review.rating} 分</Text><Text style={styles.reviewBody}>{review.content || '买家未填写文字评价'}</Text><Text style={styles.muted}>{review.service_title}</Text></View>)}{reviews.isPending ? <Text style={styles.empty}>正在加载评价…</Text> : reviews.isError ? <View><NoticeBanner message="评价读取失败，请重试。" tone="danger" /><PrimaryButton label="重试评价" onPress={() => void reviews.refetch()} /></View> : !rows.length ? <Text style={styles.empty}>暂无评价，完成交易后会展示买家的真实反馈。</Text> : null}{reviews.hasNextPage ? <PrimaryButton tone="plain" label="加载更多评价" loading={reviews.isFetchingNextPage} disabled={reviews.isFetching} onPress={() => { if (!reviews.isFetching) void reviews.fetchNextPage(); }} /> : null}</View> : null}
    </ScrollView>
    {!owner && !preview ? <SafeAreaView edges={['bottom']} style={styles.footerSafe}><View style={styles.footer}><Text style={styles.footerNote}>了解服务后再下单</Text><View style={styles.contact}><PrimaryButton label={consulting ? '处理中…' : '联系卖家'} disabled={consulting} onPress={onContact} /></View></View></SafeAreaView> : null}
  </SafeAreaView>;
}
function Metric({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const content = <><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress} style={styles.metric}>{content}</Pressable> : <View style={styles.metric}>{content}</View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { paddingHorizontal: 16, paddingBottom: 24 }, header: { flexDirection: 'row', alignItems: 'center', minHeight: 54, marginHorizontal: -8, marginBottom: 8 }, headerButton: { width: 80, minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }, heading: { flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '700', color: '#173D59' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 10 }, avatar: { width: 56, height: 56, borderRadius: 13 }, identityCopy: { flex: 1 }, name: { fontSize: 19, lineHeight: 27, fontWeight: '700', color: '#173D59' }, status: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#8295A4' }, openDot: { backgroundColor: '#17855A' }, muted: { fontSize: 13, lineHeight: 20, color: '#4D687B' },
  outline: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, backgroundColor: 'rgba(161,213,248,.24)', justifyContent: 'center' }, actionText: { fontSize: 14, color: '#173D59' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, paddingVertical: 6 }, metric: { minHeight: 44, paddingVertical: 4, gap: 3, flex: 1 }, metricValue: { fontSize: 18, fontWeight: '700', color: '#173D59' }, metricLabel: { fontSize: 12, color: '#4D687B' }, rule: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 13, lineHeight: 20, color: '#087FF1' },
  about: { paddingTop: 8, paddingBottom: 10 }, intro: { fontSize: 15, lineHeight: 25, color: '#173D59' }, linkButton: { minHeight: 44, justifyContent: 'center' }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(161,213,248,.24)', fontSize: 12, color: '#173D59' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: '#187EE3' }, tabText: { fontSize: 16, color: '#42617D' }, activeTabText: { color: '#187EE3', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18, paddingTop: 14 }, product: { width: '48.2%' }, productImage: { width: '100%', aspectRatio: 1, borderRadius: 10 }, productTitle: { fontSize: 15, lineHeight: 22, minHeight: 44, marginTop: 8, color: '#173D59', fontWeight: '600' }, productNote: { fontSize: 13, lineHeight: 20, marginVertical: 4, color: '#4D687B' }, price: { color: '#087FF1', fontSize: 19, fontWeight: '700' }, priceSuffix: { fontSize: 12, fontWeight: '400' },
  details: { paddingVertical: 16, gap: 10 }, sectionTitle: { fontSize: 18, color: '#173D59', fontWeight: '700' }, empty: { paddingVertical: 35, paddingHorizontal: 10, width: '100%', textAlign: 'center', color: '#4D687B', fontSize: 14, lineHeight: 24 }, review: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, reviewHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, reviewer: { flex: 1, fontSize: 15, color: '#173D59', fontWeight: '600' }, reviewDate: { fontSize: 12, color: '#4D687B' }, reviewBody: { fontSize: 15, lineHeight: 25, marginVertical: 8, color: '#173D59' },
  footerSafe: { backgroundColor: '#C7EAFA' }, footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }, footerNote: { flex: 1, fontSize: 13, color: '#4D687B' }, contact: { minWidth: 140 }
});
