import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { applications, users, listings, orders, paymentAttempts } from '../src/schema.js';
import { orderRules, simulationAvailable } from '../src/orders.js';

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

});
test('persisted direct orders preserve snapshots, ownership, payment uncertainty, restrictions and race outcomes',async()=>{
 process.env.SAMMY_SIMULATED_PAYMENTS='true';const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);let app=buildApp({db,logger:false});
 const req=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const signup=async(phone:string)=>(await req('POST','/v1/auth/register',{phone,password:'order-fixture-password',nickname:'Order QA',bio:'Order biography',accepted:true})).data;
  const buyer=await signup('13800138071'),seller=await signup('13800138072'),stranger=await signup('13800138073');
  await db.update(users).set({isAdmin:true}).where(eq(users.id,stranger.profile.id));
  const [approval]=await db.insert(applications).values({userId:seller.profile.id,status:'approved',reviewedAt:new Date(),reviewerId:stranger.profile.id,agreementVersion:'qa',snapshot:{nickname:'Snapshot provider',bio:'Approved',avatarMediaId:randomUUID(),draft:{gameName:'QA',gameId:'qa-123',server:'wechat',rank:'Ace',kd:'3',experience:'Years',playStyle:'Calm',mode:'duo',voiceMediaId:randomUUID()}}}).returning();
  const listingId=randomUUID();await db.insert(listings).values({id:listingId,ownerId:seller.profile.id,title:'Snapshot service',description:'Original service description',game:'peaceElite',mode:'duo',category:'relaxed',priceFen:3900,status:'published',applicationId:approval.id,publicationConsentAt:new Date()});
  const body={listingId,listingRevision:1,expectedUnitPriceFen:3900,quantity:2,delivery:{gameName:'Buyer game',gameId:'buyer-123',server:'wechat',note:'Proposal only'},requestId:'order-request-0001',rulesVersion:orderRules.version,accepted:true};
  assert.equal((await req('POST','/v1/orders',body)).status,401);
  assert.equal((await req('POST','/v1/orders',{...body,totalFen:1},buyer.token)).status,400);
  assert.equal((await req('POST','/v1/orders',{...body,quantity:25},buyer.token)).status,400);
  assert.equal((await req('POST','/v1/orders',body,seller.token)).status,403);
  assert.equal((await req('POST','/v1/orders',{...body,expectedUnitPriceFen:1},buyer.token)).data.error,'orderQuoteChanged');
  const created=await Promise.all([req('POST','/v1/orders',body,buyer.token),req('POST','/v1/orders',body,buyer.token)]);assert.ok(created.every(r=>r.status===200));assert.equal(created[0].data.order.id,created[1].data.order.id);
  const id=created[0].data.order.id;assert.equal(created[0].data.order.totalFen,7800);assert.equal(created[0].data.order.rules.version,orderRules.version);assert.equal(created[0].data.order.status,'unpaid');
  assert.equal((await req('GET',`/v1/orders/${id}`,undefined,stranger.token)).status,404);assert.equal((await req('POST',`/v1/orders/${id}/cancel`,{},seller.token)).status,404);
  assert.equal((await req('GET','/v1/orders?role=seller',undefined,seller.token)).data.orders.length,1);
  await db.update(listings).set({priceFen:9000,title:'Edited service',status:'draft',revision:2}).where(eq(listings.id,listingId));
  const retry=await req('POST','/v1/orders',body,buyer.token);assert.equal(retry.data.order.id,id);assert.equal(retry.data.order.service.title,'Snapshot service');assert.equal(retry.data.order.totalFen,7800);
  assert.equal((await req('POST','/v1/orders',{...body,quantity:3},buyer.token)).data.error,'orderRequestConflict');
  assert.equal((await req('POST',`/v1/orders/${id}/simulate-payment`,{requestId:'attempt-0001',outcome:'success'},buyer.token)).data.error,'listingUnavailable');
  await db.update(listings).set({status:'published'}).where(eq(listings.id,listingId));
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
