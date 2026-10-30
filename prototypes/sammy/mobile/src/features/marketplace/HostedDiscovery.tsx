import {CatalogCover,CompanionCard,ServiceCard} from './CatalogCards';
import {listingCopy,providerCopy} from './catalogPresentation';
import {games,gameName,serviceTypeName,type Game} from './catalog';
import {commerceApi,type CommerceObject} from './commerceApi';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ActionButton, EmptyState, Field, Sheet, errorKey, money, ui } from '../../components/FormUI';
import { colors } from '../../theme';
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
function FilterChip({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}) {
 return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{selected}} onPress={onPress} style={({pressed})=>[discoveryStyles.chip,selected&&discoveryStyles.chipSelected,pressed&&{opacity:0.75}]}><Text style={[discoveryStyles.chipText,selected&&discoveryStyles.chipTextSelected]}>{label}</Text></Pressable>;
}
export function HostedDiscovery({onOpen,onStore,onShortcut,active=true}:{active?:boolean;onOpen:(id:string)=>void;onStore:(id:string)=>void;onShortcut:(name:string)=>void}){
 const {t,language}=useLanguage();
 const [section,setSection]=useState<'recommended'|'companions'|'services'>('recommended'),[game,setGame]=useState<Game|'all'>('all'),[serviceType,setServiceType]=useState('all'),[sort,setSort]=useState('recent'),[stores,setStores]=useState<CommerceObject[]>([]),[home,setHome]=useState<CommerceObject|null>(null),[page,setPage]=useState(1),[storeMore,setStoreMore]=useState(false);
 const [q,setQ]=useState(''),[category,setCategory]=useState<'all'|'relaxed'|'ranked'>('all'),[mode,setMode]=useState<'all'|'duo'|'squad'>('all');
 const [items,setItems]=useState<PublicListing[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<TranslationKey|null>(null),[refresh,setRefresh]=useState(0);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [filterDraft,setFilterDraft]=useState({sort,serviceType,category,mode});
 const filterCount=(sort!=='recent'?1:0)+(section==='companions'?0:[serviceType,category,mode].filter(v=>v!=='all').length);
 const sortLabel=(value:string)=>value==='recent'?(language==='zh'?'推荐排序':'Recommended'):value==='rating'?(language==='zh'?'评分最高':'Highest rated'):value==='sales'?(language==='zh'?'销量最高':'Most booked'):value==='priceAsc'?(language==='zh'?'价格从低到高':'Price: low to high'):(language==='zh'?'价格从高到低':'Price: high to low');
 const openFilters=()=>{setFilterDraft({sort,serviceType,category,mode});setFiltersOpen(true);};
 const generation=useRef(0),more=useRef(false);
 const url=()=>'/listings?q='+encodeURIComponent(q.trim())+'&category='+category+'&mode='+mode+'&game='+game+'&serviceType='+serviceType+'&sort='+sort;
 useEffect(()=>{let active=true;void Promise.all([api<CommerceObject>('/home',null),api<CommerceObject>('/announcements',null)]).then(([d,a])=>{if(active)setHome({...d,...a});}).catch(e=>{if(active)setError(errorKey(e));});return()=>{active=false;};},[refresh]);
 useEffect(()=>{if(section!=='companions')return;let active=true;setLoading(true);setError(null);setStores([]);setPage(1);void api<CommerceObject>('/stores?q='+encodeURIComponent(q.trim())+'&game='+game+'&sort='+(sort==='priceAsc'||sort==='priceDesc'?'recent':sort)+'&page=1',null).then(d=>{if(active){setStores(d.stores);setStoreMore(d.hasMore);}}).catch(e=>{if(active)setError(errorKey(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[section,q,game,sort,refresh]);
 useEffect(()=>{
  if(section==='companions')return;const version=++generation.current;setLoading(true);setError(null);setItems([]);setCursor(null);more.current=false;
  const timer=setTimeout(()=>{void api<{listings:PublicListing[];nextCursor:string|null}>(url(),null).then(data=>{if(version===generation.current){setItems(data.listings);setCursor(data.nextCursor);}}).catch(e=>{if(version===generation.current)setError(errorKey(e));}).finally(()=>{if(version===generation.current)setLoading(false);});},250);
  return()=>{clearTimeout(timer);generation.current++;};
 },[section,q,category,mode,game,serviceType,sort,refresh]);
 const loadMore=async()=>{
  if(more.current||!cursor)return;more.current=true;setLoading(true);setError(null);const version=generation.current;
  try{const data=await api<{listings:PublicListing[];nextCursor:string|null}>(url()+'&after='+encodeURIComponent(cursor),null);if(version===generation.current){setItems(current=>[...current,...data.listings.filter(item=>!current.some(old=>old.id===item.id))]);setCursor(data.nextCursor);}}
  catch(e){if(version===generation.current)setError(errorKey(e));}finally{if(version===generation.current){more.current=false;setLoading(false);}}
 };
 return <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
  <Field label={language==='zh'?'搜索店铺或服务':'Search companions or services'} value={q} onChangeText={setQ} maxLength={80} returnKeyType="search"/>
  <View style={discoveryStyles.sections}>{(['recommended','companions','services'] as const).map((v,i)=><Pressable key={v} accessibilityRole="tab" accessibilityState={{selected:section===v}} onPress={()=>{setSection(v);setSort('recent');}} style={[discoveryStyles.sectionTab,section===v&&discoveryStyles.sectionTabSelected]}><Text style={[discoveryStyles.sectionText,section===v&&discoveryStyles.sectionTextSelected]}>{(language==='zh'?['发现','陪玩','服务']:['Discover','Companions','Services'])[i]}</Text></Pressable>)}</View>
  {section==='recommended'&&<><View style={{borderRadius:26,overflow:'hidden',backgroundColor:'white'}}>{active&&<HeroVideo/>}<View style={{padding:20,gap:12}}><Text style={ui.title}>{t('heroTitle')}</Text><Text style={ui.body}>{t('heroBody')}</Text></View></View>
  <View style={{flexDirection:'row',gap:3}}>{['match','coupons','rules','feedback','notices'].map((v,i)=><Pressable key={v} accessibilityRole="button" style={{flex:1,alignItems:'center',backgroundColor:'white',paddingVertical:14,borderRadius:14,gap:6}} onPress={()=>onShortcut(v)}><Text style={{fontSize:21}}>{['⚡','◇','≡','✎','♧'][i]}</Text><Text style={{fontSize:10,lineHeight:15,textAlign:'center',color:'#25405F'}}>{(language==='zh'?['快速匹配','领券中心','平台规则','意见反馈','官方通知']:['Quick Match','Coupons','Platform Rules','Feedback','Notices'])[i]}</Text></Pressable>)}</View>
  {!!home?.announcements?.length&&<ScrollView horizontal pagingEnabled>{home.announcements.map((n:CommerceObject)=><View key={n.id} style={[ui.card,{width:280}]}><Text style={ui.heading}>{n.title[language]??n.title}</Text><Text style={ui.body}>{n.body[language]??n.body}</Text></View>)}</ScrollView>}
  {!!home?.bestsellers?.length&&<><Text style={ui.heading}>{language==='zh'?'热销服务':'Most booked'}</Text>{home.bestsellers.map((l:CommerceObject)=><ServiceCard key={l.id} listing={l as PublicListing} onPress={()=>onOpen(l.id)}/>)}</>}
  {!!home?.popularCompanions?.length&&<><Text style={ui.heading}>{language==='zh'?'人气陪玩':'Popular companions'}</Text>{home.popularCompanions.map((c:CommerceObject)=><CompanionCard key={c.id} store={c} onPress={()=>onStore(c.id)}/>)}</>}</>}
  <View style={discoveryStyles.discoveryPanel}>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={discoveryStyles.gameRow}>{(['all',...games] as const).map(g=><FilterChip key={g} label={g==='all'?(language==='zh'?'全部游戏':'All games'):gameName(g,language)} selected={g===game} onPress={()=>setGame(g)}/>)}</ScrollView>
   <View style={discoveryStyles.resultsToolbar}>
    <View style={{flex:1,minWidth:100,gap:3}}><Text accessibilityRole="header" style={ui.heading}>{section==='companions'?(language==='zh'?'发现陪玩':'Find a companion'):section==='services'?(language==='zh'?'全部服务':'All services'):(language==='zh'?'开启下一场精彩':'For your next session')}</Text><Text style={ui.caption}>{sortLabel(sort)}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={(language==='zh'?'筛选与排序':'Filters and sorting')+(filterCount?' · '+filterCount:'')} onPress={openFilters} style={[discoveryStyles.filterButton,filterCount>0&&discoveryStyles.filterButtonActive]}><Text style={discoveryStyles.filterButtonText}>☷ {language==='zh'?'筛选':'Filters'}{filterCount?' · '+filterCount:''}</Text></Pressable>
   </View>
  </View>
  <Sheet visible={filtersOpen} title={language==='zh'?'筛选与排序':'Filters & sorting'} onClose={()=>setFiltersOpen(false)}>
   <Text style={ui.heading}>{language==='zh'?'排序':'Sort by'}</Text>
   <View style={discoveryStyles.options}>{(section==='companions'?['recent','rating','sales']:['recent','priceAsc','priceDesc']).map(v=><FilterChip key={v} label={sortLabel(v)} selected={filterDraft.sort===v} onPress={()=>setFilterDraft(d=>({...d,sort:v}))}/>)}</View>
   {section!=='companions'&&<>
    <Text style={ui.heading}>{language==='zh'?'服务类型':'Service type'}</Text><View style={discoveryStyles.options}>{['all','companion','coaching'].map(v=><FilterChip key={v} label={v==='all'?(language==='zh'?'全部服务':'All services'):serviceTypeName(v,language)} selected={filterDraft.serviceType===v} onPress={()=>setFilterDraft(d=>({...d,serviceType:v}))}/>)}</View>
    <Text style={ui.heading}>{language==='zh'?'游戏风格':'Play style'}</Text><View style={discoveryStyles.options}>{(['all','relaxed','ranked'] as const).map(v=><FilterChip key={v} label={t(v)} selected={filterDraft.category===v} onPress={()=>setFilterDraft(d=>({...d,category:v}))}/>)}</View>
    <Text style={ui.heading}>{language==='zh'?'组队人数':'Team size'}</Text><View style={discoveryStyles.options}>{(['all','duo','squad'] as const).map(v=><FilterChip key={v} label={t(v==='all'?'listingAllModes':v==='duo'?'modeDuo':'modeSquad')} selected={filterDraft.mode===v} onPress={()=>setFilterDraft(d=>({...d,mode:v}))}/>)}</View>
   </>}
   <ActionButton label={language==='zh'?'应用筛选':'Apply filters'} onPress={()=>{setSort(filterDraft.sort);setServiceType(filterDraft.serviceType);setCategory(filterDraft.category);setMode(filterDraft.mode);setFiltersOpen(false);}}/>
   <ActionButton secondary label={language==='zh'?'重置筛选':'Reset filters'} onPress={()=>setFilterDraft({sort:'recent',serviceType:'all',category:'all',mode:'all'})}/>
  </Sheet>
  {section==='companions'&&stores.map(c=><CompanionCard key={c.id} store={c} onPress={()=>onStore(c.id)}/>)}
  {section!=='companions'&&(section==='recommended'?items.slice(0,4):items).map(item=><ServiceCard key={item.id} listing={item} onPress={()=>onOpen(item.id)}/>)}
  {section==='recommended'&&items.length>0&&<ActionButton secondary label={language==='zh'?'浏览全部服务':'Browse all services'} onPress={()=>setSection('services')}/>}
  {loading&&<ActivityIndicator accessibilityLabel={t('loading')}/>}
  {error&&<View style={ui.notice}><Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text><ActionButton label={t('retry')} onPress={()=>setRefresh(v=>v+1)}/></View>}
  {!loading&&!error&&!(section==='companions'?stores.length:items.length)&&<EmptyState title={t('listingPublicEmpty')} body={t('listingPublicEmptyBody')} mood="curious"/>}
  {section==='services'&&!!cursor&&!error&&<ActionButton secondary label={t('listingLoadMore')} busy={loading} onPress={()=>void loadMore()}/>}
  {section==='companions'&&storeMore&&!loading&&<ActionButton secondary label={t('listingLoadMore')} onPress={()=>{setLoading(true);void api<CommerceObject>('/stores?q='+encodeURIComponent(q.trim())+'&game='+game+'&sort='+sort+'&page='+(page+1),null).then(d=>{setStores(old=>[...old,...d.stores.filter((c:CommerceObject)=>!old.some(o=>o.id===c.id))]);setPage(p=>p+1);setStoreMore(d.hasMore);}).catch(e=>setError(errorKey(e))).finally(()=>setLoading(false));}}/>}
 </ScrollView>;
}
export function HostedListingDetail({id,onBack,onPurchase,onContact,onStore,onSignIn,signedIn}:{id:string;onStore:(id:string)=>void;onSignIn:()=>void;signedIn:boolean;onBack:()=>void;onContact:()=>void;onPurchase:(service:ServiceSnapshot,quantity:number)=>void}){
 const {t,language}=useLanguage();const [listing,setListing]=useState<PublicListing|null>(null),[error,setError]=useState<TranslationKey|null>(null),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);setListing(null);setError(null);void api<{listing:PublicListing}>('/listings/'+id,null).then(data=>{if(active)setListing(data.listing);}).catch(e=>{if(active)setError(errorKey(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id,refresh]);
 const [policy,setPolicy]=useState<OrderPolicy|null>(null),[options,setOptions]=useState(false),[quantity,setQuantity]=useState(1);
 useEffect(()=>{let active=true;void api<OrderPolicy>('/orders/policy',null).then(p=>{if(active)setPolicy(p);}).catch(e=>{if(active)setError(errorKey(e));});return()=>{active=false;};},[id,refresh]);
 const [favorite,setFavorite]=useState(false),[favoriteBusy,setFavoriteBusy]=useState(false);
 useEffect(()=>{let active=true;if(signedIn)void commerceApi('/me/favorites').then(d=>{if(active)setFavorite(d.products.some((p:CommerceObject)=>p.id===id));}).catch(()=>{});return()=>{active=false;};},[id,signedIn]);
 const service=listing&&policy?purchaseSnapshot(listing,policy,language):null;
 const photos=listing?(listing.photoMediaIds.length?listing.photoMediaIds:listing.provider.avatarMediaId?[listing.provider.avatarMediaId]:[]):[];
 const voice=listing?.files.find(f=>f.id===listing.provider.voiceMediaId);
 const copy=listing?listingCopy(listing,language):null;
 const provider=listing?providerCopy({...listing.provider,isShowcase:listing.isShowcase},listing.game,language):null;
 return <ScrollView contentContainerStyle={ui.content}>
  <ActionButton secondary label={t('back')} onPress={onBack}/>
  {loading&&<ActivityIndicator accessibilityLabel={t('loading')}/>}
  {error&&<><Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text><ActionButton label={t('retry')} onPress={()=>setRefresh(v=>v+1)}/></>}
  {listing&&<>
   {!photos.length&&<CatalogCover game={listing.game} sample={listing.isShowcase} serviceType={listing.serviceType}/>}
   {photos.map(photo=><Photo key={photo} large url={listing.files.find(f=>f.id===photo)?.url} label={listing.provider.nickname}/>)}
   <Text accessibilityRole="header" style={ui.title}>{copy?.title}</Text><Text style={ui.label}>{money(listing.priceFen,language)} {t('perHour')} · {t(listing.mode==='duo'?'modeDuo':'modeSquad')}</Text>
   <Text style={ui.caption}>{gameName(listing.game,language)} · {serviceTypeName(listing.serviceType??'companion',language)} · {t(listing.category)}</Text><Text style={ui.body}>{copy?.description}</Text>
   <View style={ui.card}><Text style={ui.heading}>{provider?.name}</Text><Text style={ui.body}>{provider?.bio}</Text>{!listing.isShowcase&&<Text style={ui.caption}>{listing.provider.rank} · {listing.provider.playStyle}</Text>}</View>
   {(listing.provider.id??listing.ownerId)&&<ActionButton secondary label={language==='zh'?'查看陪玩店铺':'View companion store'} onPress={()=>onStore((listing.provider.id??listing.ownerId)!)}/>}<ActionButton secondary busy={favoriteBusy} label={favorite?(language==='zh'?'取消收藏':'Remove favorite'):(language==='zh'?'收藏服务':'Favorite service')} onPress={()=>{if(!signedIn){onSignIn();return;}setFavoriteBusy(true);void commerceApi('/me/favorites/products/'+id,{favorite:!favorite},'PUT').then(()=>setFavorite(v=>!v)).catch(()=>setError('saveFailed')).finally(()=>setFavoriteBusy(false));}}/>
   {voice?.url&&<PublicVoice key={voice.url} url={voice.url}/>}
   {!listing.isShowcase&&<Text style={ui.caption}>{t('listingContentLanguage')}</Text>}{!listing.isShowcase&&<ActionButton secondary label={language==='zh'?'联系陪玩':'Message provider'} onPress={onContact}/>}<ActionButton label={t('book')} disabled={!policy?.simulationEnabled} onPress={()=>setOptions(true)}/>{policy&&!policy.simulationEnabled&&<Text style={ui.caption}>{t('orderSimulationDisabled')}</Text>}
   <ActionButton secondary label={t('listingRefresh')} onPress={()=>setRefresh(v=>v+1)}/>
  </>}
  {service&&<VariantSheet visible={options} service={service} choice={{mode:service.mode,quantity}} onChange={v=>setQuantity(v.quantity)} onClose={()=>setOptions(false)} onConfirm={()=>{setOptions(false);onPurchase(service,quantity);}}/>}
 </ScrollView>;
}
export function PublicVoice({url}:{url:string}){
 const {t}=useLanguage();const player=useAudioPlayer(url),status=useAudioPlayerStatus(player);const [error,setError]=useState(false);
 const play=async()=>{try{setError(false);if(status.playing)player.pause();else{if(status.didJustFinish)await player.seekTo(0);player.play();}}catch{setError(true);}};
 return <View style={ui.card}><Text style={ui.heading}>{t('voiceTitle')}</Text><Text style={ui.caption}>{t('listingPublicVoice')}</Text>{(error||status.error)&&<Text style={ui.error}>{t('hostedMediaUnavailable')}</Text>}<ActionButton secondary label={t(status.playing?'voicePause':'voicePlay')} disabled={!status.isLoaded} onPress={()=>void play()}/></View>;
}

const discoveryStyles=StyleSheet.create({
 sections:{flexDirection:'row',backgroundColor:'rgba(255,255,255,0.85)',borderRadius:16,padding:4,gap:4},
 sectionTab:{flex:1,minHeight:44,paddingHorizontal:6,paddingVertical:10,borderRadius:12,alignItems:'center',justifyContent:'center'},
 sectionTabSelected:{backgroundColor:colors.navy},
 sectionText:{fontSize:13,fontWeight:'600',color:colors.navy},
 sectionTextSelected:{color:'#fff'},
 discoveryPanel:{backgroundColor:'rgba(255,255,255,0.96)',borderRadius:22,padding:14,gap:16,borderWidth:1,borderColor:'#E2ECF6'},
 gameRow:{flexDirection:'row',alignItems:'center',gap:8,paddingRight:8},
 chip:{minHeight:44,paddingHorizontal:14,paddingVertical:10,borderRadius:22,backgroundColor:'#F1F6FB',alignItems:'center',justifyContent:'center'},
 chipSelected:{backgroundColor:colors.navy},
 chipText:{fontSize:13,fontWeight:'600',color:colors.navy},
 chipTextSelected:{color:'#fff'},
 resultsToolbar:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12},
 filterButton:{minHeight:44,paddingHorizontal:14,paddingVertical:10,borderRadius:14,borderWidth:1,borderColor:'#D8E6F3',justifyContent:'center',backgroundColor:'#fff'},
 filterButtonActive:{backgroundColor:'#EAF4FF',borderColor:colors.primary},
 filterButtonText:{fontSize:13,fontWeight:'700',color:colors.navy},
 options:{flexDirection:'row',flexWrap:'wrap',gap:8},
});
