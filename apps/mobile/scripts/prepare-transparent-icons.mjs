import { Buffer } from "node:buffer";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const root = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(root, "assets", "transparent-icons");
const iconNames = ["home", "order", "message", "mine", "service", "wallet", "shield", "setting"];
const sharedIconNames = ["favorite", "coupon", "withdraw"];
const projectRoot = path.resolve(root, "..", "..");

await mkdir(outputDirectory, { recursive: true });

async function makeTransparentIcon(name, input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);

  for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
    const luminance = data[source] * 0.2126 + data[source + 1] * 0.7152 + data[source + 2] * 0.0722;
    const darkness = 255 - luminance;
    const alpha = darkness <= 14 ? 0 : Math.min(255, Math.round((darkness - 14) * 3.4));
    rgba[target] = 0;
    rgba[target + 1] = 0;
    rgba[target + 2] = 0;
    rgba[target + 3] = alpha;
  }

  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, `${name}.png`));
}

for (const name of iconNames) await makeTransparentIcon(name, path.join(root, "assets", `icon-${name}.png`));
for (const name of sharedIconNames) await makeTransparentIcon(name, path.join(projectRoot, "public", "assets", `icon-${name}.png`));

const starPath = "M50 7 L62 36 L93 39 L69 59 L78 90 L50 73 L22 90 L31 59 L7 39 L38 36 Z";
const actionIcons = {
  "favorite-action-outline": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${starPath}" fill="none" stroke="#000" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  "favorite-action-filled": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${starPath}" fill="#000" stroke="#000" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  "message-action": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 10C73 10 90 25 90 47C90 68 73 83 51 83C44 83 38 82 32 80L14 88L20 69C14 62 11 54 11 46C11 25 28 10 50 10Z" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="34" cy="47" r="4.6"/><circle cx="50" cy="47" r="4.6"/><circle cx="66" cy="47" r="4.6"/></svg>',
};

for (const [name, svg] of Object.entries(actionIcons)) {
  await sharp(Buffer.from(svg)).resize(200, 200).png({ compressionLevel: 9 }).toFile(path.join(outputDirectory, `${name}.png`));
}

console.log(`Prepared ${iconNames.length + sharedIconNames.length + Object.keys(actionIcons).length} transparent mobile icons.`);
