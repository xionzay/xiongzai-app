import * as Crypto from "expo-crypto";
import { bytesToHex, type AvatarUploadDependencies, type ImageUploadDependencies } from "@/features/files/file-upload-domain";
import { copyToArrayBuffer, putPresignedUpload } from "@/features/files/presigned-upload";
import { readLocalBytes } from "@/features/files/local-file-bytes";
import { apiClient } from "@/auth/runtime";
import type { CursorPage, FileApiView, FileModerationStatus, FilePolicyApiView, FileType, FileUploadStatus, OwnedFileApiView, RecoverableFileApiView } from "@/types/api";

export function listFilePolicies(signal?: AbortSignal) {
  return apiClient.publicRequest<FilePolicyApiView[]>("/files/policies", { signal });
}

export function getOwnedFile(fileId: string, signal?: AbortSignal) {
  return apiClient.request<OwnedFileApiView>(`/files/${fileId}/access`, { signal });
}

export function deleteOwnedFile(fileId: string) {
  return apiClient.request<{ id: string; deleted: true }>(`/files/${fileId}`, { method: "DELETE", retryAfterRefresh: false });
}

export function completeOwnedFile(fileId: string, signal?: AbortSignal) {
  return apiClient.request<FileApiView>(`/files/${fileId}/complete`, { method: "POST", signal });
}

export function listMyFiles(input: { fileType?: FileType; uploadStatus?: Exclude<FileUploadStatus, "DELETED">; moderationStatus?: FileModerationStatus; cursor?: string; limit?: number }, signal?: AbortSignal) {
  const search = new URLSearchParams();
  if (input.fileType) search.set("file_type", input.fileType);
  if (input.uploadStatus) search.set("upload_status", input.uploadStatus);
  if (input.moderationStatus) search.set("moderation_status", input.moderationStatus);
  if (input.cursor) search.set("cursor", input.cursor);
  if (input.limit) search.set("limit", String(input.limit));
  return apiClient.request<CursorPage<RecoverableFileApiView>>(`/me/files?${search.toString()}`, { signal });
}

export const avatarUploadDependencies: AvatarUploadDependencies = {
  request: (path, options) => apiClient.request(path, options),
  readBytes: readLocalBytes,
  sha256: async (bytes) => bytesToHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(copyToArrayBuffer(bytes)))),
  put: putPresignedUpload
};
export const imageUploadDependencies: ImageUploadDependencies = avatarUploadDependencies;

export { readLocalBytes } from "@/features/files/local-file-bytes";

export function fileWithoutAccess(file: OwnedFileApiView): FileApiView {
  const { access: _access, ...view } = file;
  void _access;
  return view;
}
