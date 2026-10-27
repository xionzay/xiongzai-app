import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import type { VoiceIntroduction } from './domain';
const directory = FileSystem.documentDirectory ? FileSystem.documentDirectory + 'voice-introductions/' : null;
export function voiceUri(voice: VoiceIntroduction | null | undefined) {
  return directory && voice && /^voice-[a-z0-9-]+\.(m4a|mp3|aac)$/.test(voice.file) ? directory + voice.file : null;
}
export async function saveVoiceFile(uri: string): Promise<VoiceIntroduction> {
  if (!directory) throw new Error('storageUnavailable');
  if (!requireOptionalNativeModule('ExpoAudio')) throw new Error('voiceBuildRequired');
  const extension = uri.split('.').at(-1)?.toLowerCase();
  if (!extension || !['m4a', 'mp3', 'aac'].includes(extension)) throw new Error('voiceFormatError');
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || info.size <= 0 || info.size > 10 * 1024 * 1024) throw new Error('voiceSizeError');
  const { createAudioPlayer } = await import('expo-audio');
  const player = createAudioPlayer(uri);
  let duration: number;
  try {
    duration = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => { listener.remove(); reject(new Error('voiceUnavailable')); }, 8000);
      const check = (status: typeof player.currentStatus) => {
        if (!status.isLoaded && !status.error) return;
        clearTimeout(timer); listener.remove();
        if (status.error || !Number.isFinite(status.duration) || status.duration <= 0) reject(new Error('voiceUnavailable'));
        else resolve(status.duration);
      };
      const listener = player.addListener('playbackStatusUpdate', check);
      check(player.currentStatus);
    });
  } finally { player.remove(); }
  const durationMs = Math.round(duration * 1000);
  if (durationMs < 10_000 || durationMs > 30_000) throw new Error('voiceLengthError');
  const file = `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.copyAsync({ from: uri, to: directory + file });
  return { file, durationMs };
}
