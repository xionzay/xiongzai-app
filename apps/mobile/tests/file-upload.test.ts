import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ApiClientError } from "../src/api/api-error";
import { approvedAvatarProfileInput, AvatarConfirmationError, AvatarUploadError, avatarUploadErrorMessage, bytesToHex, ensureApprovedImage, findAvatarPolicy, findImagePolicy, resolveImageMimeType, uploadImage, uploadUserAvatar, validateAvatarBytes, validateImageBytes, type AvatarUploadDependencies, type AvatarUploadStage, type ImageUploadStage } from "../src/features/files/file-upload-domain";
import { putPresignedUpload } from "../src/features/files/presigned-upload";
import { ensureApprovedVoice, findVoicePolicy, resolveVoiceMimeType, uploadVoiceSample, validateVoiceAsset, VoiceConfirmationError, voiceRecoveryAction, type VoiceUploadStage } from "../src/features/files/voice-upload-domain";
import type { FileApiView, FilePolicyApiView, FileUploadRequestApiView, Viewer } from "../src/types/api";

const policy: FilePolicyApiView = {
  file_type: "USER_AVATAR",
  mime_types: ["image/jpeg", "image/png", "image/webp"],
  maximum_bytes: 5 * 1_024 * 1_024,
  visibility: "PUBLIC",
  minimum_duration_ms: null,
  maximum_duration_ms: null
};

const imagePolicies: FilePolicyApiView[] = [
  { ...policy, file_type: "SELLER_AVATAR" },
  { ...policy, file_type: "SELLER_COVER", maximum_bytes: 10 * 1_024 * 1_024 },
  { ...policy, file_type: "PRODUCT_IMAGE", maximum_bytes: 10 * 1_024 * 1_024 },
  { ...policy, file_type: "COMPLAINT_EVIDENCE", maximum_bytes: 10 * 1_024 * 1_024, visibility: "PRIVATE" }
];

const pendingFile: FileApiView = {
  id: "0198d167-b0d4-7000-8000-000000000001",
  owner_user_id: "0198d167-b0d4-7000-8000-000000000002",
  file_type: "USER_AVATAR",
  mime_type: "image/png",
  size_bytes: 4,
  width: 320,
  height: 320,
  duration_ms: null,
  upload_status: "VERIFIED",
  moderation_status: "PENDING",
  visibility: "PUBLIC",
  created_at: "2026-08-21T00:00:00.000Z",
  updated_at: "2026-08-21T00:00:00.000Z"
};

const session: FileUploadRequestApiView = {
  file: { ...pendingFile, upload_status: "PENDING", width: null, height: null },
  upload: {
    url: "http://127.0.0.1:9000/upload-placeholder",
    method: "PUT",
    headers: { "content-type": "image/png", "x-amz-meta-sha256": "a".repeat(64), "x-amz-meta-size-bytes": "4" },
    expires_at: "2099-08-21T00:00:00.000Z"
  }
};

const voicePolicy: FilePolicyApiView = {
  file_type: "VOICE_SAMPLE",
  mime_types: ["audio/aac", "audio/mp4", "audio/mpeg"],
  maximum_bytes: 10 * 1_024 * 1_024,
  visibility: "SIGNED",
  minimum_duration_ms: 10_000,
  maximum_duration_ms: 30_000
};

const pendingVoice: FileApiView = {
  ...pendingFile,
  id: "0198d167-b0d4-7000-8000-000000000011",
  file_type: "VOICE_SAMPLE",
  mime_type: "audio/mpeg",
  width: null,
  height: null,
  duration_ms: 15_020,
  visibility: "SIGNED"
};

const voiceSession: FileUploadRequestApiView = {
  file: { ...pendingVoice, upload_status: "PENDING", duration_ms: null },
  upload: {
    url: "http://127.0.0.1:9000/voice-upload-placeholder",
    method: "PUT",
    headers: { "content-type": "audio/mpeg", "x-amz-meta-sha256": "c".repeat(64), "x-amz-meta-size-bytes": "4" },
    expires_at: "2099-08-21T00:00:00.000Z"
  }
};

test("头像策略、MIME 和大小只接受服务端允许值", () => {
  assert.equal(findAvatarPolicy([policy]).file_type, "USER_AVATAR");
  assert.equal(resolveImageMimeType({ uri: "file:///avatar.JPEG", fileName: null, mimeType: null }), "image/jpeg");
  assert.equal(resolveImageMimeType({ uri: "content://picked", fileName: "avatar.webp", mimeType: undefined }), "image/webp");
  assert.throws(() => resolveImageMimeType({ uri: "file:///avatar.gif" }), (error) => error instanceof AvatarUploadError && error.code === "FILE_LOCAL_MIME_UNKNOWN");
  assert.doesNotThrow(() => validateAvatarBytes(policy, "image/png", 1024));
  assert.throws(() => validateAvatarBytes(policy, "image/png", 0), (error) => error instanceof AvatarUploadError && error.code === "FILE_LOCAL_EMPTY");
  assert.throws(() => validateAvatarBytes(policy, "image/gif", 1024), (error) => error instanceof AvatarUploadError && error.code === "FILE_MIME_NOT_ALLOWED");
  assert.throws(() => validateAvatarBytes(policy, "image/png", policy.maximum_bytes + 1), (error) => error instanceof AvatarUploadError && error.code === "FILE_SIZE_NOT_ALLOWED");
  assert.throws(() => findAvatarPolicy([]), (error) => error instanceof AvatarUploadError && error.code === "FILE_POLICY_UNAVAILABLE");
});

test("四种阶段 5 图片用途严格采用服务端类型、可见性和大小策略", () => {
  assert.equal(findImagePolicy(imagePolicies, "SELLER_AVATAR").maximum_bytes, 5 * 1_024 * 1_024);
  assert.equal(findImagePolicy(imagePolicies, "SELLER_COVER").visibility, "PUBLIC");
  assert.equal(findImagePolicy(imagePolicies, "PRODUCT_IMAGE").maximum_bytes, 10 * 1_024 * 1_024);
  assert.equal(findImagePolicy(imagePolicies, "COMPLAINT_EVIDENCE").visibility, "PRIVATE");
  assert.doesNotThrow(() => validateImageBytes(imagePolicies[1]!, "image/webp", 10 * 1_024 * 1_024, "陪玩封面"));
  assert.throws(() => validateImageBytes(imagePolicies[0]!, "image/png", 5 * 1_024 * 1_024 + 1, "陪玩头像"), /不能超过 5 MB/u);
  assert.throws(() => validateImageBytes(imagePolicies[2]!, "image/gif", 1024, "服务图片"), (error) => error instanceof AvatarUploadError && error.code === "FILE_MIME_NOT_ALLOWED");
  assert.throws(() => ensureApprovedImage({ ...pendingFile, file_type: "COMPLAINT_EVIDENCE", visibility: "PUBLIC", moderation_status: "APPROVED" }, "COMPLAINT_EVIDENCE", "PRIVATE"), (error) => error instanceof AvatarUploadError && error.code === "FILE_PURPOSE_MISMATCH");
});

test("通用图片上传器保留具体用途且只执行一次 PUT 与 complete", async () => {
  const events: string[] = [];
  let putCount = 0;
  const stages: ImageUploadStage[] = [];
  const productSession = { ...session, file: { ...session.file, file_type: "PRODUCT_IMAGE" } };
  const result = await uploadImage({
    fileType: "PRODUCT_IMAGE",
    asset: { uri: "file:///service.webp", width: 1200, height: 900, mimeType: "image/webp" },
    policies: imagePolicies,
    signal: new AbortController().signal,
    label: "服务图片",
    onStage: (stage) => stages.push(stage)
  }, {
    request: async <T>(path: string, options?: RequestInit) => {
      events.push(path);
      if (path === "/files/uploads") {
        assert.deepEqual(JSON.parse(String(options?.body)), { file_type: "PRODUCT_IMAGE", mime_type: "image/webp", size_bytes: 4, sha256: "b".repeat(64) });
        return productSession as T;
      }
      return { ...pendingFile, file_type: "PRODUCT_IMAGE" } as T;
    },
    readBytes: async () => Uint8Array.from([5, 6, 7, 8]),
    sha256: async () => "b".repeat(64),
    put: async () => { putCount += 1; }
  });
  assert.equal(result.file_type, "PRODUCT_IMAGE");
  assert.equal(putCount, 1);
  assert.deepEqual(events, ["/files/uploads", `/files/${pendingFile.id}/complete`]);
  assert.deepEqual(stages, ["reading", "hashing", "requesting", "uploading", "completing", "pending_review"]);
});

test("SHA-256 二进制摘要转换为固定小写十六进制", () => {
  assert.equal(bytesToHex(Uint8Array.from([0, 1, 15, 16, 255]).buffer), "00010f10ff");
  const digest = createHash("sha256").update(Uint8Array.from([1, 2, 3, 4])).digest("hex");
  assert.equal(digest, "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a");
  assert.match(digest, /^[a-f0-9]{64}$/u);
});

test("头像完整流程按读取、哈希、申请、PUT、确认和待审顺序执行", async () => {
  const events: string[] = [];
  const requestBodies: unknown[] = [];
  const dependencies: AvatarUploadDependencies = {
    request: async <T>(path: string, options?: RequestInit & { retryAfterRefresh?: boolean }) => {
      events.push(path);
      if (options?.body) requestBodies.push(JSON.parse(String(options.body)));
      return (path === "/files/uploads" ? session : pendingFile) as T;
    },
    readBytes: async () => { events.push("read"); return Uint8Array.from([1, 2, 3, 4]); },
    sha256: async () => { events.push("hash"); return "a".repeat(64); },
    put: async (upload, bytes) => {
      events.push("put");
      assert.equal(upload, session.upload);
      assert.deepEqual(Array.from(bytes), [1, 2, 3, 4]);
    }
  };
  const stages: AvatarUploadStage[] = [];
  const result = await uploadUserAvatar({ asset: { uri: "file:///avatar.png", width: 320, height: 320, mimeType: "image/png" }, policies: [policy], signal: new AbortController().signal, onStage: (stage) => stages.push(stage) }, dependencies);
  assert.equal(result.moderation_status, "PENDING");
  assert.deepEqual(events, ["read", "hash", "/files/uploads", "put", `/files/${pendingFile.id}/complete`]);
  assert.deepEqual(stages, ["reading", "hashing", "requesting", "uploading", "confirming", "pending_review"]);
  assert.deepEqual(requestBodies, [{ file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: 4, sha256: "a".repeat(64) }]);
});

test("预签名 PUT 只使用服务端 URL 与请求头，不添加 Bearer", async () => {
  let called = 0;
  await putPresignedUpload(session.upload, Uint8Array.from([1, 2, 3, 4]), new AbortController().signal, async (input, init) => {
    called += 1;
    assert.equal(input, session.upload.url);
    assert.equal(init?.method, "PUT");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), null);
    assert.deepEqual(Object.fromEntries(headers.entries()), session.upload.headers);
    assert.deepEqual(Array.from(new Uint8Array(await new Response(init?.body).arrayBuffer())), [1, 2, 3, 4]);
    return new Response(null, { status: 200 });
  });
  assert.equal(called, 1);
});

test("PUT 凭证过期、拒绝和网络失败使用不同错误码", async () => {
  let called = false;
  await assert.rejects(putPresignedUpload({ ...session.upload, expires_at: "2020-01-01T00:00:00.000Z" }, new Uint8Array([1]), new AbortController().signal, async () => { called = true; return new Response(); }), (error) => error instanceof AvatarUploadError && error.code === "FILE_UPLOAD_URL_EXPIRED");
  assert.equal(called, false);
  await assert.rejects(putPresignedUpload(session.upload, new Uint8Array([1]), new AbortController().signal, async () => new Response(null, { status: 403 })), (error) => error instanceof AvatarUploadError && error.code === "FILE_UPLOAD_URL_EXPIRED");
  await assert.rejects(putPresignedUpload(session.upload, new Uint8Array([1]), new AbortController().signal, async () => { throw new TypeError("offline"); }), (error) => error instanceof AvatarUploadError && error.code === "FILE_UPLOAD_PUT_FAILED");
});

test("PUT 失败时删除尚未成功直传的待上传记录", async () => {
  const paths: string[] = [];
  const dependencies: AvatarUploadDependencies = {
    request: async <T>(path: string) => {
      paths.push(path);
      if (path === "/files/uploads") return session as T;
      return { deleted: true } as T;
    },
    readBytes: async () => Uint8Array.from([1, 2, 3, 4]),
    sha256: async () => "a".repeat(64),
    put: async () => { throw new AvatarUploadError("FILE_UPLOAD_PUT_FAILED", "put failed"); }
  };
  await assert.rejects(uploadUserAvatar({ asset: { uri: "file:///avatar.png", width: 320, height: 320, mimeType: "image/png" }, policies: [policy], signal: new AbortController().signal, onStage: () => undefined }, dependencies), (error) => error instanceof AvatarUploadError && error.code === "FILE_UPLOAD_PUT_FAILED");
  assert.deepEqual(paths, ["/files/uploads", `/files/${pendingFile.id}`]);
});

test("PUT 成功后确认暂时失败会保留文件并且后续只重试 complete", async () => {
  const paths: string[] = [];
  let putCount = 0;
  let completeCount = 0;
  const dependencies: AvatarUploadDependencies = {
    request: async <T>(path: string) => {
      paths.push(path);
      if (path === "/files/uploads") return session as T;
      if (path.endsWith("/complete") && completeCount++ === 0) throw new ApiClientError("HTTP_ERROR", "temporary", 503);
      return pendingFile as T;
    },
    readBytes: async () => Uint8Array.from([1, 2, 3, 4]),
    sha256: async () => "a".repeat(64),
    put: async () => { putCount += 1; }
  };
  let retained: AvatarConfirmationError | null = null;
  await assert.rejects(uploadUserAvatar({ asset: { uri: "file:///avatar.png", width: 320, height: 320, mimeType: "image/png" }, policies: [policy], signal: new AbortController().signal, onStage: () => undefined }, dependencies), (error) => {
    retained = error as AvatarConfirmationError;
    return error instanceof AvatarConfirmationError && error.retryable && error.file.id === pendingFile.id;
  });
  assert.equal(putCount, 1);
  assert.equal(paths.includes(`/files/${pendingFile.id}`), false);
  const completed = await dependencies.request<FileApiView>(`/files/${retained!.file.id}/complete`, { method: "POST" });
  assert.equal(completed.upload_status, "VERIFIED");
  assert.equal(putCount, 1);
  assert.equal(completeCount, 2);
});

test("服务端确认校验失败不会自动重复 PUT 或删除已上传对象", async () => {
  const paths: string[] = [];
  let putCount = 0;
  const dependencies: AvatarUploadDependencies = {
    request: async <T>(path: string) => {
      paths.push(path);
      if (path === "/files/uploads") return session as T;
      throw new ApiClientError("FILE_HASH_MISMATCH", "hash mismatch", 400);
    },
    readBytes: async () => Uint8Array.from([1, 2, 3, 4]),
    sha256: async () => "a".repeat(64),
    put: async () => { putCount += 1; }
  };
  await assert.rejects(uploadUserAvatar({ asset: { uri: "file:///avatar.png", width: 320, height: 320, mimeType: "image/png" }, policies: [policy], signal: new AbortController().signal, onStage: () => undefined }, dependencies), (error) => error instanceof AvatarConfirmationError && !error.retryable);
  assert.equal(putCount, 1);
  assert.deepEqual(paths, ["/files/uploads", `/files/${pendingFile.id}/complete`]);
});

test("用户取消读取时不申请上传凭证", async () => {
  const controller = new AbortController();
  controller.abort();
  let requested = false;
  const dependencies: AvatarUploadDependencies = {
    request: async <T>() => { requested = true; return session as T; },
    readBytes: async () => { throw new Error("aborted"); },
    sha256: async () => "a".repeat(64),
    put: async () => undefined
  };
  await assert.rejects(uploadUserAvatar({ asset: { uri: "file:///avatar.png", width: 320, height: 320, mimeType: "image/png" }, policies: [policy], signal: controller.signal, onStage: () => undefined }, dependencies), (error) => error instanceof AvatarUploadError && error.code === "FILE_UPLOAD_CANCELLED");
  assert.equal(requested, false);
});

test("只有 VERIFIED + APPROVED 文件才产生使用最新双版本的资料绑定输入", () => {
  const viewer: Viewer = { id: "user-1", phone_mask: "135****0001", status: "NORMAL", profile_initialized: true, version: 9, profile: { nickname: "熊崽", avatar_file_id: null, bio: "一起开黑", public_user_no: "XZ10001", version: 7 }, identity_verification: null };
  assert.throws(() => approvedAvatarProfileInput(pendingFile, viewer), (error) => error instanceof AvatarUploadError && error.code === "FILE_MODERATION_PENDING");
  assert.throws(() => approvedAvatarProfileInput({ ...pendingFile, moderation_status: "REJECTED" }, viewer), (error) => error instanceof AvatarUploadError && error.code === "FILE_MODERATION_REJECTED");
  assert.deepEqual(approvedAvatarProfileInput({ ...pendingFile, moderation_status: "APPROVED" }, viewer), { nickname: "熊崽", bio: "一起开黑", avatarFileId: pendingFile.id, profileVersion: 7, userVersion: 9 });
});

test("错误文案区分凭证过期、元数据校验、并发冲突和网络不可达", () => {
  assert.match(avatarUploadErrorMessage(new ApiClientError("FILE_UPLOAD_EXPIRED", "expired", 410)), /凭证已过期/u);
  assert.match(avatarUploadErrorMessage(new ApiClientError("FILE_SIZE_MISMATCH", "mismatch", 400)), /服务端文件校验未通过/u);
  assert.match(avatarUploadErrorMessage(new ApiClientError("RESOURCE_VERSION_CONFLICT", "conflict", 409)), /其他设备/u);
  assert.match(avatarUploadErrorMessage(new TypeError("offline")), /无法连接文件服务/u);
});

test("声音名片严格采用服务端 MIME、10 MiB 和 10–30 秒策略", () => {
  assert.equal(findVoicePolicy([voicePolicy]).visibility, "SIGNED");
  assert.equal(resolveVoiceMimeType({ uri: "file:///voice.aac" }), "audio/aac");
  assert.equal(resolveVoiceMimeType({ uri: "file:///voice.m4a", mimeType: "audio/x-m4a" }), "audio/mp4");
  assert.equal(resolveVoiceMimeType({ uri: "file:///voice.m4a", fileName: "voice.m4a", mimeType: "audio/mpeg" }), "audio/mp4");
  assert.equal(resolveVoiceMimeType({ uri: "file:///voice.mp3", fileName: "voice.mp3", mimeType: "audio/mp4" }), "audio/mpeg");
  assert.equal(resolveVoiceMimeType({ uri: "file:///voice.MP3" }), "audio/mpeg");
  assert.doesNotThrow(() => validateVoiceAsset(voicePolicy, "audio/mpeg", voicePolicy.maximum_bytes, 10_000));
  assert.doesNotThrow(() => validateVoiceAsset(voicePolicy, "audio/mp4", 1, 30_000));
  assert.throws(() => validateVoiceAsset(voicePolicy, "video/mp4", 1_024, 15_000), (error) => error instanceof AvatarUploadError && error.code === "FILE_MIME_NOT_ALLOWED");
  assert.throws(() => validateVoiceAsset(voicePolicy, "audio/mpeg", voicePolicy.maximum_bytes + 1, 15_000), (error) => error instanceof AvatarUploadError && error.code === "FILE_SIZE_NOT_ALLOWED");
  assert.throws(() => validateVoiceAsset(voicePolicy, "audio/mpeg", 1_024, 9_999), (error) => error instanceof AvatarUploadError && error.code === "FILE_DURATION_NOT_ALLOWED");
  assert.throws(() => validateVoiceAsset(voicePolicy, "audio/mpeg", 1_024, 30_001), (error) => error instanceof AvatarUploadError && error.code === "FILE_DURATION_NOT_ALLOWED");
});

test("声音名片只执行一次 PUT 与 complete，并保留 VOICE_SAMPLE 用途", async () => {
  const paths: string[] = [];
  const stages: VoiceUploadStage[] = [];
  let putCount = 0;
  const result = await uploadVoiceSample({
    asset: { uri: "file:///voice.mp3", mimeType: "audio/mpeg", durationMs: 15_000 },
    policies: [voicePolicy],
    signal: new AbortController().signal,
    onStage: (stage) => stages.push(stage)
  }, {
    request: async <T>(path: string, options?: RequestInit) => {
      paths.push(path);
      if (path === "/files/uploads") {
        assert.deepEqual(JSON.parse(String(options?.body)), { file_type: "VOICE_SAMPLE", mime_type: "audio/mpeg", size_bytes: 4, sha256: "c".repeat(64) });
        return voiceSession as T;
      }
      return pendingVoice as T;
    },
    readBytes: async () => Uint8Array.from([1, 2, 3, 4]),
    sha256: async () => "c".repeat(64),
    put: async () => { putCount += 1; }
  });
  assert.equal(result.file_type, "VOICE_SAMPLE");
  assert.equal(putCount, 1);
  assert.deepEqual(paths, ["/files/uploads", `/files/${pendingVoice.id}/complete`]);
  assert.deepEqual(stages, ["reading", "hashing", "requesting", "uploading", "completing", "pending_review"]);
});

test("声音名片 PUT 成功后确认失败只允许重试 complete", async () => {
  const paths: string[] = [];
  let putCount = 0;
  let completeCount = 0;
  let retained: VoiceConfirmationError | null = null;
  const dependencies = {
    request: async <T>(path: string) => {
      paths.push(path);
      if (path === "/files/uploads") return voiceSession as T;
      if (path.endsWith("/complete") && completeCount++ === 0) throw new ApiClientError("HTTP_ERROR", "temporary", 503);
      return pendingVoice as T;
    },
    readBytes: async () => Uint8Array.from([1, 2, 3, 4]),
    sha256: async () => "c".repeat(64),
    put: async () => { putCount += 1; }
  };
  await assert.rejects(uploadVoiceSample({ asset: { uri: "file:///voice.mp3", durationMs: 15_000 }, policies: [voicePolicy], signal: new AbortController().signal, onStage: () => undefined }, dependencies), (error) => {
    retained = error as VoiceConfirmationError;
    return error instanceof VoiceConfirmationError && error.retryable && error.file.id === pendingVoice.id;
  });
  assert.equal(putCount, 1);
  assert.equal(paths.includes(`/files/${pendingVoice.id}`), false);
  await dependencies.request<FileApiView>(`/files/${retained!.file.id}/complete`);
  assert.equal(putCount, 1);
  assert.equal(completeCount, 2);
});

test("声音名片上传取消后不继续申请上传会话", async () => {
  const controller = new AbortController();
  let requested = false;
  await assert.rejects(uploadVoiceSample({ asset: { uri: "file:///voice.mp3", durationMs: 15_000 }, policies: [voicePolicy], signal: controller.signal, onStage: (stage) => { if (stage === "hashing") controller.abort(); } }, {
    request: async <T>() => { requested = true; return voiceSession as T; },
    readBytes: async () => Uint8Array.from([1, 2, 3, 4]),
    sha256: async () => "c".repeat(64),
    put: async () => undefined
  }), (error) => error instanceof AvatarUploadError && error.code === "FILE_UPLOAD_CANCELLED");
  assert.equal(requested, false);
});

test("声音名片恢复状态不会复用过期 PUT，只有审核通过后才绑定", () => {
  assert.equal(voiceRecoveryAction({ upload_status: "PENDING", moderation_status: "PENDING" }), "reselect");
  assert.equal(voiceRecoveryAction({ upload_status: "FAILED", moderation_status: "PENDING" }), "reselect");
  assert.equal(voiceRecoveryAction({ upload_status: "UPLOADED", moderation_status: "PENDING" }), "complete");
  assert.equal(voiceRecoveryAction({ upload_status: "VERIFIED", moderation_status: "PENDING" }), "wait");
  assert.equal(voiceRecoveryAction({ upload_status: "VERIFIED", moderation_status: "APPROVED" }), "bind");
  assert.equal(voiceRecoveryAction({ upload_status: "VERIFIED", moderation_status: "REJECTED" }), "replace");
  assert.equal(voiceRecoveryAction({ upload_status: "VERIFIED", moderation_status: "FLAGGED" }), "replace");
  assert.doesNotThrow(() => ensureApprovedVoice({ ...pendingVoice, moderation_status: "APPROVED" }));
  assert.throws(() => ensureApprovedVoice(pendingVoice), (error) => error instanceof AvatarUploadError && error.code === "FILE_MODERATION_PENDING");
  assert.throws(() => ensureApprovedVoice({ ...pendingVoice, moderation_status: "APPROVED", visibility: "PUBLIC" }), (error) => error instanceof AvatarUploadError && error.code === "FILE_PURPOSE_MISMATCH");
  assert.throws(() => ensureApprovedVoice({ ...pendingVoice, moderation_status: "APPROVED", duration_ms: 30_001 }), (error) => error instanceof AvatarUploadError && error.code === "FILE_DURATION_NOT_ALLOWED");
});
