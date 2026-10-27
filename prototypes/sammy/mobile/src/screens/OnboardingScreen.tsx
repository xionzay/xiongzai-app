import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedMascot } from '../components/AnimatedMascot';
import { ActionButton, errorKey, ui } from '../components/FormUI';
import { SkyBackdrop } from '../components/SkyBackdrop';
import { useLanguage, type TranslationKey } from '../i18n/LanguageProvider';
import type { Marketplace } from '../features/marketplace/useMarketplace';
import { colors } from '../theme';
const pages = [
  { title: 'onboardTitle1', body: 'onboardBody1', tag: 'onboardTag1', mood: 'welcome', symbols: ['✦', '♡', '✧'] },
  { title: 'onboardTitle2', body: 'onboardBody2', tag: 'onboardTag2', mood: 'curious', symbols: ['01', '02', '03'] },
  { title: 'onboardTitle3', body: 'onboardBody3', tag: 'onboardTag3', mood: 'celebrate', symbols: ['✧', '♡', '✦'] },
] as const;
export function OnboardingScreen({ languageSwitch, market, onExplore, onAccount }: {
  languageSwitch: ReactNode; market: Marketplace; onExplore: () => void; onAccount: (mode: 'signIn' | 'signUp') => void;
}) {
  const { t } = useLanguage();
  const { height } = useWindowDimensions();
  const compact = height < 900;
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const item = pages[page];
  const explore = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await market.completeOnboarding(); onExplore(); }
    catch (problem) { setError(errorKey(problem)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={s.screen}>
    <SkyBackdrop />
    <SafeAreaView style={s.screen}>
    <View style={s.header}><Text style={s.brand}>熊崽电竞<Text style={s.small}> / XIONGZAI</Text></Text>{languageSwitch}</View>
    <ScrollView contentContainerStyle={[s.content, compact && s.contentCompact]}>
      <View style={[s.stage, compact && s.stageCompact]}>
        <View style={[s.orbit, compact && s.orbitCompact]}><View style={[s.inner, compact && s.innerCompact]}><AnimatedMascot size={compact ? 132 : 158} mood={item.mood} label={t('brand')} /></View></View>
        <View accessible={false} style={s.tokens}>{item.symbols.map((symbol, i) => <View key={i} style={[s.token, i === 1 && s.middle]}><Text style={s.symbol}>{symbol}</Text></View>)}</View>
      </View>
      <View style={s.copy} accessibilityLiveRegion="polite"><Text style={s.tag}>{t(item.tag)}</Text><Text accessibilityRole="header" style={s.title}>{t(item.title)}</Text><Text style={s.body}>{t(item.body)}</Text></View>
      <View accessibilityLabel={`${t('onboardProgress')} ${page + 1}/3`} style={s.dots}>{pages.map((_, i) => <View key={i} style={[s.dot, i === page && s.selected]} />)}</View>
      <View style={[s.actions, compact && s.actionsCompact]}>
        {error && <Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text>}
        {page < 2 ? <ActionButton label={t('onboardNext')} disabled={busy} onPress={() => setPage(page + 1)} /> : <ActionButton label={t(market.profile ? 'explore' : 'createAccount')} disabled={busy} onPress={() => market.profile ? void explore() : onAccount('signUp')} />}
        {!market.profile && <ActionButton secondary label={t('haveAccount')} disabled={busy} onPress={() => onAccount('signIn')} />}
        <ActionButton secondary label={t('onboardSkip')} busy={busy} onPress={() => void explore()} />
        {page > 0 && <ActionButton secondary label={t('back')} disabled={busy} onPress={() => setPage(page - 1)} />}
      </View>
    </ScrollView>
    </SafeAreaView>
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1 }, header: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, brand: { color: colors.navy, fontSize: 17, fontWeight: '800', flexShrink: 1 }, small: { fontSize: 9 },
  content: { flexGrow: 1, padding: 24, paddingTop: 4, gap: 24 }, contentCompact: { paddingHorizontal: 20, paddingBottom: 16, gap: 14 }, stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 22 }, stageCompact: { paddingVertical: 8 }, orbit: { width: 244, height: 244, borderRadius: 122, borderColor: '#FFFFFF', borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1EFFF' }, orbitCompact: { width: 196, height: 196, borderRadius: 98 }, inner: { width: 204, height: 204, borderRadius: 102, backgroundColor: '#F6FBFF', alignItems: 'center', justifyContent: 'center' }, innerCompact: { width: 164, height: 164, borderRadius: 82 },
  tokens: { position: 'absolute', bottom: 0, flexDirection: 'row', gap: 42 }, token: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }] }, middle: { marginTop: 12, backgroundColor: '#FFF0CF', transform: [{ rotate: '8deg' }] }, symbol: { fontSize: 22, color: colors.navy, fontWeight: '800' },
  copy: { gap: 12, alignItems: 'center' }, tag: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.primary, textAlign: 'center' }, title: { fontSize: 34, lineHeight: 42, fontWeight: '800', color: colors.navy, textAlign: 'center' }, body: { fontSize: 16, lineHeight: 25, color: colors.secondaryText, textAlign: 'center', maxWidth: 360 }, dots: { flexDirection: 'row', gap: 7, justifyContent: 'center' }, dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: '#BDD2E9' }, selected: { width: 26, backgroundColor: colors.primary }, actions: { gap: 10, marginTop: 'auto' }, actionsCompact: { gap: 8 },
});
