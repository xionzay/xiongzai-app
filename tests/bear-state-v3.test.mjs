import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
const read = path => readFileSync(new URL('../' + path, import.meta.url));
const manifest = JSON.parse(read('tests/fixtures/bear-assets/v3-manifest.json'));
const prior = JSON.parse(read('tests/fixtures/bear-assets/v2-manifest.json'));
const sourceHashes = JSON.parse(read('tests/fixtures/bear-assets/source-hashes.json')).v3;
const hash = path => createHash('sha256').update(read(path)).digest('hex');
test('V3 preserves duration and dimensions; all ten encoded animations loop', () => {
  assert.equal(manifest.assets.length, 10);
  assert.equal(new Set(manifest.assets.map(a => a.id)).size, 10);
  for (const asset of manifest.assets) {
    const original = prior.assets.find(a => a.id === asset.id);
    for (const key of ['durationMs', 'width', 'height', 'transparent']) assert.equal(asset[key], original[key]);
    assert.equal(asset.playback, 'loop');
    assert.equal(asset.formats.webp.loopCount, 0); assert.equal(asset.formats.gif.loopCount, 0);
    assert.notEqual(asset.formats.webp.sha256, original.formats.webp.sha256, asset.id);
    for (const path of [asset.webp, asset.gif, asset.poster, asset.endPoster]) assert.equal(hash('public/assets/bear-states-v3/' + path), sourceHashes[path], path);
  }
  assert.deepEqual(readdirSync(new URL('../public/assets/bear-states-v3/', import.meta.url)).sort(), ['assets', 'end', 'posters']);
});
test('all ten V3 encoded clips pass loop-seam or final-hold checks', () => {
  const qa = JSON.parse(read('tests/fixtures/bear-assets/v3-qa.json'));
  assert.equal(qa.length, 10);
  for (const row of qa) { assert.equal(row.passed, true); assert.equal(row.onceHoldOrLoopSeamChecked, true); }
});
test('shared state component defaults to V3; business timing configuration remains unchanged', () => {
  const source = read('app/BearStateImage.tsx').toString();
  assert.match(source, /basePath = "\/assets\/bear-states-v3"/);
  assert.match(source, /props.basePath \?\? "v3"/);
  const config = read('app/bear-state-config.ts').toString();
  assert.doesNotMatch(config, /loop: false/);
  assert.doesNotMatch(config, /mode: "static"/);
});

test('error icon larger jump preserves duration, rotation and ten-asset partial manifest', () => {
  const render = JSON.parse(read('tests/fixtures/bear-assets/v3-render.json'));
  const error = render.states.find(state => state.id === '02-error');
  assert.equal(render.states.length, 10);
  assert.equal(error.durationSeconds, 2.5);
  assert.equal(error.loop, true);
  assert.equal(error.parameters.iconRestLowerPixelsAt480, 9.12);
  assert.equal(error.parameters.iconRisePixelsAt480, 22.8);
  assert.equal(error.parameters.iconTiltCoefficientDegrees, 0.125 * 180 / Math.PI);
});
