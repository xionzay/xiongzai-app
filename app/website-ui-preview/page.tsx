"use client";

import { useSearchParams } from "next/navigation";
import "./preview.css";

function AppIcon({ kind }: { kind: "home" | "order" | "message" | "mine" | "service" }) {
  return <i aria-hidden="true" className={`nav-symbol nav-${kind}`}><img src={`/assets/icon-${kind}.png`} alt="" /></i>;
}

function BuyerNav({ active }: { active: "home" | "orders" }) {
  return <nav className="bottom-nav buyer-nav" aria-label="买家端主导航">
    <button type="button" className={active === "home" ? "active" : ""}><AppIcon kind="home" /><span>首页</span></button>
    <button type="button" className={active === "orders" ? "active" : ""}><AppIcon kind="order" /><span>订单</span></button>
    <button type="button"><AppIcon kind="message" /><span>消息</span></button>
    <button type="button"><AppIcon kind="mine" /><span>我的</span></button>
  </nav>;
}

function CompanionCard({ image, name, rank, rating, tags, services, completed }: { image: string; name: string; rank: string; rating: string; tags: string[]; services: number; completed: number }) {
  return <button type="button" className="shop-card">
    <span className="shop-photo"><img src={image} alt={name} /><i>在线</i></span>
    <span className="shop-copy"><b>{name}</b><small>{rank} · ★ {rating}</small><span>{tags.map((tag) => <i key={tag}>{tag}</i>)}</span><strong>{services} 项服务 · {completed} 单</strong></span>
    <em className="shop-arrow">看主页 ›</em>
  </button>;
}

function HomePreview() {
  return <div className="app-screen home-screen">
    <div className="buyer-home-head"><div className="home-brand home-wordmark"><img src="/assets/xiongzai-logo.png" alt="熊崽电竞" /></div></div>
    <button type="button" className="big-search"><i>⌕</i><span>搜索陪玩 / 服务 / 玩法</span><em>搜索</em></button>
    <div className="browse-tabs buyer-tabs"><button type="button" className="active">推荐</button><button type="button">陪玩</button><button type="button">服务</button></div>
    <button type="button" className="hero-banner"><img src="/assets/home-hero.png" alt="和平精英在线开黑" /><span className="hero-brand">2 位陪玩在线</span></button>
    <section className="home-section"><div className="section-title"><div><b>热门陪玩</b><span>已通过审核的在线陪玩</span></div><button type="button">全部 ›</button></div>
      <div className="shop-grid">
        <CompanionCard image="/design-preview/exact-four/home-avatar.jpg" name="小鲸" rank="超级王牌" rating="5.00" tags={["经典模式", "欢乐上分"]} services={4} completed={186} />
        <CompanionCard image="/design-preview/exact-four/home-avatar-02.jpg" name="莓莓" rank="无敌战神" rating="4.99" tags={["地铁模式", "路线熟悉"]} services={3} completed={128} />
      </div>
    </section>
    <BuyerNav active="home" />
  </div>;
}

function CompanionPreview() {
  return <div className="app-screen companion-screen">
    <header className="screen-header"><div className="header-title"><button type="button" className="icon-button">‹</button><div><h1>陪玩主页</h1></div></div><div className="header-actions"><button type="button" className="icon-button">↗</button></div></header>
    <section className="store-hero"><img src="/design-preview/exact-four/profile-avatar.jpg" alt="小屿陪玩主页" /><span className="store-online">在线接单</span><div className="store-identity"><h2>小屿</h2><p>超级王牌 · 平台认证</p><span><i>经典模式</i><i>陪伴沟通</i></span></div></section>
    <section className="store-stats"><div><b>5.00</b><span>综合评分</span></div><div><b>286</b><span>完成订单</span></div><div><b>4</b><span>在售服务</span></div><div><b>128</b><span>被收藏</span></div></section>
    <button type="button" className="voice-card"><span><b>声音名片</b></span><i>▶</i><em>{Array.from({ length: 18 }).map((_, index) => <b key={index} style={{ height: `${8 + (index % 5) * 3}px` }} />)}</em></button>
    <section className="paper-panel store-about"><div className="section-title"><div><b>关于我</b><span>主页介绍</span></div></div><p>喜欢开黑聊天，擅长团队沟通与路线配合，认真完成每一次陪玩服务。</p><div><span><b>和平精英资料</b><small>超级王牌 · K/D 4.20</small></span><em>已认证</em></div></section>
    <div className="sticky-actions store-actions"><button type="button" className="follow-action">☆<span className="companion-action-label">收藏陪玩</span></button><button type="button" className="consult-action">◉<span className="companion-action-label">咨询陪玩</span></button></div>
  </div>;
}

function ServicePreview() {
  return <div className="app-screen service-screen website-service-screen">
    <header className="screen-header"><div className="header-title"><button type="button" className="icon-button">‹</button><div><h1>服务详情</h1></div></div><div className="header-actions"><button type="button" className="icon-button">↗</button></div></header>
    <img className="service-main-image" src="/assets/product-hero.png" alt="经典模式排位上分服务" />
    <section className="service-title-card"><div><span><i>经典模式</i><i>技术上分</i></span><h2>经典模式排位上分｜稳定沟通</h2><p>按局计费 · 可自选单双排</p></div><strong>¥25.00<small>起</small></strong><em>已售 1523 · ★ 4.9</em></section>
    <section className="paper-panel spec-panel commerce-spec-panel"><div className="section-title"><div><b>选择服务规格</b><span>价格由陪玩自主设置</span></div></div><div className="spec-grid"><button type="button" className="spec-card commerce-spec-card ticket-orange selected"><img src="/assets/product-hero.png" alt="" /><span>经典双排</span><em><b>¥25.00</b><small>已下 682 单</small></em><i>✓</i></button><button type="button" className="spec-card commerce-spec-card ticket-violet"><img src="/assets/product-hero.png" alt="" /><span>经典四排</span><em><b>¥40.00</b><small>已下 418 单</small></em></button></div></section>
    <button type="button" className="service-store-card"><span className="avatar avatar-md"><img src="/design-preview/exact-four/profile-avatar.jpg" alt="小屿" /></span><span><b>小屿的陪玩主页</b><small>超级王牌 · ★ 5.00 · 4 项服务</small><em>经典模式 · 陪伴沟通</em></span><strong>进主页 ›</strong></button>
    <div className="sticky-actions service-actions"><button type="button" className="icon-action consult-service-action">◉<small>咨询</small></button><button type="button" className="icon-action favorite-service-action">☆<small>收藏服务</small></button><button type="button" className="primary-action">选择规格 <b>¥25.00起</b></button></div>
  </div>;
}

const orders = [
  { seller: "小鲸妹妹", status: "待付款", image: "/design-preview/exact-four/order-01.jpg", title: "经典模式｜欢乐四排陪伴", spec: "四排开黑 · 稳定沟通", price: "25.00" },
  { seller: "阿屿", status: "待接单", image: "/design-preview/exact-four/order-02.jpg", title: "地铁模式｜摸金路线熟悉", spec: "摸金撤离 · 路线指导", price: "30.00" },
  { seller: "棉芯", status: "待开始", image: "/design-preview/exact-four/order-03.jpg", title: "经典模式｜默契双排沟通", spec: "双排配合 · 欢乐上分", price: "45.00" },
  { seller: "星禾", status: "服务中", image: "/design-preview/exact-four/order-04.jpg", title: "地铁模式｜战备物资指导", spec: "物资规划 · 进阶指导", price: "60.00" },
];

function OrdersPreview() {
  return <div className="app-screen orders-screen website-orders-screen">
    <header className="screen-header"><div className="header-title"><div><h1>我的订单</h1><p>只显示我购买的服务</p></div></div><div className="header-actions"><button type="button" className="icon-button"><AppIcon kind="service" /></button></div></header>
    <div className="order-filter big-order-filter">{["全部", "待付款", "待接单", "待开始", "服务中"].map((item, index) => <button type="button" className={index === 0 ? "active" : ""} key={item}>{item}</button>)}</div>
    <section className="buyer-order-list">{orders.map((order) => <article className="buyer-order-card" key={order.seller}>
      <div className="buyer-order-head"><button type="button">熊崽电竞 · {order.seller} ›</button><b>{order.status}</b></div>
      <button type="button" className="buyer-order-product"><img src={order.image} alt={order.title} /><span><b>{order.title}</b><small>{order.spec}</small></span><strong>¥{order.price}</strong></button>
      <div className="buyer-order-actions"><button type="button">订单详情</button><button type="button">{order.status === "待付款" ? "去支付" : order.status === "服务中" ? "查看进度" : "查看详情"}</button></div>
    </article>)}</section>
    <BuyerNav active="orders" />
  </div>;
}

export default function WebsiteUiPreviewPage() {
  const screen = useSearchParams().get("screen") ?? "home";
  return <main className="website-ui-preview">{screen === "orders" ? <OrdersPreview /> : screen === "companion" ? <CompanionPreview /> : screen === "service" ? <ServicePreview /> : <HomePreview />}</main>;
}
