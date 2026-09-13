import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { PrimaryButton } from "@/components/primary-button";
import type { VoiceAudioControlsProps } from "@/features/files/voice-audio-controls";
import { colors, spacing, typography } from "@/theme/tokens";

export function VoiceAudioControls({ url, label, onDurationMs }: VoiceAudioControlsProps) {
  return <VoiceAudioPlayer key={url} url={url} label={label} onDurationMs={onDurationMs} />;
}

type NativeAudioPlayer = ReturnType<typeof createAudioPlayer>;
type NativeAudioStatus = NativeAudioPlayer["currentStatus"];

function VoiceAudioPlayer({ url, label, onDurationMs }: VoiceAudioControlsProps) {
  const playerRef = useRef<NativeAudioPlayer | null>(null);
  const [status, setStatus] = useState<NativeAudioStatus | null>(null);
  const [lifecycleError, setLifecycleError] = useState(false);
  const reportedDuration = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const player = createAudioPlayer(
      { uri: url, name: label },
      { updateInterval: 250, keepAudioSessionActive: false }
    );
    playerRef.current = player;
    reportedDuration.current = null;

    const subscription = player.addListener("playbackStatusUpdate", (nextStatus) => {
      if (active) setStatus(nextStatus);
    });

    return () => {
      active = false;
      subscription.remove();
      if (playerRef.current === player) playerRef.current = null;
      try { player.pause(); } catch { /* The native object may already be stopping. */ }
      try { player.release(); } catch { /* Release is best-effort during native teardown. */ }
    };
  }, [label, url]);

  useEffect(() => {
    if (!status?.isLoaded || !Number.isFinite(status.duration) || status.duration <= 0) return;
    const durationMs = Math.round(status.duration * 1_000);
    if (reportedDuration.current === durationMs) return;
    reportedDuration.current = durationMs;
    onDurationMs?.(durationMs);
  }, [onDurationMs, status?.duration, status?.isLoaded]);

  const play = async () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
      if (playerRef.current === player) player.play();
    } catch {
      setLifecycleError(true);
    }
  };
  const pause = () => {
    try {
      playerRef.current?.pause();
    } catch {
      setLifecycleError(true);
    }
  };
  const stop = async () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.pause();
      await player.seekTo(0);
    } catch {
      setLifecycleError(true);
    }
  };

  const loaded = status?.isLoaded === true;
  const playing = status?.playing === true;

  return <View accessibilityLabel={label} style={styles.controls}>
    <Text style={styles.meta}>{loaded ? `${status.currentTime.toFixed(1)} / ${status.duration.toFixed(1)} 秒` : "正在读取音频信息…"}</Text>
    {status?.error || lifecycleError ? <Text style={styles.error}>音频暂时无法播放，请重新申请试听地址或重新选择。</Text> : null}
    <View style={styles.buttons}>
      <View style={styles.button}><PrimaryButton tone="plain" label={playing ? "暂停" : "播放"} disabled={!loaded} onPress={() => playing ? pause() : void play()} /></View>
      <View style={styles.button}><PrimaryButton tone="plain" label="停止" disabled={!loaded} onPress={() => void stop()} /></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  controls: { gap: spacing.xs },
  buttons: { flexDirection: "row", gap: spacing.sm },
  button: { flex: 1 },
  meta: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger }
});
