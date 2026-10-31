"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedbackResponse, PublicAnnouncementResponse } from "../../packages/contracts/src/community";
import { AdminApiError, adminApiRequest, adminFailure } from "./admin-api";
import styles from "./admin.module.css";
import ui from "./community.module.css";

type History = { action: string; admin_id: string; created_at: string };
type Feedback = FeedbackResponse & { user_id: string; processing_records?: History[] };
type Announcement = Omit<PublicAnnouncementResponse, "published_at"> & { status: "DRAFT" | "PUBLISHED" | "RETIRED"; published_at: string | null; created_at: string; processing_records?: History[] };
type Page<T> = { items: T[]; next_cursor: string | null };
export type CommunityConfirm = { title: string; note: string; action: string; reasonRequired: boolean; danger?: boolean; onConfirm: (reason: string, secondary: string) => Promise<void> };
type Props = { permissions: Set<string>; setModal: (modal: CommunityConfirm | null) => void };
const labels: Record<string, string> = { SUBMITTED: "待处理", PROCESSING: "处理中", REPLIED: "已回复", DRAFT: "草稿", PUBLISHED: "已发布", RETIRED: "已停用" };
const actions: Record<string, string> = { FEEDBACK_PROCESSING: "标记处理", FEEDBACK_REPLIED: "官方回复", ANNOUNCEMENT_DRAFT_CREATED: "创建草稿", ANNOUNCEMENT_EDIT: "编辑草稿", ANNOUNCEMENT_PUBLISH: "发布公告", ANNOUNCEMENT_RETIRE: "停用公告" };
const date = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "—";
function Failure({ error, retry }: { error: ReturnType<typeof adminFailure> | null; retry?: () => void }) {
  return error ? <div role="alert" className={styles.loginError}>{error.message}{error.requestId ? <small>请求编号：{error.requestId}</small> : null}{retry ? <button type="button" onClick={retry}>重新加载</button> : null}</div> : null;
}
function usePage<T extends { id: string }>(path: string, enabled: boolean) {
  const [rows, setRows] = useState<T[]>([]), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<ReturnType<typeof adminFailure> | null>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (next?: string) => {
    request.current?.abort(); if (!enabled) return;
    const c = new AbortController(); request.current = c; setLoading(true); setError(null);
    if (!next) { setRows([]); setCursor(null); }
    try {
      const page = await adminApiRequest<Page<T>>(`${path}${path.includes("?") ? "&" : "?"}limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, { signal: c.signal });
      if (!c.signal.aborted) { setRows(current => next ? [...current, ...page.items.filter(row => !current.some(item => item.id === row.id))] : page.items); setCursor(page.next_cursor); }
    } catch (cause) { if (!c.signal.aborted) setError(adminFailure(cause)); }
    finally { if (!c.signal.aborted) setLoading(false); }
  }, [enabled, path]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); const refresh = () => { if (document.visibilityState === "visible") void load(); }; window.addEventListener("admin-data-refresh", refresh); return () => { clearTimeout(timer); request.current?.abort(); window.removeEventListener("admin-data-refresh", refresh); }; }, [load]);
  return { rows, cursor, loading, error, load };
}
function HistoryView({ rows }: { rows?: History[] }) {
  return <section><h3>服务端处理记录</h3>{rows?.length ? rows.map((row, index) => <p key={`${row.created_at}:${row.action}:${index}`}>{actions[row.action] ?? "治理操作"} · {date(row.created_at)}<small>管理员：{row.admin_id}</small></p>) : <p>暂无处理记录</p>}</section>;
}
/** Uncertain writes must retain the same key AND body. CAS still protects reopened actions. */
function confirmedWrite(path: string, payload: Record<string, unknown>, reload: (value?: unknown) => Promise<void>) {
  const key = crypto.randomUUID(); let frozen: string | undefined;
  return async (reason: string) => {
    const body = JSON.stringify({ ...payload, reason });
    if (frozen && frozen !== body) throw new Error("上次提交结果尚未确认，请保留原原因重试，或取消后重新读取记录。");
    frozen = body;
    try { const result = await adminApiRequest(path, { method: "POST", headers: { "idempotency-key": key }, body }); await reload(result); }
    catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 409) { await reload(); throw new Error("记录或发布条件已变化，已重新读取。请取消确认框，核对最新记录后操作。"); }
      if (cause instanceof AdminApiError && cause.status >= 400 && cause.status < 500) frozen = undefined;
      throw cause;
    }
  };
}

export function FeedbackManagement({ permissions, setModal }: Props) {
  const canRead = permissions.has("feedback.read"), [status, setStatus] = useState("");
  const page = usePage<Feedback>(`/feedback${status ? `?status=${status}` : ""}`, canRead);
  const [selected, setSelected] = useState<Feedback | null>(null), [error, setError] = useState<ReturnType<typeof adminFailure> | null>(null), [busy, setBusy] = useState(false), [reply, setReply] = useState(""), [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const detailId = useRef<string | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function open(id: string) {
    detailId.current = id;
    request.current?.abort(); const c = new AbortController(); request.current = c; setBusy(true); setSelected(null); setError(null); setReply("");
    try { const row = await adminApiRequest<Feedback>(`/feedback/${id}`, { signal: c.signal }); if (!c.signal.aborted) setSelected(row); }
    catch (cause) { if (!c.signal.aborted) setError(adminFailure(cause)); }
    finally { if (!c.signal.aborted) setBusy(false); }
  }
  function act(action: "process" | "reply") {
    if (!selected || (action === "reply" && !reply.trim())) return;
    const id = selected.id;
    const write = confirmedWrite(`/feedback/${id}/${action}`, { version: selected.version, ...(action === "reply" ? { reply: reply.trim() } : {}) }, async result => {
      await page.load(); await open(id); if (result) setNotice(action === "reply" ? "官方回复已由服务端保存，站内通知已生成。" : "服务端已标记为处理中。");
    });
    setModal({ title: action === "reply" ? "确认发送官方回复" : "确认开始处理反馈", note: action === "reply" ? "回复后不可覆盖修改；请核对正文。此操作独立于客服和订单。" : "只更改反馈处理状态，不改变订单或资金。", action: action === "reply" ? "确认回复" : "确认处理", reasonRequired: true, onConfirm: write });
  }
  if (!canRead) return <p>没有反馈读取权限。</p>;
  return <section className={ui.module}><header className={styles.moduleHeader}><div><h1>意见反馈</h1><p>用户原文只读，官方回复独立处理，不会转为客服工单。</p></div></header><div className={styles.toolbar}><label>反馈状态<select value={status} onChange={event => { setStatus(event.target.value); setSelected(null); request.current?.abort(); setBusy(false); }}><option value="">全部状态</option>{["SUBMITTED", "PROCESSING", "REPLIED"].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label><button type="button" disabled={page.loading} onClick={() => void page.load()}>刷新反馈</button></div><Failure error={page.error} retry={() => void page.load()} />{notice ? <p role="status">{notice}</p> : null}
    <div className={ui.columns}><section className={ui.panel}><div className={ui.tableScroll}><table><thead><tr><th>反馈内容</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead><tbody>{page.rows.map(row => <tr key={row.id}><td className={ui.excerpt}>{row.content}</td><td>{labels[row.status]}</td><td>{date(row.created_at)}</td><td><button type="button" onClick={() => void open(row.id)}>查看反馈</button></td></tr>)}</tbody></table></div>{page.loading ? <p role="status">正在读取反馈…</p> : !page.error && !page.rows.length ? <p>暂无符合条件的反馈</p> : null}{page.cursor ? <button type="button" disabled={page.loading} onClick={() => void page.load(page.cursor!)}>加载更多反馈</button> : null}</section>
    <aside className={ui.panel} aria-label="反馈详情">{busy ? <p role="status">正在读取反馈详情…</p> : null}<Failure error={error} retry={() => { if (detailId.current) void open(detailId.current); }} />{selected ? <><h2>反馈详情</h2><small>提交者：{selected.user_id} · 版本 {selected.version}</small><p className={ui.copy}>{selected.content}</p><h3>官方回复</h3><p className={ui.copy}>{selected.reply ?? "尚未回复"}</p>{selected.status !== "REPLIED" && permissions.has("feedback.reply") ? <label>回复正文<textarea maxLength={10000} value={reply} onChange={event => setReply(event.target.value)} /><small>最多 5000 字；回复后不可修改。</small></label> : null}<div className={ui.actions}>{selected.status === "SUBMITTED" && permissions.has("feedback.manage") ? <button type="button" onClick={() => act("process")}>标记处理中</button> : null}{selected.status !== "REPLIED" && permissions.has("feedback.reply") ? <button type="button" disabled={!reply.trim() || [...reply.trim()].length > 5000} onClick={() => act("reply")}>发送官方回复</button> : null}<button type="button" onClick={() => void open(selected.id)}>刷新详情</button></div><HistoryView rows={selected.processing_records} /></> : !busy && !error ? <p>选择一条反馈查看原文和处理记录。</p> : null}</aside></div>
  </section>;
}

type Cover = { id: string; created_at: string };
export function AnnouncementManagement({ permissions, setModal, onFiles }: Props & { onFiles: () => void }) {
  const canRead = permissions.has("announcement.read"), manage = canRead && permissions.has("announcement.manage"), publish = canRead && permissions.has("announcement.publish");
  const [status, setStatus] = useState(""), [selected, setSelected] = useState<Announcement | null>(null), [editing, setEditing] = useState(false), [title, setTitle] = useState(""), [content, setContent] = useState(""), [cover, setCover] = useState("");
  const page = usePage<Announcement>(`/announcements${status ? `?status=${status}` : ""}`, canRead);
  const covers = usePage<Cover>("/files?file_type=ANNOUNCEMENT_IMAGE&upload_status=VERIFIED&moderation_status=APPROVED", manage && permissions.has("file.read"));
  const [error, setError] = useState<ReturnType<typeof adminFailure> | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const detailId = useRef<string | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function draft() { request.current?.abort(); setBusy(false); setSelected(null); setEditing(true); setTitle(""); setContent(""); setCover(""); setError(null); setNotice(""); }
  async function open(id: string) {
    detailId.current = id;
    request.current?.abort(); const c = new AbortController(); request.current = c; setBusy(true); setError(null); setEditing(false); setSelected(null);
    try { const row = await adminApiRequest<Announcement>(`/announcements/${id}`, { signal: c.signal }); if (!c.signal.aborted) { setSelected(row); setTitle(row.title); setContent(row.content); setCover(row.cover_file_id ?? ""); setEditing(true); } }
    catch (cause) { if (!c.signal.aborted) setError(adminFailure(cause)); }
    finally { if (!c.signal.aborted) setBusy(false); }
  }
  function act(action: "save" | "publish" | "retire") {
    const current = selected, id = current?.id;
    const path = action === "save" ? id ? `/announcements/${id}/edit` : "/announcements" : `/announcements/${id}/${action}`;
    const payload = { ...(current ? { version: current.version } : {}), ...(action === "save" ? { title: title.trim(), content: content.trim(), cover_file_id: cover || null } : {}) };
    const write = confirmedWrite(path, payload, async result => {
      await page.load(); if (result) { await open((result as Announcement).id); setNotice(action === "save" ? "公告草稿已由服务端保存。" : action === "publish" ? "公告已发布，用户端将通过公共接口读取。" : "公告已停用，历史记录仍保留。"); } else if (id) await open(id);
    });
    setModal({ title: action === "save" ? "确认保存公告草稿" : action === "publish" ? "确认发布公告" : "确认停用公告", note: action === "publish" ? "发布后标题、正文和封面不可覆盖修改。发布不会发送真实推送。" : action === "retire" ? "停用后不再签发封面链接；先前的短时链接在有效期内可能继续可用。" : "仅保存纯文本草稿，封面须人工审核通过。", action: action === "save" ? "确认保存" : action === "publish" ? "确认发布" : "确认停用", reasonRequired: true, danger: action === "retire", onConfirm: write });
  }
  if (!canRead) return <p>没有公告读取权限。</p>;
  const editable = manage && (!selected || selected.status === "DRAFT");
  const dirty = Boolean(selected && (title !== selected.title || content !== selected.content || cover !== (selected.cover_file_id ?? "")));
  return <section className={ui.module}><header className={styles.moduleHeader}><div><h1>公共公告</h1><p>仅已发布公告向用户展示。公告不等同于私人通知，不承诺奖励或回复时效。</p></div>{manage ? <button type="button" onClick={draft}>新建公告草稿</button> : null}</header><div className={styles.toolbar}><label>公告状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option>{["DRAFT", "PUBLISHED", "RETIRED"].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label><button type="button" disabled={page.loading} onClick={() => void page.load()}>刷新公告</button></div><Failure error={page.error} retry={() => void page.load()} />{notice ? <p role="status">{notice}</p> : null}
    <div className={ui.columns}><section className={ui.panel}><div className={ui.tableScroll}><table><thead><tr><th>标题</th><th>状态</th><th>发布时间</th><th>操作</th></tr></thead><tbody>{page.rows.map(row => <tr key={row.id}><td>{row.title}</td><td>{labels[row.status]}</td><td>{date(row.published_at)}</td><td><button type="button" onClick={() => void open(row.id)}>查看公告</button></td></tr>)}</tbody></table></div>{page.loading ? <p role="status">正在读取公告…</p> : !page.error && !page.rows.length ? <p>暂无公告，可由有权限的管理员创建首个草稿。</p> : null}{page.cursor ? <button type="button" disabled={page.loading} onClick={() => void page.load(page.cursor!)}>加载更多公告</button> : null}</section>
    <aside className={ui.panel} aria-label="公告编辑与预览"><Failure error={error} retry={() => { if (detailId.current) void open(detailId.current); }} />{busy ? <p role="status">正在读取公告详情…</p> : editing ? <><h2>{selected ? `${labels[selected.status]} · 版本 ${selected.version}` : "新建公告草稿"}</h2><p>本地测试内容，正式发布前需人工复核。</p><label>公告标题<input aria-label="公告标题" value={title} disabled={!editable} onChange={event => setTitle(event.target.value)} maxLength={240} /></label><label>公告正文<textarea aria-label="公告正文" value={content} disabled={!editable} onChange={event => setContent(event.target.value)} maxLength={40000} /></label>{editable ? <><label>已审核公告封面<select value={cover} onChange={event => setCover(event.target.value)} disabled={!permissions.has("file.read") || covers.loading || Boolean(covers.error)}><option value="">暂不绑定封面（不可发布）</option>{cover && !covers.rows.some(row => row.id === cover) ? <option value={cover}>当前封面 · {cover}</option> : null}{covers.rows.map(row => <option key={row.id} value={row.id}>{date(row.created_at)} · {row.id}</option>)}</select></label><Failure error={covers.error} retry={() => void covers.load()} />{covers.cursor ? <button type="button" disabled={covers.loading} onClick={() => void covers.load(covers.cursor!)}>加载更多封面</button> : null}{permissions.has("file.read") ? <button type="button" onClick={onFiles}>去文件管理上传、预览和人工审核封面</button> : <p>当前账号没有文件读取权限，不能选择或审核新封面。</p>}</> : <p>已发布或停用的内容只读。封面编号：{selected?.cover_file_id ?? "无"}</p>}<details><summary>正文预览（尚未保存的修改不会发布）</summary><h3>{title}</h3><p className={ui.copy}>{content}</p></details><div className={ui.actions}>{editable ? <button type="button" disabled={!title.trim() || !content.trim() || [...title.trim()].length > 120 || [...content.trim()].length > 20000 || Boolean(covers.error)} onClick={() => act("save")}>保存公告草稿</button> : null}{selected?.status === "DRAFT" && publish ? <button type="button" disabled={!selected.cover_file_id || dirty} onClick={() => act("publish")}>发布公告</button> : null}{selected?.status === "PUBLISHED" && publish ? <button type="button" onClick={() => act("retire")}>停用公告</button> : null}{selected ? <button type="button" onClick={() => void open(selected.id)}>刷新详情</button> : null}</div>{dirty ? <p>有未保存的修改，请先保存后再发布。</p> : null}<HistoryView rows={selected?.processing_records} /></> : <p>选择公告查看详情，或新建草稿。</p>}</aside></div>
  </section>;
}
