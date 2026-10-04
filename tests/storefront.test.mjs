import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/storefront/model.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { cropRect, profileFields, revisionPayload, validateProfile, priceLabel } = context.exports;
const draft = { seller_nickname:'测试陪玩',seller_avatar_file_id:'avatar',cover_file_id:null,introduction:'测试介绍',game_rank:'王牌',kd:'4.20',preferred_mode:'经典模式',play_style:'稳健',game_experience:'五年',voice_file_id:'voice',voice_duration_ms:15000 };
test('profile payload excludes private fields and preserves original media bindings', () => { const value = profileFields({ ...draft, user_id:'private', phone:'secret', status:'APPROVED' }); assert.equal(value.voice_file_id,'voice'); assert.equal(value.cover_file_id,null); assert.equal('phone' in value,false); assert.equal('user_id' in value,false); });
test('draft CAS is sent only when updating a mutable revision; rejection starts a new revision', () => { const seller = {...draft,version:7}; assert.equal(revisionPayload(draft,seller,{status:'DRAFT',version:3}).application_version,3); assert.equal(revisionPayload(draft,seller,{status:'REJECTED',version:4}).application_version,undefined); assert.equal(revisionPayload(draft,seller).seller_version,7); });
test('field errors name incomplete required data and invalid KD without changing input', () => { const value={...draft,seller_nickname:'a',kd:'-1',voice_file_id:null}; const errors=validateProfile(value,true); assert.ok(errors.seller_nickname && errors.kd); assert.equal(errors.voice_file_id, undefined); assert.equal(value.kd,'-1'); assert.equal(Object.keys(validateProfile(draft,true)).length,0); });
test('landscape and portrait crops keep fixed ratio within bounds, including zoom and edge positions', () => { for (const [w,h] of [[4000,3000],[1000,4000],[300,100]]) for(const zoom of [1,2,3]) for(const x of [0,.5,1]) {const r=cropRect(w,h,2.75,zoom,x,1); assert.ok(r.x>=0 && r.y>=0); assert.ok(r.x+r.width<=w+.001 && r.y+r.height<=h+.001); assert.ok(Math.abs(r.width/r.height-2.75)<.001);} });
test('price uses active SKU minimum and only says from when active prices vary', () => { const product={min_price_cent:'100',skus:[{status:'INACTIVE',price_cent:'100'},{status:'ACTIVE',price_cent:'2500',sku_name:'一小时',duration_minutes:60},{status:'ACTIVE',price_cent:'4500',sku_name:'两小时',duration_minutes:120}]}; const label=priceLabel(product);assert.equal(label.amount,'25.00');assert.equal(label.suffix,'起');assert.match(label.unit,/一小时/);assert.equal(priceLabel({...product,skus:product.skus.slice(0,2)}).suffix,''); });

test("voice card and player-only attributes are optional for shop profile submission",()=>{ const value={...draft,voice_file_id:null,voice_duration_ms:null,game_rank:null,kd:null,game_experience:null,play_style:null}; assert.deepEqual(Object.keys(validateProfile(value,true)),[]); });
