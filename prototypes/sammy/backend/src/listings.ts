import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db.js';
import { listings, applications, users } from './schema.js';
import { authenticate, limit } from './auth.js';
import { ApiError } from './validation.js';
import type { MediaStorage } from './storage.js';
import { mediaFiles, ownedMedia } from './media-records.js';

const listingInput=z.object({revision:z.number().int().min(0),title:z.string().trim().min(3).max(80),description:z.string().trim().min(10).max(1500),game:z.literal('peaceElite'),mode:z.enum(['duo','squad']),category:z.enum(['relaxed','ranked']),priceFen:z.number().int().min(100).max(100000),photoMediaIds:z.array(z.uuid()).max(4).refine(ids=>new Set(ids).size===ids.length).default([])}).strict();
const revisionInput=z.object({revision:z.number().int().positive()}).strict();
const idInput=z.object({id:z.uuid()});
type Listing=typeof listings.$inferSelect;

export function listingRoutes(app:FastifyInstance,db:Database,storage?:MediaStorage){
 const user=(req:{headers:{authorization?:string}})=>authenticate(db,req.headers.authorization);
 const privateView=async(listing:Listing)=>({listing,files:await mediaFiles(db,storage,listing.photoMediaIds)});
 async function publicView(row:{listing:Listing;application:typeof applications.$inferSelect}){
  const {id,revision,title,description,game,mode,category,priceFen,photoMediaIds}=row.listing;
  const profile=row.application.snapshot;
  return {id,revision,title,description,game,mode,category,priceFen,photoMediaIds,
   provider:{nickname:profile.nickname,bio:profile.bio,rank:profile.draft.rank,playStyle:profile.draft.playStyle,avatarMediaId:profile.avatarMediaId,voiceMediaId:profile.draft.voiceMediaId},
   files:await mediaFiles(db,storage,[...photoMediaIds,profile.avatarMediaId,profile.draft.voiceMediaId])};
 }
 const published=and(eq(listings.status,'published'),eq(applications.status,'approved'),eq(users.suspended,false),eq(users.providerSuspended,false),eq(listings.moderationBlocked,false));
 app.get('/v1/listings',async req=>{
  const query=z.object({q:z.string().trim().max(80).default(''),category:z.enum(['all','relaxed','ranked']).default('all'),mode:z.enum(['all','duo','squad']).default('all'),after:z.uuid().optional()}).strict().parse(req.query);
  const term=`%${query.q.replace(/[\\%_]/g,'\\$&')}%`;
  const rows=await db.select({listing:listings,application:applications}).from(listings).innerJoin(applications,eq(listings.applicationId,applications.id)).innerJoin(users,eq(listings.ownerId,users.id)).where(and(published,
   query.q?or(ilike(listings.title,term),ilike(listings.description,term)):undefined,
   query.category!=='all'?eq(listings.category,query.category):undefined,query.mode!=='all'?eq(listings.mode,query.mode):undefined,query.after?lt(listings.id,query.after):undefined)).orderBy(desc(listings.id)).limit(21);
  return {listings:await Promise.all(rows.slice(0,20).map(publicView)),nextCursor:rows.length>20?rows[19].listing.id:null};
 });
 app.get('/v1/listings/:id',async req=>{
  const {id}=idInput.parse(req.params);
  const [row]=await db.select({listing:listings,application:applications}).from(listings).innerJoin(applications,eq(listings.applicationId,applications.id)).innerJoin(users,eq(listings.ownerId,users.id)).where(and(published,eq(listings.id,id)));
  if(!row)throw new ApiError(404,'listingUnavailable');return {listing:await publicView(row)};
 });
 app.get('/v1/me/listings',async req=>{
  const owner=await user(req);
  const rows=await db.select().from(listings).where(eq(listings.ownerId,owner.id)).orderBy(desc(listings.updatedAt));
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
   const values={...input,status:'draft' as const,revision:revision+1,applicationId:null,publicationConsentAt:null,updatedAt:new Date()};
   return existing?(await tx.update(listings).set(values).where(eq(listings.id,id)).returning())[0]:(await tx.insert(listings).values({id,ownerId:owner.id,...values}).returning())[0];
  });return privateView(listing);
 });
 for(const action of ['publish','unpublish'] as const)app.post(`/v1/me/listings/:id/${action}`,async req=>{
  const owner=await user(req),{id}=idInput.parse(req.params);
  const {revision}=(action==='publish'?revisionInput.extend({accepted:z.literal(true)}):revisionInput).parse(req.body);
  const listing=await db.transaction(async tx=>{
   const [lockedOwner]=await tx.select().from(users).where(eq(users.id,owner.id)).for('update');
   if(lockedOwner.suspended)throw new ApiError(403,'accountSuspended');
   const [existing]=await tx.select().from(listings).where(eq(listings.id,id)).for('update');
   if(!existing||existing.ownerId!==owner.id)throw new ApiError(404,'listingUnavailable');
   if(existing.revision!==revision)throw new ApiError(409,'listingConflict');
   const approved=action==='publish'?(await tx.select().from(applications).where(and(eq(applications.userId,owner.id),eq(applications.status,'approved'))).orderBy(desc(applications.submittedAt)).limit(1))[0]:null;
   if(action==='publish'&&(lockedOwner.providerSuspended||existing.moderationBlocked))throw new ApiError(403,'publicationRestricted');
   if(action==='publish'&&!approved)throw new ApiError(403,'providerApprovalRequired');
   return (await tx.update(listings).set({status:action==='publish'?'published':'draft',revision:revision+1,applicationId:approved?.id??null,publicationConsentAt:approved?new Date():null,updatedAt:new Date()}).where(eq(listings.id,id)).returning())[0];
  });return privateView(listing);
 });
}
