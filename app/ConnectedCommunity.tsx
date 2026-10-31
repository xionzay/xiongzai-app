"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedbackResponse, PublicAnnouncementResponse } from "../packages/contracts/src/community";
import { CartoonIcon } from "./ui/CartoonIcon";
import { HomeAnnouncementCarousel } from "./HomeAnnouncementCarousel";

export type CommunityRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type Page<T> = { items: T[]; next_cursor: string | null };
type Policy = { max_characters: number; hourly_limit: number };
const feedbackLabels = { SUBMITTED: "等待处理", PROCESSING: "处理中", REPLIED: "官方已回复" };
function message(cause: unknown) { return typeof navigator !== "undefined" && !navigator.onLine ? "网络已断开，恢复连接后重试。" : cause instanceof Error && cause.name !== "TypeError" ? cause.message : "无法连接服务，请稍后重试。"; }
function status(cause: unknown) { return cause && typeof cause === "object" && "status" in cause ? cause.status : null; }
function Heading({ title, back }: { title: string; back: () => void }) { return <header className="decision-heading"><button type="button" aria-label="返回" onClick={back}><CartoonIcon kind="back" /></button><h1>{title}</h1><span /></header>; }
export function ConnectedFeedbackPage({ request, userId, back, login, initialId }: { request: CommunityRequest; userId?: string; back: () => void; login: () => void; initialId?: string | null }) {
  const [policy, setPolicy] = useState<Policy | null>(null), [text, setText] = useState(""), [rows, setRows] = useState<FeedbackResponse[]>([]), [cursor, setCursor] = useState<string | null>(null), [selected, setSelected] = useState<FeedbackResponse | null>(null), [view, setView] = useState<"write" | "list" | "detail">(initialId ? "detail" : "write");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [auth, setAuth] = useState(false), [policyRetry, setPolicyRetry] = useState(0);
  const pending = useRef<{ client_request_id: string; content: string } | null>(null), lock = useRef(false), controller = useRef<AbortController | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const detailId = useRef<string | null>(initialId ?? null);
  const fail = useCallback((cause: unknown) => { setError(message(cause)); if (status(cause) === 401) setAuth(true); }, []);
  useEffect(() => { if (!userId) return; const c = new AbortController(); void request<Policy>("/feedback/policy", { signal: c.signal }).then(value => { if (!c.signal.aborted) { setPolicy(value); setError(""); } }).catch(cause => { if (!c.signal.aborted) fail(cause); }); return () => c.abort(); }, [fail, policyRetry, request, userId]);
  useEffect(() => () => controller.current?.abort(), []);
  const detail = useCallback(async (id: string) => {
    detailId.current = id;
    controller.current?.abort(); const c = new AbortController(); controller.current = c; setBusy(true); setError(""); setSelected(null); setView("detail");
    try { const row = await request<FeedbackResponse>(`/feedback/${encodeURIComponent(id)}`, { signal: c.signal }); if (!c.signal.aborted) setSelected(row); }
    catch (cause) { if (!c.signal.aborted) fail(cause); } finally { if (!c.signal.aborted) setBusy(false); }
  }, [fail, request]);
  useEffect(() => { if (!userId || !initialId) return; const timer = window.setTimeout(() => void detail(initialId), 0); return () => clearTimeout(timer); }, [detail, initialId, userId]);
  async function list(next?: string) {
    controller.current?.abort(); const c = new AbortController(); controller.current = c; setView("list"); setBusy(true); setError(""); if (!next) { setRows([]); setCursor(null); }
    try { const page = await request<Page<FeedbackResponse>>(`/feedback?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, { signal: c.signal }); if (!c.signal.aborted) { setRows(current => next ? [...current, ...page.items.filter(row => !current.some(item => item.id === row.id))] : page.items); setCursor(page.next_cursor); } }
    catch (cause) { if (!c.signal.aborted) fail(cause); } finally { if (!c.signal.aborted) setBusy(false); }
  }
  async function submit() {
    if (!policy || lock.current || !text.trim()) return; lock.current = true; setBusy(true); setError("");
    pending.current ??= { client_request_id: crypto.randomUUID(), content: text.trim() }; const draft = pending.current;
    try {
      let existing: FeedbackResponse | null = null;
      if (uncertain) { try { existing = await request<FeedbackResponse>(`/feedback/requests/${draft.client_request_id}`); } catch (cause) { if (status(cause) !== 404) throw cause; } }
      const row = existing ?? await request<FeedbackResponse>("/feedback", { method: "POST", body: JSON.stringify(draft) });
      setSelected(row); setView("detail"); setText(""); pending.current = null; setUncertain(false);
    } catch (cause) { fail(cause); if (status(cause) === null || Number(status(cause)) >= 500) setUncertain(true); else { pending.current = null; setUncertain(false); } }
    finally { lock.current = false; setBusy(false); }
  }
  if (!userId || auth) return <div className="app-screen decision-page"><Heading title="意见反馈" back={back} /><p>请先登录后提交或查看本人反馈。</p><button type="button" className="full-primary" onClick={login}>前往登录</button></div>;
  return <div className="app-screen decision-page connected-community"><Heading title={view === "write" ? "意见反馈" : view === "list" ? "我的反馈" : "反馈详情"} back={() => view === "write" ? back() : setView("write")} /><p className="decision-info">独立文字反馈，不会转为客服工单。官方回复不代表采纳；暂无回复时效承诺。</p>
    {view === "write" ? <><label>你的建议<textarea aria-label="文字建议" value={text} disabled={busy || uncertain} onChange={event => setText(event.target.value)} placeholder="告诉我们你希望改进的地方" /></label>{policy ? <small>{[...text.trim()].length}/{policy.max_characters} 字；本地测试频控：每小时最多 {policy.hourly_limit} 条。</small> : <button type="button" onClick={() => setPolicyRetry(value => value + 1)}>重新读取反馈规则</button>}{uncertain ? <p role="status">上次提交结果不确定，原文已暂时锁定。重试将先查询原请求，不会另建重复反馈。</p> : null}<button type="button" className="full-primary" disabled={!policy || busy || !text.trim() || [...text.trim()].length > policy.max_characters} onClick={() => void submit()}>{busy ? "正在确认提交…" : uncertain ? "查询并重试原建议" : "提交建议"}</button><button type="button" className="decision-row" disabled={busy} onClick={() => void list()}>我的反馈</button></> : view === "list" ? <>{rows.map(row => <button type="button" className="decision-row" key={row.id} onClick={() => void detail(row.id)}><span>{row.content}<small>{feedbackLabels[row.status]} · {new Date(row.created_at).toLocaleString("zh-CN")}</small></span></button>)}{!busy && !error && !rows.length ? <p>还没有提交过反馈。</p> : null}{cursor ? <button type="button" disabled={busy} onClick={() => void list(cursor)}>加载更早反馈</button> : null}<button type="button" disabled={busy} onClick={() => void list()}>刷新反馈记录</button></> : selected ? <article><p className="community-plain-copy">{selected.content}</p><small>{feedbackLabels[selected.status]} · {new Date(selected.created_at).toLocaleString("zh-CN")}</small><h2>官方回复</h2><p className="community-plain-copy">{selected.reply ?? "等待官方回复"}</p>{selected.replied_at ? <small>{new Date(selected.replied_at).toLocaleString("zh-CN")}</small> : null}<button type="button" disabled={busy} onClick={() => void detail(selected.id)}>刷新反馈详情</button></article> : null}
    {busy ? <p role="status">正在读取服务端结果…</p> : null}{error ? <p role="alert">{error}<button type="button" disabled={busy} onClick={() => void (view === "list" ? list() : view === "detail" && detailId.current ? detail(detailId.current) : policy ? submit() : setPolicyRetry(value => value + 1))}>重试</button></p> : null}
  </div>;
}

/** Covers are short-lived private access URLs held only in this mounted component. */
function useAnnouncementCover(request: CommunityRequest, id: string, version: number) {
  const [src, setSrc] = useState(""), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    void request<{ access: { url: string; expires_at: string } }>(`/announcements/${encodeURIComponent(id)}/cover`, { signal: c.signal }).then(row => {
      if (c.signal.aborted) return; setSrc(row.access.url); setError("");
      timer = setTimeout(() => { setSrc(""); setRevision(value => value + 1); }, Math.max(1000, new Date(row.access.expires_at).getTime() - Date.now() - 1000));
    }).catch(cause => { if (!c.signal.aborted) { setSrc(""); setError(message(cause)); } });
    return () => { c.abort(); clearTimeout(timer); };
  }, [id, request, revision, version]);
  return { src, error, failed: () => { setSrc(""); setError("封面读取失败或访问已过期，请重新获取。"); }, retry: () => { setSrc(""); setRevision(value => value + 1); } };
}
function AnnouncementBanner({ row, request, active, onOpen }: { row: PublicAnnouncementResponse; request: CommunityRequest; active: boolean; onOpen: (id: string) => void }) {
  const cover = useAnnouncementCover(request, row.id, row.version);
  return cover.src ? <HomeAnnouncementCarousel items={[{ id: row.id, src: cover.src, alt: row.title }]} active={active} onOpen={onOpen} onImageError={cover.failed} /> : <section className="paper-panel" aria-label="公告封面"><button type="button" onClick={() => onOpen(row.id)}>{row.title}</button>{cover.error ? <p role="alert">封面读取失败<button type="button" onClick={cover.retry}>重试封面</button></p> : <p role="status">正在读取公告封面…</p>}</section>;
}
export function PublicAnnouncements({ request, active = true, onOpen, links = false }: { request: CommunityRequest; active?: boolean; onOpen: (id: string) => void; links?: boolean }) {
  const [rows, setRows] = useState<PublicAnnouncementResponse[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);
  const load = useCallback(async (next?: string) => {
    current.current?.abort(); const c = new AbortController(); current.current = c; setBusy(true); setError(""); if (!next) { setRows([]); setCursor(null); }
    try { const page = await request<Page<PublicAnnouncementResponse>>(`/announcements?limit=10${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, { signal: c.signal }); if (!c.signal.aborted) { setRows(old => next ? [...old, ...page.items.filter(row => !old.some(item => item.id === row.id))] : page.items); setCursor(page.next_cursor); } }
    catch (cause) { if (!c.signal.aborted) setError(message(cause)); } finally { if (!c.signal.aborted) setBusy(false); }
  }, [request]);
  useEffect(() => { if (!active) return; const timer = setTimeout(() => void load(), 0); const focus = () => { if (!document.hidden) void load(); }; window.addEventListener("focus", focus); return () => { clearTimeout(timer); current.current?.abort(); window.removeEventListener("focus", focus); }; }, [active, load]);
  return <section className="public-announcements" aria-label="平台公共公告">{busy ? <p role="status">正在读取平台公告…</p> : error ? <p role="alert">{error}<button type="button" onClick={() => void load()}>重新加载公告</button></p> : !rows.length ? <p className="decision-info">暂无已发布公告</p> : null}{links ? rows.map(row => <button type="button" className="decision-row" key={row.id} onClick={() => onOpen(row.id)}>{row.title}<small>{new Date(row.published_at).toLocaleString("zh-CN")}</small></button>) : rows[0] ? <AnnouncementBanner key={`${rows[0].id}:${rows[0].version}`} request={request} row={rows[0]} active={active} onOpen={onOpen} /> : null}{!links && rows.length > 1 ? <details><summary>更多平台公告</summary>{rows.slice(1).map(row => <button type="button" className="decision-row" key={row.id} onClick={() => onOpen(row.id)}>{row.title}</button>)}</details> : null}{cursor ? <button type="button" disabled={busy} onClick={() => void load(cursor)}>加载更多公告</button> : null}</section>;
}
export function PublicAnnouncementDetail({ request, id, back }: { request: CommunityRequest; id: string; back: () => void }) {
  const [row, setRow] = useState<PublicAnnouncementResponse | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => { const c = new AbortController(); void request<PublicAnnouncementResponse>(`/announcements/${encodeURIComponent(id)}`, { signal: c.signal }).then(value => { if (!c.signal.aborted) { setRow(value); setError(""); } }).catch(cause => { if (!c.signal.aborted) { setRow(null); setError(message(cause)); } }); return () => c.abort(); }, [id, request, retry]);
  return <div className="app-screen announcement-detail-screen"><Heading title="公告详情" back={back} />{error ? <p role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>重新读取公告</button></p> : row ? <article className="paper-panel connected-community"><h1>{row.title}</h1><small>发布时间：{new Date(row.published_at).toLocaleString("zh-CN")}</small><p className="community-plain-copy">{row.content}</p></article> : <p role="status">正在读取公告…</p>}</div>;
}
