'use client';
import {useEffect,useRef,useState,useImperativeHandle,type Ref} from 'react';
import {ThemedFilePicker} from './ui/ThemedFilePicker';
import {CartoonIcon} from './ui/CartoonIcon';
import {ChatIcon, type ChatIconKind} from './ChatIcon';
import {PRODUCT_GAMES} from './product-decisions';

export type Feedback = {id:string;text:string;createdAt:string;reply?:string};
export type Coupon = {id:string;title:string;thresholdCent:string;discountCent:string;expiresAt:string;claimed:boolean};
/** Deliberately not connected to support cases or fabricated endpoints. Wire audited APIs here when available. */
export type CommunityApi = {feedback: {list:()=>Promise<Feedback[]>;submit:(text:string,key:string)=>Promise<Feedback>};coupons:{list:()=>Promise<Coupon[]>;claim:(id:string,key:string)=>Promise<Coupon>}};
export const communityApi: CommunityApi | undefined = undefined;
function Heading({title,back}:{title:string;back:()=>void}){return <header className="decision-heading"><button aria-label="返回" onClick={back}><CartoonIcon kind="back"/></button><h1>{title}</h1><span/></header>}
export function FeedbackPage({back,api=communityApi}:{back:()=>void;api?:CommunityApi}) {
 const [text,setText]=useState(''),[rows,setRows]=useState<Feedback[]>([]),[view,setView]=useState<'write'|'list'|'detail'>('write'),[selected,setSelected]=useState<Feedback|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false); const lock=useRef(false),key=useRef('');
 const load=async()=>{setView('list');if(!api)return;setBusy(true);setError('');try{setRows(await api.feedback.list())}catch(e){setError(String(e instanceof Error?e.message:e))}finally{setBusy(false)}};
 const submit=async()=>{if(!api||!text.trim()||lock.current)return;lock.current=true;setBusy(true);setError('');key.current ||= crypto.randomUUID();try{const row=await api.feedback.submit(text.trim(),key.current);setSelected(row);setRows(r=>[row,...r.filter(v=>v.id!==row.id)]);setView('detail');setText('');key.current=''}catch(e){setError(e instanceof Error?e.message:'提交失败，请重试')}finally{lock.current=false;setBusy(false)}};
 return <div className="app-screen decision-page"><Heading title={view==='write'?'意见反馈':view==='list'?'我的反馈':'反馈详情'} back={()=>view==='write'?back():setView('write')}/>{!api&&<p role="status" className="decision-info">官方留言接口尚未接通，当前不能提交或读取反馈记录。这里不会转为客服工单。</p>}{view==='write'?<><label>你的建议<textarea aria-label="文字建议" value={text} onChange={e=>{setText(e.target.value);key.current=''}} placeholder="告诉我们你希望改进的地方"/></label><button className="full-primary" disabled={!api||busy||!text.trim()} onClick={()=>void submit()}>{busy?'正在提交…':'提交建议'}</button><button className="decision-row" onClick={()=>void load()}>我的反馈<em><CartoonIcon kind="back" className="toon-glyph toon-glyph-right" label="打开" /></em></button></>:view==='list'?<>{busy?<p role="status">正在读取反馈…</p>:api&&!rows.length&&!error?<p>还没有提交过反馈</p>:null}{rows.map(r=><button className="decision-row" key={r.id} onClick={()=>{setSelected(r);setView('detail')}}><span>{r.text}<small>{r.reply?'官方已回复':'等待官方回复'}</small></span><em><CartoonIcon kind="back" className="toon-glyph toon-glyph-right" label="打开" /></em></button>)}</>:selected?<article><p>{selected.text}</p><small>{selected.createdAt}</small><h2>官方回复</h2><p>{selected.reply||'等待官方回复'}</p></article>:null}{error&&<p role="alert">{error}<button className="toon-action" disabled={busy} onClick={()=>void(view==='list'?load():submit())}>重试</button></p>}</div>
}
export function CouponCenter({back,api=communityApi}:{back:()=>void;api?:CommunityApi}){
 const [rows,setRows]=useState<Coupon[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');const lock=useRef(false),keys=useRef<Record<string,string>>({});
 const load=async()=>{if(!api||lock.current)return;lock.current=true;setBusy('list');setError('');try{setRows(await api.coupons.list())}catch(e){setError(e instanceof Error?e.message:'加载失败')}finally{lock.current=false;setBusy('')}};
 const claim=async(c:Coupon)=>{if(!api||lock.current||c.claimed)return;lock.current=true;setBusy(c.id);setError('');try{const updated=await api.coupons.claim(c.id,keys.current[c.id] ||= crypto.randomUUID());setRows(r=>r?.map(v=>v.id===updated.id?updated:v)??[updated])}catch(e){setError(e instanceof Error?e.message:'领取失败，请重试')}finally{lock.current=false;setBusy('')}};
 return <div className="app-screen decision-page"><Heading title="领券中心" back={back}/><h2>平台满减券</h2><p>每笔订单最多使用一张。确认订单时可更换或不使用，优惠以服务端核算为准。</p>{!api?<p className="decision-info" role="status">优惠券查询、领取与订单核价接口尚未接通，当前没有可领取的券。</p>:<><button className="toon-action" disabled={!!busy} onClick={()=>void load()}>{busy==='list'?'正在加载…':rows?'刷新优惠券':'加载优惠券'}</button>{rows?.map(c=><article className="decision-coupon" key={c.id}><h2>{c.title}</h2><strong>满 ¥{(Number(c.thresholdCent)/100).toFixed(2)} 减 ¥{(Number(c.discountCent)/100).toFixed(2)}</strong><p>有效期至 {c.expiresAt}</p><button className="toon-action toon-action-primary" disabled={!!busy||c.claimed} onClick={()=>void claim(c)}>{c.claimed?'已领取':busy===c.id?'领取中…':'领取'}</button></article>)}{rows?.length===0&&!error&&<p>暂无可领取优惠券</p>}</>}{error&&<p role="alert">{error}</p>}</div>
}
export function GameFilter({value,onChange,all=true}:{value:string;onChange:(value:string)=>void;all?:boolean}){return <div className="decision-games" aria-label="游戏筛选">{(all?['全部',...PRODUCT_GAMES]:PRODUCT_GAMES).map(g=><button key={g} aria-pressed={value===g} onClick={()=>onChange(g)}>{g}</button>)}</div>}
export type ChatAttachment = {id:string;title:string;kind:'PRODUCT'|'ORDER';subtitle?:string;onOpen?:()=>void};
export type ChatRichApi = {send:(payload:{kind:string;objectId?:string;file?:File;clientMessageId:string})=>Promise<void>};
function LocalMediaPreview({file}:{file:File}) {
 const [url,setUrl]=useState('');
 useEffect(()=>{const value=URL.createObjectURL(file);void Promise.resolve().then(()=>setUrl(value));return()=>URL.revokeObjectURL(value)},[file]);
 if(!url)return null;
 return <figure className="decision-media-preview">{file.type.startsWith('image/')?<img src={url} alt="尚未发送的图片预览"/>:file.type.startsWith('video/')?<video controls playsInline src={url}><track kind="captions" label="原视频未提供字幕"/></video>:<audio controls src={url}><track kind="captions" label="原语音未提供文字"/></audio>}<figcaption>仅在本机预览，尚未发送</figcaption></figure>;
}
export type ChatPlusHandle = { selectKind: (name: string) => void };
export function ChatPlusPanel({ ref, items = [], api, open: controlledOpen, onOpenChange, hideTrigger = false, onDraftChange }: {
 ref?: Ref<ChatPlusHandle>; items?: ChatAttachment[]; api?: ChatRichApi; open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean; onDraftChange?: (hasDraft: boolean) => void;
}) {
 const [localOpen, setLocalOpen] = useState(false);
 const open = controlledOpen ?? localOpen;
 const changeOpen = (value: boolean) => { if (controlledOpen === undefined) setLocalOpen(value); onOpenChange?.(value); };
 const [selected, setSelected] = useState(''), [card, setCard] = useState<ChatAttachment | null>(null), [file, setFile] = useState<File | null>(null);
 const [error, setError] = useState(''), [busy, setBusy] = useState(false), [pendingKind, setPendingKind] = useState('');
 const lock = useRef(false), key = useRef('');
 useEffect(() => { onDraftChange?.(Boolean(file || card)); }, [file, card, onDraftChange]);
 const selectKind = (name: string) => {
  if (busy || selected === name) return;
  if (file || card) { setPendingKind(name); return; }
  setSelected(name); setError(''); key.current = '';
 };
 useImperativeHandle(ref, () => ({ selectKind }));
 const send = async () => {
  if (!api || lock.current || (!file && !card)) return;
  lock.current = true; setBusy(true); setError(''); key.current ||= crypto.randomUUID();
  try { await api.send({ kind: card?.kind ?? selected, objectId: card?.id, file: file ?? undefined, clientMessageId: key.current }); setCard(null); setFile(null); key.current = ''; changeOpen(false); }
  catch (e) { setError(e instanceof Error ? e.message : '发送失败，请重试'); }
  finally { lock.current = false; setBusy(false); }
 };
 return <>
  {!hideTrigger && <button type="button" aria-label="聊天更多功能" aria-expanded={open} onClick={() => changeOpen(!open)}><ChatIcon kind={open ? 'close' : 'plus'} /></button>}
  {open && <section className="decision-chat-panel" aria-label="聊天加号面板">
   <div className="chat-function-grid">{['图片', '视频', '语音', '发送商品', '发送订单'].map((name, i) => <button type="button" key={name} disabled={busy} aria-pressed={selected === name} onClick={() => selectKind(name)}><span className="chat-function-icon"><ChatIcon kind={(['image', 'video', 'audio', 'product', 'order'] as ChatIconKind[])[i]} /></span><span>{name === '语音' ? '语音文件' : name}</span></button>)}</div>
   {pendingKind && <div className="chat-attachment-confirm" role="group" aria-label="处理未发送附件"><p>切换类型会移除尚未发送的附件，是否继续？</p><button className="toon-action" type="button" onClick={() => setPendingKind('')}>保留附件</button><button className="toon-action" type="button" onClick={() => { setSelected(pendingKind); setPendingKind(''); setFile(null); setCard(null); setError(''); key.current = ''; }}>移除并切换</button></div>}
   {selected && <>
    <h3>{selected === '语音' ? '选择语音文件' : selected}</h3>
    {['图片', '视频', '语音'].includes(selected) ? <div className="decision-file-selection"><ThemedFilePicker aria-label={`选择${selected}文件`} disabled={busy} accept={selected === '图片' ? 'image/*' : selected === '视频' ? 'video/*' : 'audio/*'} onChange={event => { const next = event.target.files?.[0]; if (next) { setFile(next); key.current = ''; setError(''); } }}>从设备选择{selected}</ThemedFilePicker>{selected === '语音' && <small>选择语音文件，暂不支持按住录音。</small>}{file && <><small>已选择：{file.name} · 尚未发送</small><button className="toon-action" type="button" disabled={busy} onClick={() => { setFile(null); key.current = ''; }}>移除附件</button></>}</div> : <div className="decision-chat-items">{items.filter(item => item.kind === (selected === '发送商品' ? 'PRODUCT' : 'ORDER')).map(item => <button type="button" disabled={busy} key={item.id} aria-pressed={card?.id === item.id} onClick={() => { setCard(item); key.current = ''; }}>{item.title}<small>{item.subtitle}</small></button>)}{!items.some(item => item.kind === (selected === '发送商品' ? 'PRODUCT' : 'ORDER')) && <p>当前会话没有可选择的{selected === '发送商品' ? '商品' : '订单'}。候选列表需要服务端按会话参与者授权返回。</p>}</div>}
    {file && <LocalMediaPreview file={file} />}
    {card && <article><b>{card.title}</b><p>{card.subtitle}</p>{card.onOpen && <button className="toon-action" type="button" onClick={card.onOpen}>预览卡片目标</button>}<button className="toon-action" type="button" disabled={busy} onClick={() => { setCard(null); key.current = ''; }}>取消选择</button></article>}
    {!api && <p role="status">当前网页尚未接通此类消息的上传和发送，所选内容不会发送给对方。</p>}
    {(file || card) && <p>切换表情或收起面板会保留附件；离开会话前请完成发送或移除。</p>}
    {error && <p role="alert">{error}，可以重试。</p>}
    <button className="toon-action toon-action-primary" type="button" disabled={!api || busy || (!file && !card)} onClick={() => void send()}>{busy ? '发送中…' : error ? '重试发送' : '确认发送'}</button>
   </>}
  </section>}
 </>;
}
