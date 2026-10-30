import {accountRightsRoutes} from './account-rights.js';
import {contentRoutes} from './content.js';
import {marketplaceRoutes} from './marketplace.js';
import { commerceRoutes } from './commerce.js';
import { orderRoutes } from './orders.js';
import { adminRoutes } from './admin.js';
import { listingRoutes } from './listings.js';
import { ownedMedia, mediaFiles } from './media-records.js';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db.js';
import { users, sessions, applications, media, adminActions } from './schema.js';
import { authenticate, createSession, digest, hashPassword, limit, verifyPassword } from './auth.js';
import { ApiError, credentials, registerSchema, profileSchema, submitSchema, reviewSchema, uploadSchema } from './validation.js';
import { type MediaStorage, inspectMedia } from './storage.js';

type User=typeof users.$inferSelect;
export function buildApp({db,storage,logger=true}:{db:Database;storage?:MediaStorage;logger?:boolean}) {
 const app=Fastify({logger:logger?{redact:['req.headers.authorization','req.headers.cookie'],serializers:{req:req=>({method:req.method,url:req.url})}}:false,bodyLimit:64*1024,requestTimeout:30000});
 app.addHook('onSend',async(_req,reply,payload)=>{reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');return payload;});
 app.setErrorHandler((error,req,reply)=>{
   if(error instanceof z.ZodError) return reply.code(400).send({error:'invalidInput',fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
   if(error instanceof ApiError) return reply.code(error.statusCode).send({error:error.code});
   const code=(error as any).cause?.code??(error as any).code;
   if(code==='23505') return reply.code(409).send({error:'alreadyExists'});
   if((error as any).statusCode===400)return reply.code(400).send({error:'invalidInput'});
   if((error as any).statusCode===413) return reply.code(413).send({error:'payloadTooLarge'});
   req.log.error({code,requestId:req.id},'Request failed');
   return reply.code(500).send({error:'serverError'});
 });
 const requireUser=(req:{headers:{authorization?:string}})=>authenticate(db,req.headers.authorization);
 const requireAdmin=async(req:{headers:{authorization?:string}})=>{const user=await requireUser(req);if(!user.isAdmin)throw new ApiError(403,'adminRequired');return user;};
 const filesFor=(ids:(string|null|undefined)[])=>mediaFiles(db,storage,ids);
 async function view(id:string){
   const user=(await db.select().from(users).where(eq(users.id,id)))[0];
   if(!user)throw new ApiError(401,'sessionExpired');
   const application=(await db.select().from(applications).where(eq(applications.userId,id)).orderBy(desc(applications.submittedAt)).limit(1))[0]??null;
   const {passwordHash,...profile}=user;
   const files=await filesFor([user.avatarMediaId,user.draft?.voiceMediaId,application?.snapshot.avatarMediaId,application?.snapshot.draft.voiceMediaId]);
   return {profile:{...profile,application},files};
 }
 app.get('/health',async()=>({ok:true,service:'sammy-api'}));
 const localMedia=process.env.NODE_ENV!=='production'&&!process.env.VERCEL?' http://127.0.0.1:9410':'';
 let uploadOrigins=localMedia;
 if(process.env.CLOUDINARY_CLOUD_NAME)uploadOrigins+=' https://api.cloudinary.com';
 try{const endpoint=new URL(process.env.S3_ENDPOINT??'');if(endpoint.protocol==='https:'||(process.env.NODE_ENV!=='production'&&!process.env.VERCEL&&endpoint.protocol==='http:')){uploadOrigins+=' '+endpoint.origin;const bucket=process.env.S3_BUCKET;if(bucket&&/^[a-z0-9][a-z0-9.-]+$/.test(bucket)&&!/^\d+\./.test(endpoint.hostname)&&endpoint.hostname!=='localhost'){endpoint.hostname=bucket+'.'+endpoint.hostname;uploadOrigins+=' '+endpoint.origin;}}}catch{}
 app.get('/admin',async(_req,reply)=>{reply.header('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:${localMedia}; media-src https:${localMedia}; connect-src 'self'${uploadOrigins}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);return reply.type('text/html').send(await readFile(new URL('../public/admin.html',import.meta.url),'utf8'));});
 const adminAssets:Record<string,string>={'admin.js':'application/javascript','admin.css':'text/css','admin-cloud-world.webp':'image/webp','admin-cloud-bank.webp':'image/webp','admin-mascot.png':'image/png'};
 for(const [name,mime] of Object.entries(adminAssets))app.get(`/admin/${name}`,async(_req,reply)=>reply.type(mime).send(await readFile(new URL(`../public/${name}`,import.meta.url))));
 app.post('/v1/auth/register',async(req,reply)=>{
   const input=registerSchema.parse(req.body);await limit(db,`register:${req.ip}`,20);await limit(db,`register:${input.phone}`,5);
   if(input.draft?.voiceMediaId)throw new ApiError(400,'invalidInput');
   const hash=await hashPassword(input.password);
   const [user]=await db.insert(users).values({phone:input.phone,passwordHash:hash,nickname:input.nickname,bio:input.bio,draft:input.draft}).returning();
   const token=await createSession(db,user.id);return reply.code(201).send({token,...await view(user.id)});
 });
 app.post('/v1/auth/login',async req=>{
   const input=credentials.parse(req.body);await limit(db,`login-ip:${req.ip}`,100);await limit(db,`login:${input.phone}`,8);
   const user=(await db.select().from(users).where(eq(users.phone,input.phone)))[0];
   if(!await verifyPassword(input.password,user?.passwordHash))throw new ApiError(401,'invalidCredentials');
   if(user.suspended&&user.isAdmin)throw new ApiError(403,'accountSuspended');
   const token=await createSession(db,user.id);return {token,...await view(user.id)};
 });
 app.post('/v1/auth/logout',async req=>{await authenticate(db,req.headers.authorization,{allowRestricted:true});await db.delete(sessions).where(eq(sessions.tokenHash,digest(req.headers.authorization!.slice(7))));return {ok:true};});
 app.get('/v1/me',async req=>view((await authenticate(db,req.headers.authorization,{allowRestricted:true})).id));
 app.patch('/v1/me',async req=>{
   const user=await requireUser(req), input=profileSchema.parse(req.body);
   if(input.avatarMediaId)await ownedMedia(db,user.id,input.avatarMediaId,'avatar');
   if(input.draft?.voiceMediaId)await ownedMedia(db,user.id,input.draft.voiceMediaId,'voice');
   await db.update(users).set(input).where(eq(users.id,user.id));return view(user.id);
 });
 app.post('/v1/media',async req=>{
   const user=await authenticate(db,req.headers.authorization,{allowRestricted:true}),input=uploadSchema.parse(req.body);if(user.suspended&&!input.kind.startsWith('evidence'))throw new ApiError(403,'accountSuspended');if(!storage)throw new ApiError(503,'storageNotConfigured');
   await limit(db,`media:${user.id}`,30);
   // Raw Cloudinary uploads append the original filename extension when the
   // signed public_id has none. Include it so native multipart filenames and
   // the database key always identify the same object.
   const extension:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/mp4':'m4a','audio/mpeg':'mp3','audio/aac':'aac','video/mp4':'mp4'};
   const id=randomUUID(),key=`incoming/${user.id}/${id}.${extension[input.mime]}`;
   const upload=await storage.createUpload(key,input.mime,input.bytes);
   await db.insert(media).values({id,ownerId:user.id,status:'pending',key,...input});return {id,...upload};
 });
 app.post('/v1/media/:id/complete',async req=>{
   const user=await authenticate(db,req.headers.authorization,{allowRestricted:true}),{id}=z.object({id:z.uuid()}).parse(req.params);if(!storage)throw new ApiError(503,'storageNotConfigured');
   const item=(await db.select().from(media).where(eq(media.id,id)))[0];
   if(!item||item.ownerId!==user.id)throw new ApiError(403,'mediaNotOwned');
   if(item.status==='ready')return {files:await filesFor([id])};
   if(Date.now()-item.createdAt.getTime()>15*60_000)throw new ApiError(409,'uploadExpired');
   const buffer=await storage.read(item.key,item.bytes);
   if(buffer.length!==item.bytes)throw new ApiError(400,'invalidMedia');
   const checked=await inspectMedia(buffer,item.kind,item.mime);
   // A new object holds the validated bytes; the still-valid upload URL cannot alter it.
   const key=`verified/${user.id}/${randomUUID()}.${checked.extension}`;
   await storage.store(key,buffer,checked.mime);
   const updated=await db.update(media).set({status:'ready',key,durationMs:checked.durationMs,contentHash:digest(buffer.toString('base64'))}).where(and(eq(media.id,id),eq(media.status,'pending'))).returning();
   if(!updated.length)await storage.remove(key).catch(()=>{});
   await storage.remove(item.key).catch(()=>{});
   return {files:await filesFor([id])};
 });
 app.post('/v1/me/application',async req=>{
   const user=await requireUser(req);submitSchema.parse(req.body);
   await db.transaction(async tx=>{
     const [locked]=await tx.select().from(users).where(eq(users.id,user.id)).for('update');
     const latest=(await tx.select().from(applications).where(eq(applications.userId,user.id)).orderBy(desc(applications.submittedAt)).limit(1))[0];
     if(latest?.status==='pending')return;
     if(latest?.status==='approved')throw new ApiError(409,'alreadyApproved');
     if(!locked.draft||!locked.avatarMediaId||!locked.bio.trim()||!locked.draft.voiceMediaId)throw new ApiError(409,'applicationIncomplete');
     await ownedMedia(tx,user.id,locked.avatarMediaId,'avatar');await ownedMedia(tx,user.id,locked.draft.voiceMediaId,'voice');
     await tx.insert(applications).values({userId:user.id,agreementVersion:'prototype-hosted-v1',snapshot:{nickname:locked.nickname,bio:locked.bio,avatarMediaId:locked.avatarMediaId,draft:locked.draft}});
   });return view(user.id);
 });
 app.get('/v1/admin/applications',async req=>{
   await requireAdmin(req);const query=z.object({status:z.enum(['pending','approved','changes_requested']).default('pending')}).parse(req.query);
   return {applications:await db.select({id:applications.id,nickname:users.nickname,status:applications.status,submittedAt:applications.submittedAt}).from(applications).innerJoin(users,eq(users.id,applications.userId)).where(eq(applications.status,query.status)).orderBy(desc(applications.submittedAt)).limit(100)};
 });
 app.get('/v1/admin/applications/:id',async req=>{
   await requireAdmin(req);const {id}=z.object({id:z.uuid()}).parse(req.params);const application=(await db.select().from(applications).where(eq(applications.id,id)))[0];
   if(!application)throw new ApiError(404,'notFound');
   return {application,files:await filesFor([application.snapshot.avatarMediaId,application.snapshot.draft.voiceMediaId])};
 });
 app.post('/v1/admin/applications/:id/review',async req=>{
   const admin=await requireAdmin(req),{id}=z.object({id:z.uuid()}).parse(req.params),input=reviewSchema.parse(req.body);
   const application=await db.transaction(async tx=>{
     const [item]=await tx.select().from(applications).where(eq(applications.id,id)).for('update');
     if(!item)throw new ApiError(404,'notFound');
     if(item.userId===admin.id)throw new ApiError(403,'selfReviewForbidden');
     if(item.status!=='pending')throw new ApiError(409,'alreadyReviewed');
     const [updated]=await tx.update(applications).set({status:input.decision,reason:input.reason||null,reviewedAt:new Date(),reviewerId:admin.id}).where(eq(applications.id,id)).returning();
     await tx.insert(adminActions).values({actorId:admin.id,action:'application.'+input.decision,targetId:id,reason:input.reason||null});return updated;
   });return {application};
 });
 accountRightsRoutes(app,db);
 contentRoutes(app,db);
 marketplaceRoutes(app,db,storage);
 commerceRoutes(app,db,storage);
 orderRoutes(app,db);
 adminRoutes(app,db,storage);
 listingRoutes(app,db,storage);
 return app;
}
