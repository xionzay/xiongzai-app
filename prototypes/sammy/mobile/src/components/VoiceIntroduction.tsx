import type { ComponentType } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { Text, View } from 'react-native';
import { useLanguage } from '../i18n/LanguageProvider';
import { ui } from './FormUI';
import type { VoiceIntroduction as Voice } from '../features/marketplace/domain';
export type VoiceIntroductionProps = {
  value: Voice | null | undefined; onChange?: (voice: Voice | null) => void; disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};
export function VoiceIntroduction(props: VoiceIntroductionProps) {
  const { t } = useLanguage();
  if (!requireOptionalNativeModule('ExpoAudio')) return <View style={ui.notice}><Text style={ui.caption}>{t('voiceBuildRequired')}</Text></View>;
  // Avoid importing the native module in a dev client built before audio was installed.
  const NativeVoice = require('./VoiceIntroductionNative').VoiceIntroductionNative as ComponentType<VoiceIntroductionProps>;
  return <NativeVoice {...props} />;
}
