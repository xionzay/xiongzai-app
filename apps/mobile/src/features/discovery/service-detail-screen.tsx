import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useMemo, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
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
import { MessageActionIcon } from "@/components/tab-icons";
import { productGameLabels } from "@xiongzai/contracts/commerce";


export function ServiceDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consulting, setConsulting] = useState(false);
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
    if (status !== "authenticated") {
      router.push({ pathname: "/(auth)/required", params: { action: "咨询陪玩", returnTo: `/services/${service.id}` } });
      return;
    }
    setConsulting(true);
    setNotice(null);
    try {
      const conversation = await createConsultation(service.id);
      router.push({ pathname: "/conversations/[id]", params: { id: conversation.id } });
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message : "暂时无法创建咨询会话");
    } finally {
      setConsulting(false);
    }
  };

  const purchase = () => {
    if (!selected || block || (!newProduct && (availability.isPending || availability.isError))) return;
    const target = newProduct ? "/checkout/confirm" : "/checkout/schedule";
    const returnTo = `${target}?productId=${encodeURIComponent(service.id)}&skuId=${encodeURIComponent(selected.id)}${newProduct ? "&flow=fulfillment" : ""}`;
    if (status !== "authenticated") router.push({ pathname: "/(auth)/required", params: { action: newProduct ? "购买商品" : "预约服务", returnTo } });
    else router.push({ pathname: target, params: { productId: service.id, skuId: selected.id, ...(newProduct ? { flow: "fulfillment" } : {}) } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ServiceBackdrop />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={detail.isRefetching || availability.isRefetching || reviews.isRefetching} onRefresh={() => { void detail.refetch(); void availability.refetch(); void reviews.refetch(); }} tintColor={colors.accent} />}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={[styles.headerButton, styles.backButton]}><ChevronLeftIcon size={28} /></Pressable>
          <Text style={styles.headerTitle}>商品详情</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="分享服务" onPress={() => void Share.share({ message: `熊崽电竞服务：${service.title}` })} style={styles.headerButton}><JellyIcon kind="share" size={26} /></Pressable>
        </View>
        {notice ? <NoticeBanner tone="danger" message={notice} /> : null}

        <FileImage fileId={coverFileId} style={styles.hero} label={`${service.title}封面`} />

        <View style={styles.titleCard}>
          {service.game ? <Text style={styles.metrics}>{productGameLabels[service.game]} · {newProduct ? `付款后 ${service.fulfillment_seconds! / 3600} 小时内完成` : "预约服务"}</Text> : null}
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <View style={styles.badges}><Text style={styles.badge}>平台保障</Text>{service.seller.accepting_orders ? <Text style={styles.badgeBlue}>在线接单</Text> : null}</View>
              <Text style={styles.title}>{service.title}</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{service.service_time_description ?? service.description}</Text>
            </View>
            <Text style={styles.price} accessibilityLabel={`价格${formatCent(service.min_price_cent)}起`}>{formatCent(service.min_price_cent)}<Text style={styles.priceSuffix}> 起</Text></Text>
          </View>
          <Text style={styles.metrics}>已售 {service.sold_count} · <JellyIcon kind="star" /> {service.rating_avg} · {service.review_count} 条评价</Text>
        </View>

        <View style={styles.panel}>
          <SectionTitle title="选择商品规格" note="价格由卖家自主设置" />
          {activeSkus.length ? <View style={styles.skuGrid}>{activeSkus.map((sku) => {
            const active = selected?.id === sku.id;
            return <Pressable key={sku.id} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setSelectedSku(sku.id)} style={[styles.skuCard, active && styles.skuActive]}><FileImage fileId={coverFileId} style={styles.skuImage} label={`${sku.sku_name}规格图片`} />{active ? <Text style={styles.skuCheck}><JellyIcon kind="check" label="已选" /></Text> : null}<Text style={styles.skuName} numberOfLines={1}>{sku.sku_name}</Text><View style={styles.skuMeta}><Text style={styles.skuPrice}>{formatCent(sku.price_cent)}</Text><Text style={styles.skuDuration}>{sku.duration_minutes == null ? "按完成时限交付" : `约 ${sku.duration_minutes} 分钟`}</Text></View></Pressable>;
          })}</View> : <Text style={styles.empty}>暂无可选规格</Text>}
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={`进入${service.seller.seller_nickname}的陪玩主页`} onPress={() => router.push(`/companions/${service.seller.id}`)} style={styles.sellerCard}>
          <FileImage fileId={service.seller.seller_avatar_file_id} style={styles.avatar} label={`${service.seller.seller_nickname}头像`} />
          <View style={styles.sellerCopy}><Text style={styles.sellerTitle}>{service.seller.seller_nickname} 的陪玩主页</Text><Text style={styles.sellerMeta}>{service.seller.game_rank ?? "和平精英陪玩"} · <JellyIcon kind="star" /> {service.seller.rating_avg} · {service.seller.completed_order_count} 单</Text>{sellerTags.length ? <Text style={styles.sellerTags} numberOfLines={1}>{sellerTags.join(" · ")}</Text> : null}</View>
          <Text style={styles.sellerArrow}>进主页 <JellyIcon kind="back" right /></Text>
        </Pressable>

        <View style={styles.panel}>
          <SectionTitle title="商品说明" />
          <View style={styles.facts}><Fact label="沟通方式" value="平台文字聊天" /><Fact label="平台保障" value="退款与平台介入" /></View>
          <Text style={styles.description}>{service.description}</Text>
          {service.images.filter(image => !image.is_cover).map(image => <FileImage key={image.id} fileId={image.file_id} style={styles.hero} label={image.image_kind === "DETAIL" ? "商品详情图" : "商品图"} />)}
        </View>

        {block ? <NoticeBanner tone="danger" message={purchaseBlockCopy[block]} /> : null}

        <View style={styles.panel}>
          <SectionTitle title="服务评价" note={`${service.review_count} 条`} action={reviews.hasNextPage ? "加载更多 ›" : undefined} onAction={reviews.hasNextPage ? () => void reviews.fetchNextPage() : undefined} />
          <ReviewContent items={reviewItems} pending={reviews.isPending} error={reviews.isError} onRetry={() => void reviews.refetch()} />
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={consulting} onPress={() => void consult()} style={styles.iconAction}><MessageActionIcon size={32} /><Text style={styles.consultLabel}>{consulting ? "连接中" : "咨询"}</Text></Pressable>
          <FavoriteButton type="PRODUCT" id={service.id} returnTo={`/services/${service.id}`} onError={setNotice} appearance="service-action" />
          <Pressable accessibilityRole="button" accessibilityLabel={block ? "当前不可购买" : selected ? `选择规格，${formatCent(selected.price_cent)}起` : "请选择规格"} disabled={Boolean(block) || !selected || (!newProduct && (availability.isPending || availability.isError))} onPress={purchase} style={[styles.buy, (block || !selected || (!newProduct && (availability.isPending || availability.isError))) && styles.buyDisabled]}><Text style={styles.buyTitle}>{block ? "当前不可购买" : "选择规格"}</Text><Text style={styles.buyPrice}>{selected ? `${formatCent(selected.price_cent)}起` : "暂不可买"}</Text></Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

function ServiceBackdrop() { return <BrandBackdrop />; }

function SectionTitle({ title, note, action, onAction }: { title: string; note?: string; action?: string; onAction?: () => void }) { return <View style={styles.sectionHead}><View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text>{note ? <Text style={styles.sectionNote}>{note}</Text> : null}</View>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text></Pressable> : null}</View>; }

function Fact({ label, value }: { label: string; value: string }) { return <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue} numberOfLines={2}>{value}</Text></View>; }

function ReviewContent({ items, pending, error, onRetry }: { items: ReviewApiView[]; pending: boolean; error: boolean; onRetry: () => void }) {
  if (pending) return <Text style={styles.reviewState}>正在加载真实订单评价…</Text>;
  if (error) return <Pressable accessibilityRole="button" onPress={onRetry} style={styles.reviewRetry}><Text style={styles.reviewRetryText}>评价加载失败，点击重试</Text></Pressable>;
  if (!items.length) return <Text style={styles.reviewState}>暂无评价，完成订单后可以评价服务。</Text>;
  return <View>{items.map((review) => <View key={review.id} style={styles.review}><View style={styles.reviewHead}><Text style={styles.reviewer}>{review.display_nickname}</Text><Text style={styles.stars}>{Array.from({ length: review.rating }, (_, index) => <JellyIcon key={index} kind="star" />)}</Text></View><Text style={styles.reviewBody}>{review.content ?? "用户未填写文字评价"}</Text><Text style={styles.reviewMeta}>{review.sku_name} · {new Date(review.created_at).toLocaleDateString("zh-CN")}</Text></View>)}</View>;
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
  badge: { overflow: "hidden", paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: "#EEE9FF", color: "#6648BD", fontSize: 12, fontWeight: "800" },
  badgeBlue: { overflow: "hidden", paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: "#E5F1FF", color: "#3475C4", fontSize: 12, fontWeight: "800" },
  title: { marginTop: 8, color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "900" },
  subtitle: { marginTop: 4, color: "#74767B", fontSize: 13, lineHeight: 19 },
  price: { flexShrink: 0, color: colors.accent, fontSize: 23, fontWeight: "900" },
  priceSuffix: { fontSize: 12, fontWeight: "700" },
  metrics: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.11)", color: "#777A80", fontSize: 12 },
  panel: { marginHorizontal: 12, marginBottom: 10, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  sectionHead: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionCopy: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
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
  sellerTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
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
