import { AvatarUploadError, isRetryableConfirmationError, type ImageUploadDependencies } from "@/features/files/file-upload-domain";
import type { FileApiView, FilePolicyApiView, FileUploadRequestApiView } from "@/types/api";

export type ChatMediaAsset = { type: "IMAGE" | "VOICE"; uri: string; mimeType: string; durationMs?: number | null };
export class ChatMediaConfirmationError extends Error {
  constructor(readonly file: FileApiView, readonly retryable: boolean) { super("文件已上传；请只重试确认，不要重复上传。"); }
}

export function chatMediaReady(file: Pick<FileApiView, "file_type" | "upload_status" | "moderation_status" | "visibility">) {
  return ["CHAT_IMAGE", "CHAT_VOICE"].includes(file.file_type) && file.visibility === "PRIVATE" && file.upload_status === "VERIFIED" && file.moderation_status === "APPROVED";
}

export async function uploadChatMedia(asset: ChatMediaAsset, policies: FilePolicyApiView[], signal: AbortSignal, onStage: (stage: string) => void, dependencies: ImageUploadDependencies): Promise<FileApiView> {
  const fileType = asset.type === "IMAGE" ? "CHAT_IMAGE" : "CHAT_VOICE";
  const policy = policies.find(item => item.file_type === fileType);
  if (!policy || policy.visibility !== "PRIVATE") throw new AvatarUploadError("FILE_POLICY_UNAVAILABLE", "聊天媒体上传尚未开放，请稍后重试。");
  const check = () => { if (signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "已取消上传。"); };
  check(); onStage("正在读取文件");
  const bytes = await dependencies.readBytes(asset.uri, signal);
  check();
  if (!policy.mime_types.includes(asset.mimeType) || !bytes.length || bytes.length > policy.maximum_bytes) throw new AvatarUploadError("FILE_SIZE_NOT_ALLOWED", "文件格式或大小不符合服务端要求。");
  if (asset.type === "VOICE" && asset.durationMs != null && (asset.durationMs < (policy.minimum_duration_ms ?? 1000) || asset.durationMs > (policy.maximum_duration_ms ?? 60000))) throw new AvatarUploadError("FILE_DURATION_NOT_ALLOWED", "聊天语音须为 1–60 秒。");
  onStage("正在校验文件"); const sha256 = await dependencies.sha256(bytes); check();
  onStage("正在申请上传");
  const session = await dependencies.request<FileUploadRequestApiView>("/files/uploads", { method: "POST", body: JSON.stringify({ file_type: fileType, mime_type: asset.mimeType, size_bytes: bytes.length, sha256 }), signal });
  let putCompleted = false;
  try {
    check(); onStage("正在上传文件"); await dependencies.put(session.upload, bytes, signal); putCompleted = true;
    onStage("正在确认上传");
    try { return await dependencies.request<FileApiView>(`/files/${session.file.id}/complete`, { method: "POST", signal }); }
    catch (error) { throw new ChatMediaConfirmationError(session.file, signal.aborted || isRetryableConfirmationError(error)); }
  } catch (error) {
    if (!putCompleted) await dependencies.request(`/files/${session.file.id}`, { method: "DELETE", retryAfterRefresh: false }).catch(() => undefined);
    throw error;
  }
}
/** iOS permission prompts are inactive, not background. Keep their result handler alive. */
export function shouldMountChatRecorder(activity: string): boolean {
  return activity === "active" || activity === "inactive";
}
