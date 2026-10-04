import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../app/buyer-mine-model.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { buyerIdentityEntry, mineOrderIcon } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('approved identity remains usable when public-profile revision is pending', () => {
  assert.equal(buyerIdentityEntry({ status: 'APPROVED', latest_application: { status: 'UNDER_REVIEW', revision_kind: 'PROFILE_REVISION' } }).target, 'seller');
});
test('no seller privileges are offered to draft/review/rejected/suspended/banned/unknown states', () => {
  for (const status of ['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED', 'BANNED', 'UNKNOWN']) assert.notEqual(buyerIdentityEntry({ status }).target, 'seller');
  assert.equal(buyerIdentityEntry(null).target, 'sellerApplyForm');
  assert.equal(buyerIdentityEntry({ status: 'DRAFT' }).action, '继续填写申请');
  for (const state of ['SUBMITTED', 'UNDER_REVIEW']) assert.equal(buyerIdentityEntry({ status: 'PENDING_REVIEW', latest_application: { status: state } }).action, null);
  assert.equal(buyerIdentityEntry({ status: 'PENDING_REVIEW', latest_application: { status: 'NEEDS_SUPPLEMENT' } }).action, '补充申请资料');
  assert.equal(buyerIdentityEntry({ status: 'REJECTED', latest_application: { status: 'REJECTED' } }).action, '修改申请资料');
});
test('suspension wins over an old approved application, and unknown states do not offer submission', () => {
  assert.equal(buyerIdentityEntry({ status: 'SUSPENDED', latest_application: { status: 'APPROVED' } }).action, null);
  assert.equal(buyerIdentityEntry({ status: 'UNKNOWN' }).target, null);
});
test('order icon mapping distinguishes waiting, acceptance and aftersales without changing filter keys', () => {
  assert.equal(mineOrderIcon['待接单'], 'mine-wait');
  assert.equal(mineOrderIcon['待确认'], 'order');
  assert.equal(mineOrderIcon['售后'], 'shield');
});
