import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../app/commerce-model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}};vm.runInNewContext(code,context);
const {commerceOrderLabel:label,matchesOrderTab:matches,buyerOrderTabs,sellerOrderTabs}=context.exports;
const order=(status,extra={})=>({status,payment_status:'PAID',after_sale_status:'NONE',...extra});
test('both sides expose closed orders separately from completed services',()=>{
 for(const status of ['CLOSED','CANCELLED','SELLER_REJECTED']) {
  assert.equal(label(order(status),'seller'),'已关闭');
  assert.equal(matches(order(status),'已完成','seller'),false);
  assert.equal(matches(order(status),'已取消'),true);
 }
 assert.equal(label(order('COMPLETED')),'已完成');
});
test('refunds and disputes are discoverable from both order lists',()=>{
 for(const role of ['buyer','seller']) {
  assert.equal(label(order('COMPLETED',{payment_status:'REFUNDED'}),role),'已退款');
  assert(matches(order('COMPLETED',{payment_status:'REFUNDED'}),'售后',role));
  assert(matches(order('IN_SERVICE',{after_sale_status:'REQUESTED'}),'售后',role));
 }
});
test('every lifecycle status has a reachable buyer and seller filter',()=>{
 for(const status of ['PENDING_ACCEPT','ACCEPTED','IN_SERVICE','PENDING_BUYER_CONFIRM','COMPLETED','CANCELLED','CLOSED','SELLER_REJECTED']){
  assert(buyerOrderTabs.filter(t=>t!=='全部').some(t=>matches(order(status),t)));
  assert(sellerOrderTabs.filter(t=>t!=='全部').some(t=>matches(order(status),t,'seller')));
 }
 assert(matches(order('PENDING_PAYMENT'),'待付款'));
 assert(matches(order('FUTURE_STATUS'),'全部','seller'));
});

test('refunded, unpaid and disputed orders never expose fulfillment actions',()=>{
 const action=context.exports.sellerFulfillmentAction;
 assert.equal(action(order('PENDING_ACCEPT')),'accept');
 assert.equal(action(order('ACCEPTED')),'start');
 assert.equal(action(order('IN_SERVICE')),'complete');
 for(const status of ['PENDING_ACCEPT','ACCEPTED','IN_SERVICE']) {
  assert.equal(action(order(status,{payment_status:'REFUNDED'})),null);
  assert.equal(action(order(status,{payment_status:'UNPAID'})),null);
  assert.equal(action(order(status,{after_sale_status:'REQUESTED'})),null);
 }
});
