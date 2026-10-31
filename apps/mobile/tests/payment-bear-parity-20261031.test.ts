import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as domain from '../src/features/checkout/checkout-domain';
import { formatCent } from '../src/utils/money';

type Element = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Element[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object' || !('props' in value)) return []; const el = value as Element; return [el, ...nodes(el.props.children)]; }
function result(paymentStatus: string, orderStatus = 'PENDING_PAYMENT', mock = true) {
  const require = createRequire(import.meta.url), routes: unknown[] = [];
  const payment = { id: 'p', status: paymentStatus, channel: 'WECHAT_APP', payment_no: 'MOCK-P' };
  const order = { id: 'o', status: orderStatus, payment_status: paymentStatus === 'PAID' ? 'PAID' : 'UNPAID', order_no: 'MOCK-O', payable_amount_cent: '2500', product_id: 'product', seller_name: '测试卖家', service_starts_at: null };
  const context = { exports: {} as { PaymentResultScreen(): unknown }, require(name: string): unknown {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react') return { useState: (initial: unknown) => [initial, () => {}], useEffect: () => {} };
    if (name === 'react-native') return { ...Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'View'].map(key => [key, key])), StyleSheet: { create: (value: unknown) => value } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ id: 'p', orderId: 'o', status: 'success' }), router: { replace: (route: unknown) => routes.push(route) } };
    if (name === '@/features/checkout/order-api') return { usePayment: () => ({ data: payment }), useOrderDetail: () => ({ data: order }) };
    if (name === '@/features/checkout/checkout-domain') return domain;
    if (name === '@/hooks/use-online-status') return { useOnlineStatus: () => true };
    if (name === '@/config/runtime-flags') return { runtimeFlags: { enableMockPayment: mock } };
    if (name === '@xiongzai/contracts/commerce') return { isFulfillmentOrder: () => true };
    if (name === '@/theme/tokens') return { colors: {} };
    if (name === '@/utils/money') return { formatCent };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: (_target, key) => String(key) });
    if (name === '@/api/api-error' || name === '@/auth/runtime' || name === '@/features/chat/chat-api') return {};
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/checkout/payment-result-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return { tree: nodes(context.exports.PaymentResultScreen()), routes };
}
test('支付五种真实服务端状态匹配原设计熊，回跳 success 参数不能伪造成功', () => {
  for (const [payment, order, bear, size] of [['PAID', 'PENDING_SERVICE', 'success', 176], ['FAILED', 'PENDING_PAYMENT', 'error', 176], ['CLOSED', 'PENDING_PAYMENT', 'neutral', 160], ['UNPAID', 'CLOSED', 'neutral', 160], ['PAYING', 'PENDING_PAYMENT', 'waiting', 176]] as const) {
    const { tree } = result(payment, order);
    const art = tree.find(n => n.type === 'StateBear')!; assert.equal(art.props.kind, bear); assert.equal(art.props.size, size);
    assert.ok(tree.some(n => n.props.children === '测试支付结果，不会真实扣款'));
    assert.ok(!tree.some(n => n.props.children === '服务没有被扣款'));
  }
});
test('新规则支付成功不提示等待接单，关闭状态保留真实订单入口', () => {
  assert.ok(result('PAID', 'PENDING_SERVICE').tree.some(n => n.props.children === '订单已付款，请在订单中查看完成期限与履约进度。'));
  const h = result('UNPAID', 'CLOSED');
  const button = h.tree.find(n => n.type === 'Pressable' && (n.props.children as Element)?.props.children === '查看订单')!;
  (button.props.onPress as () => void)(); assert.equal(JSON.stringify(h.routes[0]), JSON.stringify({ pathname: '/orders/[id]', params: { id: 'o' } }));
  assert.ok(!result('PAID', 'PENDING_SERVICE', false).tree.some(n => n.props.children === '测试支付结果，不会真实扣款'));
});
