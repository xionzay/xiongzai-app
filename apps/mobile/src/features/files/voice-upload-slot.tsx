import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { acceptPolicies, usePolicies } from "@/features/account/account-api";
import { allPoliciesConfirmed } from "@/features/account/policy-confirmation-domain";
import { PolicyConfirmationList } from "@/features/account/policy-confirmation-list";
import { VoiceAudioControls } from "@/features/files/voice-audio-controls";
import { disposeOwnedVoiceTemporaryFile, chooseVoiceAsset, type SelectedVoiceAsset } from "@/features/files/voice-media-selection";
import { VoiceRecorderPanel } from "@/features/files/voice-recorder-panel";
import { recordingDurationMessage, shouldExpireAccess } from "@/features/files/voice-native-domain";
import { completeOwnedFile, deleteOwnedFile, fileWithoutAccess, getOwnedFile, imageUploadDependencies, listFilePolicies, listMyFiles } from "@/features/files/file-upload-api";
import { isRetryableConfirmationError, moderationStage } from "@/features/files/file-upload-domain";
import { ensureApprovedVoice, uploadVoiceSample, VoiceConfirmationError, voiceRecoveryAction, voiceStageCopy, voiceUploadErrorMessage, type LocalVoiceAsset, type VoiceUploadStage } from "@/features/files/voice-upload-domain";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { FileApiView, RecoverableFileApiView } from "@/types/api";

const activeStages = new Set<VoiceUploadStage>(["reading", "hashing", "requesting", "uploading", "completing", "binding", "deleting"]);

export function VoiceUploadSlot({ currentFileId, onReady }: { currentFileId?: string | null; onReady(file: FileApiView): Promise<void> }) {
  const policies = useQuery({ queryKey: ["file-policies"], queryFn: ({ signal }) => listFilePolicies(signal), staleTime: 60_000 });
  const voicePolicies = usePolicies("VOICE_SAMPLE_UPLOAD");
  const recoverable = useQuery({ queryKey: ["my-files", "VOICE_SAMPLE"], queryFn: ({ signal }) => listMyFiles({ fileType: "VOICE_SAMPLE", limit: 20 }, signal), staleTime: 10_000 });
  const [asset, setAsset] = useState<LocalVoiceAsset | null>(null);
  const [file, setFile] = useState<FileApiView | null>(null);
  const [stage, setStage] = useState<VoiceUploadStage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [confirmedPolicyIds, setConfirmedPolicyIds] = useState<string[]>([]);
  const [previewAccess, setPreviewAccess] = useState<{ fileId: string; url: string } | null>(null);
  const task = useRef<AbortController | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const previewExpiryTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const ownedTemporaryUri = useRef<string | null>(null);
  const mounted = useRef(true);
  const busy = activeStages.has(stage);
  const previewUrl = previewAccess && previewAccess.fileId === file?.id ? previewAccess.url : null;
  const voiceAuthorizationConfirmed = allPoliciesConfirmed(voicePolicies.data, confirmedPolicyIds);

  const clearPreview = () => {
    if (previewExpiryTimer.current) globalThis.clearTimeout(previewExpiryTimer.current);
    previewExpiryTimer.current = null;
    setPreviewAccess(null);
  };

  const releaseOwnedTemporary = async () => {
    const uri = ownedTemporaryUri.current;
    ownedTemporaryUri.current = null;
    if (uri) await disposeOwnedVoiceTemporaryFile(uri);
  };

  useEffect(() => () => {
    mounted.current = false;
    task.current?.abort();
    previewRequest.current?.abort();
    if (previewExpiryTimer.current) globalThis.clearTimeout(previewExpiryTimer.current);
    const uri = ownedTemporaryUri.current;
    ownedTemporaryUri.current = null;
    if (uri) void disposeOwnedVoiceTemporaryFile(uri);
  }, []);

  useEffect(() => {
    previewRequest.current?.abort();
    if (previewExpiryTimer.current) globalThis.clearTimeout(previewExpiryTimer.current);
    previewExpiryTimer.current = null;
  }, [file?.id, currentFileId]);

  useEffect(() => {
    if (recoveryChecked || !recoverable.data) return;
    globalThis.queueMicrotask(() => {
      if (!mounted.current) return;
      setRecoveryChecked(true);
      const latest = recoverable.data.items.find((item) => item.id !== currentFileId && item.upload_status !== "DELETED");
      if (!latest) return;
      const restored = restoreOwnerField(latest);
      const action = voiceRecoveryAction(restored);
      setFile(restored);
      setConfirmationPending(action === "complete");
      setStage(restored.upload_status === "FAILED" ? "failed" : moderationStage(restored));
      setMessage(action === "reselect" ? "已找回未完成或失败的旧任务。旧预签名地址不会复用，请删除后重新选择。" : action === "complete" ? "对象已上传，可以只重试服务端确认。" : action === "bind" ? "已找回审核通过的声音名片，可以继续绑定。" : action === "replace" ? "已找回未通过审核的声音名片，请删除后重选。" : "已找回等待管理员审核的声音名片。");
    });
  }, [currentFileId, recoverable.data, recoveryChecked]);

  const acceptSelected = async (selected: SelectedVoiceAsset) => {
    await releaseOwnedTemporary();
    if (!mounted.current) {
      await disposeOwnedVoiceTemporaryFile(selected.ownedTemporaryUri);
      return;
    }
    ownedTemporaryUri.current = selected.ownedTemporaryUri;
    setAsset(selected.asset);
    setFile(null);
    setConfirmationPending(false);
    setMessage(null);
    setStage("idle");
    clearPreview();
  };

  const choose = async () => {
    setStage("selecting");
    setMessage(null);
    clearPreview();
    try {
      const selected = await chooseVoiceAsset();
      if (!selected) {
        if (mounted.current) setStage("idle");
        return;
      }
      await acceptSelected(selected);
    } catch {
      if (mounted.current) {
        setStage("failed");
        setMessage("音频选择或读取媒体信息失败，请重新选择。文件内容和本地路径不会写入日志。");
      }
    }
  };

  const upload = async () => {
    if (!asset || task.current) return;
    const durationMessage = asset.durationMs == null ? "正在读取音频时长，请稍候。" : recordingDurationMessage(asset.durationMs);
    if (durationMessage) {
      setStage("failed");
      setMessage(durationMessage);
      await releaseOwnedTemporary();
      if (mounted.current) setAsset(null);
      return;
    }
    if (!policies.data) {
      setMessage("尚未取得服务端策略，请确认本地 API 已启动。");
      await policies.refetch();
      return;
    }
    if (!voiceAuthorizationConfirmed) {
      setMessage("请先逐份阅读并在线确认当前声音名片公开试听授权；协议加载失败时不能上传。");
      return;
    }
    const controller = new AbortController();
    let lastUploadStage: VoiceUploadStage = "reading";
    task.current = controller;
    setMessage(null);
    try {
      await acceptPolicies(confirmedPolicyIds, "VOICE_SAMPLE_UPLOAD");
      const completed = await uploadVoiceSample({ asset, policies: policies.data, signal: controller.signal, onStage: (next) => {
        lastUploadStage = next;
        if (mounted.current) setStage(next);
      } }, imageUploadDependencies);
      if (!mounted.current) return;
      setFile(completed);
      setConfirmationPending(false);
      setStage(moderationStage(completed));
      setMessage(completed.moderation_status === "APPROVED" ? "声音名片已通过审核，可以绑定。" : completed.moderation_status === "REJECTED" ? "声音名片未通过审核，请删除后重选。" : "真实 MIME、音轨和服务端时长校验通过，正在等待管理员审核。");
      await recoverable.refetch();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof VoiceConfirmationError) {
        setFile(error.file);
        setConfirmationPending(error.retryable);
      }
      setStage(controller.signal.aborted ? "cancelled" : "failed");
      setMessage(controller.signal.aborted ? "操作已取消；若对象已上传，只重试确认，不重复上传。" : voiceUploadErrorMessage(error, lastUploadStage));
    } finally {
      if (task.current === controller) task.current = null;
      await releaseOwnedTemporary();
      if (mounted.current) setAsset(null);
    }
  };

  const retryConfirmation = async () => {
    if (!file || task.current) return;
    const controller = new AbortController();
    task.current = controller;
    setStage("completing");
    setMessage(null);
    try {
      const completed = await completeOwnedFile(file.id, controller.signal);
      if (!mounted.current) return;
      setFile(completed);
      setConfirmationPending(false);
      setStage(moderationStage(completed));
      setMessage("服务端确认已完成，请查看审核状态。");
    } catch (error) {
      if (mounted.current) {
        setConfirmationPending(controller.signal.aborted || isRetryableConfirmationError(error));
        setStage(controller.signal.aborted ? "cancelled" : "failed");
        setMessage(voiceUploadErrorMessage(error));
      }
    } finally {
      if (task.current === controller) task.current = null;
    }
  };

  const refresh = async () => {
    if (!file || task.current) return;
    try {
      const latest = fileWithoutAccess(await getOwnedFile(file.id));
      if (!mounted.current) return;
      setFile(latest);
      setStage(moderationStage(latest));
      setMessage(latest.moderation_status === "APPROVED" ? "声音名片已通过审核，可以绑定。" : latest.moderation_status === "REJECTED" ? "声音名片未通过审核，请删除后重选。" : "仍在等待管理员审核。");
    } catch (error) {
      if (mounted.current) {
        setStage("failed");
        setMessage(voiceUploadErrorMessage(error));
      }
    }
  };

  const loadPreview = async () => {
    if (!file) return;
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    clearPreview();
    try {
      const detail = await getOwnedFile(file.id, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setPreviewAccess({ fileId: file.id, url: detail.access.url });
      if (detail.access.expires_at) {
        const delay = Math.min(shouldExpireAccess(detail.access.expires_at) ?? 0, 2_147_483_647);
        previewExpiryTimer.current = globalThis.setTimeout(() => mounted.current && setPreviewAccess(null), delay);
      }
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) setMessage(voiceUploadErrorMessage(error));
    } finally {
      if (previewRequest.current === controller) previewRequest.current = null;
    }
  };

  const bind = async () => {
    if (!file || task.current) return;
    try {
      ensureApprovedVoice(file);
      setStage("binding");
      setMessage(null);
      await onReady(file);
      if (mounted.current) {
        setStage("bound");
        setMessage("声音名片已绑定，服务端保存的是权威音频时长。");
      }
    } catch (error) {
      if (mounted.current) {
        setStage("failed");
        setMessage(voiceUploadErrorMessage(error));
      }
    }
  };

  const discard = async () => {
    if (!file || task.current || file.moderation_status === "APPROVED") return;
    setStage("deleting");
    setMessage(null);
    try {
      await deleteOwnedFile(file.id);
      if (!mounted.current) return;
      setFile(null);
      setAsset(null);
      setConfirmationPending(false);
      setStage("idle");
      setMessage("未绑定的声音名片任务已删除。");
      clearPreview();
      await recoverable.refetch();
    } catch (error) {
      if (mounted.current) {
        setStage("failed");
        setMessage(voiceUploadErrorMessage(error));
      }
    }
  };

  const ready = Boolean(file && file.upload_status === "VERIFIED" && file.moderation_status === "APPROVED");
  const canChoose = !busy && (!file || stage === "bound" || file.moderation_status === "REJECTED" || file.upload_status === "FAILED");
  return <View style={styles.card}>
    <Text style={styles.title}>声音名片</Text>
    <Text style={styles.stage}>{voiceStageCopy(stage)}</Text>
    <Text style={styles.meta}>支持 AAC / M4A / MP3 · 10–30 秒 · 最大 10 MiB · SIGNED 受控访问</Text>
    <Text style={styles.meta}>客户端时长只用于提前提示，服务端解析的真实时长仍是最终依据。</Text>
    <PolicyConfirmationList title="声音名片公开试听授权" hint="上传或重新上传前必须主动在线确认；不默认勾选，不调用电子签。" policies={voicePolicies.data} isPending={voicePolicies.isPending} isError={voicePolicies.isError} confirmedIds={confirmedPolicyIds} disabled={busy} onChange={setConfirmedPolicyIds} onRetry={() => void voicePolicies.refetch()} />
    {asset ? <Text style={styles.meta}>{asset.fileName ?? "已选音频"} · {asset.sizeBytes ? `${Math.ceil(asset.sizeBytes / 1024)} KiB` : "未知大小"} · {asset.durationMs ? `${(asset.durationMs / 1_000).toFixed(1)} 秒（客户端预检）` : "正在读取时长"}</Text> : null}
    {asset?.uri ? <VoiceAudioControls url={asset.uri} label="本地声音名片试听" onDurationMs={(durationMs) => setAsset((current) => current?.uri === asset.uri ? { ...current, durationMs } : current)} /> : null}
    {file ? <Text style={styles.meta}>服务端状态：{file.upload_status} / {file.moderation_status} / {file.visibility}{file.duration_ms ? ` · ${(file.duration_ms / 1_000).toFixed(1)} 秒` : ""}</Text> : null}
    {previewUrl ? <VoiceAudioControls url={previewUrl} label="已上传声音名片试听" /> : null}
    {message ? <NoticeBanner tone={stage === "approved" || stage === "bound" ? "success" : stage === "pending_review" || stage === "cancelled" ? "info" : "danger"} message={message} /> : null}
    {canChoose ? <PrimaryButton tone="plain" label={asset ? "重新选择音频" : "从文件选择声音名片"} disabled={policies.isPending} onPress={() => void choose()} /> : null}
    {canChoose ? <VoiceRecorderPanel disabled={policies.isPending} onAsset={(selected) => void acceptSelected(selected)} onMessage={(copy) => setMessage(copy)} /> : null}
    {asset && !file && !busy ? <PrimaryButton label="上传到隔离区" disabled={!policies.data || asset.durationMs == null || !voiceAuthorizationConfirmed} onPress={() => void upload()} /> : null}
    {busy && stage !== "binding" ? <PrimaryButton tone="plain" label="取消当前操作" onPress={() => task.current?.abort()} /> : null}
    {file && confirmationPending && !busy ? <PrimaryButton label="只重试服务端确认" onPress={() => void retryConfirmation()} /> : null}
    {file && !confirmationPending && file.upload_status === "VERIFIED" && file.moderation_status === "PENDING" && !busy ? <PrimaryButton tone="plain" label="刷新审核状态" onPress={() => void refresh()} /> : null}
    {file && file.upload_status === "VERIFIED" && !previewUrl ? <PrimaryButton tone="plain" label="申请短时试听地址" onPress={() => void loadPreview()} /> : null}
    {ready && stage !== "bound" ? <PrimaryButton label="绑定声音名片" disabled={busy} onPress={() => void bind()} /> : null}
    {file && file.moderation_status !== "APPROVED" && !busy ? <PrimaryButton tone="plain" label="删除未绑定声音名片" onPress={() => void discard()} /> : null}
  </View>;
}

function restoreOwnerField(file: RecoverableFileApiView): FileApiView { return { ...file, owner_user_id: null }; }

const styles = StyleSheet.create({ card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surfaceCard }, title: { ...typography.sectionTitle, color: colors.text }, stage: { ...typography.body, color: colors.brandDeep, fontWeight: "700" }, meta: { ...typography.caption, color: colors.textSecondary } });
