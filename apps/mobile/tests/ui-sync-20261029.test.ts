import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { identitySwitchTarget } from '../src/features/account/identity-switch-domain';
import { orderEntryWidth } from '../src/theme/approved-layout';
import type { SellerProfileApiView } from '../src/types/api';

test('新设计每屏五个入口，小屏和大字体仍可横向展开七入口', () => {
  for (const width of [320, 375, 390, 430]) {
    assert.equal(orderEntryWidth(width) * 5, width - 28);
    assert.ok(orderEntryWidth(width) * 7 > width - 28);
    assert.ok(orderEntryWidth(width, 2) > orderEntryWidth(width));
  }
});
test('身份切换沿用真实 SellerStatus，不让审核中或暂停账号进入卖家中心', () => {
  for (const status of ['NOT_APPLIED', 'PENDING', 'SUSPENDED', 'BANNED', 'REJECTED'] as const) {
    assert.equal(identitySwitchTarget('buyer', { status } as SellerProfileApiView), '/seller/status');
  }
  assert.equal(identitySwitchTarget('buyer', null), '/seller/status');
  assert.equal(identitySwitchTarget('buyer', { status: 'APPROVED' } as SellerProfileApiView), '/(seller-tabs)');
  assert.equal(identitySwitchTarget('seller', null), '/(buyer-tabs)');
});
test('短滑动条与实际滚动比例同步，边界夹紧且无障碍操作可用', () => {
  const require = createRequire(import.meta.url);
  const context = { exports: {} as { scrollProgress: (x: number, content: number, width: number) => number; ShortcutScrollbar: (props: unknown) => { props: { onAccessibilityAction: (event: unknown) => void; onResponderGrant: (event: unknown) => void } } }, require: (name: string) => name === 'react-native' ? { View: 'View', StyleSheet: { create: (x: unknown) => x } } : require(name) };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/shortcut-scrollbar.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const { scrollProgress, ShortcutScrollbar } = context.exports;
  assert.equal(scrollProgress(0, 500, 300), 0); assert.equal(scrollProgress(100, 500, 300), .5);
  assert.equal(scrollProgress(-5, 500, 300), 0); assert.equal(scrollProgress(900, 500, 300), 1);
  assert.equal(scrollProgress(100, 300, 300), 0);
  const values: number[] = [];
  const node = ShortcutScrollbar({ progress: .5, onChange: (n: number) => values.push(n) });
  node.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  node.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
  node.props.onResponderGrant({ nativeEvent: { locationX: 64 } });
  assert.deepEqual(values, [1, 0, 1]);
});
