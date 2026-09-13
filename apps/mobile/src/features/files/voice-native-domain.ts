export const VOICE_MINIMUM_DURATION_MS = 10_000;
export const VOICE_MAXIMUM_DURATION_MS = 30_000;
// Stop native recording before the policy boundary. AAC encoders may pad the
// final MP4/M4A track by a small amount, while the server correctly enforces the
// authoritative 30-second media duration.
export const VOICE_NATIVE_AUTOSTOP_DURATION_MS = 29_000;
export const VOICE_FINISHED_CALLBACK_GUARD_MS = 1_000;
export const VOICE_DOCUMENT_MIME_TYPES = ["audio/aac", "audio/mp4", "audio/mpeg"] as const;

export type RecordingPermissionState = "granted" | "denied" | "blocked";

export function recordingPermissionState(permission: { granted: boolean; canAskAgain: boolean }): RecordingPermissionState {
  if (permission.granted) return "granted";
  return permission.canAskAgain ? "denied" : "blocked";
}

export function recordingPermissionMessage(state: Exclude<RecordingPermissionState, "granted">): string {
  return state === "blocked"
    ? "麦克风权限已被永久拒绝，请前往系统设置允许后再录音。"
    : "未授予麦克风权限；仍可从系统文件中选择 AAC、M4A 或 MP3。";
}

export function recordingDurationMessage(durationMs: number): string | null {
  if (durationMs < VOICE_MINIMUM_DURATION_MS) return "录音至少需要 10 秒。";
  if (durationMs > VOICE_MAXIMUM_DURATION_MS) return "录音不能超过 30 秒。";
  return null;
}

export function shouldAcceptFinishedRecording(input: {
  recordingActive: boolean;
  statusUri: string | null;
  elapsedMs: number;
}): boolean {
  return input.recordingActive
    && input.statusUri !== null
    && input.elapsedMs >= VOICE_FINISHED_CALLBACK_GUARD_MS;
}

export function isOwnedCacheUri(uri: string, cacheUri: string): boolean {
  const root = cacheUri.endsWith("/") ? cacheUri : `${cacheUri}/`;
  return uri.startsWith(root) && uri.length > root.length;
}

export function shouldExpireAccess(expiresAt: string | null | undefined, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, timestamp - now);
}
