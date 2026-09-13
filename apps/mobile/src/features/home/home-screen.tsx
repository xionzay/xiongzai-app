import { useMemo, useState, type ReactNode } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SafeImage } from "@/components/safe-image";
import { CompanionCard, ServiceCard } from "@/features/home/catalog-card";
import { useHomeCatalog } from "@/features/home/home-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import homeHero from "../../../assets/home-hero.png";
import xiongzaiLogo from "../../../assets/xiongzai-logo.png";

type HomeTab = "recommended" | "companions" | "services";
type SortDirection = "asc" | "desc";

const tabs: { key: HomeTab; label: string }[] = [
  { key: "recommended", label: "推荐" },
  { key: "companions", label: "陪玩" },
  { key: "services", label: "服务" }
];

const homeBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const from = ratio <= 0.56 ? [255, 250, 240] : [255, 253, 247];
  const to = ratio <= 0.56 ? [255, 253, 247] : [248, 241, 231];
  const progress = ratio <= 0.56 ? ratio / 0.56 : (ratio - 0.56) / 0.44;
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function HomeScreen() {
  const [activeTab, setActiveTab] = useState<HomeTab>("recommended");
  const [companionSort, setCompanionSort] = useState("综合");
  const [serviceSort, setServiceSort] = useState("综合");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const online = useOnlineStatus();
  const query = useHomeCatalog();

  const sortedCompanions = useMemo(() => {
    const items = [...(query.data?.companions ?? [])];
    const factor = sortDirection === "desc" ? -1 : 1;
    if (companionSort === "好评") return items.sort((a, b) => (Number(a.rating_avg) - Number(b.rating_avg)) * factor);
    if (companionSort === "销量") return items.sort((a, b) => (a.completed_order_count - b.completed_order_count) * factor);
    return items;
  }, [companionSort, query.data?.companions, sortDirection]);

  const sortedServices = useMemo(() => {
    const items = [...(query.data?.services ?? [])];
    const factor = sortDirection === "desc" ? -1 : 1;
    if (serviceSort === "销量") return items.sort((a, b) => (a.sold_count - b.sold_count) * factor);
    if (serviceSort === "价格") return items.sort((a, b) => {
      const left = BigInt(a.min_price_cent); const right = BigInt(b.min_price_cent);
      return (left === right ? 0 : left > right ? 1 : -1) * factor;
    });
    return items;
  }, [query.data?.services, serviceSort, sortDirection]);

  const selectSort = (value: string, current: string, setCurrent: (next: string) => void) => {
    if (value === current && value !== "综合") setSortDirection((direction) => direction === "desc" ? "asc" : "desc");
    else { setCurrent(value); setSortDirection("desc"); }
  };

  const content = () => {
    if (query.isPending && !query.data) return <HomeState title="正在加载服务与陪玩…" message="请稍候，正在获取最新数据。" />;
    if (!online && !query.data) return <HomeState failed title="加载失败" message="网络连接已断开，请检查网络后重试" onRetry={() => void query.refetch()} />;
    if (query.isError && !query.data) return <HomeState failed title="加载失败" message="暂时无法连接服务，请稍后重试" onRetry={() => void query.refetch()} />;
    if (!query.data || (query.data.companions.length === 0 && query.data.services.length === 0)) return <HomeState title="暂时没有可展示内容" message="通过审核的陪玩和服务会显示在这里" onRetry={() => void query.refetch()} />;

    if (activeTab === "companions") {
      return <><SortBar options={["综合", "好评", "销量"]} active={companionSort} direction={sortDirection} onSelect={(value) => selectSort(value, companionSort, setCompanionSort)} /><HomeSection title="全部陪玩" note={`${query.data.companions.filter((item) => item.accepting_orders).length} 位在线`}><View style={styles.list}>{sortedCompanions.map((item) => <CompanionCard key={item.id} item={item} pressable wide />)}</View></HomeSection></>;
    }

    if (activeTab === "services") {
      return <><SortBar options={["综合", "销量", "价格"]} active={serviceSort} direction={sortDirection} onSelect={(value) => selectSort(value, serviceSort, setServiceSort)} /><HomeSection title="全部服务" note="陪玩自主创建规格和价格"><View style={styles.grid}>{sortedServices.map((item) => <View key={item.id} style={styles.gridItem}><ServiceCard item={item} pressable grid /></View>)}</View></HomeSection></>;
    }

    const onlineCount = query.data.companions.filter((item) => item.accepting_orders).length;
    return <><Pressable accessibilityRole="button" accessibilityLabel="查看当前可下单服务" style={({ pressed }) => [styles.hero, pressed && styles.pressed]}><SafeImage source={homeHero} style={styles.heroImage} label="和平精英在线开黑" /><Text style={styles.heroBadge}>{onlineCount} 位陪玩在线</Text></Pressable>{query.data.companions.length ? <HomeSection title="热门陪玩" note="已通过审核的在线陪玩" action="全部 ›" onAction={() => setActiveTab("companions")}><View style={styles.grid}>{query.data.companions.slice(0, 2).map((item) => <View key={item.id} style={styles.gridItem}><CompanionCard item={item} pressable grid /></View>)}</View></HomeSection> : null}{query.data.services.length ? <HomeSection title="热门服务" note="已通过审核并上架" action="全部 ›" onAction={() => setActiveTab("services")}><View style={styles.grid}>{query.data.services.slice(0, 2).map((item) => <View key={item.id} style={styles.gridItem}><ServiceCard item={item} pressable grid /></View>)}</View></HomeSection> : null}</>;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <HomeBackdrop />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.accent} />}>
        <View style={styles.brandHeader}><View style={styles.wordmark}><Image source={xiongzaiLogo} style={styles.wordmarkImage} accessibilityLabel="熊崽电竞" /></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="搜索陪玩、服务或玩法" onPress={() => router.push("/search")} style={({ pressed }) => [styles.search, pressed && styles.pressed]}><Text style={styles.searchIcon}>⌕</Text><Text style={styles.searchText}>搜索陪玩 / 服务 / 玩法</Text><View style={styles.searchAction}><Text style={styles.searchActionText}>搜索</Text></View></Pressable>
        <View style={styles.tabs} accessibilityRole="tablist">{tabs.map((tab) => { const selected = activeTab === tab.key; return <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setActiveTab(tab.key)} style={[styles.tab, selected && styles.tabSelected]}><Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text></Pressable>; })}</View>
        {content()}
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{homeBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.backdropBand, { backgroundColor: color }]} />)}</View>; }

function HomeState({ title, message, failed = false, onRetry, children }: { title: string; message: string; failed?: boolean; onRetry?: () => void; children?: ReactNode }) {
  return <View style={[styles.state, failed && styles.stateFailed]}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateMessage}>{message}</Text>{onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>重试</Text></Pressable> : null}{children}</View>;
}

function HomeSection({ title, note, action, onAction, children }: { title: string; note?: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHead}><View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text>{note ? <Text style={styles.sectionNote}>{note}</Text> : null}</View>{action ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text></Pressable> : null}</View>{children}</View>;
}

function SortBar({ options, active, direction, onSelect }: { options: string[]; active: string; direction: SortDirection; onSelect(value: string): void }) {
  return <View style={styles.sortBar}>{options.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => onSelect(item)} style={styles.sortButton}><Text style={[styles.sortText, active === item && styles.sortTextActive]}>{item}{active === item && item !== "综合" ? (direction === "desc" ? " ↓" : " ↑") : ""}</Text></Pressable>)}</View>;
}

const cardShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFAF0" },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  backdropBand: { flex: 1 },
  content: { paddingBottom: 22 },
  brandHeader: { height: 76, justifyContent: "center", paddingHorizontal: 15, paddingTop: 2, paddingBottom: 6 },
  wordmark: { width: 160, height: 73, overflow: "hidden", marginTop: -6, marginBottom: 1 },
  wordmarkImage: { width: 160, height: 120, resizeMode: "contain" },
  search: { height: 46, flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 13, marginBottom: 11, paddingLeft: 12, paddingRight: 5, borderWidth: 2, borderColor: colors.accent, borderRadius: 16, backgroundColor: "#FFFDF8", shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.11, shadowRadius: 16, elevation: 2 },
  searchIcon: { width: 32, color: colors.text, fontSize: 28, lineHeight: 28 },
  searchText: { flex: 1, color: "#85827C", fontSize: 12 },
  searchAction: { width: 58, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.accent },
  searchActionText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  tabs: { width: 244, height: 50, alignSelf: "center", flexDirection: "row", gap: 5, marginBottom: 13, padding: 3, borderRadius: 14, backgroundColor: "#EEE6DA" },
  tab: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  tabSelected: { backgroundColor: "#FFFDF8", ...cardShadow },
  tabLabel: { color: "#716D66", fontSize: 12, fontWeight: "800" },
  tabLabelSelected: { color: colors.accent },
  hero: { position: "relative", height: 184, overflow: "hidden", marginHorizontal: 13, marginBottom: 13, borderRadius: 19, backgroundColor: "#76B9ED", ...cardShadow },
  heroImage: { width: "100%", height: "100%", resizeMode: "cover" },
  heroBadge: { position: "absolute", right: 11, top: 10, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.lime, color: "#17253E", fontSize: 12, fontWeight: "900" },
  section: { marginHorizontal: 12, marginBottom: 11, paddingHorizontal: 12, paddingVertical: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.94)", ...cardShadow },
  sectionHead: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionCopy: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  sectionNote: { flexShrink: 1, color: "#7B7D83", fontSize: 12 },
  sectionAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  sectionActionText: { color: "#767A82", fontSize: 12, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 11 },
  gridItem: { width: "48.4%" },
  list: { gap: 10, marginTop: 11 },
  sortBar: { height: 44, flexDirection: "row", marginHorizontal: 12, marginBottom: 10, padding: 3, borderRadius: 14, backgroundColor: "#EEE6DA" },
  sortButton: { flex: 1, alignItems: "center", justifyContent: "center" },
  sortText: { color: "#716D66", fontSize: 12, fontWeight: "800" },
  sortTextActive: { color: colors.accent },
  state: { minHeight: 149, alignItems: "center", justifyContent: "center", margin: 16, padding: 22, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.94)", ...cardShadow },
  stateFailed: { borderColor: "#F2A18A", backgroundColor: "#FFF7F3" },
  stateTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  stateMessage: { marginTop: 8, color: "#6F7275", fontSize: 13, textAlign: "center" },
  retry: { minHeight: 44, justifyContent: "center", marginTop: 14, paddingHorizontal: 22, borderRadius: 20, backgroundColor: colors.accent },
  retryText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.78 }
});
