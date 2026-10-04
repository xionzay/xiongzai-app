'use client';

import { ChatPlusPanel } from '../ProductDecisionPages';
import { CartoonIcon } from '../ui/CartoonIcon';
import { useEffect, useRef, useState } from 'react';
import { orderLabel, type Role, type TradeOrder } from '../trade-v31/model';
import type { TradeStore } from '../trade-v31/TradeWorkspace';

/** Local preview conversation shared by the inbox and order-detail entry points. */
export function OrderConversation({ order, orders, viewerRole: role, store, openOrder }: {
  order: TradeOrder; orders: TradeOrder[]; viewerRole: Role; store: TradeStore; openOrder: (id: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const stream = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const messages = store.messages[order.id] ?? [];
  const draft = drafts[order.id] ?? '';
  const setDraft = (value: string) => setDrafts(previous => ({ ...previous, [order.id]: value }));
  useEffect(() => { const target = store.messageTarget.current; const hit = target?.orderId === order.id ? stream.current?.querySelector<HTMLElement>(`[data-message-index="${target.index}"]`) : null; if (hit) { hit.scrollIntoView({ block: 'center' }); hit.focus({ preventScroll: true }); store.messageTarget.current = null; } else stream.current?.scrollTo({ top: stream.current.scrollHeight }); }, [order.id, messages.length]);
  const replies = [
    ['核对服务', '你好，我来核对一下服务内容。'],
    ['确认区服', '请确认游戏大区与游戏 ID。'],
    ['完成提醒', '服务完成后会提交履约凭证，请留意订单。'],
  ];
  return <div className="sw-conversation">
    <section className="sw-order-context" aria-label="当前关联订单">
      <button className="sw-order-summary" onClick={() => openOrder(order.id)}>
        <img src={order.cover} alt="" />
        <span><b>{order.title}</b><small>{order.spec}</small><small>{order.id} · {orderLabel(order)}</small></span><em>›</em>
      </button>
      <details className="sw-order-switcher">
        <summary>关联订单 · 共 {orders.length} 笔<span>切换订单 <CartoonIcon kind="chevron" /></span></summary>
        <div>{orders.map(item => <button key={item.id} aria-pressed={item.id === order.id} onClick={event => { store.setSelected(item.id); const details = event.currentTarget.closest('details'); if (details) { details.open = false; details.querySelector('summary')?.focus(); } }}><span>{item.id}<small>{item.title}</small></span><b>{orderLabel(item)}</b></button>)}</div>
      </details>
    </section>
    <div ref={stream} className="sw-conversation-stream" role="log" aria-label={role === 'seller' ? '买家会话' : '商家会话'} aria-live="polite">
      {messages.length === 0 && <p className="sw-conversation-empty">从这里沟通服务安排</p>}
      {messages.map((message, index) => <div key={index} tabIndex={-1} data-message-index={index} className={`sw-message ${message.role === role ? 'is-self' : ''}`}>
        <img src={message.role === 'seller' ? '/assets/xiongzai-icon.png' : '/assets/home-companions/avatar-02.jpg'} alt={message.role === 'seller' ? '卖家头像' : '买家头像'} />
        <p>{message.text}<small style={{ display: 'block', fontSize: 12, opacity: .7 }}>{message.sentAt ? new Date(message.sentAt).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) : ''} · 本地预览</small></p>
      </div>)}
    </div>
    <div className="sw-conversation-dock">
      {role === 'seller' && <div className="sw-reply-shortcuts" aria-label="快捷回复">{replies.map(([label, text]) => <button key={label} onClick={() => { setDraft(text); input.current?.focus(); }}>{label}</button>)}</div>}
      <form className="sw-conversation-compose" onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; store.setMessages(previous => ({ ...previous, [order.id]: [...(previous[order.id] ?? []), { role, text: draft.trim(), sentAt: Date.now() }] })); setDraft(''); input.current?.focus(); }}>
        <input ref={input} aria-label="消息内容" maxLength={500} placeholder="输入消息…" value={draft} onChange={event => setDraft(event.target.value)} enterKeyHint="send" />
        <ChatPlusPanel items={orders.map(item=>({id:item.id,title:item.title,subtitle:item.id,kind:'ORDER' as const,onOpen:()=>openOrder(item.id)}))}/><button disabled={!draft.trim()} type="submit">发送</button>
      </form>
    </div>
  </div>;
}
