import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
function load(file, modules = {}, globals = {}) {
  const context = { exports: {}, Date, ...globals, require: key => modules[key] };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, context); return context.exports;
}
const model = load('app/seller-workbench/revenue-calendar.ts');
const { calendarDays, shiftCalendarDate, shiftCalendarMonth, calendarAllowed } = model;
test('calendar includes leap day and complete weeks without an unnecessary sixth row', () => {
  const leap = calendarDays('2024-02');
  assert.equal(leap[0], '2024-01-28'); assert.ok(leap.includes('2024-02-29')); assert.equal(leap.length, 35);
  assert.equal(calendarDays('2026-08').length, 42);
  assert.equal(calendarDays('2026-10').length, 35);
});
test('date navigation handles year rollover, short months and daylight-saving dates', () => {
  assert.equal(shiftCalendarMonth('2024-01-31', 1), '2024-02-29');
  assert.equal(shiftCalendarMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(shiftCalendarMonth('2026-01-31', -1), '2025-12-31');
  assert.equal(shiftCalendarDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftCalendarDate('2026-03-08', 1), '2026-03-09');
  assert.equal(calendarAllowed('2026-10-26', '2026-10-01', '2026-10-25'), false);
});
function setup() {
  const state = [], refs = []; let cursor = 0, refCursor = 0;
  const listeners = new Map(), focus = [];
  let effects = [], cleanup = [];
  const hooks = { useId: () => 'test-calendar', useEffect(effect) { effects.push(effect); }, useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; } };
  const document = { addEventListener() {}, removeEventListener() {} };
  const { RevenueDateRange } = load('app/seller-workbench/RevenueDateRange.tsx', { react: hooks, 'react/jsx-runtime': jsx, '../ui/CartoonIcon': { CartoonIcon: () => null }, './revenue-calendar': model }, { document });
  const calls = [], props = { start: '2026-10-01', end: '2026-10-25', today: '2026-10-25', onChange: (...args) => calls.push(args) };
  function flatten(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(flatten); return [node, ...flatten(node.props?.children)]; }
  const render = () => {
    cleanup.forEach(fn => fn?.()); effects = []; cursor = refCursor = 0;
    const result = RevenueDateRange(props);
    refs[0].current = { contains: () => true, querySelector: () => ({ scrollIntoView() {}, focus() {} }), addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    refs[1].current = { focus: () => focus.push('start') }; refs[2].current = { focus: () => focus.push('end') };
    cleanup = effects.map(effect => effect()); return result;
  };
  const nodes = () => flatten(render());
  return { calls, render, nodes, focus, listeners, escape: () => listeners.get('keydown')?.({ key: 'Escape', preventDefault() {}, stopPropagation() {} }), trigger: index => nodes().filter(n => n.props.className === 'revenue-date-trigger')[index], day: date => nodes().find(n => n.props['data-date'] === date), button: label => nodes().find(n => n.type === 'button' && (n.props['aria-label'] === label || n.props.children === label)), confirm: () => nodes().find(n => n.props.className === 'revenue-calendar-confirm') };
}
test('selection is a draft until confirmation; cancel and Escape discard it', () => {
  const h = setup(); h.trigger(1).props.onClick(); h.day('2026-10-04').props.onClick(); assert.equal(h.calls.length, 0);
  h.button('取消').props.onClick(); assert.equal(h.calls.length, 0); assert.equal(h.trigger(1).props['aria-expanded'], false);
  h.trigger(1).props.onClick(); assert.equal(h.day('2026-10-25').props['aria-pressed'], true);
  h.day('2026-10-04').props.onClick(); h.confirm().props.onClick(); assert.deepEqual(h.calls, [['end', '2026-10-04']]);
  h.trigger(0).props.onClick();
  assert.equal(h.render().props.role, 'group'); assert.equal(h.render().props.onKeyDown, undefined);
  const popup = h.nodes().find(n => n.props.role === 'dialog'); assert.equal(popup.props['aria-label'], '选择开始日期'); assert.equal(popup.props.tabIndex, -1);
  assert.equal(h.listeners.has('keydown'), true);
  h.escape(); assert.equal(h.trigger(0).props['aria-expanded'], false); assert.equal(h.focus.at(-1), 'start'); assert.equal(h.listeners.has('keydown'), false);
});
test('only one field opens, repeated click collapses, and invalid end dates are disabled', () => {
  const h = setup(); h.trigger(0).props.onClick(); h.trigger(1).props.onClick();
  assert.equal(h.trigger(0).props['aria-expanded'], false); assert.equal(h.trigger(1).props['aria-expanded'], true);
  assert.equal(h.day('2026-09-30').props.disabled, true); assert.equal(h.day('2026-10-26').props.disabled, true);
  assert.equal(h.button('上个月').props.disabled, true); assert.equal(h.button('下个月').props.disabled, true);
  h.trigger(1).props.onClick(); assert.equal(h.trigger(1).props['aria-expanded'], false);
});
test('keyboard navigation crosses months without selecting or exceeding date limits', () => {
  const h = setup(); h.trigger(0).props.onClick();
  h.day('2026-10-01').props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(h.day('2026-09-30').props.tabIndex, 0); assert.equal(h.calls.length, 0);
  h.trigger(1).props.onClick(); h.day('2026-10-25').props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(h.day('2026-10-25').props.tabIndex, 0);
});
test('month/year navigation allows historic start dates while keeping the draft unchanged', () => {
  const h = setup(); h.trigger(0).props.onClick();
  h.nodes().find(n => n.props.className === 'revenue-calendar-month').props.onClick();
  h.button('上一年').props.onClick(); h.button('2月').props.onClick();
  assert.ok(h.day('2025-02-28')); assert.equal(h.calls.length, 0);
  h.day('2025-02-28').props.onClick(); h.confirm().props.onClick(); assert.deepEqual(h.calls, [['start', '2025-02-28']]);
});
