import type { SellerBusinessPeriod } from "@xiongzai/contracts";

// Fixed business timezone; never use the process/device timezone for day boundaries.
export function sellerBusinessPeriod(period: SellerBusinessPeriod, now: Date) {
  const offset = 8 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  let start = Date.UTC(y, m, d) - offset;
  let end = now.getTime();
  if (period === "ALL") return { start: null, end: now };
  if (period === "YESTERDAY") { end = start; start -= 86_400_000; }
  if (period === "WEEK") start -= ((local.getUTCDay() + 6) % 7) * 86_400_000;
  if (period === "MONTH") start = Date.UTC(y, m, 1) - offset;
  if (period === "YEAR") start = Date.UTC(y, 0, 1) - offset;
  return { start: new Date(start), end: new Date(end) };
}
