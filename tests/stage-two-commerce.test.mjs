import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { commerceContract } from "./helpers/commerce-contract.mjs";

const context={exports:{},require:()=>commerceContract};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/connected-commerce.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {hoursToSeconds,yuanInputToCent}=context.exports;
test("new flow requires both rule version and a non-null fulfillment snapshot; old V3.1 remains legacy",()=>{
  for(const order of [{rule_version:"V3.1"},{rule_version:"V3.1",fulfillment_seconds:null},{rule_version:"V3.0",fulfillment_seconds:3600}]) assert.equal(commerceContract.isFulfillmentOrder(order),false);
  assert.equal(commerceContract.isFulfillmentOrder({rule_version:"V3.1",fulfillment_seconds_snapshot:1}),true);
  assert.equal(commerceContract.isFulfillmentOrder({rule_version:"V3.1",fulfillment_seconds:604800}),true);
  assert.equal(commerceContract.isFulfillmentOrder({rule_version:"V3.1",fulfillment_seconds_snapshot:null,fulfillment_seconds:3600}),false);
});
test("completion deadline round-trips one second and all representative legal boundaries",()=>{
  for(const seconds of [1,61,3599,3600,604799,604800]) assert.equal(hoursToSeconds(String(seconds/3600)),seconds);
  for(const hours of ["0","169","0.0001","abc","Infinity","-1"]) assert.throws(()=>hoursToSeconds(hours));
});
test("yuan input keeps exact integer cents including 199.99 and 200.00 boundaries",()=>{
  for(const [value,cent]of [["199.99","19999"],["200","20000"],["0.01","1"],["90071992547409.91","9007199254740991"]]) assert.equal(yuanInputToCent(value),cent);
  for(const value of ["1.001","-1","NaN","0"]) assert.throws(()=>yuanInputToCent(value));
});
test("evidence requires every selected file to be private, unbound, verified and approved; video starts at 20000 cents",()=>{
  const files=Array.from({length:5},(_,i)=>({id:String(i),file_type:"ORDER_FULFILLMENT_IMAGE",visibility:"PRIVATE",upload_status:"VERIFIED",moderation_status:"APPROVED"}));
  const ids=files.map(file=>file.id);
  const check=(rows,selected=ids,paid="19999")=>commerceContract.fulfillmentEvidenceError(rows,selected,paid);
  assert.equal(check(files),"");assert.ok(check(files,ids,"20000"));
  assert.ok(check(files,[...ids,"unknown"]));assert.ok(check(files,ids.slice(0,4)));
  assert.ok(check(files,[...ids,ids[0]]));
  for(const change of [{visibility:"PUBLIC"},{bound_order_id:"other-order"},{upload_status:"PENDING"},{moderation_status:"PENDING"},{file_type:"PRODUCT_IMAGE"}]) assert.ok(check(files.map((file,i)=>i?file:{...file,...change})));
  const video={id:"video",file_type:"ORDER_FULFILLMENT_VIDEO",visibility:"PRIVATE",upload_status:"VERIFIED",moderation_status:"APPROVED"};
  assert.equal(check([...files,video],[...ids,video.id],"20000"),"");
});
test("local default is real API, and design catalog needs explicit opt-in",()=>{
  const source=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  const match=source.match(/const getLocalPreview = \(\) => (.*);/);
  assert.ok(match);
  for(const [search,expected]of [["",false],["?seller=real",false],["?preview=catalog",true],["?preview=trade-v31",true]]) {
    const value=vm.runInNewContext("("+match[1]+")",{window:{location:{hostname:"127.0.0.1",search}},URLSearchParams});
    assert.equal(value,expected);
  }
});
test("native runtime uses the pure commerce entry, never the server crypto barrel",async()=>{
  const entry=createRequire(new URL("../apps/mobile/package.json",import.meta.url))("@xiongzai/contracts/commerce");
  assert.equal(entry.isFulfillmentOrder({rule_version:"V3.1",fulfillment_seconds:3600}),true);
  assert.equal(Object.keys(entry.productGameLabels).length,4);
  const source=readFileSync(new URL("../packages/contracts/src/commerce.ts",import.meta.url),"utf8");
  assert.doesNotMatch(source,/node:|pagination|createHmac/);
  for(const file of ["seller/seller-order-domain.ts","checkout/fulfillment-evidence.tsx","checkout/order-detail-screen.tsx","seller/seller-service-create-screen.tsx","seller/seller-service-edit-screen.tsx","discovery/service-detail-screen.tsx"]){
    const text=readFileSync(new URL("../apps/mobile/src/features/"+file,import.meta.url),"utf8");
    assert.match(text,/from "@xiongzai\/contracts\/commerce"/);
    assert.doesNotMatch(text,/import (?!type)[^;]*from "@xiongzai\/contracts";/);
  }
});
test("native evidence cannot persist short-lived URLs through an external browser",()=>{
  const source=readFileSync(new URL("../apps/mobile/src/features/checkout/fulfillment-evidence.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(source,/openURL|expo-linking|localStorage|AsyncStorage|console\./);
  assert.match(source,/EvidenceVideo/);
  assert.match(source,/session\.dispose\(\)/);
  const access=readFileSync(new URL("../apps/mobile/src/features/checkout/evidence-preview-session.ts",import.meta.url),"utf8");
  assert.match(access,/trustedEvidenceUrl\(result\.access\.url\)/);
  assert.doesNotMatch(access,/AsyncStorage|SecureStore|console\.|queryClient|setQueryData/);
  const web=readFileSync(new URL("../app/ConnectedFiles.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(web,/window\.open|location\.replace|localStorage|sessionStorage/);
  assert.match(web,/setAccesses\(current/);
  assert.match(web,/crossOrigin="anonymous"/);
});

test("order snapshot file IDs resolve through the public metadata API, never relative image URLs",async()=>{
  const require=createRequire(import.meta.url),state=[],effects=[];let index=0;
  const fileId="12345678-1234-1234-1234-123456789abc",requests=[];
  const hooks={useState:initial=>{const i=index++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=value;}];},useEffect:effect=>effects.push(effect),useLayoutEffect:()=>{},useRef:()=>({current:null})};
  const imageModule={exports:{},require:name=>name==="react"?hooks:require(name),window:{location:{origin:"http://127.0.0.1:3001"}},URL,AbortController,setTimeout,clearTimeout,fetch:async url=>{requests.push(url.href);return{ok:true,json:async()=>({mime_type:"image/png",content_url:"http://127.0.0.1:9000/public/synthetic.png"})};}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/CatalogImage.tsx",import.meta.url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,imageModule);
  const render=()=>{index=0;return imageModule.exports.CatalogImage({src:fileId,alt:"订单商品"});};
  assert.equal(render().props.src,"/assets/placeholders/service.svg");effects[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requests,["http://127.0.0.1:3002/api/v1/files/"+fileId]);
  assert.equal(render().props.src,"http://127.0.0.1:9000/public/synthetic.png");
  const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const section of ["order-detail-product","seller-order-product"]) assert.ok(page.includes(`className="checkout-service ${section}"><CatalogImage src={order.product_image} alt={order.product_title}`));
  assert.match(page,/avatarFileId: order\.seller_avatar/);
  assert.doesNotMatch(page,/title: "预约明天|title: "今晚 20:00|title: "退款 ¥25\.00"/);
});

// Execute the real component's handlers with deterministic hook state. This is a
// component unit harness, not browser E2E; Chrome separately verifies the UI.
function fulfillmentHarness({request,onUpdated,files=[]}) {
  const require=createRequire(import.meta.url),states=[],refs=[];
  let stateIndex=0,refIndex=0;
  const hooks={
    useState(initial){const index=stateIndex++;if(!(index in states))states[index]=index===0?files:index===3?"读取失败":typeof initial==="function"?initial():initial;return[states[index],next=>{states[index]=typeof next==="function"?next(states[index]):next;}];},
    useRef(initial){const index=refIndex++;return refs[index]??=( {current:initial} );},
    useCallback:callback=>callback,useEffect:()=>{},
  };
  const moduleContext={exports:{},require:name=>name==="react"?hooks:name==="react/jsx-runtime"?require(name):commerceContract};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/FulfillmentOrderPanel.tsx",import.meta.url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,moduleContext);
  const render=()=>{stateIndex=0;refIndex=0;return moduleContext.exports.FulfillmentOrderPanel({order:{id:"unit-order",version:1,rule_version:"V3.1",fulfillment_seconds:3600,after_sale_status:"NONE",paid_amount_cent:"19999",seller_available_actions:["COMPLETE"]},viewerRole:"seller",request,onUpdated});};
  const find=(node,label)=>{if(!node||typeof node!=="object")return null;if(node.type==="button"&&node.props.children===label)return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,label);if(result)return result;}return null;};
  return {render,find,states};
}
test("failed real-record reload is caught, resets the lock and never reports success",async()=>{
  let calls=0;
  const harness=fulfillmentHarness({request:async()=>({items:[]}),onUpdated:async()=>{calls++;throw new Error("unit network failure");}});
  const button=harness.find(harness.render(),"重新加载");assert.ok(button);
  button.props.onClick();button.props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);assert.equal(harness.states[2],false);
  assert.match(harness.states[3],/最新订单读取失败/);assert.equal(harness.states[4],"");
});
test("complete-upload retry locks duplicate clicks and only sends completion, never another PUT",async()=>{
  const calls=[];let fail;
  const harness=fulfillmentHarness({files:[{id:"unit-file",file_type:"ORDER_FULFILLMENT_IMAGE",upload_status:"PENDING",moderation_status:"PENDING",visibility:"PRIVATE"}],request:(url,init)=>{calls.push([url,init?.method]);return new Promise((_,reject)=>{fail=reject;});},onUpdated:async()=>{}});
  const button=harness.find(harness.render(),"重试完成校验");assert.ok(button);
  button.props.onClick();button.props.onClick();
  assert.deepEqual(calls,[["/files/unit-file/complete","POST"]]);
  fail(new Error("unit offline"));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(harness.states[2],false);assert.match(harness.states[3],/不会重复上传文件/);assert.equal(harness.states[4],"");
});
