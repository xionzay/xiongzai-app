import { customerRulesText } from './rulesCopy';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedMascot } from '../../components/AnimatedMascot';
import { ActionButton, CheckRow, Choice, errorKey, Field, money, ServiceSummary, Sheet, SummaryRow, ui } from '../../components/FormUI';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import { colors } from '../../theme';
import { deliveryServers, emptyDelivery, quoteTotal, serverLabels, validateDelivery, type DeliveryDetails, type Order, type PlayMode, type ServiceSnapshot } from './domain';
import { localId, type Marketplace } from './useMarketplace';

export type SessionChoice = { mode: PlayMode; quantity: number };
export function VariantSheet({ visible, service, choice, onChange, onConfirm, onClose }: {
  visible: boolean; service: ServiceSnapshot; choice: SessionChoice; onChange: (choice: SessionChoice) => void;
  onConfirm: () => void; onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const total = quoteTotal(service.unitPriceFen, choice.quantity, service.maxQuantity);
  return <Sheet visible={visible} title={t('optionsTitle')} onClose={onClose}>
    <ServiceSummary service={service} quantity={choice.quantity} />
    <Text style={ui.label}>{t('playMode')}</Text>
    {service.listingRevision?<Text style={ui.body}>{t(service.mode==='duo'?'modeDuo':'modeSquad')}</Text>:<View style={ui.choiceRow}>{(['duo', 'squad'] as const).map(mode =>
      <Choice key={mode} label={t(mode === 'duo' ? 'modeDuo' : 'modeSquad')} selected={choice.mode === mode} onPress={() => onChange({ ...choice, mode })} />)}</View>}
    <View style={ui.summaryRow}><Text style={ui.label}>{t('quantity')}</Text>
      <View style={ui.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('decreaseQuantity')} disabled={choice.quantity === 1}
          onPress={() => onChange({ ...choice, quantity: choice.quantity - 1 })} style={[styles.stepper, choice.quantity === 1 && ui.disabled]}><Text style={styles.stepperText}>−</Text></Pressable>
        <Text style={ui.label}>{choice.quantity} {t(choice.quantity === 1 ? 'hour' : 'hours')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('increaseQuantity')} disabled={choice.quantity === service.maxQuantity}
          onPress={() => onChange({ ...choice, quantity: choice.quantity + 1 })} style={[styles.stepper, choice.quantity === service.maxQuantity && ui.disabled]}><Text style={styles.stepperText}>+</Text></Pressable>
      </View>
    </View>
    {service.listingRevision&&<Text style={ui.caption}>{t('simulationQuantityLimit')}</Text>}
    <SummaryRow label={t('total')} value={money(total, language)} emphasis />
    <ActionButton label={t('continue')} onPress={onConfirm} />
  </Sheet>;
}

export function CheckoutFlow({ service, quantity, delivery = emptyDelivery, onDeliveryChange, market, onSignIn, onExit, onOrder }: {
  service: ServiceSnapshot; quantity: number; delivery?: DeliveryDetails; onDeliveryChange: (delivery: DeliveryDetails) => void;
  market: Marketplace; onSignIn: () => void; onExit: () => void; onOrder: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const [step, setStep] = useState<'details' | 'review'>('details');
  const [errors, setErrors] = useState<Partial<Record<keyof DeliveryDetails, TranslationKey>>>({});
  const [accepted, setAccepted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesError, setRulesError] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const requestId = useRef(localId('checkout'));
  const total = quoteTotal(service.unitPriceFen, quantity, service.maxQuantity);
  const update = (key: keyof DeliveryDetails, value: string) => {
    onDeliveryChange({ ...delivery, [key]: value });
    setErrors(current => ({ ...current, [key]: undefined }));
  };
  const review = () => {
    const next = validateDelivery(delivery,service.game); setErrors(next);
    if (!Object.keys(next).length) setStep('review');
  };
  const submit = async () => {
    if (submitting.current) return;
    if (!market.profile) { onSignIn(); return; }
    const next = validateDelivery(delivery,service.game);
    if (Object.keys(next).length) { setErrors(next); setStep('details'); return; }
    if (!accepted) { setRulesError(true); return; }
    submitting.current = true; setBusy(true); setNotice(null);
    try {
      const order = await market.placeOrder(service, quantity, delivery, requestId.current);
      onOrder(order.id);
    } catch (error) { setNotice(errorKey(error)); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView style={ui.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView key={step} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={ui.content}>
      <Pressable accessibilityRole="button" onPress={() => { if (!busy) step === 'review' ? setStep('details') : onExit(); }} style={ui.back}>
        <Text style={ui.link}>‹ {t('back')}</Text></Pressable>
      <View style={styles.progress}><Text style={[styles.progressText, step === 'details' && styles.progressActive]}>1 · {t('deliveryTitle')}</Text>
        <Text style={[styles.progressText, step === 'review' && styles.progressActive]}>2 · {t('reviewTitle')}</Text></View>
      <Text accessibilityRole="header" style={ui.title}>{t(step === 'details' ? 'deliveryTitle' : 'reviewTitle')}</Text>
      <ServiceSummary service={service} quantity={quantity} />
      {market.hosted&&<View style={ui.notice}><Text style={ui.body}>{language==='zh'?'支付为模拟流程，不会产生真实扣款或安排实际服务。':'Payment is simulated. No real charge or live service booking is made.'}</Text></View>}
      {step === 'details' ? <>
        <Text style={ui.body}>{t('deliveryBody')}</Text>
        <Field label={t('gameName')} value={delivery.gameName} placeholder={t('gameNamePlaceholder')}
          maxLength={32} onChangeText={value => update('gameName', value)} error={errors.gameName && t(errors.gameName)} />
        <Field label={t(service.game==='valorant'?'valorantGameId':'gameId')} value={delivery.gameId} placeholder={t(service.game==='valorant'?'valorantGameIdPlaceholder':'gameIdPlaceholder')}
          maxLength={service.game==='valorant'?80:32} autoCapitalize="none" autoCorrect={false} onChangeText={value => update('gameId', value)} error={errors.gameId && t(errors.gameId)} />
        <Text style={ui.label}>{t('gameServer')}</Text>
        <View style={ui.choiceRow}>{deliveryServers(service.game).map(server => <Choice key={server} label={t(serverLabels[server])}
          selected={delivery.server === server} onPress={() => update('server', server)} />)}</View>
        {errors.server && <Text accessibilityRole="alert" style={ui.error}>{t(errors.server)}</Text>}
        <Field label={t('orderNote')} value={delivery.note} placeholder={t('orderNotePlaceholder')} multiline maxLength={300}
          onChangeText={value => update('note', value)} error={errors.note && t(errors.note)} hint={t('orderNoteHint')} />
      </> : <>
        <View style={ui.card}><Text style={ui.heading}>{t('deliveryTitle')}</Text>
          <SummaryRow label={t('gameName')} value={delivery.gameName} /><SummaryRow label={t(service.game==='valorant'?'valorantGameId':'gameId')} value={delivery.gameId} />
          <SummaryRow label={t('gameServer')} value={delivery.server ? t(serverLabels[delivery.server]) : '—'} />
          {!!delivery.note && <><Text style={ui.label}>{t('orderNote')}</Text><Text style={ui.body}>{delivery.note}</Text><Text style={ui.caption}>{t('orderNoteHint')}</Text></>}
          <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => setStep('details')} style={ui.back}><Text style={ui.link}>{t('editDetails')}</Text></Pressable>
        </View>
        <View style={ui.card}><Text style={ui.heading}>{t('completionCriteria')}</Text><Text style={ui.body}>{t(market.hosted?'orderStageBoundary':'completionBody')}</Text>
          {service.fulfillmentHours?<SummaryRow label={t('fulfillmentWindow')} value={service.fulfillmentHours + ' ' + t('withinHours')} />:<Text style={ui.caption}>{t('simulationNoDeadline')}</Text>}</View>
        <View style={ui.card}><SummaryRow label={t('amountDue')} value={money(total, language)} emphasis /><Text style={ui.caption}>{t('feesCovered')}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => setRulesOpen(true)} style={ui.back}><Text style={ui.link}>{t('platformRules')} ↗</Text></Pressable>
        <CheckRow label={t('acceptRules')} checked={accepted} disabled={busy} onPress={() => { setAccepted(!accepted); setRulesError(false); }} />
        {rulesError && <Text accessibilityRole="alert" style={ui.error}>{t('rulesRequired')}</Text>}
        {!market.profile && <View style={ui.notice}><Text style={ui.body}>{t('signInRequired')}</Text><ActionButton label={t('signIn')} onPress={onSignIn} secondary /></View>}
      </>}
      {notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
    </ScrollView>
    <View style={ui.footer}><SummaryRow label={t('amountDue')} value={money(total, language)} emphasis />
      <ActionButton label={t(step === 'details' ? 'continueReview' : 'placeOrder')} busy={busy}
        onPress={step === 'details' ? review : () => void submit()} /></View>
    <Sheet visible={rulesOpen} title={t('platformRules')} onClose={() => setRulesOpen(false)}>
      <Text style={ui.body}>{service.rulesText?customerRulesText(service.rulesVersion,service.rulesText[language]):t('rulesBody')}</Text>
      <ActionButton label={t('close')} onPress={() => setRulesOpen(false)} secondary />
    </Sheet>
  </KeyboardAvoidingView>;
}

export function PaymentScreen({ order, market, onLeave }: { order: Order; market: Marketplace; onLeave: () => void }) {
  const { t, language } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const submitting = useRef(false);
  const pay = async (outcome:'success'|'failure'|'pending'='success') => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setNotice(null);
    try { await market.payOrder(order.id,outcome); setConfirming(false); }
    catch (error) { setNotice(errorKey(error)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const successful = order.status === 'awaitingService';
  return <View style={ui.page}>
    <ScrollView contentContainerStyle={ui.content}>
      <Pressable accessibilityRole="button" onPress={onLeave} style={ui.back}><Text style={ui.link}>‹ {t('back')}</Text></Pressable>
      {successful ? <>
        <View style={{ marginVertical: 16 }}><AnimatedMascot mood="celebrate" label={t(market.hosted?'simulationSuccess':'paymentSuccess')} /></View>
        <Text accessibilityRole="header" style={ui.title}>{t(market.hosted?'simulationSuccess':'paymentSuccess')}</Text><Text style={ui.body}>{t(market.hosted?'simulationPaidBody':'paymentSuccessBody')}</Text>
      </> : <><Text accessibilityRole="header" style={ui.title}>{t('paymentTitle')}</Text><Text style={ui.body}>{t('paymentBody')}</Text></>}
      <ServiceSummary service={order.service} quantity={order.quantity} />
      <View style={ui.card}><SummaryRow label={t(successful ? 'amountPaid' : 'amountDue')} value={money(order.totalFen, language)} emphasis />
        <Text style={ui.caption}>{t('feesCovered')}</Text><SummaryRow label={t('orderNumber')} value={order.id} /></View>
      {market.hosted&&<View style={ui.notice}><Text style={ui.body}>{t(order.paymentStatus==='pending'?'simulationPending':order.paymentStatus==='failed'?'simulationFailed':'simulationNotice')}</Text>{!market.simulationEnabled&&<Text style={ui.error}>{t('orderSimulationDisabled')}</Text>}</View>}
      {!successful && !market.hosted && <View style={ui.card}><Text style={ui.label}>{t('paymentMethod')}</Text><View style={ui.row}>
        <View style={styles.wechatMark}><Text style={styles.wechatText}>✓</Text></View><Text style={ui.heading}>{t('wechatPay')}</Text>
      </View></View>}
      {market.hosted&&<ActionButton secondary busy={busy} label={t('ordersRefresh')} onPress={()=>void market.refreshOrder(order.id).catch(error=>setNotice(errorKey(error)))}/>}
      {!market.hosted&&<Text style={ui.caption}>{t('paymentTestNotice')}</Text>}
      {notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
    </ScrollView>
    <View style={ui.footer}>{successful ? <ActionButton label={t('viewOrder')} onPress={onLeave} /> :
      <><ActionButton label={t('payNow')} onPress={() => setConfirming(true)} disabled={order.status !== 'unpaid'||!market.simulationEnabled} />
        <ActionButton label={t('leavePayment')} onPress={onLeave} secondary /></>}</View>
    <Sheet visible={confirming} title={t(market.hosted?'simulationOnly':'paymentTestTitle')} closeDisabled={busy} onClose={() => { if (!busy) setConfirming(false); }}>
      <Text style={ui.body}>{t('paymentTestNotice')}</Text><SummaryRow label={t('amountDue')} value={money(order.totalFen, language)} emphasis />
      {notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
      <ActionButton label={t(market.hosted?'simulationSuccessAction':'confirmTestPayment')} busy={busy} onPress={() => void pay('success')} />
      {market.hosted&&<><ActionButton secondary label={t('simulationFailureAction')} disabled={busy} onPress={()=>void pay('failure')}/><ActionButton secondary label={t('simulationPendingAction')} disabled={busy} onPress={()=>void pay('pending')}/></>}
      <ActionButton label={t('close')} disabled={busy} secondary onPress={() => setConfirming(false)} />
    </Sheet>
  </View>;
}
const styles = StyleSheet.create({
  stepper: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 24, color: colors.navy, fontWeight: '600' },
  progress: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  progressText: { color: colors.secondaryText, fontSize: 12, lineHeight: 20 },
  progressActive: { color: colors.primary, fontWeight: '800' },
  wechatMark: { width: 36, height: 36, backgroundColor: '#07C160', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  wechatText: { color: '#fff', fontSize: 22, fontWeight: '800' },
});
