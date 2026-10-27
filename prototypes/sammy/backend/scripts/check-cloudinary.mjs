// Live opt-in smoke test: node --import tsx --env-file=.env.local scripts/check-cloudinary.mjs
// Creates only a temporary test account/media; removes those records/assets on exit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { createDatabase } from '../src/db.ts';
import { CloudinaryStorage } from '../src/cloudinary-storage.ts';
import { buildApp } from '../src/app.ts';

const {DATABASE_URL,CLOUDINARY_CLOUD_NAME:cloud,CLOUDINARY_API_KEY:key,CLOUDINARY_API_SECRET:secret}=process.env;
if(!DATABASE_URL||!cloud||!key||!secret)throw new Error('Set DATABASE_URL and all three CLOUDINARY credentials in .env.local first.');
const storage=new CloudinaryStorage(cloud,key,secret),{db,pool}=createDatabase(DATABASE_URL),app=buildApp({db,storage,logger:false});
const objects=new Set();let userId,base;
async function api(path,body,token,method=body===undefined?'GET':'POST'){
 const r=await fetch(base+'/v1'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await r.json();assert.ok(r.ok,`${path}: HTTP ${r.status} ${data.error??''}`);return data;
}
try{
 base=await app.listen({host:'127.0.0.1',port:0});
 const account=await api('/auth/register',{phone:'199'+randomInt(10000000,99999999),password:randomUUID(),nickname:'Cloudinary QA',bio:'Temporary storage check',accepted:true});userId=account.profile.id;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9U8AAAAASUVORK5CYII=','base64');
 for(const [kind,mime,bytes] of [
  ['avatar','image/png',png],['voice','audio/mp4',await readFile(new URL('../tests/fixtures/voice.m4a',import.meta.url))],
  ['evidenceImage','image/png',png],['evidenceVideo','video/mp4',await readFile(new URL('../tests/fixtures/video.mp4',import.meta.url))],
 ]){
  const slot=await api('/media',{kind,mime,bytes:bytes.length},account.token);assert.equal(slot.method,'POST');objects.add(slot.fields.public_id);
  const form=new FormData();for(const [name,value] of Object.entries(slot.fields))form.set(name,value);form.set('file',new Blob([bytes],{type:mime}),'fixture.'+slot.fields.public_id.split('.').at(-1));
  const upload=await fetch(slot.url,{method:'POST',body:form,signal:AbortSignal.timeout(60000)});assert.ok(upload.ok,`${kind} signed upload HTTP ${upload.status}`);
  const finalized=await api('/media/'+slot.id+'/complete',{},account.token);assert.equal(finalized.files[0].id,slot.id);
  const row=(await pool.query('SELECT key FROM media WHERE id=$1',[slot.id])).rows[0];objects.add(row.key);
  assert.deepEqual(await storage.read(row.key,bytes.length),bytes);
  const download=new URL(finalized.files[0].url);assert.ok(Number(download.searchParams.get('expires_at'))>Date.now()/1000);
  const unsigned=await fetch(`https://res.cloudinary.com/${cloud}/raw/authenticated/${row.key}`,{signal:AbortSignal.timeout(30000)});assert.ok(!unsigned.ok,'Unsigned originals must be denied');await unsigned.body?.cancel();
  const expired=cloudinary.utils.private_download_url(row.key,'',{cloud_name:cloud,api_key:key,api_secret:secret,resource_type:'raw',type:'authenticated',expires_at:Math.floor(Date.now()/1000)-60});
  const stale=await fetch(expired,{signal:AbortSignal.timeout(30000)});assert.ok(!stale.ok,'Expired download must be denied');await stale.body?.cancel();
  console.log(`PASS ${kind}: signed upload, byte validation, private download, unsigned/expired access denied`);
 }
 console.log('PASS Cloudinary + Neon media flow over local HTTP');
}finally{
 let failed=false;
 if(userId){const rows=(await pool.query('SELECT key FROM media WHERE owner_id=$1',[userId])).rows;for(const row of rows)objects.add(row.key);}
 for(const object of objects){try{await storage.remove(object);}catch{failed=true;}}
 if(userId&&!failed){await pool.query('DELETE FROM media WHERE owner_id=$1',[userId]);await pool.query('DELETE FROM sessions WHERE user_id=$1',[userId]);await pool.query('DELETE FROM users WHERE id=$1',[userId]);}
 await app.close();await pool.end();
 if(failed)throw new Error('Some test assets could not be removed; test records retained for cleanup.');
 console.log('Temporary Cloudinary test assets and database records removed.');
}
