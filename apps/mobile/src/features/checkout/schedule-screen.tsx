import { BrandBackdrop } from "@/components/brand-backdrop";
import { useCallback, useMemo, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { buildStartOptions, selectedSku } from "@/features/checkout/checkout-domain";
import { useAvailability, useServiceDetail } from "@/features/discovery/discovery-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import { ShieldIcon } from "@/components/tab-icons";



export function ScheduleScreen() {
  const { productId = "", skuId = "" } = useLocalSearchParams<{ productId: string; skuId: string }>();
  const { status } = useAuth();
  const online = useOnlineStatus();
  const detail = useServiceDetail(productId, status === "authenticated");
  const availability = useAvailability(detail.data?.seller_id, Boolean(detail.data) && status === "authenticated");
  const sku = detail.data ? selectedSku(detail.data.skus, skuId) : undefined;
  const options = useMemo(() => sku ? buildStartOptions(availability.data ?? [], sku.duration_minutes ?? 0) : [], [availability.data, sku]);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (status === "anonymous") {
      const returnTo = `/checkout/schedule?productId=${encodeURIComponent(productId)}&skuId=${encodeURIComponent(skuId)}`;
      router.replace({ pathname: "/(auth)/required", params: { action: "预约服务", returnTo } });
    }
  }, [productId, skuId, status]));

  const option = options.find((item) => item.startsAt === selectedStart) ?? options[0];
  if (status === "booting" || detail.isPending || availability.isPending) return <AppScreen><PageHeader title="选择预约时间" /><StateView kind="loading" title="正在核对真实可约时间" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="选择预约时间" /><StateView kind="offline" onRetry={() => { void detail.refetch(); void availability.refetch(); }} /></AppScreen>;
  if (detail.isError || availability.isError || !detail.data || !sku) return <AppScreen><PageHeader title="选择预约时间" /><StateView kind="error" title="暂时无法预约" message={sku === undefined && detail.data ? "所选服务规格已经失效" : "无法获取服务或可预约时间，请返回重试"} onRetry={() => { void detail.refetch(); void availability.refetch(); }} /></AppScreen>;

  const service = detail.data;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScheduleBackdrop />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={detail.isRefetching || availability.isRefetching} onRefresh={() => { setSelectedStart(null); void detail.refetch(); void availability.refetch(); }} tintColor={colors.accent} />}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>选择预约时间</Text><Text style={styles.headerSubtitle}>仅展示 {service.seller.seller_nickname} 可接单的时间</Text></View>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.playerCard}>
          <FileImage fileId={service.seller.seller_avatar_file_id} style={styles.avatar} label={`${service.seller.seller_nickname}头像`} />
          <View style={styles.playerCopy}><Text style={styles.playerTitle}>{service.seller.seller_nickname} · {service.seller.accepting_orders ? "在线接单" : "暂停接单"}</Text><Text style={styles.playerMeta}>{sku.sku_name} · 当前规格约 {sku.duration_minutes} 分钟</Text></View>
        </View>

        <View style={styles.panel} accessibilityRole="radiogroup">
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>可预约时段</Text><Text style={styles.sectionNote}>下单后由陪玩确认</Text></View>
          {options.length ? <View style={styles.slotGrid}>{options.map((item) => {
            const selected = item.startsAt === option?.startsAt;
            return <Pressable key={`${item.slotId}-${item.startsAt}`} accessibilityRole="radio" accessibilityLabel={`${item.dayLabel} ${item.timeLabel}`} accessibilityState={{ checked: selected }} onPress={() => setSelectedStart(item.startsAt)} style={[styles.slot, selected && styles.slotSelected]}><Text style={[styles.slotDay, selected && styles.selectedText]} numberOfLines={1}>{item.dayLabel}</Text><Text style={[styles.slotTime, selected && styles.selectedText]} numberOfLines={1}>{item.timeLabel}</Text><Text style={styles.available}>可预约</Text></Pressable>;
          })}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>近期没有开放可接单时段</Text><Text style={styles.emptyNote}>可以稍后下拉刷新，或返回选择其他陪玩服务。</Text><Pressable accessibilityRole="button" onPress={() => void availability.refetch()} style={styles.retry}><Text style={styles.retryText}>重新获取</Text></Pressable></View>}
        </View>

        <View style={styles.ruleCard}><ShieldIcon size={40} /><View style={styles.ruleCopy}><Text style={styles.ruleTitle}>预约保护</Text><Text style={styles.ruleNote}>正式创建订单时数据库会再次检查时段；并发冲突会提示重新选择。</Text></View></View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
        <View style={styles.confirmBar}>
          <View style={styles.selection}><Text style={styles.selectionLabel}>已选</Text><Text style={styles.selectionValue} numberOfLines={2}>{option ? `${option.dayLabel} ${option.timeLabel}` : "尚未选择"}</Text></View>
          <Pressable accessibilityRole="button" disabled={!option} onPress={() => option && router.push({ pathname: "/checkout/confirm", params: { productId, skuId, slotId: option.slotId, startsAt: option.startsAt } })} style={[styles.confirm, !option && styles.confirmDisabled]}><Text style={styles.confirmText}>确认时间</Text></Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

function ScheduleBackdrop() { return <BrandBackdrop />; }

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  bottomSafe: { backgroundColor: colors.dock, shadowOpacity: 0, elevation: 0, borderTopColor: colors.divider },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 18 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center", marginLeft: 0, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  headerSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  playerCard: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 13, marginBottom: 12, padding: 13, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  avatar: { width: 58, height: 58, borderWidth: 3, borderColor: colors.white, borderRadius: 29, backgroundColor: "#CBE4FA" },
  playerCopy: { flex: 1, gap: 5 },
  playerTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  playerMeta: { color: "#74767B", fontSize: 12, lineHeight: 16 },
  panel: { marginHorizontal: 13, marginBottom: 12, padding: 15, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  sectionHead: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  sectionNote: { color: "#7B7D83", fontSize: 12 },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },
  slot: { width: "31.6%", minHeight: 68, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 4, paddingVertical: 8, borderWidth: 1, borderColor: "#D9D2C6", borderRadius: 14, backgroundColor: "#FFFFFF" },
  slotSelected: { borderWidth: 2, borderColor: colors.accent, backgroundColor: "#FFF3EC" },
  slotDay: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800", textAlign: "center" },
  slotTime: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "center" },
  selectedText: { color: colors.accent },
  available: { color: "#7C7E80", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 24 },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "center" },
  emptyNote: { marginTop: 6, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  retry: { minHeight: 44, justifyContent: "center", marginTop: 8, paddingHorizontal: 14 },
  retryText: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  ruleCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 13, marginBottom: 12, padding: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  ruleCopy: { flex: 1, gap: 4 },
  ruleTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  ruleNote: { color: "#74767B", fontSize: 12, lineHeight: 16 },
  confirmBar: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: "rgba(62,57,47,0.11)", backgroundColor: "rgba(255,252,245,0.97)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 6 },
  selection: { flex: 1 },
  selectionLabel: { color: "#6B6D70", fontSize: 12 },
  selectionValue: { marginTop: 3, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  confirm: { height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, paddingHorizontal: 22, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 4 },
  confirmDisabled: { backgroundColor: "#C9C8C4", shadowOpacity: 0 },
  confirmText: { color: colors.white, fontSize: 14, fontWeight: "900" }
});
