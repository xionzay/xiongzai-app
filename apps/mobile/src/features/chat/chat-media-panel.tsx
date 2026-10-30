import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { PrimaryButton } from "@/components/primary-button";
import { completeOwnedFile, fileWithoutAccess, getOwnedFile, imageUploadDependencies, listFilePolicies, listMyFiles } from "@/features/files/file-upload-api";
import { chooseVoiceAsset, disposeOwnedVoiceTemporaryFile, type SelectedVoiceAsset } from "@/features/files/voice-media-selection";
import { VoiceRecorderPanel } from "@/features/files/voice-recorder-panel";
import { VoiceAudioControls } from "@/features/files/voice-audio-controls";
import { resolveVoiceMimeType } from "@/features/files/voice-upload-domain";
import { AvatarUploadError, resolveImageMimeType } from "@/features/files/file-upload-domain";
import { ApiClientError } from "@/api/api-error";
import { useAppActivity } from "@/hooks/use-app-activity";
import { colors, spacing, typography } from "@/theme/tokens";
import type { FileApiView, RecoverableFileApiView } from "@/types/api";
import type { ChatMedia } from "./chat-domain";
import { ChatMediaConfirmationError, chatMediaReady, shouldMountChatRecorder, uploadChatMedia, type ChatMediaAsset } from "./chat-media-upload";
import { ChatUploadPreview } from "./chat-media-message";
import { ChatControlIcon } from "@/components/chat-control-icon";

type Props = { disabled: boolean; onSend(media: ChatMedia): Promise<boolean>; trigger?: "voice" | "more" };
export function ChatMediaPanel(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={props.trigger === "voice" ? "聊天语音录制与选择" : "聊天更多功能，图片与语音"} accessibilityState={{ disabled: props.disabled, expanded: open }} disabled={props.disabled} onPress={() => setOpen(true)} style={({ pressed }) => ({ width: 48, minHeight: 48, alignItems: "center", justifyContent: "center", opacity: props.disabled ? 0.4 : pressed ? 0.7 : 1 })}><ChatControlIcon kind={props.trigger === "voice" ? "sound" : "plus"} /></Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      {open ? <MediaEditor {...props} onClose={() => setOpen(false)} /> : null}
    </Modal>
  </>;
}

function MediaEditor({ disabled, onSend, onClose }: Props & { onClose(): void }) {
  const activity = useAppActivity();
  const [asset, setAsset] = useState<ChatMediaAsset | null>(null);
  const [file, setFile] = useState<FileApiView | RecoverableFileApiView | null>(null);
  const [notice, setNotice] = useState("图片和语音需要上传校验及审核，通过后才能发送。聊天语音 1–60 秒，不是实时通话。");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const live = useRef(true);
  const temporary = useRef<string | null>(null);
  const policies = useQuery({ queryKey: ["file-policies"], queryFn: ({ signal }) => listFilePolicies(signal) });
  const recovery = useQuery({ queryKey: ["chat-media-uploads"], queryFn: async ({ signal }) => {
    const pages = await Promise.all([listMyFiles({ fileType: "CHAT_IMAGE", limit: 20 }, signal), listMyFiles({ fileType: "CHAT_VOICE", limit: 20 }, signal)]);
    return pages.flatMap(page => page.items).filter(item => !item.bound_message_id);
  }, staleTime: 0 });
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; operation.current?.abort(); if (temporary.current) void disposeOwnedVoiceTemporaryFile(temporary.current).catch(() => undefined); };
  }, []);
  const clearTemporary = () => { if (temporary.current) void disposeOwnedVoiceTemporaryFile(temporary.current).catch(() => undefined); temporary.current = null; };
  const selectVoice = (selected: SelectedVoiceAsset) => {
    if (!live.current) { void disposeOwnedVoiceTemporaryFile(selected.ownedTemporaryUri).catch(() => undefined); return; }
    try {
      const mimeType = resolveVoiceMimeType(selected.asset);
      clearTemporary(); temporary.current = selected.ownedTemporaryUri;
      setAsset({ ...selected.asset, type: "VOICE", mimeType }); setFile(null); setSent(false); setNotice("请先试听，再点击上传；尚未发送给对方。");
    } catch { void disposeOwnedVoiceTemporaryFile(selected.ownedTemporaryUri).catch(() => undefined); setNotice("请选择 AAC、M4A 或 MP3 音频。"); }
  };
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current || disabled) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true);
    try { await work(controller.signal); }
    catch (error) {
      if (!live.current) return;
      if (error instanceof ChatMediaConfirmationError) { setFile(error.file); setNotice(error.retryable ? error.message : "文件确认失败，请查看上传任务或重新选择。"); }
      else setNotice(error instanceof ApiClientError || error instanceof AvatarUploadError ? error.message : "操作未完成，请检查网络后重试。");
    } finally { if (operation.current === controller) operation.current = null; if (live.current) setBusy(false); }
  };
  const inactive = disabled || busy;
  const stateCopy = file ? file.upload_status !== "VERIFIED" ? "上传待确认" : ({ PENDING: "等待人工审核", APPROVED: "审核通过，可以发送", REJECTED: "审核未通过，请重新选择", FLAGGED: "文件受限，请重新选择" }[file.moderation_status]) : null;
  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>发送图片或语音</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{notice}</Text>
      <PrimaryButton tone="plain" label="选择聊天图片" disabled={inactive} onPress={() => void run(async () => {
        const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.82, base64: false, exif: false });
        if (!live.current || selected.canceled || !selected.assets[0]) return;
        const item = selected.assets[0]; clearTemporary(); setAsset({ type: "IMAGE", uri: item.uri, mimeType: resolveImageMimeType(item) }); setFile(null); setSent(false); setNotice("请确认图片后上传；尚未发送给对方。");
      })} />
      <PrimaryButton tone="plain" label="选择聊天音频" disabled={inactive} onPress={() => void run(async () => { const selected = await chooseVoiceAsset(); if (selected) selectVoice(selected); })} />
      {!asset && shouldMountChatRecorder(activity) ? <VoiceRecorderPanel purpose="chat" disabled={inactive || activity !== "active"} onAsset={selectVoice} onMessage={message => { if (live.current) setNotice(message); }} /> : null}
      {asset?.type === "IMAGE" ? <Image source={{ uri: asset.uri }} accessibilityLabel="待上传聊天图片" resizeMode="contain" style={styles.preview} onError={() => setNotice("图片预览失败，请重新选择。")} /> : null}
      {asset?.type === "VOICE" && activity === "active" ? <VoiceAudioControls url={asset.uri} label="待上传聊天语音试听" /> : null}
      {asset && !file ? <PrimaryButton label="上传并等待审核" disabled={inactive || !policies.data} loading={busy} onPress={() => void run(async signal => {
        const uploaded = await uploadChatMedia(asset, policies.data ?? [], signal, stage => { if (live.current) setNotice(stage); }, imageUploadDependencies);
        if (live.current) { setFile(uploaded); setNotice("上传校验完成。请等待人工审核后刷新状态。"); }
      })} /> : null}
      {policies.isError ? <PrimaryButton tone="plain" label="重试加载上传策略" onPress={() => void policies.refetch()} /> : null}
      {file ? <View style={styles.section}>
        <Text style={styles.copy}>{stateCopy}</Text>
        {!asset && file.upload_status === "VERIFIED" ? <ChatUploadPreview fileId={file.id} type={file.file_type === "CHAT_IMAGE" ? "IMAGE" : "VOICE"} /> : null}
        <PrimaryButton tone="plain" label={file.upload_status === "VERIFIED" ? "刷新审核状态" : "只重试上传确认"} disabled={inactive || sent} onPress={() => void run(async signal => {
          const current = file.upload_status === "VERIFIED" ? fileWithoutAccess(await getOwnedFile(file.id, signal)) : await completeOwnedFile(file.id, signal);
          if (live.current) setFile(current);
        })} />
        <PrimaryButton label={sent ? "已发送" : "发送到当前会话"} disabled={inactive || sent || !chatMediaReady(file)} onPress={() => void run(async () => {
          const acknowledged = await onSend({ type: file.file_type === "CHAT_IMAGE" ? "IMAGE" : "VOICE", fileId: file.id });
          if (live.current) {
            setSent(acknowledged); setNotice(acknowledged ? "消息已由服务端接收。" : "尚未确认发送，请关闭面板，在会话中原位重试。 ");
            if (acknowledged) void recovery.refetch();
          }
        })} />
      </View> : null}
      <Text style={styles.copy}>最近未发送的上传任务（最多各 20 项）；恢复时不会再次上传文件：</Text>
      {recovery.isPending ? <Text style={styles.copy}>正在读取上传记录…</Text> : null}
      {recovery.data?.length === 0 ? <Text style={styles.copy}>暂无可恢复任务</Text> : null}
      {recovery.data?.map(item => <PrimaryButton key={item.id} tone="plain" label={`${item.file_type === "CHAT_IMAGE" ? "图片" : "语音"} · ${new Date(item.created_at).toLocaleString("zh-CN")} · ${item.id.slice(-6)}`} disabled={inactive} onPress={() => { clearTemporary(); setAsset(null); setFile(item); setSent(false); setNotice("已选择历史上传任务，请核对审核状态后发送。 "); }} />)}
      <PrimaryButton tone="plain" label={recovery.isError ? "重试读取上传记录" : "刷新上传记录"} disabled={inactive} onPress={() => void recovery.refetch()} />
      <PrimaryButton tone="plain" label="关闭并返回会话" onPress={onClose} />
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.surface }, content: { padding: spacing.lg, gap: spacing.md }, title: { ...typography.sectionTitle, color: colors.text }, copy: { ...typography.body, color: colors.textSecondary }, section: { gap: spacing.sm }, preview: { width: "100%", height: 200 } });
