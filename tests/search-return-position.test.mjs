import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';

const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('function SearchResultsScreen('), source.indexOf('const homeAnnouncements'));
const compiled = ts.transpileModule(component + '\nexports.Screen = SearchResultsScreen;', {compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function mount(snapshot, key, loading = false) {
  let cursor = 0, tree; const slots = [], effects = [];
  const hook = initial => {const i=cursor++; if (!(i in slots)) slots[i]=initial; return i;};
  const props = {stateKey:key,listState:{read:()=>snapshot.value,write:value=>snapshot.value=value},query:'game',scope:'服务',serviceItems:[],companionItems:[],loading};
  const scope = {exports:{},React,SearchToolbar(){},SortBar(){},LoadingState(){},ContextStateScreen(){},
    useState(initial){const i=hook(initial);return [slots[i],value=>slots[i]=value];},
    useRef(initial){const i=hook({current:initial});return slots[i];},
    useLayoutEffect(fn){effects.push(fn);}
  };
  vm.runInNewContext(compiled,scope);
  const node={scrollTop:0};
  const render=()=>{cursor=0;effects.length=0;tree=scope.exports.Screen(props);tree.props.ref.current=node;effects.forEach(fn=>fn());return tree;};
  render();
  return {node,props,render,sort:()=>React.Children.toArray(tree.props.children)[2],scroll(top){node.scrollTop=top;tree.props.onScroll();}};
}
test('search return restores price direction and reading position after detail unmount',()=>{
  const state={value:{key:'viewer:game',sort:'综合',direction:'desc',scroll:0}};
  let h=mount(state,'viewer:game');h.sort().props.onSelect('价格');h.render();h.sort().props.onSelect('价格');h.render();h.scroll(280);
  h=mount(state,'viewer:game');assert.equal(h.sort().props.active,'价格');assert.equal(h.sort().props.direction,'desc');assert.equal(h.node.scrollTop,280);
  h.scroll(310);h.render();assert.equal(h.node.scrollTop,310,'updates must not snap back');
});
test('a new search or different viewer starts at the top with default sorting',()=>{
  const state={value:{key:'viewer:game',sort:'价格',direction:'asc',scroll:280}};
  for(const key of ['viewer:new-query','another-viewer:game']){const h=mount(state,key);assert.equal(h.node.scrollTop,0);assert.equal(h.sort().props.active,'综合');}
});
test('restore waits for results; sorting intentionally returns to the start',()=>{
  const state={value:{key:'viewer:game',sort:'价格',direction:'desc',scroll:280}};
  const h=mount(state,'viewer:game',true);assert.equal(h.node.scrollTop,0);
  h.props.loading=false;h.render();assert.equal(h.node.scrollTop,280);
  h.sort().props.onSelect('销量');h.render();assert.equal(h.node.scrollTop,0);assert.equal(state.value.scroll,0);
});
