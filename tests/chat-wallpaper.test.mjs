import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assetRoot = new URL("../public/assets/wallpapers/", import.meta.url);
const [source, output, manifestText, css] = await Promise.all([
  readFile(new URL("telegram-pattern-source.svg", assetRoot), "utf8"),
  readFile(new URL("chat-pattern-rearranged.svg", assetRoot), "utf8"),
  readFile(new URL("chat-pattern-rearranged.manifest.json", assetRoot), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const pathData = (svg) => [...svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map((match) => match[1]);
const sourcePaths = pathData(source);
const outputGroups = [...output.matchAll(/<g transform="([^"]+)">([\s\S]*?)<\/g>/g)]
  .map((match) => ({ transform: match[1], paths: pathData(match[2]) }));

test("chat wallpaper preserves each selected source path byte for byte without duplicates", () => {
  assert.equal(createHash("sha256").update(source).digest("hex"), manifest.sourceSha256);
  assert.equal(sourcePaths.length, manifest.originalPaths);
  assert.equal(outputGroups.length, manifest.completeGroups);
  assert.equal(outputGroups.length, manifest.groups.length);
  const seenIds = new Set();
  const seenPaths = new Set();
  for (const [groupIndex, group] of outputGroups.entries()) {
    const ids = manifest.groups[groupIndex].sourcePathIds;
    assert.equal(group.paths.length, ids.length, `Path count for group ${groupIndex}`);
    assert.ok(ids.length > 0, `Empty group ${groupIndex}`);
    for (const [pathIndex, d] of group.paths.entries()) {
      const id = ids[pathIndex];
      assert.ok(Number.isInteger(id) && id >= 0 && id < sourcePaths.length, `Invalid source index ${id}`);
      assert.equal(d, sourcePaths[id], `Changed source path ${id}`);
      assert.ok(!seenIds.has(id), `Duplicate source index ${id}`);
      assert.ok(!seenPaths.has(d), `Duplicate path geometry at source index ${id}`);
      seenIds.add(id);
      seenPaths.add(d);
    }
  }
  assert.equal(seenIds.size, manifest.preservedPaths);
  assert.equal(pathData(output).length, seenIds.size, "Unexpected paths outside the listed groups");
});

test("chat wallpaper uses finite translations and the manifest scale", () => {
  for (const [index, group] of outputGroups.entries()) {
    const transform = group.transform.match(/^translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)$/);
    assert.ok(transform, `Unexpected transform on group ${index}`);
    const [tx, ty, scale] = transform.slice(1).map(Number);
    assert.ok([tx, ty, scale].every(Number.isFinite) && scale > 0);
    assert.equal(scale, manifest.scale);
  }
});

test("chat wallpaper groups stay inside the canvas with at least 10 units of spacing", () => {
  const actualViewBox = output.match(/\bviewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  assert.deepEqual(actualViewBox, manifest.viewBox);
  const [left, top, width, height] = manifest.viewBox;
  const spacing = 10;
  const roundingTolerance = 0.001;
  for (const [index, a] of manifest.groups.entries()) {
    assert.ok([a.x, a.y, a.width, a.height].every(Number.isFinite));
    assert.ok(a.width > 0 && a.height > 0, `Empty bounds for group ${index}`);
    assert.ok(a.x >= left && a.y >= top && a.x + a.width <= left + width && a.y + a.height <= top + height, `Group ${index} outside canvas`);
    for (let other = index + 1; other < manifest.groups.length; other++) {
      const b = manifest.groups[other];
      const horizontalGap = Math.max(b.x - a.x - a.width, a.x - b.x - b.width);
      const verticalGap = Math.max(b.y - a.y - a.height, a.y - b.y - b.height);
      assert.ok(horizontalGap >= spacing - roundingTolerance || verticalGap >= spacing - roundingTolerance, `Groups ${index} and ${other} overlap or violate spacing`);
    }
  }
});

test("both chat screens soften the dense blue wallpaper across the full viewport without stretching or repeating it", () => {
  const wallpaperRules = css.match(/\.phone-shell \.chat-screen,\s*\.phone-shell \.customer-service-screen\s*\{([^}]+)\}/);
  assert.ok(wallpaperRules, "Missing shared chat wallpaper styles");
  const rules = wallpaperRules[1];
  assert.match(rules, /url\("\/assets\/wallpapers\/chat-dense-blue-v3\.png"\)/);
  assert.match(rules, /linear-gradient\(135deg, rgba\(255, 235, 177, \.77\) 0%, rgba\(230, 244, 255, \.74\) 43%/);
  assert.match(rules, /linear-gradient\(135deg, #fff2cf 0%, #edf7ff 43%, #edf7ff 63%, #fff3d5 100%\)/);
  assert.match(rules, /background-attachment:\s*scroll\s*!important\s*;/);
  assert.match(rules, /background-size:\s*100% 100%\s*,\s*cover\s*,\s*100% 100%/);
  assert.match(rules, /background-repeat:\s*no-repeat\s*,\s*no-repeat\s*,\s*no-repeat/);
  assert.doesNotMatch(rules, /chat-dense-graygreen|opacity:/);
});

test("previous user-supplied wallpaper stays available unchanged for rollback", async () => {
  const wallpaper = await readFile(new URL("chat-cartoon-blue-original-v2.png", assetRoot));
  assert.deepEqual([...wallpaper.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(wallpaper.toString("ascii", 12, 16), "IHDR");
  assert.equal(wallpaper.readUInt32BE(16), 887);
  assert.equal(wallpaper.readUInt32BE(20), 1774);
  assert.equal(createHash("sha256").update(wallpaper).digest("hex"), "d31632436ff0912044a16fc5860f2b3bb4a4b8cbf93f434829ca5d49f3c742a6");
});
