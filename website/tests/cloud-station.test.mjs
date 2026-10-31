import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../app/LaunchBackdrop.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(reduced=false,fine=true){
 const listeners=new Map(),frames=new Map(),properties=new Map();let dispose,observer,next=0;
 const target=()=>({addEventListener(t,f){listeners.set(this,{...listeners.get(this),[t]:f})},removeEventListener(t){delete listeners.get(this)?.[t]}});
 const platform={style:{setProperty:(k,v)=>properties.set(k,v)}};
 const section={...target(),getBoundingClientRect:()=>({left:0,top:0,width:1200,height:900}),querySelector:()=>platform};
 const layer={parentElement:section,style:{setProperty:(k,v)=>properties.set(k,v)}};
 const document={...target(),hidden:false},window=target();
 const motion={...target(),matches:reduced},pointer={...target(),matches:fine};
 const exports={};
 vm.runInNewContext(compiled,{exports,document,window,matchMedia:q=>q.includes('reduced')?motion:pointer,
  requestAnimationFrame:fn=>{frames.set(++next,fn);return next},cancelAnimationFrame:id=>frames.delete(id),
  IntersectionObserver:class{constructor(cb){observer={cb,disconnected:false}}observe(){}disconnect(){observer.disconnected=true}},
  require:n=>n==='react'?{useRef:()=>({current:layer}),useEffect:fn=>{dispose=fn()}}:n==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:{default:{}}
 });
 exports.default();
 const emit=(o,t,e)=>listeners.get(o)[t](e);
 return {properties,frames,visible:v=>observer.cb([{isIntersecting:v}]),move:()=>emit(section,'pointermove',{pointerType:'mouse',clientX:1200,clientY:900}),
  hidden:v=>{document.hidden=v;emit(document,'visibilitychange')},reduce:v=>{motion.matches=v;emit(motion,'change')},
  tick:()=>{const a=[...frames.values()];frames.clear();a.forEach(f=>f())},
  cleanup:()=>{dispose();assert(observer.disconnected);assert.equal(frames.size,0);assert([...listeners.values()].every(e=>Object.keys(e).length===0))}
 };
}
for(const [reduced,fine] of [[false,true],[true,true],[false,false]]){
 test(`cloud parallax respects visibility, motion preferences and cleanup: ${reduced}/${fine}`,()=>{
  const h=harness(reduced,fine);h.move();assert.equal(h.frames.size,0);h.visible(true);h.move();
  for(let n=0;n<100;n++)h.tick();
  assert.equal(h.frames.size,0,'settled pointer must not run an endless frame loop');
  if(!reduced&&fine)assert(parseFloat(h.properties.get('--space-x'))>8);
  h.move();h.visible(false);assert.equal(h.frames.size,0);h.visible(true);h.hidden(true);assert.equal(h.frames.size,0);
  h.hidden(false);h.reduce(true);assert.equal(h.frames.size,0);assert.equal(parseFloat(h.properties.get('--bear-x')),0);h.cleanup();
 });
}
test('launch uses bounded, independent scenery and no particle canvas',()=>{
 assert(!source.includes('CosmicCanvas'));assert(!source.includes('data-launch-decoration'));assert(source.includes('data-cloud-station'));
 const sizes=['launch-cloud-bank-v1.webp','launch-cloud-sea-v1.webp'].map(n=>fs.statSync(new URL(`../public/assets/${n}`,import.meta.url)).size);
 assert(sizes.reduce((a,b)=>a+b,0)<250000);
 const css=fs.readFileSync(new URL('../app/launch-backdrop.module.css',import.meta.url),'utf8');
 assert(!css.includes('filter:'));assert(css.includes('prefers-reduced-motion'));assert(css.includes('max-width: 700px'));
});
test('launch bear floats without a platform or contact-shadow layer',()=>{
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../app/official-redesign.module.css',import.meta.url),'utf8');
 assert(!page.includes('LaunchPlatform'));assert(!source.includes('launch-observatory'));
 assert(page.includes('data-launch-bear'));assert(!css.includes('.launchScene::before'));
 assert(css.includes('@keyframes launchBearHover'));assert(css.includes('.launchMascot { animation: none !important; transform: none; }'));
});
