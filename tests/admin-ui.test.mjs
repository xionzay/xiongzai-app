import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function renderAdmin() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("admin-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/admin", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the independent admin login route", async () => {
  const response = await renderAdmin();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /熊崽电竞/);
  assert.match(html, /受保护的管理端/);
  assert.match(html, /欢迎回来/);
  assert.match(html, /管理后台 · 熊崽电竞/);
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /placeholder="请输入管理员账号"/);
  assert.match(page, /placeholder="请输入登录密码"/);
  assert.doesNotMatch(page, /alex\.admin|xiongzai2026/);
});

test("contains the complete admin module set including customer support", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const modules = [
    "数据总览", "用户管理", "陪玩审核", "陪玩管理", "服务审核", "服务管理", "订单管理",
    "退款管理", "投诉管理", "客服中心", "评价管理", "财务数据", "提现管理", "平台配置", "操作日志",
  ];
  for (const moduleName of modules) assert.match(page, new RegExp(moduleName), `missing admin module ${moduleName}`);
});

test("includes protected governance flows and reusable data states", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /动态码来自已绑定的验证器/);
  assert.match(page, /\/auth\/login/);
  assert.match(page, /\/auth\/mfa\/verify/);
  assert.match(page, /\/auth\/logout/);
  assert.match(page, /会话取证/);
  assert.match(page, /查看行为将写入不可删除的审计日志/);
  assert.match(page, /reasonRequired:true/);
  assert.match(page, /loading.*empty.*error.*offline/);
  assert.match(page, /currency: "CNY"/);
  assert.match(page, /function AvatarImage/);
  assert.match(page, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(page, /aria-current=\{page === value \? "page"/);
  assert.match(page, /onFilterChange/);
  assert.match(page, /const \[riskOnly,setRiskOnly\]/);
  assert.match(page, /\/governance\/configs/);
  assert.match(css, /@media\(max-width:1280px\)/);
  assert.match(css, /\.modalBackdrop/);
  assert.match(css, /\.detailDrawer/);
  assert.match(css, /\/assets\/admin-icons\/icon-shield\.png/);
  assert.match(css, /\/assets\/admin-icons\/icon-service\.png/);
  assert.match(css, /\/assets\/admin-icons\/icon-wallet\.png/);
  await Promise.all([
    "home", "mine", "shield", "service", "order", "wallet", "favorite", "withdraw", "setting", "message",
  ].map((name) => access(new URL(`../public/assets/admin-icons/icon-${name}.png`, import.meta.url))));
});

test("dashboard ranges, global search, and visible admin labels are localized", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function GlobalSearchBox/);
  assert.match(page, /aria-label="全局搜索"/);
  assert.match(page, /搜索订单、用户、陪玩、服务或客服会话/);
  assert.match(page, /¥ 28,640\.00/);
  assert.match(page, /¥ 182,960\.00/);
  assert.match(page, /¥ 786,420\.00/);
  assert.match(page, /¥ 96,780\.00/);
  assert.match(page, /CartoonDatePicker label="开始日期"/);
  assert.match(page, /已按所选日期重新计算演示数据/);
  assert.match(page, /双重验证已开启/);
  assert.match(page, /近 30 日成交额/);
  assert.doesNotMatch(page, /RECORD DETAIL|MFA 已开启/);
  assert.match(css, /\.globalResults/);
  assert.match(css, /\.customRange/);
});

test("includes a clickable customer support workbench with audited handling flows", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function SupportModule/);
  assert.match(page, /const supportSessions/);
  assert.match(page, /接入会话/);
  assert.match(page, /转交客服会话/);
  assert.match(page, /结束客服会话/);
  assert.match(page, /回复已发送，并加入不可变会话记录/);
  assert.match(page, /\/support-cases\/\$\{item\.id\}\/receive/);
  assert.match(page, /\/support-cases\/\$\{item\.id\}\/reply/);
  assert.match(page, /\/support-cases\/\$\{item\.id\}\/transfer/);
  assert.match(page, /\/support-cases\/\$\{item\.id\}\/close/);
  assert.match(page, /关联业务/);
  assert.match(page, /平台内实时会话 · 全程留痕/);
  assert.match(page, /reasonRequired:true/);
  assert.match(css, /\.supportWorkspace/);
  assert.match(css, /\.supportQueue/);
  assert.match(css, /\.supportComposer/);
  assert.match(css, /\.supportContext/);
});

test("connects refund, complaint and review governance to audited admin APIs", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function CasesModule/);
  assert.match(page, /function ReviewsModule/);
  assert.match(page, /\/refunds\?limit=100/);
  assert.match(page, /\/refunds\/\$\{row\.id\}\/decision/);
  assert.match(page, /approved_amount_cent/);
  assert.match(page, /\/complaints\/\$\{row\.id\}\/actions/);
  assert.match(page, /\/reviews\/\$\{row\.id\}\/moderation/);
  assert.match(page, /评分聚合随状态实时重算/);
});

test("connects double-entry ledger, withdrawals and reconciliation to finance admin APIs", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function FinanceModule/);
  assert.match(page, /function WithdrawalsModule/);
  assert.match(page, /\/finance\/ledger-transactions/);
  assert.match(page, /\/finance\/reconciliation-runs/);
  assert.match(page, /\/finance\/reconciliation-items\/\$\{item\.id\}\/resolve/);
  assert.match(page, /\/withdrawals\/\$\{row\.id\}\/approve/);
  assert.match(page, /差错只通过反向交易修正/);
});

test("connects core administration, search, configuration and audit pages to protected APIs", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  for (const endpoint of [
    "/auth/session", "/users?", "/orders?", "/catalog/sellers", "/catalog/products",
    "/conversations?limit=100", "/evidence-view", "/governance/search", "/governance/configs", "/governance/operation-logs",
  ]) assert.ok(page.includes(endpoint), `missing protected API ${endpoint}`);
  assert.match(page, /current_status:row\.status/);
  assert.match(page, /version:row\.version/);
  assert.match(page, /reasonRequired:true/);
  assert.match(page, /setState\("loading"\)/);
  assert.match(page, /setState\("error"\)/);
  assert.doesNotMatch(page, /code !== "202608"/);
});

test("uses one reusable dropdown filter system and cartoon date calendar", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function FilterSelect/);
  assert.match(page, /aria-haspopup="listbox"/);
  assert.match(page, /document\.addEventListener\("pointerdown", close\)/);
  assert.match(page, /买家 \/ 陪玩/);
  assert.match(page, /近 30 天/);
  assert.match(page, /function CartoonDatePicker/);
  assert.match(page, /aria-label=\{`\$\{label\}日历`\}/);
  assert.doesNotMatch(page, /<kbd>⌘ K<\/kbd>/);
  assert.doesNotMatch(page, /const nextIndex/);
  assert.match(css, /\.filteridentity \{ width:128px/);
  assert.match(css, /\.filterstatus \{ width:128px/);
  assert.match(css, /\.filtertime \{ width:138px/);
  assert.match(css, /\.filterMenu \{[^}]*z-index:120/);
  assert.match(css, /\.cartoonCalendar/);
  assert.match(css, /\.searchField input:focus-visible/);
});
