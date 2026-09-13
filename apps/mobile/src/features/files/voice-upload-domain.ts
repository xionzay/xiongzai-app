import { ApiClientError } from "@/api/api-error";
import { AvatarUploadError, isRetryableConfirmationError, moderationStage, type ImageUploadDependencies } from "@/features/files/file-upload-domain";
import type { FileApiView, FilePolicyApiView, FileUploadRequestApiView } from "@/types/api";

export type VoiceUploadStage = "idle" | "selecting" | "reading" | "hashing" | "requesting" | "uploading" | "completing" | "pending_review" | "approved" | "rejected" | "binding" | "bound" | "deleting" | "cancelled" | "failed";

export interface LocalVoiceAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number;
  durationMs?: number | null;
}

export class VoiceConfirmationError extends AvatarUploadError {
  constructor(readonly file: FileApiView, readonly retryable: boolean, cause: unknown) {
    super("FILE_COMPLETE_FAILED", retryable ? "音频已直传成功，但服务端确认暂未完成；请只重试确认，不要重复上传" : voiceUploadErrorMessage(cause));
    this.name = "VoiceConfirmationError";
  }
}

export function findVoicePolicy(policies: FilePolicyApiView[]): FilePolicyApiView {
  const policy = policies.find((item) => item.file_type === "VOICE_SAMPLE");
  if (!policy) throw new AvatarUploadError("FILE_POLICY_UNAVAILABLE", "服务端暂未开放声音名片上传，请稍后重试");
  return policy;
}

export function resolveVoiceMimeType(asset: Pick<LocalVoiceAsset, "mimeType" | "fileName" | "uri">): string {
  const path = (asset.fileName || asset.uri).split(/[?#]/u)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".aac")) return "audio/aac";
  if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "audio/mp4";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  const supplied = asset.mimeType?.trim().toLowerCase();
  if (supplied === "audio/x-m4a") return "audio/mp4";
  if (supplied && ["audio/aac", "audio/mp4", "audio/mpeg"].includes(supplied)) return supplied;
  throw new AvatarUploadError("FILE_LOCAL_MIME_UNKNOWN", "无法识别所选音频格式，请选择 AAC、M4A 或 MP3 文件");
}

export function validateVoiceAsset(policy: FilePolicyApiView, mimeType: string, sizeBytes: number, durationMs?: number | null): void {
  if (!policy.mime_types.includes(mimeType)) throw new AvatarUploadError("FILE_MIME_NOT_ALLOWED", "声音名片仅支持 AAC、M4A 或 MP3");
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) throw new AvatarUploadError("FILE_LOCAL_EMPTY", "所选音频为空或无法读取，请重新选择");
  if (sizeBytes > policy.maximum_bytes) throw new AvatarUploadError("FILE_SIZE_NOT_ALLOWED", `声音名片不能超过 ${formatMebibytes(policy.maximum_bytes)} MB`);
  if (durationMs != null && policy.minimum_duration_ms != null && durationMs < policy.minimum_duration_ms) throw new AvatarUploadError("FILE_DURATION_NOT_ALLOWED", `声音名片不能短于 ${policy.minimum_duration_ms / 1_000} 秒`);
  if (durationMs != null && policy.maximum_duration_ms != null && durationMs > policy.maximum_duration_ms) throw new AvatarUploadError("FILE_DURATION_NOT_ALLOWED", `声音名片不能超过 ${policy.maximum_duration_ms / 1_000} 秒`);
}

export async function uploadVoiceSample(input: { asset: LocalVoiceAsset; policies: FilePolicyApiView[]; signal: AbortSignal; onStage(stage: VoiceUploadStage): void }, dependencies: ImageUploadDependencies): Promise<FileApiView> {
  const policy = findVoicePolicy(input.policies);
  const mimeType = resolveVoiceMimeType(input.asset);
  let bytes: Uint8Array;
  try {
    input.onStage("reading");
    bytes = await dependencies.readBytes(input.asset.uri, input.signal);
  } catch (error) {
    if (input.signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "已取消声音名片上传");
    throw error instanceof AvatarUploadError ? error : new AvatarUploadError("FILE_LOCAL_READ_FAILED", "无法读取所选音频，请重新选择");
  }
  validateVoiceAsset(policy, mimeType, bytes.byteLength, input.asset.durationMs);
  throwIfVoiceUploadAborted(input.signal);
  input.onStage("hashing");
  const sha256 = await dependencies.sha256(bytes);
  throwIfVoiceUploadAborted(input.signal);
  let session: FileUploadRequestApiView | null = null;
  let putCompleted = false;
  try {
    input.onStage("requesting");
    session = await dependencies.request<FileUploadRequestApiView>("/files/uploads", { method: "POST", body: JSON.stringify({ file_type: "VOICE_SAMPLE", mime_type: mimeType, size_bytes: bytes.byteLength, sha256 }), signal: input.signal });
    throwIfVoiceUploadAborted(input.signal);
    input.onStage("uploading");
    await dependencies.put(session.upload, bytes, input.signal);
    putCompleted = true;
    input.onStage("completing");
    try {
      const completed = await dependencies.request<FileApiView>(`/files/${session.file.id}/complete`, { method: "POST", signal: input.signal });
      input.onStage(moderationStage(completed));
      return completed;
    } catch (error) {
      throw new VoiceConfirmationError(session.file, input.signal.aborted || isRetryableConfirmationError(error), error);
    }
  } catch (error) {
    if (session && !putCompleted) await dependencies.request(`/files/${session.file.id}`, { method: "DELETE", retryAfterRefresh: false }).catch(() => undefined);
    if (error instanceof VoiceConfirmationError) throw error;
    if (input.signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "已取消声音名片上传");
    throw error;
  }
}

export function ensureApprovedVoice(file: Pick<FileApiView, "file_type" | "upload_status" | "moderation_status" | "visibility" | "duration_ms">): void {
  if (file.file_type !== "VOICE_SAMPLE" || file.visibility !== "SIGNED") throw new AvatarUploadError("FILE_PURPOSE_MISMATCH", "该文件不是受控访问的声音名片");
  if (file.upload_status !== "VERIFIED") throw new AvatarUploadError("FILE_NOT_VERIFIED", "声音名片尚未完成服务端校验");
  if (file.moderation_status === "REJECTED") throw new AvatarUploadError("FILE_MODERATION_REJECTED", "声音名片未通过审核，请重新选择");
  if (file.moderation_status !== "APPROVED") throw new AvatarUploadError("FILE_MODERATION_PENDING", "声音名片仍在等待管理员审核");
  if (!file.duration_ms || file.duration_ms < 10_000 || file.duration_ms > 30_000) throw new AvatarUploadError("FILE_DURATION_NOT_ALLOWED", "服务端音频时长不符合 10–30 秒要求");
}

export function voiceRecoveryAction(file: Pick<FileApiView, "upload_status" | "moderation_status">): "reselect" | "complete" | "wait" | "bind" | "replace" {
  if (file.upload_status === "PENDING" || file.upload_status === "FAILED") return "reselect";
  if (file.upload_status === "UPLOADED") return "complete";
  if (file.moderation_status === "APPROVED") return "bind";
  if (file.moderation_status === "REJECTED" || file.moderation_status === "FLAGGED") return "replace";
  return "wait";
}

export function voiceUploadErrorMessage(error: unknown, failedStage?: VoiceUploadStage): string {
  if (error instanceof AvatarUploadError || error instanceof ApiClientError) {
    if (["FILE_UPLOAD_EXPIRED", "FILE_UPLOAD_URL_EXPIRED"].includes(error.code)) return "上传凭证已过期，请删除旧任务并重新选择音频";
    if (["FILE_SIZE_MISMATCH", "FILE_MIME_MISMATCH", "FILE_HASH_MISMATCH", "FILE_HASH_METADATA_MISMATCH", "FILE_SIZE_METADATA_MISMATCH", "FILE_DURATION_NOT_ALLOWED"].includes(error.code)) return "服务端音频校验未通过，请确认格式、大小与时长后重试";
    if (error.code === "RESOURCE_VERSION_CONFLICT") return "资料已被其他设备修改，请刷新后重新绑定";
    return error.message;
  }
  if (error instanceof TypeError) return "网络离线或无法连接文件服务，请确认 API 与当前对象存储可访问";
  if (failedStage === "reading") return "读取本地音频失败，请重新选择文件";
  if (failedStage === "hashing") return "本地音频 SHA-256 计算失败，请重新选择文件";
  if (failedStage === "requesting") return "申请隔离区上传凭证失败，请确认本地 API 正在运行";
  if (failedStage === "uploading") return "直传隔离对象存储失败，请确认当前对象存储可访问";
  if (failedStage === "completing") return "服务端音频校验未完成，请稍后只重试确认";
  return "声音名片上传失败，请稍后重试";
}

export function voiceStageCopy(stage: VoiceUploadStage): string {
  const copy: Record<VoiceUploadStage, string> = { idle: "请选择声音名片", selecting: "正在打开音频选择器", reading: "正在读取所选音频", hashing: "正在计算 SHA-256", requesting: "正在申请隔离区上传凭证", uploading: "正在直传隔离对象存储", completing: "正在请求服务端校验真实 MIME、音轨与时长", pending_review: "上传与校验已完成，等待管理员审核", approved: "声音名片已通过审核，可以绑定", rejected: "声音名片未通过审核", binding: "正在绑定声音名片", bound: "声音名片已绑定", deleting: "正在删除未绑定任务", cancelled: "声音名片上传已取消", failed: "声音名片上传未完成" };
  return copy[stage];
}

function formatMebibytes(bytes: number): string { const value = bytes / (1_024 * 1_024); return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function throwIfVoiceUploadAborted(signal: AbortSignal): void { if (signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "已取消声音名片上传"); }
