import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as domain from '../src/features/seller/seller-domain';
import * as money from '../src/utils/money';
import * as dockMetrics from '../src/components/tab-bar-metrics';
import { ApiClientError } from '../src/api/api-error';
import type { SellerFinanceSummaryApiView, SellerIncomeApiView, SellerProductStatus, ServiceSkuApiView } from '../src/types/api';

type Element = { type: unknown; props: Record<string, unknown> };
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const el = node as Element;
  return [el, ...nodes(el.props.children), ...nodes(el.props.ListHeaderComponent), ...nodes(el.props.ListFooterComponent), ...nodes(el.props.ListEmptyComponent)];
}
function mount(file: string, name: string, props: Record<string, unknown>, mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const values: unknown[] = []; let index = 0; let dead = false; let deadUpdates = 0;
  const effects: (() => void)[] = [];
  const paths: unknown[] = [];
  const react = {
    useState(initial: unknown) { const at = index++; if (!(at in values)) values[at] = typeof initial === 'function' ? initial() : initial; return [values[at], (value: unknown) => { if (dead) deadUpdates++; values[at] = typeof value === 'function' ? value(values[at]) : value; }]; },
    useRef(initial: unknown) { const at = index++; if (!(at in values)) values[at] = { current: initial }; return values[at]; },
    useEffect(effect: () => void | (() => void)) { const at = index++; if (!(at in values)) { values[at] = true; const cleanup = effect(); if (cleanup) effects.push(cleanup); } }
  };
  const context = { exports: {} as Record<string, (props: Record<string, unknown>) => unknown>, require(key: string): unknown {
    if (key in mocks) return mocks[key];
    if (key === 'react') return react;
    if (key === 'react/jsx-runtime') return require(key);
    if (key === 'react-native') return { ...Object.fromEntries(['View', 'Text', 'Pressable', 'FlatList', 'ScrollView', 'RefreshControl', 'Modal', 'KeyboardAvoidingView'].map(n => [n, n])), StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1 }, Platform: { OS: 'android' }, useWindowDimensions: () => ({ fontScale: 2 }) };
    if (key === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 34 }) };
    if (key === 'expo-router') return { router: { push: (v: unknown) => paths.push(v), dismissTo: (v: unknown) => paths.push(v) } };
    if (key === './seller-domain') return domain;
    if (key === '@/utils/money') return money;
    if (key === '@/api/api-error') return { ApiClientError, userFacingError: () => '请求失败，请重试' };
    if (key === '@/theme/tokens') return { colors: {} };
    if (key === '@/theme/approved-layout') return { approvedLayout: {} };
    if (key === './merchant-page') return { merchantStyles: {} };
    if (key === './tab-bar-metrics') return dockMetrics;
    if (key.startsWith('@/components/') || ['./approved-illustration','./brand-backdrop','./native-page'].includes(key)) return Object.fromEntries(['BrandBackdrop','NativeHeader','NativeRow','FormField','PrimaryButton','StateView','SellerSectionPage','ApprovedIllustration'].map(n => [n, n]));
    throw new Error(`Unexpected import ${key}`);
  } };
  const source = readFileSync(new URL(`../src/features/seller/${file}.tsx`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return { render: () => { index = 0; return nodes(context.exports[name]!(props)); }, paths, unmount: () => { effects.forEach(fn => fn()); dead = true; }, get deadUpdates() { return deadUpdates; } };
}
const sku: ServiceSkuApiView = { id: 'sku', product_id: 'product', sku_name: '一小时', description: null, price_cent: '2500', duration_minutes: 60, status: 'ACTIVE', sort_order: 0, version: 7 };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('发布商品反馈位于固定页头下方，不藏在表单滚动区外', () => {
  const source = readFileSync(new URL('../src/features/seller/seller-service-create-screen.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('create.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let notices = 0;
  const walk = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'NoticeBanner') {
      notices++;
      let parent = node.parent; const ancestors: string[] = [];
      while (parent) { if (ts.isJsxElement(parent)) ancestors.push(parent.openingElement.tagName.getText(ast)); parent = parent.parent; }
      assert.ok(ancestors.includes('KeyboardAvoidingView'));
      assert.ok(!ancestors.includes('ScrollView'));
    }
    ts.forEachChild(node, walk);
  };
  walk(ast); assert.equal(notices, 1);
});

test('卖家独立页面保留四Tab和原图标，导航返回现有栈并为大字体及手势区预留空间', () => {
  const h = mount('../../components/seller-section-page', 'SellerSectionDock', {}, {});
  const tree = h.render();
  const tabs = tree.filter(n => n.props.accessibilityRole === 'tab');
  assert.deepEqual(tabs.map(n => n.props.accessibilityLabel), ['首页','订单','消息','我的']);
  assert.deepEqual(tree.filter(n => n.type === 'ApprovedIllustration').map(n => n.props.kind), ['home','order','message','mine']);
  tabs.forEach(n => (n.props.onPress as () => void)());
  assert.deepEqual(h.paths, ['/(seller-tabs)','/(seller-tabs)/orders','/(seller-tabs)/messages','/(seller-tabs)/mine']);
  assert.equal((tabs[3]!.props.accessibilityState as { selected: boolean }).selected, true);
  const layout = (tree[0]!.props.style as Record<string, number>[])[1]!;
  assert.equal(layout.height, 123); assert.equal(layout.paddingBottom, 34);
});

test('四个商品快捷入口对齐，非法状态不能编辑或改价，名额始终明确不可用', () => {
  const states: SellerProductStatus[] = ['DRAFT','OFF_SALE','REVIEW_REJECTED','ON_SALE','PENDING_REVIEW','ADMIN_OFF_SALE','DELETED'];
  for (const status of states) {
    const h = mount('product-quick-actions', 'ProductQuickActions', { item: { id: 'p', title: '商品', status } }, { './seller-api': {}, '@/query/query-client': {} });
    const tree = h.render();
    for (const label of ['改价：商品', '编辑商品：商品']) assert.equal(tree.find(n => n.props.accessibilityLabel === label)!.props.disabled, !domain.sellerServiceActions(status).includes('EDIT'));
    assert.equal(tree.find(n => n.props.accessibilityLabel === '改名额，暂未开放')!.props.disabled, true);
    (tree.find(n => n.props.accessibilityLabel === '更多商品操作：商品')!.props.onPress as () => void)();
    assert.ok(h.render().some(n => n.props.label === '查看商品资料'));
    assert.equal(h.render().some(n => n.props.label === '管理下架'), status === 'ON_SALE');
  }
});

test('改价使用真实SKU版本和分字符串，快速双击只请求一次并失效买家缓存', async () => {
  const calls: unknown[][] = [], invalidated: unknown[] = []; let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let refreshed = 0;
  const h = mount('product-quick-actions', 'SkuPriceField', { sku, sellerId: 'seller', refresh: async () => { refreshed++; }, onConflict() {} }, {
    './seller-api': { updateSellerSku: async (...args: unknown[]) => { calls.push(args); await wait; } },
    '@/query/query-client': { queryClient: { invalidateQueries: async (v: unknown) => { invalidated.push(v); } } }
  });
  (h.render().find(n => n.type === 'FormField')!.props.onChangeText as (s: string) => void)('9007199254740993.99');
  const save = h.render().find(n => n.props.label === '保存价格')!.props.onPress as () => void;
  save(); save(); assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['product','sku',{ version: 7, price_cent: '900719925474099399' }]);
  assert.equal(h.render().find(n => n.type === 'PrimaryButton')!.props.disabled, true);
  release(); await flush();
  assert.equal(refreshed, 1); assert.equal(invalidated.length, 7);
  assert.equal(h.render().find(n => n.type === 'PrimaryButton')!.props.label, '已保存');
  save(); assert.equal(calls.length, 1);
});

test('改价拒绝非法金额且CAS冲突重新读取，不自动重放写请求', async () => {
  let calls = 0, refreshed = 0, conflicts = 0;
  const h = mount('product-quick-actions', 'SkuPriceField', { sku, sellerId: 's', refresh: async () => { refreshed++; }, onConflict: () => { conflicts++; } }, {
    './seller-api': { updateSellerSku: async () => { calls++; throw new ApiClientError('RESOURCE_VERSION_CONFLICT', 'conflict', 409); } }, '@/query/query-client': {}
  });
  for (const input of ['0', '-1', '1.999', '9e3', '999999999999999999999.99']) {
    (h.render().find(n => n.type === 'FormField')!.props.onChangeText as (s: string) => void)(input);
    (h.render().find(n => n.props.label === '保存价格')!.props.onPress as () => void)();
  }
  assert.equal(calls, 0);
  (h.render().find(n => n.type === 'FormField')!.props.onChangeText as (s: string) => void)('30.01');
  (h.render().find(n => n.props.label === '保存价格')!.props.onPress as () => void)(); await flush();
  assert.equal(calls, 1); assert.equal(refreshed, 1); assert.equal(conflicts, 1);
});

test('关闭改价弹层后写请求可完成但不再更新已卸载组件', async () => {
  let release!: () => void; const wait = new Promise<void>(r => { release = r; });
  const h = mount('product-quick-actions', 'SkuPriceField', { sku, sellerId: 's', refresh: async () => {}, onConflict() {} }, {
    './seller-api': { updateSellerSku: () => wait }, '@/query/query-client': { queryClient: { invalidateQueries: async () => {} } }
  });
  (h.render().find(n => n.props.label === '保存价格')!.props.onPress as () => void)(); h.unmount(); release(); await flush();
  assert.equal(h.deadUpdates, 0);
});

test('改价已成功但同步失败不能误报写入失败或允许再次提交', async () => {
  let calls = 0;
  const h = mount('product-quick-actions', 'SkuPriceField', { sku, sellerId: 's', refresh: async () => { throw new Error('offline'); }, onConflict() {} }, {
    './seller-api': { updateSellerSku: async () => { calls++; } }, '@/query/query-client': { queryClient: { invalidateQueries: async () => {} } }
  });
  const save = h.render().find(n => n.props.label === '保存价格')!.props.onPress as () => void;
  save(); await flush();
  assert.ok(h.render().some(n => String(n.props.children).includes('价格已保存，但列表同步失败')));
  assert.equal(h.render().find(n => n.props.label === '已保存')!.props.disabled, true);
  save(); assert.equal(calls, 1);
});

const finance: SellerFinanceSummaryApiView = { seller_id: 's', total_earned_cent: '3000', pending_cent: '1000', available_cent: '2000', locked_cent: '800', withdrawn_cent: '0', liability_cent: '50', withdrawal_paused: true, withdrawal_pause_reason: 'LIABILITY' };
const income: SellerIncomeApiView = { id: 'i', order_id: 'o', order_no: 'TEST-O', service_title: '测试服务', completed_at: null, order_amount_cent: '900719925474099399', platform_fee_cent: '99', seller_amount_cent: '2000', available_amount_cent: '2000', locked_amount_cent: '0', withdrawn_amount_cent: '0', reversed_amount_cent: '0', status: 'AVAILABLE', settlement_available_at: '', available_at: null, version: 1, created_at: '' };

test('账户资金按真实明细跳订单，准确显示超大金额和收益而非本地重新计算', () => {
  const h = mount('seller-funds-screen', 'FundIncomeRow', { item: income }, { './seller-finance-api': {} });
  const tree = h.render(); const row = tree.find(n => n.type === 'Pressable')!;
  assert.match(String(row.props.accessibilityLabel), /9,007,199,254,740,993\.99/);
  (row.props.onPress as () => void)(); assert.deepEqual(JSON.parse(JSON.stringify(h.paths[0])), { pathname: '/seller/orders/[id]', params: { id: 'o' } });
  assert.ok(tree.some(n => n.props.children === '¥20.00' || Array.isArray(n.props.children) && n.props.children.includes('¥20.00')));
});

test('账户资金保留欠款风险，明细分页失败不清空记录且重复加载受控', () => {
  let more = 0;
  const incomes = { data: { pages: [{ items: [income] }] }, hasNextPage: true, isError: true, isFetchingNextPage: true, isFetchNextPageError: true, fetchNextPage: async () => { more++; } };
  const h = mount('seller-funds-screen','SellerFundsScreen', {}, { './seller-finance-api': { useFinanceSummary: () => ({ data: finance }), useSellerIncomes: () => incomes } });
  let tree = h.render();
  assert.equal(tree.find(n => n.props.label === '测试提现')!.props.disabled, true);
  assert.ok(tree.some(n => n.props.accessibilityRole === 'alert' && String(n.props.children).includes('欠款')));
  assert.equal((tree.find(n => n.type === 'FlatList')!.props.data as unknown[]).length, 1);
  (tree.find(n => n.props.label === '重试加载明细')!.props.onPress as () => void)(); assert.equal(more, 0);
  incomes.isFetchingNextPage = false; tree = h.render();
  (tree.find(n => n.props.label === '重试加载明细')!.props.onPress as () => void)(); assert.equal(more, 1);
  (tree.find(n => n.props.accessibilityLabel === '其他资金汇总')!.props.onPress as () => void)();
  assert.ok(h.render().some(n => n.props.label === '累计收益'));
});

test('评价管理保留已加载记录、准确标记部分数量并限制重复分页', () => {
  let more = 0;
  const review = { id: 'r', order_id: 'o', display_nickname: '匿名买家', rating: 5, content: '测试评价', service_title: '服务' };
  const reviews = { data: { pages: [{ items: [review] }] }, isError: true, isFetchNextPageError: true, hasNextPage: true, isFetchingNextPage: true, fetchNextPage: async () => { more++; } };
  const h = mount('seller-reviews-screen', 'SellerReviewsScreen', {}, {
    './seller-api': { useSellerProfile: () => ({ data: { id: 's', status: 'APPROVED' } }) },
    '@/features/discovery/discovery-api': { useCompanionReviews: () => reviews },
    '@/features/discovery/discovery-domain': { flattenUniqueById: (pages: { items: unknown[] }[]) => pages.flatMap(page => page.items) }
  });
  let tree = h.render(); const list = tree.find(n => n.type === 'FlatList')!;
  assert.equal((list.props.data as unknown[]).length, 1);
  assert.ok(tree.some(n => Array.isArray(n.props.children) && n.props.children[0] === '已加载 '));
  assert.ok(tree.some(n => n.props.accessibilityLabel === '评价同步失败，重试'));
  const retry = tree.filter(n => n.type === 'Pressable').at(-1)!;
  (retry.props.onPress as () => void)(); assert.equal(more, 0);
  reviews.isFetchingNextPage = false; tree = h.render();
  (tree.filter(n => n.type === 'Pressable').at(-1)!.props.onPress as () => void)(); assert.equal(more, 1);
  const row = nodes((list.props.renderItem as (v: unknown) => unknown)({ item: review }));
  (row.find(n => n.type === 'Pressable')!.props.onPress as () => void)();
  assert.deepEqual(JSON.parse(JSON.stringify(h.paths)), [{ pathname: '/seller/orders/[id]', params: { id: 'o' } }]);
});

test('没有陪玩权限不显示评价列表，缺少订单关联时不开放订单跳转', () => {
  const profile = { data: { id: 's', status: 'SUSPENDED' } };
  const review = { id: 'r', order_id: null, display_nickname: '匿名', rating: 5, content: '', service_title: '服务' };
  const h = mount('seller-reviews-screen', 'SellerReviewsScreen', {}, {
    './seller-api': { useSellerProfile: () => profile },
    '@/features/discovery/discovery-api': { useCompanionReviews: () => ({ data: { pages: [{ items: [review] }] } }) },
    '@/features/discovery/discovery-domain': { flattenUniqueById: (pages: { items: unknown[] }[]) => pages.flatMap(page => page.items) }
  });
  assert.ok(!h.render().some(n => n.type === 'FlatList'));
  profile.data.status = 'APPROVED';
  const list = h.render().find(n => n.type === 'FlatList')!;
  const row = nodes((list.props.renderItem as (v: unknown) => unknown)({ item: review }));
  const open = row.find(n => n.type === 'Pressable')!; assert.equal(open.props.disabled, true);
  (open.props.onPress as () => void)(); assert.equal(h.paths.length, 0);
});
