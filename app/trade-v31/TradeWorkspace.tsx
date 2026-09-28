'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { canReview, buyerCardActions, buyerListLabel, buyerMatchesTab, type BuyerCardAction } from './card-actions';
import { activeCase, caseNames, createSamples, evidenceError, HOUR, money, orderLabel, parseMoney, settlement, transition, type Evidence, type Role, type TradeAction, type TradeOrder } from './model';

export type TradeView = 'orders' | 'detail' | 'checkout' | 'evidence' | 'apply' | 'case' | 'proposal' | 'reject' | 'intervene' | 'appeal' | 'ruling' | 'refund' | 'review' | 'special' | 'funds' | 'rules' | 'support' | 'merchant';
const viewTitles: Record<TradeView, string> = { orders: '我的订单', detail: '订单详情', checkout: '确认订单', evidence: '履约凭证', apply: '申请售后', case: '售后详情', proposal: '提出协商方案', reject: '拒绝退款说明', intervene: '申请平台介入', appeal: '提交申诉', ruling: '平台处理结果', refund: '退款进度', review: '评价服务', special: '交易终结后申诉', funds: '订单资金', rules: '交易与售后规则', support: '联系平台客服', merchant: '联系商家' };
export const tradeCatalog = [
  { suffix: 'Orders', title: '订单列表', view: 'orders' }, { suffix: 'Checkout', title: '确认订单与支付', view: 'checkout' },
  { suffix: 'Detail', title: '订单详情与履约', view: 'detail' }, { suffix: 'Evidence', title: '履约凭证与追加', view: 'evidence' },
  { suffix: 'Apply', title: '申请与修改售后', view: 'apply' }, { suffix: 'Case', title: '售后处理与协商', view: 'case' },
  { suffix: 'Remedy', title: '补充履约与验收', view: 'case' }, { suffix: 'RemedyReceipt', title: '补充履约待验收', view: 'case' }, { suffix: 'SecondAppeal', title: '二次申诉与新证据', view: 'ruling' }, { suffix: 'Rejected', title: '拒绝退款与介入窗口', view: 'case' }, { suffix: 'Platform', title: '平台介入与举证', view: 'case' },
  { suffix: 'Ruling', title: '判责结果与两级申诉', view: 'ruling' }, { suffix: 'Refund', title: '渠道退款进度', view: 'refund' },
  { suffix: 'Review', title: '评价与交易终结', view: 'review' }, { suffix: 'Special', title: '终结后特殊申诉', view: 'special' },
  { suffix: 'Funds', title: '资金冻结与结算明细', view: 'funds' }, { suffix: 'Rules', title: 'V3.1 规则快照', view: 'rules' },
] as const;
export type TradePageId = `${'buyer' | 'seller'}Trade${typeof tradeCatalog[number]['suffix']}`;
export function useTradePreview() {
  const [orders, setOrders] = useState<TradeOrder[]>(() => createSamples());
  const [selected, setSelected] = useState('XZ310001');
  const dispatch = (action: TradeAction, orderId = selected) => {
    const order = orders.find(o => o.id === orderId)!;
    const updated = transition(order, action);
    setOrders(rows => rows.map(o => o.id === orderId ? updated : o));
    return updated;
  };
  return { orders, selected, setSelected, setOrders, dispatch };
}
export type TradeStore = ReturnType<typeof useTradePreview>;
const date = (time?: number) => time ? new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
function remaining(deadline?: number) { const hours = Math.max(0, Math.ceil(((deadline ?? 0) - Date.now()) / 60000)); return hours ? `${Math.floor(hours / 60)} 小时 ${hours % 60} 分` : '时限已到，等待处理结果'; }
function Panel({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) { return <section className="v31-panel">{title && <header><h2>{title}</h2>{aside}</header>}{children}</section>; }
function Facts({ rows }: { rows: [string, ReactNode][] }) { return <dl className="v31-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function Product({ order }: { order: TradeOrder }) { return <div className="v31-product"><img src={order.cover} alt={order.title} /><div><b>{order.title}</b><small>{order.spec}</small><span>{order.stage === 'unpaid' ? '待支付' : '实付'} <strong>¥{money(order.amount)}</strong><small> ×1</small></span></div></div>; }
function Note({ children }: { children: ReactNode }) { return <p className="v31-note">{children}</p>; }
function Files({ value, onChange, required = false, video = false }: { value: Evidence[]; onChange: (value: Evidence[]) => void; required?: boolean; video?: boolean }) {
  const [error, setError] = useState('');
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), []);
  return <div className="v31-files"><p>{required ? `至少 5 张有效截图${video ? '，另需连续录屏' : ''}` : '补充图片或视频（选填）'}</p><label className="v31-upload">＋ 选择图片 / 视频<input aria-label="选择证据文件" type="file" accept="image/*,video/*" multiple onChange={event => {
    const files = Array.from(event.target.files ?? []); const valid = files.filter(file => /^(image|video)\//.test(file.type) && file.size <= 100 * 1024 * 1024);
    setError(valid.length !== files.length ? '仅支持图片和视频，每个文件不超过 100 MB。' : '');
    const additions = valid.filter(f => !value.some(v => v.id === `${f.name}-${f.size}-${f.lastModified}`)).map(file => { const url = URL.createObjectURL(file); urls.current.push(url); return { id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, kind: file.type.startsWith('video') ? 'video' as const : 'image' as const, url }; });
    onChange([...value, ...additions]); event.target.value = '';
  }} /></label>{error && <p role="alert" className="v31-error">{error}</p>}
  <div className="v31-file-grid">{value.map((file, i) => <div key={file.id}>{file.url && file.kind === 'image' ? <img src={file.url} alt={file.name} /> : <span>{file.kind === 'video' ? '视频' : `截图 ${i + 1}`}</span>}<small>{file.name}</small><button type="button" aria-label={`移除${file.name}`} onClick={() => onChange(value.filter(v => v.id !== file.id))}>×</button></div>)}</div>
  <small>仅本次设计预览使用，不会上传到服务器。实际凭证提交后只可追加。</small></div>;
}
function EvidenceList({ files }: { files: Evidence[] }) {
  return files.length ? <div className="v31-evidence-list">{files.map((f, i) => <div key={`${f.id}-${i}`}><b>{f.kind === 'video' ? '连续录屏' : `截图 ${i + 1}`}</b><small>{f.name}{f.sample ? ' · 示例占位' : ''}</small></div>)}</div> : <Note>暂无已提交凭证。</Note>;
}
const rules = [
  ['正常履约', '付款成功 → 待服务 → 服务中 → 待收货 → 待评价 → 已完成。所有商品先开始服务，再提交完成凭证；不设预约、接单、计费或暂停计时。承诺完成时限从付款成功计算，最长 7 天，开始服务不重置。超时提醒，不自动退款。'],
  ['履约凭证', '至少 5 张有效截图，实付 ≥200 元另需连续录屏。原件不可删除覆盖，只能追加；追加不重置倒计时。重复图片转核查，不直接认定欺诈。敏感资料对交易对方脱敏，账号密码不得在普通聊天明文发送。'],
  ['确认与评价', '交付后 72 小时确认，卖家交付时及剩余 24 小时、2 小时提醒买家。每单可延长一次 24 小时，补充履约共用次数。普通售后暂停计时，恢复时至少保留 24 小时。首次交易终结后 7 天评价，不自动好评，评价不影响结算。'],
  ['申请与协商', '待服务、服务中、待收货均可申请。申请先选原因和全额或部分退款，说明及凭证初次选填。普通售后冻结整单，暂停普通履约操作。平台介入前最多修改 2 次；每单最多自助发起 3 次，新严重问题仍可人工核查。卖家 24 个自然小时有效处理。上传证据或聊天不等于处理。'],
  ['两轮协商', '卖家可同意、拒绝或提出部分退款 / 补充履约。买家回应时限 24 小时，沉默不算同意。第一轮失败后卖家有 24 小时提出第二轮；第二轮失败或逾期转平台。卖家拒绝后有 48 小时申请介入窗口；双方也可随时主动申请介入。'],
  ['补充履约', '买家明确同意具体内容与时限后开始，时限最长 7 天，继续原售后单并保留冻结。再次交付需相同证据，重新进入 72 小时验收。争议再次出现直接进入原单平台处理，不重开协商轮次。部分退款结算后剩余履约义务结束。'],
  ['平台与申诉', '每轮举证 24 小时，主管可延长一次最多 24 小时；材料齐全或到期后 24 小时内判责 / 复核。初判和一级复核均留 24 小时申诉窗口，双方认可可提前执行。最多两级申诉，二次须有新证据。平台协商不暂停举证截止时间。法定救济权不受影响。'],
  ['退款与资金', '正常收取 10% 佣金；有效订单只要有成功退款整单佣金归零，卖家净额为实付减累计退款。仅补充履约未退款仍按 10%。提交支付渠道才进入退款处理中，渠道成功后才显示已退款。退款异常查询原单，不重复退款。可提现代表可申请，不保证即时到账。'],
  ['特殊申诉', '首次交易终结后 7 天内严重问题通过平台客服提交。特殊申诉只冻结剩余可退款范围内的争议金额；资金不足进入欠款与追偿。独立风险冻结不因售后结束自动解除。不承诺平台垫付。'],
  ['服务范围与资料', '仅面向已实名的成年人；游戏服务及合规虚拟商品，不含账号交易和实物商品。聊天与证据按规定保留 3 年。下单保存商品及规则版本快照，新规则不自动替换历史订单。V3.1 为内部执行稿，正式上线前待法务审查。'],
];

export function TradeWorkspace({ role, store, entry = 'orders', suffix, initialFilter = '全部', nav, onExit, onRole, onLegacy }: { role: Role; store: TradeStore; entry?: TradeView; suffix?: string; initialFilter?: string; nav: ReactNode; onExit: () => void; onRole: (role: Role) => void; onLegacy?: () => void }) {
  const [view, setView] = useState<TradeView>(entry);
  const [history, setHistory] = useState<TradeView[]>([]);
  const [filter, setFilter] = useState(initialFilter === '新订单' || initialFilter === '待接单' ? '待服务' : initialFilter === '待确认' ? '待收货' : initialFilter === '售后' ? '售后中' : initialFilter);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [uploads, setUploads] = useState<Evidence[]>([]); const [reason, setReason] = useState(''); const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(''); const [refundKind, setRefundKind] = useState('full');
  const [proposalKind, setProposalKind] = useState<'partial' | 'remedy'>('partial'); const [hours, setHours] = useState('24');
  const [stars, setStars] = useState(5); const [policy, setPolicy] = useState(false);
  const [moreOrderId, setMoreOrderId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [messages, setMessages] = useState<Record<string, string[]>>({});
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: TradeAction; next?: TradeView; orderId?: string } | null>(null);
  const screenRef = useRef<HTMLDivElement>(null); const alertRef = useRef<HTMLParagraphElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(id); }, []);
  void tick;
  const order = store.orders.find(o => o.id === store.selected) ?? store.orders[0]; const sale = order.sale; const funds = settlement(order);
  useEffect(() => {
    if (!suffix) return;
    const index = ({ Checkout: store.selected.startsWith('XZ31P') ? undefined : 7, Evidence: role === 'seller' ? 1 : 2, Apply: 0, Case: 3, Remedy: 11, RemedyReceipt: 12, SecondAppeal: 13, Rejected: 14, Platform: 5, Ruling: 8, Refund: 9, Review: 6, Special: 6, Funds: 10 } as Record<string, number>)[suffix];
    if (index !== undefined) store.setSelected(store.orders[index]?.id ?? store.orders[0].id);
    // Entry selection runs only when the catalog mounts this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  useEffect(() => { if (!confirm && !moreOrderId) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setConfirm(null); setMoreOrderId(null); } }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [confirm, moreOrderId]);
  useEffect(() => {
    if (!confirm && !moreOrderId) return;
    const screen = screenRef.current; if (!screen) return;
    const previous = screen.style.overflowY; screen.style.overflowY = 'hidden';
    return () => { screen.style.overflowY = previous; };
  }, [confirm, moreOrderId]);
  const open = (next: TradeView) => { setMoreOrderId(null); setDraftMessage(''); setHistory(h => [...h, view]); setView(next); setError(''); setNotice(''); setUploads([]); setReason(''); setDescription(''); setAmount(''); screenRef.current?.scrollTo(0, 0); };
  const back = () => { if (!history.length) { if (view === 'orders') onExit(); else setView('orders'); } else { setView(history[history.length - 1]); setHistory(h => h.slice(0, -1)); } setError(''); setUploads([]); screenRef.current?.scrollTo(0, 0); };
  const act = (action: TradeAction, next?: TradeView, orderId?: string) => { try { store.dispatch(action, orderId); setConfirm(null); setError(''); setNotice('已更新交互预览'); if (next) open(next); } catch (e) { setConfirm(null); setError(e instanceof Error ? e.message : '请检查填写内容'); } };
  const ask = (title: string, text: string, action: TradeAction, next?: TradeView) => setConfirm({ title, text, action, next });
  const runCardAction = (o: TradeOrder, item: BuyerCardAction) => {
    if (item.disabled) return;
    store.setSelected(o.id); setMoreOrderId(null); setError(''); setNotice('');
    const confirmFor = (title: string, text: string, type: 'cancel' | 'confirm' | 'extend' | 'withdrawCase') => setConfirm({ title, text, action: { type, role: 'buyer' }, orderId: o.id });
    switch (item.id) {
      case 'cancel': confirmFor('取消未付款订单？', '取消后该订单关闭，不会扣款。', 'cancel'); break;
      case 'confirm': confirmFor(o.sale?.status === 'remedyReceipt' ? '确认补充履约已完成？' : '确认服务已完成？', '请先核对履约凭证。确认后交易完成，普通售后入口关闭，进入评价阶段；资金按交易及风控规则结算。', 'confirm'); break;
      case 'extend': confirmFor('延长收货24小时？', '每单只能延长一次，普通履约与补充履约共用这一次机会。', 'extend'); break;
      case 'withdraw': confirmFor('确认撤销售后？', '撤销后恢复原履约阶段；已交付订单的剩余验收时间至少保留24小时。', 'withdrawCase'); break;
      case 'remind': try { store.dispatch({ type: 'remind', role: 'buyer' }, o.id); setNotice('已记录催服务，下次可催时间为24小时后。本地预览未发送真实通知。'); } catch (e) { setError(e instanceof Error ? e.message : '暂时无法催服务'); } break;
      case 'edit': open('apply'); setReason(o.sale!.reason); setDescription(o.sale!.description); setRefundKind('partial'); setAmount(money(o.sale!.requested)); break;
      default: open(({ pay: 'checkout', contact: 'merchant', apply: 'apply', evidence: 'evidence', review: 'review', support: 'support', refund: 'refund', case: 'case', intervene: 'intervene', ruling: 'ruling' } as const)[item.id]);
    }
  };
  const renderCardAction = (o: TradeOrder, item: BuyerCardAction) => <button type="button" key={item.id} className={item.primary ? 'v31-primary' : ''} disabled={item.disabled} onClick={() => runCardAction(o, item)}>{item.label}</button>;
  const button = (label: string, click: () => void, primary = false, disabled = false) => <button type="button" className={primary ? 'v31-primary' : ''} onClick={click} disabled={disabled}>{label}</button>;
  const caseActive = activeCase(order);
  const canReceipt = order.stage === 'receipt' && (!caseActive || sale?.status === 'remedyReceipt');
  const timeline = <ol className="v31-timeline">{[...order.logs].reverse().map((l, i) => <li key={`${l.at}-${i}`}><b>{l.title}</b><small>{date(l.at)}</small><p>{l.detail}</p></li>)}</ol>;
  const aftersaleButtons = <div className="v31-actions">
    {role === 'buyer' && !caseActive && ['waiting', 'serving', 'receipt'].includes(order.stage) && button('申请售后', () => open('apply'))}
    {caseActive && button('查看售后', () => open('case'), true)}
    {button('联系平台客服', () => open('support'))}
  </div>;
  const titles = view === 'orders' && role === 'seller' ? '订单管理' : viewTitles[view];
  const render = () => {
    if (view === 'orders') {
      const tabs = ['全部', '待付款', '待服务', '服务中', '待收货', '待评价', '售后中', '已完成'];
      const shown = store.orders.filter(o => (role === 'buyer' ? buyerMatchesTab(o, filter) : (filter === '全部' || orderLabel(o) === filter || (filter === '售后中' && o.sale && o.sale.status !== 'withdrawn') || (filter === '已完成' && ['review', 'done', 'closed'].includes(o.stage)))) && `${o.title}${o.seller}${o.id}`.includes(query));
      return <><div className="v31-search"><input aria-label="搜索订单" placeholder="搜索商品、陪玩或订单号" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="v31-tabs" role="tablist" aria-label="订单状态">{tabs.map(tab => <button role="tab" aria-selected={filter === tab} className={filter === tab ? 'active' : ''} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
      <div className="v31-list-summary"><span>{shown.length} 笔订单</span><button onClick={() => open('rules')}>交易保障与售后规则 ›</button></div>
      {shown.map(o => {
        if (role === 'seller') return <article className="v31-order-card" key={o.id}><header><span>{o.buyer} ›</span><b>{orderLabel(o)}</b></header><button className="v31-product-link" onClick={() => { store.setSelected(o.id); open('detail'); }}><Product order={o} /></button><div className="v31-card-note">{o.sale && activeCase(o) ? caseNames[o.sale.status] : o.stage === 'receipt' ? `验收剩余 ${remaining(o.confirmAt)}` : o.stage === 'unpaid' ? '付款后开始计算完成时限' : o.stage === 'review' ? '交易已完成，可在 7 天内评价' : `承诺完成 ${date(o.promiseAt)}`}</div><footer><small>{o.id}</small>{button(o.sale ? '售后详情' : '订单详情', () => { store.setSelected(o.id); open(o.sale ? 'case' : 'detail'); }, !!o.sale)}</footer></article>;
        const actions = buyerCardActions(o);
        const note = o.sale && activeCase(o) ? o.sale.status === 'remedyReceipt' ? `补充履约待验收 · 剩余 ${remaining(o.confirmAt)}` : caseNames[o.sale.status] : o.stage === 'receipt' ? `卖家已提交凭证 · 验收剩余 ${remaining(o.confirmAt)}` : o.stage === 'unpaid' ? '付款后开始计算完成时限' : o.stage === 'review' && buyerListLabel(o) === '待评价' ? `评价截止 ${date((o.terminatedAt ?? 0) + 7 * 24 * HOUR)}` : ['review', 'done'].includes(o.stage) ? o.reviewed ? '交易已完成 · 已评价' : '交易已完成 · 未评价' : o.stage === 'closed' ? '订单已取消，未付款' : `承诺完成 ${date(o.promiseAt)}`;
        return <article className="v31-order-card v31-buyer-card" data-order-id={o.id} key={o.id}>
          <header><span>{o.seller}的店铺</span><b>{buyerListLabel(o)}</b></header>
          <button type="button" className="v31-product-link v31-card-open" aria-label={`打开订单 ${o.id}：${o.title}`} onClick={() => { store.setSelected(o.id); open('detail'); }}><Product order={o} /></button>
          {o.refunded > 0 && <div className="v31-card-refund">累计已退 ¥{money(o.refunded)}</div>}
          <div className="v31-card-note">{note}</div>
          {o.lastReminderAt && o.lastReminderAt + 24 * HOUR > Date.now() && ['waiting', 'serving'].includes(o.stage) && !activeCase(o) && <div className="v31-card-note">已催服务 · 下次可催 {date(o.lastReminderAt + 24 * HOUR)}</div>}
          <footer className="v31-card-actions">{actions.more.length > 0 && <button type="button" className="v31-more-trigger" aria-label={`更多操作 ${o.id}`} aria-haspopup="dialog" onClick={() => { store.setSelected(o.id); setMoreOrderId(o.id); }}>更多</button>}<div className="v31-card-buttons">{actions.visible.map(item => renderCardAction(o, item))}</div></footer>
        </article>;
      })}
      {!shown.length && <Panel><div className="v31-empty"><img src="/assets/xiongzai-icon.png" alt="" /><h2>暂无此类订单</h2><p>试试其他状态或搜索关键词。</p>{button('查看全部', () => { setFilter('全部'); setQuery(''); })}</div></Panel>}
      <div className="v31-actions">{role === 'buyer' && button('预览下单流程', () => { store.setSelected('XZ310008'); open('checkout'); })}{button('查看结算明细', () => open('funds'))}{onLegacy && button('查看接口订单', onLegacy)}</div></>;
    }
    if (view === 'detail') return <><section className="v31-status"><span>订单 {order.id}</span><h2>{role === 'buyer' ? buyerListLabel(order) : orderLabel(order)}</h2><p>{caseActive ? `${caseNames[sale!.status]} · ${sale!.status === 'processing' ? '等待支付渠道确认' : '相关资金冻结中'}` : order.stage === 'waiting' ? '付款成功，等待卖家开始服务' : order.stage === 'serving' ? '卖家正在履约，完成后请核验交付凭证' : order.stage === 'receipt' ? `请在 ${remaining(order.confirmAt)} 内验收` : order.stage === 'unpaid' ? '核对服务内容和规格后付款' : '交易记录与凭证可在此查看'}</p></section>
      <div className="v31-steps">{['待服务', '服务中', '待收货', '待评价', '已完成'].map((s, i) => <span className={['waiting','serving','receipt','review','done'].indexOf(order.stage) >= i ? 'active' : ''} key={s}><i>{i + 1}</i>{s}</span>)}</div>
      <Panel><Product order={order} /><Facts rows={[[role === 'buyer' ? '卖家' : '买家', role === 'buyer' ? order.seller : order.buyer], ['承诺完成', date(order.promiseAt)], ['服务规格', order.spec], ['买家留言', order.note || '未填写'], ['交易规则', <button key="rules" onClick={() => open('rules')}>V3.1 · 查看快照 ›</button>]]} /></Panel>
      <Panel title="履约凭证" aside={<button onClick={() => open('evidence')}>查看 ›</button>}><Note>{order.evidence.length ? `已提交 ${order.evidence.length} 份凭证，追加不会重置验收倒计时。` : '卖家提交完成时须提供有效凭证，开始服务不代表已经交付。'}</Note></Panel>
      {canReceipt && <Panel title={sale?.status === 'remedyReceipt' ? '补充履约验收' : '收货确认'}><Facts rows={[["剩余验收时间", remaining(order.confirmAt)], ['延长机会', order.extensionUsed ? '已使用 +24 小时' : '本单剩余 1 次 · +24 小时']]} /><Note>普通售后暂停验收计时；确认收货后结算，评价不影响结算。</Note></Panel>}
      <Panel title="订单信息"><Facts rows={[["支付时间", order.stage === "unpaid" || order.stage === "closed" ? "未支付" : date(order.paidAt)], ['实付金额', `¥${money(order.stage === 'unpaid' || order.stage === 'closed' ? 0 : order.amount)}`], ['累计退款', `¥${money(order.refunded)}`], ['资金状态', funds.frozen ? '售后冻结中' : funds.available ? '已结算' : '待结算']]} /><button className="v31-link" onClick={() => open('funds')}>查看费用与资金明细 ›</button></Panel>
      <Panel title="处理记录">{timeline}</Panel>
      <div className="v31-actions">
        {role === 'buyer' && order.stage === 'unpaid' && <>{button('取消订单', () => ask('取消未付款订单？', '取消后不会扣款。', { type: 'cancel', role }))}{button('去付款', () => open('checkout'), true)}</>}
        {role === 'seller' && order.stage === 'waiting' && !caseActive && button('开始服务', () => ask('确认开始服务？', '开始后不可撤回，承诺完成时间保持不变。', { type: 'start', role }), true)}
        {role === 'seller' && (order.stage === 'serving' && !caseActive || sale?.status === 'remedy') && button('提交完成凭证', () => open('evidence'), true)}
        {role === 'buyer' && canReceipt && <>{button('延长收货', () => ask('延长 24 小时？', '每个订单仅能使用一次，补充履约共用次数。', { type: 'extend', role }), false, order.extensionUsed)}{button('确认收货', () => ask('确认已完成交付？', '确认后交易完成并结算，请先检查服务与凭证。', { type: 'confirm', role }), true)}</>}
        {role === 'buyer' && canReview(order) && button('评价服务', () => open('review'), true)}
        {order.terminatedAt && button('交易终结后申诉', () => open('special'))}
      </div>{aftersaleButtons}</>;
    if (view === 'merchant') return <><Panel title={`${order.seller} · 订单会话`}><Product order={order} /><Note>关联订单 {order.id}。以下消息仅保存在当前交互预览中，不会发送给真实商家。</Note></Panel><section className="v31-merchant-messages" aria-label="商家会话" aria-live="polite"><p>可就本笔订单的服务内容与完成时间进行沟通。</p>{(messages[order.id] ?? []).map((message, i) => <div key={i}>{message}</div>)}</section><form onSubmit={e => { e.preventDefault(); if (!draftMessage.trim()) return; setMessages(previous => ({ ...previous, [order.id]: [...(previous[order.id] ?? []), draftMessage.trim()] })); setDraftMessage(''); }}><label className="v31-field">发送给商家的消息<input value={draftMessage} onChange={e => setDraftMessage(e.target.value)} maxLength={500} placeholder="输入消息（本地预览）" /></label><div className="v31-actions"><button type="submit" className="v31-primary" disabled={!draftMessage.trim()}>发送预览</button></div></form></>;
    if (view === 'checkout') return <><Panel><Product order={order} /></Panel><Panel title="服务信息"><Facts rows={[["服务内容", order.spec], ['完成时限', '付款成功后 24 小时内'], ['付款金额', `¥${money(order.amount)}`]]} /><label className="v31-field">给卖家留言<textarea placeholder="例如游戏区服、服务要求；不要填写账号密码" value={description} onChange={e => setDescription(e.target.value)} /></label></Panel><Panel title="交易保障"><Note>完成凭证至少 5 张截图；实付 ≥200 元需连续录屏。交付后有 72 小时验收期，可申请售后或平台介入。</Note><button className="v31-link" onClick={() => open('rules')}>查看交易与售后规则 V3.1 ›</button></Panel><label className="v31-check"><input type="checkbox" checked={policy} onChange={e => setPolicy(e.target.checked)} />我已核对服务规格、完成时限并阅读交易规则</label><div className="v31-actions">{button(`模拟付款 ¥${money(order.amount)}`, () => { if (!policy) { setError('请先阅读并确认交易规则。'); return; } act({ type: 'pay', role: 'buyer', note: description }, 'detail'); }, true, order.stage !== 'unpaid')}</div><Note>设计预览不会扣款。正式下单需完成成年实名校验，并保存商品、规格及规则版本快照。</Note></>;
    if (view === 'evidence') { const completing = role === 'seller' && ((order.stage === 'serving' && !caseActive) || sale?.status === 'remedy'); return <><Panel><Product order={order} /></Panel><Panel title="已提交凭证"><EvidenceList files={order.evidence} /><Note>原始凭证保留，只可追加。对方查看脱敏内容。</Note></Panel>{sale && <Panel title="售后补充材料"><EvidenceList files={sale.evidence} /></Panel>}<Panel title={completing ? '提交完成凭证' : '追加凭证'}><Files value={uploads} onChange={setUploads} required={completing} video={order.amount >= 20000} /><label className="v31-field">交付说明<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="说明已完成的服务内容和对应证据" /></label></Panel>{button(completing ? '提交完成，进入验收' : '追加凭证', () => { const message = completing ? evidenceError(uploads, order.amount) : ''; if (message) { setError(message); return; } ask(completing ? '提交完成凭证？' : '追加证据？', completing ? '提交后开启 72 小时验收，不可删除或覆盖原件。' : '新增证据保留历史记录，不重置计时。', { type: completing ? 'complete' : 'append', role, evidence: uploads, description }, sale ? 'case' : 'detail'); }, true)}<Note>预览附件仅在本次会话中使用。实际系统需进行重复图片核查、脱敏和受控存储。</Note></>; }
    if (view === 'apply') return <><Panel><Product order={order} /></Panel><Panel title={sale?.status === 'requested' ? '修改售后申请' : '售后申请'}><div className="v31-segment">{[['full', '全额退款'], ['partial', '部分退款']].map(([id, label]) => <button key={id} aria-pressed={refundKind === id} onClick={() => setRefundKind(id)}>{label}</button>)}</div><label className="v31-field">申请金额（元）<input inputMode="decimal" value={refundKind === 'full' ? money(order.amount - order.refunded) : amount} readOnly={refundKind === 'full'} onChange={e => setAmount(e.target.value)} /></label><small>最多可退 ¥{money(order.amount - order.refunded)}</small><label className="v31-field">售后原因<select value={reason} onChange={e => setReason(e.target.value)}><option value="">请选择原因</option>{['尚未开始服务', '未按约定完成服务', '已交付内容不符', '商品无法使用', '卖家无法继续履约', '其他原因'].map(r => <option key={r}>{r}</option>)}</select></label><label className="v31-field">补充说明（选填）<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="说明遇到的问题与希望的处理方式" /></label><Files value={uploads} onChange={setUploads} /></Panel><Note>申请后进入售后中，整单冻结，卖家须在 24 个自然小时内处理。初次说明和证据可稍后补充。</Note><div className="v31-actions">{button('提交售后申请', () => act({ type: 'apply', role, amount: refundKind === 'full' ? order.amount - order.refunded : parseMoney(amount), reason, description, evidence: uploads }, 'case'), true)}</div><small>已发起 {order.caseCount}/3 次 · 本次已修改 {sale?.modifications ?? 0}/2 次</small></>;
    if (view === 'case') {
      if (!sale) return <Panel title="本单暂无售后">{button('查看订单', () => open('detail'))}{role === 'buyer' && button('申请售后', () => open('apply'), true)}</Panel>;
      return <><section className="v31-status"><span>售后单 {sale.id}</span><h2>{caseNames[sale.status]}</h2><p>{['processing', 'refunded', 'withdrawn'].includes(sale.status) ? '处理进度与资金结果分别记录' : `处理时限剩余 ${remaining(sale.deadline)}`}</p></section><Panel><Product order={order} /><Facts rows={[["申请金额", `¥${money(sale.requested)}`], ['售后原因', sale.reason], ['补充说明', sale.description || '未填写'], ['资金状态', activeCase(order) ? '整单冻结中' : '查看资金明细']]} /></Panel>
      {sale.proposal && <Panel title={sale.proposal.kind === 'remedy' ? '补充履约方案' : '部分退款方案'} aside={<small>第 {sale.round} 轮</small>}><h3>{sale.proposal.kind === 'partial' ? `协商退款 ¥${money(sale.proposal.amount)}` : sale.proposal.content}</h3><p>{sale.proposal.content}</p><Note>{sale.proposal.kind === 'partial' ? '同意并退款结算后，剩余履约义务结束。' : `同意后 ${sale.proposal.hours} 小时内完成。沿用本售后单，资金继续冻结。`}</Note>{role === 'buyer' && ['proposal','platform'].includes(sale.status) && <div className="v31-actions">{button('不同意方案', () => act({ type: 'rejectProposal', role }, 'case'))}{button('同意方案', () => ask('确认接受协商方案？', sale.proposal!.content, { type: 'acceptProposal', role }, 'case'), true)}</div>}</Panel>}
      {sale.status === 'rejected' && <Panel title="卖家拒绝原因"><p>{sale.rejection || '卖家认为已按约定履约'}</p><Note>可在 48 小时内申请平台介入，避免争议窗口过期。</Note></Panel>}
      {['remedy','remedyReceipt'].includes(sale.status) && <Panel title="补充履约进度"><Facts rows={[["约定内容", sale.proposal?.content || sale.remedyProposal?.content || '按双方确认内容完成'], ['当前状态', caseNames[sale.status]], ['截止时间', date(sale.status === 'remedyReceipt' ? order.confirmAt : sale.deadline)]]} /><Note>不撤销原售后单。补充交付后重新验收；再次争议直接交平台处理。</Note><div className="v31-actions">{button('查看凭证', () => open('evidence'))}{role === 'seller' && sale.status === 'remedy' && button('提交补充履约完成', () => open('evidence'), true)}{role === 'buyer' && sale.status === 'remedyReceipt' && <>{button('延长验收', () => act({ type: 'extend', role }), false, order.extensionUsed)}{button('确认补充履约', () => ask('确认补充履约已完成？', '原售后结案；本单未发生退款则按 10% 佣金结算。', { type: 'confirm', role }, 'detail'), true)}</>}</div></Panel>}
      {['platform','appeal'].includes(sale.status) && <Panel title={sale.status === 'appeal' ? `第 ${sale.appealLevel} 级复核` : '平台核验材料'}><Note>本轮举证 24 小时，材料齐全或截止后 24 小时内判责 / 复核。证据只可追加，客服主管可批准一次不超过 24 小时的延期。</Note><div className="v31-actions">{button('补充举证', () => open('evidence'), true)}{button('联系平台客服', () => open('support'))}</div></Panel>}
      {['ruling','final'].includes(sale.status) && <Panel title="平台已出具结果">{button('查看判责与申诉', () => open('ruling'), true)}</Panel>}
      {['processing','refunded'].includes(sale.status) && <Panel title="原路退款">{button('查看退款进度', () => open('refund'), true)}</Panel>}
      <Panel title="售后操作"><div className="v31-actions">
        {role === 'seller' && ['requested','second'].includes(sale.status) && <>{button('同意退款', () => ask('同意买家退款申请？', `申请金额 ¥${money(sale.requested)}，提交后等待渠道结果。`, { type: 'agree', role }, 'refund'), true)}{button('提出协商方案', () => open('proposal'))}{button('拒绝退款', () => open('reject'))}</>}
        {role === 'seller' && sale.status === 'platform' && button('提出协商方案', () => open('proposal'))}
        {role === 'buyer' && ['requested','proposal','second','rejected'].includes(sale.status) && button('修改申请', () => { open('apply'); setReason(sale.reason); setDescription(sale.description); setRefundKind('partial'); setAmount(money(sale.requested)); }, false, sale.modifications >= 2)}
        {role === 'buyer' && ['requested','proposal','second','rejected'].includes(sale.status) && button('撤销售后', () => ask('确认撤销售后？', '将恢复原履约状态；如已交付，剩余验收时间至少 24 小时。', { type: 'withdrawCase', role }, 'detail'))}
        {['requested','proposal','second','rejected','remedy','remedyReceipt'].includes(sale.status) && button('申请平台介入', () => open('intervene'))}
        {button('补充证据', () => open('evidence'))}{button('查看原订单', () => open('detail'))}
      </div><Note>{sale.status === 'requested' ? '卖家逾期未有效处理且无人申请介入，按规则视为同意买家诉求。聊天或上传材料不算有效处理。' : sale.status === 'proposal' ? '买家沉默不算同意；第一轮失败进入第二轮，第二轮失败转平台。' : '所有时间均按自然小时计算，含夜间、节假日。'}</Note></Panel><Panel title="处理记录">{timeline}</Panel></>;
    }
    if (view === 'proposal') return <><Panel><Product order={order} /></Panel><Panel title="协商方式"><div className="v31-segment">{(['partial','remedy'] as const).map(p => <button key={p} aria-pressed={proposalKind === p} onClick={() => setProposalKind(p)}>{p === 'partial' ? '部分退款' : '补充履约'}</button>)}</div>{proposalKind === 'partial' ? <label className="v31-field">协商退款金额（元）<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={`最多 ${money(sale?.requested ?? order.amount)}`} /></label> : <label className="v31-field">完成时限（小时，最多 168）<input type="number" min="1" max="168" value={hours} onChange={e => setHours(e.target.value)} /></label>}<label className="v31-field">具体方案<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={proposalKind === 'remedy' ? '写清补充服务内容、数量及完成标准' : '写清退款金额及剩余义务的处理方式'} /></label><Note>{proposalKind === 'remedy' ? '需买家明确同意，继续原售后单并保留冻结。' : '部分退款结算后，不再保留剩余履约义务。'}</Note></Panel>{button('发送协商方案', () => act({ type: 'propose', role, proposal: { kind: proposalKind, amount: parseMoney(amount), content: description, hours: Number(hours) } }, 'case'), true)}</>;
    if (['reject','intervene','appeal','special','support'].includes(view)) {
      const special = view === 'special'; const support = view === 'support';
      return <><Panel title={support ? '订单专属客服' : '关联交易'}><Product order={order} /><Note>{support ? '客服服务时间 09:00—24:00；订单及售后时限按自然小时计算。' : special ? '首次交易终结后 7 天内的严重问题由平台人工核查，提交不代表受理或自动退款。' : view === 'appeal' ? `第 ${(sale?.appealLevel ?? 0) + 1} 级申诉 · 二次申诉必须提供新证据。` : view === 'reject' ? '请根据实际履约说明拒绝理由，买家可继续申请平台介入。' : '双方均可主动申请介入，原订单与协商记录一并保留。'}</Note></Panel><Panel title="提交材料"><label className="v31-field">{support ? '咨询问题' : '具体原因'}<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="请描述问题、争议点和希望的处理方式" /></label><Files value={uploads} onChange={setUploads} /><Note>提交前请遮挡无关个人信息，不要填写账号密码。</Note></Panel><div className="v31-actions">{button(support ? '提交咨询预览' : '提交申请', () => { if (support) { if (!reason.trim()) { setError('请填写咨询问题。'); return; } setNotice('咨询材料预览已保存；未发送到真实客服。'); return; } act({ type: view === 'special' ? 'special' : view === 'reject' ? 'reject' : view === 'appeal' ? 'appeal' : 'intervene', role, reason, evidence: uploads }, special ? 'detail' : 'case'); }, true)}</div></>;
    }
    if (view === 'ruling') return <><section className="v31-status"><span>平台判责 · {sale?.id}</span><h2>{sale ? caseNames[sale.status] : '暂无处理结果'}</h2><p>处理结果、依据及申诉入口在同一页面保留</p></section><Panel title="判责结果"><Facts rows={[["建议退款", `¥${money(sale?.rulingAmount ?? 0)}`], ['已履约部分', '按有效凭证核验'], ['结果依据', '商品承诺、双方协商及交付证据'], ['申诉截止', date(sale?.deadline)], ['当前申诉级别', `${sale?.appealLevel ?? 0} / 2`]]} /><Note>此处为示例判责结果，由平台出具，买卖双方不能自行改写。</Note></Panel><Panel title="双方确认"><Facts rows={[["买家", sale?.acceptedBy.includes('buyer') ? '已认可' : '待回应'], ['卖家', sale?.acceptedBy.includes('seller') ? '已认可' : '待回应']]} /><Note>初判与一级复核需等待申诉窗口结束；双方认可可提前执行，单方认可不执行。二级复核为平台最终处理结果。</Note><div className="v31-actions">{button('认可处理结果', () => ask('认可平台处理结果？', '双方均认可后可提前执行；单方认可不触发结算。', { type: 'acceptRuling', role }, 'case'), true, !sale || sale.acceptedBy.includes(role) || !['ruling','final'].includes(sale.status))}{button('不认可，提交申诉', () => open('appeal'), false, !sale || sale.appealLevel >= 2 || !['ruling','final'].includes(sale.status))}</div></Panel></>;
    if (view === 'refund') return <><section className="v31-status"><span>原支付渠道退款</span><h2>{sale?.status === 'refunded' ? '已退款' : '退款处理中'}</h2><p>{sale?.status === 'refunded' ? '支付渠道已确认退款成功' : '已提交渠道，到账以支付渠道确认结果为准'}</p></section><Panel><div className="v31-money">¥{money(sale?.status === 'refunded' ? order.refunded : sale?.rulingAmount ?? 0)}</div><Facts rows={[["关联售后单", sale?.id || '—'], ['退回方式', '原支付渠道'], ['退款状态', sale?.status === 'refunded' ? '渠道已确认' : '等待渠道回执'], ['订单累计已退', `¥${money(order.refunded)}`]]} /><Note>处理异常时查询原退款记录，不重复提交；未收到渠道成功确认前不显示已退款。</Note></Panel><Panel title="结算规则"><Note>有效订单只要发生成功退款，整单佣金归零。卖家最终净额 = 实付金额 − 累计退款。</Note><button className="v31-link" onClick={() => open('funds')}>查看资金明细 ›</button></Panel><div className="v31-actions">{button('返回售后详情', () => open('case'))}{button('联系平台客服', () => open('support'))}</div></>;
    if (view === 'review') return <><Panel><Product order={order} /></Panel><Panel title={order.reviewed ? '已提交评价' : '服务体验如何？'}><div className="v31-rating" role="group" aria-label="评价星级">{[1,2,3,4,5].map(n => <button key={n} disabled={order.reviewed} aria-label={`${n} 星`} aria-pressed={(order.review?.stars ?? stars) >= n} onClick={() => setStars(n)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.2.9-4.5 4.4 1.1 6.2-5.5-2.9-5.5 2.9 1.1-6.2L3.1 9.5l6.2-.9Z" strokeLinejoin="round" strokeWidth="2" /></svg></button>)}</div><label className="v31-field">评价内容（选填）<textarea disabled={order.reviewed} value={order.review?.content ?? description} onChange={e => setDescription(e.target.value)} placeholder="说说实际服务体验" /></label><Note>评价截止 {date((order.terminatedAt ?? Date.now()) + 7 * 24 * HOUR)}。不评价也不影响结算，不自动好评。</Note></Panel>{canReview(order) && button('提交评价', () => act({ type: 'review', role, stars, content: description }, 'detail'), true)}</>;
    if (view === 'funds') return <><Panel title="订单结算"><Product order={order} /><Facts rows={[["买家实付", `¥${money(order.stage === "unpaid" || order.stage === "closed" ? 0 : order.amount)}`], ['累计成功退款', `− ¥${money(order.refunded)}`], [order.refunded ? '整单佣金（退款后归零）' : '平台佣金（10%）', `¥${money(funds.fee)}`], ['卖家净额', `¥${money(funds.net)}`]]} /></Panel><Panel title="资金去向"><div className="v31-money-grid"><div><small>可申请提现</small><b>¥{money(funds.available)}</b></div><div><small>售后冻结</small><b>¥{money(funds.frozen)}</b></div><div><small>待结算</small><b>¥{money(funds.pending)}</b></div></div><Note>金额为本笔订单示例，不是账户余额。可提现表示可以发起申请，不保证即时到账；独立风险冻结不会随售后结束解除。</Note></Panel><Panel title="账务记录"><div className="v31-ledger"><b>支付入账</b><span>¥{order.stage === 'unpaid' ? '0.00' : money(order.amount)}</span></div>{order.refunded > 0 && <><div className="v31-ledger"><b>渠道退款成功</b><span>−¥{money(order.refunded)}</span></div><div className="v31-ledger"><b>原佣金冲正</b><span>¥{money(Math.round(order.amount * .1))}</span></div></>}<Note>保留原始流水，变更产生调整记录。实际金额由支付与结算账本核验。</Note></Panel>{button('查看订单', () => open('detail'))}</>;
    return <><Panel title="V3.1 · 本订单规则快照"><Note>对应《熊崽电竞完整交易售后体系 V3.1》。以下为关键规则摘要，完整条款以确认版本为准。</Note></Panel>{rules.map(([title, text]) => <Panel title={title} key={title}><p>{text}</p></Panel>)}</>;
  };
  return <div ref={screenRef} className={`app-screen v31-screen v31-role-${role}`}>
    <header className="v31-header"><button aria-label="返回上一页" onClick={back}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button><h1>{titles}</h1><button onClick={() => onRole(role === 'buyer' ? 'seller' : 'buyer')}>{role === 'buyer' ? '卖家视角' : '买家视角'}</button></header>
    <div className="v31-preview-label"><span>V3.1 交互预览</span><small>示例订单 · 不操作真实资金</small></div>
    {error && <p ref={alertRef} tabIndex={-1} role="alert" className="v31-error">{error}</p>}{notice && <p role="status" className="v31-notice">{notice}</p>}
    <div className="v31-content">{render()}</div>{nav}
    {moreOrderId && (() => { const target = store.orders.find(o => o.id === moreOrderId); const host = screenRef.current?.closest(".phone-shell"); if (!target || !host) return null; return createPortal(<div className="v31-overlay flow-overlay v31-more-overlay" role="dialog" aria-modal="true" aria-label="更多订单操作"><section className="v31-dialog"><h2>更多操作</h2><p>{target.title}</p><div className="v31-more-list">{buyerCardActions(target).more.map(item => renderCardAction(target, item))}</div><button type="button" className="v31-more-close" onClick={() => setMoreOrderId(null)}>取消</button></section></div>, host); })()}
    {confirm && screenRef.current?.closest(".phone-shell") && createPortal(<div className="v31-overlay flow-overlay" role="dialog" aria-modal="true" aria-labelledby="v31-confirm-title"><section className="v31-dialog"><h2 id="v31-confirm-title">{confirm.title}</h2><p>{confirm.text}</p><div className="v31-actions">{button('暂不操作', () => setConfirm(null))}{button('确认', () => act(confirm.action, confirm.next, confirm.orderId), true)}</div></section></div>, screenRef.current.closest(".phone-shell")!)}
  </div>;
}
