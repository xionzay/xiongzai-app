/** Reserve the actual gesture inset and let scaled labels grow above it. */
export function tabBarMetrics(kind: "buyer" | "seller", fontScale: number, bottomInset: number) {
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const inset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  const seller = kind === "seller";
  const itemHeight = (seller ? 67 : 68) + Math.ceil((seller ? 17 : 18) * (scale - 1));
  const paddingBottom = Math.max(seller ? 5 : 8, inset);
  return { itemHeight, paddingBottom, height: (seller ? 5 : 4) + itemHeight + paddingBottom };
}
