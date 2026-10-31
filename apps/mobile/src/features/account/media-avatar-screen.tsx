import { JellyIcon } from "../../components/jelly-icon";
import { useEffect, useRef, useState } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { FileImage } from "@/components/file-image";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { avatarUploadDependencies, completeOwnedFile, deleteOwnedFile, fileWithoutAccess, getOwnedFile, listFilePolicies } from "@/features/files/file-upload-api";
import { approvedAvatarProfileInput, AvatarConfirmationError, avatarStageCopy, avatarUploadErrorMessage, isRetryableConfirmationError, uploadUserAvatar, type AvatarUploadStage, type LocalAvatarAsset } from "@/features/files/file-upload-domain";
import { queryClient } from "@/query/query-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { FileApiView } from "@/types/api";

type SelectedAvatar = LocalAvatarAsset & { fileSize?: number };
const activeStages = new Set<AvatarUploadStage>(["reading", "hashing", "requesting", "uploading", "confirming", "binding"]);

export function MediaAvatarScreen() {
  const { user, refreshUser, updateProfile } = useAuth();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const policyQuery = useQuery({ queryKey: ["file-policies"], queryFn: ({ signal }) => listFilePolicies(signal), staleTime: 60_000 });
  const [asset, setAsset] = useState<SelectedAvatar | null>(null);
  const [file, setFile] = useState<FileApiView | null>(null);
  const [stage, setStage] = useState<AvatarUploadStage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const uploadAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busy = activeStages.has(stage);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadAbort.current?.abort();
    };
  }, []);

  const choose = async (source: "library" | "camera") => {
    setMessage(null);
    try {
      const permission = source === "library" ? await requestLibraryPermission() : await requestCameraPermission();
      if (!mounted.current) return;
      if (!permission.granted) {
        setStage("failed");
        setMessage(permission.canAskAgain ? "未获得系统权限，您可以再次尝试授权。" : "系统权限已被拒绝，请前往系统设置允许访问。");
        return;
      }
      const result = source === "library"
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.72, base64: false, exif: false })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.72, base64: false, exif: false });
      if (!mounted.current) return;
      if (result.canceled || !result.assets[0]) return;
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

  const startUpload = async () => {
    if (!asset || uploadAbort.current) return;
    if (!policyQuery.data) {
      setMessage("尚未取得服务端头像策略，请检查 API 后重试");
      await policyQuery.refetch();
      return;
    }
    const controller = new AbortController();
    uploadAbort.current = controller;
    setMessage(null);
    setFile(null);
    setConfirmationPending(false);
    try {
      const completed = await uploadUserAvatar({ asset, policies: policyQuery.data, signal: controller.signal, onStage: (nextStage) => { if (mounted.current) setStage(nextStage); } }, avatarUploadDependencies);
      if (!mounted.current) return;
      setFile(completed);
      if (completed.moderation_status === "PENDING") setMessage("文件已通过完整性与媒体校验，目前仍保留原头像。管理员审核通过后才能绑定。");
      if (completed.moderation_status === "REJECTED") setMessage("头像未通过审核，未修改个人资料。您可以删除后重新选择。");
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AvatarConfirmationError) {
        setFile(error.file);
        setConfirmationPending(error.retryable);
        setStage(controller.signal.aborted ? "cancelled" : "failed");
        setMessage(controller.signal.aborted ? "文件直传已成功，服务端确认已取消；只需重试确认，不要重新上传。" : avatarUploadErrorMessage(error));
        return;
      }
      const cancelled = controller.signal.aborted;
      setStage(cancelled ? "cancelled" : "failed");
      setMessage(avatarUploadErrorMessage(error));
    } finally {
      if (uploadAbort.current === controller) uploadAbort.current = null;
    }
  };

  const retryConfirmation = async () => {
    if (!file || !confirmationPending || uploadAbort.current) return;
    const controller = new AbortController();
    uploadAbort.current = controller;
    setStage("confirming");
    setMessage(null);
    try {
      const completed = await completeOwnedFile(file.id, controller.signal);
      if (!mounted.current) return;
      setFile(completed);
      setConfirmationPending(false);
      if (completed.moderation_status === "APPROVED") {
        setStage("approved");
        setMessage("服务端确认完成，头像已通过审核，可以设为当前头像。");
      } else if (completed.moderation_status === "REJECTED") {
        setStage("rejected");
        setMessage("服务端确认完成，但头像未通过审核，个人资料未被修改。");
      } else {
        setStage("pending_review");
        setMessage("服务端确认与媒体校验已完成，头像正在等待管理员审核。");
      }
    } catch (error) {
      if (!mounted.current) return;
      const cancelled = controller.signal.aborted;
      setConfirmationPending(cancelled || isRetryableConfirmationError(error));
      setStage(cancelled ? "cancelled" : "failed");
      setMessage(cancelled ? "服务端确认已取消；文件无需重新上传，可稍后只重试确认。" : avatarUploadErrorMessage(error));
    } finally {
      if (uploadAbort.current === controller) uploadAbort.current = null;
    }
  };

  const bindApproved = async (approvedFile: FileApiView) => {
    setStage("binding");
    setMessage(null);
    try {
      const latest = await refreshUser();
      if (!mounted.current) return;
      await updateProfile(approvedAvatarProfileInput(approvedFile, latest));
      if (!mounted.current) return;
      setStage("bound");
      setMessage("头像已绑定成功。个人中心和公开资料将只显示服务端审核通过的头像。");
      await queryClient.invalidateQueries({ queryKey: ["public-file", approvedFile.id] });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") {
        await refreshUser().catch(() => undefined);
      }
      if (!mounted.current) return;
      setStage("failed");
      setMessage(avatarUploadErrorMessage(error));
    }
  };

  const refreshModeration = async () => {
    if (!file) return;
    setMessage(null);
    try {
      const latestFile = fileWithoutAccess(await getOwnedFile(file.id));
      if (!mounted.current) return;
      setFile(latestFile);
      if (latestFile.moderation_status === "APPROVED") {
        setStage("approved");
        await bindApproved(latestFile);
      } else if (latestFile.moderation_status === "REJECTED") {
        setStage("rejected");
        setMessage("管理员已拒绝该头像，个人资料未被修改。请删除后重新选择。");
      } else {
        setStage("pending_review");
        setMessage("头像仍在等待管理员审核，当前头像保持不变。");
      }
    } catch (error) {
      if (!mounted.current) return;
      setStage("failed");
      setMessage(avatarUploadErrorMessage(error));
    }
  };

  const discard = async () => {
    if (!file) return;
    setMessage(null);
    try {
      await deleteOwnedFile(file.id);
      if (!mounted.current) return;
      setFile(null);
      setAsset(null);
      setConfirmationPending(false);
      setStage("idle");
      setMessage("待审头像已删除，可以重新选择。");
    } catch (error) {
      if (!mounted.current) return;
      setMessage(avatarUploadErrorMessage(error));
    }
  };

  const cancel = () => uploadAbort.current?.abort();
  const canChoose = !busy && (!file || stage === "bound");
  const canDiscard = Boolean(file && file.moderation_status !== "APPROVED" && !busy);

  return (
    <NativePage title="图片上传与裁剪" subtitle="头像审核通过前不会替换当前头像" contentStyle={styles.content}>
      <NoticeBanner message="系统编辑器会先进行 1:1 裁剪。随后 App 读取临时图片、计算 SHA-256，并使用服务端返回的短时 PUT 地址直传隔离 Bucket；审核通过前不会替换当前头像。" />
      <View style={styles.currentAvatar}>
        <FileImage fileId={user?.profile?.avatar_file_id} style={styles.officialImage} label="当前正式头像" />
        <View style={styles.currentCopy}>
          <Text style={styles.title}>当前正式头像</Text>
          <Text style={styles.current}>{user?.profile?.avatar_file_id ? "服务端审核文件已绑定" : "尚未设置，审核期间仍保持这里不变"}</Text>
        </View>
      </View>
      {policyQuery.isError ? <NoticeBanner tone="danger" message="无法读取服务端文件策略。请确认本地 API 已启动，然后重试。" /> : null}
      {asset ? (
        <View style={styles.preview}>
          <Image source={{ uri: asset.uri }} style={styles.image} accessibilityLabel="待上传头像本地预览" />
          <Text style={styles.title}>新头像本地预览</Text>
          <Text style={styles.meta}>{asset.width} <JellyIcon kind="close" label="关闭" />{asset.height}{asset.fileSize ? ` · ${Math.ceil(asset.fileSize / 1024)} KB` : ""}</Text>
          <Text style={styles.stage}>{avatarStageCopy(stage)}</Text>
          {file ? <Text style={styles.meta}>服务端状态：{file.upload_status} / {file.moderation_status}</Text> : null}
        </View>
      ) : <NoticeBanner message={avatarStageCopy(stage)} />}
      {message ? <NoticeBanner tone={stage === "bound" || stage === "approved" ? "success" : stage === "pending_review" || stage === "cancelled" ? "info" : "danger"} message={message} /> : null}
      <View style={styles.actions}>
        {canChoose ? <PrimaryButton label={asset ? "重新从相册选择" : "从相册选择并裁剪"} disabled={policyQuery.isPending} onPress={() => void choose("library")} /> : null}
        {canChoose ? <PrimaryButton tone="plain" label="拍摄并裁剪头像" disabled={policyQuery.isPending} onPress={() => void choose("camera")} /> : null}
        {asset && !file && !busy ? <PrimaryButton label={stage === "failed" || stage === "cancelled" ? "重新上传" : "上传到隔离区"} disabled={!policyQuery.data} onPress={() => void startUpload()} /> : null}
        {busy && stage !== "binding" ? <PrimaryButton tone="plain" label="取消上传" onPress={cancel} /> : null}
        {file && confirmationPending && !busy ? <PrimaryButton label="只重试服务端确认" onPress={() => void retryConfirmation()} /> : null}
        {file && !confirmationPending && (stage === "pending_review" || stage === "failed") ? <PrimaryButton label="刷新审核状态" disabled={busy} onPress={() => void refreshModeration()} /> : null}
        {file && stage === "approved" ? <PrimaryButton label="设为当前头像" disabled={busy} onPress={() => void bindApproved(file)} /> : null}
        {canDiscard ? <PrimaryButton tone="plain" label="删除待审头像并重选" onPress={() => void discard()} /> : null}
        {policyQuery.isError ? <PrimaryButton tone="plain" label="重试读取上传策略" onPress={() => void policyQuery.refetch()} /> : null}
        {(libraryPermission?.canAskAgain === false || cameraPermission?.canAskAgain === false) ? <PrimaryButton tone="plain" label="打开系统设置" onPress={() => void Linking.openSettings()} /> : null}
      </View>
      <NoticeBanner message="本页面不显示或记录预签名 URL、Access Key、Secret、图片字节或本地路径；直传请求不会携带登录 Bearer。当前阶段不连接阿里云 OSS。" />
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  current: { ...typography.caption, color: colors.textSecondary },
  currentAvatar: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.xl, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  currentCopy: { flex: 1, gap: spacing.xs },
  officialImage: { width: 72, height: 72, borderRadius: 36 },
  preview: { alignItems: "center", gap: spacing.sm, padding: spacing.xl, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: radii.xl, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow },
  image: { width: 168, height: 168, borderRadius: 84, backgroundColor: colors.surfaceBlue },
  title: { ...typography.sectionTitle, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary },
  stage: { ...typography.body, color: colors.brandDeep, fontWeight: "700" },
  actions: { gap: spacing.sm }
});
