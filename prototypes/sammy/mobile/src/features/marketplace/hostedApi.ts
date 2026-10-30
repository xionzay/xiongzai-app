import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import type { RemoteFile } from './hostedProfile';
export { accountProfile, remoteDraft } from './hostedProfile';
export type { AccountResponse, RemoteFile } from './hostedProfile';
import { avatarUri } from './avatar';
import { voiceUri } from './voice';
import { sendMedia, type MediaUploadSlot } from './mediaUpload';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const service = `sammy-${API_URL.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
export async function secure() {
  if (!requireOptionalNativeModule('ExpoSecureStore')) throw new Error('hostedBuildRequired');
  return import('expo-secure-store');
}
export async function readToken() { return (await secure()).getItemAsync(service); }
export async function storeToken(token: string | null) {
  const store = await secure();
  if (token) await store.setItemAsync(service, token, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await store.deleteItemAsync(service);
}
export class HostedError extends Error { constructor(message: string, public status = 0) { super(message); } }
const errors: Record<string, string> = { authenticationRequired: 'sessionExpired', invalidInput: 'checkFields', alreadyExists: 'accountExists', invalidMedia: 'hostedMediaInvalid', invalidVoiceDuration: 'voiceLengthError', mediaNotOwned: 'hostedMediaInvalid', mediaNotReady: 'hostedMediaInvalid' };
export async function api<T>(path: string, token: string | null, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  if (!API_URL || (!API_URL.startsWith('https://') && !(__DEV__ && /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/.test(API_URL)))) throw new Error('apiUrlInvalid');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_URL}/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      // Failed content reads have no form fields for the user to correct.
      const contentFailure = method === 'GET' && (response.status === 400 || response.status === 404) && ['invalidInput', 'Not Found'].includes(data.error);
      throw new HostedError(contentFailure ? 'hostedContentUnavailable' : errors[data.error] ?? data.error ?? 'hostedUnavailable', response.status);
    }
    return data as T;
  } catch (error) { if (error instanceof HostedError) throw error; throw new Error('hostedUnavailable'); }
  finally { clearTimeout(timer); }
}
function filePath(file: RemoteFile) {
  const valid = file.kind === 'avatar' ? /^avatar-[a-z0-9-]+\.(jpg|png|webp)$/ : /^voice-[a-z0-9-]+\.(m4a|mp3|aac)$/;
  if (!FileSystem.documentDirectory || !valid.test(file.file)) throw new Error('hostedMediaInvalid');
  return FileSystem.documentDirectory + (file.kind === 'avatar' ? 'avatars/' : 'voice-introductions/') + file.file;
}
export async function cacheMedia(files: RemoteFile[]) {
  for (const file of files) {
    const path = filePath(file);
    if ((await FileSystem.getInfoAsync(path)).exists) continue;
    if (!file.url) throw new Error('storageNotConfigured');
    await FileSystem.makeDirectoryAsync(path.slice(0, path.lastIndexOf('/')), { intermediates: true });
    const task = FileSystem.createDownloadResumable(file.url, path + '.download');
    const timer = setTimeout(() => { void task.cancelAsync(); }, 30000);
    try {
      const result = await task.downloadAsync();
      if (!result || result.status !== 200) throw new Error('hostedMediaUnavailable');
      await FileSystem.moveAsync({ from: result.uri, to: path });
    } finally { clearTimeout(timer); await FileSystem.deleteAsync(path + '.download', { idempotent: true }); }
  }
}
export async function uploadMedia(token: string, kind: 'avatar' | 'voice', file: string, known: RemoteFile[]) {
  const existing = known.find(item => item.file === file && item.kind === kind);
  if (existing) return existing.id;
  let uri = kind === 'avatar' ? avatarUri(file) : voiceUri({ file, durationMs: 10000 });
  if (!uri) throw new Error('hostedMediaInvalid');
  let temporary: string | null = null;
  try {
    if (kind === 'avatar' && file.endsWith('.heic')) {
      const image = await import('expo-image-manipulator');
      const converted = await image.manipulateAsync(uri, [], { compress: 0.85, format: image.SaveFormat.JPEG });
      uri = converted.uri; temporary = uri;
    }
    const ext = uri.split('.').at(-1)?.toLowerCase() ?? '';
    const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac' } as Record<string, string>)[ext];
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || !mime) throw new Error('hostedMediaInvalid');
    const slot = await api<MediaUploadSlot>('/media', token, { kind, mime, bytes: info.size });
    await sendMedia(slot,uri,mime);
    await api(`/media/${slot.id}/complete`, token, {});
    return slot.id;
  } finally { if (temporary) await FileSystem.deleteAsync(temporary, { idempotent: true }); }
}
