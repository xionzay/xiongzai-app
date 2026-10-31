import { ReviewImages } from "./review-images";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useState } from "react";
import { ChevronLeftIcon, RefreshIcon } from "@/components/ui-icons";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { useMyReview } from "@/features/after-sale/after-sale-api";
import { reviewStatusCopy } from "@/features/after-sale/after-sale-domain";
import { useOrderDetail } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";



export function ReviewDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const online = useOnlineStatus();
  const query = useMyReview(id);
  const order = useOrderDetail(query.data?.order_id ?? "", Boolean(query.data?.order_id));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!online) return <AppScreen><PageHeader title="我的评价" /><StateView kind="offline" message="恢复网络后重新读取评价状态" onRetry={() => void query.refetch()} /></AppScreen>;
  if (query.isPending) return <AppScreen><PageHeader title="我的评价" /><StateView kind="loading" /></AppScreen>;
  if (!query.data || query.isError) return <AppScreen><PageHeader title="我的评价" /><StateView kind="error" onRetry={() => void query.refetch()} /></AppScreen>;

  const item = query.data;
  const statusNote = item.status === "PENDING" ? "已提交 · 等待审核" : item.status === "HIDDEN" ? "已隐藏 · 不能重新评价" : "已发布 · 公开展示";

  const refresh = async () => {
    setNotice(null);
    const result = await query.refetch();
    if (result.isError) setNotice("评价状态刷新失败，请稍后重试");
  };

  const returnOrder = () => router.replace({ pathname: "/orders/[id]", params: { id: item.order_id } });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ReviewBackdrop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void refresh()} tintColor={colors.brand} />}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回订单" onPress={returnOrder} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>我的评价</Text><Text style={styles.headerSubtitle}>{statusNote}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="刷新评价状态" disabled={query.isFetching} onPress={() => void refresh()} style={styles.headerButton}>{query.isFetching ? <JellyIcon kind="more" size={24} /> : <RefreshIcon size={24} />}</Pressable>
        </View>

        {notice ? <View style={styles.notice}><NoticeBanner tone="danger" message={notice} /></View> : null}
        {item.status === "PENDING" ? <View style={styles.notice}><NoticeBanner message="评价正在审核，审核完成后以服务端状态为准。" /></View> : null}
        {item.status === "HIDDEN" ? <View style={styles.notice}><NoticeBanner tone="danger" message={item.hidden_reason ? `评价当前未展示：${item.hidden_reason}` : "评价当前未展示，如需了解原因请联系平台客服。"} /></View> : null}

        <View style={styles.serviceCard}>
          <FileImage fileId={order.data?.product_image || null} style={styles.serviceImage} label={`${item.service_title}图片`} />
          <View style={styles.serviceCopy}><Text style={styles.serviceTitle} numberOfLines={2}>{item.service_title}</Text><Text style={styles.serviceMeta}>{item.sku_name}</Text>{order.data ? <Text style={styles.serviceMeta}>陪玩：{order.data.seller_name}</Text> : null}</View>
          <Pressable accessibilityRole="button" accessibilityLabel="查看关联订单" onPress={returnOrder} style={styles.orderLink}><Text style={styles.orderLinkText}>订单 <JellyIcon kind="back" right /></Text></Pressable>
        </View>

        <View style={styles.reviewCard}>
          <View accessibilityLabel={`${item.rating}星评价`} style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <Text key={star} style={[styles.star, star > item.rating && styles.starEmpty]}>{star <= item.rating ? <JellyIcon kind="star" label="星级" /> : <JellyIcon kind="outline" label="未选星级" />}</Text>)}</View>
          <Text style={styles.rating}>{item.rating} 星评价</Text>
          <View style={styles.statusPill}><Text style={styles.statusPillText}>{reviewStatusCopy[item.status]}</Text></View>
          <Text style={styles.reviewBody}>{item.content || "未填写文字评价"}</Text><ReviewImages review={item} />
          <View style={styles.metaRow}><Text style={styles.reviewMeta}>{item.anonymous ? "匿名评价" : item.display_nickname}</Text><Text style={styles.reviewMeta}>发布于 {new Date(item.created_at).toLocaleString("zh-CN")}</Text></View>
          {item.status === "HIDDEN" && item.hidden_at ? <Text style={styles.hiddenAt}>隐藏于 {new Date(item.hidden_at).toLocaleString("zh-CN")}</Text> : null}
        </View>

        {rulesOpen ? <View style={styles.rulesCard}><Text style={styles.rulesTitle}>评价规则</Text><Text style={styles.rulesText}>每个订单只能提交一次评价，发布后不能编辑或重新评价。评价会经过平台审核；违反平台规则的内容可能被隐藏，但原始记录仍安全保留。</Text></View> : null}

        <Pressable accessibilityRole="button" accessibilityLabel="评价规则" onPress={() => setRulesOpen((value) => !value)} style={styles.rulesButton}><Text style={styles.rulesButtonText}>{rulesOpen ? "收起评价规则" : "评价规则"}</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReviewBackdrop() { return <BrandBackdrop />; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;
const card = { ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center", marginLeft: 0, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  headerSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  notice: { marginHorizontal: 12, marginBottom: 10 },
  serviceCard: { minHeight: 122, flexDirection: "row", alignItems: "center", gap: 13, marginHorizontal: 12, marginBottom: 10, padding: 11, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  serviceImage: { width: 100, height: 100, borderRadius: 14 },
  serviceCopy: { minWidth: 0, flex: 1 },
  serviceTitle: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "900" },
  serviceMeta: { marginTop: 7, color: "#74767B", fontSize: 12, lineHeight: 16 },
  orderLink: { minHeight: 44, justifyContent: "center", borderRadius: 11, paddingHorizontal: 9, backgroundColor: "#EAF6FF" },
  orderLinkText: { color: "#2F75AE", fontSize: 12, fontWeight: "900" },
  reviewCard: { alignItems: "center", marginHorizontal: 12, marginBottom: 10, padding: 20, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 5 },
  star: { color: "#FFB319", fontSize: 35, lineHeight: 40, fontWeight: "500" },
  starEmpty: { color: "#FFB319" },
  rating: { marginTop: 8, color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "900" },
  statusPill: { minHeight: 27, justifyContent: "center", marginTop: 8, borderRadius: 9, paddingHorizontal: 10, backgroundColor: "#ECFFD0" },
  statusPillText: { color: "#607D1B", fontSize: 12, fontWeight: "900" },
  reviewBody: { width: "100%", marginTop: 14, color: "#4F555B", fontSize: 13, lineHeight: 22, textAlign: "center" },
  metaRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.11)", paddingTop: 13 },
  reviewMeta: { flexShrink: 1, color: "#74767B", fontSize: 12, lineHeight: 16 },
  hiddenAt: { marginTop: 8, color: "#9B5A50", fontSize: 12, lineHeight: 16 },
  rulesCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  rulesTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  rulesText: { marginTop: 8, color: "#74767B", fontSize: 12, lineHeight: 17 },
  rulesButton: { minHeight: 50, alignItems: "center", justifyContent: "center", marginHorizontal: 12, marginTop: 5, marginBottom: 18, borderRadius: 16, backgroundColor: colors.accent, shadowColor: "#FF4F15", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 4 },
  rulesButtonText: { color: colors.white, fontSize: 14, fontWeight: "900" }
});
