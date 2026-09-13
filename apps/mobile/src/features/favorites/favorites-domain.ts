import type { FavoriteApiView, FavoriteTargetType } from "@/types/api";

export function optimisticFavorites(current: FavoriteApiView[], type: FavoriteTargetType, id: string, favorited: boolean): FavoriteApiView[] {
  if (favorited) return current.filter((item) => (type === "SELLER" ? item.seller_id : item.product_id) !== id);
  return [{ id: `optimistic-${type}-${id}`, target_type: type, seller_id: type === "SELLER" ? id : null, product_id: type === "PRODUCT" ? id : null, created_at: new Date(0).toISOString() }, ...current];
}
