import { HostedCommunity } from '../features/marketplace/CommerceScreens';
import { HostedDiscovery, HostedListingDetail } from '../features/marketplace/HostedDiscovery';
import { useNotifications } from '../components/Notifications';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageProvider';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import { colors } from '../theme';
import { OnboardingScreen } from './OnboardingScreen';
import { TabIcon } from '../components/TabIcon';
import { HeroVideo } from '../components/HeroVideo';
import { SkyBackdrop } from '../components/SkyBackdrop';
import { ActionButton, EmptyState, money, ui } from '../components/FormUI';
import { ProviderProfileScreen } from '../features/marketplace/ProviderProfileScreen';
import { AccountScreen, AccountSheet } from '../features/marketplace/AccountScreens';
import { ConversationScreen, MessagesScreen } from '../features/marketplace/MessageScreens';
import { OrderDetailScreen, OrdersScreen, type OrderFilter } from '../features/marketplace/OrderScreens';
import { CheckoutFlow, PaymentScreen, VariantSheet, type SessionChoice } from '../features/marketplace/PurchaseFlow';
import { useMarketplace } from '../features/marketplace/useMarketplace';
import { emptyDelivery, type DeliveryDetails, type ServiceSnapshot } from '../features/marketplace/domain';
import { demoServices, type DemoService } from './demo-services';

type Tab = 'home' | 'orders' | 'messages' | 'me';
type Route = { type: 'service' | 'checkout' | 'conversation'; serviceId: string } | { type: 'order' | 'payment'; orderId: string } | { type: 'provider' } | {type:'hostedService';listingId:string} | {type:'hostedCheckout';service:ServiceSnapshot;quantity:number} | {type:'hostedHub'};
const tabs: { key: Tab }[] = [{ key: 'home' }, { key: 'orders' }, { key: 'messages' }, { key: 'me' }];
const defaultChoice: SessionChoice = { mode: 'duo', quantity: 1 };
function snapshot(service: DemoService, choice: SessionChoice): ServiceSnapshot {
  return { id: service.id, name: service.name, initials: service.initials, tint: service.tint,
    title: { en: en[service.title], zh: zh[service.title] }, mode: choice.mode,
    unitPriceFen: service.pricesFen[choice.mode], maxQuantity: service.maxQuantity, fulfillmentHours: service.fulfillmentHours };
}
function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();
  return <View style={styles.language} accessibilityLabel={t('choose')}>
    {(['zh', 'en'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'zh' ? '中文' : 'English'} accessibilityState={{ selected: language === value }} onPress={() => setLanguage(value)} style={[styles.languageButton, language === value && styles.languageSelected]}><Text style={[styles.languageText, language === value && styles.white]}>{value === 'zh' ? '中文' : 'EN'}</Text></Pressable>)}
  </View>;
}
export function PrototypeApp() {
  const { t, language, ready, saveError } = useLanguage();
  const market = useMarketplace();
  const { notify } = useNotifications();
  const [tab, setTab] = useState<Tab>('home');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filter, setFilter] = useState<'all' | 'relaxed' | 'ranked'>('all');
  const [search, setSearch] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, SessionChoice>>({});
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryDetails>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<'signIn' | 'signUp'>('signIn');
  const [replayOnboarding, setReplayOnboarding] = useState(false);
  const afterSignIn = useRef<(() => void) | null>(null);
  const previousPhone = useRef<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const listOffset = useRef(0);
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 390 || fontScale > 1.15;
  const phone = market.profile?.phone ?? null;
  useEffect(() => {
    // A guest can sign in during checkout without losing their form. Changing
    // or leaving an existing account clears its private in-memory drafts/routes.
    if (previousPhone.current && previousPhone.current !== phone) {
      setRoutes([]); setOptionsOpen(false); setDeliveries({}); setMessageDrafts({}); afterSignIn.current = null;
    }
    previousPhone.current = phone;
  }, [phone]);
  const route = routes.at(-1);
  const service = route && 'serviceId' in route ? demoServices.find(item => item.id === route.serviceId) : undefined;
  const selected = route?.type === 'service' ? service : undefined;
  const order = route && 'orderId' in route ? [...market.orders,...market.sellerOrders].find(item => item.id === route.orderId) : undefined;
  const choice = service ? choices[service.id] ?? defaultChoice : defaultChoice;
  const quote = service ? snapshot(service, choice) : null;
  const listings = demoServices.filter(item => (filter === 'all' || item.category === filter) && `${item.name} ${t(item.title)} ${t('game')}`.toLowerCase().includes(search.trim().toLowerCase()));
  const push = (next: Route) => {
    if (market.hosted && ['conversation'].includes(next.type)) { notify('hostedFeatureUnavailable', 'info'); return; }
    setRoutes(current => [...current, next]);
  };
  const back = () => { setOptionsOpen(false); setRoutes(current => current.slice(0, -1)); };
  const navigate = (next: Tab) => { if (next === 'orders') setOrderFilter('all'); setTab(next); setRoutes([]); setOptionsOpen(false); };
  const openAccount = (onSaved?: () => void) => { afterSignIn.current = onSaved ?? null; setAccountMode('signIn'); setAccountOpen(true); };
  const contact = (id: string) => {
    if (market.hosted) { notify('hostedFeatureUnavailable', 'info'); return; }
    const open = () => push({ type: 'conversation', serviceId: id });
    if (market.profile) open(); else openAccount(open);
  };
  const openPayment = (id: string) => { setOrderFilter('all'); setTab('orders'); setRoutes([{ type: 'order', orderId: id }, { type: 'payment', orderId: id }]); };
  const draftKey = `${phone ?? 'guest'}:${service?.id ?? ''}`;
  if (!ready || !market.ready) return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel={t('loading')} /></SafeAreaView>;
  if (!market.onboardingDone || replayOnboarding) return <View style={styles.screen}>
    <OnboardingScreen languageSwitch={<LanguageSwitch />} market={market} onExplore={() => setReplayOnboarding(false)}
      onAccount={mode => { setAccountMode(mode); setAccountOpen(true); }} />
    {accountOpen && <AccountSheet visible initialMode={accountMode} market={market} onClose={() => setAccountOpen(false)} onSaved={provider => { setReplayOnboarding(false); if (provider) navigate('me'); }} />}
  </View>;
  return <SafeAreaView style={styles.screen}>
    {(tab === 'home' || tab === 'me') && !route && <SkyBackdrop profile={tab === 'me'} />}
    {tab === 'home' && !route && <View style={styles.header}>
      <View style={styles.identity}><Image source={require('../../assets/mascot.png')} style={styles.logo} /><View style={styles.flex}><Text style={styles.brand}>熊崽电竞</Text><Text style={styles.brandEnglish}>XIONGZAI</Text></View></View>
      <LanguageSwitch />
    </View>}
    {market.profile?.accountRestricted&&<View style={[ui.notice,{marginHorizontal:20}]}><Text style={ui.caption}>{t('accountRestricted')}</Text></View>}
    {saveError && <Text accessibilityRole="alert" style={styles.error}>{t('saveError')}</Text>}
    {market.storageNotice && <View style={[ui.notice, { marginHorizontal: 20 }]}><Text accessibilityRole="alert" style={ui.caption}>{t(market.storageNotice)}</Text>
      {(market.hosted || market.storageNotice === 'storageUnavailable') && <ActionButton label={t('retry')} onPress={() => void market.reload()} secondary />}</View>}
    {market.hosted&&!market.profile&&(route?.type==='hostedHub'||(!route&&tab==='messages'))?<View style={ui.content}><Text style={ui.body}>{t('signInRequired')}</Text><ActionButton label={t('signIn')} onPress={()=>openAccount()}/></View>:market.hosted&&(route?.type==='hostedHub'||(!route&&tab==='messages'))?<HostedCommunity initialTab={route?.type==='hostedHub'?'funds':'chats'} onOrder={id=>{void market.refreshOrder(id).then(()=>push({type:'order',orderId:id})).catch(()=>notify('orderUnavailable','error'));}} onProduct={id=>push({type:'hostedService',listingId:id})}/>:market.hosted&&route?.type==='hostedService'?<HostedListingDetail id={route.listingId} onBack={back} onPurchase={(service,quantity)=>push({type:'hostedCheckout',service,quantity})}/>:market.hosted&&!route&&tab==='home'?<HostedDiscovery onOpen={listingId=>push({type:'hostedService',listingId})}/>:route?.type==='hostedCheckout'?<CheckoutFlow key={route.service.id} service={route.service} quantity={route.quantity} market={market} delivery={deliveries[route.service.id]??emptyDelivery} onDeliveryChange={value=>setDeliveries(current=>({...current,[route.service.id]:value}))} onSignIn={()=>openAccount()} onExit={back} onOrder={openPayment}/>:route?.type === 'provider' ? <ProviderProfileScreen key={phone ?? 'guest'} market={market} onBack={back} onAccount={() => openAccount()} />
      : route?.type === 'checkout' && service && quote ?
      <CheckoutFlow key={`checkout:${service.id}`} service={quote} quantity={choice.quantity} market={market}
        delivery={deliveries[service.id] ?? emptyDelivery} onDeliveryChange={value => setDeliveries(current => ({ ...current, [service.id]: value }))}
        onSignIn={() => openAccount()} onExit={back} onOrder={id => { setDeliveries(current => { const next = { ...current }; delete next[service.id]; return next; }); openPayment(id); }} />
      : route?.type === 'payment' && order ? <PaymentScreen key={order.id} order={order} market={market} onLeave={back} />
      : route?.type === 'order' && order ? <OrderDetailScreen key={order.id} order={order} market={market} onBack={back}
        onPay={() => push({ type: 'payment', orderId: order.id })} onContact={() => contact(order.service.id)} />
      : route?.type === 'conversation' && service ? <ConversationScreen key={draftKey} service={service} market={market}
        draft={messageDrafts[draftKey] ?? ''} onDraftChange={value => setMessageDrafts(current => ({ ...current, [draftKey]: value }))}
        onBack={back} onService={() => push({ type: 'service', serviceId: service.id })} onSignIn={() => openAccount()} />
      : route && !selected ? <View style={ui.content}><Text style={ui.error}>{t('orderUnavailable')}</Text><ActionButton label={t('back')} onPress={back} /></View>
      : !route && tab === 'orders' ? <OrdersScreen key={`${phone ?? 'guest'}:${orderFilter}`} initialFilter={orderFilter} market={market} onOpen={id => push({ type: 'order', orderId: id })}
        onPay={openPayment} onContact={contact} onStore={id => push(market.hosted?{type:'hostedService',listingId:id}:{ type: 'service', serviceId: id })} onSignIn={() => openAccount()} onExplore={() => navigate('home')} />
      : !route && tab === 'messages' ? <MessagesScreen key={phone ?? 'guest'} market={market} onOpen={contact} onSignIn={() => openAccount()} />
      : <ScrollView ref={scroll} key={`${tab}-${selected?.id ?? 'list'}`} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {selected ? <>
          <Pressable onPress={back} accessibilityRole="button" style={styles.back}><Text style={styles.link}>‹ {t('back')}</Text></Pressable>
          <Text style={styles.eyebrow}>{t('service')}</Text>
          <View style={[styles.profileHero, { backgroundColor: selected.tint }]}><Text style={styles.largeInitial}>{selected.initials}</Text><Text style={styles.pill}>{t('sample')}</Text></View>
          <Text style={styles.title}>{selected.name}</Text><Text style={styles.subtitle}>{t(selected.title)}</Text>
          <Text style={styles.tag}>{t('game')} · {t(selected.category)}</Text>
          <View style={styles.panel}><Text style={styles.section}>{t('about')}</Text><Text style={styles.body}>{t(selected.description)}</Text></View>
          <View style={styles.panel}><Text style={styles.section}>{t('includes')}</Text><Text style={styles.body}>{t('includesBody')}</Text></View>
          <View style={[styles.bookingBar, narrow && styles.stack]}><Text style={styles.price}>{money(selected.pricesFen[choice.mode], language)} <Text style={styles.muted}>{t('perHour')}</Text></Text><Pressable onPress={() => setOptionsOpen(true)} accessibilityRole="button" style={styles.primary}><Text style={styles.buttonText}>{t('book')}</Text></Pressable></View>
          <ActionButton label={t('contactSeller')} onPress={() => contact(selected.id)} secondary />
        </> : tab === 'home' ? <>
          <View style={styles.hero}>
            <HeroVideo />
            <View style={styles.heroContent}>
              <Text style={styles.eyebrow}>{t('eyebrow')}</Text>
              <View><Text style={styles.title}>{t('heroTitle')}</Text><Text style={styles.heroBody}>{t('heroBody')}</Text></View>
              <Pressable onPress={() => scroll.current?.scrollTo({ y: listOffset.current, animated: true })} accessibilityRole="button" style={styles.primary}><Text style={styles.buttonText}>{t('explore')} ↗</Text></Pressable>
            </View>
          </View>
          <View style={styles.search}><Text accessible={false} style={styles.searchSymbol}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder={t('search')} accessibilityLabel={t('search')} placeholderTextColor={colors.secondaryText} style={styles.input} returnKeyType="search" />{search !== '' && <Pressable onPress={() => setSearch('')} accessibilityLabel={t('clear')} accessibilityRole="button" style={styles.clear}><Text style={styles.link}>×</Text></Pressable>}</View>
          <View style={styles.filters}>{(['all', 'relaxed', 'ranked'] as const).map(value => <Pressable key={value} onPress={() => setFilter(value)} accessibilityRole="button" accessibilityState={{ selected: value === filter }} style={[styles.filter, value === filter && styles.filterSelected]}><Text style={[styles.filterText, value === filter && styles.white]}>{t(value)}</Text></Pressable>)}</View>
          <View onLayout={event => { listOffset.current = event.nativeEvent.layout.y; }}><Text style={styles.section}>{t('recommended')}</Text><Text style={styles.muted}>{listings.length} {t('count')} · {t('game')}</Text></View>
          {listings.map(item => <Pressable key={item.id} onPress={() => push({ type: 'service', serviceId: item.id })} accessibilityRole="button" accessibilityLabel={`${item.name}, ${t(item.title)}, ${money(item.pricesFen.duo, language)}, ${t('details')}`} style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}>
            <View style={styles.cardTop}><View style={[styles.avatar, { backgroundColor: item.tint }]}><Text style={styles.initial}>{item.initials}</Text></View><View style={styles.flex}><Text style={styles.cardName}>{item.name}</Text><Text style={styles.tag}>{t('game')} · {t(item.category)}</Text></View><Text style={styles.arrow}>↗</Text></View>
            <Text style={styles.cardTitle}>{t(item.title)}</Text><Text style={styles.body}>{t(item.description)}</Text>
            <View style={styles.cardBottom}><Text style={styles.price}>{money(item.pricesFen.duo, language)}<Text style={styles.muted}> {t('perHour')}</Text></Text><Text style={styles.link}>{t('details')}</Text></View>
          </Pressable>)}
          {listings.length === 0 && <EmptyState mood="curious" title={t('noResults')} body={t('noResultsBody')} />}
        </> : <AccountScreen onProvider={() => push({ type: 'provider' })} onIntroduction={() => setReplayOnboarding(true)} market={market} languageSwitch={<LanguageSwitch />} onAccount={() => openAccount()} onOrders={(filter = 'all') => { navigate('orders'); setOrderFilter(filter); }} onMessages={() => navigate('messages')} />}{market.hosted&&!selected&&tab==='me'&&<ActionButton secondary label={language==='zh'?'收益、提现与支持':'Earnings, withdrawals & support'} onPress={()=>push({type:'hostedHub'})}/>}
      </ScrollView>}
    {!route && <View style={styles.nav}>{tabs.map(item => <Pressable key={item.key} onPress={() => navigate(item.key)} accessibilityRole="button" accessibilityState={{ selected: tab === item.key }} accessibilityLabel={t(item.key)} style={styles.navItem}><TabIcon name={item.key} selected={tab === item.key} /><Text style={[styles.navLabel, tab === item.key && styles.active]}>{t(item.key)}</Text></Pressable>)}</View>}
    {selected && quote && <VariantSheet visible={optionsOpen} service={quote} choice={choice}
      onChange={value => setChoices(current => ({ ...current, [selected.id]: value }))} onClose={() => setOptionsOpen(false)}
      onConfirm={() => { setOptionsOpen(false); push({ type: 'checkout', serviceId: selected.id }); }} />}
    {accountOpen && <AccountSheet visible initialMode={accountMode} market={market} onClose={() => { setAccountOpen(false); afterSignIn.current = null; }}
      onSaved={provider => { const action = afterSignIn.current; afterSignIn.current = null; if (action) action(); else if (provider) navigate('me'); }} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }, logo: { width: 42, height: 42, borderRadius: 13 }, flex: { flex: 1 }, brand: { fontSize: 18, fontWeight: '800', color: colors.navy }, brandEnglish: { fontSize: 9, letterSpacing: 2, color: colors.secondaryText, marginTop: 2 },
  language: { alignSelf: 'flex-start', flexDirection: 'row', borderRadius: 15, backgroundColor: colors.highlight, padding: 3 }, languageButton: { minWidth: 44, minHeight: 44, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, languageSelected: { backgroundColor: colors.primary }, languageText: { fontSize: 13, fontWeight: '700', color: colors.navy }, white: { color: colors.card },
  content: { padding: 20, paddingTop: 8, gap: 18, paddingBottom: 28 }, hero: { borderRadius: 28, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' }, heroContent: { padding: 22, gap: 16 }, eyebrow: { fontSize: 11, lineHeight: 17, letterSpacing: 1.4, color: colors.secondaryText, fontWeight: '700' }, stack: { flexDirection: 'column', alignItems: 'stretch' }, title: { fontSize: 27, lineHeight: 34, fontWeight: '800', color: colors.navy }, heroBody: { fontSize: 15, lineHeight: 23, color: colors.secondaryText, marginTop: 12 },
  primary: { minHeight: 48, paddingVertical: 13, paddingHorizontal: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, buttonText: { color: colors.card, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.highlight, backgroundColor: colors.card, borderRadius: 18, paddingLeft: 14, minHeight: 54 }, searchSymbol: { fontSize: 25, color: colors.primary, marginRight: 8 }, input: { flex: 1, fontSize: 15, color: colors.navy, paddingVertical: 14 }, clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filter: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.highlight, minHeight: 44 }, filterSelected: { backgroundColor: colors.navy, borderColor: colors.navy }, filterText: { fontSize: 14, color: colors.secondaryText, fontWeight: '600' },
  section: { fontSize: 22, lineHeight: 29, color: colors.navy, fontWeight: '700' }, muted: { fontSize: 13, lineHeight: 20, color: colors.secondaryText, fontWeight: '400' }, body: { fontSize: 16, lineHeight: 24, color: colors.secondaryText },
  serviceCard: { padding: 18, borderRadius: 24, backgroundColor: colors.card, gap: 12, borderWidth: 1, borderColor: '#E5EEF8' }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, initial: { fontSize: 24, fontWeight: '700', color: colors.navy }, cardName: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.navy }, tag: { fontSize: 12, lineHeight: 20, color: colors.secondaryText }, arrow: { color: colors.primary, fontSize: 25 }, cardTitle: { color: colors.navy, fontSize: 18, lineHeight: 25, fontWeight: '700' }, cardBottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: '#EDF3FA', paddingTop: 12 }, price: { fontSize: 22, fontWeight: '800', color: colors.navy }, sampleBadge: { maxWidth: '100%', borderRadius: 10, backgroundColor: colors.highlight, color: colors.navy, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, lineHeight: 18, fontWeight: '700' }, link: { fontSize: 14, lineHeight: 22, color: colors.primary, fontWeight: '700' }, pressed: { opacity: 0.72 }, demo: { textAlign: 'center', fontSize: 12, lineHeight: 18, color: colors.secondaryText },
  nav: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.card, borderTopWidth: 1, borderColor: '#E5EEF8' }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, paddingHorizontal: 2 }, navIcon: { fontSize: 26, lineHeight: 28, color: colors.secondaryText, fontWeight: '600' }, navLabel: { fontSize: 12, lineHeight: 18, color: colors.secondaryText, textAlign: 'center' }, active: { color: colors.primary, fontWeight: '800' },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, profileHero: { minHeight: 150, borderRadius: 28, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }, largeInitial: { color: colors.navy, fontSize: 54, fontWeight: '700' }, pill: { fontSize: 12, color: colors.navy, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 }, subtitle: { fontSize: 19, lineHeight: 27, color: colors.secondaryText }, panel: { backgroundColor: colors.card, padding: 20, borderRadius: 22, gap: 12 }, bookingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }, emptyBear: { width: 120, height: 120, borderRadius: 30, alignSelf: 'center', marginVertical: 24 }, error: { paddingHorizontal: 20, color: '#B42318', fontSize: 14, lineHeight: 21 },
  overlay: { flex: 1, backgroundColor: 'rgba(8,46,114,0.3)', justifyContent: 'flex-end' }, sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' }, sheetContent: { padding: 24, gap: 16 }, secondary: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.highlight }, secondaryText: { color: colors.navy, fontSize: 16, lineHeight: 22, fontWeight: '700' }, summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
});
