import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { resolveInternalReturnTo } from '../src/auth/return-to';
type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object' || !('props' in value)) return []; const node = value as Node; return [node, ...nodes(node.props.children)]; }
function load(path: string, dependencies: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const context = { exports: {} as Record<string, (props?: unknown) => unknown>, URLSearchParams, require(name: string): unknown { if (name === 'react/jsx-runtime') return require(name); if (name in dependencies) return dependencies[name]; throw new Error(name); } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
test('游客引导不伪造设计示例商品，真实来源只读展示并保留安全 returnTo', () => {
  for (const target of ['/companions/s', '/checkout/confirm?productId=p&skuId=s&flow=fulfillment&quantity=2', 'https://evil.test']) {
    const paths: unknown[] = [], queries: { type: string; id: string; enabled: boolean }[] = [];
    const screen = load('../src/features/auth/auth-required-screen.tsx', {
      'react-native': { ...Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView'].map(n => [n, n])), Animated: { View: 'AnimatedView' }, StyleSheet: { create: (v: unknown) => v } },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      'expo-router': { useLocalSearchParams: () => ({ returnTo: target, action: '收藏' }), router: { replace: (path: unknown) => paths.push(path), back: () => paths.push('back'), canGoBack: () => false } },
      '@/auth/return-to': { resolveInternalReturnTo }, '@/components/brand-backdrop': { BrandBackdrop: 'BrandBackdrop' }, '@/components/native-page': { NativeHeader: 'NativeHeader' }, '@/components/primary-button': { PrimaryButton: 'PrimaryButton' }, '@/components/neutral-state-bear': { NeutralStateBear: 'NeutralStateBear' }, '@/components/file-image': { FileImage: 'FileImage' }, '@/hooks/use-panel-entrance': { usePanelEntrance: () => ({}) }, '@/theme/tokens': { colors: {} },
      '@/features/discovery/discovery-api': { useServiceDetail: (id: string, enabled: boolean) => { queries.push({ type: 'product', id, enabled }); return { data: id ? { title: '真实商品', cover_file_id: 'real-cover' } : undefined }; }, useCompanionDetail: (id: string, enabled: boolean) => { queries.push({ type: 'seller', id, enabled }); return { data: id ? { seller_nickname: '真实店铺', seller_avatar_file_id: 'real-avatar' } : undefined }; } }
    });
    const tree = nodes(screen.AuthRequiredScreen!());
    assert.ok(tree.some(n => n.type === 'NeutralStateBear')); assert.ok(!tree.some(n => n.props.children === '人'));
    assert.ok(tree.some(n => n.type === 'ScrollView'));
    (tree.find(n => n.props.label === '手机号登录 / 注册')!.props.onPress as () => void)();
    assert.equal((paths[0] as { params: { returnTo: string } }).params.returnTo, resolveInternalReturnTo(target));
    if (target.startsWith('https')) { assert.ok(queries.every(q => !q.enabled)); assert.ok(!tree.some(n => n.type === 'FileImage')); }
    else assert.equal(tree.find(n => n.type === 'FileImage')!.props.fileId, target.includes('companions') ? 'real-avatar' : 'real-cover');
    (tree.find(n => n.props.accessibilityLabel === '继续浏览')!.props.onPress as () => void)(); assert.equal(paths.at(-1), '/(buyer-tabs)');
  }
});
test('熊崽仅在前台当前页面播放，减少动态、解码失败和离开页面使用静态图', async () => {
  const state: unknown[] = [], effects: (() => () => void)[] = [], listeners: Record<string, () => void> = {};
  let index = 0, activity = 'active', reduced!: (value: boolean) => void;
  const navigation = { isFocused: () => true, addListener: (name: string, fn: () => void) => { listeners[name] = fn; return () => { delete listeners[name]; }; } };
  const component = load('../src/components/neutral-state-bear.tsx', {
    react: { useState(initial: unknown) { const at = index++; if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial; return [state[at], (value: unknown) => { state[at] = value; }]; }, useEffect: (fn: () => () => void) => effects.push(fn) },
    'react-native': { Image: 'Image', AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: (_name: string, fn: (value: boolean) => void) => { reduced = fn; return { remove: () => {} }; } } },
    'expo-router': { useNavigation: () => navigation }, '@/hooks/use-app-activity': { useAppActivity: () => activity }, '../../assets/bear-state-neutral/poster.png': 'poster', '../../assets/bear-state-neutral/animated.gif': 'animated'
  });
  const render = () => { index = 0; return component.NeutralStateBear!({}) as Node | null; };
  assert.equal(render()!.props.source, 'poster'); const cleanups = effects.splice(0).map(fn => fn()); await Promise.resolve();
  assert.equal(render()!.props.source, 'animated'); activity = 'background'; assert.equal(render()!.props.source, 'poster'); activity = 'active';
  listeners.blur!(); assert.equal(render()!.props.source, 'poster'); listeners.focus!();
  reduced(true); assert.equal(render()!.props.source, 'poster'); reduced(false);
  (render()!.props.onError as () => void)(); assert.equal(render()!.props.source, 'poster');
  (render()!.props.onError as () => void)(); assert.equal(render(), null);
  cleanups.forEach(fn => fn()); assert.deepEqual(Object.keys(listeners), []);
});
test('原生中性熊素材与 UI 原图逐字节相同，不重新生成品牌形象', () => {
  for (const [native, web] of [['poster.png', 'posters/09-neutral.png'], ['animated.gif', 'assets/09-neutral.gif']]) assert.ok(readFileSync(new URL(`../assets/bear-state-neutral/${native}`, import.meta.url)).equals(readFileSync(new URL(`../../../public/assets/bear-states-v3/${web}`, import.meta.url))));
});
