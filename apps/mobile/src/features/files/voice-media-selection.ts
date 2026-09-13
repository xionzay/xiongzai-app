import type { LocalVoiceAsset } from "@/features/files/voice-upload-domain";

export interface SelectedVoiceAsset {
  asset: LocalVoiceAsset;
  ownedTemporaryUri: string;
}

export function chooseVoiceAsset(): Promise<SelectedVoiceAsset | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/aac,audio/mp4,audio/mpeg,.aac,.m4a,.mp3";
    input.onchange = async () => {
      const selected = input.files?.[0];
      if (!selected) { resolve(null); return; }
      const uri = URL.createObjectURL(selected);
      resolve({
        asset: { uri, fileName: selected.name, mimeType: selected.type || null, sizeBytes: selected.size, durationMs: await readWebDuration(uri) },
        ownedTemporaryUri: uri
      });
    };
    input.click();
  });
}

export async function disposeOwnedVoiceTemporaryFile(uri: string): Promise<void> {
  if (typeof URL !== "undefined") URL.revokeObjectURL(uri);
}

function readWebDuration(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const done = (value: number | null) => { audio.removeAttribute("src"); resolve(value); };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1_000) : null);
    audio.onerror = () => done(null);
    audio.src = uri;
  });
}
