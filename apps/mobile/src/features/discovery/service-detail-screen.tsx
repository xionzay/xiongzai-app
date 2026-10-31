import { ReviewImages } from "../after-sale/review-images";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { createConsultation } from "@/features/chat/chat-api";
import { useAvailability, useProductReviews, useServiceDetail } from "@/features/discovery/discovery-api";
import { purchaseBlock, purchaseBlockCopy } from "@/features/discovery/discovery-domain";
import { FavoriteButton } from "@/features/favorites/favorite-button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import type { ReviewApiView } from "@/types/api";
import { formatCent } from "@/utils/money";
import { productGameLabels } from "@xiongzai/contracts/commerce";
import { ApprovedIllustration } from '@/components/approved-illustration';
import { PurchaseSpecSheet } from './purchase-spec-sheet';


export function ServiceDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consulting, setConsulting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const consultation = useRef(false);
  const navigating = useRef(false);
  useFocusEffect(useCallback(() => { navigating.current = false; }, []));
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const detail = useServiceDetail(id, status !== "booting");
  const newProduct = detail.data?.fulfillment_seconds != null;
  const availability = useAvailability(detail.data?.seller_id, Boolean(detail.data) && !newProduct);
  const reviews = useProductReviews(id, status !== "booting");
  const reviewItems = useMemo(() => reviews.data?.pages.flatMap((page) => page.items) ?? [], [reviews.data]);

  if (status === "booting" || detail.isPending) return <AppScreen><PageHeader title="服务详情" /><StateView kind="loading" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="服务详情" /><StateView kind="offline" onRetry={() => void detail.refetch()} /></AppScreen>;
  if (detail.isError) {
    const code = detail.error instanceof ApiClientError ? detail.error.code : "";
    const stateMessage: Record<string, string> = { PRODUCT_OFF_SALE: "服务已下架", PRODUCT_UNDER_REVIEW: "服务正在准备或审核中", SELLER_UNAVAILABLE: "陪玩当前不可提供服务", PRODUCT_NOT_FOUND: "服务不存在或已删除" };
    return <AppScreen><PageHeader title="服务详情" /><StateView kind="error" title={stateMessage[code] ? "服务当前不可购买" : undefined} message={stateMessage[code]} onRetry={() => void detail.refetch()} /></AppScreen>;
  }

  const service = detail.data;
  const activeSkus = service.skus.filter((sku) => sku.status === "ACTIVE");
  const selected = activeSkus.find((sku) => sku.id === selectedSku) ?? activeSkus[0];
  const block = purchaseBlock(service, availability.data, user?.id);
  const coverFileId = service.images.find((image) => image.is_cover)?.file_id ?? service.cover_file_id;
  const sellerTags = [service.seller.preferred_mode, service.seller.play_style].filter((value): value is string => Boolean(value));

  const consult = async () => {
    if (consultation.current) return;
    if (status !== "authenticated") {
      router.push({ pathname: "/(auth)/required", params: { action: "咨询陪玩", returnTo: `/services/${service.id}` } });
      return;
    }
    consultation.current = true;
    setConsulting(true);
    setNotice(null);
    try {
      const conversation = await createConsultation(service.id);
      if (mounted.current) router.push({ pathname: "/conversations/[id]", params: { id: conversation.id } });
    } catch (error) {
      if (mounted.current) setNotice(userFacingError(error));
    } finally {
      consultation.current = false;
      if (mounted.current) setConsulting(false);
    }
  };

  const purchase = () => {
    if (navigating.current || !selected || block || (!newProduct && (availability.isPending || availability.isError))) return;
    navigating.current = true;
    const target = newProduct ? "/checkout/confirm" : "/checkout/schedule";
    const returnTo = `${target}?productId=${encodeURIComponent(service.id)}&skuId=${encodeURIComponent(selected.id)}${newProduct ? `&flow=fulfillment&quantity=${quantity}` : ""}`;
    setSheetOpen(false);
    if (status !== "authenticated") router.push({ pathname: "/(auth)/required", params: { action: newProduct ? "购买商品" : "预约服务", returnTo } });
    else router.push({ pathname: target, params: { productId: service.id, skuId: selected.id, ...(newProduct ? { flow: "fulfillment", quantity: String(quantity) } : {}) } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ServiceBackdrop />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={detail.isRefetching || availability.isRefetching || reviews.isRefetching} onRefresh={() => { void detail.refetch(); void availability.refetch(); void reviews.refetch(); }} tintColor={colors.accent} />}>
        {notice ? <NoticeBanner tone="danger" message={notice} /> : null}
        <View style={detailStyles.heroWrap}>
          <FileImage fileId={coverFileId} style={detailStyles.hero} resizeMode="contain" label={`${service.title}封面`} />
          <Pressable accessibilityRole="button" accessibilityLabel="返回上一页" onPress={() => router.back()} style={detailStyles.back}><ChevronLeftIcon size={24} /></Pressable>
        </View>

        <View style={detailStyles.section}>
          <Text style={detailStyles.price} accessibilityLabel={`价格${formatCent(service.min_price_cent)}起`}>{formatCent(service.min_price_cent)}<Text style={styles.priceSuffix}> 起</Text></Text>
              <View style={styles.badges}><Text style={styles.badge}>平台保障</Text>{service.seller.accepting_orders ? <Text style={styles.badgeBlue}>在线接单</Text> : null}</View>
              <Text style={styles.title}>{service.title}</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{service.service_time_description ?? service.description}</Text>
          <Text style={detailStyles.metrics}>已售 {service.sold_count} · {service.review_count ? `${service.rating_avg} 分 · ${service.review_count} 条评价` : '暂无评价'}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={`进入${service.seller.seller_nickname}的陪玩主页`} onPress={() => router.push(`/companions/${service.seller.id}`)} style={detailStyles.seller}>
          <FileImage fileId={service.seller.seller_avatar_file_id} style={detailStyles.avatar} label={`${service.seller.seller_nickname}头像`} />
          <View style={styles.sellerCopy}><Text style={styles.sellerTitle}>{service.seller.seller_nickname} 的店铺主页</Text><Text style={styles.sellerMeta}>{service.seller.game_rank ?? '游戏资料未填写'} · {service.seller.review_count ? `${service.seller.rating_avg} 分` : '暂无评价'} · {service.seller.accepting_orders ? '接待中' : '暂停接待'}</Text>{sellerTags.length ? <Text style={styles.sellerTags} numberOfLines={1}>{sellerTags.join(" · ")}</Text> : null}</View>
          <Text style={styles.sellerArrow}>进主页 <JellyIcon kind="back" right /></Text>
        </Pressable>

        <View style={detailStyles.section}>
          <SectionTitle title="服务说明" />
          <Fact label="简介" value={service.description} /><Fact label="游戏类目" value={service.game ? productGameLabels[service.game] : '游戏资料未填写'} />
        </View>
        {service.images.filter(image => image.image_kind === 'DETAIL').map(image => <FileImage key={image.id} fileId={image.file_id} style={detailStyles.hero} resizeMode="contain" label="商品详情图" />)}
        <Text style={detailStyles.fulfillment}>{newProduct ? `付款后 ${service.fulfillment_seconds! / 3600} 小时内完成` : '旧预约服务'}</Text>

        {block ? <NoticeBanner tone="danger" message={purchaseBlockCopy[block]} /> : null}

        <View style={detailStyles.section}>
          <SectionTitle title="商品评价" action="查看全部 ›" onAction={() => router.push({ pathname: '/services/[id]/reviews', params: { id: service.id } })} />
          <ReviewContent items={reviewItems} pending={reviews.isPending} error={reviews.isError} onRetry={() => void reviews.refetch()} />
          {reviews.hasNextPage ? <Pressable accessibilityRole="button" disabled={reviews.isFetchingNextPage} onPress={() => void reviews.fetchNextPage()} style={styles.reviewRetry}><Text style={styles.reviewRetryText}>{reviews.isFetchingNextPage ? '加载中…' : '加载更多商品评价'}</Text></Pressable> : null}
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
        <BrandBackdrop dock />
        <View style={detailStyles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="店铺" onPress={() => router.push(`/companions/${service.seller.id}`)} style={detailStyles.iconAction}><ApprovedIllustration kind="home" size={25} /><Text style={detailStyles.actionLabel}>店铺</Text></Pressable>
          <FavoriteButton type="PRODUCT" id={service.id} returnTo={`/services/${service.id}`} onError={setNotice} appearance="service-action" />
          <Pressable accessibilityRole="button" accessibilityLabel="咨询店铺客服" accessibilityState={{ busy: consulting, disabled: consulting }} disabled={consulting} onPress={() => void consult()} style={detailStyles.iconAction}><ApprovedIllustration kind="message" size={25} /><Text style={detailStyles.actionLabel}>{consulting ? "连接中" : "客服"}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={block ? "暂不可购买" : '立即购买'} disabled={Boolean(block) || !selected || (!newProduct && (availability.isPending || availability.isError))} onPress={() => setSheetOpen(true)} style={[detailStyles.buy, (block || !selected || (!newProduct && (availability.isPending || availability.isError))) && styles.buyDisabled]}><Text style={detailStyles.buyLabel}>{block ? "暂不可购买" : "立即购买"}</Text></Pressable>
        </View>
      </SafeAreaView>
      {sheetOpen ? <PurchaseSpecSheet title={service.title} seller={service.seller.seller_nickname} coverFileId={coverFileId} skus={activeSkus} selectedId={selected?.id} quantity={newProduct ? quantity : 1} onQuantity={newProduct ? setQuantity : undefined} onSelect={setSelectedSku} onClose={() => setSheetOpen(false)} onConfirm={purchase} blocked={block ? purchaseBlockCopy[block] : (!newProduct && (availability.isPending || availability.isError)) ? '请重新读取可约时段后再继续' : undefined} /> : null}
    </SafeAreaView>
  );
}

function ServiceBackdrop() { return <BrandBackdrop />; }

function SectionTitle({ title, note, action, onAction }: { title: string; note?: string; action?: string; onAction?: () => void }) { return <View style={styles.sectionHead}><View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text>{note ? <Text style={styles.sectionNote}>{note}</Text> : null}</View>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text></Pressable> : null}</View>; }

function Fact({ label, value }: { label: string; value: string }) { return <View style={detailStyles.fact}><Text style={detailStyles.factLabel}>{label}</Text><Text style={detailStyles.factValue}>{value}</Text></View>; }

function ReviewContent({ items, pending, error, onRetry }: { items: ReviewApiView[]; pending: boolean; error: boolean; onRetry: () => void }) {
  if (pending) return <Text style={styles.reviewState}>正在加载真实订单评价…</Text>;
  if (error) return <Pressable accessibilityRole="button" onPress={onRetry} style={styles.reviewRetry}><Text style={styles.reviewRetryText}>评价加载失败，点击重试</Text></Pressable>;
  if (!items.length) return <Text style={styles.reviewState}>暂无评价，完成订单后可以评价服务。</Text>;
  return <View>{items.map((review) => <View key={review.id} style={styles.review}><View style={styles.reviewHead}><Text style={styles.reviewer}>{review.display_nickname}</Text><Text style={styles.stars}>{Array.from({ length: review.rating }, (_, index) => <JellyIcon key={index} kind="star" />)}</Text></View><Text style={styles.reviewBody}>{review.content ?? "用户未填写文字评价"}</Text><ReviewImages review={review} /><Text style={styles.reviewMeta}>{review.sku_name} · {new Date(review.created_at).toLocaleDateString("zh-CN")}</Text></View>)}</View>;
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  bottomSafe: { backgroundColor: colors.dock, shadowOpacity: 0, elevation: 0, borderTopColor: colors.divider },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  backButton: { shadowColor: "#4C3D28", shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  share: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: "700" },
  headerTitle: { flex: 1, color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  hero: { width: "auto", aspectRatio: 1, marginHorizontal: 12, marginBottom: 9, borderRadius: 20, backgroundColor: "#C9E2F6", ...softShadow },
  titleCard: { marginHorizontal: 12, marginBottom: 10, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  titleCopy: { flex: 1 },
  badges: { flexDirection: "row", gap: 5 },
  badge: { overflow: "hidden", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: "#E6F3FF", color: "#23639D", fontSize: 10, lineHeight: 14 },
  badgeBlue: { overflow: "hidden", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: "#E6F3FF", color: "#23639D", fontSize: 10, lineHeight: 14 },
  title: { marginTop: 6, marginBottom: 6, color: '#20242A', fontSize: 19, lineHeight: 28, fontWeight: "600" },
  subtitle: { marginBottom: 10, color: "#6B7078", fontSize: 13, lineHeight: 20 },
  price: { flexShrink: 0, color: colors.accent, fontSize: 23, fontWeight: "900" },
  priceSuffix: { fontSize: 12, fontWeight: "700" },
  metrics: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.11)", color: "#777A80", fontSize: 12 },
  panel: { marginHorizontal: 12, marginBottom: 10, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  sectionHead: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionCopy: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8 },
  sectionTitle: { color: '#20242A', fontSize: 16, fontWeight: "600" },
  sectionNote: { flexShrink: 1, color: "#7B7D83", fontSize: 12 },
  sectionAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  sectionActionText: { color: "#767A82", fontSize: 12, fontWeight: "800" },
  skuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 11 },
  skuCard: { position: "relative", width: "48.4%", overflow: "hidden", paddingBottom: 10, borderWidth: 2, borderColor: "transparent", borderRadius: 15, backgroundColor: "#FFFFFF", ...softShadow },
  skuActive: { borderColor: colors.accent, transform: [{ translateY: -2 }] },
  skuImage: { width: "100%", aspectRatio: 1, backgroundColor: "#C9E2F6" },
  skuCheck: { position: "absolute", right: 7, top: 7, width: 25, height: 25, overflow: "hidden", borderWidth: 2, borderColor: colors.white, borderRadius: 13, backgroundColor: colors.accent, color: colors.white, fontSize: 12, lineHeight: 21, fontWeight: "900", textAlign: "center" },
  skuName: { marginHorizontal: 9, marginTop: 9, color: colors.text, fontSize: 13, lineHeight: 20, fontWeight: "800" },
  skuMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5, marginHorizontal: 9, marginTop: 6 },
  skuPrice: { color: colors.accent, fontSize: 18, fontWeight: "900" },
  skuDuration: { flexShrink: 1, color: "#6D6D6D", fontSize: 12, textAlign: "right" },
  empty: { paddingVertical: 24, color: "#7B7D83", fontSize: 12, textAlign: "center" },
  sellerCard: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 12, marginBottom: 10, padding: 11, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  avatar: { width: 58, height: 58, borderWidth: 3, borderColor: colors.white, borderRadius: 29, backgroundColor: "#CBE4FA" },
  sellerCopy: { flex: 1 },
  sellerTitle: { color: '#20242A', fontSize: 14, fontWeight: "700" },
  sellerMeta: { marginTop: 5, color: "#74767B", fontSize: 12, lineHeight: 16 },
  sellerTags: { marginTop: 5, color: "#604CB5", fontSize: 12 },
  sellerArrow: { color: colors.text, fontSize: 12, fontWeight: "800" },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: 15, rowGap: 9, marginVertical: 11 },
  fact: { width: "47.7%", flexDirection: "row", justifyContent: "space-between", gap: 8 },
  factLabel: { color: "#7B7D83", fontSize: 12 },
  factValue: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800", textAlign: "right" },
  description: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.11)", color: "#62656A", fontSize: 13, lineHeight: 22 },
  reviewState: { marginTop: 10, paddingVertical: 13, color: "#777A80", fontSize: 12 },
  reviewRetry: { minHeight: 44, justifyContent: "center", marginTop: 8 },
  reviewRetryText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  review: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  reviewer: { color: colors.text, fontSize: 12, fontWeight: "800" },
  stars: { color: "#E59A00", fontSize: 12, fontWeight: "900" },
  reviewBody: { marginTop: 7, color: colors.text, fontSize: 13, lineHeight: 21 },
  reviewMeta: { marginTop: 5, color: "#7B7D83", fontSize: 12 },
  actions: { minHeight: 77, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 9, borderTopWidth: 1, borderTopColor: "rgba(62,57,47,0.11)", backgroundColor: "rgba(255,252,245,0.97)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 6 },
  iconAction: { width: 70, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 1 },
  consultLabel: { color: "#2F8FE5", fontSize: 11, fontWeight: "900" },
  buy: { flex: 1, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 4 },
  buyDisabled: { backgroundColor: "#C8C3BB", shadowOpacity: 0 },
  buyTitle: { color: colors.white, fontSize: 13, fontWeight: "900" },
  buyPrice: { marginTop: 2, color: colors.white, fontSize: 12, fontWeight: "800" }
});

// Values transcribed from commerce-layout.css product-page, not the old card-grid layout.
const detailStyles = StyleSheet.create({
  heroWrap: { position: 'relative' }, hero: { width: '100%', aspectRatio: 1 },
  back: { position: 'absolute', top: 14, left: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF80', borderRadius: 22, backgroundColor: '#17345188' },
  section: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  price: { marginBottom: 8, color: colors.brand, fontSize: 32, lineHeight: 37, fontWeight: '700', letterSpacing: -.6 },
  metrics: { color: colors.textSecondary, fontSize: 12, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 80, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  avatar: { width: 44, height: 44, borderRadius: 4 },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  factLabel: { width: 64, fontSize: 14, lineHeight: 23, color: colors.textSecondary }, factValue: { flex: 1, fontSize: 14, lineHeight: 23, color: colors.text },
  fulfillment: { padding: 16, fontSize: 13, lineHeight: 22, color: colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  iconAction: { width: 44, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 }, actionLabel: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  buy: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.brand }, buyLabel: { color: colors.white, fontSize: 17, fontWeight: '600', textAlign: 'center' }
});
