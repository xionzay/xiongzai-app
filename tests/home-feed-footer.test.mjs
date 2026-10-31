import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
const code = ts.transpileModule(readFileSync(new URL('../app/HomeFeedFooter.tsx', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(onLoadMore, overrides={}) {
 const states=[],refs=[],effects=[],listeners=new Map(); let si=0,ri=0,ei=0;
 const root={scrollHeight:1000,clientHeight:500,scrollTop:500,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n)}};
 const react={useState:v=>{let i=si++;if(!(i in states))states[i]=v;return [states[i],n=>states[i]=n]},useRef:v=>refs[ri++]??=( {current:v}),useCallback:f=>f,useEffect:(f,d)=>{const i=ei++;if(!effects[i]||d.some((v,j)=>v!==effects[i].deps[j])){effects[i]?.clean?.();effects[i]={deps:d,clean:f()}}}};
 const scope={exports:{},require:n=>n==='react'?react:{jsx:React.createElement,jsxs:React.createElement},setTimeout,Date,Error};vm.runInNewContext(code,scope);
 const props={root:{current:root},active:true,hasMore:true,blocked:false,onLoadMore,...overrides};
 const render=()=>{si=ri=ei=0;return scope.exports.HomeFeedFooter(props)};
 render();
 return {states,root,props,render,fire:(n,e={})=>listeners.get(n)?.(e),cleanup:()=>effects.forEach(e=>e.clean?.()),listeners};
}
const settle=()=>new Promise(r=>setTimeout(r,350));
test('bottom wheel loads once despite repeated input; failure stays visible for explicit retry',async()=>{
 let calls=0;const h=harness(async()=>{calls++;throw new Error('offline')});
 for(let i=0;i<6;i++)h.fire('wheel',{deltaX:0,deltaY:80,deltaMode:0});
 assert.equal(calls,1);assert.equal(h.states[0],true);
 await settle();assert.equal(h.states[0],false);assert.equal(h.states[1],'offline');
 h.render();h.fire('wheel',{deltaX:0,deltaY:80,deltaMode:0});assert.equal(calls,1);h.cleanup();
});
test('short pull cancels; deliberate upward pull at bottom loads on release',async()=>{
 let calls=0;const h=harness(async()=>{calls++});
 const touch=y=>({touches:[{clientX:50,clientY:y}]});
 h.fire('touchstart',touch(300));h.fire('touchmove',touch(280));h.fire('touchend');assert.equal(calls,0);
 h.fire('touchstart',touch(300));h.fire('touchmove',touch(200));assert.equal(calls,0);h.fire('touchend');assert.equal(calls,1);
 await settle();h.cleanup();assert.equal(h.listeners.size,0);
});
test('history scrolling, no more rows, blocked and hidden screens never request',()=>{
 for(const props of [{hasMore:false},{blocked:true},{active:false},{}]){
 let calls=0;const h=harness(async()=>{calls++},props);if(!Object.keys(props).length)h.root.scrollTop=0;
 h.fire('wheel',{deltaX:0,deltaY:200,deltaMode:0});assert.equal(calls,0);h.cleanup();
 }
});
test('horizontal gesture and touch cancellation do not trigger a request',()=>{
 let calls=0;const h=harness(async()=>{calls++});
 h.fire('touchstart',{touches:[{clientX:50,clientY:300}]});h.fire('touchmove',{touches:[{clientX:150,clientY:200}]});h.fire('touchend');assert.equal(calls,0);
 h.fire('touchstart',{touches:[{clientX:50,clientY:300}]});h.fire('touchmove',{touches:[{clientX:50,clientY:200}]});h.fire('touchcancel');h.fire('touchend');assert.equal(calls,0);h.cleanup();
});
