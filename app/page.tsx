"use client";

import { FormEvent, useState } from "react";

type BuyerPage = "splash" | "auth" | "profileSetup" | "home" | "search" | "searchResults" | "companion" | "service" | "specs" | "checkout" | "payment" | "paymentResult" | "orders" | "orderDetail" | "refundApply" | "refundDetail" | "complaint" | "review" | "messages" | "chat" | "mine" | "favorites" | "editProfile" | "rules" | "settings" | "apply" | "sellerApplyForm" | "sellerApplyStatus";
type SellerPage = "seller" | "sellerProfile" | "sellerServices" | "sellerPublish" | "sellerServiceEdit" | "sellerOrders" | "sellerOrderDetail" | "sellerEarnings" | "incomeDetails" | "withdraw" | "withdrawals";
type PageId = BuyerPage | SellerPage;
type Tone = "orange" | "lime" | "violet" | "blue";
type EarningsRange = "今日" | "昨日" | "本周" | "本月" | "本年" | "累计";

type Companion = { id: number; name: string; image: string; level: number; rank: string; rating: string; completed: number; services: number; tags: string[]; online?: boolean };
type Service = { id: number; sellerId: number; title: string; cover: string; price: number; sold: number; rating: string; tone: Tone; tags: string[]; subtitle: string };

const companions: Companion[] = [
  { id: 1, name: "鹿野", image: "/assets/player-luye.png", level: 28, rank: "无敌战神", rating: "5.0", completed: 1863, services: 6, tags: ["经典大神", "青受音", "稳定上分"], online: true },
  { id: 2, name: "小悠", image: "/assets/player-xiaoyou.png", level: 25, rank: "超级王牌", rating: "4.9", completed: 976, services: 4, tags: ["萝莉音", "娱乐陪玩", "话多不冷场"], online: true },
  { id: 3, name: "Kirito", image: "/assets/player-kirito.png", level: 28, rank: "最强王者", rating: "4.9", completed: 1523, services: 8, tags: ["地铁大神", "技术型", "教学耐心"], online: true },
  { id: 4, name: "苏苏", image: "/assets/player-susu.png", level: 26, rank: "荣耀王者", rating: "4.9", completed: 628, services: 5, tags: ["御姐音", "上分型", "心态稳定"] },
];

const services: Service[] = [
  { id: 1, sellerId: 3, title: "经典模式排位上分｜稳定沟通", cover: "/assets/product-hero.png", price: 25, sold: 1523, rating: "4.9", tone: "orange", tags: ["经典模式", "技术上分"], subtitle: "按局计费 · 可自选单双排" },
  { id: 2, sellerId: 1, title: "地铁逃生带飞｜摸金教学", cover: "/assets/home-hero.png", price: 35, sold: 893, rating: "5.0", tone: "lime", tags: ["地铁逃生", "路线教学"], subtitle: "装备规划 · 撤离路线讲解" },
  { id: 3, sellerId: 2, title: "欢乐四排｜萝莉音不冷场", cover: "/assets/publish-arcade.png", price: 20, sold: 668, rating: "4.9", tone: "violet", tags: ["娱乐陪玩", "萝莉音"], subtitle: "轻松娱乐 · 全程有话聊" },
  { id: 4, sellerId: 4, title: "巅峰赛冲分｜高效听指挥", cover: "/assets/player-poster.png", price: 45, sold: 437, rating: "4.9", tone: "blue", tags: ["巅峰赛", "上分型"], subtitle: "明确报点 · 复盘提升" },
];

const pageMeta: Array<{ page: PageId; no: string; title: string; note: string }> = [
  { page: "home", no: "01", title: "买家首页", note: "推荐、陪玩与服务三种浏览模式" },
  { page: "companion", no: "02", title: "陪玩主页", note: "公开资料、试音、评价和全部服务" },
  { page: "service", no: "03", title: "服务详情", note: "服务就是商品，可反向进入陪玩主页" },
  { page: "orders", no: "04", title: "购买订单", note: "买家端只查看我购买的订单" },
  { page: "mine", no: "05", title: "我的", note: "收藏分类、设置与陪玩中心入口" },
  { page: "seller", no: "06", title: "陪玩中心", note: "审核卖家专属的经营与履约空间" },
];

const pageCatalog: Array<{ group: string; items: Array<{ page: PageId; title: string }> }> = [
  { group: "买家端 · 账号与发现", items: [{ page: "splash", title: "启动页" }, { page: "auth", title: "登录注册" }, { page: "profileSetup", title: "资料初始化" }, { page: "home", title: "首页" }, { page: "search", title: "搜索" }, { page: "searchResults", title: "搜索结果" }] },
  { group: "买家端 · 陪玩与服务", items: [{ page: "companion", title: "陪玩主页" }, { page: "service", title: "服务详情" }, { page: "specs", title: "规格选择" }, { page: "favorites", title: "我的收藏" }, { page: "messages", title: "消息列表" }, { page: "chat", title: "文字聊天" }] },
  { group: "买家端 · 交易与售后", items: [{ page: "checkout", title: "确认订单" }, { page: "payment", title: "支付" }, { page: "paymentResult", title: "支付结果" }, { page: "orders", title: "购买订单" }, { page: "orderDetail", title: "订单详情" }, { page: "refundApply", title: "申请退款" }, { page: "refundDetail", title: "退款详情" }, { page: "complaint", title: "投诉介入" }, { page: "review", title: "评价服务" }] },
  { group: "买家端 · 个人中心", items: [{ page: "mine", title: "我的" }, { page: "editProfile", title: "编辑资料" }, { page: "rules", title: "平台规则" }, { page: "settings", title: "设置" }] },
  { group: "陪玩中心 · 入驻与经营", items: [{ page: "sellerApplyForm", title: "陪玩申请" }, { page: "sellerApplyStatus", title: "申请状态" }, { page: "seller", title: "经营概览" }, { page: "sellerProfile", title: "主页管理" }, { page: "companion", title: "公开主页预览" }, { page: "sellerPublish", title: "发布服务" }, { page: "sellerServices", title: "服务管理" }, { page: "sellerServiceEdit", title: "编辑服务" }] },
  { group: "陪玩中心 · 订单与收益", items: [{ page: "sellerOrders", title: "卖家订单" }, { page: "sellerOrderDetail", title: "卖家订单详情" }, { page: "sellerEarnings", title: "收益中心" }, { page: "incomeDetails", title: "收益明细" }, { page: "withdraw", title: "收益提现" }, { page: "withdrawals", title: "提现记录" }] },
];

function StatusBar() { return null; }

function IconButton({ children, label, onClick, badge }: { children: React.ReactNode; label: string; onClick?: () => void; badge?: number }) {
  return <button type="button" className="icon-button" aria-label={label} onClick={onClick}>{children}{badge ? <em>{badge}</em> : null}</button>;
}

function AppIcon({ kind, className = "" }: { kind: string; className?: string }) {
  const asset = kind === "filter" ? "service" : kind;
  return <i aria-hidden="true" className={`nav-symbol nav-${kind} ${className}`}><img src={`/assets/icon-${asset}.png`} alt="" /></i>;
}

function Header({ title, subtitle, back, actions }: { title: string; subtitle?: string; back?: () => void; actions?: React.ReactNode }) {
  return <header className="screen-header"><div className="header-title">{back ? <IconButton label="返回" onClick={back}>‹</IconButton> : null}<div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div></div><div className="header-actions">{actions}</div></header>;
}

function Avatar({ companion, size = "md" }: { companion: Companion; size?: "sm" | "md" | "lg" }) {
  return <span className={`avatar avatar-${size}`}><img src={companion.image} alt={`${companion.name}头像`} />{companion.online ? <i aria-label="在线" /> : null}</span>;
}

function BuyerNav({ page, go, unreadCount = 0 }: { page: PageId; go: (page: PageId) => void; unreadCount?: number }) {
  const items = [{ page: "home" as PageId, kind: "home", label: "首页" }, { page: "orders" as PageId, kind: "order", label: "订单" }, { page: "messages" as PageId, kind: "message", label: "消息", badge: unreadCount }, { page: "mine" as PageId, kind: "mine", label: "我的" }];
  return <nav className="bottom-nav buyer-nav" aria-label="买家端主导航">{items.map((item) => <button type="button" key={item.label} className={page === item.page || (page === "chat" && item.page === "messages") ? "active" : ""} onClick={() => go(item.page)}><AppIcon kind={item.kind} /><span>{item.label}</span>{item.badge ? <em>{item.badge}</em> : null}</button>)}</nav>;
}

function SellerNav({ page, go }: { page: PageId; go: (page: PageId) => void }) {
  const items = [{ page: "seller" as PageId, kind: "home", label: "概览" }, { page: "sellerServices" as PageId, kind: "service", label: "服务" }, { page: "sellerOrders" as PageId, kind: "order", label: "订单" }, { page: "sellerEarnings" as PageId, kind: "wallet", label: "收益" }];
  return <nav className="bottom-nav seller-nav" aria-label="陪玩中心导航">{items.map((item) => <button type="button" key={item.label} className={page === item.page || (page === "sellerPublish" && item.page === "sellerServices") ? "active" : ""} onClick={() => go(item.page)}><AppIcon kind={item.kind} /><span>{item.label}</span></button>)}</nav>;
}

function SectionTitle({ title, note, action, onAction }: { title: string; note?: string; action?: string; onAction?: () => void }) {
  return <div className="section-title"><div><b>{title}</b>{note ? <span>{note}</span> : null}</div>{action ? <button type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function CompanionCard({ companion, go, wide = false }: { companion: Companion; go: (page: PageId) => void; wide?: boolean }) {
  return <button type="button" className={`shop-card ${wide ? "wide" : ""}`} onClick={() => go("companion")}><span className="shop-photo"><img src={companion.image} alt={companion.name} />{companion.online ? <i>在线</i> : null}</span><span className="shop-copy"><b>{companion.name}</b><small>{companion.rank} · ★ {companion.rating}</small><span>{companion.tags.slice(0, wide ? 3 : 2).map((tag) => <i key={tag}>{tag}</i>)}</span><strong>{companion.services} 项服务 · {companion.completed} 单</strong></span><em className="shop-arrow">看主页 ›</em></button>;
}

function ServiceCard({ service, go, compact = false }: { service: Service; go: (page: PageId) => void; compact?: boolean }) {
  const seller = companions.find((item) => item.id === service.sellerId) ?? companions[0];
  return <button type="button" className={`product-card ${compact ? "compact" : ""}`} onClick={() => go("service")}><span className="product-cover"><img src={service.cover} alt={service.title} /><i>{service.tags[0]}</i></span><span className="product-copy"><b>{service.title}</b><small>{service.subtitle}</small><span>{service.tags.map((tag) => <i key={tag}>{tag}</i>)}</span><em><strong>¥{service.price}<small>起</small></strong><span>已售 {service.sold}</span></em><span className="product-seller"><img src={seller.image} alt="" /><b>{seller.name}</b><i>★ {service.rating}</i></span></span></button>;
}

function SortBar({ options, active, direction, onSelect }: { options: string[]; active: string; direction: "asc" | "desc"; onSelect: (item: string) => void }) {
  return <div className="service-sort sort-bar" aria-label="排序方式">{options.map((item) => <button type="button" className={active === item ? "active" : ""} onClick={() => onSelect(item)} key={item}>{item}{active === item && item !== "综合" ? <i>{direction === "desc" ? "↓" : "↑"}</i> : null}</button>)}</div>;
}

function SplashScreen({ go }: { go: (page: PageId) => void }) {
  return <div className="app-screen splash-screen"><div className="splash-orbit"><i /><i /><i /></div><div className="splash-brand"><img src="/assets/xiongzai-logo.png" alt="熊崽电竞" /><span>和平精英 C2C 游戏服务交易平台</span></div><div className="splash-showcase"><article><Avatar companion={companions[2]} size="md" /><span><b>真人陪玩</b><small>公开主页 · 声音名片</small></span></article><article><AppIcon kind="shield" /><span><b>平台保障</b><small>支付、退款与售后</small></span></article><article><AppIcon kind="service" /><span><b>自选服务</b><small>按规格和时间下单</small></span></article></div><button type="button" className="splash-enter" onClick={() => go("auth")}>开始使用</button><p className="splash-foot">找陪玩 · 选服务 · 安心下单</p></div>;
}

function AuthScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [mode, setMode] = useState<"登录" | "注册">("登录"); const [phone, setPhone] = useState("138 0013 8000"); const [code, setCode] = useState(""); const [agreed, setAgreed] = useState(true);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!agreed) { notify("请先阅读并同意平台协议"); return; } go(mode === "注册" ? "profileSetup" : "home"); };
  return <div className="app-screen auth-screen"><Header title="欢迎来到熊崽电竞" subtitle="手机号验证码登录更安全" back={() => go("splash")} /><div className="auth-logo"><img src="/assets/xiongzai-icon.png" alt="熊崽电竞" /><b>和靠谱的队友，一起玩</b></div><div className="auth-tabs"><button type="button" className={mode === "登录" ? "active" : ""} onClick={() => setMode("登录")}>登录</button><button type="button" className={mode === "注册" ? "active" : ""} onClick={() => setMode("注册")}>注册</button></div><form className="auth-form" onSubmit={submit}><label><span>手机号码</span><div><b>+86</b><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" aria-label="手机号码" /></div></label><label><span>短信验证码</span><div><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" placeholder="请输入 6 位验证码" aria-label="短信验证码" /><button type="button" onClick={() => notify("验证码已发送，60 秒后可重新获取")}>获取验证码</button></div></label><button type="submit" className="auth-submit">{mode === "登录" ? "登录熊崽电竞" : "注册并继续"}</button><label className="agreement-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>我已阅读并同意《用户协议》《隐私政策》《交易规则》</span></label></form><button type="button" className="guest-enter" onClick={() => go("home")}>先逛逛，稍后登录</button></div>;
}

function ProfileSetupScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [nickname, setNickname] = useState("熊崽玩家 K");
  return <div className="app-screen profile-setup-screen"><Header title="完善个人资料" subtitle="只需两步，开启游戏服务交易" back={() => go("auth")} /><div className="setup-progress"><i className="active" /><i /></div><section className="setup-avatar"><button type="button" onClick={() => notify("选择头像图片")}><img src={companions[0].image} alt="当前头像" /><em>更换头像</em></button><p>头像会展示在订单和聊天中</p></section><section className="form-panel setup-form"><label><span>昵称</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} /></label><small>{nickname.length}/16 · 请勿填写手机号或联系方式</small></section><section className="paper-panel setup-notice"><AppIcon kind="shield" /><span><b>隐私保护</b><small>手机号仅用于登录与交易安全，不会展示给其他用户。</small></span></section><button type="button" className="full-primary" onClick={() => { notify("个人资料已保存"); go("home"); }}>完成，进入首页</button></div>;
}

function SearchScreen({ go }: { go: (page: PageId) => void }) {
  const [query, setQuery] = useState(""); const [scope, setScope] = useState<"陪玩" | "服务">("陪玩"); const hot = ["稳定上分", "地铁逃生", "青受音", "娱乐四排", "耐心教学", "无敌战神"];
  const submit = (event: FormEvent) => { event.preventDefault(); go("searchResults"); };
  return <div className="app-screen search-screen"><Header title="搜索" subtitle="先选择陪玩或服务，再输入关键词" back={() => go("home")} /><form className="search-input-row" onSubmit={submit}><div className="search-scope-toggle" aria-label="搜索类型">{(["陪玩", "服务"] as const).map((item) => <button type="button" className={scope === item ? "active" : ""} onClick={() => setScope(item)} key={item}>{item}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={scope === "陪玩" ? "搜索陪玩昵称" : "搜索服务或玩法"} aria-label={`搜索${scope}关键词`} /><button type="submit">搜索</button></form><section className="paper-panel search-history"><SectionTitle title="最近搜索" action="清空" /><div>{["Kirito", "经典模式上分", "萝莉音陪玩"].map((item) => <button type="button" key={item} onClick={() => go("searchResults")}>{item}<i>›</i></button>)}</div></section><section className="paper-panel hot-search"><SectionTitle title="大家都在搜" note="实时热门" /><div>{hot.map((item, index) => <button type="button" key={item} onClick={() => go("searchResults")}><i>{index + 1}</i>{item}</button>)}</div></section><section className="home-section search-recommend"><SectionTitle title="猜你想找" note={scope === "陪玩" ? "高评价陪玩" : "高销量服务"} /><div className="shop-list">{companions.slice(0, 2).map((item) => <CompanionCard key={item.id} companion={item} go={go} wide />)}</div></section></div>;
}

function SearchResultsScreen({ go }: { go: (page: PageId) => void }) {
  const [tab, setTab] = useState<"陪玩" | "服务">("陪玩"); const [sort, setSort] = useState("综合"); const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const choose = (item: string) => { if (item === sort && item !== "综合") setDirection(direction === "desc" ? "asc" : "desc"); else { setSort(item); setDirection("desc"); } };
  return <div className="app-screen search-results-screen"><Header title="搜索结果" subtitle="“稳定上分” 的相关结果" back={() => go("search")} /><button type="button" className="result-search" onClick={() => go("search")}><i>⌕</i><span>稳定上分</span><em>修改</em></button><div className="segmented result-tabs"><button type="button" className={tab === "陪玩" ? "active" : ""} onClick={() => { setTab("陪玩"); setSort("综合"); }}>陪玩 28</button><button type="button" className={tab === "服务" ? "active" : ""} onClick={() => { setTab("服务"); setSort("综合"); }}>服务 64</button></div><SortBar options={tab === "陪玩" ? ["综合", "好评", "销量"] : ["综合", "销量", "价格"]} active={sort} direction={direction} onSelect={choose} /><section className="search-result-content">{tab === "陪玩" ? <div className="shop-list">{companions.map((item) => <CompanionCard key={item.id} companion={item} go={go} wide />)}</div> : <div className="product-grid">{services.map((item) => <ServiceCard key={item.id} service={item} go={go} />)}</div>}</section></div>;
}

function HomeScreen({ go, notify, unreadCount = 0 }: { go: (page: PageId) => void; notify: (message: string) => void; unreadCount?: number }) {
  const [mode, setMode] = useState<"推荐" | "陪玩" | "服务">("推荐"); const [companionSort, setCompanionSort] = useState("综合"); const [serviceSort, setServiceSort] = useState("综合"); const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const chooseSort = (item: string, current: string, setCurrent: (value: string) => void) => { if (item === current && item !== "综合") setDirection(direction === "desc" ? "asc" : "desc"); else { setCurrent(item); setDirection("desc"); } };
  const sortedCompanions = [...companions].sort((a, b) => companionSort === "好评" ? (Number(a.rating) - Number(b.rating)) * (direction === "desc" ? -1 : 1) : companionSort === "销量" ? (a.completed - b.completed) * (direction === "desc" ? -1 : 1) : 0);
  const sortedServices = [...services].sort((a, b) => serviceSort === "销量" ? (a.sold - b.sold) * (direction === "desc" ? -1 : 1) : serviceSort === "价格" ? (a.price - b.price) * (direction === "desc" ? -1 : 1) : 0);
  return <div className="app-screen home-screen"><StatusBar /><div className="buyer-home-head"><div className="home-brand home-wordmark"><img src="/assets/xiongzai-logo.png" alt="熊崽电竞" /></div></div>
    <button type="button" className="big-search" onClick={() => go("search")}><i>⌕</i><span>搜索陪玩 / 服务 / 玩法</span><em>搜索</em></button>
    <div className="browse-tabs buyer-tabs">{(["推荐", "陪玩", "服务"] as const).map((item) => <button type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{item}</button>)}</div>
    {mode === "推荐" ? <><button type="button" className="hero-banner" onClick={() => notify("本周和平精英上分季")}><img src="/assets/home-hero.png" alt="和平精英在线开黑" /><span className="hero-brand">1234 位陪玩在线</span></button><section className="home-section"><SectionTitle title="热门陪玩" note="高人气高评价的优秀陪玩" action="全部 ›" onAction={() => setMode("陪玩")} /><div className="shop-grid">{companions.slice(0, 2).map((item) => <CompanionCard key={item.id} companion={item} go={go} />)}</div></section><section className="home-section"><SectionTitle title="热门服务" note="近期玩家常买的服务" action="全部 ›" onAction={() => setMode("服务")} /><div className="product-grid">{services.slice(0, 2).map((item) => <ServiceCard key={item.id} service={item} go={go} />)}</div></section></> : null}
    {mode === "陪玩" ? <><SortBar options={["综合", "好评", "销量"]} active={companionSort} direction={direction} onSelect={(item) => chooseSort(item, companionSort, setCompanionSort)} /><section className="home-section listing-section"><SectionTitle title="全部陪玩" note="28 位在线" /><div className="shop-list">{sortedCompanions.map((item) => <CompanionCard key={item.id} companion={item} go={go} wide />)}</div></section></> : null}
    {mode === "服务" ? <><SortBar options={["综合", "销量", "价格"]} active={serviceSort} direction={direction} onSelect={(item) => chooseSort(item, serviceSort, setServiceSort)} /><section className="home-section listing-section"><SectionTitle title="全部服务" note="陪玩自主创建规格和价格" /><div className="product-grid">{sortedServices.map((item) => <ServiceCard key={item.id} service={item} go={go} />)}</div></section></> : null}
    <BuyerNav page="home" go={go} unreadCount={unreadCount} />
  </div>;
}

function CompanionScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const seller = companions[2]; const [favorite, setFavorite] = useState(false); const [playing, setPlaying] = useState(false); const sellerServices = [...services.filter((item) => item.sellerId === seller.id), services[1], services[2], services[3]];
  return <div className="app-screen companion-screen"><StatusBar /><Header title="陪玩主页" back={() => go("home")} actions={<IconButton label="分享" onClick={() => notify("陪玩主页链接已复制")}>↗</IconButton>} />
    <section className="store-hero"><img src="/assets/player-poster.png" alt="Kirito 陪玩主页" /><span className="store-online">在线接单</span><div className="store-identity"><h2>Kirito</h2><p>最强王者 · 职业选手认证</p><span>{seller.tags.map((tag) => <i key={tag}>{tag}</i>)}</span></div></section>
    <section className="store-stats"><div><b>4.9</b><span>综合评分</span></div><div><b>1523</b><span>完成订单</span></div><div><b>8</b><span>在售服务</span></div><div><b>2.4w</b><span>被收藏</span></div></section>
    <button type="button" className={`voice-card ${playing ? "playing" : ""}`} onClick={() => setPlaying(!playing)}><span><b>声音名片 · 青受音</b><small>先听声音，再决定要不要下单</small></span><i>{playing ? "Ⅱ" : "▶"}</i><em>{Array.from({ length: 18 }).map((_, index) => <b key={index} style={{ height: `${8 + (index % 5) * 3}px` }} />)}</em></button>
    <section className="paper-panel store-about"><SectionTitle title="关于我" note="主页介绍" /><p>主玩经典模式和地铁逃生，稳定报点、耐心沟通。服务前会先确认段位、玩法和期望时间。</p><div><span><b>和平精英资料</b><small>无敌战神 · 52 星 · K/D 3.21</small></span><em>已认证</em></div></section>
    <section className="home-section store-products"><SectionTitle title="全部服务" note="8 个服务在售" /><div className="product-grid">{sellerServices.map((item, index) => <ServiceCard key={`${item.id}-${index}`} service={item} go={go} />)}</div></section>
    <section className="paper-panel store-reviews"><SectionTitle title="买家评价" note="1523 条真实订单评价" action="全部 ›" onAction={() => notify("展示全部评价")} /><p>★★★★★ “技术好、沟通舒服，商品描述和实际服务一致。”</p><small>暖阳小熊 · 购买了「经典模式排位上分」</small></section>
    <div className="sticky-actions store-actions"><button type="button" className={favorite ? "follow-action active" : "follow-action"} onClick={() => setFavorite(!favorite)}><AppIcon kind="favorite" />{favorite ? "已收藏陪玩" : "收藏陪玩"}</button><button type="button" className="consult-action" onClick={() => go("chat")}><AppIcon kind="message" />咨询</button></div>
  </div>;
}

function ServiceScreen({ go, notify, selected, setSelected }: { go: (page: PageId) => void; notify: (message: string) => void; selected: number; setSelected: (value: number) => void }) {
  const [favorite, setFavorite] = useState(false); const service = services[0]; const seller = companions[2]; const specs = [{ name: "单排一局", price: 25, tone: "orange" }, { name: "双排一局", price: 45, tone: "lime" }, { name: "三排一局", price: 65, tone: "violet" }];
  return <div className="app-screen service-screen"><StatusBar /><Header title="服务详情" back={() => go("home")} actions={<IconButton label="分享" onClick={() => notify("服务链接已复制")}>↗</IconButton>} />
    <img className="service-main-image" src={service.cover} alt={service.title} /><section className="service-title-card"><div><span>{service.tags.map((tag) => <i key={tag}>{tag}</i>)}</span><h2>{service.title}</h2><p>{service.subtitle}</p></div><strong>¥{service.price}<small>起</small></strong><em>已售 {service.sold} · ★ {service.rating}</em></section>
    <section className="paper-panel spec-panel"><SectionTitle title="选择服务规格" note="价格由陪玩自主设置" /><div className="spec-grid">{specs.map((spec, index) => <button type="button" className={`spec-card ticket-${spec.tone} ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)} key={spec.name}><span>{spec.name}</span><b>¥{spec.price}</b><small>约 30–40 分钟</small><i>{["ARCADE", "PEAK", "TEAM"][index]}<br />PASS</i>{selected === index ? <em>✓</em> : null}</button>)}</div></section>
    <button type="button" className="service-store-card" onClick={() => go("companion")}><Avatar companion={seller} size="md" /><span><b>{seller.name} 的陪玩主页</b><small>{seller.rank} · ★ {seller.rating} · {seller.services} 项服务</small><em>{seller.tags.join(" · ")}</em></span><strong>进主页 ›</strong></button>
    <section className="paper-panel product-detail"><SectionTitle title="服务说明" /><dl><div><dt>可约时间</dt><dd>每天 08:00–24:00</dd></div><div><dt>平均接单</dt><dd>1 分钟</dd></div><div><dt>沟通方式</dt><dd>平台文字聊天</dd></div><div><dt>平台保障</dt><dd>退款与平台介入</dd></div></dl><p>开局前确认段位和期望时间，全程文明沟通，不使用任何违规工具。实际服务以所选规格为准。</p></section>
    <section className="paper-panel service-review"><SectionTitle title="服务评价" note="328 条" action="查看全部 ›" onAction={() => notify("展示全部服务评价")} /><p>★★★★★ “商品介绍写得很清楚，下单以后响应很快。”</p></section>
    <div className="sticky-actions service-actions"><button type="button" className="icon-action" onClick={() => go("chat")}><AppIcon kind="message" /><small>咨询</small></button><button type="button" className={`icon-action ${favorite ? "active" : ""}`} onClick={() => setFavorite(!favorite)}><AppIcon kind="favorite" /><small>收藏服务</small></button><button type="button" className="primary-action" onClick={() => go("specs")}>选择规格 <b>¥{specs[selected].price}起</b></button></div>
  </div>;
}

function SpecsScreen({ go, selected, setSelected }: { go: (page: PageId) => void; selected: number; setSelected: (value: number) => void }) {
  const specs = [{ name: "单排一局", price: 25, note: "约 30–40 分钟", tone: "orange" }, { name: "双排一局", price: 45, note: "优先接单", tone: "lime" }, { name: "三排一局", price: 65, note: "适合组队", tone: "violet" }];
  return <div className="app-screen specs-screen"><Header title="选择服务规格" subtitle="确认本次购买的服务内容" back={() => go("service")} /><section className="spec-service-brief"><img src={services[0].cover} alt={services[0].title} /><span><b>{services[0].title}</b><small>Kirito · ★ 4.9 · 平均 1 分钟接单</small></span></section><section className="paper-panel spec-full-list"><SectionTitle title="可选规格" note="价格由陪玩自主设置" />{specs.map((spec, index) => <button type="button" className={`spec-full ticket-${spec.tone} ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)} key={spec.name}><span><b>{spec.name}</b><small>{spec.note} · 可预约时间</small></span><strong>¥{spec.price}</strong><i>{selected === index ? "✓" : ""}</i></button>)}</section><section className="paper-panel spec-help"><AppIcon kind="shield" /><span><b>平台交易保障</b><small>下单后由陪玩接单；未履约可按规则申请退款或平台介入。</small></span></section><div className="checkout-bar"><span>已选 <b>¥{specs[selected].price}.00</b></span><button type="button" onClick={() => go("checkout")}>确认规格</button></div></div>;
}
function CheckoutScreen({ go, selected }: { go: (page: PageId) => void; selected: number }) {
  const specs = [{ name: "单排一局", price: 25 }, { name: "双排一局", price: 45 }, { name: "三排一局", price: 65 }]; const current = specs[selected]; const [time, setTime] = useState("今晚 20:30"); const [note, setNote] = useState("希望轻松沟通，开局前先确认段位");
  return <div className="app-screen checkout-screen"><StatusBar /><Header title="确认订单" subtitle="确认服务与预约时间" back={() => go("specs")} /><section className="checkout-service"><img src={services[0].cover} alt="服务主图" /><span><b>{services[0].title}</b><small>{current.name} · 约 30–40 分钟</small><em>陪玩：Kirito</em></span><strong>¥{current.price}</strong></section><section className="paper-panel checkout-form"><label><span>期望服务时间</span><input value={time} onChange={(event) => setTime(event.target.value)} /></label><label><span>订单备注</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={100} /><em>{note.length}/100</em></label></section><section className="paper-panel price-detail"><div><span>服务金额</span><b>¥{current.price}.00</b></div><div><span>平台交易保障</span><b>已包含</b></div><div className="total"><span>合计</span><b>¥{current.price}.00</b></div></section><div className="checkout-bar"><span>实付 <b>¥{current.price}.00</b></span><button type="button" onClick={() => go("payment")}>提交订单</button></div></div>;
}

function PaymentScreen({ go, selected, notify }: { go: (page: PageId) => void; selected: number; notify: (message: string) => void }) {
  const prices = [25, 45, 65]; const [channel, setChannel] = useState<"微信支付" | "支付宝">("微信支付");
  return <div className="app-screen payment-screen"><Header title="收银台" subtitle="请在 14:59 内完成支付" back={() => go("checkout")} /><section className="payment-amount"><span>订单应付</span><b>¥{prices[selected]}.00</b><small>熊崽电竞平台交易保障</small></section><section className="paper-panel payment-order"><span><b>{services[0].title}</b><small>订单号 XZ202608180001</small></span><em>¥{prices[selected]}.00</em></section><section className="payment-methods"><SectionTitle title="选择支付方式" />{["微信支付", "支付宝"].map((item, index) => <button type="button" className={channel === item ? "selected" : ""} onClick={() => setChannel(item as "微信支付" | "支付宝")} key={item}><i>{index === 0 ? "微" : "支"}</i><span><b>{item}</b><small>{index === 0 ? "推荐使用微信安全支付" : "跳转支付宝完成付款"}</small></span><em>{channel === item ? "✓" : ""}</em></button>)}</section><section className="paper-panel payment-security"><AppIcon kind="shield" /><p>付款资金由平台保障。服务完成并经买家确认后，平台再结算给陪玩。</p></section><button type="button" className="pay-button" onClick={() => { notify(`正在唤起${channel}`); window.setTimeout(() => go("paymentResult"), 500); }}>确认支付 ¥{prices[selected]}.00</button></div>;
}

function PaymentResultScreen({ go, selected }: { go: (page: PageId) => void; selected: number }) {
  const prices = [25, 45, 65];
  return <div className="app-screen payment-result-screen"><div className="result-hero"><span>✓</span><h1>支付成功</h1><p>陪玩已收到新订单提醒，请等待接单</p><b>¥{prices[selected]}.00</b></div><section className="paper-panel result-order-info"><div><span>订单编号</span><b>XZ202608180001</b></div><div><span>服务陪玩</span><b>Kirito</b></div><div><span>预约时间</span><b>今晚 20:30</b></div></section><section className="result-tips"><AppIcon kind="message" /><span><b>可以先联系陪玩</b><small>在平台内确认段位、时间和服务预期</small></span><button type="button" onClick={() => go("chat")}>去沟通</button></section><div className="result-actions"><button type="button" onClick={() => go("home")}>返回首页</button><button type="button" onClick={() => go("orderDetail")}>查看订单</button></div></div>;
}

const buyerOrders = [{ status: "待接单", title: services[0].title, seller: "Kirito", price: 25, action: "联系陪玩", tone: "orange" }, { status: "服务中", title: services[1].title, seller: "鹿野", price: 70, action: "联系陪玩", tone: "blue" }, { status: "已完成", title: services[2].title, seller: "小悠", price: 40, action: "去评价", tone: "lime" }];

function OrdersScreen({ go, notify, unreadCount = 0 }: { go: (page: PageId) => void; notify: (message: string) => void; unreadCount?: number }) {
  const [filter, setFilter] = useState("全部");
  return <div className="app-screen orders-screen"><StatusBar /><Header title="我的订单" subtitle="只显示我购买的服务" actions={<IconButton label="筛选" onClick={() => notify("已打开订单筛选")}><AppIcon kind="filter" /></IconButton>} /><div className="order-filter big-order-filter">{["全部", "待付款", "待接单", "服务中", "待确认", "已完成", "售后"].map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><section className="buyer-order-list">{buyerOrders.filter((item) => filter === "全部" || item.status === filter).map((order, index) => <article className="buyer-order-card" key={order.title}><div className="buyer-order-head"><button type="button" onClick={() => go("companion")}>熊崽电竞 · {order.seller} ›</button><b>{order.status}</b></div><button type="button" className="buyer-order-product" onClick={() => go("orderDetail")}><img src={services[index].cover} alt={order.title} /><span><b>{order.title}</b><small>{index === 0 ? "单排一局" : "双排两局"}</small></span><strong>¥{order.price}</strong></button><div className="buyer-order-actions"><button type="button" onClick={() => go("orderDetail")}>订单详情</button>{order.status === "待接单" ? <button type="button" onClick={() => go("refundApply")}>申请退款</button> : null}<button type="button" onClick={() => order.action.includes("联系") ? go("chat") : go("review")}>{order.action}</button></div></article>)}</section><button type="button" className="support-entry" onClick={() => go("complaint")}><AppIcon kind="shield" /><div><b>售后与平台介入</b><small>退款申请 · 投诉 · 交易纠纷</small></div><em>›</em></button><BuyerNav page="orders" go={go} unreadCount={unreadCount} /></div>;
}

function OrderTimeline({ active = 1 }: { active?: number }) {
  return <div className="order-timeline">{["已付款", "陪玩接单", "开始服务", "买家确认"].map((item, index) => <span className={index <= active ? "done" : ""} key={item}><i>{index < active ? "✓" : index + 1}</i><b>{item}</b></span>)}</div>;
}

function OrderDetailScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <div className="app-screen order-detail-screen"><Header title="订单详情" subtitle="订单号 XZ202608180001" back={() => go("orders")} actions={<IconButton label="更多操作" onClick={() => go("complaint")}>•••</IconButton>} /><section className="order-status-hero"><span>等待陪玩接单</span><h2>预计 12 分钟内响应</h2><p>超时未接单将按平台规则自动取消并原路退款</p></section><OrderTimeline active={1} /><button type="button" className="order-seller-card" onClick={() => go("companion")}><Avatar companion={companions[2]} size="md" /><span><b>Kirito</b><small>最强王者 · ★ 4.9 · 在线</small></span><em>查看陪玩主页 ›</em></button><section className="checkout-service order-detail-product"><img src={services[0].cover} alt={services[0].title} /><span><b>{services[0].title}</b><small>单排一局 · 约 30–40 分钟</small><em>今晚 20:30</em></span><strong>¥25</strong></section><section className="paper-panel order-facts"><div><span>订单备注</span><b>希望轻松沟通，开局前确认段位</b></div><div><span>下单时间</span><b>2026-08-18 19:42</b></div><div><span>支付方式</span><b>微信支付</b></div><div><span>实付金额</span><b>¥25.00</b></div></section><section className="paper-panel order-protection"><AppIcon kind="shield" /><span><b>平台交易保障中</b><small>请勿绕过平台交易，聊天记录可作为售后处理依据。</small></span></section><div className="order-detail-actions"><button type="button" onClick={() => go("refundApply")}>申请退款</button><button type="button" onClick={() => go("chat")}>联系陪玩</button><button type="button" onClick={() => notify("已提醒陪玩接单")}>提醒接单</button></div></div>;
}

function RefundApplyScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const reasons = ["陪玩长时间未接单", "预约时间无法履约", "服务与描述不符", "双方协商一致", "其他原因"];
  const [reason, setReason] = useState(reasons[0]); const [reasonOpen, setReasonOpen] = useState(false); const [description, setDescription] = useState("");
  return <div className="app-screen refund-apply-screen"><Header title="申请退款" subtitle="订单 XZ202608180001" back={() => go("orderDetail")} /><section className="refund-amount"><span>本次最多可退</span><b>¥25.00</b><small>退款将原路返回支付账户</small></section><section className="form-panel refund-form"><div className="refund-reason-field"><span>退款原因</span><button type="button" className={reasonOpen ? "open" : ""} aria-expanded={reasonOpen} onClick={() => setReasonOpen(!reasonOpen)}><b>{reason}</b><i /></button>{reasonOpen ? <div className="refund-reason-menu" role="listbox">{reasons.map((item) => <button type="button" className={reason === item ? "active" : ""} onClick={() => { setReason(item); setReasonOpen(false); }} key={item}><span>{item}</span><i>{reason === item ? "✓" : ""}</i></button>)}</div> : null}</div><label><span>补充说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="请描述退款原因，便于陪玩和平台处理" /><em>{description.length}/200</em></label></section><section className="paper-panel refund-rule"><SectionTitle title="退款规则" /><p>待接单状态可申请全额退款；进入服务后将根据实际履约情况由双方协商或平台判定。</p></section><button type="button" className="full-primary" onClick={() => { notify("退款申请已提交"); go("refundDetail"); }}>提交退款申请</button></div>;
}

function RefundDetailScreen({ go }: { go: (page: PageId) => void }) {
  return <div className="app-screen refund-detail-screen"><Header title="退款详情" subtitle="退款单 RF202608180016" back={() => go("orderDetail")} /><section className="after-sale-hero"><AppIcon kind="shield" /><span><h2>等待陪玩处理</h2><p>陪玩需在 23:48:16 内响应，超时将由平台自动介入。</p></span></section><div className="after-sale-steps"><span className="done"><i>✓</i><b>买家申请</b><small>19:58</small></span><span className="active"><i>2</i><b>陪玩处理</b><small>处理中</small></span><span><i>3</i><b>退款完成</b><small>预计 1–3 天</small></span></div><section className="paper-panel refund-summary"><div><span>退款金额</span><b>¥25.00</b></div><div><span>退款原因</span><b>陪玩长时间未接单</b></div><div><span>退款方式</span><b>原支付方式退回</b></div></section><section className="paper-panel process-log"><SectionTitle title="处理记录" /><div><i /><span><b>退款申请已提交</b><small>今天 19:58 · 等待陪玩处理</small></span></div><div><i /><span><b>订单支付成功</b><small>今天 19:42 · 微信支付</small></span></div></section><div className="after-sale-actions"><button type="button" onClick={() => go("chat")}>联系陪玩</button><button type="button" onClick={() => go("complaint")}>申请平台介入</button></div></div>;
}

function ComplaintScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [type, setType] = useState("服务与描述不符"); const [text, setText] = useState("");
  return <div className="app-screen complaint-screen"><Header title="投诉与平台介入" subtitle="平台将在 24 小时内受理" back={() => go("orderDetail")} /><section className="form-panel complaint-form"><label><span>投诉类型</span><select value={type} onChange={(event) => setType(event.target.value)}><option>服务与描述不符</option><option>陪玩未按约定履约</option><option>诱导线下交易</option><option>不文明沟通</option><option>其他问题</option></select></label><label><span>问题说明</span><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={500} placeholder="请说明问题发生的时间、过程和诉求" /><em>{text.length}/500</em></label><div className="evidence-uploader"><span>证据材料</span><button type="button" onClick={() => notify("选择聊天截图或其他图片")}>＋ 上传图片</button><small>最多 6 张，平台也会依法调取关联订单与聊天记录</small></div></section><section className="paper-panel complaint-notice"><AppIcon kind="shield" /><span><b>请如实提交</b><small>恶意投诉或伪造材料可能影响账号正常使用。</small></span></section><button type="button" className="full-primary" onClick={() => { notify("投诉已提交，平台将在 24 小时内处理"); go("orders"); }}>提交平台处理</button></div>;
}

function ReviewScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [rating, setRating] = useState(5); const [content, setContent] = useState("技术好、沟通舒服，服务和描述一致。"); const [anonymous, setAnonymous] = useState(false);
  return <div className="app-screen review-screen"><Header title="评价服务" subtitle="真实评价帮助其他玩家选择" back={() => go("orders")} /><section className="review-service"><img src={services[2].cover} alt={services[2].title} /><span><b>{services[2].title}</b><small>陪玩：小悠 · 双排两局</small></span></section><section className="paper-panel rating-panel"><b>本次服务体验如何？</b><div>{[1, 2, 3, 4, 5].map((star) => <button type="button" className={star <= rating ? "active" : ""} onClick={() => setRating(star)} key={star}>★</button>)}</div><p>{["很差", "较差", "一般", "满意", "非常满意"][rating - 1]}</p></section><section className="form-panel review-form"><label><span>评价内容</span><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={300} /><em>{content.length}/300</em></label><div className="review-tags">{["技术靠谱", "准时接单", "沟通舒服", "耐心教学"].map((item) => <button type="button" key={item}>{item}</button>)}</div><label className="anonymous-review"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /><span>匿名展示评价</span></label></section><button type="button" className="full-primary" onClick={() => { notify("评价发布成功"); go("orders"); }}>发布评价</button></div>;
}

function MessagesScreen({ go, unreadCount, markRead }: { go: (page: PageId) => void; unreadCount: number; markRead: () => void }) {
  return <div className="app-screen messages-screen"><StatusBar /><Header title="消息" subtitle="第一阶段仅支持文字聊天" /><section className="message-list">{companions.slice(0, 3).map((item, index) => <button type="button" key={item.id} className={index === 0 && unreadCount ? "unread" : ""} onClick={() => { if (index === 0) markRead(); go("chat"); }}><Avatar companion={item} size="md" /><span><b>{item.name}<time>{["19:52", "18:36", "昨天"][index]}</time></b><small>{["今晚 8 点可以，我已经看到订单了", "开局前把段位发给我就好", "感谢评价，欢迎下次再来"][index]}</small></span>{index === 0 && unreadCount ? <em>{unreadCount}</em> : null}</button>)}</section><section className="paper-panel message-safety"><b>交易安全提醒</b><p>请在平台内沟通与下单，聊天第一阶段仅支持文字，避免发送联系方式或线下交易。</p></section><BuyerNav page="messages" go={go} unreadCount={unreadCount} /></div>;
}

function ChatScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [text, setText] = useState(""); const [messages, setMessages] = useState([{ id: 1, text: "你好，今晚 8 点可以接单吗？", mine: true, read: true }, { id: 2, text: "可以的，请问你目前是什么段位？", mine: false, read: true }, { id: 3, text: "永恒钻石，希望轻松上分。", mine: true, read: true }]); const send = () => { if (!text.trim()) return; const id = Date.now(); setMessages((current) => [...current, { id, text: text.trim(), mine: true, read: false }]); setText(""); notify("消息已发送"); window.setTimeout(() => setMessages((current) => current.map((message) => message.id === id ? { ...message, read: true } : message)), 1200); };
  const lastMineIndex = messages.reduce((last, message, index) => message.mine ? index : last, -1);
  return <div className="app-screen chat-screen"><StatusBar /><Header title="Kirito" subtitle="在线 · 平均 1 分钟响应" back={() => go("messages")} actions={<IconButton label="陪玩主页" onClick={() => go("companion")}>♙</IconButton>} /><div className="chat-notice">交易沟通请留在平台内 · 仅支持文字消息</div><section className="chat-messages">{messages.map((message, index) => <div className={message.mine ? "message mine" : "message theirs"} key={message.id}>{message.mine ? null : <button type="button" className="chat-avatar-button" aria-label="查看陪玩主页" onClick={() => go("companion")}><Avatar companion={companions[2]} size="md" /></button>}<span><p>{message.text}</p>{message.mine && index === lastMineIndex ? <small className={message.read ? "read-receipt read" : "read-receipt"}>{message.read ? "已读" : "未读"}</small> : null}</span>{message.mine ? <button type="button" className="chat-avatar-button" aria-label="查看买家主页" onClick={() => notify("已打开买家主页")}><Avatar companion={companions[0]} size="md" /></button> : null}</div>)}</section><div className="chat-product"><img src={services[0].cover} alt="咨询中的服务" /><span><b>{services[0].title}</b><small>¥25 起 · 可直接下单</small></span><button type="button" onClick={() => go("service")}>查看</button></div><div className="chat-input"><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && send()} placeholder="输入文字消息…" /><button type="button" onClick={send}>发送</button></div></div>;
}

function FavoritesScreen({ go }: { go: (page: PageId) => void }) {
  const [tab, setTab] = useState<"陪玩" | "服务">("陪玩");
  return <div className="app-screen favorites-screen"><StatusBar /><Header title="我的收藏" subtitle="陪玩和服务分别收藏" back={() => go("mine")} /><div className="segmented favorite-tabs"><button type="button" className={tab === "陪玩" ? "active" : ""} onClick={() => setTab("陪玩")}>收藏的陪玩 12</button><button type="button" className={tab === "服务" ? "active" : ""} onClick={() => setTab("服务")}>收藏的服务 8</button></div><section className="favorite-content">{tab === "陪玩" ? <div className="shop-list">{companions.slice(0, 3).map((item) => <CompanionCard key={item.id} companion={item} go={go} wide />)}</div> : <div className="product-grid">{services.slice(0, 3).map((item) => <ServiceCard key={item.id} service={item} go={go} />)}</div>}</section></div>;
}

function MineScreen({ go, notify, unreadCount = 0 }: { go: (page: PageId) => void; notify: (message: string) => void; unreadCount?: number }) {
  return <div className="app-screen mine-screen buyer-mine"><StatusBar /><div className="mine-sky"><Header title="我的" subtitle="个人资料与常用功能" actions={<IconButton label="设置" onClick={() => go("settings")}>⌾</IconButton>} /><section className="mine-profile"><Avatar companion={companions[0]} size="lg" /><div><h2>熊崽玩家 K</h2><p>ID：10086</p></div></section></div>
    <section className="mine-grid buyer-assets"><button type="button" onClick={() => go("favorites")}><AppIcon kind="favorite" className="asset-symbol" /><b>我的收藏</b><span>陪玩 12 · 服务 8</span></button><button type="button" onClick={() => notify("优惠券") }><AppIcon kind="coupon" className="asset-symbol" /><b>优惠券</b><span>5 张可用</span></button></section>
    <section className="mine-menu">{[["mine", "编辑个人资料", "头像、昵称", "editProfile"], ["message", "文字消息", `${unreadCount} 条未读`, "messages"], ["shield", "平台规则与售后", "交易保障", "rules"], ["setting", "设置与隐私", "陪玩身份申请入口", "settings"]].map(([icon, title, note, target]) => <button type="button" onClick={() => go(target as PageId)} key={title}><AppIcon kind={icon} className="menu-symbol" /><span><b>{title}</b><small>{note}</small></span><em>›</em></button>)}</section><BuyerNav page="mine" go={go} unreadCount={unreadCount} />
  </div>;
}

function EditProfileScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [nickname, setNickname] = useState("熊崽玩家 K");
  return <div className="app-screen edit-profile-screen"><Header title="编辑个人资料" subtitle="公开资料将在陪玩和聊天中展示" back={() => go("mine")} /><section className="edit-avatar"><button type="button" onClick={() => notify("选择新头像")}><img src={companions[0].image} alt="当前头像" /><i>更换</i></button><p>支持 JPG、PNG，建议使用清晰头像</p></section><section className="settings-group profile-fields"><div className="profile-nickname-field"><label htmlFor="profile-nickname"><b>昵称</b><small>2–16 个字符</small></label><input id="profile-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} /></div><button type="button" onClick={() => notify("手机号修改需要短信验证")}><span><b>手机号码</b><small>用于登录与交易安全</small></span><em>138****8000 ›</em></button></section><section className="paper-panel profile-privacy"><AppIcon kind="shield" /><span><b>资料安全</b><small>手机号码不会公开展示；昵称与头像需通过内容安全检查。</small></span></section><button type="button" className="full-primary" onClick={() => { notify("个人资料已保存"); go("mine"); }}>保存资料</button></div>;
}

function RulesScreen({ go }: { go: (page: PageId) => void }) {
  const [open, setOpen] = useState("交易规则"); const rules = [{ title: "交易规则", note: "下单、接单、履约与确认", body: "所有交易必须在熊崽电竞平台完成。陪玩接单前确认规格和时间，服务完成后买家确认，平台再进行收益结算。" }, { title: "退款规则", note: "不同订单状态的退款条件", body: "待接单可申请全额退款；服务中退款需双方协商；争议订单可申请平台介入，按订单、聊天和履约证据处理。" }, { title: "陪玩服务规范", note: "文明沟通与禁止行为", body: "严禁外挂、代充、线下交易、引流和不文明服务。违规服务会被下架，严重情况暂停或终止陪玩身份。" }, { title: "评价与投诉", note: "真实评价和平台治理", body: "评价需来自真实完成订单。平台可隐藏违规评价；恶意投诉、伪造材料等行为将按平台规则处理。" }, { title: "隐私与账号安全", note: "数据使用和账号保护", body: "手机号、支付和身份信息仅用于登录、交易安全和依法合规处理，不向普通用户公开。" }];
  return <div className="app-screen rules-screen"><Header title="平台规则与售后" subtitle="下单前请了解交易与退款规则" back={() => go("mine")} /><section className="rules-hero"><AppIcon kind="shield" /><span><h2>熊崽电竞平台保障</h2><p>平台内支付 · 订单留痕 · 退款与投诉介入</p></span></section><section className="rules-list">{rules.map((rule) => <article className={open === rule.title ? "open" : ""} key={rule.title}><button type="button" onClick={() => setOpen(open === rule.title ? "" : rule.title)}><span><b>{rule.title}</b><small>{rule.note}</small></span><em>{open === rule.title ? "−" : "+"}</em></button>{open === rule.title ? <p>{rule.body}</p> : null}</article>)}</section><button type="button" className="support-entry rules-support" onClick={() => go("complaint")}><AppIcon kind="message" /><div><b>仍然需要帮助？</b><small>发起投诉或申请平台介入</small></div><em>›</em></button></div>;
}

function SettingsScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <div className="app-screen settings-screen"><StatusBar /><Header title="设置" subtitle="账号、隐私与身份" back={() => go("mine")} /><section className="settings-group"><button type="button" onClick={() => go("editProfile")}><span><b>个人资料</b><small>头像、昵称、手机号</small></span><em>›</em></button><button type="button" onClick={() => notify("隐私设置已打开")}><span><b>隐私与安全</b><small>账号保护、黑名单</small></span><em>›</em></button></section><section className="seller-identity-card"><img src="/assets/xiongzai-icon.png" alt="熊崽电竞陪玩认证" /><div><span>SELLER IDENTITY</span><h2>陪玩身份</h2><p>通过审核后，才可以拥有陪玩主页、发布服务并处理卖家订单。</p><b>当前状态：审核已通过</b></div><button type="button" onClick={() => go("seller")}>进入陪玩中心</button></section><section className="settings-group"><button type="button" onClick={() => go("sellerApplyStatus")}><span><b>申请成为陪玩</b><small>查看申请资料和审核记录</small></span><em>已通过 ›</em></button><button type="button" onClick={() => go("rules")}><span><b>平台规则</b><small>交易、退款、评价规范</small></span><em>›</em></button><button type="button" onClick={() => { notify("已退出登录"); window.setTimeout(() => go("auth"), 500); }}><span><b>退出登录</b></span><em>›</em></button></section></div>;
}

function SellerApplyFormScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState("Kirito");
  return <div className="app-screen seller-apply-form-screen">
    <Header title="申请成为陪玩" subtitle={`第 ${step} 步，共 2 步`} back={() => step === 1 ? go("settings") : setStep(1)} />
    <div className="apply-progress"><span className={step >= 1 ? "active" : ""}><i>1</i><b>基本资料</b></span><span className={step >= 2 ? "active" : ""}><i>2</i><b>游戏与声音</b></span><span><i>3</i><b>平台审核</b></span></div>
    {step === 1 ? <>
      <section className="form-panel apply-form">
        <label htmlFor="seller-nickname"><span>陪玩昵称</span><input id="seller-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} /></label>
        <label htmlFor="seller-introduction"><span>主页介绍</span><textarea id="seller-introduction" defaultValue="主玩经典模式和地铁逃生，稳定报点、耐心沟通。" maxLength={300} /></label>
        <div className="form-field"><span>身份认证</span><button type="button" onClick={() => notify("上传实名认证材料")}>上传认证材料 ›</button></div>
      </section>
      <section className="paper-panel apply-agreement"><AppIcon kind="shield" /><span><b>陪玩准入说明</b><small>申请资料仅用于平台审核。审核通过后才可创建主页、发布服务和处理订单。</small></span></section>
      <button type="button" className="full-primary" onClick={() => setStep(2)}>下一步</button>
    </> : <>
      <section className="form-panel apply-form">
        <label htmlFor="seller-rank"><span>和平精英段位</span><input id="seller-rank" defaultValue="无敌战神 · 52 星" /></label>
        <div className="form-field"><span>游戏资料截图</span><button type="button" onClick={() => notify("上传游戏资料截图")}>＋ 上传截图</button></div>
        <div className="form-field"><span>声音名片</span><button type="button" onClick={() => notify("开始录制 10–30 秒声音名片")}>● 录制声音名片</button></div>
        <label htmlFor="seller-hours"><span>当前可接单时间</span><input id="seller-hours" defaultValue="每天 18:00–24:00" /></label>
      </section>
      <button type="button" className="full-primary" onClick={() => { notify("陪玩申请已提交审核"); go("sellerApplyStatus"); }}>提交平台审核</button>
    </>}
  </div>;
}
function ApplyScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <div className="app-screen apply-screen"><StatusBar /><Header title="陪玩申请状态" subtitle="审核通过后开启陪玩中心" back={() => go("settings")} /><div className="apply-progress"><span className="done"><i>1</i><b>基本资料</b></span><span className="done"><i>2</i><b>游戏资料</b></span><span className="active"><i>3</i><b>平台审核</b></span></div><section className="paper-panel apply-status"><span>✓</span><h2>陪玩身份审核已通过</h2><p>你已经可以创建公开陪玩主页、上传试音、发布服务和处理卖家订单。</p><button type="button" onClick={() => go("seller")}>进入陪玩中心</button></section><section className="paper-panel apply-info"><SectionTitle title="已提交资料" /><div><span>真实姓名认证</span><b>已完成</b></div><div><span>和平精英资料</span><b>无敌战神 · 52 星</b></div><div><span>声音名片</span><b>15 秒 · 已审核</b></div><button type="button" onClick={() => go("sellerApplyForm")}>修改并重新提交</button></section><button type="button" className="secondary-full" onClick={() => notify("审核记录：2026-08-17 通过")}>查看审核记录</button></div>;
}

function SellerCenterScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  void notify;
  return <div className="app-screen seller-screen"><StatusBar /><Header title="陪玩中心" subtitle="Kirito 的经营工作台" back={() => go("mine")} actions={<IconButton label="卖家通知" badge={3}><AppIcon kind="message" /></IconButton>} /><section className="seller-dashboard-hero"><div><span>今日收入</span><b>¥268.00</b><small>较昨日 +18%</small></div><button type="button" onClick={() => go("sellerEarnings")}>查看收益 ›</button></section><section className="seller-kpis"><div><span>新订单</span><b>3</b></div><div><span>服务中</span><b>2</b></div><div><span>待确认</span><b>1</b></div><div><span>在售服务</span><b>8</b></div></section><section className="seller-quick"><SectionTitle title="经营工具" /><div>{[["order", "卖家订单", "sellerOrders"], ["service", "服务管理", "sellerServices"], ["mine", "主页管理", "sellerProfile"], ["withdraw", "收益提现", "sellerEarnings"]].map(([icon, label, page]) => <button type="button" key={label} onClick={() => go(page as PageId)}><AppIcon kind={icon} className="seller-tool-icon" /><span>{label}</span></button>)}</div></section><section className="paper-panel seller-todo"><SectionTitle title="待处理事项" note="今天" /><button type="button" onClick={() => go("sellerOrders")}><span><b>3 个新订单等待接单</b><small>最早订单剩余 12 分钟</small></span><em>处理 ›</em></button><button type="button" onClick={() => go("sellerServices")}><span><b>1 个服务审核未通过</b><small>需要修改服务说明</small></span><em>查看 ›</em></button></section><button type="button" className="public-home-preview" onClick={() => go("companion")}><Avatar companion={companions[2]} /><span><b>查看我的公开陪玩主页</b><small>买家看到的主页效果</small></span><em>预览 ›</em></button><SellerNav page="seller" go={go} /></div>;
}

function SellerServicesScreen({ go, notify, tab, setTab, submittedServiceTitle }: { go: (page: PageId) => void; notify: (message: string) => void; tab: string; setTab: (tab: string) => void; submittedServiceTitle: string }) {
  const submittedService: Service = { ...services[0], id: 99, title: submittedServiceTitle || "和平精英排位上分｜稳定沟通不冷场", sold: 0 };
  const visible = tab === "审核中" ? [...(submittedServiceTitle ? [submittedService] : []), services[2]] : tab === "已下架" ? services.slice(0, 2) : services.filter((_, index) => index !== 2);
  const auditCount = submittedServiceTitle ? 2 : 1;
  return <div className="app-screen seller-services-screen"><StatusBar /><Header title="服务管理" subtitle="只有陪玩卖家可以发布服务" back={() => go("seller")} actions={<button type="button" className="seller-add" onClick={() => go("sellerPublish")}>＋ 发布服务</button>} /><div className="segmented seller-service-tabs">{[["出售中", 8], ["审核中", auditCount], ["已下架", 2]].map(([name, count]) => <button type="button" className={tab === name ? "active" : ""} onClick={() => setTab(String(name))} key={name}>{name} {count}</button>)}</div><section className="seller-service-list">{visible.map((service) => <article className={service.id === 99 ? "newly-submitted" : ""} key={service.id}><img src={service.cover} alt={service.title} /><div><b>{service.title}</b><small>{service.id === 99 ? "刚刚提交 · 等待平台审核" : `¥${service.price} 起 · ${service.sold} 单`}</small><span>{tab === "审核中" ? "审核中" : tab === "已下架" ? "已下架" : "出售中"}</span></div><button type="button" onClick={() => go("sellerServiceEdit")}>管理</button></article>)}</section>{tab === "已下架" ? <button type="button" className="empty-helper" onClick={() => notify("服务重新上架后需平台审核")}>了解重新上架规则</button> : null}<button type="button" className="draft-box-fixed" onClick={() => notify("草稿箱：2 个未发布服务")}><AppIcon kind="service" /><span>草稿箱</span><b>2</b></button><button type="button" className="seller-publish-fixed" onClick={() => go("sellerPublish")}>＋ 发布新服务</button><SellerNav page="sellerServices" go={go} /></div>;
}

function SellerPublishScreen({ go, notify, onSubmitted }: { go: (page: PageId) => void; notify: (message: string) => void; onSubmitted: (title: string) => void }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [availability, setAvailability] = useState(""); const [specs, setSpecs] = useState([{ name: "", price: "" }, { name: "", price: "" }]);
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmitted(title.trim() || "和平精英排位上分｜稳定沟通不冷场"); notify("服务已提交审核，可在审核中查看"); window.setTimeout(() => go("sellerServices"), 600); };
  return <div className="app-screen seller-publish-screen"><StatusBar /><Header title="发布服务" subtitle="创建服务商品，等待平台审核" back={() => go("sellerServices")} /><form className="seller-publish-form" onSubmit={submit}><section className="publish-cover"><img src="/assets/publish-arcade.png" alt="服务主图预览" /><button type="button" onClick={() => notify("选择服务主图")}>上传主图</button></section><section className="form-panel"><div className="form-title"><b>服务内容</b><span>必填</span></div><label><span>服务标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入服务标题" /></label><label><span>服务详情</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="介绍服务内容、沟通方式和注意事项" /></label></section><section className="form-panel"><div className="form-title"><b>自定义规格与价格</b><span>卖家自主设置</span></div><div className="spec-editor">{specs.map((spec, index) => <div key={index}><input value={spec.name} placeholder={`输入规格 ${index + 1} 名称`} aria-label={`规格${index + 1}名称`} onChange={(event) => setSpecs(specs.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /><label><span>¥</span><input value={spec.price} placeholder="价格" aria-label={`规格${index + 1}价格`} onChange={(event) => setSpecs(specs.map((item, i) => i === index ? { ...item, price: event.target.value } : item))} /></label><button type="button" onClick={() => setSpecs(specs.filter((_, i) => i !== index))}>×</button></div>)}</div><button type="button" className="add-spec" onClick={() => setSpecs([...specs, { name: "", price: "" }])}>＋ 添加规格</button></section><section className="form-panel"><label><span>可接单时间</span><input value={availability} onChange={(event) => setAvailability(event.target.value)} placeholder="例如：每天 18:00–24:00" /></label></section><div className="publish-submit"><button type="button" onClick={() => notify("草稿已保存，可在草稿箱查看")}>存草稿</button><button type="submit">提交审核</button></div></form></div>;
}

function SellerServiceEditScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [online, setOnline] = useState(true); const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  return <div className="app-screen seller-service-edit-screen"><Header title="编辑服务" subtitle="修改公开展示与服务规格" back={() => go("sellerServices")} actions={<button type="button" className="preview-link" onClick={() => go("service")}>预览</button>} /><section className="edit-review-notice"><span>!</span><p><b>重要字段修改后需要重新审核</b><small>输入框留空时保留当前内容，无需先删除原文字。</small></p></section><section className="publish-cover edit-cover"><img src={services[0].cover} alt="服务主图" /><button type="button" onClick={() => notify("更换服务主图")}>更换主图</button></section><section className="form-panel"><label><span>服务标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入新的服务标题（留空保留原内容）" maxLength={40} /></label><label><span>服务详情</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="输入新的服务详情（留空保留原内容）" maxLength={1000} /></label></section><section className="form-panel edit-specs"><SectionTitle title="规格与价格" note="3 个规格" />{[["单排一局", 25], ["双排一局", 45], ["三排一局", 65]].map(([name, price]) => <div key={name}><span><b>{name}</b><small>约 30–40 分钟</small></span><strong>¥{price}</strong><button type="button" onClick={() => notify(`编辑${name}`)}>编辑</button></div>)}</section><section className="settings-group listing-control"><button type="button" onClick={() => setOnline(!online)}><span><b>服务状态</b><small>{online ? "买家可以搜索和购买" : "服务已从买家端下架"}</small></span><em className={online ? "switch-on" : "switch-off"}>{online ? "在售" : "下架"}</em></button></section><div className="publish-submit"><button type="button" onClick={() => notify("服务已删除，可在回收站恢复")}>删除服务</button><button type="button" onClick={() => { notify("修改已提交审核"); go("sellerServices"); }}>保存修改</button></div></div>;
}

function SellerOrdersScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [tab, setTab] = useState("新订单"); const orders = [{ buyer: "暖阳小熊", status: "新订单", title: services[0].title, action: "接单", price: 25 }, { buyer: "闪电小子", status: "服务中", title: services[1].title, action: "完成服务", price: 70 }, { buyer: "海岛阿七", status: "待确认", title: services[2].title, action: "提醒确认", price: 40 }, { buyer: "岛上风", status: "已完成", title: services[3].title, action: "查看详情", price: 45 }, { buyer: "轻舟", status: "售后", title: services[0].title, action: "处理退款", price: 25 }];
  return <div className="app-screen seller-orders-screen"><StatusBar /><Header title="卖家订单" subtitle="买家下单后的履约工作台" back={() => go("seller")} /><div className="order-filter seller-order-filter">{["新订单", "服务中", "待确认", "已完成", "售后"].map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><section className="mission-list">{orders.filter((order) => order.status === tab).map((order, index) => <article className={`mission-card mission-${["orange", "blue", "lime", "blue", "orange"][orders.indexOf(order)]}`} key={order.buyer}><span className="mission-label">MISSION<small>SELLER</small></span><button type="button" className="mission-body" onClick={() => go("sellerOrderDetail")}><div className="mission-head"><span>买家 {order.buyer}</span><b>{order.status}</b></div><h2>{order.title}</h2><p>今晚 20:00 · 1 小时</p><div className="mission-user"><img src={companions[index % companions.length].image} alt={order.buyer} /><span>订单备注：轻松沟通</span><strong>¥{order.price}</strong></div></button><div className="mission-action"><button type="button" onClick={() => go("chat")}>联系买家</button><button type="button" onClick={() => order.action.includes("详情") ? go("sellerOrderDetail") : notify(`${order.action}操作已确认`)}>{order.action}</button></div></article>)}</section><SellerNav page="sellerOrders" go={go} /></div>;
}

function SellerOrderDetailScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <div className="app-screen seller-order-detail-screen"><Header title="卖家订单详情" subtitle="订单 XZ202608180001" back={() => go("sellerOrders")} /><section className="seller-order-status"><span>新订单 · 等待接单</span><h2>剩余 12:36</h2><p>请在倒计时结束前接单或拒绝，超时订单将自动取消。</p></section><OrderTimeline active={1} /><section className="paper-panel buyer-contact-card"><Avatar companion={companions[0]} size="md" /><span><b>买家：暖阳小熊</b><small>预约今晚 20:00 · 平台内文字沟通</small></span><button type="button" onClick={() => go("chat")}>联系买家</button></section><section className="checkout-service seller-order-product"><img src={services[0].cover} alt={services[0].title} /><span><b>{services[0].title}</b><small>单排一局 · 约 30–40 分钟</small><em>备注：希望轻松沟通</em></span><strong>¥25</strong></section><section className="paper-panel order-facts"><div><span>陪玩收入</span><b>¥22.50</b></div><div><span>平台服务费</span><b>¥2.50</b></div><div><span>下单时间</span><b>今天 19:42</b></div><div><span>期望时间</span><b>今晚 20:00</b></div></section><section className="paper-panel seller-action-note"><AppIcon kind="shield" /><span><b>履约操作将记录在订单时间线</b><small>接单后请按约定时间提供服务，完成服务后等待买家确认。</small></span></section><div className="seller-order-actions"><button type="button" onClick={() => notify("拒单需要填写原因")}>拒绝订单</button><button type="button" onClick={() => { notify("接单成功"); go("sellerOrders"); }}>确认接单</button></div></div>;
}

function EarningsPicker({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false); const selected = options.find((item) => item.value === value)?.label ?? value;
  return <div className={`earnings-picker ${open ? "open" : ""}`}><span>{label}</span><button type="button" aria-expanded={open} onClick={() => setOpen(!open)}><b>{selected}</b><i /></button>{open ? <div className="earnings-picker-menu" role="listbox">{options.map((item) => <button type="button" className={item.value === value ? "active" : ""} onClick={() => { onChange(item.value); setOpen(false); }} key={item.value}>{item.label}<i>{item.value === value ? "✓" : ""}</i></button>)}</div> : null}</div>;
}

function SellerEarningsScreen({ go }: { go: (page: PageId) => void }) {
  const [range, setRange] = useState<EarningsRange>("本周"); const [year, setYear] = useState("2026"); const [month, setMonth] = useState("8"); const [week, setWeek] = useState("整月");
  const records: Record<EarningsRange, { amount: number; orders: number; average: number; pending: number; chart: number[]; labels: string[] }> = {
    今日: { amount: 268, orders: 8, average: 33.5, pending: 56, chart: [22, 18, 36, 31, 56, 82, 68], labels: ["08", "10", "12", "14", "16", "18", "20"] },
    昨日: { amount: 316, orders: 9, average: 35.1, pending: 25, chart: [31, 45, 28, 61, 49, 91, 74], labels: ["08", "10", "12", "14", "16", "18", "20"] },
    本周: { amount: 1268, orders: 36, average: 35.2, pending: 236, chart: [35, 54, 42, 74, 58, 92, 68], labels: ["一", "二", "三", "四", "五", "六", "日"] },
    本月: { amount: 5680, orders: 162, average: 35.1, pending: 436, chart: [42, 63, 58, 76, 69, 88, 72], labels: ["1周", "2周", "3周", "4周", "5周", "", ""] },
    本年: { amount: 42680, orders: 1216, average: 35.1, pending: 836, chart: [28, 39, 48, 56, 64, 71, 86], labels: ["2月", "3月", "4月", "5月", "6月", "7月", "8月"] },
    累计: { amount: 126800, orders: 3612, average: 35.1, pending: 836, chart: [18, 28, 37, 49, 61, 78, 94], labels: ["20", "21", "22", "23", "24", "25", "26"] },
  };
  const base = records[range]; const selectedWeek = week === "整月" ? 1 : [0.22, 0.24, 0.27, 0.23, 0.12][Number(week.replace("第", "").replace("周", "")) - 1] ?? 1; const monthFactor = range === "本年" || range === "累计" ? Math.max(.62, 1 - Math.abs(8 - Number(month)) * .045) : 1; const factor = selectedWeek * monthFactor; const amount = Math.round(base.amount * factor); const orders = Math.max(1, Math.round(base.orders * factor)); const chart = base.chart.map((value, index) => Math.max(12, Math.round(value * (week === "整月" ? 1 : .82 + ((index + Number(month)) % 3) * .09)))); const formatMoney = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
  return <div className="app-screen seller-earnings-screen"><StatusBar /><Header title="收益中心" subtitle="按时间查看收益和订单表现" back={() => go("seller")} actions={<IconButton label="提现记录" onClick={() => go("withdrawals")}><AppIcon kind="order" /></IconButton>} /><section className="earnings-balance"><span>可提现金额</span><b>¥1,986.00</b><button type="button" onClick={() => go("withdraw")}>提现</button><small>待结算 ¥236.00</small></section><div className="earnings-range-tabs">{(["今日", "昨日", "本周", "本月", "本年", "累计"] as EarningsRange[]).map((item) => <button type="button" className={range === item ? "active" : ""} onClick={() => { setRange(item); setWeek(item === "本月" ? "整月" : week); }} key={item}>{item}</button>)}</div>{range !== "今日" && range !== "昨日" ? <section className="earnings-pickers"><EarningsPicker label="年份" value={year} onChange={setYear} options={["2026", "2025", "2024"].map((item) => ({ value: item, label: `${item}年` }))} /><EarningsPicker label="月份" value={month} onChange={setMonth} options={Array.from({ length: 12 }, (_, index) => ({ value: `${index + 1}`, label: `${index + 1}月` }))} /><EarningsPicker label="周次" value={week} onChange={setWeek} options={[{ value: "整月", label: "整月" }, ...[1, 2, 3, 4, 5].map((item) => ({ value: `第${item}周`, label: `第${item}周` }))]} /></section> : null}<section className="earnings-summary"><div><span>{range}{week !== "整月" ? ` · ${week}` : ""}收益</span><b>{formatMoney(amount)}</b><small>已完成服务收入</small></div><div><span>完成订单</span><b>{orders}</b><small>平均客单 ¥{base.average.toFixed(1)}</small></div><div><span>待结算</span><b>¥{Math.round(base.pending * factor)}</b><small>完成后自动结算</small></div></section><section className="paper-panel earnings-chart"><SectionTitle title={`${year}年${month}月收益趋势`} note={formatMoney(amount)} /><div>{chart.map((height, index) => <span key={index}><i style={{ height: `${height}%` }} /><small>{base.labels[index]}</small></span>)}</div></section><section className="paper-panel income-list"><SectionTitle title="收益明细" note={`${range}${week !== "整月" ? ` · ${week}` : ""}`} action="全部 ›" onAction={() => go("incomeDetails")} /><div><span><b>经典模式排位上分</b><small>订单完成 · 今天 20:36</small></span><strong>+¥25.00</strong></div><div><span><b>地铁逃生带飞</b><small>订单完成 · 今天 18:12</small></span><strong>+¥70.00</strong></div><div><span><b>欢乐四排娱乐陪玩</b><small>订单完成 · 昨天 22:18</small></span><strong>+¥40.00</strong></div></section><SellerNav page="sellerEarnings" go={go} /></div>;
}

function SellerEarningsCompleteScreen({ go }: { go: (page: PageId) => void }) {
  const [range, setRange] = useState<EarningsRange>("本周"); const values: Record<EarningsRange, [string, string, string]> = { 今日: ["¥268.00", "8", "¥56"], 昨日: ["¥316.00", "9", "¥25"], 本周: ["¥1,268.00", "36", "¥236"], 本月: ["¥5,680.00", "162", "¥436"], 本年: ["¥42,680.00", "1,216", "¥836"], 累计: ["¥126,800.00", "3,612", "¥836"] }; const current = values[range];
  return <div className="app-screen seller-earnings-screen"><Header title="收益中心" subtitle="按时间查看收益和订单表现" back={() => go("seller")} actions={<IconButton label="提现记录" onClick={() => go("withdrawals")}><AppIcon kind="order" /></IconButton>} /><section className="earnings-balance"><span>可提现金额</span><b>¥1,986.00</b><button type="button" onClick={() => go("withdraw")}>提现</button><small>待结算 ¥236.00</small></section><div className="earnings-range-tabs">{(["今日", "昨日", "本周", "本月", "本年", "累计"] as EarningsRange[]).map((item) => <button type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)} key={item}>{item}</button>)}</div><section className="earnings-summary"><div><span>{range}收益</span><b>{current[0]}</b><small>已完成服务收入</small></div><div><span>完成订单</span><b>{current[1]}</b><small>平均客单 ¥35.2</small></div><div><span>待结算</span><b>{current[2]}</b><small>完成后自动结算</small></div></section><section className="paper-panel earnings-chart"><SectionTitle title="收益趋势" note={current[0]} /><div>{[36, 52, 43, 72, 58, 91, 68].map((height, index) => <span key={index}><i style={{ height: `${height}%` }} /><small>{["一", "二", "三", "四", "五", "六", "日"][index]}</small></span>)}</div></section><section className="paper-panel income-list"><SectionTitle title="收益明细" note={range} action="全部 ›" onAction={() => go("incomeDetails")} /><div><span><b>经典模式排位上分</b><small>订单完成 · 今天 20:36</small></span><strong>+¥25.00</strong></div><div><span><b>地铁逃生带飞</b><small>订单完成 · 今天 18:12</small></span><strong>+¥70.00</strong></div><div><span><b>欢乐四排娱乐陪玩</b><small>订单完成 · 昨天 22:18</small></span><strong>+¥40.00</strong></div></section><SellerNav page="sellerEarnings" go={go} /></div>;
}
void SellerEarningsCompleteScreen;

function IncomeDetailsScreen({ go }: { go: (page: PageId) => void }) {
  const [filter, setFilter] = useState("全部"); const records = [{ title: "经典模式排位上分", date: "今天 20:36", amount: 25, status: "已结算" }, { title: "地铁逃生带飞", date: "今天 18:12", amount: 70, status: "待结算" }, { title: "欢乐四排娱乐陪玩", date: "昨天 22:18", amount: 40, status: "已结算" }, { title: "巅峰赛冲分", date: "8月16日 21:05", amount: 45, status: "已退款" }];
  return <div className="app-screen income-details-screen"><Header title="收益明细" subtitle="每笔收入与订单一一对应" back={() => go("sellerEarnings")} /><section className="income-total"><span>本月服务收入</span><b>¥5,680.00</b><small>已结算 ¥4,986.00 · 待结算 ¥694.00</small></section><div className="income-filters">{["全部", "已结算", "待结算", "退款"].map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><section className="income-records">{records.filter((item) => filter === "全部" || item.status.includes(filter.replace("退款", "退款"))).map((record) => <button type="button" onClick={() => go("sellerOrderDetail")} key={`${record.title}-${record.date}`}><span><b>{record.title}</b><small>{record.date} · {record.status}</small></span><strong className={record.status === "已退款" ? "negative" : ""}>{record.status === "已退款" ? "−" : "+"}¥{record.amount}.00</strong><em>›</em></button>)}</section><section className="paper-panel ledger-note"><AppIcon kind="shield" /><span><b>账务记录不可修改</b><small>退款或平台补偿会生成新的冲正记录，确保每笔资金变化可追溯。</small></span></section></div>;
}

function WithdrawScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [amount, setAmount] = useState("500"); const [account, setAccount] = useState<"支付宝" | "微信">("支付宝");
  const fee = Number(amount || 0) * 0.001;
  return <div className="app-screen withdraw-screen">
    <Header title="收益提现" subtitle="资金将转入已验证的收款账户" back={() => go("sellerEarnings")} actions={<button type="button" className="preview-link" onClick={() => go("withdrawals")}>提现记录</button>} />
    <section className="withdraw-balance"><span>可提现金额</span><b>¥1,986.00</b><small>最低提现 ¥10.00</small></section>
    <section className="form-panel withdraw-form">
      <label htmlFor="withdraw-amount"><span>提现金额</span><div><b>¥</b><input id="withdraw-amount" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /><button type="button" onClick={() => setAmount("1986")}>全部</button></div></label>
      <div className="form-field withdraw-account-field"><span>收款账户</span><div className="payment-account-switch">{(["支付宝", "微信"] as const).map((item) => <button type="button" className={account === item ? "active" : ""} onClick={() => setAccount(item)} key={item}><i>{item === "支付宝" ? "支" : "微"}</i><span><b>{item}</b><small>{item === "支付宝" ? "熊崽玩家 K · 138****8000" : "微信实名账户 · 熊崽玩家 K"}</small></span><em>{account === item ? "✓" : ""}</em></button>)}</div><button type="button" className="manage-account" onClick={() => notify("管理收款账户")}>管理收款账户 ›</button></div>
    </section>
    <section className="paper-panel withdraw-fee"><div><span>提现金额</span><b>¥{Number(amount || 0).toFixed(2)}</b></div><div><span>手续费</span><b>¥{fee.toFixed(2)}</b></div><div><span>预计到账</span><b>¥{Math.max(0, Number(amount || 0) - fee).toFixed(2)}</b></div></section>
    <section className="paper-panel withdraw-notice"><AppIcon kind="shield" /><span><b>预计 1–2 个工作日到账</b><small>提现申请需经过平台风控审核，处理结果会通过站内消息通知。</small></span></section>
    <button type="button" className="full-primary" onClick={() => { notify("提现申请已提交"); go("withdrawals"); }}>确认提现</button>
  </div>;
}

function WithdrawalsScreen({ go }: { go: (page: PageId) => void }) {
  const records = [{ date: "2026-08-18 21:06", amount: "¥500.00", state: "处理中", note: "预计 1–2 个工作日到账" }, { date: "2026-08-12 10:32", amount: "¥800.00", state: "已到账", note: "支付宝 · 尾号 8000" }, { date: "2026-08-02 17:25", amount: "¥300.00", state: "已拒绝", note: "收款账户信息需重新验证" }];
  return <div className="app-screen withdrawals-screen"><Header title="提现记录" subtitle="查看申请进度与处理结果" back={() => go("sellerEarnings")} /><section className="withdraw-record-list">{records.map((record) => <article key={record.date}><div><span>{record.state}</span><b>{record.amount}</b><small>{record.date}</small></div><p>{record.note}</p>{record.state === "已拒绝" ? <button type="button" onClick={() => go("withdraw")}>重新申请</button> : null}</article>)}</section><section className="paper-panel withdraw-help"><SectionTitle title="提现说明" /><p>处理中无法重复提交；到账或拒绝后会发送站内通知。如信息有误，请更新收款账户后重新申请。</p></section></div>;
}

function SellerProfileScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <div className="app-screen seller-profile-screen"><StatusBar />
    <Header title="主页管理" subtitle="编辑买家看到的陪玩主页" back={() => go("seller")} actions={<button type="button" className="preview-link" onClick={() => go("companion")}>预览主页</button>} />
    <section className="seller-profile-cover"><img src="/assets/player-poster.png" alt="陪玩主页封面" /><button type="button" onClick={() => notify("更换主页封面")}>更换封面</button></section>
    <section className="form-panel profile-editor">
      <label htmlFor="public-seller-name"><span>陪玩昵称</span><input id="public-seller-name" defaultValue="Kirito" /></label>
      <label htmlFor="public-seller-intro"><span>主页介绍</span><textarea id="public-seller-intro" defaultValue="主玩经典模式和地铁逃生，稳定报点、耐心沟通。" /></label>
      <label htmlFor="public-game-profile"><span>游戏资料</span><input id="public-game-profile" defaultValue="无敌战神 · 52 星 · K/D 3.21" /></label>
      <div className="form-field"><span>声音名片</span><button type="button" onClick={() => notify("重新录制声音名片")}>▶ 当前试音 15 秒 · 更换</button></div>
      <label htmlFor="seller-availability"><span>当前接单状态</span><select id="seller-availability" defaultValue="online"><option value="online">在线接单</option><option value="pause">暂停接单</option></select></label>
    </section>
    <button type="button" className="save-profile" onClick={() => notify("陪玩主页已保存")}>保存主页</button>
  </div>;
}

export default function Home() {
  const [page, setPage] = useState<PageId>("home");
  const [toast, setToast] = useState("");
  const [selectedSpec, setSelectedSpec] = useState(0);
  const [unreadCount, setUnreadCount] = useState(2);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [sellerServicesTab, setSellerServicesTab] = useState("出售中");
  const [submittedServiceTitle, setSubmittedServiceTitle] = useState("");
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 1800); };
  const common = { go: setPage, notify };
  const renderScreen = () => {
    switch (page) {
      case "splash": return <SplashScreen go={setPage} />;
      case "auth": return <AuthScreen {...common} />;
      case "profileSetup": return <ProfileSetupScreen {...common} />;
      case "search": return <SearchScreen go={setPage} />;
      case "searchResults": return <SearchResultsScreen go={setPage} />;
      case "companion": return <CompanionScreen {...common} />;
      case "service": return <ServiceScreen {...common} selected={selectedSpec} setSelected={setSelectedSpec} />;
      case "specs": return <SpecsScreen go={setPage} selected={selectedSpec} setSelected={setSelectedSpec} />;
      case "checkout": return <CheckoutScreen go={setPage} selected={selectedSpec} />;
      case "payment": return <PaymentScreen {...common} selected={selectedSpec} />;
      case "paymentResult": return <PaymentResultScreen go={setPage} selected={selectedSpec} />;
      case "orders": return <OrdersScreen {...common} unreadCount={unreadCount} />;
      case "orderDetail": return <OrderDetailScreen {...common} />;
      case "refundApply": return <RefundApplyScreen {...common} />;
      case "refundDetail": return <RefundDetailScreen go={setPage} />;
      case "complaint": return <ComplaintScreen {...common} />;
      case "review": return <ReviewScreen {...common} />;
      case "messages": return <MessagesScreen go={setPage} unreadCount={unreadCount} markRead={() => setUnreadCount(0)} />;
      case "chat": return <ChatScreen {...common} />;
      case "mine": return <MineScreen {...common} unreadCount={unreadCount} />;
      case "favorites": return <FavoritesScreen go={setPage} />;
      case "editProfile": return <EditProfileScreen {...common} />;
      case "rules": return <RulesScreen go={setPage} />;
      case "settings": return <SettingsScreen {...common} />;
      case "apply":
      case "sellerApplyStatus": return <ApplyScreen {...common} />;
      case "sellerApplyForm": return <SellerApplyFormScreen {...common} />;
      case "seller": return <SellerCenterScreen {...common} />;
      case "sellerServices": return <SellerServicesScreen {...common} tab={sellerServicesTab} setTab={setSellerServicesTab} submittedServiceTitle={submittedServiceTitle} />;
      case "sellerPublish": return <SellerPublishScreen {...common} onSubmitted={(title) => { setSubmittedServiceTitle(title); setSellerServicesTab("审核中"); }} />;
      case "sellerServiceEdit": return <SellerServiceEditScreen {...common} />;
      case "sellerOrders": return <SellerOrdersScreen {...common} />;
      case "sellerOrderDetail": return <SellerOrderDetailScreen {...common} />;
      case "sellerEarnings": return <SellerEarningsScreen go={setPage} />;
      case "incomeDetails": return <IncomeDetailsScreen go={setPage} />;
      case "withdraw": return <WithdrawScreen {...common} />;
      case "withdrawals": return <WithdrawalsScreen go={setPage} />;
      case "sellerProfile": return <SellerProfileScreen {...common} />;
      default: return <HomeScreen {...common} unreadCount={unreadCount} />;
    }
  };
  const catalogItem = pageCatalog.flatMap((group) => group.items.map((item) => ({ ...item, group: group.group }))).find((item) => item.page === page);
  const meta = pageMeta.find((item) => item.page === page) ?? { page, no: "MVP", title: catalogItem?.title ?? "买家首页", note: catalogItem?.group ?? "完整 MVP 页面" };
  return <main className="site-stage"><aside className="brand-rail"><img className="rail-logo" src="/assets/xiongzai-logo.png" alt="熊崽电竞" /><span className="rail-tag">买家 App + 陪玩中心</span><div className="rail-copy"><span>{meta.no} / 06</span><h1>{meta.title}</h1><p>{meta.note}</p></div><nav className="page-picker" aria-label="核心页面">{pageMeta.map((item) => <button type="button" key={item.page} className={meta.page === item.page ? "active" : ""} onClick={() => setPage(item.page)}><span>{item.no}</span><b>{item.title}</b><em>↗</em></button>)}</nav><button type="button" className="open-page-catalog" onClick={() => setCatalogOpen(true)}>查看全部 MVP 页面 <b>39</b></button><div className="rail-slogan"><b>PLAY<br />WITH JOY!</b><span>找陪玩，选服务，安心下单</span></div></aside><section className={`phone-shell page-${page}`} aria-label={`熊崽电竞 ${meta.title}预览`}>{renderScreen()}{toast ? <div className="app-toast" role="status">{toast}</div> : null}</section>{catalogOpen ? <div className="page-catalog-backdrop" role="dialog" aria-modal="true" aria-label="全部 MVP 页面"><section className="page-catalog-panel"><header><div><span>39 SCREENS</span><h2>完整 MVP 页面</h2><p>买家端 25 页 · 陪玩中心 14 页</p></div><button type="button" aria-label="关闭页面目录" onClick={() => setCatalogOpen(false)}>×</button></header><div>{pageCatalog.map((group) => <section key={group.group}><h3>{group.group}</h3><div>{group.items.map((item) => <button type="button" className={page === item.page ? "active" : ""} onClick={() => { setPage(item.page); setCatalogOpen(false); }} key={`${group.group}-${item.title}`}><span>{item.title}</span><em>›</em></button>)}</div></section>)}</div></section></div> : null}</main>;
}
