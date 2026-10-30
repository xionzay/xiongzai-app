import { ProviderListings } from './ListingScreens';
import { applicationStatusKey, providerApplicationChecklist, providerRequiresKd } from './domain';
import { gameName } from './catalog';
import { ProviderApplicationReview } from './ProviderApplicationReview';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedMascot } from '../../components/AnimatedMascot';
import { ActionButton, EmptyState, ui } from '../../components/FormUI';
import { VoiceIntroduction } from '../../components/VoiceIntroduction';
import { useLanguage } from '../../i18n/LanguageProvider';
import { colors } from '../../theme';
import { avatarUri } from './avatar';
import { ProviderReview, ProviderSheet } from './ProviderSetup';
import type { Marketplace } from './useMarketplace';
export function ProviderProfileScreen({ market, onBack, onAccount }: { market: Marketplace; onBack: () => void; onAccount: () => void }) {
  const { t,language } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [resubmit, setResubmit] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const profile = market.profile;
  const draft = profile?.providerDraft;
  const uri = avatarUri(profile?.avatarFile);
  const checks = profile ? providerApplicationChecklist(profile) : null;
  const pending = !!profile?.providerApplication;
  const complete = !!checks && Object.values(checks).every(Boolean);
  const checklist = [
    { label: 'providerGameProfile' as const, done: !!checks?.game },
    { label: 'providerPhotoIntro' as const, done: !!checks?.photoBio },
    { label: 'voiceTitle' as const, done: !!checks?.voice },
  ];
  return <>
    <ScrollView contentContainerStyle={ui.content}>
      <View style={ui.row}><Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={onBack} style={ui.close}><Text style={[ui.link, { fontSize: 28 }]}>‹</Text></Pressable><Text accessibilityRole="header" style={[ui.heading, ui.flex]}>{t('providerProfileTitle')}</Text></View>
      {!profile ? <><EmptyState title={t('signInTitle')} body={t('signInRequired')} mood="welcome" /><ActionButton label={t('signIn')} onPress={onAccount} /></> : <>
        <View style={s.hero}>
          <View style={s.portrait}>{uri ? <Image source={{ uri }} accessibilityLabel={t('avatarPreview')} style={s.photo} /> : <AnimatedMascot size={96} mood="curious" label={t('brand')} />}</View>
          <Text style={s.badge}>{t(pending ? applicationStatusKey(profile, market.hosted) : 'providerDraftBadge')}</Text>
          <Text accessibilityRole="header" style={s.name}>{profile.nickname}</Text>
          <Text style={s.bio}>{profile.bio || t('providerBioMissing')}</Text>
          {draft && <><Text style={s.bio}>{gameName(draft.game??'peaceElite',language)}</Text><View style={s.stats}>{[[t('providerRank'), draft.rank], ...(providerRequiresKd(draft.game)?[['K/D', draft.kd]]:[]), [t('providerMode'), t(draft.mode === 'duo' ? 'modeDuo' : 'modeSquad')]].map(([label, text]) => <View key={label} style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{text}</Text></View>)}</View></>}
          <ActionButton secondary label={t('providerEditPhotoBio')} onPress={onAccount} />
        </View>
        <View style={ui.card}>
          <Text accessibilityRole="header" style={ui.heading}>{t('providerChecklistTitle')}</Text>
          {checklist.map(item => <View key={item.label} style={ui.row}><Text accessible={false} style={[s.check, item.done && s.done]}>{item.done ? '✓' : '○'}</Text><Text style={[ui.body, ui.flex]}>{t(item.label)}</Text><Text style={ui.caption}>{t(item.done ? 'providerSaved' : 'providerNeeded')}</Text></View>)}
          <Text style={ui.caption}>{t(pending ? market.hosted ? 'hostedApplicationBody' : 'applicationPendingBody' : 'applicationChecklistHint')}</Text>
          <ActionButton label={t(draft ? 'providerEditDraft' : 'providerStart')} onPress={() => setEditing(true)} />
          <ActionButton secondary label={t(pending ? 'applicationSnapshot' : 'applicationReview')} disabled={!pending && !complete} onPress={() => { setResubmit(false); setReviewing(true); }} />
          {profile.providerApplication?.reason && <Text style={ui.body}>{t('hostedReviewNote')}: {profile.providerApplication.reason}</Text>}
          {market.hosted && profile.providerApplication?.status === 'changes_requested' && <ActionButton label={t('hostedResubmit')} disabled={!complete} onPress={() => { setResubmit(true); setReviewing(true); }} />}
          {market.hosted && <ActionButton secondary label={t('hostedRefresh')} onPress={() => void market.reload()} />}
          {!pending && !complete && <Text style={ui.caption}>{t('applicationIncomplete')}</Text>}
        </View>
        {market.hosted&&<ProviderListings market={market}/>}
        {draft?.voiceIntroduction ? <VoiceIntroduction value={draft.voiceIntroduction} /> : <View style={ui.card}><Text style={ui.heading}>{t('voiceTitle')}</Text><Text style={ui.body}>{t('voiceHint')}</Text><ActionButton secondary label={t('voiceAdd')} onPress={() => setEditing(true)} /></View>}
        {draft && <ProviderReview draft={draft} showVoice={false} />}
        {!draft && <View style={ui.notice}><Text style={ui.heading}>{t('providerNextTitle')}</Text><Text style={ui.body}>{t('providerRequirements')}</Text></View>}
      </>}
    </ScrollView>
    {reviewing && <ProviderApplicationReview resubmit={resubmit} market={market} onClose={() => setReviewing(false)} />}
    {editing && <ProviderSheet market={market} onClose={() => setEditing(false)} />}
  </>;
}
const s = StyleSheet.create({
  hero: { padding: 22, borderRadius: 28, backgroundColor: colors.navy, alignItems: 'stretch', gap: 16 },
  portrait: { alignSelf: 'center', width: 116, height: 116, borderRadius: 36, backgroundColor: '#EAF5FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, photo: { width: 116, height: 116 },
  badge: { color: '#BDDFFF', fontSize: 10, lineHeight: 18, letterSpacing: 1.6, fontWeight: '700', textAlign: 'center' }, name: { color: '#FFFFFF', fontSize: 27, lineHeight: 34, textAlign: 'center', fontWeight: '800' }, bio: { color: '#D5E8FF', fontSize: 15, lineHeight: 23, textAlign: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, stat: { flexGrow: 1, flexBasis: 75, padding: 10, borderRadius: 14, backgroundColor: '#174789' }, statLabel: { color: '#BBD7F6', fontSize: 10, lineHeight: 17 }, statValue: { color: '#FFFFFF', fontSize: 14, lineHeight: 22, fontWeight: '700' },
  check: { color: colors.secondaryText, fontSize: 20, width: 24 }, done: { color: '#278159' },
});
