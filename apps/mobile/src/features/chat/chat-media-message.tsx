import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { apiClient } from "@/auth/runtime";
import { PrimaryButton } from "@/components/primary-button";
import { VoiceAudioControls } from "@/features/files/voice-audio-controls";
import { useAppActivity } from "@/hooks/use-app-activity";
import type { MessageApiView, OwnedFileApiView } from "@/types/api";
import { colors, spacing } from "@/theme/tokens";

export function ChatMediaMessage({ item }: { item: MessageApiView }) {
  const activity = useAppActivity();
  // Unmount private media in the background; returning requires fresh authorization.
  return activity === "active" ? <ActiveMedia key={item.id} type={item.message_type} path={`/files/chat-media/${item.conversation_id}/${item.id}/access`} /> : <Text>附件已暂停</Text>;
}
export function ChatUploadPreview({ fileId, type }: { fileId: string; type: "IMAGE" | "VOICE" }) {
  const activity = useAppActivity();
  return activity === "active" ? <ActiveMedia key={fileId} type={type} path={`/files/${fileId}/access`} /> : <Text>附件已暂停</Text>;
}
function ActiveMedia({ type, path }: { type: MessageApiView["message_type"]; path: string }) {
  const [access, setAccess] = useState<OwnedFileApiView | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    if (!access?.access.expires_at) return;
    const remaining = Date.parse(access.access.expires_at) - Date.now();
    const timer = setTimeout(() => { setAccess(null); setNotice("访问已到期，请重新加载附件。"); }, Math.max(0, Number.isFinite(remaining) ? remaining : 0));
    return () => clearTimeout(timer);
  }, [access]);
  const load = async () => {
    if (controller.current) return;
    const task = new AbortController(); controller.current = task; setBusy(true); setNotice(null);
    try {
      const response = await apiClient.request<OwnedFileApiView>(path, { signal: task.signal });
      if (!task.signal.aborted) setAccess(response);
    } catch { if (!task.signal.aborted) { setAccess(null); setNotice("附件不可用或无权查看，请重新加载。"); } }
    finally { controller.current = null; if (!task.signal.aborted) setBusy(false); }
  };
  return <View style={styles.container}>
    {access && type === "IMAGE" ? <Image source={{ uri: access.access.url, cache: "reload", headers: { "Cache-Control": "no-store" } }} resizeMode="contain" style={styles.image} accessibilityLabel="聊天图片" onError={() => { setAccess(null); setNotice("图片加载失败，请重新获取访问权限。"); }} /> : null}
    {access && type === "VOICE" ? <VoiceAudioControls url={access.access.url} label="聊天语音" /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    {!access ? <PrimaryButton tone="plain" label={type === "IMAGE" ? "查看图片" : "加载语音"} loading={busy} onPress={() => void load()} /> : <PrimaryButton tone="plain" label="收起附件" onPress={() => setAccess(null)} />}
  </View>;
}
const styles = StyleSheet.create({ container: { gap: spacing.sm, width: 220, maxWidth: "100%" }, image: { width: 180, height: 160 }, notice: { color: colors.textSecondary } });
