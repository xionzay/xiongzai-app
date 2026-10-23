import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const source = await readFile(new URL('../app/ChatDesignPreview.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness() {
  const state = []; let cursor = 0;
  const hooks = { useEffect() {}, useRef: value => ({ current: value }), useState(initial) {
    const i = cursor++; if (!(i in state)) state[i] = initial;
    return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
  } };
  const dependencies = {
    react: hooks,
    './local-catalog-data': { previewCompanions: [{name:'晚风',image:'/avatar-1.jpg'},{name:'小熊软糖',image:'/avatar-2.jpg'}] },
    './ChatAvatar': { ChatAvatar() {} }, './ConversationList': { ConversationList() {} }, './ui/CartoonIcon': { CartoonIcon() {} },
    './ChatIcon': { ChatIcon() {} }, './ChatHeader': { ChatHeader() {} }, './ChatComposer': { ChatComposer() {} }, '../packages/contracts/src/bear-stickers': { getBearSticker:id=>({side:id.split('/')[1]}) }, './chat-stickers/StandardEmoji': { EmojiText() {} },
    './chat-stickers/BearStickers': { BearStickerImage() {} },
    './chat-stickers/StickerChat': { useStickerChat: () => ({ followLatest:{current:true}, requestExit:fn=>fn(), closePanel(){}, composer: { isComposing:()=>false } }), StickerToggle(){}, StickerTray(){}, StickerChatPreview(){} },
  };
  const context = { exports:{}, React, crypto: {randomUUID:()=>`preview-${Date.now()}`}, require: key => { assert.ok(key in dependencies, `Unexpected dependency: ${key}`); return dependencies[key]; } };
  vm.runInNewContext(compiled, context);
  return { ...context.exports, render(props = {}) { cursor = 0; return context.exports.ChatDesignPreview({onBack(){},...props}); } };
}
function* nodes(node) {
  if (!React.isValidElement(node)) return;
  yield node;
  for (const child of React.Children.toArray(node.props.children)) yield* nodes(child);
}
test('design inbox supports name and message search without real unread or API identifiers', () => {
  const preview = harness();
  assert.equal(preview.searchDesignChats('').length, 2);
  assert.equal(preview.searchDesignChats('晚风')[0].id, 'ui-preview-chat-1');
  assert.equal(preview.searchDesignChats('QQ')[0].match, '我玩 QQ 区，想先体验一下 😊');
  assert.equal(preview.searchDesignChats('没有这条记录').length, 0);
  assert.ok(preview.searchDesignChats('', true).every(row => row.name === '小熊玩家'));
  assert.ok(preview.searchDesignChats('').every(row => row.unread === undefined && row.id.startsWith('ui-preview-')));
});
test('preview composer uses shared input and labels local display without delivery receipts', () => {
  const preview = harness();
  const find = predicate => [...nodes(preview.render())].find(predicate);
  let composer = find(n=>n.props.label==='UI 示例文字输入');
  composer.props.onChange('你好😊');
  composer = find(n=>n.props.label==='UI 示例文字输入');
  assert.equal(composer.props.value, '你好😊');
  composer.props.onSend();
  assert.equal(find(n=>n.props.label==='UI 示例文字输入').props.value, '');
  assert.ok(find(n=>n.type==='small' && n.props.children==='仅本地展示'));
  assert.equal(find(n=>n.props.label==='UI 示例文字输入').props.sendLabel, '本地预览消息，不发送给对方');
  assert.doesNotMatch(source, /\bfetch\(|apiRequest\(|read_by_recipient|消息已发送/);
});
test('design inbox routes a selected stable preview ID to the preview chat', () => {
  const preview = harness(); let opened;
  const tree = preview.ChatDesignInbox({onOpen:id=>{opened=id},nav:null});
  const inbox = [...nodes(tree)].find(n=>n.props.entries);
  inbox.props.onOpen(inbox.props.entries[1].id);
  assert.equal(opened,'ui-preview-chat-2');
  const page = [...nodes(preview.render({threadId:opened}))];
  assert.equal(page.find(n=>n.props.title==='小熊软糖').props.title,'小熊软糖');
});
