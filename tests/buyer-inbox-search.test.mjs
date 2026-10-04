import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const source = await readFile(new URL('../app/ConversationList.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function* nodes(node) {
  if (!React.isValidElement(node)) return;
  yield node;
  for (const child of React.Children.toArray(node.props.children)) yield* nodes(child);
}
test('buyer inbox collapse retains the active search; clear removes it independently', async () => {
  let cursor = 0; const state = []; const refs = []; let refIndex = 0;
  const hooks = {
    useEffect() {},
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef(value) { const index = refIndex++; return refs[index] ??= { current: value }; },
  };
  const context = { exports: {}, React, require: () => hooks, requestAnimationFrame: callback => callback() };
  vm.runInNewContext(compiled, context);
  const row = { id: 'conversation-1', name: '测试店铺', avatar: '/avatar.png', preview: '已经准备好' };
  let opened;
  const props = { entries: [row], onOpen: (...target) => { opened = target; }, search: async () => [{ ...row, match: '历史记录命中', matchMessageId: 'message-older' }] };
  const render = () => { cursor = 0; refIndex = 0; return context.exports.ConversationList(props); };
  const find = predicate => [...nodes(render())].find(predicate);
  find(n => n.props['aria-label'] === '搜索会话').props.onClick();
  find(n => n.type === 'input').props.onChange({ target: { value: '历史' } });
  find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  find(n => n.type === 'button' && n.props.children === '收起').props.onClick();
  assert.equal(find(n => n.type === 'input'), undefined);
  assert.ok(find(n => n.type === 'small' && n.props.children === '历史记录命中'));
  assert.ok(find(n => n.type === 'span' && n.props.children === '搜索“历史”'));
  find(n => n.props.className === 'conversation-inbox-row').props.onClick();
  assert.deepEqual(opened, ['conversation-1', 'message-older']);
  find(n => n.type === 'button' && n.props.children === '清除').props.onClick();
  assert.ok(find(n => n.type === 'small' && n.props.children === '已经准备好'));
  assert.equal(find(n => n.type === 'button' && n.props.children === '清除'), undefined);
});
