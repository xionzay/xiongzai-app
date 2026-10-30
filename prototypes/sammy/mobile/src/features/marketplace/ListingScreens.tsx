import {games,gameName,serviceTypeName,reviewStatusName,type Game} from './catalog';
import { useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ActionButton, CheckRow, Choice, Field, Sheet, errorKey, money, ui } from '../../components/FormUI';
import { AvatarPicker } from '../../components/AvatarPicker';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import type { Marketplace } from './useMarketplace';
import { listingPrice, type Listing, type ListingDraft } from './listingModels';

export function ProviderListings({market}:{market:Marketplace}){
 const {t,language}=useLanguage();
 const [editing,setEditing]=useState<Listing|null|undefined>(undefined),[publishing,setPublishing]=useState<Listing|null>(null);
 const [accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<TranslationKey|null>(null);const lock=useRef(false);
 const approved=market.profile?.providerApplication?.status==='approved';
 const change=async(item:Listing,action:'publish'|'unpublish'|'submit-review')=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{await market.changeListingStatus(item,action,accepted);setPublishing(null);}catch(e){setError(errorKey(e));}finally{lock.current=false;setBusy(false);}
 };
 return <View style={ui.card}>
  <Text accessibilityRole="header" style={ui.heading}>{t('listingDashboard')}</Text>
  <Text style={ui.body}>{t(approved?'listingApprovedNext':'listingApprovalHint')}</Text>
  <View style={ui.row}><Text style={ui.label}>{market.myListings.filter(l=>l.status==='published').length} {t('listingPublished')}</Text><Text style={ui.caption}>{market.myListings.filter(l=>l.status==='draft').length} {t('listingDrafts')}</Text></View>
  <ActionButton label={t('listingCreate')} onPress={()=>setEditing(null)} disabled={busy||market.listingsLoading}/>
  {market.listingsLoading&&<ActivityIndicator accessibilityLabel={t('loading')}/>}
  {market.listingsError&&<><Text accessibilityRole="alert" style={ui.error}>{t(market.listingsError)}</Text><ActionButton secondary label={t('retry')} onPress={()=>void market.reload()}/></>}
  {!market.listingsLoading&&!market.listingsError&&!market.myListings.length&&<Text style={ui.caption}>{t('listingOwnerEmpty')}</Text>}
  {market.myListings.map(item=><View key={item.id} style={ui.card}>
   <Text style={ui.caption}>{reviewStatusName(item.reviewStatus??'draft',language)} · {gameName(item.game,language)} · {serviceTypeName(item.serviceType??'companion',language)}</Text>{item.reviewReason&&<Text style={ui.error}>{item.reviewReason}</Text>}<Text style={ui.caption}>{t(item.status==='published'?'listingPublished':'listingDraft')}</Text><Text style={ui.heading}>{item.title}</Text>
   <Text style={ui.body}>{money(item.priceFen,language)} {t('perHour')} · {t(item.mode==='duo'?'modeDuo':'modeSquad')}</Text>
   <ActionButton secondary label={t('listingEdit')} disabled={busy} onPress={()=>setEditing(item)}/>
   {item.status==='draft'&&item.reviewStatus!=='approved'&&<ActionButton secondary label={language==='zh'?'提交服务审核':'Submit service for review'} disabled={busy||!approved||item.reviewStatus==='pending'} onPress={()=>void change(item,'submit-review')}/>}
   <ActionButton secondary label={t(item.status==='published'?'listingUnpublish':'listingPublish')} disabled={busy||(item.status==='draft'&&(!approved||item.reviewStatus!=='approved'))} onPress={()=>{setError(null);if(item.status==='published')void change(item,'unpublish');else{setAccepted(false);setPublishing(item);}}}/>
  </View>)}
  {error&&!publishing&&<Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text>}
  {editing!==undefined&&<ListingEditor market={market} listing={editing} onClose={()=>setEditing(undefined)}/>}
  {publishing&&<Sheet visible title={t('listingPublish')} closeDisabled={busy} onClose={()=>setPublishing(null)}>
   <Text style={ui.heading}>{publishing.title}</Text><Text style={ui.body}>{t('listingPublishConsentBody')}</Text>
   <CheckRow label={t('listingPublishConsent')} checked={accepted} disabled={busy} onPress={()=>setAccepted(v=>!v)}/>
   {error&&<Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text>}
   <ActionButton label={t('listingPublish')} disabled={!accepted} busy={busy} onPress={()=>void change(publishing,'publish')}/>
  </Sheet>}
 </View>;
}

function ListingEditor({market,listing,onClose}:{market:Marketplace;listing:Listing|null;onClose:()=>void}){
 const {t,language}=useLanguage();
 const [title,setTitle]=useState(listing?.title??''),[description,setDescription]=useState(listing?.description??''),[price,setPrice]=useState(listing?(listing.priceFen/100).toFixed(2):'');
 const [game,setGame]=useState<Game>(listing?.game??'peaceElite'),[serviceType,setServiceType]=useState<'companion'|'coaching'>(listing?.serviceType??'companion');
 const [mode,setMode]=useState<'duo'|'squad'>(listing?.mode??'duo'),[category,setCategory]=useState<'relaxed'|'ranked'>(listing?.category??'relaxed');
 const [photos,setPhotos]=useState<string[]>(listing?.photoMediaIds.map(id=>market.listingFiles.find(f=>f.id===id)?.file).filter((f):f is string=>!!f)??[]);
 const [busy,setBusy]=useState(false),[mediaBusy,setMediaBusy]=useState(false),[error,setError]=useState<TranslationKey|null>(null),[errors,setErrors]=useState<Record<string,TranslationKey>>({});
 const lock=useRef(false),id=useRef(listing?.id??null);
 const save=async()=>{
  if(lock.current||mediaBusy)return;const issues:Record<string,TranslationKey>={},fen=listingPrice(price);
  if(title.trim().length<3)issues.title='listingTitleError';if(description.trim().length<10)issues.description='listingDescriptionError';if(fen===null)issues.price='listingPriceError';
  setErrors(issues);if(Object.keys(issues).length)return;
  lock.current=true;setBusy(true);setError(null);
  try{if(!id.current)id.current=await market.newListingId();const draft:ListingDraft={id:id.current,revision:listing?.revision??0,title:title.trim(),description:description.trim(),game,serviceType,mode,category,priceFen:fen!,photoFiles:photos};await market.saveListing(draft);onClose();}catch(e){setError(errorKey(e));}finally{lock.current=false;setBusy(false);}
 };
 return <Sheet visible title={t(listing?'listingEdit':'listingCreate')} closeDisabled={busy||mediaBusy} onClose={onClose}>
  <Text style={ui.body}>{t('listingEditorHint')}</Text>
  <Text style={ui.label}>{language==='zh'?'游戏':'Game'}</Text><View style={[ui.choiceRow,{flexWrap:'wrap'}]}>{games.map(g=><Choice key={g} label={gameName(g,language)} selected={g===game} disabled={busy} onPress={()=>setGame(g)}/>)}</View><Text style={ui.label}>{language==='zh'?'服务类型':'Service type'}</Text><View style={ui.choiceRow}>{(['companion','coaching'] as const).map(v=><Choice key={v} label={serviceTypeName(v,language)} selected={v===serviceType} disabled={busy} onPress={()=>setServiceType(v)}/>)}</View>
  <Field label={t('listingTitle')} value={title} onChangeText={setTitle} maxLength={80} editable={!busy} error={errors.title&&t(errors.title)}/>
  <Field label={t('listingDescription')} value={description} onChangeText={setDescription} maxLength={1500} multiline editable={!busy} error={errors.description&&t(errors.description)}/>
  <Field label={t('listingPrice')} hint={t('listingPriceHint')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" editable={!busy} error={errors.price&&t(errors.price)}/>
  <Text style={ui.label}>{t('providerMode')}</Text><View style={ui.row}>{(['duo','squad'] as const).map(v=><Choice key={v} label={t(v==='duo'?'modeDuo':'modeSquad')} selected={v===mode} disabled={busy} onPress={()=>setMode(v)}/>)}</View>
  <Text style={ui.label}>{t('listingCategory')}</Text><View style={ui.row}>{(['relaxed','ranked'] as const).map(v=><Choice key={v} label={t(v)} selected={v===category} disabled={busy} onPress={()=>setCategory(v)}/>)}</View>
  <Text style={ui.label}>{t('listingPhotos')}</Text><Text style={ui.caption}>{t('listingPhotosHint')}</Text>
  {Array.from({length:Math.min(photos.length+1,4)},(_,i)=><View key={i}><Text style={ui.caption}>{i+1}/4</Text><AvatarPicker value={photos[i]??null} disabled={busy||mediaBusy} onBusyChange={setMediaBusy} onError={setError} onChange={file=>setPhotos(current=>{const next=[...current];if(file)next[i]=file;else next.splice(i,1);return next;})}/></View>)}
  {error&&<Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text>}
  <ActionButton label={t('listingSaveDraft')} busy={busy} disabled={mediaBusy} onPress={()=>void save()}/>
 </Sheet>;
}
