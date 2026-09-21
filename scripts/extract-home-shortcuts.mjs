import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Pass the installed sharp package path when it is provided by a workspace runtime.
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || "sharp");
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/extract-home-shortcuts.mjs <selected-reference.png>");
const destination = path.resolve("public/assets/home-shortcuts");
await mkdir(destination, { recursive: true });
const metadata = await sharp(source).metadata();
const names = ["quick-match", "coupon-center", "app-rules", "lucky-wheel", "official-notices"];
// The reference artwork extends beyond its label columns; cut in the actual gaps.
const boundaries = [0, 480 / 2172, 910 / 2172, 1275 / 2172, 1705 / 2172, 1];
const report = [];

for (let column = 0; column < names.length; column++) {
  const left = Math.round(boundaries[column] * metadata.width);
  const right = Math.round(boundaries[column + 1] * metadata.width);
  // Only the illustration band: excludes both the palette title and the labels.
  const top = Math.round(metadata.height * 0.20);
  const bottom = Math.round(metadata.height * 0.73);
  const { data, info } = await sharp(source).extract({ left, top, width: right - left, height: bottom - top })
    .removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const count = width * height;
  const boundary = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const channels = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    const low = Math.min(...channels), high = Math.max(...channels);
    boundary[i] = (high - low > 28 && low < 230) || high < 170 ? 1 : 0;
  }

  // Flood only the exterior. White regions enclosed by the drawing stay opaque.
  const exterior = new Uint8Array(count);
  const queue = new Int32Array(count);
  let start = 0, end = 0;
  const enqueue = (i) => {
    if (!boundary[i] && !exterior[i]) { exterior[i] = 1; queue[end++] = i; }
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (start < end) {
    const i = queue[start++], x = i % width, y = Math.floor(i / width);
    if (x > 0) enqueue(i - 1);
    if (x + 1 < width) enqueue(i + 1);
    if (y > 0) enqueue(i - width);
    if (y + 1 < height) enqueue(i + width);
  }
  const alpha = Buffer.alloc(count);
  for (let i = 0; i < count; i++) alpha[i] = exterior[i] ? 0 : 255;
  const rgba = Buffer.alloc(count * 4);
  let minX = width, minY = height, maxX = 0, maxY = 0, opaqueWhite = 0;
  for (let i = 0; i < count; i++) {
    rgba[i * 4] = data[i * 3]; rgba[i * 4 + 1] = data[i * 3 + 1]; rgba[i * 4 + 2] = data[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i];
    if (alpha[i]) {
      minX = Math.min(minX, i % width); maxX = Math.max(maxX, i % width);
      minY = Math.min(minY, Math.floor(i / width)); maxY = Math.max(maxY, Math.floor(i / width));
      if (Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) > 235) opaqueWhite++;
    }
  }
  if (!opaqueWhite || maxX <= minX || maxY <= minY) throw new Error(`Invalid foreground for ${names[column]}`);
  const cropped = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(232, 232, { fit: "inside", kernel: "lanczos3" }).png().toBuffer();
  const size = await sharp(cropped).metadata();
  await sharp({ create: { width: 256, height: 256, channels: 4, background: "#00000000" } })
    .composite([{ input: cropped, left: Math.round((256 - size.width) / 2), top: Math.round((256 - size.height) / 2) }])
    .png({ compressionLevel: 9 }).toFile(path.join(destination, `${names[column]}.png`));
  report.push({ file: `${names[column]}.png`, width: 256, height: 256, opaqueWhitePixelsPreserved: opaqueWhite });
}
await mkdir(".local/home-shortcuts", { recursive: true });
await writeFile(".local/home-shortcuts/extraction-report.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
