import { AvatarUploadError } from "@/features/files/file-upload-domain";

export async function readLocalBytes(uri: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(uri, { method: "GET", signal });
  if (!response.ok && response.status !== 0) throw new AvatarUploadError("FILE_LOCAL_READ_FAILED", "无法读取所选文件，请重新选择");
  return new Uint8Array(await response.arrayBuffer());
}
