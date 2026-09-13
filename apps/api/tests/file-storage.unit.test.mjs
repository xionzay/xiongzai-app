import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { AliyunOssStorageProvider, detectMime, InMemoryPreviewConcurrencyLimiter, inspectMedia, MinioStorageProvider, retryDelayMs } from "../dist/index.js";

test("file inspector detects image signatures and reads dimensions", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  png.set([0, 0, 2, 0, 0, 0, 1, 0], 16);
  assert.equal(detectMime(png), "image/png");
  assert.deepEqual(inspectMedia(png, "image/png"), { detectedMimeType: "image/png", width: 512, height: 256 });
  assert.throws(() => inspectMedia(png, "image/jpeg"), (error) => error.code === "FILE_MIME_MISMATCH");
  new DataView(png.buffer).setUint32(16, 10_000);
  new DataView(png.buffer).setUint32(20, 10_000);
  assert.throws(() => inspectMedia(png, "image/png"), (error) => error.code === "FILE_DIMENSIONS_INVALID");
});

test("file inspector calculates MP3 and ADTS AAC duration and only accepts audio MP4 tracks", () => {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  const mp3 = concat(frame, frame);
  assert.deepEqual(inspectMedia(mp3, "audio/mpeg"), { detectedMimeType: "audio/mpeg", durationMs: 52 });

  const aacFrame = Uint8Array.from([0xff, 0xf1, 0x50, 0x80, 0x00, 0xff, 0xfc]);
  assert.deepEqual(inspectMedia(concat(aacFrame, aacFrame), "audio/aac"), { detectedMimeType: "audio/aac", durationMs: 46 });

  const m4a = mp4("soun", 48_000, 480_000);
  assert.deepEqual(inspectMedia(m4a, "audio/mp4"), { detectedMimeType: "audio/mp4", durationMs: 10_000 });
  const ftyp = box("ftyp", new TextEncoder().encode("M4A \0\0\0\0"));
  const extendedMdatM4a = concat(ftyp, extendedBox("mdat"), m4a.subarray(ftyp.byteLength));
  assert.deepEqual(inspectMedia(extendedMdatM4a, "audio/mp4"), { detectedMimeType: "audio/mp4", durationMs: 10_000 });
  assert.equal(detectMime(mp4("vide", 48_000, 480_000)), "application/octet-stream");
});

test("MinIO provider creates path-style constrained SigV4 URLs", async () => {
  const provider = new MinioStorageProvider({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", accessKeyId: "test-access", secretAccessKey: "test-secret-value", now: () => new Date("2026-08-21T12:34:56.000Z") });
  const upload = await provider.createUploadRequest({ bucket: "public-media", objectKey: "user_avatar/2026/08/id with spaces", contentType: "image/png", sizeBytes: 128, sha256: "a".repeat(64), expiresInSeconds: 600 });
  const uploadUrl = new URL(upload.url);
  assert.equal(upload.method, "PUT");
  assert.deepEqual(upload.headers, { "content-type": "image/png", "x-amz-meta-sha256": "a".repeat(64), "x-amz-meta-size-bytes": "128" });
  assert.equal(uploadUrl.host, "127.0.0.1:9000");
  assert.equal(uploadUrl.pathname, "/public-media/user_avatar/2026/08/id%20with%20spaces");
  assert.equal(uploadUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(uploadUrl.searchParams.get("X-Amz-Credential"), "test-access/20260821/us-east-1/s3/aws4_request");
  assert.equal(uploadUrl.searchParams.get("X-Amz-Date"), "20260821T123456Z");
  assert.equal(uploadUrl.searchParams.get("X-Amz-SignedHeaders"), "content-type;host;x-amz-meta-sha256;x-amz-meta-size-bytes");
  assert.match(uploadUrl.searchParams.get("X-Amz-Signature"), /^[a-f0-9]{64}$/u);

  const download = await provider.createDownloadUrl({ bucket: "private-media", objectKey: "evidence/file", expiresInSeconds: 120 });
  assert.equal(new URL(download.url).searchParams.get("X-Amz-SignedHeaders"), "host");
});

test("MinIO provider signs CopyObject headers for quarantine promotion", async () => {
  const provider = new MinioStorageProvider({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", accessKeyId: "test-access", secretAccessKey: "test-secret-value", now: () => new Date("2026-08-21T12:34:56.000Z") });
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => { captured = { url: String(url), init }; return new Response("<CopyObjectResult/>", { status: 200 }); };
  try {
    await provider.copyObject({ source: { bucket: "quarantine-media", objectKey: "pending/image id" }, destination: { bucket: "public-media", objectKey: "approved/image id" } });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(new URL(captured.url).pathname, "/public-media/approved/image%20id");
  assert.equal(new URL(captured.url).searchParams.get("X-Amz-SignedHeaders"), "host;x-amz-copy-source;x-amz-metadata-directive");
  assert.equal(captured.init.method, "PUT");
  assert.deepEqual(captured.init.headers, { "x-amz-copy-source": "/quarantine-media/pending/image%20id", "x-amz-metadata-directive": "COPY" });
});

test("MinIO provider validates object metadata with a signed HEAD request", async () => {
  const provider = new MinioStorageProvider({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", accessKeyId: "test-access", secretAccessKey: "test-secret-value", now: () => new Date("2026-08-21T12:34:56.000Z") });
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(null, { status: 200, headers: { "content-length": "128", "content-type": "image/png", "x-amz-meta-sha256": "a".repeat(64), "x-amz-meta-size-bytes": "128" } });
  };
  try {
    assert.deepEqual(await provider.headObject({ bucket: "quarantine-media", objectKey: "pending/image" }), { contentType: "image/png", sizeBytes: 128, metadata: { sha256: "a".repeat(64), "size-bytes": "128" } });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(captured.init.method, "HEAD");
  assert.equal(new URL(captured.url).pathname, "/quarantine-media/pending/image");
  assert.equal(new URL(captured.url).searchParams.get("X-Amz-SignedHeaders"), "host");
});

test("MinIO provider streams exact ranges without returning a presigned URL", async () => {
  const provider = new MinioStorageProvider({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", accessKeyId: "test-access", secretAccessKey: "test-secret-value", now: () => new Date("2026-08-21T12:34:56.000Z") });
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(Uint8Array.from([2, 3, 4, 5]), { status: 206, headers: { "content-length": "4", "content-range": "bytes 2-5/8", "content-type": "image/png" } });
  };
  try {
    const streamed = await provider.readObjectStream({ bucket: "private-media", objectKey: "evidence/file", range: { start: 2, end: 5 }, maximumBytes: 4, timeoutMs: 1_000 });
    const chunks = [];
    for await (const chunk of streamed.body) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from([2, 3, 4, 5]));
    assert.deepEqual({ contentLength: streamed.contentLength, totalSize: streamed.totalSize, range: streamed.range }, { contentLength: 4, totalSize: 8, range: { start: 2, end: 5 } });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(captured.init.headers.range, "bytes=2-5");
  assert.equal(new URL(captured.url).searchParams.get("X-Amz-SignedHeaders"), "host");
});

test("single-process preview limiter admits four, rejects the fifth and releases idempotently", () => {
  const limiter = new InMemoryPreviewConcurrencyLimiter(4);
  const leases = Array.from({ length: 4 }, () => limiter.acquire());
  assert.equal(leases.every(Boolean), true);
  assert.equal(limiter.activeCount, 4);
  assert.equal(limiter.acquire(), null);
  leases[0].release();
  leases[0].release();
  assert.equal(limiter.activeCount, 3);
  assert.ok(limiter.acquire());
  assert.equal(limiter.activeCount, 4);
});

test("preview limiter remains explicitly per-instance rather than pretending to be global", () => {
  const first = new InMemoryPreviewConcurrencyLimiter(4);
  const second = new InMemoryPreviewConcurrencyLimiter(4);
  const leases = [...Array.from({ length: 4 }, () => first.acquire()), ...Array.from({ length: 4 }, () => second.acquire())];
  assert.equal(leases.every(Boolean), true);
  assert.equal(first.acquire(), null);
  assert.equal(second.acquire(), null);
  leases.forEach((lease) => lease.release());
  assert.deepEqual([first.activeCount, second.activeCount], [0, 0]);
});

test("streaming storage timeout returns a safe error and sequential ranges stay memory-bounded", async (t) => {
  const provider = new MinioStorageProvider({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", accessKeyId: "test-access", secretAccessKey: "test-secret-value" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("internal storage endpoint credential")), { once: true }));
  try {
    await assert.rejects(() => provider.readObjectStream({ bucket: "private-media", objectKey: "evidence/file", maximumBytes: 1024, timeoutMs: 250 }), (error) => error.code === "FILE_STORAGE_READ_FAILED" && !error.message.includes("credential"));
  } finally { globalThis.fetch = originalFetch; }

  const chunk = new Uint8Array(64 * 1_024);
  const before = process.memoryUsage().heapUsed;
  globalThis.fetch = async () => new Response(chunk, { status: 206, headers: { "content-length": String(chunk.byteLength), "content-range": `bytes 0-${chunk.byteLength - 1}/${20 * 1_024 * 1_024}`, "content-type": "audio/mpeg" } });
  try {
    for (let index = 0; index < 64; index += 1) {
      const streamed = await provider.readObjectStream({ bucket: "private-media", objectKey: `voice/${index}`, range: { start: 0, end: chunk.byteLength - 1 }, maximumBytes: chunk.byteLength, timeoutMs: 1_000 });
      let received = 0;
      for await (const part of streamed.body) received += part.byteLength;
      assert.equal(received, chunk.byteLength);
      assert.equal(streamed.totalSize, 20 * 1_024 * 1_024);
    }
  } finally { globalThis.fetch = originalFetch; }
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - before);
  t.diagnostic(JSON.stringify({ scenario: "64 sequential 64KiB range streams", heap_delta_bytes: heapDeltaBytes }));
  assert.ok(heapDeltaBytes < 64 * 1_024 * 1_024);
});

test("MinIO provider lists objects read-only with pagination and rejects traversal keys", async () => {
  const provider = new MinioStorageProvider({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", accessKeyId: "test-access", secretAccessKey: "test-secret-value", now: () => new Date("2026-08-21T12:34:56.000Z") });
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response("<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;safe</NextContinuationToken><Contents><Key>stage6-tests/id/a&amp;b.bin</Key><LastModified>2026-08-21T12:30:00.000Z</LastModified><Size>3</Size></Contents></ListBucketResult>", { status: 200 });
  };
  try {
    const page = await provider.listObjects({ bucket: "quarantine-media", prefix: "stage6-tests/id/", cursor: "cursor-token", limit: 1 });
    assert.equal(page.truncated, true);
    assert.equal(page.nextCursor, "next&safe");
    assert.deepEqual(page.objects.map(({ objectKey, sizeBytes }) => ({ objectKey, sizeBytes })), [{ objectKey: "stage6-tests/id/a&b.bin", sizeBytes: 3 }]);
  } finally { globalThis.fetch = originalFetch; }
  const url = new URL(captured.url);
  assert.equal(captured.init.method, "GET");
  assert.match(captured.init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-access\//u);
  assert.equal(captured.init.headers["x-amz-content-sha256"], createHash("sha256").update("").digest("hex"));
  assert.equal(url.pathname, "/quarantine-media/");
  assert.equal(url.searchParams.get("list-type"), "2");
  assert.equal(url.searchParams.get("prefix"), "stage6-tests/id/");
  assert.equal(url.searchParams.get("continuation-token"), "cursor-token");
  assert.equal(url.searchParams.has("X-Amz-Signature"), false);
  await assert.rejects(() => provider.createDownloadUrl({ bucket: "quarantine-media", objectKey: "safe/../escape", expiresInSeconds: 60 }), (error) => error.code === "FILE_STORAGE_INVALID_LOCATION");
  await assert.rejects(() => provider.createDownloadUrl({ bucket: "../bucket", objectKey: "safe", expiresInSeconds: 60 }), (error) => error.code === "FILE_STORAGE_INVALID_LOCATION");
});

test("file lifecycle retry delay is deterministic, jittered and bounded", () => {
  assert.equal(retryDelayMs(1, "stable-job"), retryDelayMs(1, "stable-job"));
  assert.ok(retryDelayMs(1, "stable-job") >= 1_000);
  assert.ok(retryDelayMs(20, "stable-job") <= 375_000);
  assert.notEqual(retryDelayMs(2, "stable-job"), retryDelayMs(2, "another-job"));
});

test("Aliyun OSS provider exposes an explicit SDK adapter boundary", () => {
  const provider = new AliyunOssStorageProvider({ endpoint: "https://oss-cn-hangzhou.aliyuncs.com", region: "oss-cn-hangzhou", accessKeyId: "test-access", accessKeySecret: "test-secret-value" });
  assert.throws(() => provider.headObject({ bucket: "private-media", objectKey: "evidence/file" }), (error) => error.code === "FILE_STORAGE_UNAVAILABLE");
});

function mp4(handlerType, timescale, duration) {
  const mediaHeader = new Uint8Array(24);
  new DataView(mediaHeader.buffer).setUint32(12, timescale);
  new DataView(mediaHeader.buffer).setUint32(16, duration);
  const handler = new Uint8Array(24);
  handler.set(new TextEncoder().encode(handlerType), 8);
  return concat(box("ftyp", new TextEncoder().encode("M4A \0\0\0\0")), box("moov", box("trak", box("mdia", box("mdhd", mediaHeader), box("hdlr", handler)))));
}
function box(type, ...parts) { const payload = concat(...parts); const result = new Uint8Array(payload.byteLength + 8); new DataView(result.buffer).setUint32(0, result.byteLength); result.set(new TextEncoder().encode(type), 4); result.set(payload, 8); return result; }
function extendedBox(type, ...parts) { const payload = concat(...parts); const result = new Uint8Array(payload.byteLength + 16); const view = new DataView(result.buffer); view.setUint32(0, 1); result.set(new TextEncoder().encode(type), 4); view.setBigUint64(8, BigInt(result.byteLength)); result.set(payload, 16); return result; }
function concat(...parts) { const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.byteLength; } return result; }
