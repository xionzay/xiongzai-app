'use client';
/* Local user-supplied evidence has no caption track; preserve its original content. */
/* eslint-disable jsx-a11y/media-has-caption */
import { ThemedFilePicker } from '../ui/ThemedFilePicker';
import { OrderSellerLink } from '../ui/OrderSellerLink';
import { previewCompanions } from '../local-catalog-data';
import { CartoonIcon } from "../ui/CartoonIcon";
import { CartoonSelect } from "../ui/CartoonSelect";
import { OrderCouponPicker } from '../OrderCouponPicker';
import { usePreviewState, usePreviewFile, savePreviewFile } from './preview-storage';
import { SellerSearch, SellerSearchIcon, useSellerNotice, useSellerPresence, useSellerViewMotion } from '../seller-workbench/SellerUi';
import { OrderConversation } from '../seller-workbench/OrderConversation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sellerMatches, sellerPrimaryAction, sellerDeadline } from '../seller-workbench/model';
import { canReview, buyerCardActions, buyerListLabel, buyerMatchesTab, type BuyerCardAction } from './card-actions';
import { activeCase, canAppendEvidence, caseLabel, orderSecondaryLabel, advanceDeadlines, paidAmount, caseNames, createSamples, evidenceError, HOUR, money, orderLabel, parseMoney, settlement, transition, type Evidence, type Role, type TradeAction, type TradeOrder } from './model';

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
  const [orders, setOrders, orderStorageError] = usePreviewState<TradeOrder[]>('orders-v2', () => createSamples());
  const [selected, setSelected] = useState('XZ310001');
  const [sellerNotes, setSellerNotes, noteStorageError] = usePreviewState<Record<string, string>>('seller-notes', {});
  const [messages, setMessages, messageStorageError] = usePreviewState<Record<string, { role: Role; text: string; sentAt?: number }[]>>('messages', {});
  useEffect(() => { const timer = setInterval(() => setOrders(rows => { const next = rows.map(o => advanceDeadlines(o)); return JSON.stringify(next) === JSON.stringify(rows) ? rows : next; }), 1000); return () => clearInterval(timer); }, []);
  const currentOrders = useRef(orders); useEffect(()=>{currentOrders.current=orders;},[orders]);
  const dispatch = (action: TradeAction, orderId = selected) => {
    const order = currentOrders.current.find(o => o.id === orderId)!;
    const updated = transition(order, action);
    currentOrders.current = currentOrders.current.map(o => o.id === orderId ? updated : o);
    setOrders(currentOrders.current);
    return updated;
  };
  const messageTarget = useRef<{ orderId: string; index: number } | null>(null);
  const buyerList = useRef({ filter: '全部', query: '', sort: '优先处理', scroll: 0, searchOpen: false });
  const sellerList = useRef({ filter: '全部', query: '', sort: '优先处理', scroll: 0, searchOpen: false });
  return { storageError: orderStorageError || noteStorageError || messageStorageError, messageTarget, clearMessageTarget: () => { messageTarget.current = null; }, buyerList, sellerList, orders, selected, setSelected, setOrders, dispatch, sellerNotes, setSellerNotes, messages, setMessages };
}
export type TradeStore = ReturnType<typeof useTradePreview>;
// Recover only known fixture avatars for older saved preview orders, using their stable order ID.
const previewSellerSnapshots = new Map(createSamples(0).map(order => [order.id, order]));
function sellerAvatar(order: TradeOrder) {
  if (order.sellerAvatar) return order.sellerAvatar;
  const profile = previewCompanions.find(seller => seller.id === order.sellerId);
  if (profile) return profile.image;
  const snapshot = previewSellerSnapshots.get(order.id);
  return snapshot?.seller === order.seller ? snapshot.sellerAvatar : undefined;
}
function refundSummary(order: TradeOrder, amount: number, basis = '按买家申请处理；已认可的交付与成本以双方记录为准。') { return `本次退款 ¥${money(amount)}；退款后保留金额 ¥${money(order.amount - order.refunded - amount)}。${basis} 退款成功后剩余履约义务终止。本地预览不会实际提交支付渠道。`; }
const date = (time?: number) => time ? new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
function remaining(deadline?: number) { const hours = Math.max(0, Math.ceil(((deadline ?? 0) - Date.now()) / 60000)); return hours ? `${Math.floor(hours / 60)} 小时 ${hours % 60} 分` : '时限已到，等待处理结果'; }
function Panel({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) { return <section className="v31-panel">{title && <header><h2>{title}</h2>{aside}</header>}{children}</section>; }
function Facts({ rows }: { rows: [string, ReactNode][] }) { return <dl className="v31-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function Product({ order }: { order: TradeOrder }) { return <div className="v31-product"><img src={order.cover} alt={order.title} /><div><b>{order.title}</b><small>{order.spec}</small><span>{order.stage === 'unpaid' ? '待支付' : order.stage === 'closed' ? '未支付' : '实付'} <strong>¥{money(order.stage === 'closed' ? 0 : order.amount)}</strong><small> ×{order.quantity ?? 1}</small></span></div></div>; }
function Note({ children }: { children: ReactNode }) { return <p className="v31-note">{children}</p>; }
function EvidenceMedia({ file }: { file: Evidence }) {
  const media = usePreviewFile(file.digest, file.url);
  return <div>{media.error ? <p role="alert">{media.error}<button className="toon-action" type="button" onClick={media.retry}>重试</button></p> : media.url ? file.kind === 'video' ? <video controls preload="metadata" src={media.url} aria-label={file.name} style={{ width: '100%' }} /> : <a href={media.url} target="_blank" rel="noreferrer" aria-label={`放大查看 ${file.name}`}><img src={media.url} alt={file.name} style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }} /></a> : <small>{file.sample ? '示例占位，无原始文件' : '正在读取附件…'}</small>}</div>;
}
function Files({ value, onChange, required = false, video = false, mandatory = false, imagesOnly = false }: { imagesOnly?: boolean; value: Evidence[]; onChange: (value: Evidence[]) => void; required?: boolean; video?: boolean; mandatory?: boolean }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const latest = useRef(value); useEffect(()=>{latest.current=value;},[value]);
  return <div className="v31-files"><p>{required ? `至少 5 张有效截图${video ? '，另需连续录屏' : ''}` : mandatory ? '相关图片或视频（必填）' : imagesOnly ? '评价图片（选填）' : '补充图片或视频（选填）'}</p><ThemedFilePicker disabled={busy} aria-label="选择证据文件" accept={imagesOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,video/mp4,video/webm"} multiple onChange={async event => {
    const files = Array.from(event.target.files ?? []); event.target.value = ''; setBusy(true); setError('');
    const additions: Evidence[] = [], failures: string[] = [];
    for (const file of files) {
      if ((imagesOnly && !file.type.startsWith('image/')) || !['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type) || file.size > 100 * 1024 * 1024 || !file.size) { failures.push(`${file.name}：请选择有效图片或视频，每份不超过 100MB`); continue; }
      try { const digest = await savePreviewFile(file); if (![...latest.current, ...additions].some(v => v.digest === digest)) additions.push({ id: digest, digest, name: file.name, kind: file.type.startsWith('video') ? 'video' : 'image' }); }
      catch { failures.push(`${file.name}：保存失败，请重新选择重试`); }
    }
    onChange([...latest.current, ...additions]); setError(failures.join('；')); setBusy(false);
  }}>{busy ? '正在保存本地附件…' : imagesOnly ? '选择图片' : '选择图片 / 视频'}</ThemedFilePicker>{error && <p role="alert" className="v31-error">{error}</p>}
  <div className="v31-file-grid">{value.map(file => <div key={file.id}><EvidenceMedia file={file} /><small>{file.name}</small><button className="v31-remove-file" disabled={busy} type="button" aria-label={`移除${file.name}`} onClick={() => onChange(value.filter(v => v.id !== file.id))}><CartoonIcon kind="close" /></button></div>)}</div>
  <small>附件保存在此浏览器的本地预览中，不上传服务器；清除浏览器数据会删除附件。</small></div>;
}
function EvidenceList({ files }: { files: Evidence[] }) {
  return files.length ? <div className="v31-evidence-list">{files.map((f, i) => <div key={`${f.id}-${i}`}><b>{f.kind === 'video' ? '连续录屏' : `截图 ${i + 1}`}</b><EvidenceMedia file={f} /><small>{f.name}{f.sample ? ' · 示例占位' : ''}</small></div>)}</div> : <Note>暂无已提交凭证。</Note>;
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

export function TradeWorkspace({ role, store, entry = 'orders', suffix, initialFilter = '全部', nav, onExit, onShop }: { role: Role; store: TradeStore; entry?: TradeView; suffix?: string; initialFilter?: string; nav: ReactNode; onExit: () => void; onRole: (role: Role) => void; onLegacy?: () => void; onShop?: (id:string) => void }) {
  const listState = role === 'seller' ? store.sellerList : store.buyerList;
  const [view, setView] = useState<TradeView>(entry);
  const [history, setHistory] = useState<TradeView[]>([]);
  const [filter, setFilter] = useState(!initialFilter ? listState.current.filter : initialFilter === '新订单' || initialFilter === '待接单' ? '待服务' : initialFilter === '待确认' ? '待收货' : initialFilter === '售后' ? '售后中' : initialFilter);
  const [query, setQuery] = useState(!initialFilter ? listState.current.query : '');
  const [searchOpen, setSearchOpen] = useState(!initialFilter && listState.current.searchOpen);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [uploads, setUploads] = useState<Evidence[]>([]); const [reason, setReason] = useState(''); const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(''); const [refundKind, setRefundKind] = useState('full');
  const [proposalKind, setProposalKind] = useState<'partial' | 'remedy'>('partial'); const [hours, setHours] = useState('24');
  const [anonymous, setAnonymous] = useState(false);
  const [stars, setStars] = useState(0); const [policy, setPolicy] = useState(false);
  const [moreOrderId, setMoreOrderId] = useState<string | null>(null);
  const [sellerSort, setSellerSort] = useState(role === 'seller' ? store.sellerList.current.sort : '优先处理');
  const [notesOrder, setNotesOrder] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: TradeAction; next?: TradeView; orderId?: string } | null>(null);
  const screenRef = useRef<HTMLDivElement>(null); const alertRef = useRef<HTMLParagraphElement>(null);
  useSellerViewMotion(screenRef, view, history.length, role === 'seller');
  useSellerNotice(notice, setNotice, true);
  const confirmPresence = useSellerPresence(confirm, role === 'seller');
  const notesPresence = useSellerPresence(notesOrder, role === 'seller');
  const confirmShown = confirmPresence.shown, notesShown = notesPresence.shown;
  const scrollPositions = useRef<Partial<Record<TradeView, number>>>({ orders: !initialFilter ? listState.current.scroll : 0 });
  useLayoutEffect(() => { screenRef.current?.scrollTo(0, scrollPositions.current[view] ?? 0); }, [view]);
  useLayoutEffect(() => {
    if (view !== 'orders') return;
    const tabs = screenRef.current?.querySelector<HTMLElement>('.v31-tabs');
    const selected = tabs?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!tabs || !selected) return;
    const bounds = tabs.getBoundingClientRect();
    const active = selected.getBoundingClientRect();
    if (active.left < bounds.left || active.right > bounds.right) tabs.scrollLeft += active.left - bounds.left - 12;
  }, [role, view, filter]);
  const rememberList = () => { if (view === 'orders') listState.current = { filter, query, searchOpen, sort: sellerSort, scroll: screenRef.current?.scrollTop ?? 0 }; };
  useEffect(() => { rememberList(); });
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(id); }, []);
  void tick;
  const order = store.orders.find(o => o.id === store.selected) ?? store.orders[0];
  const sale = order.sale; const funds = settlement(order);
  useEffect(() => {
    if (!suffix) return;
    const index = ({ Checkout: store.selected.startsWith('XZ31P') ? undefined : 7, Evidence: role === 'seller' ? 1 : 2, Apply: 0, Case: 3, Remedy: 11, RemedyReceipt: 12, SecondAppeal: 13, Rejected: 14, Platform: 5, Ruling: 8, Refund: 9, Review: 6, Special: 6, Funds: 10 } as Record<string, number>)[suffix];
    if (index !== undefined) store.setSelected(store.orders[index]?.id ?? store.orders[0].id);
    // Entry selection runs only when the catalog mounts this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  useEffect(() => { if (!confirm && !moreOrderId && !notesOrder) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setConfirm(null); setMoreOrderId(null); setNotesOrder(null); } }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [confirm, moreOrderId, notesOrder]);
  useEffect(() => {
    if (!confirm && !moreOrderId && !notesOrder) return;
    const screen = screenRef.current; if (!screen) return;
    const previous = screen.style.overflowY; screen.style.overflowY = 'hidden';
    return () => { screen.style.overflowY = previous; };
  }, [confirm, moreOrderId, notesOrder]);
  const open = (next: TradeView) => { scrollPositions.current[view] = screenRef.current?.scrollTop ?? 0; rememberList(); setMoreOrderId(null); setHistory(h => [...h, view]); setView(next); setError(''); setNotice(''); setUploads([]); setReason(''); setDescription(''); setAmount(''); if(next === 'review'){setStars(0);setAnonymous(false);} };
  const back = () => { if (!history.length) { if (view === 'orders' || (role === 'seller' && entry !== 'orders')) onExit(); else setView('orders'); } else { setView(history[history.length - 1]); setHistory(h => h.slice(0, -1)); } setError(''); setUploads([]); };
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
    {role === 'seller' && button('联系买家', () => open('merchant'))}
    {role === 'buyer' && !caseActive && ['waiting', 'serving', 'receipt'].includes(order.stage) && button('申请售后', () => open('apply'))}
    {caseActive && button('查看售后', () => open('case'), true)}
    {button('联系平台客服', () => open('support'))}
  </div>;
  const titles = role === 'seller' && view === 'merchant' ? '联系买家' : view === 'orders' && role === 'seller' ? '订单管理' : viewTitles[view];
  const render = () => {
    if (view === 'orders') {
      const tabs = ['全部', '待付款', '待服务', '服务中', '待收货', '待评价', '售后中', '已完成', ...(role === 'seller' ? ['已退款', '已关闭'] : [])];
      const shown = store.orders.filter(o => (role === 'buyer' ? buyerMatchesTab(o, filter) : sellerMatches(o, filter)) && `${o.title}${role === 'seller' ? o.buyer : o.seller}${o.id}`.includes(query));
      if (role === 'seller') shown.sort((a, b) => sellerSort === '最新付款' ? b.paidAt - a.paidAt : sellerDeadline(a) - sellerDeadline(b));
      return <><SellerSearch open={searchOpen} query={query} onChange={setQuery} onClose={() => setSearchOpen(false)} label="搜索订单" placeholder={role === 'seller' ? "搜索商品、买家或订单号" : "搜索商品、店铺或订单号"} /><div className="v31-tabs" role="tablist" aria-label="订单状态">{tabs.map(tab => <button role="tab" aria-selected={filter === tab} className={filter === tab ? 'active' : ''} key={tab} onClick={() => setFilter(tab)}>{tab}{role === 'seller' && <small>（{store.orders.filter(o => sellerMatches(o, tab)).length}）</small>}</button>)}</div>
      <div className="v31-list-summary"><span>{shown.length} 笔订单</span>{role === 'seller' && <CartoonSelect aria-label="订单排序" value={sellerSort} onChange={e => setSellerSort(e.target.value)}><option>优先处理</option><option>最新付款</option></CartoonSelect>}<button onClick={() => open('rules')}>交易保障与售后规则 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></div>
      {shown.map(o => {
        if (role === 'seller') {
          const primary = sellerPrimaryAction(o);
          const selectView = (next: TradeView) => { store.setSelected(o.id); open(next); };
          return <div className="v31-order-card v31-seller-card" data-order-id={o.id} key={o.id} role="link" tabIndex={0} aria-label={`打开订单 ${o.id}`} onKeyDown={event=>{if(event.target===event.currentTarget&&event.key==='Enter'){store.setSelected(o.id);open('detail')}}} onClick={event => { if (!(event.target as HTMLElement).closest('button,a,input,select')) { store.setSelected(o.id); open('detail'); } }}>
            <header><button className="v31-contact-buyer" onClick={() => selectView('merchant')}>{o.buyer} · 联系 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button><b>{orderLabel(o)}{orderSecondaryLabel(o) && <small> · {orderSecondaryLabel(o)}</small>}</b></header>
            <button className="v31-product-link" aria-label={`打开订单 ${o.id}：${o.title}`} onClick={() => selectView('detail')}><div className="sw-order-product"><img src={o.cover} alt="" /><div><b>{o.title}</b><small>{o.spec}</small></div><aside><strong>¥{money(o.unitPrice ?? Math.round(o.amount / (o.quantity ?? 1)))}</strong><small>×{o.quantity ?? 1}</small></aside></div></button>
            <div className="sw-order-paid">{o.stage === 'unpaid' ? '待支付' : '买家实付'} <strong>¥{money(o.stage === 'unpaid' ? o.amount : paidAmount(o))}</strong></div>
            <div className={`v31-card-note ${sellerDeadline(o) <= Date.now() ? 'sw-deadline-overdue' : sellerDeadline(o) - Date.now() <= 2 * HOUR ? 'sw-deadline-urgent' : ''}`}>{activeCase(o) ? `${caseLabel(o.sale!, role)} · ${o.sale!.status === 'processing' ? '等待渠道确认' : remaining(o.sale!.deadline)}` : o.stage === 'receipt' ? `验收剩余 ${remaining(o.confirmAt)}` : ['waiting','serving'].includes(o.stage) ? `完成剩余 ${remaining(o.promiseAt)} · ${date(o.promiseAt)}前` : o.stage === 'unpaid' ? '付款后开始计算完成时限' : '交易已结束，可查看结算明细'}</div>
            {store.sellerNotes[o.id] && <p className="v31-private-note">备注（仅商家可见）：{store.sellerNotes[o.id]}</p>}
            <footer className="v31-card-actions"><button onClick={() => { setNotesOrder(o.id); setNoteDraft(store.sellerNotes[o.id] ?? ''); }}>备注</button><div className="v31-card-buttons">{primary.id !== 'contact' && button(primary.label === '提交完成凭证' ? '提交凭证' : primary.label, () => {
              store.setSelected(o.id);
              if (primary.id === 'start') setConfirm({ title: '确认开始服务？', text: '开始后不可撤回，承诺完成时间保持不变。', action: { type: 'start', role: 'seller' }, orderId: o.id });
              else open(primary.id === 'contact' ? 'merchant' : primary.id);
            }, !primary.label.startsWith('查看'))}</div></footer>
          </div>;
        }
        const actions = buyerCardActions(o);
        const note = o.sale && activeCase(o) ? o.sale.status === 'remedyReceipt' ? `补充履约待验收 · 剩余 ${remaining(o.confirmAt)}` : caseLabel(o.sale, role) : o.stage === 'receipt' ? `卖家已提交凭证 · 验收剩余 ${remaining(o.confirmAt)}` : o.stage === 'unpaid' ? '付款后开始计算完成时限' : o.stage === 'review' && buyerListLabel(o) === '待评价' ? `评价截止 ${date((o.terminatedAt ?? 0) + 7 * 24 * HOUR)}` : ['review', 'done'].includes(o.stage) ? o.reviewed ? '交易已完成 · 已评价' : '交易已完成 · 未评价' : o.stage === 'closed' ? '订单已取消，未付款' : `承诺完成 ${date(o.promiseAt)}`;
        return <div className="v31-order-card v31-buyer-card" data-order-id={o.id} key={o.id} role="link" tabIndex={0} aria-label={`打开订单 ${o.id}`} onKeyDown={event=>{if(event.target===event.currentTarget&&event.key==='Enter'){store.setSelected(o.id);open('detail')}}} onClick={event => { if (!(event.target as HTMLElement).closest('button,a,input,select')) { store.setSelected(o.id); open('detail'); } }}>
          <header><OrderSellerLink name={o.seller} avatarSrc={sellerAvatar(o)} avatarFileId={o.sellerAvatarFileId} onOpen={() => { if(o.sellerId && onShop) { rememberList(); onShop(o.sellerId); } else setNotice("此历史示例没有关联店铺 ID，不能跳转真实店铺。"); }} /><b>{buyerListLabel(o)}</b></header>
          <button type="button" className="v31-product-link v31-card-open" aria-label={`打开订单 ${o.id}：${o.title}`} onClick={() => { store.setSelected(o.id); open('detail'); }}><Product order={o} /></button>
          {o.refunded > 0 && <div className="v31-card-refund">累计已退 ¥{money(o.refunded)}</div>}
          <div className="v31-card-note">{note}</div>
          {o.lastReminderAt && o.lastReminderAt + 24 * HOUR > Date.now() && ['waiting', 'serving'].includes(o.stage) && !activeCase(o) && <div className="v31-card-note">已催服务 · 下次可催 {date(o.lastReminderAt + 24 * HOUR)}</div>}
          <footer className="v31-card-actions">{actions.more.length > 0 && <button type="button" className="v31-more-trigger" aria-label={`更多操作 ${o.id}`} aria-haspopup="dialog" onClick={() => { store.setSelected(o.id); setMoreOrderId(o.id); }}>更多</button>}<div className="v31-card-buttons">{actions.visible.map(item => renderCardAction(o, item))}</div></footer>
        </div>;
      })}
      {!shown.length && <Panel><div className="v31-empty"><img src="/assets/xiongzai-icon.png" alt="" /><h2>暂无此类订单</h2><p>试试其他状态或搜索关键词。</p>{button('查看全部', () => { setFilter('全部'); setQuery(''); })}</div></Panel>}
      </>;
    }
    if (view === 'detail') return <>{!!order.requiredFields?.length && order.stage !== 'unpaid' && <Panel title="下单资料"><Facts rows={order.requiredFields.map(field => [field.label, order.buyerInfo?.[field.id] || '未填写'])} /></Panel>}<section className="v31-status"><span>订单 {order.id}</span><h2>{role === 'buyer' ? buyerListLabel(order) : orderLabel(order)}</h2><p>{caseActive ? `${caseLabel(sale!, role)} · ${sale!.status === 'processing' ? '等待支付渠道确认' : '相关资金冻结中'}` : order.stage === 'waiting' ? '付款成功，等待卖家开始服务' : order.stage === 'serving' ? '卖家正在履约，完成后请核验交付凭证' : order.stage === 'receipt' ? `请在 ${remaining(order.confirmAt)} 内验收` : order.stage === 'unpaid' ? '核对服务内容和规格后付款' : '交易记录与凭证可在此查看'}</p></section>
      <div className="v31-steps">{['待服务', '服务中', '待收货', '待评价', '已完成'].map((s, i) => <span className={['waiting','serving','receipt','review','done'].indexOf(order.stage) >= i ? 'active' : ''} key={s}><i>{i + 1}</i>{s}</span>)}</div>
      <Panel><Product order={order} /><Facts rows={[[role === 'buyer' ? '卖家' : '买家', role === 'buyer' ? order.seller : order.buyer], ['承诺完成', `${date(order.promiseAt)}${caseActive ? '（售后暂停，恢复后顺延）' : ''}`], ['服务规格', order.spec], ['买家留言', order.note || '未填写'], ['交易规则', <button key="rules" onClick={() => open('rules')}>V3.1 · 查看快照 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button>]]} /></Panel>
      {role === 'seller' && <Panel title="商家备注" aside={<button onClick={() => { setNotesOrder(order.id); setNoteDraft(store.sellerNotes[order.id] ?? ''); }}>编辑 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button>}><Note>{store.sellerNotes[order.id] || '暂无备注'} · 仅商家可见</Note></Panel>}
      <Panel><details><summary>履约凭证 · {order.evidence.length} 份</summary><EvidenceList files={order.evidence}/><button className="toon-link" type="button" onClick={()=>open('evidence')}><span>凭证管理</span><CartoonIcon kind="back" className="toon-link-arrow" /></button><Note>{order.evidence.length ? `已提交 ${order.evidence.length} 份凭证。${!activeCase(order) && canAppendEvidence(order, role) ? '追加不会重置验收倒计时。' : '此处可查看已提交的交付记录。'}` : '卖家提交完成时须提供有效凭证，开始服务不代表已经交付。'}</Note></details></Panel>
      {canReceipt && <Panel title={sale?.status === 'remedyReceipt' ? '补充履约验收' : '收货确认'}><Facts rows={[["剩余验收时间", remaining(order.confirmAt)], ['延长机会', order.extensionUsed ? '已使用 +24 小时' : '本单剩余 1 次 · +24 小时']]} /><Note>普通售后暂停验收计时；确认收货后结算，评价不影响结算。</Note></Panel>}
      <Panel title="订单信息"><Facts rows={[["支付时间", order.stage === "unpaid" || order.stage === "closed" ? "未支付" : date(order.paidAt)], ['实付金额', `¥${money(order.stage === 'unpaid' || order.stage === 'closed' ? 0 : order.amount)}`], ['累计退款', `¥${money(order.refunded)}`], ['资金状态', funds.frozen ? '售后冻结中' : funds.available ? '已结算' : '待结算']]} /><button className="v31-link" onClick={() => open('funds')}>查看费用与资金明细 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></Panel>
      <Panel><details><summary>售后记录</summary>{[...(order.caseHistory??[]),...(order.sale?[order.sale]:[])].map(c=><article key={c.id}><b>{caseLabel(c,role)}</b><p>{c.reason}</p></article>)}</details></Panel><Panel><details><summary>时间与处理记录</summary>{timeline}</details></Panel>
      <div className="v31-actions">
        {role === 'buyer' && order.stage === 'unpaid' && <>{button('取消订单', () => ask('取消未付款订单？', '取消后不会扣款。', { type: 'cancel', role }))}{button('去付款', () => open('checkout'), true)}</>}
        {role === 'seller' && order.stage === 'waiting' && !caseActive && button('开始服务', () => ask('确认开始服务？', '开始后不可撤回，承诺完成时间保持不变。', { type: 'start', role }), true)}
        {role === 'seller' && (order.stage === 'serving' && !caseActive || sale?.status === 'remedy') && button('提交完成凭证', () => open('evidence'), true)}
        {role === 'buyer' && canReceipt && <>{button('延长收货', () => ask('延长 24 小时？', `每个订单仅能使用一次，补充履约共用次数。新的验收截止：${date((order.confirmAt ?? 0) + 24 * HOUR)}。`, { type: 'extend', role }), false, order.extensionUsed)}{button('确认收货', () => ask('确认已完成交付？', '确认后交易完成并结算，普通售后入口关闭。严重问题可在首次交易终结后 7 天内联系平台客服。涉及账号交付时，请完成改密、解绑和退出其他设备。', { type: 'confirm', role }), true)}</>}
        {role === 'buyer' && canReview(order) && button('评价服务', () => open('review'), true)}
        {order.terminatedAt && button('交易终结后申诉', () => open('special'))}
      </div>{aftersaleButtons}</>;
    if (view === 'merchant') return <OrderConversation order={order} orders={store.orders.filter(item => (item.buyerId ?? item.id) === (order.buyerId ?? order.id) && (role === 'seller' || item.seller === order.seller))} viewerRole={role} store={store} openOrder={id => { store.setSelected(id); open('detail'); }} />;
    if (view === 'checkout') return <><Panel><Product order={order} /></Panel><Panel title="服务信息"><Facts rows={[["服务内容", order.spec], ['完成时限', `付款成功后 ${order.promiseHours ?? 24} 小时内`], ['付款金额', `¥${money(order.amount)}`]]} /><Note>具体需求请通过聊天与卖家沟通。</Note><OrderCouponPicker /></Panel><Panel title="交易保障"><Note>完成凭证至少 5 张截图；实付 ≥200 元需连续录屏。交付后有 72 小时验收期，可申请售后或平台介入。</Note><button className="v31-link" onClick={() => open('rules')}>查看交易与售后规则 V3.1 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></Panel><label className="v31-check"><input type="checkbox" checked={policy} onChange={e => setPolicy(e.target.checked)} />我已核对服务规格、完成时限并阅读交易规则</label><div className="v31-actions">{button(`模拟付款 ¥${money(order.amount)}`, () => { if (!policy) { setError('请先阅读并确认交易规则。'); return; } act({ type: 'pay', role: 'buyer', note: '', buyerInfo: {} }, 'detail'); }, true, order.stage !== 'unpaid')}</div><Note>设计预览不会扣款。正式下单需完成成年实名校验，并保存商品、规格及规则版本快照。</Note></>;
    if (view === 'evidence') { const completing = role === 'seller' && ((order.stage === 'serving' && !caseActive) || sale?.status === 'remedy'); const canAppend = completing || canAppendEvidence(order, role); return <><Panel><Product order={order} /></Panel><Panel title="已提交凭证"><EvidenceList files={order.evidence} /><Note>{canAppend ? "原始凭证保留，只可追加。请勿上传明文密码、卡密或他人隐私。" : "当前身份、阶段或举证期限不允许追加，已提交材料仍可查看。"}</Note></Panel>{sale && <Panel title="售后补充材料"><EvidenceList files={sale.evidence} /></Panel>}{canAppend && <><Panel title={completing ? '提交完成凭证' : '追加凭证'}><Files value={uploads} onChange={setUploads} required={completing} video={order.amount >= 20000} /><label className="v31-field">交付说明<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="说明已完成的服务内容和对应证据" /></label></Panel>{button(completing ? '提交完成，进入验收' : '追加凭证', () => { const message = completing ? evidenceError(uploads, order.amount) : ''; if (message) { setError(message); return; } ask(completing ? '提交完成凭证？' : '追加证据？', completing ? '提交后开启 72 小时验收，不可删除或覆盖原件。' : '新增证据保留历史记录，不重置计时。', { type: completing ? 'complete' : 'append', role, evidence: uploads, description }, sale ? 'case' : 'detail'); }, true)}</>}<Note>本地附件可在此浏览器刷新后查看；正式交易仍需授权存储、脱敏与访问日志。</Note></>; }
    if (view === 'apply') return <><Panel><Product order={order} /></Panel><Panel title={sale?.status === 'requested' ? '修改售后申请' : '售后申请'}><div className="v31-segment">{[['full', '全额退款'], ['partial', '部分退款']].map(([id, label]) => <button key={id} aria-pressed={refundKind === id} onClick={() => setRefundKind(id)}>{label}</button>)}</div><label className="v31-field">申请金额（元）<input inputMode="decimal" value={refundKind === 'full' ? money(order.amount - order.refunded) : amount} readOnly={refundKind === 'full'} onChange={e => setAmount(e.target.value)} /></label><small>最多可退 ¥{money(order.amount - order.refunded)}</small><label className="v31-field">售后原因<CartoonSelect aria-label="售后原因" value={reason} onChange={e => setReason(e.target.value)}><option value="">请选择原因</option>{['尚未开始服务', '未按约定完成服务', '已交付内容不符', '商品无法使用', '卖家无法继续履约', '其他原因'].map(r => <option key={r}>{r}</option>)}</CartoonSelect></label><label className="v31-field">补充说明（选填）<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="说明遇到的问题与希望的处理方式" /></label><Files value={uploads} onChange={setUploads} /></Panel><Note>申请后进入售后中，整单冻结，卖家须在 24 个自然小时内处理。初次说明和证据可稍后补充。</Note><div className="v31-actions">{button('提交售后申请', () => act({ type: 'apply', role, amount: refundKind === 'full' ? order.amount - order.refunded : parseMoney(amount), reason, description, evidence: uploads }, 'case'), true)}</div><small>已发起 {order.caseCount}/3 次 · 本次已修改 {sale?.modifications ?? 0}/2 次</small></>;
    if (view === 'case') {
      if (!sale) return <Panel title="本单暂无售后">{button('查看订单', () => open('detail'))}{role === 'buyer' && button('申请售后', () => open('apply'), true)}</Panel>;
      return <><section className="v31-status"><span>售后单 {sale.id}</span><h2>{caseLabel(sale, role)}</h2><p>{['refundPending', 'processing', 'refunded', 'withdrawn', 'resolved'].includes(sale.status) ? '处理进度与资金结果分别记录' : `处理时限剩余 ${remaining(sale.deadline)}`}</p></section><div className="sw-case-progress" aria-label="售后处理进度">{['申请售后', '双方协商', '平台处理', '处理结果'].map((label, index) => { const step = ['refunded','withdrawn','resolved'].includes(sale.status) ? 3 : ['platform','appeal','ruling','final','processing'].includes(sale.status) ? 2 : sale.status === 'requested' ? 0 : 1; return <span className={index <= step ? 'active' : ''} key={label}><i>{index < step ? <CartoonIcon kind="check" className="toon-glyph" label="已选" /> : index + 1}</i>{label}</span>; })}</div><Panel><Product order={order} /><Facts rows={[["申请金额", `¥${money(sale.requested)}`], ['售后原因', sale.reason], ['补充说明', sale.description || '未填写'], ['资金状态', activeCase(order) ? '整单冻结中' : '查看资金明细']]} /></Panel>
      {!!order.caseHistory?.length && <Panel title="历史售后案件">{order.caseHistory.map(previous => <details key={previous.id}><summary>{previous.id} · {caseNames[previous.status]} · ¥{money(previous.requested)}</summary><p>{previous.reason} · {previous.description}</p><p>结案原因：{({buyerWithdrawn:'买家主动撤销',remedyCompleted:'补充履约完成',rulingNoRefund:'裁决不退款',rejectionExpired:'介入窗口结束'} as Record<string, string>)[previous.closureReason ?? ''] ?? caseNames[previous.status]}</p><EvidenceList files={previous.evidence} />{previous.requestHistory?.map((request, i) => <div key={i}><p>申请变更：¥{money(request.requested)} · {request.reason} · {request.description}</p><EvidenceList files={request.evidence} /></div>)}{previous.proposalHistory?.map((p, i) => <p key={i}>{p.proposer === 'buyer' ? '买家' : '卖家'}方案：{p.content} · {{accepted:'已接受',rejected:'已拒绝',expired:'已过期',cancelled:'已取消'}[p.outcome]}</p>)}</details>)}</Panel>}
      {sale.closureReason && <Panel title="结案原因"><p>{{buyerWithdrawn:'买家主动撤销售后',remedyCompleted:'补充履约已完成并验收',rulingNoRefund:'平台裁决不退款，恢复原履约',rejectionExpired:'驳回后的介入窗口已结束，恢复履约'}[sale.closureReason]}</p></Panel>}
      {!!sale.requestHistory?.length && <Panel title="售后申请变更记录">{sale.requestHistory.map((request, index) => <details key={index}><summary>第 {index + 1} 次申请 · ¥{money(request.requested)} · {date(request.at)}</summary><p>{request.reason} · {request.description}</p><EvidenceList files={request.evidence} /></details>)}</Panel>}
      {!!sale.proposalHistory?.length && <Panel title="协商历史">{sale.proposalHistory.map((proposal, index) => <details key={`${proposal.id}-${index}`}><summary>{proposal.proposer === 'buyer' ? '买家' : '卖家'}方案 {proposal.version} · {{accepted:'已接受',rejected:'已拒绝',expired:'已过期',cancelled:'已取消'}[proposal.outcome]}</summary><p>{proposal.content}</p><p>{proposal.kind === 'partial' ? `退款 ¥${money(proposal.amount)}` : `${proposal.hours} 小时内补充履约`} · {date(proposal.at)}</p></details>)}</Panel>}
      {sale.proposal && <Panel title={sale.proposal.kind === 'remedy' ? '补充履约方案' : '部分退款方案'} aside={<small>{sale.status === 'platform' ? '平台协商' : `第 ${sale.round} 轮`} · {date(sale.proposal.expiresAt ?? sale.deadline)} 到期</small>}><h3>{sale.proposal.kind === 'partial' ? `协商退款 ¥${money(sale.proposal.amount)}` : sale.proposal.content}</h3><p>{sale.proposal.content}</p><Note>{sale.proposal.kind === 'partial' ? '同意并退款结算后，剩余履约义务结束。' : `同意后 ${sale.proposal.hours} 小时内完成。沿用本售后单，资金继续冻结。`}</Note>{role !== (sale.proposal.proposer ?? 'seller') && (sale.proposal.expiresAt ?? sale.deadline) > Date.now() && ['proposal','platform'].includes(sale.status) && <div className="v31-actions">{button('不同意方案', () => act({ type: 'rejectProposal', role, proposalId: sale.proposal!.id, proposalVersion: sale.proposal!.version }, 'case'))}{button('同意方案', () => ask('确认接受协商方案？', sale.proposal!.kind === 'partial' ? refundSummary(order, sale.proposal!.amount, sale.proposal!.content) : sale.proposal!.content, { type: 'acceptProposal', role, proposalId: sale.proposal!.id, proposalVersion: sale.proposal!.version }, 'case'), true)}</div>}</Panel>}
      {sale.status === 'rejected' && <Panel title="卖家拒绝原因"><p>{sale.rejection || '卖家认为已按约定履约'}</p><Note>可在 48 小时内申请平台介入，避免争议窗口过期。</Note></Panel>}
      {['remedy','remedyReceipt'].includes(sale.status) && <Panel title="补充履约进度"><Facts rows={[["约定内容", sale.proposal?.content || sale.remedyProposal?.content || '按双方确认内容完成'], ['当前状态', caseLabel(sale, role)], ['截止时间', date(sale.status === 'remedyReceipt' ? order.confirmAt : sale.deadline)]]} /><Note>不撤销原售后单。补充交付后重新验收；再次争议直接交平台处理。</Note><div className="v31-actions">{button('查看凭证', () => open('evidence'))}{role === 'seller' && sale.status === 'remedy' && button('提交补充履约完成', () => open('evidence'), true)}{role === 'buyer' && sale.status === 'remedyReceipt' && <>{button('延长验收', () => ask('延长验收 24 小时？', `新截止：${date((order.confirmAt ?? 0) + 24 * HOUR)}；每单仅一次。`, { type: 'extend', role }), false, order.extensionUsed)}{button('确认补充履约', () => ask('确认补充履约已完成？', '原售后结案；本单未发生退款则按 10% 佣金结算。', { type: 'confirm', role }, 'detail'), true)}</>}</div></Panel>}
      {['platform','appeal'].includes(sale.status) && <Panel title={sale.status === 'appeal' ? `第 ${sale.appealLevel} 级复核` : '平台核验材料'}><Note>本轮举证 24 小时，材料齐全或截止后 24 小时内判责 / 复核。证据只可追加，客服主管可批准一次不超过 24 小时的延期。</Note><div className="v31-actions">{canAppendEvidence(order, role) && button('补充举证', () => open('evidence'), true)}{button('联系平台客服', () => open('support'))}</div></Panel>}
      {['ruling','final'].includes(sale.status) && <Panel title="平台已出具结果">{button('查看判责与申诉', () => open('ruling'), true)}</Panel>}
      {['refundPending','processing','refunded'].includes(sale.status) && <Panel title="原路退款">{button('查看退款进度', () => open('refund'), true)}</Panel>}
      <Panel title="售后操作"><div className="v31-actions">
        {role === 'seller' && ['requested','second'].includes(sale.status) && <>{button('同意退款', () => ask('同意买家退款申请？', refundSummary(order, sale.requested), { type: 'agree', role }, 'refund'), true)}{button('提出协商方案', () => open('proposal'))}{sale.status === 'requested' && button('拒绝退款', () => open('reject'))}</>}
        {sale.status === 'platform' && (!sale.proposal || (sale.proposal.expiresAt ?? sale.deadline) <= Date.now()) && button('提出协商方案', () => open('proposal'))}
        {role === 'buyer' && ['requested','proposal','second','rejected'].includes(sale.status) && button('修改申请', () => { open('apply'); setReason(sale.reason); setDescription(sale.description); setRefundKind('partial'); setAmount(money(sale.requested)); }, false, sale.modifications >= 2)}
        {role === 'buyer' && ['requested','proposal','second','rejected'].includes(sale.status) && button('撤销售后', () => ask('确认撤销售后？', '将恢复原履约状态；如已交付，剩余验收时间至少 24 小时。', { type: 'withdrawCase', role }, 'detail'))}
        {['requested','proposal','second','rejected','remedy','remedyReceipt'].includes(sale.status) && button('申请平台介入', () => open('intervene'))}
        {canAppendEvidence(order, role) && button('补充证据', () => open('evidence'))}{button('查看原订单', () => open('detail'))}
      </div><Note>{sale.status === 'requested' ? '卖家逾期未有效处理且无人申请介入，按规则视为同意买家诉求。聊天或上传材料不算有效处理。' : sale.status === 'proposal' ? '买家沉默不算同意；第一轮失败进入第二轮，第二轮失败转平台。' : '所有时间均按自然小时计算，含夜间、节假日。'}</Note></Panel><Panel><details><summary>售后记录</summary>{[...(order.caseHistory??[]),...(order.sale?[order.sale]:[])].map(c=><article key={c.id}><b>{caseLabel(c,role)}</b><p>{c.reason}</p></article>)}</details></Panel><Panel><details><summary>时间与处理记录</summary>{timeline}</details></Panel></>;
    }
    if (view === 'proposal') return <><Panel><Product order={order} /></Panel><Panel title="协商方式"><div className="v31-segment">{(['partial','remedy'] as const).map(p => <button key={p} aria-pressed={proposalKind === p} onClick={() => setProposalKind(p)}>{p === 'partial' ? '部分退款' : '补充履约'}</button>)}</div>{proposalKind === 'partial' ? <label className="v31-field">协商退款金额（元）<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={`最多 ${money(sale?.requested ?? order.amount)}`} /></label> : <label className="v31-field">完成时限（小时，最多 168）<input type="number" min="1" max="168" value={hours} onChange={e => setHours(e.target.value)} /></label>}<label className="v31-field">具体方案<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={proposalKind === 'remedy' ? '写清补充服务内容、数量及完成标准' : '写清退款金额及剩余义务的处理方式'} /></label><Note>{proposalKind === 'remedy' ? `需${role === 'buyer' ? '卖家' : '买家'}明确同意，继续原售后单并保留冻结。` : '部分退款结算后，不再保留剩余履约义务。'}</Note></Panel>{button('发送协商方案', () => act({ type: 'propose', role, proposal: { kind: proposalKind, amount: parseMoney(amount), content: description, hours: Number(hours) } }, 'case'), true)}</>;
    if (['reject','intervene','appeal','special','support'].includes(view)) {
      const special = view === 'special'; const support = view === 'support';
      return <><Panel title={support ? '订单专属客服' : '关联交易'}><Product order={order} /><Note>{support ? '客服服务时间 09:00—24:00；订单及售后时限按自然小时计算。' : special ? '首次交易终结后 7 天内的严重问题由平台人工核查，提交不代表受理或自动退款。' : view === 'appeal' ? `第 ${(sale?.appealLevel ?? 0) + 1} 级申诉 · 二次申诉必须提供新证据。` : view === 'reject' ? '请根据实际履约说明拒绝理由，买家可继续申请平台介入。' : '双方均可主动申请介入，原订单与协商记录一并保留。'}</Note></Panel><Panel title="提交材料"><label className="v31-field">{support ? '咨询问题' : '具体原因'}<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="请描述问题、争议点和希望的处理方式" /></label><Files value={uploads} onChange={setUploads} mandatory={view === 'reject' || view === 'intervene' && role === 'seller' || view === 'appeal' && (sale?.appealLevel ?? 0) > 0} /><Note>提交前请遮挡无关个人信息，不要填写账号密码。</Note></Panel><div className="v31-actions">{button(support ? '提交咨询预览' : '提交申请', () => { if (support) { if (!reason.trim()) { setError('请填写咨询问题。'); return; } setNotice('当前仅展示咨询内容，尚未保存或发送真实客服。'); return; } act({ type: view === 'special' ? 'special' : view === 'reject' ? 'reject' : view === 'appeal' ? 'appeal' : 'intervene', role, reason, evidence: uploads }, special ? 'detail' : 'case'); }, true)}</div></>;
    }
    if (view === 'ruling') return <><section className="v31-status"><span>平台判责 · {sale?.id}</span><h2>{sale ? caseLabel(sale, role) : '暂无处理结果'}</h2><p>处理结果、依据及申诉入口在同一页面保留</p></section><Panel title="判责结果"><Facts rows={[["建议退款", `¥${money(sale?.rulingAmount ?? 0)}`], ['已履约部分', '按有效凭证核验'], ['结果依据', '商品承诺、双方协商及交付证据'], ['申诉截止', date(sale?.deadline)], ['当前申诉级别', `${sale?.appealLevel ?? 0} / 2`]]} /><Note>此处为示例判责结果，由平台出具，买卖双方不能自行改写。</Note></Panel><Panel title="双方确认"><Facts rows={[["买家", sale?.acceptedBy.includes('buyer') ? '已认可' : '待回应'], ['卖家', sale?.acceptedBy.includes('seller') ? '已认可' : '待回应']]} /><Note>初判与一级复核需等待申诉窗口结束；双方认可可提前执行，单方认可不执行。二级复核为平台最终处理结果。</Note><div className="v31-actions">{button('认可处理结果', () => ask('认可平台处理结果？', '双方均认可后可提前执行；单方认可不触发结算。', { type: 'acceptRuling', role }, 'case'), true, !sale || sale.acceptedBy.includes(role) || !['ruling','final'].includes(sale.status))}{button('不认可，提交申诉', () => open('appeal'), false, !sale || sale.appealLevel >= 2 || !['ruling','final'].includes(sale.status))}</div></Panel></>;
    if (view === 'refund') return <><section className="v31-status"><span>原支付渠道退款</span><h2>{sale?.status === 'refunded' ? '已退款' : sale?.status === 'refundPending' ? '退款待渠道受理' : '退款处理中'}</h2><p>{sale?.status === 'refunded' ? '示例记录：支付渠道已确认退款成功' : sale?.status === 'refundPending' ? '本地预览未调用支付渠道，没有实际退款' : '示例记录：等待支付渠道确认结果'}</p></section><Panel><div className="v31-money">¥{money(sale?.status === 'refunded' ? order.refunded : sale?.rulingAmount ?? 0)}</div><Facts rows={[["关联售后单", sale?.id || '—'], ['退回方式', '原支付渠道'], ['退款状态', sale?.status === 'refunded' ? '渠道已确认（示例）' : sale?.status === 'refundPending' ? '尚未提交渠道' : '等待渠道回执（示例）'], ['订单累计已退', `¥${money(order.refunded)}`]]} /><Note>处理异常时查询原退款记录，不重复提交；未收到渠道成功确认前不显示已退款。</Note></Panel><Panel title="结算规则"><Note>有效订单只要发生成功退款，整单佣金归零。卖家最终净额 = 实付金额 <CartoonIcon kind="minus" className="toon-glyph" /> 累计退款。</Note><button className="v31-link" onClick={() => open('funds')}>查看资金明细 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></Panel><div className="v31-actions">{button('返回售后详情', () => open('case'))}{button('联系平台客服', () => open('support'))}</div></>;
    if (view === 'review') return <><Panel><Product order={order} /></Panel><Panel title={order.reviewed ? '已提交评价' : '服务体验如何？'}><div className="v31-rating" role="group" aria-label="评价星级">{[1,2,3,4,5].map(n => <button key={n} disabled={order.reviewed} aria-label={`${n} 星`} aria-pressed={(order.review?.stars ?? stars) >= n} onClick={() => setStars(n)}><CartoonIcon kind={(order.review?.stars ?? stars) >= n ? "rating-filled" : "rating-outline"} /></button>)}</div><label className="v31-field">评价内容（选填）<textarea disabled={order.reviewed} value={order.review?.content ?? description} onChange={e => setDescription(e.target.value)} placeholder="说说实际服务体验" /></label><label className="v31-field"><span><input type="checkbox" disabled={order.reviewed} checked={order.review?.anonymous ?? anonymous} onChange={e=>setAnonymous(e.target.checked)}/> 匿名评价</span></label>{!order.reviewed && <Files value={uploads} onChange={setUploads} imagesOnly />}<Note>图片选填，仅图片作为评价附件；本地预览文件不会上传到正式评价。</Note><Note>评价截止 {date((order.terminatedAt ?? Date.now()) + 7 * 24 * HOUR)}。不评价也不影响结算，不自动好评。</Note></Panel>{canReview(order) && button('提交评价', () => act({ type: 'review', role, stars, content: description, anonymous, images: uploads.filter(f=>f.kind==='image') }, 'detail'), true, stars < 1)}</>;
    if (view === 'funds') return <><Panel title="订单结算"><Product order={order} /><Facts rows={[["买家实付", `¥${money(order.stage === "unpaid" || order.stage === "closed" ? 0 : order.amount)}`], ['累计成功退款', `− ¥${money(order.refunded)}`], [order.refunded ? '整单佣金（退款后归零）' : '平台佣金（10%）', `¥${money(funds.fee)}`], ['卖家净额', `¥${money(funds.net)}`]]} /></Panel><Panel title="资金去向"><div className="v31-money-grid"><div><small>可申请提现</small><b>¥{money(funds.available)}</b></div><div><small>售后冻结</small><b>¥{money(funds.frozen)}</b></div><div><small>待结算</small><b>¥{money(funds.pending)}</b></div></div><Note>金额为本笔订单示例，不是账户余额。可提现表示可以发起申请，不保证即时到账；独立风险冻结不会随售后结束解除。</Note></Panel><Panel title="账务记录"><div className="v31-ledger"><b>支付入账</b><span>¥{money(paidAmount(order))}</span></div>{order.refunded > 0 && <><div className="v31-ledger"><b>渠道退款成功</b><span><CartoonIcon kind="minus" className="toon-glyph" />¥{money(order.refunded)}</span></div><div className="v31-ledger"><b>原佣金冲正</b><span>¥{money(Math.round(order.amount * .1))}</span></div></>}<Note>保留原始流水，变更产生调整记录。实际金额由支付与结算账本核验。</Note></Panel>{button('查看订单', () => open('detail'))}</>;
    return <><Panel title="V3.1 · 本订单规则快照"><Note>对应《熊崽电竞完整交易售后体系 V3.1》。以下为关键规则摘要，完整条款以确认版本为准。</Note></Panel>{rules.map(([title, text]) => <Panel title={title} key={title}><p>{text}</p></Panel>)}</>;
  };
  return <div ref={screenRef} onScroll={rememberList} className={`app-screen v31-screen v31-role-${role} v31-view-${view}${view === 'merchant' ? ' sw-trade-conversation seller-message-wallpaper' : ''}`}>
    <header className="v31-header"><button aria-label="返回上一页" onClick={back}><CartoonIcon kind="back" /></button><h1>{view === 'merchant' ? role === 'seller' ? order.buyer : order.seller : titles}{view === 'merchant' && role === 'buyer' && <small>订单会话 · 本地预览</small>}</h1>{view === 'orders' ? <button className="seller-search-trigger" aria-label="搜索订单" aria-expanded={searchOpen} onClick={() => setSearchOpen(open => !open)}><SellerSearchIcon /></button> : <span aria-hidden="true" />} </header>
    {error && <p ref={alertRef} tabIndex={-1} role="alert" className="v31-error">{error}</p>}{notice && (role === 'seller' && screenRef.current?.closest(".phone-shell") ? createPortal(<p role="status" className="seller-feedback">{notice}</p>, screenRef.current.closest(".phone-shell")!) : <p role="status" className="v31-notice">{notice}</p>)}
    <div className="v31-content">{render()}</div>{view !== 'merchant' && nav}
    {moreOrderId && (() => { const target = store.orders.find(o => o.id === moreOrderId); const host = screenRef.current?.closest(".phone-shell"); if (!target || !host) return null; return createPortal(<div className="v31-overlay flow-overlay v31-more-overlay" role="dialog" aria-modal="true" aria-label="更多订单操作"><section className="v31-dialog"><h2>更多操作</h2><p>{target.title}</p><div className="v31-more-list">{buyerCardActions(target).more.map(item => renderCardAction(target, item))}</div><button type="button" className="v31-more-close" onClick={() => setMoreOrderId(null)}>取消</button></section></div>, host); })()}
    {notesShown && screenRef.current?.closest(".phone-shell") && createPortal(<div className={`v31-overlay flow-overlay${role === 'seller' ? ' seller-dialog-layer' : ' buyer-dialog-layer'}${notesPresence.closing ? ' is-closing' : ''}`} inert={notesPresence.closing} role="dialog" aria-modal="true" aria-label="商家备注"><section className="v31-dialog"><h2>商家备注</h2><p>仅商家可见，不会发送给买家。</p><label className="v31-field">备注内容<textarea maxLength={200} value={noteDraft} onChange={e => setNoteDraft(e.target.value)} /></label><div className="v31-actions">{button('取消', () => setNotesOrder(null))}{button('保存备注', () => { store.setSellerNotes(notes => ({ ...notes, [notesShown]: noteDraft.trim() })); setNotesOrder(null); setNotice('备注已保存'); }, true)}</div></section></div>, screenRef.current.closest(".phone-shell")!)}
    {confirmShown && screenRef.current?.closest(".phone-shell") && createPortal(<div className={`v31-overlay flow-overlay${role === 'seller' ? ' seller-dialog-layer' : ' buyer-dialog-layer'}${confirmPresence.closing ? ' is-closing' : ''}`} inert={confirmPresence.closing} role="dialog" aria-modal="true" aria-labelledby="v31-confirm-title"><section className="v31-dialog"><h2 id="v31-confirm-title">{confirmShown.title}</h2><p>{confirmShown.text}</p><div className="v31-actions">{button('暂不操作', () => setConfirm(null))}{button('确认', () => act(confirmShown.action, confirmShown.next, confirmShown.orderId), true)}</div></section></div>, screenRef.current.closest(".phone-shell")!)}
  </div>;
}
