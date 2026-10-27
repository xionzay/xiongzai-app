import type { Listing, OwnerListings } from './listingModels';
import type { RemoteFile } from './hostedProfile';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNotifications } from '../../components/Notifications';
import { errorKey } from '../../components/FormUI';
import type { TranslationKey } from '../../i18n/LanguageProvider';
import { hostedOrder, type HostedOrderResponse } from './hostedOrders';
import type { Order, Profile } from './domain';
import type { Marketplace } from './useMarketplace';
import { api, secure, readToken, storeToken, cacheMedia, accountProfile, uploadMedia, remoteDraft, HostedError, type AccountResponse } from './hostedApi';

export function useHostedMarketplace(): Marketplace {
  const { notify } = useNotifications();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [myListings,setMyListings]=useState<Listing[]>([]),[listingFiles,setListingFiles]=useState<RemoteFile[]>([]),[listingsError,setListingsError]=useState<TranslationKey|null>(null);
  const [listingsLoading,setListingsLoading]=useState(false);
  const [orders,setOrders]=useState<Order[]>([]),[sellerOrders,setSellerOrders]=useState<Order[]>([]),[ordersLoading,setOrdersLoading]=useState(false),[ordersError,setOrdersError]=useState<TranslationKey|null>(null),[simulationEnabled,setSimulationEnabled]=useState(false);
  const cursors=useRef<{buyer:string|null;seller:string|null}>({buyer:null,seller:null}),[ordersMore,setOrdersMore]=useState({buyer:false,seller:false});
  const [ready, setReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState<Marketplace['storageNotice']>(null);
  const token = useRef<string | null>(null), response = useRef<AccountResponse | null>(null);
  const paymentKeys=useRef<Record<string,string>>({});
  const queue = useRef(Promise.resolve());
  const apply = async (data: AccountResponse) => {
    response.current = data;
    try { await cacheMedia(data.files); }
    catch { notify('hostedMediaUnavailable', 'error'); }
    setProfile(accountProfile(data));
    setStorageNotice(null);
    return accountProfile(data);
  };
  const loadListings=async()=>{
    if(!token.current)return;
    setListingsLoading(true);
    try{const data=await api<OwnerListings>('/me/listings',token.current);setMyListings(data.listings);setListingFiles(data.files);await cacheMedia(data.files);setListingsError(null);}
    catch(error){if(error instanceof HostedError&&(error.status===401))throw error;setListingsError(errorKey(error));}finally{setListingsLoading(false);}
  };
  const loadOrders=async(role:'buyer'|'seller',more=false)=>{
    if(!token.current)return;setOrdersLoading(true);setOrdersError(null);
    try{const data=await api<{orders:HostedOrderResponse[];nextCursor:string|null;simulationEnabled:boolean}>('/orders?role='+role+(more&&cursors.current[role]?'&after='+cursors.current[role]:''),token.current);const rows=data.orders.map(item=>hostedOrder(item,response.current?.profile.phone??''));const setter=role==='buyer'?setOrders:setSellerOrders;setter(previous=>more?[...previous,...rows.filter(row=>!previous.some(old=>old.id===row.id))]:rows);cursors.current[role]=data.nextCursor;setOrdersMore(previous=>({...previous,[role]:!!data.nextCursor}));setSimulationEnabled(data.simulationEnabled);}
    catch(error){if(error instanceof HostedError&&error.status===401)throw error;setOrdersError(errorKey(error));}finally{setOrdersLoading(false);}
  };
  const refreshOrders=async()=>{await loadOrders('buyer');await loadOrders('seller');};
  const storeOrder=(data:HostedOrderResponse)=>{const item=hostedOrder(data,response.current?.profile.phone??'');const setter=item.role==='seller'?setSellerOrders:setOrders;setter(rows=>[item,...rows.filter(row=>row.id!==item.id)]);return item;};
  const run = <T,>(action: () => Promise<T>): Promise<T> => {
    const pending = queue.current.then(action).catch(async error => {
      if (error instanceof HostedError && error.status === 401 && error.message !== 'invalidCredentials') {
        await storeToken(null); token.current = null; response.current = null; setProfile(null);setMyListings([]);setListingFiles([]);setListingsError(null);setOrders([]);setSellerOrders([]);
      }
      notify(errorKey(error), 'error'); throw error;
    });
    queue.current = pending.then(() => undefined, () => undefined);
    return pending;
  };
  const reload = () => run(async () => {
    try {
      token.current = await readToken();
      setOnboardingDone((await (await secure()).getItemAsync('sammy-hosted-onboarding')) === 'done' || !!token.current);
      if (token.current) {
        const previous = response.current?.profile.application;
        const data = await api<AccountResponse>('/me', token.current);
        await apply(data);await refreshOrders();if(!data.profile.suspended)await loadListings();else{setMyListings([]);setListingFiles([]);}
        if (previous && previous.status !== data.profile.application?.status) notify('hostedReviewUpdated', 'info');
      } else { setProfile(null); setStorageNotice(null); }
    } catch (error) { setStorageNotice(errorKey(error)); throw error; }
    finally { setReady(true); }
  }).catch(() => {});
  useEffect(() => {
    void reload();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void reload(); });
    return () => listener.remove();
  }, []);
  const authenticated = () => { if (!token.current) throw new Error('signInRequired'); return token.current; };
  const save = async (input: Profile) => {
    const auth = authenticated(), files = response.current?.files ?? [];
    const avatarMediaId = input.avatarFile ? await uploadMedia(auth, 'avatar', input.avatarFile, files) : null;
    const draft = input.providerDraft;
    const voiceMediaId = draft?.voiceIntroduction ? await uploadMedia(auth, 'voice', draft.voiceIntroduction.file, files) : null;
    return apply(await api<AccountResponse>('/me', auth, { nickname: input.nickname, bio: input.bio, avatarMediaId, ...(draft ? { draft: remoteDraft(draft, voiceMediaId) } : {}) }, 'PATCH'));
  };
  const authenticate: Marketplace['authenticate'] = (mode, input, password = '', accepted = false) => run(async () => {
    if (mode === 'edit') { const result = await save(input); notify('noticeProfileSaved'); return result; }
    // Confirm secure storage exists before creating a remote account.
    await readToken();
    const data = await api<AccountResponse>(mode === 'signUp' ? '/auth/register' : '/auth/login', null,
      mode === 'signUp' ? { phone: input.phone, password, nickname: input.nickname, bio: input.bio, accepted, ...(input.providerDraft ? { draft: remoteDraft(input.providerDraft, null) } : {}) } : { phone: input.phone, password });
    if (!data.token) throw new Error('hostedUnavailable');
    try { await storeToken(data.token); } catch (error) { await api('/auth/logout', data.token, {}).catch(() => {}); throw error; }
    token.current = data.token;
    await apply(data);await refreshOrders();if(!data.profile.suspended)await loadListings();else{setMyListings([]);setListingFiles([]);}setOnboardingDone(true);
    if (mode === 'signUp' && (input.avatarFile || input.providerDraft?.voiceIntroduction)) {
      try { const result = await save(input); notify('noticeRegistered'); return result; }
      catch { notify('hostedAccountMediaRetry', 'error'); return accountProfile(data); }
    }
    notify(mode === 'signUp' ? 'noticeRegistered' : 'noticeSignedIn');
    return accountProfile(data);
  });
  const unavailable = async (): Promise<never> => { notify('hostedFeatureUnavailable', 'info'); throw new Error('hostedFeatureUnavailable'); };
  return {
    refreshOrder:id=>run(async()=>storeOrder(await api<HostedOrderResponse>('/orders/'+id,authenticated()))),
    myListings,listingFiles,listingsError,listingsLoading,sellerOrders,ordersLoading,ordersError,simulationEnabled,ordersMore,loadMoreOrders:role=>run(()=>loadOrders(role,true)),
    newListingId: async()=>{ const {uuid}=await import('expo-modules-core');return uuid.v4(); },
    saveListing: input=>run(async()=>{
      const auth=authenticated(),photoMediaIds:string[]=[];
      for(const file of input.photoFiles)photoMediaIds.push(await uploadMedia(auth,'avatar',file,[...listingFiles,...(response.current?.files??[])]));
      const {id,photoFiles,...fields}=input;
      await api(`/me/listings/${id}`,auth,{...fields,photoMediaIds},'PUT');await loadListings();notify('listingSaved');
    }),
    changeListingStatus: (item,action,accepted)=>run(async()=>{await api(`/me/listings/${item.id}/${action}`,authenticated(),{revision:item.revision,...(action==='publish'?{accepted}:{})});await loadListings();notify(action==='publish'?'listingPublishSuccess':'listingUnpublishSuccess');}),
    hosted: true, profile, ready, storageNotice, reload, orders, conversations: [], onboardingDone,
    authenticate,
    saveProvider: (draft, avatarFile) => run(async () => {
      if (!response.current) throw new Error('signInRequired');
      const current = accountProfile(response.current);
      await save({ ...current, providerDraft: draft, ...(avatarFile !== undefined ? { avatarFile } : {}) }); notify('noticeProviderSaved'); return undefined;
    }),
    submitApplication: accepted => run(async () => { await apply(await api<AccountResponse>('/me/application', authenticated(), { accepted })); notify('hostedApplicationSubmitted'); return undefined; }),
    completeOnboarding: () => run(async () => { await (await secure()).setItemAsync('sammy-hosted-onboarding', 'done'); setOnboardingDone(true); return undefined; }),
    signOut: () => run(async () => {
      await api('/auth/logout', authenticated(), {});
      await storeToken(null); token.current = null; response.current = null; setProfile(null);setMyListings([]);setListingFiles([]);setListingsError(null);setOrders([]);setSellerOrders([]); notify('noticeSignedOut'); return undefined;
    }),
    placeOrder:(service,quantity,delivery,requestId)=>run(async()=>{const result=await api<HostedOrderResponse>('/orders',authenticated(),{listingId:service.id,listingRevision:service.listingRevision,expectedUnitPriceFen:service.unitPriceFen,quantity,delivery,requestId,rulesVersion:service.rulesVersion,accepted:true});const item=storeOrder(result);notify('noticeOrderCreated');return item;}),
    payOrder:(id,outcome='success')=>run(async()=>{const current=await api<HostedOrderResponse>('/orders/'+id,authenticated());storeOrder(current);if(current.order.status!=='unpaid')return hostedOrder(current,response.current?.profile.phone??'');const pending=current.attempts.find(a=>a.status==='pending');if(current.attempts[0]?.status==='failed')delete paymentKeys.current[id];const {uuid}=await import('expo-modules-core');const requestId=pending?.requestId??paymentKeys.current[id]??uuid.v4();paymentKeys.current[id]=requestId;const result=await api<HostedOrderResponse>('/orders/'+id+'/simulate-payment',authenticated(),{requestId,outcome});if(result.attempts[0]?.status!=='pending')delete paymentKeys.current[id];return storeOrder(result);}),
    cancelOrder:id=>run(async()=>storeOrder(await api<HostedOrderResponse>('/orders/'+id+'/cancel',authenticated(),{}))), submitRefund: unavailable, sendMessage: unavailable,
  };
}
