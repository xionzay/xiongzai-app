import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { identitySwitchPresentation, identitySwitchTarget } from '../src/features/account/identity-switch-domain';
import { isAllowedInternalRoute } from '../src/auth/return-to';
import type { SellerProfileApiView } from '../src/types/api';

const profile = (status: string, application?: string) => ({ status, latest_application: application ? { status: application } : null } as SellerProfileApiView);
test('入驻各状态只在已通过时开放卖家切换，申请和进度不切换身份', () => {
  const cases = [
    [null, '申请入驻成为卖家', '/seller/apply'],
    [profile('DRAFT'), '继续入驻申请', '/seller/apply'],
    [profile('PENDING_REVIEW'), '查看审核进度', '/seller/status'],
    [profile('PENDING_REVIEW', 'NEEDS_SUPPLEMENT'), '补充入驻资料', '/seller/apply'],
    [profile('REJECTED'), '修改入驻申请', '/seller/apply'],
    [profile('SUSPENDED', 'APPROVED'), '查看资格状态', '/seller/status'],
    [profile('BANNED', 'APPROVED'), '查看资格状态', '/seller/status'],
    [profile('APPROVED', 'UNDER_REVIEW'), '切换为“卖家”身份', '/(seller-tabs)']
  ] as const;
  for (const [seller, label, path] of cases) {
    assert.equal(identitySwitchPresentation('buyer', seller).label, label);
    assert.equal(identitySwitchTarget('buyer', seller), path);
  }
  assert.equal(identitySwitchTarget('seller', null), '/(buyer-tabs)');
  assert.equal(isAllowedInternalRoute('/settings/switch-identity'), true);
});

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}
function screen(options: { seller?: SellerProfileApiView | null; guest?: boolean; pending?: boolean; error?: boolean; request?: () => Promise<unknown> } = {}) {
  const require = createRequire(import.meta.url), states: unknown[] = [], navigations: unknown[] = [], cleanups: (() => void)[] = [];
  let index = 0, calls = 0;
  const query = { data: options.seller, isPending: !!options.pending, isError: !!options.error, error: options.error ? new Error('offline') : undefined, refetch: async () => {} };
  const useState = (initial: unknown) => {
    const key = index++;
    if (!(key in states)) states[key] = initial;
    return [states[key], (value: unknown) => { states[key] = value; }];
  };
  const context = { AbortController, exports: {} as { IdentitySwitchScreen: () => unknown }, require: (name: string): unknown => {
    if (name === 'react') return { useState, useRef: (value: unknown) => useState({ current: value })[0], useCallback: (fn: unknown) => fn, useEffect: (fn: () => (() => void) | undefined) => { if (!cleanups.length) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } } };
    if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (x: unknown) => x } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-router') return { router: { push: (x: unknown) => navigations.push(x), dismissTo: (x: unknown) => navigations.push(x) }, useLocalSearchParams: () => ({}), useFocusEffect: () => {} };
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({ setQueryData: () => {} }) };
    if (name === '@/auth/auth-provider') return { useAuth: () => ({ user: options.guest ? null : { id: 'current-user' } }) };
    if (name === '@/auth/runtime') return { apiClient: { request: async () => { calls++; return options.request ? options.request() : options.seller; } } };
    if (name === '@/features/seller/seller-api') return { useSellerProfile: () => query };
    if (name === './identity-switch-domain') return { identitySwitchPresentation, identitySwitchTarget };
    if (name === '@/theme/tokens') return { colors: {} };
    if (name.startsWith('@/components/')) return Object.fromEntries(['BrandBackdrop', 'NativeHeader', 'ApprovedIllustration'].map(x => [x, x]));
    if (name.endsWith('.png')) return 1;
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/account/identity-switch-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const render = () => { index = 0; return elements(context.exports.IdentitySwitchScreen()); };
  const button = () => render().find(node => node.type === 'Pressable')!;
  return { render, button, navigations, unmount: () => cleanups.forEach(fn => fn()), get calls() { return calls; } };
}

test('真实组件加载或失败不显示已通过；游客先登录并返回切换页', async () => {
  const loading = screen({ pending: true });
  assert.equal(loading.button().props.disabled, true);
  assert.equal(loading.button().props.accessibilityLabel, '正在读取入驻状态…');
  assert.equal(screen({ error: true }).button().props.accessibilityLabel, '重新读取入驻状态');
  const guest = screen({ guest: true });
  await (guest.button().props.onPress as () => Promise<void>)();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(guest.calls, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(guest.navigations)), [{ pathname: '/(auth)/required', params: { returnTo: '/settings/switch-identity', action: '申请入驻或切换身份' } }]);
});

test('点击重新核验资格，已通过缓存但实际暂停时不能切卖家', async () => {
  const stale = screen({ seller: profile('APPROVED'), request: async () => profile('SUSPENDED') });
  await (stale.button().props.onPress as () => Promise<void>)();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stale.calls, 1);
  assert.deepEqual(stale.navigations, ['/seller/status']);
  const approved = screen({ seller: profile('APPROVED') });
  await (approved.button().props.onPress as () => Promise<void>)();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(approved.navigations, ['/(seller-tabs)']);
  const rejected = screen({ seller: profile('REJECTED') });
  await (rejected.button().props.onPress as () => Promise<void>)();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rejected.navigations, ['/seller/apply']);
});

test('重复点击只查询一次，离开或网络失败不会继续切换', async () => {
  let complete!: (value: unknown) => void;
  const harness = screen({ seller: profile('APPROVED'), request: () => new Promise(resolve => { complete = resolve; }) });
  const first = (harness.button().props.onPress as () => Promise<void>)();
  await new Promise(resolve => setImmediate(resolve));
  await (harness.button().props.onPress as () => Promise<void>)();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.calls, 1);
  harness.unmount(); complete(profile('APPROVED')); await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.navigations.length, 0);
  const failed = screen({ seller: profile('APPROVED'), request: async () => { throw new Error('offline'); } });
  await (failed.button().props.onPress as () => Promise<void>)();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.navigations.length, 0);
  assert.ok(failed.render().some(node => node.props.accessibilityRole === 'alert'));
});
