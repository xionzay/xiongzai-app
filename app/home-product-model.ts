/** Listing facts only: never infer billing units from duration or description. */
export type HomeProductSource = {
  priceCent: string;
  sold?: number;
  minimumPriceOnly?: boolean;
  specSummary?: string | null;
  priceUnit?: string | null;
  specs?: Array<{ name: string; priceCent: string | number; status?: string; unit?: string | null }>;
};

function cent(value: unknown): bigint | undefined {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return;
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const text = String(value);
  if (/^\d+$/.test(text)) return BigInt(text);
}
export function homeProductFacts(product: HomeProductSource, preview = false) {
  const specs = product.specs?.filter(s => !s.status || s.status === 'ACTIVE');
  const prices = specs?.map(s => cent(s.priceCent));
  const complete = !!prices?.length && prices.every(p => p !== undefined);
  const minimum = complete ? prices!.reduce<bigint>((a, p) => p! < a ? p! : a, prices![0]!) : cent(product.priceCent);
  const variable = complete && prices!.some(p => p !== minimum);
  const qualifier = variable ? '起' : !complete && product.minimumPriceOnly ? '最低价' : '';
  const units = specs?.map(s => s.unit?.trim());
  // Missing or different SKU units deliberately stay unset.
  const unit = specs?.length ? units?.every(u => !!u && u === units[0]) ? units[0] : undefined : product.priceUnit?.trim();
  // Show the option corresponding to the displayed price, not an unreadable list of every SKU.
  const representative = complete ? specs?.find(s => cent(s.priceCent) === minimum) : specs?.find(s => s.name.trim());
  const summary = representative?.name.trim() || product.specSummary?.trim();
  const sales = !preview && Number.isSafeInteger(product.sold) && product.sold! >= 0 ? product.sold : undefined;
  return {
    minimumCent: minimum?.toString(),
    priceText: minimum === undefined ? undefined : `${minimum / 100n}.${String(minimum % 100n).padStart(2, '0')}`,
    qualifier, unit, summary, sales,
  };
}
