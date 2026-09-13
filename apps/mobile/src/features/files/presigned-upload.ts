import { AvatarUploadError } from "@/features/files/file-upload-domain";
import type { FileUploadRequestApiView } from "@/types/api";

export async function putPresignedUpload(upload: FileUploadRequestApiView["upload"], bytes: Uint8Array, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (upload.method !== "PUT") throw new AvatarUploadError("FILE_UPLOAD_METHOD_INVALID", "服务端返回了不支持的上传方式");
  const expiresAt = Date.parse(upload.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) throw new AvatarUploadError("FILE_UPLOAD_URL_EXPIRED", "上传凭证已过期，请重新上传");
  let response: Response;
  try {
    response = await fetchImpl(upload.url, { method: "PUT", headers: upload.headers, body: copyToArrayBuffer(bytes), signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AvatarUploadError("FILE_UPLOAD_PUT_FAILED", "图片直传失败，请确认当前对象存储可访问");
  }
  if (response.status === 401 || response.status === 403 || response.status === 410) throw new AvatarUploadError("FILE_UPLOAD_URL_EXPIRED", "上传凭证已过期或无效，请重新上传");
  if (!response.ok) throw new AvatarUploadError("FILE_UPLOAD_PUT_FAILED", `图片直传失败（HTTP ${response.status}）`);
}

export function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
