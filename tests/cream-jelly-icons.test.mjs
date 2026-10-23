import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const manifest=JSON.parse(readFileSync('public/assets/blue-yellow-jelly-v2/manifest.json','utf8'));
const activeManifest=JSON.parse(readFileSync('public/assets/cream-jelly-v3/manifest.json','utf8'));
const currentManifest=JSON.parse(readFileSync('public/assets/reference-jelly-v5/manifest.json','utf8'));
const moduleExports={};
vm.runInNewContext(ts.transpileModule(readFileSync('app/ui/CartoonIcon.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,{exports:moduleExports,React});

test('archived jelly assets remain intact and matching native copies remain available',()=>{
 assert.equal(new Set(manifest.icons.map(icon=>icon.kind)).size,manifest.icons.length);
 assert.deepEqual(Array.from(moduleExports.creamJellyKinds).sort(),manifest.icons.map(icon=>icon.kind).sort());
 for(const icon of manifest.icons){
  const bytes=readFileSync(`public${icon.url}`);
  assert.equal(bytes.subarray(1,4).toString(),'PNG',icon.kind);
  assert.equal(bytes.readUInt32BE(16),512,icon.kind);
  assert.equal(bytes.readUInt32BE(20),512,icon.kind);
  assert.equal(bytes[25],6,`${icon.kind} preserves alpha`);
  assert.deepEqual(readFileSync(`apps/mobile/assets/blue-yellow-jelly-v2/${icon.kind}.png`),bytes,icon.kind);

 }
});
test('reference palette assets are transparent, mirrored to native, and retain unrelated originals',()=>{
 const replaced=new Set(['quick-match','app-rules','feedback','official-notices','order','message']);
 assert.equal(activeManifest.icons.length,45);
 for(const icon of activeManifest.icons){
  const bytes=readFileSync(`public${icon.url}`);
  assert.equal(bytes.readUInt32BE(16),512,icon.kind);
  assert.equal(bytes.readUInt32BE(20),512,icon.kind);
  assert.equal(bytes[25],6,icon.kind);
  assert.deepEqual(bytes,readFileSync(`apps/mobile/assets/cream-jelly-v3/${icon.kind}.png`),icon.kind);
  const previous=readFileSync(`public/assets/blue-yellow-jelly-v2/${icon.kind}.png`);
  if(replaced.has(icon.kind)) assert.notDeepEqual(bytes,previous,icon.kind);
  else assert.deepEqual(bytes,previous,icon.kind);
 }
});
test('existing semantic aliases keep navigation and selected rating artwork distinct',()=>{
 for(const [alias,canonical] of Object.entries({profile:'mine',review:'message',case:'shield',filter:'service',withdraw:'wallet',store:'home','mine-rules':'app-rules','home-flame':'flame','home-crown':'crown'})){
  assert.equal(moduleExports.creamJellyIconUrl(alias),moduleExports.creamJellyIconUrl(canonical));
 }
 assert.notEqual(moduleExports.creamJellyIconUrl('rating-outline'),moduleExports.creamJellyIconUrl('rating-filled'));
});

test('active UI renders all 45 approved material edits with accessible labels',()=>{
 assert.equal(currentManifest.icons.length,45);
 assert.deepEqual(currentManifest.icons.map(i=>i.kind).sort(),Array.from(moduleExports.creamJellyKinds).sort());
 for(const kind of moduleExports.creamJellyKinds){
  const html=renderToStaticMarkup(React.createElement(moduleExports.CartoonIcon,{kind,label:kind}));
  assert.ok(html.includes(`aria-label="${kind}"`),kind);
  assert.ok(html.includes('/assets/reference-jelly-v5/'),kind);
  for(const [,url] of html.matchAll(/href="([^"]+)"/g)) assert.ok(readFileSync(`public${url}`).length>0,kind);
 }
 for(const kind of ['home','order','message','mine']) {
  const html=renderToStaticMarkup(React.createElement(moduleExports.CartoonIcon,{kind}));
  assert.ok(html.includes(currentManifest.icons.find(i=>i.kind===kind).url),kind);
 }
 for(const kind of ['quick-match','coupon-center','app-rules','feedback','official-notices']) {
  assert.equal(moduleExports.creamJellyIconUrl(kind),currentManifest.icons.find(i=>i.kind===kind).url);
 }
 assert.equal(moduleExports.creamJellyIconUrl('flame'),'/assets/reference-jelly-v5/flame.png');
 assert.equal(moduleExports.creamJellyIconUrl('crown'),'/assets/reference-jelly-v5/crown.png');
});

test('current assets preserve alpha, stable IDs and native copies without sheet captions',()=>{
 for(const icon of currentManifest.icons){
  const bytes=readFileSync(`public${icon.url}`);
  assert.equal(bytes.readUInt32BE(16),512,icon.kind);
  assert.equal(bytes.readUInt32BE(20),512,icon.kind);
  assert.equal(bytes[25],6,icon.kind);
  assert.deepEqual(bytes,readFileSync(`apps/mobile/assets/reference-jelly-v5/${icon.url.split('/').pop()}`),icon.kind);
  if (!icon.artwork) assert.ok(icon.cell.height<340,'caption rows are excluded from older control crops');
 }
 const native=readFileSync('apps/mobile/src/components/tab-icons.tsx','utf8');
 assert.doesNotMatch(native,/tintColor|assets\/transparent-icons/);
 assert.match(native,/reference-jelly-v5/);
 const css=readFileSync('app/globals.css','utf8');
 for(const kind of ['home','order','message','mine']) assert.ok(css.includes(currentManifest.icons.find(i=>i.kind===kind).url));
});

test('decorative icons stay hidden from assistive technology while named icons retain semantics',()=>{
 for(const kind of ['home','order','message','mine','rating-outline','rating-filled']){
  const decorative=renderToStaticMarkup(React.createElement(moduleExports.CartoonIcon,{kind}));assert.match(decorative,/aria-hidden="true"/);assert.doesNotMatch(decorative,/role="img"|aria-label=/);
  const named=renderToStaticMarkup(React.createElement(moduleExports.CartoonIcon,{kind,label:'已确认设计图标'}));assert.match(named,/role="img"/);assert.match(named,/aria-label="已确认设计图标"/);assert.doesNotMatch(named,/aria-hidden="true"/);
 }
});

test('original labels keep wording and user text without jelly marks',()=>{
 const label=(text)=>renderToStaticMarkup(React.createElement(moduleExports.JellyLabel,{text}));
 for(const text of ['更多 ›','和平精英 ✓','聊天里的 ✓ 和 › 原样保留','商品 ×2']) assert.equal(label(text),text);
});

test('latest selected reference artwork keeps two-controller quick match separate from the single-controller sheet',()=>{
 assert.equal(currentManifest.icons.filter(icon=>icon.artwork==='exact-user-reference').length,17);
 assert.equal(currentManifest.icons.find(icon=>icon.kind==='quick-match').artwork,'approved-reference-double-controller');
 for(const kind of ['product','wallet','shield','favorite','setting','share','service','data','mine-wait']) {
  assert.deepEqual(readFileSync('public/assets/reference-jelly-v5/'+kind+'.png'),readFileSync('public/assets/blue-yellow-jelly-v2/'+kind+'.png'));
 }
});

test('coupon center, order and feedback restore only their original jelly silhouettes',()=>{
 const restored=['coupon-center','order','feedback'];
 for(const kind of restored){
  const icon=currentManifest.icons.find(i=>i.kind===kind);
  assert.equal(icon.artwork,'original-shape-current-jelly');
  assert.equal(moduleExports.creamJellyIconUrl(kind),icon.url);
  assert.deepEqual(readFileSync(`public${icon.url}`),readFileSync(`public/assets/original-shape-jelly-v4/${kind}.png`));
 }
 for(const icon of currentManifest.icons.filter(i=>!restored.includes(i.kind))) {
  assert.equal(icon.url,`/assets/reference-jelly-v5/${icon.kind}.png`);
 }
});
