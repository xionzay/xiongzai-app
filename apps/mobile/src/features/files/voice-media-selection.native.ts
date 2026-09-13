import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { isOwnedCacheUri, VOICE_DOCUMENT_MIME_TYPES } from "@/features/files/voice-native-domain";
import type { SelectedVoiceAsset } from "@/features/files/voice-media-selection";

export async function chooseVoiceAsset(): Promise<SelectedVoiceAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...VOICE_DOCUMENT_MIME_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
    base64: false
  });
  if (result.canceled) return null;
  const selected = result.assets[0];
  if (!selected) return null;
  return {
    asset: { uri: selected.uri, fileName: selected.name, mimeType: selected.mimeType ?? null, sizeBytes: selected.size, durationMs: null },
    ownedTemporaryUri: selected.uri
  };
}

export async function disposeOwnedVoiceTemporaryFile(uri: string): Promise<void> {
  if (!isOwnedCacheUri(uri, Paths.cache.uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
