import type { Dimension, MerchantProduct, Variant } from './model';

export const editorId = () => crypto.randomUUID();
const names = (value: string) => [...new Set(value.split(/[,，\n]/).map(v => v.trim()).filter(Boolean))];
export function withSpecIds(product: MerchantProduct): MerchantProduct {
  const dimensions = product.dimensions.map((d, i) => ({ ...d, id: d.id ?? `${product.id}:dimension:${i}`, options: d.options ?? names(d.values).map((label, j) => ({ id: `${product.id}:option:${i}:${j}`, label })) }));
  return { ...product, dimensions, variants: buildVariants(dimensions, product.variants, true) };
}
/** Identity is independent of display text and dimension/option ordering. */
export function buildVariants(dimensions: Dimension[], previous: Variant[], migrate = false): Variant[] {
  if (!dimensions.length) return [previous.find(v => v.optionIds?.length === 0 || v.key === '单价商品') ?? { id: editorId(), key: '单价商品', optionIds: [], price: '', stock: '1' }];
  if (dimensions.some(d => !d.options?.length)) return [];
  let rows: { labels: string[]; optionIds: string[] }[] = [{ labels: [], optionIds: [] }];
  for (const d of dimensions) rows = rows.flatMap(row => d.options!.map(o => ({ labels: [...row.labels, o.label], optionIds: [...row.optionIds, o.id] }))).slice(0, 101);
  const signature = (ids: string[]) => JSON.stringify([...ids].sort());
  return rows.map(row => {
    const key = row.labels.join(' / ');
    const old = previous.find(v => v.optionIds && signature(v.optionIds) === signature(row.optionIds)) ?? (migrate ? previous.find(v => !v.optionIds && v.key === key) : undefined);
    return { ...old, id: old?.id ?? `sku:${signature(row.optionIds)}`, key, optionIds: row.optionIds, price: old?.price ?? '', stock: old?.stock ?? '' };
  });
}
export function replaceDimensions(product: MerchantProduct, dimensions: Dimension[]) {
  const synced = dimensions.map(d => ({ ...d, values: (d.options ?? []).map(o => o.label).join(',') }));
  return { ...product, dimensions: synced, variants: buildVariants(synced, product.variants) };
}
export function validPrice(value: string) { return /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Math.round(Number(value) * 100)); }
export function validStock(value: string) { return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)); }
export function specErrors(product: MerchantProduct): Record<string, string> {
  const errors: Record<string, string> = {};
  product.dimensions.forEach((d, i) => {
    if (!d.name.trim()) errors[`dimension-${i}`] = '请填写规格名称。';
    (d.options ?? []).forEach((o, j) => {
      if (!o.label.trim()) errors[`option-${i}-${j}`] = '请填写选项名称。';
      else if (/[,，\n]| \/ /.test(o.label)) errors[`option-${i}-${j}`] = '一个输入框填写一个选项，请勿输入分隔符。';
      else if (d.options!.some((other, k) => k !== j && other.label.trim() === o.label.trim())) errors[`option-${i}-${j}`] = '同一规格内的选项名称不能重复。';
    });
  });
  if (!product.variants.length || product.variants.length > 100) errors.specs = '请设置 1–100 个服务规格组合。';
  product.variants.forEach((v, i) => {
    if (!validPrice(v.price)) errors[`price-${i}`] = `${v.key}：价格须大于 0，最多两位小数。`;
    if (!validStock(v.stock)) errors[`stock-${i}`] = `${v.key}：服务名额须为非负整数。`;
  });
  return errors;
}
export function productErrors(product: MerchantProduct, publish: boolean) {
  const errors: Record<string, string> = {};
  if (!product.title.trim()) errors.title = publish ? '请填写商品标题。' : '请先填写商品标题，再保存草稿。';
  if (!publish) return errors;
  if (!product.description.trim()) errors.description = '请填写服务介绍。';
  if (Object.keys(specErrors(product)).length) errors.specs = '规格尚未填写完整，请进入设置检查。';
  if (!/^\d+$/.test(product.hours) || Number(product.hours) < 1 || Number(product.hours) > 168) errors.hours = '完成时限请填写 1–168 小时。';
  return errors;
}
export function priceRange(product: MerchantProduct) {
  const prices = product.variants.filter(v => validPrice(v.price)).map(v => Number(v.price));
  if (!prices.length) return '待设置价格';
  const min = Math.min(...prices), max = Math.max(...prices);
  return `¥${min.toFixed(2)}${max !== min ? `–${max.toFixed(2)}` : ''}`;
}
export function unitSummary(product: MerchantProduct) {
  const units = new Set(product.variants.map(v => v.unit).filter(Boolean));
  return units.size === 1 && product.variants.every(v => v.unit) ? ` / ${[...units][0]}` : ' · 单位见规格';
}
export function specSummary(product: MerchantProduct) {
  const priceMissing = product.variants.filter(v => !validPrice(v.price)).length;
  const stockMissing = product.variants.filter(v => !validStock(v.stock)).length;
  return `${product.variants.length} 个组合 · ${priceRange(product)}${priceMissing || stockMissing ? ` · ${[priceMissing ? `${priceMissing}项价格待填写` : '', stockMissing ? `${stockMissing}项名额待填写` : ''].filter(Boolean).join('、')}` : ` · 可售名额 ${product.variants.reduce((n, v) => n + Number(v.stock), 0)}`}`;
}

/** Persistence must finish before the caller changes the list or reports success. */
export async function persistProductChange(product: MerchantProduct, rows: MerchantProduct[], write: (key: string, value: MerchantProduct[]) => Promise<void>) {
  const next = rows.some(p => p.id === product.id) ? rows.map(p => p.id === product.id ? product : p) : [product, ...rows];
  await write('merchant-products', next);
  return next;
}
export function coverFileError(file: { type: string; size: number }) {
  return !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 ? '请选择不超过 5MB 的 JPG、PNG 或 WebP 图片。' : '';
}
