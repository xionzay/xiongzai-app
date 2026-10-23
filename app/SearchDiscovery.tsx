"use client";
import { useEffect, useRef, useState } from "react";
import { CartoonIcon } from "./ui/CartoonIcon";
import { addSearchHistory, readSearchHistory, type SearchEntry, type SearchScope } from "./search-history";

type SearchToolbarProps = {
  query: string;
  onBack: () => void;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onEdit?: () => void;
};

/** Matches the existing homepage search bounds; only its contents change on entry. */
export function SearchToolbar({ query, onBack, onChange, onSubmit, onEdit }: SearchToolbarProps) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  useEffect(() => { if (!onEdit) input.current?.focus({ preventScroll: true }); }, [onEdit]);
  return <form className="discovery-search-bar" role="search" onSubmit={event => {
    event.preventDefault();
    if (!composing.current && query.trim()) onSubmit?.();
  }}>
    <button type="button" className="discovery-back" aria-label="返回" onClick={onBack}><CartoonIcon kind="back" /></button>
    {onEdit ? <button type="button" className="discovery-query" aria-label={`修改搜索：${query}`} onClick={onEdit}>{query || "搜索店铺/商品"}</button> :
      <input ref={input} value={query} onChange={event => onChange?.(event.target.value)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}
        aria-label="搜索关键词" placeholder="搜索店铺/商品" enterKeyHint="search" autoComplete="off" />}
    {!onEdit && query ? <button type="button" className="discovery-clear" aria-label="清除搜索关键词" onClick={() => { onChange?.(""); input.current?.focus({ preventScroll: true }); }}><CartoonIcon kind="close" /></button> : null}
    <button type={onEdit ? "button" : "submit"} className="discovery-submit" disabled={!onEdit && !query.trim()} onClick={onEdit}>{onEdit ? "修改" : "搜索"}</button>
  </form>;
}

export function SearchDiscovery({ scope, query, onDraft, onSearch, onBack, keywords, historyKey }: {
  scope: SearchScope; query: string; onDraft: (scope: SearchScope, query: string) => void;
  onSearch: (scope: SearchScope, query: string) => void; onBack: () => void;
  keywords: string[]; historyKey: string;
}) {
  const [{ history, memoryOnly }, setHistoryState] = useState<{history: SearchEntry[]; memoryOnly: boolean}>(() => {
    try { return { history: readSearchHistory(localStorage.getItem(historyKey)), memoryOnly: false }; }
    catch { return { history: [], memoryOnly: true }; }
  });
  const save = (entries: SearchEntry[]) => {
    let unavailable = false;
    try { localStorage.setItem(historyKey, JSON.stringify(entries)); }
    catch { unavailable = true; }
    setHistoryState({ history: entries, memoryOnly: unavailable });
  };
  const search = (nextScope: SearchScope, keyword: string) => {
    const clean = keyword.trim();
    if (!clean) return;
    save(addSearchHistory(history, { scope: nextScope, query: clean }));
    onSearch(nextScope, clean);
  };
  return <div className="app-screen search-screen search-discovery-screen">
    <SearchToolbar query={query} onBack={onBack} onChange={value => onDraft(scope, value)} onSubmit={() => search(scope, query)} />
    <div className="discovery-scope" role="group" aria-label="搜索范围">
      {(["陪玩", "服务"] as const).map(item => <button key={item} type="button" aria-pressed={scope === item} onClick={() => onDraft(item, query)}>{item === "陪玩" ? "店铺" : "商品"}</button>)}
    </div>
    <section className="discovery-section" aria-label="最近搜索">
      <header><h2>最近搜索</h2><span>{memoryOnly ? "仅本次打开" : "保存在本机"}</span>{history.length > 0 && <button type="button" aria-label="清空搜索记录" onClick={() => save([])}>清空</button>}</header>
      {history.length ? <div className="discovery-history">{history.map(item => <button type="button" key={`${item.scope}:${item.query}`} onClick={() => search(item.scope, item.query)} title={item.query}>{item.query}</button>)}</div> : <p className="discovery-empty">暂无搜索记录</p>}
    </section>
    <section className="discovery-section" aria-label="搜索发现">
      <header><h2>搜索发现</h2><span>来自当前公开{scope === "陪玩" ? "店铺" : "商品"}</span></header>
      {keywords.length ? <div className="discovery-keywords">{keywords.map(item => <button type="button" key={item} onClick={() => search(scope, item)}>{item}</button>)}</div> : <p className="discovery-empty">暂无可推荐的关键词，可以直接输入搜索</p>}
    </section>
  </div>;
}
