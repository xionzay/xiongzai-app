import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/ui/usePanelDismiss.ts', import.meta.url), 'utf8');
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

test('repeated dismissal schedules exactly one close and does not invoke it before exit', () => {
  const h=harness(); let calls=0;
  const render=api=>api.usePanelDismiss(()=>calls++);
  let result=h.render(render); result.dismiss(); result.dismiss();
  assert.equal(calls,0); assert.equal(h.timerCount(),1);
  assert.equal(h.render(render).closing,true);
  h.finish(); assert.equal(calls,1); h.cleanup();
});
test('unmount cancels pending close so it cannot close a newer page', () => {
  const h=harness(); let calls=0;
  h.render(api=>api.usePanelDismiss(()=>calls++)).dismiss(); h.cleanup();
  assert.equal(h.timerCount(),0); assert.equal(calls,0);
});
test('reduced motion closes immediately and interrupts an in-flight exit', () => {
  for (const reduced of [true,false]) {
    const h=harness(reduced); let calls=0;
    h.render(api=>api.usePanelDismiss(()=>calls++)).dismiss();
    if (!reduced) h.reduce();
    assert.equal(calls,1); assert.equal(h.timerCount(),0); h.cleanup();
  }
});
test('pending dismissal uses latest callback without rescheduling timers', () => {
  const h=harness(); let first=0,second=0, callback=()=>first++;
  const render=api=>api.usePanelDismiss(callback);
  h.render(render).dismiss(); callback=()=>second++; h.render(render); h.finish();
  assert.equal(first,0); assert.equal(second,1); h.cleanup();
});
