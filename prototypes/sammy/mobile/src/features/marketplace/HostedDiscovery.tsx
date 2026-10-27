import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ActionButton, Choice, EmptyState, Field, errorKey, money, ui } from '../../components/FormUI';
import { HeroVideo } from '../../components/HeroVideo';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import { api } from './hostedApi';
import { purchaseSnapshot, type OrderPolicy } from './hostedOrders';
import { VariantSheet } from './PurchaseFlow';
import type { ServiceSnapshot } from './domain';
import type { PublicListing } from './listingModels';

function Photo({url,label,large=false}:{url?:string|null;label:string;large?:boolean}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);
 return url&&!failed?<Image source={{uri:url}} onError={()=>setFailed(true)} accessibilityLabel={label} style={{width:'100%',height:large?240:170,borderRadius:20,backgroundColor:'#E4F0FF'}}/>:<View style={{height:large?180:90,backgroundColor:'#E4F0FF',borderRadius:20,alignItems:'center',justifyContent:'center'}}><Text style={ui.heading}>{label}</Text></View>;
}
export function HostedDiscovery({onOpen}:{onOpen:(id:string)=>void}){
 const {t,language}=useLanguage();
 const [q,setQ]=useState(''),[category,setCategory]=useState<'all'|'relaxed'|'ranked'>('all'),[mode,setMode]=useState<'all'|'duo'|'squad'>('all');
 const [items,setItems]=useState<PublicListing[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<TranslationKey|null>(null),[refresh,setRefresh]=useState(0);
 const generation=useRef(0),more=useRef(false);
 const url=()=>'/listings?q='+encodeURIComponent(q.trim())+'&category='+category+'&mode='+mode;
 useEffect(()=>{
  const version=++generation.current;setLoading(true);setError(null);setItems([]);setCursor(null);more.current=false;
  const timer=setTimeout(()=>{void api<{listings:PublicListing[];nextCursor:string|null}>(url(),null).then(data=>{if(version===generation.current){setItems(data.listings);setCursor(data.nextCursor);}}).catch(e=>{if(version===generation.current)setError(errorKey(e));}).finally(()=>{if(version===generation.current)setLoading(false);});},250);
  return()=>{clearTimeout(timer);generation.current++;};
 },[q,category,mode,refresh]);
 const loadMore=async()=>{
  if(more.current||!cursor)return;more.current=true;setLoading(true);setError(null);const version=generation.current;
  try{const data=await api<{listings:PublicListing[];nextCursor:string|null}>(url()+'&after='+cursor,null);if(version===generation.current){setItems(current=>[...current,...data.listings.filter(item=>!current.some(old=>old.id===item.id))]);setCursor(data.nextCursor);}}
  catch(e){if(version===generation.current)setError(errorKey(e));}finally{if(version===generation.current){more.current=false;setLoading(false);}}
 };
 return <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
  <View style={{borderRadius:26,overflow:'hidden',backgroundColor:'white'}}><HeroVideo/><View style={{padding:20,gap:12}}><Text style={ui.title}>{t('heroTitle')}</Text><Text style={ui.body}>{t('heroBody')}</Text></View></View>
  <Field label={t('search')} value={q} onChangeText={setQ} maxLength={80} returnKeyType="search" placeholder={t('listingSearchHint')}/>
  <View style={[ui.row,{flexWrap:'wrap'}]}>{(['all','relaxed','ranked'] as const).map(v=><Choice key={v} label={t(v)} selected={v===category} onPress={()=>setCategory(v)}/>)}</View>
  <View style={[ui.row,{flexWrap:'wrap'}]}>{(['all','duo','squad'] as const).map(v=><Choice key={v} label={t(v==='all'?'listingAllModes':v==='duo'?'modeDuo':'modeSquad')} selected={v===mode} onPress={()=>setMode(v)}/>)}</View>
  <View style={ui.row}><Text accessibilityRole="header" style={[ui.heading,ui.flex]}>{t('recommended')}</Text><ActionButton secondary label={t('listingRefresh')} disabled={loading} onPress={()=>setRefresh(v=>v+1)}/></View>
  {items.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.provider.nickname}, ${money(item.priceFen,language)}`} onPress={()=>onOpen(item.id)} style={ui.card}>
   <Photo url={item.files.find(f=>f.id===(item.photoMediaIds[0]??item.provider.avatarMediaId))?.url} label={item.provider.nickname}/>
   <Text style={ui.caption}>{item.provider.nickname} · {t('game')} · {t(item.category)}</Text><Text style={ui.heading}>{item.title}</Text><Text numberOfLines={2} style={ui.body}>{item.description}</Text>
   <Text style={ui.label}>{money(item.priceFen,language)} {t('perHour')} · {t(item.mode==='duo'?'modeDuo':'modeSquad')}</Text>
  </Pressable>)}
  {loading&&<ActivityIndicator accessibilityLabel={t('loading')}/>}
  {error&&<View style={ui.notice}><Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text><ActionButton label={t('retry')} onPress={()=>setRefresh(v=>v+1)}/></View>}
  {!loading&&!error&&!items.length&&<EmptyState title={t('listingPublicEmpty')} body={t('listingPublicEmptyBody')} mood="curious"/>}
  {!!cursor&&!error&&<ActionButton secondary label={t('listingLoadMore')} busy={loading} onPress={()=>void loadMore()}/>}
 </ScrollView>;
}
export function HostedListingDetail({id,onBack,onPurchase}:{id:string;onBack:()=>void;onPurchase:(service:ServiceSnapshot,quantity:number)=>void}){
 const {t,language}=useLanguage();const [listing,setListing]=useState<PublicListing|null>(null),[error,setError]=useState<TranslationKey|null>(null),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);setListing(null);setError(null);void api<{listing:PublicListing}>('/listings/'+id,null).then(data=>{if(active)setListing(data.listing);}).catch(e=>{if(active)setError(errorKey(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id,refresh]);
 const [policy,setPolicy]=useState<OrderPolicy|null>(null),[options,setOptions]=useState(false),[quantity,setQuantity]=useState(1);
 useEffect(()=>{let active=true;void api<OrderPolicy>('/orders/policy',null).then(p=>{if(active)setPolicy(p);}).catch(e=>{if(active)setError(errorKey(e));});return()=>{active=false;};},[id,refresh]);
 const service=listing&&policy?purchaseSnapshot(listing,policy):null;
 const photos=listing?(listing.photoMediaIds.length?listing.photoMediaIds:[listing.provider.avatarMediaId]):[];
 const voice=listing?.files.find(f=>f.id===listing.provider.voiceMediaId);
 return <ScrollView contentContainerStyle={ui.content}>
  <ActionButton secondary label={t('back')} onPress={onBack}/>
  {loading&&<ActivityIndicator accessibilityLabel={t('loading')}/>}
  {error&&<><Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text><ActionButton label={t('retry')} onPress={()=>setRefresh(v=>v+1)}/></>}
  {listing&&<>
   {photos.map(photo=><Photo key={photo} large url={listing.files.find(f=>f.id===photo)?.url} label={listing.provider.nickname}/>)}
   <Text accessibilityRole="header" style={ui.title}>{listing.title}</Text><Text style={ui.label}>{money(listing.priceFen,language)} {t('perHour')} · {t(listing.mode==='duo'?'modeDuo':'modeSquad')}</Text>
   <Text style={ui.caption}>{t('game')} · {t(listing.category)}</Text><Text style={ui.body}>{listing.description}</Text>
   <View style={ui.card}><Text style={ui.heading}>{listing.provider.nickname}</Text><Text style={ui.body}>{listing.provider.bio}</Text><Text style={ui.caption}>{listing.provider.rank} · {listing.provider.playStyle}</Text></View>
   {voice?.url&&<PublicVoice key={voice.url} url={voice.url}/>}
   <Text style={ui.caption}>{t('listingContentLanguage')}</Text><View style={ui.notice}><Text style={ui.body}>{t('simulationNotice')}</Text></View>
   <ActionButton label={t('book')} disabled={!policy?.simulationEnabled} onPress={()=>setOptions(true)}/>{policy&&!policy.simulationEnabled&&<Text style={ui.caption}>{t('orderSimulationDisabled')}</Text>}
   <ActionButton secondary label={t('listingRefresh')} onPress={()=>setRefresh(v=>v+1)}/>
  </>}
  {service&&<VariantSheet visible={options} service={service} choice={{mode:service.mode,quantity}} onChange={v=>setQuantity(v.quantity)} onClose={()=>setOptions(false)} onConfirm={()=>{setOptions(false);onPurchase(service,quantity);}}/>}
 </ScrollView>;
}
function PublicVoice({url}:{url:string}){
 const {t}=useLanguage();const player=useAudioPlayer(url),status=useAudioPlayerStatus(player);const [error,setError]=useState(false);
 const play=async()=>{try{setError(false);if(status.playing)player.pause();else{if(status.didJustFinish)await player.seekTo(0);player.play();}}catch{setError(true);}};
 return <View style={ui.card}><Text style={ui.heading}>{t('voiceTitle')}</Text><Text style={ui.caption}>{t('listingPublicVoice')}</Text>{(error||status.error)&&<Text style={ui.error}>{t('hostedMediaUnavailable')}</Text>}<ActionButton secondary label={t(status.playing?'voicePause':'voicePlay')} disabled={!status.isLoaded} onPress={()=>void play()}/></View>;
}
