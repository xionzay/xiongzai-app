import { useState } from "react";
import { ChevronRightIcon } from "@/components/ui-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { apiClient } from "@/auth/runtime";
import { useAuth } from "@/auth/auth-provider";
import { NativeButton, NativePage, nativeShadow } from "@/components/native-page";
import { FileImage } from "@/components/file-image";
import { StateView } from "@/components/state-view";
import { useFavorites } from "@/features/favorites/favorites-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors } from "@/theme/tokens";
import type { CompanionDetailApiView, FavoriteApiView, ServiceDetailApiView } from "@/types/api";

type FavoriteResolved = { favorite: FavoriteApiView; title: string; subtitle: string; imageFileId: string | null; href: Href };

export function FavoritesScreen() {
  const [tab, setTab] = useState<"SELLER" | "PRODUCT">("SELLER");
  const { status } = useAuth();
  const online = useOnlineStatus();
  const favorites = useFavorites(status === "authenticated");
  const details = useQuery({
    queryKey: ["favorite-details", favorites.items.map((item) => item.id).join(",")],
    enabled: favorites.items.length > 0,
    queryFn: async (): Promise<FavoriteResolved[]> => {
      const settled = await Promise.allSettled(favorites.items.map(async (favorite) => {
        if (favorite.target_type === "SELLER" && favorite.seller_id) {
          const item = await apiClient.publicRequest<CompanionDetailApiView>(`/companions/${favorite.seller_id}`);
          return { favorite, title: item.seller_nickname, subtitle: `陪玩 · ★ ${item.rating_avg}`, imageFileId: item.seller_avatar_file_id ?? item.cover_file_id, href: { pathname: "/companions/[id]", params: { id: item.id } } } satisfies FavoriteResolved;
        }
        if (favorite.product_id) {
          const item = await apiClient.publicRequest<ServiceDetailApiView>(`/services/${favorite.product_id}`);
          return { favorite, title: item.title, subtitle: `服务 · ★ ${item.rating_avg}`, imageFileId: item.cover_file_id, href: { pathname: "/services/[id]", params: { id: item.id } } } satisfies FavoriteResolved;
        }
        throw new Error("收藏目标缺失");
      }));
      return settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    }
  });

  const refresh = () => {
    void favorites.refetch();
    void details.refetch();
  };
  const pending = favorites.isPending || (favorites.items.length > 0 && details.isPending);
  const failed = favorites.isError || details.isError;
  const unavailableCount = favorites.items.length - (details.data?.length ?? 0);
  const visible = details.data?.filter((item) => item.favorite.target_type === tab) ?? [];
  const sellerCount = details.data?.filter((item) => item.favorite.target_type === "SELLER").length ?? 0;
  const serviceCount = details.data?.filter((item) => item.favorite.target_type === "PRODUCT").length ?? 0;

  if (status !== "authenticated") {
    return (
      <NativePage title="我的收藏" subtitle="陪玩和服务分别收藏" contentStyle={styles.content}>
        <View style={styles.stateCard}><StateView kind="error" title="登录后查看收藏" message="收藏属于账号数据，请先登录" onRetry={() => router.replace({ pathname: "/(auth)/login", params: { returnTo: "/favorites" } })} /></View>
      </NativePage>
    );
  }

  return (
    <NativePage
      title="我的收藏"
      subtitle="陪玩和服务分别收藏"
      contentStyle={styles.content}
      refreshing={favorites.isRefetching || details.isRefetching}
      onRefresh={refresh}
    >
      <View style={styles.tabs}>
        <FavoriteTab label={`收藏的陪玩 ${sellerCount}`} selected={tab === "SELLER"} onPress={() => setTab("SELLER")} />
        <FavoriteTab label={`收藏的服务 ${serviceCount}`} selected={tab === "PRODUCT"} onPress={() => setTab("PRODUCT")} />
      </View>

      {!online ? <View style={styles.stateCard}><StateView kind="offline" onRetry={() => void favorites.refetch()} /></View> : null}
      {online && pending ? <View style={styles.stateCard}><StateView kind="loading" /></View> : null}
      {online && failed ? <View style={styles.stateCard}><StateView kind="error" onRetry={refresh} /></View> : null}

      {online && !pending && !failed ? (
        <>
          {unavailableCount > 0 ? (
            <View style={styles.warning}><Text style={styles.warningText}>{unavailableCount} 个收藏目标已下架、删除或无权访问，未展示失效业务内容。</Text></View>
          ) : null}
          {!visible.length ? (
            <View style={styles.stateCard}><StateView kind="empty" title={`还没有收藏的${tab === "SELLER" ? "陪玩" : "服务"}`} message="收藏后会显示在这里" /></View>
          ) : (
            <View style={styles.list}>
              {visible.map((item) => (
                <Pressable key={item.favorite.id} accessibilityRole="button" accessibilityLabel={`${item.title}，${item.subtitle}`} onPress={() => router.push(item.href)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                  <FileImage fileId={item.imageFileId} resizeMode="cover" style={styles.image} label={`${item.title}图片`} />
                  <View style={styles.itemCopy}><Text style={styles.title}>{item.title}</Text><Text style={styles.subtitle}>{item.subtitle}</Text></View>
                  <ChevronRightIcon size={20} />
                </Pressable>
              ))}
            </View>
          )}
          {favorites.hasNextPage ? <NativeButton label={favorites.isFetchingNextPage ? "加载中…" : "加载更多收藏"} tone="secondary" disabled={favorites.isFetchingNextPage} onPress={() => void favorites.fetchNextPage()} /> : null}
        </>
      ) : null}
    </NativePage>
  );
}

function FavoriteTab({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.tab, selected && styles.tabActive, pressed && styles.pressed]}>
      <Text style={[styles.tabText, selected && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  tabs: { flexDirection: "row", gap: 6, padding: 5, borderWidth: 1, borderColor: "rgba(62,57,47,0.08)", borderRadius: 999, backgroundColor: "rgba(255,253,248,0.84)" },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  tabActive: { backgroundColor: colors.brand },
  tabText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  tabTextActive: { color: colors.white },
  list: { overflow: "hidden", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  item: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  image: { width: 52, height: 52, borderRadius: 15, backgroundColor: "#DCEEFF" },
  itemCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  subtitle: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  arrow: { color: colors.textSecondary, fontSize: 26 },
  stateCard: { minHeight: 220, justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  warning: { padding: 13, borderWidth: 1, borderColor: "rgba(229,72,77,0.20)", borderRadius: 14, backgroundColor: "rgba(255,240,232,0.96)" },
  warningText: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.72 }
});
