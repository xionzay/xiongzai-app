import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { users, media } from '../src/schema.js';
import { eq, sql } from 'drizzle-orm';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Run npm run test:integration for an isolated PostgreSQL instance.');
const { db, pool } = createDatabase(url);
const app = buildApp({ db, logger: false });
const phone = '13800138019';
const password = 'correct-horse-test-password';
const draft = { gameName:'QA Player', gameId:'test_019', server:'wechat', rank:'Ace', kd:'3.25', experience:'Three years', playStyle:'Calm support', mode:'squad', voiceMediaId:null };
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
async function request(method: 'GET'|'POST'|'PATCH', path: string, body?: unknown, token?: string) {
  const response = await app.inject({ method, url:path, payload:body as any, headers:token ? headers(token) : {} });
  return { status:response.statusCode, data:response.json() };
}

test('hosted provider lifecycle enforces auth, media ownership, consent and review invariants', async () => {
  assert.equal((await request('GET','/v1/me')).status,401);
  assert.equal((await request('POST','/v1/auth/register',{phone,password:'123456',nickname:'QA',accepted:true})).status,400);
  assert.equal((await request('POST','/v1/auth/register',{phone,password,nickname:'QA',accepted:true,isAdmin:true})).status,400);
  const registered = await request('POST','/v1/auth/register',{phone,password,nickname:'QA Player',bio:'Calm teammate',accepted:true});
  assert.equal(registered.status,201);
  let token = registered.data.token as string;
  const id = registered.data.profile.id;
  assert.equal(registered.data.profile.isAdmin,false);
  const stored = (await db.select().from(users).where(eq(users.id,id)))[0];
  assert.notEqual(stored.passwordHash,password);
  assert.ok(stored.passwordHash.startsWith('scrypt:'));
  assert.equal((await request('POST','/v1/auth/login',{phone,password:'wrong-password'})).status,401);
  assert.equal((await request('GET','/v1/admin/applications',undefined,token)).status,403);
  assert.equal((await request('POST','/v1/me/application',{accepted:true},token)).status,409);
  const avatarId=randomUUID(), voiceId=randomUUID();
  await db.insert(media).values([
    {id:avatarId,ownerId:id,kind:'avatar',status:'ready',key:`verified/${id}/${avatarId}.png`,mime:'image/png',bytes:100},
    {id:voiceId,ownerId:id,kind:'voice',status:'ready',key:`verified/${id}/${voiceId}.m4a`,mime:'audio/mp4',bytes:100,durationMs:12000},
  ]);
  const other = await request('POST','/v1/auth/register',{phone:'13800138020',password,nickname:'Other',accepted:true});
  assert.equal((await request('PATCH','/v1/me',{avatarMediaId:avatarId},other.data.token)).status,403);
  assert.equal((await request('PATCH','/v1/me',{nickname:'QA Updated',bio:'Ready',avatarMediaId:avatarId,draft:{...draft,voiceMediaId:voiceId}},token)).status,200);
  assert.equal((await request('POST','/v1/me/application',{accepted:false},token)).status,400);
  const submitted=await request('POST','/v1/me/application',{accepted:true},token);
  assert.equal(submitted.status,200);
  const application=submitted.data.profile.application;
  assert.equal(application.status,'pending');
  const duplicate=await request('POST','/v1/me/application',{accepted:true},token);
  assert.equal(duplicate.data.profile.application.id,application.id);
  await request('PATCH','/v1/me',{bio:'Changed after submission'},token);
  const current=await request('GET','/v1/me',undefined,token);
  assert.equal(current.data.profile.application.snapshot.bio,'Ready');
  assert.equal((await request('GET',`/v1/admin/applications/${application.id}`,undefined,other.data.token)).status,403);
  await db.update(users).set({isAdmin:true}).where(eq(users.id,other.data.profile.id));
  const rejected=await request('POST',`/v1/admin/applications/${application.id}/review`,{decision:'changes_requested',reason:'Please clarify your experience.'},other.data.token);
  assert.equal(rejected.status,200);
  assert.equal((await request('POST',`/v1/admin/applications/${application.id}/review`,{decision:'approved'},other.data.token)).status,409);
  const again=await request('POST','/v1/me/application',{accepted:true},token);
  assert.equal(again.status,200);
  assert.notEqual(again.data.profile.application.id,application.id);
  assert.equal(again.data.profile.application.snapshot.bio,'Changed after submission');
  const nextId=again.data.profile.application.id;
  const outcomes=await Promise.all([
    request('POST',`/v1/admin/applications/${nextId}/review`,{decision:'approved'},other.data.token),
    request('POST',`/v1/admin/applications/${nextId}/review`,{decision:'changes_requested',reason:'Concurrent decision'},other.data.token),
  ]);
  assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);
  assert.equal((await request('POST','/v1/auth/logout',{},token)).status,200);
  assert.equal((await request('GET','/v1/me',undefined,token)).status,401);
  const logged=await request('POST','/v1/auth/login',{phone,password});
  token=logged.data.token;
  assert.equal((await request('GET','/v1/me',undefined,token)).data.profile.id,id);
});
test('login throttling persists in PostgreSQL',async()=>{
  for(let i=0;i<8;i++) await request('POST','/v1/auth/login',{phone:'13800138999',password:'not-a-password'});
  assert.equal((await request('POST','/v1/auth/login',{phone:'13800138999',password:'not-a-password'})).status,429);
});
test.after(async()=>{ await app.close(); await pool.end(); });
