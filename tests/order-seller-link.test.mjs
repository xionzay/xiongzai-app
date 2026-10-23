/* The image adapter is an isolated render fixture, not a public component. */
/* eslint-disable react/prop-types */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const deps={
 'react/jsx-runtime':await import('react/jsx-runtime'),
 '../CatalogImage':{CatalogImage:({src,fileId,alt,className})=>React.createElement('img',{src:src||'/assets/placeholders/player.svg','data-file-id':fileId,alt,className})},
 './CartoonIcon':{CartoonIcon:()=>React.createElement('svg',{'aria-hidden':true})},
};
const context={exports:{},require:name=>deps[name]};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/ui/OrderSellerLink.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
const {OrderSellerLink}=context.exports;
test('seller avatar and full name replace the shop suffix while retaining accessible navigation',()=>{
 const html=renderToStaticMarkup(OrderSellerLink({name:'晚风',avatarSrc:'/avatar.jpg',avatarFileId:'approved-file',onOpen:()=>{}}));
 assert.ok(html.includes('src="/avatar.jpg"'));assert.ok(html.includes('data-file-id="approved-file"'));
 assert.ok(html.includes('title="晚风">晚风</span>'));assert.ok(html.includes('aria-label="查看晚风的店铺主页"'));
 assert.ok(!html.includes('晚风的店铺</span>'));
});
test('shop clicks stop propagation before opening the exact seller, including duplicate names',()=>{
 const events=[];
 for (const id of ['seller-a','seller-b']) OrderSellerLink({name:'同名商家',onOpen:()=>events.push(id)}).props.onClick({stopPropagation:()=>events.push('stop')});
 assert.deepEqual(events,['stop','seller-a','stop','seller-b']);
});
test('missing avatar uses the shared fallback and long names remain complete',()=>{
 const name='长商家名字'.repeat(20);
 const html=renderToStaticMarkup(OrderSellerLink({name,onOpen:()=>{}}));
 assert.ok(html.includes('/assets/placeholders/player.svg'));assert.ok(html.includes(`title="${name}"`));
});
