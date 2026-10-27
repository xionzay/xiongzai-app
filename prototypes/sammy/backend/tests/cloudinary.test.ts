import test from 'node:test';
import assert from 'node:assert/strict';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from '../src/cloudinary-storage.js';
import { ObjectStorage } from '../src/storage.js';

test('Cloudinary upload capabilities lock the asset identity, private type and overwrite policy without exposing the secret',async()=>{
 const store=new CloudinaryStorage('test-cloud','test-key','test-secret');
 const slot=await store.createUpload('incoming/owner/media');
 assert.equal(slot.method,'POST');assert.equal(slot.url,'https://api.cloudinary.com/v1_1/test-cloud/raw/upload');
 const {signature,api_key,...signed}=slot.fields!;
 assert.equal(api_key,'test-key');assert.equal(signed.type,'authenticated');assert.equal(signed.overwrite,'false');assert.equal(signed.public_id,'incoming/owner/media');
 assert.equal(signature,cloudinary.utils.api_sign_request(signed,'test-secret'));
 assert.ok(!JSON.stringify(slot).includes('test-secret'));
});
test('Cloudinary downloads use expiring authenticated API capabilities, including the full raw filename',async()=>{
 const now=Math.floor(Date.now()/1000),store=new CloudinaryStorage('test-cloud','test-key','test-secret');
 const url=new URL(await store.downloadUrl('verified/owner/file.mp4'));
 assert.equal(url.origin,'https://api.cloudinary.com');assert.equal(url.pathname,'/v1_1/test-cloud/raw/download');
 assert.equal(url.searchParams.get('public_id'),'verified/owner/file.mp4');assert.equal(url.searchParams.get('type'),'authenticated');
 assert.ok(Number(url.searchParams.get('expires_at'))>=now+299&&Number(url.searchParams.get('expires_at'))<=now+301);
 assert.ok(!url.toString().includes('test-secret'));
});
test('Cloudinary validation reads reject oversized streaming responses, even without Content-Length',async t=>{
 const store=new CloudinaryStorage('test-cloud','key','secret');let cancelled=false;
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(10));},cancel(){cancelled=true;}})));
 await assert.rejects(store.read('incoming/key',4),{code:'invalidMedia'});assert.ok(cancelled);
});
test('Cloudinary validation reads preserve bytes and fail on missing upstream assets',async t=>{
 const store=new CloudinaryStorage('test-cloud','key','secret');
 t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([1,2,3])));
 assert.deepEqual(await store.read('incoming/key',3),Buffer.from([1,2,3]));
 t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:404}));
 await assert.rejects(store.read('missing/key',3),{code:'hostedMediaUnavailable'});
});
test('partial Cloudinary configuration fails closed while existing S3 deployments still work',async()=>{
 const keys=['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','S3_BUCKET','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'] as const;
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const k of keys)delete process.env[k];assert.equal(ObjectStorage.fromEnvironment(),undefined);
  process.env.CLOUDINARY_CLOUD_NAME='test-cloud';assert.throws(()=>ObjectStorage.fromEnvironment(),/All three/);
  process.env.CLOUDINARY_API_KEY='key';process.env.CLOUDINARY_API_SECRET='secret';assert.ok(ObjectStorage.fromEnvironment() instanceof CloudinaryStorage);
  for(const k of keys)delete process.env[k];
  Object.assign(process.env,{S3_BUCKET:'test',S3_ENDPOINT:'https://example.invalid',S3_ACCESS_KEY_ID:'key',S3_SECRET_ACCESS_KEY:'secret'});
  const store=ObjectStorage.fromEnvironment();assert.ok(store instanceof ObjectStorage);assert.equal((await store.createUpload('incoming/test','image/png',4)).method,'PUT');
 }finally{for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
});
