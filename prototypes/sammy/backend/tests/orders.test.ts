import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { applications, users, listings, orders, paymentAttempts } from '../src/schema.js';
import { orderRules, simulationAvailable } from '../src/orders.js';
import { workflows, cases, type CaseData } from '../src/commerce-schema.js';
import { initialWorkflow } from '../src/commerce-core.js';
import { orderReviews } from '../src/marketplace-schema.js';

test('simulator requires explicit preview opt-in and fails closed in production',()=>{
 assert.equal(simulationAvailable({}),false);assert.equal(simulationAvailable({SAMMY_SIMULATED_PAYMENTS:'true'}),true);
 assert.equal(simulationAvailable({SAMMY_SIMULATED_PAYMENTS:'true',NODE_ENV:'production'}),false);
 assert.equal(simulationAvailable({SAMMY_SIMULATED_PAYMENTS:'true',VERCEL:'1'}),false);
 const preview={SAMMY_SIMULATED_PAYMENTS:'true',SAMMY_HOSTED_DEMO:'true',VERCEL:'1',VERCEL_ENV:'preview',NODE_ENV:'production'};
 assert.equal(simulationAvailable(preview),true);
 for(const patch of [
  {SAMMY_SIMULATED_PAYMENTS:'false'},{SAMMY_SIMULATED_PAYMENTS:undefined},
  {SAMMY_HOSTED_DEMO:undefined},{SAMMY_HOSTED_DEMO:'TRUE'},
  {VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_ENV:undefined},
  {VERCEL_ENV:'unknown'},{VERCEL:undefined},{VERCEL:'true'},
 ])assert.equal(simulationAvailable({...preview,...patch}),false,JSON.stringify(patch));
 assert.equal(simulationAvailable({SAMMY_HOSTED_DEMO:'true',SAMMY_SIMULATED_PAYMENTS:'true'}),false);
 const heroku={DYNO:'web.1',NODE_ENV:'production',SAMMY_HOSTED_DEMO:'true',SAMMY_SIMULATED_PAYMENTS:'true'};
 assert.equal(simulationAvailable(heroku),true);
 for(const patch of [{SAMMY_HOSTED_DEMO:undefined},{SAMMY_HOSTED_DEMO:'false'},{SAMMY_SIMULATED_PAYMENTS:undefined},{VERCEL_ENV:'production'},{DYNO:''},{DYNO:' '}])assert.equal(simulationAvailable({...heroku,...patch}),false);
 assert.equal(simulationAvailable({DYNO:'web.1',SAMMY_SIMULATED_PAYMENTS:'true'}),false);


});

test('order filters use workflow, case and review state before pagination and expose the same display status',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false});
 const req=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const register=async(phone:string)=>(await req('POST','/v1/auth/register',{phone,password:'filter-fixture-password',nickname:'Filter QA',accepted:true})).data;
  const buyer=await register('13800138074'),seller=await register('13800138075');
  const [listing]=await db.insert(listings).values({id:randomUUID(),ownerId:seller.profile.id,title:'Filtered service',description:'Order filter fixture service',game:'peaceElite',mode:'duo',category:'relaxed',priceFen:100}).returning();
  const now=new Date().toISOString(),due=new Date(Date.now()+86400000).toISOString(),expired=new Date(Date.now()-8*86400000).toISOString();
  const make=async(options:{stage?:'awaitingService'|'inService'|'awaitingAcceptance'|'completed'|'refunded';state?:CaseData['state'];status?:'unpaid'|'closed';terminatedAt?:string;reviewed?:boolean;id?:string;title?:string}={})=>{
   const [order]=await db.insert(orders).values({id:options.id??randomUUID(),buyerId:buyer.profile.id,sellerId:seller.profile.id,listingId:listing.id,requestId:randomUUID(),requestHash:'fixture',service:{id:listing.id,revision:1,title:options.title??'Workflow filter service',description:'Persisted order',providerName:'Distinct provider',mode:'duo',category:'relaxed',game:'peaceElite',unitPriceFen:100,photoMediaIds:[]},rules:orderRules,delivery:{gameName:'Buyer',gameId:'buyer-123',server:'qq',note:''},quantity:1,totalFen:100,status:options.status??'awaitingService',paidAt:options.status?null:new Date(),closedAt:options.status==='closed'?new Date():null}).returning();
   const caseId=options.state?randomUUID():null;
   await db.insert(workflows).values({orderId:order.id,data:{...initialWorkflow(),stage:options.stage??'awaitingService',activeCaseId:caseId,terminatedAt:options.terminatedAt??null,acceptanceDue:options.stage==='awaitingAcceptance'||options.state==='R02'?due:null}});
   if(caseId)await db.insert(cases).values({id:caseId,orderId:order.id,data:{state:options.state!,kind:'ordinary',claimantId:buyer.profile.id,amountFen:100,reason:'Fixture case',description:'Fixture case',evidenceIds:[],originalStage:'inService',remainingMs:null,edits:0,rounds:0,appeals:0,proposal:null,ruling:null,rulings:[],due, evidenceExtensionUsed:false,refundId:null,refundOutcome:null,refundSuccessAt:null,createdAt:now,updatedAt:now}});
   if(options.reviewed)await db.insert(orderReviews).values({orderId:order.id,buyerId:buyer.profile.id,sellerId:seller.profile.id,listingId:listing.id,buyerNickname:'Buyer',rating:5,text:'Completed service'});
   return order;
  };
  const fixtures=[
   {order:await make({status:'unpaid',state:'S01'}),want:'unpaid'},
   {order:await make({status:'closed',state:'R02'}),want:'closed'},
   {order:await make({stage:'inService'}),want:'inService'},
   {order:await make({stage:'awaitingAcceptance'}),want:'awaitingAcceptance'},
   {order:await make({state:'R02'}),want:'awaitingAcceptance'},
   {order:await make({state:'S01'}),want:'afterSales'},
   {order:await make({state:'pendingRefund'}),want:'refundProcessing'},
   {order:await make({state:'refundProcessing'}),want:'refundProcessing'},
   {order:await make({state:'refundFailed'}),want:'refundProcessing'},
   {order:await make({stage:'refunded',terminatedAt:now}),want:'refunded'},
   {order:await make({stage:'completed',terminatedAt:now}),want:'awaitingReview'},
   {order:await make({stage:'completed',terminatedAt:expired}),want:'completed'},
   {order:await make({stage:'completed',terminatedAt:now,reviewed:true}),want:'completed'},
  ];
  for(const want of new Set(fixtures.map(f=>f.want))){const result=await req('GET',`/v1/orders?filter=${want}`,undefined,buyer.token);assert.equal(result.status,200);assert.deepEqual(result.data.orders.map((entry:any)=>entry.order.id).sort(),fixtures.filter(f=>f.want===want).map(f=>f.order.id).sort());assert.ok(result.data.orders.every((entry:any)=>entry.displayStatus===want));}
  const detail=(await req('GET',`/v1/orders/${fixtures[4].order.id}`,undefined,buyer.token)).data;assert.equal(detail.displayStatus,'awaitingAcceptance');assert.equal(detail.activeCaseState,'R02');assert.equal(detail.acceptanceDue,due);
  const reviewed=(await req('GET',`/v1/orders/${fixtures[12].order.id}`,undefined,buyer.token)).data;assert.equal(reviewed.reviewed,true);assert.ok(reviewed.reviewDeadline);
  assert.equal((await req('GET','/v1/orders?filter=invalid',undefined,buyer.token)).status,400);
  for(let i=0;i<31;i++)await make();
  const hidden=await make({id:'00000000-0000-4000-8000-000000000001',title:'Outside first page'});
  const found=await req('GET','/v1/orders?q=Outside%20first%20page&filter=awaitingService',undefined,buyer.token);assert.equal(found.data.orders.length,1);assert.equal(found.data.orders[0].order.id,hidden.id);
  assert.equal((await req('GET',`/v1/orders?q=${fixtures[0].order.id}`,undefined,buyer.token)).data.orders[0].order.id,fixtures[0].order.id);
  assert.equal((await req('GET','/v1/orders?q=Distinct%20provider&filter=inService',undefined,buyer.token)).data.orders.length,1);
  assert.equal((await req('GET','/v1/orders?q=%25',undefined,buyer.token)).data.orders.length,0);
  assert.equal((await req('GET','/v1/orders?q=Outside%20first%20page',undefined,seller.token)).data.orders.length,0);
  assert.equal((await req('GET','/v1/orders?role=seller&q=Outside%20first%20page',undefined,seller.token)).data.orders.length,1);
 }finally{await app.close();await pool.end();}
});
test('persisted direct orders preserve snapshots, ownership, payment uncertainty, restrictions and race outcomes',async()=>{
 process.env.SAMMY_SIMULATED_PAYMENTS='true';const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);let app=buildApp({db,logger:false});
 const req=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const signup=async(phone:string)=>(await req('POST','/v1/auth/register',{phone,password:'order-fixture-password',nickname:'Order QA',bio:'Order biography',accepted:true})).data;
  const buyer=await signup('13800138071'),seller=await signup('13800138072'),stranger=await signup('13800138073');
  await db.update(users).set({isAdmin:true}).where(eq(users.id,stranger.profile.id));
  const [approval]=await db.insert(applications).values({userId:seller.profile.id,status:'approved',reviewedAt:new Date(),reviewerId:stranger.profile.id,agreementVersion:'qa',snapshot:{nickname:'Snapshot provider',bio:'Approved',avatarMediaId:randomUUID(),draft:{gameName:'QA',gameId:'qa-123',server:'wechat',rank:'Ace',kd:'3',experience:'Years',playStyle:'Calm',mode:'duo',voiceMediaId:randomUUID()}}}).returning();
  const listingId=randomUUID();await db.insert(listings).values({id:listingId,ownerId:seller.profile.id,title:'Snapshot service',description:'Original service description',game:'valorant',serviceType:'coaching',reviewStatus:'pending',mode:'duo',category:'relaxed',priceFen:3900,status:'draft',applicationId:approval.id,publicationConsentAt:new Date()});
  const body={listingId,listingRevision:1,expectedUnitPriceFen:3900,quantity:2,delivery:{gameName:'Buyer game',gameId:'小熊#CN1',server:'china',note:'Proposal only'},requestId:'order-request-0001',rulesVersion:orderRules.version,accepted:true};
  assert.equal((await req('POST','/v1/orders',body)).status,401);
  assert.equal((await req('POST','/v1/orders',{...body,totalFen:1},buyer.token)).status,400);
  assert.equal((await req('POST','/v1/orders',{...body,quantity:25},buyer.token)).status,400);
  assert.equal((await req('POST','/v1/orders',body,seller.token)).status,403);
  assert.equal((await req('POST','/v1/orders',body,buyer.token)).data.error,'listingUnavailable');
  await assert.rejects(db.update(listings).set({status:'published'}).where(eq(listings.id,listingId)));
  await db.update(listings).set({reviewStatus:'approved',status:'published'}).where(eq(listings.id,listingId));
  assert.equal((await req('POST','/v1/orders',{...body,expectedUnitPriceFen:1},buyer.token)).data.error,'orderQuoteChanged');
  const created=await Promise.all([req('POST','/v1/orders',body,buyer.token),req('POST','/v1/orders',body,buyer.token)]);assert.ok(created.every(r=>r.status===200));assert.equal(created[0].data.order.id,created[1].data.order.id);
  const id=created[0].data.order.id;assert.equal(created[0].data.order.totalFen,7800);assert.equal(created[0].data.order.rules.version,orderRules.version);assert.equal(created[0].data.order.status,'unpaid');assert.equal(created[0].data.order.service.game,'valorant');assert.equal(created[0].data.order.service.serviceType,'coaching');
  assert.equal((await req('GET',`/v1/orders/${id}`,undefined,stranger.token)).status,404);assert.equal((await req('POST',`/v1/orders/${id}/cancel`,{},seller.token)).status,404);
  assert.equal((await req('GET','/v1/orders?role=seller',undefined,seller.token)).data.orders.length,1);
  await db.update(listings).set({priceFen:9000,title:'Edited service',status:'draft',revision:2}).where(eq(listings.id,listingId));
  const retry=await req('POST','/v1/orders',body,buyer.token);assert.equal(retry.data.order.id,id);assert.equal(retry.data.order.service.title,'Snapshot service');assert.equal(retry.data.order.totalFen,7800);
  assert.equal((await req('POST','/v1/orders',{...body,quantity:3},buyer.token)).data.error,'orderRequestConflict');
  assert.equal((await req('POST',`/v1/orders/${id}/simulate-payment`,{requestId:'attempt-0001',outcome:'success'},buyer.token)).data.error,'listingUnavailable');
  await assert.rejects(db.update(listings).set({status:'published',applicationId:approval.id,publicationConsentAt:new Date()}).where(eq(listings.id,listingId)));
  await db.update(listings).set({reviewStatus:'approved',status:'published',applicationId:approval.id,publicationConsentAt:new Date()}).where(eq(listings.id,listingId));
  const pending=await req('POST',`/v1/orders/${id}/simulate-payment`,{requestId:'attempt-0001',outcome:'pending'},buyer.token);assert.equal(pending.data.order.status,'unpaid');assert.equal(pending.data.attempts[0].status,'pending');
  assert.equal((await req('POST',`/v1/orders/${id}/cancel`,{},buyer.token)).data.error,'paymentPending');
  assert.equal((await req('POST',`/v1/orders/${id}/simulate-payment`,{requestId:'another-attempt',outcome:'success'},buyer.token)).data.error,'paymentPending');
  await app.close();app=buildApp({db,logger:false});assert.equal((await req('GET',`/v1/orders/${id}`,undefined,buyer.token)).data.attempts[0].status,'pending');
  const paid=await Promise.all([req('POST',`/v1/orders/${id}/simulate-payment`,{requestId:'attempt-0001',outcome:'success'},buyer.token),req('POST',`/v1/orders/${id}/simulate-payment`,{requestId:'attempt-0001',outcome:'success'},buyer.token)]);assert.ok(paid.every(r=>r.status===200));assert.ok(paid.every(r=>r.data.order.status==='awaitingService'));assert.equal((await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId,id))).length,1);
  assert.equal((await req('POST',`/v1/orders/${id}/cancel`,{},buyer.token)).status,409);
  assert.equal((await req('GET',`/v1/admin/orders/${id}`,undefined,stranger.token)).status,200);assert.equal((await req('GET','/v1/admin/orders',undefined,buyer.token)).status,403);
  const fresh={...body,listingRevision:2,expectedUnitPriceFen:9000,requestId:'order-request-0002'};
  const second=(await req('POST','/v1/orders',fresh,buyer.token)).data.order;
  assert.equal((await req('POST',`/v1/orders/${second.id}/simulate-payment`,{requestId:'failed-attempt',outcome:'failure'},buyer.token)).data.attempts[0].status,'failed');
  await db.update(users).set({suspended:true}).where(eq(users.id,buyer.profile.id));
  assert.equal((await req('GET',`/v1/orders/${id}`,undefined,buyer.token)).status,200);assert.equal((await req('GET','/v1/me',undefined,buyer.token)).status,200);assert.equal((await req('PATCH','/v1/me',{bio:'Blocked'},buyer.token)).status,403);
  assert.equal((await req('POST','/v1/orders',{...fresh,requestId:'blocked-new-order'},buyer.token)).status,403);assert.equal((await req('POST',`/v1/orders/${second.id}/simulate-payment`,{requestId:'blocked-attempt',outcome:'success'},buyer.token)).status,403);
  assert.equal((await req('POST',`/v1/orders/${second.id}/cancel`,{},buyer.token)).data.order.status,'closed');
  await db.update(users).set({suspended:false}).where(eq(users.id,buyer.profile.id));
  await db.update(users).set({providerSuspended:true}).where(eq(users.id,seller.profile.id));
  assert.equal((await req('POST','/v1/orders',{...fresh,requestId:'blocked-provider'},buyer.token)).status,409);assert.equal((await req('GET','/v1/orders?role=seller',undefined,seller.token)).status,200);
  await db.update(users).set({providerSuspended:false}).where(eq(users.id,seller.profile.id));
  const race=(await req('POST','/v1/orders',{...fresh,requestId:'order-request-race'},buyer.token)).data.order;
  const outcomes=await Promise.all([req('POST',`/v1/orders/${race.id}/cancel`,{},buyer.token),req('POST',`/v1/orders/${race.id}/simulate-payment`,{requestId:'racing-attempt',outcome:'success'},buyer.token)]);assert.deepEqual(outcomes.map(o=>o.status).sort(),[200,409]);
  const [final]=await db.select().from(orders).where(eq(orders.id,race.id));assert.ok(final.status==='closed'||final.status==='awaitingService');assert.equal(final.status==='closed',final.paidAt===null);
  await db.update(users).set({suspended:true}).where(eq(users.id,buyer.profile.id));assert.equal((await req('POST','/v1/auth/logout',{},buyer.token)).status,200);
 }finally{await app.close();await pool.end();}
});

test('checkout delivery validation follows the authoritative listing game for all four games',async()=>{
 process.env.SAMMY_SIMULATED_PAYMENTS='true';const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false});
 const req=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const register=async(phone:string)=>(await req('POST','/v1/auth/register',{phone,password:'delivery-fixture-password',nickname:'Delivery QA',accepted:true})).data;
  const buyer=await register('13800138176'),seller=await register('13800138177');
  const [approval]=await db.insert(applications).values({userId:seller.profile.id,status:'approved',reviewedAt:new Date(),reviewerId:buyer.profile.id,agreementVersion:'fixture',snapshot:{nickname:'Provider',bio:'Approved',avatarMediaId:randomUUID(),draft:{gameName:'Provider',gameId:'provider-123',server:'qq',rank:'Ace',kd:'3',experience:'Years',playStyle:'Calm',mode:'duo',voiceMediaId:null}}}).returning();
  for(const game of ['peaceElite','deltaForce','honorOfKings','valorant'] as const){
   const [listing]=await db.insert(listings).values({id:randomUUID(),ownerId:seller.profile.id,title:'Game-specific delivery',description:'Use the purchased game delivery details',game,serviceType:'coaching',priceFen:3900,mode:'duo',category:'relaxed',reviewStatus:'approved',status:'published',applicationId:approval.id,publicationConsentAt:new Date()}).returning();
   const delivery=game==='valorant'?{gameName:'小熊',gameId:'熊崽队长#CN一',server:'china',note:''}:{gameName:'小熊',gameId:'player-123',server:'wechat',note:''};
   const body={listingId:listing.id,listingRevision:listing.revision,expectedUnitPriceFen:3900,quantity:1,delivery,requestId:randomUUID(),rulesVersion:orderRules.version,accepted:true};
   const valid=await req('POST','/v1/orders',body,buyer.token);assert.equal(valid.status,200);assert.equal(valid.data.order.service.game,game);assert.deepEqual(valid.data.order.delivery,delivery);
   const invalid=game==='valorant'?[{...delivery,server:'qq'},{...delivery,gameId:'plain-id'},{...delivery,gameId:'Name#'},{...delivery,gameId:'#Tag'},{...delivery,gameId:'Name#Tag#More'},{...delivery,gameId:'Name\n#Tag'}]:[{...delivery,server:'china'},{...delivery,gameId:'熊崽#CN一'}];
   for(const details of invalid)assert.equal((await req('POST','/v1/orders',{...body,delivery:details,requestId:randomUUID()},buyer.token)).status,400,`${game}: ${JSON.stringify(details)}`);
   assert.equal((await req('POST','/v1/orders',{...body,game:game==='valorant'?'peaceElite':'valorant',requestId:randomUUID()},buyer.token)).status,400);
  }
 }finally{await app.close();await pool.end();}
});
