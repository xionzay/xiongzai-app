/** V3.1 UI prototype. All records here are isolated design samples, never payment/API records. */
export type Role = 'buyer' | 'seller';
export type Stage = 'unpaid' | 'waiting' | 'serving' | 'receipt' | 'review' | 'done' | 'closed';
export type CaseStage = 'requested' | 'proposal' | 'second' | 'rejected' | 'remedy' | 'remedyReceipt' | 'platform' | 'ruling' | 'appeal' | 'final' | 'processing' | 'refunded' | 'withdrawn' | 'resolved' | 'refundPending';
export type Evidence = { id: string; name: string; kind: 'image' | 'video'; url?: string; sample?: boolean; digest?: string; fileId?: string };
export type RequiredField = { id: string; label: string; required: boolean };
export type Proposal = { kind: 'partial' | 'remedy'; amount: number; content: string; hours: number; id?: string; version?: number; proposer?: Role; expiresAt?: number };
export type SaleCase = {
  id: string; status: CaseStage; requested: number; reason: string; description: string;
  modifications: number; round: number; deadline: number; pausedRemaining: number;
  pausedAt?: number; closureReason?: 'buyerWithdrawn' | 'remedyCompleted' | 'rulingNoRefund' | 'rejectionExpired';
  proposalHistory?: (Proposal & { outcome: 'accepted' | 'rejected' | 'expired' | 'cancelled'; at: number })[];
  requestHistory?: { requested: number; reason: string; description: string; evidence: Evidence[]; at: number }[];
  proposal?: Proposal; remedyProposal?: Proposal; evidence: Evidence[]; appealLevel: number; rulingAmount: number;
  acceptedBy: Role[]; rejection?: string; originalStage: Stage; remedyDispute?: 'remedy' | 'remedyReceipt';
};
export type TradeOrder = {
  id: string; title: string; cover: string; seller: string; buyer: string; spec: string;
  sellerId?: string; buyerId?: string; productId?: string; skuId?: string; quantity?: number; unitPrice?: number; promiseHours?: number; ruleVersion?: string;
  requiredFields?: RequiredField[]; buyerInfo?: Record<string, string>;
  amount: number; stage: Stage; paidAt: number; promiseAt: number; confirmAt?: number;
  extensionUsed: boolean; lastReminderAt?: number; refunded: number; terminatedAt?: number; reviewed?: boolean;
  evidence: Evidence[]; sale?: SaleCase; caseHistory?: SaleCase[]; caseCount: number; logs: { title: string; detail: string; at: number }[];
  review?: { stars: number; content: string; anonymous?: boolean; images?: Evidence[] }; note?: string; specialAppeal?: string; specialEvidence?: Evidence[];
};
export const HOUR = 3600000;
export const stageNames: Record<Stage, string> = { unpaid: '待付款', waiting: '待服务', serving: '服务中', receipt: '待收货', review: '待评价', done: '已完成', closed: '已关闭' };
export const caseNames: Record<CaseStage, string> = { requested: '待卖家处理', proposal: '待买家回应方案', second: '等待第二轮方案', rejected: '卖家拒绝退款', remedy: '补充履约中', remedyReceipt: '补充履约待验收', platform: '平台举证中', ruling: '初判结果待生效', appeal: '申诉复核中', final: '复核结果待生效', processing: '退款处理中', refunded: '已退款', withdrawn: '售后已撤销', resolved: '售后已结案', refundPending: '退款待渠道受理' };
export function activeCase(o: TradeOrder) { return !!o.sale && !['withdrawn', 'refunded', 'resolved'].includes(o.sale.status); }
export function orderLabel(o: TradeOrder, now = Date.now()) {
  if (o.sale?.status === 'processing') return '退款处理中';
  if (o.sale?.status === 'refunded' && o.refunded >= o.amount) return '已退款';
  if (o.sale?.status === 'remedyReceipt') return '待收货';
  if (activeCase(o)) return '售后中';
  if (o.stage === 'review' && (o.reviewed || !o.terminatedAt || now >= o.terminatedAt + 7 * 24 * HOUR)) return '已完成';
  return stageNames[o.stage];
}
export function orderSecondaryLabel(o: TradeOrder) {
  if (o.sale?.status === 'remedyReceipt') return '补充履约待验收';
  if (o.refunded > 0 && o.refunded < o.amount) return '部分退款';
  return '';
}
export function matchesOrderTab(o: TradeOrder, tab: string, now = Date.now()) {
  if (tab === '全部') return true;
  if (tab === '售后中') return activeCase(o) && o.sale?.status !== 'remedyReceipt';
  return orderLabel(o, now) === tab;
}
export function caseLabel(c: SaleCase, role: Role, now = Date.now()) {
  if (c.proposal && ['proposal', 'platform'].includes(c.status) && now < (c.proposal.expiresAt ?? c.deadline)) {
    const proposer = c.proposal.proposer ?? 'seller';
    return proposer !== role ? '待我回应方案' : proposer === 'buyer' ? '待卖家回应方案' : '待买家回应方案';
  }
  return caseNames[c.status];
}
export function canAppendEvidence(o: TradeOrder, role: Role, now = Date.now()) {
  if (!activeCase(o)) return role === 'seller' && ['receipt', 'review', 'done'].includes(o.stage) && o.evidence.length > 0;
  const c = o.sale!;
  if (['refundPending', 'processing', 'ruling', 'final'].includes(c.status)) return false;
  if (['platform', 'appeal'].includes(c.status) && now >= c.deadline) return false;
  return true;
}
export function money(cents: number) { return (cents / 100).toFixed(2); }
export function parseMoney(text: string) { return /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text) * 100) : NaN; }
export function settlement(o: TradeOrder) {
  if (o.stage === 'unpaid' || o.stage === 'closed') return { fee: 0, net: 0, available: 0, frozen: 0, pending: 0 };
  const fee = o.refunded > 0 ? 0 : Math.round(o.amount * .1);
  const net = o.amount - o.refunded - fee;
  const settled = ['review', 'done'].includes(o.stage) && !activeCase(o);
  return { fee, net, available: settled ? net : 0, frozen: activeCase(o) ? o.amount - o.refunded : 0, pending: !settled && !activeCase(o) ? net : 0 };
}
export function evidenceError(evidence: Evidence[], amount: number) {
  const unique = evidence.filter((e, i, rows) => rows.findIndex(other => (e.digest && other.digest === e.digest) || (e.fileId && other.fileId === e.fileId) || other.id === e.id) === i);
  if (unique.filter(e => e.kind === 'image').length < 5) return '请至少提供 5 张与本次履约相关的有效截图。';
  if (amount >= 20000 && !evidence.some(e => e.kind === 'video')) return '实付金额达到 200 元，请补充连续录屏。';
  return '';
}
export const sampleEvidence: Evidence[] = Array.from({ length: 5 }, (_, i) => ({ id: `sample-${i}`, name: `履约截图 ${i + 1}`, kind: 'image', sample: true }));
const seed = (id: string, stage: Stage, index: number, now: number): TradeOrder => ({
  id, title: ['和平精英 · 组队陪练', '王者荣耀 · 双排教学', '三角洲行动 · 战术指导', '英雄联盟 · 对局复盘'][index % 4],
  cover: `/assets/home-hot-sale/cover-0${index % 4 + 1}.jpg`, seller: ['晚风', '小熊软糖', '鹿屿', '星野'][index % 4], buyer: '熊崽玩家',
  spec: ['经典模式 · 3 局', '双排教学 · 2 小时', '战术指导 · 6 局', '对局复盘 · 1 次'][index % 4], amount: index % 4 === 2 ? 22800 : 6000,
  stage, buyerId: 'preview-buyer', quantity: 1, promiseHours: 24, ruleVersion: 'V3.1', paidAt: stage === 'unpaid' ? 0 : now - 6 * HOUR, promiseAt: now + 18 * HOUR, confirmAt: stage === 'receipt' ? now + 68 * HOUR : undefined,
  extensionUsed: false, refunded: 0, caseCount: 0, evidence: ['receipt', 'review', 'done'].includes(stage) ? [...sampleEvidence] : [],
  terminatedAt: ['review', 'done'].includes(stage) ? now - HOUR : undefined,
  logs: [{ title: '订单创建', detail: '规则版本 V3.1 · 下单时的商品与规则快照已保留', at: now - 6 * HOUR }, ...(stage !== 'unpaid' ? [{ title: '支付成功', detail: '完成时限从支付成功起计算', at: now - 6 * HOUR }] : [])],
});
export function createSamples(now = Date.now()): TradeOrder[] {
  const orders = [seed('XZ310001', 'waiting', 0, now), seed('XZ310002', 'serving', 2, now), seed('XZ310003', 'receipt', 1, now), seed('XZ310004', 'serving', 3, now), seed('XZ310005', 'receipt', 0, now), seed('XZ310006', 'receipt', 1, now), seed('XZ310007', 'review', 0, now), seed('XZ310008', 'unpaid', 1, now), seed('XZ310009', 'receipt', 3, now), seed('XZ310010', 'receipt', 0, now), seed('XZ310011', 'done', 1, now)];
  const makeCase = (o: TradeOrder, status: CaseStage): SaleCase => ({ id: `AS${o.id.slice(2)}`, status, requested: o.amount, reason: '未按约定完成服务', description: '购买 3 局服务，尚有 1 局未完成，希望协商处理。', modifications: 0, round: 0, deadline: now + 23 * HOUR, pausedRemaining: 68 * HOUR, evidence: [], appealLevel: 0, rulingAmount: 2000, acceptedBy: [], originalStage: o.stage, pausedAt: now, requestHistory: [], proposalHistory: [] });
  orders[3].sale = makeCase(orders[3], 'requested');
  orders[4].sale = { ...makeCase(orders[4], 'proposal'), round: 1, proposal: { kind: 'remedy', amount: 0, content: '补充完成剩余 1 局组队陪练', hours: 24 } };
  orders[5].sale = makeCase(orders[5], 'platform');
  orders[8].sale = makeCase(orders[8], 'ruling');
  orders[9].sale = makeCase(orders[9], 'processing');
  orders[10].sale = makeCase(orders[10], 'refunded'); orders[10].refunded = 2000; orders[10].stage = 'review';
  const remedy = seed('XZ310012', 'serving', 0, now);
  remedy.sale = { ...makeCase(remedy, 'remedy'), round: 1, proposal: { kind: 'remedy', amount: 0, content: '补充剩余 1 局服务', hours: 24 } };
  const receipt = seed('XZ310013', 'receipt', 1, now);
  receipt.sale = { ...makeCase(receipt, 'remedyReceipt'), deadline: receipt.confirmAt!, round: 1, proposal: { kind: 'remedy', amount: 0, content: '补充剩余 1 小时服务', hours: 24 } };
  const second = seed('XZ310014', 'receipt', 3, now);
  second.sale = { ...makeCase(second, 'final'), appealLevel: 1 };
  const rejected = seed('XZ310015', 'serving', 0, now);
  rejected.sale = { ...makeCase(rejected, 'rejected'), rejection: '卖家认为服务已按约定完成，等待核验凭证。', deadline: now + 47 * HOUR };
  const reviewed = seed('XZ310016', 'done', 0, now);
  reviewed.reviewed = true; reviewed.review = { stars: 5, content: '沟通耐心，按约定完成了服务。' };
  const expired = seed('XZ310017', 'done', 2, now); expired.terminatedAt = now - 8 * 24 * HOUR;
  orders.push(remedy, receipt, second, rejected, reviewed, expired);
  return orders.map(o => { if (o.sale?.proposal) o.sale.proposal = { ...o.sale.proposal, id: `${o.sale.id}-P1`, version: 1, proposer: 'seller', expiresAt: now + 24 * HOUR }; return { ...o, caseCount: o.sale ? 1 : 0 }; });
}
export type TradeAction =
  | { type: 'pay' | 'start' | 'extend' | 'confirm' | 'withdrawCase' | 'agree' | 'acceptProposal' | 'rejectProposal' | 'acceptRuling' | 'cancel' | 'remind'; role: Role; note?: string; buyerInfo?: Record<string, string>; proposalId?: string; proposalVersion?: number }
  | { type: 'complete' | 'append'; role: Role; evidence: Evidence[]; description?: string }
  | { type: 'apply'; role: Role; amount: number; reason: string; description: string; evidence: Evidence[] }
  | { type: 'propose'; role: Role; proposal: Proposal }
  | { type: 'reject' | 'intervene' | 'appeal' | 'special'; role: Role; reason: string; evidence: Evidence[] }
  | { type: 'review'; role: Role; stars: number; content: string; anonymous?: boolean; images?: Evidence[] };
export function transition(source: TradeOrder, action: TradeAction, now = Date.now()): TradeOrder {
  const o: TradeOrder = advanceDeadlines(source, now); const c = o.sale;
  const ensure = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
  const buyer = () => ensure(action.role === 'buyer', '此操作由买家完成。');
  const seller = () => ensure(action.role === 'seller', '此操作由卖家完成。');
  const log = (title: string, detail = '') => o.logs.push({ title, detail, at: now });
  const archiveProposal = (outcome: 'accepted' | 'rejected' | 'cancelled' | 'expired') => {
    if (c?.proposal) (c.proposalHistory ??= []).push({ ...c.proposal, outcome, at: now });
  };
  const restore = (reason: NonNullable<SaleCase['closureReason']>) => restoreAfterSale(o, now, reason);
  const refund = (amount: number) => { ensure(c, '没有正在处理的售后单。'); c!.rulingAmount = amount; c!.status = 'refundPending'; c!.proposal = undefined; log('退款待渠道受理', `¥${money(amount)} · 本地预览未调用支付渠道，不代表退款已提交或到账`); };
  const responseProposal = () => {
    ensure(c?.proposal && ['proposal', 'platform'].includes(c.status), '暂无待回应的协商方案，原方案可能已过期或失效。');
    const p = c!.proposal!;
    ensure(now < (p.expiresAt ?? c!.deadline), '方案已过期，请查看最新处理进度。');
    ensure(action.role !== (p.proposer ?? 'seller'), '只有方案接收方可以回应。');
    if ('proposalId' in action || p.id) ensure('proposalId' in action && action.proposalId === p.id && action.proposalVersion === p.version, '方案版本已变更，请重新查看。');
    return p;
  };
  switch (action.type) {
    case 'pay': {
      buyer(); ensure(o.stage === 'unpaid', '订单已支付或关闭。');
      const info: Record<string, string> = {};
      for (const field of o.requiredFields ?? []) {
        const value = (action.buyerInfo?.[field.id] ?? '').trim();
        ensure(!field.required || value, `请填写${field.label}。`);
        ensure(value.length <= 200, `${field.label}请勿超过 200 字。`);
        info[field.id] = value;
      }
      o.buyerInfo = info; o.stage = 'waiting'; o.note = action.note; o.paidAt = now; o.promiseAt = now + (o.promiseHours ?? 24) * HOUR; log('支付成功', '交互预览，未发起真实扣款'); break;
    }
    case 'remind': buyer(); ensure(['waiting', 'serving'].includes(o.stage) && !activeCase(o), '当前状态无法催服务。'); ensure(!o.lastReminderAt || now >= o.lastReminderAt + 24 * HOUR, '每24小时可催服务一次。'); o.lastReminderAt = now; log('买家催服务', '本地交互预览，未发送真实通知'); break;
    case 'cancel': buyer(); ensure(o.stage === 'unpaid', '已支付订单请通过售后处理。'); o.stage = 'closed'; log('未付款订单已取消'); break;
    case 'start': seller(); ensure(o.stage === 'waiting' && !activeCase(o), '仅待服务且无进行中售后时可开始。'); o.stage = 'serving'; log('卖家开始服务', '完成时限不重置；开始不代表交付'); break;
    case 'complete': {
      seller(); ensure((o.stage === 'serving' && !activeCase(o)) || c?.status === 'remedy', '请先开始服务；普通售后期间不可提交完成。');
      const err = evidenceError(action.evidence, o.amount); ensure(!err, err); o.evidence.push(...action.evidence); o.stage = 'receipt';
      o.confirmAt = now + 72 * HOUR;
      if (c?.status === 'remedy') { c.status = 'remedyReceipt'; c.deadline = o.confirmAt; }
      log('提交完成凭证', `${action.description || ''} · 72 小时验收期开始；凭证不可撤回或覆盖`); break;
    }
    case 'append': ensure(action.evidence.length, '请选择需要补充的证据。'); if (!activeCase(o)) seller(); ensure(canAppendEvidence(o, action.role, now), '当前阶段或举证期限不允许追加凭证。'); (activeCase(o) ? c!.evidence : o.evidence).push(...action.evidence); log('追加证据', '原凭证和倒计时保持不变'); break;
    case 'extend': buyer(); ensure(o.stage === 'receipt' && (!activeCase(o) || c?.status === 'remedyReceipt') && !o.extensionUsed, '每个订单仅能延长一次，补充履约共用次数。'); ensure((o.confirmAt ?? 0) > now, '验收期已结束。'); o.extensionUsed = true; o.confirmAt! += 24 * HOUR; if (c?.status === 'remedyReceipt') c.deadline = o.confirmAt!; log('延长收货时间', '本单已使用唯一一次 +24 小时'); break;
    case 'confirm': buyer(); ensure(o.stage === 'receipt' && (!activeCase(o) || c?.status === 'remedyReceipt'), '当前状态无法确认收货。'); o.stage = 'review'; o.terminatedAt ??= now; if (c?.status === 'remedyReceipt') { c.status = 'resolved'; c.closureReason = 'remedyCompleted'; c.pausedAt = undefined; } log('买家确认收货', '交易完成，按结算规则处理资金；评价不影响结算'); break;
    case 'apply': {
      buyer(); ensure(['waiting', 'serving', 'receipt'].includes(o.stage), '交易终结后请联系平台提交特殊申诉。');
      const editable = !!c && ['requested', 'proposal', 'second', 'rejected'].includes(c.status);
      ensure(!activeCase(o) || editable, '当前阶段不可修改申请。');
      ensure(editable ? c!.modifications < 2 : o.caseCount < 3, '自助次数已用完，可联系平台人工核查。');
      ensure(Number.isSafeInteger(action.amount) && action.amount > 0 && action.amount <= o.amount - o.refunded, '退款金额须大于 0，且不超过剩余可退金额。'); ensure(action.reason, '请选择售后原因。');
      const editing = editable;
      if (!editing && c) (o.caseHistory ??= []).push(structuredClone(c));
      o.sale = { id: editing ? c!.id : `AS${o.id}-${o.caseCount + 1}`, status: 'requested', pausedAt: editing ? c!.pausedAt : now, requestHistory: editing ? [...(c!.requestHistory ?? []), { requested: c!.requested, reason: c!.reason, description: c!.description, evidence: structuredClone(c!.evidence), at: now }] : [], proposalHistory: editing ? [...(c!.proposalHistory ?? []), ...(c!.proposal ? [{ ...c!.proposal, outcome: 'cancelled' as const, at: now }] : [])] : [], requested: action.amount, reason: action.reason, description: action.description, modifications: editing ? c!.modifications + 1 : 0, round: editing ? c!.round : 0, deadline: now + 24 * HOUR, pausedRemaining: editing ? c!.pausedRemaining : Math.max(0, (o.confirmAt ?? now) - now), originalStage: editing ? c!.originalStage : o.stage, evidence: [...(editing ? c!.evidence : []), ...action.evidence], appealLevel: 0, rulingAmount: 0, acceptedBy: [] };
      if (!editing) o.caseCount++; log(editing ? '买家修改售后申请' : '买家申请售后', '整单冻结；卖家处理时限 24 个自然小时'); break;
    }
    case 'withdrawCase': buyer(); ensure(c && ['requested', 'proposal', 'second', 'rejected'].includes(c.status), '当前售后阶段不可自助撤销。'); archiveProposal('cancelled'); restore('buyerWithdrawn'); log('买家撤销售后', '恢复原履约状态；已交付订单剩余验收时间至少 24 小时'); break;
    case 'agree': seller(); ensure(c && ['requested', 'second'].includes(c.status), '当前申请不可直接同意。'); refund(c!.requested); break;
    case 'reject': seller(); ensure(c && c.status === 'requested', '当前阶段不可拒绝。'); ensure(action.reason.trim(), '请说明拒绝原因。'); ensure(action.evidence.length, '驳回退款必须提交相关证据。'); c!.status = 'rejected'; c!.rejection = action.reason; c!.evidence.push(...action.evidence); c!.deadline = now + 48 * HOUR; log('卖家拒绝退款', action.reason); break;
    case 'propose': if (c?.status !== 'platform') seller(); ensure(c && ['requested', 'second', 'platform'].includes(c.status), '当前阶段无法发起协商。'); ensure(c!.status === 'platform' || c!.round < 2, '两轮协商已结束，请平台介入。'); ensure(!c!.proposal || now >= (c!.proposal.expiresAt ?? c!.deadline), '已有待回应方案，请等待对方处理。'); ensure(action.proposal.content.trim(), '请填写具体方案。');
      if (action.proposal.kind === 'partial') ensure(Number.isSafeInteger(action.proposal.amount) && action.proposal.amount > 0 && action.proposal.amount <= c!.requested, '协商退款金额须在申请金额范围内。');
      else ensure(Number.isInteger(action.proposal.hours) && action.proposal.hours > 0 && action.proposal.hours <= 168, '补充履约时限须为 1～168 小时。');
      // Platform negotiation is presented independently; its evidence deadline never moves.
      if (c!.status !== 'platform') { c!.round++; c!.status = 'proposal'; c!.deadline = now + 24 * HOUR; }
      archiveProposal('expired'); const version = (c!.proposalHistory?.length ?? 0) + 1; c!.proposal = { ...action.proposal, id: `${c!.id}-P${version}`, version, proposer: action.role, expiresAt: now + 24 * HOUR }; log(`${action.role === 'buyer' ? '买家' : '卖家'}提交协商方案`, action.proposal.content); break;
    case 'acceptProposal': responseProposal(); archiveProposal('accepted');
      if (c!.proposal!.kind === 'partial') refund(c!.proposal!.amount);
      else { c!.status = 'remedy'; c!.remedyProposal = c!.proposal; c!.deadline = now + c!.proposal!.hours * HOUR; c!.proposal = undefined; log('接收方同意补充履约', '原售后单继续处理并保留资金冻结'); } break;
    case 'rejectProposal': responseProposal(); archiveProposal('rejected');
      if (c!.status !== 'platform') { c!.status = c!.round >= 2 ? 'platform' : 'second'; c!.deadline = now + 24 * HOUR; }
      c!.proposal = undefined; log(`${action.role === 'buyer' ? '买家' : '卖家'}拒绝协商方案`, c!.status === 'second' ? '等待卖家在 24 小时内提出第二轮方案' : '继续平台处理'); break;
    case 'intervene': ensure(c && ['requested', 'proposal', 'second', 'rejected', 'remedy', 'remedyReceipt'].includes(c.status), '当前阶段无需重复申请介入。'); ensure(action.reason.trim(), '请填写介入原因。'); ensure(action.role !== 'seller' || action.evidence.length, '卖家申请介入必须提交相关证据。'); archiveProposal('cancelled'); if (c!.status === 'remedy' || c!.status === 'remedyReceipt') { c!.pausedAt = now; c!.remedyDispute = c!.status; c!.pausedRemaining = Math.max(0, c!.deadline - now); } c!.status = 'platform'; c!.deadline = now + 24 * HOUR; c!.evidence.push(...action.evidence); c!.proposal = undefined; log('申请平台介入', action.reason); break;
    case 'appeal': ensure(c && ['ruling', 'final'].includes(c.status) && c.appealLevel < 2 && c.deadline > now, '申诉窗口已结束或已达到两级申诉上限。'); ensure(action.reason.trim(), '请填写申诉理由。'); ensure(c!.appealLevel === 0 || action.evidence.some(e => (e.digest || e.fileId) && ![...c!.evidence, ...o.evidence].some(old => old.id === e.id || (e.digest && old.digest === e.digest) || (e.fileId && old.fileId === e.fileId))), '二次申诉必须提交未使用过的新证据。'); c!.appealLevel++; c!.status = 'appeal'; c!.acceptedBy = []; c!.evidence.push(...action.evidence); c!.deadline = now + 24 * HOUR; log(`提交第 ${c!.appealLevel} 级申诉`, action.reason); break;
    case 'acceptRuling': ensure(c && ['ruling', 'final'].includes(c.status), '暂无待确认结果。'); ensure(!c!.acceptedBy.includes(action.role), '您已确认该结果。'); c!.acceptedBy.push(action.role); log(`${action.role === 'buyer' ? '买家' : '卖家'}认可处理结果`); if (c!.acceptedBy.length === 2 || c!.appealLevel === 2) { if (c!.rulingAmount > 0) refund(c!.rulingAmount); else restore('rulingNoRefund'); } break;
    case 'review': buyer(); ensure(o.terminatedAt && now < o.terminatedAt + 7 * 24 * HOUR && !o.reviewed, '评价期已结束或已经评价。'); ensure(action.stars >= 1 && action.stars <= 5, '请选择评分。'); o.reviewed = true; o.review = { stars: action.stars, content: action.content, anonymous: action.anonymous ?? false, images: action.images ?? [] }; if (o.stage === 'review') o.stage = 'done'; log('买家提交评价', '不影响订单结算，不自动好评'); break;
    case 'special': ensure(o.terminatedAt && now <= o.terminatedAt + 7 * 24 * HOUR, '自助特殊申诉窗口已结束，请联系平台人工核查。'); ensure(action.reason.trim(), '请填写严重问题的具体情况。'); o.specialAppeal = action.reason; o.specialEvidence = [...(o.specialEvidence ?? []), ...action.evidence]; log('特殊申诉材料已保存至本地预览', '尚未提交平台，未受理或退款；正式申请需经客服核验'); break;
  }
  return o;
}

/** Shared clock transitions. Payment execution is deliberately not simulated here. */
export function restoreAfterSale(o: TradeOrder, now: number, reason: NonNullable<SaleCase['closureReason']>) {
  const c = o.sale;
  if (!c) return;
  if (c.remedyDispute) {
    c.status = c.remedyDispute;
    c.deadline = now + Math.max(c.pausedRemaining, c.remedyDispute === 'remedyReceipt' ? 24 * HOUR : 0);
    if (c.remedyDispute === 'remedyReceipt') { o.stage = 'receipt'; o.confirmAt = c.deadline; }
    c.remedyDispute = undefined; c.pausedAt = undefined;
  } else {
    o.stage = c.originalStage;
    if (c.pausedAt !== undefined) o.promiseAt += Math.max(0, now - c.pausedAt);
    if (o.stage === 'receipt') o.confirmAt = now + Math.max(c.pausedRemaining, 24 * HOUR);
    c.status = reason === 'buyerWithdrawn' ? 'withdrawn' : 'resolved';
    c.closureReason = reason;
    c.pausedAt = undefined;
  }
  c.proposal = undefined;
}
export function advanceDeadlines(source: TradeOrder, now = Date.now()): TradeOrder {
  const o = structuredClone(source), c = o.sale;
  const log = (title: string, at: number) => o.logs.push({ title, detail: '本地规则演算；未调用资金渠道', at });
  if (c && activeCase(o)) {
    if (c.status === 'platform' && c.proposal && now >= (c.proposal.expiresAt ?? c.deadline)) {
      (c.proposalHistory ??= []).push({ ...c.proposal, outcome: 'expired', at: c.proposal.expiresAt ?? c.deadline });
      c.proposal = undefined;
    }
    // At most two automatic negotiation steps; never change platform review into a fabricated ruling.
    for (let i = 0; i < 2 && now >= c.deadline; i++) {
      const at = c.deadline;
      if (c.status === 'requested') { c.status = 'refundPending'; c.rulingAmount = c.requested; log('回应到期，退款待渠道受理', at); }
      else if (c.status === 'proposal') {
        if (c.proposal) (c.proposalHistory ??= []).push({ ...c.proposal, outcome: 'expired', at });
        c.proposal = undefined; c.status = c.round >= 2 ? 'platform' : 'second'; c.deadline = at + 24 * HOUR; log('方案到期未接受', at);
      } else if (c.status === 'second' || c.status === 'remedy') { if (c.status === 'remedy') { c.remedyDispute = 'remedy'; c.pausedAt = at; c.pausedRemaining = 0; } c.status = 'platform'; c.deadline = at + 24 * HOUR; log('处理期限已到，转平台核查', at); }
      else if (c.status === 'rejected') { restoreAfterSale(o, at, 'rejectionExpired'); log('介入窗口结束，恢复履约', at); }
      else if (c.status === 'remedyReceipt') { c.pausedAt = undefined; c.status = 'resolved'; c.closureReason = 'remedyCompleted'; o.stage = 'review'; o.terminatedAt ??= at; log('补充履约验收期结束', at); }
      else if (['ruling', 'final'].includes(c.status)) { if (c.rulingAmount > 0) c.status = 'refundPending'; else restoreAfterSale(o, at, 'rulingNoRefund'); log('处理结果生效', at); }
      else break;
    }
  } else if (o.stage === 'receipt' && o.confirmAt && now >= o.confirmAt) {
    o.stage = 'review'; o.terminatedAt ??= o.confirmAt; log('验收期结束，自动确认', o.confirmAt);
  }
  if (o.stage === 'review' && o.terminatedAt && now >= o.terminatedAt + 7 * 24 * HOUR) { o.stage = 'done'; log('评价期结束，未自动评价', o.terminatedAt + 7 * 24 * HOUR); }
  return o;
}
export function paidAmount(o: TradeOrder) { return ['unpaid', 'closed'].includes(o.stage) ? 0 : o.amount; }
