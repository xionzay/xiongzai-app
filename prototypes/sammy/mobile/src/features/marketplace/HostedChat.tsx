import {readChatDraft,saveChatDraft,type PendingMessage} from './chatDrafts';
import {gameName} from './catalog';
import {commerceStateLabel} from './commerceCopy';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,Keyboard,Text,View} from 'react-native';
import {ActionButton,Choice,Field,money,ui} from '../../components/FormUI';
import {useLanguage} from '../../i18n/LanguageProvider';
import {HostedError} from './hostedApi';
import {commerceApi,type CommerceObject} from './commerceApi';
import {localId} from './useMarketplace';
import {mergeMessages,type ChatMessage} from './chatState';

export function HostedChat({id,onOrder,onProduct}:{id:string;onOrder?:(id:string)=>void;onProduct?:(id:string)=>void}){
 const {language}=useLanguage();const text=(en:string,zh:string)=>language==='zh'?zh:en;
 const [items,setItems]=useState<ChatMessage[]>([]),[viewer,setViewer]=useState(''),[body,setBody]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[hasMore,setHasMore]=useState(false),[kind,setKind]=useState<'text'|'order'|'product'>('text'),[objects,setObjects]=useState<CommerceObject[]>([]),[objectId,setObjectId]=useState<string|null>(null);
 const [picker,setPicker]=useState(false),[query,setQuery]=useState(''),[cardPage,setCardPage]=useState(1),[cardMore,setCardMore]=useState(false);
 const initialized=useRef(false),draftBody=useRef(''),pickVersion=useRef(0);
 const page=useRef(1),generation=useRef(0),fetching=useRef(false),sending=useRef(false);
 const pending=useRef<PendingMessage|null>(null);
 const load=async(more=false)=>{
  if(fetching.current)return;fetching.current=true;const version=generation.current;
  try{
   const next=more?page.current+1:1;
   const data=await commerceApi('/conversations/'+id+'/messages?page='+next);
   if(version!==generation.current)return;
   if(!initialized.current){const saved=await readChatDraft(data.viewerId,id);if(version!==generation.current)return;setBody(saved.body);draftBody.current=saved.body;pending.current=saved.pending;if(saved.pending){setKind(saved.pending.kind as 'text'|'order'|'product');setObjectId(saved.pending.objectId??null);}initialized.current=true;}
   setViewer(data.viewerId);setItems(old=>mergeMessages(old,data.messages));
   if(more||page.current===1){page.current=next;setHasMore(data.messages.length===30);}
   // Only acknowledge delivered messages, never ones that arrived after this fetch.
   await commerceApi('/conversations/'+id+'/read',{messageIds:data.messages.map((m:ChatMessage)=>m.id)});
  }catch{if(version===generation.current)setNotice(text('Could not update messages. Check your connection and retry.','消息更新失败，请检查网络后重试。'));}
  finally{if(version===generation.current){fetching.current=false;setLoading(false);}}
 };
 useEffect(()=>{
  generation.current++;page.current=1;fetching.current=false;setItems([]);setLoading(true);initialized.current=false;void load();
  const timer=setInterval(()=>{if(AppState.currentState==='active')void load();},5000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active')void load();});
  return()=>{generation.current++;clearInterval(timer);sub.remove();};
 },[id]);
 const pick=async(next:'order'|'product',q='',more=false)=>{
  if(sending.current||pending.current)return;Keyboard.dismiss();setPicker(true);setKind(next);setObjectId(null);const pickId=++pickVersion.current;const nextPage=more?cardPage+1:1;
  try{const data=await commerceApi('/conversations/'+id+'/cards?kind='+next+'&q='+encodeURIComponent(q)+'&page='+nextPage);if(pickId===pickVersion.current){setObjects(old=>more?[...old,...data.items]:data.items);setCardPage(nextPage);setCardMore(data.hasMore);}}
  catch{setNotice(text('Could not load cards. Try again.','卡片加载失败，请重试。'));}
 };
 const send=async()=>{
  if(sending.current)return;
  const payload=pending.current??{requestId:localId('message'),kind,...(kind==='text'?{text:body.trim()}:{objectId:objectId!})};
  pending.current=payload;sending.current=true;setBusy(true);setNotice('');const version=generation.current;
  try{
   await saveChatDraft(viewer,id,{body:draftBody.current,pending:payload});
   const result=await commerceApi('/conversations/'+id+'/messages',payload);
   if(version!==generation.current)return;
   setItems(old=>mergeMessages(old,[result.message]));pending.current=null;setBody('');draftBody.current='';setObjectId(null);setKind('text');setPicker(false);await saveChatDraft(viewer,id,{body:'',pending:null});void load();
  }catch(e){if(version===generation.current){if(e instanceof HostedError && ['messageInvalid','checkFields','cardNotAuthorized'].includes(e.message)){pending.current=null;void saveChatDraft(viewer,id,{body:draftBody.current,pending:null});setNotice(text('Check your message or choose another card. Do not include passwords or verification codes.','请检查消息或重新选择卡片，请勿包含密码或验证码。'));}else setNotice(text('Message not confirmed. Retry to send it safely without duplicates.','消息尚未确认，请重试，不会重复发送。'));}}
  finally{sending.current=false;if(version===generation.current)setBusy(false);}
 };
 const locked=busy||!!pending.current||!initialized.current;
 return <View style={{gap:14}}>
  <Text style={ui.caption}>{text('Keep your conversations here. Never share passwords or verification codes.','在这里沟通，请勿分享密码或验证码。')}</Text>
  {loading&&<ActivityIndicator/>}
  {hasMore&&<ActionButton secondary label={text('Older messages','更早消息')} onPress={()=>void load(true)}/>}
  {!loading&&!items.length&&<Text style={ui.body}>{text('Say hello or ask about the service.','打个招呼，或询问服务详情。')}</Text>}
  {items.map(m=><View key={m.id} style={[ui.card,{maxWidth:'90%',alignSelf:m.senderId===viewer?'flex-end':'flex-start',backgroundColor:m.senderId===viewer?'#DDEEFF':'#FFFFFF'}]}>
   <Text style={ui.caption}>{m.senderId===viewer?text('You','你'):text('Companion','伙伴')} · {new Date(m.createdAt).toLocaleString(language==='zh'?'zh-CN':'en-GB')}</Text>
   <Text selectable style={ui.body}>{m.card?.title??m.body}</Text>{m.card&&<>{m.card.imageUrl&&<Image source={{uri:m.card.imageUrl}} style={{width:180,height:110,borderRadius:12}}/>}{m.card.game&&<Text style={ui.caption}>{gameName(m.card.game,language)}</Text>}{m.kind==='product'?<><Text style={ui.label}>{m.card.priceFen!=null?money(m.card.priceFen,language):''} / {text('hour','小时')}</Text>{m.card.available===false&&<Text style={ui.caption}>{text('Currently unavailable','当前不可用')}</Text>}</>:<><Text selectable style={ui.caption}>{text('Order','订单')} · {m.objectId}</Text><Text style={ui.caption}>{text('Quantity','数量')}: {m.card.quantity} · {commerceStateLabel(m.card.caseState??m.card.status,language)}</Text><Text style={ui.label}>{m.card.paid?text('Paid','已付'):text('Amount due','待付')}: {money(m.card.totalFen??0,language)}</Text>{m.card.refundedFen>0&&<Text style={ui.caption}>{text('Refunded','已退款')}: {money(m.card.refundedFen,language)}</Text>}</>}</>}
   {m.kind!=='text'&&<ActionButton secondary label={m.kind==='order'?text('View order','查看订单'):text('View service','查看服务')} disabled={m.kind==='order'?!onOrder:!onProduct} onPress={()=>{if(m.kind==='order')onOrder?.(m.objectId!);else onProduct?.(m.objectId!);}}/>}
  </View>)}
  <View style={ui.choiceRow}>
   <Choice label={text('Text','文字')} selected={kind==='text'} onPress={()=>{if(!locked){setKind('text');setPicker(false);}}}/>
   <Choice label={text('＋ Order','＋ 订单')} selected={kind==='order'} onPress={()=>void pick('order')}/>
   <Choice label={text('＋ Service','＋ 服务')} selected={kind==='product'} onPress={()=>void pick('product')}/>
  </View>
  {kind==='text'?<Field label={text('Message','消息')} placeholder={text('Write a message…','输入消息…')} value={body} editable={!locked} onChangeText={value=>{draftBody.current=value;setBody(value);if(viewer)void saveChatDraft(viewer,id,{body:value,pending:pending.current}).catch(()=>setNotice(text('Could not save your draft.','草稿保存失败。')));}} multiline maxLength={1000}/>:<><ActionButton secondary label={text('Back to message','返回消息')} onPress={()=>{if(!locked){setKind('text');setPicker(false);}}}/><Field label={text('Search cards','搜索卡片')} value={query} onChangeText={value=>{setQuery(value);void pick(kind as 'order'|'product',value);}}/>{!objects.length&&<Text style={ui.caption}>{text('No cards available.','暂无可发送的卡片。')}</Text>}{objects.map(o=><Choice key={o.id} label={o.title+(o.priceFen!=null?' · '+money(o.priceFen,language):'')} selected={objectId===o.id} onPress={()=>{if(!locked)setObjectId(o.id);}}/>)}{cardMore&&<ActionButton secondary label={text('More cards','更多卡片')} onPress={()=>void pick(kind as 'order'|'product',query,true)}/>}</>}
  {!!notice&&<Text accessibilityRole="alert" style={ui.error}>{notice}</Text>}
  <ActionButton label={pending.current?text('Retry sending','重试发送'):text('Send','发送')} busy={busy} disabled={!initialized.current||(kind==='text'?!body.trim():!objectId)} onPress={()=>void send()}/>
  <ActionButton secondary label={text('Refresh messages','刷新消息')} onPress={()=>{setNotice('');void load();}}/>
 </View>;
}
