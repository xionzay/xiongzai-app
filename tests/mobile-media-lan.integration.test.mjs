import assert from "node:assert/strict";
import test from "node:test";
import { networkInterfaces } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { MinioStorageProvider } from "../apps/api/dist/index.js";
import { createLocalBridge, privateHost } from "../scripts/mobile-local-lan.mjs";

test("real local MinIO device endpoint signs original Host, streams ranges and rejects altered or expired grants", async () => {
  const keys = ["FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID", "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PRIVATE_BUCKET"];
  if (keys.some(key => !process.env[key])) throw new Error("Missing local media keys: " + keys.filter(key => !process.env[key]).join(", "));
  const endpoint = new URL(process.env.FILE_STORAGE_ENDPOINT);
  if (!/^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/u.test(endpoint.hostname)) throw new Error("Invalid local key: FILE_STORAGE_ENDPOINT");
  const host = Object.values(networkInterfaces()).flat().find(item => item?.family === "IPv4" && !item.internal && privateHost(item.address))?.address;
  if (!host) throw new Error("Local media acceptance requires an available private LAN interface; not skipped");
  const bucket = process.env.FILE_PRIVATE_BUCKET;
  const bridge = createLocalBridge({ host, port: 0, upstreamPort: Number(endpoint.port || 80), mode: "media", buckets: ["synthetic-public-not-used", bucket] });
  await new Promise((resolve, reject) => { bridge.once("error", reject); bridge.listen(0, host, resolve); });
  const options = { endpoint: endpoint.href, region: process.env.FILE_STORAGE_REGION, accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY };
  const internal = new MinioStorageProvider(options), client = new MinioStorageProvider({ ...options, clientEndpoint: `http://${host}:${bridge.address().port}` });
  const location = { bucket, objectKey: `native-device-test/${randomUUID()}/synthetic.bin` }, bytes = Buffer.alloc(64, 17);
  let uploaded = false;
  try {
    const upload = await client.createUploadRequest({ ...location, contentType: "application/octet-stream", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), expiresInSeconds: 60 });
    const put = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: bytes });
    assert.equal(put.status, 200); uploaded = true;
    assert.equal((await internal.headObject(location)).sizeBytes, bytes.length);
    const grant = await client.createDownloadUrl({ ...location, expiresInSeconds: 60 });
    const response = await fetch(grant.url); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store, private"); assert.equal((await response.arrayBuffer()).byteLength, 64);
    const range = await fetch(grant.url, { headers: { range: "bytes=3-12" } }); assert.equal(range.status, 206); assert.equal(range.headers.get("content-range"), "bytes 3-12/64"); assert.equal((await range.arrayBuffer()).byteLength, 10);
    const invalid = await fetch(grant.url, { headers: { range: "bytes=100-200" } }); assert.equal(invalid.status, 416); await invalid.body?.cancel();
    const altered = new URL(grant.url); altered.host = endpoint.host;
    const badHost = await fetch(altered); assert.equal(badHost.status, 403); await badHost.body?.cancel();
    const unsigned = new URL(grant.url); unsigned.search = ""; assert.equal((await fetch(unsigned)).status, 403);
    const expiring = await client.createDownloadUrl({ ...location, expiresInSeconds: 1 });
    await new Promise(resolve => setTimeout(resolve, 1_250));
    const expired = await fetch(expiring.url); assert.equal(expired.status, 403); await expired.body?.cancel();
  } finally {
    if (uploaded) await internal.deleteObject(location);
    const page = await internal.listObjects({ bucket, prefix: location.objectKey, limit: 10 }); assert.equal(page.objects.length, 0, "only this test's unique object was cleaned");
    bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve));
  }
});
