import { ApiClientError } from "@/api/api-error";
import type { FileApiView, FilePolicyApiView, FileType, FileUploadRequestApiView, FileVisibility, RecoverableFileApiView, Viewer } from "@/types/api";

export type ImageUploadStage = "idle" | "selecting" | "reading" | "hashing" | "requesting" | "uploading" | "completing" | "pending_review" | "approved" | "rejected" | "binding" | "bound" | "deleting" | "cancelled" | "failed";
/** USER_AVATAR 的旧页面仍使用 confirming；通用协调器统一使用 completing。 */
export type AvatarUploadStage = ImageUploadStage | "confirming";

export interface LocalImageAsset {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  mimeType?: string | null;
}
export type LocalAvatarAsset = LocalImageAsset;

export interface ImageUploadDependencies {
  request<T>(path: string, options?: RequestInit & { retryAfterRefresh?: boolean }): Promise<T>;
  readBytes(uri: string, signal: AbortSignal): Promise<Uint8Array>;
  sha256(bytes: Uint8Array): Promise<string>;
  put(upload: FileUploadRequestApiView["upload"], bytes: Uint8Array, signal: AbortSignal): Promise<void>;
}
export type AvatarUploadDependencies = ImageUploadDependencies;

export class AvatarUploadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AvatarUploadError";
  }
}

export class ImageConfirmationError extends AvatarUploadError {
  constructor(readonly file: FileApiView, readonly retryable: boolean, cause: unknown) {
    super("FILE_COMPLETE_FAILED", retryable ? "图片已直传成功，但服务端确认暂未完成；请只重试确认，不要重复上传" : imageUploadErrorMessage(cause));
    this.name = "ImageConfirmationError";
  }
}

export class AvatarConfirmationError extends ImageConfirmationError {
  constructor(file: FileApiView, retryable: boolean, cause: unknown) {
    super(file, retryable, cause);
    this.name = "AvatarConfirmationError";
  }
}

export function findImagePolicy(policies: FilePolicyApiView[], fileType: FileType): FilePolicyApiView {
  const policy = policies.find((item) => item.file_type === fileType);
  if (!policy) throw new AvatarUploadError("FILE_POLICY_UNAVAILABLE", `服务端暂未开放 ${fileType} 上传，请稍后重试`);
  return policy;
}

export function findAvatarPolicy(policies: FilePolicyApiView[]): FilePolicyApiView {
  const policy = policies.find((item) => item.file_type === "USER_AVATAR");
  if (!policy) throw new AvatarUploadError("FILE_POLICY_UNAVAILABLE", "服务端暂未开放用户头像上传，请稍后重试");
  return policy;
}

export function resolveImageMimeType(asset: Pick<LocalImageAsset, "mimeType" | "fileName" | "uri">): string {
  const supplied = asset.mimeType?.trim().toLowerCase();
  if (supplied) return supplied;
  const path = (asset.fileName || asset.uri).split(/[?#]/u)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  throw new AvatarUploadError("FILE_LOCAL_MIME_UNKNOWN", "无法识别所选图片格式，请选择 JPG、PNG 或 WebP 图片");
}

export function validateImageBytes(policy: FilePolicyApiView, mimeType: string, sizeBytes: number, label = "图片"): void {
  if (!policy.mime_types.includes(mimeType)) throw new AvatarUploadError("FILE_MIME_NOT_ALLOWED", `该${label}格式不受支持，请选择 JPG、PNG 或 WebP 图片`);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) throw new AvatarUploadError("FILE_LOCAL_EMPTY", "所选图片为空或无法读取，请重新选择");
  if (sizeBytes > policy.maximum_bytes) throw new AvatarUploadError("FILE_SIZE_NOT_ALLOWED", `${label}不能超过 ${formatMebibytes(policy.maximum_bytes)} MB`);
}

export function validateAvatarBytes(policy: FilePolicyApiView, mimeType: string, sizeBytes: number): void {
  validateImageBytes(policy, mimeType, sizeBytes, "头像");
}

export function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function uploadImage(input: {
  fileType: FileType;
  asset: LocalImageAsset;
  policies: FilePolicyApiView[];
  signal: AbortSignal;
  label?: string;
  onStage(stage: ImageUploadStage): void;
}, dependencies: ImageUploadDependencies): Promise<FileApiView> {
  const policy = findImagePolicy(input.policies, input.fileType);
  const mimeType = resolveImageMimeType(input.asset);
  let bytes: Uint8Array;
  try {
    input.onStage("reading");
    bytes = await dependencies.readBytes(input.asset.uri, input.signal);
  } catch (error) {
    if (input.signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "已取消图片上传");
    throw error instanceof AvatarUploadError ? error : new AvatarUploadError("FILE_LOCAL_READ_FAILED", "无法读取所选图片，请重新选择");
  }
  validateImageBytes(policy, mimeType, bytes.byteLength, input.label);

  let sha256: string;
  try {
    input.onStage("hashing");
    sha256 = await dependencies.sha256(bytes);
  } catch (error) {
    if (input.signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "已取消图片上传");
    throw error instanceof AvatarUploadError ? error : new AvatarUploadError("FILE_LOCAL_HASH_FAILED", "无法完成图片完整性校验，请重新选择");
  }

  let session: FileUploadRequestApiView | null = null;
  let putCompleted = false;
  try {
    input.onStage("requesting");
    session = await dependencies.request<FileUploadRequestApiView>("/files/uploads", {
      method: "POST",
      body: JSON.stringify({ file_type: input.fileType, mime_type: mimeType, size_bytes: bytes.byteLength, sha256 }),
      signal: input.signal
    });
    input.onStage("uploading");
    await dependencies.put(session.upload, bytes, input.signal);
    putCompleted = true;
    input.onStage("completing");
    let completed: FileApiView;
    try {
      completed = await dependencies.request<FileApiView>(`/files/${session.file.id}/complete`, { method: "POST", signal: input.signal });
    } catch (error) {
      throw new ImageConfirmationError(session.file, input.signal.aborted || isRetryableConfirmationError(error), error);
    }
    input.onStage(moderationStage(completed));
    return completed;
  } catch (error) {
    if (session && !putCompleted) await dependencies.request(`/files/${session.file.id}`, { method: "DELETE", retryAfterRefresh: false }).catch(() => undefined);
    if (error instanceof ImageConfirmationError) throw error;
    if (input.signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "已取消图片上传");
    throw error;
  }
}

export async function uploadUserAvatar(input: {
  asset: LocalAvatarAsset;
  policies: FilePolicyApiView[];
  signal: AbortSignal;
  onStage(stage: AvatarUploadStage): void;
}, dependencies: AvatarUploadDependencies): Promise<FileApiView> {
  try {
    return await uploadImage({ ...input, fileType: "USER_AVATAR", label: "头像", onStage: (stage) => input.onStage(stage === "completing" ? "confirming" : stage) }, dependencies);
  } catch (error) {
    if (error instanceof ImageConfirmationError && !(error instanceof AvatarConfirmationError)) throw new AvatarConfirmationError(error.file, error.retryable, error);
    throw error;
  }
}

export function ensureApprovedImage(file: Pick<FileApiView, "file_type" | "upload_status" | "moderation_status" | "visibility">, expectedType: FileType, expectedVisibility: FileVisibility): void {
  if (file.file_type !== expectedType || file.visibility !== expectedVisibility) throw new AvatarUploadError("FILE_PURPOSE_MISMATCH", "文件用途或公开范围不匹配，不能绑定");
  if (file.moderation_status === "REJECTED") throw new AvatarUploadError("FILE_MODERATION_REJECTED", "图片未通过审核，请删除后重新选择");
  if (file.moderation_status !== "APPROVED") throw new AvatarUploadError("FILE_MODERATION_PENDING", "图片仍在等待审核，暂时不能绑定");
  if (file.upload_status !== "VERIFIED") throw new AvatarUploadError("FILE_NOT_VERIFIED", "图片尚未完成服务端校验");
}

export function ensureApprovedAvatar(file: FileApiView): void { ensureApprovedImage(file, "USER_AVATAR", "PUBLIC"); }

export function approvedAvatarProfileInput(file: FileApiView, latest: Viewer) {
  ensureApprovedAvatar(file);
  if (!latest.profile) throw new AvatarUploadError("PROFILE_NOT_INITIALIZED", "个人资料尚未初始化，暂时不能绑定头像");
  return { nickname: latest.profile.nickname, bio: latest.profile.bio, avatarFileId: file.id, profileVersion: latest.profile.version, userVersion: latest.version };
}

export function imageUploadErrorMessage(error: unknown): string {
  if (error instanceof AvatarUploadError || error instanceof ApiClientError) {
    if (error.code === "FILE_UPLOAD_EXPIRED" || error.code === "FILE_UPLOAD_URL_EXPIRED") return "上传凭证已过期，请删除旧任务并重新上传";
    if (["FILE_SIZE_MISMATCH", "FILE_MIME_MISMATCH", "FILE_HASH_MISMATCH", "FILE_HASH_METADATA_MISMATCH", "FILE_SIZE_METADATA_MISMATCH", "FILE_IMAGE_DIMENSIONS_INVALID"].includes(error.code)) return "服务端文件校验未通过，请重新选择原始图片上传";
    if (error.code === "RESOURCE_VERSION_CONFLICT") return "资料已被其他设备修改，已停止绑定；请刷新后重试";
    return error.message;
  }
  if (error instanceof TypeError) return "网络离线或无法连接文件服务，请确认 API 与当前对象存储可访问";
  return "图片上传失败，请稍后重试";
}

export function avatarUploadErrorMessage(error: unknown): string { return imageUploadErrorMessage(error); }

export function isRetryableConfirmationError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof ApiClientError && (error.code === "NETWORK_TIMEOUT" || error.status >= 500);
}

export function moderationStage(file: Pick<FileApiView, "moderation_status">): "pending_review" | "approved" | "rejected" {
  return file.moderation_status === "APPROVED" ? "approved" : file.moderation_status === "REJECTED" ? "rejected" : "pending_review";
}

export interface RecoveredImageUploadState {
  file: FileApiView | null;
  stage: ImageUploadStage;
  confirmationPending: boolean;
  message: string | null;
}

export function recoverImageUploadState(files: RecoverableFileApiView[], currentFileId: string | null | undefined, label: string): RecoveredImageUploadState {
  const latest = files.find((item) => item.id !== currentFileId && item.upload_status !== "DELETED");
  if (!latest) return { file: null, stage: "idle", confirmationPending: false, message: null };
  const file: FileApiView = { ...latest, owner_user_id: null };
  const confirmationPending = file.upload_status === "PENDING" || file.upload_status === "UPLOADED";
  const stage = file.upload_status === "FAILED" ? "failed" : moderationStage(file);
  const message = confirmationPending
    ? `已找回最近的${label}上传任务。请只重试服务端确认，不要重复上传。`
    : file.moderation_status === "APPROVED"
      ? `已找回审核通过的${label}，可以继续绑定。`
      : file.moderation_status === "REJECTED"
        ? `已找回被拒绝的${label}，可删除后重选。`
        : `已找回等待审核的${label}。`;
  return { file, stage, confirmationPending, message };
}

export function imageStageCopy(stage: ImageUploadStage, label = "图片"): string {
  const copy: Record<ImageUploadStage, string> = {
    idle: `请选择${label}`, selecting: "正在打开系统图片选择器", reading: "正在读取所选图片", hashing: "正在计算 SHA-256", requesting: "正在申请隔离区上传凭证", uploading: "正在直传隔离对象存储", completing: "正在请求服务端校验", pending_review: "上传与校验已完成，等待管理员审核", approved: `${label}已通过审核，可以绑定`, rejected: `${label}未通过审核`, binding: `正在绑定${label}`, bound: `${label}已绑定`, deleting: "正在删除未绑定上传任务", cancelled: "图片上传已取消", failed: "图片上传未完成"
  };
  return copy[stage];
}

export function avatarStageCopy(stage: AvatarUploadStage): string {
  if (stage === "confirming") return "正在请求服务端校验";
  return imageStageCopy(stage, "头像");
}

function formatMebibytes(bytes: number): string {
  const value = bytes / (1_024 * 1_024);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
