import { activeCase, HOUR, type TradeOrder } from './model';

export type BuyerCardActionId = 'pay' | 'cancel' | 'contact' | 'remind' | 'apply' | 'evidence' | 'confirm' | 'extend' | 'review' | 'support' | 'refund' | 'case' | 'edit' | 'withdraw' | 'intervene' | 'ruling';
export type BuyerCardAction = { id: BuyerCardActionId; label: string; primary?: boolean; disabled?: boolean };
const action = (id: BuyerCardActionId, label: string, primary = false): BuyerCardAction => ({ id, label, primary });
export function canReview(o: TradeOrder, now = Date.now()) { return !!o.terminatedAt && now < o.terminatedAt + 7 * 24 * HOUR && !o.reviewed; }
export function buyerCardActions(o: TradeOrder, now = Date.now()): { visible: BuyerCardAction[]; more: BuyerCardAction[] } {
  const contact = action('contact', '联系商家'), support = action('support', '联系平台客服');
  const evidence = action('evidence', '查看凭证');
  const refund = action('refund', '查看退款');
  const sale = o.sale;
  const result = (visible: BuyerCardAction[], more: BuyerCardAction[] = []) => ({ visible, more });
  const reviewActions = () => result([contact, action('review', '去评价', true)], [support, ...(o.refunded ? [refund] : [])]);
  if (sale?.status === 'refunded' && o.refunded >= o.amount) return result([support, refund, ...(canReview(o, now) ? [action('review', '去评价', true)] : [])], o.reviewed ? [action('review', '查看评价')] : []);
  if (activeCase(o) && sale?.status !== 'remedyReceipt') {
    const editable = !!sale && ['requested', 'proposal', 'second', 'rejected'].includes(sale.status);
    const more = editable ? [...(sale.modifications < 2 ? [action('edit', '修改申请')] : []), action('withdraw', '撤销售后')] : [];
    switch (sale?.status) {
      case 'requested': case 'second': return result([contact, action('case', '查看申请')], [...more, action('intervene', '申请平台介入')]);
      case 'proposal': return result([contact, action('case', '回应方案')], [...more, action('intervene', '申请平台介入')]);
      case 'rejected': return result([action('case', '查看理由'), ...(sale.deadline > now ? [action('intervene', '申请平台介入')] : [])], more);
      case 'remedy': return result([action('case', '查看方案'), contact], [action('intervene', '申请平台介入')]);
      case 'platform': case 'appeal': return result([action('case', '查看进度'), ...(sale.deadline > now ? [action('evidence', sale.appealLevel >= 2 ? '提交新证据' : '补充证据')] : [])], [support, ...(sale.proposal ? [action('case', '回应方案')] : [])]);
      case 'ruling': case 'final': return result([action('ruling', '查看处理结果')], [support]);
      case 'processing': return result([support, action('refund', '查看退款进度')]);
      default: return result([action('case', '查看进度')], [support]);
    }
  }
  if (o.stage === 'unpaid') return result([action('cancel', '取消订单'), contact, action('pay', '立即付款', true)]);
  if (['waiting', 'serving'].includes(o.stage)) {
    const cooling = !!o.lastReminderAt && o.lastReminderAt + 24 * HOUR > now;
    return result([...(o.caseCount < 3 ? [action('apply', o.stage === 'waiting' ? '申请退款' : '申请售后')] : [support]), contact, { id: 'remind', label: cooling ? '已催服务' : '催服务', disabled: cooling }]);
  }
  if (o.stage === 'receipt') return result([
    o.caseCount < 3 || sale?.status === 'remedyReceipt' ? action(sale?.status === 'remedyReceipt' ? 'intervene' : 'apply', '申请售后') : support,
    evidence, action('confirm', '确认收货', true),
  ], [contact, ...(!o.extensionUsed && (o.confirmAt ?? 0) > now ? [action('extend', '延长收货')] : [])]);
  if (o.stage === 'review' && canReview(o, now)) return reviewActions();
  return result([support, ...(o.reviewed ? [action('review', '查看评价')] : [])], o.refunded ? [refund] : []);
}
export function buyerListLabel(o: TradeOrder, now = Date.now()) {
  if (o.sale?.status === 'refunded' && o.refunded >= o.amount) return '已退款';
  if (o.sale?.status === 'remedyReceipt') return '待收货';
  if (activeCase(o)) return o.sale?.status === 'processing' ? '退款处理中' : '售后中';
  if (o.stage === 'review') return canReview(o, now) ? '待评价' : '已完成';
  return ({ unpaid: '待付款', waiting: '待服务', serving: '服务中', receipt: '待收货', done: '已完成', closed: '已关闭' } as const)[o.stage];
}
export function buyerMatchesTab(o: TradeOrder, tab: string, now = Date.now()) {
  if (tab === '全部') return true;
  if (tab === '售后中') return activeCase(o) && o.sale?.status !== 'remedyReceipt';
  return buyerListLabel(o, now) === tab;
}
