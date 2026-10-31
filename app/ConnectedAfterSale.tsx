'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { allowedUserActions, caseError, casePayload, caseStates, caseSubmission, centDisplay, userCaseActions, type CaseDetail, type CaseForm, type CaseHistory, type CaseHistoryPage, type CasePage, type CaseSummary, type UserCaseAction } from '../packages/contracts/src/after-sale-client';
import { ConnectedFiles, OrderEvidence } from './ConnectedFiles';
import { evidenceError, type BusinessFile, type Request } from './connected-commerce';

const date = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '无当前截止时间';
export function ConnectedCaseList({ request, onOpen }: { request: Request; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<CaseSummary[]>([]), [cursor, setCursor] = useState<string | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (after?: string) => {
    controller.current?.abort(); const c = new AbortController(); controller.current = c; setBusy(true);
    try { const page = await request<CasePage>(`/after-sale/cases?limit=20${after ? `&after_id=${encodeURIComponent(after)}` : ''}`, { signal: c.signal }); if (!c.signal.aborted) { setRows(old => after ? [...old, ...page.items.filter(row => !old.some(item => item.id === row.id))] : page.items); setCursor(page.next_after_id); setNotice(''); } }
    catch { if (!c.signal.aborted) setNotice('案件列表读取失败，请重试。'); }
    finally { if (!c.signal.aborted) setBusy(false); }
  }, [request]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void load(); }); return () => { active = false; controller.current?.abort(); }; }, [load]);
  return <section className="paper-panel"><h2>我的售后案件</h2><button type="button" disabled={busy} onClick={() => void load()}>刷新案件列表</button>{rows.map(row => <button type="button" key={row.id} onClick={() => onOpen(row.id)}>{caseStates[row.state] ?? '未知状态'} · {row.id.slice(-8)} · {date(row.deadline_at)}</button>)}{cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>加载更多案件</button>}<p role="status">{notice || (busy ? '正在读取…' : !rows.length ? '暂无案件' : '')}</p></section>;
}

export function ConnectedAfterSale({ request, caseId, paidCent, onUpdated, onSupport }: { request: Request; caseId: string; paidCent?: string; onUpdated?: () => void; onSupport: () => void }) {
  const [row, setRow] = useState<CaseDetail | null>(null), [history, setHistory] = useState<CaseHistory[]>([]), [cursor, setCursor] = useState<number | null>(null);
  const [action, setAction] = useState<UserCaseAction | null>(null), [form, setForm] = useState<CaseForm>({}), [files, setFiles] = useState<BusinessFile[]>([]), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ version: number; offer?: string; decision?: string; attempted: boolean } | null>(null);
  const [order, setOrder] = useState<{id:string;paid_amount_cent:string;fulfillment_evidence?:{file_id:string;kind:'IMAGE'|'VIDEO'}[]} | null>(null);
  const write = useRef<ReturnType<typeof caseSubmission> | null>(null), lock = useRef(false), generation = useRef(0);
  const loadHistory = useCallback(async (after = -1) => {
    const current = generation.current;
    const page = await request<CaseHistoryPage>(`/after-sale/cases/${caseId}/history?after_version=${after}`);
    if (current === generation.current) { setHistory(old => after < 0 ? page.items : [...old, ...page.items.filter(item => !old.some(existing => existing.version === item.version))]); setCursor(page.next_after_version); }
  }, [request, caseId]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try { const value = await request<CaseDetail>(`/after-sale/cases/${caseId}`); if (current === generation.current) { setRow(value); await loadHistory(); const facts=await request<NonNullable<typeof order>>(`/orders/${value.order_id}`); if(current===generation.current&&facts.id===value.order_id)setOrder(facts); } }
    catch { if (current === generation.current) setNotice('案件或历史读取失败，请重新读取。'); }
  }, [request, caseId, loadHistory]);
  useEffect(() => { let active = true; const revision = generation; void Promise.resolve().then(() => { if (active) void load(); }); return () => { active = false; revision.current++; }; }, [load]);
  const choose = (next: UserCaseAction) => { if (write.current || lock.current) return; setAction(next); setForm({}); setFiles([]); setNotice(''); };
  const prepare = () => {
    if (!row || !action || write.current) return;
    try {
      if (action === 'SUBMIT_REMEDY') { const amount=order?.paid_amount_cent??paidCent; if (!amount) throw new Error('实付金额未读取，不能校验补充履约凭证。'); const error = evidenceError(files, amount); if (error) throw new Error(error); }
      const payload = casePayload(row, action, { ...form, fileIds: files.map(file => file.id) });
      write.current = caseSubmission(request, row, payload, crypto.randomUUID()); setPrepared({ version: row.version, offer: row.offer?.id, decision: row.decision?.id, attempted: false }); setNotice('请核对本次操作及案件/方案/裁决版本，再确认提交。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '请核对输入。'); }
  };
  const submit = async () => {
    if (!write.current || lock.current) return; lock.current = true; setBusy(true); setPrepared(old => old ? {...old, attempted: true} : null);
    try { const result = await write.current(); setRow(result.current_case); write.current = null; setPrepared(null); setAction(null); setForm({}); setFiles([]); setNotice('操作已由服务端确认；资金结果以当前案件及退款记录为准。'); try { await loadHistory(); onUpdated?.(); } catch { setNotice('操作已成功，后续视图刷新失败；请重新读取，不要再次提交。'); } }
    catch (error) {
      if (error && typeof error === 'object' && (('status' in error && error.status === 409) || ('code' in error && error.code === 'RESOURCE_VERSION_CONFLICT'))) { write.current = null; setPrepared(null); setAction(null); await load(); }
      setNotice(caseError(error));
    } finally { lock.current = false; setBusy(false); }
  };
  const field = (key: keyof CaseForm, label: string, numeric = false) => <label key={key}>{label}<input disabled={busy || !!prepared} value={String(form[key] ?? '')} inputMode={numeric ? 'numeric' : 'text'} maxLength={1000} onChange={e => setForm(old => ({ ...old, [key]: e.target.value }))} /></label>;
  const needsFiles = action && ['REJECT', 'ADD_EVIDENCE', 'APPEAL', 'SUBMIT_REMEDY', 'APPEND_REMEDY'].includes(action);
  const remedy = action === 'SUBMIT_REMEDY' || action === 'APPEND_REMEDY';
  return <section className="paper-panel connected-after-sale" aria-label="售后案件"><h2>售后案件</h2><button type="button" disabled={busy} onClick={() => void load()}>重新读取案件</button><button type="button" onClick={onSupport}>联系平台客服</button><p role="status">{notice}</p>{row ? <>
    <h3>{caseStates[row.state] ?? '未知状态，请联系客服'}</h3><p>案件版本 {row.version} · {row.case_type === 'SPECIAL' ? '特殊受理' : row.case_type === 'REMEDY' ? '同案补充履约' : '普通售后'} · 申请 ¥{centDisplay(row.requested_amount_cent)}</p><p>本阶段截止：{date(row.deadline_at)}</p><p>已修改 {row.modifications}/2 次 · 介入前协商 {row.negotiation_rounds}/2 轮。刷新不会重置额度；每单延期机会共用。</p>
    <p>申请、同意及裁决不等于退款到账。资金不足时整笔待执行，足额后才发原渠道退款，不拆分、不自动垫付。</p>
    {row.funding && <dl>{([['held_cent','专项保全'],['commission_reserved_cent','平台留存佣金'],['funding_gap_cent','待补资金缺口']] as const).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>¥{centDisplay(row.funding![key])}</dd></div>)}</dl>}
    {row.offer && <section><h3>当前方案（须明确回应）</h3><p>方案编号 {row.offer.id} · 到期 {date(row.offer.expires_at)}</p>{row.offer.kind === 'REFUND' ? <><p>退款 ¥{centDisplay(row.offer.amount_cent ?? '')} · 保留成交 ¥{centDisplay(row.offer.retained_amount_cent ?? '')}</p><p>已认可交付/成本：{row.offer.recognized_delivery}</p><p>剩余未交付义务终止：{row.offer.remaining_obligations_terminated ? '是' : '未确认'}</p></> : <><p>{row.offer.content} · 数量 {row.offer.quantity}</p><p>验收标准：{row.offer.standard} · 期限 {row.offer.fulfillment_seconds} 秒</p></>}<p>沉默不是接受；补充履约继续原案件和冻结。</p></section>}
    {row.decision && <section><h3>当前裁决</h3><p>裁决编号 {row.decision.id} · 第 {row.decision.level} 级 · 申诉截止 {date(row.decision.appeal_deadline_at)}</p><p>{row.decision.outcome === 'REFUND' ? '支持退款' : '不支持退款'} · ¥{centDisplay(row.decision.amount_cent)}</p>{(['facts','rule_basis','liability','reason','remaining_obligations','execution_conditions'] as const).map((key,i) => <p key={key}>{['事实','规则依据','责任','理由','剩余义务','执行条件'][i]}：{row.decision![key]}</p>)}<p>已记录 {row.accepted_by?.length ?? 0} 方接受。单方接受不能提前执行；有效申诉使旧裁决停止执行。</p></section>}
    <CaseEvidence request={request} caseId={row.id} ids={row.evidence_file_ids} />
    {!!row.remedy_evidence_file_ids?.length && order?.id===row.order_id && <section><h3>本案补充履约凭证（单独验收，不解除冻结）</h3><OrderEvidence request={request} orderId={row.order_id} files={(order.fulfillment_evidence??[]).filter(file=>row.remedy_evidence_file_ids?.includes(file.file_id))} /></section>}
    <div className="after-sale-actions">{allowedUserActions(row).map(key => <button type="button" key={key} disabled={busy || !!prepared} onClick={() => choose(key)}>{userCaseActions[key]}</button>)}</div>
    {action && <section className="form-panel"><h3>{userCaseActions[action]}</h3><p>针对案件版本 {prepared?.version ?? row.version} / 方案 {prepared ? prepared.offer ?? '无' : row.offer?.id ?? '无'} / 裁决 {prepared ? prepared.decision ?? '无' : row.decision?.id ?? '无'}</p>
      {['MODIFY','WITHDRAW','APPROVE','REJECT','ESCALATE','APPEAL'].includes(action) && field('reason','操作说明')}
      {action === 'MODIFY' && <>{field('amount','申请退款金额（整数分）',true)}<p>售后原因复用本地 SERVICE_ISSUE；D06 为临时测试配置，正式启用前确认。</p></>}
      {action === 'OFFER' && <><label>方案类型<select disabled={busy || !!prepared} value={form.kind ?? 'REFUND'} onChange={e => setForm(old => ({ ...old, kind: e.target.value as 'REFUND' | 'REMEDY' }))}><option value="REFUND">退款并终止剩余义务</option><option value="REMEDY">同案补充履约</option></select></label>{form.kind === 'REMEDY' ? <>{field('content','补充履约内容')}{field('quantity','数量')}{field('standard','验收标准')}{field('seconds','接受后期限（秒，最多604800）',true)}</> : <>{field('amount','退款金额（整数分）',true)}{field('retained','保留成交金额（整数分）',true)}{field('delivery','已认可交付及实际成本')}<label><input type="checkbox" disabled={busy || !!prepared} checked={!!form.terminated} onChange={e => setForm(old => ({...old,terminated:e.target.checked}))} />明确确认剩余未交付义务终止；需要继续交付请改选补充履约</label></>}</>}
      {action === 'RESPOND' && <label>明确回应<select disabled={busy || !!prepared} value={form.accept === undefined ? '' : String(form.accept)} onChange={e => setForm(old => ({ ...old, accept: e.target.value === '' ? undefined : e.target.value === 'true' }))}><option value="">请选择，不默认接受</option><option value="true">接受当前方案</option><option value="false">拒绝当前方案</option></select></label>}
      {needsFiles && !prepared && <><ConnectedFiles request={request} purpose={remedy ? 'ORDER_FULFILLMENT_IMAGE' : 'COMPLAINT_EVIDENCE'} label={remedy ? '补充履约截图' : '案件证据（人工审核不代表已对对方公开）'} selected={files.filter(f => f.file_type !== 'ORDER_FULFILLMENT_VIDEO')} onChange={next => setFiles([...next,...files.filter(f => f.file_type === 'ORDER_FULFILLMENT_VIDEO')])} />{remedy && <ConnectedFiles request={request} purpose="ORDER_FULFILLMENT_VIDEO" label="补充履约连续录屏" selected={files.filter(f => f.file_type === 'ORDER_FULFILLMENT_VIDEO')} onChange={next => setFiles([...files.filter(f => f.file_type !== 'ORDER_FULFILLMENT_VIDEO'),...next])} />}</>}
      {action === 'CONFIRM_REMEDY' && <p>确认将接受同案补充履约并结案结算；普通售后冻结不能通过普通收货接口绕过。</p>}
      {action === 'EXTEND_REMEDY' && <p>使用本订单与正常履约共用的唯一一次 24 小时延期。</p>}
      {action === 'ACCEPT_DECISION' && <p>只接受上方具体裁决；单方接受不会提前执行。</p>}
      {!prepared ? <button type="button" disabled={busy} onClick={prepare}>核对并准备提交</button> : <><p>请求结果未知时，仅可用同一幂等键重试本次操作；也可先重新读取案件。</p><button type="button" disabled={busy} onClick={() => void submit()}>{busy ? '提交中…' : '确认提交案件操作'}</button></>}
      <button type="button" disabled={busy || !!prepared?.attempted} onClick={() => { write.current = null; setPrepared(null); setAction(null); }}>取消未提交操作</button>
    </section>}
    <section><h3>案件历史</h3>{history.map(item => <p key={item.version}>版本 {item.version} · {userCaseActions[item.action as UserCaseAction] ?? item.action} · {date(item.created_at)} · {caseStates[item.data.to ?? ''] ?? ''}</p>)}{cursor !== null && <button type="button" onClick={() => void loadHistory(cursor).catch(() => setNotice('历史读取失败，请重试。'))}>加载更多案件历史</button>}</section>
  </> : <p>正在读取案件；读取失败时请重试。</p>}</section>;
}

function CaseEvidence({ request, caseId, ids }: { request: Request; caseId: string; ids: string[] }) {
  const [url, setUrl] = useState<string | null>(null), [notice, setNotice] = useState(''); const generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const clear = () => { generation.current++; setUrl(null); if (timer.current) clearTimeout(timer.current); }; const hidden = () => { if (document.hidden) clear(); }; document.addEventListener('visibilitychange',hidden); return () => { clear(); document.removeEventListener('visibilitychange',hidden); }; }, [caseId]);
  const open = useCallback(async (id: string) => { const current=++generation.current; setUrl(null); try { const result=await request<{file_id:string;access:{url:string;expires_at:string}}>(`/files/after-sale-evidence/${caseId}/${id}/access`); if(current!==generation.current)return; const ttl=Date.parse(result.access.expires_at)-Date.now(); if(result.file_id!==id || !Number.isFinite(ttl) || ttl<=0)throw new Error(); setUrl(result.access.url); setNotice('短时查看授权已取得；对方未脱敏材料不会开放。'); if(timer.current)clearTimeout(timer.current); timer.current=setTimeout(()=>setUrl(null),Math.min(ttl,60000)); } catch {if(current===generation.current)setNotice('材料不可用、未对你开放或访问失败，请重新读取。');} }, [request, caseId]);
  return <section><h3>案件证据</h3>{ids.map((id,i)=><button type="button" key={id} onClick={()=>void open(id)}>查看案件证据 {i+1}</button>)}{url && <img src={url} alt="本次授权的案件证据" referrerPolicy="no-referrer" crossOrigin="anonymous" style={{maxWidth:'100%'}} onError={()=>{setUrl(null);setNotice('访问失效或不是可预览图片，请联系客服核验。');}} />}<p role="status">{notice}</p></section>;
}
