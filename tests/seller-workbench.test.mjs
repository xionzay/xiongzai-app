import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(new URL(`../app/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, structuredClone };
vm.runInNewContext(compile('trade-v31/model'), context);
const seller = { exports: {}, require: () => context.exports };
vm.runInNewContext(compile('seller-workbench/model'), seller);
const { createSamples, transition, HOUR } = context.exports;
const { sellerPrimaryAction, sellerTasks, sellerTotals, sellerMatches, periodOrders, reconcileVariants, validateProduct, combinations } = seller.exports;
const rows = createSamples();
test('home todos name the actual deadline, amount and detail destination without changing rules', () => {
  const now = 1800000000000;
  const order = { ...rows[0], promiseAt: now + HOUR, amount: 6000 };
  const before = JSON.stringify(order);
  const item = seller.exports.sellerTaskPresentation(order, now);
  assert.equal(item.title, '待开始服务');
  assert.equal(item.action, '查看订单');
  assert.equal(item.deadline.text, '承诺完成 · 剩余1小时');
  assert.equal(item.deadline.tone, 'urgent');
  assert.equal(item.amountLabel, '买家实付');
  assert.equal(item.amount, 6000);
  assert.equal(JSON.stringify(order), before);
  assert.equal(seller.exports.sellerTaskPresentation({ ...order, stage: 'serving' }, now).action, '查看订单');
  assert.equal(seller.exports.sellerTaskPresentation({ ...order, promiseAt: now - HOUR - 60000 }, now).deadline.text, '承诺完成 · 已超时1小时1分');
  assert.equal(seller.exports.sellerTaskPresentation({ ...order, promiseAt: now }, now).deadline.text, '承诺完成 · 刚到期');
  for (const value of [0, undefined, Infinity, NaN]) {
    const absent = seller.exports.sellerTaskPresentation({ ...order, promiseAt: value, amount: undefined }, now);
    assert.equal(absent.deadline.text, '承诺完成 · 暂无明确期限');
    assert.equal(absent.deadline.tone, 'normal');
    assert.equal(absent.amount, null);
  }
  assert.equal(seller.exports.sellerTaskPresentation({ ...order, promiseAt: now + 2 * HOUR + 1 }, now).deadline.tone, 'normal');
});
test('home separates refund requests, platform deadlines and proposal recipients', () => {
  const now = 1800000000000;
  const order = { ...rows[3], sale: { ...rows[3].sale, status: 'platform', requested: 1200, deadline: now - HOUR } };
  const item = seller.exports.sellerTaskPresentation(order, now);
  assert.equal(item.amountLabel, '申请退款');
  assert.equal(item.amount, 1200);
  assert.equal(item.responsibility, '平台处理中');
  assert.equal(item.action, '查看进度');
  assert.equal(item.deadline.text, '平台举证 · 已超时1小时');
  for (const proposer of ['buyer', 'seller']) {
    const proposed = { ...order, sale: { ...order.sale, proposal: { proposer, expiresAt: now + HOUR } } };
    const result = seller.exports.sellerTaskPresentation(proposed, now);
    assert.equal(result.action, proposer === 'buyer' ? '回应方案' : '查看进度');
    assert.equal(result.responsibility, proposer === 'buyer' ? '待我回应方案' : '待买家回应');
    assert.equal(result.proposalDeadline.text, '方案回应 · 剩余1小时');
    assert.equal(result.deadline.text, item.deadline.text);
    assert.equal(seller.exports.sellerDeadline(proposed), order.sale.deadline);
    assert.equal(seller.exports.sellerTaskPresentation(proposed, now + HOUR).proposalDeadline, null);
  }
  const second = seller.exports.sellerTaskPresentation({ ...order, sale: { ...order.sale, status: 'second' } }, now);
  assert.equal(second.action, '处理售后');
  assert.equal(second.deadline.text, '第二轮方案提交 · 已超时1小时');
});
test('home covers supplementary delivery and appeal windows without fabricating a seller action', () => {
  const now = 1800000000000;
  assert.equal(sellerTasks([]).length, 0);
  const cases = [
    ['requested', '售后回应', '处理售后'], ['remedy', '补充履约完成', '查看进度'],
    ['appeal', '复核处理', '查看进度'], ['ruling', '申诉窗口', '查看进度'], ['final', '申诉窗口', '查看进度'],
  ];
  for (const [status, label, action] of cases) {
    const order = { ...rows[3], sale: { ...rows[3].sale, status, deadline: now + HOUR, appealLevel: 0 } };
    const result = seller.exports.sellerTaskPresentation(order, now);
    assert.equal(result.deadline.text, `${label} · 剩余1小时`);
    assert.equal(result.action, action);
  }
  const final = { ...rows[3], sale: { ...rows[3].sale, status: 'final', deadline: now + HOUR, appealLevel: 2 } };
  assert.equal(seller.exports.sellerTaskPresentation(final, now).deadline.text, '结果生效 · 剩余1小时');
  assert.equal(seller.exports.sellerTaskPresentation(final, now).responsibility, '待我处理');
  final.sale.acceptedBy = ['seller'];
  assert.equal(seller.exports.sellerTaskPresentation(final, now).responsibility, '待买家回应');
});
test('seller fulfillment shortcuts respect active disputes and remedy obligations', () => {
  assert.equal(sellerPrimaryAction(rows[0]).id, 'start');
  assert.equal(sellerPrimaryAction(rows[1]).id, 'evidence');
  for (const i of [3, 4, 5, 8, 9, 12, 13, 14]) assert.equal(sellerPrimaryAction(rows[i]).id, 'case');
  assert.equal(sellerPrimaryAction(rows[11]).id, 'evidence');
  assert.equal(sellerPrimaryAction(rows[10]).id, 'funds');
  assert(sellerMatches(rows[9], '售后中'));
  assert(!sellerMatches(rows[10], '售后中'));
  const started = transition(rows[0], { type: 'start', role: 'seller' });
  assert(!sellerMatches(started, '待服务'));
  assert(sellerMatches(started, '服务中'));
  assert.equal(started.promiseAt, rows[0].promiseAt);
});
test('todo excludes buyer-owned waiting and sorts deadlines; settlement avoids unpaid balances', () => {
  const tasks = sellerTasks(rows);
  assert(!tasks.some(o => ['proposal', 'processing', 'refunded', 'rejected', 'remedyReceipt'].includes(o.sale?.status)));
  const urgent = structuredClone(rows[3]); urgent.sale.deadline = Date.now() - HOUR;
  assert.equal(sellerTasks([rows[0], urgent])[0].id, urgent.id);
  const zero = sellerTotals([rows[7]]); assert.equal(zero.available + zero.pending + zero.frozen, 0);
  assert.equal(sellerTotals([rows[3]]).frozen, rows[3].amount);
});
test('period metrics use payment time and exclude unpaid orders', () => {
  const now = new Date(2026, 9, 1, 15);
  const today = { ...rows[0], paidAt: new Date(2026, 9, 1, 12).getTime() };
  const yesterday = { ...rows[1], paidAt: new Date(2026, 8, 30, 12).getTime() };
  assert.equal(periodOrders([today, yesterday, { ...today, stage: 'unpaid' }], '今日', now).length, 1);
  assert.equal(periodOrders([today, yesterday], '昨日', now)[0].id, yesterday.id);
});
test('SKU changes preserve matching prices, deduplicate options, and cap oversized combinations', () => {
  const dimensions = [{ name: '大区', values: 'QQ区,微信区,QQ区' }];
  const saved = [{ key: 'QQ区', price: '29.90', stock: '3' }];
  const variants = reconcileVariants(dimensions, saved);
  assert.equal(variants.length, 2); assert.equal(variants[0].price, '29.90'); assert.equal(variants[1].price, '');
  assert.equal(combinations(Array.from({ length: 3 }, () => ({ name: '规格', values: Array.from({ length: 10 }, (_, i) => String(i)).join(',') }))).length, 101);
});
test('publishing rejects missing prices, negative inventory, and invalid completion windows', () => {
  const product = { title: '组队陪玩', description: '服务说明', variants: [{ key: '体验', price: '29.90', stock: '3' }], hours: '24' };
  assert.equal(validateProduct(product), '');
  assert(validateProduct({ ...product, hours: '169' }));
  assert(validateProduct({ ...product, variants: [{ key: '体验', price: '2.999', stock: '3' }] }));
  assert(validateProduct({ ...product, variants: [{ key: '体验', price: '29.90', stock: '-1' }] }));
});
test('renaming a SKU preserves its stable identity, price and stock, without merging identical buyer names', () => {
  const previous = [{ name: '套餐', values: '体验,全程' }, { name: '大区', values: 'QQ,微信' }];
  const variants = reconcileVariants(previous, []).map((v, i) => ({ ...v, price: String(i + 1), stock: String(i + 5) }));
  const renamed = reconcileVariants([{ ...previous[0], values: '入门,全程' }, previous[1]], variants, previous);
  assert.equal(renamed[0].id, variants[0].id); assert.equal(renamed[0].price, variants[0].price); assert.equal(renamed[0].stock, variants[0].stock);
  assert.equal(renamed[2].id, variants[2].id);
  assert.notEqual(seller.exports.buyerIdentity({ id:'1',buyer:'同名',buyerId:'user1' }), seller.exports.buyerIdentity({ id:'2',buyer:'同名',buyerId:'user2' }));
  assert.notEqual(seller.exports.buyerIdentity({ id:'1',buyer:'同名' }), seller.exports.buyerIdentity({ id:'2',buyer:'同名' }));
});
