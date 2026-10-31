import { productGames, productGameLabels, type ProductGame } from "@xiongzai/contracts/commerce";
import type { CompanionApiView, CursorPage } from "../../types/api";

export type CatalogKind = "companions" | "services";
export type CatalogSort = "comprehensive" | "rating" | "sales" | "price_asc" | "price_desc";
export function catalogPath(kind: CatalogKind, sort: CatalogSort, game: ProductGame | "ALL", cursor = "") {
  const params = new URLSearchParams({ limit: "20", sort });
  if (cursor) params.set("cursor", cursor);
  if (kind === "services" && game !== "ALL") params.set("game", game);
  return `/${kind}?${params}`;
}
export function catalogItems<T extends { id: string }>(pages: CursorPage<T>[] = []): T[] {
  const ids = new Set<string>();
  return pages.flatMap(page => page.items.filter(item => {
    if (ids.has(item.id)) return false;
    ids.add(item.id); return true;
  }));
}
export function shopFacts(item: CompanionApiView) {
  const games = (item.main_games ?? []).filter(game => productGames.includes(game));
  return {
    games: games.map(game => productGameLabels[game]),
    rating: item.review_count > 0 ? `${item.rating_avg} 分` : "暂无评价",
    introduction: item.introduction?.trim() || "暂未填写介绍",
    productCount: item.public_product_count == null ? null : `${item.public_product_count} 件商品`,
    completed: `已完成 ${item.completed_order_count} 单`
  };
}
export function offersCompanion(item: CompanionApiView, game: ProductGame) {
  const introduction = item.introduction ?? "";
  return /陪玩/u.test(introduction) && !/不提供陪玩|不接陪玩|不做陪玩|没有陪玩/u.test(introduction)
    && (item.main_games ?? []).includes(game);
}
