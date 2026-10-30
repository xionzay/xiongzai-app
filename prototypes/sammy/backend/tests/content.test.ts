import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { createSession } from '../src/auth.js';
import { adminActions, users } from '../src/schema.js';
import { platformAnnouncements } from '../src/content.js';

test('announcements require staff access, stay private as drafts and publish only with revision and audited reason',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!),app=buildApp({db,logger:false});
 const request=async(method:'GET'|'POST',url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:'Bearer '+token}:{}});return {status:r.statusCode,data:r.json()};};
 const person=async(phone:string,isAdmin=false)=>{const [user]=await db.insert(users).values({phone,nickname:isAdmin?'Content reviewer':'Content reader',passwordHash:'fixture',isAdmin}).returning();return {...user,token:await createSession(db,user.id)};};
 try{
  const staff=await person('13900009601',true),otherStaff=await person('13900009602',true),reader=await person('13900009603');
  const draft={requestId:randomUUID(),title:{en:' Service notice ',zh:' 服务公告 '},body:{en:'A scheduled update will be announced here.',zh:'服务更新将在此公布。'}};
  assert.equal((await request('GET','/v1/announcements')).status,200);
  assert.equal((await request('GET','/v1/admin/content')).status,401);
  assert.equal((await request('GET','/v1/admin/content',undefined,reader.token)).status,403);
  assert.equal((await request('POST','/v1/admin/content/announcements',draft)).status,401);
  assert.equal((await request('POST','/v1/admin/content/announcements',draft,reader.token)).status,403);
  assert.equal((await request('POST','/v1/admin/content/announcements',{...draft,published:true},staff.token)).status,400);
  assert.equal((await request('POST','/v1/admin/content/announcements',{...draft,title:{en:'Only one language'}},staff.token)).status,400);
  const concurrent=await Promise.all(Array.from({length:3},()=>request('POST','/v1/admin/content/announcements',draft,staff.token)));
  assert.ok(concurrent.every(r=>r.status===200));assert.equal(new Set(concurrent.map(r=>r.data.announcement.id)).size,1);
  const saved=concurrent[0].data.announcement,id=saved.id,url='/v1/admin/content/announcements/'+id;
  assert.equal(saved.published,false);assert.equal(saved.revision,1);assert.equal(saved.title.en,'Service notice');
  assert.equal((await request('POST','/v1/admin/content/announcements',{...draft,body:{...draft.body,en:'Different text'}},staff.token)).data.error,'requestConflict');
  assert.equal((await request('POST','/v1/admin/content/announcements',draft,otherStaff.token)).data.error,'requestConflict');
  assert.ok((await request('GET','/v1/admin/content',undefined,staff.token)).data.announcements.some((a:any)=>a.id===id));
  assert.ok(!(await request('GET','/v1/announcements')).data.announcements.some((a:any)=>a.id===id));
  const update={revision:1,title:saved.title,body:saved.body,published:true,reason:'Publish the reviewed service notice'};
  assert.equal((await request('POST',url,update,reader.token)).status,403);
  assert.equal((await request('POST',url,{...update,reason:' '},staff.token)).status,400);
  assert.equal((await request('POST',url,{...update,revision:2},staff.token)).data.error,'contentConflict');
  const published=await request('POST',url,update,staff.token);assert.equal(published.status,200);assert.equal(published.data.announcement.revision,2);assert.ok(published.data.announcement.publishedAt);
  const visible=(await request('GET','/v1/announcements')).data.announcements.find((a:any)=>a.id===id);assert.ok(visible);assert.deepEqual(Object.keys(visible).sort(),['body','id','revision','title','updatedAt']);assert.deepEqual(visible.title,saved.title);
  const edits=await Promise.all(['First reviewed edit','Second reviewed edit'].map(reason=>request('POST',url,{...update,revision:2,reason},staff.token)));
  assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request('POST',url,{...update,revision:2,published:false},staff.token)).data.error,'contentConflict');
  const unpublished=await request('POST',url,{...update,revision:3,published:false,reason:'Remove the outdated service notice'},staff.token);assert.equal(unpublished.status,200);assert.equal(unpublished.data.announcement.revision,4);
  assert.ok(!(await request('GET','/v1/announcements')).data.announcements.some((a:any)=>a.id===id));
  const audit=await db.select().from(adminActions).where(eq(adminActions.targetId,id));assert.deepEqual(audit.map(a=>a.action).sort(),['content.created','content.published','content.unpublished','content.updated']);assert.ok(audit.every(a=>a.actorId===staff.id&&a.reason));
  assert.equal((await db.select().from(platformAnnouncements).where(eq(platformAnnouncements.requestId,draft.requestId))).length,1);
  await db.update(users).set({suspended:true}).where(eq(users.id,staff.id));assert.equal((await request('POST',url,{...update,revision:4},staff.token)).status,403);
 }finally{await app.close();await pool.end();}
});
