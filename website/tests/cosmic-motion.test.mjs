import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/CosmicCanvas.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function harness(width, reduced = false, variant = 'pink', height = 900) {
  let cleanup, now = 1000, frames = 0, nextId = 0;
  let blurredPaints = 0, bitmapPaints = 0;
  const scheduled = new Map(), observers = [], listeners = new Map();
  const target = () => ({
    addEventListener(type, fn) { listeners.set(this, { ...(listeners.get(this) || {}), [type]: fn }); },
    removeEventListener(type) { delete listeners.get(this)?.[type]; },
  });
  const host = { ...target(), getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) };
  const gradient = { addColorStop() {} };
  const makeContext = (main) => new Proxy({ shadowBlur: 0, globalAlpha: 1 }, { get(object, key) {
    if (key in object) return object[key];
    if (key === 'clearRect') return () => { if (main) frames++; };
    if (key === 'drawImage') return () => { if (main) bitmapPaints++; };
    if (key === 'fill' || key === 'stroke') return () => { if (main && object.shadowBlur > 0) blurredPaints++; };
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => { args.forEach(n => assert(Number.isFinite(n))); return gradient; };
    return (...args) => { args.filter(n => typeof n === 'number').forEach(n => assert(Number.isFinite(n))); };
  }});
  const context = makeContext(true);
  const canvas = { parentElement: host, style: {}, getContext: () => context };
  const media = { ...target(), matches: reduced };
  const tiles = [];
  const document = { ...target(), hidden: false, createElement: () => {
    const tileContext = makeContext(false);
    const tile = { width: 0, height: 0, getContext: () => tileContext };
    tiles.push(tile); return tile;
  } };
  const requestAnimationFrame = fn => { scheduled.set(++nextId, fn); return nextId; };
  const cancelAnimationFrame = id => scheduled.delete(id);
  const window = { ...target(), devicePixelRatio: 3, matchMedia: () => media, requestAnimationFrame, cancelAnimationFrame };
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name === 'react') return { useRef: () => ({ current: canvas }), useEffect: effect => { cleanup = effect(); } };
    if (name === 'react/jsx-runtime') return { jsx: () => null };
    throw Error(name);
  }, window, document, performance: { now: () => now }, ResizeObserver: Observer, IntersectionObserver: Observer });
  exports.default({ variant, transparent: true, density: 1.45 });
  const intersection = observers[1];
  return {
    canvas,
    tiles,
    blurredPaints: () => blurredPaints,
    bitmapPaints: () => bitmapPaints,
    resize(w = width, h = height, dpr = window.devicePixelRatio) {
      width = w; height = h; window.devicePixelRatio = dpr; observers[0].callback();
    },
    frames: () => frames,
    queued: () => scheduled.size,
    visible(value) { intersection.callback([{ isIntersecting: value }]); },
    hidden(value) { document.hidden = value; listeners.get(document).visibilitychange(); },
    reduced(value) { media.matches = value; listeners.get(media).change(); },
    advance(ms, hz = 60) {
      const end = now + ms;
      for (let tick = now + 1000 / hz; tick <= end + .001; tick += 1000 / hz) {
        now = tick;
        const pending = [...scheduled.values()]; scheduled.clear(); pending.forEach(fn => fn(now));
      }
    },
    cleanup() { cleanup(); assert.equal(scheduled.size, 0); assert(observers.every(o => o.disconnected)); assert([...listeners.values()].every(x => !Object.keys(x).length)); assert(tiles.every(t => t.width === 1 && t.height === 1)); },
  };
}

for (const width of [390, 768, 1440, 1920]) {
  for (const variant of ['hero', 'violet', 'journey', 'light', 'pink']) {
    for (const reduced of [false, true]) {
      test(`finite drawing / pause / cleanup: ${width} ${variant} reduced=${reduced}`, () => {
        const h = harness(width, reduced, variant);
        assert(h.canvas.width * h.canvas.height <= 3003000);
        h.visible(true);
        const before = h.frames(); h.advance(1000);
        assert.equal(h.frames() > before, !reduced);
        h.visible(false); const offscreen = h.frames(); h.advance(1000);
        assert.equal(h.frames(), offscreen); assert.equal(h.queued(), 0);
        h.visible(true); h.hidden(true); const hidden = h.frames(); h.advance(1000);
        assert.equal(h.frames(), hidden); assert.equal(h.queued(), 0);
        h.hidden(false); h.reduced(true); assert.equal(h.queued(), 0);
        const still = h.frames(); h.advance(1000); assert.equal(h.frames(), still);
        h.reduced(false); h.advance(1000); assert(h.frames() > still);
        h.cleanup();
      });
    }
  }
}

test('4K display respects the canvas pixel budget', () => {
  const h = harness(3840, false, 'pink', 2160);
  assert(h.canvas.width * h.canvas.height <= 3003000);
  assert(h.canvas.width < 3840);
  h.visible(true); h.advance(1000);
  assert(h.frames() > 1);
  h.cleanup();
});

for (const width of [390, 1920, 3840]) {
  test(`launch glow cache is bounded, reused and freed: ${width}`, () => {
    const h = harness(width, false, 'pink', 1080);
    assert.equal(h.tiles.length, 8);
    assert(h.tiles.every(tile => tile.width * tile.height <= 3003000));
    h.visible(true); h.advance(3000);
    assert.equal(h.blurredPaints(), 0, 'no live Canvas blur on pink frames');
    assert(h.bitmapPaints() > 0, 'cached glow is still drawn');
    h.resize(); h.visible(false); h.visible(true); h.advance(1000);
    assert.equal(h.tiles.length, 8, 'no repeated allocations on entry or unchanged resize');
    const oldTrack = h.tiles[0];
    h.resize(768, 1024, 1);
    assert.equal(h.tiles.length, 9, 'only track rebuilt after a real resize');
    assert.equal(oldTrack.width, 1);
    assert.equal(h.canvas.width, 768);
    h.resize(768, 1024, 2);
    assert.equal(h.canvas.width, Math.round(768 * 1.3));
    h.advance(1000); h.cleanup();
  });
}

for (const hz of [60, 90, 120, 144]) {
  for (const [width, targetFps] of [[390, 24], [1440, 30]]) {
    test(`stable ${targetFps} FPS scheduling on simulated ${hz}Hz clock`, () => {
      const h = harness(width); h.visible(true);
      const before = h.frames(); h.advance(10000, hz);
      const fps = (h.frames() - before) / 10;
      assert(Math.abs(fps - targetFps) <= .2, `${fps} vs ${targetFps}`);
      h.cleanup();
    });
  }
}

test('hero parallax responds when reduced-motion preference changes', () => {
  const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const effect = page.slice(page.indexOf('    const hero = heroRef.current;'), page.indexOf('\n  }, []);', page.indexOf('    const hero = heroRef.current;')));
  const js = ts.transpileModule(`function run() {${effect}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const variables = {}, events = {}, mediaEvents = {};
  let reads = 0;
  const hero = {
    style: { setProperty: (name, value) => { variables[name] = value; } },
    getBoundingClientRect: () => { reads++; return { left: 0, top: 0, width: 100, height: 100 }; },
    addEventListener: (name, fn) => { events[name] = fn; },
    removeEventListener: name => { delete events[name]; },
  };
  const media = { matches: true, addEventListener: (n, fn) => { mediaEvents[n] = fn; }, removeEventListener: n => { delete mediaEvents[n]; } };
  const cleanup = vm.runInNewContext(`${js}\nrun()`, { heroRef: { current: hero }, window: { matchMedia: () => media } });
  events.pointermove({ clientX: 70, clientY: 30, pointerType: 'mouse' }); assert.equal(reads, 0);
  media.matches = false; mediaEvents.change();
  events.pointermove({ clientX: 70, clientY: 30, pointerType: 'mouse' }); assert.equal(variables['--pointer-x'], '0.200');
  media.matches = true; mediaEvents.change(); assert.equal(variables['--pointer-x'], '0');
  cleanup(); assert.equal(Object.keys(events).length, 0); assert.equal(Object.keys(mediaEvents).length, 0);
});
