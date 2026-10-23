import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

async function compile(file, deps, globals = {}) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const context = { exports: {}, React, require: name => {
    if (!(name in deps)) throw Error(name);
    return deps[name];
  }, ...globals };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context);
  return context.exports;
}
const historyModel = await compile('../app/search-history.ts', {});
const plain = value => JSON.parse(JSON.stringify(value));
function* nodes(node) {
  if (!React.isValidElement(node)) return;
  yield node;
  for (const child of React.Children.toArray(node.props.children)) yield* nodes(child);
}

test('search history records only submitted nonblank queries, deduplicates within a scope and caps entries', () => {
  let rows = historyModel.addSearchHistory([], { scope: '服务', query: '  ＡＢＣ  ' });
  rows = historyModel.addSearchHistory(rows, { scope: '服务', query: 'abc' });
  rows = historyModel.addSearchHistory(rows, { scope: '陪玩', query: 'abc' });
  assert.deepEqual(plain(rows), [{scope:'陪玩',query:'abc'},{scope:'服务',query:'abc'}]);
  assert.equal(historyModel.addSearchHistory(rows,{scope:'服务',query:'   '}), rows);
  for (let i=0; i<20; i++) rows = historyModel.addSearchHistory(rows,{scope:'服务',query:`关键词${i}`});
  assert.equal(rows.length, 10);
  assert.equal(rows[0].query, '关键词19');
});

test('stored search history tolerates corruption and rejects invalid records', () => {
  for (const raw of [null, '{broken', '{}', 'null']) assert.deepEqual(plain(historyModel.readSearchHistory(raw)), []);
  assert.deepEqual(plain(historyModel.readSearchHistory('[null,{}, {"scope":"服务","query":"和平精英"},{"scope":"bad","query":"x"},{"scope":"陪玩","query":5}]')), [{scope:'服务',query:'和平精英'}]);
});

test('search toolbar preserves composition, clear, edit and return behavior', async () => {
  const events = []; const refs = [];
  const mod = await compile('../app/SearchDiscovery.tsx', {
    react: { useEffect(){}, useState(){}, useRef: value => { const ref = {current:value}; refs.push(ref); return ref; } },
    './ui/CartoonIcon': { CartoonIcon(){} }, './search-history': historyModel,
  });
  const tree = mod.SearchToolbar({ query:'和平精英', onBack:()=>events.push('back'), onSubmit:()=>events.push('submit'), onChange:value=>events.push(value) });
  const all = [...nodes(tree)]; const input = all.find(n=>n.type==='input');
  input.props.onCompositionStart(); tree.props.onSubmit({preventDefault(){}});
  assert.deepEqual(events, []);
  input.props.onCompositionEnd(); tree.props.onSubmit({preventDefault(){}});
  assert.deepEqual(events, ['submit']);
  input.props.onChange({target:{value:'三角洲行动'}});
  all.find(n=>n.props['aria-label']==='清除搜索关键词').props.onClick();
  all.find(n=>n.props['aria-label']==='返回').props.onClick();
  assert.deepEqual(events, ['submit','三角洲行动','','back']);
  let prevented = false;
  input.props.onKeyDown({key:'Enter',nativeEvent:{isComposing:true},preventDefault(){prevented=true;}});
  assert.equal(prevented, true);
});

test('keyword selection remembers its scope, history can be replayed and cleared locally', async () => {
  let cursor=0; const states=[]; const saved=new Map(); const opened=[];
  const mod = await compile('../app/SearchDiscovery.tsx', {
    react: { useEffect(){}, useRef:value=>({current:value}), useState(initial){ const i=cursor++; if(!(i in states)) states[i]=typeof initial === 'function' ? initial() : initial; return [states[i],value=>{states[i]=value;}]; } },
    './ui/CartoonIcon': { CartoonIcon(){} }, './search-history':historyModel,
  }, {localStorage:{setItem:(key,value)=>saved.set(key,value)}});
  const props={scope:'服务',query:'',onDraft(){},onSearch:(...args)=>opened.push(args),onBack(){},keywords:['和平精英'],historyKey:'isolated-test'};
  const render=()=>{cursor=0;return [...nodes(mod.SearchDiscovery(props))];};
  render().find(n=>n.type==='button'&&n.props.children==='和平精英').props.onClick();
  assert.deepEqual(opened,[['服务','和平精英']]);
  const historyButton=render().find(n=>n.type==='button'&&n.props.title==='和平精英');
  historyButton.props.onClick();
  assert.deepEqual(opened,[['服务','和平精英'],['服务','和平精英']]);
  render().find(n=>n.props['aria-label']==='清空搜索记录').props.onClick();
  assert.equal(saved.get('isolated-test'),'[]');
});
