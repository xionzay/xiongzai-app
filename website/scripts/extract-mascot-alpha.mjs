import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  throw new Error("Usage: node scripts/extract-mascot-alpha.mjs <input> <output>");
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const pixels = width * height;
const background = new Uint8Array(pixels);
const queued = new Uint8Array(pixels);
const queue = new Int32Array(pixels);
let head = 0;
let tail = 0;

const isBackgroundColor = (pixel) => {
  const offset = pixel * channels;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return luminance > 222 && maximum - minimum < 20;
};

const enqueue = (pixel) => {
  if (pixel < 0 || pixel >= pixels || queued[pixel] || !isBackgroundColor(pixel)) return;
  queued[pixel] = 1;
  queue[tail] = pixel;
  tail += 1;
};

for (let x = 0; x < width; x += 1) {
  enqueue(x);
  enqueue((height - 1) * width + x);
}
for (let y = 0; y < height; y += 1) {
  enqueue(y * width);
  enqueue(y * width + width - 1);
}

while (head < tail) {
  const pixel = queue[head];
  head += 1;
  background[pixel] = 1;
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  if (x > 0) enqueue(pixel - 1);
  if (x + 1 < width) enqueue(pixel + 1);
  if (y > 0) enqueue(pixel - width);
  if (y + 1 < height) enqueue(pixel + width);
  if (x > 0 && y > 0) enqueue(pixel - width - 1);
  if (x + 1 < width && y > 0) enqueue(pixel - width + 1);
  if (x > 0 && y + 1 < height) enqueue(pixel + width - 1);
  if (x + 1 < width && y + 1 < height) enqueue(pixel + width + 1);
}

for (let pixel = 0; pixel < pixels; pixel += 1) {
  const offset = pixel * channels;
  data[offset + 3] = background[pixel] ? 0 : 255;
}

await sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toFile(output);
