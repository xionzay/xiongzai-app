import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiClientError } from '../src/api/api-error';
import { formatCent } from '../src/utils/money';
import type { OrderApiView } from '../src/types/api';

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(v: unknown): Node[] { if(Array.isArray(v))return v.flatMap(nodes);if(!v||typeof v!=='object'||!('props' in v))return [];const n=v as Node;return [n,...nodes(n.props.children)]; }
function harness(overrides: Partial<OrderApiView> = {}, online = true) {
  const require=createRequire(import.meta.url), effects:(()=>void)[]=[], routes:unknown[]=[], writes:unknown[]=[], alerts:{onPress?():void}[][]=[], notices:unknown[]=[];
  let unlock:(value:unknown)=>void=()=>{}, reads=0, deferred=false, conflict=false, refreshes=0, signal:AbortSignal|undefined;
  const item={id:'order',seller_id:'seller',product_id:'product',seller_name:'真实店铺',seller_avatar:'avatar',product_title:'真实商品',product_image:'cover',sku_name:'规格',quantity:2,status:'PENDING_PAYMENT',payment_status:'CREATED',payable_amount_cent:'900719925474099301',paid_amount_cent:'0',version:3,available_actions:['CANCEL','PAY'],...overrides} as OrderApiView;
  let latest={...item,available_actions:item.available_actions??[],refunds:[],review:null};
  const context={AbortController,exports:{} as {BuyerOrderCard(props:unknown):unknown;buyerCardActions(item:OrderApiView):{code:string;label:string}[]},require(name:string):unknown {
    if(name==='react/jsx-runtime'||name==='@xiongzai/contracts/commerce')return require(name);
    if(name==='react')return {useRef:(current:unknown)=>({current}),useState:(v:unknown)=>[v,(x:unknown)=>notices.push(x)],useEffect:(f:()=>()=>void)=>effects.push(f())};
    if(name==='react-native')return {View:'View',Text:'Text',Pressable:'Pressable',StyleSheet:{create:(v:unknown)=>v,hairlineWidth:1},Alert:{alert:(_a:unknown,_b:unknown,buttons:{onPress?():void}[])=>alerts.push(buttons)}};
    if(name==='expo-router')return {router:{push:(route:unknown)=>routes.push(route)}};
    if(name==='@/auth/runtime')return {apiClient:{request:(_path:string,options:{signal:AbortSignal})=>{signal=options.signal;reads++;return deferred?new Promise(resolve=>{unlock=resolve;}):Promise.resolve(latest);}}};
    if(name==='@/api/api-error')return {ApiClientError};
    if(name.endsWith('order-api'))return {cancelOrder:async(...args:unknown[])=>{writes.push(args);if(conflict)throw new ApiClientError('RESOURCE_VERSION_CONFLICT','conflict',409);},confirmOrderComplete:async(...args:unknown[])=>writes.push(args)};
    if(name.endsWith('chat-api'))return {createConsultation:async()=>({id:'consult'}),createOrderConversation:async()=>({id:'chat'})};
    if(name.endsWith('checkout-domain'))return {formatServiceTime:()=> '预约快照',orderErrorMessage:()=> '请求失败，请重试'};
    if(name.endsWith('use-online-status'))return {useOnlineStatus:()=>online};
    if(name.endsWith('query-client'))return {queryClient:{invalidateQueries:async()=>{refreshes++;}}};
    if(name.endsWith('theme/tokens'))return {colors:{}};
    if(name.endsWith('utils/money'))return {formatCent};
    if(name.startsWith('@/components/'))return new Proxy({},{get:(_t,key)=>String(key)});
    throw new Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/checkout/buyer-order-card.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  const tree=nodes(context.exports.BuyerOrderCard({item,state:'待付款'}));
  const press=(label:string)=>{const node=tree.find(n=>n.props.accessibilityLabel===label);assert.ok(node);(node.props.onPress as ()=>void)();};
  return {item,tree,press,routes,writes,alerts,notices,actions:()=>context.exports.buyerCardActions(item),reads:()=>reads,refreshes:()=>refreshes,defer:()=>{deferred=true;},resolve:()=>unlock(latest),unmount:()=>effects.forEach(f=>f()),aborted:()=>signal?.aborted,stale:()=>{latest={...latest,version:4};},revoke:()=>{latest={...latest,available_actions:[]};},conflict:()=>{conflict=true;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('订单卡片显示快照头像、方图、数量和超安全整数金额；无嵌套操作按钮',()=>{
  const h=harness();const images=h.tree.filter(n=>n.type==='FileImage');assert.deepEqual(images.map(n=>n.props.fileId),['avatar','cover']);
  assert.ok(h.tree.some(n=>n.props.children===formatCent(h.item.payable_amount_cent)));
  assert.ok(h.tree.some(n=>Array.isArray(n.props.children)&&n.props.children.includes(2)));
  for(const n of h.tree.filter(n=>n.type==='Pressable'))assert.equal(nodes(n.props.children).some(child=>child.type==='Pressable'),false);
  h.press('查看真实店铺的店铺');assert.equal((h.routes[0] as {pathname:string}).pathname,'/companions/[id]');
});
test('列表操作严格来自服务端；缺权限和重复评价不出现，更多操作可展开',()=>{
  assert.deepEqual(Array.from(harness({available_actions:[]}).actions(),a=>a.code),['CONTACT']);
  const h=harness({status:'COMPLETED',reviewed:true,available_actions:['CREATE_REVIEW','VIEW_REVIEW','CREATE_COMPLAINT','VIEW_REFUND','VIEW_SERVICE']});
  assert.equal(h.actions().some(a=>a.code==='CREATE_REVIEW'),false);assert.ok(h.tree.some(n=>n.props.accessibilityLabel==='更多订单操作'));
  const paid=harness({status:'PENDING_ACCEPT',payment_status:'PAID',paid_amount_cent:'2500'});assert.ok(paid.tree.some(n=>n.props.children==='¥25.00'));
});
test('付款入口单飞，页面卸载后不跳转；离线不能提交',async()=>{
  const h=harness();h.defer();h.press('立即付款');h.press('立即付款');assert.equal(h.reads(),1);h.unmount();assert.equal(h.aborted(),true);h.resolve();await settle();assert.equal(h.routes.length,0);
  const offline=harness({},false);offline.press('立即付款');assert.equal(offline.reads(),0);assert.ok(offline.tree.filter(n=>['立即付款','取消订单'].includes(String(n.props.accessibilityLabel))).every(n=>n.props.disabled===true));
});
test('取消订单必须二次确认并提交最新version；重复确认不重复写',async()=>{
  const h=harness();h.defer();h.press('取消订单');assert.equal(h.writes.length,0);const confirm=h.alerts[0]!.at(-1)!;confirm.onPress!();confirm.onPress!();assert.equal(h.reads(),1);h.resolve();await settle();assert.equal(h.writes.length,1);assert.deepEqual(Array.from(h.writes[0] as unknown[]).slice(0,2),['order',3]);assert.equal(h.refreshes(),2);
});
test('旧版本和服务端CAS冲突均刷新列表和详情，不静默重试写操作',async()=>{
  const stale=harness();stale.stale();stale.press('取消订单');stale.alerts[0]!.at(-1)!.onPress!();await settle();assert.equal(stale.writes.length,0);assert.equal(stale.refreshes(),2);
  const conflict=harness();conflict.conflict();conflict.press('取消订单');conflict.alerts[0]!.at(-1)!.onPress!();await settle();assert.equal(conflict.writes.length,1);assert.equal(conflict.refreshes(),2);assert.ok(conflict.notices.includes('订单状态已更新，请核对后重新操作。'));
});
test('点击时重新验证服务端权限，已撤回付款能力不能导航；确认收货使用版本锁',async()=>{
  const revoked=harness();revoked.revoke();revoked.press('立即付款');await settle();assert.equal(revoked.routes.length,0);assert.equal(revoked.refreshes(),2);
  const confirm=harness({status:'PENDING_BUYER_CONFIRM',payment_status:'PAID',available_actions:['CONFIRM_COMPLETE']});confirm.press('确认收货');assert.equal(confirm.writes.length,0);confirm.alerts[0]!.at(-1)!.onPress!();await settle();assert.deepEqual(Array.from(confirm.writes[0] as unknown[]),['order',3]);
});
