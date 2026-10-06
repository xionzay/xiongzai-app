import { PRODUCT_GAMES } from "./product-decisions";

export type HomeShopInfo = {
  id: string | number;
  name: string;
  image: string;
  avatarFileId?: string | null;
  introduction?: string | null;
  tags: readonly string[];
  mainGames?: readonly string[];
  rating?: string;
  reviewCount?: number | null;
  completed?: number | null;
  publicProductCount?: number;
};

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function homeShopFacts(shop: HomeShopInfo) {
  const introduction = shop.introduction?.trim() || "暂未填写介绍";
  // Only explicit public fields/tags are eligible. Introduction text never supplies game data.
  const games = [...new Set((shop.mainGames ?? shop.tags).filter(game => PRODUCT_GAMES.some(allowed => allowed === game)))];
  // Keep the seller's introduction intact; don't repeat games already visible in that text.
  const gameLabels = games.filter(game => !introduction.includes(game));
  const rating = Number(shop.rating);
  const hasRating = isCount(shop.reviewCount) && shop.reviewCount > 0 && Number.isFinite(rating) && rating > 0 && rating <= 5;
  return {
    introduction,
    games,
    gameLabels,
    ratingText: shop.reviewCount === 0 ? "暂无评价" : hasRating ? `${rating.toFixed(1)} 分` : "评价暂不可用",
    ratingDescription: hasRating ? `${shop.reviewCount} 条评价` : undefined,
    hasRating,
    productText: isCount(shop.publicProductCount) ? `${shop.publicProductCount} 件商品` : undefined,
    completedText: isCount(shop.completed) ? `已完成 ${shop.completed} 单` : undefined,
  };
}

// A partial catalog can't establish either zero or the seller's total product count.
export function completePublicProductCounts(products: readonly { sellerId: string | number }[], nextCursor: string | null | undefined) {
  if (nextCursor !== null) return null;
  const counts = new Map<string, number>();
  for (const product of products) {
    const id = String(product.sellerId);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function homeShopRecommendation<T>(shops: readonly T[], hasNextPage: boolean) {
  return { items: shops.slice(0, 6), hasMore: shops.length > 6 || hasNextPage };
}

export function mergeHomeShopPages<T extends { id: string | number }>(current: readonly T[], incoming: readonly T[]): T[] {
  const rows = new Map(current.map(shop => [String(shop.id), shop]));
  incoming.forEach(shop => rows.set(String(shop.id), shop));
  return [...rows.values()];
}
