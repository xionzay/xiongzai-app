"use client";

import { useSearchParams } from "next/navigation";
import "./preview.css";

type NavKey = "home" | "orders" | "message" | "mine";

function NavIcon({ kind }: { kind: NavKey }) {
  return <img src={`/assets/icon-${kind === "orders" ? "order" : kind}.png`} alt="" />;
}

function BuyerNav({ active }: { active: NavKey }) {
  const items: Array<{ key: NavKey; label: string; badge?: string }> = [
    { key: "home", label: "首页" },
    { key: "orders", label: "订单" },
    { key: "message", label: "消息", badge: "13" },
    { key: "mine", label: "我的" },
  ];
  return <nav className="preview-nav" aria-label="买家端主导航">
    {items.map((item) => <span className={active === item.key ? "active" : ""} key={item.key}><i><NavIcon kind={item.key} /></i><b>{item.label}</b>{item.badge ? <em>{item.badge}</em> : null}</span>)}
  </nav>;
}

function PreviewBrand() {
  return <div className="preview-brand"><img src="/assets/xiongzai-icon.png" alt="" /><span><b>熊崽电竞</b><small>XIONGZAI ESPORTS</small></span></div>;
}

const players = [
  { image: "/assets/player-poster.png", name: "本地测试陪玩", rank: "最强王者", score: "5.00", tags: ["经典四排", "陪伴沟通"] },
  { image: "/assets/player-luye.png", name: "鹿野", rank: "无敌战神", score: "5.00", tags: ["技术大神", "稳定上分"] },
];

function HomePreview() {
  return <div className="app-screen new-home-screen">
    <header className="home-command">
      <PreviewBrand />
      <nav><span className="active">推荐</span><span>陪玩</span><span>服务</span></nav>
      <span className="search-chip">⌕ <b>搜索</b></span>
    </header>
    <div className="new-hero-banner"><img src="/assets/home-hero.png" alt="和平精英在线开黑" /><span>1 位陪玩在线</span></div>
    <section className="preview-panel player-panel">
      <header><div><b>热门陪玩</b><small>已通过审核的在线陪玩</small></div><span>全部 ›</span></header>
      <div className="new-player-grid">
        {players.map((player, index) => <article key={player.name}>
          <div className="player-image"><img src={player.image} alt={`${player.name}头像`} /><i>{index + 1}</i><em>在线</em></div>
          <div className="player-copy"><b>{player.name}</b><small>{player.rank} · ★ {player.score}</small><span>{player.tags.map((tag) => <i key={tag}>{tag}</i>)}</span><strong>{index === 0 ? "5 项服务 · 0 单" : "6 项服务 · 1863 单"}</strong></div>
        </article>)}
      </div>
    </section>
    <section className="preview-panel service-peek"><header><div><b>热门服务</b><small>已通过审核并上架</small></div><span>全部 ›</span></header><div><img src="/assets/product-hero.png" alt="经典模式排位上分" /><img src="/assets/publish-arcade.png" alt="欢乐陪玩服务" /></div></section>
    <BuyerNav active="home" />
  </div>;
}

function CompanionPreview() {
  return <div className="app-screen new-companion-screen">
    <header className="preview-page-header"><span>‹</span><h1>陪玩主页</h1><span>↗</span></header>
    <section className="profile-poster-new">
      <img src="/assets/player-poster.png" alt="本地测试陪玩主页" />
      <span className="online-label">在线接单</span>
      <div><h2>本地测试陪玩</h2><p>最强王者 · 平台认证</p><span><i>经典四排</i><i>陪伴沟通</i><i>职业选手认证</i></span></div>
    </section>
    <section className="profile-stats"><span><b>5.00</b><small>综合评分</small></span><span><b>0</b><small>完成订单</small></span><span><b>5</b><small>在售服务</small></span><span><b>3</b><small>被收藏</small></span></section>
    <section className="voice-preview"><b>声音名片 · 15 秒</b><i>▶</i><span>{Array.from({ length: 18 }, (_, index) => <em style={{ height: `${8 + (index % 5) * 3}px` }} key={index} />)}</span></section>
    <section className="about-preview"><header><b>关于我</b><small>主页介绍</small></header><p>本地人工验收专用陪玩服务，支持订单、聊天、售后与提现全链路。</p><div><span><b>和平精英资料</b><small>最强王者 · K/D 4.20</small></span><em>已认证</em></div></section>
    <nav className="profile-actions"><span>☆ <b>收藏陪玩</b></span><span>◌ <b>咨询陪玩</b></span></nav>
  </div>;
}

function OrdersPreview() {
  return <div className="app-screen new-orders-screen">
    <header className="orders-header"><div><h1>我的订单</h1><p>只显示我购买的服务</p></div><span className="grid-mark">⌗</span></header>
    <nav className="order-tabs">{["全部", "待付款", "待接单", "待开始", "服务中", "待确认"].map((item, index) => <span className={index === 0 ? "active" : ""} key={item}>{item}</span>)}</nav>
    <section className="empty-orders"><i><span /></i><h2>还没有购买订单</h2><p>选择喜欢的陪玩服务，首笔订单会显示在这里。</p><span>去看看服务</span></section>
    <section className="support-preview"><i>✓</i><span><b>售后与平台介入</b><small>退款申请 · 投诉 · 交易纠纷</small></span><em>›</em></section>
    <BuyerNav active="orders" />
  </div>;
}

export default function WebsiteUiPreviewPage() {
  const screen = useSearchParams().get("screen") ?? "home";
  return <main className="website-ui-preview static-preview">{screen === "orders" ? <OrdersPreview /> : screen === "companion" ? <CompanionPreview /> : <HomePreview />}</main>;
}
