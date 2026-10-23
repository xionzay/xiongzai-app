import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { contractDependencies } from './helpers/commerce-contract.mjs';
const code=ts.transpileModule(readFileSync(new URL('../app/commerce-model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{},require:name=>contractDependencies[name]};vm.runInNewContext(code,context);
const {commerceOrderLabel:label,matchesOrderTab:matches,buyerOrderTabs,sellerOrderTabs}=context.exports;
const order=(status,extra={})=>({status,payment_status:'PAID',after_sale_status:'NONE',...extra});
test('customer payment labels never expose raw English status codes',()=>{
 for(const [value,expected]of [['CREATED','待支付'],['PAYING','支付处理中'],['PAID','已支付'],['FAILED','支付失败'],['CLOSED','支付已关闭'],['REFUNDING','退款处理中'],['PARTIALLY_REFUNDED','部分退款'],['REFUNDED','已退款'],[null,'待确认'],['FUTURE_STATUS','未知支付状态']]) assert.equal(context.exports.paymentStatusLabel(value),expected);
});
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
  assert(matches(order('COMPLETED',{payment_status:'REFUNDED'}),role==='buyer'?'已完成':'售后',role));
  assert(matches(order('IN_SERVICE',{after_sale_status:'IN_PROGRESS'}),role==='buyer'?'售后中':'售后',role));
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
 assert.equal(action(order('PENDING_SERVICE',{seller_available_actions:['START'],after_sale_status:'RESOLVED'})),'start');
 assert.equal(action(order('PENDING_SERVICE',{seller_available_actions:['START'],after_sale_status:'IN_PROGRESS'})),null);
 for(const status of ['PENDING_ACCEPT','ACCEPTED','IN_SERVICE']) {
  assert.equal(action(order(status,{payment_status:'REFUNDED'})),null);
  assert.equal(action(order(status,{payment_status:'UNPAID'})),null);
  assert.equal(action(order(status,{after_sale_status:'REQUESTED'})),null);
 }
});
