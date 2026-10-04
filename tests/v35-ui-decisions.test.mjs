import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
function load(path,deps={}){const c={exports:{},crypto:webcrypto,structuredClone,require:k=>deps[k]};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);return c.exports;}
const d=load('../app/product-decisions.ts'),c=load('../app/commerce-model.ts'),m=load('../app/trade-v31/model.ts'),a=load('../app/trade-v31/card-actions.ts',{'./model':m}),p=load('../app/seller-workbench/product-editor-model.ts');
test('exact four games; game and explicit companion offer both needed for matching',()=>{
 assert.deepEqual([...d.PRODUCT_GAMES],['和平精英','三角洲行动','王者荣耀','无畏契约']);
 assert.equal(d.publicGames('英雄联盟 其他游戏').length,0);assert.deepEqual([...d.publicGames('地铁逃生')],['和平精英']);
 assert(d.offersCompanion('和平精英陪玩'));assert(!d.offersCompanion('和平精英道具交易'));assert(!d.offersCompanion('只提供竞技陪练'));assert(!d.offersCompanion('一起开黑'));assert(!d.offersCompanion('不提供陪玩，只做剪辑'));
});
test('buyer groups preserve refunded and closed labels and pending refund is aftersale',()=>{
 const rows=[{status:'COMPLETED',payment_status:'REFUNDED',after_sale_status:'NONE'},{status:'CLOSED',payment_status:'CREATED',after_sale_status:'NONE'}];
 for(const r of rows){assert(c.matchesOrderTab(r,'已完成'));assert(!c.matchesOrderTab(r,'待评价'));assert.notEqual(c.commerceOrderLabel(r),'已完成')}
 const processing={status:'COMPLETED',payment_status:'REFUNDING',after_sale_status:'IN_PROGRESS'};assert(c.matchesOrderTab(processing,'售后中'));assert.equal(c.commerceOrderLabel(processing),'退款处理中');
 assert.deepEqual([...c.buyerOrderTabs],['全部','待付款','待服务','服务中','待收货','待评价','售后中','已完成']);
});
test('review requires permitted action and unexpired first-termination deadline, not a refreshed update time',()=>{
 const r={status:'COMPLETED',payment_status:'PAID',after_sale_status:'NONE',rule_version:'V3.1',available_actions:['CREATE_REVIEW'],review_deadline_at:new Date(Date.now()+60000).toISOString()};assert(c.matchesOrderTab(r,'待评价'));
 assert(!c.matchesOrderTab({...r,review_deadline_at:new Date(0).toISOString()},'待评价'));assert(!c.matchesOrderTab({...r,available_actions:[]},'待评价'));assert(!c.matchesOrderTab({...r,review_deadline_at:null},'待评价'));
});
test('single-price product starts with one stable SKU and retains price across reload',()=>{
 const row={id:'product',dimensions:[],variants:[]};const first=p.withSpecIds(row);assert.equal(first.variants.length,1);
 first.variants[0].price='12.34';const again=p.withSpecIds(first);assert.equal(again.variants[0].id,first.variants[0].id);assert.equal(again.variants[0].price,'12.34');
});
test('preview buyer cards at most three, with identical lawful actions across groups',()=>{
 const now=Date.now();for(const o of m.createSamples(now)){const action=a.buyerCardActions(o,now);assert(action.visible.length<=3);for(const tab of ['全部','待收货','待评价','售后中','已完成'])if(a.buyerMatchesTab(o,tab))assert.equal(JSON.stringify(a.buyerCardActions(o,now)),JSON.stringify(action));}
});
test('zero star rejected; anonymous/image payload persists without changing settlement',()=>{
 const now=Date.now(),o=m.createSamples(now).find(o=>o.stage==='review');assert(o);assert.throws(()=>m.transition(o,{type:'review',role:'buyer',stars:0,content:''},now),/评分/);
 const next=m.transition(o,{type:'review',role:'buyer',stars:4,content:'',anonymous:true,images:[{id:'i',name:'i',kind:'image'}]},now);assert.equal(next.review.anonymous,true);assert.equal(next.review.images.length,1);assert.equal(next.refunded,o.refunded);assert.equal(next.terminatedAt,o.terminatedAt);
});
test('official feedback and refund categories remain separate from ordinary order notices',()=>{
 assert.equal(d.noticeGroup({category:'PLATFORM',related_type:'FEEDBACK'}),'反馈');assert.equal(d.noticeGroup({category:'ORDER',related_type:'REFUND'}),'售后');assert.equal(d.noticeGroup({category:'ORDER'}),'订单');
});

test('single and multiple SKU purchases share a bottom sheet with quantity and exact total',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const context={exports:{},require:key=>key==='react'?{...React,useEffect(){},useId:()=> 'purchase-test',useRef:value=>({current:value})}:key==='react-dom'?{createPortal:node=>node}:key.endsWith('usePanelDismiss')?{usePanelDismiss:close=>({closing:false,dismiss:close})}:{CartoonIcon:()=>null}};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/PurchaseSpecSheet.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,{...context,React});
 const props={anchor:{current:{closest:()=>({})}},title:'单价商品',cover:'/test.png',seller:'测试店铺',specs:[{id:'single',name:'标准',priceCent:1234}],selected:0,onSelect(){},quantity:2,onQuantity(){},onClose(){},onConfirm(){}};
 const single=renderToStaticMarkup(context.exports.PurchaseSpecSheet(props));assert.match(single,/role="dialog"/);assert.match(single,/购买数量/);assert.match(single,/¥24.68/);assert.doesNotMatch(single,/role="group"/);
 const multi=renderToStaticMarkup(context.exports.PurchaseSpecSheet({...props,specs:[...props.specs,{id:'b',name:'加长',priceCent:2200}],selected:1}));assert.match(multi,/role="group"/);assert.match(multi,/加长/);assert.match(multi,/¥44.00/);
});
