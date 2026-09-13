import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { NativeBackdrop, NativeButton, NativeHeader, nativeShadow } from "@/components/native-page";
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
  { label: "新订单", value: "PENDING_ACCEPT" },
  { label: "待开始", value: "ACCEPTED" },
  { label: "服务中", value: "IN_SERVICE" },
  { label: "待确认", value: "PENDING_BUYER_CONFIRM" },
  { label: "已完成", value: "COMPLETED" },
  { label: "售后", value: "AFTER_SALE" }
];
let savedFilter: Filter = "PENDING_ACCEPT";
let savedOffset = 0;

export function SellerOrdersSummaryScreen() {
  const [filter, setFilter] = useState<Filter>(savedFilter);
  const query = useSellerOrders(true, filter === "AFTER_SALE" ? undefined : filter, filter === "AFTER_SALE" ? "IN_PROGRESS" : undefined);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const header = (
    <View style={styles.headerContent}>
      <NativeHeader title="卖家订单" subtitle="买家下单后的履约工作台" onBack={() => router.replace("/(seller-tabs)")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((item) => <Pressable key={item.label} accessibilityRole="tab" accessibilityState={{ selected: filter === item.value }} onPress={() => { savedFilter = item.value; savedOffset = 0; setFilter(item.value); }} style={({ pressed }) => [styles.filter, filter === item.value && styles.filterActive, pressed && styles.pressed]}><Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label}</Text></Pressable>)}
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
          ListEmptyComponent={<SellerOrderEmpty />}
          renderItem={({ item }) => <OrderCard order={item} />}
          ListFooterComponent={query.hasNextPage ? <NativeButton tone="secondary" label={query.isFetchingNextPage ? "加载中…" : "加载更多"} disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
        />
      ) : null}
    </SafeAreaView>
  );
}

function SellerOrderEmpty() {
  return <View style={styles.emptyState}><View style={styles.emptyMark}><View style={styles.emptyMarkInner} /></View><Text style={styles.emptyTitle}>还没有购买订单</Text><Text style={styles.emptyMessage}>选择喜欢的陪玩服务，首笔订单会显示在这里。</Text><View style={styles.emptyButton}><NativeButton label="去看看服务" onPress={() => router.replace("/(buyer-tabs)")} /></View></View>;
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
      <View style={styles.row}><View><Text style={styles.buyer}>{order.buyer?.nickname ?? "平台买家"}</Text><Text style={styles.buyerNote}>订单备注：{order.buyer_note || "未填写"}</Text></View><Text style={styles.status}>{sellerOrderStatusLabel(order)}</Text></View>
      <View style={styles.productRow}>
        <FileImage fileId={productImageFileId} style={styles.productImage} label={`${order.product_title}主图`} />
        <View style={styles.productCopy}><Text style={styles.title} numberOfLines={2}>{order.product_title}</Text><Text style={styles.meta} numberOfLines={2}>{order.sku_name} · {formatServiceTime(order.service_starts_at)}</Text></View>
        <Text style={styles.money}>{formatCent(order.payable_amount_cent)}</Text>
      </View>
      <View style={styles.actionRow}><Text style={styles.orderNo}>订单 {order.order_no}</Text><Text style={styles.actionText}>查看详情 ›</Text></View>
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
  state: { minHeight: 360, justifyContent: "center", gap: 12, borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  emptyState: { minHeight: 500, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyMark: { width: 88, height: 88, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: "rgba(225,243,255,0.72)" },
  emptyMarkInner: { width: 29, height: 29, borderWidth: 3, borderColor: colors.brand },
  emptyTitle: { marginTop: 18, color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "900" },
  emptyMessage: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: "center" },
  emptyButton: { width: 142, marginTop: 19 },
  card: { gap: 11, padding: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  buyer: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  buyerNote: { marginTop: 3, color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  status: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, color: colors.brandDeep, backgroundColor: "#EAF6FF", fontSize: 12, lineHeight: 16, fontWeight: "900" },
  title: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  meta: { flexShrink: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  money: { color: colors.accent, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  productRow: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "rgba(62,57,47,0.10)" },
  productImage: { width: 78, height: 70, borderRadius: 12, backgroundColor: "#EAF6FF" },
  productCopy: { flex: 1, gap: 6 },
  actionRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderNo: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  actionText: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  pressed: { opacity: 0.72 }
});
