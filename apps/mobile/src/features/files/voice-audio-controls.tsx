import { createElement } from "react";

export interface VoiceAudioControlsProps {
  url: string;
  label: string;
  onDurationMs?(durationMs: number): void;
}

export function VoiceAudioControls({ url, label, onDurationMs }: VoiceAudioControlsProps) {
  return createElement("audio", {
    controls: true,
    preload: "metadata",
    src: url,
    "aria-label": label,
    controlsList: "nodownload",
    onLoadedMetadata: (event: { currentTarget: { duration: number } }) => {
      const duration = event.currentTarget.duration;
      if (Number.isFinite(duration) && duration > 0) onDurationMs?.(Math.round(duration * 1_000));
    }
  });
}
