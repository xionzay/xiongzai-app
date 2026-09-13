import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FileImage } from "@/components/file-image";
import { NativePage, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { useSellerServices } from "@/features/seller/seller-api";
import { colors } from "@/theme/tokens";
import type { SellerProductStatus } from "@/types/api";
import { formatCent } from "@/utils/money";

const statusCopy: Record<SellerProductStatus, string> = { DRAFT: "草稿", PENDING_REVIEW: "审核中", ON_SALE: "出售中", REVIEW_REJECTED: "审核未通过", OFF_SALE: "已下架", ADMIN_OFF_SALE: "平台下架", DELETED: "已删除" };
const filters: { label: string; values: SellerProductStatus[] }[] = [
  { label: "出售中", values: ["ON_SALE"] },
  { label: "审核中", values: ["PENDING_REVIEW", "REVIEW_REJECTED"] },
  { label: "已下架", values: ["OFF_SALE", "ADMIN_OFF_SALE"] },
  { label: "草稿箱", values: ["DRAFT"] }
];

export function SellerServicesScreen() {
  const query = useSellerServices();
  const [filter, setFilter] = useState("出售中");
  const selected = filters.find((item) => item.label === filter) ?? filters[0]!;
  const rows = query.data?.filter((item) => item.status !== "DELETED" && selected.values.includes(item.status)) ?? [];

  const publish = <Pressable accessibilityRole="button" accessibilityLabel="发布服务" onPress={() => router.push("/seller/services/new")} style={({ pressed }) => [styles.publish, pressed && styles.pressed]}><Text style={styles.publishText}>＋ 发布服务</Text></Pressable>;
  return (
    <NativePage title="服务管理" subtitle="只有陪玩卖家可以发布服务" action={publish} contentStyle={styles.content} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} onBack={() => router.replace("/(seller-tabs)")}>
      <View style={styles.filters}>
        {filters.map((item) => {
          const count = query.data?.filter((row) => item.values.includes(row.status)).length ?? 0;
          return <Pressable accessibilityRole="tab" accessibilityState={{ selected: filter === item.label }} key={item.label} onPress={() => setFilter(item.label)} style={({ pressed }) => [styles.filter, filter === item.label && styles.filterActive, pressed && styles.pressed]}><Text style={[styles.filterText, filter === item.label && styles.filterTextActive]}>{item.label} {count}</Text></Pressable>;
        })}
      </View>
      {query.isPending ? <View style={styles.state}><StateView kind="loading" /></View> : null}
      {query.isError ? <View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View> : null}
      {!query.isPending && !query.isError && !rows.length ? <View style={styles.state}><StateView kind="empty" title="当前分类暂无服务" message="不会使用静态样例填充经营数据" /></View> : null}
      {rows.map((item) => {
        return (
          <View key={item.id} style={[styles.card, item.status === "REVIEW_REJECTED" && styles.rejectedCard]}>
            <FileImage fileId={item.cover_file_id} style={styles.image} label={`${item.title}主图`} />
            <View style={styles.productCopy}>
              <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">{item.title}</Text>
              <Text style={styles.meta}>{formatCent(item.min_price_cent)} 起 · {item.sold_count} 单</Text>
              <View style={styles.statusPill}><Text style={styles.statusText}>{statusCopy[item.status]}</Text></View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={item.status === "REVIEW_REJECTED" ? "查看原因" : "管理服务"} onPress={() => router.push({ pathname: item.status === "REVIEW_REJECTED" ? "/seller/services/[id]/review" : "/seller/services/[id]/edit", params: { id: item.id } })} style={({ pressed }) => [styles.manage, pressed && styles.pressed]}><Text style={styles.manageText}>{item.status === "REVIEW_REJECTED" ? "查看原因" : "管理"}</Text></Pressable>
          </View>
        );
      })}
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  publish: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 11, borderRadius: 11, backgroundColor: "#CFF20B" },
  publishText: { color: "#2D3B0B", fontSize: 12, lineHeight: 16, fontWeight: "900" },
  filters: { minHeight: 106, flexDirection: "row", flexWrap: "wrap", gap: 4, padding: 5, borderWidth: 1, borderColor: "rgba(62,57,47,0.08)", borderRadius: 16, backgroundColor: "#EEE7DA" },
  filter: { width: "49%", flexGrow: 1, minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 12 },
  filterActive: { backgroundColor: "#FFFDF8", ...nativeShadow },
  filterText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  filterTextActive: { color: colors.accent },
  card: { minHeight: 124, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  rejectedCard: { borderColor: "rgba(229,72,77,0.24)" },
  image: { width: 106, height: 100, borderRadius: 14, backgroundColor: "#EAF6FF" },
  productCopy: { flex: 1, alignItems: "flex-start" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#EAF6FF" },
  statusText: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  title: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "900" },
  meta: { marginTop: 7, color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  manage: { minWidth: 54, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "#91BDE5", borderRadius: 12, backgroundColor: "#FFFFFF" },
  manageText: { color: "#2D78B9", fontSize: 12, fontWeight: "900" },
  state: { minHeight: 230, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  pressed: { opacity: 0.72 }
});
