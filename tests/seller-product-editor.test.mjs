import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const cjsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/seller-workbench/product-editor-model.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,cjsModule);
const { withSpecIds, replaceDimensions, specErrors, productErrors, priceRange, unitSummary } = cjsModule.exports;
const fixture = () => withSpecIds({id:'p1',title:'陪玩',description:'介绍',cover:'/original.jpg',hours:'24',dimensions:[{name:'套餐',values:'体验,全程'},{name:'大区',values:'QQ区,微信区'}],variants:['体验 / QQ区','体验 / 微信区','全程 / QQ区','全程 / 微信区'].map((key,i)=>({id:`old-${i}`,key,price:String(10+i),stock:String(i)}))});
test('legacy migration retains images, IDs and each combination value; repeated migration is stable',()=>{
 const p=fixture(); assert.equal(p.cover,'/original.jpg'); assert.equal(p.variants[0].id,'old-0'); assert.equal(p.variants[0].stock,'0'); assert.equal(JSON.stringify(withSpecIds(p)),JSON.stringify(p));
});
test('rename, option reorder and dimension reorder preserve exact IDs, price and capacity',()=>{
 const p=fixture();
 const dimensions=[...p.dimensions].reverse().map(d=>({...d,name:`新${d.name}`,options:[...d.options].reverse().map(o=>({...o,label:`新${o.label}`}))}));
 const next=replaceDimensions(p,dimensions);
 for(const v of next.variants){const old=p.variants.find(r=>r.id===v.id);assert.ok(old);assert.equal(v.price,old.price);assert.equal(v.stock,old.stock);}
 assert.notEqual(next.variants[0].key,p.variants[0].key);
});
test('new options are blank; deleted then recreated labels cannot inherit an unrelated old SKU',()=>{
 const p=fixture(); const removed=replaceDimensions(p,p.dimensions.map((d,i)=>i?d:{...d,options:d.options.slice(1)}));
 assert.equal(removed.variants.length,2); assert.equal(removed.variants[0].id,'old-2');
 const recreated=replaceDimensions(removed,removed.dimensions.map((d,i)=>i?d:{...d,options:[...d.options,{id:'new-id',label:'体验'}]}));
 assert.equal(recreated.variants[2].price,''); assert.equal(recreated.variants[2].stock,'');assert.notEqual(recreated.variants[2].id,'old-0');
});
test('valid zero capacity, invalid empty, fractional capacity, price precision and overflow are reported per field',()=>{
 const p=fixture(); assert.equal(Object.keys(specErrors(p)).length,0);
 const bad={...p,variants:p.variants.map((v,i)=>({...v,price:['','0','1.234','900719925474099100'][i],stock:['','-1','1.2','9007199254740992'][i]}))};
 const errors=specErrors(bad); for(let i=0;i<4;i++){assert.ok(errors[`price-${i}`]);assert.ok(errors[`stock-${i}`]);assert.ok(errors[`price-${i}`].includes(bad.variants[i].key));}
});
test('blank and duplicate options are rejected without discarding original inputs',()=>{
 const p=fixture(); const next=replaceDimensions(p,p.dimensions.map((d,i)=>i?d:{...d,options:d.options.map(o=>({...o,label:'重复'}))}));
 assert.ok(specErrors(next)['option-0-0']); assert.equal(next.variants[0].price,'10');
 const blank=replaceDimensions(p,p.dimensions.map((d,i)=>i?d:{...d,options:d.options.map(o=>({...o,label:''}))}));assert.ok(specErrors(blank)['option-0-0']);
});
test('draft validation remains minimal while submission validates mandatory content, hours and specs',()=>{
 const p={...fixture(),description:'',hours:'0',variants:[]};assert.equal(Object.keys(productErrors(p,false)).length,0);
 const errors=productErrors(p,true);assert.ok(errors.description);assert.ok(errors.hours);assert.ok(errors.specs);
 assert.ok(productErrors({...p,title:''},false).title);
});
test('price ranges and units are derived without inventing price or unit',()=>{
 const p=fixture();assert.equal(priceRange(p),'¥10.00–13.00');assert.equal(unitSummary(p),' · 单位见规格');
 assert.equal(unitSummary({...p,variants:p.variants.map(v=>({...v,unit:'局'}))}),' / 局');
 assert.equal(unitSummary({...p,variants:[{price:'1',unit:'局'},{price:'2',unit:'小时'}]}),' · 单位见规格');
 assert.equal(priceRange({...p,variants:[{price:''},{price:'-1'}]}),'待设置价格');
});
test('combination limit remains 100 with a detectable overflow sentinel',()=>{
 const p=fixture();const dimensions=p.dimensions.map((d,i)=>({...d,options:Array.from({length:11},(_,j)=>({id:`${i}-${j}`,label:`${j}`}))}));
 const next=replaceDimensions(p,dimensions);assert.equal(next.variants.length,101);assert.ok(specErrors(next).specs);
});
test('failed local persistence rejects without changing the original products; retry is an upsert',async()=>{
 const existing=fixture(), before=JSON.stringify(existing), changed={...existing,title:'更新标题'};
 await assert.rejects(cjsModule.exports.persistProductChange(changed,[existing],async()=>{throw new Error('quota');}),/quota/);
 assert.equal(JSON.stringify(existing),before);
 let saved;
 const next=await cjsModule.exports.persistProductChange(changed,[existing],async(key,value)=>{assert.equal(key,'merchant-products');saved=value;});
 assert.equal(next.length,1);assert.equal(next[0].title,'更新标题');assert.equal(saved,next);
 const retry=await cjsModule.exports.persistProductChange(changed,next,async()=>{});assert.equal(retry.length,1);
});
test('image constraints preserve the existing PNG/JPEG/WebP 5MB limit',()=>{
 for(const type of ['image/png','image/jpeg','image/webp'])assert.equal(cjsModule.exports.coverFileError({type,size:5*1024*1024}),'');
 assert.ok(cjsModule.exports.coverFileError({type:'image/gif',size:100}));assert.ok(cjsModule.exports.coverFileError({type:'image/png',size:5*1024*1024+1}));
});
