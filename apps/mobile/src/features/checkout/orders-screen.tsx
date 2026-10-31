import { useEffect, useMemo, useRef, useState } from "react";
import { isFulfillmentOrder } from "@xiongzai/contracts/commerce";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { ListSkeleton } from "@/components/list-skeleton";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { ChevronRightIcon } from "@/components/ui-icons";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { nativeShadow } from "@/components/native-page";
import { useBuyerOrders } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { OrderApiView, OrderStatus } from "@/types/api";
import { BuyerOrderCard } from './buyer-order-card';
import { ShieldIcon } from "@/components/tab-icons";
import { orderFilterRequest, visibleBuyerOrders, searchLoadedBuyerOrders, type BuyerOrderFilter } from "./order-list-filter";

const labels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待付款",
  PENDING_ACCEPT: "待接单",
  ACCEPTED: "待开始",
  PENDING_SERVICE: "待服务",
  IN_SERVICE: "服务中",
  PENDING_BUYER_CONFIRM: "待确认",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  CLOSED: "已关闭",
  SELLER_REJECTED: "未接单"
};

type OrderFilter = BuyerOrderFilter;
const filters: { label: string; value?: OrderFilter }[] = [
  { label: "全部", value: "ALL" },
  { label: "待付款", value: "PENDING_PAYMENT" },
  { label: "待服务", value: "PENDING_SERVICE" },
  { label: "服务中", value: "IN_SERVICE" },
  { label: "待收货", value: "PENDING_BUYER_CONFIRM" },
  { label: "待评价", value: "PENDING_REVIEW" },
  { label: "售后中", value: "AFTER_SALE" },
  { label: "已完成", value: "COMPLETED" },
  { label: "待接单", value: "PENDING_ACCEPT" },
  { label: "待开始", value: "ACCEPTED" }
];

let savedFilter: OrderFilter = "ALL";
let savedOffset = 0;

export function OrdersScreen() {
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [manualFilter, setFilter] = useState<OrderFilter>(savedFilter);
  const [searchOpen, setSearchOpen] = useState(false);
  // Account-scoped state prevents a previous account's private search leaking on switch.
  const [search, setSearch] = useState({ owner: user?.id, value: "" });
  const keyword = search.owner === user?.id ? search.value : "";
  const routeFilter = filters.find(item => item.value === params.filter)?.value;
  const filter = routeFilter ?? manualFilter;
  const filterScroll = useRef<ScrollView>(null);
  const filterPositions = useRef<Partial<Record<OrderFilter, number>>>({});
  useEffect(() => {
    const x = filterPositions.current[filter];
    if (x !== undefined) filterScroll.current?.scrollTo({ x: Math.max(0, x - 12), animated: false });
  }, [filter]);
  useEffect(() => {
    if (routeFilter) { savedFilter = routeFilter; savedOffset = 0; }
  }, [routeFilter]);
  const request = orderFilterRequest(filter);
  const query = useBuyerOrders(status === "authenticated", request.status, request.afterSale);
  const items = useMemo(() => searchLoadedBuyerOrders(visibleBuyerOrders(query.data?.pages.flatMap((page) => page.items) ?? [], filter), keyword), [query.data, filter, keyword]);

  if (status === "booting") return <AppScreen><StateView kind="loading" /></AppScreen>;
  if (!user) return <AppScreen><StateView kind="empty" title="登录后查看订单" message="订单属于账号私有数据" actionLabel="去登录" onRetry={() => router.push({ pathname: "/(auth)/required", params: { action: "查看订单", returnTo: "/(buyer-tabs)/orders" } })} /></AppScreen>;
  if (!online) return <AppScreen><StateView kind="offline" onRetry={() => void query.refetch()} /></AppScreen>;
  if (query.isPending) return <AppScreen><OrdersHeader /><ListSkeleton rows={4} /></AppScreen>;
  if (query.isError) return <AppScreen><StateView kind="error" onRetry={() => void query.refetch()} /></AppScreen>;

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <OrdersHeader searchOpen={searchOpen} onSearch={() => setSearchOpen(value => !value)} />
      {searchOpen ? <View style={styles.searchRow}>
        <TextInput accessibilityLabel="搜索订单" placeholder="搜索商品、店铺或订单号" placeholderTextColor={colors.textSecondary} value={keyword}
          onChangeText={value => { savedOffset = 0; setSearch({ owner: user.id, value }); }} style={styles.searchInput} returnKeyType="search" autoCapitalize="none" />
        <Pressable accessibilityRole="button" accessibilityLabel="清空订单搜索" onPress={() => setSearch({ owner: user.id, value: "" })} style={styles.searchControl}><Text style={styles.linkText}>清空</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="收起订单搜索" onPress={() => setSearchOpen(false)} style={styles.searchControl}><Text style={styles.linkText}>收起</Text></Pressable>
      </View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="刷新订单" accessibilityState={{ busy: query.isRefetching }} disabled={query.isRefetching} onPress={() => void query.refetch()} style={styles.refreshButton}><Text style={styles.linkText}>{query.isRefetching ? "刷新中…" : "刷新订单"}</Text></Pressable>
      {keyword.trim() ? <Text style={styles.searchNote}>仅搜索已加载订单；继续加载可查看更早记录。</Text> : null}
      <ScrollView
        ref={filterScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersViewport}
        contentContainerStyle={styles.filters}
      >
        {filters.map((item) => {
          const selected = filter === item.value;
          return (
            <Pressable
              key={item.label}
              onLayout={({ nativeEvent }) => {
                const value = item.value ?? 'ALL';
                filterPositions.current[value] = nativeEvent.layout.x;
                if (value === filter) filterScroll.current?.scrollTo({ x: Math.max(0, nativeEvent.layout.x - 12), animated: false });
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                savedFilter = item.value ?? "ALL";
                savedOffset = 0;
                router.setParams({ filter: undefined });
                setFilter(item.value ?? "ALL");
              }}
              style={styles.filter}
            >
              <Text style={[styles.filterText, selected && styles.filterTextActive]}>{item.label}</Text>
              {selected ? <View style={styles.filterUnderline} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <FlatList
        style={styles.orderList}
        data={items}
        keyExtractor={(item) => item.id}
        contentOffset={{ x: 0, y: savedOffset }}
        onScroll={(event) => { savedOffset = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={200}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.accent} />}
        ListEmptyComponent={keyword.trim() ? <StateView kind="empty" title="没有找到相关订单" message="当前已加载订单中没有匹配项，可以修改搜索词或继续加载。" /> : filter === 'PENDING_REVIEW' && query.hasNextPage ? <StateView kind="empty" title="已加载订单中暂无待评价" message="还有历史订单未加载，请继续加载后查看" /> : <EmptyOrders />}
        renderItem={({ item }) => <BuyerOrderCard item={item} state={listStatus(item)} />}
        ListFooterComponent={(
          <View style={styles.footer}>
            {query.hasNextPage ? <PrimaryButton tone="plain" label={query.isFetchingNextPage ? "加载中…" : "加载更多"} loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
            <SupportEntry />
          </View>
        )}
      />
    </AppScreen>
  );
}

function OrdersHeader({ searchOpen = false, onSearch }: { searchOpen?: boolean; onSearch?(): void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerAction} />
      <Text style={styles.pageTitle}>我的订单</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="搜索订单" accessibilityState={{ expanded: searchOpen }} disabled={!onSearch} onPress={onSearch} style={styles.headerAction}><ApprovedIllustration kind="search" size={25} /><Text style={styles.searchLabel}>搜索</Text></Pressable>
    </View>
  );
}

function EmptyOrders() {
  return <StateView kind="empty" illustrationSize={176} title="还没有购买订单" message="当前分类暂无订单，新的订单会显示在这里。" actionLabel="去看看服务" onRetry={() => router.push('/(buyer-tabs)')} />;
}

function SupportEntry() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="售后与平台介入" onPress={() => router.push("/support/new")} style={styles.support}>
      <View style={styles.supportMark}><ShieldIcon size={28} /></View>
      <View style={styles.flex}>
        <Text style={styles.supportTitle}>售后与平台介入</Text>
        <Text style={styles.supportMeta}>退款申请 · 投诉 · 交易纠纷</Text>
      </View>
      <ChevronRightIcon size={21} />
    </Pressable>
  );
}

function listStatus(item: OrderApiView) {
  if (item.payment_status === "REFUNDED") return "已退款";
  if (item.after_sale_status === "IN_PROGRESS") return "售后中";
  if (item.status === "COMPLETED" && item.reviewed) return "已评价";
  if (isFulfillmentOrder(item) && item.status === "PENDING_BUYER_CONFIRM") return "待收货";
  return labels[item.status];
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 60, paddingBottom: 4, height: undefined },
  headerAction: { width: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  searchLabel: { fontSize: 10, lineHeight: 14, color: colors.text },
  pageTitle: { ...typography.pageTitle, flex: 1, color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  refreshButton: { minHeight: 44, alignSelf: "flex-end", justifyContent: "center", paddingHorizontal: 6 },
  linkText: { color: colors.accent, fontSize: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, color: colors.text, backgroundColor: colors.white, fontSize: 13 },
  searchControl: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  searchNote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  filtersViewport: { flexGrow: 0, flexShrink: 0, maxHeight: 50 },
  filters: { minHeight: 46, alignItems: "center", gap: spacing.lg, paddingRight: spacing.lg },
  filter: { height: 44, minWidth: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
  filterText: { ...typography.caption, color: colors.textSecondary, fontWeight: "800" },
  filterTextActive: { color: colors.accent, fontWeight: "900" },
  filterUnderline: { position: "absolute", bottom: 2, width: 22, height: 3, borderRadius: 2, backgroundColor: colors.accent },
  orderList: { flex: 1 },
  list: { gap: spacing.md, paddingTop: spacing.sm, paddingBottom: 112 },
  emptyCard: { minHeight: 230, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  emptyMark: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.accentSoft },
  emptyTitle: { ...typography.sectionTitle, color: colors.text },
  emptyMessage: { ...typography.body, color: colors.textSecondary },
  footer: { gap: spacing.md, paddingTop: spacing.md },
  support: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 18, backgroundColor: "transparent" },
  supportMark: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  supportTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  supportMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  card: { gap: spacing.md, padding: spacing.lg, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  top: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  seller: { ...typography.body, color: colors.text, fontWeight: "800" },
  status: { ...typography.caption, color: colors.accent, fontWeight: "900" },
  row: { flexDirection: "row", gap: spacing.md },
  image: { width: 84, height: 72, borderRadius: radii.md },
  flex: { flex: 1, gap: spacing.xs },
  title: { ...typography.cardTitle, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary },
  price: { ...typography.cardTitle, color: colors.accent, marginTop: "auto" },
  cardFooter: { flexDirection: "row", justifyContent: "flex-end" },
  detailAction: { minWidth: 88, overflow: "hidden", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: colors.accent, color: colors.white, textAlign: "center", fontWeight: "900" }
});
