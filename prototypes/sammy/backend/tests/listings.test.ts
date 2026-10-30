import { eq } from 'drizzle-orm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { applications, media, listings, users, adminActions } from '../src/schema.js';

test('product review gates publication, rejects bypasses and resets after an owner edit',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false});
 const request=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const signup=async(phone:string)=>(await request('POST','/v1/auth/register',{phone,password:'listing-fixture-password',nickname:'Listing QA',bio:'Private draft bio',accepted:true})).data;
  const owner=await signup('13800138051'),other=await signup('13800138052'),staff=await signup('13800138053');
  await db.update(users).set({isAdmin:true}).where(eq(users.id,staff.profile.id));
  const id=randomUUID(),body={revision:0,title:'Calm squad practice',description:'Practice teamwork with a patient companion.',game:'peaceElite',mode:'squad',category:'relaxed',priceFen:3900,photoMediaIds:[]};
  const publish=(revision:number)=>request('POST',`/v1/me/listings/${id}/publish`,{revision,accepted:true},owner.token);
  const submit=(revision:number)=>request('POST',`/v1/me/listings/${id}/submit-review`,{revision},owner.token);
  const review=(revision:number,decision='approved',reason='Reviewed service details',token=staff.token)=>request('POST',`/v1/admin/services/${id}/review`,{revision,decision,reason},token);
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,body)).status,401);
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,{...body,priceFen:0},owner.token)).status,400);
  const created=await request('PUT',`/v1/me/listings/${id}`,body,owner.token);
  assert.equal(created.status,200);assert.equal(created.data.listing.status,'draft');assert.equal(created.data.listing.reviewStatus,'draft');assert.equal(created.data.listing.serviceType,'companion');
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,{...body,revision:1,reviewStatus:'approved'},owner.token)).status,400);
  assert.equal((await submit(1)).data.error,'providerApprovalRequired');assert.equal((await publish(1)).status,403);
  const avatar=randomUUID(),voice=randomUUID();
  await db.insert(media).values([{id:avatar,ownerId:owner.profile.id,kind:'avatar',status:'ready',key:`verified/${avatar}.png`,mime:'image/png',bytes:100},{id:voice,ownerId:owner.profile.id,kind:'voice',status:'ready',key:`verified/${voice}.m4a`,mime:'audio/mp4',bytes:100,durationMs:12000}]);
  const [approval]=await db.insert(applications).values({userId:owner.profile.id,status:'approved',snapshot:{nickname:'Approved name',bio:'Approved bio',avatarMediaId:avatar,draft:{gameName:'Private handle',gameId:'private-id',server:'wechat',rank:'Ace',kd:'3.2',experience:'Years',playStyle:'Calm',mode:'squad',voiceMediaId:voice}},agreementVersion:'prototype-hosted-v1',reviewedAt:new Date(),reviewerId:staff.profile.id}).returning();
  assert.equal((await publish(1)).data.error,'productApprovalRequired');
  assert.equal((await request('POST',`/v1/me/listings/${id}/submit-review`,{revision:1},other.token)).status,404);
  assert.equal((await submit(1)).data.listing.reviewStatus,'pending');assert.equal((await publish(2)).data.error,'productApprovalRequired');
  assert.equal((await review(2,'approved','Reviewed service details',owner.token)).status,403);assert.equal((await review(1)).status,409);
  assert.equal((await review(2,'changes_requested','')).status,400);
  assert.equal((await review(2,'changes_requested','Please clarify service scope')).data.listing.reviewStatus,'changes_requested');assert.equal((await publish(3)).data.error,'productApprovalRequired');
  assert.equal((await submit(3)).data.listing.reviewStatus,'pending');assert.equal((await review(4)).data.listing.reviewStatus,'approved');assert.equal((await review(5)).status,409);
  assert.equal((await request('POST',`/v1/me/listings/${id}/publish`,{revision:5,accepted:false},owner.token)).status,400);assert.equal((await publish(5)).status,200);
  const publicView=await request('GET',`/v1/listings/${id}`);assert.equal(publicView.status,200);
  assert.equal(publicView.data.listing.ownerId,owner.profile.id);assert.equal(publicView.data.listing.provider.id,owner.profile.id);assert.equal(publicView.data.listing.provider.nickname,'Approved name');assert.equal(publicView.data.listing.reviewStatus,'approved');
  const output=JSON.stringify(publicView.data);for(const secret of ['13800138051','private-id','Private handle','Private draft bio','reviewerId','reviewReason','passwordHash'])assert.ok(!output.includes(secret),secret);
  assert.equal((await request('GET','/v1/listings?q=Approved%20name&game=peaceElite&serviceType=companion')).data.listings.length,1);assert.equal((await request('GET','/v1/listings?q=%25')).data.listings.length,0);assert.equal((await request('GET','/v1/listings?game=valorant')).data.listings.length,0);
  assert.equal((await request('PUT',`/v1/me/listings/${id}`,{...body,revision:5},owner.token)).status,409);
  const results=await Promise.all([request('PUT',`/v1/me/listings/${id}`,{...body,revision:6},owner.token),request('PUT',`/v1/me/listings/${id}`,{...body,revision:6,title:'Concurrent edit'},owner.token)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const edited=results.find(r=>r.status===200)!.data.listing;assert.equal(edited.reviewStatus,'draft');assert.equal(edited.reviewerId,null);assert.equal(edited.reviewedAt,null);assert.equal(edited.reviewReason,null);
  assert.equal((await request('GET',`/v1/listings/${id}`)).status,404);assert.equal((await publish(7)).data.error,'productApprovalRequired');
  assert.equal((await request('PUT',`/v1/me/listings/${randomUUID()}`,{...body,photoMediaIds:[avatar]},other.token)).status,403);
  assert.equal((await submit(7)).status,200);assert.equal((await review(8)).status,200);assert.equal((await publish(9)).status,200);
  assert.equal((await request('POST',`/v1/me/listings/${id}/unpublish`,{revision:10},owner.token)).status,200);assert.equal((await publish(11)).status,200);
  await db.update(users).set({providerSuspended:true}).where(eq(users.id,owner.profile.id));assert.equal((await publish(12)).status,403);assert.equal((await request('GET',`/v1/listings/${id}`)).status,404);
  await db.update(users).set({providerSuspended:false}).where(eq(users.id,owner.profile.id));await db.update(applications).set({status:'changes_requested'}).where(eq(applications.id,approval.id));
  assert.equal((await publish(12)).data.error,'providerApprovalRequired');assert.equal((await request('GET',`/v1/listings/${id}`)).status,404);
  assert.equal((await db.select().from(adminActions).where(eq(adminActions.targetId,id))).length,3);
 }finally{await app.close();await pool.end();}
});

test('catalog migration preserves imported drafts and historical orders while legacy edits invalidate review',async()=>{
 const {pool}=createDatabase(process.env.TEST_DATABASE_URL!);const client=await pool.connect();
 try{
  await client.query('BEGIN');const namespace='catalog_migration_'+randomUUID().replaceAll('-','');
  await client.query(`CREATE SCHEMA ${namespace}`);await client.query(`SET LOCAL search_path TO ${namespace}`);
  for(const name of ['0001','0002','0003','0004','0005','0006'])await client.query(await readFile(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
  const owner=randomUUID(),buyer=randomUUID(),approval=randomUUID(),draft=randomUUID(),published=randomUUID(),order=randomUUID();
  await client.query("INSERT INTO users(id,phone,password_hash,nickname) VALUES($1,'13800138001','fixture','Seller'),($2,'13800138002','fixture','Buyer')",[owner,buyer]);
  await client.query("INSERT INTO applications(id,user_id,status,snapshot,agreement_version,reviewed_at,reviewer_id) VALUES($1,$2,'approved','{}','fixture',now(),$2)",[approval,owner]);
  await client.query("INSERT INTO listings(id,owner_id,title,description,game,mode,category,price_fen,status,application_id,publication_consent_at) VALUES($1,$3,'Imported draft','Original imported description','peaceElite','duo','relaxed',3900,'draft',NULL,NULL),($2,$3,'Historical product','Approved provider description','peaceElite','squad','ranked',5000,'published',$4,now())",[draft,published,owner,approval]);
  await client.query("INSERT INTO local_data_imports(id,source_hash,snapshot,record_ids) VALUES('fixture','original-hash','{\"retained\":true}',$1)",[JSON.stringify({listings:[draft]})]);
  await client.query("INSERT INTO orders(id,buyer_id,seller_id,listing_id,request_id,request_hash,service,rules,delivery,quantity,total_fen) VALUES($1,$2,$3,$4,'historical-order','original-hash','{\"title\":\"Historical product\",\"game\":\"peaceElite\"}','{\"version\":\"original\"}','{}',1,5000)",[order,buyer,owner,published]);
  const beforeDraft=(await client.query('SELECT id,title,description,price_fen,status,revision,updated_at FROM listings WHERE id=$1',[draft])).rows[0];
  const beforeOrder=(await client.query('SELECT * FROM orders WHERE id=$1',[order])).rows[0];
  const beforeImport=(await client.query('SELECT * FROM local_data_imports')).rows[0];
  await client.query(await readFile(new URL('../migrations/0007.sql',import.meta.url),'utf8'));
  assert.deepEqual((await client.query('SELECT id,title,description,price_fen,status,revision,updated_at FROM listings WHERE id=$1',[draft])).rows[0],beforeDraft);
  assert.deepEqual((await client.query('SELECT * FROM orders WHERE id=$1',[order])).rows[0],beforeOrder);assert.deepEqual((await client.query('SELECT * FROM local_data_imports')).rows[0],beforeImport);
  const migrated=(await client.query('SELECT * FROM listings WHERE id=$1',[published])).rows[0];assert.equal(migrated.status,'draft');assert.equal(migrated.review_status,'draft');assert.equal(migrated.revision,2);assert.equal(migrated.service_type,'companion');assert.equal(migrated.publication_consent_at,null);assert.equal(migrated.price_fen,5000);
  await client.query('SAVEPOINT publication_gate');await assert.rejects(client.query("UPDATE listings SET status='published' WHERE id=$1",[published]));await client.query('ROLLBACK TO SAVEPOINT publication_gate');
  await client.query("UPDATE listings SET review_status='approved',status='published',publication_consent_at=now(),reviewed_at=now(),reviewer_id=$2 WHERE id=$1",[published,owner]);
  await client.query("UPDATE listings SET title='Legacy writer changed product' WHERE id=$1",[published]);
  const edited=(await client.query('SELECT * FROM listings WHERE id=$1',[published])).rows[0];assert.equal(edited.status,'draft');assert.equal(edited.review_status,'draft');assert.equal(edited.revision,3);assert.equal(edited.reviewer_id,null);assert.equal(edited.application_id,null);
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});

test('four games and both service types filter listings with stable price pagination',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false});
 const request=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const {data:owner}=await request('POST','/v1/auth/register',{phone:'13800138054',password:'listing-fixture-password',nickname:'Catalog QA',accepted:true});
  const [approval]=await db.insert(applications).values({userId:owner.profile.id,status:'approved',reviewedAt:new Date(),reviewerId:owner.profile.id,snapshot:{nickname:'Catalog provider',bio:'Approved bio',avatarMediaId:randomUUID(),draft:{gameName:'Private',gameId:'private-id',server:'qq',rank:'Ace',kd:'3',experience:'Years',playStyle:'Calm',mode:'duo',voiceMediaId:null}},agreementVersion:'qa'}).returning();
  for(const game of ['peaceElite','deltaForce','honorOfKings','valorant'])for(const serviceType of ['companion','coaching']){
   const id=randomUUID(),saved=await request('PUT',`/v1/me/listings/${id}`,{revision:0,title:`Catalog ${game} ${serviceType}`,description:'A complete service description',game,serviceType,mode:'duo',category:'relaxed',priceFen:100},owner.token);
   assert.equal(saved.status,200);assert.equal(saved.data.listing.game,game);assert.equal(saved.data.listing.serviceType,serviceType);
  }
  assert.equal((await request('PUT',`/v1/me/listings/${randomUUID()}`,{revision:0,title:'Unknown game',description:'A complete service description',game:'unknown',serviceType:'companion',mode:'duo',category:'relaxed',priceFen:100},owner.token)).status,400);
  const fixtures=Array.from({length:23},(_,i)=>({id:randomUUID(),ownerId:owner.profile.id,title:`Paging catalog ${i}`,description:'A pagination fixture service',game:'valorant' as const,serviceType:'coaching' as const,mode:'duo' as const,category:'relaxed' as const,priceFen:i<21?100:200,status:'published' as const,reviewStatus:'approved' as const,applicationId:approval.id,publicationConsentAt:new Date()}));
  await db.insert(listings).values(fixtures);assert.equal((await request('GET','/v1/listings?game=valorant&serviceType=companion')).data.listings.length,0);
  for(const sort of ['recent','priceAsc','priceDesc']){
   const query=`/v1/listings?q=Paging&game=valorant&serviceType=coaching&sort=${sort}`,first=(await request('GET',query)).data;assert.equal(first.listings.length,20);assert.ok(first.nextCursor);
   const second=(await request('GET',`${query}&after=${first.nextCursor}`)).data;assert.equal(second.listings.length,3);assert.equal(second.nextCursor,null);
   const all=[...first.listings,...second.listings];assert.equal(new Set(all.map((item:{id:string})=>item.id)).size,23);
   if(sort!=='recent'){assert.deepEqual(all.map(item=>item.priceFen),fixtures.map(item=>item.priceFen).sort((a,b)=>sort==='priceAsc'?a-b:b-a));assert.equal((await request('GET',`${query}&after=${fixtures[0].id}`)).status,400);}
  }
 }finally{await app.close();await pool.end();}
});
