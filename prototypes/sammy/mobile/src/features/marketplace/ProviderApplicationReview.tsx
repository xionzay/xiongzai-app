import { applicationStatusKey } from './domain';
import { useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { ActionButton, CheckRow, errorKey, Sheet, ui } from '../../components/FormUI';
import { useLanguage, type TranslationKey } from '../../i18n/LanguageProvider';
import { ProviderReview } from './ProviderSetup';
import { avatarUri } from './avatar';
import type { Marketplace } from './useMarketplace';

export function ProviderApplicationReview({ market, onClose, resubmit = false }: { market: Marketplace; onClose: () => void; resubmit?: boolean }) {
  const { t, language } = useLanguage();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const profile = market.profile;
  const application = resubmit ? undefined : profile?.providerApplication;
  const snapshot = application?.snapshot;
  const draft = snapshot?.draft ?? profile?.providerDraft;
  const uri = avatarUri(snapshot?.avatarFile ?? profile?.avatarFile);
  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await market.submitApplication(accepted); onClose(); }
    catch (problem) { setError(errorKey(problem)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Sheet visible title={t(application ? 'applicationSnapshot' : 'applicationReview')} onClose={onClose} closeDisabled={busy}>
    <View style={ui.notice}><Text style={ui.heading}>{t(application && profile ? applicationStatusKey(profile, market.hosted) : 'applicationPreviewTitle')}</Text><Text style={ui.body}>{t(market.hosted ? 'hostedReviewBody' : 'applicationPreviewBody')}</Text></View>
    {profile?.providerApplication?.reason && <Text style={ui.body}>{t('hostedReviewNote')}: {profile.providerApplication.reason}</Text>}
    {application && <Text style={ui.caption}>{t('applicationSubmittedAt')}: {new Date(application.submittedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</Text>}
    {uri && <Image source={{ uri }} accessibilityLabel={t('avatarPreview')} style={{ width: 96, height: 96, borderRadius: 28, alignSelf: 'center' }} />}
    <Text style={ui.heading}>{snapshot?.nickname ?? profile?.nickname}</Text>
    <Text style={ui.body}>{snapshot?.bio ?? profile?.bio}</Text>
    {draft && <ProviderReview draft={draft} />}
    <View style={ui.card}><Text style={ui.heading}>{t('applicationAgreementTitle')}</Text><Text style={ui.body}>{t(market.hosted ? 'hostedAgreementBody' : 'applicationAgreementBody')}</Text></View>
    {!application && <>
      <CheckRow label={t(market.hosted ? 'hostedAgreementAccept' : 'applicationAgreementAccept')} checked={accepted} disabled={busy} onPress={() => setAccepted(value => !value)} />
      {error && <Text accessibilityRole="alert" style={ui.error}>{t(error)}</Text>}
      <ActionButton label={t('applicationSubmit')} busy={busy} disabled={!accepted} onPress={() => void submit()} />
    </>}
  </Sheet>;
}
