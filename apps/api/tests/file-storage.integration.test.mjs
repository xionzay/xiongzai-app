import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
import { after, before, test } from "node:test";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, FileLifecycleService, FileStorageService, InMemoryPreviewConcurrencyLimiter, loadApiConfig, MinioStorageProvider } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const realMinioEnabled = enabled && ["FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID", "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET"].every((key) => Boolean(process.env[key]));
const schemaName = `xiongzai_files_${randomUUID().replaceAll("-", "")}`;
const objects = new Map();
let latestUpload;
let latestCopy;
let migrationClient;
let database;
let app;
let user;
let otherUser;
let admin;
let readOnlyAdmin;
let noFilePermissionAdmin;
let noMfaAdmin;
let firstApprovedFileId;
const previewLimiter = new InMemoryPreviewConcurrencyLimiter(4);

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "file-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "file-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "file-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "file-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "file-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "file-pii-hmac-key-at-least-32-bytes-long",
  AUTH_HMAC_KEY: "file-auth-hmac-key-at-least-32-bytes-long", SMS_PROVIDER_MODE: "development", SMS_DEVELOPMENT_CODE: "246810",
  FILE_STORAGE_PROVIDER: "injected", FILE_PUBLIC_BUCKET: "test-public-media", FILE_PRIVATE_BUCKET: "test-private-media", FILE_QUARANTINE_BUCKET: "test-quarantine-media",
  PUBLIC_ASSET_BASE_URL: "https://assets.test", FILE_PUBLIC_ASSET_PATH_MODE: "key-only",
});

const storage = {
  async createUploadRequest(input) { latestUpload = input; return { url: `https://upload.test/${input.bucket}/${input.objectKey}`, method: "PUT", headers: { "content-type": input.contentType, "x-amz-meta-sha256": input.sha256, "x-amz-meta-size-bytes": String(input.sizeBytes) }, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000) }; },
  async headObject(input) { const object = objects.get(`${input.bucket}/${input.objectKey}`); if (!object) { const error = new Error("not uploaded"); error.code = "FILE_OBJECT_NOT_FOUND"; error.statusCode = 409; throw error; } return { contentType: object.contentType, sizeBytes: object.sizeBytes, metadata: object.metadata }; },
  async readObject(input) { const object = objects.get(`${input.bucket}/${input.objectKey}`); if (!object) { const error = new Error("not uploaded"); error.code = "FILE_OBJECT_NOT_FOUND"; error.statusCode = 409; throw error; } return object; },
  async readObjectStream(input) {
    const object = objects.get(`${input.bucket}/${input.objectKey}`);
    if (!object) { const error = new Error("not uploaded"); error.code = "FILE_OBJECT_NOT_FOUND"; error.statusCode = 409; throw error; }
    const range = input.range ?? null;
    const body = range ? object.body.slice(range.start, range.end + 1) : object.body;
    return { body: Readable.from([body]), contentType: object.contentType, contentLength: body.byteLength, totalSize: object.sizeBytes, range, metadata: object.metadata };
  },
  async createDownloadUrl(input) { return { url: `https://download.test/${input.bucket}/${input.objectKey}?signed=1`, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000) }; },
  async copyObject(input) { latestCopy = input; const object = objects.get(`${input.source.bucket}/${input.source.objectKey}`); if (!object) throw new Error("copy source missing"); objects.set(`${input.destination.bucket}/${input.destination.objectKey}`, object); },
  async deleteObject(input) { objects.delete(`${input.bucket}/${input.objectKey}`); },
  async listObjects(input) {
    const prefix = input.prefix ?? "";
    const keys = [...objects.keys()].filter((key) => key.startsWith(`${input.bucket}/`)).map((key) => key.slice(input.bucket.length + 1)).filter((key) => key.startsWith(prefix)).sort();
    const start = input.cursor ? Math.max(keys.findIndex((key) => key > input.cursor), 0) : 0;
    const page = keys.slice(start, start + input.limit);
    return { objects: page.map((objectKey) => ({ objectKey, sizeBytes: objects.get(`${input.bucket}/${objectKey}`).sizeBytes, lastModified: null })), nextCursor: start + page.length < keys.length ? page.at(-1) : null, truncated: start + page.length < keys.length };
  },
};

before(async () => {
  if (!enabled) return;
  migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  await migrationClient.query(`CREATE SCHEMA "${schemaName}"`);
  await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql");
  await runMigration("0001_core_invariants.sql");
  await runMigration("0003_admin_query_performance.sql");
  await runMigration("0004_payment_channels_voice_constraints.sql");
  await runMigration("0005_policy_acceptance_context.sql");
  await runMigration("0006_policy_version_bindings.sql"); await runMigration("0010_order_rule_versions.sql"); await runMigration("0011_service_categories.sql");
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-file-api-test", options: `-c search_path=${schemaName},public`, max: 4 });
  app = await createApiApp({ config, databaseClient: database, objectStorageProvider: storage, previewConcurrencyLimiter: previewLimiter, logger: new JsonLogger("file-api-test", () => {}) });
  user = await seedUser();
  otherUser = await seedUser();
  admin = await seedAdmin(["file.read", "file.manage", "file.review", "seller_application.read", "seller_application.review"]);
  readOnlyAdmin = await seedAdmin(["file.read"]);
  noFilePermissionAdmin = await seedAdmin([]);
  noMfaAdmin = await seedAdmin(["file.read", "file.review"], false);
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("file upload is integrity-checked, moderated, and exposed without leaking storage keys", { skip: !enabled }, async () => {
  const bytes = png(320, 180);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const policies = await app.inject({ method: "GET", url: "/api/v1/files/policies" });
  assert.equal(policies.statusCode, 200);
  assert.ok(policies.json().some((item) => item.file_type === "PRODUCT_IMAGE" && item.maximum_bytes === 10 * 1_024 * 1_024));

  const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type: "PRODUCT_IMAGE", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 });
  assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed");
  assert.equal(requested.body.includes("object_key"), false);
  assert.equal(requested.json().upload.headers["x-amz-meta-sha256"], sha256);
  assert.equal(latestUpload.bucket, "test-quarantine-media");
  assert.match(latestUpload.objectKey, /^pending\/product_image\//u);
  const fileId = requested.json().file.id;
  firstApprovedFileId = fileId;
  objects.set(`${latestUpload.bucket}/${latestUpload.objectKey}`, { body: bytes, contentType: "image/png", sizeBytes: bytes.byteLength, metadata: { sha256, "size-bytes": String(bytes.byteLength) } });

  const completed = await userRequest("POST", `/api/v1/files/${fileId}/complete`);
  assert.equal(completed.statusCode, 201, completed.body);
  assert.equal(completed.json().upload_status, "VERIFIED");
  assert.equal(completed.json().moderation_status, "PENDING");
  assert.equal(completed.json().width, 320);
  assert.equal(completed.json().height, 180);
  const hidden = await app.inject({ method: "GET", url: `/api/v1/files/${fileId}` });
  assert.equal(hidden.statusCode, 404);

  const approved = await adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "APPROVED", reason: "图片内容和安全检查通过" });
  assert.equal(approved.statusCode, 201, approved.body);
  assert.equal(latestCopy.source.bucket, "test-quarantine-media");
  assert.equal(latestCopy.destination.bucket, "test-public-media");
  assert.notEqual(latestCopy.destination.objectKey, latestUpload.objectKey);
  assert.equal(objects.has(`${latestUpload.bucket}/${latestUpload.objectKey}`), false);
  const publicFile = await app.inject({ method: "GET", url: `/api/v1/files/${fileId}` });
  assert.equal(publicFile.statusCode, 200, "public file request failed; response body suppressed");
  assert.equal(publicFile.json().content_url, `https://assets.test/${latestCopy.destination.objectKey}`);
  assert.equal(publicFile.body.includes("test-public-media"), false);
  assert.equal(publicFile.body.includes(latestUpload.objectKey), false);
  assert.equal(publicFile.body.includes(latestCopy.destination.objectKey), true);
  const wrongPurpose = await userRequest("PATCH", "/api/v1/me/profile", { nickname: "文件测试玩家", avatar_file_id: fileId, version: 0, user_version: 0 });
  assert.equal(wrongPurpose.statusCode, 400);
  assert.equal(wrongPurpose.json().code, "PROFILE_AVATAR_INVALID");
  const audit = await migrationClient.query("SELECT action, reason FROM admin_operation_logs WHERE target_id = $1", [fileId]);
  assert.deepEqual(audit.rows[0], { action: "FILE_APPROVED", reason: "图片内容和安全检查通过" });
  const safeAudit = await migrationClient.query("SELECT before_json::text AS before_json, after_json::text AS after_json FROM admin_operation_logs WHERE target_id = $1", [fileId]);
  assert.equal(/signed=|object_key|bucket|secret|access_key/iu.test(JSON.stringify(safeAudit.rows)), false);
});

test("admin file APIs enforce MFA and least-privilege RBAC", { skip: !enabled }, async () => {
  assert.equal((await adminRequestAs(readOnlyAdmin, "GET", "/admin-api/v1/files?limit=10")).statusCode, 200);
  const metadataOnly = await adminRequestAs(readOnlyAdmin, "GET", `/admin-api/v1/files/${firstApprovedFileId}/access`);
  assert.equal(metadataOnly.statusCode, 200);
  assert.equal(/signed=|https?:\/\/|object_key|bucket/iu.test(metadataOnly.body), false);
  assert.equal((await adminRequestAs(readOnlyAdmin, "GET", `/admin-api/v1/files/${firstApprovedFileId}/preview`)).statusCode, 403);
  const deniedReview = await adminRequestAs(readOnlyAdmin, "POST", `/admin-api/v1/files/${firstApprovedFileId}/moderation`, { decision: "APPROVED", reason: "不应被允许的重复审核" });
  assert.equal(deniedReview.statusCode, 403);
  assert.equal((await adminRequestAs(noFilePermissionAdmin, "GET", "/admin-api/v1/files?limit=10")).statusCode, 403);
  assert.equal((await adminRequestAs(noMfaAdmin, "GET", "/admin-api/v1/files?limit=10")).statusCode, 403);
});

test("admin can mark a verified file abnormal without pretending an external malware scan ran", { skip: !enabled }, async () => {
  const bytes = png(122, 82);
  const fileId = await createVerifiedFile("PRODUCT_IMAGE", bytes);
  const flagged = await adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "FLAGGED", reason: "人工检查发现文件结构异常，等待上线前扫描能力复核" });
  assert.equal(flagged.statusCode, 201, flagged.body);
  assert.equal(flagged.json().moderation_status, "FLAGGED");
  const audit = await migrationClient.query("SELECT action,reason,before_json,after_json FROM admin_operation_logs WHERE target_id=$1", [fileId]);
  assert.equal(audit.rows.some((row) => row.action === "FILE_FLAGGED_ABNORMAL" && row.reason.includes("人工检查")), true);
  assert.equal(/virus|malware_scan_passed|object_key|bucket|signed=/iu.test(JSON.stringify(audit.rows)), false);
  const preview = await adminRequest("GET", `/admin-api/v1/files/${fileId}/preview`);
  assert.equal(preview.statusCode, 403);
  assert.equal(preview.json().code, "FILE_PREVIEW_NOT_ALLOWED");
});

test("admin preview is same-origin binary, range-aware, audited and storage-safe", { skip: !enabled }, async () => {
  const bytes = png(120, 80);
  const fileId = await createVerifiedFile("PRODUCT_IMAGE", bytes);
  assert.equal((await app.inject({ method: "GET", url: `/admin-api/v1/files/${fileId}/preview` })).statusCode, 401);
  assert.equal((await adminRequestAs(noFilePermissionAdmin, "GET", `/admin-api/v1/files/${fileId}/preview`)).statusCode, 403);
  assert.equal((await adminRequestAs(readOnlyAdmin, "GET", `/admin-api/v1/files/${fileId}/preview`)).statusCode, 403);
  assert.equal((await adminRequestAs(noMfaAdmin, "GET", `/admin-api/v1/files/${fileId}/preview`)).statusCode, 403);
  assert.equal((await adminRequest("GET", `/admin-api/v1/files/${randomUUID()}/preview`)).statusCode, 404);

  const unverifiedFileId = randomUUID();
  await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility) VALUES ($1,$2,'test-quarantine-media',$3,'PRODUCT_IMAGE','image/png',$4,$5,'PENDING','PENDING','PUBLIC')", [unverifiedFileId, user.id, `pending/product_image/${unverifiedFileId}`, bytes.byteLength, createHash("sha256").update(bytes).digest("hex")]);
  const unverified = await adminRequest("GET", `/admin-api/v1/files/${unverifiedFileId}/preview`);
  assert.equal(unverified.statusCode, 409);
  assert.equal(unverified.json().code, "FILE_NOT_VERIFIED");

  const full = await adminRequest("GET", `/admin-api/v1/files/${fileId}/preview?object_key=ignored/private-key`);
  assert.equal(full.statusCode, 200, full.body);
  assert.equal(full.headers["content-type"], "image/png");
  assert.equal(full.headers["cache-control"], "no-store, private");
  assert.equal(full.headers["x-content-type-options"], "nosniff");
  assert.equal(full.headers["cross-origin-resource-policy"], "same-origin");
  assert.match(full.headers["content-disposition"], /^inline; filename="admin-preview\.png"$/u);
  assert.deepEqual(new Uint8Array(full.rawPayload), bytes);
  assert.equal(/signed=|object_key|bucket|private-key|https?:\/\//iu.test(full.body), false);

  const ranged = await app.inject({ method: "GET", url: `/admin-api/v1/files/${fileId}/preview`, headers: { authorization: `Bearer ${admin.token}`, range: "bytes=4-11" } });
  assert.equal(ranged.statusCode, 206, ranged.body);
  assert.equal(ranged.headers["content-range"], `bytes 4-11/${bytes.byteLength}`);
  assert.equal(ranged.headers["accept-ranges"], "bytes");
  assert.deepEqual(new Uint8Array(ranged.rawPayload), bytes.slice(4, 12));
  const invalidRange = await app.inject({ method: "GET", url: `/admin-api/v1/files/${fileId}/preview`, headers: { authorization: `Bearer ${admin.token}`, range: "bytes=999-1000" } });
  assert.equal(invalidRange.statusCode, 416);
  assert.equal(invalidRange.json().code, "FILE_PREVIEW_RANGE_INVALID");

  const originalReadObjectStream = storage.readObjectStream;
  storage.readObjectStream = async () => { throw new Error("private-bucket/internal-object-key must never escape"); };
  try {
    const unavailable = await adminRequest("GET", `/admin-api/v1/files/${fileId}/preview`);
    assert.equal(unavailable.statusCode, 500);
    assert.equal(unavailable.json().code, "INTERNAL_ERROR");
    assert.equal(/private-bucket|internal-object-key/iu.test(unavailable.body), false);
  } finally {
    storage.readObjectStream = originalReadObjectStream;
  }

  const previewAudits = await migrationClient.query("SELECT action, reason, before_json, after_json FROM admin_operation_logs WHERE target_id = $1 AND action = 'FILE_PREVIEWED' ORDER BY created_at", [fileId]);
  assert.equal(previewAudits.rows.length, 2);
  assert.equal(previewAudits.rows.every((row) => row.reason === "管理员受控文件预览"), true);
  assert.equal(/signed=|object_key|bucket|secret|access_key/iu.test(JSON.stringify(previewAudits.rows)), false);

  const rejected = await adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "REJECTED", reason: "完成预览安全状态验证" });
  assert.equal(rejected.statusCode, 201, rejected.body);
  const blocked = await adminRequest("GET", `/admin-api/v1/files/${fileId}/preview`);
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().code, "FILE_PREVIEW_NOT_ALLOWED");

  await migrationClient.query("UPDATE files SET deleted_at = now() WHERE id = $1", [fileId]);
  assert.equal((await adminRequest("GET", `/admin-api/v1/files/${fileId}/preview`)).statusCode, 404);
});

test("admin preview limiter holds four streams, rejects the fifth, and releases on success, failure and destroyed streams", { skip: !enabled }, async () => {
  const bytes = png(121, 81);
  const fileId = await createVerifiedFile("PRODUCT_IMAGE", bytes);
  const originalReadObjectStream = storage.readObjectStream;
  const held = [];
  storage.readObjectStream = async (input) => {
    const stream = new PassThrough();
    held.push(stream);
    return { body: stream, contentType: "image/png", contentLength: bytes.byteLength, totalSize: bytes.byteLength, range: input.range ?? null, metadata: {} };
  };
  try {
    const requests = Array.from({ length: 4 }, () => adminRequest("GET", `/admin-api/v1/files/${fileId}/preview`));
    await waitFor(() => held.length === 4);
    assert.equal(previewLimiter.activeCount, 4);
    const fifth = await adminRequest("GET", `/admin-api/v1/files/${fileId}/preview`);
    assert.equal(fifth.statusCode, 429, fifth.body);
    assert.equal(fifth.json().code, "FILE_PREVIEW_BUSY");
    for (const stream of held) stream.end(bytes);
    assert.equal((await Promise.all(requests)).every((response) => response.statusCode === 200), true);
    await waitFor(() => previewLimiter.activeCount === 0);

    storage.readObjectStream = async () => { throw new Error("synthetic_stream_failure"); };
    assert.equal((await adminRequest("GET", `/admin-api/v1/files/${fileId}/preview`)).statusCode, 500);
    assert.equal(previewLimiter.activeCount, 0);

    const disconnected = new PassThrough();
    storage.readObjectStream = async () => ({ body: disconnected, contentType: "image/png", contentLength: bytes.byteLength, totalSize: bytes.byteLength, range: null, metadata: {} });
    const result = await app.get(FileStorageService).previewAdminFile(admin.id, fileId, undefined, { ip: "127.0.0.1", userAgent: "preview-disconnect-test", requestId: randomUUID() });
    assert.equal(previewLimiter.activeCount, 1);
    result.body.destroy();
    await waitFor(() => previewLimiter.activeCount === 0);
  } finally {
    for (const stream of held) stream.destroy();
    storage.readObjectStream = originalReadObjectStream;
  }
});

test("owner recovery list is authenticated, scoped, filterable, paginated and storage-safe", { skip: !enabled }, async () => {
  const ownIds = [randomUUID(), randomUUID()];
  const foreignId = randomUUID();
  for (let index = 0; index < ownIds.length; index += 1) {
    await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility,created_at) VALUES ($1,$2,'secret-bucket',$3,'SELLER_COVER','image/png',1024,$4,'VERIFIED','PENDING','PUBLIC',now()-($5::text || ' seconds')::interval)", [ownIds[index], user.id, `private-key-${ownIds[index]}`, randomUUID().replaceAll("-", "").repeat(2), index]);
  }
  await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility) VALUES ($1,$2,'foreign-bucket',$3,'SELLER_COVER','image/png',1024,$4,'VERIFIED','PENDING','PUBLIC')", [foreignId, otherUser.id, `foreign-key-${foreignId}`, randomUUID().replaceAll("-", "").repeat(2)]);

  assert.equal((await app.inject({ method: "GET", url: "/api/v1/me/files" })).statusCode, 401);
  const first = await userRequest("GET", "/api/v1/me/files?file_type=SELLER_COVER&upload_status=VERIFIED&moderation_status=PENDING&limit=1");
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().items.length, 1);
  assert.ok(ownIds.includes(first.json().items[0].id));
  assert.equal(typeof first.json().next_cursor, "string");
  for (const forbidden of ["owner_user_id", "bucket", "object_key", "access", "url"]) assert.equal(forbidden in first.json().items[0], false);

  const second = await userRequest("GET", `/api/v1/me/files?file_type=SELLER_COVER&upload_status=VERIFIED&moderation_status=PENDING&limit=1&cursor=${encodeURIComponent(first.json().next_cursor)}`);
  assert.equal(second.statusCode, 200, second.body);
  assert.notEqual(second.json().items[0].id, first.json().items[0].id);
  assert.ok(ownIds.includes(second.json().items[0].id));
  assert.equal(second.body.includes(foreignId), false);
  assert.equal(second.body.includes("secret-bucket"), false);
  assert.equal(second.body.includes("private-key-"), false);

  const crossUserCursor = await userRequestAs(otherUser, "GET", `/api/v1/me/files?file_type=SELLER_COVER&upload_status=VERIFIED&moderation_status=PENDING&limit=1&cursor=${encodeURIComponent(first.json().next_cursor)}`);
  assert.equal(crossUserCursor.statusCode, 400, crossUserCursor.body);
  const attemptedOwnerOverride = await userRequestAs(otherUser, "GET", `/api/v1/me/files?owner_user_id=${user.id}&file_type=SELLER_COVER&limit=20`);
  assert.equal(attemptedOwnerOverride.statusCode, 200, attemptedOwnerOverride.body);
  assert.deepEqual(attemptedOwnerOverride.json().items.map((item) => item.id), [foreignId]);
});

test("final and concurrent moderation attempts allow exactly one success", { skip: !enabled }, async () => {
  const repeated = await adminRequest("POST", `/admin-api/v1/files/${firstApprovedFileId}/moderation`, { decision: "APPROVED", reason: "重复提交不应成功" });
  assert.equal(repeated.statusCode, 409, repeated.body);
  assert.equal(repeated.json().code, "RESOURCE_VERSION_CONFLICT");
  const auditCount = await migrationClient.query("SELECT count(*)::int AS count FROM admin_operation_logs WHERE target_id = $1", [firstApprovedFileId]);
  assert.equal(auditCount.rows[0].count, 1);

  const fileId = await createVerifiedFile("SELLER_AVATAR", png(96, 96));
  const [first, second] = await Promise.all([
    adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "APPROVED", reason: "并发审核请求一" }),
    adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "APPROVED", reason: "并发审核请求二" }),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort((a, b) => a - b), [201, 409]);
  const conflictResponse = first.statusCode === 409 ? first : second;
  assert.equal(conflictResponse.json().code, "RESOURCE_VERSION_CONFLICT");
  const logs = await migrationClient.query("SELECT count(*)::int AS count FROM admin_operation_logs WHERE target_id = $1", [fileId]);
  assert.equal(logs.rows[0].count, 1);
});

test("file completion rejects tampering and marks the upload failed", { skip: !enabled }, async () => {
  const declared = png(64, 64);
  const declaredHash = createHash("sha256").update(declared).digest("hex");
  const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: declared.byteLength, sha256: declaredHash });
  const fileId = requested.json().file.id;
  const tampered = png(32, 32);
  objects.set(`${latestUpload.bucket}/${latestUpload.objectKey}`, { body: tampered, contentType: "image/png", sizeBytes: tampered.byteLength, metadata: { sha256: declaredHash, "size-bytes": String(tampered.byteLength) } });
  const completed = await userRequest("POST", `/api/v1/files/${fileId}/complete`);
  assert.equal(completed.statusCode, 400);
  assert.equal(completed.json().code, "FILE_HASH_MISMATCH");
  const stored = await migrationClient.query("SELECT upload_status FROM files WHERE id = $1", [fileId]);
  assert.equal(stored.rows[0].upload_status, "FAILED");
});

test("owner deletion is soft, exact, retryable and idempotent", { skip: !enabled }, async () => {
  const fileId = await createVerifiedFile("USER_AVATAR", png(72, 72));
  const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id = $1", [fileId]);
  const storageKey = `${location.rows[0].bucket}/${location.rows[0].object_key}`;
  assert.equal(objects.has(storageKey), true);

  const removed = await userRequest("DELETE", `/api/v1/files/${fileId}`);
  assert.equal(removed.statusCode, 200, removed.body);
  assert.deepEqual(removed.json(), { id: fileId, deleted: true });
  assert.equal(objects.has(storageKey), false);
  const state = await migrationClient.query("SELECT upload_status, deleted_at FROM files WHERE id = $1", [fileId]);
  assert.equal(state.rows[0].upload_status, "DELETED");
  assert.ok(state.rows[0].deleted_at);
  const task = await migrationClient.query("SELECT status, attempts FROM scheduled_jobs WHERE job_key = $1", [`file:delete:${fileId}`]);
  assert.deepEqual(task.rows, [{ status: "COMPLETED", attempts: 1 }]);

  const repeated = await userRequest("DELETE", `/api/v1/files/${fileId}`);
  assert.equal(repeated.statusCode, 200, repeated.body);
  assert.equal((await migrationClient.query("SELECT count(*)::int AS count FROM scheduled_jobs WHERE job_key = $1", [`file:delete:${fileId}`])).rows[0].count, 1);
});

test("a referenced file cannot be deleted and keeps its exact object", { skip: !enabled }, async () => {
  const fileId = await createVerifiedFile("USER_AVATAR", png(73, 73));
  const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id = $1", [fileId]);
  const storageKey = `${location.rows[0].bucket}/${location.rows[0].object_key}`;
  const usageId = randomUUID();
  await migrationClient.query("INSERT INTO file_usages (id, file_id, usage_type, target_type, target_id) VALUES ($1,$2,'AVATAR','USER',$3)", [usageId, fileId, user.id]);
  try {
    const denied = await userRequest("DELETE", `/api/v1/files/${fileId}`);
    assert.equal(denied.statusCode, 409, denied.body);
    assert.equal(denied.json().code, "FILE_IN_USE");
    assert.equal(objects.has(storageKey), true);
    const state = await migrationClient.query("SELECT upload_status, deleted_at FROM files WHERE id = $1", [fileId]);
    assert.deepEqual(state.rows, [{ upload_status: "VERIFIED", deleted_at: null }]);
  } finally {
    await migrationClient.query("UPDATE file_usages SET deleted_at = now() WHERE id = $1", [usageId]);
    objects.delete(storageKey);
  }
});

test("a transient object deletion failure persists a bounded retry and then succeeds", { skip: !enabled }, async () => {
  let failuresRemaining = 1;
  const failingStorage = {
    ...storage,
    async deleteObject(input) {
      if (failuresRemaining > 0) { failuresRemaining -= 1; const error = new Error("synthetic temporary failure"); error.code = "FILE_STORAGE_DELETE_FAILED"; throw error; }
      return storage.deleteObject(input);
    },
  };
  const retryDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-file-delete-retry-test", options: `-c search_path=${schemaName},public`, max: 2 });
  const retryApp = await createApiApp({ config, databaseClient: retryDatabase, objectStorageProvider: failingStorage, logger: new JsonLogger("file-delete-retry-test", () => {}) });
  let storageKey;
  try {
    const bytes = png(74, 74); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await retryApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${user.token}` }, payload: { file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 } });
    const fileId = requested.json().file.id;
    storageKey = `${latestUpload.bucket}/${latestUpload.objectKey}`;
    objects.set(storageKey, { body: bytes, contentType: "image/png", sizeBytes: bytes.byteLength, metadata: { sha256, "size-bytes": String(bytes.byteLength) } });
    assert.equal((await retryApp.inject({ method: "POST", url: `/api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 201);
    assert.equal((await retryApp.inject({ method: "DELETE", url: `/api/v1/files/${fileId}`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 200);
    assert.equal(objects.has(storageKey), true);
    const pending = await migrationClient.query("SELECT id, status, attempts, last_error FROM scheduled_jobs WHERE job_key = $1", [`file:delete:${fileId}`]);
    assert.deepEqual(pending.rows.map(({ status, attempts, last_error }) => ({ status, attempts, last_error })), [{ status: "PENDING", attempts: 1, last_error: "storage_temporary_failure" }]);
    await migrationClient.query("UPDATE scheduled_jobs SET run_at = now() - interval '1 second' WHERE id = $1", [pending.rows[0].id]);
    const lifecycle = retryApp.get(FileLifecycleService);
    assert.equal(await lifecycle.runSpecificJob(pending.rows[0].id, "test-retry-worker"), "completed");
    assert.equal(objects.has(storageKey), false);
    const completed = await migrationClient.query("SELECT status, attempts FROM scheduled_jobs WHERE id = $1", [pending.rows[0].id]);
    assert.deepEqual(completed.rows, [{ status: "COMPLETED", attempts: 2 }]);
  } finally {
    if (storageKey) objects.delete(storageKey);
    await retryApp.close();
  }
});

test("expired PENDING and UPLOADED records clean exact quarantine objects without touching fresh or VERIFIED files", { skip: !enabled }, async () => {
  const lifecycle = app.get(FileLifecycleService);
  const expiredIds = [];
  const keys = [];
  for (const uploadStatus of ["PENDING", "UPLOADED"]) {
    const bytes = png(uploadStatus === "PENDING" ? 75 : 76, 75); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 });
    const fileId = requested.json().file.id; const storageKey = `${latestUpload.bucket}/${latestUpload.objectKey}`;
    objects.set(storageKey, { body: bytes, contentType: "image/png", sizeBytes: bytes.byteLength, metadata: { sha256, "size-bytes": String(bytes.byteLength) } });
    await migrationClient.query("UPDATE files SET upload_status = $2, created_at = now() - interval '2 hours' WHERE id = $1", [fileId, uploadStatus]);
    expiredIds.push(fileId); keys.push(storageKey);
  }
  const freshBytes = png(77, 77); const freshHash = createHash("sha256").update(freshBytes).digest("hex");
  const fresh = await userRequest("POST", "/api/v1/files/uploads", { file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: freshBytes.byteLength, sha256: freshHash });
  const freshKey = `${latestUpload.bucket}/${latestUpload.objectKey}`;
  objects.set(freshKey, { body: freshBytes, contentType: "image/png", sizeBytes: freshBytes.byteLength, metadata: { sha256: freshHash, "size-bytes": String(freshBytes.byteLength) } });
  const verifiedId = await createVerifiedFile("USER_AVATAR", png(78, 78));
  const verifiedLocation = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id = $1", [verifiedId]);
  const verifiedKey = `${verifiedLocation.rows[0].bucket}/${verifiedLocation.rows[0].object_key}`;
  await migrationClient.query("UPDATE files SET created_at = now() - interval '2 hours' WHERE id = $1", [verifiedId]);
  try {
    const sweep = await lifecycle.enqueueDueJobs();
    assert.ok(sweep.expiredUploads >= 2);
    const jobs = await migrationClient.query("SELECT id FROM scheduled_jobs WHERE target_id = ANY($1::uuid[]) AND status = 'PENDING'", [expiredIds]);
    assert.equal(jobs.rows.length, 2);
    for (const job of jobs.rows) assert.equal(await lifecycle.runSpecificJob(job.id, "expiry-test-worker"), "completed");
    assert.deepEqual(keys.map((key) => objects.has(key)), [false, false]);
    const states = await migrationClient.query("SELECT upload_status FROM files WHERE id = ANY($1::uuid[]) ORDER BY id", [expiredIds]);
    assert.deepEqual(states.rows.map((row) => row.upload_status), ["FAILED", "FAILED"]);
    assert.equal(objects.has(freshKey), true);
    assert.equal(objects.has(verifiedKey), true);
    assert.equal((await migrationClient.query("SELECT count(*)::int AS count FROM scheduled_jobs WHERE target_id = $1", [fresh.json().file.id])).rows[0].count, 0);
    assert.equal((await migrationClient.query("SELECT count(*)::int AS count FROM scheduled_jobs WHERE target_id = $1", [verifiedId])).rows[0].count, 0);
  } finally {
    objects.delete(freshKey); objects.delete(verifiedKey); for (const key of keys) objects.delete(key);
  }
});

test("orphan audit is paginated, read-only and only permits exact stage-6 test cleanup", { skip: !enabled }, async () => {
  const lifecycle = app.get(FileLifecycleService);
  const prefix = `stage6-tests/${randomUUID()}`;
  const location = { bucket: config.fileQuarantineBucket, objectKey: `${prefix}/orphan.bin` };
  const storageKey = `${location.bucket}/${location.objectKey}`;
  objects.set(storageKey, { body: new Uint8Array([1, 2, 3]), contentType: "application/octet-stream", sizeBytes: 3, metadata: {} });
  try {
    const report = await lifecycle.auditOrphans({ buckets: [location.bucket], prefix, maxObjects: 10, pageSize: 1 });
    assert.equal(report.readOnly, true);
    assert.equal(report.counts.storage_without_database_record, 1);
    assert.equal(report.findings[0].locationId.length, 16);
    assert.equal("objectKey" in report.findings[0], false);
    assert.equal(objects.has(storageKey), true);
    await assert.rejects(() => lifecycle.deleteStage6TestObject({ bucket: config.filePublicBucket, objectKey: location.objectKey }));
    await assert.rejects(() => lifecycle.deleteStage6TestObject({ bucket: location.bucket, objectKey: "../unsafe" }));
    await lifecycle.deleteStage6TestObject(location);
    assert.equal(objects.has(storageKey), false);
  } finally { objects.delete(storageKey); }
});

test("verified and approved USER_AVATAR binds to the latest profile versions", { skip: !enabled }, async () => {
  const bytes = png(256, 256);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 });
  assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed");
  const fileId = requested.json().file.id;
  objects.set(`${latestUpload.bucket}/${latestUpload.objectKey}`, { body: bytes, contentType: "image/png", sizeBytes: bytes.byteLength, metadata: { sha256, "size-bytes": String(bytes.byteLength) } });

  const completed = await userRequest("POST", `/api/v1/files/${fileId}/complete`);
  assert.equal(completed.statusCode, 201, completed.body);
  assert.equal(completed.json().upload_status, "VERIFIED");
  assert.equal(completed.json().moderation_status, "PENDING");
  assert.equal((await userRequest("GET", `/api/v1/files/${fileId}/access`)).statusCode, 200);

  const approved = await adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "APPROVED", reason: "头像内容与文件校验通过" });
  assert.equal(approved.statusCode, 201, approved.body);
  assert.equal(approved.json().moderation_status, "APPROVED");

  const latestViewer = (await userRequest("GET", "/api/v1/me")).json();
  const bound = await userRequest("PATCH", "/api/v1/me/profile", {
    nickname: latestViewer.profile.nickname,
    bio: latestViewer.profile.bio,
    avatar_file_id: fileId,
    version: latestViewer.profile.version,
    user_version: latestViewer.version,
  });
  assert.equal(bound.statusCode, 200, bound.body);
  assert.equal(bound.json().profile.avatar_file_id, fileId);
  const activeUsage = await migrationClient.query("SELECT usage_type, target_type, target_id FROM file_usages WHERE file_id = $1 AND deleted_at IS NULL", [fileId]);
  assert.deepEqual(activeUsage.rows, [{ usage_type: "AVATAR", target_type: "USER", target_id: user.id }]);
  const inUse = await userRequest("DELETE", `/api/v1/files/${fileId}`);
  assert.equal(inUse.statusCode, 409, inUse.body);
  assert.equal(inUse.json().code, "FILE_IN_USE");
  assert.equal((await app.inject({ method: "GET", url: `/api/v1/files/${fileId}` })).statusCode, 200);
  const unbound = await userRequest("PATCH", "/api/v1/me/profile", {
    nickname: bound.json().profile.nickname,
    bio: bound.json().profile.bio,
    avatar_file_id: null,
    version: bound.json().profile.version,
    user_version: bound.json().version,
  });
  assert.equal(unbound.statusCode, 200, unbound.body);
  assert.equal(unbound.json().profile.avatar_file_id, null);
  const usageAfterUnbind = await migrationClient.query("SELECT count(*)::integer AS count FROM file_usages WHERE file_id = $1 AND deleted_at IS NULL", [fileId]);
  assert.equal(usageAfterUnbind.rows[0].count, 0);
  assert.equal((await userRequest("DELETE", `/api/v1/files/${fileId}`)).statusCode, 200);
});

test("USER_AVATAR traverses the real local MinIO, isolated database and profile binding chain", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({
    endpoint: process.env.FILE_STORAGE_ENDPOINT,
    region: process.env.FILE_STORAGE_REGION,
    accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY,
  });
  const realConfig = {
    ...config,
    fileStorageProvider: "minio",
    fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT,
    fileStorageRegion: process.env.FILE_STORAGE_REGION,
    fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID,
    fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY,
    filePublicBucket: process.env.FILE_PUBLIC_BUCKET,
    filePrivateBucket: process.env.FILE_PRIVATE_BUCKET,
    fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET,
    publicAssetBaseUrl: undefined,
  };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-file-minio-e2e", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("file-minio-e2e", () => {}) });
  let fileId;
  try {
    const bytes = png(192, 192);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await realApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${user.token}` }, payload: { file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 } });
    assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed");
    fileId = requested.json().file.id;
    const upload = requested.json().upload;
    const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes });
    assert.equal(put.ok, true);

    const completed = await realApp.inject({ method: "POST", url: `/api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${user.token}` } });
    assert.equal(completed.statusCode, 201, completed.body);
    assert.equal(completed.json().upload_status, "VERIFIED");
    assert.equal(completed.json().moderation_status, "PENDING");
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}/access`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 200);

    const approved = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "APPROVED", reason: "本地 MinIO 隔离联调审核" } });
    assert.equal(approved.statusCode, 201, approved.body);
    const latestViewer = (await realApp.inject({ method: "GET", url: "/api/v1/me", headers: { authorization: `Bearer ${user.token}` } })).json();
    const bound = await realApp.inject({ method: "PATCH", url: "/api/v1/me/profile", headers: { authorization: `Bearer ${user.token}` }, payload: { nickname: latestViewer.profile.nickname, bio: latestViewer.profile.bio, avatar_file_id: fileId, version: latestViewer.profile.version, user_version: latestViewer.version } });
    assert.equal(bound.statusCode, 200, bound.body);
    assert.equal(bound.json().profile.avatar_file_id, fileId);

    const publicFile = await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}` });
    assert.equal(publicFile.statusCode, 200, "public file request failed; response body suppressed");
    const downloaded = await fetch(publicFile.json().content_url);
    assert.equal(downloaded.ok, true);
    assert.equal(createHash("sha256").update(new Uint8Array(await downloaded.arrayBuffer())).digest("hex"), sha256);
  } finally {
    if (fileId) {
      const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id = $1", [fileId]);
      if (location.rows[0]) await realStorage.deleteObject({ bucket: location.rows[0].bucket, objectKey: location.rows[0].object_key }).catch(() => undefined);
    }
    await realApp.close();
  }
});

test("stage 5 image types traverse real MinIO and bind to seller, product and complaint records", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({ endpoint: process.env.FILE_STORAGE_ENDPOINT, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY });
  const realConfig = { ...config, fileStorageProvider: "minio", fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT, fileStorageRegion: process.env.FILE_STORAGE_REGION, fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY, filePublicBucket: process.env.FILE_PUBLIC_BUCKET, filePrivateBucket: process.env.FILE_PRIVATE_BUCKET, fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET, publicAssetBaseUrl: undefined };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-stage5-minio-e2e", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("stage5-minio-e2e", () => {}) });
  const createdFileIds = [];
  try {
    const uploadAndApprove = async (fileType, width, height) => {
      const bytes = png(width, height); const sha256 = createHash("sha256").update(bytes).digest("hex");
      const requested = await realApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${user.token}` }, payload: { file_type: fileType, mime_type: "image/png", size_bytes: bytes.byteLength, sha256 } });
      assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed");
      const fileId = requested.json().file.id; createdFileIds.push(fileId);
      const upload = requested.json().upload;
      assert.equal((await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes })).ok, true);
      const completed = await realApp.inject({ method: "POST", url: `/api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${user.token}` } });
      assert.equal(completed.statusCode, 201, completed.body);
      assert.deepEqual([completed.json().upload_status, completed.json().moderation_status], ["VERIFIED", "PENDING"]);
      const preview = await realApp.inject({ method: "GET", url: `/admin-api/v1/files/${fileId}/access`, headers: { authorization: `Bearer ${admin.token}` } });
      assert.equal(preview.statusCode, 200, "file preview request failed; response body suppressed");
      const approved = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "APPROVED", reason: `阶段5 ${fileType} 合成图片审核通过` } });
      assert.equal(approved.statusCode, 201, approved.body);
      return fileId;
    };

    const sellerAvatarId = await uploadAndApprove("SELLER_AVATAR", 256, 256);
    const sellerCoverId = await uploadAndApprove("SELLER_COVER", 1200, 480);
    const productImageId = await uploadAndApprove("PRODUCT_IMAGE", 1200, 900);
    const evidenceId = await uploadAndApprove("COMPLAINT_EVIDENCE", 900, 1200);

    const voicePolicyId = await ensureVoicePolicyVersion();
    await acceptVoicePolicy(user.id, voicePolicyId);
    const currentAvatarId = await seedApprovedSellerMedia(user.id, "SELLER_AVATAR", "PUBLIC");
    const currentVoiceId = await seedApprovedSellerMedia(user.id, "VOICE_SAMPLE", "SIGNED", 15_000);
    const sellerId = randomUUID();
    await migrationClient.query("INSERT INTO seller_profiles (id,user_id,status,seller_nickname,seller_avatar_file_id,introduction,game_rank,kd,preferred_mode,play_style,game_experience,voice_file_id,voice_duration_ms,voice_authorization_policy_version_id,accepting_orders,approved_at) VALUES ($1,$2,'APPROVED','阶段五陪玩',$3,'本地 MinIO 全链路合成测试','王牌','3.25','四排','稳健配合','3年本地测试经验',$4,15000,$5,true,now())", [sellerId, user.id, currentAvatarId, currentVoiceId, voicePolicyId]);
    const sellerBefore = (await realApp.inject({ method: "GET", url: "/api/v1/seller/profile", headers: { authorization: `Bearer ${user.token}` } })).json();
    const sellerDraft = await realApp.inject({ method: "PUT", url: "/api/v1/seller/profile-revisions/draft", headers: { authorization: `Bearer ${user.token}` }, payload: { seller_nickname: sellerBefore.seller_nickname, seller_avatar_file_id: sellerAvatarId, cover_file_id: sellerCoverId, introduction: sellerBefore.introduction, game_rank: sellerBefore.game_rank, kd: sellerBefore.kd, preferred_mode: sellerBefore.preferred_mode, play_style: sellerBefore.play_style, game_experience: sellerBefore.game_experience, voice_file_id: sellerBefore.voice_file_id, voice_duration_ms: sellerBefore.voice_duration_ms, seller_version: sellerBefore.version } });
    assert.equal(sellerDraft.statusCode, 200, sellerDraft.body);
    const sellerSubmitted = await realApp.inject({ method: "POST", url: `/api/v1/seller/profile-revisions/${sellerDraft.json().id}/submit`, headers: { authorization: `Bearer ${user.token}` }, payload: { version: sellerDraft.json().version } });
    assert.equal(sellerSubmitted.statusCode, 201, sellerSubmitted.body);
    const sellerApproved = await realApp.inject({ method: "POST", url: `/admin-api/v1/seller-applications/${sellerDraft.json().id}/review`, headers: { authorization: `Bearer ${admin.token}` }, payload: { action: "APPROVE", reason: "阶段五头像与主页封面资料变更审核通过", version: sellerSubmitted.json().version } });
    assert.equal(sellerApproved.statusCode, 201, sellerApproved.body);
    const sellerBound = await realApp.inject({ method: "GET", url: "/api/v1/seller/profile", headers: { authorization: `Bearer ${user.token}` } });
    assert.equal(sellerBound.statusCode, 200, sellerBound.body);
    assert.deepEqual([sellerBound.json().seller_avatar_file_id, sellerBound.json().cover_file_id], [sellerAvatarId, sellerCoverId]);

    const product = await realApp.inject({ method: "POST", url: "/api/v1/seller/services", headers: { authorization: `Bearer ${user.token}` }, payload: { title: "阶段五图片服务", description: "用于验证真实 MinIO 商品图片绑定与正式读取。", service_time_description: "本地测试" } });
    assert.equal(product.statusCode, 201, product.body);
    const productId = product.json().id;
    const imageBound = await realApp.inject({ method: "PUT", url: `/api/v1/seller/services/${productId}/images`, headers: { authorization: `Bearer ${user.token}` }, payload: { version: product.json().version, images: [{ file_id: productImageId, sort_order: 0, is_cover: true }] } });
    assert.equal(imageBound.statusCode, 200, imageBound.body);
    await migrationClient.query("UPDATE products SET status='ON_SALE', approved_at=now() WHERE id=$1", [productId]);
    const publicProduct = await realApp.inject({ method: "GET", url: `/api/v1/services/${productId}` });
    assert.equal(publicProduct.statusCode, 200, publicProduct.body);
    assert.deepEqual(publicProduct.json().images.map((item) => item.file_id), [productImageId]);

    const complaint = await realApp.inject({ method: "POST", url: "/api/v1/complaints", headers: { authorization: `Bearer ${user.token}` }, payload: { target_type: "USER", target_id: otherUser.id, complaint_type: "阶段五私有证据", description: "仅使用合成图片验证私有证据绑定和读取边界。", file_ids: [evidenceId] } });
    assert.equal(complaint.statusCode, 201, complaint.body);
    const complaintDetail = await realApp.inject({ method: "GET", url: `/api/v1/complaints/${complaint.json().id}`, headers: { authorization: `Bearer ${user.token}` } });
    assert.equal(complaintDetail.statusCode, 200, complaintDetail.body);
    assert.deepEqual(complaintDetail.json().evidences.map((item) => item.file_id), [evidenceId]);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/complaints/${complaint.json().id}`, headers: { authorization: `Bearer ${otherUser.token}` } })).statusCode, 404);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${evidenceId}/access`, headers: { authorization: `Bearer ${otherUser.token}` } })).statusCode, 404);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${evidenceId}` })).statusCode, 404);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${evidenceId}/access`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 200);

    for (const fileId of [sellerAvatarId, sellerCoverId, productImageId]) {
      const publicFile = await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}` });
      assert.equal(publicFile.statusCode, 200, "public file request failed; response body suppressed");
      assert.equal((await fetch(publicFile.json().content_url)).ok, true);
    }
    const usages = await migrationClient.query("SELECT file_id, target_type, usage_type FROM file_usages WHERE file_id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY file_id", [createdFileIds]);
    assert.equal(usages.rows.length, 4);

    const currentProduct = (await realApp.inject({ method: "GET", url: `/api/v1/seller/services/${productId}`, headers: { authorization: `Bearer ${user.token}` } })).json();
    await migrationClient.query("UPDATE products SET status='OFF_SALE' WHERE id=$1", [productId]);
    const unbound = await realApp.inject({ method: "PUT", url: `/api/v1/seller/services/${productId}/images`, headers: { authorization: `Bearer ${user.token}` }, payload: { version: currentProduct.version, images: [] } });
    assert.equal(unbound.statusCode, 200, unbound.body);
    const productUsage = await migrationClient.query("SELECT count(*)::integer AS count FROM file_usages WHERE file_id=$1 AND deleted_at IS NULL", [productImageId]);
    assert.equal(productUsage.rows[0].count, 0);
  } finally {
    try {
      for (const fileId of createdFileIds) {
        const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId]);
        if (!location.rows[0]) continue;
        const object = { bucket: location.rows[0].bucket, objectKey: location.rows[0].object_key };
        await realStorage.deleteObject(object);
        await assert.rejects(() => realStorage.headObject(object), (error) => error?.code === "FILE_OBJECT_NOT_FOUND");
      }
    } finally {
      await realApp.close();
    }
  }
});

test("ADMIN_EVIDENCE uses an admin-only real MinIO chain with controlled PDF preview and private promotion", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({ endpoint: process.env.FILE_STORAGE_ENDPOINT, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY });
  const realConfig = { ...config, fileStorageProvider: "minio", fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT, fileStorageRegion: process.env.FILE_STORAGE_REGION, fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY, filePublicBucket: process.env.FILE_PUBLIC_BUCKET, filePrivateBucket: process.env.FILE_PRIVATE_BUCKET, fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET, publicAssetBaseUrl: undefined };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-admin-evidence-minio-e2e", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("admin-evidence-minio-e2e", () => {}) });
  let fileId;
  try {
    const bytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const deniedUser = await realApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${user.token}` }, payload: { file_type: "ADMIN_EVIDENCE", mime_type: "application/pdf", size_bytes: bytes.byteLength, sha256 } });
    assert.equal(deniedUser.statusCode, 403);

    const requested = await realApp.inject({ method: "POST", url: "/admin-api/v1/files/uploads", headers: { authorization: `Bearer ${admin.token}` }, payload: { file_type: "ADMIN_EVIDENCE", mime_type: "application/pdf", size_bytes: bytes.byteLength, sha256 } });
    assert.equal(requested.statusCode, 201, "admin evidence upload request failed; response body suppressed");
    assert.equal(requested.body.includes("object_key"), false);
    assert.equal(requested.json().file.visibility, "PRIVATE");
    fileId = requested.json().file.id;
    const pendingLocation = (await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId])).rows[0];
    assert.equal(pendingLocation.bucket, realConfig.fileQuarantineBucket);
    const upload = requested.json().upload;
    assert.equal((await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes })).ok, true);

    const service = realApp.get(FileStorageService);
    await assert.rejects(() => service.completeServiceUpload(fileId), (error) => error?.code === "FILE_TYPE_NOT_ALLOWED" && error?.statusCode === 403);
    const completed = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${admin.token}` } });
    assert.equal(completed.statusCode, 201, completed.body);
    assert.deepEqual([completed.json().upload_status, completed.json().moderation_status], ["VERIFIED", "PENDING"]);

    const preview = await realApp.inject({ method: "GET", url: `/admin-api/v1/files/${fileId}/preview`, headers: { authorization: `Bearer ${admin.token}` } });
    assert.equal(preview.statusCode, 200, "admin PDF preview failed; response body suppressed");
    assert.equal(preview.headers["content-type"], "application/pdf");
    assert.equal(preview.headers["cache-control"], "no-store, private");
    assert.match(preview.headers["content-disposition"], /admin-preview\.pdf/u);
    assert.deepEqual(new Uint8Array(preview.rawPayload), bytes);

    const approved = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "APPROVED", reason: "合成 PDF 管理证据本地审核通过" } });
    assert.equal(approved.statusCode, 201, approved.body);
    const finalLocation = (await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId])).rows[0];
    assert.equal(finalLocation.bucket, realConfig.filePrivateBucket);
    await realStorage.headObject({ bucket: finalLocation.bucket, objectKey: finalLocation.object_key });
    await assert.rejects(() => realStorage.headObject({ bucket: pendingLocation.bucket, objectKey: pendingLocation.object_key }), (error) => error?.code === "FILE_OBJECT_NOT_FOUND");
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}` })).statusCode, 404);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}/access`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 404);
    const audits = await migrationClient.query("SELECT action FROM admin_operation_logs WHERE target_id=$1 ORDER BY created_at", [fileId]);
    assert.deepEqual(audits.rows.map((row) => row.action), ["FILE_ADMIN_UPLOAD_REQUESTED", "FILE_ADMIN_UPLOAD_VERIFIED", "FILE_PREVIEWED", "FILE_APPROVED"]);
  } finally {
    if (fileId) {
      const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId]);
      if (location.rows[0]) await realStorage.deleteObject({ bucket: location.rows[0].bucket, objectKey: location.rows[0].object_key }).catch(() => undefined);
    }
    await realApp.close();
  }
});

test("PAYMENT_PAYLOAD uses a service-only real MinIO chain and remains non-previewable in the private bucket", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({ endpoint: process.env.FILE_STORAGE_ENDPOINT, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY });
  const realConfig = { ...config, fileStorageProvider: "minio", fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT, fileStorageRegion: process.env.FILE_STORAGE_REGION, fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY, filePublicBucket: process.env.FILE_PUBLIC_BUCKET, filePrivateBucket: process.env.FILE_PRIVATE_BUCKET, fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET, publicAssetBaseUrl: undefined };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-payment-payload-minio-e2e", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("payment-payload-minio-e2e", () => {}) });
  let fileId;
  try {
    const bytes = new TextEncoder().encode('{"kind":"synthetic-payment-payload","amount_minor":0}');
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requestPayload = { file_type: "PAYMENT_PAYLOAD", mime_type: "application/json", size_bytes: bytes.byteLength, sha256 };
    assert.equal((await realApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${user.token}` }, payload: requestPayload })).statusCode, 403);
    assert.equal((await realApp.inject({ method: "POST", url: "/admin-api/v1/files/uploads", headers: { authorization: `Bearer ${admin.token}` }, payload: requestPayload })).statusCode, 403);

    const service = realApp.get(FileStorageService);
    const requested = await service.requestServiceUpload({ fileType: "PAYMENT_PAYLOAD", mimeType: "application/json", sizeBytes: bytes.byteLength, sha256 });
    fileId = requested.file.id;
    assert.equal(requested.file.visibility, "PRIVATE");
    const pendingLocation = (await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId])).rows[0];
    assert.equal(pendingLocation.bucket, realConfig.fileQuarantineBucket);
    assert.equal((await fetch(requested.upload.url, { method: requested.upload.method, headers: requested.upload.headers, body: bytes })).ok, true);

    const deniedAdminComplete = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${admin.token}` } });
    assert.equal(deniedAdminComplete.statusCode, 403);
    const completed = await service.completeServiceUpload(fileId);
    assert.deepEqual([completed.upload_status, completed.moderation_status], ["VERIFIED", "PENDING"]);
    const preview = await realApp.inject({ method: "GET", url: `/admin-api/v1/files/${fileId}/preview`, headers: { authorization: `Bearer ${admin.token}` } });
    assert.equal(preview.statusCode, 415);
    assert.equal(preview.json().code, "FILE_PREVIEW_MIME_NOT_ALLOWED");

    const approved = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "APPROVED", reason: "合成支付载荷本地审核通过" } });
    assert.equal(approved.statusCode, 201, approved.body);
    const finalLocation = (await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId])).rows[0];
    assert.equal(finalLocation.bucket, realConfig.filePrivateBucket);
    await realStorage.headObject({ bucket: finalLocation.bucket, objectKey: finalLocation.object_key });
    await assert.rejects(() => realStorage.headObject({ bucket: pendingLocation.bucket, objectKey: pendingLocation.object_key }), (error) => error?.code === "FILE_OBJECT_NOT_FOUND");
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}` })).statusCode, 404);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}/access`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 404);
    const audits = await migrationClient.query("SELECT action FROM admin_operation_logs WHERE target_id=$1 ORDER BY created_at", [fileId]);
    assert.deepEqual(audits.rows.map((row) => row.action), ["FILE_APPROVED"]);
  } finally {
    if (fileId) {
      const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId]);
      if (location.rows[0]) await realStorage.deleteObject({ bucket: location.rows[0].bucket, objectKey: location.rows[0].object_key }).catch(() => undefined);
    }
    await realApp.close();
  }
});

test("VOICE_SAMPLE rejects server-side duration boundaries and disguised video payloads", { skip: !enabled }, async () => {
  const acceptedVoice = async (durationMs) => {
    const bytes = mp4("soun", 48_000, durationMs * 48);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type: "VOICE_SAMPLE", mime_type: "audio/mp4", size_bytes: bytes.byteLength, sha256 });
    assert.equal(requested.statusCode, 201, "voice upload request failed; response body suppressed");
    const fileId = requested.json().file.id;
    const location = { bucket: latestUpload.bucket, objectKey: latestUpload.objectKey };
    objects.set(`${location.bucket}/${location.objectKey}`, { body: bytes, contentType: "audio/mp4", sizeBytes: bytes.byteLength, metadata: { sha256, "size-bytes": String(bytes.byteLength) } });
    const completed = await userRequest("POST", `/api/v1/files/${fileId}/complete`);
    assert.equal(completed.statusCode, 201, completed.body);
    assert.equal(completed.json().duration_ms, durationMs);
    assert.equal((await userRequest("DELETE", `/api/v1/files/${fileId}`)).statusCode, 200);
    assert.equal(objects.has(`${location.bucket}/${location.objectKey}`), false);
  };
  const rejectedVoice = async ({ bytes, mimeType, expectedCode }) => {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type: "VOICE_SAMPLE", mime_type: mimeType, size_bytes: bytes.byteLength, sha256 });
    assert.equal(requested.statusCode, 201, "voice upload request failed; response body suppressed");
    const fileId = requested.json().file.id;
    const location = { bucket: latestUpload.bucket, objectKey: latestUpload.objectKey };
    objects.set(`${location.bucket}/${location.objectKey}`, { body: bytes, contentType: mimeType, sizeBytes: bytes.byteLength, metadata: { sha256, "size-bytes": String(bytes.byteLength) } });
    const completed = await userRequest("POST", `/api/v1/files/${fileId}/complete`);
    assert.equal(completed.statusCode, 400, completed.body);
    assert.equal(completed.json().code, expectedCode);
    const state = await migrationClient.query("SELECT upload_status, duration_ms FROM files WHERE id=$1", [fileId]);
    assert.equal(state.rows[0].upload_status, "FAILED");
    assert.equal(state.rows[0].duration_ms, null);
    assert.equal(objects.has(`${location.bucket}/${location.objectKey}`), false);
  };

  await acceptedVoice(10_000);
  await acceptedVoice(30_000);
  await rejectedVoice({ bytes: mp3Seconds(9), mimeType: "audio/mpeg", expectedCode: "FILE_DURATION_NOT_ALLOWED" });
  await rejectedVoice({ bytes: mp3Seconds(31), mimeType: "audio/mpeg", expectedCode: "FILE_DURATION_NOT_ALLOWED" });
  await rejectedVoice({ bytes: mp4("vide", 48_000, 720_000), mimeType: "audio/mp4", expectedCode: "FILE_MIME_MISMATCH" });
});

test("VOICE_SAMPLE traverses real MinIO moderation, controlled playback and replacement without public enumeration", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({ endpoint: process.env.FILE_STORAGE_ENDPOINT, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY });
  const realConfig = { ...config, fileStorageProvider: "minio", fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT, fileStorageRegion: process.env.FILE_STORAGE_REGION, fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY, filePublicBucket: process.env.FILE_PUBLIC_BUCKET, filePrivateBucket: process.env.FILE_PRIVATE_BUCKET, fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET, publicAssetBaseUrl: undefined };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-stage7-voice-minio-e2e", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("stage7-voice-minio-e2e", () => {}) });
  const createdFileIds = [];
  try {
    const uploadVoice = async () => {
      const bytes = mp3Seconds(15);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const requested = await realApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${otherUser.token}` }, payload: { file_type: "VOICE_SAMPLE", mime_type: "audio/mpeg", size_bytes: bytes.byteLength, sha256 } });
      assert.equal(requested.statusCode, 201, "voice upload request failed; response body suppressed");
      assert.equal(requested.json().file.visibility, "SIGNED");
      const fileId = requested.json().file.id; createdFileIds.push(fileId);
      const pendingLocation = (await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId])).rows[0];
      assert.equal(pendingLocation.bucket, realConfig.fileQuarantineBucket);
      const upload = requested.json().upload;
      assert.equal((await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes })).ok, true);
      const completed = await realApp.inject({ method: "POST", url: `/api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${otherUser.token}` } });
      assert.equal(completed.statusCode, 201, completed.body);
      assert.equal(completed.json().upload_status, "VERIFIED");
      assert.equal(completed.json().moderation_status, "PENDING");
      assert.equal(completed.json().mime_type, "audio/mpeg");
      assert.ok(completed.json().duration_ms >= 10_000 && completed.json().duration_ms <= 30_000);
      assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}` })).statusCode, 404);
      assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}/access`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 404);
      const ownerAccess = await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}/access`, headers: { authorization: `Bearer ${otherUser.token}` } });
      assert.equal(ownerAccess.statusCode, 200, "owner voice access failed; response body suppressed");
      const adminPreview = await realApp.inject({ method: "GET", url: `/admin-api/v1/files/${fileId}/preview`, headers: { authorization: `Bearer ${admin.token}`, range: "bytes=0-416" } });
      assert.equal(adminPreview.statusCode, 206, "admin voice range preview failed; response body suppressed");
      assert.equal(adminPreview.headers["content-type"], "audio/mpeg");
      assert.equal(adminPreview.headers["content-range"], `bytes 0-416/${bytes.byteLength}`);
      assert.deepEqual(new Uint8Array(adminPreview.rawPayload), bytes.slice(0, 417));
      assert.equal(/X-Amz|object_key|bucket|https?:\/\//iu.test(adminPreview.body), false);
      return { fileId, bytes, sha256, durationMs: completed.json().duration_ms, pendingLocation };
    };

    const first = await uploadVoice();
    const approved = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${first.fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "APPROVED", reason: "阶段七合成声音名片审核通过" } });
    assert.equal(approved.statusCode, 201, approved.body);
    assert.equal(approved.json().visibility, "SIGNED");
    const firstFinalLocation = (await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [first.fileId])).rows[0];
    assert.equal(firstFinalLocation.bucket, realConfig.filePrivateBucket);
    await assert.rejects(() => realStorage.headObject({ bucket: first.pendingLocation.bucket, objectKey: first.pendingLocation.object_key }), (error) => error?.code === "FILE_OBJECT_NOT_FOUND");
    await realStorage.headObject({ bucket: firstFinalLocation.bucket, objectKey: firstFinalLocation.object_key });
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${first.fileId}` })).statusCode, 404);

    const voicePolicyId = await ensureVoicePolicyVersion();
    const sellerAvatarId = await seedApprovedSellerMedia(otherUser.id, "SELLER_AVATAR", "PUBLIC");
    const completeSellerPayload = { seller_nickname: "阶段七声音陪玩", seller_avatar_file_id: sellerAvatarId, introduction: "仅用于本地合成音频联调", game_rank: "王牌", kd: "3.25", preferred_mode: "四排", play_style: "稳健配合", game_experience: "3年本地测试经验", voice_file_id: first.fileId, voice_duration_ms: 10_001, accepting_orders: true };
    const deniedSellerCreated = await realApp.inject({ method: "POST", url: "/api/v1/seller/profile", headers: { authorization: `Bearer ${otherUser.token}` }, payload: completeSellerPayload });
    assert.equal(deniedSellerCreated.statusCode, 409, deniedSellerCreated.body);
    assert.equal(deniedSellerCreated.json().code, "POLICY_ACCEPTANCE_REQUIRED");
    assert.equal((await migrationClient.query("SELECT count(*)::integer AS count FROM seller_profiles WHERE user_id=$1", [otherUser.id])).rows[0].count, 0);
    await acceptVoicePolicy(otherUser.id, voicePolicyId);
    const sellerCreated = await realApp.inject({ method: "POST", url: "/api/v1/seller/profile", headers: { authorization: `Bearer ${otherUser.token}` }, payload: completeSellerPayload });
    assert.equal(sellerCreated.statusCode, 201, sellerCreated.body);
    assert.equal(sellerCreated.json().voice_duration_ms, first.durationMs);
    const sellerId = sellerCreated.json().id;
    const voicePolicyBinding = await migrationClient.query("SELECT voice_authorization_policy_version_id FROM seller_profiles WHERE id=$1", [sellerId]);
    assert.equal(voicePolicyBinding.rows[0].voice_authorization_policy_version_id, voicePolicyId);
    await migrationClient.query("UPDATE seller_profiles SET status='APPROVED', approved_at=now() WHERE id=$1", [sellerId]);
    await migrationClient.query("UPDATE seller_applications SET status='APPROVED', reviewed_at=now() WHERE seller_id=$1", [sellerId]);
    const controlled = await realApp.inject({ method: "GET", url: `/api/v1/companions/${sellerId}/voice` });
    assert.equal(controlled.statusCode, 200, controlled.body);
    assert.equal(controlled.json().file_id, first.fileId);
    assert.equal(controlled.json().duration_ms, first.durationMs);
    assert.equal(controlled.body.includes("object_key"), false);
    assert.equal(controlled.body.includes("bucket"), false);
    const played = await fetch(controlled.json().access.url);
    assert.equal(played.ok, true);
    assert.equal(createHash("sha256").update(new Uint8Array(await played.arrayBuffer())).digest("hex"), first.sha256);

    const rejected = await uploadVoice();
    const rejectedResult = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${rejected.fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "REJECTED", reason: "阶段七合成拒绝路径验证" } });
    assert.equal(rejectedResult.statusCode, 201, rejectedResult.body);
    assert.equal(rejectedResult.json().moderation_status, "REJECTED");
    const rejectedLocation = (await migrationClient.query("SELECT bucket FROM files WHERE id=$1", [rejected.fileId])).rows[0];
    assert.equal(rejectedLocation.bucket, realConfig.fileQuarantineBucket);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${rejected.fileId}` })).statusCode, 404);

    const replacement = await uploadVoice();
    assert.equal((await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${replacement.fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "APPROVED", reason: "阶段七替换声音名片审核通过" } })).statusCode, 201);
    const currentSeller = (await realApp.inject({ method: "GET", url: "/api/v1/seller/profile", headers: { authorization: `Bearer ${otherUser.token}` } })).json();
    const replacementDraft = await realApp.inject({ method: "PUT", url: "/api/v1/seller/profile-revisions/draft", headers: { authorization: `Bearer ${otherUser.token}` }, payload: { seller_nickname: currentSeller.seller_nickname, seller_avatar_file_id: currentSeller.seller_avatar_file_id, cover_file_id: currentSeller.cover_file_id, introduction: currentSeller.introduction, game_rank: currentSeller.game_rank, kd: currentSeller.kd, preferred_mode: currentSeller.preferred_mode, play_style: currentSeller.play_style, game_experience: currentSeller.game_experience, voice_file_id: replacement.fileId, voice_duration_ms: 29_999, seller_version: currentSeller.version } });
    assert.equal(replacementDraft.statusCode, 200, replacementDraft.body);
    const replacementSubmitted = await realApp.inject({ method: "POST", url: `/api/v1/seller/profile-revisions/${replacementDraft.json().id}/submit`, headers: { authorization: `Bearer ${otherUser.token}` }, payload: { version: replacementDraft.json().version } });
    assert.equal(replacementSubmitted.statusCode, 201, replacementSubmitted.body);
    const replacementApproved = await realApp.inject({ method: "POST", url: `/admin-api/v1/seller-applications/${replacementDraft.json().id}/review`, headers: { authorization: `Bearer ${admin.token}` }, payload: { action: "APPROVE", reason: "阶段七替换声音名片资料变更审核通过", version: replacementSubmitted.json().version } });
    assert.equal(replacementApproved.statusCode, 201, replacementApproved.body);
    const replaced = await realApp.inject({ method: "GET", url: "/api/v1/seller/profile", headers: { authorization: `Bearer ${otherUser.token}` } });
    assert.equal(replaced.statusCode, 200, replaced.body);
    assert.equal(replaced.json().voice_file_id, replacement.fileId);
    assert.equal(replaced.json().voice_duration_ms, replacement.durationMs);
    const usages = await migrationClient.query("SELECT file_id, deleted_at IS NULL AS active FROM file_usages WHERE target_type='SELLER' AND target_id=$1 AND usage_type='VOICE' ORDER BY created_at", [sellerId]);
    assert.deepEqual(usages.rows, [{ file_id: first.fileId, active: false }, { file_id: replacement.fileId, active: true }]);
    const replacementAccess = await realApp.inject({ method: "GET", url: `/api/v1/companions/${sellerId}/voice` });
    assert.equal(replacementAccess.statusCode, 200, replacementAccess.body);
    assert.equal(replacementAccess.json().file_id, replacement.fileId);
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${first.fileId}` })).statusCode, 404);
    const audits = await migrationClient.query("SELECT action, count(*)::integer AS count FROM admin_operation_logs WHERE target_id = ANY($1::uuid[]) GROUP BY action ORDER BY action", [createdFileIds]);
    assert.deepEqual(audits.rows, [{ action: "FILE_APPROVED", count: 2 }, { action: "FILE_PREVIEWED", count: 3 }, { action: "FILE_REJECTED", count: 1 }]);
  } finally {
    for (const fileId of createdFileIds) {
      const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fileId]);
      if (location.rows[0]) await realStorage.deleteObject({ bucket: location.rows[0].bucket, objectKey: location.rows[0].object_key }).catch(() => undefined);
    }
    await realApp.close();
  }
});

test("private evidence stays signed, promotes to the private bucket, and has a final moderation result", { skip: !enabled }, async () => {
  const bytes = png(80, 60);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type: "COMPLAINT_EVIDENCE", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 });
  assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed");
  const fileId = requested.json().file.id;
  const pendingLocation = { bucket: latestUpload.bucket, objectKey: latestUpload.objectKey };
  objects.set(`${pendingLocation.bucket}/${pendingLocation.objectKey}`, { body: bytes, contentType: "image/png", sizeBytes: bytes.byteLength, metadata: { sha256, "size-bytes": String(bytes.byteLength) } });
  assert.equal((await userRequest("POST", `/api/v1/files/${fileId}/complete`)).statusCode, 201);

  const ownerAccess = await userRequest("GET", `/api/v1/files/${fileId}/access`);
  assert.equal(ownerAccess.statusCode, 200, "file access request failed; response body suppressed");
  assert.match(ownerAccess.json().access.url, /test-quarantine-media/u);
  assert.equal((await app.inject({ method: "GET", url: `/api/v1/files/${fileId}` })).statusCode, 404);

  const approved = await adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "APPROVED", reason: "投诉证据结构检查通过" });
  assert.equal(approved.statusCode, 201, approved.body);
  assert.equal(latestCopy.source.bucket, "test-quarantine-media");
  assert.equal(latestCopy.destination.bucket, "test-private-media");
  const privateAccess = await userRequest("GET", `/api/v1/files/${fileId}/access`);
  assert.match(privateAccess.json().access.url, /test-private-media/u);
  assert.equal((await app.inject({ method: "GET", url: `/api/v1/files/${fileId}` })).statusCode, 404);

  const reverse = await adminRequest("POST", `/admin-api/v1/files/${fileId}/moderation`, { decision: "REJECTED", reason: "尝试反向修改最终审核结果" });
  assert.equal(reverse.statusCode, 409, reverse.body);
  assert.equal(reverse.json().code, "RESOURCE_VERSION_CONFLICT");
});

test("stage 6 deletion and orphan audit traverse real local MinIO without touching unknown objects", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({ endpoint: process.env.FILE_STORAGE_ENDPOINT, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY });
  const realConfig = { ...config, fileStorageProvider: "minio", fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT, fileStorageRegion: process.env.FILE_STORAGE_REGION, fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY, filePublicBucket: process.env.FILE_PUBLIC_BUCKET, filePrivateBucket: process.env.FILE_PRIVATE_BUCKET, fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET, publicAssetBaseUrl: undefined };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-stage6-minio-e2e", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("stage6-minio-e2e", () => {}) });
  const orphanLocation = { bucket: realConfig.fileQuarantineBucket, objectKey: `stage6-tests/${randomUUID()}/orphan.bin` };
  let fileId;
  let fileLocation;
  try {
    const bytes = png(128, 96);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await realApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${user.token}` }, payload: { file_type: "USER_AVATAR", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 } });
    assert.equal(requested.statusCode, 201);
    fileId = requested.json().file.id;
    const upload = requested.json().upload;
    assert.equal((await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes })).ok, true);
    assert.equal((await realApp.inject({ method: "POST", url: `/api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 201);
    const stored = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id = $1", [fileId]);
    fileLocation = { bucket: stored.rows[0].bucket, objectKey: stored.rows[0].object_key };
    assert.equal((await realApp.inject({ method: "DELETE", url: `/api/v1/files/${fileId}`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 200);
    const softDeleted = await migrationClient.query("SELECT upload_status, deleted_at FROM files WHERE id = $1", [fileId]);
    assert.equal(softDeleted.rows[0].upload_status, "DELETED");
    assert.ok(softDeleted.rows[0].deleted_at);
    await assert.rejects(() => realStorage.headObject(fileLocation), (error) => error?.code === "FILE_OBJECT_NOT_FOUND");
    assert.equal((await realApp.inject({ method: "DELETE", url: `/api/v1/files/${fileId}`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 200);
    const deletionJob = await migrationClient.query("SELECT status, attempts FROM scheduled_jobs WHERE job_key = $1", [`file:delete:${fileId}`]);
    assert.deepEqual(deletionJob.rows, [{ status: "COMPLETED", attempts: 1 }]);

    const orphanBytes = new Uint8Array([0x53, 0x36, 0x00, 0x01]);
    const orphanUpload = await realStorage.createUploadRequest({ ...orphanLocation, contentType: "application/octet-stream", sizeBytes: orphanBytes.byteLength, sha256: createHash("sha256").update(orphanBytes).digest("hex"), expiresInSeconds: 60 });
    assert.equal((await fetch(orphanUpload.url, { method: orphanUpload.method, headers: orphanUpload.headers, body: orphanBytes })).ok, true);
    const lifecycle = realApp.get(FileLifecycleService);
    const report = await lifecycle.auditOrphans({ buckets: [orphanLocation.bucket], prefix: orphanLocation.objectKey.slice(0, orphanLocation.objectKey.lastIndexOf("/") + 1), maxObjects: 10, pageSize: 1 });
    assert.equal(report.readOnly, true);
    assert.equal(report.counts.storage_without_database_record, 1);
    assert.equal(report.findings[0].locationId.length, 16);
    await realStorage.headObject(orphanLocation);
    await lifecycle.deleteStage6TestObject(orphanLocation);
    await assert.rejects(() => realStorage.headObject(orphanLocation), (error) => error?.code === "FILE_OBJECT_NOT_FOUND");
  } finally {
    if (fileLocation) await realStorage.deleteObject(fileLocation).catch(() => undefined);
    await realStorage.deleteObject(orphanLocation).catch(() => undefined);
    await realApp.close();
  }
});

test("rejected public image stays private in the real local MinIO and records one audit", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({ endpoint: process.env.FILE_STORAGE_ENDPOINT, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY });
  const realConfig = { ...config, fileStorageProvider: "minio", fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT, fileStorageRegion: process.env.FILE_STORAGE_REGION, fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY, filePublicBucket: process.env.FILE_PUBLIC_BUCKET, filePrivateBucket: process.env.FILE_PRIVATE_BUCKET, fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET, publicAssetBaseUrl: undefined };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-file-minio-reject", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("file-minio-reject", () => {}) });
  let fileId;
  try {
    const bytes = png(128, 128); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await realApp.inject({ method:"POST", url:"/api/v1/files/uploads", headers:{ authorization:`Bearer ${user.token}` }, payload:{ file_type:"USER_AVATAR", mime_type:"image/png", size_bytes:bytes.byteLength, sha256 } });
    assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed"); fileId = requested.json().file.id;
    const upload = requested.json().upload; const put = await fetch(upload.url, { method:upload.method, headers:upload.headers, body:bytes }); assert.equal(put.ok, true);
    assert.equal((await realApp.inject({ method:"POST", url:`/api/v1/files/${fileId}/complete`, headers:{ authorization:`Bearer ${user.token}` } })).statusCode, 201);
    const rejected = await realApp.inject({ method:"POST", url:`/admin-api/v1/files/${fileId}/moderation`, headers:{ authorization:`Bearer ${admin.token}` }, payload:{ decision:"REJECTED", reason:"本地人工审核拒绝测试" } });
    assert.equal(rejected.statusCode, 201, rejected.body); assert.equal(rejected.json().moderation_status, "REJECTED");
    assert.equal((await realApp.inject({ method:"GET", url:`/api/v1/files/${fileId}` })).statusCode, 404);
    const owner = await realApp.inject({ method:"GET", url:`/api/v1/files/${fileId}/access`, headers:{ authorization:`Bearer ${user.token}` } });
    assert.equal(owner.statusCode, 200, "file access request failed; response body suppressed"); assert.equal(owner.body.includes(process.env.FILE_QUARANTINE_BUCKET), true);
    const audit = await migrationClient.query("SELECT action, reason FROM admin_operation_logs WHERE target_id = $1", [fileId]);
    assert.deepEqual(audit.rows, [{ action:"FILE_REJECTED", reason:"本地人工审核拒绝测试" }]);
  } finally {
    if (fileId) { const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id = $1", [fileId]); if (location.rows[0]) await realStorage.deleteObject({ bucket:location.rows[0].bucket, objectKey:location.rows[0].object_key }).catch(() => undefined); }
    await realApp.close();
  }
});

test("rejected private evidence stays in quarantine and records exactly one audit", { skip: !realMinioEnabled }, async () => {
  const realStorage = new MinioStorageProvider({ endpoint: process.env.FILE_STORAGE_ENDPOINT, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY });
  const realConfig = { ...config, fileStorageProvider: "minio", fileStorageEndpoint: process.env.FILE_STORAGE_ENDPOINT, fileStorageRegion: process.env.FILE_STORAGE_REGION, fileStorageAccessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, fileStorageSecretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY, filePublicBucket: process.env.FILE_PUBLIC_BUCKET, filePrivateBucket: process.env.FILE_PRIVATE_BUCKET, fileQuarantineBucket: process.env.FILE_QUARANTINE_BUCKET, publicAssetBaseUrl: undefined };
  const realDatabase = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-file-minio-private-reject", options: `-c search_path=${schemaName},public`, max: 2 });
  const realApp = await createApiApp({ config: realConfig, databaseClient: realDatabase, objectStorageProvider: realStorage, logger: new JsonLogger("file-minio-private-reject", () => {}) });
  let fileId;
  try {
    const bytes = png(144, 96); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const requested = await realApp.inject({ method: "POST", url: "/api/v1/files/uploads", headers: { authorization: `Bearer ${user.token}` }, payload: { file_type: "COMPLAINT_EVIDENCE", mime_type: "image/png", size_bytes: bytes.byteLength, sha256 } });
    assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed"); fileId = requested.json().file.id;
    const upload = requested.json().upload;
    assert.equal((await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes })).ok, true);
    assert.equal((await realApp.inject({ method: "POST", url: `/api/v1/files/${fileId}/complete`, headers: { authorization: `Bearer ${user.token}` } })).statusCode, 201);
    const rejected = await realApp.inject({ method: "POST", url: `/admin-api/v1/files/${fileId}/moderation`, headers: { authorization: `Bearer ${admin.token}` }, payload: { decision: "REJECTED", reason: "本地私有证据拒绝测试" } });
    assert.equal(rejected.statusCode, 201, rejected.body);
    assert.equal(rejected.json().moderation_status, "REJECTED");
    assert.equal((await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}` })).statusCode, 404);
    const owner = await realApp.inject({ method: "GET", url: `/api/v1/files/${fileId}/access`, headers: { authorization: `Bearer ${user.token}` } });
    assert.equal(owner.statusCode, 200, "file access request failed; response body suppressed");
    assert.equal(owner.body.includes(process.env.FILE_QUARANTINE_BUCKET), true);
    const audit = await migrationClient.query("SELECT action, reason FROM admin_operation_logs WHERE target_id = $1", [fileId]);
    assert.deepEqual(audit.rows, [{ action: "FILE_REJECTED", reason: "本地私有证据拒绝测试" }]);
  } finally {
    if (fileId) { const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id = $1", [fileId]); if (location.rows[0]) await realStorage.deleteObject({ bucket: location.rows[0].bucket, objectKey: location.rows[0].object_key }).catch(() => undefined); }
    await realApp.close();
  }
});

function png(width, height) { const bytes = new Uint8Array(24); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); bytes.set([0x49, 0x48, 0x44, 0x52], 12); new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height); return bytes; }
function mp3Seconds(seconds) { const frame = new Uint8Array(417); frame.set([0xff, 0xfb, 0x90, 0x00]); const count = Math.ceil(seconds * 44_100 / 1_152); const bytes = new Uint8Array(frame.byteLength * count); for (let index = 0; index < count; index += 1) bytes.set(frame, index * frame.byteLength); return bytes; }
function mp4(handlerType, timescale, duration) { const mediaHeader = new Uint8Array(24); new DataView(mediaHeader.buffer).setUint32(12, timescale); new DataView(mediaHeader.buffer).setUint32(16, duration); const handler = new Uint8Array(24); handler.set(new TextEncoder().encode(handlerType), 8); return concat(box("ftyp", new TextEncoder().encode("M4A \0\0\0\0")), box("moov", box("trak", box("mdia", box("mdhd", mediaHeader), box("hdlr", handler))))); }
function box(type, ...parts) { const payload = concat(...parts); const result = new Uint8Array(payload.byteLength + 8); new DataView(result.buffer).setUint32(0, result.byteLength); result.set(new TextEncoder().encode(type), 4); result.set(payload, 8); return result; }
function concat(...parts) { const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.byteLength; } return result; }
async function seedUser() { const id = randomUUID(); const sessionId = randomUUID(); await migrationClient.query("INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask, profile_initialized) VALUES ($1, 'encrypted', $2, '138****0000', true)", [id, randomUUID().replaceAll("-", "").repeat(2)]); await migrationClient.query("INSERT INTO user_profiles (user_id, nickname, bio, public_user_no) VALUES ($1, '文件测试玩家', '隔离测试资料', $2)", [id, `XZ${id.replaceAll("-", "").slice(0, 16)}`]); await migrationClient.query("INSERT INTO auth_sessions (id, user_id, refresh_token_hash, device_id, device_type, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, 'WEB', '127.0.0.1', 'file-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2), `file-test-${id}`]); return { id, token: issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 }) }; }
async function ensureVoicePolicyVersion() { const existing = await migrationClient.query("SELECT id FROM policy_versions WHERE policy_type='VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION' AND status='PUBLISHED' ORDER BY version_no DESC LIMIT 1"); if (existing.rows[0]) return existing.rows[0].id; const id = randomUUID(); await migrationClient.query("INSERT INTO policy_versions (id, policy_type, title, content, version_no, status, published_at, effective_at) VALUES ($1, 'VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION', '声音名片公开播放授权', '本地文件存储集成测试授权文本', 1, 'PUBLISHED', now(), now())", [id]); return id; }
async function acceptVoicePolicy(userId, policyVersionId) { await migrationClient.query("INSERT INTO user_policy_acceptances (user_id, policy_version_id, acceptance_scene, confirmation_method, ip, user_agent) VALUES ($1, $2, 'VOICE_SAMPLE_UPLOAD', 'ONLINE_CONFIRM', '127.0.0.1', 'file-storage-integration-test') ON CONFLICT DO NOTHING", [userId, policyVersionId]); }
async function seedApprovedSellerMedia(userId, fileType, visibility, durationMs = null) { const id = randomUUID(); const mimeType = fileType === "VOICE_SAMPLE" ? "audio/mpeg" : "image/png"; await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,duration_ms,upload_status,moderation_status,visibility) VALUES ($1,$2,'fixture-media',$3,$4,$5,1024,$6,$7,'VERIFIED','APPROVED',$8)", [id, userId, `seller-fixture/${id}`, fileType, mimeType, randomUUID().replaceAll("-", "").repeat(2), durationMs, visibility]); return id; }
async function seedAdmin(permissionKeys, mfaVerified = true) { const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID(); await migrationClient.query("INSERT INTO admin_accounts (id, username, display_name, password_hash) VALUES ($1, $2, '文件审核员', 'not-used')", [id, `file-reviewer-${id}`]); await migrationClient.query("INSERT INTO admin_sessions (id, admin_id, session_token_hash, ip, user_agent, expires_at) VALUES ($1, $2, $3, '127.0.0.1', 'file-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]); await migrationClient.query("INSERT INTO roles (id, role_key, name) VALUES ($1, $2, '文件审核')", [roleId, `file-role-${roleId}`]); await migrationClient.query("INSERT INTO admin_roles (admin_id, role_id) VALUES ($1, $2)", [id, roleId]); for (const key of permissionKeys) { const permission = await migrationClient.query("INSERT INTO permissions (id, permission_key) VALUES ($1, $2) ON CONFLICT (permission_key) DO UPDATE SET permission_key = excluded.permission_key RETURNING id", [randomUUID(), key]); await migrationClient.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleId, permission.rows[0].id]); } return { id, token: issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: mfaVerified }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 }) }; }
async function createVerifiedFile(fileType, bytes) { const sha256 = createHash("sha256").update(bytes).digest("hex"); const requested = await userRequest("POST", "/api/v1/files/uploads", { file_type:fileType, mime_type:"image/png", size_bytes:bytes.byteLength, sha256 }); assert.equal(requested.statusCode, 201, "upload request failed; response body suppressed"); const fileId = requested.json().file.id; objects.set(`${latestUpload.bucket}/${latestUpload.objectKey}`, { body:bytes, contentType:"image/png", sizeBytes:bytes.byteLength, metadata:{ sha256, "size-bytes":String(bytes.byteLength) } }); assert.equal((await userRequest("POST", `/api/v1/files/${fileId}/complete`)).statusCode, 201); return fileId; }
function userRequest(method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${user.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function userRequestAs(actor, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${actor.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function adminRequest(method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${admin.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function adminRequestAs(actor, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${actor.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
async function waitFor(predicate, timeoutMs = 2_000) { const deadline = Date.now() + timeoutMs; while (!predicate()) { if (Date.now() >= deadline) throw new Error("Timed out waiting for local preview test state"); await new Promise((resolve) => setTimeout(resolve, 10)); } }
