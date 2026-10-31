import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

type Element = { type: unknown; key?: string; props: Record<string, unknown> };
function compile(path: string, dependencies: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  const require = createRequire(import.meta.url);
  const context = { exports: {} as Record<string, (props: Record<string, unknown>) => Element | null>, ...extras, require(name: string): unknown {
    if (name === 'react/jsx-runtime') return require(name);
    if (name in dependencies) return dependencies[name];
    if (/assets\/bear-state(?:s|-neutral)\/.*\.(png|gif)$/.test(name)) return name;
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
function player({ hasNavigation = true }: { hasNavigation?: boolean } = {}) {
  const state: unknown[] = [], deps: (readonly unknown[] | undefined)[] = [], cleanup: (((() => void) | undefined))[] = [];
  const pending: (() => void)[] = [], listeners = new Map<string, () => void>(), timers = new Map<number, () => void>();
  let index = 0, focused = true, activity = 'active', timerId = 0, dead = false, lateUpdates = 0;
  let readMotion!: (value: boolean) => void, motion!: (value: boolean) => void;
  let measure: (callback: (x: number, y: number, width: number, height: number) => void) => void = callback => callback(10, 100, 160, 160);
  const navigation = hasNavigation ? { isFocused: () => focused, addListener(name: string, fn: () => void) { listeners.set(name, fn); return () => listeners.delete(name); } } : undefined;
  const react = {
    useContext: () => navigation,
    useCallback: (fn: unknown) => fn,
    useSyncExternalStore(subscribe: (fn: () => void) => () => void, snapshot: () => boolean) { const at = index++; if (!(at in state)) { state[at] = true; cleanup[at] = subscribe(() => {}); } return snapshot(); },
    useState(initial: unknown) { const at = index++; if (!(at in state)) state[at] = initial; return [state[at], (value: unknown) => { if (dead) lateUpdates++; state[at] = value; }]; },
    useRef() { const at = index++; if (!(at in state)) state[at] = { current: { measureInWindow: (callback: Parameters<typeof measure>[0]) => measure(callback) } }; return state[at]; },
    useEffect(fn: () => void | (() => void), next: readonly unknown[]) { const at = index++; if (!deps[at] || next.some((v, i) => v !== deps[at]![i])) { deps[at] = next; pending.push(() => { cleanup[at]?.(); cleanup[at] = fn() || undefined; }); } },
  };
  const component = compile('../src/components/state-bear.tsx', {
    react, 'expo-router/react-navigation': { NavigationContext: {} }, '@/hooks/use-app-activity': { useAppActivity: () => activity },
    'react-native': { Image: 'Image', View: 'View', useWindowDimensions: () => ({ width: 390, height: 844 }), AccessibilityInfo: { isReduceMotionEnabled: () => new Promise<boolean>(resolve => { readMotion = resolve; }), addEventListener: (_name: string, fn: typeof motion) => { motion = fn; return { remove: () => {} }; } } },
  }, { setInterval: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearInterval: (id: number) => timers.delete(id) });
  const wrapper = component.StateBear!({ kind: 'empty', size: 176 })!;
  const render = () => { index = 0; return (wrapper.type as (props: Record<string, unknown>) => Element | null)(wrapper.props); };
  const flush = () => { pending.splice(0).forEach(fn => fn()); };
  const source = () => (render()?.props.children as Element | undefined)?.props.source as string | undefined;
  return { source, render, flush, timers, listeners, wrapper, motion: (value: boolean) => motion(value), resolveMotion: (value: boolean) => readMotion(value), focus: (value: boolean) => { focused = value; }, activity: (value: string) => { activity = value; }, measure: (fn: typeof measure) => { measure = fn; }, unmount: () => { cleanup.forEach(fn => fn?.()); dead = true; }, get lateUpdates() { return lateUpdates; } };
}

test('原版状态熊图片与 GIF 逐字节保持设计源素材一致', () => {
  for (const id of ['01-loading', '02-error', '03-success', '04-empty', '05-offline', '06-waiting']) for (const ext of ['png', 'gif']) {
    const native = readFileSync(new URL(`../assets/bear-states/${id}.${ext}`, import.meta.url));
    const web = readFileSync(new URL(`../../../public/assets/bear-states-v3/${ext === 'png' ? 'posters' : 'assets'}/${id}.${ext}`, import.meta.url));
    assert.ok(native.equals(web), `${id}.${ext}`);
  }
});
test('动态仅在前台聚焦且可见时播放，后台和失焦释放动画与定时器', async () => {
  const h = player(); assert.match(h.source()!, /04-empty.png$/); h.flush(); h.resolveMotion(false); await Promise.resolve();
  h.render(); h.flush(); assert.match(h.source()!, /04-empty.gif$/); assert.equal(h.timers.size, 1);
  h.activity('background'); assert.match(h.source()!, /png$/); h.flush(); assert.equal(h.timers.size, 0);
  h.activity('active'); h.focus(false); assert.match(h.source()!, /png$/); h.flush(); assert.equal(h.timers.size, 0);
  h.focus(true); h.render(); h.flush(); assert.match(h.source()!, /gif$/);
  h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});
test('滚出屏幕切换静态图，返回可见区域恢复，重复渲染不新增轮询', async () => {
  const h = player(); h.render(); h.flush(); h.resolveMotion(false); await Promise.resolve(); h.render(); h.flush();
  h.measure(callback => callback(0, 900, 160, 160)); h.timers.forEach(fn => fn()); assert.match(h.source()!, /png$/);
  h.measure(callback => callback(0, 100, 160, 160)); h.timers.forEach(fn => fn()); assert.match(h.source()!, /gif$/);
  for (let i = 0; i < 5; i++) { h.render(); h.flush(); } assert.equal(h.timers.size, 1); h.unmount();
});
test('减少动态事件优先于迟到的系统读取，无导航容器也安全静态显示', async () => {
  const h = player(); h.render(); h.flush(); h.motion(true); h.resolveMotion(false); await Promise.resolve(); h.render(); h.flush();
  assert.match(h.source()!, /png$/); assert.equal(h.timers.size, 0); h.unmount();
  const outside = player({ hasNavigation: false }); outside.render(); outside.flush(); outside.resolveMotion(false); await Promise.resolve(); outside.render(); outside.flush();
  assert.match(outside.source()!, /png$/); assert.equal(outside.timers.size, 0); outside.unmount();
});
test('动画解码失败退回原静态图，两者失败不影响外围文案；卸载后异步测量不更新状态', async () => {
  const h = player(); h.render(); h.flush(); h.resolveMotion(false); await Promise.resolve(); h.render(); h.flush();
  ((h.render()!.props.children as Element).props.onError as () => void)(); h.render(); h.flush(); assert.match(h.source()!, /png$/);
  ((h.render()!.props.children as Element).props.onError as () => void)(); assert.equal(h.render(), null); h.unmount();
  const late = player(); late.render(); late.flush(); late.resolveMotion(false); await Promise.resolve();
  let callback!: (x: number, y: number, w: number, height: number) => void;
  late.measure(fn => { callback = fn; }); late.render(); late.flush(); late.unmount(); callback(0, 0, 160, 160); assert.equal(late.lateUpdates, 0);
});
test('状态层保留真实文案和重试；加载不可重试，不因插画故障伪造业务成功', () => {
  const component = compile('../src/components/state-view.tsx', {
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (value: unknown) => value } }, './state-bear': { StateBear: 'StateBear' }, '@/theme/tokens': { colors: {} },
  });
  let retries = 0;
  for (const kind of ['loading', 'empty', 'error', 'offline']) {
    const tree = component.StateView!({ kind, title: '真实状态', message: '真实原因', onRetry: () => retries++ })!;
    const children = tree.props.children as (Element | null)[];
    assert.equal((children[0]!.props.children as Element).props.kind, kind); assert.equal(children[1]!.props.children, '真实状态'); assert.equal(children[2]!.props.children, '真实原因');
    if (kind === 'loading') assert.equal(children[3], null);
    else (children[3]!.props.onPress as () => void)();
  }
  assert.equal(retries, 3);
});
test('站内通知只有真实空列表呈现空内容熊，不将错误或未登录伪装为空通知', () => {
  const source = readFileSync(new URL('../src/features/chat/notifications-screen.tsx', import.meta.url), 'utf8');
  assert.match(source, /ListEmptyComponent=\{<NotificationState empty title="暂无通知"/);
  assert.match(source, /if \(empty\) return <View[^\n]*<StateBear kind="empty" size=\{160\}/);
  assert.match(source, /query\.isError \? \(/);
  assert.match(source, /<NotificationState failed title="通知加载失败"/);
  assert.match(source, /系统推送尚未接入/);
});
