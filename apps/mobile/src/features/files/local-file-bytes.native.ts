import { File } from "expo-file-system";
import { AvatarUploadError } from "@/features/files/file-upload-domain";

export async function readLocalBytes(uri: string, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "文件读取已取消");
  try {
    const bytes = await new File(uri).bytes();
    if (signal.aborted) throw new AvatarUploadError("FILE_UPLOAD_CANCELLED", "文件读取已取消");
    return bytes;
  } catch (error) {
    if (signal.aborted || error instanceof AvatarUploadError) throw error;
    throw new AvatarUploadError("FILE_LOCAL_READ_FAILED", "无法读取所选文件，请重新选择");
  }
}
