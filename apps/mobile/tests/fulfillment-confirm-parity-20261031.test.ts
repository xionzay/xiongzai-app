import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { formatCent } from '../src/utils/money';
import { orderErrorMessage } from '../src/features/checkout/checkout-domain';
import type { FulfillmentConfirmViewProps } from '../src/features/checkout/fulfillment-confirm-view';

type Element = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Element[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object' || !('props' in value)) return []; const el = value as Element; return [el, ...nodes(el.props.children)]; }
function harness() {
  const require = createRequire(import.meta.url), paths: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    'react-native': { ...Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'View'].map(key => [key, key])), StyleSheet: { create: (value: unknown) => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'expo-router': { router: { push: (path: unknown) => paths.push(path), back: () => {} } }, '@/theme/tokens': { colors: {} }, '@/utils/money': { formatCent },
  };
  for (const [path, name] of [['brand-backdrop','BrandBackdrop'], ['native-page','NativeHeader'], ['jelly-icon','JellyIcon'], ['notice-banner','NoticeBanner'], ['primary-button','PrimaryButton'], ['state-view','StateView']]) dependencies[`@/components/${path}`] = { [name!]: name };
  const context = { exports: {} as { FulfillmentConfirmView: (props: FulfillmentConfirmViewProps) => unknown }, require(name: string): unknown { if (name === 'react/jsx-runtime') return require(name); if (name in dependencies) return dependencies[name]; throw new Error(name); } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/checkout/fulfillment-confirm-view.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const props: FulfillmentConfirmViewProps = { quantity: 2, loading: false, online: true, error: null, notice: null, policiesLoading: false, policiesFailed: false, selectedIds: [], busy: false, consulting: false, policies: [{ id: 'p1', policy_type: 'ORDER_PAYMENT_REFUND_RULES', title: '交易规则（本地测试草案）', content: '草案正文', version_no: 2, published_at: '2026-10-31T00:00:00Z' }], onToggle: () => {}, onAccept: () => {}, onSubmit: () => {}, onRetry: () => {}, onRetryPolicies: () => {}, onContact: () => {} };
  return { props, paths, render: (overrides: Partial<FulfillmentConfirmViewProps> = {}) => nodes(context.exports.FulfillmentConfirmView({ ...props, ...overrides })) };
}
const preview = { product_id: 'p', product_title: '服务端真实商品', product_image_file_id: 'cover', seller_id: 'seller', seller_name: '真实卖家', sku_id: 'sku', sku_name: '真实规格', sku_price_cent: '900719925474099301', sku_duration_minutes: null, quantity: 2, total_amount_cent: '1801439850948198602', discount_cent: '0', payable_amount_cent: '1801439850948198602', commission_rate_bps: 100, platform_fee_cent: '0', seller_income_cent: '1801439850948198602', service_starts_at: null, service_ends_at: null, fulfillment_seconds: 86400 };

test('确认订单不默认同意，价格只展示有效服务端预览且精确到分', () => {
  const h = harness(), tree = h.render({ preview });
  assert.equal((tree.find(n => n.props.accessibilityRole === 'checkbox')!.props.accessibilityState as { checked: boolean }).checked, false);
  assert.equal(tree.find(n => n.props.label === '提交订单')!.props.disabled, true);
  assert.ok(tree.some(n => n.props.accessibilityLabel === `服务端应付${formatCent(preview.payable_amount_cent)}`));
  const ready = h.render({ preview, selectedIds: ['p1'] }); assert.equal(ready.find(n => n.props.label === '提交订单')!.props.disabled, false);
});
test('无预览、实名拒绝、断网、协议加载失败或版本改变均不能提交', () => {
  for (const overrides of [{ preview: undefined }, { error: orderErrorMessage('ORDER_IDENTITY_REQUIRED') }, { online: false }, { policiesFailed: true }, { policiesLoading: true }, { policies: [] }, { selectedIds: ['old-version'] }, { loading: true }, { busy: true }]) {
    const h = harness(), tree = h.render({ preview, selectedIds: ['p1'], ...overrides });
    assert.equal(tree.find(n => n.props.label === (overrides.busy ? '提交中…' : '提交订单'))!.props.disabled, true);
  }
});
test('协议查看不隐式勾选，独立确认复用后端版本，联系卖家与重试保留真实入口', () => {
  const h = harness(); let toggled = '', accepted = 0, retried = 0;
  const tree = h.render({ selectedIds: ['p1'], error: '实名条件未满足', onToggle: value => { toggled = value; }, onAccept: () => accepted++, onRetry: () => retried++ });
  (tree.find(n => n.props.accessibilityRole === 'link')!.props.onPress as () => void)();
  assert.equal(toggled, ''); assert.equal(JSON.stringify(h.paths[0]), JSON.stringify({ pathname: '/policies/[id]', params: { id: 'p1' } }));
  (tree.find(n => n.props.accessibilityRole === 'checkbox')!.props.onPress as () => void)(); assert.equal(toggled, 'p1');
  (tree.find(n => n.props.label === '确认协议并获取服务端价格')!.props.onPress as () => void)(); assert.equal(accepted, 1);
  (tree.find(n => n.props.label === '重新读取订单预览')!.props.onPress as () => void)(); assert.equal(retried, 1);
  assert.ok(tree.some(n => n.type === 'ScrollView')); assert.ok(tree.some(n => n.props.accessibilityLabel === '联系卖家'));
});
test('交易受限错误显示后端门槛，不误导为网络重试即可完成', () => {
  assert.match(orderErrorMessage('ORDER_IDENTITY_REQUIRED'), /人工实名认证/);
  assert.match(orderErrorMessage('ORDER_ADULT_VERIFICATION_REQUIRED'), /成年实名/);
  assert.match(orderErrorMessage('POLICY_ACCEPTANCE_REQUIRED'), /交易规则/);
  assert.match(orderErrorMessage('PLATFORM_CONFIG_MISSING'), /尚未启用订单或财务配置/);
  assert.equal(orderErrorMessage('unknown-internal-stack'), '请求未完成，请稍后重试。');
});
