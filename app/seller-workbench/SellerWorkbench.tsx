'use client';
import { RevenueDashboard } from './RevenueDashboard';
import { ProductForm, SpecEditor, ProductConfirm, focusProductError } from './ProductEditor';
import { withSpecIds, priceRange, unitSummary, productErrors, persistProductChange } from './product-editor-model';
import { previewWrite } from '../trade-v31/preview-storage';
import { CartoonSelect } from "../ui/CartoonSelect";
import { CartoonIcon } from '../ui/CartoonIcon';
import { usePreviewState } from '../trade-v31/preview-storage';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SellerSearch, SellerSearchIcon, useSellerNotice, useSellerPresence, useSellerViewMotion } from './SellerUi';
import { OrderConversation } from './OrderConversation';
import { ConversationList, type InboxEntry, type InboxSearchState } from '../ConversationList';
import { previewHotServices } from '../local-catalog-data';
import { activeCase, money, orderLabel, settlement } from '../trade-v31/model';
import type { TradeStore, TradeView } from '../trade-v31/TradeWorkspace';
import { toggleProductListing, buyerIdentity, sellerTaskPresentation, periodOrders, sellerMatches, sellerTasks, sellerTotals, validateProduct, type MerchantProduct } from './model';

export function useMerchantPreview() {
  const [products, setProducts, productStorageError] = usePreviewState<MerchantProduct[]>('merchant-products', () => previewHotServices.map((p, index) => ({
    id: p.id, title: p.title, description: p.description, cover: p.cover, category: p.gameCategory,
    status: index === 3 ? '已下架' : '在售', dimensions: [{ name: '套餐', values: '体验陪玩,默契开黑' }, { name: '大区', values: 'QQ区,微信区' }],
    variants: ['体验陪玩 / QQ区', '体验陪玩 / 微信区', '默契开黑 / QQ区', '默契开黑 / 微信区'].map((key, i) => ({ key, price: money(Number(p.priceCent) * (i > 1 ? 2 : 1)), stock: '10' })),
    hours: '24', requirements: '游戏昵称、游戏 ID、大区', notice: '开始前请确认游戏区服与服务内容；请勿发送账号密码。', updated: Date.now() - index * 1000,
  })));
  const [name, setName, nameStorageError] = usePreviewState('merchant-name', '熊崽陪玩工作室');
  const [intro, setIntro, introStorageError] = usePreviewState('merchant-intro', '认真对待每一场陪伴，按约定完成每一笔服务。');
  const [online, setOnline, onlineStorageError] = usePreviewState('merchant-online', true);
  const [editing, setEditing] = useState<MerchantProduct | null>(null);
  const screens = useRef<Record<string, { view: string; tab: string; query: string; sort: string; scroll: number; thread: string; draft: MerchantProduct; history: string[]; positions: Record<string, number>; searchOpen?: boolean; inboxSearch?: InboxSearchState }>>({});
  const saveScreen = (key: string, value: (typeof screens.current)[string]) => { screens.current[key] = value; };
  const resetScreen = (key: string) => { delete screens.current[key]; };
  const returnToRoot = (key: string, view: string) => { const saved = screens.current[key]; if (saved) screens.current[key] = { ...saved, view, history: [], scroll: saved.positions[view] ?? 0 }; };
  return { storageError: productStorageError || nameStorageError || introStorageError || onlineStorageError, screens, saveScreen, resetScreen, returnToRoot, products, setProducts, name, setName, intro, setIntro, online, setOnline, editing, setEditing };
}
export type MerchantStore = ReturnType<typeof useMerchantPreview>;
function ToolIcon({ kind }: { kind: string }) { return <CartoonIcon kind={kind} className="sw-tool-icon" />; }

const emptyProduct = (): MerchantProduct => ({ id: `merchant-preview-${Date.now()}`, title: '', description: '', cover: '', category: '和平精英', status: '草稿', dimensions: [], variants: [{ id: crypto.randomUUID(), key: '单价商品', price: '', stock: '1', optionIds: [] }], hours: '24', requirements: '', notice: '', updated: Date.now() });

type Props = { registerNavigationGuard?: (guard: ((next: () => void) => void) | null) => void; entry: string; merchant: MerchantStore; trade: TradeStore; nav: ReactNode; go: (page: string) => void; openOrder: (id: string, view: TradeView) => void };
export function SellerWorkbench({ entry, merchant, trade, nav, go, openOrder, registerNavigationGuard }: Props) {
  const initial = ({ seller: 'home', sellerMine: 'mine', sellerServices: 'products', sellerPublish: 'editor', sellerServiceEdit: 'editor', sellerMessages: 'messages', sellerEarnings: 'data', sellerRevenue: 'data' } as Record<string, string>)[entry] ?? 'home';
  const cached = merchant.screens.current[entry];
  const [view, setView] = useState(cached?.view ?? initial);
  const [displayNow, setDisplayNow] = useState(Date.now);
  useEffect(() => {
    if (view !== 'home') return;
    const refresh = () => { if (!document.hidden) setDisplayNow(Date.now()); };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [view]);
  const [history, setHistory] = useState<string[]>(cached?.history ?? []);
  const [tab, setTab] = useState(cached?.tab ?? '在售');
  const [query, setQuery] = useState(cached?.query ?? '');
  const [searchOpen, setSearchOpen] = useState(cached?.searchOpen ?? false);
  const [inboxSearch, setInboxSearch] = useState<InboxSearchState | undefined>(cached?.inboxSearch);
  const [quickErrors, setQuickErrors] = useState<Record<string, string>>({});
  const period = '今日';
  const [sort, setSort] = useState(cached?.sort ?? '最近更新');
  const [draft, setDraft] = useState<MerchantProduct>(() => withSpecIds(structuredClone(cached?.draft ?? (entry === 'sellerServiceEdit' && merchant.editing ? merchant.editing : emptyProduct()))));
  const [initialDraft, setInitialDraft] = useState(() => JSON.stringify(draft));
  const specSnapshot = useRef<MerchantProduct | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false), [readingImage, setReadingImage] = useState(false);
  const savingLock = useRef(false);
  const [leavePrompt, setLeavePrompt] = useState<(() => void) | null>(null);
  const [leaveScope, setLeaveScope] = useState<'editor' | 'specs'>('editor');
  const dirty = JSON.stringify(draft) !== initialDraft;
  useEffect(() => {
    if (!['editor','specs'].includes(view) || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [view, dirty]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<MerchantProduct | null>(null);
  const [quickEdit, setQuickEdit] = useState<{ product: MerchantProduct; field: 'price' | 'stock' } | null>(null);
  const [moreProduct, setMoreProduct] = useState<MerchantProduct | null>(null);
  const [overlayHost, setOverlayHost] = useState<Element | null>(null);
  const [thread, setThread] = useState(cached?.thread ?? '');
  const screen = useRef<HTMLDivElement>(null);
  const bindScreen = useCallback((node: HTMLDivElement | null) => { screen.current = node; if (node) setOverlayHost(node.closest('.phone-shell')); }, []);
  useLayoutEffect(() => { if (Object.keys(formErrors).length) focusProductError(screen.current); }, [formErrors]);
  useSellerViewMotion(screen, view, history.length);
  useSellerNotice(notice, setNotice);
  const morePresence = useSellerPresence(moreProduct);
  const quickPresence = useSellerPresence(quickEdit);
  const confirmationPresence = useSellerPresence(confirmation);
  const moreShown = morePresence.shown, quickShown = quickPresence.shown, confirmationShown = confirmationPresence.shown;
  const hasOverlay = !!(moreShown || quickShown || confirmationShown);
  useEffect(() => {
    const node = screen.current;
    if (!node || !hasOverlay) return;
    const overflow = node.style.overflowY; node.style.overflowY = 'hidden';
    return () => { node.style.overflowY = overflow; };
  }, [hasOverlay]);
  useLayoutEffect(() => { if (Object.keys(quickErrors).length) { const input = overlayHost?.querySelector<HTMLInputElement>('.sw-quick-editor input[aria-invalid=true]'); input?.focus({ preventScroll: true }); input?.scrollIntoView({ block: 'nearest' }); } }, [quickErrors, overlayHost]);
  const scrollPositions = useRef<Record<string, number>>({ ...cached?.positions, [cached?.view ?? initial]: cached?.scroll ?? 0 });
  useLayoutEffect(() => { screen.current?.scrollTo(0, scrollPositions.current[view] ?? 0); }, [view]);
  useLayoutEffect(() => {
    const tabs = screen.current?.querySelector<HTMLElement>('.sw-tabs');
    const selected = tabs?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (tabs && selected) {
      const delta = selected.getBoundingClientRect().left - tabs.getBoundingClientRect().left;
      if (delta < 0) tabs.scrollLeft += delta;
      else if (delta + selected.offsetWidth > tabs.clientWidth) tabs.scrollLeft += delta + selected.offsetWidth - tabs.clientWidth;
    }
  }, [tab, view]);
  const cacheScreen = () => { merchant.saveScreen(entry, { view, tab, query, searchOpen, inboxSearch, sort, thread, draft, history, positions: scrollPositions.current, scroll: screen.current?.scrollTop ?? 0 }); };
  useEffect(() => { cacheScreen(); });
  useEffect(() => {
    if (!registerNavigationGuard || !['editor','specs'].includes(view)) return;
    registerNavigationGuard(next => {
      if (savingLock.current || readingImage) return;
      const proceed = () => {
        registerNavigationGuard(null);
        merchant.saveScreen(entry, { view: 'products', tab, query, searchOpen, sort, thread, draft: JSON.parse(initialDraft), history: [], positions: scrollPositions.current, scroll: scrollPositions.current.products ?? 0 });
        next();
      };
      if (dirty) { setLeaveScope('editor'); setLeavePrompt(() => proceed); } else proceed();
    });
    return () => { registerNavigationGuard(null); };
  }, [registerNavigationGuard, view, dirty, readingImage, tab, query, searchOpen, sort, entry, merchant, thread, initialDraft]);
  const [, setClock] = useState(0);
  useEffect(() => { const timer = setInterval(() => setClock(n => n + 1), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!confirmation && !quickEdit && !moreProduct) return; const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setConfirmation(null); setQuickEdit(null); setMoreProduct(null); setError(''); } }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [confirmation, quickEdit, moreProduct]);
  const visit = (next: string) => { if (next === 'profile' || next === 'store') { go(next === 'profile' ? 'sellerProfile' : 'sellerPublicPreview'); return; } scrollPositions.current[view] = screen.current?.scrollTop ?? 0; setHistory(h => [...h, view]); setView(next); setError(''); setNotice(''); };
  const backNow = () => { if (history.length) { setView(history.at(-1)!); setHistory(h => h.slice(0, -1)); } else go('seller'); setError(''); };
  const back = () => {
    if (saving || readingImage) return;
    if (view === 'specs' && specSnapshot.current && JSON.stringify(draft) !== JSON.stringify(specSnapshot.current)) {
      setLeaveScope('specs'); setLeavePrompt(() => () => { setDraft(specSnapshot.current!); backNow(); }); return;
    }
    if (view === 'editor' && dirty) { setLeaveScope('editor'); setLeavePrompt(() => () => { setDraft(JSON.parse(initialDraft)); backNow(); }); return; }
    backNow();
  };
  const patch = (change: Partial<MerchantProduct>) => setDraft(d => ({ ...d, ...change }));
  const openSpecs = () => { specSnapshot.current = structuredClone(draft); visit('specs'); };
  const paid = periodOrders(trade.orders, period);
  const totals = sellerTotals(trade.orders);
  const tasks = sellerTasks(trade.orders);
  const edit = (product?: MerchantProduct) => { const next = withSpecIds(structuredClone(product ?? emptyProduct())); setDraft(next); setInitialDraft(JSON.stringify(next)); setFormErrors({}); visit('editor'); };
  const openQuickEdit = (product: MerchantProduct, field: 'price' | 'stock') => { setOverlayHost(screen.current?.closest('.phone-shell') ?? null); setError(''); setQuickErrors({}); setQuickEdit({ product: structuredClone(product), field }); };
  const save = async (publish: boolean) => {
    if (savingLock.current || readingImage) return;
    const issues = productErrors(draft, publish); setFormErrors(issues);
    if (Object.keys(issues).length) return;
    const validation = publish ? validateProduct(draft) : '';
    if (validation) { setError(validation); return; }
    if (merchant.storageError) { setError(merchant.storageError); return; }
    const product: MerchantProduct = { ...draft, title: draft.title.trim(), status: publish ? '待审核' : '草稿', updated: Date.now() };
    savingLock.current = true; setSaving(true); setError('');
    try {
      const rows = await persistProductChange(product, merchant.products, previewWrite);
      merchant.setProducts(rows);
      setInitialDraft(JSON.stringify(product)); setDraft(product);
      setTab(product.status); setView('products'); setHistory([]); setError('');
      setNotice(publish ? '已保存本地待审核状态，尚未提交平台审核。' : '草稿已保存到本地预览。');
    } catch { setError('本地保存失败，填写内容已保留，请重试。'); }
    finally { savingLock.current = false; setSaving(false); }
  };
  const title = ({ products: '商品管理', editor: merchant.products.some(p => p.id === draft.id) ? '编辑商品' : '发布商品', specs: '规格与价格', data: '收益中心', reviews: '评价管理', funds: '账户资金', profile: '店铺资料', messages: '消息', thread: trade.orders.find(o => buyerIdentity(o) === thread)?.buyer ?? '聊天', buyerOrders: '该买家在本店的订单', settings: '设置', store: merchant.name } as Record<string, string>)[view];
  const identity = <div className="sw-identity"><button onClick={() => visit('profile')}><img src="/assets/xiongzai-icon.png" alt="店铺头像" /><span><strong>{merchant.name}</strong><small><i className={merchant.online ? 'online' : ''} />{merchant.online ? '营业中' : '休息中'} · 陪玩卖家</small></span></button><div className="sw-identity-actions">{['home', 'mine'].includes(view) && <button type="button" className="sw-settings-entry" aria-label="设置" onClick={() => visit('settings')}><CartoonIcon kind="setting" /></button>}<button className="sw-store-link" onClick={() => visit('store')}>预览主页 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></div></div>;
  const stats = <div className="sw-business-stats"><button onClick={() => visit('data')}><span>今日成交额（元）</span><strong>{money(paid.reduce((n, o) => n + o.amount, 0))}</strong></button><button onClick={() => visit('data')}><span>支付订单</span><strong>{paid.length}<small> 笔</small></strong></button></div>;
  const tools = <div className="sw-tools">{[['product', '商品管理', 'products'], ['review', '评价管理', 'reviews'], ['case', '售后处理', 'cases'], ['data', '经营数据', 'data']].map(([kind, label, target]) => <button key={kind} onClick={() => target === 'cases' ? go('sellerAftersales') : visit(target)}><ToolIcon kind={kind} /><span>{label}</span></button>)}</div>;
  const productRows = merchant.products.filter(p => p.status === tab && `${p.title}${p.id}${p.category}`.includes(query)).sort((a, b) => sort === '价格从低到高' ? Math.min(...a.variants.map(v => Number(v.price))) - Math.min(...b.variants.map(v => Number(v.price))) : b.updated - a.updated);
  const matchingBuyerOrders = trade.orders.filter(o => buyerIdentity(o) === thread);
  const amountRange = priceRange;
  const content = () => {
    if (view === 'home') return <>
      <div className="sw-brand"><span>熊崽电竞 · 卖家工作台</span>{identity}</div>
      <section className="sw-panel sw-overview"><div className="sw-section-title"><h2>今日经营</h2><button onClick={() => visit('data')}>查看数据 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></div>{stats}<div className="sw-order-counts">{['待付款', '待服务', '服务中', '待收货', '售后中'].map(t => <button key={t} onClick={() => go(`orders:${t}`)}><strong>{trade.orders.filter(o => sellerMatches(o, t)).length}</strong><span>{t === '售后中' ? '退款售后' : t}</span></button>)}</div></section>
      <section className="sw-panel sw-home-tools">{tools}</section>
      <div className="sw-section-title sw-outside-title"><h2>待办事项 <em>{tasks.length}</em></h2><span>按处理时限排序</span></div>
      {tasks.map(o => {
        const task = sellerTaskPresentation(o, displayNow);
        const destination = activeCase(o) ? 'case' : 'detail';
        return <article className="sw-panel sw-task" key={o.id}>
          <header><h3>{task.title}</h3><span className={`sw-deadline sw-deadline-${task.deadline.tone}`}>{task.deadline.text}</span>
            {task.proposalDeadline && <span className={`sw-deadline sw-deadline-${task.proposalDeadline.tone}`}>{task.proposalDeadline.text}</span>}
          </header>
          <button className="sw-task-product" onClick={() => openOrder(o.id, destination)}><img src={o.cover} alt="" /><span><b>{o.title}</b><small>{o.spec}</small><span className="sw-task-amount"><small>{task.amountLabel}</small><strong>{task.amount === null ? '暂无金额' : `¥${money(task.amount)}`}</strong></span></span><em><CartoonIcon kind="back" className="toon-glyph toon-glyph-right" label="打开" /></em></button>
          <footer><small><span>{o.buyer}</span><span className="sw-task-owner">{task.responsibility}</span></small><button className={task.primary ? 'sw-primary' : 'sw-progress-link'} onClick={() => openOrder(o.id, destination)}>{task.action}</button></footer>
        </article>;
      })}
      {!tasks.length && <section className="sw-panel sw-empty"><ToolIcon kind="case" /><h3>待办已全部处理</h3><p>有新的订单或售后时会显示在这里。</p></section>}
    </>;
    if (view === 'mine') return <>{identity}<section className="sw-panel sw-balance"><span>可申请提现（元）</span><strong>{money(totals.available)}</strong><button className="sw-progress-link" onClick={() => visit('funds')}>查看资金 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></button></section><section className="sw-panel sw-link-list">{[['wallet', '资金与结算明细', 'funds'], ['profile', '主页资料', 'profile'], ['profile', '预览主页', 'store'], ['data', '经营数据', 'data'], ['review', '评价管理', 'reviews'], ['product', '商品管理', 'products'], ['case', '售后与申诉', 'cases']].map(([kind, label, target]) => <button key={label} onClick={() => target === 'cases' ? go('sellerAftersales') : visit(target)}><ToolIcon kind={kind} /><span>{label}</span><em><CartoonIcon kind="back" className="toon-glyph toon-glyph-right" label="打开" /></em></button>)}</section><button className="sw-switch" onClick={() => go('mine')}>切换到买家端</button></>;
    if (view === 'products') return <><SellerSearch open={searchOpen} query={query} onChange={setQuery} onClose={() => setSearchOpen(false)} label="搜索商品" placeholder="商品名称、分类或编号" /><div className="sw-tabs" role="tablist" aria-label="商品状态">{['在售', '已下架', '草稿', '待审核', '审核驳回'].map(t => <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}>{t}<small>（{merchant.products.filter(p => p.status === t).length}）</small></button>)}</div><div className="sw-sort"><span>{productRows.length} 个商品</span><CartoonSelect aria-label="商品排序" value={sort} onChange={e => setSort(e.target.value)}><option>最近更新</option><option>价格从低到高</option></CartoonSelect></div>{productRows.map(p => <article className="sw-panel sw-product-card" key={p.id}><button className="sw-task-product" onClick={() => edit(p)}><img src={p.cover || "/assets/xiongzai-icon.png"} alt="" /><span><b>{p.title}</b><small>{p.variants.length} 个规格 · 可售名额 {p.variants.reduce((n, v) => n + Number(v.stock), 0)}</small><strong>{amountRange(p)}<small>{unitSummary(p)}</small></strong></span></button>{p.status === '待审核' && <p className="sw-hint">待审核预览 · 尚未发送正式审核，不可上架</p>}{p.status === '审核驳回' && <p className="sw-hint">驳回原因：{p.rejectionReason || '请查看审核意见'}。修改后可重新提交。</p>}<footer><button onClick={() => { setOverlayHost(screen.current?.closest('.phone-shell') ?? null); setMoreProduct(p); }}>更多</button><button onClick={() => openQuickEdit(p, 'price')}>改价</button><button onClick={() => openQuickEdit(p, 'stock')}>改名额</button><button onClick={() => edit(p)}>编辑</button></footer></article>)}{!productRows.length && <section className="sw-panel sw-empty"><h3>暂无{tab}商品</h3><p>{query ? '试试其他关键词。' : '发布服务，让买家了解你的专长。'}</p></section>}<div className="sw-sticky-actions"><button className="sw-primary" onClick={() => edit()}><CartoonIcon kind="plus" className="toon-glyph" /> 发布商品</button></div></>;
    if (view === 'editor') return <>
      <ProductForm draft={draft} patch={patch} errors={formErrors} openSpecs={openSpecs} busy={saving || readingImage} setBusy={setReadingImage} />
      <div className="sw-sticky-actions"><button disabled={saving || readingImage} onClick={() => void save(false)}>{saving ? '正在保存…' : '保存草稿'}</button><button disabled={saving || readingImage} className="sw-primary" onClick={() => void save(true)}>保存待审核状态</button></div>
    </>;
    if (view === 'specs') return <SpecEditor draft={draft} patch={patch} confirm={() => { setFormErrors({}); backNow(); }} />;
    if (view === 'data') return <RevenueDashboard identity={identity} actions={<><button type="button" onClick={() => go('sellerOrders')}><CartoonIcon kind="order" />我的订单</button><button type="button" onClick={() => visit('funds')}><CartoonIcon kind="wallet" />资金明细</button><button type="button" onClick={() => go('customerService')}><CartoonIcon kind="service" />联系客服</button></>} preview rows={trade.orders.filter(o => ['review', 'done'].includes(o.stage) && Number.isFinite(o.terminatedAt) && o.terminatedAt! > 0).map(o => ({ id: o.id, order_id: o.id, order_no: o.id, buyer_id: o.buyerId, order_amount_cent: String(o.amount), platform_fee_cent: String(settlement(o).fee), service_title: o.title, created_at: new Date(o.terminatedAt!).toISOString(), seller_amount_cent: String(settlement(o).net + o.refunded), reversed_amount_cent: String(o.refunded) }))} />;
    if (view === 'reviews') { const reviews = trade.orders.filter(o => o.review); return <section className="sw-panel"><div className="sw-section-title"><h2>买家评价</h2><span>{reviews.length} 条</span></div>{reviews.map(o => <article className="sw-review" key={o.id}><header><b>{o.buyer}</b><span>{o.review!.stars}.0 分</span></header><p>{o.review!.content || '买家未填写文字评价'}</p><button className="sw-setting-row" onClick={() => openOrder(o.id, 'detail')}><span>{o.title}</span><em>查看订单 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></em></button></article>)}{!reviews.length && <p className="sw-hint">暂无买家评价，不自动生成好评。</p>}</section>; }
    if (view === 'funds') return <><section className="sw-panel sw-balance"><span>可申请提现（元）</span><strong>{money(totals.available)}</strong><p className="sw-hint">当前为示例订单汇总，未连接提现渠道。</p></section><section className="sw-panel sw-fund-grid"><div><span>待结算</span><strong>¥{money(totals.pending)}</strong></div><div><span>售后冻结</span><strong>¥{money(totals.frozen)}</strong></div></section><section className="sw-panel"><h2>逐笔资金明细</h2>{trade.orders.filter(o => !['unpaid', 'closed'].includes(o.stage)).map(o => <button className="sw-setting-row" key={o.id} onClick={() => openOrder(o.id, 'funds')}><span><b>{o.title}</b><small>{o.id} · {activeCase(o) ? '售后冻结' : ['review', 'done'].includes(o.stage) ? '已结算' : '待结算'}</small></span><strong><small>买家实付</small>¥{money(o.amount)}</strong></button>)}</section></>;
    if (view === 'settings') return <section className="sw-panel"><button className="sw-setting-row" onClick={() => merchant.setOnline(!merchant.online)} aria-pressed={merchant.online}><span><b>营业状态</b><small>休息不影响已有订单的履约时限</small></span><strong>{merchant.online ? '营业中' : '休息中'}</strong></button><button className="sw-setting-row" onClick={() => visit('profile')}><span>店铺资料</span><em><CartoonIcon kind="back" className="toon-glyph toon-glyph-right" label="打开" /></em></button><button className="sw-setting-row" onClick={() => go("identitySwitch")}><span>切换身份</span><em>卖家 <CartoonIcon kind="back" className="toon-glyph toon-glyph-right" /></em></button></section>;
    if (view === 'profile') return <section className="sw-panel"><label className="sw-field">店铺名称<input value={merchant.name} maxLength={24} onChange={e => merchant.setName(e.target.value)} /></label><label className="sw-field">店铺介绍<textarea value={merchant.intro} maxLength={200} onChange={e => merchant.setIntro(e.target.value)} /></label><button className="sw-setting-row" onClick={() => merchant.setOnline(!merchant.online)} aria-pressed={merchant.online}><span><b>营业状态</b><small>休息不影响已有订单的履约时限</small></span><strong>{merchant.online ? '营业中' : '休息中'}</strong></button><p className="sw-hint">修改保存在此浏览器的本地预览中，尚未提交平台。</p></section>;
    if (view === 'store') return <><section className="sw-panel sw-public-profile"><img src="/assets/xiongzai-icon.png" alt="店铺头像" /><h2>{merchant.name}</h2><p>{merchant.intro}</p><span>{merchant.online ? '营业中' : '休息中'} · {merchant.products.filter(p => p.status === '在售').length} 个在售商品</span></section><section className="sw-panel"><h2>在售服务</h2>{merchant.products.filter(p => p.status === '在售').map(p => <div className="sw-task-product" key={p.id}><img src={p.cover || "/assets/xiongzai-icon.png"} alt="" /><span><b>{p.title}</b><small>{p.description}</small><strong>{amountRange(p)}<small>{unitSummary(p)}</small></strong></span></div>)}</section></>;
    if (view === 'messages') {
      const buyers = [...new Set(trade.orders.map(buyerIdentity))];
      const inbox = buyers.map(buyer => {
        const orders = trade.orders.filter(order => buyerIdentity(order) === buyer);
        const messages = orders.flatMap(order => (trade.messages[order.id] ?? []).map((message, index) => ({ ...message, orderId: order.id, index }))).sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0));
        const latest = messages.at(-1);
        return { id: buyer, name: orders[0].buyer, avatar: '/assets/home-companions/avatar-02.jpg', preview: latest?.text ?? '暂无聊天记录，点击沟通服务安排', time: latest?.sentAt, messages };
      }).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
      return <ConversationList seller initialSearch={inboxSearch} onSearchStateChange={setInboxSearch} entries={inbox} onOpen={id => { const entry = inbox.find(item => id === item.id || item.messages.some(message => id === `${item.id}::${message.orderId}::${message.index}`)); if (!entry) return; const hit = entry.messages.find(message => id === `${entry.id}::${message.orderId}::${message.index}`); trade.setSelected(hit?.orderId ?? entry.messages.at(-1)?.orderId ?? trade.orders.find(order => buyerIdentity(order) === entry.id)!.id); trade.messageTarget.current = hit ? { orderId: hit.orderId, index: hit.index } : null; setThread(entry.id); visit('thread'); }} search={async keyword => {
        const query = keyword.toLocaleLowerCase(); const results: InboxEntry[] = [];
        for (const entry of inbox) {
          if (entry.name.toLocaleLowerCase().includes(query)) results.push(entry);
          else for (const message of [...entry.messages].reverse()) if (message.text.toLocaleLowerCase().includes(query)) {
            results.push({ ...entry, id: `${entry.id}::${message.orderId}::${message.index}`, match: message.text, time: message.sentAt }); break;
          }
        }
        return results;
      }} />;
    }
    if (view === 'buyerOrders') return <section className="sw-panel">{matchingBuyerOrders.map(o => <button className="sw-setting-row" key={o.id} onClick={() => openOrder(o.id, 'detail')}><span><b>{o.title}</b><small>{o.spec} · {orderLabel(o)}</small></span><strong>¥{money(o.amount)}</strong></button>)}</section>;
    if (view === 'thread') { const selected = matchingBuyerOrders.find(o => o.id === trade.selected) ?? matchingBuyerOrders[0]; return selected ? <OrderConversation order={selected} orders={matchingBuyerOrders} viewerRole="seller" store={trade} openOrder={id => openOrder(id, 'detail')} /> : null; }
    return null;
  };
  return <div ref={bindScreen} onScroll={cacheScreen} className={`app-screen seller-workbench sw-view-${view}${view === 'thread' ? ' seller-message-wallpaper' : ''}`}>
    {title && view !== 'messages' && <header className="sw-header"><button aria-label="返回上一页" onClick={back}><CartoonIcon kind="back" /></button><h1>{title}</h1>{view === 'products' ? <button className="seller-search-trigger" aria-label="搜索商品" aria-expanded={searchOpen} onClick={() => setSearchOpen(open => !open)}><SellerSearchIcon /></button> : view === 'data' ? <button type="button" className="sw-settings-entry" aria-label="设置" onClick={() => visit('settings')}><CartoonIcon kind="setting" /></button> : <span aria-hidden="true" style={{ width: 44 }} />}</header>}
    {error && <p className="sw-error" role="alert">{error}</p>}{notice && overlayHost && createPortal(<p className="seller-feedback" role="status">{notice}</p>, overlayHost)}
    <div className="sw-content">{content()}</div>
    {moreShown && overlayHost && createPortal(<div className={`v31-overlay flow-overlay seller-dialog-layer${morePresence.closing ? " is-closing" : ""}`} inert={morePresence.closing} role="dialog" aria-modal="true" aria-label="更多商品操作"><section className="v31-dialog"><h2>更多操作</h2><p>{moreShown.title}</p><div className="sw-dialog-actions"><button onClick={() => setMoreProduct(null)}>取消</button>{['在售','已下架'].includes(moreShown.status) && <button onClick={() => { setConfirmation(moreShown); setMoreProduct(null); }}>{moreShown.status === '在售' ? '下架' : '上架预览'}</button>}<button onClick={() => { edit({ ...structuredClone(moreShown), id: `merchant-preview-${Date.now()}`, title: `${moreShown.title}（副本）`, status: '草稿' }); setMoreProduct(null); }}>复制为草稿</button></div></section></div>, overlayHost)}
    {quickShown && overlayHost && createPortal(<div className={`v31-overlay flow-overlay seller-dialog-layer${quickPresence.closing ? " is-closing" : ""}`} inert={quickPresence.closing} role="dialog" aria-modal="true" aria-label={quickShown.field === 'price' ? '修改价格' : '修改服务名额'}><section className="v31-dialog sw-quick-editor"><h2>{quickShown.field === 'price' ? '修改价格' : '修改服务名额'}</h2><p>{quickShown.product.title}</p><div className="sw-quick-fields">{quickShown.product.variants.map((v, i) => <label className="sw-field" key={v.id ?? v.key}>{v.key}<input aria-invalid={!!quickErrors[v.key]} aria-describedby={quickErrors[v.key] ? `sku-error-${i}` : undefined} aria-label={`${v.key}${quickShown.field === 'price' ? '价格（元）' : '名额'}`} inputMode={quickShown.field === 'price' ? 'decimal' : 'numeric'} value={v[quickShown.field]} onChange={e => { setQuickEdit({ ...quickShown, product: { ...quickShown.product, variants: quickShown.product.variants.map((row, j) => i === j ? { ...row, [quickShown.field]: e.target.value } : row) } }); }} />{quickErrors[v.key] && <small id={`sku-error-${i}`} className="seller-field-error" role="alert">{v.key}：{quickErrors[v.key]}</small>}</label>)}</div>{error && <p role="alert" className="sw-error">{error}</p>}<div className="sw-dialog-actions"><button onClick={() => { setQuickEdit(null); setError(''); }}>取消</button><button className="v31-primary" onClick={() => { const errors: Record<string, string> = {}; quickShown.product.variants.forEach(v => { const valid = quickShown.field === 'price' ? /^\d+(\.\d{1,2})?$/.test(v.price) && Number(v.price) > 0 && Number.isSafeInteger(Math.round(Number(v.price) * 100)) : /^\d+$/.test(v.stock) && Number.isSafeInteger(Number(v.stock)); if (!valid) errors[v.key] = quickShown.field === 'price' ? '价格须大于 0，最多两位小数。' : '服务名额须为非负整数。'; }); setQuickErrors(errors); if (Object.keys(errors).length) return; merchant.setProducts(rows => rows.map(p => p.id === quickShown.product.id ? { ...p, variants: quickShown.product.variants, updated: Date.now() } : p)); setQuickEdit(null); setError(''); setNotice('已更新本地预览'); }}>保存</button></div></section></div>, overlayHost)}
    {confirmationShown && overlayHost && createPortal(<div className={`v31-overlay flow-overlay sw-listing-confirm seller-dialog-layer${confirmationPresence.closing ? " is-closing" : ""}`} inert={confirmationPresence.closing} role="dialog" aria-modal="true" aria-label="确认商品状态变更"><section className="v31-dialog"><h2>{confirmationShown.status === '在售' ? '下架这个商品？' : '上架这个预览商品？'}</h2><p>{confirmationShown.title}</p><p className="sw-hint">仅更新设计预览，已有订单不受影响。</p><div><button onClick={() => setConfirmation(null)}>取消</button><button className="v31-primary" onClick={() => { const current = merchant.products.find(p => p.id === confirmationShown.id); if (!current || current.status !== confirmationShown.status) { setError('商品状态已更新，请重新查看。'); setConfirmation(null); return; } try { const next = toggleProductListing(current); merchant.setProducts(rows => rows.map(p => p.id === next.id ? next : p)); } catch (error) { setError(error instanceof Error ? error.message : '无法修改商品状态'); setConfirmation(null); return; } setConfirmation(null); setNotice('商品状态已更新'); }}>确认</button></div></section></div>, overlayHost)}
    {!['thread','editor','specs'].includes(view) && nav}
    {leavePrompt && <ProductConfirm title={leaveScope === 'specs' ? '放弃本次规格修改？' : '放弃未保存的修改？'} description={leaveScope === 'specs' ? '返回后恢复进入规格页时的内容，商品表单其他内容保留。' : '本次未保存内容将被丢弃，已保存商品保持原样。'} confirmLabel="放弃修改" onCancel={() => setLeavePrompt(null)} onConfirm={() => { leavePrompt(); setLeavePrompt(null); }} />}
  </div>;
}
