import { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { ActionButton, errorKey, ui } from './FormUI';
import { AnimatedMascot } from './AnimatedMascot';
import { avatarUri, selectAvatar } from '../features/marketplace/avatar';
import { useLanguage, type TranslationKey } from '../i18n/LanguageProvider';
export function AvatarPicker({ value, onChange, disabled = false, onBusyChange, onError }: {
  value: string | null; onChange: (value: string | null) => void; disabled?: boolean;
  onBusyChange: (value: boolean) => void; onError: (error: TranslationKey | null) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pick = async () => {
    if (disabled || lock.current) return;
    lock.current = true; setBusy(true); onBusyChange(true); onError(null);
    try { const file = await selectAvatar(); if (file) onChange(file); }
    catch (error) { onError(errorKey(error)); }
    finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  return <View style={ui.card}>
    <View style={{ alignItems: 'center' }}>{avatarUri(value) ? <Image source={{ uri: avatarUri(value)! }} accessibilityLabel={t('avatarPreview')} style={{ width: 100, height: 100, borderRadius: 50 }} /> : <AnimatedMascot size={88} mood="welcome" label={t('brand')} />}</View>
    <ActionButton secondary label={t(value ? 'avatarChange' : 'avatarChoose')} busy={busy} disabled={disabled} onPress={() => void pick()} />
    {!!value && <ActionButton secondary label={t('avatarRemove')} disabled={disabled || busy} onPress={() => onChange(null)} />}
  </View>;
}
