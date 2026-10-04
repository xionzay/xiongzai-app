import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
function load(file,overrides={},cache=new Map()){
 if(cache.has(file))return cache.get(file);
 if(file.endsWith('.json'))return JSON.parse(readFileSync(path.join(root,file),'utf8'));
 const module={exports:{}};cache.set(file,module.exports);
 const js=ts.transpileModule(readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,Intl,...overrides,require(id){if(id in overrides)return overrides[id];if(!id.startsWith('.'))return require(id);let next=path.posix.normalize(path.posix.join(path.posix.dirname(file),id));if(!path.extname(next))next+=existsSync(path.join(root,next+'.tsx'))?'.tsx':'.ts';return load(next,overrides,cache)}});return module.exports;
}
const model=load('app/chat-stickers/standard-emoji.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
test('all 224 original assets, seven categories and both licenses are copied byte-for-byte',()=>{
 const source=path.join(root,'表情符号资料/标准Emoji-224枚-V1'),target=path.join(root,'public/assets/standard-emoji/fluent-224-v1');
 const manifest=JSON.parse(readFileSync(path.join(source,'manifest.json'),'utf8'));
 assert.equal(model.standardEmoji.length,224);assert.equal(new Set(model.standardEmoji.map(e=>e.id)).size,224);
 assert.deepEqual(manifest.categories.map(c=>c.name),['情绪','手势','爱心','动物','食物','物品','节日']);
 for(const category of manifest.categories)assert.equal(manifest.emoji.filter(e=>e.category===category.name).length,category.count);
 for(const e of manifest.emoji)for(const relative of Object.values(e.assets)){
  const original=readFileSync(path.join(source,relative)),copy=readFileSync(path.join(target,relative));
  assert.equal(createHash('sha256').update(copy).digest('hex'),createHash('sha256').update(original).digest('hex'));
  if(relative.endsWith('.png')){assert.equal(copy.readUInt32BE(16),relative.includes('/64/')?64:128);assert.equal(copy.readUInt32BE(20),copy.readUInt32BE(16));assert.equal(copy[25],6,'RGBA PNG preserves transparency');}
 }
 for(const file of ['NOTICE.txt','LICENSE-Microsoft.txt','LICENSE-LobeHub.txt','manifest.json','sources/provenance.json'])assert.deepEqual(readFileSync(path.join(target,file)),readFileSync(path.join(source,file)));
});
test('every manifest glyph is one complete grapheme mapped to its original image',()=>{
 for(const e of model.standardEmoji){const tokens=model.emojiTokens(e.glyph);assert.equal(tokens.length,1,e.label);assert.equal(tokens[0].emoji?.id,e.id);assert.equal(tokens[0].text,e.glyph);}
});
test('VS16 optional variants and ZWJ match whole sequences; unsupported modifiers and ZWJ stay Unicode',()=>{
 assert.equal(model.findEmoji('❤')?.id,'2764');assert.equal(model.findEmoji('❤️')?.id,'2764');assert.equal(model.findEmoji('✌️')?.id,'270c');
 const tokens=model.emojiTokens('中文😮‍💨 ❤️‍🔥 👍🏽 👨‍👩‍👧‍👦 A🇨🇳 🧑‍💻');
 assert.equal(tokens.find(t=>t.text==='😮‍💨').emoji.id,'1f62e-200d-1f4a8');
 for(const text of ['❤️‍🔥','👍🏽','👨‍👩‍👧‍👦','🇨🇳','🧑‍💻'])assert.equal(tokens.find(t=>t.text===text).emoji,undefined,text);
 assert.equal(tokens.map(t=>t.text).join(''),'中文😮‍💨 ❤️‍🔥 👍🏽 👨‍👩‍👧‍👦 A🇨🇳 🧑‍💻');
 assert.equal(model.findEmoji('❤︎'),undefined,'VS15 keeps text presentation');
});
test('selection insertion, replacement and consecutive insertion use UTF16 offsets without corrupting clusters',()=>{
 let result=model.insertAtSelection('你好世界',{start:2,end:2},'😮‍💨');assert.deepEqual(plain(result),{text:'你好😮‍💨世界',start:7,end:7});
 result=model.insertAtSelection(result.text,result,'❤️');assert.equal(result.text,'你好😮‍💨❤️世界');
 result=model.insertAtSelection(result.text,{start:2,end:9},'👍');assert.equal(result.text,'你好👍世界');
 result=model.insertAtSelection('A😮‍💨B',{start:2,end:4},'好');assert.equal(result.text,'A好B');
});
test('backspace/delete/selected deletion remove full ZWJ, flags, modifiers, VS16 and combining accents',()=>{
 for(const cluster of ['😮‍💨','❤️','👍🏽','👨‍👩‍👧‍👦','🇨🇳','é']){
  const text='A'+cluster+'B';const end=1+cluster.length;
  assert.equal(model.deleteAtSelection(text,{start:end,end}).text,'AB');
  assert.equal(model.deleteAtSelection(text,{start:1,end:1},'forward').text,'AB');
  assert.equal(model.deleteAtSelection(text,{start:1,end}).text,'AB');
  if(cluster.length>1)assert.equal(model.deleteAtSelection(text,{start:2,end:2}).text,'AB');
 }
 assert.equal(model.deleteAtSelection('A',{start:0,end:0}).text,'A');
});
test('Chinese names and keywords search all categories; recent history is bounded and validates IDs',()=>{
 assert.ok(model.searchEmoji('笑','食物').some(e=>e.label==='笑哭'));
 assert.ok(model.searchEmoji('点赞','食物').some(e=>e.glyph==='👍'));
 assert.equal(model.searchEmoji('不存在的关键词','情绪').length,0);
 assert.equal(model.searchEmoji('','手势').length,28);
 const recent=model.addRecent(['1f600','invalid','1f602','1f600'],'1f602');assert.deepEqual(plain(recent),['1f602','1f600']);
 assert.equal(model.validRecent(model.standardEmoji.map(e=>e.id)).length,24);
});
test('history renderer uses 24px image alt Unicode and leaves unsupported sequences and HTML as text',()=>{
 const {EmojiText}=load('app/chat-stickers/StandardEmoji.tsx');
 const markup=renderToStaticMarkup(React.createElement(EmojiText,{text:'你好😮‍💨❤️ 👍🏽 <script>bad</script>'}));
 assert.equal((markup.match(/class="standard-emoji-inline"/g)||[]).length,2);
 assert.match(markup,/alt="😮‍💨"/);assert.match(markup,/alt="❤️"/);assert.match(markup,/width="24" height="24"/);
 assert.match(markup,/👍🏽/);assert.match(markup,/&lt;script&gt;/);assert.doesNotMatch(markup,/<script>/);
});
test('copy from a non-editable bubble writes Unicode, not image paths or rich HTML',()=>{
 let listener,removed=false,prevented=false,copied;
 const images=['😮‍💨','❤️'].map(alt=>({alt,replaceWith(node){this.replacement=node.textContent}}));
 const fragment={querySelectorAll:()=>images,get textContent(){return '你好'+images.map(i=>i.replacement??'').join('')+'👍🏽'}};
 const range={intersectsNode:()=>true,cloneContents:()=>fragment};
 const {useEmojiClipboard}=load('app/chat-stickers/StandardEmoji.tsx',{react:{useEffect:fn=>{removed=fn()}},document:{addEventListener:(name,fn)=>{listener=fn},removeEventListener:()=>{},createTextNode:text=>({textContent:text})},window:{getSelection:()=>({rangeCount:1,getRangeAt:()=>range})}});
 useEmojiClipboard({current:{}});listener({clipboardData:{setData(type,text){copied={type,text}}},preventDefault(){prevented=true}});
 assert.deepEqual(copied,{type:'text/plain',text:'你好😮‍💨❤️👍🏽'});assert.equal(prevented,true);removed();
});
test('native composer keeps saved caret and does not intercept IME composition or modified deletion',()=>{
 let refs=[],cursor=0,effects=[],layouts=[],value='A😮‍💨B',focused=false;
 const handlers=new Map(),input={value,selectionStart:6,selectionEnd:6,disabled:false,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:(name)=>handlers.delete(name),setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end},focus(){focused=true}};
 const fakeReact={useRef(v){return refs[cursor++]??(refs[cursor-1]={current:v})},useEffect(fn){effects.push(fn)},useLayoutEffect(fn){layouts.push(fn)}};
 const {useEmojiComposer}=load('app/chat-stickers/useEmojiComposer.ts',{react:fakeReact});
 let composer;const render=()=>{cursor=0;layouts=[];effects=[];composer=useEmojiComposer({current:input},{value,onChange(next){value=next;input.value=next}});layouts.forEach(fn=>fn())};
 render();effects.forEach(fn=>fn());handlers.get('select')();
 composer.insert('❤️');render();assert.equal(value,'A😮‍💨❤️B');assert.equal(input.selectionStart,8);assert.equal(focused,false);
 composer.focus();assert.equal(input.selectionStart,8);assert.equal(focused,true);
 handlers.get('compositionstart')();assert.equal(composer.isComposing(),true);let prevented=false;handlers.get('keydown')({key:'Backspace',preventDefault(){prevented=true}});assert.equal(prevented,false);assert.equal(value,'A😮‍💨❤️B');handlers.get('compositionend')();assert.equal(composer.isComposing(),false);
 handlers.get('keydown')({key:'Backspace',ctrlKey:true,preventDefault(){prevented=true}});assert.equal(prevented,false);
 handlers.get('keydown')({key:'Backspace',preventDefault(){prevented=true}});render();assert.equal(prevented,true);assert.equal(value,'A😮‍💨B');
 handlers.get('beforeinput')({inputType:'deleteContentBackward',cancelable:true,preventDefault(){}});render();assert.equal(value,'AB');
 input.disabled=true;assert.equal(composer.insert('😀'),false);assert.equal(value,'AB','disabled input never changes or claims insertion');
});

test('Enter commits IME composition without accidentally sending in both real composers',()=>{
 const page=ts.createSourceFile('page.tsx',readFileSync(path.join(root,'app/page.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const handlers=[];
 const visit=node=>{if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(page)==='input'){
  const attributes=node.attributes.properties;
  const label=attributes.find(a=>a.name?.getText(page)==='aria-label')?.initializer?.text;
  if(['输入文字消息','输入客服问题'].includes(label))handlers.push(attributes.find(a=>a.name?.getText(page)==='onKeyDown').initializer.expression.getText(page));
 }ts.forEachChild(node,visit)};visit(page);assert.equal(handlers.length,2);
 for(const code of handlers){let count=0,composing=false;const handler=vm.runInNewContext('('+code+')',{send:()=>count++,stickers:{composer:{isComposing:()=>composing}}});
  const event={key:'Enter',nativeEvent:{isComposing:true,keyCode:13}};handler(event);assert.equal(count,0);
  event.nativeEvent={isComposing:false,keyCode:229};handler(event);assert.equal(count,0);
  event.nativeEvent={isComposing:false,keyCode:13};composing=true;handler(event);assert.equal(count,0);
  composing=false;handler(event);assert.equal(count,1);
 }
});

test('actual conversation and support send handlers transmit Unicode and reuse failed-message keys',async()=>{
 const page=readFileSync(path.join(root,'app/page.tsx'),'utf8'),payload='你好😀😮‍💨❤️，未收录👍🏽保留原文。';
 for(const [component,next] of [['function ChatScreen','  const lastMineIndex'],['function CustomerServiceScreen','  const reopen']]){
  const source=page.slice(page.indexOf(component)),fn=source.slice(source.indexOf('  const send = async'),source.indexOf(next));
  let messages=[],error='',draft=payload,calls=[],attempt=0,sequence=0;
  const ctx={text:payload,viewer:{id:'buyer'},loading:false,loadError:'',busy:false,conversation:{id:'conversation'},supportCase:{conversation_id:'conversation',status:'WAITING'},sendLock:{current:false},sendKey:{current:{content:'',key:'',conversationId:''}},window:{crypto:{randomUUID:()=>String(++sequence)}},JSON,apiMessage:e=>e.message,notify:()=>{},setSending:()=>{},setBusy:()=>{},setText:v=>{draft=v},setSendError:v=>{error=v},setMessages:fn=>{messages=fn(messages)},async apiRequest(url,options){calls.push({url,body:JSON.parse(options.body)});if(++attempt===1)throw new Error('暂时断网');return {id:'saved-message',content:JSON.parse(options.body).content}}};
  const compiled=ts.transpileModule(fn+'\nsend;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const send=vm.runInNewContext(compiled,ctx);
  await send();assert.equal(draft,payload);assert.equal(error,'暂时断网');assert.equal(ctx.sendLock.current,false);
  await send();assert.equal(draft,'');assert.equal(error,'');assert.equal(messages.length,1);
  assert.deepEqual(calls.map(c=>c.body.content),[payload,payload]);assert.equal(calls[0].body.client_message_id,calls[1].body.client_message_id);assert.equal(sequence,1);
  assert.ok(calls.every(c=>c.url==='/conversations/conversation/messages'));
  ctx.sendLock.current=true;await send();assert.equal(calls.length,2,'rapid repeated send is blocked');
 }
});
