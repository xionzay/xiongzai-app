import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => dependencies[name] };
  vm.runInNewContext(code, context);
  return context.exports;
}
const merchant = load('../app/merchant-model.ts');
const { revenueBounds: bounds, revenueMetrics: metrics, revenueMoney: money } = load('../app/seller-workbench/revenue-model.ts', { '../merchant-model': merchant });
const now = new Date('2026-10-25T10:00:00Z');
const row = (id, date, amount = '1000', reversed = '0') => ({ id, order_id: id, created_at: date, seller_amount_cent: amount, reversed_amount_cent: reversed });

test('revenue filters use China calendar boundaries and exclude the end instant', () => {
  const range = bounds('昨日', '', '', now);
  assert.equal(new Date(range[0]).toISOString(), '2026-10-23T16:00:00.000Z');
  assert.equal(new Date(range[1]).toISOString(), '2026-10-24T16:00:00.000Z');
  assert.equal(metrics([row('a', '2026-10-23T16:00:00Z'), row('b', '2026-10-24T16:00:00Z')], range).orders, 1);
});
test('custom ranges reject invalid, reversed and future dates', () => {
  for (const [start, end] of [['', '2026-10-25'], ['2026-02-31', '2026-03-01'], ['2026-10-25', '2026-10-24'], ['2026-10-24', '2026-10-26']]) assert.equal(bounds('自定义', start, end, now), null);
  assert.equal(bounds('自定义', '2026-10-25', '2026-10-25', now)[1], now.getTime());
});
test('net uses seller proceeds minus reversals, exact cents and distinct orders', () => {
  const a = row('a', '2026-10-24T12:00:00Z', '9007199254740993', '201');
  const result = metrics([a, { ...a, id: 'b' }], bounds('本月', '', '', now));
  assert.equal(result.net, 18014398509481584n);
  assert.equal(result.orders, 1);
  assert.equal(result.average, result.net);
  assert.equal(money(-101n), '-1.01');
  assert.equal(money(result.net), '180,143,985,094,815.84');
});
test('daily chart includes empty intervals and sums to net with negative corrections', () => {
  const result = metrics([row('a', '2026-10-22T16:00:00Z'), row('b', '2026-10-24T16:00:00Z', '100', '200')], bounds('自定义', '2026-10-23', '2026-10-25', now));
  assert.equal(result.buckets.length, 3);
  assert.equal(result.buckets[1].value, 0n);
  assert.equal(result.buckets[2].value, -100n);
  assert.equal(result.buckets.reduce((sum, b) => sum + b.value, 0n), result.net);
});
test('long ranges group by month and empty data never invents a trend', () => {
  const result = metrics([row('a', '2025-12-31T16:00:00Z')], bounds('本年', '', '', now));
  assert.equal(result.buckets.length, 10);
  assert.equal(result.buckets[0].key, '2026-01');
  assert.equal(metrics([], bounds('累计', '', '', now)).buckets.length, 0);
  assert.equal(metrics([row('a', '2026-10-24T16:00:00Z')], null).orders, 0);
});

test('six metrics share the income cohort, deduplicate buyers and use current ledger fees', () => {
  const rows = [
    { ...row('a', '2026-10-02T12:00:00Z', '9000'), buyer_id: 'buyer-1', order_amount_cent: '10000', platform_fee_cent: '1000' },
    // Refunded V3.1 order: the fee has already been returned by the ledger.
    { ...row('b', '2026-10-03T12:00:00Z', '10000', '2000'), buyer_id: 'buyer-1', order_amount_cent: '10000', platform_fee_cent: '0' },
    { ...row('c', '2026-09-03T12:00:00Z', '9000'), buyer_id: 'buyer-2', order_amount_cent: '10000', platform_fee_cent: '1000' },
  ];
  const result = metrics(rows, bounds('本月', '', '', now));
  assert.equal(result.gross, 20000n);
  assert.equal(result.fees, 1000n);
  assert.equal(result.reversed, 2000n);
  assert.equal(result.net, 17000n);
  assert.equal(result.gross - result.fees - result.reversed, result.net);
  assert.equal(result.orders, 2);
  assert.equal(result.buyers, 1);
  assert.equal(result.average, 8500n);
  const custom = metrics(rows, bounds('自定义', '2026-10-03', '2026-10-04', now));
  assert.equal(custom.orders, 1);
  assert.equal(custom.gross, 10000n);
  assert.equal(custom.fees, 0n);
  assert.equal(custom.buyers, 1);
});
test('missing metric fields are unavailable, empty periods are zero, large amounts stay exact', () => {
  const missing = metrics([row('a', '2026-10-02T12:00:00Z')], bounds('本月', '', '', now));
  assert.equal(missing.buyers, null);
  assert.equal(missing.fees, null);
  assert.equal(missing.gross, null);
  const empty = metrics([], bounds('今日', '', '', now));
  assert.equal(empty.buyers, 0);
  assert.equal(empty.gross, 0n);
  assert.equal(empty.fees, 0n);
  const large = metrics([{ ...row('a', '2026-10-02T12:00:00Z'), order_amount_cent: '9007199254740993', platform_fee_cent: '900719925474099' }], bounds('本月', '', '', now));
  assert.equal(large.gross, 9007199254740993n);
  assert.equal(large.fees, 900719925474099n);
});

test('dashboard period and date controls recalculate totals and clear chart selection', () => {
  const states = []; let cursor = 0;
  const hooks = { useState: initial => {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  } };
  const code = ts.transpileModule(readFileSync(new URL('../app/seller-workbench/RevenueDashboard.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const model = load('../app/seller-workbench/revenue-model.ts', { '../merchant-model': merchant });
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } }
  const RevenueDateRange = () => null;
  const context = { exports: {}, Date: FixedDate, require: name => ({ react: hooks, 'react/jsx-runtime': jsxRuntime, '../merchant-model': merchant, './revenue-model': model, './RevenueDateRange': { RevenueDateRange }, '../ui/CartoonIcon': { CartoonIcon: () => null } })[name] };
  vm.runInNewContext(code, context);
  const render = () => { cursor = 0; return context.exports.RevenueDashboard({ rows: [row('a', '2026-10-02T12:00:00Z'), row('b', '2026-10-10T12:00:00Z', '2000')] }); };
  function* elements(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const n of node) yield* elements(n); return; } yield node; yield* elements(node.props?.children); }
  const find = (tree, predicate) => [...elements(tree)].find(predicate);
  const stats = find(render(), e => e.props.className === 'revenue-summary');
  assert.deepEqual([...elements(stats)].filter(e => e.type === 'span').map(e => e.props.children), ['订单收入', '平台服务费', '退款扣减', '收益订单', '服务买家', '平均单笔收益']);
  find(render(), e => e.type === 'button' && e.props['aria-label'] === '自定义').props.onClick();
  const dateRange = find(render(), e => e.type === RevenueDateRange);
  dateRange.props.onChange('start', '2026-10-01');
  dateRange.props.onChange('end', '2026-10-04');
  const hero = find(render(), e => e.props.className === 'revenue-hero');
  assert.equal(find(hero, e => e.type === 'strong').props.children, '10.00');
  assert.equal(find(render(), e => e.props.className === 'revenue-chart'), undefined);
  find(render(), e => e.props.className === 'revenue-expand').props.onClick();
  assert.equal(find(render(), e => e.props.className === 'revenue-expand').props['aria-expanded'], true);
  find(render(), e => e.type === 'button' && e.props['aria-label'] === '2026-10-02 净收益 10.00 元').props.onClick();
  assert.match(find(render(), e => e.props.className === 'revenue-chart-value').props.children, /2026-10-02/);
  find(render(), e => e.props.className === 'revenue-expand').props.onClick();
  assert.equal(find(render(), e => e.props.className === 'revenue-chart'), undefined);
  assert.equal(find(find(render(), e => e.props.className === 'revenue-hero'), e => e.type === 'strong').props.children, '10.00');
  find(render(), e => e.props.className === 'revenue-expand').props.onClick();
  find(render(), e => e.type === 'button' && e.props.children === '今日').props.onClick();
  assert.equal(find(render(), e => e.props.className === 'revenue-chart-value').props.children, '点击柱形查看对应日期金额');
});
