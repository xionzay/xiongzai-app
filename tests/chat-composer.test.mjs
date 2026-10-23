import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';

function load(file, modules) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,
  {exports,React,crypto:{randomUUID:()=> 'isolated-test-id'},require:id=>modules[id]??{}});
 return exports;
}
function hooks() {
 const state=[], refs=[]; let cursor=0, refCursor=0;
 return {reset(){cursor=refCursor=0}, react:{useEffect(){},useImperativeHandle(ref,create){if(ref)ref.current=create()},useLayoutEffect(){},useRef(value){return refs[refCursor++]??= {current:value}},useCallback:fn=>fn,
 useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next}]},
 useReducer(_reducer, scope, init){return [init(scope),()=>{}]}}};
}
function* nodes(node) {
 if(!React.isValidElement(node))return;
 yield node;
 for(const child of React.Children.toArray(node.props.children))yield* nodes(child);
}
test('one shared state makes emoji and more mutually exclusive, repeated toggles close, scope changes reset panels',()=>{
 const h=hooks();const calls=[];
 const composer={remember(){calls.push('remember')},focus(){calls.push('focus')}};
 const mod=load('app/chat-stickers/StickerChat.tsx',{react:h.react,'./useEmojiComposer':{useEmojiComposer:()=>composer},'./BearStickers':{useChatViewportAnchor:()=>({current:true})},'./demo-adapter':{emptyDemo:scope=>({scope,messages:[]})}});
 const render=(scope='one',text='')=>{h.reset();return mod.useStickerChat(scope,{current:null},{current:{blur(){calls.push('blur')}}},{value:text,onChange(){}})};
 let control=render();assert.equal(control.panel,null);
 control.togglePanel();control=render();assert.equal(control.panel,'emoji');assert.equal(control.panelOpen,true);
 control.toggleMore();control=render();assert.equal(control.panel,'more');assert.equal(control.panelOpen,false);
 control.togglePanel();control=render();assert.equal(control.panel,'emoji');
 control.closeMore();control=render();assert.equal(control.panel,'emoji','a completed media request must not close a different panel');
 control.togglePanel();control=render();assert.equal(control.panel,null);
 control.toggleMore();control=render();control.toggleMore();assert.equal(render().panel,null);
 control=render();control.toggleMore();control.toggleMore();assert.equal(render().panel,null,'rapid updates use the latest shared state');
 control=render();control.togglePanel();assert.equal(render('two').panel,null,'new conversation does not inherit an open panel');
 control=render('two');control.toggleMore();control=render('two');control.returnToInput();assert.equal(render('two').panel,null);assert.ok(calls.includes('focus'));
});
test('leaving a draft or attachment requires an explicit choice, cancel retains it',()=>{
 const h=hooks();const mod=load('app/chat-stickers/StickerChat.tsx',{react:h.react,'./useEmojiComposer':{useEmojiComposer:()=>({})},'./BearStickers':{useChatViewportAnchor:()=>({current:true})},'./demo-adapter':{emptyDemo:scope=>({scope,messages:[]})}});
 const render=(text='')=>{h.reset();return mod.useStickerChat('one',{current:null},{current:null},{value:text,onChange(){}})};
 let exited=0;let c=render('未发送');c.requestExit(()=>exited++);c=render('未发送');assert.equal(exited,0);assert.ok(c.exitRequest);
 c.cancelExit();c=render('未发送');assert.equal(c.exitRequest,null);assert.equal(exited,0);
 c=render();c.setAttachmentPending(true);c=render();c.requestExit(()=>exited++);c=render();assert.equal(exited,0);c.confirmExit();assert.equal(exited,1);
});
test('media panel retains an attachment while closed, cancellation and replacement never trigger a send',()=>{
 const h=hooks();const Picker=()=>null;
 const mod=load('app/ProductDecisionPages.tsx',{react:h.react,'./ui/ThemedFilePicker':{ThemedFilePicker:Picker}});
 let open=true,sends=0;
 const render=()=>{h.reset();return mod.ChatPlusPanel({open,hideTrigger:true,api:{send:async()=>sends++}})};
 const find=predicate=>[...nodes(render())].find(predicate);
 find(n=>n.type==='button' && n.props.children?.[1]?.props?.children==='图片').props.onClick();
 const file={name:'isolated-test.png',type:'image/png'};
 find(n=>n.type===Picker).props.onChange({target:{files:[file]}});
 open=false;assert.equal([...nodes(render())].filter(n=>n.type==='section').length,0);
 open=true;assert.ok(find(n=>n.type==='small' && String(n.props.children).includes('isolated-test.png')));
 find(n=>n.type==='button' && n.props.children?.[1]?.props?.children==='视频').props.onClick();
 assert.ok(find(n=>n.props['aria-label']==='处理未发送附件'));
 find(n=>n.type==='button' && n.props.children==='保留附件').props.onClick();
 assert.equal(find(n=>n.props['aria-label']==='处理未发送附件'),undefined);
 find(n=>n.type===Picker).props.onChange({target:{files:[]}});
 assert.ok(find(n=>n.type==='small' && String(n.props.children).includes('isolated-test.png')));
 assert.equal(sends,0);
});

test('media send failure retains the file, prevents duplicates and retries with the original key', async()=>{
 const h=hooks(),Picker=()=>null;
 const mod=load('app/ProductDecisionPages.tsx',{react:h.react,'./ui/ThemedFilePicker':{ThemedFilePicker:Picker}});
 const calls=[];let reject,resolve;
 const api={send:payload=>{calls.push(payload);return new Promise((yes,no)=>{resolve=yes;reject=no})}};
 const render=()=>{h.reset();return mod.ChatPlusPanel({open:true,hideTrigger:true,api})};
 const find=predicate=>[...nodes(render())].find(predicate);
 find(n=>n.type==='button'&&n.props.children?.[1]?.props?.children==='图片').props.onClick();
 const file={name:'isolated-retry.png',type:'image/png'};
 find(n=>n.type===Picker).props.onChange({target:{files:[file]}});
 const send=find(n=>n.type==='button'&&n.props.children==='确认发送');
 send.props.onClick();send.props.onClick();assert.equal(calls.length,1);
 reject(new Error('隔离网络失败'));await new Promise(done=>setImmediate(done));
 assert.ok(find(n=>n.type==='small'&&String(n.props.children).includes('isolated-retry.png')));
 find(n=>n.type==='button'&&n.props.children==='重试发送').props.onClick();
 assert.equal(calls.length,2);assert.equal(calls[0].clientMessageId,calls[1].clientMessageId);assert.equal(calls[1].file,file);
 resolve();await new Promise(done=>setImmediate(done));
 assert.equal(find(n=>n.type==='small'&&String(n.props.children).includes('isolated-retry.png')),undefined);
});

test('shared input keeps over-limit Unicode intact and blocks sending without valid permission',()=>{
 const h=hooks();const mod=load('app/ChatComposer.tsx',{react:h.react,'./ui/CartoonIcon':{CartoonIcon(){}},'./ProductDecisionPages':{ChatPlusPanel(){}},'./chat-stickers/StickerChat':{StickerToggle(){},StickerTray(){}}});
 let sent=0;
 const control={panel:null,hasAttachment:false,exitRequest:null,prepareSend(){},followLatest:{current:false},composer:{isComposing:()=>false}};
 const text='字'.repeat(499)+'😮‍💨';
 const render=(value,disabled=false)=>mod.ChatComposer({control,inputRef:{current:null},value,onChange(){},onSend(){sent++},disabled});
 let all=[...nodes(render(text))];assert.equal(all.find(n=>n.props.label==='输入文字消息').props.value,text);
 let button=all.find(n=>n.props.className==='chat-submit');assert.equal(button.props.disabled,true);button.props.onClick();assert.equal(sent,0);
 assert.ok(all.find(n=>n.props.role==='alert'));
 button=[...nodes(render('有效文字',true))].find(n=>n.props.className==='chat-submit');button.props.onClick();assert.equal(sent,0);
 button=[...nodes(render('有效文字'))].find(n=>n.props.className==='chat-submit');button.props.onClick();assert.equal(sent,1);
});

test('trailing action uses plus when empty, send with text and panel footer while expanded',()=>{
 const h=hooks(),Tray=()=>null;
 const mod=load('app/ChatComposer.tsx',{react:h.react,'./ui/CartoonIcon':{CartoonIcon(){}},'./ProductDecisionPages':{ChatPlusPanel(){}},'./chat-stickers/StickerChat':{StickerToggle(){},StickerTray:Tray}});
 let sent=0,composing=false,followed=false;
 const control={panel:null,hasAttachment:false,exitRequest:null,prepareSend(){followed=true},followLatest:{current:false},composer:{isComposing:()=>composing}};
 const render=(value,panel=null)=>{h.reset();return [...nodes(mod.ChatComposer({control:{...control,panel},inputRef:{current:null},value,onChange(){},onSend(){sent++}}))]};
 assert.ok(render('').find(n=>n.props.className==='chat-more-toggle'));
 assert.equal(render('').find(n=>n.props.className==='chat-submit'),undefined);
 let button=render('多行\n消息').find(n=>n.props.className==='chat-submit');
 assert.equal(button.props.children,'发送');
 composing=true;button.props.onClick();assert.equal(sent,0);
 composing=false;button.props.onClick();assert.equal(sent,1);assert.equal(followed,true);
 const expanded=render('保留草稿','emoji');assert.ok(expanded.find(n=>n.props.className==='chat-more-toggle'));
 const tray=expanded.find(n=>n.type===Tray);assert.equal(tray.props.canSend,true);tray.props.onSend();assert.equal(sent,2);
 assert.ok(render('保留草稿','more').find(n=>n.props.className==='chat-more-text-action'));
});

test('audio shortcut reuses the media picker and asks before replacing a retained image',()=>{
 const h=hooks(),Picker=()=>null,ref={current:null};
 const mod=load('app/ProductDecisionPages.tsx',{react:h.react,'./ui/ThemedFilePicker':{ThemedFilePicker:Picker}});
 const render=()=>{h.reset();return [...nodes(mod.ChatPlusPanel({ref,open:true,hideTrigger:true}))]};
 const find=predicate=>render().find(predicate);
 render();ref.current.selectKind('图片');
 find(n=>n.type===Picker).props.onChange({target:{files:[{name:'draft.png',type:'image/png'}]}});
 render();ref.current.selectKind('语音');
 assert.ok(find(n=>n.props['aria-label']==='处理未发送附件'));
 find(n=>n.type==='button'&&n.props.children==='保留附件').props.onClick();
 assert.ok(find(n=>n.type==='small'&&String(n.props.children).includes('draft.png')));
 render();ref.current.selectKind('语音');
 find(n=>n.type==='button'&&n.props.children==='移除并切换').props.onClick();
 assert.equal(find(n=>n.type===Picker).props.accept,'audio/*');
 assert.ok(find(n=>n.type==='small'&&String(n.props.children).includes('暂不支持按住录音')));
});

test('only a short tap in empty history dismisses panels; message taps, scroll, selection and long presses retain them',()=>{
 const h=hooks(), effects=[], listeners={}; let selected='', blurred=0;
 h.react.useEffect=effect=>effects.push(effect);
 const pane={ownerDocument:{getSelection:()=>({toString:()=>selected})},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]};
 const mod=load('app/chat-stickers/StickerChat.tsx',{react:h.react,'./useEmojiComposer':{useEmojiComposer:()=>({remember(){},focus(){}})},'./BearStickers':{useChatViewportAnchor:()=>({current:true})},'./demo-adapter':{emptyDemo:scope=>({scope,messages:[]})}});
 const render=()=>{h.reset();return mod.useStickerChat('one',{current:pane},{current:{blur(){blurred++}}},{value:'草稿',onChange(){}})};
 let c=render();const cleanups=effects.map(effect=>effect());
 c.togglePanel();assert.equal(render().panel,'emoji');
 const event=(content,time,x=0)=>({clientX:x,clientY:0,timeStamp:time,target:{closest:()=>content?{}:null}});
 listeners.pointerdown(event(true,0));listeners.pointerup(event(true,80));assert.equal(render().panel,'emoji');
 listeners.pointerdown(event(false,0));listeners.pointerup(event(false,80,30));assert.equal(render().panel,'emoji');
 listeners.pointerdown(event(false,0));listeners.pointerup(event(false,500));assert.equal(render().panel,'emoji');
 selected='被选中的文字';listeners.pointerdown(event(false,0));listeners.pointerup(event(false,80));assert.equal(render().panel,'emoji');
 selected='';listeners.pointerdown(event(false,0));listeners.pointerup(event(false,80));assert.equal(render().panel,null);assert.ok(blurred>0);
 cleanups.forEach(cleanup=>cleanup?.());assert.equal(Object.keys(listeners).length,0);
});

test('chat header omits unavailable actions and invokes only supplied valid destinations',()=>{
 const h=hooks();const mod=load('app/ChatHeader.tsx',{react:h.react,'./ChatIcon':{ChatIcon(){}}});
 let backs=0,opened=0;const props={title:'完整商家昵称',onBack:()=>backs++};
 let tree=[...nodes(mod.ChatHeader(props))];assert.equal(tree.find(n=>n.type==='details'),undefined);
 tree.find(n=>n.props['aria-label']==='返回消息列表').props.onClick();assert.equal(backs,1);
 tree=[...nodes(mod.ChatHeader({...props,actions:[{label:'查看店铺主页',onClick:()=>opened++}]}))];
 assert.ok(tree.find(n=>n.props['aria-label']==='会话更多功能'));
 tree.find(n=>n.type==='button'&&n.props.children==='查看店铺主页').props.onClick();assert.equal(opened,1);
});

test('chat avatar retains file ID and fallback props and the header renders its supplied counterpart',()=>{
 const Image=()=>null;
 const {ChatAvatar}=load('app/ChatAvatar.tsx',{'./CatalogImage':{CatalogImage:Image}});
 const frame=ChatAvatar({fileId:'stable-avatar-file-id',src:'/fallback-avatar.png',alt:'商家头像'});
 const img=[...nodes(frame)].find(n=>n.type===Image);
 assert.equal(img.props.fileId,'stable-avatar-file-id');assert.equal(img.props.src,'/fallback-avatar.png');assert.equal(img.props.kind,'avatar');
 const h=hooks();const {ChatHeader}=load('app/ChatHeader.tsx',{react:h.react,'./ChatIcon':{ChatIcon(){}}});
 const tree=[...nodes(ChatHeader({title:'商家完整名称',avatar:frame,onBack(){}}))];
 assert.ok(tree.some(n=>n.type===Image&&n.props.fileId==='stable-avatar-file-id'));
 assert.equal(tree.find(n=>n.type==='h1').props.title,'商家完整名称');assert.equal(tree.find(n=>n.type==='details'),undefined);
});

test('emoji tabs support arrow wrapping and Home/End without restoring input focus',()=>{
 const h=hooks(); const Panel=()=>null;
 const mod=load('app/chat-stickers/StickerChat.tsx',{react:h.react,'./StandardEmoji':{StandardEmojiPanel:Panel}});
 let selected='standard', focused=-1, prevented=0;
 const control={panelOpen:true,standardEnabled:true,standardDisabled:false,composer:{insert(){},remove(){}},get tab(){return selected},setTab(value){selected=value}};
 const render=()=>[...nodes(mod.StickerTray({control}))];
 const tabs=()=>render().filter(n=>n.props.role==='tab');
 const key=value=>tabs().find(n=>n.props['aria-selected']).props.onKeyDown({key:value,preventDefault(){prevented++},currentTarget:{parentElement:{querySelectorAll(){return [0,1].map(i=>({focus(){focused=i}}))}}}});
 assert.deepEqual(tabs().map(n=>n.props.tabIndex),[0,-1]);
 key('ArrowRight');assert.equal(selected,'bear');assert.equal(focused,1);
 assert.deepEqual(tabs().map(n=>n.props.tabIndex),[-1,0]);
 key('ArrowRight');assert.equal(selected,'standard');
 key('ArrowLeft');assert.equal(selected,'bear');
 key('Home');assert.equal(selected,'standard');
 key('End');assert.equal(selected,'bear');
 key('Tab');assert.equal(prevented,5,'normal tab navigation must remain native');
});

test('empty draft disables panel deletion but whitespace remains deletable',()=>{
 const h=hooks(),Tray=()=>null;
 const mod=load('app/ChatComposer.tsx',{react:h.react,'./ProductDecisionPages':{ChatPlusPanel(){}},'./chat-stickers/StickerChat':{StickerToggle(){},StickerTray:Tray}});
 const panelMod=load('app/chat-stickers/StandardEmoji.tsx',{react:{...h.react,useId:()=> 'emoji-test'},'./standard-emoji':{searchEmoji:()=>[]}});
 const control={panel:'emoji',hasAttachment:false,exitRequest:null,composer:{isComposing:()=>false}};
 for(const [value,disabled,expected] of [['',false,true],[' ',false,false],['😊',false,false],['😊',true,true]]){
  h.reset();const composer=mod.ChatComposer({control,inputRef:{current:null},value,onChange(){},onSend(){},disabled});
  const tray=[...nodes(composer)].find(n=>n.type===Tray);
  h.reset();const panel=panelMod.StandardEmojiPanel({canDelete:tray.props.canDelete,disabled,onInsert(){},onDelete(){},onKeyboard(){}});
  assert.equal([...nodes(panel)].find(n=>n.props.className==='standard-emoji-delete').props.disabled,expected);
 }
});
