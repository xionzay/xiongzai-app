import { JellyIcon } from "../../components/jelly-icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { isFulfillmentOrder } from "@xiongzai/contracts/commerce";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { resolveSellerHomeFilter } from "./seller-home-model";
import { StateBear } from "@/components/state-bear";
import { NativeBackdrop, NativeButton, NativeHeader } from "@/components/native-page";
import { FileImage } from "@/components/file-image";
import { StateView } from "@/components/state-view";
import { formatServiceTime } from "@/features/checkout/checkout-domain";
import { useServiceDetail } from "@/features/discovery/discovery-api";
import { useSellerOrders } from "@/features/seller/seller-order-api";
import { sellerOrderStatusLabel } from "@/features/seller/seller-order-domain";
import { colors } from "@/theme/tokens";
import type { OrderApiView, OrderStatus } from "@/types/api";
import { formatCent } from "@/utils/money";

type Filter = OrderStatus | "AFTER_SALE" | undefined;
const filters: { label: string; value?: Filter }[] = [
  { label: "全部" },
  { label: "待服务", value: "PENDING_SERVICE" },
  { label: "新订单", value: "PENDING_ACCEPT" },
  { label: "待开始", value: "ACCEPTED" },
  { label: "服务中", value: "IN_SERVICE" },
  { label: "待收货", value: "PENDING_BUYER_CONFIRM" },
  { label: "已完成", value: "COMPLETED" },
  { label: "售后", value: "AFTER_SALE" }
];
let savedFilter: Filter;
let savedOffset = 0;

export function SellerOrdersSummaryScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [manualFilter, setFilter] = useState<Filter>(savedFilter);
  const requested = resolveSellerHomeFilter(params.filter);
  const filter = requested ? requested === 'ALL' ? undefined : requested : manualFilter;
  const filterScroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  useEffect(() => {
    if (requested) { savedFilter = requested === 'ALL' ? undefined : requested; savedOffset = 0; }
    const x = positions.current[filter ?? 'ALL'];
    if (x !== undefined) filterScroll.current?.scrollTo({ x: Math.max(0, x - 12), animated: false });
  }, [requested, filter]);
  const query = useSellerOrders(true, filter === "AFTER_SALE" ? undefined : filter, filter === "AFTER_SALE" ? "IN_PROGRESS" : undefined);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const header = (
    <View style={styles.headerContent}>
      <NativeHeader title="订单管理" subtitle="" onBack={() => router.replace("/(seller-tabs)")} />
      <ScrollView ref={filterScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((item) => <Pressable key={item.label} accessibilityRole="tab" accessibilityState={{ selected: filter === item.value }} onLayout={({ nativeEvent }) => { positions.current[item.value ?? 'ALL'] = nativeEvent.layout.x; if (filter === item.value) filterScroll.current?.scrollTo({ x: Math.max(0, nativeEvent.layout.x - 12), animated: false }); }} onPress={() => { router.setParams({ filter: undefined }); savedFilter = item.value; savedOffset = 0; setFilter(item.value); }} style={({ pressed }) => [styles.filter, filter === item.value && styles.filterActive, pressed && styles.pressed]}><Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label}</Text></Pressable>)}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <NativeBackdrop />
      {query.isPending ? <View style={styles.flex}>{header}<View style={styles.state}><StateView kind="loading" title="正在读取卖家订单" /></View></View> : null}
      {query.isError ? <View style={styles.flex}>{header}<View style={styles.state}><StateView kind="error" title="卖家订单加载失败" onRetry={() => void query.refetch()} /></View></View> : null}
      {!query.isPending && !query.isError ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentOffset={{ x: 0, y: savedOffset }}
          onScroll={(event) => { savedOffset = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={200}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<SellerOrderEmpty filtered={filter !== undefined} />}
          renderItem={({ item }) => <OrderCard order={item} />}
          ListFooterComponent={query.hasNextPage ? <NativeButton tone="secondary" label={query.isFetchingNextPage ? "加载中…" : "加载更多"} disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
        />
      ) : null}
    </SafeAreaView>
  );
}

function SellerOrderEmpty({ filtered }: { filtered: boolean }) {
  return <View style={styles.emptyState}><StateBear kind="empty" size={176} /><Text style={styles.emptyTitle}>{filtered ? '当前分类暂无订单' : '暂无卖家订单'}</Text><Text style={styles.emptyMessage}>当前分类还没有订单，新的订单会显示在这里。</Text><View style={styles.emptyButton}><NativeButton label="查看服务管理" onPress={() => router.push("/(seller-tabs)/services")} /></View></View>;
}

function OrderCard({ order }: { order: OrderApiView }) {
  const service = useServiceDetail(order.product_id, Boolean(order.product_id));
  const productImageFileId = order.product_image
    || service.data?.cover_file_id
    || service.data?.images.find((image) => image.is_cover)?.file_id
    || service.data?.images[0]?.file_id
    || null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${order.product_title}，${sellerOrderStatusLabel(order)}`} onPress={() => router.push({ pathname: "/seller/orders/[id]", params: { id: order.id } })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.row}><FileImage fileId={order.buyer?.avatar_file_id ?? null} style={styles.buyerAvatar} label="买家头像" /><View style={styles.buyerCopy}><Text style={styles.buyer} numberOfLines={1}>{order.buyer?.nickname ?? "平台买家"}</Text><Text style={styles.buyerNote} numberOfLines={2}>订单备注：{order.buyer_note || "未填写"}</Text></View><Text style={styles.status}>{sellerOrderStatusLabel(order)}</Text></View>
      <View style={styles.productRow}>
        <FileImage fileId={productImageFileId} style={styles.productImage} label={`${order.product_title}主图`} />
        <View style={styles.productCopy}><Text style={styles.title} numberOfLines={2}>{order.product_title}</Text><Text style={styles.meta} numberOfLines={2}>{order.sku_name} · ×{order.quantity}</Text>{!isFulfillmentOrder(order) ? <Text style={styles.meta}>预约 {formatServiceTime(order.service_starts_at)}</Text> : null}</View>
        <Text style={styles.money}>{formatCent(order.payable_amount_cent)}</Text>
      </View>
      <View style={styles.actionRow}><Text style={styles.orderNo}>订单 {order.order_no}</Text><Text style={styles.actionText}>查看详情 <JellyIcon kind="back" right /></Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DEF0FF" },
  flex: { flex: 1, paddingHorizontal: 12 },
  headerContent: { gap: 2 },
  filters: { minWidth: "100%", justifyContent: "space-between", gap: 0, paddingBottom: 13 },
  filter: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 9, borderBottomWidth: 3, borderBottomColor: "transparent" },
  filterActive: { borderBottomColor: colors.accent },
  filterText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  filterTextActive: { color: colors.accent },
  list: { gap: 12, paddingHorizontal: 12, paddingBottom: 24 },
  state: { paddingVertical: 12 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.white },
  emptyTitle: { marginTop: 8, color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: "700" },
  emptyMessage: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: "center" },
  emptyButton: { width: 142, marginTop: 19 },
  card: { gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, backgroundColor: "transparent" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 8 },
  buyerAvatar: { width: 40, height: 40, borderRadius: 12 },
  buyerCopy: { flex: 1, minWidth: 0 },
  buyer: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  buyerNote: { marginTop: 3, color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  status: { maxWidth: "35%", color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  title: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  meta: { flexShrink: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  money: { color: colors.accent, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  productRow: { minHeight: 100, flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  productImage: { width: 76, height: 76, borderRadius: 16, backgroundColor: "#EAF6FF" },
  productCopy: { flex: 1, gap: 6 },
  actionRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderNo: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  actionText: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  pressed: { opacity: 0.72 }
});
