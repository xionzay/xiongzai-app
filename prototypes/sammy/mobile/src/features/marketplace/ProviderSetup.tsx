import { API_URL } from './hostedApi';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AnimatedMascot } from '../../components/AnimatedMascot';
import { ActionButton, Choice, errorKey, Field, Sheet, SummaryRow, ui } from '../../components/FormUI';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import { emptyProviderDraft, validateProviderDraft, type ProviderDraft } from './domain';
import { AvatarPicker } from '../../components/AvatarPicker';
import { VoiceIntroduction } from '../../components/VoiceIntroduction';
import type { Marketplace } from './useMarketplace';

export function ProviderFields({ draft, onChange, errors, disabled = false, onMediaBusyChange }: {
  draft: ProviderDraft; onChange: (draft: ProviderDraft) => void; errors: Partial<Record<keyof ProviderDraft, TranslationKey>>; disabled?: boolean; onMediaBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useLanguage();
  const fields = [
    ['gameName', 'gameName', 32], ['gameId', 'gameId', 32], ['rank', 'providerRank', 40], ['kd', 'providerKd', 6],
    ['experience', 'providerExperience', 160], ['playStyle', 'providerStyle', 160],
  ] as const;
  return <>
    <Text style={ui.heading}>{t('game')}</Text>
    {fields.map(([key, label, length]) => <Field key={key} label={t(label)} value={draft[key]} maxLength={length} editable={!disabled}
      autoCapitalize={key === 'gameId' ? 'none' : 'sentences'} keyboardType={key === 'kd' ? 'decimal-pad' : 'default'}
      multiline={key === 'experience' || key === 'playStyle'} error={errors[key] && t(errors[key]!)}
      onChangeText={value => onChange({ ...draft, [key]: value })} />)}
    <Text style={ui.label}>{t('gameServer')}</Text>
    <View style={ui.row}>{(['wechat', 'qq'] as const).map(value => <Choice key={value} label={t(value === 'wechat' ? 'serverWechat' : 'serverQQ')} selected={draft.server === value} disabled={disabled} onPress={() => onChange({ ...draft, server: value })} />)}</View>
    {errors.server && <Text style={ui.error}>{t(errors.server)}</Text>}
    <Text style={ui.label}>{t('providerMode')}</Text>
    <View style={ui.row}>{(['duo', 'squad'] as const).map(value => <Choice key={value} label={t(value === 'duo' ? 'modeDuo' : 'modeSquad')} selected={draft.mode === value} disabled={disabled} onPress={() => onChange({ ...draft, mode: value })} />)}</View>
    {errors.mode && <Text style={ui.error}>{t(errors.mode)}</Text>}
    <VoiceIntroduction value={draft.voiceIntroduction} onChange={voiceIntroduction => onChange({ ...draft, voiceIntroduction })} disabled={disabled} onBusyChange={onMediaBusyChange} />
  </>;
}
export function ProviderReview({ draft, showVoice = true }: { draft: ProviderDraft; showVoice?: boolean }) {
  const { t } = useLanguage();
  return <>
    <View style={ui.card}>
      <Text style={ui.heading}>{t('game')}</Text>
      <SummaryRow label={t('gameName')} value={draft.gameName} />
      <SummaryRow label={t('gameId')} value={draft.gameId} />
      <SummaryRow label={t('gameServer')} value={t(draft.server === 'wechat' ? 'serverWechat' : 'serverQQ')} />
      <SummaryRow label={t('providerRank')} value={draft.rank} /><SummaryRow label={t('providerKd')} value={draft.kd} />
      <SummaryRow label={t('providerMode')} value={t(draft.mode === 'duo' ? 'modeDuo' : 'modeSquad')} />
      <Text style={ui.label}>{t('providerExperience')}</Text><Text style={ui.body}>{draft.experience}</Text>
      <Text style={ui.label}>{t('providerStyle')}</Text><Text style={ui.body}>{draft.playStyle}</Text>
    </View>
    {showVoice && draft.voiceIntroduction && <VoiceIntroduction value={draft.voiceIntroduction} />}
    <View style={ui.notice}><Text style={ui.heading}>{t('providerNextTitle')}</Text><Text style={ui.body}>{t('providerRequirements')}</Text></View>
  </>;
}
export function ProviderSheet({ market, onClose }: { market: Marketplace; onClose: () => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<ProviderDraft>(market.profile?.providerDraft ?? { ...emptyProviderDraft });
  const [avatar, setAvatar] = useState(market.profile?.avatarFile ?? null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const mediaLock = useRef(false);
  const [review, setReview] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ProviderDraft, TranslationKey>>>({});
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const save = async () => {
    if (lock.current || mediaLock.current) return;
    lock.current = true; setBusy(true); setNotice(null);
    try { await market.saveProvider(draft, avatar); onClose(); }
    catch (error) { setNotice(errorKey(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Sheet visible title={t('providerSetupTitle')} onClose={() => { if (!lock.current && !mediaLock.current) onClose(); }} closeDisabled={busy || mediaBusy}>
    <View style={{ alignItems: 'center' }}><AnimatedMascot size={82} mood={notice ? 'concerned' : review ? 'waiting' : 'curious'} label={t('brand')} /></View>
    <Text style={ui.body}>{t(API_URL ? 'hostedDraftBody' : 'providerDraftBody')}</Text>
    {!review && <><Text style={ui.label}>{t('avatarLabel')}</Text><AvatarPicker value={avatar} onChange={setAvatar} disabled={busy || mediaBusy} onBusyChange={value => { mediaLock.current = value; setMediaBusy(value); }} onError={setNotice} /></>}
    {review ? <ProviderReview draft={draft} /> : <ProviderFields draft={draft} onChange={value => { setDraft(value); setErrors({}); }} errors={errors} disabled={busy} onMediaBusyChange={value => { mediaLock.current = value; setMediaBusy(value); }} />}
    {notice && <Text accessibilityRole="alert" style={ui.error}>{t(notice)}</Text>}
    <ActionButton label={t(review ? 'providerSaveDraft' : 'providerReview')} busy={busy} disabled={mediaBusy} onPress={() => {
      if (review) { void save(); return; }
      const next = validateProviderDraft(draft); setErrors(next); if (!Object.keys(next).length) setReview(true);
    }} />
    {review && <ActionButton secondary disabled={busy || mediaBusy} label={t('back')} onPress={() => setReview(false)} />}
  </Sheet>;
}
