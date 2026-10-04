import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{},structuredClone};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/trade-v31/model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {createSamples,transition:t,settlement,evidenceError,sampleEvidence,HOUR,parseMoney}=context.exports;
const now=Date.now(),samples=()=>createSamples(now);
const a=(type,role='buyer',extra={})=>({type,role,...extra});
test('normal fulfillment requires seller start, evidence, buyer acceptance and independent review',()=>{
 let o=samples()[0];assert.throws(()=>t(o,a('start')),/卖家/);assert.throws(()=>t(o,a('complete','seller',{evidence:sampleEvidence})),/先开始/);
 o=t(o,a('start','seller'),now);assert.equal(o.stage,'serving');assert.equal(o.promiseAt,samples()[0].promiseAt);
 assert.throws(()=>t(o,a('complete','seller',{evidence:sampleEvidence.slice(0,4)})),/5 张/);
 o=t(o,a('complete','seller',{evidence:sampleEvidence}),now);assert.equal(o.confirmAt,now+72*HOUR);
 o=t(o,a('confirm'),now);assert.equal(o.stage,'review');assert.equal(settlement(o).available,5400);
 o=t(o,a('review','buyer',{stars:5,content:'很好'}),now);assert.equal(o.stage,'done');assert.equal(settlement(o).available,5400);
});
test('200 yuan evidence boundary and money parsing',()=>{
 assert.equal(evidenceError(sampleEvidence,19999),'');assert.match(evidenceError(sampleEvidence,20000),/录屏/);
 assert.equal(evidenceError([...sampleEvidence,{kind:'video'}],20000),'');assert.equal(parseMoney('20.01'),2001);assert(Number.isNaN(parseMoney('20.001')));
});
test('whole-order freeze, refund cap, modifications and original remaining receipt time',()=>{
 let o=samples()[2];const orig=o.confirmAt;
 assert.throws(()=>t(o,a('apply','buyer',{amount:o.amount+1,reason:'未完成',description:'',evidence:[]})),/金额/);
 o=t(o,a('apply','buyer',{amount:2000,reason:'未完成',description:'',evidence:[]}),now);assert.equal(settlement(o).frozen,o.amount);
 assert.throws(()=>t(o,a('confirm')),/无法/);
 for(let i=0;i<2;i++) o=t(o,a('apply','buyer',{amount:2000,reason:'未完成',description:'修改',evidence:[]}),now);
 assert.throws(()=>t(o,a('apply','buyer',{amount:2000,reason:'未完成',description:'',evidence:[]})),/次数/);
 o=t(o,a('withdrawCase'),now+HOUR);assert.equal(o.stage,'receipt');assert.equal(o.confirmAt,orig+HOUR);
});
test('remedial fulfillment stays in same case with one shared extension',()=>{
 let o=samples()[4],caseId=o.sale.id;
 o=t(o,a('acceptProposal','buyer',{proposalId:o.sale.proposal.id,proposalVersion:o.sale.proposal.version}),now);assert.equal(o.sale.status,'remedy');assert.equal(o.sale.id,caseId);assert(settlement(o).frozen>0);
 o=t(o,a('complete','seller',{evidence:sampleEvidence}),now);assert.equal(o.sale.status,'remedyReceipt');
 o=t(o,a('extend'),now);assert.equal(o.confirmAt,now+96*HOUR);assert.throws(()=>t(o,a('extend')),/每个订单/);
 o=t(o,a('confirm'),now);assert.equal(settlement(o).fee,600);assert.equal(o.stage,'review');
});
test('two failed proposals escalate, silence is not acceptance',()=>{
 let o=samples()[3];const proposal={kind:'partial',amount:2000,content:'退未完成部分',hours:24};
 o=t(o,a('propose','seller',{proposal}),now);o=t(o,a('rejectProposal','buyer',{proposalId:o.sale.proposal.id,proposalVersion:o.sale.proposal.version}),now);assert.equal(o.sale.status,'second');
 o=t(o,a('propose','seller',{proposal}),now);o=t(o,a('rejectProposal','buyer',{proposalId:o.sale.proposal.id,proposalVersion:o.sale.proposal.version}),now);assert.equal(o.sale.status,'platform');assert.equal(o.refunded,0);
});
test('single party cannot execute a ruling, partial refunds remove whole commission',()=>{
 let o=samples()[8];o=t(o,a('acceptRuling'),now);assert.equal(o.sale.status,'ruling');
 o=t(o,a('acceptRuling','seller'),now);assert.equal(o.sale.status,'refundPending');assert.equal(o.refunded,0);
 const refunded=samples()[10];assert.equal(settlement(refunded).fee,0);assert.equal(settlement(refunded).net,4000);
});
test('second appeal requires new evidence and rejects after the deadline',()=>{
 let o=samples()[8];o.sale.status='final';o.sale.appealLevel=1;
 assert.throws(()=>t(o,a('appeal','buyer',{reason:'异议',evidence:[]}),now),/新证据/);
 assert.throws(()=>t(o,a('appeal','buyer',{reason:'异议',evidence:[{id:'new',kind:'image',digest:'verified-new-file-hash'}]}),now+25*HOUR),/窗口/);
 o=t(o,a('appeal','buyer',{reason:'异议',evidence:[{id:'new',kind:'image',digest:'verified-new-file-hash'}]}),now);assert.equal(o.sale.appealLevel,2);
});
test('platform proposals keep deadline and append evidence never resets it',()=>{
 let o=samples()[5],deadline=o.sale.deadline;
 o=t(o,a('propose','seller',{proposal:{kind:'remedy',amount:0,content:'补发',hours:24}}),now);assert.equal(o.sale.deadline,deadline);
 o=t(o,a('append','buyer',{evidence:[{id:'new',kind:'image',digest:'verified-new-file-hash'}]}),now);assert.equal(o.sale.deadline,deadline);
});
test('no-refund ruling after remedial dispute restores remedial acceptance and freeze',()=>{
 let o=samples()[12];o=t(o,a('intervene','buyer',{reason:'补充内容仍有问题',evidence:[]}),now);
 o.sale.status='ruling';o.sale.rulingAmount=0;
 o=t(o,a('acceptRuling'),now);o=t(o,a('acceptRuling','seller'),now);
 assert.equal(o.sale.status,'remedyReceipt');assert(settlement(o).frozen>0);assert.equal(o.stage,'receipt');
});
test('unpaid orders have no seller income and closing them never creates income',()=>{
 let o=samples()[7];assert.equal(settlement(o).net,0);o=t(o,a('cancel'),now);assert.equal(settlement(o).available,0);
});
