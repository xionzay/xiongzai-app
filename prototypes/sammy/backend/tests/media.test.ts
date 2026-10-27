import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { ObjectStorage, inspectMedia } from '../src/storage.js';
import { media, users } from '../src/schema.js';
import { eq } from 'drizzle-orm';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9U8AAAAASUVORK5CYII=','base64');
test('media validates content, declared type and actual voice duration',async()=>{
 assert.equal((await inspectMedia(png,'avatar','image/png')).extension,'png');
 await assert.rejects(inspectMedia(png,'avatar','image/jpeg'));
 await assert.rejects(inspectMedia(Buffer.from('<script>alert(1)</script>'),'avatar','image/png'));
 const voice=await readFile(new URL('./fixtures/voice.m4a',import.meta.url));
 const checked=await inspectMedia(voice,'voice','audio/mp4');
 assert.ok(checked.durationMs! >= 10000 && checked.durationMs! <= 13000);
 await assert.rejects(inspectMedia(voice,'avatar','audio/mp4'));
 await assert.rejects(inspectMedia(voice.subarray(0,100),'voice','audio/mp4'));
 const video=await readFile(new URL('./fixtures/video.mp4',import.meta.url));
 await assert.rejects(inspectMedia(video,'voice','audio/mp4'));
 const recording=await inspectMedia(video,'evidenceVideo','video/mp4');assert.equal(recording.extension,'mp4');assert.ok(recording.durationMs!>0);await assert.rejects(inspectMedia(voice,'evidenceVideo','video/mp4'));assert.equal((await inspectMedia(png,'evidenceImage','image/png')).extension,'png');
});
class TestStorage extends ObjectStorage {
 objects=new Map<string,Buffer>();
 constructor(){super('test','https://example.invalid','test','test');}
 override async uploadUrl(key:string){return 'https://example.invalid/'+key;}
 override async downloadUrl(key:string){return 'https://example.invalid/'+key;}
 override async read(key:string){const bytes=this.objects.get(key);if(!bytes)throw new Error('Missing object');return Buffer.from(bytes);}
 override async store(key:string,bytes:Buffer){this.objects.set(key,bytes);}
 override async remove(key:string){this.objects.delete(key);}
}
test('finalized upload is immutable, belongs to its user, and admin cannot review self',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);
 const storage=new TestStorage(),app=buildApp({db,storage,logger:false});
 const request=async(method:'GET'|'POST'|'PATCH',url:string,payload?:any,token?:string)=>{
   const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};
 };
 try{
  const signup=await request('POST','/v1/auth/register',{phone:'13800138031',password:'fixture-password-123',nickname:'Media QA',bio:'Synthetic account',accepted:true});
  const {token,profile}=signup.data;
  assert.equal(signup.status,201);
  const slot=await request('POST','/v1/media',{kind:'avatar',mime:'image/png',bytes:png.length},token);
  assert.equal(slot.status,200);
  const incoming=new URL(slot.data.url).pathname.slice(1);
  assert.ok(incoming.endsWith('.png'),'upload key retains the MIME extension for Cloudinary multipart filenames');
  storage.objects.set(incoming,png);
  assert.equal((await request('PATCH','/v1/me',{avatarMediaId:slot.data.id},token)).status,409);
  const other=await request('POST','/v1/auth/register',{phone:'13800138032',password:'fixture-password-123',nickname:'Other QA',accepted:true});
  assert.equal((await request('POST',`/v1/media/${slot.data.id}/complete`,{},other.data.token)).status,403);
  assert.equal((await request('POST',`/v1/media/${slot.data.id}/complete`,{},token)).status,200);
  const [saved]=await db.select().from(media).where(eq(media.id,slot.data.id));
  assert.notEqual(saved.key,incoming);
  storage.objects.set(incoming,Buffer.from('replaced after verification'));
  assert.deepEqual(storage.objects.get(saved.key),png);
  assert.equal((await request('POST',`/v1/media/${slot.data.id}/complete`,{},token)).status,200);
  const voice=await readFile(new URL('./fixtures/voice.m4a',import.meta.url));
  const voiceSlot=await request('POST','/v1/media',{kind:'voice',mime:'audio/mp4',bytes:voice.length},token);
  storage.objects.set(new URL(voiceSlot.data.url).pathname.slice(1),voice);
  assert.equal((await request('POST',`/v1/media/${voiceSlot.data.id}/complete`,{},token)).status,200);
  assert.equal((await request('PATCH','/v1/me',{avatarMediaId:saved.id,draft:{gameName:'Test',gameId:'qa_001',server:'wechat',rank:'Ace',kd:'1.5',experience:'Two years',playStyle:'Calm',mode:'duo',voiceMediaId:voiceSlot.data.id}},token)).status,200);
  const submitted=await request('POST','/v1/me/application',{accepted:true},token);
  await db.update(users).set({isAdmin:true}).where(eq(users.id,profile.id));
  assert.equal((await request('POST',`/v1/admin/applications/${submitted.data.profile.application.id}/review`,{decision:'approved'},token)).status,403);
  assert.equal((await request('PATCH','/v1/me',{},token)).status,400);
  const html=await app.inject('/admin'); assert.equal(html.statusCode,200);assert.match(html.body,/id="login"/);
 }finally{await app.close();await pool.end();}
});
