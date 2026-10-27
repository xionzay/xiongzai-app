import { API_URL } from '../features/marketplace/hostedApi';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { ActionButton, errorKey, ui } from './FormUI';
import { useLanguage, type TranslationKey } from '../i18n/LanguageProvider';
import { saveVoiceFile, voiceUri } from '../features/marketplace/voice';
import type { VoiceIntroductionProps } from './VoiceIntroduction';
import { colors } from '../theme';
function clock(seconds: number) { return `0:${Math.max(0, Math.floor(seconds)).toString().padStart(2, '0')}`; }
export function VoiceIntroductionNative({ value, onChange, disabled = false, onBusyChange }: VoiceIntroductionProps) {
  const { t } = useLanguage();
  const player = useAudioPlayer(voiceUri(value), { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [activity, setActivity] = useState<'idle' | 'working' | 'recording'>('idle');
  const [error, setError] = useState<TranslationKey | null>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  const recording = useRef(false);
  const finishing = useRef(false);
  const callbacks = useRef({ onChange, onBusyChange }); callbacks.current = { onChange, onBusyChange };
  const finishRef = useRef<(uri?: string | null, stop?: boolean, discard?: boolean) => Promise<void>>(async () => {});
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, event => {
    if (recording.current && (event.isFinished || event.hasError || event.mediaServicesDidReset)) {
      void finishRef.current(event.url, false, event.hasError || event.mediaServicesDidReset);
    }
  });
  const recorderState = useAudioRecorderState(recorder, 200);
  const changeActivity = (next: typeof activity) => {
    operation.current = next !== 'idle';
    if (mounted.current) { setActivity(next); callbacks.current.onBusyChange?.(next !== 'idle'); }
  };
  const finish = async (uri?: string | null, stop = false, discard = false) => {
    if (finishing.current || !recording.current) return;
    finishing.current = true; recording.current = false; changeActivity('working');
    try {
      if (stop) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (discard) throw new Error('voiceInterrupted');
      if (!mounted.current) return;
      const source = uri ?? recorder.uri;
      if (!source) throw new Error('voiceUnavailable');
      const voice = await saveVoiceFile(source);
      if (mounted.current) callbacks.current.onChange?.(voice);
    } catch (problem) { if (mounted.current) setError(errorKey(problem)); }
    finally { await setAudioModeAsync({ allowsRecording: false }).catch(() => {}); finishing.current = false; changeActivity('idle'); }
  };
  finishRef.current = finish;
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        player.pause();
        if (recording.current) void finishRef.current(null, true, true);
      }
    });
    return () => {
      mounted.current = false; subscription.remove();
      if (recording.current) {
        recording.current = false;
        try { void recorder.stop().catch(() => {}).finally(() => setAudioModeAsync({ allowsRecording: false }).catch(() => {})); }
        catch { void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }
      }
    };
  }, [player, recorder]);
  const record = async () => {
    if (disabled || operation.current) return;
    changeActivity('working'); setError(null); player.pause();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('voicePermissionDenied');
      if (!mounted.current || AppState.currentState !== 'active') { changeActivity('idle'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      if (!mounted.current || AppState.currentState !== 'active') { await recorder.stop(); await setAudioModeAsync({ allowsRecording: false }); changeActivity('idle'); return; }
      recording.current = true;
      // Leave a small margin for AAC padding so the saved clip stays within 30 seconds.
      recorder.record({ forDuration: 29.8 }); changeActivity('recording');
    } catch (problem) {
      recording.current = false;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (mounted.current) setError(errorKey(problem)); changeActivity('idle');
    }
  };
  const upload = async () => {
    if (disabled || operation.current) return;
    changeActivity('working'); setError(null); player.pause();
    try {
      if (!requireOptionalNativeModule('ExpoDocumentPicker')) throw new Error('voiceBuildRequired');
      const { getDocumentAsync } = await import('expo-document-picker');
      const result = await getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      if (!result.canceled && result.assets?.[0]) {
        const voice = await saveVoiceFile(result.assets[0].uri);
        if (mounted.current) callbacks.current.onChange?.(voice);
      }
    } catch (problem) { if (mounted.current) setError(errorKey(problem)); }
    finally { changeActivity('idle'); }
  };
  const play = async () => {
    if (disabled || operation.current || !value) return;
    setError(null);
    try {
      if (status.playing) { player.pause(); return; }
      if (!status.isLoaded || status.error) throw new Error('voiceUnavailable');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (status.didJustFinish || status.currentTime >= status.duration - 0.1) await player.seekTo(0);
      player.play();
    } catch (problem) { setError(errorKey(problem)); }
  };
  const blocked = disabled || activity !== 'idle';
  const duration = activity === 'recording' ? recorderState.durationMillis / 1000 : (value?.durationMs ?? 0) / 1000;
  return <View style={ui.card}>
    <Text style={ui.heading}>{t('voiceTitle')}</Text>
    <Text style={ui.caption}>{t(onChange ? 'voiceHint' : API_URL ? 'hostedVoicePrivate' : 'voicePrivate')}</Text>
    <View style={s.wave} accessible={false}>{[9, 15, 22, 12, 28, 18, 32, 16, 25, 12, 21, 14, 8].map((height, i) => <View key={i} style={{ width: 4, height, borderRadius: 2, backgroundColor: activity === 'recording' ? '#D34545' : value ? colors.primary : '#B9CFE5' }} />)}</View>
    <Text accessibilityLiveRegion="polite" style={ui.label}>{activity === 'recording' ? `${t('voiceRecording')} · ${clock(duration)} / 0:30` : value ? `${clock(status.didJustFinish ? duration : status.currentTime)} / ${clock(duration)}` : t('voiceEmpty')}</Text>
    {value && activity !== 'recording' && <>
      <View style={s.progress} accessible={false}><View style={[s.progressFill, { width: `${Math.min(100, status.currentTime / (duration || 1) * 100)}%` }]} /></View>
      <ActionButton secondary disabled={blocked} label={t(status.playing ? 'voicePause' : 'voicePlay')} onPress={() => void play()} />
    </>}
    {onChange && <>
      <Text style={ui.caption}>{t('voicePrompt')}</Text>
      <ActionButton label={t(activity === 'recording' ? 'voiceStop' : value ? 'voiceRecordAgain' : 'voiceRecord')} busy={activity === 'working'} disabled={disabled} onPress={() => activity === 'recording' ? void finish(null, true) : void record()} />
      <ActionButton secondary disabled={blocked} label={t('voiceChooseFile')} onPress={() => void upload()} />
      {value && <ActionButton secondary disabled={blocked} label={t('voiceRemove')} onPress={() => { player.pause(); onChange(null); setError(null); }} />}
    </>}
    {(error || status.error) && <Text accessibilityRole="alert" style={ui.error}>{t(error ?? 'voiceUnavailable')}</Text>}
  </View>;
}
const s = StyleSheet.create({
  wave: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  progress: { height: 4, backgroundColor: '#DFEAF5', borderRadius: 2, overflow: 'hidden' }, progressFill: { height: 4, backgroundColor: colors.primary },
});
