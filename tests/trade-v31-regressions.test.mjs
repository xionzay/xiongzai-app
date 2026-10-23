import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,dependencies={}){const context={exports:{},structuredClone,require:key=>dependencies[key]};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const m=load('../app/trade-v31/model.ts');
const seller=load('../app/seller-workbench/model.ts',{'../trade-v31/model':m});
const buyerCards=load('../app/trade-v31/card-actions.ts',{'./model':m});
const now=1790900000000,{HOUR,transition:t,createSamples}=m;
const samples=()=>createSamples(now),act=(type,role='buyer',extra={})=>({type,role,...extra});
const image={id:'proof',name:'proof.png',kind:'image',digest:'new-proof'};
const proposal={kind:'remedy',amount:0,content:'补齐剩余服务',hours:24};
const respond=(o,role='buyer')=>act('acceptProposal',role,{proposalId:o.sale.proposal.id,proposalVersion:o.sale.proposal.version});
test('reapplication archives the complete previous case without sharing histories',()=>{
  let o=t(samples()[0],act('apply','buyer',{amount:1200,reason:'第一案',description:'未交付',evidence:[image]}),now);
  o=t(o,act('propose','seller',{proposal}),now);
  o=t(o,act('withdrawCase'),now+HOUR);
  const old=structuredClone(o.sale);
  o=t(o,act('apply','buyer',{amount:1000,reason:'新情况',description:'重新申请',evidence:[]}),now+2*HOUR);
  assert.equal(JSON.stringify(o.caseHistory[0]),JSON.stringify(old));
  assert.equal(o.sale.proposalHistory.length,0);
  assert.notEqual(o.sale.id,old.id);
  o.sale.evidence.push({...image,id:'new'});
  assert.equal(o.caseHistory[0].evidence.length,1);
});
test('evidence capability and transition agree for each identity and case stage',()=>{
  for(const status of Object.keys(m.caseNames)) for(const role of ['buyer','seller']) {
    const o=samples()[2];o.sale={...samples()[3].sale,status,deadline:now+HOUR};
    let allowed=true;try{t(o,act('append',role,{evidence:[image]}),now);}catch{allowed=false;}
    assert.equal(m.canAppendEvidence(o,role,now),allowed,`${status}/${role}`);
  }
  const o=samples()[5];o.sale.deadline=now;
  assert.equal(m.canAppendEvidence(o,'buyer',now),false);
  assert.throws(()=>t(o,act('append','buyer',{evidence:[image]}),now),/阶段|期限/);
});
test('buyer and seller use identical primary status and tab counts',()=>{
  for(const o of samples()) for(const tab of ['全部','待服务','服务中','待收货','待评价','已完成','售后中','已退款'])
    assert.equal(seller.sellerMatches(o,tab,now),buyerCards.buyerMatchesTab(o,tab,now),`${o.id}/${tab}`);
  assert.equal(m.orderLabel(samples()[10],now),'待评价');
  assert.equal(m.orderSecondaryLabel(samples()[10]),'部分退款');
});
test('platform proposal recipient owns the pending task',()=>{
  const o=t(samples()[5],act('propose','buyer',{proposal}),now);
  assert.equal(seller.sellerResponsibility(o,now),'待我回应方案');
  assert.equal(seller.sellerPrimaryAction(o,now).label,'回应方案');
  assert.equal(m.caseLabel(o.sale,'buyer',now),'待卖家回应方案');
  assert.equal(buyerCards.buyerCardActions(o,now).more.some(a=>a.label==='回应方案'),false);
});
test('seller pending buyer and refund states have progress actions instead of a misleading processing action',()=>{
  assert.equal(seller.sellerPrimaryAction(samples()[12],now).label,'查看补充履约');
  assert.equal(seller.sellerPrimaryAction(samples()[4],now).label,'查看方案进度');
  const pending=samples()[9];pending.sale.status='refundPending';
  assert.equal(seller.sellerPrimaryAction(pending,now).label,'退款进度');
});
test('pending, rejected and draft products cannot bypass audit via listing',()=>{
  for(const status of ['草稿','待审核','审核驳回']) assert.throws(()=>seller.toggleProductListing({status}),/审核/);
  assert.equal(seller.toggleProductListing({status:'在售'}).status,'已下架');
});
test('withdrawal preserves pause anchor through modifications and extends promise once',()=>{let o=samples()[0],deadline=o.promiseAt;const apply=act('apply','buyer',{amount:100,reason:'未完成',description:'',evidence:[]});o=t(o,apply,now);o=t(o,apply,now+HOUR);o=t(o,act('withdrawCase'),now+2*HOUR);assert.equal(o.promiseAt,deadline+2*HOUR);assert.equal(o.sale.closureReason,'buyerWithdrawn');assert.equal(o.sale.requestHistory.length,1);});
test('expired proposals cannot be accepted, including platform proposals',()=>{for(const index of [3,5]){let o=t(samples()[index],act('propose','seller',{proposal}),now);assert.throws(()=>t(o,respond(o),now+24*HOUR),/过期|失效/);}});
test('platform buyer proposes, only recipient accepts, one pending version is allowed',()=>{let o=t(samples()[5],act('propose','buyer',{proposal}),now);assert.throws(()=>t(o,respond(o,'buyer'),now),/接收方/);assert.throws(()=>t(o,act('propose','seller',{proposal}),now),/待回应/);assert.throws(()=>t(o,act('acceptProposal','seller',{proposalId:o.sale.proposal.id,proposalVersion:0}),now),/版本/);o=t(o,respond(o,'seller'),now);assert.equal(o.sale.status,'remedy');assert.equal(o.sale.proposalHistory[0].outcome,'accepted');});
test('second appeal rejects existing ID and matching file fingerprint',()=>{const o=samples()[13];o.sale.evidence=[image];for(const evidence of [[image],[{...image,id:'renamed'}]])assert.throws(()=>t(o,act('appeal','buyer',{reason:'异议',evidence}),now),/新证据/);});
test('rejection requires evidence and S01, not second proposal waiting',()=>{let o=samples()[3];assert.throws(()=>t(o,act('reject','seller',{reason:'已交付',evidence:[]}),now),/证据/);o.sale.status='second';assert.throws(()=>t(o,act('reject','seller',{reason:'已交付',evidence:[image]}),now),/阶段/);});
test('ordinary append is seller only and requires submitted delivery',()=>{assert.throws(()=>t(samples()[2],act('append','buyer',{evidence:[image]}),now),/卖家/);assert.throws(()=>t(samples()[0],act('append','seller',{evidence:[image]}),now),/凭证|阶段/);assert.equal(t(samples()[2],act('append','seller',{evidence:[image]}),now).evidence.length,6);});
test('seller intervention requires evidence but buyer initial request does not',()=>{assert.throws(()=>t(samples()[3],act('intervene','seller',{reason:'需核查',evidence:[]}),now),/证据/);assert.equal(t(samples()[3],act('intervene','buyer',{reason:'需核查',evidence:[]}),now).sale.status,'platform');});
test('seller tabs retain individual labels while grouping terminal orders',()=>{assert(seller.sellerMatches(samples()[12],'待收货',now));assert(seller.sellerMatches(samples()[10],'待评价',now));let o=t(samples()[7],act('cancel'),now);assert(!seller.sellerMatches(o,'已完成',now));assert.equal(m.orderLabel(o,now),'已关闭');});
test('remedy confirmation and no-refund ruling retain distinct resolution reasons',()=>{let o=t(samples()[12],act('confirm'),now);assert.equal(o.sale.status,'resolved');assert.equal(o.sale.closureReason,'remedyCompleted');o=samples()[8];o.sale.rulingAmount=0;o=t(o,act('acceptRuling'),now);o=t(o,act('acceptRuling','seller'),now);assert.equal(o.sale.status,'resolved');assert.equal(o.sale.closureReason,'rulingNoRefund');});
test('proposal responses bind to displayed version and cannot be replayed',()=>{let o=t(samples()[3],act('propose','seller',{proposal}),now),a=respond(o);o=t(o,a,now);assert.throws(()=>t(o,a,now),/方案/);});
test('expiry moves first proposal to second round and second deadline to platform, never assumes consent',()=>{let o=t(samples()[3],act('propose','seller',{proposal}),now);o=m.advanceDeadlines(o,now+24*HOUR);assert.equal(o.sale.status,'second');o=m.advanceDeadlines(o,now+48*HOUR);assert.equal(o.sale.status,'platform');assert.equal(o.refunded,0);});
test('local deadlines never fake a channel refund success; active sale blocks receipt completion',()=>{let o=m.advanceDeadlines(samples()[3],now+24*HOUR);assert.equal(o.sale.status,'refundPending');assert.equal(o.refunded,0);o=samples()[2];o.confirmAt=now+HOUR;o=t(o,act('apply','buyer',{amount:100,reason:'未完成',description:'',evidence:[]}),now);o=m.advanceDeadlines(o,now+2*HOUR);assert.equal(o.stage,'receipt');assert(m.activeCase(o));});
test('stale requested actions cannot win against the deadline and duplicate screenshots do not satisfy delivery', () => {
  const o = createSamples(now)[3]; o.sale.deadline = now;
  assert.throws(() => t(o, {type:'reject',role:'seller',reason:'已交付',evidence:[{id:'proof',kind:'image'}]}, now), /当前阶段/);
  const serving = createSamples(now)[1]; serving.amount = 6000;
  assert.throws(() => t(serving, {type:'complete',role:'seller',evidence:Array.from({length:5},(_,i)=>({id:String(i),digest:'same-content',kind:'image'}))}, now), /5/);
});
test('checkout validates configured fields and snapshots buyer information',()=>{
  const o=samples()[7];o.requiredFields=[{id:'game-id',label:'游戏 ID',required:true},{id:'region',label:'区服',required:true}];
  assert.throws(()=>t(o,act('pay','buyer',{buyerInfo:{'game-id':'123'}}),now),/区服/);
  const info={'game-id':'123',region:'QQ区'};
  const paid=t(o,act('pay','buyer',{buyerInfo:info}),now);
  info.region='微信区';
  assert.equal(paid.buyerInfo.region,'QQ区');
  assert.equal(paid.requiredFields[0].label,'游戏 ID');
});
