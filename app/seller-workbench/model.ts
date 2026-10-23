import { activeCase, matchesOrderTab, caseLabel, settlement, type TradeOrder } from '../trade-v31/model';

export type SellerAction = { id: 'start' | 'evidence' | 'case' | 'funds' | 'contact'; label: string };
export function sellerPrimaryAction(order: TradeOrder, now = Date.now()): SellerAction {
  if (order.sale?.status === 'remedy') return { id: 'evidence', label: '提交补充凭证' };
  if (activeCase(order)) {
    const sale = order.sale!;
    if (['processing', 'refundPending'].includes(sale.status)) return {id:'case',label:'退款进度'};
    if (sale.status === 'remedyReceipt') return {id:'case',label:'查看补充履约'};
    if (caseLabel(sale, 'seller', now) === '待我回应方案') return {id:'case',label:'回应方案'};
    if (sale.status === 'proposal') return {id:'case',label:'查看方案进度'};
    if (['ruling','final'].includes(sale.status)) return {id:'case',label:'查看处理结果'};
    return {id:'case',label:['requested','second'].includes(sale.status) ? '处理售后' : '查看售后进度'};
  }
  if (order.stage === 'waiting') return { id: 'start', label: '开始服务' };
  if (order.stage === 'serving') return { id: 'evidence', label: '提交完成凭证' };
  if (order.stage === 'receipt') return { id: 'evidence', label: '查看交付凭证' };
  if (['review', 'done'].includes(order.stage)) return { id: 'funds', label: '查看结算' };
  return { id: 'contact', label: '联系买家' };
}
export function sellerMatches(order: TradeOrder, tab: string, now = Date.now()) { return matchesOrderTab(order, tab, now); }
export function sellerDeadline(order: TradeOrder) {
  if (activeCase(order)) return order.sale!.deadline;
  if (['waiting', 'serving'].includes(order.stage)) return order.promiseAt;
  if (order.stage === 'receipt') return order.confirmAt ?? Infinity;
  return Infinity;
}
export function sellerTasks(orders: TradeOrder[]) {
  return orders.filter(order => activeCase(order)
    ? ['requested', 'second', 'remedy', 'platform', 'appeal', 'ruling', 'final'].includes(order.sale!.status)
    : ['waiting', 'serving'].includes(order.stage))
    .sort((a, b) => sellerDeadline(a) - sellerDeadline(b));
}
export function sellerTotals(orders: TradeOrder[]) {
  return orders.reduce((totals, order) => {
    const value = settlement(order);
    return { available: totals.available + value.available, pending: totals.pending + value.pending, frozen: totals.frozen + value.frozen };
  }, { available: 0, pending: 0, frozen: 0 });
}
export type Period = '今日' | '昨日' | '本周' | '本月';
export function periodOrders(orders: TradeOrder[], period: Period, now = new Date()) {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  let until = now.getTime();
  if (period === '昨日') { until = from.getTime(); from.setDate(from.getDate() - 1); }
  if (period === '本周') from.setDate(from.getDate() - (from.getDay() + 6) % 7);
  if (period === '本月') from.setDate(1);
  return orders.filter(o => !['unpaid', 'closed'].includes(o.stage) && o.paidAt >= from.getTime() && o.paidAt < until);
}
export type Dimension = { id?: string; name: string; values: string; options?: { id: string; label: string }[] };
export type Variant = { id?: string; key: string; price: string; stock: string; optionIds?: string[]; unit?: string };
export function combinations(dimensions: Dimension[]): string[] {
  const rows = dimensions.filter(d => d.name.trim()).map(d => [...new Set(d.values.split(/[,，\n]/).map(v => v.trim()).filter(Boolean))]);
  if (!rows.length || rows.some(r => !r.length)) return [];
  return rows.reduce<string[]>((all, values) => all.flatMap(prefix => values.map(v => prefix ? `${prefix} / ${v}` : v)).slice(0, 101), ['']);
}
export function reconcileVariants(dimensions: Dimension[], previous: Variant[], oldDimensions?: Dimension[]): Variant[] {
  const renamed = new Map<string, string>();
  if (oldDimensions && oldDimensions.length === dimensions.length) {
    const changes = dimensions.map((d, i) => {
      const old = [...new Set(oldDimensions[i].values.split(/[,，\n]/).map(v => v.trim()).filter(Boolean))];
      const next = [...new Set(d.values.split(/[,，\n]/).map(v => v.trim()).filter(Boolean))];
      const removed = old.filter(v => !next.includes(v)), added = next.filter(v => !old.includes(v));
      return old.length === next.length && removed.length === 1 && added.length === 1 ? [removed[0], added[0]] : undefined;
    });
    for (const v of previous) renamed.set(v.key.split(' / ').map((part, i) => changes[i]?.[0] === part ? changes[i]![1] : part).join(' / '), v.key);
  }
  return combinations(dimensions).map(key => {
    const old = previous.find(v => v.key === key) ?? previous.find(v => v.key === renamed.get(key));
    return old ? { ...old, id: old.id ?? `sku:${old.key}`, key } : { id: `sku:${key}`, key, price: '', stock: '' };
  });
}
export function buyerIdentity(order: TradeOrder) { return order.buyerId ?? `order:${order.id}`; }
export function sellerResponsibility(order: TradeOrder, now = Date.now()) {
  if (order.sale?.proposal && ['proposal', 'platform'].includes(order.sale.status) && now < (order.sale.proposal.expiresAt ?? order.sale.deadline)) return caseLabel(order.sale, 'seller', now);
  if (!activeCase(order) || ['requested','second','remedy'].includes(order.sale!.status)) return '待我处理';
  if (['proposal','rejected','remedyReceipt'].includes(order.sale!.status)) return '待买家处理';
  return '平台处理中';
}

/** Home display only: no timer scheduling, state transitions or changes to task ordering. */
export function sellerTaskPresentation(order: TradeOrder, now = Date.now()) {
  const sale = activeCase(order) ? order.sale! : null;
  const status = sale?.status;
  let responsibility = sellerResponsibility(order, now).replace('待买家回应方案', '待买家回应');
  if (sale && ['ruling', 'final'].includes(sale.status) && sale.deadline > now) {
    responsibility = sale.acceptedBy.includes('seller') ? (sale.acceptedBy.includes('buyer') ? '平台处理中' : '待买家回应') : '待我处理';
  }
  const labels: Record<string, [string, string]> = {
    requested: ['退款协商', '售后回应'], second: ['第二轮协商', '第二轮方案提交'],
    proposal: ['协商方案', '方案回应'], rejected: ['退款已驳回', '申请介入'],
    remedy: ['补充履约', '补充履约完成'], remedyReceipt: ['补充履约待验收', '补充履约验收'],
    platform: ['平台举证', '平台举证'], appeal: ['申诉复核', '复核处理'],
    ruling: ['初判结果', '申诉窗口'], final: ['复核结果', sale && sale.appealLevel >= 2 ? '结果生效' : '申诉窗口'],
  };
  const [title, deadlineLabel] = status ? labels[status] ?? ['售后进度', '处理'] : [order.stage === 'waiting' ? '待开始服务' : '履约进行中', '承诺完成'];
  const describe = (at: number, label: string) => {
    if (!Number.isFinite(at) || at <= 0) return { text: `${label} · 暂无明确期限`, tone: 'normal' };
    const delta = at - now;
    const minutes = delta > 0 ? Math.ceil(delta / 60000) : Math.floor(-delta / 60000);
    const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
    const duration = `${days ? `${days}天` : ''}${hours ? `${hours}小时` : ''}${mins ? `${mins}分` : ''}`;
    const text = delta === 0 ? '刚到期' : delta < 0 ? `已超时${duration || '不足1分钟'}` : `剩余${duration}`;
    return { text: `${label} · ${text}`, tone: delta <= 0 ? 'overdue' : delta <= 2 * 3600000 ? 'urgent' : 'normal' };
  };
  const proposalAt = sale?.proposal && ['platform', 'proposal'].includes(sale.status) ? sale.proposal.expiresAt ?? sale.deadline : null;
  const amount = sale ? sale.requested : order.amount;
  return {
    title, responsibility,
    deadline: describe(sellerDeadline(order), deadlineLabel),
    proposalDeadline: status === 'platform' && proposalAt && now < proposalAt ? describe(proposalAt, '方案回应') : null,
    action: !sale ? '查看订单' : responsibility === '待我回应方案' ? '回应方案' : responsibility === '待我处理' && ['requested', 'second'].includes(status!) ? '处理售后' : '查看进度',
    primary: responsibility === '待我处理' || responsibility === '待我回应方案',
    amountLabel: sale ? '申请退款' : '买家实付',
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
  };
}
export type MerchantProduct = { images?: string[]; detailImages?: string[]; id: string; title: string; description: string; cover: string; category: string; status: '在售' | '已下架' | '草稿' | '待审核' | '审核驳回'; rejectionReason?: string; dimensions: Dimension[]; variants: Variant[]; hours: string; requirements: string; notice: string; updated: number };
export function validateProduct(product: MerchantProduct): string {
  if (!product.title.trim()) return '请填写商品标题。';
  if (!product.description.trim()) return '请填写服务介绍。';
  if (!product.variants.length || product.variants.length > 100) return '请设置 1–100 个服务规格组合。';
  if (product.variants.some(v => !/^\d+(\.\d{1,2})?$/.test(v.price) || Number(v.price) <= 0 || !Number.isSafeInteger(Math.round(Number(v.price) * 100)))) return '每个规格请填写大于 0、最多两位小数的价格。';
  if (product.variants.some(v => !/^\d+$/.test(v.stock) || !Number.isSafeInteger(Number(v.stock)))) return '每个规格的服务名额须为非负整数。';
  if (!/^\d+$/.test(product.hours) || Number(product.hours) < 1 || Number(product.hours) > 168) return '完成时限请填写 1–168 小时。';
  return '';
}

/** Only previously approved, unchanged listings may be relisted. Review states never bypass approval. */
export function toggleProductListing(product: MerchantProduct, now = Date.now()): MerchantProduct {
  if (!['在售', '已下架'].includes(product.status)) throw new Error('商品须审核通过后才能上架，请查看审核进度或修改后重新提交。');
  if (product.status === '已下架') { const error = validateProduct(product); if (error) throw new Error(error); }
  return { ...product, status: product.status === '在售' ? '已下架' : '在售', updated: now };
}

export function productRequiredFields(requirements: string) {
  return [...new Set(requirements.split(/[,，、\n]/).map(value => value.trim()).filter(Boolean))].map(label => ({id:`field:${label}`,label,required:true}));
}
