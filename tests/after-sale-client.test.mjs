import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';

function compile(path, require = () => ({}), globals = {}) {
  const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,{exports,require,React,crypto:webcrypto,AbortController,URL,setTimeout,clearTimeout,...globals});return exports;
}
const c=compile('packages/contracts/src/after-sale-client.ts');
const id='00000000-0000-4000-8000-000000000001',file='00000000-0000-4000-8000-000000000002';
const row={id,order_id:file,state:'P02',case_type:'NORMAL',version:7,requested_amount_cent:'20000',deadline_at:null,modifications:1,negotiation_rounds:2,evidence_file_ids:[],available_actions:Object.keys(c.userCaseActions),offer:{id:'offer-v2',kind:'REFUND'},decision:{id:'decision-v4',level:1}};
test('all user actions use case CAS and concrete offer/decision identity; capability is server-authoritative',()=>{
  const f={reason:'合成测试说明',amount:'20000',retained:'0',delivery:'合成已交付内容',terminated:true,accept:false,fileIds:[file]};
  for(const action of Object.keys(c.userCaseActions)){const body=c.casePayload(row,action,f);assert.equal(body.version,7);assert.equal(body.action,action);assert.equal(body.order_version,undefined);}
  assert.equal(c.casePayload(row,'RESPOND',f).offer_id,'offer-v2');assert.equal(c.casePayload(row,'RESPOND',f).accept,false);
  assert.equal(c.casePayload(row,'ACCEPT_DECISION',f).decision_id,'decision-v4');assert.equal(c.casePayload(row,'APPEAL',f).decision_id,'decision-v4');
  assert.throws(()=>c.casePayload(row,'RESPOND',{}),/明确/u);assert.throws(()=>c.casePayload({...row,available_actions:[]},'APPROVE',f),/未开放/u);
  assert.throws(()=>c.casePayload(row,'OFFER',{...f,terminated:undefined}),/明确确认/u);
  assert.throws(()=>c.casePayload(row,'ADD_EVIDENCE',{fileIds:[file,file]}),/不能重复/u);
});
test('remedy remains case action, validates bounded duration, never creates order or invents money',()=>{
  const f={kind:'REMEDY',content:'补齐原案交付',quantity:'一份',standard:'原约定标准',seconds:'604800'};
  const command=c.casePayload(row,'OFFER',f);assert.equal(command.offer.fulfillment_seconds,604800);assert.equal(command.order_id,undefined);
  for(const seconds of ['0','604801','1.5','Infinity'])assert.throws(()=>c.casePayload(row,'OFFER',{...f,seconds}));
  assert.equal(c.centDisplay('900719925474099300'),'9007199254740993.00');assert.equal(c.centDisplay('NaN'),'金额不可用');
  assert.throws(()=>c.casePayload(row,'MODIFY',{reason:'金额测试',amount:'2.00'}));
});
test('unknown outcome retries frozen body/key, guards double submit and uses current_case not operation_result',async()=>{
  const calls=[];let release;const payload=c.casePayload(row,'ACCEPT_DECISION',{});
  const write=c.caseSubmission(async(path,init)=>{calls.push({path,...init});if(calls.length===1)throw new Error('synthetic lost response');return new Promise(resolve=>{release=resolve;});},row,payload,'stable-test-idempotency');
  await assert.rejects(write());payload.version=999;
  const pending=write();await assert.rejects(write(),/重复/u);assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
  release({operation_result:{version:8,state:'P02'},current_case:{...row,version:10,state:'F01',available_actions:[]}});
  assert.equal((await pending).current_case.state,'F01');await write();assert.equal(calls.length,2);
});
test('409 invalidates confirmation; malformed successful response is never called success',async()=>{
  let count=0;const write=c.caseSubmission(async()=>{count++;throw {status:409,code:'RESOURCE_VERSION_CONFLICT'};},row,{action:'APPROVE',version:7},'conflict-test');
  await assert.rejects(write());await assert.rejects(write());assert.equal(count,1);
  for(const response of [{},{operation_result:{},current_case:row},{operation_result:{},current_case:{...row,id:file,version:8}}])await assert.rejects(c.caseSubmission(async()=>response,row,{},'invalid-result')());
  assert.doesNotMatch(c.caseError({message:'SENSITIVE_PAYLOAD',code:'unknown'}),/SENSITIVE/u);
});
test('review image path is exact controlled content, not supplied URL or signature',()=>{
  const path=`/api/v1/files/review-images/${id}/${file}/content`;
  assert.equal(c.reviewImagePath(id,{file_id:file,content_path:path}),path);
  for(const value of ['https://external.invalid/image',path+'?token=private','/api/v1/files/x/content',path+'/../other'])assert.equal(c.reviewImagePath(id,{file_id:file,content_path:value}),null);
  const location=compile('app/user-api-location.ts',undefined,{window:{location:{hostname:'127.0.0.1',origin:'http://127.0.0.1:3101'}}});assert.equal(location.apiBaseUrl(),'http://127.0.0.1:3002/api/v1');
});

function harness(request){
  const hooks=[],effects=[];let cursor=0,dirty=true,tree;
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const react={...React,useState(initial){const i=cursor++;hooks[i]??={value:typeof initial==='function'?initial():initial};return[hooks[i].value,next=>{hooks[i].value=typeof next==='function'?next(hooks[i].value):next;dirty=true;}];},useRef(initial){return hooks[cursor++]??={current:initial};},useCallback(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps))hooks[i]={fn,deps};return hooks[i].fn;},useEffect(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps)){hooks[i]?.cleanup?.();hooks[i]={deps};effects.push(()=>{hooks[i].cleanup=fn();});}}};
  const component=compile('app/ConnectedAfterSale.tsx',key=>key==='react'?react:key.includes('after-sale-client')?c:key==='./connected-commerce'?{evidenceError:()=>null}:{ConnectedFiles:()=>null},{document:{hidden:false,addEventListener(){},removeEventListener(){}}});
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
  return {nodes:()=>nodes(tree),button:label=>nodes(tree).find(n=>n.type==='button'&&text(n)===label),text:()=>text(tree),async flush(){for(let i=0;i<15;i++){if(dirty){dirty=false;cursor=0;tree=component.ConnectedAfterSale({request,caseId:id,onSupport(){}});effects.splice(0).forEach(fn=>fn());}await new Promise(r=>setTimeout(r,0));}},dispose(){hooks.forEach(h=>h?.cleanup?.());}};
}
test('real Web form confirms exact decision, conflict clears confirmation without replay',async()=>{
  let current={...row,available_actions:['ACCEPT_DECISION']},writes=0;
  const h=harness(async(path,init={})=>{if(init.method==='POST'){writes++;assert.equal(JSON.parse(init.body).decision_id,'decision-v4');current={...current,version:8,decision:{...current.decision,id:'decision-v5'}};throw {status:409,code:'RESOURCE_VERSION_CONFLICT'};}return path.includes('/history')?{items:[],next_after_version:null}:current;});
  await h.flush();h.button('接受当前裁决').props.onClick();await h.flush();h.button('核对并准备提交').props.onClick();await h.flush();assert.equal(writes,0);
  await h.button('确认提交案件操作').props.onClick();await h.flush();assert.equal(writes,1);assert.equal(h.button('确认提交案件操作'),undefined);assert.match(h.text(),/原确认不会自动重放/u);assert.match(h.text(),/decision-v5/u);h.dispose();
});
test('review display hides non-public images and uses configured API port for approved public content',()=>{
  const component=compile('app/ConnectedReviewImages.tsx',key=>key==='react'?React:key.includes('after-sale-client')?c:key==='./user-api-location'?{apiBaseUrl:()=> 'http://127.0.0.1:3002/api/v1'}:{ConnectedFiles:()=>null});
  const review={id,status:'PUBLIC',refund_label:'FULLY_REFUNDED',images:[{file_id:file,content_path:`/api/v1/files/review-images/${id}/${file}/content`}]};
  const html=renderToStaticMarkup(React.createElement(component.ConnectedReviewImages,{review}));assert.match(html,/127.0.0.1:3002/u);assert.match(html,/服务端确认全额退款/u);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(component.ConnectedReviewImages,{review:{...review,status:'HIDDEN'}})),/<img/u);
});
test('confirmed Web write remains successful when subsequent history refresh fails',async()=>{
  let written=false,writes=0;
  const h=harness(async(path,init={})=>{if(init.method==='POST'){writes++;written=true;return{operation_result:{version:8},current_case:{...row,version:8,available_actions:[]}};}if(path.includes('/history')){if(written)throw new Error('synthetic read failure');return{items:[],next_after_version:null};}if(path.startsWith('/orders/'))return{id:row.order_id,paid_amount_cent:'20000',fulfillment_evidence:[]};return{...row,available_actions:['ACCEPT_DECISION']};});
  await h.flush();h.button('接受当前裁决').props.onClick();await h.flush();h.button('核对并准备提交').props.onClick();await h.flush();h.button('确认提交案件操作').props.onClick();await h.flush();
  assert.equal(writes,1);assert.match(h.text(),/操作已成功，后续视图刷新失败/u);assert.equal(h.button('确认提交案件操作'),undefined);h.dispose();
});
