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
 if(file.endsWith('.js')&&!existsSync(path.join(root,file))&&existsSync(path.join(root,file.replace(/\.js$/,'.ts'))))file=file.replace(/\.js$/,'.ts');
 if(cache.has(file))return cache.get(file);
 if(file.endsWith('.json'))return JSON.parse(readFileSync(path.join(root,file),'utf8'));
 const cjsModule={exports:{}};cache.set(file,cjsModule.exports);
 const js=ts.transpileModule(readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module:cjsModule,exports:cjsModule.exports,Intl,...overrides,require(id){if(id in overrides)return overrides[id];if(!id.startsWith('.'))return require(id);let next=path.posix.normalize(path.posix.join(path.posix.dirname(file),id));if(!path.extname(next))next+=existsSync(path.join(root,next+'.tsx'))?'.tsx':'.ts';return load(next,overrides,cache)}});return cjsModule.exports;
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
 let composer;const RenderHarness=()=>{cursor=0;layouts=[];effects=[];composer=useEmojiComposer({current:input},{value,onChange(next){value=next;input.value=next}});layouts.forEach(fn=>fn())};
 RenderHarness();effects.forEach(fn=>fn());handlers.get('select')();
 composer.insert('❤️');RenderHarness();assert.equal(value,'A😮‍💨❤️B');assert.equal(input.selectionStart,8);assert.equal(focused,false);
 composer.focus();assert.equal(input.selectionStart,8);assert.equal(focused,true);
 handlers.get('compositionstart')();assert.equal(composer.isComposing(),true);let prevented=false;handlers.get('keydown')({key:'Backspace',preventDefault(){prevented=true}});assert.equal(prevented,false);assert.equal(value,'A😮‍💨❤️B');handlers.get('compositionend')();assert.equal(composer.isComposing(),false);
 handlers.get('keydown')({key:'Backspace',ctrlKey:true,preventDefault(){prevented=true}});assert.equal(prevented,false);
 handlers.get('keydown')({key:'Backspace',preventDefault(){prevented=true}});RenderHarness();assert.equal(prevented,true);assert.equal(value,'A😮‍💨B');
 handlers.get('beforeinput')({inputType:'deleteContentBackward',cancelable:true,preventDefault(){}});RenderHarness();assert.equal(value,'AB');
 input.disabled=true;assert.equal(composer.insert('😀'),false);assert.equal(value,'AB','disabled input never changes or claims insertion');
});

test('shared multiline composer protects IME, supports Shift+Enter and keeps mobile Enter as newline',()=>{
 const {handleChatKey}=load('app/ChatComposer.tsx',{'./chat-stickers/StickerChat':{},'./ProductDecisionPages':{}});
 let sent=0,prevented=0;
 const event={key:'Enter',shiftKey:false,nativeEvent:{isComposing:true,keyCode:13},preventDefault(){prevented++}};
 const send=()=>sent++;
 handleChatKey(event,false,false,send);assert.equal(sent,0);
 event.nativeEvent={isComposing:false,keyCode:229};handleChatKey(event,false,false,send);assert.equal(sent,0);
 event.nativeEvent.keyCode=13;handleChatKey(event,true,false,send);assert.equal(sent,0);
 event.shiftKey=true;handleChatKey(event,false,false,send);assert.equal(sent,0);
 event.shiftKey=false;handleChatKey(event,false,true,send);assert.equal(sent,0);
 handleChatKey(event,false,false,send);assert.equal(sent,1);assert.equal(prevented,1);
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

test('rich draft renders the same original assets as picker and round-trips Unicode, newlines and unsupported graphemes',()=>{
 class Element {
  constructor(tag='DIV'){this.tagName=tag;this.nodeType=1;this.childNodes=[];this.dataset={};}
  hasAttribute(name){return name==='data-emoji'?this.dataset.emoji!==undefined:name==='data-caret-end'?this.dataset.caretEnd!==undefined:false;}
  getAttribute(name){return name==='data-emoji'?this.dataset.emoji:null;}
  append(...nodes){for(const node of nodes)this.childNodes.push(...(node.nodeType===11?node.childNodes:[node]));}
  replaceChildren(...nodes){this.childNodes=[];this.append(...nodes);}
 }
 const doc={createElement:tag=>new Element(tag.toUpperCase()),createTextNode:text=>({nodeType:3,textContent:text,childNodes:[]}),createDocumentFragment:()=>({nodeType:11,childNodes:[],append(...nodes){this.childNodes.push(...nodes)}})};
 const root=new Element();root.ownerDocument=doc;
 const {paintDraft,draftText}=load('app/chat-stickers/emoji-editor-dom.ts',{Element});
 const text='A😀😮‍💨❤️\n中文👍🏽👨‍👩‍👧‍👦 <b>不是HTML</b>\n';
 paintDraft(root,text);
 assert.equal(draftText(root),text);
 const images=root.childNodes.filter(n=>n.tagName==='IMG');
 assert.equal(images.length,3);
 for(const image of images){assert.equal(image.src,model.emojiAssetRoot+model.findEmoji(image.alt).assets.webp128);assert.equal(image.contentEditable,'false');assert.equal(image.draggable,false);}
 assert.equal(root.childNodes.at(-1).dataset.caretEnd,'');
 assert.equal(root.childNodes.some(n=>n.tagName==='B'),false);
 paintDraft(root,'');assert.equal(draftText(root),'');assert.equal(root.childNodes.length,0);
});

test('rich draft defers DOM replacement during IME, copies Unicode and sanitizes pasted text',()=>{
 let domText='你好😀',painted=[],changes=[],selection={start:0,end:4},handle;
 const root={style:{},scrollHeight:44,focus(){},blur(){}};
 let refIndex=0;
 const fakeReact={useRef(value){return {current:refIndex++===0?root:value}},useCallback:fn=>fn,useEffect(){},useLayoutEffect:fn=>fn(),useImperativeHandle(_ref,create){handle=create()}};
 const dom={draftText:()=>domText,draftSelection:()=>selection,paintDraft(_root,text){painted.push(text);domText=text},selectDraft(_root,next){selection=next}};
 const {EmojiDraftInput}=load('app/chat-stickers/EmojiDraftInput.tsx',{react:fakeReact,'./emoji-editor-dom':dom,document:{activeElement:root}});
 const element=EmojiDraftInput({inputRef:{current:null},value:domText,disabled:false,label:'draft',placeholder:'',onChange:value=>changes.push(value),onFocus(){},onKeyDown(){}});
 const p=element.props;
 p.onCompositionStart();domText='你好😀拼';p.onInput();assert.equal(painted.length,0);assert.equal(changes.length,0);
 let prevented=false;p.onKeyDown({key:'Enter',nativeEvent:{isComposing:true,keyCode:229},preventDefault(){prevented=true}});assert.equal(prevented,false);
 selection={start:5,end:5};p.onCompositionEnd();assert.equal(changes.at(-1),'你好😀拼');assert.equal(painted.length,1);
 selection={start:0,end:5};let clipboard;p.onCopy({clipboardData:{setData(type,text){clipboard={type,text}}},preventDefault(){}});assert.deepEqual(clipboard,{type:'text/plain',text:'你好😀拼'});
 p.onPaste({clipboardData:{getData:type=>{assert.equal(type,'text/plain');return '<b>纯文本</b>\r\n😮‍💨'}},preventDefault(){}});
 assert.equal(changes.at(-1),'<b>纯文本</b>\n😮‍💨');assert.equal(handle.value,changes.at(-1));
});

test('draft width changes defer height writes outside ResizeObserver and cancel pending work on unmount',()=>{
 const root={style:{},clientWidth:220,scrollHeight:80,addEventListener(){},removeEventListener(){}};
 const effects=[],frames=new Map();let callback,next=0,disconnected=false,index=0;
 const react={useRef:value=>({current:index++===0?root:value}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useLayoutEffect(){},useImperativeHandle(){}};
 const {EmojiDraftInput}=load('app/chat-stickers/EmojiDraftInput.tsx',{react,'./emoji-editor-dom':{},ResizeObserver:class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}},requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
 EmojiDraftInput({inputRef:{current:null},value:'',onChange(){}});
 const cleanup=effects.map(fn=>fn());
 root.clientWidth=180;callback();assert.equal(root.style.height,undefined);assert.equal(frames.size,1);
 root.clientWidth=160;callback();assert.equal(frames.size,1);
 const fn=[...frames.values()][0];frames.clear();fn();assert.equal(root.style.height,'80px');
 root.clientWidth=150;callback();cleanup.forEach(fn=>fn?.());assert.equal(frames.size,0);assert.equal(disconnected,true);
});
