"use client";
import { AfterSaleSpecialIntake } from "./after-sale-special-intake";
import { useCallback, useEffect, useRef, useState } from "react";
import { afterSaleCaseStates } from "../../packages/contracts/src/after-sale-cases";
import { adminApiRequest, adminFailure } from "./admin-api";
import { adminCaseActions, caseActionLabels, caseLabel, caseMoney, caseWrite, type CaseDetail, type CaseHistory, type CaseSummary } from "./after-sale-case-data";
import type { CommunityConfirm } from "./community-management";
import styles from "./admin.module.css";
import ui from "./community.module.css";

type Props = { permissions: Set<string>; setModal: (modal: CommunityConfirm | null) => void; runAction: (request: () => Promise<unknown>, options: { success: string; reload: () => Promise<void> }) => Promise<void>; setDetail: (detail: { title: string; eyebrow: string; path: string }) => void };
const date = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "无当前阶段截止时间";
const kind = (value: string) => ({ NORMAL: "普通售后", REMEDY: "补充履约", SPECIAL: "特殊受理" }[value] ?? "未识别案件类型");
const decisionFields = [ ["facts", "已核验事实"], ["rule_basis", "适用规则"], ["liability", "责任认定"], ["remaining_obligations", "剩余义务与终止范围"], ["execution_conditions", "执行条件"] ] as const;
type Failure = ReturnType<typeof adminFailure> | null;
function FailureView({ failure, retry }: { failure: Failure; retry: () => void }) {
  return failure ? <div role="alert" className={styles.loginError}><p>{failure.message}</p>{failure.requestId ? <small>请求编号：{failure.requestId}</small> : null}<button type="button" onClick={retry}>重新读取</button></div> : null;
}
export function AfterSaleCaseManagement({ permissions, setModal, runAction, setDetail }: Props) {
  const canRead = permissions.has("refund.read");
  const [shareEvidence,setShareEvidence]=useState<string[]>([]),[obscured,setObscured]=useState(false);
  const [filter, setFilter] = useState(""), [rows, setRows] = useState<CaseSummary[]>([]), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(true), [failure, setFailure] = useState<Failure>(null);
  const [selected, setSelected] = useState<CaseDetail | null>(null), [detailLoading, setDetailLoading] = useState(false), [detailFailure, setDetailFailure] = useState<Failure>(null);
  const [history, setHistory] = useState<CaseHistory[]>([]), [historyCursor, setHistoryCursor] = useState<number | null>(null), [historyLoading, setHistoryLoading] = useState(false), [historyFailure, setHistoryFailure] = useState<Failure>(null);
  const [outcome, setOutcome] = useState(""), [amount, setAmount] = useState(""), [fields, setFields] = useState<Record<string, string>>({}), [evidence, setEvidence] = useState<string[]>([]), [extension, setExtension] = useState("");
  const listRequest = useRef<AbortController | null>(null), detailRequest = useRef<AbortController | null>(null), historyRequest = useRef<AbortController | null>(null), selectedId = useRef<string | null>(null);
  const loadList = useCallback(async (after?: string) => {
    listRequest.current?.abort(); if (!canRead) return;
    const c = new AbortController(); listRequest.current = c; setLoading(true); setFailure(null);
    if (!after) { setRows([]); setCursor(null); }
    try {
      const page = await adminApiRequest<{ items: CaseSummary[]; next_after_id: string | null }>(`/after-sale/cases?limit=20${filter ? `&state=${encodeURIComponent(filter)}` : ""}${after ? `&after_id=${encodeURIComponent(after)}` : ""}`, { signal: c.signal });
      if (!c.signal.aborted) { setRows(current => after ? [...current, ...page.items.filter(row => !current.some(old => old.id === row.id))] : page.items); setCursor(page.next_after_id); }
    } catch (cause) { if (!c.signal.aborted) setFailure(adminFailure(cause)); }
    finally { if (!c.signal.aborted) setLoading(false); }
  }, [canRead, filter]);
  const loadHistory = useCallback(async (id: string, after = -1) => {
    historyRequest.current?.abort(); const c = new AbortController(); historyRequest.current = c; setHistoryLoading(true); setHistoryFailure(null);
    if (after === -1) { setHistory([]); setHistoryCursor(null); }
    try {
      const page = await adminApiRequest<{ items: CaseHistory[]; next_after_version: number | null }>(`/after-sale/cases/${id}/history?after_version=${after}`, { signal: c.signal });
      if (!c.signal.aborted && selectedId.current === id) { setHistory(current => after === -1 ? page.items : [...current, ...page.items.filter(row => !current.some(old => old.version === row.version))]); setHistoryCursor(page.next_after_version); }
    } catch (cause) { if (!c.signal.aborted) setHistoryFailure(adminFailure(cause)); }
    finally { if (!c.signal.aborted) setHistoryLoading(false); }
  }, []);
  const open = useCallback(async (id: string) => {
    if (!canRead) return;
    selectedId.current = id; detailRequest.current?.abort(); historyRequest.current?.abort();
    const c = new AbortController(); detailRequest.current = c; setDetailLoading(true); setSelected(null); setDetailFailure(null); setHistory([]); setHistoryFailure(null); setHistoryCursor(null);
    setShareEvidence([]); setObscured(false);
    setOutcome(""); setAmount(""); setFields({}); setEvidence([]); setExtension("");
    try {
      const row = await adminApiRequest<CaseDetail>(`/after-sale/cases/${id}`, { signal: c.signal });
      if (!c.signal.aborted && selectedId.current === id) { setSelected(row); await loadHistory(id); }
    } catch (cause) { if (!c.signal.aborted) setDetailFailure(adminFailure(cause)); }
    finally { if (!c.signal.aborted) setDetailLoading(false); }
  }, [canRead, loadHistory]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 0);
    const refresh = () => { if (document.visibilityState === "visible") void loadList(); };
    window.addEventListener("admin-data-refresh", refresh);
    return () => { clearTimeout(timer); listRequest.current?.abort(); window.removeEventListener("admin-data-refresh", refresh); };
  }, [loadList]);
  useEffect(() => () => { detailRequest.current?.abort(); historyRequest.current?.abort(); }, []);
  function act(action: string) {
    if (!selected || !adminCaseActions(selected, permissions).includes(action)) return;
    if (action === "DECIDE" && !decisionValid) return;
    if (action === "EXTEND_MATERIALS" && !extensionValid) return;
    if (action === "MARK_EVIDENCE_SHAREABLE" && (!obscured || !shareEvidence.length)) return;
    const row = selected;
    const payload = { action, ...(action === "MARK_EVIDENCE_SHAREABLE" ? {file_ids:shareEvidence,sensitive_information_obscured:true}:{}), ...(action === "EXTEND_MATERIALS" ? { seconds: Number(extension) } : {}), ...(action === "DECIDE" ? { decision: { outcome, amount_cent: amount, ...fields, evidence_file_ids: evidence } } : {}) };
    const write = caseWrite(row, payload);
    setModal({ title: caseActionLabels[action] ?? "确认案件操作", note: `案件 ${row.id} · 案件版本 ${row.version}。仅向服务端提交本次操作，不代表退款到账；版本变化后须重新核对。${action === "DECIDE" ? ` 裁决：${outcome === "REFUND" ? "支持退款" : "不支持退款"}，${caseMoney(amount)}。` : ""}`, action: "确认提交案件操作", reasonRequired: true, danger: ["DECIDE", "CLOSE_SPECIAL", "RETRY_REFUND"].includes(action), onConfirm: reason => runAction(() => write(reason), { success: "案件操作已由服务端确认，当前记录已刷新", reload: async () => { await loadList(); await open(row.id); } }) });
  }
  const actions = selected ? adminCaseActions(selected, permissions) : [];
  const extensionValid = /^\d{1,5}$/u.test(extension) && Number(extension) >= 1 && Number(extension) <= 86400;
  const amountValid = /^\d{1,19}$/u.test(amount) && (outcome === "NO_REFUND" ? BigInt(amount) === 0n : outcome === "REFUND" && BigInt(amount) > 0n && BigInt(amount) <= BigInt(selected?.requested_amount_cent ?? "0"));
  const requiresSupervisor = selected && (selected.review_level === 2 || (amountValid && BigInt(amount) > 10000n));
  const decisionValid = amountValid && decisionFields.every(([key]) => (fields[key]?.trim().length ?? 0) >= 2 && (fields[key]?.trim().length ?? 0) <= 1000) && (!requiresSupervisor || permissions.has("refund.review.supervisor"));
  if (!canRead) return <p>没有售后案件读取权限。</p>;
  return <section className={ui.module}><header className={styles.moduleHeader}><div><h1>售后案件</h1><p>新规则案件与旧退款记录分开处理；状态、操作和阶段期限均来自服务端。支付、退款保持本地 Mock。</p></div></header>
    {permissions.has("refund.manage") && <AfterSaleSpecialIntake onCreated={async row=>{await loadList();await open(row.id);}} />}
    <div className={styles.toolbar}><label>案件状态<select aria-label="案件状态" value={filter} onChange={event => { setFilter(event.target.value); selectedId.current = null; detailRequest.current?.abort(); historyRequest.current?.abort(); setSelected(null); setDetailLoading(false); setDetailFailure(null); }}><option value="">全部案件状态</option>{afterSaleCaseStates.map(state => <option key={state} value={state}>{caseLabel(state)}</option>)}</select></label><button type="button" disabled={loading} onClick={() => void loadList()}>刷新案件</button></div>
    <FailureView failure={failure} retry={() => void loadList(cursor && rows.length ? rows.at(-1)?.id : undefined)} />
    <div className={ui.columns}><section className={ui.panel}><div className={ui.tableScroll}><table className={ui.caseTable}><thead><tr><th>案件／订单编号</th><th>状态与类型</th><th>阶段截止</th><th>操作</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.id}<small>订单：{row.order_id} · 案件版本 {row.version}</small></td><td>{caseLabel(row.state)}<small>{kind(row.case_type)}</small></td><td>{date(row.deadline_at)}</td><td><button type="button" onClick={() => void open(row.id)}>查看案件</button></td></tr>)}</tbody></table></div>{loading ? <p role="status">正在读取真实案件…</p> : !failure && !rows.length ? <p>暂无符合条件的售后案件</p> : null}{cursor ? <button type="button" disabled={loading} onClick={() => void loadList(cursor)}>加载更多案件</button> : null}</section>
      <aside className={ui.panel} aria-label="售后案件详情">{detailLoading ? <p role="status">正在读取案件详情…</p> : null}<FailureView failure={detailFailure} retry={() => { if (selectedId.current) void open(selectedId.current); }} />{selected ? <><h2>案件详情</h2><p>{caseLabel(selected.state)} · {kind(selected.case_type)}</p><small>案件编号：{selected.id} · 案件版本 {selected.version}</small><p>申请金额：{caseMoney(selected.requested_amount_cent)}</p><p>当前阶段截止：{date(selected.deadline_at)}</p><p>售后暂停起点：{date(selected.paused_at)}</p><p>原履约截止：{selected.original_fulfillment_due_at ? date(selected.original_fulfillment_due_at) : "不适用"}</p><p>已修改 {selected.modifications} 次 · 协商 {selected.negotiation_rounds} 轮 · 复核层级 {selected.review_level}</p>{selected.review_phase ? <p>当前阶段：{selected.review_phase === "MATERIALS" ? "补证" : "审核"}</p> : null}
        {selected.funding ? <section><h3>专项保全（不足时整笔等待）</h3><p>目标：{caseMoney(selected.funding.target_cent)}</p><p>已保全商家收益：{caseMoney(selected.funding.held_cent)}</p><p>平台暂留佣金：{caseMoney(selected.funding.commission_reserved_cent)}</p><p>资金缺口：{caseMoney(selected.funding.funding_gap_cent)}</p><small>不自动垫付，不挪用提现锁定资金，不以待执行状态代替渠道成功。</small></section> : null}
        {selected.decision ? <section><h3>当前裁决（不等于已执行）</h3><small>裁决编号：{selected.decision.id}</small><p>{selected.decision.outcome === "REFUND" ? "支持退款" : "不支持退款"} · {caseMoney(selected.decision.amount_cent)}</p>{decisionFields.map(([key, label]) => <p className={ui.copy} key={key}>{label}：{selected.decision![key]}</p>)}<p className={ui.copy}>理由：{selected.decision.reason}</p><p>申诉截止：{date(selected.decision.appeal_deadline_at)}</p></section> : null}
        {actions.includes("MARK_EVIDENCE_SHAREABLE") && <section><h3>独立人工隐私确认</h3><p>必须实际检查敏感信息已遮挡；文件审核通过不等于可向交易对方公开。</p>{selected.evidence_file_ids.filter(id=>!selected.counterparty_visible_evidence_ids?.includes(id)).map(id=><label key={id}><input type="checkbox" checked={shareEvidence.includes(id)} onChange={event=>setShareEvidence(old=>event.target.checked?[...old,id]:old.filter(value=>value!==id))} />{id}</label>)}<label><input type="checkbox" checked={obscured} onChange={event=>setObscured(event.target.checked)} />已逐份核验所选材料的敏感信息均已遮挡</label></section>}
        <section><h3>保全证据与履约材料</h3><small>文件审核通过不等于敏感信息已遮挡，也不代表已向对方开放。</small>{[...new Set([...selected.evidence_file_ids, ...(selected.remedy_evidence_file_ids ?? [])])].map(id => <p key={id}>{id}{permissions.has("file.read") ? <button type="button" onClick={() => setDetail({ title: "案件关联文件", eyebrow: "真实文件元数据与审核记录", path: `/files/${id}/access` })}>查看文件记录</button> : null}</p>)}</section>
        {actions.includes("DECIDE") ? <fieldset><legend>填写裁决草案（不会自动提交）</legend><label>裁决结果<select aria-label="裁决结果" value={outcome} onChange={event => setOutcome(event.target.value)}><option value="">请选择结论</option><option value="REFUND">支持退款</option><option value="NO_REFUND">不支持退款</option></select></label><label>裁决金额（整数分）<input aria-label="裁决金额（整数分）" inputMode="numeric" value={amount} maxLength={19} onChange={event => setAmount(event.target.value)} /><small>不支持退款须明确填 0；不能超出当前申请金额。</small></label>{decisionFields.map(([key, label]) => <label key={key}>{label}<textarea aria-label={label} value={fields[key] ?? ""} maxLength={1000} onChange={event => setFields(current => ({ ...current, [key]: event.target.value }))} /></label>)}<fieldset><legend>引用本案证据（可不选）</legend>{[...new Set([...selected.evidence_file_ids, ...(selected.remedy_evidence_file_ids ?? [])])].map(id => <label key={id}><input type="checkbox" checked={evidence.includes(id)} onChange={event => setEvidence(current => event.target.checked ? [...current, id] : current.filter(value => value !== id))} />{id}</label>)}</fieldset>{requiresSupervisor && !permissions.has("refund.review.supervisor") ? <p role="status">二级复核或超过 100 元的退款裁决需要主管权限，当前账号不能提交。</p> : null}<small>复核人与初判人分离等条件仍由服务端最终校验；操作理由在二次确认时填写。</small></fieldset> : null}
        {actions.includes("EXTEND_MATERIALS") ? <label>补证延长时长（秒）<input aria-label="补证延长时长（秒）" inputMode="numeric" value={extension} onChange={event => setExtension(event.target.value)} /><small>1–86400 秒，每级是否可延期以服务端为准。</small></label> : null}
        <div className={ui.actions}>{actions.map(action => <button key={action} type="button" disabled={(action === "MARK_EVIDENCE_SHAREABLE" && (!obscured || !shareEvidence.length)) || (action === "DECIDE" && !decisionValid) || (action === "EXTEND_MATERIALS" && !extensionValid)} onClick={() => act(action)}>{caseActionLabels[action]}</button>)}{permissions.has("order.read") ? <button type="button" onClick={() => setDetail({ title: "案件关联订单", eyebrow: "真实订单快照", path: `/orders/${selected.order_id}` })}>查看关联订单</button> : null}<button type="button" onClick={() => void open(selected.id)}>刷新案件详情</button></div>
        <section><h3>服务端案件历史</h3><FailureView failure={historyFailure} retry={() => void loadHistory(selected.id, history.length ? history.at(-1)!.version : -1)} />{history.map(row => <p key={row.version}>{caseActionLabels[row.action] ?? "其他案件变更"} · 版本 {row.version} · {date(row.created_at)}<small>{row.data.from ? `${caseLabel(row.data.from)} → ` : ""}{row.data.to ? caseLabel(row.data.to) : ""}{row.data.reason ? ` · 原因：${row.data.reason}` : ""}</small></p>)}{historyLoading ? <p role="status">正在读取案件历史…</p> : !historyFailure && !history.length ? <p>暂无案件历史</p> : null}{historyCursor !== null ? <button type="button" disabled={historyLoading} onClick={() => void loadHistory(selected.id, historyCursor)}>加载更多案件历史</button> : null}</section>
      </> : !detailLoading && !detailFailure ? <p>选择案件查看真实详情、阶段期限及可用操作。</p> : null}</aside></div>
  </section>;
}
