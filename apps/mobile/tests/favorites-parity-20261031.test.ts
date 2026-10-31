import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiClientError } from '../src/api/api-error';

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object' || !('props' in value)) return []; const node = value as Node; return [node, ...nodes(node.props.children)]; }
type Resource = { kind: 'SELLER' | 'PRODUCT'; item: { id: string } };
type Result = { data?: Resource; error?: Error; isError: boolean; isPending: boolean; isRefetching: boolean; refetch(): void };
function mount() {
  const require = createRequire(import.meta.url), paths: unknown[] = [], states: unknown[] = [], requests: { path: string; signal: AbortSignal }[] = [];
  let stateIndex = 0, fetched = 0, refreshed = 0;
  const auth = { status: 'authenticated', user: { id: 'buyer' } };
  const favorites = { items: [{ id: 'f1', target_type: 'SELLER', seller_id: 's', product_id: null }, { id: 'f2', target_type: 'PRODUCT', seller_id: null, product_id: 'p' }], isPending: false, isError: false, isRefetching: false, hasNextPage: false, isFetching: false, isFetchingNextPage: false, refetch: () => refreshed++, fetchNextPage: () => fetched++ };
  const results: Result[] = [ { data: { kind: 'SELLER', item: { id: 's' } }, isError: false, isPending: false, isRefetching: false, refetch: () => refreshed++ }, { data: { kind: 'PRODUCT', item: { id: 'p' } }, isError: false, isPending: false, isRefetching: false, refetch: () => refreshed++ } ];
  let queries: { enabled: boolean; queryKey: unknown[]; queryFn(options: { signal: AbortSignal }): Promise<Resource> }[] = [];
  const context = { exports: {} as { FavoritesScreen(): unknown }, require(name: string): unknown {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react') return { useMemo: (fn: () => unknown) => fn(), useState(initial: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (value: unknown) => { states[index] = value; }]; } };
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (x: unknown) => x, hairlineWidth: 1 } };
    if (name === '@tanstack/react-query') return { useQueries: (options: { queries: typeof queries }) => { queries = options.queries; return results; } };
    if (name === 'expo-router') return { router: { replace: (path: unknown) => paths.push(path) } };
    if (name === '@/auth/runtime') return { apiClient: { publicRequest: async (path: string, options: { signal: AbortSignal }) => { requests.push({ path, signal: options.signal }); return { id: path.split('/').at(-1) }; } } };
    if (name === '@/api/api-error') return { ApiClientError };
    if (name === '@/auth/auth-provider') return { useAuth: () => auth };
    if (name === './favorites-api') return { useFavorites: () => favorites };
    if (name === './favorite-catalog-card') return { FavoriteCatalogCard: 'FavoriteCatalogCard' };
    if (name === '@/hooks/use-online-status') return { useOnlineStatus: () => true };
    if (name === '@/theme/tokens') return { colors: { brandDeep: 'brand', white: 'white' } };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => key });
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/favorites/favorites-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { render: () => { stateIndex = 0; return nodes(context.exports.FavoritesScreen()); }, auth, favorites, results, requests, paths, get queries() { return queries; }, get fetched() { return fetched; }, get refreshed() { return refreshed; } };
}
test('收藏分类按真实目标展示横排店铺和双列商品，切换不混入另一类', () => {
  const h = mount(); let tree = h.render();
  assert.equal((tree.find(n => n.type === 'FavoriteCatalogCard')!.props.resource as Resource).kind, 'SELLER');
  (tree.find(n => n.props.accessibilityLabel === '收藏的服务')!.props.onPress as () => void)(); tree = h.render();
  assert.equal((tree.find(n => n.type === 'FavoriteCatalogCard')!.props.resource as Resource).kind, 'PRODUCT');
  assert.ok(tree.some(n => (n.props.style as { width?: string } | undefined)?.width === '48.5%'));
  const selected = tree.find(n => n.props.accessibilityLabel === '收藏的服务')!;
  assert.equal((selected.props.accessibilityState as { selected: boolean }).selected, true);
});
test('收藏解析保留 AbortSignal、按账号分区并去重游标交界记录', async () => {
  const h = mount(); h.favorites.items.push(h.favorites.items[0]!); h.render();
  assert.equal(h.queries.length, 2); assert.equal(h.queries[0]!.queryKey[1], 'buyer');
  const controller = new AbortController();
  const a = await h.queries[0]!.queryFn({ signal: controller.signal });
  const b = await h.queries[1]!.queryFn({ signal: controller.signal });
  assert.equal(a.kind, 'SELLER'); assert.equal(b.kind, 'PRODUCT');
  assert.deepEqual(h.requests.map(r => r.path), ['/companions/s', '/services/p']);
  assert.ok(h.requests.every(r => r.signal === controller.signal));
});
test('网络失败不冒充下架，失败重试保留已有收藏，404 才显示目标失效', () => {
  const h = mount(); h.results[0]!.isError = true; h.results[0]!.error = new TypeError('network');
  let tree = h.render(); assert.ok(tree.some(n => n.props.label === '重试读取收藏'));
  assert.ok(tree.some(n => n.type === 'FavoriteCatalogCard'));
  assert.ok(!tree.some(n => String(n.props.message).includes('个收藏目标不存在')));
  (tree.find(n => n.props.label === '重试读取收藏')!.props.onPress as () => void)(); assert.equal(h.refreshed, 3);
  h.results[0]!.error = new ApiClientError('RESOURCE_NOT_FOUND', 'not found', 404);
  tree = h.render(); assert.ok(tree.some(n => String(n.props.message).includes('1 个收藏目标不存在')));
  assert.ok(!tree.some(n => n.type === 'FavoriteCatalogCard'));
});
test('恢复认证不误显示登录失败；游客保留返回目标；正在分页不能重复请求', () => {
  const h = mount(); h.auth.status = 'booting'; let tree = h.render();
  assert.ok(tree.some(n => n.props.kind === 'loading')); assert.ok(h.queries.every(q => !q.enabled));
  h.auth.status = 'anonymous'; tree = h.render(); (tree.find(n => n.props.label === '去登录')!.props.onPress as () => void)();
  assert.equal((h.paths[0] as { params: { returnTo: string } }).params.returnTo, '/favorites');
  h.auth.status = 'authenticated'; h.favorites.hasNextPage = true; h.favorites.isFetching = true; tree = h.render();
  (tree.find(n => n.props.label === '加载更多收藏')!.props.onPress as () => void)(); assert.equal(h.fetched, 0);
  h.favorites.isFetching = false; (h.render().find(n => n.props.label === '加载更多收藏')!.props.onPress as () => void)(); assert.equal(h.fetched, 1);
});
