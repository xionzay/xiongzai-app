import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/seller-workbench/SellerUi.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

// Deterministic effect/timer host: exercises interrupted transitions without wall-clock sleeps.
function harness(reduced = false) {
  const media = new EventTarget(); media.matches = reduced;
  const slots = [], pending = [], timers = new Map();
  let cursor = 0, dirty = false, nextTimer = 0, run, result;
  const effect = (fn, deps) => {
    const index = cursor++, old = slots[index];
    if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
      old?.cleanup?.(); slots[index] = { deps };
      pending.push(() => { slots[index].cleanup = fn(); });
    }
  };
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) { const index = cursor++; slots[index] ??= { value }; return [slots[index].value, next => { const v = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(v, slots[index].value)) { slots[index].value = v; dirty = true; } }]; },
    useLayoutEffect: effect, useEffect: effect,
  };
  const scope = { exports: {}, require: () => react, window: { matchMedia: () => media }, setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(compiled, scope);
  function flush() { let guard = 0; do { dirty = false; cursor = 0; result = run(scope.exports); while (pending.length) pending.shift()(); assert.ok(++guard < 12, 'hooks must stabilize'); } while (dirty); return result; }
  return {
    render(fn) { run = fn; return flush(); },
    finish() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } return flush(); },
    reduce() { media.matches = true; media.dispatchEvent(new Event('change')); return flush(); },
    timerCount: () => timers.size,
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('seller dialog retains only its closing visual and clears it after exit', () => {
  const h = harness(); let value = { id: 'price' }; const render = api => api.useSellerPresence(value);
  assert.equal(h.render(render).shown, value);
  value = null; const closing = h.render(render); assert.equal(closing.closing, true); assert.equal(closing.shown.id, 'price');
  assert.equal(h.finish().shown, null); assert.equal(h.timerCount(), 0); h.cleanup();
});

test('reopening during exit cancels stale cleanup and preserves the new dialog', () => {
  const h = harness(); let value = { id: 'price' }; const render = api => api.useSellerPresence(value);
  h.render(render); value = null; h.render(render);
  value = { id: 'stock' }; const reopened = h.render(render); assert.equal(reopened.closing, false); assert.equal(h.timerCount(), 0);
  assert.equal(h.finish().shown.id, 'stock'); h.cleanup();
});

test('reduced motion dismisses immediately and can interrupt an active exit', () => {
  for (const reduced of [true, false]) {
    const h = harness(reduced); let value = { id: 'price' }; const render = api => api.useSellerPresence(value);
    h.render(render); value = null; let state = h.render(render);
    if (!reduced) state = h.reduce();
    assert.equal(state.shown, null); h.cleanup(); assert.equal(h.timerCount(), 0);
  }
});

test('seller detail motion reverses on back and cancels previous transitions', () => {
  const h = harness(); const animations = [];
  const node = { animate(frames, options) { const a = { frames, options, cancelled: false, cancel() { this.cancelled = true; } }; animations.push(a); return a; } };
  const root = { current: { querySelectorAll() { return [node]; } } };
  let view = 'products', depth = 0; const render = api => api.useSellerViewMotion(root, view, depth);
  h.render(render); assert.equal(animations.length, 0);
  view = 'editor'; depth = 1; h.render(render); assert.equal(animations[0].frames[0].transform, 'translateX(10px)');
  view = 'products'; depth = 0; h.render(render); assert.equal(animations[0].cancelled, true); assert.equal(animations[1].frames[0].transform, 'translateX(-10px)');
  h.reduce(); assert.equal(animations[1].cancelled, true); h.cleanup();
});

test('reduced motion skips seller internal transitions without blocking navigation', () => {
  const h = harness(true); let view = 'orders'; const root = { current: { querySelectorAll() { throw new Error('must not animate'); } } };
  const render = api => api.useSellerViewMotion(root, view, 0); h.render(render); view = 'detail'; h.render(render); h.cleanup();
});
