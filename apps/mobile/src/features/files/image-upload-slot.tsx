import { useEffect, useRef, useState } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { completeOwnedFile, deleteOwnedFile, fileWithoutAccess, getOwnedFile, imageUploadDependencies, listFilePolicies, listMyFiles } from "@/features/files/file-upload-api";
import { AvatarUploadError, ImageConfirmationError, imageStageCopy, imageUploadErrorMessage, isRetryableConfirmationError, moderationStage, recoverImageUploadState, uploadImage, type ImageUploadStage, type LocalImageAsset } from "@/features/files/file-upload-domain";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { FileApiView, FileType, FileVisibility, RecoverableFileApiView } from "@/types/api";

type SelectedImage = LocalImageAsset & { fileSize?: number };
type ImageUploadSlotProps = {
  fileType: FileType;
  label: string;
  currentFileId?: string | null;
  expectedVisibility: FileVisibility;
  aspect?: [number, number];
  requireApproval?: boolean;
  readyLabel?: string;
  onReady(file: FileApiView): Promise<void>;
};

const activeStages = new Set<ImageUploadStage>(["reading", "hashing", "requesting", "uploading", "completing", "binding", "deleting"]);

export function ImageUploadSlot(props: ImageUploadSlotProps) {
  const recoverable = useQuery({ queryKey: ["my-files", props.fileType], queryFn: ({ signal }) => listMyFiles({ fileType: props.fileType, limit: 20 }, signal), staleTime: 10_000 });
  if (recoverable.isPending) return <View style={styles.card}><Text style={styles.title}>{props.label}</Text><Text style={styles.stage}>正在检查可恢复的上传任务…</Text></View>;
  if (!recoverable.data || recoverable.isError) return <View style={styles.card}><Text style={styles.title}>{props.label}</Text><NoticeBanner tone="danger" message="无法检查已有上传任务。为避免重复上传，请先恢复连接并重试。" /><PrimaryButton tone="plain" label="重试检查上传任务" onPress={() => void recoverable.refetch()} /></View>;
  return <ImageUploadSlotReady key={`${props.fileType}:${props.currentFileId ?? "none"}`} {...props} recoverableItems={recoverable.data.items} refetchRecoverable={() => recoverable.refetch()} />;
}

function ImageUploadSlotReady({ fileType, label, currentFileId, expectedVisibility, aspect, requireApproval = true, readyLabel = "使用这张图片", onReady, recoverableItems, refetchRecoverable }: ImageUploadSlotProps & {
  recoverableItems: RecoverableFileApiView[];
  refetchRecoverable(): Promise<unknown>;
}) {
  const [permission, requestPermission] = ImagePicker.useMediaLibraryPermissions();
  const policies = useQuery({ queryKey: ["file-policies"], queryFn: ({ signal }) => listFilePolicies(signal), staleTime: 60_000 });
  const [initialRecovery] = useState(() => recoverImageUploadState(recoverableItems, currentFileId, label));
  const [asset, setAsset] = useState<SelectedImage | null>(null);
  const [file, setFile] = useState<FileApiView | null>(initialRecovery.file);
  const [stage, setStage] = useState<ImageUploadStage>(initialRecovery.stage);
  const [message, setMessage] = useState<string | null>(initialRecovery.message);
  const [confirmationPending, setConfirmationPending] = useState(initialRecovery.confirmationPending);
  const task = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busy = activeStages.has(stage);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; task.current?.abort(); };
  }, []);

  const choose = async () => {
    setStage("selecting");
    setMessage(null);
    try {
      const nextPermission = await requestPermission();
      if (!mounted.current) return;
      if (!nextPermission.granted) {
        setStage("failed");
        setMessage(nextPermission.canAskAgain ? "未获得相册权限，可以再次尝试授权。" : "相册权限已被系统拒绝，请前往系统设置允许访问。");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: Boolean(aspect), aspect, quality: 0.82, base64: false, exif: false });
      if (!mounted.current || result.canceled || !result.assets[0]) { setStage("idle"); return; }
      const selected = result.assets[0];
      setAsset({ uri: selected.uri, width: selected.width, height: selected.height, fileSize: selected.fileSize, fileName: selected.fileName, mimeType: selected.mimeType });
      setFile(null);
      setConfirmationPending(false);
      setStage("idle");
    } catch {
      if (!mounted.current) return;
      setStage("failed");
      setMessage("图片选择或裁剪失败，请重新选择。图片内容和本地路径不会写入日志。");
    }
  };

  const upload = async () => {
    if (!asset || task.current) return;
    if (!policies.data) { setMessage("尚未取得服务端上传策略，请确认本地 API 已启动后重试。"); await policies.refetch(); return; }
    const controller = new AbortController();
    task.current = controller;
    setMessage(null);
    try {
      const completed = await uploadImage({ fileType, asset, policies: policies.data, signal: controller.signal, label, onStage: (next) => mounted.current && setStage(next) }, imageUploadDependencies);
      if (!mounted.current) return;
      assertPurpose(completed, fileType, expectedVisibility);
      setFile(completed);
      setConfirmationPending(false);
      setMessage(completed.moderation_status === "APPROVED" ? `${label}已通过审核，可以继续。` : completed.moderation_status === "REJECTED" ? `${label}未通过审核，请删除后重新选择。` : `${label}已通过文件校验，正在等待管理员审核。`);
      await refetchRecoverable();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ImageConfirmationError) {
        setFile(error.file);
        setConfirmationPending(true);
      }
      setStage(controller.signal.aborted ? "cancelled" : "failed");
      setMessage(controller.signal.aborted ? "操作已取消；若文件已经直传，只需重试确认，不要重复上传。" : imageUploadErrorMessage(error));
    } finally { if (task.current === controller) task.current = null; }
  };

  const retryConfirmation = async () => {
    if (!file || task.current) return;
    const controller = new AbortController(); task.current = controller; setStage("completing"); setMessage(null);
    try {
      const completed = await completeOwnedFile(file.id, controller.signal);
      if (!mounted.current) return;
      assertPurpose(completed, fileType, expectedVisibility);
      setFile(completed); setConfirmationPending(false); setStage(moderationStage(completed));
      setMessage(completed.moderation_status === "APPROVED" ? `${label}已通过审核，可以继续。` : completed.moderation_status === "REJECTED" ? `${label}未通过审核，请删除后重新选择。` : `${label}已完成校验，正在等待管理员审核。`);
    } catch (error) {
      if (!mounted.current) return;
      setConfirmationPending(controller.signal.aborted || isRetryableConfirmationError(error));
      setStage(controller.signal.aborted ? "cancelled" : "failed"); setMessage(imageUploadErrorMessage(error));
    } finally { if (task.current === controller) task.current = null; }
  };

  const refresh = async () => {
    if (!file || task.current) return;
    setMessage(null);
    try {
      const latest = fileWithoutAccess(await getOwnedFile(file.id));
      if (!mounted.current) return;
      assertPurpose(latest, fileType, expectedVisibility);
      setFile(latest); setStage(moderationStage(latest));
      setMessage(latest.moderation_status === "APPROVED" ? `${label}已通过审核，可以继续。` : latest.moderation_status === "REJECTED" ? `${label}未通过审核，请删除后重新选择。` : `${label}仍在等待管理员审核。`);
    } catch (error) { if (mounted.current) { setStage("failed"); setMessage(imageUploadErrorMessage(error)); } }
  };

  const bind = async () => {
    if (!file || task.current) return;
    try {
      assertPurpose(file, fileType, expectedVisibility);
      if (file.upload_status !== "VERIFIED") throw new AvatarUploadError("FILE_NOT_VERIFIED", `${label}尚未完成服务端校验`);
      if (requireApproval && file.moderation_status !== "APPROVED") throw new AvatarUploadError("FILE_MODERATION_PENDING", `${label}仍在等待审核`);
      if (file.moderation_status === "REJECTED") throw new AvatarUploadError("FILE_MODERATION_REJECTED", `${label}未通过审核`);
      setStage("binding"); setMessage(null);
      await onReady(file);
      if (!mounted.current) return;
      setStage("bound"); setMessage(`${label}已绑定到当前业务记录。`);
    } catch (error) { if (mounted.current) { setStage("failed"); setMessage(imageUploadErrorMessage(error)); } }
  };

  const discard = async () => {
    if (!file || task.current || file.moderation_status === "APPROVED") return;
    setStage("deleting"); setMessage(null);
    try {
      await deleteOwnedFile(file.id);
      if (!mounted.current) return;
      setFile(null); setAsset(null); setConfirmationPending(false); setStage("idle"); setMessage(`未绑定的${label}任务已删除。`);
      await refetchRecoverable();
    } catch (error) { if (mounted.current) { setStage("failed"); setMessage(imageUploadErrorMessage(error)); } }
  };

  const ready = Boolean(file && file.upload_status === "VERIFIED" && file.moderation_status !== "REJECTED" && (!requireApproval || file.moderation_status === "APPROVED"));
  const canChoose = !busy && (!file || stage === "bound" || file.moderation_status === "REJECTED");

  return <View style={styles.card}>
    <Text style={styles.title}>{label}</Text>
    {currentFileId && expectedVisibility === "PUBLIC" ? <FileImage fileId={currentFileId} style={styles.currentImage} label={`当前${label}`} /> : null}
    {asset ? <Image source={{ uri: asset.uri }} style={styles.preview} accessibilityLabel={`${label}本地预览`} /> : null}
    <Text style={styles.stage}>{imageStageCopy(stage, label)}</Text>
    {asset ? <Text style={styles.meta}>{asset.width} × {asset.height}{asset.fileSize ? ` · ${Math.ceil(asset.fileSize / 1024)} KB` : ""}</Text> : null}
    {file ? <Text style={styles.meta}>服务端状态：{file.upload_status} / {file.moderation_status} / {file.visibility}</Text> : null}
    {message ? <NoticeBanner tone={stage === "bound" || stage === "approved" ? "success" : stage === "pending_review" || stage === "cancelled" ? "info" : "danger"} message={message} /> : null}
    {canChoose ? <PrimaryButton tone="plain" label={asset ? `重新选择${label}` : `从相册选择${label}`} disabled={policies.isPending} onPress={() => void choose()} /> : null}
    {asset && !file && !busy ? <PrimaryButton label="上传到隔离区" disabled={!policies.data} onPress={() => void upload()} /> : null}
    {busy && stage !== "binding" ? <PrimaryButton tone="plain" label="取消当前操作" onPress={() => task.current?.abort()} /> : null}
    {file && confirmationPending && !busy ? <PrimaryButton label="只重试服务端确认" onPress={() => void retryConfirmation()} /> : null}
    {file && !confirmationPending && file.moderation_status === "PENDING" && !busy ? <PrimaryButton tone="plain" label="刷新审核状态" onPress={() => void refresh()} /> : null}
    {ready && stage !== "bound" ? <PrimaryButton label={readyLabel} disabled={busy} onPress={() => void bind()} /> : null}
    {file && file.moderation_status !== "APPROVED" && !busy ? <PrimaryButton tone="plain" label={`删除未绑定${label}`} onPress={() => void discard()} /> : null}
    {policies.isError ? <PrimaryButton tone="plain" label="重试读取上传策略" onPress={() => void policies.refetch()} /> : null}
    {permission?.canAskAgain === false ? <PrimaryButton tone="plain" label="打开系统设置" onPress={() => void Linking.openSettings()} /> : null}
  </View>;
}

function assertPurpose(file: Pick<FileApiView, "file_type" | "visibility">, type: FileType, visibility: FileVisibility) {
  if (file.file_type !== type || file.visibility !== visibility) throw new AvatarUploadError("FILE_PURPOSE_MISMATCH", "文件用途或公开范围不匹配，不能继续");
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surfaceCard },
  title: { ...typography.sectionTitle, color: colors.text },
  stage: { ...typography.body, color: colors.brandDeep, fontWeight: "700" },
  meta: { ...typography.caption, color: colors.textSecondary },
  preview: { width: "100%", aspectRatio: 1, borderRadius: radii.lg, backgroundColor: colors.surfaceBlue },
  currentImage: { width: "100%", aspectRatio: 1, borderRadius: radii.lg }
});
