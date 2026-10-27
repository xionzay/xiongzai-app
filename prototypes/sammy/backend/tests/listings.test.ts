import { eq } from 'drizzle-orm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { applications, media, listings } from '../src/schema.js';

test('listings require ownership, approval, publication consent and matching revisions; public output stays private',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);
 const app=buildApp({db,logger:false});
 const request=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const signup=async(phone:string)=>request('POST','/v1/auth/register',{phone,password:'listing-fixture-password',nickname:'Listing QA',bio:'Private draft bio',accepted:true});
  const {data:owner}=await signup('13800138051'),{data:other}=await signup('13800138052');
  const id=randomUUID(),body={revision:0,title:'Calm squad practice',description:'Practice teamwork with a patient companion.',game:'peaceElite',mode:'squad',category:'relaxed',priceFen:3900,photoMediaIds:[]};
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,body)).status,401);
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,{...body,priceFen:0},owner.token)).status,400);
  const created=await request('PUT',`/v1/me/listings/${id}`,body,owner.token);assert.equal(created.status,200);assert.equal(created.data.listing.status,'draft');
  assert.equal((await request('GET',`/v1/listings/${id}`)).status,404);
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,{...body,revision:1},other.token)).status,404);
  assert.equal((await request('POST',`/v1/me/listings/${id}/publish`,{revision:1,accepted:true},owner.token)).status,403);
  const avatar=randomUUID(),voice=randomUUID();
  await db.insert(media).values([{id:avatar,ownerId:owner.profile.id,kind:'avatar',status:'ready',key:`verified/${avatar}.png`,mime:'image/png',bytes:100},{id:voice,ownerId:owner.profile.id,kind:'voice',status:'ready',key:`verified/${voice}.m4a`,mime:'audio/mp4',bytes:100,durationMs:12000}]);
  await db.insert(applications).values({userId:owner.profile.id,status:'approved',snapshot:{nickname:'Approved name',bio:'Approved bio',avatarMediaId:avatar,draft:{gameName:'Private handle',gameId:'private-id',server:'wechat',rank:'Ace',kd:'3.2',experience:'Years',playStyle:'Calm',mode:'squad',voiceMediaId:voice}},agreementVersion:'prototype-hosted-v1',reviewedAt:new Date(),reviewerId:other.profile.id});
  assert.equal((await request('POST',`/v1/me/listings/${id}/publish`,{revision:1,accepted:false},owner.token)).status,400);
  const published=await request('POST',`/v1/me/listings/${id}/publish`,{revision:1,accepted:true},owner.token);assert.equal(published.status,200);
  const publicView=await request('GET',`/v1/listings/${id}`);assert.equal(publicView.status,200);assert.equal(publicView.data.listing.provider.nickname,'Approved name');
  const output=JSON.stringify(publicView.data);for(const secret of ['13800138051','private-id','Private handle','Private draft bio','reviewerId','passwordHash'])assert.ok(!output.includes(secret),secret);
  assert.equal((await request('GET','/v1/listings?q=calm&category=relaxed')).data.listings.length,1);
  assert.equal((await request('GET','/v1/listings?q=%25')).data.listings.length,0);
  assert.equal((await request('GET','/v1/listings?category=ranked')).data.listings.length,0);
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,{...body,revision:1},owner.token)).status,409);
  const results=await Promise.all([request('PUT',`/v1/me/listings/${id}`,{...body,revision:2},owner.token),request('PUT',`/v1/me/listings/${id}`,{...body,revision:2,title:'Concurrent edit'},owner.token)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request('GET',`/v1/listings/${id}`)).status,404);
  await request('POST',`/v1/me/listings/${id}/publish`,{revision:3,accepted:true},owner.token);
  assert.equal((await request('POST',`/v1/me/listings/${id}/unpublish`,{revision:4},owner.token)).status,200);
  assert.equal((await request('GET',`/v1/listings/${id}`)).status,404);
  assert.equal((await request('PUT',`/v1/me/listings/${randomUUID()}`,{...body,photoMediaIds:[avatar]},other.token)).status,403);
  const [approval]=await db.select().from(applications).where(eq(applications.userId,owner.profile.id));
  await db.insert(listings).values(Array.from({length:21},(_,i)=>({id:randomUUID(),ownerId:owner.profile.id,title:`Paging ${i}`,description:'A pagination fixture service',game:'peaceElite' as const,mode:'duo' as const,category:'relaxed' as const,priceFen:100,status:'published' as const,applicationId:approval.id,publicationConsentAt:new Date()})));
  const first=(await request('GET','/v1/listings?q=Paging')).data;
  assert.equal(first.listings.length,20);assert.ok(first.nextCursor);
  const second=(await request('GET',`/v1/listings?q=Paging&after=${first.nextCursor}`)).data;
  assert.equal(second.listings.length,1);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.listings,...second.listings].map((item:{id:string})=>item.id)).size,21);
 }finally{await app.close();await pool.end();}
});
