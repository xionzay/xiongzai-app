import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { inspectMedia, MinioStorageProvider } from "../dist/index.js";

const required = ["FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID", "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}.`);
if (process.env.FILE_STORAGE_PROVIDER !== "minio") throw new Error("FILE_STORAGE_PROVIDER must be minio.");

const provider = new MinioStorageProvider({
  endpoint: process.env.FILE_STORAGE_ENDPOINT,
  region: process.env.FILE_STORAGE_REGION,
  accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY,
});
const body = png(320, 180);
const sha256 = createHash("sha256").update(body).digest("hex");
const token = randomUUID();
const quarantine = { bucket: process.env.FILE_QUARANTINE_BUCKET, objectKey: `verification/${token}/source.png` };
const publicCopy = { bucket: process.env.FILE_PUBLIC_BUCKET, objectKey: `verification/${token}/public.png` };
const privateCopy = { bucket: process.env.FILE_PRIVATE_BUCKET, objectKey: `verification/${token}/private.png` };

try {
  const upload = await provider.createUploadRequest({ ...quarantine, contentType: "image/png", sizeBytes: body.byteLength, sha256, expiresInSeconds: 300 });
  const corsAllowed = await preflight(upload.url, "http://localhost:3001");
  assert.equal(corsAllowed.allowed, true);
  const corsRejected = await preflight(upload.url, "https://example.invalid");
  assert.equal(corsRejected.allowed, false);

  const uploadResponse = await fetch(upload.url, { method: "PUT", headers: upload.headers, body });
  assert.equal(uploadResponse.ok, true);

  const unsignedObjectUrl = `${process.env.FILE_STORAGE_ENDPOINT.replace(/\/+$/u, "")}/${quarantine.bucket}/${quarantine.objectKey}`;
  const anonymousResponse = await fetch(unsignedObjectUrl);
  assert.equal([401, 403].includes(anonymousResponse.status), true);

  const head = await provider.headObject(quarantine);
  assert.deepEqual(head, { contentType: "image/png", sizeBytes: body.byteLength, metadata: { sha256, "size-bytes": String(body.byteLength) } });

  const stored = await provider.readObject({ ...quarantine, maximumBytes: 1024 });
  assert.equal(createHash("sha256").update(stored.body).digest("hex"), sha256);
  assert.deepEqual(inspectMedia(stored.body, stored.contentType), { detectedMimeType: "image/png", width: 320, height: 180 });

  const download = await provider.createDownloadUrl({ ...quarantine, expiresInSeconds: 300 });
  const downloadResponse = await fetch(download.url);
  assert.equal(downloadResponse.ok, true);
  assert.equal(createHash("sha256").update(new Uint8Array(await downloadResponse.arrayBuffer())).digest("hex"), sha256);

  await provider.copyObject({ source: quarantine, destination: publicCopy });
  await provider.copyObject({ source: quarantine, destination: privateCopy });
  assert.equal((await provider.headObject(publicCopy)).metadata.sha256, sha256);
  assert.equal((await provider.headObject(privateCopy)).metadata.sha256, sha256);

  const temporaryObjects = [quarantine, publicCopy, privateCopy];
  await Promise.all(temporaryObjects.map((location) => provider.deleteObject(location)));
  for (const location of temporaryObjects) {
    await assert.rejects(
      provider.headObject(location),
      (error) => error?.code === "FILE_OBJECT_NOT_FOUND",
    );
  }

  console.log(JSON.stringify({
    presigned_put: "passed",
    presigned_get: "passed",
    head: "passed",
    server_read: "passed",
    quarantine_to_public_copy: "passed",
    quarantine_to_private_copy: "passed",
    delete: "passed",
    sha256_mime_dimensions: "passed",
    cors_allowed_origins: "passed",
    cors_untrusted_origin_rejected: "passed",
    anonymous_object_access_rejected: "passed",
  }, null, 2));
} finally {
  await Promise.allSettled([quarantine, publicCopy, privateCopy].map((location) => provider.deleteObject(location)));
}

async function preflight(url, origin) {
  const response = await fetch(url, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type,x-amz-meta-sha256,x-amz-meta-size-bytes",
    },
  });
  return { allowed: response.ok && response.headers.get("access-control-allow-origin") === origin };
}

function png(width, height) {
  const result = new Uint8Array(24);
  result.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  result.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(result.buffer).setUint32(16, width);
  new DataView(result.buffer).setUint32(20, height);
  return result;
}
