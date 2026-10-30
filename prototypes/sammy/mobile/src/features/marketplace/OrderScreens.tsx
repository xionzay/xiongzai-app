import {commerceApi} from './commerceApi';
import {hostedOrder,type HostedOrderResponse} from './hostedOrders';
import {OrderReview} from './MarketplaceScreens';
import { customerRulesText } from './rulesCopy';
import { OrderWorkflowPanel,commerceStateLabel } from './CommerceScreens';
import { useEffect,useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Choice, dateTime, EmptyState, errorKey, Field, localized, money, ServiceSummary, Sheet, SummaryRow, ui } from '../../components/FormUI';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import { colors } from '../../theme';
import { parseRefundAmount, refundLabels, serverLabels, statusLabels, type Order, type OrderStatus, type RefundReason } from './domain';
import type { Marketplace } from './useMarketplace';

function CancelSheet({ order, market, onClose }: { order: Order | null; market: Marketplace; onClose: () => void }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const submitting = useRef(false);
  const cancel = async () => {
    if (!order || submitting.current) return;
    submitting.current = true; setBusy(true); setNotice(null);
    try { await market.cancelOrder(order.id); onClose(); }
    catch (error) { setNotice(errorKey(error)); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <Sheet visible={!!order} title={t('cancelOrderTitle')} closeDisabled={busy} onClose={() => { if (!busy) onClose(); }}>
    <Text style={ui.body}>{t('cancelOrderBody')}</Text>
    {notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
    <ActionButton label={t('keepOrder')} disabled={busy} onPress={onClose} />
    <ActionButton label={t('cancelOrder')} busy={busy} onPress={() => void cancel()} secondary />
  </Sheet>;
}

export type OrderFilter = 'all' | OrderStatus | 'afterSales' | 'inService' | 'awaitingAcceptance' | 'completed' | 'refunded' | 'refundProcessing' | 'awaitingReview';
const filters: { value: OrderFilter; label: TranslationKey }[] = [
  { value: 'all', label: 'ordersAll' }, { value: 'unpaid', label: 'statusUnpaid' },
  { value: 'awaitingService', label: 'statusAwaitingService' }, { value: 'afterSales', label: 'statusAfterSales' },
  { value: 'closed', label: 'statusClosed' },{value:'inService',label:'commerceInService'},{value:'awaitingAcceptance',label:'commerceAwaitingAcceptance'},{value:'completed',label:'commerceCompleted'},{value:'refunded',label:'commerceRefunded'}, {value:'awaitingReview',label:'ordersAwaitingReview'}, {value:'refundProcessing',label:'ordersRefundProcessing'},
];
export function OrdersScreen({ market, onOpen, onPay, onContact, onStore, onSignIn, onExplore, initialRole='buyer', initialFilter = 'all' }: {
  market: Marketplace; onOpen: (id: string) => void; onPay: (id: string) => void; onContact: (serviceId: string) => void;
  onStore: (serviceId: string) => void; onSignIn: () => void; onExplore: () => void; initialRole?:'buyer'|'seller';initialFilter?: OrderFilter;
}) {
  const { t, language } = useLanguage();
  const [filter, setFilter] = useState<OrderFilter>(initialFilter);
  const [search, setSearch] = useState('');
  const [role,setRole]=useState<'buyer'|'seller'>(initialRole);
  const [remote,setRemote]=useState<Order[]>([]),[remoteLoading,setRemoteLoading]=useState(false),[remoteError,setRemoteError]=useState(false),[remoteCursor,setRemoteCursor]=useState<string|null>(null),[version,setVersion]=useState(0);const generation=useRef(0),fetching=useRef(false);
  const source=market.hosted?remote:role==='seller'?market.sellerOrders:market.orders;
  const loadRemote=async(more=false)=>{if(fetching.current)return;fetching.current=true;const current=generation.current;setRemoteLoading(true);setRemoteError(false);try{const data=await commerceApi<{orders:HostedOrderResponse[];nextCursor:string|null}>('/orders?role='+role+'&filter='+filter+'&q='+encodeURIComponent(search.trim())+(more&&remoteCursor?'&after='+remoteCursor:''));if(current===generation.current){const rows=data.orders.map(o=>hostedOrder(o,market.profile?.phone??''));setRemote(old=>more?[...old,...rows.filter(o=>!old.some(a=>a.id===o.id))]:rows);setRemoteCursor(data.nextCursor);}}catch{if(current===generation.current)setRemoteError(true);}finally{if(current===generation.current){fetching.current=false;setRemoteLoading(false);}}};
  useEffect(()=>{if(!market.hosted||!market.profile)return;generation.current++;fetching.current=false;setRemote([]);setRemoteCursor(null);const timer=setTimeout(()=>void loadRemote(),200);return()=>{generation.current++;clearTimeout(timer);};},[role,filter,search,version,market.profile?.phone,market.orders,market.sellerOrders]);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const visible = market.hosted?source:source.filter(order =>
    (filter === 'all' || (filter === 'afterSales' ? !!order.refund||!!order.activeCaseId : (market.hosted?order.fulfillmentStage??order.status:order.status) === filter)) &&
    (order.id + ' ' + order.service.name + ' ' + localized(order.service.title, language)).toLowerCase().includes(search.trim().toLowerCase()));
  return <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={ui.title}>{t('ordersTitle')}</Text>
    {!market.profile ? <><EmptyState mood="welcome" title={t('signInTitle')} body={t('signInRequired')} /><ActionButton label={t('signIn')} onPress={onSignIn} /></> : <>
      {market.hosted&&<><View style={ui.choiceRow}><Choice label={t('buyerOrders')} selected={role==='buyer'} onPress={()=>setRole('buyer')}/><Choice label={t('sellerOrders')} selected={role==='seller'} onPress={()=>setRole('seller')}/></View><View style={ui.notice}><Text style={ui.caption}>{t('simulationNotice')}</Text></View><ActionButton secondary busy={market.ordersLoading} label={t('ordersRefresh')} onPress={()=>{setVersion(v=>v+1);void market.reload();}}/>{market.ordersError&&<Text style={ui.error}>{t(market.ordersError)}</Text>}</>}
      {remoteLoading&&<Text style={ui.caption}>{t('loading')}</Text>}{remoteError&&<Text accessibilityRole="alert" style={ui.error}>{t('hostedUnavailable')}</Text>}
      <Field label={t('orderSearch')} value={search} onChangeText={setSearch} placeholder={t('orderSearch')} returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.filter(item=>market.hosted||!['inService','awaitingAcceptance','completed','refunded'].includes(item.value)).map(item => <Choice key={item.value} label={t(item.label)} selected={filter === item.value} onPress={() => setFilter(item.value)} />)}
      </ScrollView>
      {visible.map(order => <View key={order.id} style={ui.card}>
        <View style={ui.summaryRow}><Pressable accessibilityRole="button" onPress={() => onStore(order.service.id)} style={styles.store}>
          <Text style={ui.label}>{order.service.name} ›</Text></Pressable>
          <Text style={styles.status}>{market.hosted?commerceStateLabel(order.displayStatus??order.fulfillmentStage??order.status,language):t(order.refund ? 'statusAfterSales' : statusLabels[order.status])}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={localized(order.service.title, language) + ', ' + order.id}
          onPress={() => onOpen(order.id)} style={styles.orderBody}>
          <View style={ui.row}><View style={[ui.avatar, { backgroundColor: order.service.tint }]}><Text style={ui.initial}>{order.service.initials}</Text></View>
            <View style={ui.flex}><Text style={ui.heading}>{localized(order.service.title, language)}</Text>
              <Text style={ui.caption}>{t(order.service.mode === 'duo' ? 'modeDuo' : 'modeSquad')} · {order.quantity} {t('hours')}</Text></View></View>
          <SummaryRow label={t(order.paidAt ? 'amountPaid' : 'amountDue')} value={money(order.totalFen, language)} emphasis />
          {order.deadlineAt && <Text style={ui.caption}>{t('deliverBy')}: {dateTime(order.deadlineAt, language)}</Text>}
          {market.hosted&&!!order.totalRefundedFen&&<Text style={ui.caption}>{language==='zh'?'累计退款':'Total refunded'} · {money(order.totalRefundedFen,language)}</Text>}
          {order.refund && <Text style={ui.caption}>{t('refundPending')} · {money(order.refund.amountFen, language)}</Text>}
        </Pressable>
        {market.hosted&&<Text style={ui.caption}>{t(order.paymentStatus==='pending'?'simulationPending':order.paymentStatus==='failed'?'simulationFailed':'simulationOnly')}</Text>}
        <View style={styles.actions}>
          {role==='buyer'&&order.status === 'unpaid' && <ActionButton label={t('cancelOrder')} onPress={() => setCancelling(order)} secondary />}
          {!market.hosted&&<ActionButton label={t('contactSeller')} onPress={() => onContact(order.service.id)} secondary />}
          {role==='buyer'&&order.status === 'unpaid' && <ActionButton disabled={market.hosted&&!market.simulationEnabled} label={t('payNow')} onPress={() => onPay(order.id)} />}
        </View>
      </View>)}
      {market.hosted&&remoteCursor&&<ActionButton secondary busy={remoteLoading} label={t('ordersLoadMore')} onPress={()=>void loadRemote(true)}/>}
      {!visible.length&&!remoteLoading&&!remoteError && <><EmptyState mood={source.length ? 'curious' : 'waiting'} title={t('ordersTitle')} body={t(source.length ? 'filteredOrdersEmpty' : 'ordersBody')} />
        {!source.length && <ActionButton label={t('explore')} onPress={onExplore} />}</>}
    </>}
    <CancelSheet order={cancelling} market={market} onClose={() => setCancelling(null)} />
  </ScrollView>;
}

function RefundSheet({ visible, order, market, onClose }: { visible: boolean; order: Order; market: Marketplace; onClose: () => void }) {
  const { t } = useLanguage();
  const [reason, setReason] = useState<RefundReason | null>(null);
  const [amount, setAmount] = useState((order.totalFen / 100).toFixed(2));
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, TranslationKey>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    const amountFen = parseRefundAmount(amount, order.totalFen);
    const next: Record<string, TranslationKey> = {};
    if (!reason) next.reason = 'refundReasonRequired';
    if (!amountFen) next.amount = 'invalidRefundAmount';
    if (!description.trim() || description.trim().length > 500) next.description = 'refundDescriptionRequired';
    setErrors(next);
    if (Object.keys(next).length || !reason || !amountFen) return;
    submitting.current = true; setBusy(true); setNotice(null);
    try { await market.submitRefund(order.id, { reason, amountFen, description }); onClose(); }
    catch (error) { setNotice(errorKey(error)); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <Sheet visible={visible} title={t('refundTitle')} closeDisabled={busy} onClose={() => { if (!busy) onClose(); }}>
    <Text style={ui.label}>{t('refundReason')}</Text>
    <View style={ui.choiceRow}>{(Object.keys(refundLabels) as RefundReason[]).map(item => <Choice key={item}
      label={t(refundLabels[item])} selected={reason === item} disabled={busy} onPress={() => setReason(item)} />)}</View>
    {errors.reason && <Text accessibilityRole="alert" style={ui.error}>{t(errors.reason)}</Text>}
    <Field label={t('refundAmount')} value={amount} editable={!busy} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={10}
      error={errors.amount && t(errors.amount)} />
    <Field label={t('refundDescription')} value={description} editable={!busy} onChangeText={setDescription} placeholder={t('refundDescriptionPlaceholder')}
      multiline maxLength={500} error={errors.description && t(errors.description)} />
    <Text style={ui.caption}>{t('refundPendingBody')}</Text>
    {notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
    <ActionButton label={t('submitRefund')} busy={busy} onPress={() => void submit()} />
  </Sheet>;
}

export function OrderDetailScreen({ order, market, onBack, onPay, onContact,onOrder,onProduct }: {
  order: Order; market: Marketplace; onBack: () => void; onPay: () => void; onContact: () => void;onOrder?:(id:string)=>void;onProduct?:(id:string)=>void;
}) {
  const { t, language } = useLanguage();
  const [cancelling, setCancelling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  return <View style={ui.page}>
    <ScrollView contentContainerStyle={ui.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={ui.back}><Text style={ui.link}>‹ {t('back')}</Text></Pressable>
      <Text accessibilityRole="header" style={ui.title}>{t('orderDetails')}</Text>
      {!market.hosted&&<View style={ui.notice}><Text style={ui.heading}>{t(order.refund ? 'statusAfterSales' : statusLabels[order.status])}</Text>
        <Text style={ui.body}>{t(market.hosted?'orderStageBoundary':order.refund ? 'refundPendingBody' : order.status === 'unpaid' ? 'unpaidBody' : order.status === 'closed' ? 'closedBody' : 'awaitingServiceBody')}</Text></View>}
      {market.hosted&&order.role==='buyer'&&order.paidAt&&<OrderReview key={order.id+':'+order.fulfillmentStage+':'+order.totalRefundedFen} id={order.id}/>}
      {market.hosted&&<OrderWorkflowPanel onOrder={onOrder} onProduct={onProduct} id={order.id} onChanged={()=>void market.refreshOrder(order.id).catch(()=>{})}/>}
      {market.hosted&&<View style={ui.notice}><Text style={ui.body}>{t('simulationNotice')}</Text><Text style={ui.caption}>{t(order.paymentStatus==='pending'?'simulationPending':order.paymentStatus==='failed'?'simulationFailed':'simulationOnly')}</Text></View>}
      {market.hosted&&<ActionButton secondary label={t('ordersRefresh')} onPress={()=>void market.refreshOrder(order.id).catch(()=>{})}/>}
      <ServiceSummary service={order.service} quantity={order.quantity} />
      <View style={ui.card}><SummaryRow label={t(order.paidAt ? 'amountPaid' : 'amountDue')} value={money(order.totalFen, language)} emphasis />
        <Text style={ui.caption}>{t('feesCovered')}</Text>
        <SummaryRow label={t('orderNumber')} value={order.id} /><SummaryRow label={t('createdAt')} value={dateTime(order.createdAt, language)} />
        {order.paidAt && <SummaryRow label={t('paidAt')} value={dateTime(order.paidAt, language)} />}
        {order.deadlineAt && <SummaryRow label={t('deliverBy')} value={dateTime(order.deadlineAt, language)} />}
      </View>
      <View style={ui.card}><Text style={ui.heading}>{t('deliveryTitle')}</Text>
        <SummaryRow label={t('gameName')} value={order.delivery.gameName} /><SummaryRow label={t('gameId')} value={order.delivery.gameId} />
        <SummaryRow label={t('gameServer')} value={order.delivery.server ? t(serverLabels[order.delivery.server]) : '—'} />
        {!!order.delivery.note && <><Text style={ui.label}>{t('orderNote')}</Text><Text style={ui.body}>{order.delivery.note}</Text><Text style={ui.caption}>{t('orderNoteHint')}</Text></>}
      </View>
      {order.refund && <View style={ui.card}><Text style={ui.heading}>{t('refundPending')}</Text>
        <SummaryRow label={t('requestedAmount')} value={money(order.refund.amountFen, language)} />
        <SummaryRow label={t('refundReason')} value={t(refundLabels[order.refund.reason])} />
        <Text style={ui.body}>{order.refund.description}</Text><Text style={ui.caption}>{t('refundPendingBody')}</Text>
      </View>}
      <View style={ui.card}><Text style={ui.heading}>{t('orderTimeline')}</Text>
        <SummaryRow label={t('eventCreated')} value={dateTime(order.createdAt, language)} />
        {order.paidAt && <SummaryRow label={t('eventPaid')} value={dateTime(order.paidAt, language)} />}
        {order.closedAt && <SummaryRow label={t('eventClosed')} value={dateTime(order.closedAt, language)} />}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setRulesOpen(true)} style={ui.back}><Text style={ui.link}>{t('platformRules')} ↗</Text></Pressable>
    </ScrollView>
    <View style={ui.footer}>
      {order.role!=='seller'&&order.status === 'unpaid' && <ActionButton disabled={market.hosted&&!market.simulationEnabled} label={t('payNow')} onPress={onPay} />}
      <View style={styles.actions}>{!market.hosted&&<ActionButton label={t('contactSeller')} onPress={onContact} secondary />}
        {order.role!=='seller'&&order.status === 'unpaid' && <ActionButton label={t('cancelOrder')} onPress={() => setCancelling(true)} secondary />}
        {!market.hosted&&order.status === 'awaitingService' && !order.refund && <ActionButton label={t('requestRefund')} onPress={() => setRefunding(true)} secondary />}
      </View>
    </View>
    <CancelSheet order={cancelling ? order : null} market={market} onClose={() => setCancelling(false)} />
    <RefundSheet visible={refunding} order={order} market={market} onClose={() => setRefunding(false)} />
    <Sheet visible={rulesOpen} title={t('platformRules')} onClose={() => setRulesOpen(false)}>
      <Text style={ui.body}>{customerRulesText(order.rules.version,localized(order.rules.text, language))}</Text>
    </Sheet>
  </View>;
}
const styles = StyleSheet.create({
  filters: { gap: 8, paddingBottom: 4 }, store: { minHeight: 44, justifyContent: 'center' },
  status: { color: colors.primary, fontSize: 12, lineHeight: 20, fontWeight: '700', alignSelf: 'center' },
  orderBody: { gap: 14 }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
});
