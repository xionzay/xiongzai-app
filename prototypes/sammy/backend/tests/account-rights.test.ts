import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { createSession, digest, hashPassword, verifyPassword } from '../src/auth.js';
import { adminActions, applications, listings, media, orders, sessions, users } from '../src/schema.js';
import { conversations, messages, tickets } from '../src/commerce-schema.js';
import { orderReviews, productFavorites, storeFavorites } from '../src/marketplace-schema.js';
import { orderRules } from '../src/orders.js';

let sequence=120;
const password='original-account-password';
async function fixture(){
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false});
 const request=async(method:any,url:string,payload?:any,token?:string)=>{const response=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:response.statusCode,data:response.json()};};
 const person=async()=>{const [u]=await db.insert(users).values({phone:'13800138'+String(++sequence).padStart(3,'0'),passwordHash:await hashPassword(password),nickname:'Account owner'}).returning();return {...u,token:await createSession(db,u.id)};};
 const owner=await person(),other=await person(),third=await person();
 return {db,app,pool,request,owner,other,third,close:async()=>{await app.close();await pool.end();}};
}

test('account export is authenticated, complete for the owner and omits credentials, other accounts and private delivery fields',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('GET','/v1/me/export')).status,401);
  const avatar=randomUUID();await f.db.insert(media).values({id:avatar,ownerId:f.owner.id,kind:'avatar',status:'ready',key:'private-storage-key-never-export',mime:'image/png',bytes:100,contentHash:'private-content-hash'});
  await f.db.insert(applications).values({userId:f.owner.id,status:'pending',agreementVersion:'fixture',snapshot:{nickname:'My submitted name',bio:'My application',avatarMediaId:avatar,draft:{gameName:'Own game',gameId:'own-identity',server:'wechat',rank:'Ace',kd:'3',experience:'Years',playStyle:'Patient',mode:'duo',voiceMediaId:null}}});
  const listing=async(ownerId:string,title:string)=>{const [l]=await f.db.insert(listings).values({id:randomUUID(),ownerId,title,description:'An account export fixture service.',game:'peaceElite',mode:'duo',category:'relaxed',priceFen:1000}).returning();return l;};
  const ownListing=await listing(f.owner.id,'My private service'),otherListing=await listing(f.other.id,'Foreign private service');
  const order=async(buyerId:string,sellerId:string)=>{const [o]=await f.db.insert(orders).values({buyerId,sellerId,listingId:otherListing.id,requestId:randomUUID(),requestHash:'private-order-request-hash',service:{id:otherListing.id,revision:1,title:'Purchased service',description:'Service facts',providerName:'Provider',mode:'duo',category:'relaxed',unitPriceFen:1000,game:'peaceElite',photoMediaIds:[]},rules:orderRules,delivery:{gameName:'Private delivery name',gameId:'private-delivery-id',server:'wechat',note:'Private delivery note'},quantity:1,totalFen:1000}).returning();return o;};
  const ownOrder=await order(f.owner.id,f.other.id),foreignOrder=await order(f.other.id,f.third.id);
  const [ownConversation]=await f.db.insert(conversations).values({buyerId:f.owner.id,sellerId:f.other.id}).returning(),[foreignConversation]=await f.db.insert(conversations).values({buyerId:f.third.id,sellerId:f.other.id}).returning();
  await f.db.insert(messages).values([{conversationId:ownConversation.id,senderId:f.owner.id,requestId:randomUUID(),kind:'text',body:'My message'},{conversationId:ownConversation.id,senderId:f.other.id,requestId:randomUUID(),kind:'text',body:'Reply in my conversation'},{conversationId:foreignConversation.id,senderId:f.third.id,requestId:randomUUID(),kind:'text',body:'Foreign private message'}]);
  await f.db.insert(tickets).values([{userId:f.owner.id,requestId:randomUUID(),kind:'support',category:'Help',text:'My support request'},{userId:f.other.id,requestId:randomUUID(),kind:'feedback',category:'Help',text:'Foreign private support request'}]);
  await f.db.insert(orderReviews).values({orderId:ownOrder.id,buyerId:f.owner.id,sellerId:f.other.id,listingId:otherListing.id,buyerNickname:f.owner.nickname,rating:3,text:'My actual review'});
  await f.db.insert(productFavorites).values({userId:f.owner.id,listingId:otherListing.id});await f.db.insert(storeFavorites).values({userId:f.owner.id,sellerId:f.other.id});
  const response=await f.request('GET','/v1/me/export',undefined,f.owner.token);assert.equal(response.status,200);const data=response.data;
  assert.equal(data.formatVersion,1);assert.equal(data.profile.id,f.owner.id);assert.equal(data.profile.phone,f.owner.phone);assert.ok(Date.parse(data.exportedAt));assert.equal(data.applications.length,1);assert.equal(data.listings.length,1);assert.equal(data.listings[0].id,ownListing.id);assert.equal(data.orders.length,1);assert.equal(data.orders[0].id,ownOrder.id);assert.equal(data.messages.length,2);assert.equal(data.tickets.length,1);assert.equal(data.reviews.length,1);assert.equal(data.favorites.products.length,1);assert.equal(data.favorites.stores.length,1);assert.equal(data.media.length,1);assert.equal(data.media[0].id,avatar);
  const output=JSON.stringify(data);for(const excluded of [f.owner.passwordHash,f.owner.token,digest(f.owner.token),f.other.phone,f.third.phone,foreignOrder.id,'Foreign private service','Foreign private message','Foreign private support request','private-storage-key-never-export','private-content-hash','private-order-request-hash','private-delivery-id','Private delivery note','Private delivery name'])assert.ok(!output.includes(excluded),excluded);
  for(const key of ['passwordHash','tokenHash','delivery','key','contentHash','url'])assert.ok(!Object.hasOwn(data.profile,key)&&!Object.hasOwn(data.media[0],key)&&!Object.hasOwn(data.orders[0],key),key);
 }finally{await f.close();}
});

test('password change verifies the current secret, retains this session, revokes other sessions and records no sensitive audit data',async()=>{
 const f=await fixture();try{
  const second=await createSession(f.db,f.owner.id),newPassword='changed-account-password';
  assert.equal((await f.request('POST','/v1/me/password',{currentPassword:password,newPassword})).status,401);
  assert.equal((await f.request('POST','/v1/me/password',{currentPassword:password,newPassword:'short'},f.owner.token)).status,400);
  assert.equal((await f.request('POST','/v1/me/password',{currentPassword:'incorrect-password',newPassword},f.owner.token)).status,401);
  assert.equal((await f.request('GET','/v1/me',undefined,second)).status,200);
  const changed=await f.request('POST','/v1/me/password',{currentPassword:password,newPassword},f.owner.token);assert.equal(changed.status,200);assert.deepEqual(changed.data,{ok:true,requiresLogin:false});
  assert.equal((await f.request('GET','/v1/me',undefined,f.owner.token)).status,200);assert.equal((await f.request('GET','/v1/me',undefined,second)).status,401);assert.equal((await f.request('GET','/v1/me',undefined,f.other.token)).status,200);
  const [stored]=await f.db.select().from(users).where(eq(users.id,f.owner.id));assert.ok(await verifyPassword(newPassword,stored.passwordHash));assert.equal(await verifyPassword(password,stored.passwordHash),false);assert.equal((await f.db.select().from(sessions).where(eq(sessions.userId,f.owner.id))).length,1);
  const audit=await f.db.select().from(adminActions).where(and(eq(adminActions.actorId,f.owner.id),eq(adminActions.action,'password.changed')));assert.equal(audit.length,1);assert.equal(audit[0].targetId,f.owner.id);for(const secret of [password,newPassword,f.owner.token,digest(f.owner.token),stored.passwordHash])assert.ok(!JSON.stringify(audit).includes(secret));
  assert.equal((await f.request('POST','/v1/auth/login',{phone:f.owner.phone,password})).status,401);assert.equal((await f.request('POST','/v1/auth/login',{phone:f.owner.phone,password:newPassword})).status,200);
 }finally{await f.close();}
});

test('password attempts are throttled without changing the password or revoking sessions',async()=>{
 const f=await fixture();try{
  for(let i=0;i<8;i++)assert.equal((await f.request('POST','/v1/me/password',{currentPassword:'incorrect-password',newPassword:'valid-proposed-password'},f.owner.token)).status,401);
  assert.equal((await f.request('POST','/v1/me/password',{currentPassword:password,newPassword:'valid-proposed-password'},f.owner.token)).status,429);
  const [stored]=await f.db.select().from(users).where(eq(users.id,f.owner.id));assert.ok(await verifyPassword(password,stored.passwordHash));assert.equal((await f.request('GET','/v1/me',undefined,f.owner.token)).status,200);
 }finally{await f.close();}
});
