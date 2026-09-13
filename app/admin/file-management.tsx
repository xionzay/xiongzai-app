"use client";

/* eslint-disable jsx-a11y/media-has-caption -- Moderation previews are uploaded voice samples without a timed-text track. */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";
import { AdminApiError, adminApiBlob, adminApiRequest } from "./admin-api";
import { useSafeUrlChoice } from "./url-state";

type FileRow = {
  id: string; owner_user_id: string | null; file_type: string; mime_type: string; size_bytes: string | number;
  width: number | null; height: number | null; duration_ms: number | null; upload_status: string;
  moderation_status: string; visibility: string; created_at: string; updated_at: string;
};
type FilePreview = { url: string; contentType: string };
type OperationLog = { id: string; admin_name: string; action: string; target_id: string | null; reason: string; request_id: string; created_at: string };
type Page<T> = { items: T[]; next_cursor: string | null };
type Decision = "APPROVED" | "REJECTED" | "FLAGGED";
type UploadTicket={file:FileRow;upload:{url:string;method:string;headers:Record<string,string>;expires_at:string}};

function ControlledPreviewImage({ src, width, height }: { src: string; width: number | null; height: number | null }) {
  // The protected Blob URL only exists in this browser session and cannot be sent through an image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="待审核文件预览" referrerPolicy="no-referrer" width={width ?? undefined} height={height ?? undefined} decoding="async" loading="lazy" />;
}

const uploadOptions = ["", "PENDING", "UPLOADED", "VERIFIED", "FAILED", "DELETED"];
const moderationOptions = ["", "PENDING", "APPROVED", "REJECTED", "FLAGGED"];
const labels: Record<string, string> = { PENDING:"待处理", UPLOADED:"已上传", VERIFIED:"已校验", FAILED:"校验失败", DELETED:"已删除", APPROVED:"已通过", REJECTED:"已驳回", FLAGGED:"已标记", PUBLIC:"公开", PRIVATE:"私有", SIGNED:"签名访问" };
const fileTypeLabels: Record<string, string> = { AVATAR:"用户头像", COVER:"用户封面", PRODUCT_IMAGE:"服务图片", VOICE_SAMPLE:"声音名片", COMPLAINT_EVIDENCE:"投诉证据", REFUND_EVIDENCE:"退款证据", CHAT_EVIDENCE:"聊天证据", ADMIN_EVIDENCE:"管理员证据", IDENTITY_EVIDENCE:"实名认证材料", PAYMENT_PAYLOAD:"支付载荷文件" };

export function FileManagementModule({ permissions, pendingCount, sort, setSort, onOpenLogs, onSessionExpired }: { permissions: string[]; pendingCount: number | null; sort: "created_desc" | "created_asc"; setSort: (value: string) => void; onOpenLogs: () => void; onSessionExpired: () => void }) {
  const canRead = permissions.includes("file.read");
  const canReview = permissions.includes("file.review");
  const canManage = permissions.includes("file.manage");
  const canReadLogs = permissions.includes("admin_log.read");
  const [rows, setRows] = useState<FileRow[]>([]);
  const [uploadStatus, setUploadStatus] = useSafeUrlChoice("files_upload_status", "", uploadOptions);
  const [moderationStatus, setModerationStatus] = useSafeUrlChoice("files_moderation_status", "", moderationOptions);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrl = useRef<string | null>(null);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadFile,setUploadFile]=useState<File|null>(null);const [uploadBusy,setUploadBusy]=useState(false);const [uploadError,setUploadError]=useState("");

  const handleError = useCallback((cause: unknown, fallback: string) => {
    if (cause instanceof AdminApiError && cause.status === 401) { onSessionExpired(); return "管理员会话已失效"; }
    if (cause instanceof AdminApiError && (cause.code.includes("MFA") || cause.status === 403)) return cause.message || "当前账号缺少权限或尚未完成 MFA";
    return cause instanceof Error ? cause.message : fallback;
  }, [onSessionExpired]);

  const load = useCallback(async (cursor?: string) => {
    if (!canRead) return;
    if (cursor) { setLoadingMore(true); setMoreError(""); } else { setLoading(true); setError(""); setRows([]); setNextCursor(null); }
    const query = new URLSearchParams({ limit: "20" });
    if (uploadStatus) query.set("upload_status", uploadStatus);
    if (moderationStatus) query.set("moderation_status", moderationStatus);
    query.set("sort", sort);
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await adminApiRequest<Page<FileRow>>(`/files?${query.toString()}`);
      setRows((current) => cursor ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))] : page.items); setNextCursor(page.next_cursor);
      setSelected((current) => current ? page.items.find((item) => item.id === current.id) ?? current : current);
    } catch (cause) { const message = handleError(cause, cursor ? "更多文件加载失败" : "文件列表加载失败"); if (cursor) setMoreError(message); else setError(message); }
    finally { if (cursor) setLoadingMore(false); else setLoading(false); }
  }, [canRead, handleError, moderationStatus, sort, uploadStatus]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const clearPreview = useCallback(() => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; setPreview(null); }, []);
  useEffect(() => clearPreview, [clearPreview]);

  const loadPreview = useCallback(async (file: FileRow) => {
    clearPreview(); setPreviewError(""); setPreviewLoading(true);
    try { const blob = await adminApiBlob(`/files/${encodeURIComponent(file.id)}/preview`); const url = URL.createObjectURL(blob); previewUrl.current = url; setPreview({ url, contentType: blob.type || file.mime_type }); }
    catch (cause) { setPreviewError(handleError(cause, "受控预览加载失败")); }
    finally { setPreviewLoading(false); }
  }, [clearPreview, handleError]);

  const openDetail = async (file: FileRow) => {
    setSelected(file); setLogs([]); setDecision(null); setReason(""); setNotice("");
    if (canReview) await loadPreview(file); else { clearPreview(); setPreviewError("当前账号缺少 file.review 权限，未请求文件字节。"); }
    if (canReadLogs) {
      try { const page = await adminApiRequest<Page<OperationLog>>(`/governance/operation-logs?target_id=${encodeURIComponent(file.id)}&limit=20`); setLogs(page.items.filter((item) => ["FILE_ADMIN_UPLOAD_REQUESTED", "FILE_ADMIN_UPLOAD_VERIFIED", "FILE_APPROVED", "FILE_REJECTED", "FILE_FLAGGED_ABNORMAL"].includes(item.action))); }
      catch { setLogs([]); }
    }
  };

  const closeDetail = () => { setSelected(null); clearPreview(); setPreviewError(""); setDecision(null); setReason(""); setActionError(""); };
  const startDecision = (value: Decision) => { setDecision(value); setReason(""); setActionError(""); };
  const submitDecision = async () => {
    if (!selected || !decision || submitting) return;
    if (reason.trim().length < 2) { setActionError("请填写至少 2 个字符的审核原因，原因将写入审计日志。"); return; }
    setSubmitting(true); setActionError("");
    try {
      const updated = await adminApiRequest<FileRow>(`/files/${encodeURIComponent(selected.id)}/moderation`, { method:"POST", body:JSON.stringify({ decision, reason:reason.trim() }) });
      setSelected(updated); clearPreview(); setDecision(null); setReason(""); setNotice(decision === "APPROVED" ? "文件已通过审核，结果已写入审计日志。" : decision === "REJECTED" ? "文件已驳回，结果已写入审计日志。" : "文件已标记异常，结果已写入审计日志。");
      await load();
      if (canReadLogs) { const page = await adminApiRequest<Page<OperationLog>>(`/governance/operation-logs?target_id=${encodeURIComponent(updated.id)}&limit=20`); setLogs(page.items.filter((item) => ["FILE_ADMIN_UPLOAD_REQUESTED", "FILE_ADMIN_UPLOAD_VERIFIED", "FILE_APPROVED", "FILE_REJECTED", "FILE_FLAGGED_ABNORMAL"].includes(item.action))); }
    } catch (cause) {
      const conflict = cause instanceof AdminApiError && ["RESOURCE_VERSION_CONFLICT", "FILE_MODERATION_STATE_CHANGED", "FILE_MODERATION_FINAL"].includes(cause.code);
      setActionError(conflict ? "该文件已被其他管理员处理，页面已刷新，请查看最终状态。" : handleError(cause, "审核提交失败"));
      if (conflict) { setDecision(null); setReason(""); await load(); }
    } finally { setSubmitting(false); }
  };

  const imagePreviewable = Boolean(selected?.mime_type.startsWith("image/"));
  const audioPreviewable = Boolean(selected?.mime_type.startsWith("audio/"));
  const pdfPreviewable = selected?.mime_type === "application/pdf";
  const uploadEvidence=async()=>{if(!uploadFile||uploadBusy)return;setUploadBusy(true);setUploadError("");try{const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await uploadFile.arrayBuffer()))).map((value)=>value.toString(16).padStart(2,"0")).join("");const ticket=await adminApiRequest<UploadTicket>("/files/uploads",{method:"POST",body:JSON.stringify({file_type:"ADMIN_EVIDENCE",mime_type:uploadFile.type,size_bytes:uploadFile.size,sha256:hash})});const uploaded=await fetch(ticket.upload.url,{method:ticket.upload.method,headers:ticket.upload.headers,body:uploadFile});if(!uploaded.ok)throw new Error("本地 MinIO 上传失败");await adminApiRequest(`/files/${encodeURIComponent(ticket.file.id)}/complete`,{method:"POST"});setNotice("管理员证据文件已完成本地上传、格式与 SHA-256 校验，正在等待人工审核。");setUploadFile(null);await load();}catch(cause){setUploadError(handleError(cause,"证据上传失败"));}finally{setUploadBusy(false);}};
  const reviewable = selected?.upload_status === "VERIFIED" && selected.moderation_status === "PENDING";
  if (!canRead) return <><Header count={null}/><State title="无权查看文件" note="当前管理员缺少 file.read 权限。请由授权管理员在 RBAC 中授予最小必要权限。"/></>;
  return <>
    <Header count={pendingCount}/>
    <div className={styles.fileToolbar}>
      {canManage?<><label>上传平台证据<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event)=>setUploadFile(event.target.files?.[0]??null)}/></label><button type="button" disabled={!uploadFile||uploadBusy} onClick={()=>void uploadEvidence()}>{uploadBusy?"校验并上传中…":"上传管理员证据文件"}</button></>:null}
      <label>上传状态<select value={uploadStatus} onChange={(event) => setUploadStatus(event.target.value)}>{uploadOptions.map((value) => <option value={value} key={value}>{value ? labels[value] ?? value : "全部"}</option>)}</select></label>
      <label>审核状态<select value={moderationStatus} onChange={(event) => setModerationStatus(event.target.value)}>{moderationOptions.map((value) => <option value={value} key={value}>{value ? labels[value] ?? value : "全部"}</option>)}</select></label>
      <label>服务端排序<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="created_desc">最新优先</option><option value="created_asc">最早优先</option></select></label>
      <button type="button" onClick={() => void load()} disabled={loading}>刷新</button>
      <small>筛选与游标分页均由真实管理 API 执行。</small>
    </div>
    {uploadError?<div className={styles.fileNotice} role="alert">{uploadError}</div>:null}<div className={styles.fileNotice} role="note">格式和哈希校验由本地服务完成；人工审核状态单独展示。恶意文件扫描服务尚未接入，仅属于上线前待办，页面不会伪造“病毒扫描通过”。支付载荷文件仅限服务身份使用，不向普通管理员开放。</div>
    {loading ? <State title="正在加载文件" note="正在从本地管理 API 读取文件事实。"/> : error ? <State title="加载失败" note={error} action={() => void load()}/> : rows.length === 0 ? <State title="暂无文件" note="当前筛选条件下没有文件记录。"/> : <section className={styles.fileTableCard}><div><table><thead><tr><th>文件编号</th><th>所有者</th><th>文件用途 / 格式</th><th>大小</th><th>媒体信息</th><th>上传</th><th>审核</th><th>访问</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((file) => <tr key={file.id}><td><b>{short(file.id)}</b></td><td>{short(file.owner_user_id)}</td><td><b>{fileTypeLabel(file.file_type)}</b><small>{file.mime_type}</small></td><td>{formatBytes(file.size_bytes)}</td><td>{mediaInfo(file)}</td><td><Badge value={file.upload_status}/></td><td><Badge value={file.moderation_status}/></td><td><Badge value={file.visibility}/></td><td>{formatTime(file.updated_at)}</td><td><button type="button" onClick={() => void openDetail(file)}>查看 / 审核</button></td></tr>)}</tbody></table></div><footer><span>当前加载 {rows.length} 条真实记录{!nextCursor ? " · 没有更多数据" : ""}</span>{moreError ? <span role="alert">{moreError}</span> : null}{nextCursor ? <button type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? "加载中…" : moreError ? "重试加载更多" : "加载更多"}</button> : null}</footer></section>}
    {selected && <div className={styles.drawerBackdrop} role="dialog" aria-modal="true" aria-label={`文件详情 ${short(selected.id)}`}><aside className={styles.detailDrawer}><header><div><span>文件人工审核</span><h2>文件详情 · {short(selected.id)}</h2></div><button type="button" aria-label="关闭" onClick={closeDetail}>×</button></header><div className={styles.drawerBody}>
      {notice && <div className={styles.fileNotice} role="status">{notice}</div>}
      <section className={styles.filePreview}><div>{previewLoading ? <p>正在读取同源受控预览…</p> : previewError ? <p>{previewError}</p> : preview && imagePreviewable ? <ControlledPreviewImage src={preview.url} width={selected.width} height={selected.height} /> : preview && audioPreviewable ? <audio controls preload="metadata" src={preview.url} aria-label="待审核声音名片预览" controlsList="nodownload"/> : preview&&pdfPreviewable?<iframe src={preview.url} title="受控 PDF 证据预览" sandbox="" referrerPolicy="no-referrer"/> : preview ? <p>该格式不在页面中直接渲染，可核对下方文件事实。</p> : <p>没有可用预览。</p>}</div>{canReview ? <button type="button" disabled={previewLoading} onClick={() => void loadPreview(selected)}>重新加载受控预览</button> : null}<small>文件字节通过同源管理API读取；Blob URL只存在于当前页面内存，切换文件或关闭详情后立即撤销。</small></section>
      <section className={styles.fileFacts}><h3>文件事实</h3><dl><Fact name="完整编号" value={selected.id}/><Fact name="所有者" value={selected.owner_user_id ?? "平台"}/><Fact name="用途" value={fileTypeLabel(selected.file_type)}/><Fact name="文件格式" value={selected.mime_type}/><Fact name="大小" value={formatBytes(selected.size_bytes)}/><Fact name="媒体信息" value={mediaInfo(selected)}/><Fact name="上传状态" value={labels[selected.upload_status] ?? selected.upload_status}/><Fact name="审核状态" value={labels[selected.moderation_status] ?? selected.moderation_status}/><Fact name="访问级别" value={labels[selected.visibility] ?? selected.visibility}/><Fact name="创建时间" value={formatTime(selected.created_at)}/><Fact name="更新时间" value={formatTime(selected.updated_at)}/></dl></section>
      <section className={styles.fileFacts}><h3>审核日志</h3>{canReadLogs ? logs.length ? logs.map((item) => <article className={styles.fileLog} key={item.id}><b>{fileAuditLabel(item.action)}</b><p>{item.reason}</p><small>{item.admin_name} · {formatTime(item.created_at)} · 请求 {short(item.request_id)}</small></article>) : <p>当前文件尚无审核日志。</p> : <p>当前账号缺少 admin_log.read 权限，无法查看审核日志。</p>}{canReadLogs ? <button type="button" onClick={onOpenLogs}>进入操作日志</button> : null}</section>
      {!canReview ? <State title="仅可查看" note="当前管理员缺少 file.review 权限，不能提交审核。"/> : reviewable ? <div className={styles.fileActions}><button type="button" onClick={() => startDecision("FLAGGED")}>标记异常</button><button type="button" onClick={() => startDecision("REJECTED")}>驳回文件</button><button type="button" onClick={() => startDecision("APPROVED")}>通过文件</button></div> : <State title="审核已结束" note="只有 VERIFIED + PENDING 文件可以审核；最终结果不能在此页面反向改写。"/>}
    </div></aside></div>}
    {selected && decision && <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="确认文件审核"><section className={styles.fileDecision}><h2>{decision === "APPROVED" ? "确认通过文件" : decision === "REJECTED" ? "确认驳回文件" : "确认标记文件异常"}</h2><p>文件 {short(selected.id)} · {fileTypeLabel(selected.file_type)} · {selected.mime_type}</p><label>审核原因 <b>*</b><textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请输入具体、可审计的审核依据"/><small>{reason.length}/1000</small></label>{actionError && <div role="alert">{actionError}</div>}<footer><button type="button" disabled={submitting} onClick={() => { setDecision(null); setReason(""); setActionError(""); }}>取消</button><button type="button" disabled={submitting || reason.trim().length < 2} onClick={() => void submitDecision()}>{submitting ? "提交中…" : "确认提交"}</button></footer></section></div>}
  </>;
}

function Header({ count }: { count: number | null }) { return <header className={styles.fileHeader}><div><span>文件存储治理</span><h1>文件管理与人工审核</h1><p>读取真实文件事实，通过同源受控代理预览，并由 MFA、RBAC 与服务端审计保护审核操作。</p></div><strong>{count === null ? "—" : count}<small>当前列表待审核</small></strong></header>; }
function State({ title, note, action }: { title: string; note: string; action?: () => void }) { return <section className={styles.fileState}><h2>{title}</h2><p>{note}</p>{action && <button type="button" onClick={action}>重试</button>}</section>; }
function Badge({ value }: { value: string }) { return <span className={`${styles.fileBadge} ${/FAILED|REJECTED/u.test(value) ? styles.fileBadgeDanger : /VERIFIED|APPROVED/u.test(value) ? styles.fileBadgeSuccess : ""}`}>{labels[value] ?? value}</span>; }
function Fact({ name, value }: { name: string; value: string }) { return <div><dt>{name}</dt><dd>{value}</dd></div>; }
function short(value: string | null) { return value ? value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value : "平台"; }
function formatBytes(value: string | number) { const size = Number(value); if (!Number.isFinite(size)) return String(value); if (size < 1024) return `${size} B`; if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KiB`; return `${(size / 1024 ** 2).toFixed(2)} MiB`; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12:false }); }
function mediaInfo(file: FileRow) { if (file.width && file.height) return `${file.width} × ${file.height}`; if (file.duration_ms != null) return `${(file.duration_ms / 1000).toFixed(1)} 秒`; return "—"; }
function fileTypeLabel(value: string) { return fileTypeLabels[value] ?? "其他业务文件"; }
function fileAuditLabel(action: string) { return ({ FILE_ADMIN_UPLOAD_REQUESTED:"上传凭证已创建", FILE_ADMIN_UPLOAD_VERIFIED:"格式与哈希校验完成", FILE_APPROVED:"审核通过", FILE_REJECTED:"审核驳回", FILE_FLAGGED_ABNORMAL:"标记异常" } as Record<string,string>)[action] ?? action; }
