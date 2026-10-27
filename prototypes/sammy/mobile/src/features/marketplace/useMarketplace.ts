import type { Listing, ListingDraft } from './listingModels';
import type { RemoteFile } from './hostedProfile';
import { useNotifications } from '../../components/Notifications';
import type { TranslationKey } from '../../i18n/LanguageProvider';
import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  submitProviderApplication, accountChange, saveProviderDraft, createOrder, emptyMarketplace, ownedOrder, restoreMarketplace, requestRefund, transitionOrder, writeMarketplace,
  type Conversation, type DeliveryDetails, type MarketplaceState, type MarketplaceStorage, type Order, type ProviderDraft, type Profile, type RefundRequest, type ServiceSnapshot,
} from './domain';
import { demoServices } from '../../screens/demo-services';
import { en } from '../../i18n/en';
import { zh } from '../../i18n/zh';
import { API_URL } from './hostedApi';
import { useHostedMarketplace } from './useHostedMarketplace';

const primaryFile = FileSystem.documentDirectory ? FileSystem.documentDirectory + 'marketplace-v1.json' : null;
const backupFile = FileSystem.documentDirectory ? FileSystem.documentDirectory + 'marketplace-v1.previous.json' : null;
const storage: MarketplaceStorage = {
  read: async file => {
    const path = file === 'primary' ? primaryFile : backupFile;
    if (!path) throw new Error('storageUnavailable');
    return (await FileSystem.getInfoAsync(path)).exists ? FileSystem.readAsStringAsync(path) : null;
  },
  write: async (file, text) => {
    const path = file === 'primary' ? primaryFile : backupFile;
    if (!path) throw new Error('storageUnavailable');
    await FileSystem.writeAsStringAsync(path, text);
  },
};
export function localId(prefix: string) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function useLocalMarketplace() {
  const { notify } = useNotifications();
  const [data, setData] = useState<MarketplaceState>(emptyMarketplace);
  const [ready, setReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState<TranslationKey | null>(null);
  const current = useRef(data);
  const blocked = useRef(true);
  const loading = useRef(false);
  const queue = useRef(Promise.resolve());

  const load = () => {
    if (loading.current) return queue.current;
    loading.current = true;
    setStorageNotice(null);
    // Read only after pending writes finish; a reload must never restore an older snapshot over them.
    const task = queue.current.then(async () => {
      try {
        const restored = await restoreMarketplace(storage);
        current.current = restored.data;
        blocked.current = false;
        setData(restored.data);
        setStorageNotice(restored.recovered ? 'storageRecovered' : null);
      } catch {
        blocked.current = true;
        setStorageNotice('storageUnavailable');
      } finally {
        loading.current = false;
        setReady(true);
      }
    });
    queue.current = task;
    return task;
  };
  useEffect(() => { void load(); }, []);

  const mutate = <T,>(change: (state: MarketplaceState) => { next: MarketplaceState; result: T }, success?: TranslationKey): Promise<T> => {
    if (loading.current || blocked.current) {
      notify('noticeActionFailed', 'error');
      return Promise.reject(new Error('storageUnavailable'));
    }
    const task = queue.current.then(async () => {
      if (blocked.current || !primaryFile || !backupFile) throw new Error('storageUnavailable');
      const { next, result } = change(current.current);
      if (next !== current.current) {
        try {
          await writeMarketplace(storage, current.current, next);
        } catch {
          // A failed write may have partially replaced the file; require a reload before another mutation.
          blocked.current = true;
          setStorageNotice('storageUnavailable');
          throw new Error('storageUnavailable');
        }
        current.current = next;
        setData(next);
        if (success) notify(success);
      }
      return result;
    });
    queue.current = task.then(() => undefined, () => undefined);
    return task.catch(problem => { notify('noticeActionFailed', 'error'); throw problem; });
  };

  const authenticate = (mode: 'signIn' | 'signUp' | 'edit', profile: Profile, code = '', accepted = false) => mutate(state => {
    const next = accountChange(state, mode, profile, code, accepted);
    return { next, result: next.profile };
  }, mode === 'edit' ? 'noticeProfileSaved' : mode === 'signUp' ? 'noticeRegistered' : 'noticeSignedIn');
  const saveProvider = (draft: ProviderDraft, avatarFile?: string | null) => mutate(state => ({ next: saveProviderDraft(state, draft, avatarFile), result: undefined }), 'noticeProviderSaved');
  const submitApplication = (accepted: boolean) => mutate(state => ({ next: submitProviderApplication(state, accepted, Date.now()), result: undefined }), 'applicationSubmitted');
  const completeOnboarding = () => mutate(state => ({ next: { ...state, onboardingDone: true }, result: undefined }));
  const signOut = () => mutate(state => ({ next: { ...state,
    accounts: state.profile ? [...(state.accounts ?? []).filter(item => item.phone !== state.profile!.phone), state.profile] : state.accounts,
    profile: null }, result: undefined }), 'noticeSignedOut');

  const placeOrder = (service: ServiceSnapshot, quantity: number, delivery: DeliveryDetails, requestId: string) => mutate(state => {
    const order = createOrder(state, { id: localId('XZ'), service, quantity, delivery, requestId,
      rules: { en: en.rulesBody, zh: zh.rulesBody }, now: Date.now() });
    const existing = state.orders.some(item => item.id === order.id);
    return { next: existing ? state : { ...state, orders: [order, ...state.orders] }, result: order };
  }, 'noticeOrderCreated');
  const updateOrder = (id: string, change: (order: Order) => Order, success: TranslationKey) => mutate(state => {
    const order = ownedOrder(state, id);
    const updated = change(order);
    return {
      next: updated === order ? state : { ...state, orders: state.orders.map(item => item.id === id ? updated : item) },
      result: updated,
    };
  }, success);
  const payOrder = (id: string, _outcome:'success'|'failure'|'pending'='success') => updateOrder(id, order => transitionOrder(order, 'pay', Date.now()), 'noticePaymentSaved');
  const cancelOrder = (id: string) => updateOrder(id, order => transitionOrder(order, 'cancel', Date.now()), 'noticeOrderCancelled');
  const submitRefund = (id: string, request: Omit<RefundRequest, 'submittedAt'>) =>
    updateOrder(id, order => requestRefund(order, { ...request, submittedAt: Date.now() }), 'noticeRefundSaved');

  const sendMessage = (serviceId: string, text: string) => mutate(state => {
    if (!state.profile) throw new Error('signInRequired');
    const cleaned = text.trim();
    if (!demoServices.some(service => service.id === serviceId) || !cleaned || cleaned.length > 500) throw new Error('messageInvalid');
    const message = { id: localId('message'), text: cleaned, createdAt: Date.now() };
    const existing = state.conversations.find(item => item.buyerPhone === state.profile!.phone && item.serviceId === serviceId);
    const conversation: Conversation = existing
      ? { ...existing, messages: [...existing.messages, message] }
      : { buyerPhone: state.profile.phone, serviceId, messages: [message] };
    const conversations = existing
      ? state.conversations.map(item => item === existing ? conversation : item)
      : [conversation, ...state.conversations];
    return { next: { ...state, conversations }, result: message };
  }, 'noticeMessageSaved');

  const remoteOnly = async ():Promise<never> => { throw new Error('listingHostedRequired'); };
  return {
    listingsLoading: false, myListings: [] as Listing[], listingFiles: [] as RemoteFile[], listingsError: null as TranslationKey|null,
    newListingId: async ():Promise<string> => remoteOnly(), saveListing: async (_draft:ListingDraft):Promise<void> => { await remoteOnly(); }, changeListingStatus: async (_item:Listing,_action:'publish'|'unpublish',_accepted:boolean):Promise<void> => { await remoteOnly(); },
    refreshOrder:async(id:string)=>ownedOrder(current.current,id),sellerOrders:[] as Order[],ordersLoading:false,ordersError:null as TranslationKey|null,simulationEnabled:true,ordersMore:{buyer:false,seller:false},loadMoreOrders:async(_role:'buyer'|'seller')=>{},
    hosted: false, profile: data.profile, ready, storageNotice, reload: load,
    orders: data.orders.filter(order => order.buyerPhone === data.profile?.phone),
    conversations: data.conversations.filter(conversation => conversation.buyerPhone === data.profile?.phone),
    submitApplication, authenticate, saveProvider, completeOnboarding, onboardingDone: data.onboardingDone ?? !!data.profile, signOut, placeOrder, payOrder, cancelOrder, submitRefund, sendMessage,
  };
}
export type Marketplace = ReturnType<typeof useLocalMarketplace>;
export const useMarketplace = API_URL ? useHostedMarketplace : useLocalMarketplace;
