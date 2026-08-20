"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";

type ModuleId = "dashboard" | "users" | "sellerReview" | "sellers" | "serviceReview" | "services" | "orders" | "refunds" | "complaints" | "support" | "reviews" | "finance" | "withdrawals" | "config" | "logs";
type DataState = "success" | "loading" | "empty" | "error" | "offline";
type ModalState = { title: string; note: string; action: string; target?: string; nextStatus?: string; reasonRequired?: boolean; danger?: boolean; onConfirm?: (reason?: string) => void | Promise<void> } | null;
type TableConfig = { title: string; note: string; columns: string[]; rows: Array<{ id: string; cells: string[]; status?: string }> };
type SupportMessage = { id: string; from: "user" | "agent" | "system"; text: string; time: string; state?: string };
type SellerReviewApiRow = { id: string; status: string; submitted_at: string | null; version: number; snapshot: Record<string, unknown>; seller: { seller_nickname: string; game_rank: string | null; preferred_mode: string | null } };
type ProductReviewApiRow = { id: string; title: string; min_price_cent: string; sold_count: number; status: string; version: number; seller: { seller_nickname: string } };
type AdminSupportCaseApi = { id: string; case_no: string; requester_id: string; conversation_id: string; topic: string; priority: "NORMAL" | "MEDIUM" | "HIGH" | "URGENT"; status: "WAITING" | "SERVING" | "TRANSFERRED" | "CLOSED"; queue_key: string; assigned_admin_id: string | null; related_type: string | null; related_id: string | null; first_response_at: string | null; closed_at: string | null; version: number; created_at: string };
type AdminMessageApi = { id: string; sender_user_id: string | null; sender_admin_id: string | null; sender_role: string; message_type: "TEXT" | "SYSTEM"; content: string; created_at: string };
type AdminRefundApi = { id: string; refund_no: string; order_id: string; applicant_id: string; requested_amount_cent: string; approved_amount_cent: string | null; reason_text: string; description: string | null; status: string; version: number; created_at: string };
type AdminComplaintApi = { id: string; complaint_no: string; reporter_id: string; target_type: string; order_id: string | null; complaint_type: string; description: string; status: string; version: number; created_at: string };
type AdminReviewApi = { id: string; order_id: string; product_id: string; seller_id: string; buyer_id: string; rating: number; content: string | null; anonymous: boolean; status: "PENDING" | "PUBLIC" | "HIDDEN"; display_nickname: string; service_title: string; sku_name: string; hidden_reason: string | null; created_at: string };
type AdminLedgerApi = { id:string;transaction_no:string;transaction_type:string;status:string;source_type:string;source_id:string;reversal_of_transaction_id:string|null;description:string;occurred_at:string;posted_at:string|null };
type AdminWithdrawalApi = { id:string;withdrawal_no:string;seller_id:string;payout_account_id:string;amount_cent:string;fee_cent:string;actual_amount_cent:string;status:string;risk_status:string;reject_reason:string|null;provider_payout_no:string|null;version:number;created_at:string };
type AdminReconciliationApi = { id:string;run_no:string;provider:string;statement_date:string;status:string;total_item_count:number;mismatch_count:number;started_at:string;completed_at:string|null;items?:Array<{id:string;mismatch_type:string;business_type:string;business_id:string|null;provider_reference:string|null;platform_amount_cent:string|null;provider_amount_cent:string|null;status:string;resolution:string|null}> };
type AdminSessionApi = { id:string;username:string;display_name:string;status:string;mfa_required:boolean;roles:Array<{key:string;name:string}>;permissions:string[] };
type AdminUserApi = { id:string;public_user_no:string|null;nickname:string;phone_mask:string;status:"NORMAL"|"DISABLED"|"CANCELLED";profile_initialized:boolean;seller_id:string|null;seller_status:string|null;version:number;last_active_at:string|null;created_at:string };
type AdminOrderApi = { id:string;order_no:string;buyer_id:string;seller_id:string;product_title:string;seller_name:string;sku_name:string;quantity:number;payable_amount_cent:string;paid_amount_cent:string;refunded_amount_cent:string;status:string;payment_status:string;after_sale_status:string;service_starts_at:string;service_ends_at:string;version:number;created_at:string };
type CursorPage<T> = {items:T[];next_cursor:string|null};
type AdminConfigApi = {id:string;config_key:string;value_json:unknown;version_no:number;status:string;effective_at:string|null;created_by_admin_id:string;created_at:string};
type AdminOperationLogApi = {id:string;admin_id:string;admin_name:string;action:string;target_type:string;target_id:string|null;reason:string;request_id:string;trace_id:string|null;ip:string;created_at:string};
type AdminConversationApi = {id:string;conversation_no:string;order_id:string;order_no:string;buyer_id:string;seller_name:string;last_message_preview:string|null;last_message_at:string|null};
type AdminRiskApi = {id:string;riskType:string;severity:string;targetType:string;targetId:string;ruleKey:string;status:string;resolution:string|null;version:number;createdAt:string};
type AdminSecurityApi = {id:string;userId:string|null;adminId:string|null;eventType:string;status:string;riskScore:number;ip:string|null;createdAt:string};
type AdminRoleApi = {id:string;key:string;name:string;description:string|null;permissions:string[]};
type AdminAccountApi = {id:string;username:string;display_name:string;status:string;mfa_required:boolean;roles:Array<{key:string;name:string}>;last_login_at:string|null};

function adminApiBaseUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:3002/admin-api/v1";
  if (["3000", "3001"].includes(window.location.port)) return `${window.location.protocol}//${window.location.hostname}:3002/admin-api/v1`;
  return "/admin-api/v1";
}

async function adminApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${adminApiBaseUrl()}${path}`, { ...init, credentials: "include", headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.message ?? "后台接口请求失败"));
  return body as T;
}

const navItems: Array<{ id: ModuleId; label: string; eyebrow: string; icon: string; count?: number }> = [
  { id: "dashboard", label: "数据总览", eyebrow: "经营概览", icon: "/assets/icon-home.png" },
  { id: "users", label: "用户管理", eyebrow: "用户治理", icon: "/assets/icon-mine.png" },
  { id: "sellerReview", label: "陪玩审核", eyebrow: "陪玩审核", icon: "/assets/icon-shield.png", count: 12 },
  { id: "sellers", label: "陪玩管理", eyebrow: "陪玩管理", icon: "/assets/icon-mine.png" },
  { id: "serviceReview", label: "服务审核", eyebrow: "服务审核", icon: "/assets/icon-service.png", count: 8 },
  { id: "services", label: "服务管理", eyebrow: "服务管理", icon: "/assets/icon-service.png" },
  { id: "orders", label: "订单管理", eyebrow: "订单治理", icon: "/assets/icon-order.png" },
  { id: "refunds", label: "退款管理", eyebrow: "退款处理", icon: "/assets/icon-wallet.png", count: 5 },
  { id: "complaints", label: "投诉管理", eyebrow: "投诉治理", icon: "/assets/icon-shield.png", count: 4 },
  { id: "support", label: "客服中心", eyebrow: "客服工作台", icon: "/assets/icon-message.png", count: 5 },
  { id: "reviews", label: "评价管理", eyebrow: "评价管理", icon: "/assets/icon-favorite.png" },
  { id: "finance", label: "财务数据", eyebrow: "财务数据", icon: "/assets/icon-wallet.png" },
  { id: "withdrawals", label: "提现管理", eyebrow: "提现管理", icon: "/assets/icon-withdraw.png", count: 3 },
  { id: "config", label: "平台配置", eyebrow: "平台配置", icon: "/assets/icon-setting.png" },
  { id: "logs", label: "操作日志", eyebrow: "审计日志", icon: "/assets/icon-order.png" },
];

const sellerApps = [
  { id: "SA20260819031", name: "林鹿鹿", rank: "无敌战神", mode: "经典模式", submitted: "10:24", risk: "无风险", status: "PENDING_REVIEW", avatar: "/assets/player-luye.png" },
  { id: "SA20260819029", name: "悠悠子", rank: "超级王牌", mode: "娱乐四排", submitted: "09:47", risk: "声音待复核", status: "PENDING_REVIEW", avatar: "/assets/player-xiaoyou.png" },
  { id: "SA20260819018", name: "K仔", rank: "最强王者", mode: "地铁逃生", submitted: "08:16", risk: "资料变更", status: "SUPPLEMENT", avatar: "/assets/player-kirito.png" },
  { id: "SA20260818096", name: "苏苏", rank: "荣耀王者", mode: "巅峰赛", submitted: "昨天 21:42", risk: "无风险", status: "PENDING_REVIEW", avatar: "/assets/player-susu.png" },
];

const serviceRows = [
  { id: "SV20260819018", title: "经典模式排位上分｜稳定沟通", seller: "Kirito", price: 2500, sold: 1523, status: "PENDING_REVIEW", risk: "正常", image: "/assets/product-hero.png" },
  { id: "SV20260819016", title: "地铁逃生带飞｜摸金教学", seller: "林鹿鹿", price: 3500, sold: 893, status: "PENDING_REVIEW", risk: "标题词待复核", image: "/assets/home-hero.png" },
  { id: "SV20260818092", title: "欢乐四排｜营造轻松氛围", seller: "悠悠子", price: 2000, sold: 668, status: "ON_SALE", risk: "正常", image: "/assets/publish-arcade.png" },
  { id: "SV20260818071", title: "巅峰赛冲分｜高效听指挥", seller: "苏苏", price: 4500, sold: 437, status: "FORCED_OFF_SALE", risk: "投诉关联", image: "/assets/player-poster.png" },
];

const conversations = [
  { id: "CV202608190086", people: "熊崽玩家 K ↔ Kirito", order: "XZ202608190086", preview: "好的，我们就在平台里确认", time: "10:38", risk: "正常" },
  { id: "CV202608190075", people: "林下听风 ↔ 小悠", order: "XZ202608190075", preview: "你已经晚了二十分钟", time: "10:03", risk: "履约争议" },
  { id: "CV202608190022", people: "蓝色糖果 ↔ 阿寒", order: "XZ202608190022", preview: "要不然去外面联系…", time: "09:31", risk: "站外引流" },
];

const supportSessions = [
  { id: "CS202608190018", userId: "U10422", user: "林下听风", avatar: "/assets/player-luye.png", topic: "退款与平台介入", preview: "陪玩拒绝退款后怎么申请平台介入？", time: "10:43", wait: "等待 3 分钟", status: "SUPPORT_WAITING", priority: "PRIORITY_HIGH", businessType: "退款单", businessId: "RF202608190018", unread: 3, amount: "¥ 40.00" },
  { id: "CS202608190016", userId: "U10086", user: "熊崽玩家 K", avatar: "/assets/player-kirito.png", topic: "订单与履约", preview: "订单已经付款，但陪玩还没有接单。", time: "10:39", wait: "服务中 4 分钟", status: "SUPPORT_SERVING", priority: "PRIORITY_NORMAL", businessType: "订单", businessId: "XZ202608190086", unread: 1, amount: "¥ 25.00" },
  { id: "CS202608190012", userId: "U10231", user: "小悠", avatar: "/assets/player-xiaoyou.png", topic: "提现问题", preview: "提现一直显示平台审核中。", time: "10:28", wait: "等待 9 分钟", status: "SUPPORT_WAITING", priority: "PRIORITY_NORMAL", businessType: "提现单", businessId: "WD20260819018", unread: 2, amount: "¥ 980.00" },
  { id: "CS202608190007", userId: "U10389", user: "雾岛玩家", avatar: "/assets/player-susu.png", topic: "账号与实名认证", preview: "实名认证提示信息不一致。", time: "10:12", wait: "已转交风控组", status: "SUPPORT_TRANSFERRED", priority: "PRIORITY_MEDIUM", businessType: "用户", businessId: "U10389", unread: 0, amount: "—" },
  { id: "CS202608180091", userId: "U10351", user: "糖果罐", avatar: "/assets/player-susu.png", topic: "投诉处理结果", preview: "已经收到处理结果，谢谢。", time: "昨天", wait: "已结束", status: "SUPPORT_CLOSED", priority: "PRIORITY_NORMAL", businessType: "投诉单", businessId: "CP202608180083", unread: 0, amount: "¥ 45.00" },
];

const initialSupportMessages: Record<string, SupportMessage[]> = {
  CS202608190018: [
    { id: "m1", from: "system", text: "用户从退款详情页发起咨询，已自动关联退款单 RF202608190018。", time: "10:40" },
    { id: "m2", from: "user", text: "你好，陪玩没有按约定时间开始，我申请退款后对方拒绝了。", time: "10:41" },
    { id: "m3", from: "user", text: "我想申请平台介入，需要再提交什么材料吗？", time: "10:43" },
  ],
  CS202608190016: [
    { id: "m1", from: "system", text: "用户从订单详情页发起咨询，已自动关联订单 XZ202608190086。", time: "10:35" },
    { id: "m2", from: "user", text: "订单已经付款，但陪玩还没有接单，我需要一直等吗？", time: "10:36" },
    { id: "m3", from: "agent", text: "你好，我正在为你核对订单状态，请稍候。", time: "10:37", state: "已读" },
    { id: "m4", from: "user", text: "好的，谢谢。", time: "10:39" },
  ],
  CS202608190012: [
    { id: "m1", from: "system", text: "用户从陪玩中心发起咨询，已自动关联提现单 WD20260819018。", time: "10:24" },
    { id: "m2", from: "user", text: "提现一直显示平台审核中，大概多久能处理？", time: "10:28" },
  ],
  CS202608190007: [
    { id: "m1", from: "user", text: "实名认证提示姓名和证件信息不一致，但我确认填写正确。", time: "10:12" },
    { id: "m2", from: "system", text: "会话已由客服组转交至风控组，转交原因：需要核验实名认证记录。", time: "10:16" },
  ],
  CS202608180091: [
    { id: "m1", from: "agent", text: "你的投诉已处理完成，处理结果可在投诉详情中查看。", time: "昨天 18:42", state: "已读" },
    { id: "m2", from: "user", text: "已经收到处理结果，谢谢。", time: "昨天 18:45" },
    { id: "m3", from: "system", text: "会话已结束，完整记录已留存。", time: "昨天 18:46" },
  ],
};

const initialLogs = [
  { id: "LOG-8191042", admin: "运营组·小林", action: "SELLER_REVIEW_APPROVE", target: "SA20260818088", reason: "资料与声音审核通过", ip: "10.24.8.16", time: "10:42:08" },
  { id: "LOG-8191039", admin: "客服组·小熊", action: "CONVERSATION_VIEW", target: "CV202608190075", reason: "处理退款争议取证", ip: "10.24.8.31", time: "10:39:22" },
  { id: "LOG-8191034", admin: "风控组·安宁", action: "SERVICE_FORCE_OFF", target: "SV20260818071", reason: "多次投诉，暂停展示", ip: "10.24.8.44", time: "10:33:51" },
];

const tableConfigs: Partial<Record<ModuleId, TableConfig>> = {
  sellers: { title: "陪玩管理", note: "查看陪玩公开主页、服务、订单与经营风险", columns: ["陪玩", "身份状态", "在售服务", "完成订单", "评分", "近 30 日成交额"], rows: [
    { id: "S10031", cells: ["Kirito·S10031", "APPROVED", "8", "1,523", "4.9", "¥ 32,860.00"], status: "APPROVED" },
    { id: "S10012", cells: ["鹿野·S10012", "APPROVED", "6", "1,863", "5.0", "¥ 41,260.00"], status: "APPROVED" },
    { id: "S10218", cells: ["阿寒·S10218", "SUSPENDED", "0", "86", "4.1", "¥ 1,920.00"], status: "SUSPENDED" },
  ]},
  services: { title: "服务管理", note: "查询在售、下架与违规服务", columns: ["服务", "陪玩", "起售价", "销量", "评分", "状态"], rows: [
    { id: "SV018", cells: ["经典模式排位上分·SV018", "Kirito", "¥ 25.00", "1,523", "4.9", "ON_SALE"], status: "ON_SALE" },
    { id: "SV016", cells: ["地铁逃生带飞·SV016", "鹿野", "¥ 35.00", "893", "5.0", "ON_SALE"], status: "ON_SALE" },
    { id: "SV071", cells: ["巅峰赛冲分·SV071", "苏苏", "¥ 45.00", "437", "4.9", "FORCED_OFF_SALE"], status: "FORCED_OFF_SALE" },
  ]},
  reviews: { title: "评价管理", note: "查询真实订单评价并处理违规内容", columns: ["订单", "买家", "陪玩 / 服务", "评分", "内容摘要", "状态"], rows: [
    { id: "RV322", cells: ["XZ202608180322", "熊崽玩家 K", "Kirito·经典排位", "5.0", "技术靠谱，沟通舒服…", "PUBLIC"], status: "PUBLIC" },
    { id: "RV288", cells: ["XZ202608180288", "糖果罐", "苏苏·巅峰赛", "2.0", "实际体验和描述不一致…", "REPORTED"], status: "REPORTED" },
    { id: "RV921", cells: ["XZ202608170921", "林下听风", "小悠·欢乐四排", "4.9", "全程不冷场，氛围很好…", "PUBLIC"], status: "PUBLIC" },
  ]},
  finance: { title: "财务数据", note: "从账务明细聚合成交额、佣金、应结算与退款", columns: ["日期", "成交额", "实收", "退款", "平台佣金", "陪玩应结算", "对账状态"], rows: [
    { id: "FN819", cells: ["2026-08-19", "¥ 28,640.00", "¥ 27,980.00", "¥ 660.00", "¥ 4,197.00", "¥ 23,783.00", "MATCHED"], status: "MATCHED" },
    { id: "FN818", cells: ["2026-08-18", "¥ 31,280.00", "¥ 30,405.00", "¥ 875.00", "¥ 4,560.75", "¥ 25,844.25", "MATCHED"], status: "MATCHED" },
    { id: "FN817", cells: ["2026-08-17", "¥ 26,750.00", "¥ 25,920.00", "¥ 830.00", "¥ 3,888.00", "¥ 22,032.00", "REVIEW"], status: "REVIEW" },
  ]},
  withdrawals: { title: "提现管理", note: "处理陪玩提现申请与脱敏收款信息", columns: ["提现单", "陪玩", "金额", "收款方式", "风险", "状态"], rows: [
    { id: "WD018", cells: ["WD20260819018", "Kirito", "¥ 1,860.00", "支付宝·138****8000", "正常", "PENDING_REVIEW"], status: "PENDING_REVIEW" },
    { id: "WD014", cells: ["WD20260819014", "鹿野", "¥ 3,200.00", "微信·鹿*", "异地登录", "RISK_REVIEW"], status: "RISK_REVIEW" },
    { id: "WD092", cells: ["WD20260818092", "小悠", "¥ 980.00", "支付宝·186****1632", "正常", "COMPLETED"], status: "COMPLETED" },
  ]},
};

const formatMoney = (cent: number | string) => { const value = BigInt(cent); const zero = BigInt(0); const hundred = BigInt(100); if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(Number(value) / 100); const sign = value < zero ? "-" : ""; const absolute = value < zero ? -value : value; const yuan = (absolute / hundred).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ","); return `${sign}¥${yuan}.${(absolute % hundred).toString().padStart(2, "0")}`; };

const statusLabels: Record<string, string> = {
  NORMAL:"正常", DISABLED:"已禁用", PENDING_REVIEW:"待审核", SUPPLEMENT:"待补充", ON_SALE:"在售",
  FORCED_OFF_SALE:"强制下架", PAID:"已支付", IN_SERVICE:"服务中", REFUNDING:"退款中", PENDING_ACCEPT:"待接单",
  REFUNDED:"已退款", PLATFORM_REVIEW:"平台审核", PROCESSING:"处理中", COMPLETED:"已完成", PENDING:"待处理",
  APPROVED:"已通过", SUSPENDED:"已暂停", PUBLIC:"已公开", REPORTED:"被举报", MATCHED:"已对账", REVIEW:"待复核",
  RISK_REVIEW:"风险复核", ACTIVE:"生效中", PASS:"已通过", REVIEW_REJECTED:"审核驳回", REJECTED:"已驳回", CLOSED:"已关闭",
  SUPPORT_WAITING:"等待接入", SUPPORT_SERVING:"服务中", SUPPORT_TRANSFERRED:"已转交", SUPPORT_CLOSED:"已结束",
  PRIORITY_HIGH:"紧急", PRIORITY_MEDIUM:"较高", PRIORITY_NORMAL:"普通",
  SELLER_REVIEW_APPROVE:"陪玩审核通过", CONVERSATION_VIEW:"查看会话取证", SERVICE_FORCE_OFF:"服务强制下架",
};

const pageLabels: Record<string, string> = {
  OVERVIEW:"经营概览", USERS:"用户治理", "SELLER REVIEW":"陪玩审核", "SERVICE REVIEW":"服务审核",
  "ORDER GOVERNANCE":"订单治理", "REFUND OPERATIONS":"退款处理", "TRUST & SAFETY":"信任与安全",
  "PLATFORM CONFIG":"平台配置", "AUDIT LOGS":"审计日志", "SUPPORT DESK":"客服工作台",
};

function StatusBadge({ value }: { value: string }) {
  const danger = /DISABLED|BANNED|REJECTED|FORCED|FAILED|REFUNDED|HIGH|REPORTED/.test(value);
  const warn = /PENDING|REVIEW|PROCESSING|REFUNDING|SUPPLEMENT|RISK|MEDIUM|WAITING|TRANSFERRED/.test(value);
  const success = /NORMAL|APPROVED|ON_SALE|PAID|COMPLETED|MATCHED|PUBLIC|PASS|SERVING/.test(value);
  return <span className={`${styles.statusBadge} ${danger ? styles.badgeDanger : warn ? styles.badgeWarning : success ? styles.badgeSuccess : styles.badgeNeutral}`}>{statusLabels[value] ?? value}</span>;
}

function AvatarImage({ image, name }: { image: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <span className={styles.avatarFallback} aria-label={`${name}的头像`}>{name.slice(0, 1).toUpperCase()}</span>
    : <img src={image} alt={`${name}的头像`} onError={() => setFailed(true)} />;
}

function Person({ image, name, sub }: { image: string; name: string; sub: string }) {
  return <span className={styles.person}><AvatarImage image={image} name={name} /><span><b>{name}</b><small>{sub}</small></span></span>;
}

function PageTitle({ eyebrow, title, note, actions }: { eyebrow: string; title: string; note: string; actions?: ReactNode }) {
  return <header className={styles.moduleHeader}><div><span>{pageLabels[eyebrow] ?? eyebrow}</span><h1>{title}</h1><p>{note}</p></div>{actions ? <div className={styles.headerActions}>{actions}</div> : null}</header>;
}

function GlobalSearchBox({ onChoose }: { onChoose: (module: ModuleId, id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [apiResults,setApiResults]=useState<Array<{id:string;title:string|null;subtitle:string|null;module:ModuleId}>>([]);
  useEffect(()=>{const keyword=query.trim();if(keyword.length<2)return;const timer=window.setTimeout(()=>void adminApiRequest<Array<{id:string;title:string|null;subtitle:string|null;module:ModuleId}>>(`/governance/search?q=${encodeURIComponent(keyword)}`).then(setApiResults).catch(()=>setApiResults([])),250);return()=>window.clearTimeout(timer)},[query]);
  const results = apiResults.map((item)=>({id:item.id,title:item.title??"未命名记录",sub:item.subtitle??item.module,module:item.module}));

  return <div className={styles.globalSearchWrap}><label className={styles.globalSearch}><span /><input aria-label="全局搜索" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="搜索订单、用户、陪玩、服务或客服会话" /></label>{open && query.trim() && <div className={styles.globalResults} role="listbox" aria-label="全局搜索结果">{results.length ? results.map((item) => <button type="button" role="option" aria-selected="false" key={`${item.module}-${item.id}`} onClick={() => { onChoose(item.module, item.id); setQuery(""); setOpen(false); }}><span><b>{item.title}</b><small>{item.sub}</small></span><em>{item.id}</em></button>) : <p>没有找到相关记录</p>}</div>}</div>;
}

const filterChoices: Record<string, string[]> = {
  "全部身份": ["全部身份", "仅买家", "仅陪玩", "买家 / 陪玩"],
  "全部角色": ["全部角色", "仅 Alex", "运营组", "客服组", "风控组"],
  "用户类型": ["用户类型", "买家", "陪玩", "买家 / 陪玩"],
  "全部状态": ["全部状态", "正常", "已禁用", "待处理", "审核中", "已通过", "已驳回", "服务中", "退款中", "已完成"],
  "审核状态": ["审核状态", "待审核", "审核中", "已通过", "已驳回"],
  "订单状态": ["订单状态", "待接单", "服务中", "退款中", "已完成", "已退款"],
  "商品状态": ["商品状态", "在售", "已下架", "强制下架", "待审核"],
  "注册时间": ["注册时间", "今天", "近 7 天", "近 30 天", "自定义时间"],
  "创建时间": ["创建时间", "今天", "近 7 天", "近 30 天", "自定义时间"],
  "更新时间": ["更新时间", "今天", "近 7 天", "近 30 天", "自定义时间"],
  "时间范围": ["时间范围", "今天", "近 7 天", "近 30 天", "自定义时间"],
  "风险等级": ["风险等级", "高风险", "中风险", "低风险"],
  "操作类型": ["操作类型", "审核操作", "会话取证", "风险限制", "配置变更"],
};

function filterKind(label: string) {
  if (/身份|角色|用户类型/.test(label)) return "identity";
  if (/时间/.test(label)) return "time";
  return "status";
}

function FilterSelect({ label, options = filterChoices[label] ?? [label], value, onChange }: { label: string; options?: string[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = value !== options[0];
  const kind = filterKind(label);

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);

  return <div ref={rootRef} className={`${styles.filterSelect} ${styles[`filter${kind}`]}`}><button type="button" className={`${styles.filterButton} ${active ? styles.activeFilter : ""}`} aria-label={`${label}，当前 ${value}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{value}</span><i /></button>{open && <div className={styles.filterMenu} role="listbox" aria-label={`${label}选项`}>{options.map((option) => <button type="button" role="option" aria-selected={option === value} className={option === value ? styles.selectedFilterOption : ""} onClick={() => { onChange(option); setOpen(false); }} key={option}><span>{option}</span><i /></button>)}</div>}</div>;
}

function CartoonDatePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(`${value}T00:00:00`));
  const rootRef = useRef<HTMLDivElement>(null);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const blanks = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const toIso = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return <div ref={rootRef} className={styles.cartoonDatePicker}><span>{label}</span><button type="button" className={styles.datePickerButton} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}><i /><b>{value}</b><em /></button>{open && <div className={styles.cartoonCalendar} role="dialog" aria-label={`${label}日历`}><div className={styles.calendarEars} aria-hidden="true"><i /><i /></div><header><button type="button" aria-label="上个月" onClick={() => setViewDate(new Date(year, month - 1, 1))}><i /></button><b>{year} 年 {month + 1} 月</b><button type="button" aria-label="下个月" onClick={() => setViewDate(new Date(year, month + 1, 1))}><i /></button></header><div className={styles.weekRow}>{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div><div className={styles.dayGrid}>{Array.from({ length: blanks }, (_, index) => <i key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => index + 1).map((day) => { const iso = toIso(day); return <button type="button" className={iso === value ? styles.selectedDay : ""} aria-pressed={iso === value} onClick={() => { onChange(iso); setOpen(false); }} key={iso}>{day}</button>; })}</div><footer><span>选择日期后自动收起</span><button type="button" onClick={() => { const today = "2026-08-19"; onChange(today); setViewDate(new Date(`${today}T00:00:00`)); setOpen(false); }}>回到今天</button></footer></div>}</div>;
}

function TableShell({ children, count = 86 }: { children: ReactNode; count?: number }) {
  const [page, setPage] = useState(1);
  const pages = Math.min(3, Math.max(1, Math.ceil(count / 20)));
  return <section className={styles.tableCard}><div className={styles.tableScroll}>{children}</div><footer className={styles.pagination}><span>共 {count} 条记录 · 第 {page}/{pages} 页</span><div><button type="button" disabled={page === 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>上一页</button>{Array.from({ length: pages }, (_, index) => index + 1).map((value) => <button type="button" aria-current={page === value ? "page" : undefined} className={page === value ? styles.currentPage : ""} onClick={() => setPage(value)} key={value}>{value}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage((v) => Math.min(pages, v + 1))}>下一页</button></div></footer></section>;
}

function Toolbar({ search, setSearch, state, setState, placeholder = "搜索关键词", filters = ["全部状态", "创建时间", "风险等级"], onFilterChange }: { search: string; setSearch: (v: string) => void; state: DataState; setState: (v: DataState) => void; placeholder?: string; filters?: string[]; onFilterChange?: (key: string, value: string) => void }) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  return <div className={styles.toolbar}><label className={styles.searchField}><b className={styles.srOnly}>搜索</b><span /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} /></label>{filters.map((item) => <FilterSelect label={item} value={selections[item] ?? item} onChange={(value) => { setSelections((current) => ({ ...current, [item]: value })); onFilterChange?.(item, value); }} key={item} />)}<label className={styles.stateSelect}><span>状态演示</span><select value={state} onChange={(e) => setState(e.target.value as DataState)}><option value="success">正常</option><option value="loading">加载</option><option value="empty">空数据</option><option value="error">错误</option><option value="offline">断网</option></select></label></div>;
}

function DataStateView({ state, retry }: { state: DataState; retry: () => void }) {
  if (state === "success") return null;
  const copy = { loading: ["正在读取平台数据", "请稍候，已保留当前筛选条件。"], empty: ["暂无符合条件的记录", "请调整筛选条件或清除关键词。"], error: ["数据加载失败", "请求编号 REQ-20260819-1042，请稍后重试。"], offline: ["网络连接已断开", "已保留当前操作，网络恢复后可继续。"] } as const;
  return <section className={styles.dataState}><span className={state === "loading" ? styles.stateLoading : ""}>{state === "loading" ? "" : state === "empty" ? "0" : "!"}</span><h2>{copy[state][0]}</h2><p>{copy[state][1]}</p>{state !== "loading" && <button type="button" onClick={retry}>{state === "empty" ? "清除筛选" : "重新加载"}</button>}</section>;
}

function DetailDrawer({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void }) {
  return <div className={styles.drawerBackdrop} role="dialog" aria-modal="true" aria-label={title}><aside className={styles.detailDrawer}><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header><div className={styles.drawerBody}>{children}</div></aside></div>;
}

function ConfirmModal({ modal, onClose, onDone }: { modal: NonNullable<ModalState>; onClose: () => void; onDone: (reason: string) => void | Promise<void> }) {
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [submitting,setSubmitting]=useState(false);
  const submit = async () => { if (modal.reasonRequired && !reason.trim()) { setError("请填写操作原因，用于风险追溯和审计。"); return; } setSubmitting(true); setError(""); try { await modal.onConfirm?.(reason.trim()); await onDone(reason.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试"); setSubmitting(false); } };
  return <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={modal.title}><section className={styles.confirmModal}><span className={`${styles.modalMark} ${modal.danger ? styles.dangerMark : ""}`}><img src={modal.danger ? "/assets/icon-shield.png" : "/assets/icon-setting.png"} alt="" /></span><h2>{modal.title}</h2><p>{modal.note}</p>{modal.reasonRequired && <label><span>操作原因 <b>*</b></span><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="请输入具体、可审计的处理依据" /><small>{reason.length}/200</small></label>}{error && <div className={styles.modalError}>{error}</div>}<div><button type="button" disabled={submitting} onClick={onClose}>取消</button><button type="button" disabled={submitting} className={modal.danger ? styles.dangerButton : styles.primaryButton} onClick={()=>void submit()}>{submitting?"处理中…":modal.action}</button></div></section></div>;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionAdmin,setSessionAdmin]=useState<AdminSessionApi|null>(null);
  const [loginStage, setLoginStage] = useState<"credentials" | "mfa">("credentials");
  const [account, setAccount] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [loginError, setLoginError] = useState(""); const [failedAttempts, setFailedAttempts] = useState(0);
  const [active, setActive] = useState<ModuleId>("dashboard"); const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState(""); const [dataState, setDataState] = useState<DataState>("success"); const [detail, setDetail] = useState<string | null>(null); const [, setUserRoleFilter] = useState("全部身份");
  const [modal, setModal] = useState<ModalState>(null); const [toast, setToast] = useState(""); const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [orderMode, setOrderMode] = useState<"orders" | "conversations">("orders"); const [conversationAuthorized, setConversationAuthorized] = useState(false); const [selectedConversation, setSelectedConversation] = useState(conversations[1].id);
  const [selectedSupport, setSelectedSupport] = useState(supportSessions[0].id);
  const [logs, setLogs] = useState(initialLogs); const [audioPlaying, setAudioPlaying] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false);
  const currentNav = navItems.find((item) => item.id === active) ?? navItems[0];
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const selectModule = (id: ModuleId) => { setActive(id); setSearch(""); setDataState("success"); setDetail(null); setOrderMode("orders"); setConversationAuthorized(false); setNotificationsOpen(false); setUserRoleFilter("全部身份"); };
  useEffect(()=>{void adminApiRequest<AdminSessionApi>("/auth/session").then((admin)=>{setSessionAdmin(admin);setAuthenticated(true)}).catch(()=>undefined);},[]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (failedAttempts >= 5) { setLoginError("账号可能已因连续失败暂时锁定，请稍后重试。"); return; }
    try {
      if (loginStage === "credentials") { const result=await adminApiRequest<{mfa_required:boolean;admin?:AdminSessionApi}>("/auth/login",{method:"POST",body:JSON.stringify({username:account,password})}); if(result.mfa_required){setLoginStage("mfa");setLoginError("");return;} const admin=result.admin??await adminApiRequest<AdminSessionApi>("/auth/session");setSessionAdmin(admin);setAuthenticated(true);return; }
      const result=await adminApiRequest<{admin:AdminSessionApi}>("/auth/mfa/verify",{method:"POST",body:JSON.stringify({code})});setSessionAdmin(result.admin);setAuthenticated(true);setLoginError("");setCode("");
    } catch(error) { setFailedAttempts((v)=>v+1);setLoginError(error instanceof Error?error.message:"登录失败，请稍后重试"); }
  };

  const applyAction = async (reason: string) => {
    if (!modal) return;
    const realTarget = modal.target && /^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(modal.target);
    if (realTarget && (active === "sellerReview" || active === "serviceReview") && modal.nextStatus) {
      try {
        if (active === "sellerReview") {
          const rows = await adminApiRequest<SellerReviewApiRow[]>("/seller-applications?limit=100"); const row = rows.find((item) => item.id === modal.target);
          if (!row) throw new Error("审核申请已不在当前队列");
          await adminApiRequest(`/seller-applications/${row.id}/review`, { method:"POST", body:JSON.stringify({ action:modal.nextStatus === "APPROVED" ? "APPROVE" : "REJECT", version:row.version, reason:reason || "资料审核通过" }) });
        } else {
          const rows = await adminApiRequest<ProductReviewApiRow[]>("/product-reviews?limit=100"); const row = rows.find((item) => item.id === modal.target);
          if (!row) throw new Error("服务已不在当前审核队列");
          await adminApiRequest(`/products/${row.id}/review`, { method:"POST", body:JSON.stringify({ action:modal.nextStatus === "ON_SALE" ? "APPROVE" : "REJECT", version:row.version, reason:reason || "服务内容审核通过" }) });
        }
      } catch (cause) { notify(cause instanceof Error ? cause.message : "审核提交失败"); setModal(null); return; }
    }
    if (modal.target && modal.nextStatus) setOverrides((v) => ({ ...v, [modal.target!]: modal.nextStatus! }));
    setLogs((v) => [{ id: `LOG-${Date.now().toString().slice(-7)}`, admin: "超级管理员·Alex", action: modal.title, target: modal.target ?? "PLATFORM", reason: reason || modal.note, ip: "10.24.8.08", time: new Date().toLocaleTimeString("zh-CN", { hour12: false }) }, ...v]);
    notify(`${modal.action}已完成，操作已写入审计日志`); setModal(null);
  };

  if (!authenticated) return <LoginScreen stage={loginStage} setStage={setLoginStage} account={account} setAccount={setAccount} password={password} setPassword={setPassword} code={code} setCode={setCode} error={loginError} setError={setLoginError} locked={failedAttempts >= 3} onSubmit={submitLogin} />;

  const openAction = (value: NonNullable<ModalState>) => setModal(value);
  let content: ReactNode;
  if (active === "dashboard") content = <Dashboard onGo={selectModule} />;
  else if (active === "users") content = <UsersModule search={search} setSearch={setSearch} state={dataState} setState={setDataState} setDetail={setDetail} openAction={openAction} notify={notify} setRoleFilter={setUserRoleFilter} />;
  else if (active === "sellerReview") content = <ReviewList kind="seller" search={search} setSearch={setSearch} state={dataState} setState={setDataState} overrides={overrides} setDetail={setDetail} />;
  else if (active === "serviceReview") content = <ReviewList kind="service" search={search} setSearch={setSearch} state={dataState} setState={setDataState} overrides={overrides} setDetail={setDetail} />;
  else if (active === "orders") content = <OrdersModule mode={orderMode} setMode={setOrderMode} search={search} setSearch={setSearch} state={dataState} setState={setDataState} setDetail={setDetail} authorized={conversationAuthorized} setAuthorized={setConversationAuthorized} selected={selectedConversation} setSelected={setSelectedConversation} openAction={openAction} />;
  else if (active === "refunds" || active === "complaints") content = <CasesModule kind={active} search={search} setSearch={setSearch} state={dataState} setState={setDataState} setDetail={setDetail} openAction={openAction} />;
  else if (active === "support") content = <SupportModule selected={selectedSupport} setSelected={setSelectedSupport} openAction={openAction} notify={notify} onOpenBusiness={(module, id) => { setActive(module); setDetail(id); }} />;
  else if (active === "reviews") content = <ReviewsModule search={search} setSearch={setSearch} state={dataState} setState={setDataState} setDetail={setDetail} openAction={openAction} />;
  else if (active === "finance") content = <FinanceModule search={search} setSearch={setSearch} state={dataState} setState={setDataState} setDetail={setDetail} openAction={openAction} />;
  else if (active === "withdrawals") content = <WithdrawalsModule search={search} setSearch={setSearch} state={dataState} setState={setDataState} setDetail={setDetail} openAction={openAction} />;
  else if (active === "config") content = <ConfigModule openAction={openAction} />;
  else if (active === "logs") content = <LogsModule logs={logs} setDetail={setDetail} openAction={openAction} />;
  else content = <GenericModule id={active} config={tableConfigs[active]!} currentNav={currentNav} search={search} setSearch={setSearch} state={dataState} setState={setDataState} setDetail={setDetail} notify={notify} />;

  return <main className={`${styles.adminApp} ${collapsed ? styles.collapsed : ""}`}>
    <aside className={styles.sidebar}>
      <div className={styles.sideBrand}><img src="/assets/xiongzai-icon.png" alt="熊崽电竞" /><div><b>熊崽电竞</b><span>管理中心</span></div></div>
      <nav aria-label="管理后台主导航">{navItems.map((item) => <button className={active === item.id ? styles.activeNav : ""} type="button" key={item.id} onClick={() => selectModule(item.id)}><img src={item.icon} alt="" /><span>{item.label}</span>{item.count ? <em>{item.count}</em> : null}</button>)}</nav>
      <div className={styles.sideFoot}><span className={styles.systemDot} /><div><b>系统运行正常</b><small>最后检查 10:42:08</small></div></div>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}><button type="button" aria-label="收起导航" onClick={() => setCollapsed((v) => !v)}><span className={styles.menuGlyph} /></button><div><span>运营管理</span><b>/ {currentNav.label}</b></div></div>
        <div className={styles.topbarRight}>
          <GlobalSearchBox onChoose={(module, id) => { selectModule(module); if (module === "support") setSelectedSupport(id); else setDetail(id); }} />
          <div className={styles.popoverWrap}><button className={styles.noticeButton} aria-label="通知" type="button" onClick={() => setNotificationsOpen((v) => !v)}><img src="/assets/icon-message.png" alt="" /><em>6</em></button>{notificationsOpen && <div className={styles.notificationPopover}><b>待办通知</b><button type="button" onClick={() => selectModule("sellerReview")}><span>陪玩申请即将超过处理时限</span><small>2 分钟前</small></button><button type="button" onClick={() => selectModule("complaints")}><span>新增高风险投诉</span><small>8 分钟前</small></button></div>}</div>
          <div className={styles.popoverWrap}><button className={styles.adminProfile} type="button" onClick={() => setProfileOpen((v) => !v)}><span>{sessionAdmin?.display_name.slice(0,1)??"A"}</span><div><b>{sessionAdmin?.display_name??"管理员"}</b><small>{sessionAdmin?.roles[0]?.name??"运营管理员"}</small></div><i /></button>{profileOpen && <div className={styles.profilePopover}><div><b>{sessionAdmin?.display_name??"管理员"}</b><small>{sessionAdmin?.username??"—"} · {sessionAdmin?.mfa_required?"双重验证已开启":"双重验证未强制"}</small></div><button type="button" onClick={() => { void adminApiRequest("/auth/logout",{method:"POST"}).finally(()=>{setAuthenticated(false);setSessionAdmin(null);setLoginStage("credentials");setLoginError("管理员会话已安全退出。");}); }}>退出登录</button></div>}</div>
        </div>
      </header>
      <div className={styles.content}>{content}</div>
    </section>
    {detail && <DetailDrawer eyebrow="记录详情" title={detail} onClose={() => setDetail(null)}><DrawerContent active={active} id={detail} playing={audioPlaying} setPlaying={setAudioPlaying} openAction={openAction} openConversation={() => { setDetail(null); setActive("orders"); setOrderMode("conversations"); setConversationAuthorized(false); }} /></DetailDrawer>}
    {modal && <ConfirmModal modal={modal} onClose={() => setModal(null)} onDone={applyAction} />}
    {toast && <div className={styles.toast} role="status"><img src="/assets/icon-shield.png" alt="" />{toast}</div>}
  </main>;
}

function LoginScreen({ stage, setStage, account, setAccount, password, setPassword, code, setCode, error, setError, locked, onSubmit }: { stage: "credentials"|"mfa"; setStage:(v:"credentials"|"mfa")=>void; account:string; setAccount:(v:string)=>void; password:string; setPassword:(v:string)=>void; code:string; setCode:(v:string)=>void; error:string; setError:(v:string)=>void; locked:boolean; onSubmit:(e:FormEvent)=>void }) {
  return <main className={styles.loginPage}><section className={styles.loginStory}><div className={styles.loginBrand}><img src="/assets/xiongzai-icon.png" alt="熊崽电竞" /><div><b>熊崽电竞</b><span>XIONGZAI CONTROL CENTER</span></div></div><div className={styles.storyCopy}><span>GAME SERVICE OPERATIONS</span><h1>让每一笔陪玩交易<br />都被稳妥守护。</h1><p>审核、交易、售后与财务共用同一业务事实，异常操作全程留痕。</p></div><div className={styles.storyStats}><span><b>99.98%</b><small>交易事件完整率</small></span><span><b>&lt; 8 min</b><small>审核平均响应</small></span></div><div className={styles.storyOrbit} aria-hidden="true"><i /><i /><i /></div></section><section className={styles.loginPanel}><form className={styles.loginCard} onSubmit={onSubmit}><span className={styles.securePill}><img src="/assets/icon-shield.png" alt="" /> 受保护的管理端</span><h2>{stage === "credentials" ? "欢迎回来" : "完成安全验证"}</h2><p>{stage === "credentials" ? "登录熊崽电竞运营管理后台" : "请输入管理员验证器中的 6 位动态码"}</p>{stage === "credentials" ? <><label><span>管理员账号</span><input value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="username" placeholder="请输入管理员账号" /></label><label><span>登录密码</span><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="请输入登录密码" /></label><div className={styles.loginMeta}><label><input type="checkbox" /> <span>仅信任本次会话</span></label><button type="button" onClick={() => setError("请联系平台安全管理员重置后台密码。")}>忘记密码？</button></div></> : <><div className={styles.mfaMark}><img src="/assets/icon-shield.png" alt="" /></div><label><span>6 位动态验证码</span><input className={styles.codeInput} value={code} maxLength={6} inputMode="numeric" onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><small className={styles.demoHint}>动态码来自已绑定的验证器，每 30 秒更新</small></>}{error && <div className={styles.loginError} role="alert">{error}</div>}<button className={styles.loginSubmit} type="submit" disabled={locked}>{stage === "credentials" ? "继续安全验证" : "验证并进入后台"}</button>{stage === "mfa" && <button className={styles.backButton} type="button" onClick={() => { setStage("credentials"); setError(""); }}>返回修改账号</button>}<footer><img src="/assets/icon-shield.png" alt="" /> 登录行为将记录 IP、设备与操作时间</footer></form></section></main>;
}

function Dashboard({ onGo }: { onGo: (id: ModuleId) => void }) {
  type Range = "今日" | "7 天" | "30 天" | "自定义";
  const [range, setRange] = useState<Range>("今日");
  const [customStart, setCustomStart] = useState("2026-08-01");
  const [customEnd, setCustomEnd] = useState("2026-08-19");
  const [live,setLive]=useState<{paid_gmv_cent:string;order_count:number;user_count:number;pending_seller_reviews:number;pending_product_reviews:number;active_refunds:number;active_complaints:number;open_risk_events:number}|null>(null);
  useEffect(()=>{void adminApiRequest<typeof live>("/governance/dashboard").then(setLive).catch(()=>undefined)},[]);
  const rangeData: Record<Range, { metrics: string[][]; bars: number[]; labels: string[]; summary: string[][] }> = {
    "今日": { metrics: [["今日成交额", "¥ 28,640.00", "+18.6%", "orange"], ["今日订单", "386", "+12.4%", "blue"], ["待审陪玩", "12", "待处理", "lime"], ["风险事件", "7", "2 项紧急", "violet"]], bars: [22, 35, 48, 61, 73, 84, 91], labels: ["08 时", "10 时", "12 时", "14 时", "16 时", "18 时", "当前"], summary: [["累计成交额", "¥ 28,640.00"], ["订单转化率", "19.4%"], ["平均客单价", "¥ 74.20"]] },
    "7 天": { metrics: [["7 天成交额", "¥ 182,960.00", "+15.2%", "orange"], ["7 天订单", "2,468", "+9.8%", "blue"], ["审核申请", "39", "12 项待处理", "lime"], ["风险事件", "21", "4 项紧急", "violet"]], bars: [46, 63, 52, 74, 69, 82, 91], labels: ["08/13", "08/14", "08/15", "08/16", "08/17", "08/18", "今日"], summary: [["累计成交额", "¥ 182,960.00"], ["订单转化率", "18.7%"], ["平均客单价", "¥ 74.20"]] },
    "30 天": { metrics: [["30 天成交额", "¥ 786,420.00", "+11.6%", "orange"], ["30 天订单", "10,842", "+8.1%", "blue"], ["审核申请", "126", "22 项待处理", "lime"], ["风险事件", "63", "7 项紧急", "violet"]], bars: [51, 64, 58, 76, 70, 84, 94], labels: ["07/21", "07/26", "07/31", "08/05", "08/10", "08/15", "08/19"], summary: [["累计成交额", "¥ 786,420.00"], ["订单转化率", "20.1%"], ["平均客单价", "¥ 72.53"]] },
    "自定义": { metrics: [["区间成交额", "¥ 96,780.00", "+7.3%", "orange"], ["区间订单", "1,304", "+5.6%", "blue"], ["审核申请", "22", "8 项待处理", "lime"], ["风险事件", "11", "3 项紧急", "violet"]], bars: [35, 52, 49, 66, 78, 71, 88], labels: ["08/01", "08/04", "08/07", "08/10", "08/13", "08/16", "08/19"], summary: [["累计成交额", "¥ 96,780.00"], ["订单转化率", "17.9%"], ["平均客单价", "¥ 74.22"]] },
  };
  const data = rangeData[range];
  if(range==="今日"&&live){data.metrics=[["累计实付成交额",formatMoney(live.paid_gmv_cent),`${live.user_count} 位用户`,"orange"],["累计订单",String(live.order_count),"真实订单事实","blue"],["待审申请",String(live.pending_seller_reviews+live.pending_product_reviews),`${live.pending_seller_reviews} 陪玩 · ${live.pending_product_reviews} 服务`,"lime"],["开放风险",String(live.open_risk_events),`${live.active_refunds} 退款 · ${live.active_complaints} 投诉`,"violet"]];data.summary=[["累计实付",formatMoney(live.paid_gmv_cent)],["用户总数",String(live.user_count)],["活跃售后",String(live.active_refunds+live.active_complaints)]];}
  const rangeNote = range === "自定义" ? `${customStart} 至 ${customEnd}` : range;

  return <><PageTitle eyebrow="经营概览" title="交易运营总览" note={`数据每 5 分钟更新 · 当前口径：${rangeNote}`} actions={<div className={styles.dateControl}>{(["今日", "7 天", "30 天", "自定义"] as Range[]).map((item) => <button className={range === item ? styles.selectedDate : ""} type="button" aria-pressed={range === item} onClick={() => setRange(item)} key={item}>{item}</button>)}</div>} />{range === "自定义" && <section className={styles.customRange}><CartoonDatePicker label="开始日期" value={customStart} onChange={setCustomStart} /><span>至</span><CartoonDatePicker label="结束日期" value={customEnd} onChange={setCustomEnd} /><p>已按所选日期重新计算演示数据</p></section>}<section className={styles.metricGrid}>{data.metrics.map((metric) => <article className={`${styles.metricCard} ${styles[metric[3]]}`} key={metric[0]}><div><span>{metric[0]}</span><i /></div><b>{metric[1]}</b><small>{metric[2]} <em>较上一周期</em></small></article>)}</section><section className={styles.dashboardGrid}><article className={styles.trendCard}><header><div><b>成交额与订单趋势</b><span>{rangeNote} · 人民币</span></div><div><i /> 成交额 <i /> 订单</div></header><div className={styles.chart}><div className={styles.axis}><span>40 千</span><span>30 千</span><span>20 千</span><span>10 千</span><span>0</span></div><div className={styles.bars}>{data.bars.map((height, index) => <span key={data.labels[index]}><i style={{ height: `${height}%` }} /><b>{data.labels[index]}</b></span>)}</div></div><footer>{data.summary.map((value) => <div key={value[0]}><span>{value[0]}</span><b>{value[1]}</b></div>)}</footer></article><article className={styles.todoCard}><header><div><b>待办事项</b><span>按风险和等待时长排序</span></div><button type="button" onClick={() => onGo("sellerReview")}>全部待办</button></header><div>{[["陪玩身份审核", "12 份新申请等待处理", "12", "sellerReview"], ["服务内容审核", "包含 2 项风险内容标记", "8", "serviceReview"], ["退款与投诉", "最早一笔已等待 42 分钟", "9", "refunds"]].map((todo, index) => <button type="button" onClick={() => onGo(todo[3] as ModuleId)} key={todo[0]}><span className={`${styles.todoIcon} ${styles[`todo${index}`]}`}><img src={["/assets/icon-shield.png", "/assets/icon-service.png", "/assets/icon-wallet.png"][index]} alt="" /></span><div><b>{todo[0]}</b><small>{todo[1]}</small></div><em>{todo[2]}</em><i /></button>)}</div></article></section><section className={styles.riskStrip}><div><span className={styles.riskIcon}><img src="/assets/icon-shield.png" alt="" /></span><div><b>风险事件提醒</b><p>2 笔订单命中“频繁退款”规则，1 个会话出现站外交易关键词。</p></div></div><button type="button" onClick={() => onGo("orders")}>查看风险明细</button></section></>;
}

function UsersModule({ search, setSearch, state, setState, setDetail, openAction, notify, setRoleFilter }: { search:string; setSearch:(v:string)=>void; state:DataState; setState:(v:DataState)=>void; setDetail:(v:string)=>void; openAction:(v:NonNullable<ModalState>)=>void; notify:(v:string)=>void; setRoleFilter:(v:string)=>void }) {
  const [rows,setRows]=useState<AdminUserApi[]>([]); const [nextCursor,setNextCursor]=useState<string|null>(null);
  const load=useCallback(async(cursor?:string)=>{setState("loading");try{const query=new URLSearchParams({limit:"50"});if(cursor)query.set("cursor",cursor);if(search.trim())query.set("keyword",search.trim());const page=await adminApiRequest<CursorPage<AdminUserApi>>(`/users?${query}`);setRows(cursor?(current)=>[...current,...page.items]:page.items);setNextCursor(page.next_cursor);setState(page.items.length||cursor?"success":"empty");}catch{setState("error");}},[search,setState]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),250);return()=>window.clearTimeout(timer);},[load]);
  const changeStatus=(row:AdminUserApi)=>openAction({title:row.status==="DISABLED"?"解禁用户":"禁用用户",note:`操作对象：${row.nickname}。禁用会立即撤销该用户全部会话。`,action:row.status==="DISABLED"?"确认解禁":"确认禁用",target:row.id,reasonRequired:true,danger:row.status!=="DISABLED",onConfirm:async(reason)=>{await adminApiRequest(`/users/${row.id}/status`,{method:"PATCH",body:JSON.stringify({current_status:row.status,next_status:row.status==="DISABLED"?"NORMAL":"DISABLED",version:row.version,reason})});await load();}});
  return <><PageTitle eyebrow="USERS" title="用户管理" note="查询用户身份、交易摘要与风险记录" actions={<button className={styles.exportButton} type="button" onClick={()=>notify("导出申请已记录，需数据权限审批")}>申请导出</button>} /><Toolbar search={search} setSearch={setSearch} state={state} setState={setState} placeholder="用户编号、昵称或脱敏手机号" filters={["全部身份","全部状态","注册时间"]} onFilterChange={(key,value)=>{if(key==="全部身份")setRoleFilter(value)}}/><DataStateView state={state} retry={()=>void load()}/>{state==="success"&&(rows.length?<TableShell count={rows.length}><table><thead><tr><th>用户</th><th>手机号</th><th>身份</th><th>状态</th><th>最近活跃</th><th>操作</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><Person image="/assets/player-luye.png" name={row.nickname} sub={row.public_user_no??row.id}/></td><td>{row.phone_mask}</td><td>{row.seller_id?"买家 / 陪玩":"买家"}</td><td><StatusBadge value={row.status}/></td><td>{row.last_active_at?new Date(row.last_active_at).toLocaleString("zh-CN"):"—"}</td><td><div className={styles.rowActions}><button type="button" onClick={()=>setDetail(row.id)}>查看</button>{row.status!=="CANCELLED"&&<button type="button" className={row.status==="DISABLED"?"":styles.dangerText} onClick={()=>changeStatus(row)}>{row.status==="DISABLED"?"解禁":"禁用"}</button>}</div></td></tr>)}</tbody></table>{nextCursor&&<button className={styles.linkButton} type="button" onClick={()=>void load(nextCursor)}>加载更多</button>}</TableShell>:<DataStateView state="empty" retry={()=>{setSearch("");setRoleFilter("全部身份")}}/>)}</>;
}

function ReviewList({ kind, search, setSearch, state, setState, overrides, setDetail }: { kind:"seller"|"service"; search:string; setSearch:(v:string)=>void; state:DataState; setState:(v:DataState)=>void; overrides:Record<string,string>; setDetail:(v:string)=>void }) {
  const seller=kind==="seller";
  const [liveSellerRows,setLiveSellerRows]=useState<typeof sellerApps|null>(null); const [liveServiceRows,setLiveServiceRows]=useState<Array<Omit<(typeof serviceRows)[number],"price">&{price:number|string}>|null>(null);
  useEffect(()=>{ const path=seller?"/seller-applications?limit=100":"/product-reviews?limit=100"; void adminApiRequest<SellerReviewApiRow[]|ProductReviewApiRow[]>(path).then((rows)=>{ if(seller){ const mapped=(rows as SellerReviewApiRow[]).map((row)=>({id:row.id,name:row.seller.seller_nickname,rank:row.seller.game_rank??String(row.snapshot.game_rank??"未填写"),mode:row.seller.preferred_mode??String(row.snapshot.preferred_mode??"未填写"),submitted:row.submitted_at?new Date(row.submitted_at).toLocaleString("zh-CN",{hour:"2-digit",minute:"2-digit"}):"—",risk:"无风险",status:row.status,avatar:"/assets/player-kirito.png"})); if(mapped.length)setLiveSellerRows(mapped); }else{ const mapped=(rows as ProductReviewApiRow[]).map((row)=>({id:row.id,title:row.title,seller:row.seller.seller_nickname,price:row.min_price_cent,sold:row.sold_count,status:row.status,risk:"正常",image:"/assets/product-hero.png"})); if(mapped.length)setLiveServiceRows(mapped); } }).catch(()=>{}); },[seller]);
  const displayedSellerRows=liveSellerRows??sellerApps; const displayedServiceRows=liveServiceRows??serviceRows;
  return <><PageTitle eyebrow={seller?"SELLER REVIEW":"SERVICE REVIEW"} title={seller?"陪玩入驻审核":"服务内容审核"} note={seller?"审核身份资料、游戏能力与声音名片":"核对服务展示、定价规格和历史版本"} actions={seller?<span className={styles.slaPill}><i/>当前 SLA：7 分钟</span>:undefined}/><Toolbar search={search} setSearch={setSearch} state={state} setState={setState} placeholder={seller?"申请编号、昵称":"服务编号、标题或陪玩"}/><DataStateView state={state} retry={()=>setState("success")}/>{state==="success"&&<TableShell count={seller?displayedSellerRows.length:displayedServiceRows.length}><table><thead><tr>{(seller?["申请人","实力资料","擅长模式","风险","提交时间","状态","操作"]:["服务","陪玩","起售价","历史销量","风险","状态","操作"]).map((h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{seller?displayedSellerRows.map((r)=><tr key={r.id}><td><Person image={r.avatar} name={r.name} sub={r.id}/></td><td>{r.rank}</td><td>{r.mode}</td><td><span className={r.risk==="无风险"?styles.safeText:styles.warningText}>{r.risk}</span></td><td>{r.submitted}</td><td><StatusBadge value={overrides[r.id]??r.status}/></td><td><button className={styles.reviewButton} type="button" onClick={()=>setDetail(r.id)}>开始审核</button></td></tr>):displayedServiceRows.map((r)=><tr key={r.id}><td><span className={styles.serviceCell}><img src={r.image} alt=""/><span><b>{r.title}</b><small>{r.id}</small></span></span></td><td>{r.seller}</td><td>{formatMoney(r.price)}</td><td>{r.sold}</td><td><span className={r.risk==="正常"?styles.safeText:styles.warningText}>{r.risk}</span></td><td><StatusBadge value={overrides[r.id]??r.status}/></td><td><button className={styles.reviewButton} type="button" onClick={()=>setDetail(r.id)}>审核详情</button></td></tr>)}</tbody></table></TableShell>}</>;
}

function OrdersModule({ mode,setMode,search,setSearch,state,setState,setDetail,authorized,setAuthorized,selected,setSelected,openAction }: { mode:"orders"|"conversations";setMode:(v:"orders"|"conversations")=>void;search:string;setSearch:(v:string)=>void;state:DataState;setState:(v:DataState)=>void;setDetail:(v:string)=>void;authorized:boolean;setAuthorized:(v:boolean)=>void;selected:string;setSelected:(v:string)=>void;openAction:(v:NonNullable<ModalState>)=>void }) {
  const [rows,setRows]=useState<AdminOrderApi[]>([]);
  const load=useCallback(async()=>{setState("loading");try{const query=new URLSearchParams({limit:"100"});if(search.trim())query.set("keyword",search.trim());const page=await adminApiRequest<CursorPage<AdminOrderApi>>(`/orders?${query}`);setRows(page.items);setState(page.items.length?"success":"empty");}catch{setState("error");}},[search,setState]);
  useEffect(()=>{if(mode!=="orders")return;const timer=window.setTimeout(()=>void load(),250);return()=>window.clearTimeout(timer);},[load,mode]);
  return <><PageTitle eyebrow="ORDER GOVERNANCE" title="订单管理" note="统一查询订单事实、异常事件与受控会话取证" actions={<div className={styles.subTabs}><button className={mode==="orders"?styles.activeSub:""} type="button" onClick={()=>setMode("orders")}>订单列表</button><button className={mode==="conversations"?styles.activeSub:""} type="button" onClick={()=>setMode("conversations")}>会话取证</button></div>}/>{mode==="orders"?<><Toolbar search={search} setSearch={setSearch} state={state} setState={setState} placeholder="订单号、陪玩或服务"/><DataStateView state={state} retry={()=>void load()}/>{state==="success"&&<TableShell count={rows.length}><table><thead><tr><th>订单号 / 服务</th><th>买家</th><th>陪玩</th><th>规格</th><th>金额</th><th>支付</th><th>订单状态</th><th>时间</th><th>操作</th></tr></thead><tbody>{rows.map((r)=><tr key={r.id}><td><span className={styles.orderCell}><b>{r.order_no}</b><small>{r.product_title}</small></span></td><td>{r.buyer_id.slice(0,8)}</td><td>{r.seller_name}</td><td>{r.sku_name} × {r.quantity}</td><td><b>{formatMoney(r.payable_amount_cent)}</b></td><td><StatusBadge value={r.payment_status}/></td><td><StatusBadge value={r.status}/></td><td>{new Date(r.created_at).toLocaleString("zh-CN")}</td><td><button className={styles.linkButton} type="button" onClick={()=>setDetail(r.id)}>订单详情</button></td></tr>)}</tbody></table></TableShell>}</>:<ConversationEvidence authorized={authorized} selected={selected} setSelected={setSelected} requestAccess={(receive)=>openAction({title:"申请查看用户会话",note:"请填写当前调查目的，查看行为将写入不可删除的审计日志。",action:"记录原因并查看",target:selected,reasonRequired:true,onConfirm:async(reason)=>{const data=await adminApiRequest<{messages:Array<{id:string;sender_role:string;content:string;created_at:string}>}>(`/conversations/${selected}/evidence-view`,{method:"POST",body:JSON.stringify({reason})});receive(data);setAuthorized(true)}})} onRisk={()=>openAction({title:"标记风险会话",note:"会话将进入风险处置队列，不会修改或删除原始消息。",action:"确认标记",target:selected,reasonRequired:true,danger:true,onConfirm:async(reason)=>{await adminApiRequest("/governance/risk-events",{method:"POST",body:JSON.stringify({risk_type:"CHAT_CONTENT_REVIEW",severity:"HIGH",target_type:"CONVERSATION",target_id:selected,rule_key:"admin_manual_chat_flag",details_json:{source:"evidence_workbench"},reason})})}})}/>}</>;
}

function ConversationEvidence({authorized,selected,setSelected,requestAccess,onRisk}:{authorized:boolean;selected:string;setSelected:(v:string)=>void;requestAccess:(receive:(data:{messages:Array<{id:string;sender_role:string;content:string;created_at:string}>})=>void)=>void;onRisk:()=>void}) {
  const [query,setQuery]=useState("");
  const [riskOnly,setRiskOnly]=useState(false);
  const [apiRows,setApiRows]=useState<AdminConversationApi[]>([]);const [evidence,setEvidence]=useState<{messages:Array<{id:string;sender_role:string;content:string;created_at:string}>}|null>(null);
  useEffect(()=>{void adminApiRequest<AdminConversationApi[]>("/conversations?limit=100").then((rows)=>{setApiRows(rows);if(rows[0]&&!rows.some((v)=>v.id===selected))setSelected(rows[0].id)}).catch(()=>undefined)},[selected,setSelected]);
  const source=apiRows.length?apiRows.map((v)=>({id:v.id,people:`${v.buyer_id.slice(0,8)} ↔ ${v.seller_name}`,order:v.order_no,preview:v.last_message_preview??"暂无消息",time:v.last_message_at?new Date(v.last_message_at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}):"—",risk:"正常"})):conversations;
  const visible=source.filter((v)=>(!riskOnly||v.risk!=="正常")&&`${v.id}${v.people}${v.order}${v.preview}`.toLowerCase().includes(query.toLowerCase()));
  const item=source.find((v)=>v.id===selected)??source[0];
  if(!item)return <DataStateView state="empty" retry={()=>setQuery("")}/>;
  return <section className={styles.conversationLayout}><aside className={styles.conversationList}><div className={styles.conversationSearch}><span/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="会话 ID、订单或用户"/></div><div className={styles.conversationFilters}><button className={!riskOnly?styles.activeFilter:""} aria-pressed={!riskOnly} type="button" onClick={()=>setRiskOnly(false)}>全部会话</button><button className={riskOnly?styles.activeFilter:""} aria-pressed={riskOnly} type="button" onClick={()=>setRiskOnly(true)}>风险会话</button></div>{visible.length?visible.map((v)=><button className={selected===v.id?styles.selectedConversation:""} type="button" onClick={()=>{setSelected(v.id);setEvidence(null)}} key={v.id}><span className={styles.conversationAvatars}><AvatarImage image="/assets/player-luye.png" name={v.people.split(" ↔ ")[0]}/><AvatarImage image="/assets/player-kirito.png" name={v.people.split(" ↔ ")[1]??"陪玩"}/></span><div><b>{v.people}</b><small>{v.preview}</small><em>{v.order}</em></div><span><time>{v.time}</time>{v.risk!=="正常"&&<i>!</i>}</span></button>):<div className={styles.conversationEmpty}>没有符合条件的会话</div>}</aside><article className={styles.transcriptPanel}><header><div><b>{item.people}</b><span>{item.id}·关联订单 {item.order}</span></div><div><StatusBadge value={item.risk}/><button type="button" onClick={onRisk}>标记风险</button></div></header>{!authorized?<div className={styles.conversationGate}><img src="/assets/icon-shield.png" alt=""/><h2>会话内容受隐私保护</h2><p>仅可因订单争议、投诉或内容安全调查查看，每次查看都会完整留痕。</p><button type="button" onClick={()=>requestAccess(setEvidence)}>填写理由并查看</button></div>:<><div className={styles.evidenceBanner}><img src="/assets/icon-shield.png" alt=""/><span><b>取证模式·只读</b><small>查看行为已记录，消息不可编辑或删除</small></span></div><div className={styles.transcript}>{evidence?.messages?.map((message)=><div className={message.sender_role==="BUYER"?styles.myMessage:styles.theirMessage} key={message.id}><span><b>{message.sender_role}</b><p>{message.content}</p><small>{new Date(message.created_at).toLocaleString("zh-CN")}</small></span></div>)??<p>授权完成。重新选择会话后如需查看，请再次填写业务理由。</p>}</div><footer className={styles.transcriptFooter}><span>会话序列只读，原始记录不可编辑或删除</span><button type="button" onClick={onRisk}>标记为投诉线索</button></footer></>}</article></section>;
}

function CasesModule({kind,search,setSearch,state,setState,setDetail,openAction}:{kind:"refunds"|"complaints";search:string;setSearch:(v:string)=>void;state:DataState;setState:(v:DataState)=>void;setDetail:(v:string)=>void;openAction:(v:NonNullable<ModalState>)=>void}) {
  const refund = kind === "refunds";
  const [refundRows, setRefundRows] = useState<AdminRefundApi[]>([]);
  const [complaintRows, setComplaintRows] = useState<AdminComplaintApi[]>([]);
  const load = useCallback(async () => {
    if (refund) setRefundRows(await adminApiRequest<AdminRefundApi[]>("/refunds?limit=100"));
    else setComplaintRows(await adminApiRequest<AdminComplaintApi[]>("/complaints?limit=100"));
  }, [refund]);
  useEffect(() => {
    const request = refund ? adminApiRequest<AdminRefundApi[]>("/refunds?limit=100") : adminApiRequest<AdminComplaintApi[]>("/complaints?limit=100");
    void request.then((rows) => { if (refund) setRefundRows(rows as AdminRefundApi[]); else setComplaintRows(rows as AdminComplaintApi[]); }).catch(() => undefined);
  }, [refund]);
  const query = search.trim().toLowerCase();
  const visibleRefunds = refundRows.filter((row) => `${row.refund_no}${row.order_id}${row.applicant_id}${row.reason_text}`.toLowerCase().includes(query));
  const visibleComplaints = complaintRows.filter((row) => `${row.complaint_no}${row.order_id ?? ""}${row.reporter_id}${row.complaint_type}${row.description}`.toLowerCase().includes(query));
  const decideRefund = (row: AdminRefundApi, decision: "APPROVE"|"REJECT") => openAction({
    title: decision === "APPROVE" ? "批准平台退款" : "驳回退款申请",
    note: `退款单 ${row.refund_no}，申请金额 ${formatMoney(row.requested_amount_cent)}。`,
    action: decision === "APPROVE" ? "确认批准" : "确认驳回",
    target: row.id,
    reasonRequired: true,
    danger: decision === "REJECT",
    onConfirm: async (reason) => { await adminApiRequest(`/refunds/${row.id}/decision`, { method:"POST", body:JSON.stringify({ version:row.version, decision, ...(decision === "APPROVE" ? { approved_amount_cent:row.requested_amount_cent } : {}), reason }) }); await load(); },
  });
  const actComplaint = (row: AdminComplaintApi) => {
    const action = row.status === "SUBMITTED" ? "ACCEPT" : row.status === "ACCEPTED" ? "START_PROCESSING" : "COMPLETE";
    const label = action === "ACCEPT" ? "受理投诉" : action === "START_PROCESSING" ? "开始调查" : "完成投诉处理";
    openAction({ title:label, note:`投诉单 ${row.complaint_no}，当前状态 ${row.status}。`, action:`确认${label}`, target:row.id, reasonRequired:true, onConfirm:async(reason)=>{ await adminApiRequest(`/complaints/${row.id}/actions`, { method:"POST", body:JSON.stringify({ version:row.version, action, reason, ...(action === "COMPLETE" ? { result:reason } : {}) }) }); await load(); } });
  };
  const actionableRefund = (status:string) => ["PLATFORM_REVIEW","SELLER_REJECTED","NEGOTIATING"].includes(status);
  const actionableComplaint = (status:string) => ["SUBMITTED","ACCEPTED","PROCESSING","NEED_MORE_EVIDENCE"].includes(status);
  return <><PageTitle eyebrow={refund?"REFUND OPERATIONS":"TRUST & SAFETY"} title={refund?"退款管理":"投诉管理"} note={refund?"核对可退金额、双方说明和支付渠道状态":"处理交易争议、内容风险与用户治理动作"}/><Toolbar search={search} setSearch={setSearch} state={state} setState={setState} placeholder={refund?"退款单号、订单号或用户":"投诉单、订单号或对象"}/><DataStateView state={state} retry={()=>{setState("success");void load();}}/>{state==="success"&&(refund ? <TableShell count={visibleRefunds.length}><table><thead><tr>{["退款单 / 订单","申请人","退款金额","申请原因","状态","时间","操作"].map((h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{visibleRefunds.map((row)=><tr key={row.id}><td><span className={styles.orderCell}><b>{row.refund_no}</b><small>{row.order_id}</small></span></td><td>{row.applicant_id.slice(0,8)}</td><td><b className={styles.moneyDanger}>{formatMoney(row.requested_amount_cent)}</b></td><td>{row.reason_text}</td><td><StatusBadge value={row.status}/></td><td>{new Date(row.created_at).toLocaleString("zh-CN")}</td><td><div className={styles.rowActions}><button type="button" onClick={()=>setDetail(row.id)}>详情</button>{actionableRefund(row.status)&&<><button type="button" onClick={()=>decideRefund(row,"APPROVE")}>批准</button><button type="button" className={styles.dangerText} onClick={()=>decideRefund(row,"REJECT")}>驳回</button></>}</div></td></tr>)}</tbody></table></TableShell> : <TableShell count={visibleComplaints.length}><table><thead><tr>{["投诉单 / 订单","举报人","投诉类型","目标","状态","时间","操作"].map((h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{visibleComplaints.map((row)=><tr key={row.id}><td><span className={styles.orderCell}><b>{row.complaint_no}</b><small>{row.order_id ?? row.id}</small></span></td><td>{row.reporter_id.slice(0,8)}</td><td>{row.complaint_type}</td><td><span className={styles.riskHigh}>{row.target_type}</span></td><td><StatusBadge value={row.status}/></td><td>{new Date(row.created_at).toLocaleString("zh-CN")}</td><td><div className={styles.rowActions}><button type="button" onClick={()=>setDetail(row.id)}>详情</button>{actionableComplaint(row.status)&&<button type="button" onClick={()=>actComplaint(row)}>处理</button>}</div></td></tr>)}</tbody></table></TableShell>)}</>;
}

function ReviewsModule({search,setSearch,state,setState,setDetail,openAction}:{search:string;setSearch:(v:string)=>void;state:DataState;setState:(v:DataState)=>void;setDetail:(v:string)=>void;openAction:(v:NonNullable<ModalState>)=>void}) {
  const [rows,setRows]=useState<AdminReviewApi[]>([]);
  const load=useCallback(async()=>setRows(await adminApiRequest<AdminReviewApi[]>("/reviews?limit=100")),[]);
  useEffect(()=>{void adminApiRequest<AdminReviewApi[]>("/reviews?limit=100").then(setRows).catch(()=>undefined);},[]);
  const query=search.trim().toLowerCase();
  const visible=rows.filter((row)=>`${row.order_id}${row.display_nickname}${row.service_title}${row.content??""}`.toLowerCase().includes(query));
  const moderate=(row:AdminReviewApi)=>{ const action=row.status==="HIDDEN"?"RESTORE":"HIDE"; openAction({title:action==="HIDE"?"隐藏违规评价":"恢复公开评价",note:`${row.rating} 星评价：${row.content??"未填写文字内容"}`,action:action==="HIDE"?"确认隐藏":"确认恢复",target:row.id,reasonRequired:true,danger:action==="HIDE",onConfirm:async(reason)=>{await adminApiRequest(`/reviews/${row.id}/moderation`,{method:"POST",body:JSON.stringify({action,reason})});await load();}}); };
  return <><PageTitle eyebrow="REVIEW GOVERNANCE" title="评价管理" note="违规评价可隐藏或恢复，评分聚合随状态实时重算"/><Toolbar search={search} setSearch={setSearch} state={state} setState={setState} placeholder="订单、用户、服务或评价内容"/><DataStateView state={state} retry={()=>{setState("success");void load();}}/>{state==="success"&&<TableShell count={visible.length}><table><thead><tr>{["评价 / 订单","用户","服务","评分","内容","状态","操作"].map((h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map((row)=><tr key={row.id}><td><span className={styles.orderCell}><b>{row.id.slice(0,8)}</b><small>{row.order_id}</small></span></td><td>{row.display_nickname}</td><td>{row.service_title}</td><td>{"★".repeat(row.rating)}</td><td>{row.content??"—"}</td><td><StatusBadge value={row.status}/></td><td><div className={styles.rowActions}><button type="button" onClick={()=>setDetail(row.id)}>详情</button><button type="button" className={row.status==="HIDDEN"?"":styles.dangerText} onClick={()=>moderate(row)}>{row.status==="HIDDEN"?"恢复":"隐藏"}</button></div></td></tr>)}</tbody></table></TableShell>}</>;
}

function FinanceModule({search,setSearch,state,setState,setDetail,openAction}:{search:string;setSearch:(v:string)=>void;state:DataState;setState:(v:DataState)=>void;setDetail:(v:string)=>void;openAction:(v:NonNullable<ModalState>)=>void}) {
  const [transactions,setTransactions]=useState<AdminLedgerApi[]>([]);const [runs,setRuns]=useState<AdminReconciliationApi[]>([]);const [items,setItems]=useState<NonNullable<AdminReconciliationApi["items"]>>([]);
  const load=useCallback(async()=>{const [ledgerRows,runRows]=await Promise.all([adminApiRequest<AdminLedgerApi[]>("/finance/ledger-transactions"),adminApiRequest<AdminReconciliationApi[]>("/finance/reconciliation-runs")]);setTransactions(ledgerRows);setRuns(runRows);if(runRows[0]){const detail=await adminApiRequest<AdminReconciliationApi>(`/finance/reconciliation-runs/${runRows[0].id}`);setItems(detail.items??[]);}},[]);
  useEffect(()=>{void Promise.all([adminApiRequest<AdminLedgerApi[]>("/finance/ledger-transactions"),adminApiRequest<AdminReconciliationApi[]>("/finance/reconciliation-runs")]).then(async([ledgerRows,runRows])=>{setTransactions(ledgerRows);setRuns(runRows);if(runRows[0]){const detail=await adminApiRequest<AdminReconciliationApi>(`/finance/reconciliation-runs/${runRows[0].id}`);setItems(detail.items??[]);}}).catch(()=>undefined);},[]);
  const query=search.trim().toLowerCase();const visible=transactions.filter(row=>`${row.transaction_no}${row.transaction_type}${row.source_id}${row.description}`.toLowerCase().includes(query));
  const startRun=()=>openAction({title:"创建渠道对账批次",note:"将创建当前时点的 MOCK 渠道对账批次；生产环境由渠道账单导入器提供明细。",action:"确认执行",reasonRequired:true,target:"RECONCILIATION",onConfirm:async(reason)=>{await adminApiRequest("/finance/reconciliation-runs",{method:"POST",body:JSON.stringify({provider:"MOCK",statement_date:new Date().toISOString(),reason,items:[]})});await load();}});
  const resolve=(item:NonNullable<AdminReconciliationApi["items"]>[number])=>openAction({title:"处理对账差异",note:`${item.mismatch_type} · ${item.provider_reference??"无渠道编号"}`,action:"确认解决",reasonRequired:true,target:item.id,onConfirm:async(reason)=>{await adminApiRequest(`/finance/reconciliation-items/${item.id}/resolve`,{method:"POST",body:JSON.stringify({action:"RESOLVE",reason})});await load();}});
  return <><PageTitle eyebrow="DOUBLE-ENTRY LEDGER" title="财务数据" note="所有已入账交易借贷平衡，差错只通过反向交易修正" actions={<button className={styles.exportButton} type="button" onClick={startRun}>执行对账</button>}/><section className={styles.financeSummary}>{[["账务交易",String(transactions.length)],["对账批次",String(runs.length)],["待处理差异",String(items.filter(v=>v.status==="OPEN").length)],["已入账",String(transactions.filter(v=>v.status==="POSTED").length)]].map(v=><article key={v[0]}><span>{v[0]}</span><b>{v[1]}</b><small>真实数据库口径</small></article>)}</section><Toolbar search={search} setSearch={setSearch} state={state} setState={setState} placeholder="账务编号、类型、来源或说明"/><DataStateView state={state} retry={()=>{setState("success");void load();}}/>{state==="success"&&<TableShell count={visible.length}><table><thead><tr>{["账务编号","类型","来源","说明","状态","入账时间","操作"].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><b>{row.transaction_no}</b></td><td>{row.transaction_type}</td><td>{row.source_type} · {row.source_id.slice(0,8)}</td><td>{row.description}</td><td><StatusBadge value={row.status}/></td><td>{new Date(row.occurred_at).toLocaleString("zh-CN")}</td><td><button className={styles.linkButton} type="button" onClick={()=>setDetail(row.id)}>查看分录</button></td></tr>)}</tbody></table></TableShell>}{items.some(v=>v.status==="OPEN")&&<TableShell count={items.length}><table><thead><tr><th>差异类型</th><th>业务</th><th>平台金额</th><th>渠道金额</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.mismatch_type}</td><td>{item.business_type}</td><td>{item.platform_amount_cent===null?"—":formatMoney(item.platform_amount_cent)}</td><td>{item.provider_amount_cent===null?"—":formatMoney(item.provider_amount_cent)}</td><td><StatusBadge value={item.status}/></td><td>{item.status==="OPEN"&&<button type="button" onClick={()=>resolve(item)}>处理差异</button>}</td></tr>)}</tbody></table></TableShell>}</>;
}

function WithdrawalsModule({search,setSearch,state,setState,setDetail,openAction}:{search:string;setSearch:(v:string)=>void;state:DataState;setState:(v:DataState)=>void;setDetail:(v:string)=>void;openAction:(v:NonNullable<ModalState>)=>void}) {
  const [rows,setRows]=useState<AdminWithdrawalApi[]>([]);const load=useCallback(async()=>setRows(await adminApiRequest<AdminWithdrawalApi[]>("/withdrawals")),[]);useEffect(()=>{void adminApiRequest<AdminWithdrawalApi[]>("/withdrawals").then(setRows).catch(()=>undefined);},[]);const query=search.trim().toLowerCase();const visible=rows.filter(row=>`${row.withdrawal_no}${row.seller_id}${row.status}`.toLowerCase().includes(query));const approve=(row:AdminWithdrawalApi)=>openAction({title:"批准提现并提交渠道",note:`提现单 ${row.withdrawal_no}，实际打款 ${formatMoney(row.actual_amount_cent)}。`,action:"确认批准",target:row.id,reasonRequired:true,onConfirm:async(reason)=>{await adminApiRequest(`/withdrawals/${row.id}/approve`,{method:"POST",body:JSON.stringify({version:row.version,reason})});await load();}});return <><PageTitle eyebrow="PAYOUT OPERATIONS" title="提现管理" note="审核脱敏账户、风险状态和收益锁定记录"/><Toolbar search={search} setSearch={setSearch} state={state} setState={setState} placeholder="提现编号、陪玩或状态"/><DataStateView state={state} retry={()=>{setState("success");void load();}}/>{state==="success"&&<TableShell count={visible.length}><table><thead><tr>{["提现单","陪玩","申请金额","手续费","实际到账","风险","状态","操作"].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><b>{row.withdrawal_no}</b></td><td>{row.seller_id.slice(0,8)}</td><td>{formatMoney(row.amount_cent)}</td><td>{formatMoney(row.fee_cent)}</td><td>{formatMoney(row.actual_amount_cent)}</td><td><StatusBadge value={row.risk_status}/></td><td><StatusBadge value={row.status}/></td><td><div className={styles.rowActions}><button type="button" onClick={()=>setDetail(row.id)}>详情</button>{row.status==="CREATED"&&<button type="button" onClick={()=>approve(row)}>批准</button>}</div></td></tr>)}</tbody></table></TableShell>}</>;
}

function SupportModule({selected,setSelected,openAction,notify,onOpenBusiness}:{selected:string;setSelected:(value:string)=>void;openAction:(value:NonNullable<ModalState>)=>void;notify:(value:string)=>void;onOpenBusiness:(module:ModuleId,id:string)=>void}) {
  const [queue, setQueue] = useState<"waiting"|"serving"|"closed">("waiting");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<Record<string, SupportMessage[]>>(initialSupportMessages);
  const [apiCases, setApiCases] = useState<AdminSupportCaseApi[]>([]);
  type SessionView = (typeof supportSessions)[number] & { raw?: AdminSupportCaseApi };
  const loadCases = useCallback(async () => { const rows = await adminApiRequest<AdminSupportCaseApi[]>("/support-cases?limit=100"); setApiCases(rows); if (rows.length && !rows.some((row) => row.id === selected)) setSelected(rows[0]!.id); }, [selected, setSelected]);
  useEffect(() => { void adminApiRequest<AdminSupportCaseApi[]>("/support-cases?limit=100").then((rows) => { setApiCases(rows); if (rows.length && !rows.some((row) => row.id === selected)) setSelected(rows[0]!.id); }).catch(() => undefined); }, [selected, setSelected]);
  const liveSessions: SessionView[] = apiCases.map((row) => ({ id: row.id, userId: row.requester_id, user: `用户 ${row.requester_id.slice(0, 8)}`, avatar: "/assets/player-luye.png", topic: row.topic, preview: row.first_response_at ? "人工客服已响应" : "等待人工客服响应", time: new Date(row.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), wait: row.status === "CLOSED" ? "已结束" : row.status === "SERVING" ? "服务中" : "排队中", status: `SUPPORT_${row.status}`, priority: row.priority === "URGENT" || row.priority === "HIGH" ? "PRIORITY_HIGH" : row.priority === "MEDIUM" ? "PRIORITY_MEDIUM" : "PRIORITY_NORMAL", businessType: row.related_type === "REFUND" ? "退款单" : row.related_type === "COMPLAINT" ? "投诉单" : row.related_type === "WITHDRAWAL" ? "提现单" : row.related_type === "ORDER" ? "订单" : "用户", businessId: row.related_id ?? row.case_no, unread: 0, amount: "—", raw: row }));
  const sessions: SessionView[] = liveSessions.length ? liveSessions : supportSessions;
  const item = sessions.find((session) => session.id === selected) ?? sessions[0]!;
  const itemStatus = item.status;
  const visibleSessions = sessions.filter((session) => {
    const status = session.status;
    const inQueue = queue === "waiting" ? ["SUPPORT_WAITING","SUPPORT_TRANSFERRED"].includes(status) : queue === "serving" ? status === "SUPPORT_SERVING" : status === "SUPPORT_CLOSED";
    return inQueue && `${session.id}${session.user}${session.userId}${session.topic}${session.businessId}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const currentMessages = messages[item.id] ?? [];
  const relatedModule: ModuleId = item.businessType === "退款单" ? "refunds" : item.businessType === "投诉单" ? "complaints" : item.businessType === "提现单" ? "withdrawals" : item.businessType === "订单" ? "orders" : "users";

  useEffect(() => { if (!item.raw || item.raw.assigned_admin_id === null) return; void adminApiRequest<{items:AdminMessageApi[]}>(`/support-cases/${item.id}/messages?limit=100`).then((page) => setMessages((current) => ({ ...current, [item.id]: [...page.items].reverse().map((message) => ({ id: message.id, from: message.message_type === "SYSTEM" ? "system" : message.sender_admin_id ? "agent" : "user", text: message.content, time: new Date(message.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), state: message.sender_admin_id ? "已发送" : undefined })) }))).catch(() => undefined); }, [item.id, item.raw?.assigned_admin_id]);
  const receiveSession = async () => { if (!item.raw) { notify("演示数据不能执行真实接入"); return; } try { await adminApiRequest(`/support-cases/${item.id}/receive`, { method: "POST", body: JSON.stringify({ version: item.raw.version }) }); await loadCases(); setQueue("serving"); notify("已接入客服会话，当前操作已记录"); } catch (error) { notify(error instanceof Error ? error.message : "接入失败"); } };
  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const text = reply.trim();
    if (!text) return;
    if (itemStatus !== "SUPPORT_SERVING") { notify("请先接入会话后再发送回复"); return; }
    if (!item.raw) { notify("演示数据不能发送真实回复"); return; }
    try { await adminApiRequest(`/support-cases/${item.id}/reply`, { method: "POST", body: JSON.stringify({ client_message_id: `admin-${window.crypto.randomUUID()}`, content: text }) }); setReply(""); await loadCases(); const page = await adminApiRequest<{items:AdminMessageApi[]}>(`/support-cases/${item.id}/messages?limit=100`); setMessages((current) => ({ ...current, [item.id]: [...page.items].reverse().map((message) => ({ id: message.id, from: message.message_type === "SYSTEM" ? "system" : message.sender_admin_id ? "agent" : "user", text: message.content, time: new Date(message.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), state: message.sender_admin_id ? "已发送" : undefined })) })); notify("回复已发送，并加入不可变会话记录"); } catch (error) { notify(error instanceof Error ? error.message : "回复发送失败"); }
  };
  const transferSession = () => openAction({ title:"转交客服会话", note:"会话内容和关联业务将一并移交至交易售后组。", action:"确认转交", target:item.id, nextStatus:"SUPPORT_TRANSFERRED", reasonRequired:true, onConfirm:async(reason)=>{ if (!item.raw) return; try { await adminApiRequest(`/support-cases/${item.id}/transfer`, { method:"POST", body:JSON.stringify({ version:item.raw.version, queue_key:"trade-after-sale", reason }) }); await loadCases(); setQueue("waiting"); notify("会话已转交，操作已审计"); } catch(error) { notify(error instanceof Error ? error.message : "转交失败"); } } });
  const closeSession = () => openAction({ title:"结束客服会话", note:"结束后用户仍可查看历史消息，如需继续咨询可重新打开。", action:"确认结束", target:item.id, nextStatus:"SUPPORT_CLOSED", reasonRequired:true, onConfirm:async(reason)=>{ if (!item.raw) return; try { await adminApiRequest(`/support-cases/${item.id}/close`, { method:"POST", body:JSON.stringify({ version:item.raw.version, reason }) }); await loadCases(); setQueue("closed"); notify("客服会话已结束，操作已审计"); } catch(error) { notify(error instanceof Error ? error.message : "结束失败"); } } });
  const quickReplies = ["已为你核对订单，请稍候。","请在平台内补充相关截图。","该问题已转交交易专员。"];

  return <>
    <PageTitle eyebrow="SUPPORT DESK" title="客服中心" note="统一接入用户咨询，并关联订单、退款、投诉与提现记录" actions={<span className={styles.supportOnline}><i/>客服在线 · Alex</span>} />
    <section className={styles.supportMetrics}>
      {[['排队中','5','最长等待 9 分钟'],['服务中','8','当前坐席 4 人'],['今日已结束','126','满意度 96.8%'],['平均首次响应','48 秒','目标低于 60 秒']].map((metric)=><article key={metric[0]}><span>{metric[0]}</span><b>{metric[1]}</b><small>{metric[2]}</small></article>)}
    </section>
    <section className={styles.supportWorkspace}>
      <aside className={styles.supportQueue}>
        <header><div><b>会话队列</b><span>按优先级与等待时长排序</span></div><em>13</em></header>
        <label className={styles.supportQueueSearch}><b className={styles.srOnly}>搜索客服会话</b><span/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="会话、用户或业务编号" /></label>
        <div className={styles.supportQueueTabs}>{([["waiting","待接入 5"],["serving","服务中 8"],["closed","已结束"]] as const).map((tab)=><button type="button" aria-pressed={queue===tab[0]} className={queue===tab[0]?styles.activeSupportTab:""} onClick={()=>setQueue(tab[0])} key={tab[0]}>{tab[1]}</button>)}</div>
        <div className={styles.supportSessionList}>{visibleSessions.length ? visibleSessions.map((session)=><button type="button" className={selected===session.id?styles.selectedSupportSession:""} onClick={()=>setSelected(session.id)} key={session.id}><AvatarImage image={session.avatar} name={session.user}/><span><b>{session.user}<em>{session.topic}</em></b><small>{session.preview}</small><i>{session.businessId} · {session.wait}</i></span><time>{session.time}{session.unread>0&&<strong>{session.unread}</strong>}</time></button>) : <div className={styles.supportEmpty}>当前队列没有符合条件的会话</div>}</div>
      </aside>
      <article className={styles.supportChat}>
        <header className={styles.supportChatHeader}><div><Person image={item.avatar} name={item.user} sub={`${item.id} · ${item.topic}`}/><StatusBadge value={itemStatus}/><StatusBadge value={item.priority}/></div><div>{itemStatus!=="SUPPORT_SERVING"&&itemStatus!=="SUPPORT_CLOSED"?<button className={styles.receiveSupportButton} type="button" onClick={receiveSession}>接入会话</button>:null}<button type="button" disabled={itemStatus==="SUPPORT_CLOSED"} onClick={transferSession}>转交</button><button className={styles.closeSupportButton} type="button" disabled={itemStatus==="SUPPORT_CLOSED"} onClick={closeSession}>结束会话</button></div></header>
        <div className={styles.supportNotice}><img src="/assets/icon-shield.png" alt=""/><span><b>平台内实时会话 · 全程留痕</b><small>请勿索取用户密码、验证码或引导站外沟通</small></span></div>
        <div className={styles.supportMessages}><time>2026 年 8 月 19 日</time>{currentMessages.map((message)=>message.from==="system"?<div className={styles.supportSystemMessage} key={message.id}><span>{message.text}</span><time>{message.time}</time></div>:<div className={`${styles.supportMessage} ${message.from==="agent"?styles.supportAgentMessage:styles.supportUserMessage}`} key={message.id}>{message.from==="user"&&<AvatarImage image={item.avatar} name={item.user}/>}<span><b>{message.from==="agent"?"Alex · 平台客服":item.user}</b><p>{message.text}</p><small>{message.time}{message.state?` · ${message.state}`:""}</small></span>{message.from==="agent"&&<i>A</i>}</div>)}</div>
        <form className={styles.supportComposer} onSubmit={sendReply}><div className={styles.quickReplies}>{quickReplies.map((text)=><button type="button" disabled={itemStatus!=="SUPPORT_SERVING"} onClick={()=>setReply(text)} key={text}>{text}</button>)}</div><label><textarea aria-label="客服回复内容" value={reply} maxLength={500} disabled={itemStatus!=="SUPPORT_SERVING"} onChange={(event)=>setReply(event.target.value)} placeholder={itemStatus==="SUPPORT_WAITING"?"接入会话后即可回复用户":itemStatus==="SUPPORT_CLOSED"?"会话已结束，仅可查看历史消息":"输入回复内容，按发送同步至用户会话"}/><small>{reply.length}/500</small></label><footer><span><i/>消息将进入平台会话记录</span><button type="submit" disabled={!reply.trim()||itemStatus!=="SUPPORT_SERVING"}>发送回复</button></footer></form>
      </article>
      <aside className={styles.supportContext}>
        <section className={styles.supportProfile}><AvatarImage image={item.avatar} name={item.user}/><div><span>咨询用户</span><b>{item.user}</b><small>{item.userId} · {item.userId==="U10231"?"陪玩":"买家"}</small></div><StatusBadge value="NORMAL"/></section>
        <section className={styles.supportContextCard}><header><b>关联业务</b><span>自动识别</span></header><div className={styles.supportBusiness}><span><img src="/assets/icon-order.png" alt=""/><i>{item.businessType}</i></span><b>{item.businessId}</b><small>{item.topic} · 涉及金额 {item.amount}</small><button type="button" onClick={()=>onOpenBusiness(relatedModule,item.businessId)}>打开业务详情</button></div></section>
        <section className={styles.supportContextCard}><header><b>用户与风险</b><span>实时资料</span></header><dl><div><dt>账号状态</dt><dd>正常</dd></div><div><dt>实名认证</dt><dd>已认证</dd></div><div><dt>近 30 日咨询</dt><dd>3 次</dd></div><div><dt>风险等级</dt><dd className={item.priority==="PRIORITY_HIGH"?styles.supportRisk:""}>{item.priority==="PRIORITY_HIGH"?"较高":"低风险"}</dd></div></dl></section>
        <section className={styles.supportContextCard}><header><b>处理信息</b><span>自动留痕</span></header><dl><div><dt>会话来源</dt><dd>用户端消息页</dd></div><div><dt>客服队列</dt><dd>交易售后组</dd></div><div><dt>当前客服</dt><dd>{itemStatus==="SUPPORT_SERVING"?"Alex":"暂未分配"}</dd></div><div><dt>首次响应</dt><dd>{itemStatus==="SUPPORT_SERVING"?"48 秒":"等待中"}</dd></div></dl></section>
        <p className={styles.supportAuditNote}><img src="/assets/icon-shield.png" alt=""/>接入、回复、转交和结束会话均会生成管理员操作日志。</p>
      </aside>
    </section>
  </>;
}

function GenericModule({id,config,currentNav,search,setSearch,state,setState,setDetail}:{id:ModuleId;config:TableConfig;currentNav:{eyebrow:string};search:string;setSearch:(v:string)=>void;state:DataState;setState:(v:DataState)=>void;setDetail:(v:string)=>void;notify:(v:string)=>void}) {
  const [liveRows,setLiveRows]=useState<TableConfig["rows"]|null>(null);const load=useCallback(async()=>{if(id!=="sellers"&&id!=="services")return;setState("loading");try{if(id==="sellers"){const rows=await adminApiRequest<Array<{id:string;seller_nickname:string;status:string;rating_avg:string;completed_order_count:number;accepting_orders:boolean}>>("/catalog/sellers");setLiveRows(rows.map((v)=>({id:v.id,cells:[v.seller_nickname,String(v.rating_avg),String(v.completed_order_count),v.accepting_orders?"接单中":"暂停接单",v.status],status:v.status})));}else{const rows=await adminApiRequest<Array<{id:string;title:string;status:string;min_price_cent:string;sold_count:number;rating_avg:string}>>("/catalog/products");setLiveRows(rows.map((v)=>({id:v.id,cells:[v.title,formatMoney(v.min_price_cent),String(v.sold_count),String(v.rating_avg),v.status],status:v.status})));}setState("success");}catch{setState("error")}},[id,setState]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load()},[load]);const rows=(liveRows??config.rows).filter((v)=>`${v.id}${v.cells.join("")}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageTitle eyebrow={currentNav.eyebrow} title={config.title} note={config.note}/><Toolbar search={search} setSearch={setSearch} state={state} setState={setState}/><DataStateView state={state} retry={()=>void load()}/>{state==="success"&&(rows.length?<TableShell count={rows.length}><table><thead><tr>{config.columns.map((c)=><th key={c}>{c}</th>)}<th>操作</th></tr></thead><tbody>{rows.map((r)=><tr key={r.id}>{r.cells.map((cell,i)=><td key={i}>{i===r.cells.length-1&&r.status?<StatusBadge value={cell}/>:cell}</td>)}<td><button className={styles.linkButton} type="button" onClick={()=>setDetail(r.id)}>查看详情</button></td></tr>)}</tbody></table></TableShell>:<DataStateView state="empty" retry={()=>setSearch("")}/>)}</>;
}

function ConfigModule({openAction}:{openAction:(v:NonNullable<ModalState>)=>void}) {
  const [rows,setRows]=useState<AdminConfigApi[]>([]);const [selectedId,setSelectedId]=useState<string>("");const [draft,setDraft]=useState("");
  const load=useCallback(async()=>{const values=await adminApiRequest<AdminConfigApi[]>("/governance/configs");setRows(values);const active=values.find((v)=>v.status==="ACTIVE")??values[0];if(active){setSelectedId(active.id);setDraft(JSON.stringify(active.value_json,null,2));}},[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load().catch(()=>undefined)},[load]);const selected=rows.find((v)=>v.id===selectedId);const versions=selected?rows.filter((v)=>v.config_key===selected.config_key):rows;
  const publish=()=>{if(!selected)return;let value:unknown;try{value=JSON.parse(draft)}catch{return}openAction({title:`发布 ${selected.config_key} V${selected.version_no+1}`,note:"新版本生效后，当前版本将自动转为已替换，历史记录不会删除。",action:"确认发布",target:selected.id,reasonRequired:true,onConfirm:async(reason)=>{await adminApiRequest("/governance/configs",{method:"POST",body:JSON.stringify({config_key:selected.config_key,value_json:value,reason})});await load();}})};
  return <><PageTitle eyebrow="PLATFORM CONFIG" title="平台配置" note="关键生产参数按配置键独立版本化、发布和审计" actions={<span className={styles.versionPill}>{rows.filter((v)=>v.status==="ACTIVE").length} 个生效配置</span>}/>{selected?<section className={styles.configLayout}><article className={styles.configCard}><header><div><b>{selected.config_key}</b><span>{selected.status==="ACTIVE"?"当前生效配置，可创建新版本":"历史版本只读，不影响当前配置"}</span></div></header><div className={styles.configGrid}><label><span>JSON 配置值</span><textarea value={draft} disabled={selected.status!=="ACTIVE"} onChange={(event)=>setDraft(event.target.value)} rows={12}/><small>服务端保存完整 JSON 快照，发布操作需要业务理由</small></label></div><footer><button type="button" disabled={selected.status!=="ACTIVE"} onClick={publish}>{selected.status==="ACTIVE"?"保存并发布新版本":"历史版本仅供查看"}</button></footer></article><aside className={styles.versionHistory}><header><b>版本记录</b><span>不可删除</span></header>{versions.map((v)=><button className={selectedId===v.id?styles.activeVersion:""} aria-pressed={selectedId===v.id} type="button" onClick={()=>{setSelectedId(v.id);setDraft(JSON.stringify(v.value_json,null,2))}} key={v.id}><span><b>V{v.version_no}</b><small>{new Date(v.created_at).toLocaleString("zh-CN")}</small></span><StatusBadge value={v.status}/></button>)}</aside></section>:<DataStateView state="empty" retry={()=>void load()}/>}</>;
}

function LogsModule({logs:initial,setDetail,openAction}:{logs:typeof initialLogs;setDetail:(v:string)=>void;openAction:(v:NonNullable<ModalState>)=>void}) {
  const [query,setQuery]=useState("");
  const [filters,setFilters]=useState(["全部角色","操作类型","时间范围"]);
  const [mode,setMode]=useState<"operations"|"risks"|"security"|"access">("operations");
  const filterOptions=[["全部角色","仅 Alex","运营组"],["操作类型","审核操作","会话取证"],["时间范围","今天","近 7 天"]];
  const [apiRows,setApiRows]=useState<AdminOperationLogApi[]>([]);useEffect(()=>{void adminApiRequest<AdminOperationLogApi[]>("/governance/operation-logs").then(setApiRows).catch(()=>undefined)},[]);
  const [risks,setRisks]=useState<AdminRiskApi[]>([]);const [security,setSecurity]=useState<AdminSecurityApi[]>([]);const [roles,setRoles]=useState<AdminRoleApi[]>([]);const [admins,setAdmins]=useState<AdminAccountApi[]>([]);
  const loadRisks=useCallback(async()=>setRisks(await adminApiRequest<AdminRiskApi[]>("/governance/risk-events")),[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void Promise.allSettled([loadRisks(),adminApiRequest<AdminSecurityApi[]>("/governance/security-logs").then(setSecurity),adminApiRequest<AdminRoleApi[]>("/rbac/roles").then(setRoles),adminApiRequest<AdminAccountApi[]>("/rbac/admins").then(setAdmins)])},[loadRisks]);
  const logs=apiRows.length?apiRows.map((v)=>({id:v.id,admin:v.admin_name,action:v.action,target:`${v.target_type} · ${v.target_id??"PLATFORM"}`,reason:v.reason,ip:v.ip,time:new Date(v.created_at).toLocaleString("zh-CN")})):initial;
  const visible=logs.filter((r)=>`${r.id}${r.admin}${r.action}${r.target}${r.reason}${r.ip}`.toLowerCase().includes(query.toLowerCase()));
  const resolve=(risk:AdminRiskApi)=>openAction({title:"结案风险事件",note:`${risk.riskType} · ${risk.targetType} ${risk.targetId}`,action:"确认结案",target:risk.id,reasonRequired:true,danger:true,onConfirm:async(reason)=>{await adminApiRequest(`/governance/risk-events/${risk.id}/resolve`,{method:"POST",body:JSON.stringify({version:risk.version,resolution:reason,reason})});await loadRisks();}});
  return <><PageTitle eyebrow="AUDIT & ACCESS" title="安全、权限与审计" note="集中查看管理员操作、风险事件、安全日志和 RBAC 授权" actions={<span className={styles.immutablePill}><i/>日志不可删除</span>}/><div className={styles.subTabs}>{[["operations","操作日志"],["risks","风险事件"],["security","安全日志"],["access","角色权限"]].map(([key,label])=><button className={mode===key?styles.activeSub:""} type="button" onClick={()=>setMode(key as typeof mode)} key={key}>{label}</button>)}</div>{mode==="operations"&&<><div className={styles.toolbar}><label className={styles.searchField}><b className={styles.srOnly}>搜索操作日志</b><span/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="管理员、操作、对象 ID 或请求 ID"/></label>{filterOptions.map((options,index)=><FilterSelect label={options[0]} options={filterChoices[options[0]] ?? options} value={filters[index]} onChange={(value)=>setFilters((current)=>current.map((item,i)=>i===index?value:item))} key={options[0]}/>)}</div>{visible.length?<TableShell count={visible.length}><table><thead><tr><th>日志 ID</th><th>管理员</th><th>操作</th><th>对象</th><th>原因</th><th>IP</th><th>时间</th><th>操作</th></tr></thead><tbody>{visible.map((r)=><tr key={r.id}><td><b>{r.id}</b></td><td>{r.admin}</td><td><StatusBadge value={r.action}/></td><td>{r.target}</td><td className={styles.reasonCell}>{r.reason}</td><td>{r.ip}</td><td>{r.time}</td><td><button className={styles.linkButton} type="button" onClick={()=>setDetail(r.id)}>查看变更</button></td></tr>)}</tbody></table></TableShell>:<DataStateView state="empty" retry={()=>setQuery("")}/>}</>}{mode==="risks"&&(risks.length?<TableShell count={risks.length}><table><thead><tr><th>风险类型</th><th>严重度</th><th>对象</th><th>规则</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>{risks.map((risk)=><tr key={risk.id}><td><b>{risk.riskType}</b></td><td><StatusBadge value={risk.severity}/></td><td>{risk.targetType} · {risk.targetId.slice(0,8)}</td><td>{risk.ruleKey}</td><td><StatusBadge value={risk.status}/></td><td>{new Date(risk.createdAt).toLocaleString("zh-CN")}</td><td>{risk.status!=="RESOLVED"?<button type="button" onClick={()=>resolve(risk)}>结案</button>:"已结案"}</td></tr>)}</tbody></table></TableShell>:<DataStateView state="empty" retry={()=>void loadRisks()}/>)}{mode==="security"&&(security.length?<TableShell count={security.length}><table><thead><tr><th>事件</th><th>主体</th><th>风险分</th><th>状态</th><th>IP</th><th>时间</th></tr></thead><tbody>{security.map((row)=><tr key={row.id}><td><b>{row.eventType}</b></td><td>{row.adminId?`管理员 ${row.adminId.slice(0,8)}`:row.userId?`用户 ${row.userId.slice(0,8)}`:"平台"}</td><td>{row.riskScore}</td><td><StatusBadge value={row.status}/></td><td>{row.ip??"—"}</td><td>{new Date(row.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></TableShell>:<DataStateView state="empty" retry={()=>undefined}/>)}{mode==="access"&&<><TableShell count={admins.length}><table><thead><tr><th>管理员</th><th>角色</th><th>MFA</th><th>状态</th><th>最近登录</th></tr></thead><tbody>{admins.map((admin)=><tr key={admin.id}><td><b>{admin.display_name}</b><small>{admin.username}</small></td><td>{admin.roles.map((role)=>role.name).join("、")||"未分配"}</td><td><StatusBadge value={admin.mfa_required?"ENABLED":"DISABLED"}/></td><td><StatusBadge value={admin.status}/></td><td>{admin.last_login_at?new Date(admin.last_login_at).toLocaleString("zh-CN"):"—"}</td></tr>)}</tbody></table></TableShell><TableShell count={roles.length}><table><thead><tr><th>角色</th><th>说明</th><th>权限数量</th><th>权限键</th></tr></thead><tbody>{roles.map((role)=><tr key={role.id}><td><b>{role.name}</b><small>{role.key}</small></td><td>{role.description??"—"}</td><td>{role.permissions.length}</td><td className={styles.reasonCell}>{role.permissions.join("、")}</td></tr>)}</tbody></table></TableShell></>}</>;
}

function DrawerContent({active,id,playing,setPlaying,openAction,openConversation}:{active:ModuleId;id:string;playing:boolean;setPlaying:(v:boolean)=>void;openAction:(v:NonNullable<ModalState>)=>void;openConversation:()=>void}) {
  if(active==="sellerReview") return <><section className={styles.reviewSubject}><img src="/assets/player-luye.png" alt=""/><div><span>申请版本 V2</span><h3>林鹿鹿</h3><p>无敌战神·经典模式·稳定上分</p></div><StatusBadge value="PENDING_REVIEW"/></section><Facts title="申请资料" values={[["陪玩昵称","林鹿鹿"],["游戏段位","无敌战神·28 星"],["擅长模式","经典模式"],["K/D 自述","6.8"]]}/><section className={styles.voiceCard}><button className={playing?styles.playing:""} type="button" onClick={()=>setPlaying(!playing)}><i/>{playing?"暂停":"播放"}</button><div><b>声音名片·普通话</b><span>{Array.from({length:28},(_,i)=><i style={{height:`${8+(i*7)%22}px`}} key={i}/>)}</span></div><em>00:23</em></section><section className={styles.versionNote}><b>历史审核</b><p>V1 曾因主页介绍包含联系方式被驳回，当前版本已移除。</p></section><ActionPair reject={()=>openAction({title:"驳回陪玩申请",note:"驳回原因将同步给申请人。",action:"确认驳回",target:id,nextStatus:"REJECTED",reasonRequired:true,danger:true})} approve={()=>openAction({title:"通过陪玩申请",note:"通过后将获得陪玩经营权限。",action:"确认通过",target:id,nextStatus:"APPROVED",reasonRequired:true})}/></>;
  if(active==="serviceReview") return <><section className={styles.servicePreview}><img src="/assets/product-hero.png" alt="服务封面"/><div><span>服务预览·{id}</span><h3>经典模式排位上分｜稳定沟通</h3><p>按局计费·可自选单双排·全程平台交易</p><Person image="/assets/player-kirito.png" name="Kirito" sub="最强王者·评分 4.9"/></div></section><section className={styles.detailSection}><h3>服务规格与定价</h3><table className={styles.skuTable}><thead><tr><th>规格</th><th>说明</th><th>价格</th><th>状态</th></tr></thead><tbody>{[["单排一局","约 30–40 分钟","¥ 25.00"],["双排两局","约 60–80 分钟","¥ 45.00"],["进阶三局","含赛后复盘","¥ 65.00"]].map((r)=><tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td><StatusBadge value="ACTIVE"/></td></tr>)}</tbody></table></section><section className={styles.moderationCard}><img src="/assets/icon-shield.png" alt=""/><div><b>内容安全检查完成</b><p>未发现联系方式或站外引导；价格在平台允许范围内。</p></div><StatusBadge value="PASS"/></section><ActionPair reject={()=>openAction({title:"驳回服务审核",note:"驳回原因将发送给陪玩。",action:"确认驳回",target:id,nextStatus:"REVIEW_REJECTED",reasonRequired:true,danger:true})} approve={()=>openAction({title:"通过服务审核",note:"通过后服务将进入在售状态。",action:"通过并上架",target:id,nextStatus:"ON_SALE",reasonRequired:true})}/></>;
  if(active==="orders") return <><section className={styles.orderHero}><div><span>订单号</span><h3>{id}</h3><p>创建于 2026-08-19 10:31:06</p></div><StatusBadge value="IN_SERVICE"/></section><section className={styles.orderParties}><Person image="/assets/player-luye.png" name="熊崽玩家 K" sub="买家·U10086"/><i/><Person image="/assets/player-kirito.png" name="Kirito" sub="陪玩·S10031"/></section><Facts title="交易与支付" values={[["服务","经典排位·单排一局"],["实付金额","¥ 25.00"],["支付状态","已支付"],["平台佣金","¥ 3.75"]]}/><Timeline/><section className={styles.evidenceEntry}><img src="/assets/icon-message.png" alt=""/><div><b>关联会话取证</b><p>查看需要业务理由并写入审计日志。</p></div><button type="button" onClick={openConversation}>去查看</button></section></>;
  if(active==="refunds"||active==="complaints") { const refund=active==="refunds"; return <><section className={styles.caseHero}><span><small>{refund?"可退金额":"风险等级"}</small><b>{refund?"¥ 40.00":"高风险"}</b></span><div><small>案件编号</small><b>{id}</b></div><StatusBadge value={refund?"PLATFORM_REVIEW":"PROCESSING"}/></section><Facts title="关联交易" values={[["订单号","XZ202608190075"],["支付金额","¥ 40.00"],["买家","林下听风"],["陪玩","小悠"]]}/><section className={styles.statements}><article><Person image="/assets/player-luye.png" name="林下听风" sub="申请方·10:04"/><p>陪玩未按约定时间开始，多次询问后仍无法确认。</p></article><article><Person image="/assets/player-xiaoyou.png" name="小悠" sub="被申请方·10:12"/><p>上一笔订单延时，已向买家道歉，同意本次取消。</p></article></section><section className={styles.recommendation}>{refund?"双方均确认未实际开始服务，建议同意全额退款。":"会话中出现站外处理暗示，建议取证后给予警告。"}</section><ActionPair reject={()=>openAction({title:refund?"拒绝退款":"关闭投诉",note:"处理意见将同步给双方。",action:refund?"确认拒绝":"确认关闭",target:id,nextStatus:refund?"REJECTED":"CLOSED",reasonRequired:true,danger:true})} approve={()=>openAction({title:refund?"同意全额退款":"完成投诉处理",note:refund?"将向支付渠道发起退款，不伪造成功。":"处理结果将同步给双方。",action:refund?"发起退款":"提交结果",target:id,nextStatus:refund?"PROCESSING":"COMPLETED",reasonRequired:true})}/></>; }
  if(active==="logs") return <><Facts title="请求信息" values={[["日志 ID",id],["管理员","Alex·超级管理员"],["请求 ID","REQ-8F22A6"],["网络地址 / 浏览器","10.24.8.08·Chrome 浏览器（macOS）"]]}/><section className={styles.diffCard}><h3>变更前后</h3><div><pre>{`变更前数据\n{ "状态": "待审核" }`}</pre><pre>{`变更后数据\n{ "状态": "已通过" }`}</pre></div></section></>;
  return <><section className={styles.profileHero}><img src="/assets/player-kirito.png" alt=""/><div><span>平台业务记录</span><h3>{id}</h3><p>数据来源于服务端事实快照</p></div><StatusBadge value="NORMAL"/></section><Facts title="基础资料" values={[["创建时间","2026-08-18 20:14"],["最近更新","2026-08-19 10:36"],["风险等级","低风险"],["版本","V3"]]}/><Timeline/><ActionPair reject={()=>openAction({title:"执行风险限制",note:"当前对象的能力将受限，需要填写原因。",action:"确认限制",target:id,nextStatus:"SUSPENDED",reasonRequired:true,danger:true})} approve={()=>openAction({title:"确认当前记录",note:"本次操作将记录至审计日志。",action:"确认",target:id})}/></>;
}

function Facts({title,values}:{title:string;values:string[][]}) { return <section className={styles.detailSection}><h3>{title}</h3><div className={styles.factGrid}>{values.map((v)=><span key={v[0]}><small>{v[0]}</small><b>{v[1]}</b></span>)}</div></section> }
function Timeline(){return <section className={styles.timeline}><h3>状态日志</h3>{[["服务进行中","10:36:22·陪玩开始服务"],["陪玩已接单","10:33:09·Kirito"],["支付成功","10:31:18·微信支付回调"],["订单已创建","10:31:06·买家"]].map((v,i)=><div key={v[0]}><i className={i===0?styles.activeDot:""}/><span><b>{v[0]}</b><small>{v[1]}</small></span></div>)}</section>}
function ActionPair({reject,approve}:{reject:()=>void;approve:()=>void}) { return <div className={styles.stickyActions}><button type="button" onClick={reject}>驳回 / 限制</button><button type="button" onClick={approve}>通过 / 确认</button></div> }
