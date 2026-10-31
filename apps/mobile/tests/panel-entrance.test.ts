import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function mount() {
  let resolve!: (reduced: boolean) => void;
  let reject!: (error: Error) => void;
  let changed!: (reduced: boolean) => void;
  let cleanup!: () => void;
  let stopped = 0, removed = 0;
  const values: number[] = [], animations: Record<string, unknown>[] = [];
  const initial = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
  class Value {
    constructor(value: number) { values.push(value); }
    setValue(value: number) { values.push(value); }
    stopAnimation() { stopped++; }
    interpolate(config: unknown) { return config; }
  }
  const context = { exports: {} as { usePanelEntrance(): unknown }, require(name: string) {
    if (name === 'react') return { useState: (value: () => unknown) => [value()], useEffect: (fn: () => () => void) => { cleanup = fn(); } };
    if (name === 'react-native') return {
      AccessibilityInfo: { isReduceMotionEnabled: () => initial, addEventListener: (_name: string, fn: (value: boolean) => void) => { changed = fn; return { remove: () => removed++ }; } },
      Animated: { Value, timing: (_value: unknown, config: Record<string, unknown>) => ({ start: () => animations.push(config) }) },
      Easing: { bezier: (...numbers: number[]) => numbers }
    };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/hooks/use-panel-entrance.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const style = context.exports.usePanelEntrance();
  return { resolve, reject, changed: (value: boolean) => changed(value), cleanup: () => cleanup(), animations, values, style, get removed() { return removed; }, get stopped() { return stopped; } };
}
test('规格弹窗沿用设计 180ms、12dp 入场，启用原生驱动', async () => {
  const h = mount(); h.resolve(false); await Promise.resolve();
  assert.equal(h.animations.length, 1);
  assert.equal(h.animations[0]!.duration, 180);
  assert.equal(h.animations[0]!.useNativeDriver, true);
  assert.deepEqual(JSON.parse(JSON.stringify((h.style as { transform: unknown }).transform)), [{ translateY: { inputRange: [0, 1], outputRange: [12, 0] } }]);
  h.cleanup(); assert.equal(h.removed, 1); assert.equal(h.stopped, 2);
});
test('减少动态优先于过期初始化结果，权限读取失败时静态呈现', async () => {
  const h = mount(); h.changed(true); h.resolve(false); await Promise.resolve();
  assert.equal(h.animations.length, 0); assert.equal(h.values.at(-1), 1);
  const failed = mount(); failed.reject(new Error('unavailable')); await Promise.resolve();
  assert.equal(failed.animations.length, 0); assert.equal(failed.values.at(-1), 1);
});
test('弹窗关闭后停止动画、移除监听，忽略未完成的系统设置读取', async () => {
  const h = mount(); h.cleanup(); h.resolve(false); h.changed(false); await Promise.resolve();
  assert.equal(h.animations.length, 0); assert.deepEqual(h.values, [0]); assert.equal(h.removed, 1);
});
