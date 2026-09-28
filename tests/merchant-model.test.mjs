import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../app/merchant-model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{}};vm.runInNewContext(code,context);
const {merchantPeriodBounds:bounds,merchantMetrics:metrics}=context.exports;
test('merchant calendar uses China midnight and Monday, not rolling seven days',()=>{
 const now=new Date('2026-09-26T11:00:00Z');
 assert.equal(new Date(bounds('今日',now)[0]).toISOString(),'2026-09-25T16:00:00.000Z');
 assert.equal(new Date(bounds('昨日',now)[1]).toISOString(),'2026-09-25T16:00:00.000Z');
 assert.equal(new Date(bounds('本周',now)[0]).toISOString(),'2026-09-20T16:00:00.000Z');
 assert.equal(new Date(bounds('本月',now)[0]).toISOString(),'2026-08-31T16:00:00.000Z');
 assert.equal(new Date(bounds('本年',now)[0]).toISOString(),'2025-12-31T16:00:00.000Z');
});
test('unpaid orders do not inflate turnover; refund and gross amounts stay separate',()=>{
 const row={created_at:'2026-09-26T10:00:00Z',paid_amount_cent:'1200',refunded_amount_cent:'200',payment_status:'PAID'};
 const result=metrics([row,{...row,payment_status:'UNPAID'},{...row,payment_status:'REFUNDED',refunded_amount_cent:'1200'},{...row,created_at:'2026-09-24T10:00:00Z'}],'今日',new Date('2026-09-26T11:00:00Z'));
 assert.equal(result.turnoverCent,'2400');assert.equal(result.refundCent,'1400');assert.equal(result.orderCount,3);assert.equal(result.paidCount,2);
});
test('period end is exclusive and cent totals retain integer precision',()=>{
 const row={created_at:'2026-09-25T15:59:59Z',paid_amount_cent:'9007199254740993',payment_status:'PAID'};
 const now=new Date('2026-09-26T11:00:00Z');
 const result=metrics([row,row,{...row,created_at:'2026-09-25T16:00:00Z'}],'昨日',now);
 assert.equal(result.turnoverCent,'18014398509481986');assert.equal(result.orderCount,2);
});
