import { useRef, useState, type ReactNode } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { productGames, productGameLabels, type ProductGame } from "@xiongzai/contracts/commerce";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { FileImage } from "@/components/file-image";
import { ShopCard, ServiceCard } from "./catalog-card";
import { useCatalog } from "./home-api";
import { catalogItems, type CatalogSort } from "./home-domain";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import { hotItemWidth } from "@/theme/approved-layout";
import type { CompanionApiView, ServiceApiView } from "@/types/api";
import { formatCent } from "@/utils/money";
import { HomeAnnouncements } from "./home-announcements";
import quickMatch from "../../../assets/reference-jelly-v5/quick-match.png";
import coupons from "../../../assets/reference-jelly-v5/coupon-center-original-shape.png";
import rules from "../../../assets/reference-jelly-v5/app-rules.png";
import feedback from "../../../assets/reference-jelly-v5/feedback-original-shape.png";
import notices from "../../../assets/reference-jelly-v5/official-notices.png";

const shortcuts = [
  { label: "快速匹配", image: quickMatch, path: "/quick-match" },
  { label: "领券中心", image: coupons, path: "/coupons" },
  { label: "平台规则", image: rules, path: "/rules" },
  { label: "意见反馈", image: feedback, path: "/feedback" },
  { label: "官方通知", image: notices, path: "/notifications" }
] as const;
type Mode = "推荐" | "店铺" | "商品";

export function HomeScreen() {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("推荐");
  const [shopSort, setShopSort] = useState<CatalogSort>("comprehensive");
  const [productSort, setProductSort] = useState<CatalogSort>("comprehensive");
  const [game, setGame] = useState<ProductGame | "ALL">("ALL");
  const shops = useCatalog<CompanionApiView>("companions", shopSort);
  const products = useCatalog<ServiceApiView>("services", productSort, mode === "商品" ? game : "ALL");
  const shopRows = catalogItems(shops.data?.pages);
  const productRows = catalogItems(products.data?.pages);
  const online = useOnlineStatus();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<Mode, number>>({ 推荐: 0, 店铺: 0, 商品: 0 });
  const selectMode = (next: Mode) => { if (mode === next) return; setMode(next); requestAnimationFrame(() => scroll.current?.scrollTo({ y: offsets.current[next], animated: false })); };
  const refresh = () => { void shops.refetch(); void products.refetch(); };
  const query = mode === "商品" ? products : shops;
  const rows = mode === "商品" ? productRows : shopRows;
  const status = <>
    {!online ? <HomeState title="当前离线" message="请恢复网络后重新加载；下方如有内容，是此前读取的真实记录。" onRetry={refresh} /> : null}
    {query.isError ? <HomeState title="加载失败" message="暂时无法读取最新商品与店铺，请重试。" onRetry={refresh} /> : null}
    {online && query.isPending && rows.length === 0 ? <HomeState title="正在加载商品与店铺" message="正在读取最新资料…" /> : null}
    {online && !query.isPending && !query.isError && rows.length === 0 ? <HomeState title={mode === "商品" ? "暂无可展示商品" : "暂无可展示店铺"} message="通过审核并公开的内容会显示在这里。" onRetry={refresh} /> : null}
  </>;
  return <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
    <BrandBackdrop />
    <ScrollView ref={scroll} onScroll={event => { offsets.current[mode] = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={100} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={shops.isRefetching || products.isRefetching} onRefresh={refresh} tintColor={colors.brand} />}>
      <Pressable accessibilityRole="button" accessibilityLabel="搜索店铺或商品" onPress={() => router.push("/search")} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
        <ApprovedIllustration kind="search" size={24} /><Text style={styles.searchText}>搜索店铺/商品</Text><View style={styles.searchAction}><Text style={styles.searchActionText}>搜索</Text></View>
      </Pressable>
      <View accessibilityRole="tablist" style={styles.tabs}>{(["推荐", "店铺", "商品"] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: mode === tab }} onPress={() => selectMode(tab)} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}><Text style={[styles.tabText, mode === tab && styles.selectedText]}>{tab}</Text>{mode === tab ? <View style={styles.underline} /> : null}</Pressable>)}</View>
      {mode === "推荐" ? <>
        <HomeAnnouncements />
        <View style={styles.shortcuts}>{shortcuts.map(item => <Pressable key={item.path} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.push(item.path)} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}><Image source={item.image} accessible={false} style={styles.shortcutImage} resizeMode="contain" /><Text style={styles.shortcutText}>{item.label}</Text></Pressable>)}</View>
        {products.isError ? <HomeState title="商品加载失败" message="无法读取熊崽热卖，请重新加载。" onRetry={() => void products.refetch()} /> : null}
        {online && products.isPending && productRows.length === 0 ? <HomeState title="正在加载熊崽热卖" message="正在读取最新商品…" /> : null}
        {online && !products.isPending && !products.isError && productRows.length === 0 ? <HomeState title="暂无可展示商品" message="通过审核并公开的商品会显示在这里。" onRetry={() => void products.refetch()} /> : null}
        {productRows.length > 0 ? <HomeSection title="熊崽热卖" onMore={() => selectMode("商品")}>
          <View style={styles.hotGrid}>{productRows.slice(0, 4).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}，${formatCent(item.min_price_cent)}`} onPress={() => router.push(`/services/${item.id}`)} style={({ pressed }) => [styles.hotItem, { flex: 0, width: hotItemWidth(width) }, pressed && styles.pressed]}><FileImage fileId={item.cover_file_id} label={`${item.title}封面`} compact style={styles.hotImage} /><Text style={styles.hotPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatCent(item.min_price_cent)}</Text></Pressable>)}</View>
        </HomeSection> : null}
        {status}
        {shopRows.length > 0 ? <HomeSection title="热门店铺" onMore={shopRows.length > 5 || shops.hasNextPage ? () => selectMode("店铺") : undefined}>{shopRows.slice(0, 5).map(item => <ShopCard key={item.id} item={item} />)}</HomeSection> : null}
      </> : mode === "店铺" ? <>
        <CatalogSortControls options={[{ label: "综合", value: "comprehensive" }, { label: "好评", value: "rating" }, { label: "销量", value: "sales" }]} selected={shopSort} onChange={setShopSort} />
        {status}<View style={styles.section}>{shopRows.map(item => <ShopCard key={item.id} item={item} />)}</View>
        <LoadMore hasMore={shops.hasNextPage} busy={shops.isFetchingNextPage} failed={shops.isFetchNextPageError} onPress={() => void shops.fetchNextPage()} />
      </> : <>
        <GameFilter value={game} onChange={setGame} />
        <CatalogSortControls options={[{ label: "综合", value: "comprehensive" }, { label: "销量", value: "sales" }, { label: productSort === "price_desc" ? "价格 ↓" : "价格 ↑", value: productSort === "price_asc" ? "price_desc" : "price_asc" }]} selected={productSort} onChange={setProductSort} />
        {status}<View style={styles.productGrid}>{productRows.map(item => <View key={item.id} style={styles.productItem}><ServiceCard item={item} pressable grid /></View>)}</View>
        <LoadMore hasMore={products.hasNextPage} busy={products.isFetchingNextPage} failed={products.isFetchNextPageError} onPress={() => void products.fetchNextPage()} />
      </>}
    </ScrollView>
  </SafeAreaView>;
}

export function GameFilter({ value, onChange, all = true }: { value: ProductGame | "ALL"; onChange(value: ProductGame | "ALL"): void; all?: boolean }) {
  const options: (ProductGame | "ALL")[] = all ? ["ALL", ...productGames] : [...productGames];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gameFilter}>{options.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={option === "ALL" ? "全部游戏" : productGameLabels[option]} accessibilityState={{ checked: value === option }} onPress={() => onChange(option)} style={({ pressed }) => [styles.gameButton, value === option && styles.gameSelected, pressed && styles.pressed]}><Text style={[styles.gameText, value === option && styles.selectedText]}>{option === "ALL" ? "全部" : productGameLabels[option]}</Text></Pressable>)}</ScrollView>;
}
function CatalogSortControls({ options, selected, onChange }: { options: { label: string; value: CatalogSort }[]; selected: CatalogSort; onChange(value: CatalogSort): void }) {
  return <View style={styles.sorts}>{options.map(option => <Pressable key={option.label} accessibilityRole="radio" accessibilityState={{ checked: selected === option.value || (option.value.startsWith("price_") && selected.startsWith("price_")) }} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}><Text style={[styles.sortText, (selected === option.value || (option.value.startsWith("price_") && selected.startsWith("price_"))) && styles.selectedText]}>{option.label}</Text></Pressable>)}</View>;
}
export function HomeState({ title, message, onRetry }: { title: string; message: string; onRetry?(): void }) {
  return <View style={styles.state}><Text accessibilityRole="header" style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{message}</Text>{onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}><Text style={styles.retryText}>重新加载</Text></Pressable> : null}</View>;
}
function HomeSection({ title, onMore, children }: { title: string; onMore?(): void; children: ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHead}><View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><ApprovedIllustration kind={title === "熊崽热卖" ? "flame" : "crown"} size={24} /><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text></View>{onMore ? <Pressable accessibilityRole="button" accessibilityLabel={`更多${title}`} onPress={onMore} style={({ pressed }) => [styles.more, pressed && styles.pressed]}><Text style={styles.moreText}>更多 ›</Text></Pressable> : null}</View>{children}</View>;
}
function LoadMore({ hasMore, busy, failed, onPress }: { hasMore: boolean; busy: boolean; failed: boolean; onPress(): void }) {
  if (!hasMore) return null;
  return <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ busy, disabled: busy }} onPress={onPress} style={({ pressed }) => [styles.loadMore, pressed && styles.pressed]}><Text style={styles.retryText}>{busy ? "正在加载…" : failed ? "加载更多失败，点击重试" : "加载更多"}</Text></Pressable>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceBlue }, content: { paddingTop: 8, paddingBottom: 24 },
  search: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, paddingLeft: 10, paddingRight: 3, borderWidth: 1.5, borderColor: colors.brand, borderRadius: 5, backgroundColor: colors.white }, searchText: { flex: 1, color: colors.textSecondary, fontSize: 14 }, searchAction: { minHeight: 42, minWidth: 64, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: 3 }, searchActionText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  tabs: { flexDirection: "row", marginHorizontal: 16, marginTop: 2 }, tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", paddingVertical: 8 }, tabText: { fontSize: 16, fontWeight: "600", color: colors.textSecondary }, selectedText: { color: colors.brandDeep, fontWeight: "700" }, underline: { position: "absolute", bottom: 3, width: 24, height: 3, borderRadius: 1, backgroundColor: colors.brand },
  shortcuts: { flexDirection: "row", marginHorizontal: 8, marginVertical: 6 }, shortcut: { flex: 1, alignItems: "center", minHeight: 78, paddingVertical: 4, gap: 5 }, shortcutImage: { width: 48, height: 48 }, shortcutText: { color: colors.text, fontSize: 12, textAlign: "center" },
  section: { paddingHorizontal: 12, marginBottom: 8 }, sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }, sectionTitle: { color: colors.text, fontWeight: "700", fontSize: 17 }, more: { minWidth: 48, minHeight: 48, alignItems: "flex-end", justifyContent: "center" }, moreText: { fontSize: 13, color: colors.textSecondary }, hotGrid: { flexDirection: "row", gap: 8 }, hotItem: { flex: 1, minWidth: 0, gap: 3 }, hotImage: { width: "100%", aspectRatio: 1, borderRadius: 3 }, hotPrice: { textAlign: "center", color: colors.brandDeep, fontSize: 17, fontWeight: "700" },
  gameFilter: { paddingHorizontal: 12, gap: 6, paddingVertical: 4 }, gameButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 8 }, gameSelected: { backgroundColor: "#FFFFFFB3" }, gameText: { color: colors.textSecondary, fontSize: 14 }, sorts: { flexDirection: "row", marginHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, sortButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" }, sortText: { fontSize: 14, color: colors.textSecondary },
  productGrid: { paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 10 }, productItem: { width: "48%" }, state: { margin: 12, padding: 16, gap: 8, borderRadius: 12, backgroundColor: "#FFFFFFCC" }, stateTitle: { color: colors.text, fontSize: 16, fontWeight: "700" }, stateText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 }, retry: { minHeight: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 16 }, retryText: { color: colors.brandDeep, fontSize: 14, fontWeight: "600" }, loadMore: { minHeight: 48, alignItems: "center", justifyContent: "center", margin: 12 }, pressed: { opacity: 0.72 }
});
