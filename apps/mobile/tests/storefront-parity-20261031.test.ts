import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { flattenUniqueById } from '../src/features/discovery/discovery-domain';
import { formatCent } from '../src/utils/money';
type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object' || !('props' in value)) return []; const node = value as Node; return [node, ...nodes(typeof node.type === 'function' ? node.type(node.props) : node.props.children)]; }
function mount(overrides: Record<string, unknown> = {}) {
  const require = createRequire(import.meta.url), state: unknown[] = [], paths: unknown[] = [], enabled: boolean[] = [];
  let index = 0, refreshed = 0, fetched = 0;
  const query = { data: { pages: [{ items: [] as Record<string, unknown>[] }] }, isPending: false, isError: false, hasNextPage: false, isFetching: false, isFetchingNextPage: false, refetch: () => refreshed++, fetchNextPage: () => fetched++ };
  const item = { id: 'seller', user_id: 'owner', seller_nickname: '真实店铺', seller_avatar_file_id: 'avatar', cover_file_id: 'unused-cover', introduction: '真实介绍'.repeat(20), accepting_orders: true, review_count: 0, completed_order_count: 0, rating_avg: '0.00', services: [{ id: 'on', title: '在售商品', status: 'ON_SALE', min_price_cent: '2500', cover_file_id: 'cover' }, { id: 'off', title: '下架商品', status: 'OFF_SALE', min_price_cent: '1' }], main_games: [] };
  const props = { item, owner: false, preview: false, notice: null, refreshing: false, onRefresh: () => {}, voice: { type: 'Voice', props: {} }, favorite: { type: 'Favorite', props: {} }, consulting: false, onContact: () => {}, ...overrides };
  const context = { exports: {} as { StorefrontView: (props: unknown) => unknown }, require(name: string): unknown {
    if (name === 'react/jsx-runtime' || name === '@xiongzai/contracts/commerce') return require(name);
    if (name === 'react') return { useMemo: (fn: () => unknown) => fn(), useState(value: unknown) { const at = index++; if (!(at in state)) state[at] = value; return [state[at], (v: unknown) => { state[at] = typeof v === 'function' ? v(state[at]) : v; }]; } };
    if (name === 'react-native') return { ...Object.fromEntries(['View','Text','Pressable','ScrollView','RefreshControl'].map(n => [n,n])), StyleSheet: { create: (x: unknown) => x, hairlineWidth: 1 }, Share: { share: async () => {} } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-router') return { router: { push: (value: unknown) => paths.push(value), back: () => paths.push('back') } };
    if (name === '@/theme/tokens') return { colors: {} };
    if (name === '@/utils/money') return { formatCent };
    if (name === './discovery-domain') return { flattenUniqueById };
    if (name === './discovery-api') return { useCompanionReviews: (id: string, active: boolean) => { assert.equal(id, 'seller'); enabled.push(active); return query; } };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, name) => name });
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/discovery/storefront-view.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { render: () => { index = 0; return nodes(context.exports.StorefrontView(props)); }, props, item, query, enabled, paths, get refreshed() { return refreshed; }, get fetched() { return fetched; } };
}
function clickTab(tree: Node[], name: string) { (tree.find(n => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === name)!.props.onPress as () => void)(); }
test('店铺主页显示真实头像、三栏目和在售商品，声音名片不被视觉改造移除', () => {
  const h = mount(); let tree = h.render();
  assert.deepEqual(tree.filter(n => n.props.accessibilityRole === 'tab').map(n => n.props.accessibilityLabel), ['商品','评价','介绍']);
  assert.equal(h.enabled.at(-1), false);
  assert.equal(tree.find(n => n.type === 'FileImage')!.props.fileId, 'avatar');
  assert.ok(!tree.some(n => n.props.fileId === 'unused-cover'));
  assert.equal(tree.filter(n => n.props.accessibilityLabel === '在售商品，¥25.00').length, 1);
  assert.ok(!tree.some(n => n.props.accessibilityLabel === '下架商品，¥0.01'));
  assert.ok(tree.some(n => n.type === 'Voice')); assert.ok(tree.some(n => n.type === 'Favorite'));
  clickTab(tree, '介绍'); tree = h.render();
  assert.ok(tree.some(n => n.props.children === '店铺介绍'));
  assert.ok(!tree.some(n => n.props.accessibilityLabel === '在售商品，¥25.00'));
  clickTab(tree, '商品'); assert.ok(h.render().some(n => n.props.accessibilityLabel === '在售商品，¥25.00'));
});
test('评价栏目按需读取真实游标数据，失败保留记录且禁止重复分页', () => {
  const h = mount(); clickTab(h.render(), '评价');
  let tree = h.render(); assert.equal(h.enabled.at(-1), true);
  assert.ok(tree.some(n => String(n.props.children).includes('暂无评价，完成交易后')));
  h.query.data.pages[0]!.items = [{ id: 'r', display_nickname: '真实评价用户', rating: 5, content: '真实评价内容', created_at: '2026-10-31', service_title: '服务' }];
  h.query.isError = true; h.query.hasNextPage = true; h.query.isFetching = true;
  tree = h.render(); assert.ok(tree.some(n => n.props.children === '真实评价内容'));
  (tree.find(n => n.props.label === '重试评价')!.props.onPress as () => void)(); assert.equal(h.refreshed, 1);
  (tree.find(n => n.props.label === '加载更多评价')!.props.onPress as () => void)(); assert.equal(h.fetched, 0);
  h.query.isFetching = false; (h.render().find(n => n.props.label === '加载更多评价')!.props.onPress as () => void)(); assert.equal(h.fetched, 1);
});
test('本人主页显示编辑且不自我咨询，公开预览不执行收藏、咨询、购买', () => {
  const owner = mount({ owner: true }); let tree = owner.render();
  assert.ok(tree.some(n => n.props.children === '编辑主页')); assert.ok(!tree.some(n => n.props.label === '联系卖家')); assert.ok(!tree.some(n => n.type === 'Favorite'));
  const preview = mount({ preview: true }); tree = preview.render();
  assert.ok(!tree.some(n => n.type === 'Favorite')); assert.ok(!tree.some(n => n.props.label === '联系卖家'));
  assert.equal(tree.find(n => n.props.accessibilityLabel === '在售商品，¥25.00')!.props.disabled, true);
});
test('长介绍可展开和收起，联系卖家忙碌状态禁用按钮', () => {
  const h = mount({ consulting: true }); let tree = h.render();
  assert.equal(tree.find(n => n.props.label === '处理中…')!.props.disabled, true);
  const disclosure = tree.find(n => (n.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded === false)!;
  (disclosure.props.onPress as () => void)(); tree = h.render();
  assert.ok(tree.some(n => n.props.children === '收起'));
  assert.ok(tree.some(n => n.props.children === h.item.introduction && n.props.numberOfLines === undefined));
});
