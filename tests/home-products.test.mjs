/* React adapters here are isolated render fixtures, not public components. */
/* eslint-disable react/prop-types */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function module(file, deps = {}) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const context = { exports: {}, require: name => { if (!(name in deps)) throw Error(name); return deps[name]; } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
const model = await module('../app/home-product-model.ts');
const { homeProductFacts: facts } = model;
const sku = (name, priceCent, extra = {}) => ({ name, priceCent, ...extra });

test('single and equal-price SKUs have no misleading starting-price suffix', () => {
  for (const specs of [[sku('单局', 3000)], [sku('QQ区', '3000'), sku('微信区', 3000)]]) {
    const f = facts({ priceCent: '100', specs });
    assert.equal(f.priceText, '30.00'); assert.equal(f.qualifier, '');
  }
});
test('minimum comes from active SKUs; inactive and stale cached prices cannot win', () => {
  const f = facts({ priceCent: '1', specs: [sku('下架', 10, {status:'INACTIVE'}), sku('一局', 3000), sku('三局', 6000)] });
  assert.equal(f.priceText, '30.00'); assert.equal(f.qualifier, '起');
  assert.ok(!f.summary.includes('下架'));
});
test('summary selects the displayed minimum-price option without concatenating other combinations', () => {
  const f = facts({priceCent:'1',specs:[sku('昂贵套餐',6000),sku('体验 · QQ区',3000),sku('另一套餐',9000)]});
  assert.equal(f.summary,'体验 · QQ区'); assert.equal(f.priceText,'30.00');
  assert.equal(facts({priceCent:'100',specs:[sku('下架',1,{status:'INACTIVE'})]}).summary,undefined);
  assert.equal(facts({priceCent:'100',specSummary:'明确规格说明'}).summary,'明确规格说明');
});
test('list API minimum stays qualified when the complete price range is unavailable', () => {
  const f = facts({ priceCent: '1234', minimumPriceOnly: true, specSummary: '按约定完成', subtitle: '不要使用普通描述' });
  assert.equal(f.qualifier, '最低价'); assert.equal(f.summary, '按约定完成'); assert.equal(f.unit, undefined);
  assert.equal(facts({priceCent:'1234', subtitle:'重复通用介绍'}).summary, undefined);
});
test('billing units require explicit agreement across every SKU, not a duration guess', () => {
  assert.equal(facts({priceCent:'100',specs:[sku('30分钟',100,{duration:30})]}).unit, undefined);
  assert.equal(facts({priceCent:'100',specs:[sku('一局',100,{unit:'局'}),sku('三局',300,{unit:'局'})]}).unit,'局');
  for (const unit of [undefined,'小时']) assert.equal(facts({priceCent:'100',specs:[sku('一局',100,{unit:'局'}),sku('另一项',300,{unit})]}).unit,undefined);
});
test('unknown and invalid sales remain absent; sample zero is never presented as real sales', () => {
  for (const sold of [undefined,null,-1,NaN,Infinity,1.5,'0']) assert.equal(facts({priceCent:'100',sold}).sales,undefined);
  assert.equal(facts({priceCent:'100',sold:0}).sales,0);
  assert.equal(facts({priceCent:'100',sold:27}).sales,27);
  assert.equal(facts({priceCent:'100',sold:0},true).sales,undefined);
});
test('invalid money does not become zero and large integer cents remain exact', () => {
  for (const priceCent of ['','abc','-1','1.5']) assert.equal(facts({priceCent}).priceText,undefined);
  assert.equal(facts({priceCent:'900719925474099199'}).priceText,'9007199254740991.99');
});
const { HomeProductCard } = await module('../app/HomeProductCard.tsx', {
  'react/jsx-runtime': await import('react/jsx-runtime'),
  './home-product-model': model,
  './CatalogImage': {CatalogImage: ({src,alt}) => React.createElement('img',{src,alt})},
});
test('home card keeps the original image, full title and one exact-product callback', () => {
  let opened;
  const product = {title:'长商品名称',cover:'/original.jpg',gameCategory:'和平精英',priceCent:'3000',sold:0,subtitle:'重复描述',specs:[sku('体验 · QQ区',3000)]};
  const element = HomeProductCard({product,preview:true,onOpen:()=>{opened='stable-id';}});
  element.props.onClick(); assert.equal(opened,'stable-id');
  const html = renderToStaticMarkup(element);
  assert.ok(html.includes('/original.jpg')); assert.ok(html.includes('title="长商品名称"'));
  assert.ok(html.includes('<small title="和平精英">和平精英</small>')); assert.ok(html.includes('30.00'));
  assert.ok(!html.includes('体验 · QQ区'));
  assert.ok(!html.includes('重复描述')); assert.ok(!html.includes('销量')); assert.ok(!html.includes('起'));
});
test('category uses the explicit product field, never a SKU, title guess or default game', () => {
  for (const gameCategory of ['三角洲行动','王者荣耀','无畏契约',undefined,'']) {
    const html = renderToStaticMarkup(HomeProductCard({product:{title:'和平精英体验陪玩',gameCategory,cover:'/original.jpg',priceCent:'100',specs:[sku('30分钟',100)]},onOpen:()=>{}}));
    if (gameCategory) assert.ok(html.includes(`<small title="${gameCategory}">${gameCategory}</small>`));
    else assert.ok(!html.includes('<small'));
    assert.ok(!html.includes('30分钟'));
  }
});
test('short, very long and mixed-language titles retain their complete accessible text', () => {
  for (const title of ['单局陪玩', '超长商品名称'.repeat(30), 'VIP Ranked 2026 · QQ区 1234567890 '.repeat(10)]) {
    const element = HomeProductCard({product:{title,cover:'/original.jpg',priceCent:'100'},onOpen:()=>{}});
    const html = renderToStaticMarkup(element);
    assert.ok(html.includes(`title="${title}"`));
    assert.equal(element.props.children[1].props.children[0].props.children,title);
  }
});
