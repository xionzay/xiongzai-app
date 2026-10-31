import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { sellerEntry } from '../src/features/seller/seller-domain';
import { ApiClientError } from '../src/api/api-error';

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(typeof node.type === 'function' ? node.type(node.props) : node.props.children)];
}
function render(status: string, application?: string, pending = false, failed = false) {
  const require = createRequire(import.meta.url), routes: unknown[] = [];
  const context = { exports: {} as { SellerStatusScreen(): unknown }, require(name: string): unknown {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react') return { useState: (value: unknown) => [value, () => {}] };
    if (name === 'react-native') return { ...Object.fromEntries(['Pressable', 'RefreshControl', 'ScrollView', 'Text', 'View'].map(k => [k, k])), StyleSheet: { create: (value: unknown) => value } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-router') return { router: { push: (route: unknown) => routes.push(route), dismissTo: (route: unknown) => routes.push(route) } };
    if (name === '@/auth/auth-provider') return { useAuth: () => ({ user: {} }) };
    if (name === '@/api/api-error') return { ApiClientError };
    if (name === '@/features/seller/seller-domain') return { sellerEntry };
    if (name === '@/features/seller/seller-api') return {
      useSellerProfile: () => ({ isPending: pending, isError: failed, data: status === 'NOT_APPLIED' ? undefined : { status, version: 1, latest_application: { status: application, version_no: 1, rejection_reason: '真实审核原因', required_fields: ['资料字段'] }, suspended_reason: status === 'SUSPENDED' ? '真实暂停原因' : undefined } }),
      useSellerApplications: () => ({ data: [] })
    };
    if (name === '@/theme/tokens') return { colors: {} };
    if (name.startsWith('@/components/') || name.endsWith('jelly-icon')) return new Proxy({}, { get: (_target, key) => String(key) });
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/seller/seller-status-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return { tree: nodes(context.exports.SellerStatusScreen()), routes };
}
test('陪玩八种真实资格状态使用设计对应熊，通过后返回设置切换身份', () => {
  for (const [status, application, kind, size] of [
    ['NOT_APPLIED', undefined, 'neutral', 128], ['DRAFT', 'DRAFT', 'neutral', 128],
    ['PENDING_REVIEW', 'UNDER_REVIEW', 'waiting', 128], ['PENDING_REVIEW', 'NEEDS_SUPPLEMENT', 'neutral', 128],
    ['REJECTED', 'REJECTED', 'error', 128], ['APPROVED', 'APPROVED', 'success', 160],
    ['SUSPENDED', 'APPROVED', 'neutral', 128], ['BANNED', 'APPROVED', 'neutral', 128]
  ] as const) {
    const result = render(status, application);
    const art = result.tree.find(n => n.type === 'StateBear'); assert.ok(art);
    assert.equal(art.props.kind, kind); assert.equal(art.props.size, size);
    const enter = result.tree.find(n => n.props.accessibilityLabel === '返回设置切换身份');
    assert.equal(Boolean(enter), status === 'APPROVED');
    if (enter) { (enter.props.onPress as () => void)(); assert.deepEqual(result.routes, ['/settings/switch-identity']); }
    if (status !== 'NOT_APPLIED') assert.ok(result.tree.some(n => Array.isArray(n.props.children) && n.props.children.includes('真实审核原因')));
    if (status === 'SUSPENDED') assert.ok(result.tree.some(n => Array.isArray(n.props.children) && n.props.children.includes('真实暂停原因')));
  }
});
test('资格正在读取或读取失败时不显示成功熊或可进入中心按钮', () => {
  for (const [pending, failed, expected] of [[true, false, 'loading'], [false, true, 'error']] as const) {
    const { tree } = render('APPROVED', 'APPROVED', pending, failed);
    assert.equal(tree.some(n => n.type === 'StateBear'), false);
    assert.equal(tree.find(n => n.type === 'StateView')?.props.kind, expected);
    assert.equal(tree.some(n => n.props.accessibilityLabel === '返回设置切换身份'), false);
  }
});
