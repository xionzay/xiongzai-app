import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
const source = await readFile(new URL('../app/local-catalog-data.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { previewCompanions, previewServices, previewHotServices } = context.exports;

test('every local companion and hot-sale card resolves to a catalog entry with selectable specs', () => {
  assert.equal(previewCompanions.length, 6);
  assert.equal(previewHotServices.length, 4);
  const ids = [...previewCompanions, ...previewServices].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id.startsWith('local-')));
  for (const seller of previewCompanions) {
    assert.equal(previewServices.filter(item => item.sellerId === seller.id).length, seller.services);
    assert.ok(seller.name && seller.introduction);
    assert.ok(Number(seller.rating) > 0 && Number(seller.rating) <= 5);
  }
  const skuIds = [];
  for (const product of previewServices) {
    assert.ok(previewCompanions.some(seller => seller.id === product.sellerId));
    assert.ok(product.title && product.description && product.specs.length >= 3);
    assert.equal(Number(product.priceCent), Math.min(...product.specs.map(sku => sku.priceCent)));
    for (const sku of product.specs) {
      skuIds.push(sku.id);
      assert.ok(Number.isSafeInteger(sku.priceCent) && sku.priceCent > 0);
      assert.ok(sku.duration > 0);
    }
  }
  assert.equal(new Set(skuIds).size, skuIds.length);
  for (const item of previewHotServices) assert.ok(previewServices.some(product => product.id === item.id));
});

test('all demo cover and avatar paths exist in permanent project assets', async () => {
  const paths = new Set([...previewCompanions.map(x => x.image), ...previewServices.map(x => x.cover)]);
  for (const path of paths) await access(new URL(`../public${path}`, import.meta.url));
});
