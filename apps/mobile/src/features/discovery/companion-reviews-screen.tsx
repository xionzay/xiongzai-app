import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { useCompanionDetail, useCompanionReviews } from "@/features/discovery/discovery-api";
import { flattenUniqueById } from "@/features/discovery/discovery-domain";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import type { ReviewApiView } from "@/types/api";

const filters = ["全部", "最新", "好评"] as const;



export function CompanionReviewsScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { status } = useAuth();
  const online = useOnlineStatus();
  const enabled = status !== "booting";
  const query = useCompanionReviews(id, enabled);
  const companion = useCompanionDetail(id, enabled);
  const [filter, setFilter] = useState<(typeof filters)[number]>("全部");
  const items = useMemo(() => flattenUniqueById(query.data?.pages ?? []), [query.data]);
  const visible = useMemo(() => {
    const rows = filter === "好评" ? items.filter((item) => item.rating >= 4) : [...items];
    return filter === "最新" ? rows.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()) : rows;
  }, [filter, items]);

  if (status === "booting" || query.isPending) return <AppScreen><PageHeader title="全部评价" /><StateView kind="loading" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="全部评价" /><StateView kind="offline" message="恢复网络后重新读取真实订单评价" onRetry={() => void query.refetch()} /></AppScreen>;
  if (!query.data || query.isError) return <AppScreen><PageHeader title="全部评价" /><StateView kind="error" onRetry={() => void query.refetch()} /></AppScreen>;

  const loadedAverage = items.length ? (items.reduce((sum, item) => sum + item.rating, 0) / items.length).toFixed(1) : "0.0";
  const average = companion.data?.rating_avg ?? loadedAverage;
  const total = companion.data?.review_count ?? items.length;
  const breakdown = ratingBreakdown(items);

  const refresh = async () => { await Promise.all([query.refetch(), companion.refetch()]); };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ReviewBackdrop />
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
          <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回陪玩主页" onPress={() => router.back()} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable><View style={styles.headerCopy}><Text style={styles.headerTitle}>全部评价</Text><Text style={styles.headerSubtitle}>来自真实完成订单</Text></View><View style={styles.headerButton} /></View>
          <View style={styles.overview}>
            <View style={styles.scoreBox}><Text style={styles.score}>{average}</Text><Text style={styles.overviewStars}><JellyIcon kind="star" /><JellyIcon kind="star" /><JellyIcon kind="star" /><JellyIcon kind="star" /><JellyIcon kind="star" /></Text><Text style={styles.total}>{total} 条评价</Text></View>
            <View style={styles.breakdown}><RatingBar label="5 星" value={breakdown.five} /><RatingBar label="4 星" value={breakdown.four} /><RatingBar label="3 星及以下" value={breakdown.other} /></View>
          </View>
          <Text style={styles.breakdownNote}>星级分布根据当前已加载的 {items.length} 条评价计算</Text>
          <View style={styles.filterTabs}>{filters.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filterButton, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View>
        </>}
        renderItem={({ item }) => <ReviewCard item={item} />}
        ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>{items.length ? "当前筛选暂无评价" : "暂无评价"}</Text><Text style={styles.emptyNote}>{items.length ? "可以切换到“全部”继续查看" : "真实完成订单提交评价后会显示在这里"}</Text></View>}
        ListFooterComponent={query.isFetchingNextPage ? <Text style={styles.loadingMore}>正在加载更多评价…</Text> : query.hasNextPage ? <Text style={styles.loadingMore}>继续上滑加载更多</Text> : items.length ? <Text style={styles.loadingMore}>已经看到全部已加载评价</Text> : null}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        onEndReachedThreshold={0.35}
        refreshControl={<RefreshControl refreshing={(query.isRefetching && !query.isFetchingNextPage) || companion.isRefetching} onRefresh={() => void refresh()} tintColor={colors.brand} />}
      />
    </SafeAreaView>
  );
}

function ratingBreakdown(items: ReviewApiView[]) {
  if (!items.length) return { five: 0, four: 0, other: 0 };
  const percent = (count: number) => Math.round(count / items.length * 100);
  return {
    five: percent(items.filter((item) => item.rating === 5).length),
    four: percent(items.filter((item) => item.rating === 4).length),
    other: percent(items.filter((item) => item.rating <= 3).length)
  };
}

function RatingBar({ label, value }: { label: string; value: number }) { return <View style={styles.ratingRow}><Text style={styles.ratingLabel}>{label}</Text><View style={styles.bar}><View style={[styles.barFill, { width: `${value}%` }]} /></View><Text style={styles.ratingValue}>{value}%</Text></View>; }

function ReviewCard({ item }: { item: ReviewApiView }) {
  return <View style={styles.card}>
    <View style={styles.cardHeader}><View style={styles.avatar}><Text style={styles.avatarText}>{item.display_nickname.slice(0, 1) || "匿"}</Text></View><View style={styles.reviewerCopy}><Text style={styles.name}>{item.display_nickname}</Text><Text style={styles.purchasedStars}>{Array.from({ length: item.rating }, (_, index) => <JellyIcon key={`star-${index}`} kind="star" />)}{Array.from({ length: 5 - item.rating }, (_, index) => <JellyIcon key={`outline-${index}`} kind="outline" />)} · 已购买服务</Text></View><Text style={styles.date}>{new Date(item.created_at).toLocaleDateString("zh-CN")}</Text></View>
    <Text style={styles.body}>{item.content ?? "用户未填写文字评价"}</Text>
    <View style={styles.verified}><Text style={styles.verifiedText}>真实订单评价</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看服务${item.service_title}`} onPress={() => router.push({ pathname: "/services/[id]", params: { id: item.product_id } })} style={styles.serviceLink}><Text style={styles.serviceLinkText}>{item.service_title} · {item.sku_name}</Text><ChevronRightIcon size={20} /></Pressable>
  </View>;
}

function ReviewBackdrop() { return <BrandBackdrop />; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  list: { paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center", marginLeft: 0, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  headerSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  overview: { minHeight: 142, flexDirection: "row", alignItems: "center", gap: 16, marginHorizontal: 12, marginBottom: 7, borderRadius: 20, padding: 18, backgroundColor: "#FFF8E6", ...softShadow },
  scoreBox: { width: 112, alignItems: "center" },
  score: { color: colors.text, fontSize: 36, lineHeight: 42, fontWeight: "900" },
  overviewStars: { marginTop: 2, color: "#FFB319", fontSize: 14, letterSpacing: 1 },
  total: { marginTop: 5, color: "#74767B", fontSize: 12 },
  breakdown: { flex: 1 },
  ratingRow: { minHeight: 26, flexDirection: "row", alignItems: "center", gap: 6 },
  ratingLabel: { width: 55, color: "#5E5B56", fontSize: 12 },
  bar: { height: 7, flex: 1, overflow: "hidden", borderRadius: 4, backgroundColor: "#E8DFD2" },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: "#FFB319" },
  ratingValue: { width: 31, color: "#74767B", fontSize: 12, textAlign: "right" },
  breakdownNote: { marginHorizontal: 14, marginBottom: 10, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  filterTabs: { flexDirection: "row", gap: 5, marginHorizontal: 12, marginBottom: 12, padding: 4, backgroundColor: "transparent", borderRadius: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, height: undefined, minHeight: 48 },
  filterButton: { minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  filterActive: { backgroundColor: "#FFFDF8", ...softShadow },
  filterText: { color: "#6F6B65", fontSize: 12, fontWeight: "900" },
  filterTextActive: { color: colors.accent },
  card: { marginHorizontal: 12, marginBottom: 10, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#DFF0FF" },
  avatarText: { color: "#2E73AA", fontSize: 15, fontWeight: "900" },
  reviewerCopy: { minWidth: 0, flex: 1 },
  name: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  purchasedStars: { marginTop: 3, color: "#D99100", fontSize: 12, lineHeight: 16 },
  date: { color: "#74767B", fontSize: 12 },
  body: { marginTop: 12, color: "#444A50", fontSize: 12, lineHeight: 19 },
  verified: { alignSelf: "flex-start", minHeight: 25, justifyContent: "center", marginTop: 8, borderRadius: 8, paddingHorizontal: 8, backgroundColor: "#EDFFD1" },
  verifiedText: { color: "#68811D", fontSize: 12, fontWeight: "800" },
  serviceLink: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, borderRadius: 10, paddingHorizontal: 10, backgroundColor: "#F5F1E9" },
  serviceLinkText: { minWidth: 0, flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  chevron: { color: "#74767B", fontSize: 18 },
  emptyCard: { alignItems: "center", marginHorizontal: 12, padding: 30, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  emptyNote: { marginTop: 7, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  loadingMore: { paddingVertical: 18, color: "#74767B", fontSize: 12, textAlign: "center" }
});
