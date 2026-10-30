import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, ilike, isNotNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db.js';
import { listings, applications, users, adminActions } from './schema.js';
import { authenticate, limit } from './auth.js';
import { ApiError } from './validation.js';
import type { MediaStorage } from './storage.js';
import { mediaFiles, ownedMedia } from './media-records.js';

const games=['peaceElite','deltaForce','honorOfKings','valorant'] as const;
const serviceTypes=['companion','coaching'] as const;
const listingInput=z.object({revision:z.number().int().min(0),title:z.string().trim().min(3).max(80),description:z.string().trim().min(10).max(1500),game:z.enum(games),serviceType:z.enum(serviceTypes).default('companion'),mode:z.enum(['duo','squad']),category:z.enum(['relaxed','ranked']),priceFen:z.number().int().min(100).max(100000),photoMediaIds:z.array(z.uuid()).max(4).refine(ids=>new Set(ids).size===ids.length).default([])}).strict();
const revisionInput=z.object({revision:z.number().int().positive()}).strict();
const reviewInput=revisionInput.extend({decision:z.enum(['approved','changes_requested']),reason:z.string().trim().min(5).max(1000)}).strict();
const idInput=z.object({id:z.uuid()});
const priceCursor=z.object({sort:z.enum(['priceAsc','priceDesc']),id:z.uuid(),priceFen:z.number().int().min(100).max(100000)}).strict();
type Listing=typeof listings.$inferSelect;

export function listingRoutes(app:FastifyInstance,db:Database,storage?:MediaStorage){
 const user=(req:{headers:{authorization?:string}})=>authenticate(db,req.headers.authorization);
 const privateView=async(listing:Listing)=>({listing,files:await mediaFiles(db,storage,listing.photoMediaIds)});
 async function publicView(row:{listing:Listing;application:typeof applications.$inferSelect}){
  const {id,ownerId,revision,title,description,game,serviceType,reviewStatus,mode,category,priceFen,photoMediaIds}=row.listing;
  const profile=row.application.snapshot;
  return {id,ownerId,revision,title,description,game,serviceType,reviewStatus,mode,category,priceFen,photoMediaIds,
   provider:{id:ownerId,nickname:profile.nickname,bio:profile.bio,rank:profile.draft.rank,playStyle:profile.draft.playStyle,avatarMediaId:profile.avatarMediaId,voiceMediaId:profile.draft.voiceMediaId},
   files:await mediaFiles(db,storage,[...photoMediaIds,profile.avatarMediaId,profile.draft.voiceMediaId])};
 }
 const published=and(eq(listings.status,'published'),eq(listings.reviewStatus,'approved'),isNotNull(listings.publicationConsentAt),eq(applications.userId,listings.ownerId),eq(applications.status,'approved'),eq(users.suspended,false),eq(users.providerSuspended,false),eq(listings.moderationBlocked,false));
 app.get('/v1/listings',async req=>{
  const query=z.object({q:z.string().trim().max(80).default(''),game:z.enum(['all',...games]).default('all'),serviceType:z.enum(['all',...serviceTypes]).default('all'),category:z.enum(['all','relaxed','ranked']).default('all'),mode:z.enum(['all','duo','squad']).default('all'),sort:z.enum(['recent','priceAsc','priceDesc']).default('recent'),after:z.string().max(300).optional()}).strict().parse(req.query);
  const term=`%${query.q.replace(/[\\%_]/g,'\\$&')}%`;
  let after;
  if(query.after){
   if(query.sort==='recent')after=lt(listings.id,z.uuid().parse(query.after));
   else{
    let cursor:z.infer<typeof priceCursor>;
    try{cursor=priceCursor.parse(JSON.parse(Buffer.from(query.after,'base64url').toString('utf8')));}catch{throw new ApiError(400,'invalidListingCursor');}
    if(cursor.sort!==query.sort)throw new ApiError(400,'invalidListingCursor');
    const compare=query.sort==='priceAsc'?gt:lt;
    after=or(compare(listings.priceFen,cursor.priceFen),and(eq(listings.priceFen,cursor.priceFen),compare(listings.id,cursor.id)));
   }
  }
  const rows=await db.select({listing:listings,application:applications}).from(listings).innerJoin(applications,eq(listings.applicationId,applications.id)).innerJoin(users,eq(listings.ownerId,users.id)).where(and(published,
   query.q?or(ilike(listings.title,term),ilike(listings.description,term),ilike(sql`${applications.snapshot}->>'nickname'`,term)):undefined,
   query.game!=='all'?eq(listings.game,query.game):undefined,query.serviceType!=='all'?eq(listings.serviceType,query.serviceType):undefined,
   query.category!=='all'?eq(listings.category,query.category):undefined,query.mode!=='all'?eq(listings.mode,query.mode):undefined,after))
   .orderBy(...(query.sort==='recent'?[desc(listings.id)]:query.sort==='priceAsc'?[asc(listings.priceFen),asc(listings.id)]:[desc(listings.priceFen),desc(listings.id)])).limit(21);
  const last=rows[19]?.listing;
  return {listings:await Promise.all(rows.slice(0,20).map(publicView)),nextCursor:rows.length>20?(query.sort==='recent'?last.id:Buffer.from(JSON.stringify({sort:query.sort,id:last.id,priceFen:last.priceFen})).toString('base64url')):null};
 });
 app.get('/v1/listings/:id',async req=>{
  const {id}=idInput.parse(req.params);
  const [row]=await db.select({listing:listings,application:applications}).from(listings).innerJoin(applications,eq(listings.applicationId,applications.id)).innerJoin(users,eq(listings.ownerId,users.id)).where(and(published,eq(listings.id,id)));
  if(!row)throw new ApiError(404,'listingUnavailable');return {listing:await publicView(row)};
 });
 app.get('/v1/me/listings',async req=>{
  const owner=await user(req);
  const rows=await db.select().from(listings).where(eq(listings.ownerId,owner.id)).orderBy(desc(listings.updatedAt),desc(listings.id));
  return {listings:rows,files:await mediaFiles(db,storage,rows.flatMap(row=>row.photoMediaIds))};
 });
 app.put('/v1/me/listings/:id',async req=>{
  const owner=await user(req),{id}=idInput.parse(req.params),{revision,...input}=listingInput.parse(req.body);
  await limit(db,`listing:${owner.id}`,60);
  const listing=await db.transaction(async tx=>{
   const [lockedOwner]=await tx.select().from(users).where(eq(users.id,owner.id)).for('update');
   if(lockedOwner.suspended)throw new ApiError(403,'accountSuspended');
   const [existing]=await tx.select().from(listings).where(eq(listings.id,id)).for('update');
   if(existing&&existing.ownerId!==owner.id)throw new ApiError(404,'listingUnavailable');
   if((existing?.revision??0)!==revision)throw new ApiError(409,'listingConflict');
   for(const mediaId of input.photoMediaIds)await ownedMedia(tx,owner.id,mediaId,'avatar');
   if(!existing){const count=await tx.select({id:listings.id}).from(listings).where(eq(listings.ownerId,owner.id)).limit(50);if(count.length>=50)throw new ApiError(409,'listingLimit');}
   const values={...input,status:'draft' as const,reviewStatus:'draft' as const,reviewReason:null,reviewSubmittedAt:null,reviewedAt:null,reviewerId:null,revision:revision+1,applicationId:null,publicationConsentAt:null,updatedAt:new Date()};
   return existing?(await tx.update(listings).set(values).where(eq(listings.id,id)).returning())[0]:(await tx.insert(listings).values({id,ownerId:owner.id,...values}).returning())[0];
  });return privateView(listing);
 });
 for(const action of ['submit-review','publish','unpublish'] as const)app.post(`/v1/me/listings/:id/${action}`,async req=>{
  const owner=await user(req),{id}=idInput.parse(req.params);
  const {revision}=(action==='publish'?revisionInput.extend({accepted:z.literal(true)}).strict():revisionInput).parse(req.body);
  const listing=await db.transaction(async tx=>{
   const [lockedOwner]=await tx.select().from(users).where(eq(users.id,owner.id)).for('update');
   if(lockedOwner.suspended)throw new ApiError(403,'accountSuspended');
   const [existing]=await tx.select().from(listings).where(eq(listings.id,id)).for('update');
   if(!existing||existing.ownerId!==owner.id)throw new ApiError(404,'listingUnavailable');
   if(existing.revision!==revision)throw new ApiError(409,'listingConflict');
   const updated={revision:revision+1,updatedAt:new Date()};
   if(action==='unpublish')return (await tx.update(listings).set({...updated,status:'draft',publicationConsentAt:null}).where(eq(listings.id,id)).returning())[0];
   if(lockedOwner.providerSuspended||existing.moderationBlocked)throw new ApiError(403,'publicationRestricted');
   const [approved]=await tx.select().from(applications).where(and(eq(applications.userId,owner.id),eq(applications.status,'approved'))).orderBy(desc(applications.submittedAt),desc(applications.id)).limit(1);
   if(!approved)throw new ApiError(403,'providerApprovalRequired');
   if(action==='submit-review'){
    if(existing.reviewStatus==='pending')throw new ApiError(409,'productReviewPending');
    return (await tx.update(listings).set({...updated,status:'draft',reviewStatus:'pending',reviewReason:null,reviewSubmittedAt:new Date(),reviewerId:null,reviewedAt:null,applicationId:approved.id,publicationConsentAt:null}).where(eq(listings.id,id)).returning())[0];
   }
   if(existing.reviewStatus!=='approved'||existing.applicationId!==approved.id)throw new ApiError(403,'productApprovalRequired');
   return (await tx.update(listings).set({...updated,status:'published',publicationConsentAt:new Date()}).where(eq(listings.id,id)).returning())[0];
  });return privateView(listing);
 });
 app.post('/v1/admin/services/:id/review',async req=>{
  const actor=await user(req);if(!actor.isAdmin)throw new ApiError(403,'adminRequired');
  const {id}=idInput.parse(req.params),input=reviewInput.parse(req.body);
  const listing=await db.transaction(async tx=>{
   const [read]=await tx.select().from(listings).where(eq(listings.id,id));if(!read)throw new ApiError(404,'notFound');
   if(read.ownerId===actor.id)throw new ApiError(403,'ownServiceReview');
   const [owner]=await tx.select().from(users).where(eq(users.id,read.ownerId)).for('update');
   const [existing]=await tx.select().from(listings).where(eq(listings.id,id)).for('update');
   if(existing.revision!==input.revision)throw new ApiError(409,'listingConflict');
   if(existing.reviewStatus!=='pending')throw new ApiError(409,'productReviewNotPending');
   if(input.decision==='approved'){
    if(owner.suspended||owner.providerSuspended||existing.moderationBlocked)throw new ApiError(403,'publicationRestricted');
    const [approved]=await tx.select().from(applications).where(and(eq(applications.userId,owner.id),eq(applications.status,'approved'))).orderBy(desc(applications.submittedAt),desc(applications.id)).limit(1);
    if(!approved||approved.id!==existing.applicationId)throw new ApiError(409,'providerApprovalRequired');
   }
   const [item]=await tx.update(listings).set({reviewStatus:input.decision,reviewReason:input.reason,reviewerId:actor.id,reviewedAt:new Date(),revision:existing.revision+1,status:'draft',publicationConsentAt:null,updatedAt:new Date()}).where(eq(listings.id,id)).returning();
   await tx.insert(adminActions).values({actorId:actor.id,action:`services.${input.decision}`,targetId:id,reason:input.reason});return item;
  });return privateView(listing);
 });
}
