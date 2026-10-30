import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Database } from './db.js';
import { adminActions, users } from './schema.js';
import { authenticate, digest, limit } from './auth.js';
import { ApiError } from './validation.js';

type Bilingual={en:string;zh:string};
export const platformAnnouncements=pgTable('platform_announcements',{
 id:uuid().primaryKey().defaultRandom(),creatorId:uuid('creator_id').notNull().references(()=>users.id),updaterId:uuid('updater_id').notNull().references(()=>users.id),requestId:uuid('request_id').notNull().unique(),requestHash:text('request_hash').notNull(),
 title:jsonb().$type<Bilingual>().notNull(),body:jsonb().$type<Bilingual>().notNull(),published:boolean().notNull().default(false),revision:integer().notNull().default(1),lastReason:text('last_reason'),publishedAt:timestamp('published_at',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
});
const bilingual=(maximum:number)=>z.object({en:z.string().trim().min(1).max(maximum),zh:z.string().trim().min(1).max(maximum)}).strict();
const copy={title:bilingual(120),body:bilingual(3000)};
export function contentRoutes(app:FastifyInstance,db:Database){
 const admin=async(req:{headers:{authorization?:string}})=>{const actor=await authenticate(db,req.headers.authorization);if(!actor.isAdmin)throw new ApiError(403,'adminRequired');return actor;};
 app.get('/v1/announcements',async()=>({announcements:await db.select({id:platformAnnouncements.id,title:platformAnnouncements.title,body:platformAnnouncements.body,revision:platformAnnouncements.revision,updatedAt:platformAnnouncements.updatedAt}).from(platformAnnouncements).where(eq(platformAnnouncements.published,true)).orderBy(desc(platformAnnouncements.updatedAt),desc(platformAnnouncements.id))}));
 app.get('/v1/admin/content',async req=>{await admin(req);return {announcements:await db.select().from(platformAnnouncements).orderBy(desc(platformAnnouncements.updatedAt),desc(platformAnnouncements.id))};});
 app.post('/v1/admin/content/announcements',async req=>{
  const actor=await admin(req),input=z.object({requestId:z.uuid(),...copy}).strict().parse(req.body);await limit(db,'content-write:'+actor.id,60);
  const requestHash=digest(JSON.stringify({title:input.title,body:input.body}));
  return db.transaction(async tx=>{
   const [created]=await tx.insert(platformAnnouncements).values({...input,creatorId:actor.id,updaterId:actor.id,requestHash}).onConflictDoNothing().returning();
   if(!created){const [prior]=await tx.select().from(platformAnnouncements).where(eq(platformAnnouncements.requestId,input.requestId));if(!prior||prior.creatorId!==actor.id||prior.requestHash!==requestHash)throw new ApiError(409,'requestConflict');return {announcement:prior};}
   await tx.insert(adminActions).values({actorId:actor.id,action:'content.created',targetId:created.id,reason:'Announcement draft created'});return {announcement:created};
  });
 });
 app.post('/v1/admin/content/announcements/:id',async req=>{
  const actor=await admin(req),{id}=z.object({id:z.uuid()}).parse(req.params),input=z.object({revision:z.number().int().positive(),...copy,published:z.boolean(),reason:z.string().trim().min(5).max(1000)}).strict().parse(req.body);await limit(db,'content-write:'+actor.id,60);
  return db.transaction(async tx=>{
   const [current]=await tx.select().from(platformAnnouncements).where(eq(platformAnnouncements.id,id)).for('update');if(!current)throw new ApiError(404,'notFound');if(current.revision!==input.revision)throw new ApiError(409,'contentConflict');
   const now=new Date(),[announcement]=await tx.update(platformAnnouncements).set({title:input.title,body:input.body,published:input.published,revision:current.revision+1,lastReason:input.reason,updaterId:actor.id,updatedAt:now,publishedAt:input.published&&!current.published?now:current.publishedAt}).where(eq(platformAnnouncements.id,id)).returning();
   const action=input.published!==current.published?(input.published?'published':'unpublished'):'updated';await tx.insert(adminActions).values({actorId:actor.id,action:'content.'+action,targetId:id,reason:input.reason});return {announcement};
  });
 });
}
