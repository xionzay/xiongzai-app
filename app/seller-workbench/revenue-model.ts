import { merchantPeriodBounds, type MerchantPeriod } from '../merchant-model';

export type RevenueRow = { id: string; order_id: string; order_no?: string; buyer_id?: string | null; order_amount_cent?: string; platform_fee_cent?: string; service_title?: string; created_at: string; seller_amount_cent: string; reversed_amount_cent: string };
export type RevenueRange = MerchantPeriod | '自定义';
const day = 86_400_000;
export const chinaDate = (time: number) => new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
export function revenueBounds(range: RevenueRange, start: string, end: string, now: Date): [number, number] | null {
  if (range !== '自定义') return merchantPeriodBounds(range, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const from = Date.parse(`${start}T00:00:00+08:00`), until = Date.parse(`${end}T00:00:00+08:00`) + day;
  if (!Number.isFinite(from) || !Number.isFinite(until) || chinaDate(from) !== start || chinaDate(until - day) !== end || start > end || end > chinaDate(now.getTime())) return null;
  return [from, Math.min(until, now.getTime())];
}
export function revenueMoney(value: bigint) {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${(abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(abs % 100n).toString().padStart(2, '0')}`;
}
export function revenueMetrics(rows: RevenueRow[], bounds: [number, number] | null) {
  const selected = bounds ? rows.filter(r => { const at = Date.parse(r.created_at); return at >= bounds[0] && at < bounds[1]; }) : [];
  selected.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const net = selected.reduce((sum, row) => sum + BigInt(row.seller_amount_cent) - BigInt(row.reversed_amount_cent), 0n);
  const orders = new Set(selected.map(row => row.order_id)).size;
  const reversed = selected.reduce((sum, row) => sum + BigInt(row.reversed_amount_cent), 0n);
  // Never substitute order counts for missing buyer IDs, or estimate fees from a rate.
  const buyers = selected.every(row => row.buyer_id?.trim()) ? new Set(selected.map(row => row.buyer_id)).size : null;
  const amount = (field: 'order_amount_cent' | 'platform_fee_cent') => selected.every(row => /^\d+$/.test(row[field] ?? ''))
    ? selected.reduce((sum, row) => sum + BigInt(row[field]!), 0n) : null;
  const gross = amount('order_amount_cent'), fees = amount('platform_fee_cent');
  const summary = { selected, net, orders, reversed, buyers, gross, fees, average: orders ? net / BigInt(orders) : 0n };
  if (!bounds || !selected.length) return { ...summary, buckets: [] as { key: string; value: bigint }[] };
  const from = Number.isFinite(bounds[0]) ? bounds[0] : Date.parse(selected.at(-1)!.created_at);
  const monthly = bounds[1] - from > 62 * day;
  const values = new Map<string, bigint>();
  // Calendar labels include zero-income intervals, never fabricated growth.
  if (monthly) {
    const first = chinaDate(from).slice(0, 7), last = chinaDate(bounds[1] - 1).slice(0, 7);
    let year = Number(first.slice(0, 4)), month = Number(first.slice(5, 7));
    while (`${year}-${String(month).padStart(2, '0')}` <= last) { values.set(`${year}-${String(month).padStart(2, '0')}`, 0n); if (++month === 13) { month = 1; year++; } }
  } else {
    const first = Date.parse(`${chinaDate(from)}T00:00:00+08:00`);
    for (let at = first; at < bounds[1]; at += day) values.set(chinaDate(at), 0n);
  }
  for (const row of selected) { const key = chinaDate(Date.parse(row.created_at)).slice(0, monthly ? 7 : 10); values.set(key, (values.get(key) ?? 0n) + BigInt(row.seller_amount_cent) - BigInt(row.reversed_amount_cent)); }
  return { ...summary, buckets: [...values].map(([key, value]) => ({ key, value })) };
}
