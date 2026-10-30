import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { draftSchema, registerSchema } from '../src/validation.js';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { media } from '../src/schema.js';

const legacy={gameName:'小熊',gameId:'player_01',server:'wechat',rank:'Ace',kd:'3.25',experience:'Two years',playStyle:'Patient coaching',mode:'duo',voiceMediaId:null};
const valorant={...legacy,game:'valorant',gameId:'熊崽队长#CN一',server:'china',rank:'Diamond',kd:''};

test('provider schemas accept four games, preserve legacy shape and apply game-specific account and K/D checks',()=>{
 for(const game of ['peaceElite','deltaForce','honorOfKings','valorant']){
  const draft=game==='valorant'?valorant:{...legacy,game,kd:game==='honorOfKings'?'':legacy.kd};
  assert.deepEqual(draftSchema.parse(draft),draft);
  assert.equal(registerSchema.safeParse({phone:'13800138186',password:'provider-test-password',nickname:'Provider',accepted:true,draft}).success,true);
 }
 assert.deepEqual(draftSchema.parse(legacy),legacy);assert.equal(Object.hasOwn(draftSchema.parse(legacy),'game'),false);
 for(const game of [undefined,'peaceElite','deltaForce'])assert.equal(draftSchema.safeParse({...legacy,game,kd:''}).success,false);
 for(const draft of [{...valorant,server:'qq'},{...valorant,gameId:'plain-id'},{...legacy,game:'honorOfKings',kd:'bad'},{...legacy,game:'unknown'}])assert.equal(draftSchema.safeParse(draft).success,false);
});

test('provider API saves every game and preserves the original submitted game after profile edits',async()=>{
 const {db,pool}=createDatabase(process.env.TEST_DATABASE_URL!);const app=buildApp({db,logger:false});
 const req=async(method:any,url:string,payload?:any,token?:string)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
  const registered=await req('POST','/v1/auth/register',{phone:'13800138186',password:'provider-test-password',nickname:'Provider',bio:'Patient coaching',accepted:true});assert.equal(registered.status,201);
  const {token,profile}=registered.data,avatar=randomUUID(),voice=randomUUID();
  await db.insert(media).values([{id:avatar,ownerId:profile.id,kind:'avatar',status:'ready',key:`verified/${avatar}.png`,mime:'image/png',bytes:100},{id:voice,ownerId:profile.id,kind:'voice',status:'ready',key:`verified/${voice}.m4a`,mime:'audio/mp4',bytes:100,durationMs:12000}]);
  for(const game of ['peaceElite','deltaForce','honorOfKings','valorant']){
   const draft={...(game==='valorant'?valorant:{...legacy,game,kd:game==='honorOfKings'?'':legacy.kd}),voiceMediaId:voice};
   const saved=await req('PATCH','/v1/me',{avatarMediaId:avatar,draft},token);assert.equal(saved.status,200);assert.deepEqual(saved.data.profile.draft,draft);
  }
  const submitted=await req('POST','/v1/me/application',{accepted:true},token);assert.equal(submitted.status,200);const original=submitted.data.profile.application.snapshot;
  assert.equal(original.draft.game,'valorant');assert.equal(original.draft.server,'china');assert.equal(original.draft.kd,'');
  const edited=await req('PATCH','/v1/me',{draft:{...legacy,game:'honorOfKings',kd:'',voiceMediaId:voice}},token);assert.equal(edited.status,200);assert.equal(edited.data.profile.draft.game,'honorOfKings');assert.deepEqual(edited.data.profile.application.snapshot,original);
  assert.equal((await req('PATCH','/v1/me',{draft:{...valorant,server:'qq'}},token)).status,400);
 }finally{await app.close();await pool.end();}
});
