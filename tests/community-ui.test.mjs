import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

function compile(file, require, append = "") {
  const exports = {}; vm.runInNewContext(ts.transpileModule(readFileSync(file,"utf8") + append, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, { exports, require, React, AbortController, crypto: webcrypto, navigator:{ onLine:true }, window:{ setTimeout, clearTimeout, addEventListener(){}, removeEventListener(){} }, setTimeout, clearTimeout, document:{ visibilityState:"visible" } }); return exports;
}
const css = { default: new Proxy({}, { get: (_, key) => String(key) }) };
function harness(file, name, props, request) {
  const hooks = []; let cursor=0, dirty=true, tree, modal; const effects=[];
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={...React,
    useState(initial){const i=cursor++;hooks[i]??={value:typeof initial==="function"?initial():initial};return[hooks[i].value,next=>{const value=typeof next==="function"?next(hooks[i].value):next;if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}]},
    useRef(initial){return hooks[cursor++]??={current:initial}},
    useCallback(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps))hooks[i]={deps,fn};return hooks[i].fn},
    useEffect(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps)){hooks[i]?.cleanup?.();const slot={deps};hooks[i]=slot;effects.push(()=>{slot.cleanup=fn()})}},
  };
  const api=compile("app/admin/admin-api.ts",()=>({}));api.adminApiRequest=request;
  const mod=compile(file, key=>key==="react"?react:key==="./admin-api"?api:key.includes(".css")?css:key.includes("CartoonIcon")?{CartoonIcon:()=>null}:{});
  const input={...props,request,setModal(value){modal=value}};
  const nodes=node=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
  const text=node=>node==null?"":Array.isArray(node)?node.map(text).join(""):typeof node==="object"?text(node.props?.children):String(node);
  return {api,input,get modal(){return modal},nodes:()=>nodes(tree),button(label){return nodes(tree).find(n=>n.type==="button"&&text(n)===label)},change(type,value){nodes(tree).find(n=>n.type===type).props.onChange({target:{value}})},html:()=>renderToStaticMarkup(tree),async flush(){for(let i=0;i<15;i++){if(dirty){dirty=false;cursor=0;tree=mod[name](input);effects.splice(0).forEach(fn=>fn())}await new Promise(resolve=>setTimeout(resolve,1))}return tree},dispose(){hooks.forEach(h=>h?.cleanup?.())}};
}
const feedback={id:"test-feedback",user_id:"synthetic-user",client_request_id:"local-request",content:"本地测试建议 <script>不执行</script>",status:"SUBMITTED",reply:null,replied_at:null,created_at:"2026-10-25T00:00:00Z",version:4};
const announcement={id:"test-announcement",title:"本地测试公告",content:"纯文本公告",cover_file_id:null,status:"DRAFT",version:3,created_at:"2026-10-25T00:00:00Z",published_at:null};
const adminFile="app/admin/community-management.tsx";
test("community modules without read permission make no business requests and expose no writes",async()=>{
  for(const name of ["FeedbackManagement","AnnouncementManagement"]){let calls=0;const h=harness(adminFile,name,{permissions:new Set(),onFiles(){}},async()=>{calls++});await h.flush();assert.equal(calls,0);assert.equal(h.nodes().filter(n=>n.type==="button").length,0);h.dispose()}
});
test("empty and failed feedback lists never fall back to records; retry reads server",async()=>{
  let fail=true;const h=harness(adminFile,"FeedbackManagement",{permissions:new Set(["feedback.read"])},async()=>{if(fail)throw new Error("offline");return{items:[],next_cursor:null}});await h.flush();assert.match(h.html(),/后台请求失败/);assert.doesNotMatch(h.html(),/本地测试建议/);fail=false;h.nodes().find(n=>n.props?.retry).props.retry();await h.flush();assert.match(h.html(),/暂无符合条件的反馈/);h.dispose();
});
test("feedback read-only detail has no reply/manage actions and renders user text safely",async()=>{
  const h=harness(adminFile,"FeedbackManagement",{permissions:new Set(["feedback.read"])},async path=>path.includes("?")?{items:[feedback],next_cursor:null}:{...feedback,processing_records:[{action:"FEEDBACK_PROCESSING",admin_id:"test-admin",created_at:feedback.created_at},{action:"FEEDBACK_REPLIED",admin_id:"test-admin",created_at:feedback.created_at}]});await h.flush();h.button("查看反馈").props.onClick();await h.flush();assert.equal(h.button("发送官方回复"),undefined);assert.equal(h.button("标记处理中"),undefined);assert.match(h.html(),/&lt;script&gt;不执行&lt;\/script&gt;/);assert.match(h.html(),/标记处理 ·/);assert.match(h.html(),/官方回复 ·/);h.dispose();
});
test("feedback uncertain reply retry freezes body/key, carries version and reason; success only after server",async()=>{
  const writes=[];let fail=true;const permissions=new Set(["feedback.read","feedback.reply"]);const h=harness(adminFile,"FeedbackManagement",{permissions},async(path,init={})=>{if(init.method){writes.push(init);if(fail)throw new Error("offline");return{...feedback,status:"REPLIED",reply:"真实服务端回复",version:5}}return path.includes("?")?{items:[feedback],next_cursor:null}:feedback});await h.flush();h.button("查看反馈").props.onClick();await h.flush();h.change("textarea","真实服务端回复");await h.flush();h.button("发送官方回复").props.onClick();await assert.rejects(h.modal.onConfirm("本地测试原因"));await h.flush();assert.doesNotMatch(h.html(),/已由服务端保存/);await assert.rejects(h.modal.onConfirm("不同原因"),/保留原原因/);assert.equal(writes.length,1);fail=false;await h.modal.onConfirm("本地测试原因");await h.flush();assert.equal(writes.length,2);assert.equal(writes[0].body,writes[1].body);assert.equal(writes[0].headers["idempotency-key"],writes[1].headers["idempotency-key"]);assert.equal(JSON.parse(writes[0].body).version,4);assert.match(h.html(),/已由服务端保存/);h.dispose();
});
test("409 rereads latest feedback version without automatically replaying write",async()=>{
  let latest=feedback,writes=0;let h;h=harness(adminFile,"FeedbackManagement",{permissions:new Set(["feedback.read","feedback.manage"])},async(path,init={})=>{if(init.method){writes++;latest={...feedback,version:5,status:"PROCESSING"};throw new h.api.AdminApiError("冲突","RESOURCE_VERSION_CONFLICT",409)}return path.includes("?")?{items:[latest],next_cursor:null}:latest});await h.flush();h.button("查看反馈").props.onClick();await h.flush();h.button("标记处理中").props.onClick();await assert.rejects(h.modal.onConfirm("验证版本"),/重新读取/);await h.flush();assert.equal(writes,1);assert.match(h.html(),/版本 5/);assert.equal(h.button("标记处理中"),undefined);h.dispose();
});
test("late feedback detail cannot replace the current selected record",async()=>{
  let resolve;const h=harness(adminFile,"FeedbackManagement",{permissions:new Set(["feedback.read"])},async path=>path.includes("?")?{items:[feedback,{...feedback,id:"second",content:"第二条"}],next_cursor:null}:path.endsWith("second")?{...feedback,id:"second",content:"第二条"}:new Promise(r=>{resolve=r}));await h.flush();h.nodes().filter(n=>n.type==="button"&&n.props.children==="查看反馈")[0].props.onClick();await h.flush();h.nodes().filter(n=>n.type==="button"&&n.props.children==="查看反馈")[1].props.onClick();await h.flush();resolve(feedback);await h.flush();assert.match(h.html(),/第二条/);h.dispose();
});
test("first announcement draft works from empty list; published content is immutable in UI",async()=>{
  const h=harness(adminFile,"AnnouncementManagement",{permissions:new Set(["announcement.read","announcement.manage","announcement.publish"]),onFiles(){}},async path=>path.includes("?")?{items:[],next_cursor:null}:announcement);await h.flush();h.button("新建公告草稿").props.onClick();await h.flush();assert.ok(h.button("保存公告草稿"));assert.equal(h.button("保存公告草稿").props.disabled,true);h.dispose();
  const published={...announcement,status:"PUBLISHED",published_at:announcement.created_at};const p=harness(adminFile,"AnnouncementManagement",{permissions:new Set(["announcement.read","announcement.manage","announcement.publish"]),onFiles(){}},async path=>path.includes("?")?{items:[published],next_cursor:null}:published);await p.flush();p.button("查看公告").props.onClick();await p.flush();assert.equal(p.nodes().find(n=>n.type==="textarea").props.disabled,true);assert.equal(p.button("保存公告草稿"),undefined);assert.ok(p.button("停用公告"));p.dispose();
});
test("Web feedback guest does not query private feedback endpoints",async()=>{
  let calls=0;const h=harness("app/ConnectedCommunity.tsx","ConnectedFeedbackPage",{back(){},login(){}},async()=>{calls++});await h.flush();assert.equal(calls,0);assert.ok(h.button("前往登录"));assert.equal(h.button("提交建议"),undefined);h.dispose();
});
test("Web feedback unknown result locks draft, queries original request and never creates duplicate",async()=>{
  const writes=[];const paths=[];let lost=true;const request=async(path,init={})=>{paths.push(path);if(path.endsWith("policy"))return{max_characters:2000,hourly_limit:5};if(path.includes("/requests/"))return feedback;if(init.method==="POST"){writes.push(JSON.parse(init.body));if(lost){lost=false;throw new TypeError("network")};return feedback}return{items:[],next_cursor:null}};
  const h=harness("app/ConnectedCommunity.tsx","ConnectedFeedbackPage",{userId:"synthetic-user",back(){},login(){}},request);await h.flush();h.change("textarea","本地建议");await h.flush();h.button("提交建议").props.onClick();await h.flush();assert.equal(h.nodes().find(n=>n.type==="textarea").props.disabled,true);h.button("查询并重试原建议").props.onClick();await h.flush();assert.equal(writes.length,1);assert.ok(paths.some(path=>path===`/feedback/requests/${writes[0].client_request_id}`));assert.match(h.html(),/等待官方回复/);h.dispose();
});
test("Web public announcements SSR is loading, not a fixed reward or fake published banner",async()=>{
  const h=harness("app/ConnectedCommunity.tsx","PublicAnnouncements",{active:false,onOpen(){}},async()=>({items:[],next_cursor:null}));await h.flush();assert.match(h.html(),/正在读取平台公告/);assert.doesNotMatch(h.html(),/20%|report-off-platform|核实奖励/);h.dispose();
});
