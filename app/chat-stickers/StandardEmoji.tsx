'use client';
// Display the unmodified licensed transparent emoji files.
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { ChatIcon } from '../ChatIcon';
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
export function StandardEmojiPanel({searchOpen=false,onSearchClose,onInsert,onDelete,onKeyboard,disabled=false,canDelete=true,onSend,canSend=false,sendLabel="发送消息",sending=false}:{searchOpen?:boolean;onSearchClose?:()=>void;onSend?:()=>void;canSend?:boolean;canDelete?:boolean;sendLabel?:string;sending?:boolean;onInsert:(glyph:string)=>boolean;onDelete:()=>void;onKeyboard:()=>void;disabled?:boolean}) {
  const [category,setCategory]=useState('全部'),[query,setQuery]=useState(''),[recent,setRecent]=useState<string[]>([]),[recentPreview,setRecentPreview]=useState<string[]>([]),[status,setStatus]=useState('');
  const id=useId(), panel=useRef<HTMLElement>(null), grid=useRef<HTMLDivElement>(null), search=useRef<HTMLInputElement>(null);
  useEffect(()=>{try{const saved=validRecent(JSON.parse(localStorage.getItem(recentEmojiKey)??'[]')); void Promise.resolve().then(()=>{setRecent(saved);setRecentPreview(saved)});}catch{/* Storage may be unavailable; insertion still works. */}},[]);
  useEffect(()=>{if(searchOpen)search.current?.focus()},[searchOpen]);
  useEffect(()=>{grid.current?.scrollTo({top:0,behavior:'instant'})},[query,category]);
  useEffect(()=>{const node=panel.current;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onKeyboard()}};node?.addEventListener('keydown',escape);return()=>node?.removeEventListener('keydown',escape)},[onKeyboard]);
  const activeCategory=searchOpen?category:'全部', activeQuery=searchOpen?query:'';
  const rows=searchEmoji(activeQuery,activeCategory,recent);
  const pick=(emoji:StandardEmoji)=>{if(!onInsert(emoji.glyph)){setStatus('当前无法插入，请先完成文字输入或检查会话状态');return}const next=addRecent(recent,emoji.id);setRecent(next);try{localStorage.setItem(recentEmojiKey,JSON.stringify(next))}catch{/* Recent history is optional. */}setStatus(`已插入${emoji.label}`)};
  const recentRows=!activeQuery&&activeCategory==='全部'?searchEmoji('', '常用', recentPreview).slice(0,8):[];
  const emojiButton=(emoji:StandardEmoji,prefix='')=><button type="button" disabled={disabled} className="standard-emoji-pick" key={prefix+emoji.id} title={`${emoji.label} ${emoji.glyph}`} aria-label={`插入表情：${emoji.label}`} onPointerDown={event=>{if(event.pointerType==='mouse')event.preventDefault()}} onClick={()=>pick(emoji)}><EmojiImage emoji={emoji}/></button>;
  const clear=()=>{setQuery('');setStatus('');search.current?.focus()};
  return <section ref={panel} className="standard-emoji-panel" aria-label="标准表情选择面板">
    {searchOpen && <div className="standard-emoji-search"><label htmlFor={id} className="standard-emoji-sr">搜索表情中文名称或关键词</label><input ref={search} id={id} type="search" value={query} onChange={event=>{setQuery(event.target.value);setStatus('')}} placeholder="搜索表情名称或关键词" autoComplete="off"/>{query&&<button type="button" onClick={clear} aria-label="清除表情搜索">清除</button>}<button type="button" aria-label="关闭表情搜索" onClick={()=>{onSearchClose?.();setQuery('')}}>取消</button></div>}
    {searchOpen && <div className="standard-emoji-filter"><nav className="standard-emoji-categories" aria-label="标准表情分类">{['全部','常用',...emojiManifest.categories.map(c=>c.name)].map(name=><button type="button" aria-pressed={!query&&category===name} key={name} onClick={event=>{setCategory(name);setQuery('');setStatus('');event.currentTarget.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})}}>{name}</button>)}</nav></div>}
    <div className="standard-emoji-grid" ref={grid} aria-label={query?`表情搜索结果 ${rows.length} 枚`:`${category}表情 ${rows.length} 枚`}>
      {recentRows.length>0&&<><h3 className="standard-emoji-group-label">最近使用</h3>{recentRows.map(e=>emojiButton(e,'recent-'))}</>}
      {!activeQuery && activeCategory==='全部' && <h3 className="standard-emoji-group-label">全部表情</h3>}
      {rows.map(e=>emojiButton(e))}
      {!rows.length&&<div className="standard-emoji-empty"><p>{query?'没有找到表情，试试“开心”或“点赞”。':'用过的表情会出现在这里。'}</p>{query&&<button type="button" onClick={clear}>清除搜索</button>}</div>}
    </div>
    <footer><span className="standard-emoji-sr" role="status" aria-live="polite">{disabled?'当前会话不可输入':status}</span><button type="button" className="standard-emoji-delete" disabled={disabled || !canDelete} onPointerDown={event=>event.preventDefault()} onClick={onDelete} aria-label="删除输入中的前一个字符或完整表情"><ChatIcon kind="delete" /></button>{onSend&&<button type="button" className="chat-panel-send" aria-label={sendLabel} disabled={!canSend} onPointerDown={event=>event.preventDefault()} onClick={onSend}>{sending?'发送中':'发送'}</button>}</footer>
  </section>;
}
