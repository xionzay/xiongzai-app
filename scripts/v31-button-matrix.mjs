// Regenerate with: node scripts/v31-button-matrix.mjs
// This is a local UI capability inventory, not proof that the formal API implements V3.1.
import {readFileSync, writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const context = {exports:{},structuredClone,require:key=>dependencies[key]};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return context.exports;
}
const model=load('../app/trade-v31/model.ts');
const buyer=load('../app/trade-v31/card-actions.ts',{'./model':model});
const seller=load('../app/seller-workbench/model.ts',{'../trade-v31/model':model});
const now=Date.now(), samples=model.createSamples(now);
const cases=[...samples];
for (const status of ['second','refundPending','appeal']) {
  const order=structuredClone(samples[3]); order.id=`matrix-${status}`; order.sale.status=status;
  cases.push(order);
}
cases.push(model.transition(samples[7],{type:'cancel',role:'buyer'},now));
const platformProposal=model.transition(samples[5],{type:'propose',role:'buyer',proposal:{kind:'remedy',amount:0,content:'补齐约定服务',hours:24}},now);
platformProposal.id='matrix-buyer-platform-proposal'; cases.push(platformProposal);
const rows=cases.flatMap(order=>['buyer','seller'].map(role=>({
  sampleOrder:order.id,role,orderStage:order.stage,caseStage:order.sale?.status??null,
  primaryState:model.orderLabel(order,now),secondaryState:model.orderSecondaryLabel(order),
  caseState:order.sale?model.caseLabel(order.sale,role,now):null,
  actions:role==='buyer'?buyer.buyerCardActions(order,now):{primary:seller.sellerPrimaryAction(order,now)},
  appendEvidence:model.canAppendEvidence(order,role,now),
  formalApiIntegrated:false,
})));
writeFileSync(new URL('../docs/v31-validation/2026-10-02-fixes/button-matrix.json',import.meta.url),JSON.stringify({
  generatedAt:new Date(now).toISOString(),scope:'V3.1 本地规则层主要状态、列表操作和追加凭证能力；未覆盖正式客服后台全操作，不作为正式接口权限验收。',rows,
},null,2)+'\n');
console.log(`Generated ${rows.length} role/state rows.`);
