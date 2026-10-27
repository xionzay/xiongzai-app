import { eq } from 'drizzle-orm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { users, applications, listings, adminActions } from '../src/schema.js';
test('admin authorization, account/provider restrictions, revision-safe moderation and atomic history',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false});
 const req=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const signup=async(phone:string)=> (await req('POST','/v1/auth/register',{phone,password:'admin-fixture-password',nickname:'Admin QA',bio:'Test biography',accepted:true})).data;
  const actor=await signup('13800138061'),owner=await signup('13800138062');await db.update(users).set({isAdmin:true}).where(eq(users.id,actor.profile.id));
  assert.equal((await req('GET','/v1/admin/overview')).status,401);assert.equal((await req('GET','/v1/admin/users',undefined,owner.token)).status,403);
  const list=await req('GET','/v1/admin/users?q=13800138062',undefined,actor.token);assert.equal(list.data.items.length,1);assert.ok(!JSON.stringify(list.data).includes('passwordHash'));
  assert.equal((await req('POST',`/v1/admin/users/${actor.profile.id}/status`,{suspended:true,reason:'Protect admin account'},actor.token)).status,403);
  const [application]=await db.insert(applications).values({userId:owner.profile.id,status:'approved',reviewedAt:new Date(),reviewerId:actor.profile.id,snapshot:{nickname:'Provider',bio:'Approved biography',avatarMediaId:randomUUID(),draft:{gameName:'QA',gameId:'secret-id',server:'wechat',rank:'Ace',kd:'3',experience:'Experienced',playStyle:'Calm',mode:'squad',voiceMediaId:randomUUID()}},agreementVersion:'qa'}).returning();
  const id=randomUUID();await db.insert(listings).values({id,ownerId:owner.profile.id,title:'Admin test service',description:'A complete service description.',game:'peaceElite',mode:'duo',category:'relaxed',priceFen:100,status:'published',applicationId:application.id,publicationConsentAt:new Date()});
  assert.equal((await req('GET',`/v1/listings/${id}`)).status,200);
  assert.equal((await req('POST',`/v1/admin/providers/${owner.profile.id}/status`,{suspended:true,reason:'Provider safety review'},actor.token)).status,200);
  assert.equal((await req('GET',`/v1/listings/${id}`)).status,404);assert.equal((await req('GET','/v1/me',undefined,owner.token)).status,200);
  assert.equal((await req('POST',`/v1/me/listings/${id}/publish`,{revision:1,accepted:true},owner.token)).status,403);
  await req('POST',`/v1/admin/providers/${owner.profile.id}/status`,{suspended:false,reason:'Provider review complete'},actor.token);
  assert.equal((await req('GET',`/v1/listings/${id}`)).status,200);
  assert.equal((await req('POST',`/v1/admin/services/${id}/moderation`,{blocked:true,reason:'bad',revision:1},actor.token)).status,400);
  const results=await Promise.all([req('POST',`/v1/admin/services/${id}/moderation`,{blocked:true,reason:'Service quality review',revision:1},actor.token),req('POST',`/v1/admin/services/${id}/moderation`,{blocked:true,reason:'Concurrent quality review',revision:1},actor.token)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await req('GET',`/v1/listings/${id}`)).status,404);assert.equal((await req('POST',`/v1/me/listings/${id}/publish`,{revision:2,accepted:true},owner.token)).status,403);
  await req('POST',`/v1/admin/services/${id}/moderation`,{blocked:false,reason:'Service review complete',revision:2},actor.token);assert.equal((await req('GET',`/v1/listings/${id}`)).status,200);
  await req('POST',`/v1/admin/users/${owner.profile.id}/status`,{suspended:true,reason:'Account safety review'},actor.token);
  assert.equal((await req('GET','/v1/me',undefined,owner.token)).status,200);assert.equal((await req('PATCH','/v1/me',{bio:'Blocked edit'},owner.token)).status,403);assert.equal((await req('GET',`/v1/listings/${id}`)).status,404);assert.equal((await req('POST','/v1/auth/login',{phone:'13800138062',password:'admin-fixture-password'})).status,200);
  await req('POST',`/v1/admin/users/${owner.profile.id}/status`,{suspended:false,reason:'Account review complete'},actor.token);assert.equal((await req('GET','/v1/me',undefined,owner.token)).status,200);
  assert.equal((await req('GET','/v1/admin/overview',undefined,actor.token)).status,200);assert.equal((await req('GET','/v1/admin/services',undefined,actor.token)).status,200);assert.equal((await req('GET',`/v1/admin/services/${id}`,undefined,actor.token)).status,200);assert.equal((await req('GET',`/v1/admin/users/${owner.profile.id}`,undefined,actor.token)).status,200);
  const history=(await req('GET','/v1/admin/history',undefined,actor.token)).data.items.filter((a:any)=>a.actor==='Admin QA');assert.equal(history.length,6);assert.ok(history.every((a:any)=>a.actor==='Admin QA'&&a.reason));assert.equal((await db.select().from(adminActions).where(eq(adminActions.actorId,actor.profile.id))).length,6);
 }finally{await app.close();await pool.end();}
});
