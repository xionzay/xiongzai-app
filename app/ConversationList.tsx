'use client';

import { CartoonIcon } from "./ui/CartoonIcon";
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type InboxEntry = { id: string; name: string; avatar: string; preview: string; time?: string | number | null; unread?: number; match?: string; matchMessageId?: string };

export type InboxSearchState = { searching: boolean; query: string; searched: string; results: InboxEntry[] | null };

export function ConversationList({ entries, onOpen, search, loading = false, error = '', empty, seller = false, initialSearch, onSearchStateChange }: {
  entries: InboxEntry[]; onOpen: (id: string, matchMessageId?: string) => void;
  search: (keyword: string) => Promise<InboxEntry[]>; loading?: boolean; error?: string; empty?: ReactNode; seller?: boolean; initialSearch?: InboxSearchState; onSearchStateChange?: (state: InboxSearchState) => void;
}) {
  const [searching, setSearching] = useState(initialSearch?.searching ?? false);
  const [query, setQuery] = useState(initialSearch?.query ?? '');
  const [results, setResults] = useState<InboxEntry[] | null>(initialSearch?.results ?? null);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(initialSearch?.searched ?? '');
  useEffect(() => { onSearchStateChange?.({ searching, query, searched, results }); }, [searching, query, searched, results, onSearchStateChange]);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const collapse = () => setSearching(false);
  const clear = () => { request.current++; setQuery(''); setResults(null); setBusy(false); setSearchError(''); setSearched(''); input.current?.focus(); };
  const submit = async () => {
    const keyword = query.trim(); const id = ++request.current;
    if (!keyword) { setResults(null); setSearched(''); setBusy(false); setSearchError(''); return; }
    setBusy(true); setSearchError(''); setResults(null); setSearched(keyword);
    try { const found = await search(keyword); if (id === request.current) setResults(found); }
    catch { if (id === request.current) setSearchError('聊天记录搜索失败，请重试。'); }
    finally { if (id === request.current) setBusy(false); }
  };
  const rows = results ?? entries;
  return <section className={`conversation-inbox${seller ? ' is-seller' : ''}`} aria-label="消息会话">
    <header className="conversation-inbox-header">
      <h1>聊天</h1>
      <button type="button" className="conversation-search-trigger" aria-label={searching ? '关闭会话搜索' : '搜索会话'} aria-expanded={searching} onClick={() => { if (searching) collapse(); else { setSearching(true); requestAnimationFrame(() => input.current?.focus()); } }}>
        <CartoonIcon kind="search" /><span>搜索</span>
      </button>
    </header>
    {searching && <form className="conversation-search-form" role="search" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <input ref={input} aria-label={seller ? '搜索消费者名称或聊天记录' : '搜索对方名称或聊天记录'} placeholder={seller ? '消费者名称、聊天记录' : '对方名称、聊天记录'} maxLength={100} value={query} onChange={event => { setQuery(event.target.value); if (!event.target.value.trim()) { request.current++; setResults(null); setBusy(false); setSearchError(''); setSearched(''); } }} onKeyDown={event => { if (event.key === 'Escape') collapse(); }} enterKeyHint="search" />
      <button type="submit" disabled={busy}>查找</button><button type="button" onClick={collapse}>收起</button>
    </form>}
    {(searched || query) && <div className="seller-search-summary"><span>{searched ? `搜索“${searched}”` : `待查找“${query}”`}</span><button type="button" onClick={clear}>清除</button></div>}
    {(busy || loading) && <p className="conversation-search-state" role="status">{busy ? '正在搜索聊天记录…' : '正在加载会话…'}</p>}
    {(searchError || error) && <p className="conversation-search-state" role="alert">{searchError || error}{searchError && <button type="button" disabled={busy} onClick={() => void submit()}>重试</button>}</p>}
    {!busy && !searchError && <div className="conversation-inbox-rows">{rows.map(row => <button type="button" className="conversation-inbox-row" key={row.id} onClick={() => onOpen(row.id, row.matchMessageId)}>
      <span className="conversation-inbox-avatar"><img src={row.avatar} alt="" />{Boolean(row.unread) && <em>{row.unread! > 99 ? '99+' : row.unread}</em>}</span>
      <span className="conversation-inbox-copy"><span><b>{row.name}</b><time>{row.time ? new Date(row.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</time></span><small>{row.match ?? row.preview}</small>{row.match && <i>聊天记录匹配</i>}</span>
    </button>)}</div>}
    {!busy && !loading && !searchError && !error && rows.length === 0 && <div className="conversation-search-state">{searched ? '没有找到相关名称或聊天记录，试试其他关键词。' : empty ?? '暂无会话'}</div>}
  </section>;
}
