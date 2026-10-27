import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
const folder = FileSystem.documentDirectory ? FileSystem.documentDirectory + 'avatars/' : null;
export function avatarUri(file: string | null | undefined) {
  return folder && file && /^avatar-[a-z0-9-]+\.(jpg|png|webp|heic)$/.test(file) ? folder + file : null;
}
export async function selectAvatar(): Promise<string | null> {
  // Load on demand so older development builds can show the actionable error.
  if (!requireOptionalNativeModule('ExponentImagePicker')) throw new Error('avatarBuildRequired');
  let picker: typeof import('expo-image-picker');
  try { picker = await import('expo-image-picker'); } catch { throw new Error('avatarBuildRequired'); }
  const result = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  if (!folder) throw new Error('storageUnavailable');
  const asset = result.assets[0];
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || info.isDirectory || info.size > 8 * 1024 * 1024) throw new Error('avatarTooLarge');
  const extension = asset.uri.split('.').at(-1)?.toLowerCase();
  const suffix = ['png', 'webp', 'heic'].includes(extension ?? '') ? extension : 'jpg';
  const name = `avatar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}.${suffix}`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  await FileSystem.copyAsync({ from: asset.uri, to: folder + name });
  return name;
}
