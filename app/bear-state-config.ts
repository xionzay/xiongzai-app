// All state clips loop on request. Visibility, reduced motion and failure fallback still apply.
export const bearClips = {
  "01-loading": { durationMs: 3000, loop: true },
  "02-error": { durationMs: 2500, loop: true },
  "03-success": { durationMs: 2500, loop: true },
  "04-empty": { durationMs: 3000, loop: true },
  "05-offline": { durationMs: 2500, loop: true },
  "06-waiting": { durationMs: 4000, loop: true },
  "07-welcome": { durationMs: 3000, loop: true },
  "08-encourage": { durationMs: 2500, loop: true },
  "09-neutral": { durationMs: 2500, loop: true },
  "10-confirm-calm": { durationMs: 2500, loop: true },
} as const;
export type BearStateId = keyof typeof bearClips;
export type BearVisual = { id: BearStateId; size: number; mode?: "auto" | "static" };
export const bearScenes = {
  loading: { id: "01-loading", size: 160 },
  error: { id: "02-error", size: 160 },
  offline: { id: "05-offline", size: 160 },
  empty: { id: "04-empty", size: 160 },
  search: { id: "04-empty", size: 176 },
  orders: { id: "04-empty", size: 176 },
  sellerOrders: { id: "04-empty", size: 176 },
  messages: { id: "04-empty", size: 160 },
  favorites: { id: "04-empty", size: 176 },
  income: { id: "04-empty", size: 128 },
  withdrawals: { id: "04-empty", size: 160 },
  services: { id: "04-empty", size: 96 },
  reviews: { id: "04-empty", size: 96 },
  supportEmpty: { id: "04-empty", size: 96 },
  supportWaiting: { id: "06-waiting", size: 96 },
  paymentProcessing: { id: "06-waiting", size: 176 },
  paymentTimeout: { id: "06-waiting", size: 176 },
  paymentResult: { id: "03-success", size: 176 },
  paymentFailure: { id: "02-error", size: 176 },
  paymentCancelled: { id: "09-neutral", size: 160 },
  paymentClosed: { id: "09-neutral", size: 160 },
  sellerApplyReview: { id: "06-waiting", size: 128 },
  sellerApplySupplement: { id: "09-neutral", size: 128 },
  sellerApplyRejected: { id: "02-error", size: 128 },
  sellerApplyStatus: { id: "03-success", size: 160 },
  sellerApplySuspended: { id: "09-neutral", size: 128 },
  authGuard: { id: "09-neutral", size: 128 },
  restricted: { id: "09-neutral", size: 128 },
  permissionCenter: { id: "09-neutral", size: 96 },
  serviceUnavailable: { id: "09-neutral", size: 96 },
  financePending: { id: "06-waiting", size: 96 },
  financeNeutral: { id: "09-neutral", size: 96 },
  financeCompleted: { id: "10-confirm-calm", size: 128 },
} as const satisfies Record<string, BearVisual>;
export type BearScene = keyof typeof bearScenes;

// Raw service status wins over a design-catalog key. Unknown never means completed.
export function financeBearScene(kind: "refund" | "withdrawal", status: string): BearScene | null {
  if (status === (kind === "refund" ? "REFUNDED" : "COMPLETED")) return "financeCompleted";
  const pending = kind === "refund"
    ? ["REQUESTED", "SELLER_APPROVED", "NEGOTIATING", "PLATFORM_REVIEW", "REFUND_PROCESSING"]
    : ["CREATED", "RISK_REVIEW", "APPROVED", "PAYOUT_PROCESSING"];
  const neutral = kind === "refund" ? ["SELLER_REJECTED", "REJECTED", "CANCELLED"] : ["FAILED", "REJECTED", "CLOSED"];
  return pending.includes(status) ? "financePending" : neutral.includes(status) ? "financeNeutral" : null;
}
