export const merchantPeriods = ["今日", "昨日", "本周", "本月", "本年", "累计"] as const;
export type MerchantPeriod = typeof merchantPeriods[number];
type MerchantOrder = { created_at: string; paid_amount_cent: string; refunded_amount_cent?: string; payment_status: string };
const offset = 8 * 60 * 60 * 1000;
/** Calendar periods in the merchant's China timezone; week starts on Monday. */
export function merchantPeriodBounds(period: MerchantPeriod, now = new Date()): [number, number] {
  const local = new Date(now.getTime() + offset);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let start = midnight;
  let end = now.getTime();
  if (period === "昨日") { start -= 86400000; end = midnight - offset; }
  if (period === "本周") start -= ((local.getUTCDay() + 6) % 7) * 86400000;
  if (period === "本月") start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  if (period === "本年") start = Date.UTC(local.getUTCFullYear(), 0, 1);
  return [period === "累计" ? -Infinity : start - offset, end];
}
/** Creation-time cohort, gross paid turnover. Refunds are shown separately, not silently deducted. */
export function merchantMetrics(orders: MerchantOrder[], period: MerchantPeriod, now = new Date()) {
  const [start, end] = merchantPeriodBounds(period, now);
  const rows = orders.filter(order => { const time = Date.parse(order.created_at); return time >= start && time < end; });
  const paid = rows.filter(order => ["PAID", "REFUNDING", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.payment_status));
  return { orderCount: rows.length, paidCount: paid.length,
    turnoverCent: paid.reduce((sum, order) => sum + BigInt(order.paid_amount_cent || "0"), 0n).toString(),
    refundCent: paid.reduce((sum, order) => sum + BigInt(order.refunded_amount_cent || "0"), 0n).toString() };
}
