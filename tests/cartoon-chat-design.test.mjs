import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../public/assets/wallpapers/cartoon-v2/", import.meta.url);
const read = (name) => readFile(new URL(name, root), "utf8");
const manifest = JSON.parse(await read("manifest.json"));
const sourceIndex = JSON.parse(await read("source-index.json"));
const output = await read("chat-cartoon-pattern.svg");
const css = await readFile(new URL("../app/chat-redesign.css", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const icon = await readFile(new URL("../app/ui/CartoonIcon.tsx", import.meta.url), "utf8");
const paths = (svg) => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
// Each motif is emitted on one line; greedy matching keeps nested source groups.
const groups = [...output.matchAll(/^<g data-motif="([^"]+)" data-source="([^"]+)"[^>]*>(.*)<\/g>$/gm)];

test("115 distinct complete cartoon motifs each occur once, including two different bears", () => {
  assert.equal(manifest.motifCount, 115);
  assert.equal(groups.length, 115);
  assert.equal(sourceIndex.length, 115);
  assert.equal(new Set(groups.map((g) => g[1])).size, 115);
  assert.equal(new Set(groups.map((g) => g[2])).size, 115);
  assert.equal(new Set(manifest.placements.map((p) => p.sha256)).size, 115);
  assert.equal(manifest.placements.filter((p) => p.label.includes("bear")).length, 2);
  assert.equal(manifest.maximumOccurrences, 1);
});

test("all original contours remain unchanged, closed and solid", async () => {
  let pathCount = 0, subpathCount = 0;
  for (const group of groups) {
    const source = await read(`source/${group[2]}.svg`);
    const entry = manifest.placements.find((p) => p.id === group[2]);
    assert.equal(createHash("sha256").update(source).digest("hex"), entry.sha256);
    assert.doesNotMatch(source, /<(?:line|polyline)\b/);
    assert.deepEqual(paths(group[3]), paths(source), `Changed geometry: ${group[1]}`);
    for (const d of paths(source)) {
      pathCount++;
      for (const subpath of d.match(/[Mm][^Mm]*/g) || []) {
        subpathCount++;
        assert.match(subpath, /[Zz]\s*$/, `Open outline in ${group[1]}`);
      }
    }
  }
  assert.equal(pathCount, 674);
  assert.equal(subpathCount, 1100);
  assert.doesNotMatch(output, /stroke-dash|<use\b|<pattern\b/);
  assert.match(output, /Twemoji v14\.0\.2.*CC BY 4\.0/);
});

test("rotated motifs fit entirely inside the canvas without overlap", () => {
  const [, , width, height] = manifest.viewBox;
  const tolerance = .003;
  for (const [i, a] of manifest.placements.entries()) {
    assert.ok(a.x >= manifest.margin && a.y >= manifest.margin);
    assert.ok(a.x + a.width <= width - manifest.margin + tolerance);
    assert.ok(a.y + a.height <= height - manifest.margin + tolerance);
    const angle = a.rotation * Math.PI / 180;
    const rotatedSize = a.size * 38 / 36 * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    assert.ok(rotatedSize <= a.width + tolerance, `${a.label} exceeds reserved bounds`);
    for (const b of manifest.placements.slice(i + 1)) {
      const xGap = Math.max(b.x - a.x - a.width, a.x - b.x - b.width);
      const yGap = Math.max(b.y - a.y - a.height, a.y - b.y - b.height);
      assert.ok(xGap >= manifest.gap - tolerance || yGap >= manifest.gap - tolerance, `${a.label} overlaps ${b.label}`);
    }
  }
});

test("shared chat surfaces keep message scrolling separate from header and composer", () => {
  assert.match(css, /\.chat-scroll-content\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(css, /\.chat-compose-dock\s*\{\s*flex: none;/);
  assert.match(css, /\.chat-person-avatar\s*\{[^}]*width: 40px;[^}]*height: 40px;/);
  assert.match(css, /\.customer-message > p\s*\{[^}]*font-size: 16px;/);
  const chat = page.slice(page.indexOf("function ChatScreen("), page.indexOf("function FavoritesScreen("));
  assert.equal((chat.match(/className="chat-topbar"/g) || []).length, 2);
  assert.equal((chat.match(/className="chat-compose-dock"/g) || []).length, 2);
  assert.equal((chat.match(/<ChatComposer /g) || []).length, 2);
  assert.match(chat, /aria-label="聊天记录" aria-busy=\{loading\}/);
  assert.match(chat, /aria-label="客服会话" aria-busy=\{loading\}/);
  assert.match(chat, /登录后开始聊天/);
  assert.match(chat, /登录后联系客服/);
  assert.match(chat, /service \? <div className="chat-product"/);
  assert.doesNotMatch(chat, /预计.*1.*分钟|services\[\d\]/);
});

test("chat redesign preserves accessible controls with a centered floating header", () => {
  assert.match(css, /grid-template-columns: 44px minmax\(0, 1fr\) 44px/);
  assert.match(css, /\.header-title\s*\{ display: contents;/);
  assert.match(css, /\.header-title \.icon-button\s*\{[^}]*min-width: 44px;/);
  assert.match(css, /grid-template-columns: 44px minmax\(0,1fr\) 44px 56px/);
  assert.match(css, /:is\(textarea,\.chat-draft-input\) \{[^}]*max-height: 118px/);
  assert.match(page, /<ChatComposer control=\{stickers\}/);
  assert.match(page, /<ChatComposer[^\n]*support control=\{stickers\}/);
  assert.match(icon, /aria-hidden=\{label \? undefined : true\}/);
});

test("chat edge fades stay behind readable content and never intercept input", () => {
  const layers = /\.phone-shell \.chat-screen \.chat-topbar::before,\s*\.phone-shell \.customer-service-screen \.chat-topbar::before,\s*\.phone-shell \.chat-screen \.chat-compose-dock::before,\s*\.phone-shell \.customer-service-screen \.chat-compose-dock::before\s*\{([^}]+)\}/g;
  const rules = [...css.matchAll(layers)].map((match) => match[1]);
  assert.equal(rules.length, 2);
  assert.match(rules[0], /content: "";/);
  assert.match(rules[0], /position: absolute;/);
  assert.match(rules[0], /z-index: -1;/);
  assert.match(rules[0], /pointer-events: none;/);
  assert.match(rules[1], /-webkit-backdrop-filter: blur\(\.5px\);/);
  assert.match(rules[1], /backdrop-filter: blur\(\.5px\);/);
  assert.match(rules[1], /mask-image: var\(--chat-edge-mask\);/);
  assert.match(css, /\.chat-scroll-content\s*\{[^}]*position: relative;[^}]*z-index: 1;/);
  for (const region of ["chat-topbar", "chat-compose-dock"]) {
    const rule = css.match(new RegExp(`\\.${region}\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(rule);
    assert.match(rule, /position: relative;/);
    assert.match(rule, region === "chat-topbar" ? /z-index: 3;/ : /z-index: 0;/);
    assert.match(rule, /isolation: isolate;/);
    assert.match(rule, region === "chat-topbar" ? /background: transparent;/ : /background: rgba\(var\(--chat-edge-bottom-rgb\),\.62\);/);
    assert.doesNotMatch(rule, /(?:^|[;\s])(?:filter|opacity|overflow):/);
  }
});

test("edge fades follow dynamic toolbar and composer heights with a transparent fallback", () => {
  const top = css.match(/\.customer-service-screen \.chat-topbar::before\s*\{([^}]+)\}/)?.[1];
  const bottom = css.match(/\.customer-service-screen \.chat-compose-dock::before\s*\{([^}]*inset:[^}]+)\}/)?.[1];
  assert.ok(top);
  assert.ok(bottom);
  assert.match(top, /inset: 0 0 -24px;/);
  assert.match(top, /calc\(100% - 24px\), rgba\(var\(--chat-edge-top-rgb\),0\) 100%/);
  assert.match(bottom, /inset: -24px 0 0;/);
  assert.match(bottom, /rgba\(var\(--chat-edge-bottom-rgb\),0\) 0%, rgba\(var\(--chat-edge-bottom-rgb\),\.08\) 24px/);
  assert.doesNotMatch(top + bottom, /height:|position: fixed|url\(/);
  assert.match(css, /@supports \(mask-image: linear-gradient\(#000, transparent\)\) or \(-webkit-mask-image:/);
});
