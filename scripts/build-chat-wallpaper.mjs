import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const sourcePath = new URL('public/assets/wallpapers/telegram-pattern-source.svg', root);
const source = await readFile(sourcePath, 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(source);
  const { paths, nearPairs } = await page.locator('svg > path').evaluateAll(nodes => {
    const paths = nodes.map((node, index) => {
      const box = node.getBBox();
      return { index, d: node.getAttribute('d'), x: box.x, y: box.y, width: box.width, height: box.height };
    });
    const cells = new Map(), pairs = new Set();
    const cellSize = 4;
    const canvas = document.createElement('canvas');
    for (const path of paths) {
      const left = Math.floor(path.x / cellSize), top = Math.floor(path.y / cellSize);
      canvas.width = Math.ceil(path.width / cellSize) + 3;
      canvas.height = Math.ceil(path.height / cellSize) + 3;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.setTransform(1 / cellSize, 0, 0, 1 / cellSize, -left, -top);
      ctx.fill(new Path2D(path.d));
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
        const gx = left + x, gy = top + y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          for (const other of cells.get(`${gx+dx},${gy+dy}`) || []) {
            if (other !== path.index) pairs.add(`${other},${path.index}`);
          }
        }
        const key = `${gx},${gy}`;
        if (!cells.has(key)) cells.set(key, new Set());
        cells.get(key).add(path.index);
      }
    }
    return { paths, nearPairs: [...pairs].map(pair => pair.split(',').map(Number)) };
  });
  const parent = paths.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (const [i, j] of nearPairs) parent[find(j)] = find(i);
  const contains = (a, b) => a.x - 2 <= b.x && a.y - 2 <= b.y && a.x + a.width + 2 >= b.x + b.width && a.y + a.height + 2 >= b.y + b.height;
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const a = paths[i], b = paths[j];
      if (contains(a, b) || contains(b, a)) {
        parent[find(j)] = find(i);
      }
    }
  }
  const grouped = new Map();
  for (const path of paths) {
    const key = find(path.index);
    if (!grouped.has(key)) grouped.set(key, { paths: [], x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
    const group = grouped.get(key);
    group.paths.push(path);
    group.x = Math.min(group.x, path.x); group.y = Math.min(group.y, path.y);
    group.right = Math.max(group.right, path.x + path.width); group.bottom = Math.max(group.bottom, path.y + path.height);
  }
  const groups = [...grouped.values()];

  // Source-edge fragments are already incomplete; do not move them into the middle.
  const complete = groups.filter(g => g.x > 1 && g.y > 1 && g.right < 1439 && g.bottom < 2959);
  const width = 1440, height = 3120, margin = 24, spacing = 10;
  let seed = 20260905;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const intersects = (a, b) => a.x < b.x + b.w + spacing && a.x + a.w + spacing > b.x && a.y < b.y + b.h + spacing && a.y + a.h + spacing > b.y;
  let placed;
  let scale = 1;
  for (; scale >= 0.8; scale -= 0.025) {
    placed = [];
    const ordered = complete.map(group => ({ group, rank: random() })).sort((a, b) => {
      const area = g => (g.right - g.x) * (g.bottom - g.y);
      return area(b.group) - area(a.group) || a.rank - b.rank;
    });
    for (const { group } of ordered) {
      const w = (group.right - group.x) * scale, h = (group.bottom - group.y) * scale;
      let candidate;
      for (let attempt = 0; attempt < 12000; attempt++) {
        const box = { x: margin + random() * (width - 2 * margin - w), y: margin + random() * (height - 2 * margin - h), w, h, group };
        if (!placed.some(other => intersects(box, other))) { candidate = box; break; }
      }
      if (!candidate) break;
      placed.push(candidate);
    }
    if (placed.length === complete.length) break;
  }
  if (placed.length !== complete.length) throw new Error('Cannot place every complete motif without overlap.');
  const number = value => Number(value.toFixed(4));
  const output = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="3120" viewBox="0 0 1440 3120">
<!-- Original Telegram Web A pattern paths, GPL-3.0. See README.md and telegram-pattern-LICENSE.txt. Only complete motif groups are translated/scaled; no path geometry is redrawn. -->
<g fill="#365f81" fill-opacity="0.22">
${placed.map(({ x, y, group }) => `<g transform="translate(${number(x - group.x * scale)} ${number(y - group.y * scale)}) scale(${number(scale)})">${group.paths.map(p => `<path d="${p.d}"/>`).join('')}</g>`).join('\n')}
</g></svg>\n`;
  const outputPaths = [...output.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
  const sourcePathSet = new Set(paths.map(p => p.d));
  if (outputPaths.some(d => !sourcePathSet.has(d))) throw new Error('Output contains a modified path.');
  const selectedIds = placed.flatMap(p => p.group.paths.map(path => path.index));
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error('A source path was duplicated.');
  for (const ids of [[48, 49, 50], [111, 112, 113, 114, 115, 116]]) {
    if (!complete.some(g => ids.every(id => g.paths.some(p => p.index === id)))) throw new Error('An internal detail was detached.');
  }
  const outPath = new URL('public/assets/wallpapers/chat-pattern-rearranged.svg', root);
  await writeFile(outPath, output);
  const report = {
    source: 'https://github.com/Ajaxy/telegram-tt/blob/master/src/assets/pattern.svg',
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    seed: 20260905, viewBox: [0, 0, width, height], scale: number(scale),
    originalPaths: paths.length, completeGroups: placed.length, preservedPaths: outputPaths.length,
    omittedEdgeFragmentGroups: groups.length - complete.length,
    exactPathGeometry: true, duplicateSourcePaths: false, overlappingGroupBounds: false,
    groups: placed.map(({ x, y, w, h, group }) => ({ x: number(x), y: number(y), width: number(w), height: number(h), sourcePathIds: group.paths.map(p => p.index) })),
  };
  await writeFile(new URL('public/assets/wallpapers/chat-pattern-rearranged.manifest.json', root), `${JSON.stringify(report, null, 2)}\n`);
  await page.setViewportSize({ width: 720, height: 1560 });
  await page.setContent(`<style>html,body{margin:0;background:#a2c3d7}svg{display:block;width:720px;height:1560px}</style>${output}`);
  await page.screenshot({ path: '/private/tmp/chat-pattern-rearranged.png' });
  console.log(JSON.stringify({ ...report, groups: undefined }, null, 2));
} finally {
  await browser.close();
}
