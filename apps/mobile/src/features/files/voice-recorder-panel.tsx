import type { SelectedVoiceAsset } from "@/features/files/voice-media-selection";

export interface VoiceRecorderPanelProps {
  disabled: boolean;
  purpose?: "profile" | "chat";
  onAsset(selected: SelectedVoiceAsset): void;
  onMessage(message: string, blocked: boolean): void;
}

export function VoiceRecorderPanel(_props: VoiceRecorderPanelProps) {
  void _props;
  return null;
}
