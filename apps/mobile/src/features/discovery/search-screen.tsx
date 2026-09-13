import { useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { ListSkeleton } from "@/components/list-skeleton";
import { NativeBackdrop, NativeHeader, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { CompanionCard, ServiceCard } from "@/features/home/catalog-card";
import { useDiscoverySearch } from "@/features/discovery/discovery-api";
import { flattenUniqueById, getSearchSnapshot, saveSearchSnapshot, sortSupportedForKind, type SearchKind, type SearchSort } from "@/features/discovery/discovery-domain";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import type { CompanionApiView, ServiceApiView } from "@/types/api";

const companionSorts: { value: SearchSort; label: string }[] = [
  { value: "comprehensive", label: "综合" },
  { value: "rating", label: "好评" },
  { value: "sales", label: "销量" }
];
const serviceSorts: { value: SearchSort; label: string }[] = [
  { value: "comprehensive", label: "综合" },
  { value: "sales", label: "销量" },
  { value: "price_asc", label: "价格低" },
  { value: "price_desc", label: "价格高" }
];

const searchKeywordDictionary = [
  "和平精英", "经典四排", "经典模式", "地铁逃生", "排位上分", "技术上分", "娱乐陪玩", "地铁护航",
  "稳定沟通", "耐心教学", "单排", "双排", "四排", "上分", "带飞", "护航", "开黑", "陪练", "教学",
  "报点", "沟通", "娱乐", "声音", "萝莉音", "御姐音", "青受音"
];

function shortSearchKeywords(values: string[]) {
  const keywords: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    const compact = candidate.normalize("NFKC").replace(/\s+/gu, "").replace(/^[，。！？、｜|·:：;；“”"'《》【】()[\]{}_-]+|[，。！？、｜|·:：;；“”"'《》【】()[\]{}_-]+$/gu, "");
    const length = Array.from(compact).length;
    if (length < 2 || length > 4 || !/^[\u3400-\u9fff]+$/u.test(compact) || seen.has(compact)) return;
    if (keywords.some((item) => item.includes(compact))) return;
    seen.add(compact);
    keywords.push(compact);
  };
  for (const value of values) {
    if (!value) continue;
    add(value);
    const compact = value.normalize("NFKC").replace(/\s+/gu, "");
    for (const term of searchKeywordDictionary) if (compact.includes(term)) add(term);
  }
  return keywords.slice(0, 6);
}

export function SearchScreen() {
  const [restored] = useState(getSearchSnapshot);
  const snapshot = useRef(restored);
  const listRef = useRef<FlatList<string>>(null);
  const didRestoreScroll = useRef(false);
  const [keyword, setKeyword] = useState(restored.keyword);
  const [kind, setKind] = useState<SearchKind>(restored.kind);
  const [sort, setSort] = useState<SearchSort>(restored.sort);
  const [submitted, setSubmitted] = useState(restored.keyword);
  const [scopeOpen, setScopeOpen] = useState(false);
  const { status } = useAuth();
  const online = useOnlineStatus();
  const query = useDiscoverySearch(kind, submitted, sort, status !== "booting" && sortSupportedForKind(kind, sort));
  const items = useMemo(() => flattenUniqueById(query.data?.pages ?? []), [query.data]);
  const hotKeywords = useMemo(() => shortSearchKeywords(kind === "companions"
    ? (items as CompanionApiView[]).flatMap((item) => [item.seller_nickname, item.preferred_mode ?? "", item.play_style ?? ""])
    : (items as ServiceApiView[]).flatMap((item) => [item.title, item.description, item.service_time_description ?? ""])), [items, kind]);
  const persist = (next: Partial<{ keyword: string; kind: SearchKind; sort: SearchSort; scrollOffset: number }>) => {
    snapshot.current = { ...snapshot.current, keyword, kind, sort, ...next };
    saveSearchSnapshot(snapshot.current);
  };
  const searchFor = (value: string) => {
    const next = value.trim();
    setKeyword(next);
    setSubmitted(next);
    persist({ keyword: next });
  };
  const submit = () => searchFor(keyword);
  const chooseKind = (value: SearchKind) => {
    const nextSort = sortSupportedForKind(value, sort) ? sort : "comprehensive";
    setKind(value);
    setSort(nextSort);
    setScopeOpen(false);
    persist({ kind: value, sort: nextSort });
  };

  const header = (
    <View style={styles.headerContent}>
      <NativeHeader title="搜索" subtitle="先选择陪玩或服务，再输入关键词" />
      <View style={styles.searchRow}>
        <View style={styles.scopeSelect}>
          <Pressable accessibilityRole="button" accessibilityLabel={`搜索范围：${kind === "companions" ? "陪玩" : "服务"}`} accessibilityState={{ expanded: scopeOpen }} onPress={() => setScopeOpen((value) => !value)} style={({ pressed }) => [styles.scopeCurrent, pressed && styles.pressed]}>
            <Text style={styles.scopeCurrentText}>{kind === "companions" ? "陪玩" : "服务"}</Text>
            <View style={[styles.scopeArrow, scopeOpen && styles.scopeArrowOpen]} />
          </Pressable>
          {scopeOpen ? <View accessibilityRole="menu" style={styles.scopeMenu}>
            <ScopeOption label="陪玩" selected={kind === "companions"} onPress={() => chooseKind("companions")} />
            <ScopeOption label="服务" selected={kind === "services"} onPress={() => chooseKind("services")} />
          </View> : null}
        </View>
        <TextInput
          value={keyword}
          onChangeText={(value) => { setKeyword(value); persist({ keyword: value }); }}
          onSubmitEditing={submit}
          placeholder={kind === "companions" ? "搜索陪玩昵称或ID" : "搜索服务名称或关键词"}
          placeholderTextColor="#8E8E8E"
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel={kind === "companions" ? "搜索陪玩关键词" : "搜索服务关键词"}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="搜索" disabled={!keyword.trim()} onPress={submit} style={({ pressed }) => [styles.searchButton, !keyword.trim() && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.searchLabel}>搜索</Text>
        </Pressable>
      </View>
      <View style={styles.hotCard}>
        <Text style={styles.hotTitle}>当前可搜索关键词</Text>
        {hotKeywords.length ? <View style={styles.hotGrid}>{hotKeywords.map((item, index) => <Pressable accessibilityRole="button" key={item} onPress={() => searchFor(item)} style={({ pressed }) => [styles.hotButton, pressed && styles.pressed]}><Text style={styles.hotIndex}>{index + 1}</Text><Text style={styles.hotText} numberOfLines={1}>{item}</Text></Pressable>)}</View> : <Text style={styles.hotEmpty}>暂无合适的短关键词，可直接输入搜索</Text>}
      </View>
      {submitted ? <View style={styles.sorts}>
        {(kind === "companions" ? companionSorts : serviceSorts).map((item) => (
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: sort === item.value }} key={item.value} onPress={() => { setSort(item.value); persist({ sort: item.value }); }} style={({ pressed }) => [styles.sortButton, sort === item.value && styles.sortActive, pressed && styles.pressed]}>
            <Text style={[styles.sortText, sort === item.value && styles.sortTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View> : null}
    </View>
  );

  const resultSection = (
    <View style={styles.recommendSection}>
      <View style={styles.resultHeading}>
        <Text style={styles.resultTitle}>{submitted ? `“${submitted}” 的相关${kind === "companions" ? "陪玩" : "服务"}` : "高评价内容"}</Text>
        <Text style={styles.resultNote}>{kind === "companions" ? "已通过审核的陪玩" : "已上架的服务"}</Text>
      </View>
      {items.length ? kind === "companions"
        ? <View style={styles.companionList}>{(items as CompanionApiView[]).map((item) => <CompanionCard key={item.id} item={item} pressable wide actionLabel="看主页 ›" />)}</View>
        : <View style={styles.serviceGrid}>{(items as ServiceApiView[]).map((item) => <View key={item.id} style={styles.serviceGridItem}><ServiceCard item={item} pressable grid /></View>)}</View>
        : <View style={styles.embeddedState}><StateView kind="empty" title="没有找到结果" message="换一个搜索词试试" /></View>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <NativeBackdrop />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      {!online ? (
        <View style={styles.flex}>{header}<View style={styles.stateCard}><StateView kind="offline" onRetry={() => void query.refetch()} /></View></View>
      ) : query.isPending && query.fetchStatus !== "idle" ? (
        <View style={styles.flex}>{header}<View style={styles.loadingCard}><ListSkeleton /></View></View>
      ) : query.isError ? (
        <View style={styles.flex}>{header}<View style={styles.stateCard}><StateView kind="error" onRetry={() => void query.refetch()} /></View></View>
      ) : (
        <FlatList
          ref={listRef}
          data={[`${kind}:${submitted}:${items.length}`]}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          renderItem={() => resultSection}
          ListFooterComponent={query.isFetchingNextPage ? <StateView kind="loading" /> : null}
          onEndReached={() => { if (submitted && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          onScroll={(event) => persist({ scrollOffset: event.nativeEvent.contentOffset.y })}
          scrollEventThrottle={150}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          onContentSizeChange={() => {
            if (didRestoreScroll.current || restored.scrollOffset <= 0) return;
            didRestoreScroll.current = true;
            listRef.current?.scrollToOffset({ offset: restored.scrollOffset, animated: false });
          }}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.brand} />}
        />
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ScopeOption({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="menuitem" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.scopeOption, selected && styles.scopeOptionActive, pressed && styles.pressed]}>
      <Text style={[styles.scopeOptionText, selected && styles.scopeOptionTextActive]}>{label}</Text><Text style={styles.scopeCheck}>{selected ? "✓" : ""}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DEF0FF" },
  keyboard: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: 12 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  headerContent: { zIndex: 2 },
  searchRow: { zIndex: 20, height: 48, flexDirection: "row", gap: 6, marginBottom: 12 },
  scopeSelect: { zIndex: 30, position: "relative", width: 70, height: 48 },
  scopeCurrent: { position: "relative", width: 70, height: 48, justifyContent: "center", paddingLeft: 9, paddingRight: 22, borderWidth: 1, borderColor: "#D6D6D6", borderTopLeftRadius: 13, borderBottomLeftRadius: 13, backgroundColor: "#F3F3F3" },
  scopeCurrentText: { color: "#272727", fontSize: 13, lineHeight: 18, fontWeight: "900" },
  scopeArrow: { position: "absolute", right: 9, top: 18, width: 7, height: 7, borderRightWidth: 2, borderBottomWidth: 2, borderColor: "#626262", transform: [{ rotate: "45deg" }] },
  scopeArrowOpen: { top: 21, transform: [{ rotate: "225deg" }] },
  scopeMenu: { position: "absolute", zIndex: 50, left: 0, top: 55, width: 96, overflow: "hidden", padding: 5, borderWidth: 1, borderColor: "#E0DCD5", borderRadius: 14, backgroundColor: "#FFFFFF", ...nativeShadow },
  scopeOption: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 11, borderRadius: 10, backgroundColor: "transparent" },
  scopeOptionActive: { backgroundColor: "#FFF0E9" },
  scopeOptionText: { color: "#333333", fontSize: 14, lineHeight: 19, fontWeight: "800" },
  scopeOptionTextActive: { color: colors.accent },
  scopeCheck: { color: colors.accent, fontSize: 13, fontWeight: "900" },
  input: { zIndex: 10, flex: 1, height: 48, marginLeft: -7, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderTopRightRadius: 13, borderBottomRightRadius: 13, color: colors.text, backgroundColor: "#FFFFFF", fontSize: 13, ...nativeShadow },
  searchButton: { width: 54, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent },
  searchLabel: { color: colors.white, fontSize: 14, fontWeight: "900" },
  hotCard: { marginBottom: 10, padding: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  hotTitle: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "900" },
  hotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 12 },
  hotButton: { width: "48.5%", minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, backgroundColor: "#F6F1E9" },
  hotIndex: { width: 23, height: 23, overflow: "hidden", borderRadius: 7, backgroundColor: "#FFE3D5", color: colors.accent, fontSize: 10, lineHeight: 23, fontWeight: "900", textAlign: "center" },
  hotText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: "700" },
  hotEmpty: { marginTop: 12, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  recommendSection: { marginBottom: 11, paddingHorizontal: 12, paddingVertical: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.94)", ...nativeShadow },
  resultHeading: { minHeight: 23, flexDirection: "row", alignItems: "baseline", gap: 8 },
  resultTitle: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "900" },
  resultNote: { flexShrink: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  companionList: { gap: 10, marginTop: 8 },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 11 },
  serviceGridItem: { width: "48.4%" },
  embeddedState: { minHeight: 150, justifyContent: "center" },
  sorts: { flexDirection: "row", gap: 7, marginBottom: 10 },
  sortButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 999, backgroundColor: "rgba(255,253,248,0.90)" },
  sortActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  sortText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  sortTextActive: { color: colors.white },
  stateCard: { minHeight: 220, justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  loadingCard: { flex: 1, marginTop: 12 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 }
});
