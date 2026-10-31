import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import * as React from 'react';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => dependencies[name] };
  vm.runInNewContext(code, context);
  return context.exports;
}
const model = load('../app/buyer-mine-model.ts');
const { identitySwitchTarget: target } = load('../app/IdentitySwitchScreen.tsx', {
  react: React, 'react/jsx-runtime': jsxRuntime, './buyer-mine-model': model, './ui/CartoonIcon': {},
});

test('seller returns to buyer, but design preview cannot bypass seller approval', async () => {
  const noRequest = () => { throw Error('unexpected request'); };
  assert.equal(await target('seller', false, undefined, noRequest), 'home');
  assert.equal(await target('buyer', true, undefined, noRequest), 'auth');
  assert.equal(await target('buyer', true, 'user', async () => ({ status: 'PENDING_REVIEW' })), 'buyerSellerIdentity');
  assert.equal(await target('buyer', false, undefined, noRequest), 'auth');
});
test('live switch checks current approval and never enters seller for pending, suspended or missing profiles', async () => {
  for (const status of ['APPROVED', 'PENDING_REVIEW', 'SUSPENDED', 'BANNED', 'UNKNOWN']) {
    const request = async path => { assert.equal(path, '/seller/profile'); return { status }; };
    assert.equal(await target('buyer', false, 'user', request), status === 'APPROVED' ? 'seller' : 'buyerSellerIdentity');
  }
  assert.equal(await target('buyer', false, 'user', async () => { throw { code: 'SELLER_NOT_FOUND' }; }), 'sellerApplyForm');
  assert.equal(await target('buyer', false, 'user', async () => ({ status: 'REJECTED' })), 'sellerApplyForm');
});
test('network failure does not change role, and cancellation reaches the identity request', async () => {
  const failure = new Error('offline');
  await assert.rejects(target('buyer', false, 'user', async () => { throw failure; }), failure);
  const controller = new AbortController();
  await target('buyer', false, 'user', async (_, init) => { assert.equal(init.signal, controller.signal); return { status: 'APPROVED' }; }, controller.signal);
});
