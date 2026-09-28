"use client";

import { useRef, useState } from "react";
import { PurchaseSpecSheet } from "./PurchaseSpecSheet";
import { previewCompanions, previewServices, type PreviewEntry } from "./local-catalog-data";

type PreviewView = { kind: "companion" | "service" | "specs" | "confirmation"; id: string };
const money = (cent: string | number) => (Number(cent) / 100).toFixed(2);

export function RatingBadge({ rating, fiveStars = false, gender }: { rating: string; fiveStars?: boolean; gender?: "男" | "女" }) {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0 || value > 5) return null;
  return <>{gender ? <span className={`companion-gender ${gender === "男" ? "male" : "female"}`} aria-label={gender}>{gender === "男" ? "♂" : "♀"}</span> : null}<span className={`companion-rating${fiveStars ? " companion-rating-five" : ""}`} aria-label={`评分 ${value.toFixed(1)}`}><span className="companion-rating-stars" aria-hidden="true">{Array.from({ length: fiveStars ? 5 : 1 }, (_, index) => <svg key={index} viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9Z" fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" /></svg>)}</span>{value.toFixed(1)}</span></>;
}

export function LocalCatalogPreview({ entry, onClose, onCheckout }: { entry: PreviewEntry; onClose: () => void; onCheckout?: (item: { title: string; cover: string; seller: string; spec: string; amount: number }) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [history, setHistory] = useState<PreviewView[]>([entry]);
  const [selection, setSelection] = useState<Record<string, { spec: number; quantity: number }>>({});
  const [storeTab, setStoreTab] = useState("全部服务");
  const [favorites, setFavorites] = useState<string[]>([]);
  const screen = useRef<HTMLDivElement>(null);
  const view = history[history.length - 1];
  const service = previewServices.find((item) => item.id === view.id);
  const seller = previewCompanions.find((item) => item.id === (service?.sellerId ?? view.id));
  const chosen = selection[view.id] ?? { spec: 0, quantity: 1 };
  const spec = service?.specs[chosen.spec];
  const visit = (next: PreviewView) => { setStoreTab("全部服务"); setHistory((current) => [...current, next]); screen.current?.scrollTo(0, 0); };
  const back = () => { if (history.length === 1) onClose(); else setHistory((current) => current.slice(0, -1)); screen.current?.scrollTo(0, 0); };
  const choose = (patch: Partial<typeof chosen>) => setSelection((current) => ({ ...current, [view.id]: { ...chosen, ...patch } }));
  const favorite = favorites.includes(view.id);
  const title = { companion: "陪玩主页", service: "商品详情", specs: "选择规格", confirmation: "确认选择" }[view.kind];
  if (!seller) return null;
  return <div ref={screen} className="app-screen local-catalog-preview">
    <header className="preview-header"><button type="button" onClick={back} aria-label="返回上一页"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button><h1>{title}</h1><button type="button" onClick={onClose}>首页</button></header>
    <p className="preview-context">设计预览 · 人物资料、评分与价格均为演示</p>
    {view.kind === "companion" ? <>
      <section className="preview-profile paper-panel"><img src={seller.image} alt={seller.name} /><div><h2>{seller.name}<RatingBadge rating={seller.rating} fiveStars gender={seller.gender} /></h2><p>{seller.introduction}</p><div className="preview-tags">{seller.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></section>
      <section className="store-stats"><div><b>{seller.rating}</b><span>演示评分</span></div><div><b>{seller.services}</b><span>项服务</span></div><div><b>{seller.completed}</b><span>订单</span></div></section>
      <div className="preview-store-tabs" role="tablist" aria-label="陪玩主页栏目">{["全部服务", "评价", "介绍"].map((tab) => <button key={tab} type="button" role="tab" aria-selected={storeTab === tab} onClick={() => setStoreTab(tab)}>{tab}</button>)}</div>
      {storeTab === "全部服务" ? <section className="paper-panel"><h2 className="preview-section-title">全部服务 <small>{seller.services} 项</small></h2><div className="preview-product-grid">{previewServices.filter((item) => item.sellerId === seller.id).map((item) => <button type="button" key={item.id} onClick={() => visit({ kind: "service", id: item.id })}><img src={item.cover} alt={item.title} /><b>{item.title}</b><span>{item.subtitle}</span><strong>¥{money(item.priceCent)} <small>起</small></strong></button>)}</div></section> : storeTab === "评价" ? <section className="paper-panel"><h2 className="preview-section-title">评价</h2><p>暂无订单评价。当前评分仅用于查看界面效果。</p></section> : <section className="paper-panel"><h2 className="preview-section-title">关于我</h2><p>{seller.introduction} 可先确认游戏模式与期望服务时间，再选择适合自己的服务规格。</p></section>}
    </> : service && spec ? <>
      {view.kind === "service" ? <>
        <img className="preview-service-cover" src={service.cover} alt={service.title} />
        <section className="paper-panel preview-product-heading"><strong>¥{money(service.priceCent)}<small>起</small></strong><h2>{service.title}</h2><p>{service.subtitle}</p><div className="preview-tags">{service.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
        <button type="button" className="paper-panel preview-spec-entry" onClick={() => setSheetOpen(true)}><span><b>选择规格</b><small>{spec.name} · {chosen.quantity} 份</small></span><span>›</span></button>
        <button type="button" className="paper-panel preview-seller-entry" onClick={() => visit({ kind: "companion", id: seller.id })}><img src={seller.image} alt={seller.name} /><span><b>{seller.name}<RatingBadge rating={seller.rating} fiveStars gender={seller.gender} /></b><small>{seller.services} 项服务 · 查看陪玩主页</small></span><span>›</span></button>
        <section className="paper-panel"><h2 className="preview-section-title">服务说明</h2><p>{service.description}</p><dl className="preview-description"><div><dt>游戏模式</dt><dd>{service.title.split(" · ")[0]}</dd></div><div><dt>沟通方式</dt><dd>平台内沟通</dd></div><div><dt>服务时长</dt><dd>以所选规格为准</dd></div></dl></section>
        <section className="paper-panel"><h2 className="preview-section-title">购买须知</h2><p>请先确认游戏区服、服务内容与时间。本页供 UI 体验，不会创建真实订单或收取费用。</p></section>
        <div className="preview-bottom"><button type="button" className="preview-favorite" aria-pressed={favorite} onClick={() => setFavorites((current) => favorite ? current.filter((id) => id !== view.id) : [...current, view.id])}>{favorite ? "已收藏" : "收藏"}</button><button type="button" className="primary-action" onClick={() => setSheetOpen(true)}>立即购买</button></div>
      </> : <>
        <section className="paper-panel preview-order-brief"><img src={service.cover} alt={service.title} /><div><h2>{service.title}</h2><p>陪玩：{seller.name}</p><strong>¥{money(spec.priceCent)}</strong></div></section>
        {view.kind === "specs" ? <section className="paper-panel"><h2 className="preview-section-title">服务规格</h2><div className="preview-sku-list" role="group" aria-label="服务规格">{service.specs.map((item, index) => <button type="button" key={item.id} aria-pressed={chosen.spec === index} className={chosen.spec === index ? "selected" : ""} onClick={() => choose({ spec: index })}><span>{item.name}</span><b>¥{money(item.priceCent)}</b><i aria-hidden="true">{chosen.spec === index ? "✓" : ""}</i></button>)}</div><div className="preview-quantity"><b>购买数量</b><div><button type="button" aria-label="减少数量" disabled={chosen.quantity <= 1} onClick={() => choose({ quantity: chosen.quantity - 1 })}>−</button><output aria-live="polite">{chosen.quantity}</output><button type="button" aria-label="增加数量" disabled={chosen.quantity >= 9} onClick={() => choose({ quantity: chosen.quantity + 1 })}>＋</button></div></div></section> : <section className="paper-panel"><h2 className="preview-section-title">已选服务</h2><dl className="preview-description"><div><dt>规格</dt><dd>{spec.name}</dd></div><div><dt>数量</dt><dd>{chosen.quantity} 份</dd></div><div><dt>合计</dt><dd>¥{money(spec.priceCent * chosen.quantity)}</dd></div></dl><p>这是本地设计预览，未创建订单，也不会发起支付。</p><button type="button" className="secondary-full" onClick={back}>重新选择规格</button></section>}
        <div className="preview-bottom"><span>合计 <strong aria-live="polite">¥{money(spec.priceCent * chosen.quantity)}</strong></span><button type="button" className="primary-action" onClick={() => view.kind === "specs" ? visit({ kind: "confirmation", id: service.id }) : onCheckout ? onCheckout({ title: service.title, cover: service.cover, seller: seller.name, spec: `${spec.name} × ${chosen.quantity}`, amount: spec.priceCent * chosen.quantity }) : onClose()}>{view.kind === "specs" ? "确认规格" : onCheckout ? "下一步，确认订单" : "完成预览"}</button></div>
      </>}
    </> : null}
    {sheetOpen && service && spec ? <PurchaseSpecSheet anchor={screen} title={service.title} cover={service.cover} seller={seller.name} specs={service.specs} selected={chosen.spec} onSelect={(index) => choose({ spec: index })} quantity={chosen.quantity} onQuantity={(quantity) => choose({ quantity })} onClose={() => setSheetOpen(false)} onConfirm={() => { setSheetOpen(false); if (onCheckout) onCheckout({ title: service.title, cover: service.cover, seller: seller.name, spec: `${spec.name} × ${chosen.quantity}`, amount: spec.priceCent * chosen.quantity }); else visit({ kind: "confirmation", id: service.id }); }} /> : null}
  </div>;
}
