import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { File } from "expo-file-system";
import { getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { PrimaryButton } from "@/components/primary-button";
import { recordingDurationMessage, recordingPermissionMessage, recordingPermissionState, shouldAcceptFinishedRecording, VOICE_MINIMUM_DURATION_MS, VOICE_NATIVE_AUTOSTOP_DURATION_MS } from "@/features/files/voice-native-domain";
import type { VoiceRecorderPanelProps } from "@/features/files/voice-recorder-panel";
import { colors, spacing, typography } from "@/theme/tokens";

export function VoiceRecorderPanel({ disabled, onAsset, onMessage }: VoiceRecorderPanelProps) {
  const cancelled = useRef(false);
  const emittedUri = useRef<string | null>(null);
  const latestUri = useRef<string | null>(null);
  const latestDurationMs = useRef(0);
  const recordingActiveRef = useRef(false);
  const recordingStartedAt = useRef(0);
  const [blocked, setBlocked] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);

  function emitRecording(uri: string, durationMs: number) {
    if (emittedUri.current === uri || cancelled.current) return;
    recordingActiveRef.current = false;
    recordingStartedAt.current = 0;
    const durationError = recordingDurationMessage(durationMs);
    if (durationError) {
      const invalidFile = new File(uri);
      if (invalidFile.exists) invalidFile.delete();
      setRecordingActive(false);
      onMessage(durationError, false);
      return;
    }
    const file = new File(uri);
    emittedUri.current = uri;
    setRecordingActive(false);
    onAsset({
      asset: { uri, fileName: "voice-sample.m4a", mimeType: "audio/mp4", sizeBytes: file.size, durationMs },
      ownedTemporaryUri: uri
    });
  }

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: "cache" }, (status) => {
    if (status.url) latestUri.current = status.url;
    if (status.isFinished && status.url && !cancelled.current && shouldAcceptFinishedRecording({
      recordingActive: recordingActiveRef.current,
      statusUri: status.url,
      elapsedMs: Date.now() - recordingStartedAt.current
    })) {
      void setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, allowsBackgroundRecording: false }).catch(() => undefined);
      emitRecording(status.url, latestDurationMs.current);
    }
  });
  const state = useAudioRecorderState(recorder, 200);

  useEffect(() => {
    latestDurationMs.current = state.durationMillis;
  }, [state.durationMillis]);

  useEffect(() => () => {
    cancelled.current = true;
    // useAudioRecorder owns the native shared object's release on unmount. Do not
    // call recorder methods here: the hook may release it before an async cleanup
    // resumes, which causes Android to reject the already-released shared object.
    const uri = latestUri.current;
    if (uri && emittedUri.current !== uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
    void setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, allowsBackgroundRecording: false }).catch(() => undefined);
  }, []);

  const start = async () => {
    cancelled.current = false;
    recordingActiveRef.current = false;
    recordingStartedAt.current = 0;
    emittedUri.current = null;
    latestUri.current = null;
    setBlocked(false);
    try {
      const current = await getRecordingPermissionsAsync();
      // Android can report canAskAgain=false before the first runtime prompt.
      // Always make one real request while the permission is not granted; an
      // actually blocked permission returns immediately without showing UI.
      const permission = current.granted ? current : await requestRecordingPermissionsAsync();
      const permissionState = recordingPermissionState(permission);
      if (permissionState !== "granted") {
        const permanentlyBlocked = permissionState === "blocked";
        setBlocked(permanentlyBlocked);
        onMessage(recordingPermissionMessage(permissionState), permanentlyBlocked);
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false, allowsBackgroundRecording: false });
      await recorder.prepareToRecordAsync();
      latestUri.current = recorder.uri;
      recordingStartedAt.current = Date.now();
      recorder.record({ forDuration: VOICE_NATIVE_AUTOSTOP_DURATION_MS / 1_000 });
      recordingActiveRef.current = true;
      setRecordingActive(true);
    } catch {
      recordingActiveRef.current = false;
      recordingStartedAt.current = 0;
      const uri = recorder.uri;
      latestUri.current = uri;
      if (uri) {
        const file = new File(uri);
        if (file.exists) file.delete();
      }
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, allowsBackgroundRecording: false }).catch(() => undefined);
      onMessage("录音器启动失败，请检查麦克风权限后重试。", false);
    }
  };

  const stop = async () => {
    if (state.durationMillis < VOICE_MINIMUM_DURATION_MS) { onMessage("录音至少需要 10 秒。", false); return; }
    setFinishing(true);
    try {
      await recorder.stop();
      const latest = recorder.getStatus();
      const uri = latest.url ?? recorder.uri;
      latestUri.current = uri;
      if (uri) emitRecording(uri, latest.durationMillis);
    } finally {
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, allowsBackgroundRecording: false }).catch(() => undefined);
      setFinishing(false);
    }
  };

  const cancel = async () => {
    cancelled.current = true;
    recordingActiveRef.current = false;
    recordingStartedAt.current = 0;
    setRecordingActive(false);
    if (recorder.isRecording) await recorder.stop().catch(() => undefined);
    const uri = recorder.uri;
    if (uri) { const file = new File(uri); if (file.exists) file.delete(); }
    emittedUri.current = null;
    latestUri.current = null;
    await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, allowsBackgroundRecording: false }).catch(() => undefined);
    onMessage("本次录音已取消，临时文件已清理。", false);
  };

  const togglePause = () => {
    if (state.isRecording) {
      recorder.pause();
      return;
    }
    const remainingSeconds = Math.max(1, Math.ceil((VOICE_NATIVE_AUTOSTOP_DURATION_MS - state.durationMillis) / 1_000));
    recorder.record({ forDuration: remainingSeconds });
  };

  const active = recordingActive;
  return <View style={styles.panel}>
    <Text style={styles.meta}>现场录制 M4A（AAC）· 最短 10 秒 · 最长 30 秒</Text>
    {active ? <Text style={styles.timer}>{(state.durationMillis / 1_000).toFixed(1)} 秒{state.isRecording ? " · 录制中" : " · 已暂停"}</Text> : null}
    {!active ? <PrimaryButton tone="plain" label="现场录制声音名片" disabled={disabled || finishing} onPress={() => void start()} /> : null}
    {active ? <View style={styles.row}>
      <View style={styles.flex}><PrimaryButton tone="plain" label={state.isRecording ? "暂停录音" : "继续录音"} disabled={finishing} onPress={togglePause} /></View>
      <View style={styles.flex}><PrimaryButton label="结束录音" disabled={finishing || state.durationMillis < VOICE_MINIMUM_DURATION_MS} onPress={() => void stop()} /></View>
    </View> : null}
    {active ? <PrimaryButton tone="plain" label="取消并清理本次录音" disabled={finishing} onPress={() => void cancel()} /> : null}
    {blocked ? <PrimaryButton tone="plain" label="打开系统麦克风设置" onPress={() => void Linking.openSettings()} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  meta: { ...typography.caption, color: colors.textSecondary },
  timer: { ...typography.body, color: colors.brandDeep, fontWeight: "700" }
});
