import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isOwnedCacheUri, recordingDurationMessage, recordingPermissionMessage, recordingPermissionState, shouldAcceptFinishedRecording, shouldExpireAccess, VOICE_NATIVE_AUTOSTOP_DURATION_MS } from "../src/features/files/voice-native-domain";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), "utf8");
}

const packageJson = JSON.parse(source("../package.json")) as { dependencies: Record<string, string> };
const appConfig = source("../app.config.ts");
const nativeSelection = source("../src/features/files/voice-media-selection.native.ts");
const webSelection = source("../src/features/files/voice-media-selection.ts");
const nativeBytes = source("../src/features/files/local-file-bytes.native.ts");
const nativeRecorder = source("../src/features/files/voice-recorder-panel.native.tsx");
const nativePlayer = source("../src/features/files/voice-audio-controls.native.tsx");
const fileUploadApi = source("../src/features/files/file-upload-api.ts");
const webPlayer = source("../src/features/files/voice-audio-controls.tsx");
const uploadSlot = source("../src/features/files/voice-upload-slot.tsx");
const companionDetail = source("../src/features/discovery/companion-detail-screen.tsx");
const sellerApplication = source("../src/features/seller/seller-application-screen.tsx");

test("Expo 57 音频、文件选择和文件系统依赖固定在兼容版本，并关闭后台音频", () => {
  assert.equal(packageJson.dependencies["expo-audio"], "~57.0.4");
  assert.equal(packageJson.dependencies["expo-document-picker"], "~57.0.1");
  assert.equal(packageJson.dependencies["expo-file-system"], "~57.0.5");
  assert.match(appConfig, /"expo-audio"[\s\S]*recordAudioAndroid: true[\s\S]*enableBackgroundRecording: false[\s\S]*enableBackgroundPlayback: false/u);
});

test("原生文件选择仅接受 AAC、M4A、MP3 并复制到应用缓存", () => {
  assert.match(nativeSelection, /DocumentPicker\.getDocumentAsync/u);
  assert.match(nativeSelection, /VOICE_DOCUMENT_MIME_TYPES/u);
  assert.match(nativeSelection, /copyToCacheDirectory: true/u);
  assert.match(nativeSelection, /multiple: false/u);
  assert.match(nativeSelection, /isOwnedCacheUri\(uri, Paths\.cache\.uri\)/u);
  assert.match(nativeSelection, /file\.delete\(\)/u);
});

test("原生二进制读取使用 File.bytes 并在读取前后响应取消", () => {
  assert.match(nativeBytes, /new File\(uri\)\.bytes\(\)/u);
  assert.equal((nativeBytes.match(/signal\.aborted/gu) ?? []).length >= 2, true);
  assert.doesNotMatch(nativeBytes, /fetch\(/u);
});

test("原生 SHA-256 向 Expo Crypto 传递具有 ArrayBuffer backing 的 TypedArray", () => {
  assert.match(fileUploadApi, /Crypto\.digest\(Crypto\.CryptoDigestAlgorithm\.SHA256, new Uint8Array\(copyToArrayBuffer\(bytes\)\)\)/u);
});

test("权限状态区分拒绝和永久拒绝，录音时长边界为 10–30 秒", () => {
  assert.equal(recordingPermissionState({ granted: true, canAskAgain: true }), "granted");
  assert.equal(recordingPermissionState({ granted: false, canAskAgain: true }), "denied");
  assert.equal(recordingPermissionState({ granted: false, canAskAgain: false }), "blocked");
  assert.match(recordingPermissionMessage("blocked"), /系统设置/u);
  assert.match(recordingPermissionMessage("denied"), /未授予/u);
  assert.match(recordingDurationMessage(9_999) ?? "", /至少/u);
  assert.equal(recordingDurationMessage(10_000), null);
  assert.equal(recordingDurationMessage(30_000), null);
  assert.match(recordingDurationMessage(30_001) ?? "", /不能超过/u);
  assert.equal(VOICE_NATIVE_AUTOSTOP_DURATION_MS, 29_000);
});

test("原生录音只接受本轮已真正开始且带文件地址的结束回调", () => {
  const current = "file:///cache/current.m4a";
  assert.equal(shouldAcceptFinishedRecording({ recordingActive: false, statusUri: current, elapsedMs: 10_000 }), false);
  assert.equal(shouldAcceptFinishedRecording({ recordingActive: true, statusUri: null, elapsedMs: 10_000 }), false);
  assert.equal(shouldAcceptFinishedRecording({ recordingActive: true, statusUri: current, elapsedMs: 999 }), false);
  assert.equal(shouldAcceptFinishedRecording({ recordingActive: true, statusUri: current, elapsedMs: 1_000 }), true);
});

test("原生录音使用缓存 M4A/AAC、支持暂停继续，并在取消和卸载时清理", () => {
  assert.match(nativeRecorder, /RecordingPresets\.HIGH_QUALITY/u);
  assert.match(nativeRecorder, /directory: "cache"/u);
  assert.match(nativeRecorder, /mimeType: "audio\/mp4"/u);
  assert.match(nativeRecorder, /requestRecordingPermissionsAsync/u);
  assert.match(nativeRecorder, /current\.granted \? current : await requestRecordingPermissionsAsync\(\)/u);
  assert.doesNotMatch(nativeRecorder, /current\.granted \|\| !current\.canAskAgain/u);
  assert.match(nativeRecorder, /Linking\.openSettings/u);
  assert.match(nativeRecorder, /forDuration: VOICE_NATIVE_AUTOSTOP_DURATION_MS \/ 1_000/u);
  assert.match(nativeRecorder, /VOICE_NATIVE_AUTOSTOP_DURATION_MS - state\.durationMillis/u);
  assert.match(nativeRecorder, /elapsedMs: Date\.now\(\) - recordingStartedAt\.current/u);
  assert.match(nativeRecorder, /shouldAcceptFinishedRecording/u);
  assert.match(nativeRecorder, /recorder\.pause\(\)/u);
  assert.match(nativeRecorder, /取消并清理本次录音/u);
  assert.match(nativeRecorder, /emittedUri\.current !== uri[\s\S]*file\.delete\(\)/u);
  assert.match(nativeRecorder, /allowsBackgroundRecording: false/u);
  assert.match(nativeRecorder, /useAudioRecorder owns the native shared object's release on unmount/u);
  const unmountCleanup = nativeRecorder.match(/useEffect\(\(\) => \(\) => \{([\s\S]*?)\n {2}\}, \[\]\);/u)?.[1] ?? "";
  assert.doesNotMatch(unmountCleanup, /recorder\.(?:stop|pause|record|prepareToRecordAsync|getStatus|release)/u);
});

test("原生播放器支持播放、暂停和停止，并显式管理原生共享对象", () => {
  assert.match(nativePlayer, /createAudioPlayer\(/u);
  assert.match(nativePlayer, /player\.addListener\("playbackStatusUpdate"/u);
  assert.match(nativePlayer, /player\.play\(\)/u);
  assert.match(nativePlayer, /player\.pause\(\)/u);
  assert.match(nativePlayer, /player\.seekTo\(0\)/u);
  assert.match(nativePlayer, /shouldPlayInBackground: false/u);
});

test("原生播放器切换 URL 时重建实例，并先移除订阅再释放旧实例", () => {
  assert.match(nativePlayer, /<VoiceAudioPlayer key=\{url\} url=\{url\}/u);
  assert.match(nativePlayer, /useEffect\(\(\) => \{[\s\S]*createAudioPlayer\([\s\S]*\}, \[label, url\]\)/u);
  assert.match(nativePlayer, /subscription\.remove\(\);[\s\S]*player\.pause\(\);[\s\S]*player\.release\(\)/u);
  assert.match(nativePlayer, /playerRef\.current === player/u);
});

test("原生播放器状态订阅只有一个，并且异常不写入日志", () => {
  assert.equal((nativePlayer.match(/addListener\("playbackStatusUpdate"/gu) ?? []).length, 1);
  assert.match(nativePlayer, /setStatus\(nextStatus\)/u);
  assert.doesNotMatch(nativePlayer, /player\.currentStatus/u);
  assert.doesNotMatch(nativePlayer, /useAudioPlayer|useAudioPlayerStatus|console\.|eslint-disable/u);
});

test("Web 文件选择和 audio 控件能力保持存在", () => {
  assert.match(webSelection, /document\.createElement\("input"\)/u);
  assert.match(webSelection, /\.aac,\.m4a,\.mp3/u);
  assert.match(webSelection, /URL\.createObjectURL/u);
  assert.match(webPlayer, /createElement\("audio"/u);
  assert.match(webPlayer, /controlsList: "nodownload"/u);
});

test("上传槽在替换、取消、失败和离开页面时释放临时文件，确认失败只暴露 complete 重试", () => {
  assert.match(uploadSlot, /await releaseOwnedTemporary\(\)/u);
  assert.match(uploadSlot, /finally \{[\s\S]*await releaseOwnedTemporary\(\)/u);
  assert.match(uploadSlot, /task\.current\?\.abort\(\)/u);
  assert.match(uploadSlot, /previewRequest\.current\?\.abort\(\)/u);
  assert.match(uploadSlot, /disposeOwnedVoiceTemporaryFile/u);
  assert.match(uploadSlot, /只重试服务端确认/u);
  assert.match(uploadSlot, /客户端时长只用于提前提示/u);
  assert.match(uploadSlot, /onMessage=\{\(copy\) => setMessage\(copy\)\}/u);
  assert.doesNotMatch(uploadSlot, /onMessage=\{[\s\S]{0,160}setStage/u);
  assert.doesNotMatch(uploadSlot, /AsyncStorage|localStorage|sessionStorage|console\.|bucket|object_key/u);
});

test("短时受控播放不区分 Web/原生且地址到期后从内存清除", () => {
  assert.match(companionDetail, /<VoiceAudioControls/u);
  assert.match(companionDetail, /shouldExpireAccess/u);
  assert.match(companionDetail, /setVoiceAccess\(null\)/u);
  assert.match(companionDetail, /voiceRequest\.current\?\.abort\(\)/u);
  assert.doesNotMatch(companionDetail, /Platform\.OS|createElement\("audio"|AsyncStorage|localStorage|sessionStorage/u);
  assert.equal(shouldExpireAccess(undefined, 1_000), null);
  assert.equal(shouldExpireAccess("invalid", 1_000), 0);
  assert.equal(shouldExpireAccess("1970-01-01T00:00:02.000Z", 1_000), 1_000);
});

test("陪玩主页按原 UI 提供方形封面、经营数据、双列服务和底部操作", () => {
  assert.match(companionDetail, /aspectRatio: 1/u);
  for (const label of ["综合评分", "完成订单", "在售服务", "被收藏", "声音名片", "全部服务", "买家评价"]) assert.match(companionDetail, new RegExp(label, "u"));
  assert.match(companionDetail, /item\.services\.map[\s\S]*ServiceCard[\s\S]*grid/u);
  assert.match(companionDetail, /appearance="companion-action"/u);
  assert.match(companionDetail, /咨询陪玩/u);
  assert.match(companionDetail, /item\.seller_nickname/u);
  assert.doesNotMatch(companionDetail, /Kirito|熊崽玩家 K/u);
});

test("只有应用创建的缓存 URI 才允许删除，陪玩申请页已接入声音名片", () => {
  assert.equal(isOwnedCacheUri("file:///cache/voice.m4a", "file:///cache/"), true);
  assert.equal(isOwnedCacheUri("file:///documents/voice.m4a", "file:///cache/"), false);
  assert.equal(isOwnedCacheUri("file:///cache/", "file:///cache/"), false);
  assert.match(sellerApplication, /<VoiceUploadSlot currentFileId=\{saved\.voice_file_id\} onReady=\{bindVoice\}/u);
  assert.match(sellerApplication, /voice_duration_ms: file\.duration_ms/u);
});
