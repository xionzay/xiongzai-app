import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { createSession } from '../src/auth.js';
import { applications, listings, orders, users } from '../src/schema.js';
import { initialWorkflow } from '../src/commerce-core.js';
import { cases, notifications, workflows, type CaseData } from '../src/commerce-schema.js';
import { orderRules } from '../src/orders.js';
import { beijingPeriod, reviewEligibility } from '../src/marketplace.js';

let phoneSequence=900;
async function fixture(){
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);
 const app=buildApp({db,logger:false});
 const request=async(method:any,url:string,payload?:any,token?:string)=>{
  const response=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});
  return {status:response.statusCode,data:response.json()};
 };
 const person=async(isAdmin=false)=>{const [user]=await db.insert(users).values({phone:'1380013'+String(++phoneSequence).padStart(4,'0'),nickname:'Private live name',bio:'Unapproved live bio',passwordHash:'fixture',isAdmin}).returning();return {...user,token:await createSession(db,user.id)};};
 const buyer=await person(),seller=await person(),other=await person(),admin=await person(true);
 const [approval]=await db.insert(applications).values({userId:seller.id,status:'approved',agreementVersion:'fixture',reviewedAt:new Date(),reviewerId:admin.id,snapshot:{nickname:'Approved public name',bio:'Approved public bio',avatarMediaId:randomUUID(),draft:{gameName:'Secret game handle',gameId:'secret-game-id',server:'wechat',rank:'Ace',kd:'3',experience:'Years',playStyle:'Patient',mode:'duo',voiceMediaId:null}}}).returning();
 const [listing]=await db.insert(listings).values({id:randomUUID(),ownerId:seller.id,title:'Honest companion service',description:'Practice with an approved companion.',game:'peaceElite',mode:'duo',category:'relaxed',priceFen:10000,status:'published',reviewStatus:'approved',reviewSubmittedAt:new Date(),reviewedAt:new Date(),reviewerId:admin.id,applicationId:approval.id,publicationConsentAt:new Date()}).returning();
 const makeOrder=async(options:{stage?:ReturnType<typeof initialWorkflow>['stage'];ageMs?:number;refundedFen?:number;paid?:boolean;createdAt?:Date;quantity?:number}={})=>{
  const paid=options.paid!==false;
  const [order]=await db.insert(orders).values({buyerId:buyer.id,sellerId:seller.id,listingId:listing.id,requestId:randomUUID(),requestHash:'fixture',service:{id:listing.id,revision:1,title:listing.title,description:listing.description,providerName:'Approved public name',game:'peaceElite',mode:'duo',category:'relaxed',unitPriceFen:10000,photoMediaIds:[]},rules:orderRules,delivery:{gameName:'Private buyer',gameId:'buyer-secret',server:'wechat',note:''},quantity:options.quantity??1,totalFen:10000,status:paid?'awaitingService':'unpaid',paidAt:paid?new Date():null,createdAt:options.createdAt??new Date()}).returning();
  if(paid)await db.insert(workflows).values({orderId:order.id,data:{...initialWorkflow(),stage:options.stage??'completed',terminatedAt:options.ageMs===undefined?new Date(Date.now()-3600000).toISOString():new Date(Date.now()-options.ageMs).toISOString(),refundedFen:options.refundedFen??0}});
  return order;
 };
 return {db,app,pool,request,buyer,seller,other,admin,listing,approval,makeOrder,close:async()=>{await app.close();await pool.end();}};
}

test('marketplace starts with honest empty rankings, authenticated zero counts and separate sales totals',async()=>{
 const f=await fixture();try{
  const home=await f.request('GET','/v1/home');assert.equal(home.status,200);assert.ok(home.data.bestsellers.every((p:any)=>p.completedSales>0));assert.ok(home.data.popularCompanions.every((p:any)=>p.completedSales>0));assert.ok(!home.data.bestsellers.some((p:any)=>p.id===f.listing.id));assert.ok(!home.data.popularCompanions.some((p:any)=>p.id===f.seller.id));
  assert.equal((await f.request('GET','/v1/me/summary')).status,401);
  assert.equal((await f.request('GET','/v1/me/favorites')).status,401);
  assert.equal((await f.request('GET','/v1/me/seller-stats')).status,401);
  const summary=(await f.request('GET','/v1/me/summary',undefined,f.buyer.token)).data;
  assert.equal(summary.buyer.all,0);assert.equal(summary.buyer.awaitingReview,0);assert.equal(summary.seller.all,0);assert.equal(summary.unreadNotifications,0);
  for(const period of ['today','yesterday','week','month','year','all']){
   const stats=await f.request('GET','/v1/me/seller-stats?period='+period,undefined,f.seller.token);assert.equal(stats.status,200);assert.equal(stats.data.salesFen,0);assert.equal(stats.data.refundsFen,0);assert.equal(stats.data.orderCount,0);assert.equal(stats.data.timeZone,'Asia/Shanghai');assert.equal(stats.data.basis,'orderCreatedAt');
  }
 }finally{await f.close();}
});

test('favorites are idempotent and owner-private while public stores use approved snapshots and live approved products',async()=>{
 const f=await fixture();try{
  const store=await f.request('GET','/v1/stores/'+f.seller.id);assert.equal(store.status,200);assert.equal(store.data.store.nickname,'Approved public name');assert.equal(store.data.listings[0].ownerId,f.seller.id);assert.equal(store.data.listings[0].provider.id,f.seller.id);
  const search=(await f.request('GET','/v1/stores?q=Approved&game=peaceElite&sort=rating')).data;assert.ok(search.stores.some((s:any)=>s.id===f.seller.id&&s.minPriceFen===10000&&s.games.includes('peaceElite')));
  assert.ok(!(await f.request('GET','/v1/stores?game=valorant&sort=sales')).data.stores.some((s:any)=>s.id===f.seller.id));
  const publicText=JSON.stringify(store.data);for(const secret of [f.seller.phone,'Secret game handle','secret-game-id','Unapproved live bio','Private live name'])assert.ok(!publicText.includes(secret),secret);
  for(const kind of ['products','stores']){
   const id=kind==='products'?f.listing.id:f.seller.id;
   assert.equal((await f.request('PUT',`/v1/me/favorites/${kind}/${id}`,{favorite:true})).status,401);
   const attempts=await Promise.all(Array.from({length:3},()=>f.request('PUT',`/v1/me/favorites/${kind}/${id}`,{favorite:true},f.buyer.token)));assert.ok(attempts.every(r=>r.status===200));
   assert.equal((await f.request('GET','/v1/me/favorites',undefined,f.buyer.token)).data[kind].length,1);
   assert.equal((await f.request('GET','/v1/me/favorites',undefined,f.other.token)).data[kind].length,0);
  }
  await f.db.execute(sql`update listings set status='draft',review_status='pending' where id=${f.listing.id}`);
  assert.equal((await f.request('GET','/v1/stores/'+f.seller.id)).data.listings.length,0);
  const historical=(await f.request('GET','/v1/me/favorites',undefined,f.buyer.token)).data.products[0];assert.equal(historical.id,f.listing.id);assert.equal(historical.available,false);assert.equal(historical.listing,null);
  assert.equal((await f.request('PUT','/v1/me/favorites/products/'+f.listing.id,{favorite:true},f.buyer.token)).status,200);
  assert.equal((await f.request('PUT','/v1/me/favorites/products/'+f.listing.id,{favorite:true},f.other.token)).status,404);
  await f.db.update(users).set({providerSuspended:true}).where(eq(users.id,f.seller.id));
  assert.equal((await f.request('GET','/v1/stores/'+f.seller.id)).status,404);
  assert.equal((await f.request('GET','/v1/me/favorites',undefined,f.buyer.token)).data.stores[0].available,false);
  for(const kind of ['products','stores']){const id=kind==='products'?f.listing.id:f.seller.id;for(let i=0;i<2;i++)assert.equal((await f.request('PUT',`/v1/me/favorites/${kind}/${id}`,{favorite:false},f.buyer.token)).status,200);assert.equal((await f.request('GET','/v1/me/favorites',undefined,f.buyer.token)).data[kind].length,0);}
 }finally{await f.close();}
});

test('Beijing periods and review deadlines keep their exact boundaries even during a later special case',()=>{
 const terminatedAt='2026-10-22T16:00:00.000Z',deadline=Date.parse(terminatedAt)+7*86400000;
 const data={...initialWorkflow(),stage:'completed' as const,terminatedAt,activeCaseId:randomUUID()};
 assert.equal(reviewEligibility({paidAt:new Date(terminatedAt)},data,null,deadline-1).eligible,true);
 assert.equal(reviewEligibility({paidAt:new Date(terminatedAt)},data,null,deadline).reason,'reviewWindowClosed');
 assert.deepEqual(beijingPeriod('today',new Date('2026-10-28T16:00:00Z')),{from:'2026-10-28T16:00:00.000Z',to:'2026-10-29T16:00:00.000Z'});
 assert.deepEqual(beijingPeriod('yesterday',new Date('2026-10-28T16:00:00Z')),{from:'2026-10-27T16:00:00.000Z',to:'2026-10-28T16:00:00.000Z'});
 assert.deepEqual(beijingPeriod('week',new Date('2026-10-28T16:00:00Z')),{from:'2026-10-25T16:00:00.000Z',to:'2026-11-01T16:00:00.000Z'});
 assert.deepEqual(beijingPeriod('month',new Date('2026-12-31T16:00:00Z')),{from:'2026-12-31T16:00:00.000Z',to:'2027-01-31T16:00:00.000Z'});
 assert.deepEqual(beijingPeriod('year',new Date('2026-12-31T16:00:00Z')),{from:'2026-12-31T16:00:00.000Z',to:'2027-12-31T16:00:00.000Z'});
});

test('only the buyer reviews once within seven termination days including full refunds; staff moderation requires an audited reason',async()=>{
 const f=await fixture();try{
  const order=await f.makeOrder({stage:'refunded',refundedFen:10000});
  assert.equal((await f.request('GET',`/v1/orders/${order.id}/review`)).status,401);
  assert.equal((await f.request('GET',`/v1/orders/${order.id}/review`,undefined,f.other.token)).status,404);
  assert.equal((await f.request('GET',`/v1/orders/${order.id}/review`,undefined,f.seller.token)).status,404);
  assert.equal((await f.request('GET',`/v1/orders/${order.id}/review`,undefined,f.buyer.token)).data.eligible,true);
  const payload={rating:2,text:'Delivery was incomplete; the refund was resolved.'};
  const posted=await f.request('POST',`/v1/orders/${order.id}/review`,payload,f.buyer.token);assert.equal(posted.status,200);assert.equal(posted.data.review.rating,2);
  assert.equal((await f.request('POST',`/v1/orders/${order.id}/review`,payload,f.buyer.token)).data.review.id,posted.data.review.id);
  assert.equal((await f.request('POST',`/v1/orders/${order.id}/review`,{...payload,rating:5},f.buyer.token)).status,409);
  const gate=(await f.request('GET',`/v1/orders/${order.id}/review`,undefined,f.buyer.token)).data;assert.equal(gate.eligible,false);assert.equal(gate.reason,'alreadyReviewed');
  const expired=await f.makeOrder({ageMs:7*86400000+1000});assert.equal((await f.request('POST',`/v1/orders/${expired.id}/review`,payload,f.buyer.token)).data.error,'reviewWindowClosed');
  const stillOpen=await f.makeOrder({ageMs:7*86400000-60000});assert.equal((await f.request('GET',`/v1/orders/${stillOpen.id}/review`,undefined,f.buyer.token)).data.eligible,true);
  const unfinished=await f.makeOrder({stage:'inService'});assert.equal((await f.request('GET',`/v1/orders/${unfinished.id}/review`,undefined,f.buyer.token)).data.eligible,false);
  let publicStore=(await f.request('GET','/v1/stores/'+f.seller.id)).data;assert.equal(publicStore.store.rating,2);assert.equal(publicStore.store.reviewCount,1);assert.equal(publicStore.reviews[0].text,payload.text);assert.equal(publicStore.reviews[0].refunded,true);assert.ok(!JSON.stringify(publicStore.reviews).includes(order.id));
  assert.equal((await f.request('GET','/v1/admin/reviews',undefined,f.buyer.token)).status,403);
  assert.equal((await f.request('POST',`/v1/admin/reviews/${posted.data.review.id}/moderate`,{status:'hidden',reason:''},f.admin.token)).status,400);
  const moderated=await f.request('POST',`/v1/admin/reviews/${posted.data.review.id}/moderate`,{status:'hidden',reason:'Contains personal information'},f.admin.token);assert.equal(moderated.status,200);
  publicStore=(await f.request('GET','/v1/stores/'+f.seller.id)).data;assert.equal(publicStore.store.rating,null);assert.equal(publicStore.store.reviewCount,0);assert.deepEqual(publicStore.reviews,[]);
  assert.equal((await f.request('GET','/v1/admin/reviews?status=hidden',undefined,f.admin.token)).data.reviews[0].moderationReason,'Contains personal information');
  const audit=await f.db.execute(sql`select count(*)::int as count from admin_actions where target_id=${posted.data.review.id} and action='review.hidden'`);assert.equal(audit.rows[0].count,1);
  const noAutomatic=await f.db.execute(sql`select count(*)::int as count from order_reviews where seller_id=${f.seller.id}`);assert.equal(noAutomatic.rows[0].count,1);
  const concurrent=await Promise.all(Array.from({length:3},()=>f.request('POST',`/v1/orders/${stillOpen.id}/review`,{rating:4,text:'The agreed service was delivered.'},f.buyer.token)));assert.ok(concurrent.every(r=>r.status===200));assert.equal(new Set(concurrent.map(r=>r.data.review.id)).size,1);
 }finally{await f.close();}
});

test('summary case buckets and Beijing sales periods use persisted states and order creation time',async()=>{
 const f=await fixture();try{
  const start=Date.parse(beijingPeriod('today').from!);
  const pending=await f.makeOrder({stage:'inService'}),supplement=await f.makeOrder({stage:'awaitingAcceptance'});
  const old=await f.makeOrder({createdAt:new Date(start-1),refundedFen:1000});
  for(const [order,state] of [[pending,'refundFailed'],[supplement,'R02']] as const){
   const [c]=await f.db.insert(cases).values({orderId:order.id,data:{state} as CaseData}).returning();
   const [workflow]=await f.db.select().from(workflows).where(eq(workflows.orderId,order.id));await f.db.update(workflows).set({data:{...workflow.data,activeCaseId:c.id}}).where(eq(workflows.orderId,order.id));
  }
  const summary=(await f.request('GET','/v1/me/summary',undefined,f.buyer.token)).data;assert.equal(summary.buyer.refundProcessing,1);assert.equal(summary.buyer.awaitingAcceptance,1);assert.equal(summary.buyer.awaitingReview,1);assert.equal(summary.buyer.all,3);
  const today=(await f.request('GET','/v1/me/seller-stats?period=today',undefined,f.seller.token)).data,yesterday=(await f.request('GET','/v1/me/seller-stats?period=yesterday',undefined,f.seller.token)).data;assert.equal(today.orderCount,2);assert.equal(today.salesFen,20000);assert.equal(today.refundsFen,0);assert.equal(yesterday.orderCount,1);assert.equal(yesterday.salesFen,10000);assert.equal(yesterday.refundsFen,1000);assert.ok(old.paidAt!.getTime()>=start);
 }finally{await f.close();}
});

test('seller statistics and account summaries include the full order history and do not replace ledger balances',async()=>{
 const f=await fixture();try{
  for(let i=0;i<35;i++)await f.makeOrder({refundedFen:i===0?2000:0,quantity:i===0?3:1});
  await f.makeOrder({stage:'refunded',refundedFen:10000});await f.makeOrder({paid:false});await f.makeOrder({stage:'inService'});
  await f.db.insert(notifications).values([{userId:f.buyer.id,dedupeKey:randomUUID(),kind:'order',objectId:f.listing.id,summary:'Unread'},{userId:f.buyer.id,dedupeKey:randomUUID(),kind:'order',objectId:f.listing.id,summary:'Read',readAt:new Date()}]);
  const stats=(await f.request('GET','/v1/me/seller-stats?period=all',undefined,f.seller.token)).data;assert.equal(stats.orderCount,38);assert.equal(stats.paidOrderCount,37);assert.equal(stats.salesFen,370000);assert.equal(stats.refundsFen,12000);assert.equal(stats.netSalesFen,358000);assert.equal(stats.completedOrderCount,35);assert.ok(!('balances' in stats));
  const summary=(await f.request('GET','/v1/me/summary',undefined,f.buyer.token)).data;assert.equal(summary.buyer.all,38);assert.equal(summary.buyer.awaitingReview,35);assert.equal(summary.buyer.refunded,1);assert.equal(summary.buyer.inService,1);assert.equal(summary.buyer.unpaid,1);assert.equal(summary.unreadNotifications,1);
  const home=(await f.request('GET','/v1/home')).data;assert.ok(home.bestsellers.length<=4);const product=home.bestsellers.find((p:any)=>p.id===f.listing.id);assert.equal(product.completedSales,37);assert.equal(home.popularCompanions.find((p:any)=>p.id===f.seller.id).completedSales,37);
  const [funds]=await f.db.execute(sql`select coalesce(sum(available_delta),0)::int as available from seller_ledger where seller_id=${f.seller.id}`).then(r=>r.rows);assert.equal(funds.available,0);
 }finally{await f.close();}
});
