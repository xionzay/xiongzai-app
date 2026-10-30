import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db.js';
import type { MediaStorage } from './storage.js';
import { applications, listings, orders, users, adminActions } from './schema.js';
import { workflows, type Workflow } from './commerce-schema.js';
import { productFavorites, storeFavorites, orderReviews } from './marketplace-schema.js';
import { authenticate, limit } from './auth.js';
import { ApiError } from './validation.js';
import { mediaFiles } from './media-records.js';

const DAY=86400000;
const idSchema=z.object({id:z.uuid()});
const periodSchema=z.enum(['today','yesterday','week','month','year','all']);
type Period=z.infer<typeof periodSchema>;
type Review=typeof orderReviews.$inferSelect;
type Order=typeof orders.$inferSelect;
type ListingRow={listing:typeof listings.$inferSelect;application:typeof applications.$inferSelect};

export function beijingPeriod(period:Period,now=new Date()){
 const shifted=new Date(now.getTime()+8*3600000);
 const year=shifted.getUTCFullYear(),month=shifted.getUTCMonth(),day=shifted.getUTCDate();
 let start=Date.UTC(year,month,day)-8*3600000,end=start+DAY;
 if(period==='all')return {from:null,to:null};
 if(period==='yesterday'){start-=DAY;end-=DAY;}
 if(period==='week'){start-=((shifted.getUTCDay()+6)%7)*DAY;end=start+7*DAY;}
 if(period==='month'){start=Date.UTC(year,month,1)-8*3600000;end=Date.UTC(year,month+1,1)-8*3600000;}
 if(period==='year'){start=Date.UTC(year,0,1)-8*3600000;end=Date.UTC(year+1,0,1)-8*3600000;}
 return {from:new Date(start).toISOString(),to:new Date(end).toISOString()};
}
export function reviewEligibility(order:Pick<Order,'paidAt'>,workflow:Workflow|null,review:Review|null,now=Date.now()){
 const terminated=workflow?.terminatedAt?Date.parse(workflow.terminatedAt):NaN;
 const deadline=Number.isFinite(terminated)?new Date(terminated+7*DAY).toISOString():null;
 if(review)return {eligible:false,reason:'alreadyReviewed',deadline,review};
 if(!order.paidAt||!workflow||!['completed','refunded'].includes(workflow.stage)||!Number.isFinite(terminated)||terminated>now)return {eligible:false,reason:'orderNotTerminated',deadline,review:null};
 if(now>=terminated+7*DAY)return {eligible:false,reason:'reviewWindowClosed',deadline,review:null};
 return {eligible:true,reason:null,deadline,review:null};
}
function numeric(value:unknown){const n=Number(value??0);if(!Number.isSafeInteger(n))throw new ApiError(409,'aggregateRangeExceeded');return n;}

export function marketplaceRoutes(app:FastifyInstance,db:Database,storage?:MediaStorage){
 const actor=(req:{headers:{authorization?:string}})=>authenticate(db,req.headers.authorization,{allowRestricted:true});
 const admin=async(req:{headers:{authorization?:string}})=>{const a=await authenticate(db,req.headers.authorization);if(!a.isAdmin)throw new ApiError(403,'adminRequired');return a;};
 const live=and(eq(listings.status,'published'),eq(listings.reviewStatus,'approved'),eq(listings.moderationBlocked,false),eq(applications.status,'approved'),eq(applications.userId,listings.ownerId),eq(users.suspended,false),eq(users.providerSuspended,false));
 const liveRows=(condition?:SQL)=>db.select({listing:listings,application:applications}).from(listings).innerJoin(applications,eq(applications.id,listings.applicationId)).innerJoin(users,eq(users.id,listings.ownerId)).where(and(live,condition));
 async function publicProduct(row:ListingRow){
  const {id,ownerId,revision,title,description,game,serviceType,mode,category,priceFen,photoMediaIds}=row.listing;
  const p=row.application.snapshot;
  return {id,ownerId,revision,title,description,game,serviceType,mode,category,priceFen,photoMediaIds,provider:{id:ownerId,nickname:p.nickname,bio:p.bio,rank:p.draft.rank,playStyle:p.draft.playStyle,avatarMediaId:p.avatarMediaId,voiceMediaId:p.draft.voiceMediaId},files:await mediaFiles(db,storage,[...photoMediaIds,p.avatarMediaId,p.draft.voiceMediaId])};
 }
 // Only paid, terminated, retained sales without an active case can rank a store or product.
 const eligibleSales=sql`o.paid_at is not null and o.buyer_id<>o.seller_id and w.data->>'stage'='completed' and nullif(w.data->>'terminatedAt','') is not null and nullif(w.data->>'activeCaseId','') is null and o.total_fen>coalesce((w.data->>'refundedFen')::bigint,0)`;
 async function storeRows(options:{id?:string;q?:string;game?:string;sort?:'recent'|'rating'|'sales';page?:number;limit?:number;liveOnly?:boolean;positiveSales?:boolean}={}){
  const term='%'+(options.q??'').replace(/[\\%_]/g,'\\$&')+'%';
  const orderBy=options.sort==='rating'?sql`r.rating desc nulls last,r.review_count desc,a.submitted_at desc,u.id`:options.sort==='sales'?sql`completed_sales desc,a.submitted_at desc,u.id`:sql`a.submitted_at desc,u.id`;
  const result=await db.execute(sql`
   select u.id,a.snapshot,a.submitted_at as "submittedAt",r.rating,r.review_count as "reviewCount",s.completed_sales as "completedSales",p.min_price as "minPriceFen",p.games
   from users u
   join lateral (select snapshot,submitted_at from applications where user_id=u.id and status='approved' order by submitted_at desc,id desc limit 1) a on true
   left join lateral (select avg(rating)::float8 as rating,count(*)::int as review_count from order_reviews where seller_id=u.id and status='visible') r on true
   left join lateral (select coalesce(sum(o.quantity),0)::bigint as completed_sales from orders o join order_workflows w on w.order_id=o.id where o.seller_id=u.id and ${eligibleSales}) s on true
   left join lateral (select min(l.price_fen)::int as min_price,array_agg(distinct l.game) as games from listings l join applications la on la.id=l.application_id and la.user_id=u.id and la.status='approved' where l.owner_id=u.id and l.status='published' and l.review_status='approved' and l.moderation_blocked=false ${options.game&&options.game!=='all'?sql`and l.game=${options.game}`:sql``}) p on true
   where u.suspended=false and u.provider_suspended=false
   ${options.id?sql`and u.id=${options.id}`:sql``}
   ${options.q?sql`and (a.snapshot->>'nickname' ilike ${term} or a.snapshot->>'bio' ilike ${term})`:sql``}
   ${options.liveOnly?sql`and p.min_price is not null`:sql``}
   ${options.positiveSales?sql`and s.completed_sales>0`:sql``}
   order by ${orderBy} limit ${options.limit??31} offset ${((options.page??1)-1)*30}`);
  return Promise.all(result.rows.map(async raw=>{
   const p=raw.snapshot as typeof applications.$inferSelect['snapshot'];
   return {id:String(raw.id),nickname:p.nickname,bio:p.bio,rank:p.draft.rank,playStyle:p.draft.playStyle,avatarMediaId:p.avatarMediaId,voiceMediaId:p.draft.voiceMediaId,rating:raw.rating===null?null:Number(raw.rating),reviewCount:numeric(raw.reviewCount),completedSales:numeric(raw.completedSales),minPriceFen:raw.minPriceFen===null?null:numeric(raw.minPriceFen),games:(raw.games??[]) as string[],files:await mediaFiles(db,storage,[p.avatarMediaId,p.draft.voiceMediaId])};
  }));
 }

 app.get('/v1/me/summary',async req=>{
  const a=await actor(req);
  const counts=await db.execute(sql`
   select role,bucket,count(*)::bigint as count from (
    select actor.role,case
     when o.status='unpaid' then 'unpaid' when o.status='closed' then 'closed'
     when c.data->>'state'='R02' then 'awaitingAcceptance'
     when c.data->>'state' in ('pendingRefund','refundProcessing','refundFailed') then 'refundProcessing'
     when nullif(w.data->>'activeCaseId','') is not null and (c.id is null or c.data->>'state' not in ('resolved','withdrawn')) then 'afterSales'
     when w.data->>'stage'='refunded' then 'refunded'
     when w.data->>'stage'='completed' and r.id is null and (w.data->>'terminatedAt')::timestamptz<=now() and (w.data->>'terminatedAt')::timestamptz>now()-interval '7 days' then 'awaitingReview'
     when w.data->>'stage'='completed' then 'completed'
     when w.data->>'stage'='inService' then 'inService'
     when w.data->>'stage'='awaitingAcceptance' then 'awaitingAcceptance'
     else 'awaitingService' end as bucket
    from orders o cross join lateral (values ('buyer',o.buyer_id),('seller',o.seller_id)) actor(role,user_id)
    left join order_workflows w on w.order_id=o.id left join after_sale_cases c on c.id::text=w.data->>'activeCaseId' left join order_reviews r on r.order_id=o.id
    where actor.user_id=${a.id}
   ) categorized group by role,bucket`);
  const empty=()=>({all:0,unpaid:0,awaitingService:0,inService:0,awaitingAcceptance:0,afterSales:0,refundProcessing:0,awaitingReview:0,completed:0,refunded:0,closed:0});
  const result={buyer:empty(),seller:empty(),unreadNotifications:0,unreadMessages:0,favoriteProducts:0,favoriteStores:0};
  for(const row of counts.rows){const role=row.role as 'buyer'|'seller',bucket=row.bucket as keyof typeof result.buyer,count=numeric(row.count);result[role][bucket]=count;result[role].all+=count;}
  const totals=await db.execute(sql`select (select count(*) from notifications where user_id=${a.id} and read_at is null)::bigint as notices,(select count(*) from notifications where user_id=${a.id} and read_at is null and kind='conversation')::bigint as messages,(select count(*) from product_favorites where user_id=${a.id})::bigint as products,(select count(*) from store_favorites where user_id=${a.id})::bigint as stores`);
  Object.assign(result,{unreadNotifications:numeric(totals.rows[0].notices),unreadMessages:numeric(totals.rows[0].messages),favoriteProducts:numeric(totals.rows[0].products),favoriteStores:numeric(totals.rows[0].stores)});return result;
 });
 app.get('/v1/me/seller-stats',async req=>{
  const a=await actor(req),{period}=z.object({period:periodSchema.default('today')}).strict().parse(req.query),range=beijingPeriod(period);
  const result=await db.execute(sql`select count(*)::bigint as orders,count(*) filter(where o.paid_at is not null)::bigint as paid,count(*) filter(where ${eligibleSales})::bigint as completed,coalesce(sum(o.total_fen) filter(where o.paid_at is not null),0)::bigint as sales,coalesce(sum(coalesce((w.data->>'refundedFen')::bigint,0)) filter(where o.paid_at is not null),0)::bigint as refunds from orders o left join order_workflows w on w.order_id=o.id where o.seller_id=${a.id} ${range.from?sql`and o.created_at>=${range.from}::timestamptz and o.created_at<${range.to}::timestamptz`:sql``}`);
  const r=result.rows[0],salesFen=numeric(r.sales),refundsFen=numeric(r.refunds);
  return {period,timeZone:'Asia/Shanghai',basis:'orderCreatedAt',...range,orderCount:numeric(r.orders),paidOrderCount:numeric(r.paid),completedOrderCount:numeric(r.completed),salesFen,refundsFen,netSalesFen:salesFen-refundsFen};
 });

 app.get('/v1/me/favorites',async req=>{
  const a=await actor(req),products=await db.select().from(productFavorites).where(eq(productFavorites.userId,a.id)).orderBy(desc(productFavorites.createdAt)),stores=await db.select().from(storeFavorites).where(eq(storeFavorites.userId,a.id)).orderBy(desc(storeFavorites.createdAt));
  const publicProducts=products.length?await liveRows(inArray(listings.id,products.map(p=>p.listingId))):[];
  return {products:await Promise.all(products.map(async p=>{const row=publicProducts.find(r=>r.listing.id===p.listingId);return {id:p.listingId,available:!!row,listing:row?await publicProduct(row):null,createdAt:p.createdAt};})),stores:await Promise.all(stores.map(async p=>{const [store]=await storeRows({id:p.sellerId});return {id:p.sellerId,available:!!store,store:store??null,createdAt:p.createdAt};}))};
 });
 for(const kind of ['products','stores'] as const)app.put(`/v1/me/favorites/${kind}/:id`,async req=>{
  const a=await actor(req),{id}=idSchema.parse(req.params),{favorite}=z.object({favorite:z.boolean()}).strict().parse(req.body);
  if(kind==='products'){
   if(!favorite)await db.delete(productFavorites).where(and(eq(productFavorites.userId,a.id),eq(productFavorites.listingId,id)));
   else{const [prior]=await db.select().from(productFavorites).where(and(eq(productFavorites.userId,a.id),eq(productFavorites.listingId,id)));if(!prior){if(!(await liveRows(eq(listings.id,id))).length)throw new ApiError(404,'listingUnavailable');await db.insert(productFavorites).values({userId:a.id,listingId:id}).onConflictDoNothing();}}
  }else{
   if(!favorite)await db.delete(storeFavorites).where(and(eq(storeFavorites.userId,a.id),eq(storeFavorites.sellerId,id)));
   else{const [prior]=await db.select().from(storeFavorites).where(and(eq(storeFavorites.userId,a.id),eq(storeFavorites.sellerId,id)));if(!prior){if(!(await storeRows({id})).length)throw new ApiError(404,'storeUnavailable');await db.insert(storeFavorites).values({userId:a.id,sellerId:id}).onConflictDoNothing();}}
  }
  return {id,favorite};
 });

 const buyerOrder=async(id:string,buyerId:string)=>{const [order]=await db.select().from(orders).where(and(eq(orders.id,id),eq(orders.buyerId,buyerId)));if(!order)throw new ApiError(404,'orderUnavailable');return order;};
 app.get('/v1/orders/:id/review',async req=>{
  const a=await actor(req),{id}=idSchema.parse(req.params),order=await buyerOrder(id,a.id);
  const [workflow]=await db.select().from(workflows).where(eq(workflows.orderId,id)),[review]=await db.select().from(orderReviews).where(eq(orderReviews.orderId,id));
  return reviewEligibility(order,workflow?.data??null,review??null);
 });
 app.post('/v1/orders/:id/review',async req=>{
  const a=await actor(req),{id}=idSchema.parse(req.params),input=z.object({rating:z.number().int().min(1).max(5),text:z.string().trim().min(1).max(1000)}).strict().parse(req.body),read=await buyerOrder(id,a.id);await limit(db,'review:'+a.id,60);
  return db.transaction(async tx=>{
   // Match commerce's participant/order lock order so review creation and termination cannot race.
   await tx.select({id:users.id}).from(users).where(inArray(users.id,[read.buyerId,read.sellerId])).orderBy(asc(users.id)).for('update');
   const [order]=await tx.select().from(orders).where(eq(orders.id,id)).for('update');
   const [prior]=await tx.select().from(orderReviews).where(eq(orderReviews.orderId,id));
   if(prior){if(prior.rating!==input.rating||prior.text!==input.text)throw new ApiError(409,'reviewAlreadyExists');return {review:prior};}
   const [workflow]=await tx.select().from(workflows).where(eq(workflows.orderId,id)).for('update');
   const gate=reviewEligibility(order,workflow?.data??null,null);if(!gate.eligible)throw new ApiError(409,gate.reason!);
   const [review]=await tx.insert(orderReviews).values({orderId:id,buyerId:a.id,sellerId:order.sellerId,listingId:order.listingId,buyerNickname:a.nickname,...input}).returning();return {review};
  });
 });
 app.get('/v1/admin/reviews',async req=>{
  await admin(req);const {status,page}=z.object({status:z.enum(['visible','hidden','all']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict().parse(req.query);
  const rows=await db.select({review:orderReviews,service:orders.service}).from(orderReviews).innerJoin(orders,eq(orders.id,orderReviews.orderId)).where(status==='all'?undefined:eq(orderReviews.status,status)).orderBy(desc(orderReviews.createdAt),desc(orderReviews.id)).offset((page-1)*30).limit(31);
  return {reviews:rows.slice(0,30).map(r=>({...r.review,listingTitle:r.service.title,sellerName:r.service.providerName})),hasMore:rows.length>30};
 });
 app.post('/v1/admin/reviews/:id/moderate',async req=>{
  const a=await admin(req),{id}=idSchema.parse(req.params),input=z.object({status:z.enum(['visible','hidden']),reason:z.string().trim().min(5).max(1000)}).strict().parse(req.body);
  return db.transaction(async tx=>{const [current]=await tx.select().from(orderReviews).where(eq(orderReviews.id,id)).for('update');if(!current)throw new ApiError(404,'notFound');if(current.buyerId===a.id)throw new ApiError(403,'selfReviewForbidden');if(current.status===input.status&&current.moderationReason===input.reason)return {review:current};const [review]=await tx.update(orderReviews).set({status:input.status,moderationReason:input.reason,moderatorId:a.id,moderatedAt:new Date()}).where(eq(orderReviews.id,id)).returning();await tx.insert(adminActions).values({actorId:a.id,action:'review.'+input.status,targetId:id,reason:input.reason});return {review};});
 });

 app.get('/v1/stores',async req=>{
  const query=z.object({q:z.string().trim().max(80).default(''),game:z.enum(['all','peaceElite','deltaForce','honorOfKings','valorant']).default('all'),sort:z.enum(['recent','rating','sales']).default('recent'),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict().parse(req.query);
  const stores=await storeRows({...query,liveOnly:true});return {stores:stores.slice(0,30),hasMore:stores.length>30};
 });
 app.get('/v1/stores/:id',async req=>{
  const {id}=idSchema.parse(req.params),{page}=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict().parse(req.query),[store]=await storeRows({id});if(!store)throw new ApiError(404,'storeUnavailable');
  const rows=await liveRows(eq(listings.ownerId,id));
  const reviews=await db.select({id:orderReviews.id,rating:orderReviews.rating,text:orderReviews.text,createdAt:orderReviews.createdAt,buyerNickname:orderReviews.buyerNickname,refunded:sql<boolean>`coalesce(${workflows.data}->>'stage'='refunded' and coalesce((${workflows.data}->>'refundedFen')::bigint,0)>=${orders.totalFen},false)`}).from(orderReviews).innerJoin(orders,eq(orders.id,orderReviews.orderId)).leftJoin(workflows,eq(workflows.orderId,orderReviews.orderId)).where(and(eq(orderReviews.sellerId,id),eq(orderReviews.status,'visible'))).orderBy(desc(orderReviews.createdAt),desc(orderReviews.id)).offset((page-1)*30).limit(31);
  const products=await Promise.all(rows.map(publicProduct));return {store,listings:products,reviews:reviews.slice(0,30).map(({buyerNickname,...review})=>({...review,buyer:{nickname:buyerNickname}})),hasMoreReviews:reviews.length>30,files:await mediaFiles(db,storage,[store.avatarMediaId,store.voiceMediaId,...rows.flatMap(r=>r.listing.photoMediaIds)])};
 });
 app.get('/v1/home',async()=>{
  const sales=await db.execute(sql`select o.listing_id as id,sum(o.quantity)::bigint as sales from orders o join order_workflows w on w.order_id=o.id join listings l on l.id=o.listing_id join users u on u.id=l.owner_id join applications a on a.id=l.application_id and a.user_id=l.owner_id where ${eligibleSales} and l.status='published' and l.review_status='approved' and l.moderation_blocked=false and a.status='approved' and u.suspended=false and u.provider_suspended=false group by o.listing_id order by sales desc,o.listing_id limit 4`);
  const rows=sales.rows.length?await liveRows(inArray(listings.id,sales.rows.map(r=>String(r.id)))):[];
  const bestsellers=await Promise.all(sales.rows.flatMap(r=>{const row=rows.find(p=>p.listing.id===r.id);return row?[publicProduct(row).then(p=>({...p,completedSales:numeric(r.sales)}))]:[];}));
  return {bestsellers,popularCompanions:await storeRows({sort:'sales',liveOnly:true,positiveSales:true,limit:4}),rankingBasis:'eligibleCompletedUnits'};
 });
}
