import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { bearStickers } from '@xiongzai/contracts/bear-stickers';
import { hotItemWidth, orderEntryWidth, approvedLayout } from '../src/theme/approved-layout';
import { orderFilterRequest, visibleBuyerOrders } from '../src/features/checkout/order-list-filter';
import type { OrderApiView, SellerServiceApiView } from '../src/types/api';
import { revenueBounds, revenueMetrics, revenueMoney } from '../../../app/seller-workbench/revenue-model';
import { isAllowedInternalRoute } from '../src/auth/return-to';
import { resolveSellerHomeFilter, sellerHomeTasks, type SellerTaskOrder } from '../src/features/seller/seller-home-model';
import { formatCent } from '../src/utils/money';
import { productTabs, visibleSellerProducts } from '../src/features/seller/product-list-model';
import { supportStatusCopy } from '../src/features/chat/support-domain';

interface Node { type: unknown; props: Record<string, unknown> }
function tree(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(tree);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...tree(typeof node.type === 'function' ? node.type(node.props) : node.props.children)];
}
function moduleView(file: string, resolve: (name: string) => unknown) {
  const context = { exports: {} as Record<string, (props?: unknown) => unknown>, require: resolve };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const require = createRequire(import.meta.url);
const native = { StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }, ...Object.fromEntries(['Image', 'View', 'Text', 'Pressable', 'ScrollView', 'RefreshControl', 'Modal'].map(name => [name, name])) };
test('商品五分类使用真实状态，搜索不混入其他分类，价格排序保留超安全整数精度', () => {
  const rows = [
    { id: 'a', title: 'Alpha', status: 'ON_SALE', min_price_cent: '9007199254740993', updated_at: '2026-10-27T00:00:00Z' },
    { id: 'b', title: 'Alpha B', status: 'ON_SALE', min_price_cent: '9007199254740992', updated_at: '2026-10-26T00:00:00Z' },
    ...['OFF_SALE', 'ADMIN_OFF_SALE', 'DRAFT', 'PENDING_REVIEW', 'REVIEW_REJECTED', 'DELETED'].map((status, i) => ({ id: String(i), title: 'Alpha', status, min_price_cent: '100', updated_at: '2026-10-27T00:00:00Z' }))
  ] as SellerServiceApiView[];
  const before = JSON.stringify(rows);
  assert.deepEqual(productTabs.map(tab => tab.label), ['在售', '已下架', '草稿', '待审核', '审核驳回']);
  assert.deepEqual(visibleSellerProducts(rows, '在售', ' ALPHA ', true).map(row => row.id), ['b', 'a']);
  assert.deepEqual(visibleSellerProducts(rows, '在售', '', false).map(row => row.id), ['a', 'b']);
  assert.deepEqual(visibleSellerProducts(rows, '已下架', '', false).map(row => row.status), ['OFF_SALE', 'ADMIN_OFF_SALE']);
  for (const label of ['草稿', '待审核', '审核驳回']) assert.equal(visibleSellerProducts(rows, label, '', false).length, 1);
  assert.equal(visibleSellerProducts(rows, '在售', 'not found', false).length, 0);
  assert.equal(JSON.stringify(rows), before);
});
test('商品折叠区始终保留上传子树，折叠后隐藏布局和无障碍内容，展开恢复', () => {
  const view = moduleView('features/seller/merchant-page.tsx', name => {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return { ...native, Platform: { OS: 'android' } };
    if (name.endsWith('theme/tokens')) return { colors: {} };
    if (name.endsWith('approved-layout')) return { approvedLayout };
    return new Proxy({}, { get: (_, key) => key });
  });
  const child = { type: 'UploadTask', props: {} };
  let toggles = 0;
  for (const expanded of [false, true, false]) {
    const nodes = tree(view.MerchantDisclosure!({ title: '更多商品图片', expanded, children: child, onToggle: () => { toggles++; } }));
    const body = nodes.find(node => node.props.children === child);
    assert.ok(body); assert.equal(body.props.accessibilityElementsHidden, !expanded);
    assert.equal(body.props.importantForAccessibility, expanded ? 'auto' : 'no-hide-descendants');
    assert.equal((body.props.style as { display?: string } | undefined)?.display, expanded ? undefined : 'none');
    assert.equal(nodes.filter(node => node === child).length, 1);
    (nodes.find(node => node.props.accessibilityRole === 'button')!.props.onPress as () => void)();
  }
  assert.equal(toggles, 3);
});
test('商品游戏分类展开后使用契约选项，选择后关闭；忙碌时禁用选择', () => {
  for (const disabled of [false, true]) {
    const changes: unknown[] = []; const open: unknown[] = [];
    const view = moduleView('features/seller/merchant-game-field.tsx', name => {
      if (name === 'react/jsx-runtime' || name === '@xiongzai/contracts/commerce') return require(name);
      if (name === 'react') return { useState: () => [true, (value: unknown) => open.push(value)] };
      if (name === 'react-native') return native;
      if (name === './merchant-page') return { merchantStyles: {} };
      if (name.endsWith('theme/tokens')) return { colors: {} };
      return { ApprovedIllustration: 'ApprovedIllustration' };
    });
    const { productGames, productGameLabels } = require('@xiongzai/contracts/commerce');
    const nodes = tree(view.MerchantGameField!({ value: productGames[0], disabled, onChange: (value: unknown) => changes.push(value) }));
    const radios = nodes.filter(node => node.props.accessibilityRole === 'radio');
    assert.equal(radios.length, productGames.length);
    assert.equal(radios[1]!.props.accessibilityLabel, productGameLabels[productGames[1]]);
    assert.ok(radios.every(node => node.props.disabled === disabled));
    if (!disabled) { (radios[1]!.props.onPress as () => void)(); assert.equal(changes[0], productGames[1]); assert.equal(open.at(-1), false); }
  }
});
test('待评价从入口跳转后自动滚动到对应分类，全部订单回到首项', () => {
  for (const selected of ['PENDING_REVIEW', 'ALL']) {
    const scrolls: { x: number; animated: boolean }[] = [];
    const screen = moduleView('features/checkout/orders-screen.tsx', name => {
      if (name === 'react/jsx-runtime' || name === '@xiongzai/contracts/commerce') return require(name);
      if (name === 'react') return { useMemo: (fn: () => unknown) => fn(), useEffect: () => {}, useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value === null ? { scrollTo: (entry: { x: number; animated: boolean }) => scrolls.push(entry) } : value }) };
      if (name === 'react-native') return { ...native, FlatList: 'FlatList' };
      if (name === 'expo-router') return { router: {}, useLocalSearchParams: () => ({ filter: selected }) };
      if (name.endsWith('auth-provider')) return { useAuth: () => ({ status: 'authenticated', user: {} }) };
      if (name.endsWith('use-online-status')) return { useOnlineStatus: () => true };
      if (name.endsWith('order-api')) return { useBuyerOrders: () => ({ data: { pages: [{ items: [] }] } }) };
      if (name === './order-list-filter') return { orderFilterRequest, visibleBuyerOrders };
      if (name.endsWith('theme/tokens')) return { colors: {}, radii: {}, spacing: {}, typography: {} };
      if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => key });
      return {};
    });
    assert.ok(screen.OrdersScreen);
    const nodes = tree(screen.OrdersScreen());
    const tab = nodes.find(n => n.props.accessibilityRole === 'tab' && (n.props.accessibilityState as { selected: boolean })?.selected);
    assert.ok(tab);
    (tab.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { x: selected === 'ALL' ? 0 : 620 } } });
    assert.equal(scrolls.at(-1)?.x, selected === 'ALL' ? 0 : 608);
    assert.equal(scrolls.at(-1)?.animated, false);
  }
});
test('热卖一到四条数据保持固定四列尺寸，小屏不会出现整行大图', () => {
  for (const width of [320, 375, 390, 430, 768]) {
    const cell = hotItemWidth(width);
    assert.ok(cell >= 68 && cell < width / 4);
    assert.equal(cell * 4 + 24 + 24, width);
  }
});
test('订单七入口在小屏可横向滚动，大字体增加宽度而不是压缩文字', () => {
  assert.equal(orderEntryWidth(320), (320 - 28) / 5);
  assert.equal(orderEntryWidth(390) * 5, 390 - 28);
  assert.ok(orderEntryWidth(390, 2) > orderEntryWidth(390));
});
test('全部订单显式清除旧筛选；待评价查询完成订单并以服务端reviewed事实筛选', () => {
  assert.deepEqual(orderFilterRequest('ALL'), { status: undefined, afterSale: undefined });
  assert.deepEqual(orderFilterRequest('PENDING_REVIEW'), { status: 'COMPLETED', afterSale: undefined });
  assert.deepEqual(orderFilterRequest('AFTER_SALE'), { status: undefined, afterSale: 'IN_PROGRESS' });
  const rows = [false, true, undefined].map((reviewed, i) => ({ id: `${i}`, status: 'COMPLETED', reviewed })) as OrderApiView[];
  assert.deepEqual(visibleBuyerOrders(rows, 'PENDING_REVIEW').map(row => row.id), ['0']);
  assert.equal(visibleBuyerOrders(rows, 'ALL'), rows);
});
test('真实我的组件七个图标入口都能导航，待评价和全部独立且身份入口保留服务端守卫', () => {
  const calls: unknown[] = [];
  const screen = moduleView('features/account/mine-screen.tsx', name => {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react') return { useState: (initial: unknown) => [initial, () => {}], useRef: () => ({ current: null }) };
    if (name === 'react-native') return { ...native, useWindowDimensions: () => ({ width: 375, fontScale: 1 }) };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-router') return { router: { push: (value: unknown) => calls.push(value) } };
    if (name.endsWith('auth-provider')) return { useAuth: () => ({ user: { id: 'test', profile: { nickname: '测试' } }, refreshUser: async () => {} }) };
    if (name.endsWith('auth/runtime')) return { secureStoreAdapter: { isTemporaryStorage: () => false } };
    if (name.endsWith('chat-api')) return { useConversationUnread: () => ({ data: { unread_count: 3 } }) };
    if (name.endsWith('chat-domain')) return { shouldPollChat: () => true };
    if (name.endsWith('use-app-activity')) return { useAppActivity: () => 'active' };
    if (name.endsWith('use-online-status')) return { useOnlineStatus: () => true };
    if (name.endsWith('theme/tokens')) return { colors: {}, typography: {} };
    if (name.endsWith('approved-layout')) return { approvedLayout, orderEntryWidth };
    if (name.endsWith('shortcut-scrollbar')) return { ShortcutScrollbar: 'ShortcutScrollbar', scrollProgress: () => 0 };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => key });
    if (name.endsWith('.png')) return name;
    throw new Error(`Unexpected dependency ${name}`);
  });
  assert.ok(screen.MineScreen);
  const nodes = tree(screen.MineScreen());
  for (const label of ['全部订单', '待付款', '待服务', '服务中', '待收货', '待评价', '售后中']) {
    const node = nodes.find(n => n.props.accessibilityLabel === (label === '全部订单' ? '查看全部订单' : `查看${label}订单`));
    assert.ok(node);
    assert.ok(tree(node.props.children).some(child => child.type === 'ApprovedIllustration'));
    (node.props.onPress as () => void)();
  }
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), ['ALL', 'PENDING_PAYMENT', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_BUYER_CONFIRM', 'PENDING_REVIEW', 'AFTER_SALE'].map(filter => ({ pathname: '/(buyer-tabs)/orders', params: { filter } })));
  const seller = nodes.find(n => n.props.accessibilityLabel === '卖家工作台，查看入驻状态 · 管理服务与订单');
  assert.ok(seller); (seller.props.onPress as () => void)(); assert.equal(calls.at(-1), '/seller/status');
  assert.equal(nodes.filter(n => n.props.accessibilityLabel === '编辑个人资料').length, 1);
});
test('70张静态封面与表情ID完整对应，均为真实PNG文件', () => {
  assert.equal(bearStickers.length, 70);
  const source = readFileSync(new URL('../src/features/chat/sticker-posters.ts', import.meta.url), 'utf8');
  for (const sticker of bearStickers) {
    const [, side, id] = sticker.id.split('/');
    const file = new URL(`../assets/sticker-posters/${side}-${id}.png`, import.meta.url);
    assert.ok(existsSync(file)); assert.equal(readFileSync(file).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(source.includes(`"${sticker.id}"`));
  }
});
test('表情暂停、后台与减少动态效果时显示封面，不退回纯文字或继续播放', () => {
  for (const [playing, active, reduced] of [[false, true, false], [true, false, false], [true, true, true], [true, true, false]]) {
    let hook = 0;
    const stickerModule = moduleView('features/chat/sticker-panel.tsx', name => {
      if (name === 'react/jsx-runtime' || name === '@xiongzai/contracts/bear-stickers') return require(name);
      if (name === 'react') return { useState: () => [[playing, false, reduced][hook++], () => {}], useEffect: () => {} };
      if (name === 'react-native') return native;
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name.endsWith('sticker-assets')) return { stickerSources: { 'bear-v3/buyer/001': 'animated' } };
      if (name.endsWith('sticker-posters')) return { stickerPosters: { 'bear-v3/buyer/001': 'poster' } };
      if (name.endsWith('use-app-activity')) return { useAppActivity: () => active ? 'active' : 'background' };
      if (name.endsWith('theme/tokens')) return { colors: {} };
      if (name.endsWith('chat-control-icon')) return { ChatControlIcon: 'ChatControlIcon' };
      throw new Error(name);
    });
    assert.ok(stickerModule.StickerPicture);
    const image = tree(stickerModule.StickerPicture({ id: 'bear-v3/buyer/001' })).find(n => n.type === 'Image');
    assert.ok(image); assert.equal(image.props.source, playing && active && !reduced ? 'animated' : 'poster');
  }
});

test('陪玩导航为首页订单消息我的，服务和收益保留路由但不占主Tab，身份守卫不放宽', () => {
  const source = readFileSync(new URL('../app/(seller-tabs)/_layout.tsx', import.meta.url), 'utf8');
  assert.match(source, /profile.data.status !== "APPROVED"/u);
  for (const [name, title] of [['index', '首页'], ['orders', '订单'], ['messages', '消息'], ['mine', '我的']]) assert.ok(source.includes(`name="${name}" options={{ title: "${title}" }}`));
  for (const name of ['services', 'earnings']) assert.match(source, new RegExp(`name="${name}" options=\\{\\{[^}]+href: null`, 'u'));
  for (const route of ['/(seller-tabs)/messages', '/(seller-tabs)/mine', '/seller/finance', '/seller/reviews']) {
    assert.equal(isAllowedInternalRoute(route), true);
    assert.equal(isAllowedInternalRoute(`${route}?redirect=https://evil.invalid`), false);
  }
});

test('收益同源模型减去退款、按订单去重、缺少买家ID不凑统计、超安全整数不失真', () => {
  const row = { id: 'i1', order_id: 'o1', created_at: '2026-10-25T00:00:00Z', seller_amount_cent: '90071992547409931', reversed_amount_cent: '31', order_amount_cent: '90071992547410031', platform_fee_cent: '100' };
  const bounds = revenueBounds('今日', '', '', new Date('2026-10-25T08:00:00Z'));
  const result = revenueMetrics([row], bounds);
  assert.equal(result.net, 90071992547409900n);
  assert.equal(result.buyers, null);
  assert.equal(result.orders, 1);
  assert.equal(result.fees, 100n);
  assert.equal(revenueMoney(result.net), '900,719,925,474,099.00');
  assert.equal(revenueMetrics([{ ...row, buyer_id: 'b1' }, { ...row, id: 'i2', buyer_id: 'b1' }], bounds).buyers, 1);
  assert.equal(revenueBounds('自定义', '2026-10-26', '2026-10-25', new Date('2026-10-25T08:00:00Z')), null);
});

test('真实收益组件分页未完整时不展示汇总金额，完整后才展示净收益且无新增提现按钮', () => {
  for (const hasNextPage of [true, false]) {
    const states: unknown[] = []; let cursor = 0;
    const rows = [{ id: 'i', order_id: 'o', created_at: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'), seller_amount_cent: '123456', reversed_amount_cent: '100', order_amount_cent: '130000', platform_fee_cent: '6544' }];
    const screen = moduleView('features/seller/seller-earnings-summary-screen.tsx', name => {
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react') return { useMemo: (fn: () => unknown) => fn(), useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      } };
      if (name === 'react-native') return { ...native, useWindowDimensions: () => ({ fontScale: 1 }) };
      if (name === 'expo-router') return { router: {} };
      if (name === './seller-finance-api') return { useSellerIncomes: () => ({ data: { pages: [{ items: rows }] }, hasNextPage }) };
      if (name.endsWith('revenue-model')) return { revenueBounds, revenueMetrics, revenueMoney, chinaDate: (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 10) };
      if (name.endsWith('theme/tokens')) return { colors: {} };
      if (name.endsWith('approved-layout')) return { approvedLayout };
      if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => key });
      throw new Error(name);
    });
    const EarningsSummary = screen.SellerEarningsSummaryScreen;
    assert.ok(EarningsSummary);
    const render = () => { cursor = 0; return tree(EarningsSummary()); };
    const nodes = render();
    const textNodes = nodes.filter(n => n.type === 'Text').map(n => n.props.children);
    assert.equal(textNodes.filter(text => text === '1,233.56').length, hasNextPage ? 1 : 3); // detail remains factual; headline and average await complete pages
    assert.ok(!textNodes.includes('提现'));
    assert.equal(textNodes.includes('继续加载收益明细'), hasNextPage);
    const tabLabel = (node: Node) => tree(node.props.children).find(child => child.type === 'Text')?.props.children;
    const selected = (entries: Node[]) => entries.filter(node => node.props.accessibilityRole === 'tab' && (node.props.accessibilityState as { selected?: boolean })?.selected);
    assert.equal(selected(nodes).length, 1);
    assert.equal(tabLabel(selected(nodes)[0]!), '本月');
    const weekly = nodes.find(node => node.props.accessibilityRole === 'tab' && tabLabel(node) === '本周');
    assert.ok(weekly); (weekly.props.onPress as () => void)();
    assert.equal(tabLabel(selected(render())[0]!), '本周');
  }
});

test('真实客服状态组件按工单事实显示队列和接入状态，不承诺固定响应分钟数', () => {
  const text = readFileSync(new URL('../src/features/chat/support-list-screen.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('support-list-screen.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['SupportHeader', 'SupportStatus'];
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
  assert.equal(functions.length, names.length);
  let records = 0;
  const context = { exports: {} as Record<string, (props: Record<string, unknown>) => unknown>, require, styles: {},
    View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable',
    OrderTabIcon: 'OrderTabIcon', ChevronLeftIcon: 'ChevronLeftIcon', xiongzaiIcon: 'local-icon', supportStatusCopy,
    router: { back() {} },
  };
  const code = functions.map(node => node.getText(ast)).join('\n') + '\nexports.SupportHeader = SupportHeader; exports.SupportStatus = SupportStatus;';
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  for (const [status, expected] of [[null, '熊崽客服中心'], ['WAITING', '已进入人工客服队列'], ['TRANSFERRED', '已进入人工客服队列'], ['SERVING', '人工客服已接入'], ['CLOSED', '本次客服会话已结束']]) {
    const nodes = tree(context.exports.SupportStatus!({ supportCase: status ? { status } : null }));
    const copy = JSON.stringify(nodes.filter(node => node.type === 'Text').map(node => node.props.children));
    assert.ok(copy.includes(expected!));
    assert.doesNotMatch(copy, /预计\s*1\s*分钟响应/u);
  }
  const header = tree(context.exports.SupportHeader!({ subtitle: '工单排队中', onRecords: () => { records++; } }));
  const entry = header.find(node => node.props.accessibilityLabel === '客服记录');
  assert.ok(entry); (entry.props.onPress as () => void)(); assert.equal(records, 1);
  assert.ok(header.some(node => node.props.children === '工单排队中'));
});

test('卖家首页待办按已知时限排序、去重，已完成售后仍保留且不修改订单事实', () => {
  const rows = [
    { id: 'later', status: 'PENDING_SERVICE', fulfillment_due_at: '2026-10-28T00:00:00Z' },
    { id: 'done', status: 'COMPLETED', after_sale_status: 'NONE' },
    { id: 'unknown', status: 'IN_SERVICE' },
    { id: 'earlier', status: 'ACCEPTED', service_starts_at: '2026-10-27T00:00:00Z' },
    { id: 'refund', status: 'COMPLETED', after_sale_status: 'IN_PROGRESS' },
    { id: 'later', status: 'PENDING_SERVICE', fulfillment_due_at: '2026-10-28T00:00:00Z' },
  ] satisfies SellerTaskOrder[];
  assert.deepEqual(sellerHomeTasks(rows).map(row => row.id), ['earlier', 'later', 'unknown', 'refund']);
  assert.equal(rows[0]?.id, 'later');
  for (const invalid of ['PENDING_PAYMENT', '//evil.invalid', 'https://evil.invalid', ['IN_SERVICE'], 'MADE_UP']) assert.equal(resolveSellerHomeFilter(invalid), undefined);
  for (const valid of ['ALL', 'IN_SERVICE', 'PENDING_SERVICE', 'AFTER_SALE']) assert.equal(resolveSellerHomeFilter(valid), valid);
});

test('卖家首页真实组件保留四工具与正确分类，不伪造今日成交或未完整分页的待办总量', () => {
  for (const mode of ['complete', 'partial', 'error', 'loading'] as const) {
    const calls: unknown[] = [];
    const screen = moduleView('features/seller/seller-overview-screen.tsx', name => {
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return { ...native, useWindowDimensions: () => ({ fontScale: 2 }) };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === 'expo-router') return { router: { push: (value: unknown) => calls.push(value) } };
      if (name === './seller-api') return { useSellerOverview: () => ({ data: { seller: {}, order_counts: { IN_SERVICE: 3 }, service_counts: {}, finance: { available_cent: '999999' } } }) };
      if (name === './seller-order-api') return { useSellerOrders: () => ({ data: mode === 'loading' ? undefined : { pages: [{ items: [] }] }, hasNextPage: mode === 'partial', isError: mode === 'error', isPending: mode === 'loading' }) };
      if (name === './seller-home-model') return { sellerHomeTasks };
      if (name === './seller-identity') return { SellerIdentity: 'SellerIdentity' };
      if (name === './seller-order-domain') return {};
      if (name.endsWith('theme/tokens')) return { colors: {} };
      if (name.endsWith('approved-layout')) return { approvedLayout };
      if (name.endsWith('utils/money')) return { formatCent };
      if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => key });
      throw new Error(name);
    });
    assert.ok(screen.SellerOverviewScreen);
    const nodes = tree(screen.SellerOverviewScreen());
    const texts = nodes.filter(node => node.type === 'Text').map(node => node.props.children);
    assert.ok(!texts.includes('9,999.99'));
    assert.ok(texts.includes('今日成交统计暂未提供，不能以余额或累计订单代替。'));
    assert.equal(texts.includes('暂无订单待办'), mode === 'complete');
    assert.equal(texts.includes('已加载订单中暂无待办'), mode === 'partial');
    assert.equal(nodes.some(node => node.props.title === '待办读取失败'), mode === 'error');
    assert.equal(nodes.some(node => node.props.title === '正在读取订单待办'), mode === 'loading');
    for (const label of ['商品管理', '评价管理', '售后处理', '经营数据', '查看服务中订单', '查看退款售后订单']) {
      const node = nodes.find(item => item.props.accessibilityLabel === label);
      assert.ok(node); (node.props.onPress as () => void)();
    }
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), ['/(seller-tabs)/services', '/seller/reviews', '/seller/refunds', '/(seller-tabs)/earnings', { pathname: '/(seller-tabs)/orders', params: { filter: 'IN_SERVICE' } }, { pathname: '/(seller-tabs)/orders', params: { filter: 'AFTER_SALE' } }]);
    const service = nodes.find(node => node.props.accessibilityLabel === '查看服务中订单');
    const style = (service?.props.style as (state: unknown) => unknown[])({ pressed: false });
    assert.ok(style.some(part => (part as { width?: string })?.width === '50%'));
  }
});

test('卖家订单真实组件接收首页分类且保持卖家空态与商品入口，非法筛选不传API', () => {
  for (const selected of ['IN_SERVICE', 'AFTER_SALE', 'ALL', 'BAD']) {
    const requests: unknown[] = [], pushes: unknown[] = [], scrolls: unknown[] = [];
    const screen = moduleView('features/seller/seller-orders-summary-screen.tsx', name => {
      if (name === 'react/jsx-runtime' || name === '@xiongzai/contracts/commerce') return require(name);
      if (name === 'react') return { useMemo: (fn: () => unknown) => fn(), useState: (value: unknown) => [value, () => {}], useEffect: () => {}, useRef: (value: unknown) => ({ current: value === null ? { scrollTo: (entry: unknown) => scrolls.push(entry) } : value }) };
      if (name === 'react-native') return { ...native, FlatList: 'FlatList' };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === 'expo-router') return { router: { push: (href: unknown) => pushes.push(href) }, useLocalSearchParams: () => ({ filter: selected }) };
      if (name === './seller-home-model') return { resolveSellerHomeFilter };
      if (name.endsWith('seller-order-api')) return { useSellerOrders: (...args: unknown[]) => { requests.push(args); return { data: { pages: [{ items: [] }] } }; } };
      if (name.endsWith('theme/tokens')) return { colors: {} };
      if (name.startsWith('@/components/') || name.endsWith('jelly-icon')) return new Proxy({}, { get: (_, key) => key });
      return {};
    });
    assert.ok(screen.SellerOrdersSummaryScreen);
    const list = tree(screen.SellerOrdersSummaryScreen()).find(node => node.type === 'FlatList');
    assert.ok(list);
    const nodes = [...tree(list.props.ListHeaderComponent), ...tree(list.props.ListEmptyComponent)];
    const tab = nodes.find(node => node.props.accessibilityRole === 'tab' && (node.props.accessibilityState as { selected: boolean })?.selected);
    assert.ok(tab);
    (tab.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { x: 500 } } });
    assert.equal((scrolls[0] as { x: number }).x, 488);
    assert.deepEqual(requests[0], [true, ['IN_SERVICE'].includes(selected) ? selected : undefined, selected === 'AFTER_SALE' ? 'IN_PROGRESS' : undefined]);
    const button = nodes.find(node => node.props.label === '管理商品');
    assert.ok(button); (button.props.onPress as () => void)();
    assert.equal(pushes[0], '/(seller-tabs)/services');
    assert.ok(!nodes.some(node => node.props.children === '还没有购买订单'));
  }
});
