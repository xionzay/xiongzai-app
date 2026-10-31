/** Snapshot of the approved Web design, 2026-10-25. Native units, not screenshot pixels. */
export const approvedLayout = {
  gutter: 14, headerHeight: 52, titleSize: 20, iconSize: 32,
  divider: "rgba(83,107,135,0.16)", chatBubble: "#D8ECFF", chatInk: "#17213A"
} as const;

/** A sparse catalogue must retain four-column sizing, never stretch one item across the page. */
export function hotItemWidth(viewport: number) { return Math.max(0, (viewport - 24 - 3 * 8) / 4); }
export function orderEntryWidth(viewport: number, fontScale = 1) {
  return Math.max(48, (viewport - 28) / (fontScale > 1.3 ? 4 : 5));
}
