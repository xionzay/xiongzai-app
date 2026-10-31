import { JellyIcon } from "../../components/jelly-icon";
import { useEffect } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { consumePendingIntent, setPendingIntent } from "@/features/discovery/discovery-domain";
import { useFavoriteMutation, useFavoriteStatus } from "@/features/favorites/favorites-api";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { FavoriteTargetType } from "@/types/api";
import { useToast } from "@/components/toast-provider";
import { FavoriteActionIcon } from "@/components/tab-icons";
import { ApprovedIllustration } from '@/components/approved-illustration';

export function FavoriteButton({ type, id, returnTo, onError, appearance = "default" }: { type: FavoriteTargetType; id: string; returnTo: string; onError?(message: string): void; appearance?: "default" | "companion-action" | "service-action" | "storefront" }) {
  const { status } = useAuth();
  const favoriteStatus = useFavoriteStatus(type, id, status === "authenticated");
  const mutation = useFavoriteMutation(type, id);
  const { showToast } = useToast();
  const active = favoriteStatus.data?.favorited ?? false;

  const toggle = () => {
    if (status !== "authenticated") {
      setPendingIntent({ kind: "favorite", targetType: type, targetId: id, returnTo });
      router.push({ pathname: "/(auth)/required", params: { returnTo, action: "收藏" } });
      return;
    }
    if (!mutation.isPending) mutation.mutate(active, { onSuccess: () => showToast(active ? "已取消收藏" : "已加入收藏", "success"), onError: (error) => { const message = userFacingError(error); showToast(message, "danger"); onError?.(message); } });
  };

  useEffect(() => {
    if (status !== "authenticated" || mutation.isPending || !consumePendingIntent(type, id)) return;
    mutation.mutate(false, { onSuccess: () => showToast("已加入收藏", "success"), onError: (error) => { const message = userFacingError(error); showToast(message, "danger"); onError?.(message); } });
  }, [id, mutation, onError, showToast, status, type]);

  if (appearance === 'storefront') return <Pressable accessibilityRole="button" accessibilityLabel={active ? '取消收藏店铺' : '收藏店铺'} accessibilityState={{ selected: active, busy: mutation.isPending, disabled: mutation.isPending }} disabled={mutation.isPending} onPress={toggle} style={styles.storefront}><Text style={styles.storefrontLabel}>{active ? '已收藏' : '收藏'}</Text></Pressable>;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={active ? "取消收藏" : "收藏"} accessibilityState={{ selected: active, busy: mutation.isPending }} disabled={mutation.isPending} onPress={toggle} style={[styles.button, appearance === "companion-action" && styles.companionAction, appearance === "service-action" && styles.serviceAction, active && appearance === "default" && styles.active]}>
      {appearance === "companion-action" ? <><FavoriteActionIcon selected={active} size={34} /><Text style={styles.companionLabel}>收藏陪玩</Text></> : appearance === "service-action" ? <><ApprovedIllustration kind="favorite" size={25} /><Text style={[styles.serviceLabel, active && styles.activeLabel]}>{active ? '已收藏' : '收藏'}</Text></> : <Text style={[styles.label, active && styles.activeLabel]}><JellyIcon kind={active ? "heartFilled" : "heartOutline"} />{active ? " 已收藏" : " 收藏"}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  storefront: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, backgroundColor: 'rgba(161,213,248,.24)', justifyContent: 'center' },
  storefrontLabel: { fontSize: 14, color: '#173D59' },
  button: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.brand, borderRadius: radii.pill, backgroundColor: colors.surfaceCard },
  active: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  label: { ...typography.caption, color: colors.brand, fontWeight: "900" },
  activeLabel: { color: colors.accent },
  companionAction: { flex: 1, minHeight: 49, flexDirection: "row", gap: 9, borderWidth: 0, borderRadius: 0, paddingHorizontal: 10, backgroundColor: "transparent" },
  companionLabel: { minHeight: 34, color: "#FF5A1F", fontSize: 13, lineHeight: 34, fontWeight: "900" },
  serviceAction: { width: 44, minHeight: 52, flexDirection: "column", gap: 4, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, backgroundColor: "transparent" },
  serviceLabel: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 }
});
