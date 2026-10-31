import type { AvailabilityApiView, FavoriteApiView, FavoriteTargetType, ServiceDetailApiView } from "@/types/api";

export type SearchKind = "companions" | "services";
export type SearchSort = "comprehensive" | "rating" | "sales" | "price_asc" | "price_desc";

export interface SearchSnapshot {
  keyword: string;
  kind: SearchKind;
  sort: SearchSort;
  scrollOffset: number;
}

const snapshots = new Map<string, SearchSnapshot>();

export function getSearchSnapshot(key = "discovery"): SearchSnapshot {
  return snapshots.get(key) ?? { keyword: "", kind: "companions", sort: "comprehensive", scrollOffset: 0 };
}

export function saveSearchSnapshot(value: SearchSnapshot, key = "discovery"): void {
  snapshots.set(key, value);
}

export function buildSearchPath(input: { kind: SearchKind; keyword: string; cursor?: string; limit?: number }): string {
  const params = new URLSearchParams();
  params.set("limit", String(input.limit ?? 20));
  if (input.cursor) params.set("cursor", input.cursor);
  const keyword = input.keyword.trim();
  if (keyword) params.set("keyword", keyword);
  return `/${input.kind}?${params.toString()}`;
}

export function buildSortedSearchPath(input: { kind: SearchKind; keyword: string; sort: SearchSort; cursor?: string; limit?: number }): string {
  const path = buildSearchPath(input);
  return `${path}&sort=${encodeURIComponent(input.sort)}`;
}

export function searchQueryKey(kind: SearchKind, keyword: string, sort: SearchSort = "comprehensive"): readonly ["discovery", SearchKind, string, SearchSort] {
  return ["discovery", kind, keyword.trim(), sort];
}

export function flattenUniqueById<T extends { id: string }>(pages: { items: T[] }[]): T[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }));
}

export function isServerSortSupported(sort: SearchSort): boolean {
  return ["comprehensive", "rating", "sales", "price_asc", "price_desc"].includes(sort);
}

export function isServerKeywordSupported(kind: SearchKind): boolean {
  return kind === "services" || kind === "companions";
}

export function sortSupportedForKind(kind: SearchKind, sort: SearchSort): boolean {
  return kind === "companions" ? ["comprehensive", "rating", "sales"].includes(sort) : ["comprehensive", "sales", "price_asc", "price_desc"].includes(sort);
}

export function targetIdOf(favorite: FavoriteApiView): string | null {
  return favorite.target_type === "SELLER" ? favorite.seller_id : favorite.product_id;
}

export function isFavorited(items: FavoriteApiView[] | undefined, type: FavoriteTargetType, id: string): boolean {
  return Boolean(items?.some((item) => item.target_type === type && targetIdOf(item) === id));
}

export type PurchaseBlockCode = "SERVICE_UNAVAILABLE" | "SELLER_PAUSED" | "NO_SKU" | "OWN_SERVICE" | "NO_AVAILABILITY";

export function purchaseBlock(
  service: ServiceDetailApiView,
  slots: AvailabilityApiView[] | undefined,
  viewerId?: string
): PurchaseBlockCode | null {
  if (service.status !== "ON_SALE") return "SERVICE_UNAVAILABLE";
  if (!service.seller.accepting_orders || service.seller.status !== "APPROVED") return "SELLER_PAUSED";
  if (!service.skus.some((sku) => sku.status === "ACTIVE")) return "NO_SKU";
  if (viewerId && service.seller.user_id === viewerId) return "OWN_SERVICE";
  if (service.fulfillment_seconds == null && slots && !slots.some((slot) => slot.status === "OPEN")) return "NO_AVAILABILITY";
  return null;
}

export const purchaseBlockCopy: Record<PurchaseBlockCode, string> = {
  SERVICE_UNAVAILABLE: "服务已下架或仍在审核，暂不可购买",
  SELLER_PAUSED: "陪玩当前暂停接单",
  NO_SKU: "当前没有有效服务规格",
  OWN_SERVICE: "不能购买自己发布的服务",
  NO_AVAILABILITY: "未来 14 天暂无可约时段"
};

export interface PendingIntent {
  kind: "favorite";
  targetType: FavoriteTargetType;
  targetId: string;
  returnTo: string;
}

let pendingIntent: PendingIntent | null = null;
export function setPendingIntent(intent: PendingIntent): void { pendingIntent = intent; }
export function peekPendingIntent(): PendingIntent | null { return pendingIntent; }
export function consumePendingIntent(type: FavoriteTargetType, id: string): PendingIntent | null {
  if (!pendingIntent || pendingIntent.targetType !== type || pendingIntent.targetId !== id) return null;
  const value = pendingIntent;
  pendingIntent = null;
  return value;
}
