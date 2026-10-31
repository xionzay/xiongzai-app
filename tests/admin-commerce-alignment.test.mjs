import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { commerceContract } from "./helpers/commerce-contract.mjs";

const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const display = {exports:{},require:()=>commerceContract};
vm.runInNewContext(compile(readFileSync("app/admin/commerce-display.ts","utf8")),display);
const {commerceValueLabels,canReadAndGovern}=display.exports;
const pageSource=readFileSync("app/admin/page.tsx","utf8");
const ast=ts.createSourceFile("page.tsx",pageSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functionSource=name=>ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name).getText(ast);

test('case file metadata and review image details use controlled admin previews without granting public sharing',()=>{
  const context={SENSITIVE_KEY:/secret|token|password/i,FIELD_LABELS:{}};
  vm.runInNewContext(compile(functionSource('detailMediaReferences'))+';this.extract=detailMediaReferences;',context);
  assert.equal(context.extract({id:'file-1',file_type:'COMPLAINT_EVIDENCE',mime_type:'image/png'})[0].fileId,'file-1');
  assert.equal(context.extract({id:'review',images:[{file_id:'review-file',content_path:'/api/v1/files/review-images/r/f/content'}]})[0].fileId,'review-file');
  assert.equal(context.extract({id:'user',phone:'not-a-file'}).length,0);
});

test("known commerce enums reuse the shared Chinese game names; seconds retain exact meaning",()=>{
  for(const [game,label]of Object.entries(commerceContract.productGameLabels))assert.equal(commerceValueLabels[game],label);
  for(const key of ["SINGLE","MULTI","IMAGE","VIDEO","ORDER_FULFILLMENT_IMAGE","ORDER_FULFILLMENT_VIDEO"])assert.ok(commerceValueLabels[key]);
  assert.equal(commerceContract.fulfillmentDurationLabel(90061),"付款后 1天1小时1分钟1秒内");
  assert.equal(commerceContract.fulfillmentDurationLabel(null),"旧预约规则");
  assert.equal(commerceContract.fulfillmentDurationLabel(0),"完成时限无效");
  const labels={...commerceValueLabels};
  const context={VALUE_LABELS:labels,statusLabel:v=>v,cents:v=>String(v),time:v=>v,safeText:v=>String(v),fulfillmentDurationLabel:commerceContract.fulfillmentDurationLabel};
  vm.runInNewContext(compile(functionSource("fieldValueLabel"))+";this.format=fieldValueLabel;",context);
  for(const [game,label]of Object.entries(commerceContract.productGameLabels))assert.equal(context.format("game",game),label);
  assert.equal(context.format("game","UNKNOWN_GAME"),"未识别类型（UNKNOWN_GAME）");
});

test("review images have the same Chinese purpose in file management and generic details",()=>{
  assert.equal(commerceValueLabels.REVIEW_IMAGE,"评价图片");
  const source=readFileSync("app/admin/file-management.tsx","utf8");
  const fileAst=ts.createSourceFile("file-management.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const labels=fileAst.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>declaration.name.getText(fileAst)==="fileTypeLabels"));
  const format=fileAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="fileTypeLabel");
  const context={commerceValueLabels};
  vm.runInNewContext(compile(labels.getText(fileAst)+"\n"+format.getText(fileAst))+";this.format=fileTypeLabel;",context);
  assert.equal(context.format("REVIEW_IMAGE"),"评价图片");
  assert.equal(context.format("PRODUCT_IMAGE"),"商品图片");
  assert.equal(context.format("UNKNOWN_FILE_PURPOSE"),"其他业务文件");
  const details={VALUE_LABELS:commerceValueLabels,statusLabel:value=>value,cents:String,time:String,safeText:String,fulfillmentDurationLabel:commerceContract.fulfillmentDurationLabel};
  vm.runInNewContext(compile(functionSource("fieldValueLabel"))+";this.format=fieldValueLabel;",details);
  assert.equal(details.format("file_type","REVIEW_IMAGE"),"评价图片");
  assert.equal(details.format("file_type","UNKNOWN_FILE_PURPOSE"),"未识别类型（UNKNOWN_FILE_PURPOSE）");
});

test("draft and submit gates are separate, optional voice does not create a submission requirement",()=>{
  assert.deepEqual(Array.from(commerceContract.sellerApplicationMissingFields({})),["seller_avatar_file_id","introduction","preferred_mode"]);
  assert.equal(commerceContract.sellerApplicationMissingFields({seller_avatar_file_id:"synthetic",introduction:"本地测试",preferred_mode:"商品服务"}).length,0);
});

test("Web onboarding saves real file references with CAS, normalizes optional fields and never retries a failed write as create",async()=>{
  const model={exports:{}};vm.runInNewContext(compile(readFileSync("app/storefront/model.ts","utf8")),model);
  const helper={exports:{},require:name=>name.includes("commerce")?commerceContract:model.exports};
  vm.runInNewContext(compile(readFileSync("app/seller-onboarding.ts","utf8")),helper);
  const fields={seller_nickname:"本地测试店铺",seller_avatar_file_id:null,cover_file_id:null,introduction:"",game_rank:"",kd:"",preferred_mode:"",play_style:"",game_experience:"",voice_file_id:null,voice_duration_ms:null};
  assert.equal(Object.keys(helper.exports.onboardingErrors(fields,false)).length,0);
  assert.deepEqual(Object.keys(helper.exports.onboardingErrors(fields,true)),["seller_avatar_file_id","introduction","preferred_mode"]);
  const calls=[];const request=async(path,init)=>{calls.push({path,method:init.method,body:JSON.parse(init.body)});return{id:"synthetic-seller",version:1};};
  await helper.exports.saveOnboardingDraft(request,fields,null);assert.equal(calls[0].method,"POST");assert.equal(calls[0].body.kd,null);assert.equal(calls[0].body.voice_file_id,null);
  const selected={...fields,seller_avatar_file_id:"synthetic-avatar",cover_file_id:"synthetic-cover",introduction:"本地介绍",preferred_mode:"和平精英"};
  await helper.exports.saveOnboardingDraft(request,selected,{id:"synthetic-seller",version:6});assert.equal(calls[1].method,"PATCH");assert.equal(calls[1].body.version,6);assert.equal(calls[1].body.seller_avatar_file_id,"synthetic-avatar");
  assert.equal(Object.keys(helper.exports.onboardingErrors(selected,true)).length,0);
  let rejected=0;await assert.rejects(helper.exports.saveOnboardingDraft(async()=>{rejected++;throw new Error("版本冲突");},selected,{id:"synthetic-seller",version:6}));assert.equal(rejected,1);
});

test("linked governance requires both existing read and mutation permissions",()=>{
  for(const [kind,read,write]of [["USER","user.read","user.status.manage"],["PRODUCT","product.read","product.review"],["SELLER_BAN","seller.read","seller.status.manage"]]){
    assert.equal(canReadAndGovern(new Set([write]),kind),false);
    assert.equal(canReadAndGovern(new Set([read]),kind),false);
    assert.equal(canReadAndGovern(new Set([read,write]),kind),true);
  }
});

function harness(request, permissions=new Set(["complaint.read","user.read","user.status.manage"])) {
  const hooks=[],effects=[];let cursor=0,dirty=true,tree,modal,successes=0,reloads=0;
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const useState=initial=>{const index=cursor++;hooks[index]??={value:initial};return[hooks[index].value,value=>{hooks[index].value=typeof value==="function"?value(hooks[index].value):value;dirty=true;}];};
  const useRef=initial=>{const index=cursor++;return hooks[index]??={current:initial};};
  const useEffect=(effect,deps)=>{const index=cursor++;if(!equal(hooks[index]?.deps,deps)){hooks[index]?.cleanup?.();const item={deps};hooks[index]=item;effects.push(()=>{item.cleanup=effect();});}};
  class ApiError extends Error {constructor(message,code,status,requestId=null){super(message);Object.assign(this,{code,status,requestId});}}
  const row={id:"complaint-1",complaint_no:"LOCAL-COMPLAINT",target_user_id:"user-1",order_id:"order-1",status:"SUBMITTED"};
  const collection={rows:[row],state:"success",reload:()=>{reloads++;}};
  const context={exports:{},require:()=>jsx,useState,useRef,useEffect,useMemo:f=>f(),useApiCollection:()=>collection,canReadAndGovern,
    adminApiRequest:request,AdminApiError:ApiError,adminFailure:e=>({state:"error",message:e.message,requestId:e.requestId}),
    safeText:v=>String(v??"—"),statusLabel:v=>v,cents:v=>String(v),recordOf:v=>v,styles:{},window:{setTimeout,clearTimeout},AbortController,
    PageTitle:"PageTitle",Toolbar:"Toolbar",TableShell:"TableShell",StatusBadge:"StatusBadge",RowActions:"RowActions",DetailButton:"DetailButton",DataStateView:"DataStateView"};
  vm.runInNewContext(compile(functionSource("AfterSaleModule"))+";exports.Component=AfterSaleModule;",context);
  const props={kind:"complaint",canManage:false,permissions,setDetail(){},setModal:value=>{modal=value;},runAction:async(action,{reload})=>{try{await action();await reload();successes++;}catch(error){if(error.status===409)await reload();throw error;}}};
  const render=()=>{cursor=0;tree=context.exports.Component(props);dirty=false;while(effects.length)effects.shift()();};
  const nodes=()=>{const all=[];function walk(value){if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=="object")return;if(value.type){all.push(value);walk(value.props?.children);walk(value.props?.extra);for(const row of value.props?.rows??[])walk(row.cells);}}walk(tree);return all;};
  return{ApiError,get modal(){return modal;},get successes(){return successes;},get reloads(){return reloads;},nodes,
    button:label=>nodes().find(n=>n.type==="button"&&n.props.children===label),
    async flush(){for(let i=0;i<6;i++){if(dirty)render();await new Promise(r=>setTimeout(r,2));}if(dirty)render();},
    switchQuery(value){nodes().find(n=>n.type==="Toolbar").props.setQuery(value);},
    dispose(){hooks.forEach(item=>item?.cleanup?.());},};
}

test("mutation-only role has no governance or unauthorized order entry and does not read the target",async()=>{
  let reads=0;const h=harness(async()=>{reads++;},new Set(["complaint.read","user.status.manage"]));await h.flush();
  assert.equal(h.button("禁用用户"),undefined);assert.equal(h.button("关联订单"),undefined);assert.equal(reads,0);h.dispose();
});

for(const status of [401,403,0,503])test(`linked target failure ${status} is visible, retryable and never opens a success dialog`,async()=>{
  let h;h=harness(async()=>{throw new h.ApiError("本地测试读取失败","READ_FAILED",status);});await h.flush();
  h.button("禁用用户").props.onClick();await h.flush();assert.equal(h.modal,undefined);assert.equal(h.successes,0);
  assert.ok(h.nodes().some(n=>n.props?.role==="alert"));assert.ok(h.button("重新读取关联对象"));h.dispose();
});

test("duplicate target clicks read once, and closing the confirmation cannot write",async()=>{
  let resolve,reads=0,writes=0;const h=harness((path,init)=>{if(init?.method){writes++;return{};}reads++;return new Promise(r=>{resolve=r;});});await h.flush();
  h.button("禁用用户").props.onClick();h.button("禁用用户").props.onClick();assert.equal(reads,1);
  resolve({status:"NORMAL",version:3});await h.flush();assert.equal(h.modal.reasonRequired,true);assert.equal(h.modal.danger,true);assert.equal(writes,0);h.dispose();
});

test("409 reads the latest target and requires a new explicit confirmation using the new version",async()=>{
  let reads=0;const versions=[];let h;h=harness(async(path,init)=>{if(!init?.method)return{status:"NORMAL",version:++reads===1?3:4};versions.push(JSON.parse(init.body).version);if(versions.length===1)throw new h.ApiError("版本冲突","VERSION_CONFLICT",409);return{};});
  await h.flush();h.button("禁用用户").props.onClick();await h.flush();await assert.rejects(h.modal.onConfirm("隔离测试初次处罚"));
  assert.deepEqual(versions,[3]);assert.equal(h.successes,0);assert.match(h.modal.note,/版本 4/);
  await h.modal.onConfirm("重新核对后确认处罚");assert.deepEqual(versions,[3,4]);assert.equal(h.successes,1);h.dispose();
});

test("switching the query or leaving the module discards a late target response",async()=>{
  for(const leave of [false,true]){let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));await h.flush();h.button("禁用用户").props.onClick();
    if(leave)h.dispose();else{h.switchQuery("下一张投诉");await h.flush();}
    resolve({status:"NORMAL",version:9});await h.flush();assert.equal(h.modal,undefined);h.dispose();}
});
