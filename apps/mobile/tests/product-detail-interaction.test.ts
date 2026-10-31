import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ApiClientError, userFacingError } from '../src/api/api-error';
import { purchaseBlock, purchaseBlockCopy } from '../src/features/discovery/discovery-domain';
import { formatCent } from '../src/utils/money';
import { reviewImagesHarness } from './review-images-harness';

type Element = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const el = value as Element; return [el, ...nodes(el.props.children)];
}
function mount(status = 'anonymous', create = async () => ({ id: 'conversation' })) {
  const require = createRequire(import.meta.url);
  const state: unknown[] = []; let index = 0, calls = 0, dead = false, deadUpdates = 0;
  const paths: { pathname: string; params: Record<string, string> }[] = [];
  const effects: (() => void)[] = [], focus: (() => void)[] = [];
  const data = { id: 'p', title: '商品', description: '说明', fulfillment_seconds: 3600, min_price_cent: '2500', seller_id: 's', status: 'ON_SALE', images: [], skus: [{ id: 'a', status: 'ACTIVE', price_cent: '2500' }, { id: 'b', status: 'ACTIVE', price_cent: '4800' }, { id: 'retired', status: 'INACTIVE', price_cent: '1' }], seller: { id: 's', user_id: 'seller', seller_nickname: '店铺', accepting_orders: true, status: 'APPROVED' } };
  const context = { exports: {} as { ServiceDetailScreen: () => unknown }, require(name: string): unknown {
    if (name === 'react/jsx-runtime' || name === '@xiongzai/contracts/commerce') return require(name);
    if (name === 'react') return {
      useState(value: unknown) { const at = index++; if (!(at in state)) state[at] = typeof value === 'function' ? value() : value; return [state[at], (next: unknown) => { if (dead) deadUpdates++; state[at] = typeof next === 'function' ? next(state[at]) : next; }]; },
      useRef(value: unknown) { const at = index++; if (!(at in state)) state[at] = { current: value }; return state[at]; },
      useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
      useEffect(fn: () => (() => void) | undefined) { const at = index++; if (!(at in state)) { state[at] = true; const cleanup = fn(); if (cleanup) effects.push(cleanup); } }
    };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ id: 'p' }), router: { push: (value: { pathname: string; params: Record<string, string> }) => paths.push(value) }, useFocusEffect: (fn: () => void) => { if (!focus.length) { focus.push(fn); fn(); } } };
    if (name === 'react-native') return { ...Object.fromEntries(['View','Text','Pressable','ScrollView','RefreshControl'].map(n => [n,n])), StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1 } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === '@/auth/auth-provider') return { useAuth: () => ({ status, user: status === 'authenticated' ? { id: 'buyer' } : undefined }) };
    if (name === '@/features/discovery/discovery-api') return { useServiceDetail: () => ({ data }), useAvailability: () => ({ data: [] }), useProductReviews: () => ({ data: { pages: [] } }) };
    if (name === '@/features/discovery/discovery-domain') return { purchaseBlock, purchaseBlockCopy };
    if (name === '@/features/chat/chat-api') return { createConsultation: () => { calls++; return create(); } };
    if (name === '@/hooks/use-online-status') return { useOnlineStatus: () => true };
    if (name === '@/utils/money') return { formatCent };
    if (name === '@/api/api-error') return { ApiClientError, userFacingError };
    if (name === '@/theme/tokens') return { colors: {} };
    if (name === './purchase-spec-sheet') return { PurchaseSpecSheet: 'PurchaseSpecSheet' };
    if (name === '../after-sale/review-images') return reviewImagesHarness();
    if (name === '@/features/favorites/favorite-button') return { FavoriteButton: 'FavoriteButton' };
    if (name.startsWith('@/components/') || name === '../../components/jelly-icon') return new Proxy({}, { get: (_, name) => name });
    throw new Error(`Unexpected dependency ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/discovery/service-detail-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { data, paths, render: () => { index = 0; return nodes(context.exports.ServiceDetailScreen()); }, unmount: () => { effects.forEach(fn => fn()); dead = true; }, get calls() { return calls; }, get deadUpdates() { return deadUpdates; } };
}

test('购买按钮先开规格弹窗，游客确认保留 SKU/数量；同帧双击不重复导航', () => {
  const h = mount();
  let tree = h.render(); assert.ok(!tree.some(n => n.type === 'PurchaseSpecSheet'));
  (tree.find(n => n.props.accessibilityLabel === '立即购买')!.props.onPress as () => void)();
  tree = h.render(); let sheet = tree.find(n => n.type === 'PurchaseSpecSheet')!;
  assert.deepEqual((sheet.props.skus as { id: string }[]).map(sku => sku.id), ['a','b']);
  (sheet.props.onSelect as (id: string) => void)('b'); (sheet.props.onQuantity as (n: number) => void)(3);
  sheet = h.render().find(n => n.type === 'PurchaseSpecSheet')!;
  assert.equal(sheet.props.selectedId, 'b'); assert.equal(sheet.props.quantity, 3);
  (sheet.props.onConfirm as () => void)(); (sheet.props.onConfirm as () => void)();
  assert.equal(h.paths.length, 1); assert.equal(h.paths[0]!.pathname, '/(auth)/required');
  assert.equal(h.paths[0]!.params.returnTo, '/checkout/confirm?productId=p&skuId=b&flow=fulfillment&quantity=3');
});
test('商品在规格弹窗中下架后不能继续确认，关闭只退回详情', () => {
  const h = mount('authenticated');
  (h.render().find(n => n.props.accessibilityLabel === '立即购买')!.props.onPress as () => void)();
  h.data.status = 'OFF_SALE';
  const sheet = h.render().find(n => n.type === 'PurchaseSpecSheet')!;
  assert.equal(sheet.props.blocked, purchaseBlockCopy.SERVICE_UNAVAILABLE);
  (sheet.props.onConfirm as () => void)(); assert.equal(h.paths.length, 0);
  (sheet.props.onClose as () => void)(); assert.ok(!h.render().some(n => n.type === 'PurchaseSpecSheet'));
});
test('咨询同步锁防双击，离开页面后不更新状态或跳转到过期会话', async () => {
  let finish!: (value: { id: string }) => void;
  const h = mount('authenticated', () => new Promise(resolve => { finish = resolve; }));
  const button = h.render().find(n => n.props.accessibilityLabel === '咨询店铺客服')!;
  (button.props.onPress as () => void)(); (button.props.onPress as () => void)(); assert.equal(h.calls, 1);
  h.unmount(); finish({ id: 'conversation' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.deadUpdates, 0); assert.equal(h.paths.length, 0);
});
