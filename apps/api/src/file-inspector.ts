import { AppError, type ErrorCode } from "@xiongzai/contracts";

export interface InspectedMedia {
  detectedMimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export function inspectMedia(bytes: Uint8Array, declaredMimeType: string): InspectedMedia {
  const detectedMimeType = detectMime(bytes);
  if (detectedMimeType !== declaredMimeType) {
    throw invalid("FILE_MIME_MISMATCH", "文件真实格式与申请上传的 MIME 类型不一致");
  }
  if (detectedMimeType === "image/png") return { detectedMimeType, ...pngDimensions(bytes) };
  if (detectedMimeType === "image/jpeg") return { detectedMimeType, ...jpegDimensions(bytes) };
  if (detectedMimeType === "image/webp") return { detectedMimeType, ...webpDimensions(bytes) };
  if (detectedMimeType === "audio/mpeg") return { detectedMimeType, durationMs: mp3Duration(bytes) };
  if (detectedMimeType === "audio/aac") return { detectedMimeType, durationMs: aacDuration(bytes) };
  if (detectedMimeType === "audio/mp4") return { detectedMimeType, durationMs: mp4Duration(bytes) };
  if (detectedMimeType === "video/mp4") return { detectedMimeType, durationMs: mp4Duration(bytes, "vide") };
  if (detectedMimeType === "application/json") {
    try { JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw invalid("FILE_CONTENT_INVALID", "上传内容不是有效的 UTF-8 JSON"); }
  }
  return { detectedMimeType };
}

export function detectMime(bytes: Uint8Array): string {
  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matches(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (matches(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (ascii(bytes, 4, 4) === "ftyp" && findAudioMediaHeader(bytes, "vide") && findBox(bytes,0,bytes.byteLength,"mdat")) return "video/mp4";
  if (ascii(bytes, 4, 4) === "ftyp" && findAudioMediaHeader(bytes)) return "audio/mp4";
  if (ascii(bytes, 0, 3) === "ID3" || isMp3Header(bytes, 0)) return "audio/mpeg";
  if (isAdtsHeader(bytes, 0)) return "audio/aac";
  const text = tryUtf8(bytes);
  if (text !== undefined) {
    try { JSON.parse(text); return "application/json"; } catch { return "text/plain"; }
  }
  return "application/octet-stream";
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 24 || ascii(bytes, 12, 4) !== "IHDR") throw invalid("FILE_CONTENT_INVALID", "PNG 文件头不完整");
  return dimensions(readU32(bytes, 16), readU32(bytes, 20));
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    if (marker === 0xda) break;
    const length = readU16(bytes, offset + 2);
    if (length < 2 || offset + length + 2 > bytes.byteLength) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return dimensions(readU16(bytes, offset + 7), readU16(bytes, offset + 5));
    }
    offset += length + 2;
  }
  throw invalid("FILE_CONTENT_INVALID", "无法读取 JPEG 图片尺寸");
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  const kind = ascii(bytes, 12, 4);
  if (kind === "VP8X" && bytes.byteLength >= 30) return dimensions(1 + readU24LE(bytes, 24), 1 + readU24LE(bytes, 27));
  if (kind === "VP8 " && bytes.byteLength >= 30 && matches(bytes.subarray(23), [0x9d, 0x01, 0x2a])) return dimensions(readU16LE(bytes, 26) & 0x3fff, readU16LE(bytes, 28) & 0x3fff);
  if (kind === "VP8L" && bytes.byteLength >= 25 && bytes[20] === 0x2f) {
    const bits = readU32LE(bytes, 21);
    return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  throw invalid("FILE_CONTENT_INVALID", "无法读取 WebP 图片尺寸");
}

function mp3Duration(bytes: Uint8Array): number {
  let offset = id3Size(bytes);
  let durationSeconds = 0;
  let frames = 0;
  while (offset + 4 <= bytes.byteLength) {
    if (!isMp3Header(bytes, offset)) { offset += 1; continue; }
    const header = readU32(bytes, offset);
    const versionBits = (header >>> 19) & 0x3;
    const layerBits = (header >>> 17) & 0x3;
    const bitrateIndex = (header >>> 12) & 0xf;
    const sampleIndex = (header >>> 10) & 0x3;
    const padding = (header >>> 9) & 1;
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
    const layer = 4 - layerBits;
    const rates = version === 1 ? [44_100, 48_000, 32_000] : version === 2 ? [22_050, 24_000, 16_000] : [11_025, 12_000, 8_000];
    const rate = rates[sampleIndex];
    const bitrate = mp3Bitrate(version, layer, bitrateIndex);
    if (!rate || !bitrate) { offset += 1; continue; }
    const samples = layer === 1 ? 384 : layer === 2 ? 1_152 : version === 1 ? 1_152 : 576;
    const frameLength = layer === 1 ? Math.floor((12 * bitrate * 1_000 / rate) + padding) * 4 : Math.floor(((layer === 3 && version !== 1 ? 72 : 144) * bitrate * 1_000 / rate) + padding);
    if (frameLength < 4 || offset + frameLength > bytes.byteLength) break;
    durationSeconds += samples / rate;
    frames += 1;
    offset += frameLength;
  }
  if (frames === 0) throw invalid("FILE_CONTENT_INVALID", "无法读取 MP3 音频时长");
  return Math.round(durationSeconds * 1_000);
}

function aacDuration(bytes: Uint8Array): number {
  const rates = [96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350];
  let offset = 0;
  let durationSeconds = 0;
  let frames = 0;
  while (offset + 7 <= bytes.byteLength) {
    if (!isAdtsHeader(bytes, offset)) throw invalid("FILE_CONTENT_INVALID", "AAC 数据帧不完整");
    const sampleRate = rates[((bytes[offset + 2] ?? 0) >>> 2) & 0xf];
    const frameLength = (((bytes[offset + 3] ?? 0) & 0x3) << 11) | ((bytes[offset + 4] ?? 0) << 3) | (((bytes[offset + 5] ?? 0) >>> 5) & 0x7);
    const blocks = (bytes[offset + 6] ?? 0) & 0x3;
    if (!sampleRate || frameLength < 7 || offset + frameLength > bytes.byteLength) throw invalid("FILE_CONTENT_INVALID", "AAC 数据帧无效");
    durationSeconds += (blocks + 1) * 1_024 / sampleRate;
    frames += 1;
    offset += frameLength;
  }
  if (frames === 0) throw invalid("FILE_CONTENT_INVALID", "无法读取 AAC 音频时长");
  return Math.round(durationSeconds * 1_000);
}

function mp4Duration(bytes: Uint8Array, kind = "soun"): number {
  const header = findAudioMediaHeader(bytes, kind);
  const mediaHeader = header && findBox(bytes, header.mediaStart, header.mediaEnd, "mdhd");
  if (mediaHeader) {
    const version = bytes[mediaHeader.contentStart];
    if (version === 0 && mediaHeader.contentStart + 20 <= mediaHeader.end) {
      const timescale = readU32(bytes, mediaHeader.contentStart + 12);
      const duration = readU32(bytes, mediaHeader.contentStart + 16);
      if (timescale > 0) return Math.round(duration * 1_000 / timescale);
    }
    if (version === 1 && mediaHeader.contentStart + 32 <= mediaHeader.end) {
      const timescale = readU32(bytes, mediaHeader.contentStart + 20);
      const duration = readU64(bytes, mediaHeader.contentStart + 24);
      if (timescale > 0 && duration <= BigInt(Number.MAX_SAFE_INTEGER)) return Math.round(Number(duration) * 1_000 / timescale);
    }
  }
  throw invalid("FILE_CONTENT_INVALID", "无法读取 M4A 音频时长");
}

interface Mp4Box { contentStart: number; end: number }
function findAudioMediaHeader(bytes: Uint8Array, kind = "soun"): { mediaStart: number; mediaEnd: number } | undefined {
  const movie = findBox(bytes, 0, bytes.byteLength, "moov");
  if (!movie) return undefined;
  for (const track of boxes(bytes, movie.contentStart, movie.end, "trak")) {
    const media = findBox(bytes, track.contentStart, track.end, "mdia");
    if (!media) continue;
    const handler = findBox(bytes, media.contentStart, media.end, "hdlr");
    if (handler && handler.contentStart + 12 <= handler.end && ascii(bytes, handler.contentStart + 8, 4) === kind) {
      return { mediaStart: media.contentStart, mediaEnd: media.end };
    }
  }
  return undefined;
}

function findBox(bytes: Uint8Array, start: number, end: number, type: string): Mp4Box | undefined { return boxes(bytes, start, end, type)[0]; }
function boxes(bytes: Uint8Array, start: number, end: number, type: string): Mp4Box[] {
  const found: Mp4Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = readU32(bytes, offset);
    let headerSize = 8;
    let boxSize: number;
    if (size32 === 0) {
      boxSize = end - offset;
    } else if (size32 === 1) {
      if (offset + 16 > end) break;
      const extendedSize = readU64(bytes, offset + 8);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) break;
      boxSize = Number(extendedSize);
      headerSize = 16;
    } else {
      boxSize = size32;
    }
    const boxEnd = offset + boxSize;
    if (boxSize < headerSize || boxEnd > end) break;
    if (ascii(bytes, offset + 4, 4) === type) found.push({ contentStart: offset + headerSize, end: boxEnd });
    offset = boxEnd;
  }
  return found;
}

function mp3Bitrate(version: number, layer: number, index: number): number | undefined {
  if (index <= 0 || index >= 15) return undefined;
  const mpeg1 = layer === 1 ? [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448] : layer === 2 ? [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384] : [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2 = layer === 1 ? [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  return (version === 1 ? mpeg1 : mpeg2)[index];
}

function id3Size(bytes: Uint8Array): number {
  if (ascii(bytes, 0, 3) !== "ID3" || bytes.byteLength < 10) return 0;
  return 10 + (((bytes[6] ?? 0) & 0x7f) << 21) + (((bytes[7] ?? 0) & 0x7f) << 14) + (((bytes[8] ?? 0) & 0x7f) << 7) + ((bytes[9] ?? 0) & 0x7f);
}

function isMp3Header(bytes: Uint8Array, offset: number): boolean {
  if (offset + 4 > bytes.byteLength) return false;
  const header = readU32(bytes, offset);
  return ((header & 0xffe00000) >>> 0) === 0xffe00000 && ((header >>> 19) & 0x3) !== 1 && ((header >>> 17) & 0x3) !== 0 && ((header >>> 12) & 0xf) !== 0xf && ((header >>> 10) & 0x3) !== 0x3;
}

function isAdtsHeader(bytes: Uint8Array, offset: number): boolean { return offset + 2 <= bytes.byteLength && bytes[offset] === 0xff && ((bytes[offset + 1] ?? 0) & 0xf6) === 0xf0; }
function dimensions(width: number, height: number): { width: number; height: number } { if (width < 1 || height < 1 || width > 20_000 || height > 20_000 || width * height > 64_000_000) throw invalid("FILE_DIMENSIONS_INVALID", "图片尺寸无效或超过限制"); return { width, height }; }
function matches(bytes: Uint8Array, signature: number[]): boolean { return signature.every((value, index) => bytes[index] === value); }
function ascii(bytes: Uint8Array, offset: number, length: number): string { return String.fromCharCode(...bytes.subarray(offset, offset + length)); }
function tryUtf8(bytes: Uint8Array): string | undefined { try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); return /\0/u.test(text) ? undefined : text; } catch { return undefined; } }
function readU16(bytes: Uint8Array, offset: number): number { return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0); }
function readU16LE(bytes: Uint8Array, offset: number): number { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8); }
function readU24LE(bytes: Uint8Array, offset: number): number { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16); }
function readU32(bytes: Uint8Array, offset: number): number { return (((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0; }
function readU32LE(bytes: Uint8Array, offset: number): number { return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0; }
function readU64(bytes: Uint8Array, offset: number): bigint { return (BigInt(readU32(bytes, offset)) << 32n) | BigInt(readU32(bytes, offset + 4)); }
function invalid(code: ErrorCode, message: string): AppError { return new AppError({ code, message, statusCode: 400 }); }
