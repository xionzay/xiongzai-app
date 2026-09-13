import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Compose existing, licensed closed SVG geometry; no generated or retraced contours.
const root = fileURLToPath(new URL("../public/assets/wallpapers/cartoon-v2/", import.meta.url));
const excluded = new Set(["butterfly", "avocado", "kiwi-fruit", "envelope", "mushroom"]);
const sourceUrl = "https://github.com/twitter/twemoji/tree/v14.0.2/assets/svg";
const importIndex = process.argv.indexOf("--import");
await mkdir(path.join(root, "source"), { recursive: true });
if (importIndex !== -1) {
  const incoming = path.resolve(process.argv[importIndex + 1]);
  const imported = JSON.parse(await readFile(path.join(incoming, "manifest.json"), "utf8"));
  const index = imported.filter((item) => !excluded.has(item.label)).map(({ id, label }) => ({ id, label }));
  for (const item of index) await copyFile(path.join(incoming, "svg", `${item.id}.svg`), path.join(root, "source", `${item.id}.svg`));
  await copyFile(path.join(incoming, "LICENSE-GRAPHICS"), path.join(root, "LICENSE-GRAPHICS.txt"));
  await writeFile(path.join(root, "source-index.json"), `${JSON.stringify(index, null, 2)}\n`);
}
const index = JSON.parse(await readFile(path.join(root, "source-index.json"), "utf8"));
const W = 1000, H = 2048, margin = 23, gap = 10;
const seed = 20260906;
let state = seed;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
};
const round = (n) => Math.round(n * 1000) / 1000;
const hero = new Set(["bear-face", "teddy-bear", "headphones", "game-controller", "paw-print", "rocket", "whale", "camping-tent"]);
const inventory = [];
for (const item of index) {
  const svg = await readFile(path.join(root, "source", `${item.id}.svg`), "utf8");
  if (/<(?:line|polyline)\b/i.test(svg)) throw new Error(`Open primitive: ${item.label}`);
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
  for (const d of paths) {
    const subpaths = d.match(/[Mm][^Mm]*/g) || [];
    if (!subpaths.length || subpaths.some((part) => !/[Zz]\s*$/.test(part))) throw new Error(`Open subpath: ${item.label}`);
  }
  const shapes = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "");
  const size = hero.has(item.label) ? 155 + random() * 15 : 110 + random() * 35;
  const rotation = (random() - .5) * 36;
  // Bounds include rotation, 1 SVG unit of stroke protection on every edge.
  const radians = rotation * Math.PI / 180;
  const reserve = (size * 38 / 36) * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
  inventory.push({ ...item, shapes, size, rotation, reserve, sha256: createHash("sha256").update(svg).digest("hex"), pathCount: paths.length });
}
inventory.sort((a, b) => b.reserve - a.reserve);
// Unequal recursive regions avoid rigid rows yet reserve real space for every
// complete illustration. This is layout only: source contours stay unchanged.
const regions = [{ x: margin, y: margin, width: W - 2 * margin, height: H - 2 * margin }];
while (regions.length < inventory.length) {
  regions.sort((a, b) => b.width * b.height - a.width * a.height);
  const r = regions.shift();
  const ratio = .43 + random() * .14;
  if (r.width > r.height) {
    const first = r.width * ratio;
    regions.push({ ...r, width: first }, { ...r, x: r.x + first, width: r.width - first });
  } else {
    const first = r.height * ratio;
    regions.push({ ...r, height: first }, { ...r, y: r.y + first, height: r.height - first });
  }
}
regions.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height));
const placements = [];
for (const [i, item] of inventory.entries()) {
  const r = regions[i];
  const reserve = Math.min(item.reserve, r.width - gap, r.height - gap);
  const size = item.size * reserve / item.reserve;
  const x = r.x + gap / 2 + random() * Math.max(0, r.width - gap - reserve);
  const y = r.y + gap / 2 + random() * Math.max(0, r.height - gap - reserve);
  placements.push({ id: item.id, label: item.label, x, y, cx: x + reserve / 2, cy: y + reserve / 2, width: reserve, height: reserve, size, rotation: item.rotation, sha256: item.sha256, pathCount: item.pathCount });
}

const gradient = '<defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff5d9"/><stop offset=".46" stop-color="#faf9f3"/><stop offset="1" stop-color="#e0edff"/></linearGradient></defs>';
const shapeGroups = placements.map((p) => {
  const item = inventory.find((entry) => entry.id === p.id);
  // Preserve every d attribute. Matching light paper fills hide rear contours,
  // so overlapping source pieces do not become confusing wireframes.
  const t = Math.min(1, Math.max(0, (p.cx / W + p.cy / H) / 2));
  const stops = t < .46 ? [[255,245,217],[250,249,243], t / .46] : [[250,249,243],[224,237,255], (t - .46) / .54];
  const paper = `#${stops[0].map((v, i) => Math.round(v + (stops[1][i] - v) * stops[2]).toString(16).padStart(2, "0")).join("")}`;
  const body = item.shapes.replace(/\sfill="[^"]*"/g, "");
  return `<g data-motif="${p.label}" data-source="${p.id}" transform="translate(${round(p.cx)} ${round(p.cy)}) rotate(${round(p.rotation)}) scale(${round(p.size / 36)}) translate(-18 -18)" fill="${paper}" stroke="#93b9e6" stroke-width=".42" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}).join("\n");
const svgHeader = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><title>熊崽聊天 · 115款不重复的卡通线稿</title><desc>Twemoji v14.0.2 graphics by Twitter and other contributors, CC BY 4.0. Adapted palette, outline treatment and arrangement. Each complete motif appears once. No dashed or open source contours.</desc>`;
await writeFile(path.join(root, "chat-cartoon-pattern.svg"), `${svgHeader}\n${shapeGroups}\n</svg>\n`);
await writeFile(path.join(root, "wallpaper-preview.svg"), `${svgHeader}\n${gradient}<rect width="${W}" height="${H}" fill="url(#paper)"/>\n${shapeGroups}\n</svg>\n`);
const manifest = { version: 2, seed, source: sourceUrl, license: "CC-BY-4.0", viewBox: [0, 0, W, H], motifCount: placements.length, maximumOccurrences: 1, gap, margin, colors: { cream: "#fff5d9", ivory: "#faf9f3", blue: "#e0edff", stroke: "#93b9e6" }, placements: placements.map((p) => Object.fromEntries(Object.entries(p).map(([key, value]) => [key, typeof value === "number" ? round(value) : value]))) };
await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${placements.length} unique closed-contour motifs; no repeats. ${root}`);
