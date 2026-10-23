import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const modelContext={exports:{},structuredClone};
const compile=file=>ts.transpileModule(readFileSync(new URL(`../app/trade-v31/${file}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compile('model'),modelContext);
const cardContext={exports:{},require:()=>modelContext.exports};vm.runInNewContext(compile('card-actions'),cardContext);
const {createSamples,transition,HOUR}=modelContext.exports;
const {buyerCardActions:actions,buyerMatchesTab:matches,buyerListLabel:label}=cardContext.exports;
const now=Date.now(),rows=createSamples(now);
const ids=o=>Array.from(actions(o,now).visible,a=>a.id);
test('buyer cards expose actionable operations and never a generic detail action',()=>{
 assert.deepEqual(ids(rows[7]),['cancel','contact','pay']);assert.deepEqual(ids(rows[0]),['apply','contact','remind']);assert.deepEqual(ids(rows[1]),['apply','contact','remind']);
 assert.deepEqual(ids(rows[2]),['apply','evidence','confirm']);assert.deepEqual(ids(rows[6]),['contact','review']);assert.deepEqual(ids(rows[15]),['support','review']);assert.deepEqual(ids(rows[16]),['support']);
 for(const row of rows){assert(actions(row,now).visible.length<=3);assert(!ids(row).includes('detail'));}
});
test('reminder cooldown spans stages and applies to the target order',()=>{
 let o=transition(rows[0],{type:'remind',role:'buyer'},now);
 assert(actions(o,now).visible.at(-1).disabled);
 assert.throws(()=>transition(o,{type:'remind',role:'buyer'},now+HOUR),/24小时/);
 o=transition(o,{type:'start',role:'seller'},now+HOUR);
 assert(actions(o,now+2*HOUR).visible.at(-1).disabled);
 assert(!actions(o,now+24*HOUR).visible.at(-1).disabled);
 assert.throws(()=>transition(rows[3],{type:'remind',role:'buyer'},now),/无法/);
});
test('aftersale buttons reflect obligations rather than the list tab',()=>{
 assert.deepEqual(ids(rows[3]),['contact','case']);assert.deepEqual(ids(rows[4]),['contact','case']);
 assert.deepEqual(ids(rows[5]),['case','evidence']);assert.deepEqual(ids(rows[8]),['ruling']);assert.deepEqual(ids(rows[9]),['support','refund']);assert.deepEqual(ids(rows[14]),['case','intervene']);
 const maxed=structuredClone(rows[3]);maxed.sale.modifications=2;assert(!actions(maxed,now).more.some(a=>a.id==='edit'));
 const late=structuredClone(rows[5]);late.sale.deadline=now-1;assert.deepEqual(ids(late),['case']);
});
test('remedy acceptance preserves original case and shares extension quota',()=>{
 const o=structuredClone(rows[12]);assert.deepEqual(ids(o),['intervene','evidence','confirm']);assert.equal(label(o,now),'待收货');assert(matches(o,'待收货',now));assert(!matches(o,'售后中',now));
 assert(actions(o,now).more.some(a=>a.id==='extend'));o.extensionUsed=true;assert(!actions(o,now).more.some(a=>a.id==='extend'));
});
test('expired reviews, partial and full refunds retain correct status and actions',()=>{
 const o=structuredClone(rows[6]);o.terminatedAt=now-8*24*HOUR;
 assert.equal(label(o,now),'已完成');assert(!ids(o).includes('review'));assert(!matches(o,'待评价',now));assert(matches(o,'已完成',now));
 assert.equal(label(rows[10],now),'待评价');assert(!matches(rows[10],'售后中',now));
 const full=structuredClone(rows[10]);full.refunded=full.amount;assert.equal(label(full,now),'已退款');assert(matches(full,'已完成',now));assert(ids(full).includes('review'));
 full.reviewed=true;assert.equal(label(full,now),'已退款');assert(actions(full,now).more.some(a=>a.label==='查看评价'));
});
