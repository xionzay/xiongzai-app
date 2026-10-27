import { workflows } from './commerce-schema.js';
import { ensureWorkflow } from './commerce-core.js';
import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db.js';
import { orders, paymentAttempts, users, listings, applications, type OrderRules } from './schema.js';
import { authenticate, digest, limit } from './auth.js';
import { ApiError } from './validation.js';
export const orderRules:OrderRules={version:'sammy-simulation-v3',transactionReference:'V3.1 (reference only; partial prototype)',text:{en:'Check the service and total before confirming your order. Services start directly without appointments or seller approval. Completion requires at least five screenshots; orders of ¥200 or more also require a continuous screen recording. You have 72 hours to accept completion, with one optional 24-hour extension. An ordinary after-sales request pauses service and freezes the order amount. Staff reviews disputes using the submitted evidence. Successful refunds waive commission; otherwise commission is 10%, rounded half-up to the nearest fen. Xiongzai covers transaction fees. No real charges or transfers will be made.',zh:'确认订单前请核对服务与金额。服务直接开始，无需预约或卖家接单。完成服务需提交至少五张截图，订单金额满200元另需连续录屏。验收期为72小时，可延长一次24小时。普通售后申请将暂停服务并冻结订单金额，争议由工作人员根据提交的证据处理。退款成功后免佣，否则按10%四舍五入至分计佣。交易手续费由平台承担，不会产生真实扣款或转账。'}};
export function simulationAvailable(env:NodeJS.ProcessEnv=process.env){
 if(env.SAMMY_SIMULATED_PAYMENTS!=='true')return false;
 // Vercel uses NODE_ENV=production for previews too. Only explicitly opted-in
 // previews may simulate money; missing/unknown deployment targets fail closed.
 if(env.VERCEL)return env.VERCEL==='1'&&env.VERCEL_ENV==='preview'&&env.SAMMY_HOSTED_DEMO==='true';
 return env.NODE_ENV!=='production'&&!env.VERCEL_ENV&&!env.SAMMY_HOSTED_DEMO;
}
const idInput=z.object({id:z.uuid()}),requestId=z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/);
const delivery=z.object({gameName:z.string().trim().min(1).max(32),gameId:z.string().trim().regex(/^[A-Za-z0-9_-]{4,32}$/),server:z.enum(['wechat','qq']),note:z.string().trim().max(300).default('')}).strict();
const createInput=z.object({listingId:z.uuid(),listingRevision:z.number().int().positive(),expectedUnitPriceFen:z.number().int().positive(),quantity:z.number().int().min(1).max(24),delivery,requestId,rulesVersion:z.string().min(1).max(80),accepted:z.literal(true)}).strict();
const pageInput=z.object({role:z.enum(['buyer','seller']).default('buyer'),after:z.uuid().optional()}).strict();
export function orderRoutes(app:FastifyInstance,db:Database){
 const enabled=simulationAvailable();
 const simulation=()=>{if(!enabled)throw new ApiError(403,'orderSimulationDisabled');};
 const user=(req:{headers:{authorization?:string}},allowRestricted=false)=>authenticate(db,req.headers.authorization,{allowRestricted});
 const view=async(order:typeof orders.$inferSelect,viewerId?:string)=>({order:{...order,viewerRole:viewerId===order.sellerId?'seller':'buyer'},attempts:await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId,order.id)).orderBy(desc(paymentAttempts.createdAt),desc(paymentAttempts.id)).limit(20),workflow:(await db.select().from(workflows).where(eq(workflows.orderId,order.id)))[0]??null,simulationEnabled:enabled});
 app.get('/v1/orders/policy',async()=>({rules:orderRules,maxQuantity:24,simulationEnabled:enabled}));
 app.post('/v1/orders',async req=>{
  simulation();const buyer=await user(req),input=createInput.parse(req.body);await limit(db,`order-create:${buyer.id}`,60);
  const hash=digest(JSON.stringify(input));
  const order=await db.transaction(async tx=>{
   const [listing]=await tx.select().from(listings).where(eq(listings.id,input.listingId));if(!listing)throw new ApiError(404,'listingUnavailable');
   if(listing.ownerId===buyer.id)throw new ApiError(403,'ownServicePurchase');
   // Lock participants in one order for retries and reciprocal buyer/seller purchases.
   const participants=await tx.select().from(users).where(inArray(users.id,[buyer.id,listing.ownerId])).orderBy(asc(users.id)).for('update');
   const lockedBuyer=participants.find(p=>p.id===buyer.id)!,seller=participants.find(p=>p.id===listing.ownerId)!;
   const [previous]=await tx.select().from(orders).where(and(eq(orders.buyerId,buyer.id),eq(orders.requestId,input.requestId)));
   if(previous){if(previous.requestHash!==hash)throw new ApiError(409,'orderRequestConflict');return previous;}
   if(lockedBuyer.suspended)throw new ApiError(403,'accountSuspended');if(input.rulesVersion!==orderRules.version)throw new ApiError(409,'ruleVersionUnsupported');
   const [current]=await tx.select().from(listings).where(eq(listings.id,input.listingId)).for('update');
   const [approved]=current.applicationId?await tx.select().from(applications).where(and(eq(applications.id,current.applicationId),eq(applications.userId,seller.id),eq(applications.status,'approved'))):[];
   if(seller.suspended||seller.providerSuspended||current.status!=='published'||current.moderationBlocked||!current.publicationConsentAt||!approved)throw new ApiError(409,'listingUnavailable');
   if(current.revision!==input.listingRevision||current.priceFen!==input.expectedUnitPriceFen)throw new ApiError(409,'orderQuoteChanged');
   const totalFen=current.priceFen*input.quantity;if(!Number.isSafeInteger(totalFen))throw new ApiError(400,'invalidOrder');
   const [created]=await tx.insert(orders).values({buyerId:buyer.id,sellerId:seller.id,listingId:current.id,requestId:input.requestId,requestHash:hash,quantity:input.quantity,totalFen,delivery:input.delivery,rules:orderRules,service:{id:current.id,revision:current.revision,title:current.title,description:current.description,providerName:approved.snapshot.nickname,mode:current.mode,category:current.category,game:current.game,unitPriceFen:current.priceFen,photoMediaIds:current.photoMediaIds}}).returning();return created;
  });return view(order,buyer.id);
 });
 app.get('/v1/orders',async req=>{
  const viewer=await user(req,true),query=pageInput.parse(req.query);
  const rows=await db.select().from(orders).where(and(eq(query.role==='seller'?orders.sellerId:orders.buyerId,viewer.id),query.after?lt(orders.id,query.after):undefined)).orderBy(desc(orders.id)).limit(31);
  return {orders:await Promise.all(rows.slice(0,30).map(row=>view(row,viewer.id))),nextCursor:rows.length>30?rows[29].id:null,simulationEnabled:enabled};
 });
 app.get('/v1/orders/:id',async req=>{const viewer=await user(req,true),{id}=idInput.parse(req.params);const [order]=await db.select().from(orders).where(and(eq(orders.id,id),or(eq(orders.buyerId,viewer.id),eq(orders.sellerId,viewer.id))));if(!order)throw new ApiError(404,'orderUnavailable');return view(order,viewer.id);});
 app.post('/v1/orders/:id/cancel',async req=>{
  const viewer=await user(req,true),{id}=idInput.parse(req.params);z.object({}).strict().parse(req.body);
  const order=await db.transaction(async tx=>{const [item]=await tx.select().from(orders).where(and(eq(orders.id,id),eq(orders.buyerId,viewer.id))).for('update');if(!item)throw new ApiError(404,'orderUnavailable');if(item.status==='closed')return item;if(item.status!=='unpaid')throw new ApiError(409,'orderCannotCancel');const [pending]=await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.orderId,id),eq(paymentAttempts.status,'pending')));if(pending)throw new ApiError(409,'paymentPending');return (await tx.update(orders).set({status:'closed',closedAt:new Date()}).where(eq(orders.id,id)).returning())[0];});return view(order,viewer.id);
 });
 app.post('/v1/orders/:id/simulate-payment',async req=>{
  simulation();const viewer=await user(req,true),{id}=idInput.parse(req.params),input=z.object({requestId,outcome:z.enum(['pending','success','failure'])}).strict().parse(req.body);await limit(db,`simulation:${viewer.id}`,100);
  const desired=input.outcome==='success'?'succeeded':input.outcome==='failure'?'failed':'pending';
  const order=await db.transaction(async tx=>{
   const [read]=await tx.select().from(orders).where(and(eq(orders.id,id),eq(orders.buyerId,viewer.id)));if(!read)throw new ApiError(404,'orderUnavailable');
   const participants=await tx.select().from(users).where(inArray(users.id,[read.buyerId,read.sellerId])).orderBy(asc(users.id)).for('update');
   const [item]=await tx.select().from(orders).where(eq(orders.id,id)).for('update');
   const [attempt]=await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.orderId,id),eq(paymentAttempts.requestId,input.requestId)));
   if(attempt&&attempt.status!=='pending'){if(attempt.status!==desired)throw new ApiError(409,'paymentRequestConflict');return item;}
   if(item.status!=='unpaid')throw new ApiError(409,'orderNotPayable');
   const seller=participants.find(p=>p.id===item.sellerId)!,buyer=participants.find(p=>p.id===item.buyerId)!;
   // Restricted participants can resolve an existing pending test as failed, never pay.
   if((buyer.suspended||seller.suspended||seller.providerSuspended)&&!(attempt&&desired==='failed'))throw new ApiError(403,'publicationRestricted');
   if(!attempt){const [listing]=await tx.select().from(listings).where(eq(listings.id,item.listingId)).for('update');if(!listing||listing.status!=='published'||listing.moderationBlocked||!listing.publicationConsentAt)throw new ApiError(409,'listingUnavailable');}
   const [pending]=await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.orderId,id),eq(paymentAttempts.status,'pending')));if(pending&&pending.requestId!==input.requestId)throw new ApiError(409,'paymentPending');
   const resolvedAt=desired==='pending'?null:new Date();
   if(attempt)await tx.update(paymentAttempts).set({status:desired,resolvedAt}).where(eq(paymentAttempts.id,attempt.id));else await tx.insert(paymentAttempts).values({orderId:id,requestId:input.requestId,status:desired,resolvedAt});
   if(desired==='succeeded'){const [paid]=await tx.update(orders).set({status:'awaitingService',paidAt:new Date()}).where(eq(orders.id,id)).returning();await ensureWorkflow(tx,paid);return paid;}return item;
  });return view(order,viewer.id);
 });
 app.get('/v1/admin/orders',async req=>{const actor=await user(req);if(!actor.isAdmin)throw new ApiError(403,'adminRequired');const {page}=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict().parse(req.query);const rows=await db.select().from(orders).orderBy(desc(orders.id)).offset((page-1)*30).limit(31);return {items:rows.slice(0,30),hasMore:rows.length>30};});
 app.get('/v1/admin/orders/:id',async req=>{const actor=await user(req);if(!actor.isAdmin)throw new ApiError(403,'adminRequired');const {id}=idInput.parse(req.params);const [item]=await db.select().from(orders).where(eq(orders.id,id));if(!item)throw new ApiError(404,'orderUnavailable');return view(item);});
}
