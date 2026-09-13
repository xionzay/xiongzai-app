import { createHmac, createHash } from "node:crypto";
import { PassThrough, Readable, Transform, pipeline } from "node:stream";
import { AppError, type ErrorCode } from "@xiongzai/contracts";

export interface ObjectLocation {
  bucket: string;
  objectKey: string;
}

export interface UploadRequest extends ObjectLocation {
  contentType: string;
  sizeBytes: number;
  sha256: string;
  expiresInSeconds: number;
}

export interface PresignedRequest {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  sizeBytes: number;
  metadata: Record<string, string>;
}

export interface StoredObjectStream {
  body: Readable;
  contentType: string;
  contentLength: number;
  totalSize: number;
  range: { start: number; end: number } | null;
  metadata: Record<string, string>;
}

export interface StoredObjectHead {
  contentType: string;
  sizeBytes: number;
  metadata: Record<string, string>;
}

export interface ListedObject {
  objectKey: string;
  sizeBytes: number;
  lastModified: Date | null;
}

export interface ObjectListPage {
  objects: ListedObject[];
  nextCursor: string | null;
  truncated: boolean;
}

export interface ObjectStorageProvider {
  createUploadRequest(input: UploadRequest): Promise<PresignedRequest>;
  headObject(input: ObjectLocation): Promise<StoredObjectHead>;
  readObject(input: ObjectLocation & { maximumBytes: number; timeoutMs?: number }): Promise<StoredObject>;
  readObjectStream(input: ObjectLocation & { maximumBytes: number; timeoutMs?: number; range?: { start: number; end: number }; signal?: AbortSignal }): Promise<StoredObjectStream>;
  createDownloadUrl(input: ObjectLocation & { expiresInSeconds: number }): Promise<{ url: string; expiresAt: Date }>;
  copyObject(input: { source: ObjectLocation; destination: ObjectLocation }): Promise<void>;
  deleteObject(input: ObjectLocation): Promise<void>;
  listObjects(input: { bucket: string; prefix?: string; cursor?: string; limit: number }): Promise<ObjectListPage>;
}

export interface S3CompatibleStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: () => Date;
}

export class S3CompatibleStorageProvider implements ObjectStorageProvider {
  constructor(private readonly config: S3CompatibleStorageConfig) {}

  async createUploadRequest(input: UploadRequest): Promise<PresignedRequest> {
    const headers = { "content-type": input.contentType, "x-amz-meta-sha256": input.sha256, "x-amz-meta-size-bytes": String(input.sizeBytes) };
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1_000);
    return {
      method: "PUT",
      url: this.presign("PUT", input, input.expiresInSeconds, headers),
      headers,
      expiresAt,
    };
  }

  async headObject(input: ObjectLocation): Promise<StoredObjectHead> {
    let response: Response;
    try { response = await fetch(this.presign("HEAD", input, 60), { method: "HEAD" }); }
    catch (error) { throw new AppError({ code: "FILE_STORAGE_READ_FAILED", message: "对象存储暂时无法校验文件", statusCode: 503, cause: error }); }
    if (response.status === 404) throw storageError("FILE_OBJECT_NOT_FOUND", "尚未在对象存储中找到该文件", 409);
    if (!response.ok) throw storageError("FILE_STORAGE_READ_FAILED", "对象存储暂时无法校验文件", 503);
    return responseHead(response);
  }

  async readObject(input: ObjectLocation & { maximumBytes: number; timeoutMs?: number }): Promise<StoredObject> {
    let response: Response;
    try { response = await fetch(this.presign("GET", input, 60), { signal: AbortSignal.timeout(Math.min(Math.max(input.timeoutMs ?? 5_000, 250), 30_000)) }); }
    catch (error) { throw new AppError({ code: "FILE_STORAGE_READ_FAILED", message: "对象存储暂时无法校验文件", statusCode: 503, cause: error }); }
    if (response.status === 404) throw storageError("FILE_OBJECT_NOT_FOUND", "尚未在对象存储中找到该文件", 409);
    if (!response.ok) throw storageError("FILE_STORAGE_READ_FAILED", "对象存储暂时无法校验文件", 503);
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > input.maximumBytes) {
      await response.body?.cancel();
      throw storageError("FILE_SIZE_MISMATCH", "对象大小超过已申请的限制", 400);
    }
    let body: Uint8Array;
    try { body = await readLimitedBody(response, input.maximumBytes); }
    catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({ code: "FILE_STORAGE_READ_FAILED", message: "对象存储暂时无法校验文件", statusCode: 503, cause: error });
    }
    const head = responseHead(response);
    return {
      body,
      contentType: head.contentType,
      sizeBytes: body.byteLength,
      metadata: head.metadata,
    };
  }

  async readObjectStream(input: ObjectLocation & { maximumBytes: number; timeoutMs?: number; range?: { start: number; end: number }; signal?: AbortSignal }): Promise<StoredObjectStream> {
    const timeoutController = new AbortController();
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 5_000, 250), 30_000);
    const timeout = setTimeout(() => timeoutController.abort(new Error("object_storage_stream_timeout")), timeoutMs);
    timeout.unref();
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutController.signal]) : timeoutController.signal;
    const headers = input.range ? { range: `bytes=${input.range.start}-${input.range.end}` } : undefined;
    let response: Response;
    try {
      response = await fetch(this.presign("GET", input, 60), { headers, signal });
    } catch (error) {
      clearTimeout(timeout);
      throw new AppError({ code: "FILE_STORAGE_READ_FAILED", message: "对象存储暂时无法读取文件", statusCode: 503, cause: error });
    }
    if (response.status === 404) {
      clearTimeout(timeout);
      throw storageError("FILE_OBJECT_NOT_FOUND", "尚未在对象存储中找到该文件", 409);
    }
    if (!response.ok || (input.range && response.status !== 206) || (!input.range && response.status !== 200)) {
      clearTimeout(timeout);
      await response.body?.cancel().catch(() => undefined);
      throw storageError("FILE_STORAGE_READ_FAILED", "对象存储暂时无法读取文件", 503);
    }

    const contentLength = parseSafeLength(response.headers.get("content-length"));
    const parsedRange = input.range ? parseContentRange(response.headers.get("content-range")) : null;
    const totalSize = parsedRange?.total ?? contentLength;
    if (contentLength < 0 || contentLength > input.maximumBytes || totalSize < contentLength) {
      clearTimeout(timeout);
      await response.body?.cancel().catch(() => undefined);
      throw storageError("FILE_SIZE_MISMATCH", "对象大小超过已申请的限制", 400);
    }
    if (input.range && (!parsedRange || parsedRange.start !== input.range.start || parsedRange.end !== input.range.end || contentLength !== input.range.end - input.range.start + 1)) {
      clearTimeout(timeout);
      await response.body?.cancel().catch(() => undefined);
      throw storageError("FILE_SIZE_MISMATCH", "对象存储返回的文件范围不一致", 400);
    }
    if (!response.body) {
      clearTimeout(timeout);
      throw storageError("FILE_STORAGE_READ_FAILED", "对象存储没有返回文件内容", 503);
    }

    const source = Readable.fromWeb(response.body as never);
    const output = new PassThrough();
    const limit = new ByteLimitTransform(input.maximumBytes);
    const cleanup = () => clearTimeout(timeout);
    output.once("close", cleanup);
    output.once("end", cleanup);
    pipeline(source, limit, output, () => cleanup());
    const head = responseHead(response);
    return {
      body: output,
      contentType: head.contentType,
      contentLength,
      totalSize,
      range: parsedRange ? { start: parsedRange.start, end: parsedRange.end } : null,
      metadata: head.metadata,
    };
  }

  async createDownloadUrl(input: ObjectLocation & { expiresInSeconds: number }): Promise<{ url: string; expiresAt: Date }> {
    return { url: this.presign("GET", input, input.expiresInSeconds), expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000) };
  }

  async copyObject(input: { source: ObjectLocation; destination: ObjectLocation }): Promise<void> {
    const headers = {
      "x-amz-copy-source": `/${[input.source.bucket, ...input.source.objectKey.split("/")].map(rfc3986).join("/")}`,
      "x-amz-metadata-directive": "COPY",
    };
    let response: Response;
    try {
      response = await fetch(this.presign("PUT", input.destination, 60, headers), { method: "PUT", headers });
    } catch (error) {
      throw new AppError({ code: "FILE_STORAGE_COPY_FAILED", message: "对象存储暂时无法移动审核文件", statusCode: 503, cause: error });
    }
    if (!response.ok) throw storageError("FILE_STORAGE_COPY_FAILED", "对象存储暂时无法移动审核文件", 503);
  }

  async deleteObject(input: ObjectLocation): Promise<void> {
    let response: Response;
    try { response = await fetch(this.presign("DELETE", input, 60), { method: "DELETE" }); }
    catch (error) { throw new AppError({ code: "FILE_STORAGE_DELETE_FAILED", message: "对象存储暂时无法删除文件", statusCode: 503, cause: error }); }
    if (response.status === 401 || response.status === 403) throw storageError("FILE_STORAGE_PERMISSION_DENIED", "对象存储拒绝删除请求", 503);
    if (!response.ok && response.status !== 404) throw storageError("FILE_STORAGE_DELETE_FAILED", "对象存储暂时无法删除文件", 503);
  }

  async listObjects(input: { bucket: string; prefix?: string; cursor?: string; limit: number }): Promise<ObjectListPage> {
    const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 1_000);
    const query: Record<string, string> = { "list-type": "2", "max-keys": String(limit) };
    if (input.prefix) query.prefix = input.prefix;
    if (input.cursor) query["continuation-token"] = input.cursor;
    let response: Response;
    try {
      const request = this.authorizeReadOnlyList({ bucket: input.bucket, objectKey: "" }, query);
      response = await fetch(request.url, { method: "GET", headers: request.headers });
    }
    catch (error) { throw new AppError({ code: "FILE_STORAGE_LIST_FAILED", message: "对象存储暂时无法执行只读审计", statusCode: 503, cause: error }); }
    if (response.status === 401 || response.status === 403) throw storageError("FILE_STORAGE_PERMISSION_DENIED", "对象存储拒绝只读审计请求", 503);
    if (!response.ok) throw storageError("FILE_STORAGE_LIST_FAILED", "对象存储暂时无法执行只读审计", 503);
    return parseListObjectsXml(await response.text());
  }

  private authorizeReadOnlyList(location: ObjectLocation, requestQuery: Record<string, string>): { url: string; headers: Record<string, string> } {
    const now = this.config.now?.() ?? new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, "");
    const date = amzDate.slice(0, 8);
    const credentialScope = `${date}/${this.config.region}/s3/aws4_request`;
    const url = objectUrl(this.config.endpoint, location.bucket, location.objectKey);
    const canonicalQuery = canonicalQueryString(requestQuery);
    const payloadHash = sha256("");
    const canonicalHeaders = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const signedHeaders = Object.keys(canonicalHeaders).sort().join(";");
    const canonicalHeaderString = Object.entries(canonicalHeaders).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}:${value}\n`).join("");
    const canonicalRequest = ["GET", url.pathname, canonicalQuery, canonicalHeaderString, signedHeaders, payloadHash].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
    const signature = hexHmac(signingKey(this.config.secretAccessKey, date, this.config.region), stringToSign);
    url.search = canonicalQuery;
    return {
      url: url.toString(),
      headers: {
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };
  }

  private presign(method: "GET" | "HEAD" | "PUT" | "DELETE", location: ObjectLocation, expiresInSeconds: number, headers: Record<string, string> = {}, requestQuery: Record<string, string> = {}): string {
    const expires = Math.min(Math.max(Math.trunc(expiresInSeconds), 1), 604_800);
    const now = this.config.now?.() ?? new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, "");
    const date = amzDate.slice(0, 8);
    const credentialScope = `${date}/${this.config.region}/s3/aws4_request`;
    const url = objectUrl(this.config.endpoint, location.bucket, location.objectKey);
    const canonicalHeaders = { host: url.host, ...normalizeHeaders(headers) };
    const signedHeaders = Object.keys(canonicalHeaders).sort().join(";");
    const query: Record<string, string> = {
      ...requestQuery,
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expires),
      "X-Amz-SignedHeaders": signedHeaders,
    };
    const canonicalQuery = canonicalQueryString(query);
    const canonicalHeaderString = Object.entries(canonicalHeaders).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}:${value.trim().replace(/\s+/gu, " ")}\n`).join("");
    const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaderString, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
    const signature = hexHmac(signingKey(this.config.secretAccessKey, date, this.config.region), stringToSign);
    url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return url.toString();
  }
}

/** MinIO uses the S3 Signature V4 protocol with path-style bucket URLs. */
export class MinioStorageProvider extends S3CompatibleStorageProvider {}

/**
 * Boundary for the future official Aliyun OSS SDK adapter. OSS uses its own V4
 * signing and SDK semantics, so it must not silently reuse the MinIO signer.
 */
export type AliyunOssClientAdapter = ObjectStorageProvider;

export interface AliyunOssStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
}

export class AliyunOssStorageProvider implements ObjectStorageProvider {
  constructor(readonly config: AliyunOssStorageConfig, private readonly adapter?: AliyunOssClientAdapter) {}
  private client(): AliyunOssClientAdapter {
    if (!this.adapter) throw storageError("FILE_STORAGE_UNAVAILABLE", "阿里云 OSS 适配器尚未安装或注入", 503);
    return this.adapter;
  }
  createUploadRequest(input: UploadRequest): Promise<PresignedRequest> { return this.client().createUploadRequest(input); }
  headObject(input: ObjectLocation): Promise<StoredObjectHead> { return this.client().headObject(input); }
  readObject(input: ObjectLocation & { maximumBytes: number; timeoutMs?: number }): Promise<StoredObject> { return this.client().readObject(input); }
  readObjectStream(input: ObjectLocation & { maximumBytes: number; timeoutMs?: number; range?: { start: number; end: number }; signal?: AbortSignal }): Promise<StoredObjectStream> { return this.client().readObjectStream(input); }
  createDownloadUrl(input: ObjectLocation & { expiresInSeconds: number }): Promise<{ url: string; expiresAt: Date }> { return this.client().createDownloadUrl(input); }
  copyObject(input: { source: ObjectLocation; destination: ObjectLocation }): Promise<void> { return this.client().copyObject(input); }
  deleteObject(input: ObjectLocation): Promise<void> { return this.client().deleteObject(input); }
  listObjects(input: { bucket: string; prefix?: string; cursor?: string; limit: number }): Promise<ObjectListPage> { return this.client().listObjects(input); }
}

export class DisabledObjectStorageProvider implements ObjectStorageProvider {
  private unavailable(): never { throw storageError("FILE_STORAGE_UNAVAILABLE", "文件存储服务尚未配置", 503); }
  async createUploadRequest(): Promise<PresignedRequest> { return this.unavailable(); }
  async headObject(): Promise<StoredObjectHead> { return this.unavailable(); }
  async readObject(): Promise<StoredObject> { return this.unavailable(); }
  async readObjectStream(): Promise<StoredObjectStream> { return this.unavailable(); }
  async createDownloadUrl(): Promise<{ url: string; expiresAt: Date }> { return this.unavailable(); }
  async copyObject(): Promise<void> { return this.unavailable(); }
  async deleteObject(): Promise<void> { return this.unavailable(); }
  async listObjects(): Promise<ObjectListPage> { return this.unavailable(); }
}

function responseHead(response: Response): StoredObjectHead {
  const metadata: Record<string, string> = {};
  response.headers.forEach((value, key) => { if (key.startsWith("x-amz-meta-")) metadata[key.slice(11)] = value; });
  const sizeBytes = Number(response.headers.get("content-length") ?? "0");
  return {
    contentType: response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "application/octet-stream",
    sizeBytes: Number.isSafeInteger(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0,
    metadata,
  };
}

class ByteLimitTransform extends Transform {
  private total = 0;
  constructor(private readonly maximumBytes: number) { super(); }
  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    this.total += chunk.byteLength;
    if (this.total > this.maximumBytes) {
      callback(storageError("FILE_SIZE_MISMATCH", "对象大小超过已申请的限制", 400));
      return;
    }
    callback(null, chunk);
  }
}

function parseSafeLength(value: string | null): number {
  if (!value || !/^\d+$/u.test(value)) return -1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = value ? /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(value) : null;
  if (!match) return null;
  const start = Number(match[1]); const end = Number(match[2]); const total = Number(match[3]);
  return [start, end, total].every((item) => Number.isSafeInteger(item) && item >= 0) && start <= end && end < total ? { start, end, total } : null;
}

function objectUrl(endpoint: string, bucket: string, objectKey: string): URL {
  if (!/^[a-z0-9][a-z0-9.-]{1,62}$/u.test(bucket)) throw storageError("FILE_STORAGE_INVALID_LOCATION", "对象存储位置无效", 500);
  const segments = objectKey ? objectKey.split("/") : [];
  if (objectKey.includes("\0") || objectKey.includes("\\") || objectKey.length > 1_024 || segments.some((segment) => segment === "." || segment === "..")) throw storageError("FILE_STORAGE_INVALID_LOCATION", "对象存储位置无效", 500);
  const base = endpoint.replace(/\/+$/u, "");
  const path = `${[bucket, ...segments].map(rfc3986).join("/")}${objectKey ? "" : "/"}`;
  return new URL(`${base}/${path}`);
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.entries(query).map(([key, value]) => [rfc3986(key), rfc3986(value)] as const).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("&");
}

function rfc3986(value: string): string { return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function hmac(key: string | Buffer, value: string): Buffer { return createHmac("sha256", key).update(value).digest(); }
function hexHmac(key: Buffer, value: string): string { return createHmac("sha256", key).update(value).digest("hex"); }
function signingKey(secret: string, date: string, region: string): Buffer { return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request"); }
function storageError(code: ErrorCode, message: string, statusCode: number): AppError { return new AppError({ code, message, statusCode }); }

async function readLimitedBody(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) { await reader.cancel(); throw storageError("FILE_SIZE_MISMATCH", "对象大小超过已申请的限制", 400); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function parseListObjectsXml(xml: string): ObjectListPage {
  const objects: ListedObject[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gu)) {
    const block = match[1] ?? "";
    const key = xmlValue(block, "Key");
    const size = Number(xmlValue(block, "Size") ?? "0");
    const rawLastModified = xmlValue(block, "LastModified");
    const parsedLastModified = rawLastModified ? new Date(rawLastModified) : null;
    if (key !== null && Number.isSafeInteger(size) && size >= 0) {
      objects.push({ objectKey: key, sizeBytes: size, lastModified: parsedLastModified && !Number.isNaN(parsedLastModified.getTime()) ? parsedLastModified : null });
    }
  }
  return {
    objects,
    nextCursor: xmlValue(xml, "NextContinuationToken"),
    truncated: xmlValue(xml, "IsTruncated") === "true",
  };
}

function xmlValue(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "u").exec(xml);
  return match ? decodeXml(match[1] ?? "") : null;
}

function decodeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, (entity, body: string) => {
    if (body === "amp") return "&";
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "quot") return '"';
    if (body === "apos") return "'";
    const hexadecimal = body.toLowerCase().startsWith("#x");
    const codePoint = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}
