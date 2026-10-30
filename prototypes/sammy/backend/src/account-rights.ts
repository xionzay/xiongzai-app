import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gt, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db.js';
import { adminActions, applications, listings, media, orders, sessions, users } from './schema.js';
import { conversations, messages, tickets } from './commerce-schema.js';
import { orderReviews, productFavorites, storeFavorites } from './marketplace-schema.js';
import { authenticate, digest, hashPassword, limit, verifyPassword } from './auth.js';
import { ApiError } from './validation.js';

export function accountRightsRoutes(app:FastifyInstance,db:Database){
 const actor=(req:{headers:{authorization?:string}})=>authenticate(db,req.headers.authorization,{allowRestricted:true});

 app.get('/v1/me/export',async req=>{
  const account=await actor(req);
  // One database snapshot keeps an export consistent while ordinary account activity continues.
  return db.transaction(async tx=>{
   const [owner]=await tx.select().from(users).where(eq(users.id,account.id));
   if(!owner)throw new ApiError(401,'sessionExpired');
   const profile={id:owner.id,phone:owner.phone,nickname:owner.nickname,bio:owner.bio,avatarMediaId:owner.avatarMediaId,draft:owner.draft,createdAt:owner.createdAt,isAdmin:owner.isAdmin,isSupervisor:owner.isSupervisor,suspended:owner.suspended,suspensionReason:owner.suspensionReason,providerSuspended:owner.providerSuspended,providerSuspensionReason:owner.providerSuspensionReason};
   const ownApplications=await tx.select().from(applications).where(eq(applications.userId,owner.id)).orderBy(asc(applications.submittedAt),asc(applications.id));
   const ownListings=await tx.select().from(listings).where(eq(listings.ownerId,owner.id)).orderBy(asc(listings.id));
   // Delivery credentials and internal idempotency hashes are deliberately absent.
   const ownOrders=await tx.select({id:orders.id,buyerId:orders.buyerId,sellerId:orders.sellerId,listingId:orders.listingId,service:orders.service,rules:orders.rules,quantity:orders.quantity,totalFen:orders.totalFen,status:orders.status,simulated:orders.simulated,createdAt:orders.createdAt,paidAt:orders.paidAt,closedAt:orders.closedAt}).from(orders).where(or(eq(orders.buyerId,owner.id),eq(orders.sellerId,owner.id))).orderBy(asc(orders.createdAt),asc(orders.id));
   const ownMessages=await tx.select({id:messages.id,conversationId:messages.conversationId,senderId:messages.senderId,kind:messages.kind,body:messages.body,objectId:messages.objectId,createdAt:messages.createdAt}).from(messages).innerJoin(conversations,eq(conversations.id,messages.conversationId)).where(or(eq(conversations.buyerId,owner.id),eq(conversations.sellerId,owner.id))).orderBy(asc(messages.createdAt),asc(messages.id));
   const ownTickets=await tx.select({id:tickets.id,userId:tickets.userId,orderId:tickets.orderId,kind:tickets.kind,category:tickets.category,text:tickets.text,status:tickets.status,replies:tickets.replies,createdAt:tickets.createdAt,updatedAt:tickets.updatedAt}).from(tickets).where(eq(tickets.userId,owner.id)).orderBy(asc(tickets.createdAt),asc(tickets.id));
   const ownReviews=await tx.select().from(orderReviews).where(eq(orderReviews.buyerId,owner.id)).orderBy(asc(orderReviews.createdAt),asc(orderReviews.id));
   const products=await tx.select().from(productFavorites).where(eq(productFavorites.userId,owner.id)).orderBy(asc(productFavorites.createdAt),asc(productFavorites.listingId));
   const stores=await tx.select().from(storeFavorites).where(eq(storeFavorites.userId,owner.id)).orderBy(asc(storeFavorites.createdAt),asc(storeFavorites.sellerId));
   // Export references, never storage object keys, signed links or signing credentials.
   const ownMedia=await tx.select({id:media.id,kind:media.kind,status:media.status,mime:media.mime,bytes:media.bytes,durationMs:media.durationMs,createdAt:media.createdAt}).from(media).where(eq(media.ownerId,owner.id)).orderBy(asc(media.createdAt),asc(media.id));
   return {exportedAt:new Date().toISOString(),formatVersion:1,profile,applications:ownApplications,listings:ownListings,orders:ownOrders,messages:ownMessages,tickets:ownTickets,reviews:ownReviews,favorites:{products,stores},media:ownMedia};
  },{isolationLevel:'repeatable read',accessMode:'read only'});
 });

 app.post('/v1/me/password',async req=>{
  const account=await actor(req),input=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(128)}).strict().parse(req.body);
  await limit(db,'password:'+account.id,8);
  const currentTokenHash=digest(req.headers.authorization!.slice(7));
  await db.transaction(async tx=>{
   // Re-read after the account lock: a concurrent password change must not verify a stale hash.
   const [owner]=await tx.select().from(users).where(eq(users.id,account.id)).for('update');
   const [currentSession]=await tx.select({tokenHash:sessions.tokenHash}).from(sessions).where(and(eq(sessions.userId,account.id),eq(sessions.tokenHash,currentTokenHash),gt(sessions.expiresAt,new Date())));
   if(!owner||!currentSession)throw new ApiError(401,'sessionExpired');
   if(!await verifyPassword(input.currentPassword,owner.passwordHash))throw new ApiError(401,'invalidCredentials');
   const passwordHash=await hashPassword(input.newPassword);
   await tx.update(users).set({passwordHash}).where(eq(users.id,owner.id));
   await tx.delete(sessions).where(and(eq(sessions.userId,owner.id),ne(sessions.tokenHash,currentTokenHash)));
   await tx.insert(adminActions).values({actorId:owner.id,action:'password.changed',targetId:owner.id,reason:'Account password changed; other sessions revoked.'});
  });
  return {ok:true,requiresLogin:false};
 });
}
