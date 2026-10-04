"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminApiError, adminApiRequest, adminFailure } from "./admin-api";
import { BearStickerImage } from "../chat-stickers/BearStickers";
import styles from "./admin.module.css";
import { useSafeUrlChoice } from "./url-state";

type SupportStatus = "WAITING" | "SERVING" | "TRANSFERRED" | "CLOSED";
type SupportCase = {
  id: string;
  case_no: string;
  requester_id: string;
  requester?: { nickname: string; public_user_no: string | null; phone_mask: string };
  conversation_id: string;
  topic: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: SupportStatus;
  queue_key: string;
  assigned_admin_id: string | null;
  assigned_admin?: { id: string; display_name: string } | null;
  related_type: string | null;
  related_id: string | null;
  source_page?: string | null;
  first_response_at: string | null;
  closed_at: string | null;
  close_reason?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  version: number;
  created_at: string;
  updated_at?: string;
  logs?: Array<{ id: string; action: string; reason: string | null; created_at: string }>;
};

type SupportMessage = {
  message_type?: "TEXT" | "SYSTEM" | "STICKER";
  sticker?: { id: string };
  id: string;
  sender_role: "USER" | "ADMIN" | "SYSTEM" | "BUYER" | "SELLER";
  content: string;
  send_status: string;
  moderation_status: string;
  created_at: string;
  sequence_no: string | number;
};

type Page<T> = { items: T[]; next_cursor: string | null };
type LoadState = "loading" | "success" | "empty" | "error" | "offline";
type ActionKind = "receive" | "transfer" | "close";
type ActionDialog = { kind: ActionKind; item: SupportCase } | null;
const supportStatusOptions = ["", "WAITING", "SERVING", "TRANSFERRED", "CLOSED"] as const;

const queueOptions = [
  { value: "general", label: "综合客服" },
  { value: "trade", label: "订单交易" },
  { value: "risk", label: "风险审核" },
  { value: "finance", label: "财务结算" },
  { value: "priority", label: "优先处理" },
];

const quickReplies = ["您好，平台客服已接入，正在为您核实。", "请稍候，我正在查询相关业务记录。", "问题已记录，我们会继续跟进处理结果。"];

export function SupportWorkspace({ adminId, canManage, canReply }: { adminId: string; canManage: boolean; canReply: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useSafeUrlChoice("support_status", "", supportStatusOptions);
  const [items, setItems] = useState<SupportCase[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<LoadState>("loading");
  const [listError, setListError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportCase | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messageState, setMessageState] = useState<LoadState>("empty");
  const [messageError, setMessageError] = useState("");
  const [messageRevision, setMessageRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [reason, setReason] = useState("");
  const [targetQueue, setTargetQueue] = useState("general");
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const loadCases = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else { setListState("loading"); setListError(""); }
    const params = new URLSearchParams({ limit: "20", sort: "created_desc" });
    if (status) params.set("status", status);
    if (query.trim()) params.set("keyword", query.trim());
    if (cursor) params.set("cursor", cursor);
    try {
      const page = await adminApiRequest<Page<SupportCase>>(`/support-cases?${params.toString()}`);
      setItems((current) => cursor ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))] : page.items);
      setNextCursor(page.next_cursor);
      if (!cursor) {
        setListState(page.items.length ? "success" : "empty");
        setSelectedId((current) => page.items.some((item) => item.id === current) ? current : page.items[0]?.id ?? null);
      }
    } catch (cause) {
      const failure = adminFailure(cause);
      if (!cursor) { setItems([]); setNextCursor(null); setListState(failure.state); setListError(failure.message); setSelectedId(null); }
      else setListError(failure.message);
    } finally { if (cursor) setLoadingMore(false); }
  }, [query, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCases(), 220);
    return () => window.clearTimeout(timer);
  }, [loadCases]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const assignedToCurrentAdmin = selected?.assigned_admin_id === adminId;

  useEffect(() => {
    if (!selectedId) {
      const emptyTimer = window.setTimeout(() => setDetail(null), 0);
      return () => window.clearTimeout(emptyTimer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDetail(null);
      adminApiRequest<SupportCase>(`/support-cases/${selectedId}`, { signal: controller.signal })
        .then((value) => { if (!controller.signal.aborted) setDetail(value); })
        .catch(() => { if (!controller.signal.aborted) setDetail(null); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [detailRevision, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDraft(""); setNotice(""); setMessageError(""); }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !assignedToCurrentAdmin) {
      const emptyTimer = window.setTimeout(() => { setMessages([]); setMessageState("empty"); }, 0);
      return () => window.clearTimeout(emptyTimer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!messages.length) setMessageState("loading");
      setMessageError("");
      adminApiRequest<Page<SupportMessage>>(`/support-cases/${selectedId}/messages?limit=100`, { signal: controller.signal })
        .then((page) => {
          if (controller.signal.aborted) return;
          const chronological = [...page.items].sort((left, right) => Number(left.sequence_no) - Number(right.sequence_no));
          setMessages(chronological); setMessageState(chronological.length ? "success" : "empty");
        })
        .catch((cause) => { if (!controller.signal.aborted) { const failure = adminFailure(cause); setMessages([]); setMessageState(failure.state); setMessageError(failure.message); } });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  // messages is intentionally excluded so a successful poll does not start a request loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedToCurrentAdmin, messageRevision, selectedId]);

  useEffect(() => {
    if (!assignedToCurrentAdmin || selected?.status !== "SERVING") return;
    const timer = window.setInterval(() => setMessageRevision((value) => value + 1), 5_000);
    return () => window.clearInterval(timer);
  }, [assignedToCurrentAdmin, selected?.status]);

  useEffect(() => { messageEndRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const reloadSelected = useCallback(async () => {
    await loadCases();
    setDetailRevision((value) => value + 1);
    setMessageRevision((value) => value + 1);
  }, [loadCases]);

  async function sendReply() {
    const content = draft.trim();
    if (!selected || !content || sending || !canReply || !assignedToCurrentAdmin || selected.status !== "SERVING") return;
    setSending(true); setMessageError(""); setNotice("");
    try {
      await adminApiRequest(`/support-cases/${selected.id}/reply`, { method: "POST", body: JSON.stringify({ client_message_id: `admin-${crypto.randomUUID()}`, content }) });
      setDraft(""); setNotice("回复已由服务端保存并同步给用户。");
      await reloadSelected();
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 409) await reloadSelected();
      setMessageError(cause instanceof AdminApiError && cause.status === 409 ? "工单状态已经变化，已刷新最新记录，请重新确认。" : adminFailure(cause).message);
    } finally { setSending(false); }
  }

  function openAction(kind: ActionKind, item: SupportCase) {
    setDialog({ kind, item }); setReason(""); setTargetQueue(item.queue_key || "general"); setActionError("");
  }

  async function confirmAction() {
    if (!dialog || actionBusy) return;
    if (dialog.kind !== "receive" && reason.trim().length < 2) { setActionError("请填写至少 2 个字符的操作原因。"); return; }
    setActionBusy(true); setActionError("");
    const { item, kind } = dialog;
    try {
      if (kind === "receive") await adminApiRequest(`/support-cases/${item.id}/receive`, { method: "POST", body: JSON.stringify({ version: item.version }) });
      if (kind === "transfer") await adminApiRequest(`/support-cases/${item.id}/transfer`, { method: "POST", body: JSON.stringify({ version: item.version, queue_key: targetQueue, reason: reason.trim() }) });
      if (kind === "close") await adminApiRequest(`/support-cases/${item.id}/close`, { method: "POST", body: JSON.stringify({ version: item.version, reason: reason.trim() }) });
      setDialog(null);
      setNotice(kind === "receive" ? "工单已接入，现在可以查看消息并回复用户。" : kind === "transfer" ? "工单已完成转交。" : "工单已关闭。消息历史仍会保留。");
      await reloadSelected();
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 409) await reloadSelected();
      setActionError(cause instanceof AdminApiError && cause.status === 409 ? "工单已被其他管理员更新，页面已刷新。" : adminFailure(cause).message);
    } finally { setActionBusy(false); }
  }

  const current = detail ?? selected;
  const requesterName = current?.requester?.nickname ?? "平台用户";
  const requesterNo = current?.requester?.public_user_no ?? current?.requester?.phone_mask ?? shortId(current?.requester_id);

  return <>
    <header className={styles.moduleHeader}><div><span>客服工作台</span><h1>客服中心</h1><p>接入工单后可在同一页面查看真实消息、回复用户、转交或关闭；消息每 5 秒自动刷新。</p></div><div className={styles.headerActions}><button className={styles.exportButton} type="button" onClick={() => void reloadSelected()}>刷新当前会话</button></div></header>
    {notice ? <div className={styles.fileNotice} role="status">{notice}</div> : null}
    <section className={styles.supportWorkspace}>
      <aside className={styles.supportQueue}>
        <header><div><b>客服工单</b><span>真实服务端队列</span></div><em>{items.filter((item) => item.status === "WAITING").length}</em></header>
        <label className={styles.supportQueueSearch}><span /><input aria-label="搜索客服工单" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工单号或主题" /></label>
        <div className={styles.supportQueueTabs}>
          {[["", "全部"], ["WAITING", "待接入"], ["SERVING", "服务中"]].map(([value, label]) => <button key={value || "all"} className={status === value ? styles.activeSupportTab : undefined} onClick={() => setStatus(value as "" | SupportStatus)}>{label}</button>)}
        </div>
        <div className={styles.supportSessionList}>
          {listState === "loading" ? <div className={styles.supportEmpty}>正在读取客服工单…</div> : listState === "error" || listState === "offline" ? <div className={styles.supportEmpty}>{listError}<br /><button type="button" onClick={() => void loadCases()}>重新加载</button></div> : listState === "empty" ? <div className={styles.supportEmpty}>当前筛选条件下没有客服工单。</div> : items.map((item) => <button key={item.id} type="button" className={item.id === selectedId ? styles.selectedSupportSession : undefined} onClick={() => setSelectedId(item.id)}>
            <span className={styles.avatarFallback}>{(item.requester?.nickname ?? "用").slice(0, 1)}</span>
            <span><b>{item.requester?.nickname ?? "平台用户"}<em>{priorityLabel(item.priority)}</em></b><small>{item.last_message_preview ?? item.topic}</small><i>{item.case_no} · {queueLabel(item.queue_key)} · {supportStatusLabel(item.status)}</i></span>
            <time>{formatShortTime(item.last_message_at ?? item.created_at)}</time>
          </button>)}
          {nextCursor ? <button type="button" onClick={() => void loadCases(nextCursor)} disabled={loadingMore}><span /><span><b>{loadingMore ? "加载中…" : "加载更多工单"}</b></span><time /></button> : null}
        </div>
      </aside>

      <article className={styles.supportChat}>
        {!current ? <div className={styles.supportEmpty}>请先从左侧选择一个客服工单。</div> : <>
          <header className={styles.supportChatHeader}>
            <div><div className={styles.person}><span className={styles.avatarFallback}>{requesterName.slice(0, 1)}</span><span><b>{requesterName}</b><small>{requesterNo} · {current.topic}</small></span></div><span className={styles.statusBadge}>{supportStatusLabel(current.status)}</span></div>
            <div>
              {canManage && ["WAITING", "TRANSFERRED"].includes(current.status) ? <button className={styles.receiveSupportButton} type="button" onClick={() => openAction("receive", current)}>接入工单</button> : null}
              {canManage && current.status === "SERVING" && current.assigned_admin_id === adminId ? <button type="button" onClick={() => openAction("transfer", current)}>转交</button> : null}
              {canManage && current.status === "SERVING" && current.assigned_admin_id === adminId ? <button className={styles.closeSupportButton} type="button" onClick={() => openAction("close", current)}>关闭</button> : null}
            </div>
          </header>
          <div className={styles.supportNotice}><AdminIcon /><div><b>{assignedToCurrentAdmin ? "你是当前接入客服" : current.status === "WAITING" || current.status === "TRANSFERRED" ? "接入后才能读取用户消息" : "该工单不由当前管理员负责"}</b><small>消息访问由服务端分配关系、MFA 和客服权限共同控制。</small></div></div>
          <div className={styles.supportMessages} aria-live="polite">
            {messageState === "loading" ? <div className={styles.supportEmpty}>正在读取真实聊天记录…</div> : messageState === "error" || messageState === "offline" ? <div className={styles.supportEmpty}>{messageError}<br /><button type="button" onClick={() => setMessageRevision((value) => value + 1)}>重新加载</button></div> : !assignedToCurrentAdmin ? <div className={styles.supportEmpty}>为了保护用户会话，只有当前接入客服可以查看消息。</div> : messageState === "empty" ? <div className={styles.supportEmpty}>当前工单还没有消息。</div> : messages.map((message) => message.sender_role === "SYSTEM" ? <div className={styles.supportSystemMessage} key={message.id}><span>{message.content}</span><time>{formatMessageTime(message.created_at)}</time></div> : <div className={`${styles.supportMessage} ${message.sender_role === "ADMIN" ? styles.supportAgentMessage : ""}`} key={message.id}>
              {message.sender_role !== "ADMIN" ? <span className={styles.avatarFallback}>{requesterName.slice(0, 1)}</span> : null}
              <span><b>{message.sender_role === "ADMIN" ? "平台客服" : requesterName}</b><p>{message.message_type === "STICKER" ? <BearStickerImage id={message.sticker?.id}/> : message.content}</p><small>{formatMessageTime(message.created_at)} · {messageStatusLabel(message.send_status)}</small></span>
              {message.sender_role === "ADMIN" ? <i>客</i> : null}
            </div>)}
            <div ref={messageEndRef} />
          </div>
          <div className={styles.supportComposer}>
            <div className={styles.quickReplies}>{quickReplies.map((value) => <button key={value} type="button" disabled={!canReply || !assignedToCurrentAdmin || current.status !== "SERVING" || sending} onClick={() => setDraft(value)}>{value}</button>)}</div>
            <label><textarea aria-label="回复用户" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder={assignedToCurrentAdmin && current.status === "SERVING" ? "输入回复内容，发送成功后会同步给用户" : "请先接入当前工单"} disabled={!canReply || !assignedToCurrentAdmin || current.status !== "SERVING" || sending} /><small>{draft.length}/1000</small></label>
            {messageError ? <div className={styles.loginError} role="alert">{messageError}</div> : null}
            <footer><span><i />{assignedToCurrentAdmin ? "每 5 秒自动读取新消息" : "消息读取未启用"}</span>{canReply ? <button type="button" disabled={!assignedToCurrentAdmin || current.status !== "SERVING" || !draft.trim() || sending} onClick={() => void sendReply()}>{sending ? "发送中…" : "发送回复"}</button> : <small>当前账号没有客服回复权限</small>}</footer>
          </div>
        </>}
      </article>

      <aside className={styles.supportContext}>
        {!current ? <div className={styles.supportEmpty}>选择工单后显示用户和关联业务信息。</div> : <>
          <section className={styles.supportProfile}><span className={styles.avatarFallback}>{requesterName.slice(0, 1)}</span><div><span>咨询用户</span><b>{requesterName}</b><small>{requesterNo}</small></div><span className={styles.statusBadge}>{priorityLabel(current.priority)}</span></section>
          <section className={styles.supportContextCard}><header><b>关联业务</b><span>{relatedTypeLabel(current.related_type)}</span></header><div className={styles.supportBusiness}><span><i>{relatedTypeLabel(current.related_type)}</i></span><b>{current.related_id ? shortId(current.related_id) : "未关联具体业务"}</b><small>来源页面：{sourcePageLabel(current.source_page)}</small></div></section>
          <section className={styles.supportContextCard}><header><b>工单信息</b><span>{current.case_no}</span></header><dl><div><dt>处理队列</dt><dd>{queueLabel(current.queue_key)}</dd></div><div><dt>优先级</dt><dd>{priorityLabel(current.priority)}</dd></div><div><dt>当前状态</dt><dd>{supportStatusLabel(current.status)}</dd></div><div><dt>接入客服</dt><dd>{current.assigned_admin?.display_name ?? (current.assigned_admin_id ? "已分配管理员" : "尚未分配")}</dd></div><div><dt>创建时间</dt><dd>{formatMessageTime(current.created_at)}</dd></div><div><dt>首次回复</dt><dd>{formatMessageTime(current.first_response_at)}</dd></div></dl></section>
          <p className={styles.supportAuditNote}><AdminIcon />客服接入、回复、转交和关闭均由服务端保存并写入管理员审计记录。</p>
        </>}
      </aside>
    </section>

    {dialog ? <div className={styles.modalBackdrop}><section className={styles.confirmModal} role="dialog" aria-modal="true" aria-label={actionTitle(dialog.kind)}><div className={styles.modalMark}><AdminIcon /></div><h2>{actionTitle(dialog.kind)}</h2><p>{dialog.item.case_no} · {dialog.item.topic}</p>{dialog.kind === "transfer" ? <label><span>目标队列 <b>*</b></span><select value={targetQueue} onChange={(event) => setTargetQueue(event.target.value)} disabled={actionBusy}>{queueOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label> : null}{dialog.kind !== "receive" ? <label><span>操作原因 <b>*</b></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} disabled={actionBusy} placeholder="请输入具体、可审计的处理原因" /><small>{reason.length}/1000</small></label> : null}{actionError ? <div className={styles.modalError} role="alert">{actionError}</div> : null}<div><button type="button" disabled={actionBusy} onClick={() => setDialog(null)}>取消</button><button className={dialog.kind === "close" ? styles.dangerButton : styles.primaryButton} type="button" disabled={actionBusy} onClick={() => void confirmAction()}>{actionBusy ? "提交中…" : actionConfirmLabel(dialog.kind)}</button></div></section></div> : null}
  </>;
}

function AdminIcon() {
  // Fixed same-origin icon; Vinext has no next/image runtime.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/admin-icons/icon-shield.png" alt="" width={190} height={190} />;
}

function supportStatusLabel(value: string) { return ({ WAITING: "待接入", SERVING: "服务中", TRANSFERRED: "已转交", CLOSED: "已关闭" } as Record<string, string>)[value] ?? "未知状态"; }
function priorityLabel(value: string) { return ({ LOW: "低", NORMAL: "普通", HIGH: "高", URGENT: "紧急" } as Record<string, string>)[value] ?? "普通"; }
function queueLabel(value: string) { return queueOptions.find((item) => item.value === value)?.label ?? "其他队列"; }
function relatedTypeLabel(value: string | null | undefined) { return ({ ORDER: "订单", PAYMENT: "支付", REFUND: "退款", COMPLAINT: "投诉", WITHDRAWAL: "提现" } as Record<string, string>)[value ?? ""] ?? "普通咨询"; }
function sourcePageLabel(value: string | null | undefined) { if (!value) return "未记录"; return ({ "/orders": "订单页面", "order-detail": "订单详情", "service-detail": "服务详情", "mine": "个人中心" } as Record<string, string>)[value] ?? "用户端页面"; }
function messageStatusLabel(value: string) { return ({ SENT: "已发送", FAILED: "发送失败", PENDING: "发送中" } as Record<string, string>)[value] ?? "已保存"; }
function actionTitle(kind: ActionKind) { return kind === "receive" ? "接入客服工单" : kind === "transfer" ? "转交客服工单" : "关闭客服工单"; }
function actionConfirmLabel(kind: ActionKind) { return kind === "receive" ? "确认接入" : kind === "transfer" ? "确认转交" : "确认关闭"; }
function shortId(value: string | null | undefined) { if (!value) return "—"; return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value; }
function formatMessageTime(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
function formatShortTime(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "—"; return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }); }
