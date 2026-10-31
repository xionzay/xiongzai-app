"use client";

/* eslint-disable jsx-a11y/media-has-caption -- User-submitted recording evidence has no supplied caption track. */
import { ConnectedAfterSale } from "./ConnectedAfterSale";
import { useCallback, useEffect, useRef, useState } from "react";
import { fulfillmentEvidenceError, isFulfillmentOrder } from "../packages/contracts/src/commerce";

export type FulfillmentFacts = { after_sale_cases?: Array<{id:string;state:string;version:number}>; id: string; version: number; rule_version?: string; fulfillment_seconds?: number | null; fulfillment_due_at?: string | null; auto_confirm_at?: string | null; receipt_extension_used?: boolean; last_reminded_at?: string | null; evidence_review_pending?: boolean; after_sale_status: string; paid_amount_cent: string; available_actions?: string[]; seller_available_actions?: string[]; fulfillment_evidence?: { file_id: string; kind: string }[] };
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type FileFact = { id: string; file_type: string; mime_type: string; upload_status: string; moderation_status: string; visibility: string; bound_order_id?: string | null };
type Policy = { file_type: string; mime_types: string[]; maximum_bytes: number };
const time = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "尚未生成";

export function FulfillmentOrderPanel({ order, viewerRole: role, request, onUpdated }: { order: FulfillmentFacts; viewerRole: "buyer" | "seller"; request: Request; onUpdated: () => void | Promise<void> }) {
  const [files, setFiles] = useState<FileFact[]>([]), [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [confirm, setConfirm] = useState<string | null>(null);
  const [selectedCase,setSelectedCase] = useState<string|null>(null);
  const lock = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(() => {
    if (!confirm || !dialogRef.current) return;
    const dialog=dialogRef.current, previous=document.activeElement;
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard=(event: KeyboardEvent) => {
      if (event.key==="Escape" && !lock.current) { event.preventDefault(); setConfirm(null); }
      if (event.key!=="Tab") return;
      const buttons=Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).filter(button=>!button.disabled);
      if (!buttons.length) { event.preventDefault(); dialog.focus(); return; }
      const first=buttons[0], last=buttons[buttons.length-1];
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown",keyboard);
    return () => { document.removeEventListener("keydown",keyboard); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  },[confirm]);
  const refreshFiles = useCallback(async () => {
    try {
      const pages = await Promise.all(["ORDER_FULFILLMENT_IMAGE", "ORDER_FULFILLMENT_VIDEO"].map(type => request<{ items: FileFact[] }>(`/me/files?file_type=${type}&limit=100`)));
      setFiles(pages.flatMap(page => page.items));
    } catch { setError("凭证文件读取失败，请重新加载；不会使用演示文件。"); }
  }, [request]);
  useEffect(() => { if (role === "seller" && !order.fulfillment_evidence?.length) void Promise.resolve().then(refreshFiles); }, [role, order.id, order.fulfillment_evidence?.length, refreshFiles]);
  if (!isFulfillmentOrder(order)) return null;
  const actions = role === "buyer" ? order.available_actions ?? [] : order.seller_available_actions ?? [];
  const frozen = order.after_sale_status === "IN_PROGRESS" || order.evidence_review_pending;
  const remaining=order.auto_confirm_at ? Math.max(0,Math.ceil((Date.parse(order.auto_confirm_at)-now)/1000)) : null;
  const enough = !fulfillmentEvidenceError(files, selected, order.paid_amount_cent);
  const reload = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await onUpdated(); if (role === "seller") await refreshFiles(); }
    catch { setError("最新订单读取失败，请恢复网络后重试。"); }
    finally { lock.current = false; setBusy(false); }
  };
  const retryComplete = async (fileId: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await request(`/files/${fileId}/complete`, { method: "POST" }); await refreshFiles(); }
    catch { setError("校验未完成，请恢复网络后重试；不会重复上传文件。"); }
    finally { lock.current = false; setBusy(false); }
  };
  const run = async (action: string) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    let confirmed=false;
    try {
      await request(`/${role === "seller" ? "seller/" : ""}orders/${order.id}/${action}`, { method: "POST", body: JSON.stringify({ version: order.version, ...(action === "complete" ? { evidence_file_ids: selected } : {}) }) });
      confirmed=true;
      setConfirm(null); await onUpdated(); setNotice("操作已由服务端确认");
    } catch (cause) {
      const conflict = (cause as { status?: number }).status === 409;
      setError(confirmed ? "本次操作已由服务端确认，但最新记录读取失败，请重新加载，不要重复提交。" : conflict ? "订单或凭证状态已变化，正在重新读取服务端记录。" : "操作未完成，请重新加载后重试。");
      if (conflict) {
        setConfirm(null);
        try { await onUpdated(); if (role === "seller") await refreshFiles(); setError("订单或凭证状态已变化，已重新读取服务端记录，请核对后重试。"); }
        catch { setError("订单版本已变化，但刷新失败。请恢复网络后重新加载，不要继续提交旧版本。"); }
      }
    } finally { lock.current = false; setBusy(false); }
  };
  const upload = async (input: File[], purpose: string) => {
    if (lock.current || !input.length) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const policies = await request<Policy[]>("/files/policies"), policy = policies.find(p => p.file_type === purpose);
      if (!policy) throw new Error("上传策略不可用");
      for (const file of input) {
        if (!policy.mime_types.includes(file.type) || file.size < 1 || file.size > policy.maximum_bytes) throw new Error("文件格式或大小不符合服务端策略");
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
        const ticket = await request<{ file: FileFact; upload: { url: string; method: string; headers: Record<string, string> } }>("/files/uploads", { method: "POST", body: JSON.stringify({ file_type: purpose, mime_type: file.type, size_bytes: file.size, sha256 }) });
        const response = await fetch(ticket.upload.url, { method: ticket.upload.method, headers: ticket.upload.headers, body: file, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error("文件上传未完成");
        await request(`/files/${ticket.file.id}/complete`, { method: "POST" });
      }
      await refreshFiles(); setNotice("格式和哈希校验已完成，仍需管理员人工审核。未接入恶意文件扫描服务。");
    } catch { await refreshFiles(); setError("上传或校验未完成。请重新加载文件列表，已上传文件不要重复上传，可重试校验。"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="paper-panel order-facts fulfillment-panel">
    <h3>新订单履约与凭证</h3><p>完成时限：付款后 {order.fulfillment_seconds! / 3600} 小时（开始服务和数量不重置）</p><p>完成截止：{time(order.fulfillment_due_at)}</p><p>自动收货截止：{time(order.auto_confirm_at)} · 由服务端定时任务执行</p>{remaining!==null && <p>{frozen?"冻结中，恢复后期限以服务端为准":remaining>0? "剩余 "+Math.floor(remaining/3600)+" 小时 "+Math.floor(remaining%3600/60)+" 分":"期限已到，等待服务端处理，页面不会自行完成订单"}</p>}<p>延长收货：{order.receipt_extension_used ? "已使用一次 24 小时" : "尚未使用"}</p><p>上次催服务：{time(order.last_reminded_at)} · 冷却 24 小时</p>
    {order.after_sale_cases?.map(row=><button type="button" key={row.id} onClick={()=>setSelectedCase(row.id)}>查看售后案件 {row.id.slice(-8)}</button>)}
    {selectedCase && <ConnectedAfterSale key={selectedCase} request={request} caseId={selectedCase} paidCent={order.paid_amount_cent} onUpdated={()=>{void Promise.resolve().then(onUpdated).catch(()=>setNotice("案件操作已成功，订单刷新失败，请重新读取。"));}} onSupport={()=>setNotice("请通过订单页面的联系平台客服入口，携带当前订单及案件编号申请协助。")} />}
    {frozen && <p role="status">售后或证据核查期间，完成、收货与结算暂停；恢复后的期限以服务端为准。</p>}
    {error && <p role="alert">{error}<button disabled={busy} onClick={() => void reload()}>重新加载</button></p>}{notice && <p role="status">{notice}</p>}
    {order.fulfillment_evidence?.map(item => <Evidence key={item.file_id} orderId={order.id} fileId={item.file_id} kind={item.kind} request={request} />)}
    {role === "seller" && actions.includes("COMPLETE") && !order.fulfillment_evidence?.length && <>
      <p>至少五张已校验、人工审核通过的截图；实付达到 200 元还需连续录屏。上传不等于审核通过，绑定后不可覆盖、删除或跨订单复用。</p>
      <label>上传完成截图<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(Array.from(e.target.files ?? []), "ORDER_FULFILLMENT_IMAGE"); e.target.value = ""; }} /></label>
      <label>上传连续录屏<input type="file" accept="video/mp4" disabled={busy} onChange={e => { void upload(Array.from(e.target.files ?? []), "ORDER_FULFILLMENT_VIDEO"); e.target.value = ""; }} /></label>
      <button disabled={busy} onClick={() => void refreshFiles()}>刷新人工审核状态</button>
      {files.map(file => <div key={file.id}><label><input type="checkbox" checked={selected.includes(file.id)} disabled={busy || file.upload_status !== "VERIFIED" || file.moderation_status !== "APPROVED" || file.visibility !== "PRIVATE" || !!file.bound_order_id} onChange={e => setSelected(ids => e.target.checked ? [...ids, file.id] : ids.filter(id => id !== file.id))} />{file.file_type === "ORDER_FULFILLMENT_VIDEO" ? "录屏" : "截图"} {file.id.slice(-8)} · {file.upload_status === "VERIFIED" ? "已校验" : "待校验"} · {file.moderation_status === "APPROVED" ? "人工审核通过" : file.moderation_status === "REJECTED" ? "已驳回" : "待人工审核"}</label>{file.upload_status === "PENDING" || file.upload_status === "UPLOADED" ? <button disabled={busy} onClick={() => void retryComplete(file.id)}>重试完成校验</button> : null}</div>)}
    </>}
    <div className="order-detail-actions">{actions.includes("START") && <button disabled={busy || frozen} onClick={() => setConfirm("start")}>开始服务</button>}{actions.includes("COMPLETE") && <button disabled={busy || frozen || !enough} onClick={() => setConfirm("complete")}>提交完成凭证</button>}{actions.includes("REMIND_SELLER") && <button disabled={busy || frozen} onClick={() => void run("remind")}>催服务</button>}{actions.includes("EXTEND_RECEIPT") && <button disabled={busy || frozen} onClick={() => setConfirm("extend-receipt")}>延长收货 24 小时</button>}{actions.includes("CONFIRM_COMPLETE") && <button disabled={busy || frozen} onClick={() => setConfirm("confirm")}>确认收货</button>}</div>
    {confirm && <div ref={dialogRef} className="flow-overlay fulfillment-confirmation-overlay" role="dialog" aria-modal="true" aria-label="确认履约操作" tabIndex={-1}><section className="flow-dialog"><h2>确认履约操作</h2><p>{confirm === "confirm" ? "请核对完成凭证，收货后将进入结算。" : confirm === "extend-receipt" ? "每单仅可延长一次 24 小时，确认使用？" : "操作将按当前版本提交服务端，确认继续？"}</p><div><button disabled={busy} onClick={() => setConfirm(null)}>取消</button><button disabled={busy} onClick={() => void run(confirm)}>{busy ? "提交中…" : "确认操作"}</button></div></section></div>}
  </section>;
}
function Evidence({ orderId, fileId, kind, request }: { orderId: string; fileId: string; kind: string; request: Request }) {
  const [url, setUrl] = useState<string | null>(null), [error, setError] = useState(false);
  // Do not put access URLs in query caches, local storage, or logs.
  const load = async () => { setError(false); try { const result = await request<{ access: { url: string } }>(`/files/order-evidence/${orderId}/${fileId}/access`); setUrl(result.access.url); } catch { setError(true); } };
  return <div><button onClick={() => void load()}>查看{kind === "VIDEO" ? "连续录屏" : "完成截图"}</button>{error && <p role="alert">凭证读取失败，点击重试。</p>}{url && (kind === "VIDEO" ? <video controls preload="metadata" crossOrigin="anonymous" src={url} onError={() => { setUrl(null); setError(true); }} /> : <img src={url} crossOrigin="anonymous" alt="订单完成截图" referrerPolicy="no-referrer" onError={() => { setUrl(null); setError(true); }} />)}</div>;
}
