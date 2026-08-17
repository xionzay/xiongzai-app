"use client";

import { FormEvent, useMemo, useState } from "react";

type PageId = "home" | "profile" | "product" | "publish" | "orders" | "mine" | "checkout" | "chat";
type MainPage = Exclude<PageId, "checkout" | "chat">;
type Tone = "orange" | "lime" | "violet" | "blue";

type Player = { name: string; image: string; level: number; rank: string; rating: string; price: number; online?: boolean };

const players: Player[] = [
  { name: "鹿野", image: "/assets/player-luye.png", level: 28, rank: "最强王者", rating: "5.0", price: 25, online: true },
  { name: "小悠", image: "/assets/player-xiaoyou.png", level: 25, rank: "永恒钻石 I", rating: "4.9", price: 20, online: true },
  { name: "Kirito", image: "/assets/player-kirito.png", level: 28, rank: "无敌战神", rating: "4.9", price: 25, online: true },
  { name: "苏苏", image: "/assets/player-susu.png", level: 26, rank: "荣耀王者", rating: "4.9", price: 22 },
];

const serviceTickets: Array<{ name: string; note: string; price: number; tone: Tone; code: string }> = [
  { name: "排位上分", note: "急速上分", price: 25, tone: "orange", code: "ARCADE TICKET" },
  { name: "巅峰赛陪玩", note: "冲击巅峰", price: 35, tone: "lime", code: "PEAK PASS" },
  { name: "娱乐局陪玩", note: "轻松娱乐", price: 20, tone: "violet", code: "FUN PASS" },
];

const pageMeta: Record<MainPage, { index: string; title: string; note: string }> = {
  home: { index: "01", title: "首页", note: "发现可靠的和平精英陪玩" },
  profile: { index: "02", title: "陪玩主页", note: "资料、试音、服务与真实评价" },
  product: { index: "03", title: "商品详情", note: "自由规格与清晰交易保障" },
  publish: { index: "04", title: "发布商品", note: "陪玩自主创建服务和价格" },
  orders: { index: "05", title: "订单", note: "买卖双方共享同一订单状态" },
  mine: { index: "06", title: "我的", note: "个人资产与陪玩工作台" },
};

function IconButton({ children, label, onClick, badge }: { children: React.ReactNode; label: string; onClick?: () => void; badge?: number }) {
  return <button type="button" className="icon-button" aria-label={label} onClick={onClick}>{children}{badge ? <em>{badge}</em> : null}</button>;
}

function StatusBar() { return <div className="status-bar"><b>9:41</b><span>▮▮▮ ◉ ▰</span></div>; }

function Header({ title, subtitle, back, actions }: { title: string; subtitle?: string; back?: () => void; actions?: React.ReactNode }) {
  return <header className="screen-header"><div className="header-title">{back ? <IconButton label="返回" onClick={back}>‹</IconButton> : null}<div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div></div><div className="header-actions">{actions}</div></header>;
}

function Avatar({ player, size = "md" }: { player: Player; size?: "sm" | "md" | "lg" }) {
  return <span className={`avatar avatar-${size}`}><img src={player.image} alt={`${player.name}头像`} />{player.online ? <i aria-label="在线" /> : null}</span>;
}

function BottomNav({ page, go }: { page: PageId; go: (next: PageId) => void }) {
  const items: Array<{ label: string; icon: string; page: PageId; badge?: number }> = [
    { label: "首页", icon: "⌂", page: "home" }, { label: "消息", icon: "◌", page: "chat", badge: 2 },
    { label: "发布", icon: "+", page: "publish" }, { label: "订单", icon: "▣", page: "orders" }, { label: "我的", icon: "♙", page: "mine" },
  ];
  return <nav className="bottom-nav" aria-label="底部主导航">{items.map((item) => <button type="button" key={item.label} className={`${page === item.page ? "active" : ""} ${item.label === "发布" ? "publish-nav" : ""}`} onClick={() => go(item.page)}><i>{item.icon}</i><span>{item.label}</span>{item.badge ? <em>{item.badge}</em> : null}</button>)}</nav>;
}

function Ticket({ name, note, price, tone, code, onClick, compact = false }: { name: string; note: string; price: number; tone: Tone; code: string; onClick: () => void; compact?: boolean }) {
  return <button type="button" className={`service-ticket ticket-${tone} ${compact ? "compact" : ""}`} onClick={onClick}><span className="ticket-copy"><b>{name}</b><small>{note}</small><strong>¥{price}<em>/局</em></strong></span><span className="ticket-stub"><i>{code}</i><b>★</b></span></button>;
}

function HomeScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [filter, setFilter] = useState("全部");
  return <div className="app-screen home-screen"><StatusBar />
    <div className="home-topline"><button type="button" className="mini-brand" onClick={() => notify("欢迎来到熊崽电竞")}><img src="/assets/xiongzai-icon.png" alt="熊崽电竞" /><span>熊崽电竞</span></button><button type="button" className="search-pill" onClick={() => notify("可搜索陪玩昵称或服务商品")}><i>⌕</i><span>搜索陪玩 / 服务</span></button><IconButton label="通知" badge={3} onClick={() => notify("你有 3 条新通知")}>♧</IconButton></div>
    <button type="button" className="hero-banner" onClick={() => notify("本周上分季活动")}><img src="/assets/home-hero.png" alt="在线开黑，一起玩和平精英" /><span className="hero-brand">熊崽电竞 · 和平精英专区</span></button>
    <section className="home-section player-section"><div className="section-title"><div><b>热门陪玩</b><span>真人资料 · 平台审核</span></div><button type="button" onClick={() => notify("已展示全部陪玩")}>全部 ›</button></div><div className="player-card-row">{players.map((player, index) => <button type="button" className="player-card" key={player.name} onClick={() => go("profile")}><span className="ranking">{index + 1}</span><span className="player-photo"><img src={player.image} alt={player.name} />{player.online ? <i>在线</i> : null}</span><span className="player-card-copy"><b>{player.name}</b><em>★ {player.rating}</em><small><i>Lv.{player.level}</i>{player.rank}</small><strong>¥{player.price}<em>/局</em></strong></span></button>)}</div></section>
    <section className="home-section service-section"><div className="section-title"><div><b>热门服务</b><span>自由定价 · 选规格下单</span></div><button type="button" onClick={() => notify("已展示全部商品")}>全部 ›</button></div><div className="ticket-row">{serviceTickets.map((ticket) => <Ticket key={ticket.name} {...ticket} onClick={() => go("product")} compact />)}</div></section>
    <section className="home-section play-filter"><div className="section-title"><div><b>按玩法找人</b><span>快速匹配合适的 TA</span></div></div><div className="filter-row">{["全部", "上分型", "技术型", "娱乐型", "教学型"].map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><button type="button" className="quick-match" onClick={() => notify(`正在为你匹配${filter === "全部" ? "合适" : filter}陪玩`)}><span><b>现在有人在线</b><small>平均 1 分钟响应</small></span><em>快速匹配 →</em></button></section>
    <BottomNav page="home" go={go} />
  </div>;
}

function ProfileScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [followed, setFollowed] = useState(false); const [playing, setPlaying] = useState(false);
  return <div className="app-screen profile-screen"><StatusBar /><Header title="玩家主页" back={() => go("home")} actions={<><IconButton label="分享" onClick={() => notify("主页分享链接已复制")}>↗</IconButton><IconButton label="更多" onClick={() => notify("举报与屏蔽")}>•••</IconButton></>} />
    <section className="profile-poster"><img src="/assets/player-poster.png" alt="Kirito 陪玩形象" /><span className="online-ribbon">在线 · 可接单</span><div className="poster-rank"><b>Lv.28</b><span>最强王者</span></div><div className="poster-name"><h2>Kirito <i>♂</i></h2><p>ID：10086 · 职业选手认证</p></div></section>
    <button type="button" className={`voice-card ${playing ? "playing" : ""}`} onClick={() => setPlaying(!playing)}><span><b>声音名片</b><small>温柔清晰 · 15 秒</small></span><i>{playing ? "Ⅱ" : "▶"}</i><em>{Array.from({ length: 24 }).map((_, i) => <b key={i} style={{ height: `${7 + (i % 5) * 3}px` }} />)}</em></button>
    <section className="paper-panel profile-tags-panel"><div className="panel-title"><b>玩家标签</b><span>平台资料认证</span></div><div className="tag-row"><span>国服中单</span><span>巅峰前百</span><span>教学耐心</span><span>话多开朗</span></div></section>
    <section className="paper-panel"><div className="panel-title"><b>荣誉墙</b><button type="button" onClick={() => notify("共 18 枚成就徽章")}>18 枚 ›</button></div><div className="badge-shelf">{["♛", "MVP", "★", "⚡", "✦"].map((badge, i) => <span key={`${badge}-${i}`}><i>{badge}</i><small>{["巅峰王者", "全场最佳", "五星陪伴", "极速响应", "百场玩家"][i]}</small></span>)}</div></section>
    <section className="profile-metrics"><div><b>98%</b><span>好评率</span></div><div><b>1523</b><span>完成订单</span></div><div><b>2.4w</b><span>被收藏</span></div></section>
    <section className="paper-panel seller-services"><div className="panel-title"><b>他的服务</b><button type="button" onClick={() => go("product")}>全部 6 个 ›</button></div>{serviceTickets.slice(0, 2).map((ticket) => <Ticket key={ticket.name} {...ticket} onClick={() => go("product")} />)}</section>
    <section className="paper-panel review-card"><div className="panel-title"><b>真实评价</b><button type="button" onClick={() => notify("查看全部 1523 条评价")}>全部 ›</button></div><p>★★★★★ “技术好也很耐心，沟通舒服，约好的时间准时上线。”</p><span>暖阳小熊 · 3 天前</span></section>
    <div className="sticky-actions"><button type="button" className="plain-action" onClick={() => go("chat")}>◌ 咨询</button><button type="button" className={followed ? "follow-action active" : "follow-action"} onClick={() => setFollowed(!followed)}>{followed ? "✓ 已收藏" : "+ 收藏"}</button><button type="button" className="primary-action" onClick={() => go("product")}>查看服务</button></div>
  </div>;
}

function ProductScreen({ go, notify, selected, setSelected }: { go: (page: PageId) => void; notify: (message: string) => void; selected: number; setSelected: (index: number) => void }) {
  const [favorite, setFavorite] = useState(false);
  const specs = [{ name: "单排一局", note: "人工接单", price: 25, tone: "orange" as Tone }, { name: "双排一局", note: "优先接单", price: 45, tone: "lime" as Tone }, { name: "三排一局", note: "组队畅玩", price: 65, tone: "violet" as Tone }];
  return <div className="app-screen product-screen"><StatusBar /><Header title="商品详情" back={() => go("home")} actions={<><IconButton label="收藏" onClick={() => setFavorite(!favorite)}>{favorite ? "★" : "☆"}</IconButton><IconButton label="分享" onClick={() => notify("商品链接已复制")}>↗</IconButton></>} />
    <img className="product-hero" src="/assets/product-hero.png" alt="和平精英排位上分服务" />
    <section className="paper-panel spec-panel"><div className="panel-title"><b>选择规格</b><span>卖家自主定价</span></div><div className="spec-grid">{specs.map((spec, index) => <button type="button" className={`spec-card ticket-${spec.tone} ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)} key={spec.name}><span>{spec.name}</span><b>¥{spec.price}</b><small>{spec.note}</small><i>{["ARCADE", "PEAK", "TEAM"][index]}<br />PASS</i>{selected === index ? <em>✓</em> : null}</button>)}</div></section>
    <button type="button" className="seller-card" onClick={() => go("profile")}><Avatar player={players[2]} size="md" /><span><b>Kirito <i>Lv.28</i></b><small>最强王者 · 职业选手认证</small><em>国服中单　教学耐心</em></span><strong>进主页 ›</strong></button>
    <section className="profile-metrics product-metrics"><div><b>98%</b><span>好评率</span></div><div><b>1523</b><span>完成订单</span></div><div><b>2.4w</b><span>被收藏</span></div><div><b>平台保障</b><span>安心服务</span></div></section>
    <section className="paper-panel product-detail"><div className="panel-title"><b>商品详情</b></div><dl><div><dt>服务时间</dt><dd>08:00–24:00</dd></div><div><dt>服务时长</dt><dd>约 30–40 分钟/局</dd></div><div><dt>平均接单</dt><dd>1 分钟</dd></div><div><dt>沟通方式</dt><dd>平台文字聊天</dd></div></dl><p>稳定高效上分，开局前确认段位与期望时间。全程文明沟通，不使用任何违规工具。</p></section>
    <section className="guarantee-strip"><span>♢</span><div><b>熊崽电竞交易保障</b><small>订单留痕 · 退款申请 · 平台介入</small></div><button type="button" onClick={() => notify("已打开平台交易规则")}>规则 ›</button></section>
    <div className="sticky-actions product-actions"><button type="button" className="icon-action" onClick={() => go("chat")}>◌<small>咨询</small></button><button type="button" className="icon-action" onClick={() => setFavorite(!favorite)}>{favorite ? "★" : "☆"}<small>收藏</small></button><button type="button" className="secondary-action" onClick={() => notify("服务已加入收藏夹")}>加入收藏</button><button type="button" className="primary-action" onClick={() => go("checkout")}>立即下单 <b>¥{specs[selected].price}</b></button></div>
  </div>;
}

function CheckoutScreen({ go, selected, notify }: { go: (page: PageId) => void; selected: number; notify: (message: string) => void }) {
  const specs = [{ name: "单排一局", price: 25 }, { name: "双排一局", price: 45 }, { name: "三排一局", price: 65 }]; const current = specs[selected];
  const [time, setTime] = useState("今晚 20:30"); const [note, setNote] = useState("希望轻松沟通，开局前先确认段位");
  return <div className="app-screen checkout-screen"><StatusBar /><Header title="确认订单" subtitle="付款前请确认服务信息" back={() => go("product")} />
    <section className="paper-panel checkout-seller"><Avatar player={players[2]} /><div><b>Kirito</b><span><i /> 在线 · 平均 1 分钟响应</span></div><em>和平精英</em></section>
    <section className="checkout-ticket"><span>MISSION</span><div><b>5V5 排位上分</b><small>{current.name} · 约 30–40 分钟</small></div><strong>¥{current.price}</strong></section>
    <section className="paper-panel checkout-form"><label><span>期望服务时间</span><input value={time} onChange={(event) => setTime(event.target.value)} /></label><label><span>订单备注</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={100} /><em>{note.length}/100</em></label></section>
    <section className="paper-panel price-detail"><div><span>商品金额</span><b>¥{current.price}.00</b></div><div><span>优惠券</span><b className="discount">暂无可用</b></div><div><span>平台服务保障</span><b>已包含</b></div><div className="total"><span>合计</span><b>¥{current.price}.00</b></div></section>
    <section className="checkout-notice"><b>下单须知</b><p>支付后卖家需接单才进入服务流程。沟通请使用平台文字聊天，交易争议可申请平台介入。</p></section>
    <div className="checkout-bar"><span>实付 <b>¥{current.price}.00</b></span><button type="button" onClick={() => { notify("支付成功，订单已创建"); window.setTimeout(() => go("orders"), 600); }}>提交并支付</button></div>
  </div>;
}

type Order = { id: string; title: string; user: string; image: string; state: "待接单" | "服务中" | "待确认" | "已完成"; price: number; tone: Tone; action: string };
const buyOrders: Order[] = [
  { id: "20260817001", title: "和平精英 · 带飞上分", user: "暖阳小熊", image: "/assets/player-luye.png", state: "待接单", price: 68, tone: "orange", action: "联系卖家" },
  { id: "20260816032", title: "和平精英 · 战术陪玩", user: "闪电小子", image: "/assets/player-kirito.png", state: "服务中", price: 88, tone: "blue", action: "联系玩家" },
  { id: "20260815018", title: "和平精英 · 娱乐陪玩", user: "Viper", image: "/assets/player-xiaoyou.png", state: "已完成", price: 56, tone: "lime", action: "评价" },
];

function OrdersScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [mode, setMode] = useState<"buy" | "sell">("buy"); const [filter, setFilter] = useState("全部");
  const orders = mode === "buy" ? buyOrders : buyOrders.map((item, index) => ({ ...item, user: ["奶糖", "海岛阿七", "小北"][index], state: (["待接单", "服务中", "待确认"] as Order["state"][])[index], action: ["接单", "完成服务", "提醒确认"][index] }));
  return <div className="app-screen orders-screen"><StatusBar /><Header title="订单" subtitle="每一局，都是新的任务" actions={<><IconButton label="切换身份" onClick={() => setMode(mode === "buy" ? "sell" : "buy")}>♙</IconButton><IconButton label="筛选" onClick={() => notify("已打开订单筛选")}>▽</IconButton></>} />
    <div className="segmented"><button type="button" className={mode === "buy" ? "active" : ""} onClick={() => setMode("buy")}>我购买的</button><button type="button" className={mode === "sell" ? "active" : ""} onClick={() => setMode("sell")}>我发布的</button></div>
    <div className="order-filter">{["全部", "待接单", "服务中", "待确认", "已完成"].map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
    <section className="mission-list">{orders.filter((item) => filter === "全部" || item.state === filter).map((order) => <article className={`mission-card mission-${order.tone}`} key={`${mode}-${order.id}`}><span className="mission-label">MISSION<small>熊崽电竞</small></span><div className="mission-body"><div className="mission-head"><span>订单号 {order.id}</span><b>{order.state}</b></div><h2>{order.title}</h2><p>05-24 20:00　|　1 小时</p><div className="mission-user"><img src={order.image} alt={order.user} /><span>{mode === "buy" ? "下单玩家" : "买家"} · {order.user}</span><strong>¥{order.price}</strong></div></div><div className="mission-action"><button type="button" onClick={() => notify("已收藏此订单")}>☆</button><button type="button" onClick={() => order.action.includes("联系") ? go("chat") : notify(`${order.action}操作已确认`)}>{order.action}</button></div></article>)}</section>
    <button type="button" className="support-entry" onClick={() => notify("已进入退款、投诉与平台介入中心")}><span>♢</span><div><b>售后与平台介入</b><small>退款申请 · 投诉 · 交易纠纷</small></div><em>›</em></button><BottomNav page="orders" go={go} />
  </div>;
}

function PublishScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [step, setStep] = useState(1); const [specs, setSpecs] = useState([{ name: "单排一局", price: "25" }, { name: "双排一局", price: "45" }]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (step < 3) setStep(step + 1); else { notify("商品已提交平台审核"); go("mine"); } };
  return <div className="app-screen publish-screen"><StatusBar /><Header title="发布商品" subtitle="创建一张你的专属游戏卡" back={() => go("mine")} actions={<button type="button" className="demo-button" onClick={() => notify("已加载发布示例")}>＋ 玩法示例</button>} />
    <div className="publish-steps">{["填写内容", "预览商品", "提交审核"].map((item, index) => <span className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} key={item}><i>{index + 1}</i><b>{item}</b></span>)}</div>
    <form onSubmit={submit} className="publish-form"><section className="publish-cover"><img src="/assets/publish-arcade.png" alt="商品海报预览" /><button type="button" onClick={() => notify("请选择商品主图")}>上传海报</button></section>
      <section className="form-panel"><div className="form-title"><b>填写内容</b><span>必填</span></div><label><span>商品标题</span><input defaultValue="和平精英排位上分｜稳定沟通不冷场" maxLength={30} /></label><label><span>服务介绍</span><textarea defaultValue="欢迎来到我的游戏世界！擅长多位置，可带飞上分，全程轻松愉快。" maxLength={200} /></label></section>
      <section className="form-panel"><div className="form-title"><b>自定义规格</b><span>卖家自主定价</span></div><div className="spec-editor">{specs.map((spec, index) => <div key={`${index}-${spec.name}`}><input aria-label={`规格${index + 1}名称`} value={spec.name} onChange={(event) => setSpecs(specs.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /><label><span>¥</span><input aria-label={`规格${index + 1}价格`} value={spec.price} inputMode="decimal" onChange={(event) => setSpecs(specs.map((item, i) => i === index ? { ...item, price: event.target.value } : item))} /></label><button type="button" onClick={() => setSpecs(specs.filter((_, i) => i !== index))}>×</button></div>)}</div><button type="button" className="add-spec" onClick={() => setSpecs([...specs, { name: "自定义服务", price: "" }])}>＋ 添加规格</button></section>
      <section className="form-panel availability"><div className="form-title"><b>设置时间</b><span>灵活接单</span></div><label><span>可接单时间</span><input defaultValue="每天 18:00–24:00" /></label></section>
      <div className="publish-submit"><button type="button" onClick={() => notify("草稿已保存")}>保存草稿</button><button type="submit">{step < 3 ? "下一步" : "提交审核"}</button></div>
    </form>
  </div>;
}

function MineScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <div className="app-screen mine-screen"><StatusBar /><div className="mine-sky"><Header title="我的" subtitle="欢迎回到你的玩家休息室" actions={<><IconButton label="通知" badge={2} onClick={() => notify("有 2 条新通知")}>♧</IconButton><IconButton label="设置" onClick={() => notify("设置与隐私")}>⌾</IconButton></>} /><section className="mine-profile"><Avatar player={players[0]} size="lg" /><div><h2>熊崽玩家 K <i>Lv.28</i></h2><p>ID：10086 · 买家 / 陪玩</p><span><i style={{ width: "65%" }} /></span></div><b>♛</b></section></div>
    <section className="badge-cabinet"><div className="panel-title"><b>成就徽章</b><span>18 / 36</span></div><div>{["✦", "▣", "MVP", "☻"].map((badge, index) => <span key={`${badge}-${index}`}><i>{badge}</i></span>)}</div></section>
    <section className="mine-grid">{[["♡", "我的收藏", "24"], ["▣", "订单管理", "36"], ["¥", "钱包余额", "¥732.60"], ["券", "优惠券", "5 张"]].map(([icon, title, value]) => <button type="button" key={title} onClick={() => title.includes("订单") ? go("orders") : notify(title)}><i>{icon}</i><b>{title}</b><span>{value}</span></button>)}</section>
    <button type="button" className="workbench" onClick={() => go("publish")}><span><small>SELLER STUDIO</small><b>陪玩工作台</b><em>3 个服务上架中 · 本月 28 单</em></span><strong>管理服务 →</strong></button>
    <section className="wallet-strip"><div><span>本月收益</span><b>¥1568.00</b></div><div><span>待结算</span><b>¥236.00</b></div><button type="button" onClick={() => notify("已进入提现页面")}>提现 ›</button></section>
    <section className="mine-menu">{[["♙", "编辑个人资料", "头像、昵称"], ["♢", "申请成为陪玩", "审核已通过"], ["◌", "文字消息", "2 条未读"], ["!", "平台规则与售后", "交易保障"], ["⌾", "设置与隐私", ""]].map(([icon, title, note]) => <button type="button" onClick={() => title.includes("消息") ? go("chat") : notify(title)} key={title}><i>{icon}</i><span><b>{title}</b><small>{note}</small></span><em>›</em></button>)}</section><BottomNav page="mine" go={go} />
  </div>;
}

function ChatScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [text, setText] = useState(""); const [messages, setMessages] = useState(["你好，今晚 8 点可以接单吗？", "可以的，请问你目前是什么段位？", "永恒钻石，希望轻松上分。"]);
  const send = () => { const clean = text.trim(); if (!clean) return; setMessages([...messages, clean]); setText(""); notify("消息已发送"); };
  return <div className="app-screen chat-screen"><StatusBar /><Header title="Kirito" subtitle="在线 · 平均 1 分钟响应" back={() => go("product")} actions={<IconButton label="订单信息" onClick={() => go("orders")}>▣</IconButton>} /><div className="chat-notice">交易沟通请留在平台内，第一阶段仅支持文字消息</div><section className="chat-messages"><time>今天 19:42</time>{messages.map((message, index) => <div className={index % 3 === 1 ? "message theirs" : "message mine"} key={`${message}-${index}`}>{index % 3 === 1 ? <Avatar player={players[2]} size="sm" /> : null}<p>{message}</p></div>)}</section><div className="chat-product"><img src="/assets/product-hero.png" alt="咨询中的商品" /><span><b>5V5 排位上分</b><small>¥25 起 · 可直接下单</small></span><button type="button" onClick={() => go("product")}>查看</button></div><div className="chat-input"><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder="输入文字消息…" /><button type="button" onClick={send}>发送</button></div></div>;
}

export default function Home() {
  const [page, setPage] = useState<PageId>("home"); const [toast, setToast] = useState(""); const [selectedSpec, setSelectedSpec] = useState(0);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 1800); };
  const screen = useMemo(() => { const props = { go: setPage, notify }; if (page === "profile") return <ProfileScreen {...props} />; if (page === "product") return <ProductScreen {...props} selected={selectedSpec} setSelected={setSelectedSpec} />; if (page === "checkout") return <CheckoutScreen {...props} selected={selectedSpec} />; if (page === "publish") return <PublishScreen {...props} />; if (page === "orders") return <OrdersScreen {...props} />; if (page === "mine") return <MineScreen {...props} />; if (page === "chat") return <ChatScreen {...props} />; return <HomeScreen {...props} />; }, [page, selectedSpec]);
  const metaKey: MainPage = page === "checkout" ? "product" : page === "chat" ? "profile" : page; const meta = pageMeta[metaKey];
  return <main className="site-stage"><aside className="brand-rail"><img className="rail-logo" src="/assets/xiongzai-logo.png" alt="熊崽电竞" /><span className="rail-tag">和平精英 C2C 陪玩交易</span><div className="rail-copy"><span>{meta.index} / 06</span><h1>{meta.title}</h1><p>{meta.note}</p></div><nav className="page-picker" aria-label="核心页面">{(Object.keys(pageMeta) as MainPage[]).map((key) => <button type="button" key={key} className={metaKey === key ? "active" : ""} onClick={() => setPage(key)}><span>{pageMeta[key].index}</span><b>{pageMeta[key].title}</b><em>↗</em></button>)}</nav><div className="rail-slogan"><b>PLAY<br />TOGETHER!</b><span>让普通玩家也有自己的陪玩主页</span></div></aside><section className={`phone-shell page-${page}`} aria-label={`熊崽电竞 ${meta.title}预览`}>{screen}{toast ? <div className="app-toast" role="status">{toast}</div> : null}</section></main>;
}
