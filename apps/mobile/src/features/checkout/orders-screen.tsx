import { useEffect, useMemo, useRef, useState } from "react";
import { isFulfillmentOrder } from "@xiongzai/contracts/commerce";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { ListSkeleton } from "@/components/list-skeleton";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { ChevronRightIcon, RefreshIcon } from "@/components/ui-icons";
import { nativeShadow } from "@/components/native-page";
import { formatServiceTime } from "@/features/checkout/checkout-domain";
import { useBuyerOrders } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { OrderApiView, OrderStatus } from "@/types/api";
import { formatCent } from "@/utils/money";
import { OrderTabIcon, ShieldIcon } from "@/components/tab-icons";
import { orderFilterRequest, visibleBuyerOrders, type BuyerOrderFilter } from "./order-list-filter";

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
  { label: "待接单", value: "PENDING_ACCEPT" },
  { label: "待开始", value: "ACCEPTED" },
  { label: "服务中", value: "IN_SERVICE" },
  { label: "待收货", value: "PENDING_BUYER_CONFIRM" },
  { label: "已完成", value: "COMPLETED" },
  { label: "待评价", value: "PENDING_REVIEW" },
  { label: "售后", value: "AFTER_SALE" }
];

let savedFilter: OrderFilter = "ALL";
let savedOffset = 0;

export function OrdersScreen() {
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [manualFilter, setFilter] = useState<OrderFilter>(savedFilter);
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
  const items = useMemo(() => visibleBuyerOrders(query.data?.pages.flatMap((page) => page.items) ?? [], filter), [query.data, filter]);

  if (status === "booting") return <AppScreen><StateView kind="loading" /></AppScreen>;
  if (!user) return <AppScreen><StateView kind="empty" title="登录后查看订单" message="订单属于账号私有数据" actionLabel="去登录" onRetry={() => router.push({ pathname: "/(auth)/required", params: { action: "查看订单", returnTo: "/(buyer-tabs)/orders" } })} /></AppScreen>;
  if (!online) return <AppScreen><StateView kind="offline" onRetry={() => void query.refetch()} /></AppScreen>;
  if (query.isPending) return <AppScreen><OrdersHeader /><ListSkeleton rows={4} /></AppScreen>;
  if (query.isError) return <AppScreen><StateView kind="error" onRetry={() => void query.refetch()} /></AppScreen>;

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <OrdersHeader refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
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
        ListEmptyComponent={filter === 'PENDING_REVIEW' && query.hasNextPage ? <StateView kind="empty" title="已加载订单中暂无待评价" message="还有历史订单未加载，请继续加载后查看" /> : <EmptyOrders />}
        renderItem={({ item }) => <OrderCard item={item} />}
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

function OrdersHeader({ refreshing = false, onRefresh }: { refreshing?: boolean; onRefresh?(): void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.pageTitle}>我的订单</Text>
        <Text style={styles.pageSubtitle}>只显示我购买的商品订单</Text>
      </View>
      {onRefresh ? (
        <Pressable accessibilityRole="button" accessibilityLabel="刷新订单" accessibilityState={{ busy: refreshing }} disabled={refreshing} onPress={onRefresh} style={styles.refreshButton}>
          {refreshing ? <Text style={styles.refreshingText}>…</Text> : <RefreshIcon size={22} />}
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyOrders() {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyMark}><OrderTabIcon size={34} /></View>
      <Text style={styles.emptyTitle}>还没有订单</Text>
      <Text style={styles.emptyMessage}>当前分类暂无订单</Text>
    </View>
  );
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

function OrderCard({ item }: { item: OrderApiView }) {
  const state = listStatus(item);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.product_title}，${state}`} onPress={() => router.push({ pathname: "/orders/[id]", params: { id: item.id } })} style={styles.card}>
      <View style={styles.top}>
        <View style={styles.sellerRow}><Text style={styles.seller}>{item.seller_name}</Text><ChevronRightIcon size={15} color={colors.text} /></View>
        <Text style={styles.status}>{state}</Text>
      </View>
      <View style={styles.row}>
        <FileImage fileId={item.product_image || null} style={styles.image} label={`${item.product_title}图片`} />
        <View style={styles.flex}>
          <Text style={styles.title}>{item.product_title}</Text>
          <Text style={styles.meta}>{item.sku_name} · {isFulfillmentOrder(item) ? "按完成期限交付" : formatServiceTime(item.service_starts_at)}</Text>
          <Text style={styles.price}>{formatCent(item.payable_amount_cent)}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}><Text style={styles.detailAction}>订单详情</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 60, paddingBottom: 4, height: undefined },
  headerCopy: { flex: 1, gap: 3, marginLeft: 0, minWidth: 0 },
  pageTitle: { ...typography.pageTitle, color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { ...typography.caption, textAlign: "center", color: colors.textSecondary },
  refreshButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border },
  refreshingText: { color: colors.text, fontSize: 23, lineHeight: 25, fontWeight: "800" },
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
  support: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  supportMark: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.accentSoft },
  supportTitle: { ...typography.cardTitle, color: colors.text },
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
