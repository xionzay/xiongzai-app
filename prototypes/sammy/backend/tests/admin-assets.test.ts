import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../src/app.js';
import type { Database } from '../src/db.js';
test('admin serves only explicit assets with correct MIME and unchanged image bytes',async()=>{
 const app=buildApp({db:{} as Database,logger:false});
 try{
  const page=await app.inject({method:'GET',url:'/admin'});assert.equal(page.statusCode,200);assert.ok(page.body.includes('/admin/admin-mascot.png'));
  for(const [name,type]of [['admin-cloud-world.webp','image/webp'],['admin-cloud-bank.webp','image/webp'],['admin-mascot.png','image/png']]){const response=await app.inject({method:'GET',url:'/admin/'+name});assert.equal(response.statusCode,200);assert.equal(response.headers['content-type'],type);assert.deepEqual(response.rawPayload,await readFile(new URL('../public/'+name,import.meta.url)));}
  assert.equal((await app.inject({method:'GET',url:'/admin/runtime.env'})).statusCode,404);
 }finally{await app.close();}
});
