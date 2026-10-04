'use client';
// Display the unmodified licensed transparent emoji files.
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { addRecent, emojiAssetRoot, emojiManifest, emojiTokens, recentEmojiKey, searchEmoji, validRecent, type StandardEmoji } from './standard-emoji';

function EmojiImage({emoji, glyph=emoji.glyph, inline=false}:{emoji:StandardEmoji;glyph?:string;inline?:boolean}) {
  const [failed,setFailed]=useState(false);
  if(failed) return <span title={emoji.label}>{glyph}</span>;
  return <picture><source srcSet={emojiAssetRoot+emoji.assets.webp128} type="image/webp"/><img className={inline?'standard-emoji-inline':'standard-emoji-art'} src={emojiAssetRoot+emoji.assets.png64} width={inline?24:32} height={inline?24:32} alt={inline?glyph:''} title={emoji.label} loading={inline?'eager':'lazy'} draggable={false} onError={()=>setFailed(true)}/></picture>;
}
function copyUnicode(event: ClipboardEvent, region: HTMLElement) {
  const selection = window.getSelection();
  if(!selection?.rangeCount || !event.clipboardData) return;
  const range=selection.getRangeAt(0);
  if(!range.intersectsNode(region)) return;
  const fragment=range.cloneContents(), images=fragment.querySelectorAll<HTMLImageElement>('img.standard-emoji-inline');
  if(!images.length) return;
  images.forEach(img=>img.replaceWith(document.createTextNode(img.alt)));
  event.clipboardData.setData('text/plain',fragment.textContent??''); event.preventDefault();
}
/** Copy events may target the document instead of the selected non-editable bubble. */
export function useEmojiClipboard(regionRef: RefObject<HTMLElement | null>) {
  useEffect(()=>{const copy=(event:ClipboardEvent)=>{if(regionRef.current) copyUnicode(event,regionRef.current)};document.addEventListener('copy',copy);return()=>document.removeEventListener('copy',copy)},[regionRef]);
}
/** Render-only conversion: the message body remains the exact Unicode TEXT payload. */
export function EmojiText({text}:{text:string}) {
  return <span className="standard-emoji-text">{emojiTokens(text).map(token=>token.emoji?<EmojiImage key={token.index} emoji={token.emoji} glyph={token.text} inline/>:token.text)}</span>;
}
export function StandardEmojiPanel({onInsert,onDelete,onKeyboard,disabled=false}:{onInsert:(glyph:string)=>boolean;onDelete:()=>void;onKeyboard:()=>void;disabled?:boolean}) {
  const [category,setCategory]=useState('情绪'),[query,setQuery]=useState(''),[recent,setRecent]=useState<string[]>([]),[status,setStatus]=useState('');
  const id=useId(), panel=useRef<HTMLElement>(null), grid=useRef<HTMLDivElement>(null), search=useRef<HTMLInputElement>(null);
  useEffect(()=>{try{const saved=validRecent(JSON.parse(localStorage.getItem(recentEmojiKey)??'[]')); void Promise.resolve().then(()=>setRecent(saved));}catch{/* Storage may be unavailable; insertion still works. */}},[]);
  useEffect(()=>{grid.current?.scrollTo({top:0,behavior:'instant'})},[query,category]);
  useEffect(()=>{const node=panel.current;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onKeyboard()}};node?.addEventListener('keydown',escape);return()=>node?.removeEventListener('keydown',escape)},[onKeyboard]);
  const rows=searchEmoji(query,category,recent);
  const pick=(emoji:StandardEmoji)=>{if(!onInsert(emoji.glyph)){setStatus('当前无法插入，请先完成文字输入或检查会话状态');return}const next=addRecent(recent,emoji.id);setRecent(next);try{localStorage.setItem(recentEmojiKey,JSON.stringify(next))}catch{/* Recent history is optional. */}setStatus(`已插入${emoji.label}`)};
  const clear=()=>{setQuery('');setStatus('');search.current?.focus()};
  return <section ref={panel} className="standard-emoji-panel" aria-label="标准表情选择面板">
    <div className="standard-emoji-search"><label htmlFor={id} className="standard-emoji-sr">搜索表情中文名称或关键词</label><input ref={search} id={id} type="search" value={query} onChange={event=>{setQuery(event.target.value);setStatus('')}} placeholder="搜索表情名称或关键词" autoComplete="off"/>{query&&<button type="button" onClick={clear} aria-label="清除表情搜索">清除</button>}</div>
    <nav className="standard-emoji-categories" aria-label="标准表情分类">{['常用',...emojiManifest.categories.map(c=>c.name)].map(name=><button type="button" aria-pressed={!query&&category===name} key={name} onClick={event=>{setCategory(name);setQuery('');setStatus('');event.currentTarget.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})}}>{name}</button>)}</nav>
    <div className="standard-emoji-grid" ref={grid} aria-label={query?`表情搜索结果 ${rows.length} 枚`:`${category}表情 ${rows.length} 枚`}>
      {rows.map(emoji=><button type="button" disabled={disabled} className="standard-emoji-pick" key={emoji.id} title={`${emoji.label} ${emoji.glyph}`} aria-label={`插入表情：${emoji.label}`} onPointerDown={event=>{if(event.pointerType==='mouse')event.preventDefault()}} onClick={()=>pick(emoji)}><EmojiImage emoji={emoji}/></button>)}
      {!rows.length&&<div className="standard-emoji-empty"><p>{query?'没有找到表情，试试“开心”或“点赞”。':'用过的表情会出现在这里。'}</p>{query&&<button type="button" onClick={clear}>清除搜索</button>}</div>}
    </div>
    <footer><span role="status" aria-live="polite">{disabled?'当前会话不可输入':status||`${query?'搜索结果':category} · ${rows.length} 枚`}</span><button type="button" disabled={disabled} onClick={onDelete} aria-label="删除输入中的前一个字符或完整表情">退格</button><button type="button" onClick={onKeyboard}>键盘</button></footer>
  </section>;
}
