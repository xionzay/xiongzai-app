import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/useUserUiMotion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ reduced = false } = {}) {
  class Element extends EventTarget {
    constructor() { super(); this.dataset = {}; }
    closest(selector) { return selector.includes('carousel') ? null : this; }
    removeAttribute(name) { if (name === 'data-pressed') delete this.dataset.pressed; }
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; }
    animate(frames, options) { const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } }; animations.push(animation); return animation; }
  }
  const animations = [], root = new Element(), button = new Element(), screen = new Element(), icon = new Element();
  root.dataset.uiRefinement = 'on';
  root.querySelector = () => screen;
  screen.querySelector = () => icon;
  const window = new EventTarget(), document = new EventTarget(), media = new EventTarget();
  media.matches = reduced; window.matchMedia = () => media; document.hidden = false;
  const refs = [], effects = [], layouts = [];
  let cursor = 0;
  const react = { useRef(initial) { const slot = cursor++; return refs[slot] ??= { current: initial }; }, useEffect(fn) { effects.push(fn); }, useLayoutEffect(fn) { layouts.push(fn); } };
  const scope = { exports: {}, require: () => react, window, document, Element, HTMLElement: Element, Date, getComputedStyle: () => ({ getPropertyValue: name => ({ '--motion-content': '200ms', '--motion-ease': 'ease-out', '--motion-nav-scale': '1.06' }[name] ?? '') }) };
  vm.runInNewContext(compiled, scope);
  const ref = { current: root };
  let cleanupLayout, cleanupEffect;
  function render(page) {
    cleanupLayout?.(); cursor = 0; layouts.length = 0; effects.length = 0;
    scope.exports.useUserUiMotion(ref, page);
    cleanupLayout = layouts[0]();
    if (!cleanupEffect) cleanupEffect = effects[0]();
  }
  function fire(target, type, extra = {}) { const event = new Event(type, { cancelable: true }); for (const [key, value] of Object.entries(extra)) Object.defineProperty(event, key, { value }); target.dispatchEvent(event); return event; }
  const down = () => fire(root, 'pointerdown', { target: button, isPrimary: true, button: 0, clientX: 20, clientY: 20, pointerId: 1 });
  return { root, button, window, document, media, animations, render, fire, down, cleanup: () => { cleanupLayout?.(); cleanupEffect?.(); } };
}

test('press is immediate; drag cancellation clears visual feedback and blocks only the resulting pointer click', () => {
  const h = harness(); h.render('home'); h.down(); assert.equal(h.button.dataset.pressed, 'true');
  h.fire(h.window, 'pointermove', { pointerId: 1, clientX: 40, clientY: 20 });
  assert.equal(h.button.dataset.pressed, undefined);
  assert.equal(h.fire(h.root, 'click', { target: h.button, detail: 1 }).defaultPrevented, true);
  assert.equal(h.fire(h.root, 'click', { target: h.button, detail: 0 }).defaultPrevented, false);
  h.down(); h.fire(h.window, 'pointerup'); assert.equal(h.button.dataset.pressed, undefined);
  assert.equal(h.fire(h.root, 'click', { target: h.button, detail: 1 }).defaultPrevented, false); h.cleanup();
});

test('backgrounding cancels transient feedback and page animations', () => {
  const h = harness(); h.render('messages'); h.down(); h.document.hidden = true; h.fire(h.document, 'visibilitychange');
  assert.equal(h.button.dataset.pressed, undefined); assert.ok(h.animations.every(a => a.cancelled)); h.cleanup();
});

test('navigation cancels obsolete animations and returning home does not replay the page entrance', () => {
  const h = harness(); h.render('home'); const first = h.animations[0];
  h.render('messages'); assert.equal(first.cancelled, true); const before = h.animations.length;
  h.render('home'); assert.equal(h.animations.length - before, 1); // only selected nav icon
  const nav = h.animations.at(-1); assert.equal(nav.frames.at(-1).scale, 1); assert.equal(nav.options.duration, 200);
  h.fire(h.media, 'change'); assert.equal(nav.cancelled, true); h.cleanup();
});

test('reduced motion skips page and navigation animations entirely', () => {
  const h = harness({ reduced: true }); h.render('home'); h.render('messages'); assert.equal(h.animations.length, 0); h.cleanup();
});
