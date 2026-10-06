import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';

function load(file,modules={},append='') {
 const exports={}; const context={exports,React,Error,crypto:webcrypto,require:key=>modules[key]??{}};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8')+append,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
 return exports;
}
function hooks(initial=[]) {
 const state=[...initial],refs=[];let cursor=0,refCursor=0;
 return {state,reset(){cursor=refCursor=0},react:{...React,useEffect(){},useState(value){const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next]},useRef(value){const i=refCursor++;return refs[i]??(refs[i]={current:value})}}};
}
const {CartoonIcon}=load('app/ui/CartoonIcon.tsx');
const {ThemedFilePicker}=load('app/ui/ThemedFilePicker.tsx',{'./CartoonIcon':{CartoonIcon}});
const fixtures=[];
const fixture=(name,node)=>fixtures.push({name,html:renderToStaticMarkup(node)});
function elements(node,type){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(x=>elements(x,type));return [...(node.type===type?[node]:[]),...elements(node.props?.children,type)]}

 test('themed file picker retains native selection, multiple, accept, disabled and the original change handler',()=>{
 const callback=()=>{};
 const node=ThemedFilePicker({children:'选择图片 / 视频','aria-label':'选择证据文件',accept:'image/png,video/mp4',multiple:true,disabled:true,onChange:callback});
 const [input]=elements(node,'input');assert.equal(input.props.type,'file');assert.equal(input.props.onChange,callback);assert.equal(input.props.multiple,true);assert.equal(input.props.disabled,true);assert.equal(input.props.accept,'image/png,video/mp4');assert.equal(input.props['aria-label'],'选择证据文件');
 fixture('附件选择（测试控件，不上传）',React.createElement(ThemedFilePicker,{'aria-label':'测试附件选择',accept:'image/png',multiple:true},'选择图片'));
});
 test('coupon data and locked duplicate actions survive the themed control change',async()=>{
 const h=hooks(),m=load('app/ProductDecisionPages.tsx',{'react':h.react,'./ui/CartoonIcon':{CartoonIcon},'./ui/ThemedFilePicker':{ThemedFilePicker}});
 let calls=0,resolve;
 const row={id:'test-only',title:'测试券（隔离数据）',thresholdCent:'10000',discountCent:'1000',expiresAt:'测试日期',claimed:false};
 const api={coupons:{list:()=>{calls++;return new Promise(r=>resolve=r)},claim:async()=>({...row,claimed:true})}};
 const render=()=>{h.reset();return m.CouponCenter({back(){},api})};
 const initial=render(),loadButton=elements(initial,'button').find(b=>b.props.className==='toon-action');
 const pending=loadButton.props.onClick();loadButton.props.onClick();assert.equal(calls,1);resolve([row]);await new Promise(r=>setImmediate(r));
 const loaded=render();assert.match(renderToStaticMarkup(loaded),/测试券/);fixture('领券分支（隔离测试数据）',loaded);
 const claim=elements(loaded,'button').find(b=>b.props.className?.includes('toon-action-primary'));claim.props.onClick();await new Promise(r=>setImmediate(r));assert.equal(h.state[0][0].claimed,true);assert.match(renderToStaticMarkup(render()),/已领取/);
});
 test('coupon picker preserves null opt-out, quote callback, ineligible disabling and error retry',async()=>{
 const quote={quoteId:'test',payableCent:'9000',discountCent:'1000',selectedCouponId:'a',coupons:[{id:'a',title:'测试可用券',discountCent:'1000',eligible:true},{id:'b',title:'测试不可用券',discountCent:'2000',eligible:false,reason:'未达到门槛'}]};
 const h=hooks([true,quote,false,'']),m=load('app/OrderCouponPicker.tsx',{react:h.react});let passed,onQuote;
 const api=async id=>{passed=id;return {...quote,selectedCouponId:id,discountCent:'0'}};
 const render=()=>{h.reset();return m.OrderCouponPicker({quote,api,onQuote:q=>onQuote=q})};
 const node=render();fixture('订单选券分支（隔离测试数据）',node);
 const all=elements(node,'button');assert.equal(all.find(b=>b.props['aria-pressed']===false&&b.key==='b').props.disabled,true);
 all.find(b=>b.props.children==='不使用优惠券').props.onClick();await new Promise(r=>setImmediate(r));assert.equal(passed,null);assert.equal(onQuote.selectedCouponId,null);
 h.state[3]='测试核价失败';const failed=render();fixture('订单选券失败（隔离测试数据）',failed);const retry=elements(failed,'button').find(b=>b.props.children==='重试核价');assert.equal(retry.props.className,'toon-action');retry.props.onClick();await new Promise(r=>setImmediate(r));assert.equal(passed,null);
});
 test('feedback failure retains text and themed retry invokes the existing submit adapter',async()=>{
 const h=hooks(['测试建议',[],'write',null,'测试提交失败',false]);let text;
 const m=load('app/ProductDecisionPages.tsx',{react:h.react,'./ui/CartoonIcon':{CartoonIcon}});
 const node=m.FeedbackPage({back(){},api:{feedback:{submit:async value=>{text=value;throw new Error('测试失败')},list:async()=>[]}}});fixture('反馈失败（隔离测试数据）',node);
 const retry=elements(node,'button').find(b=>b.props.children==='重试');assert.equal(retry.props.className,'toon-action');retry.props.onClick();await new Promise(r=>setImmediate(r));assert.equal(text,'测试建议');assert.equal(h.state[0],'测试建议');assert.equal(h.state[4],'测试失败');
});
 test('attachment read failure keeps the real retry callback',()=>{
 let called=0; const m=load('app/trade-v31/TradeWorkspace.tsx',{'./preview-storage':{usePreviewFile:()=>({error:'测试读取失败',retry:()=>called++})}},'\nexport {EvidenceMedia};');
 const node=m.EvidenceMedia({file:{id:'test',name:'测试图片',kind:'image',digest:'test'}});fixture('附件读取失败（隔离测试数据）',node);const [retry]=elements(node,'button');assert.equal(retry.props.className,'toon-action');retry.props.onClick();assert.equal(called,1);
});
 test('media picker covers picture, video and audio without changing the selected file or send protocol',()=>{
 for(const [selected,accept] of [['图片','image/*'],['视频','video/*'],['语音','audio/*']]){
  const h=hooks([true,selected,null,null,'',false]),m=load('app/ProductDecisionPages.tsx',{react:h.react,'./ui/CartoonIcon':{CartoonIcon},'./ui/ThemedFilePicker':{ThemedFilePicker}});
  const node=m.ChatPlusPanel({});const picker=elements(node,ThemedFilePicker)[0];assert.equal(picker.props.accept,accept);const file={name:'测试文件'};picker.props.onChange({target:{files:[file]}});assert.equal(h.state[3],file);
  fixture('聊天'+selected+'选择（隔离控件，未接通发送）',node);assert.match(renderToStaticMarkup(node),/不会发送给对方/);
 }
});
 test('export isolated style fixtures using production components, with no business routes or live APIs',()=>{
 const css=['app/ui/cartoon.css','app/product-decisions.css'].map(p=>readFileSync(p,'utf8')).join('\n');
 const sections=fixtures.map(({name,html})=>`<section><h2>${name}</h2>${html}</section>`).join('');
 const document=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离控件样式验收</title><style>${css}\n*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui;color:#203a57} .phone-shell{width:100%;padding:16px;background:linear-gradient(120deg,#b9eafd,#fff4cb);min-height:100vh}section{padding:12px 0;border-bottom:1px solid #719bb533}h1{font-size:20px}h2{font-size:17px}.toon-action{margin:4px 0}</style><div class="phone-shell" data-page-palette="buyer"><h1>隔离组件测试</h1><p>以下为明确标识的测试数据，无真实领取、核价、反馈提交和发送能力。仅用于验证生产组件的状态外观。</p>${sections}</div></html>`;
 writeFileSync('docs/user-ui-style-fix-2026-10-05/isolated-controls.html',document.replaceAll('href="/assets/','href="http://127.0.0.1:3001/assets/'));
});
