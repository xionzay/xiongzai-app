// node --import tsx --env-file=.env.local scripts/import-local-media.mjs <Documents directory> [--apply]
// Upload through normal authenticated media validation; link only unchanged imported profiles.
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createDatabase } from '../src/db.ts';
import { buildApp } from '../src/app.ts';
import { CloudinaryStorage } from '../src/cloudinary-storage.ts';
import { inspectMedia } from '../src/storage.ts';

const directory=process.argv[2],apply=process.argv.includes('--apply');
const {DATABASE_URL,CLOUDINARY_CLOUD_NAME:cloud,CLOUDINARY_API_KEY:key,CLOUDINARY_API_SECRET:secret}=process.env;
if(!directory||!DATABASE_URL||!cloud||!key||!secret)throw new Error('Provide the simulator Documents directory and configured Neon/Cloudinary environment.');
const root=await realpath(directory),storage=new CloudinaryStorage(cloud,key,secret),{db,pool}=createDatabase(DATABASE_URL),app=buildApp({db,storage,logger:false});
const digest=value=>createHash('sha256').update(value).digest('hex');
const sessions=[];let transaction;
async function api(path,body,token){const r=await app.inject({method:'POST',url:'/v1'+path,payload:body,headers:token?{authorization:'Bearer '+token}:{}});const data=r.json();assert.ok(r.statusCode<300,`${path}: HTTP ${r.statusCode} ${data.error??''}`);return data;}
try{
 const imported=(await pool.query("SELECT snapshot,source_hash,record_ids FROM local_data_imports WHERE id='device-v1'")).rows[0];
 if(!imported)throw new Error('Import device accounts first.');
 const accounts=new Map(imported.snapshot.accounts.map(a=>[a.phone,a]));if(imported.snapshot.profile)accounts.set(imported.snapshot.profile.phone,imported.snapshot.profile);
 const users=(await pool.query('SELECT id,phone FROM users WHERE id=ANY($1::uuid[])',[imported.record_ids.users])).rows;
 const assets=new Map();
 for(const account of accounts.values()){
  const user=users.find(u=>u.phone===account.phone);if(!user)throw new Error('Imported account mapping is missing.');
  for(const [use,profile] of [['current',account],['submitted',account.providerApplication?.snapshot]]){
   if(!profile)continue;
   for(const [kind,filename] of [['avatar',profile.avatarFile],['voice',(profile.providerDraft??profile.draft)?.voiceIntroduction?.file]]){
    if(!filename)continue;
    const valid=kind==='avatar'?/^avatar-[a-z0-9-]+\.(jpg|png|webp)$/:/^voice-[a-z0-9-]+\.(m4a|mp3|aac)$/;
    if(!valid.test(filename))throw new Error('Unsupported local media filename; convert it before import.');
    const ref=user.id+':'+kind+':'+filename,previous=assets.get(ref);if(previous){previous.uses.push(use);continue;}
    const path=await realpath(resolve(root,kind==='avatar'?'avatars':'voice-introductions',filename));if(!path.startsWith(root+sep))throw new Error('Media must remain inside the source Documents directory.');
    const bytes=await readFile(path),ext=filename.split('.').at(-1),mime={jpg:'image/jpeg',png:'image/png',webp:'image/webp',m4a:'audio/mp4',mp3:'audio/mpeg',aac:'audio/aac'}[ext];
    await inspectMedia(bytes,kind,mime);
    assets.set(ref,{ownerId:user.id,phone:account.phone,kind,filename,mime,bytes,contentHash:digest(bytes.toString('base64')),uses:[use]});
   }
  }
 }
 const manifest={sourceHash:imported.source_hash,assets:[...assets.values()].map(({ownerId,kind,filename,contentHash,uses})=>({ownerId,kind,filename,contentHash,uses}))},fingerprint=digest(JSON.stringify(manifest));
 const previous=(await pool.query("SELECT source_hash FROM local_data_imports WHERE id='device-media-v1'")).rows[0];
 if(previous){if(previous.source_hash!==fingerprint)throw new Error('Source media changed since import; existing profiles were preserved.');console.log('Already imported: device-media-v1 (no uploads or profile changes).');}
 else if(!apply)console.log(JSON.stringify({plannedFiles:assets.size,avatars:[...assets.values()].filter(a=>a.kind==='avatar').length,voices:[...assets.values()].filter(a=>a.kind==='voice').length}));
 else{
  const credentials=JSON.parse(await readFile(new URL('../.local/imports/account-passwords.json',import.meta.url),'utf8')),tokens=new Map();
  for(const asset of assets.values()){
   // A previous interrupted run may already have verified this exact file.
   const existing=(await pool.query("SELECT id,key FROM media WHERE owner_id=$1 AND kind=$2 AND content_hash=$3 AND status='ready' ORDER BY created_at LIMIT 1",[asset.ownerId,asset.kind,asset.contentHash])).rows[0];
   if(existing){asset.mediaId=existing.id;asset.storageKey=existing.key;}
   else{
    let token=tokens.get(asset.ownerId);
    if(!token){const saved=credentials[asset.phone];if(!saved||saved.id!==asset.ownerId)throw new Error('Missing imported-account credentials.');const login=await api('/auth/login',{phone:asset.phone,password:saved.password});token=login.token;tokens.set(asset.ownerId,token);sessions.push(token);}
    const slot=await api('/media',{kind:asset.kind,mime:asset.mime,bytes:asset.bytes.length},token),form=new FormData();for(const [k,v]of Object.entries(slot.fields))form.set(k,v);form.set('file',new Blob([asset.bytes],{type:asset.mime}),asset.filename);
    const response=await fetch(slot.url,{method:'POST',body:form,signal:AbortSignal.timeout(60000)});assert.ok(response.ok,`Cloudinary upload HTTP ${response.status}`);const uploaded=await response.json();assert.equal(uploaded.public_id,slot.fields.public_id,'Cloudinary must preserve the signed object key');
    await api('/media/'+slot.id+'/complete',{},token);asset.mediaId=slot.id;asset.storageKey=(await pool.query('SELECT key FROM media WHERE id=$1',[slot.id])).rows[0].key;
   }
   assert.deepEqual(await storage.read(asset.storageKey,asset.bytes.length),asset.bytes);console.log('Verified private '+asset.kind+' upload ('+asset.bytes.length+' bytes).');
  }
  transaction=await pool.connect();await transaction.query('BEGIN');await transaction.query('SELECT pg_advisory_xact_lock(19731024)');
  const raced=(await transaction.query("SELECT source_hash FROM local_data_imports WHERE id='device-media-v1'")).rows[0];
  if(raced){if(raced.source_hash!==fingerprint)throw new Error('A conflicting media import already completed.');}
  else{
   for(const user of users.sort((a,b)=>a.id.localeCompare(b.id))){
    const row=(await transaction.query('SELECT avatar_media_id,draft FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0],current=[...assets.values()].filter(a=>a.ownerId===user.id&&a.uses.includes('current'));
    for(const asset of current){
     if(asset.kind==='avatar'){if(row.avatar_media_id&&row.avatar_media_id!==asset.mediaId)throw new Error('A profile photo changed after import; refusing to replace it.');await transaction.query('UPDATE users SET avatar_media_id=$2 WHERE id=$1',[user.id,asset.mediaId]);}
     else{if(!row.draft||(row.draft.voiceMediaId&&row.draft.voiceMediaId!==asset.mediaId))throw new Error('A provider voice changed after import; refusing to replace it.');await transaction.query("UPDATE users SET draft=jsonb_set(draft,'{voiceMediaId}',to_jsonb($2::text)) WHERE id=$1",[user.id,asset.mediaId]);}
    }
   }
   await transaction.query("INSERT INTO local_data_imports(id,source_hash,snapshot,record_ids) VALUES('device-media-v1',$1,$2,$3)",[fingerprint,manifest,{media:[...assets.values()].map(a=>({id:a.mediaId,ownerId:a.ownerId,kind:a.kind,filename:a.filename,uses:a.uses}))}]);
  }
  await transaction.query('COMMIT');transaction.release();transaction=undefined;
  console.log(JSON.stringify({importedFiles:assets.size,linkedCurrentProfiles:new Set([...assets.values()].filter(a=>a.uses.includes('current')).map(a=>a.ownerId)).size,reviewStatusUnchanged:true}));
 }
}catch(error){if(transaction){await transaction.query('ROLLBACK');transaction.release();}throw error;}
finally{for(const token of sessions)await api('/auth/logout',{},token).catch(()=>{});await app.close();await pool.end();}
