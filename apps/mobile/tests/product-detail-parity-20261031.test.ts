import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parsePurchaseQuantity, selectionSubtotal } from '../src/features/discovery/purchase-selection';
import { isAllowedInternalRoute, resolveInternalReturnTo } from '../src/auth/return-to';
import { formatCent } from '../src/utils/money';

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function sheet(props: Record<string, unknown>, screen = { height: 800, width: 390, fontScale: 1 }) {
  const require = createRequire(import.meta.url);
  const context = { exports: {} as { PurchaseSpecSheet: (props: Record<string, unknown>) => unknown }, require(name: string) {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return { ...Object.fromEntries(['Modal', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name])), Animated: { View: 'AnimatedView' }, StyleSheet: { create: (v: unknown) => v, absoluteFill: {}, hairlineWidth: 1 }, useWindowDimensions: () => screen };
    if (name === '@/hooks/use-panel-entrance') return { usePanelEntrance: () => ({ opacity: 1 }) };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === '@/theme/tokens') return { colors: {} };
    if (name === '@/utils/money') return { formatCent };
    if (name === './purchase-selection') return { selectionSubtotal };
    if (name === '@/components/file-image') return { FileImage: 'FileImage' };
    if (name === '@/components/jelly-icon') return { JellyIcon: 'JellyIcon' };
    if (name === '@/components/primary-button') return { PrimaryButton: 'PrimaryButton' };
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/discovery/purchase-spec-sheet.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return nodes(context.exports.PurchaseSpecSheet(props));
}
const skus = [{ id: 'a', sku_name: '规格 A', price_cent: '2500' }, { id: 'b', sku_name: '规格 B', price_cent: '9007199254740993' }];
const props = { title: '真实商品', seller: '真实店铺', coverFileId: 'file', skus, selectedId: 'a', quantity: 1, onSelect: () => {}, onClose: () => {}, onConfirm: () => {} };

test('规格弹窗单规格不重复展示选择列表，多规格保留真实 ID 与选中状态', () => {
  assert.equal(sheet({ ...props, skus: [skus[0]] }).filter(n => n.props.accessibilityRole === 'radio').length, 0);
  const selected: unknown[] = [];
  const tree = sheet({ ...props, onSelect: (id: string) => selected.push(id) });
  const radios = tree.filter(n => n.props.accessibilityRole === 'radio');
  assert.deepEqual(radios.map(n => (n.props.accessibilityState as { checked: boolean }).checked), [true, false]);
  (radios[1]!.props.onPress as () => void)(); assert.deepEqual(selected, ['b']);
  assert.equal(tree.find(n => n.type === 'FileImage')!.props.fileId, 'file');
});
test('数量边界、旧预约固定一份和超大金额全部精确，不把客户端金额提交为事实', () => {
  assert.equal(selectionSubtotal('9007199254740993', 20), '180143985094819860');
  for (const invalid of [-1, 0, 21, 1.1, NaN]) assert.throws(() => selectionSubtotal('1', invalid));
  for (const invalid of [undefined, '0', '21', '1.5', '01', 'Infinity', '2e1']) assert.equal(parsePurchaseQuantity(invalid), 1);
  for (const valid of ['1', '9', '10', '20']) assert.equal(parsePurchaseQuantity(valid), Number(valid));
  assert.equal(sheet(props).filter(n => n.props.accessibilityLabel === '增加数量').length, 0);
  for (const quantity of [1, 20]) {
    const changes: number[] = [];
    const tree = sheet({ ...props, quantity, onQuantity: (value: number) => changes.push(value) });
    const less = tree.find(n => n.props.accessibilityLabel === '减少数量')!;
    const more = tree.find(n => n.props.accessibilityLabel === '增加数量')!;
    assert.equal(less.props.disabled, quantity === 1); assert.equal(more.props.disabled, quantity === 20);
    (less.props.onPress as () => void)(); (more.props.onPress as () => void)();
    assert.deepEqual(changes, quantity === 1 ? [2] : [19]);
  }
  assert.equal(sheet({ ...props, quantity: 20, selectedId: 'b' }).find(n => n.type === 'PrimaryButton')!.props.label, `确认订单 ${formatCent('180143985094819860')}`);
});
test('规格弹窗系统返回、关闭与遮罩只关闭；失效 SKU 和服务状态禁止确认', () => {
  let closed = 0, confirmed = 0;
  const tree = sheet({ ...props, onClose: () => closed++, onConfirm: () => confirmed++ });
  (tree.find(n => n.type === 'Modal')!.props.onRequestClose as () => void)();
  for (const label of ['关闭规格弹窗', '关闭规格弹窗遮罩']) (tree.find(n => n.props.accessibilityLabel === label)!.props.onPress as () => void)();
  assert.equal(closed, 3); assert.equal(confirmed, 0);
  (tree.find(n => n.type === 'PrimaryButton')!.props.onPress as () => void)(); assert.equal(confirmed, 1);
  for (const overrides of [{ skus: [] }, { blocked: '服务已下架' }]) {
    const button = sheet({ ...props, ...overrides, onConfirm: () => confirmed++ }).find(n => n.type === 'PrimaryButton')!;
    assert.equal(button.props.disabled, true); (button.props.onPress as () => void)();
  }
  assert.equal(confirmed, 1);
});
test('小屏大字体时缩小装饰图，弹窗主体可滚动并保留安全区', () => {
  const tree = sheet(props, { width: 320, height: 480, fontScale: 2 });
  assert.equal((tree.find(n => n.type === 'FileImage')!.props.style as { width: number }).width, 80);
  assert.ok(tree.some(n => n.type === 'ScrollView'));
  const safe = tree.find(n => n.type === 'SafeAreaView')!;
  assert.equal((tree.find(n => n.type === 'AnimatedView')!.props.style as { maxHeight?: number }[])[1]!.maxHeight, 480 * .87);
  assert.ok((safe.props.edges as string[]).includes('bottom'));
  assert.equal(safe.props.accessibilityViewIsModal, true);
});
test('游客登录返回保留新流程与数量，拒绝未知 flow、重复参数及越界数量', () => {
  const base = '/checkout/confirm?productId=p&skuId=s&flow=fulfillment';
  for (const route of [base, `${base}&quantity=2`, '/services/p/reviews']) { assert.ok(isAllowedInternalRoute(route)); assert.equal(resolveInternalReturnTo(route), route); }
  for (const route of [`${base}&quantity=0`, `${base}&quantity=21`, `${base}&quantity=1&quantity=2`, `${base}&flow=fulfillment`, `${base}&next=https://evil.test`, base.replace('fulfillment', 'unknown')]) assert.equal(isAllowedInternalRoute(route), false);
});
