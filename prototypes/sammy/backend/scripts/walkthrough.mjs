import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
const require=createRequire(new URL('../../../../package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const base='http://127.0.0.1:3100',password='synthetic-walkthrough-password',suffix=String(Date.now()).slice(-8);
const phone='138'+suffix,adminPhone='139'+suffix,name='Walkthrough '+suffix;
async function api(path,body,token,method=body===undefined?'GET':'POST'){
 const r=await fetch(base+'/v1'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok(r.ok,`${path}: ${r.status} ${data.error??''}`);return data;
}
const provider=await api('/auth/register',{phone,password,nickname:name,bio:'Synthetic profile for local testing.',accepted:true});
await api('/auth/register',{phone:adminPhone,password,nickname:'Walkthrough Admin',accepted:true});
const pool=new Pool({connectionString:process.env.DATABASE_URL});
await pool.query('UPDATE users SET is_admin=true WHERE phone=$1',[adminPhone]);await pool.end();
async function upload(kind,mime,bytes){
 const slot=await api('/media',{kind,mime,bytes:bytes.length},provider.token);
 const put=await fetch(slot.url,{method:'PUT',headers:{'Content-Type':mime},body:bytes});assert.ok(put.ok,`upload ${put.status}`);
 const ready=await api(`/media/${slot.id}/complete`,{},provider.token);const download=await fetch(ready.files[0].url);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);return slot.id;
}
const photo=await upload('avatar','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9U8AAAAASUVORK5CYII=','base64'));
const voice=await upload('voice','audio/mp4',await readFile(new URL('../tests/fixtures/voice.m4a',import.meta.url)));
const draft={gameName:'QA Player',gameId:'qa_001',server:'wechat',rank:'Ace',kd:'3.2',experience:'Two years of team play',playStyle:'Calm support',mode:'squad',voiceMediaId:voice};
await api('/me',{avatarMediaId:photo,draft},provider.token,'PATCH');
await api('/me/application',{accepted:true},provider.token);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 console.log('HTTP uploads verified. Opening admin review.');
 const page=await browser.newPage({viewport:{width:1200,height:850}});await page.goto(base+'/admin');
 await page.locator('#loginLanguage').selectOption('en');await page.getByLabel('Mobile number',{exact:true}).fill(adminPhone);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Applications',exact:true}).click();
 await page.getByRole('row').filter({hasText:name}).getByRole('button',{name:'Review application',exact:true}).click();
 await page.getByRole('dialog').getByRole('textbox').fill('Please explain your team experience.');
 await page.getByRole('button',{name:'Request changes',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 let account=await api('/me',undefined,provider.token);assert.equal(account.profile.application.status,'changes_requested');
 await api('/me',{draft:{...draft,experience:'Two years playing squad support; I explain rotations calmly.'}},provider.token,'PATCH');
 await api('/me/application',{accepted:true},provider.token);
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('row').filter({hasText:name}).getByRole('button',{name:'Review application',exact:true}).click();
 await page.locator('audio').evaluate(async audio=>{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Audio metadata timed out')),15000);audio.addEventListener('loadedmetadata',()=>{clearTimeout(timer);resolve();},{once:true});audio.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Audio did not load'));},{once:true});audio.load();});});
 await page.getByRole('dialog').getByRole('textbox').fill('Submitted profile and introduction reviewed.');await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 account=await api('/me',undefined,provider.token);assert.equal(account.profile.application.status,'approved');
 const listingId=randomUUID();
 const listing={revision:0,title:'Local squad companion',description:'Synthetic service for testing discovery before deployment.',game:'peaceElite',mode:'squad',category:'relaxed',priceFen:3900,photoMediaIds:[photo]};
 await api(`/me/listings/${listingId}`,listing,provider.token,'PUT');
 await api(`/me/listings/${listingId}/publish`,{revision:1,accepted:true},provider.token);
 const discovery=await api('/listings?q=Local%20squad&mode=squad');assert.ok(discovery.listings.some(item=>item.id===listingId));
 const detail=await api(`/listings/${listingId}`);assert.equal(detail.listing.provider.nickname,name);assert.ok(!JSON.stringify(detail).includes(phone));
 await api(`/me/listings/${listingId}/unpublish`,{revision:2},provider.token);
 assert.equal((await fetch(base+`/v1/listings/${listingId}`)).status,404);
 await api(`/me/listings/${listingId}/publish`,{revision:3,accepted:true},provider.token);
 await page.locator('#status').selectOption('approved');await page.getByRole('row').filter({hasText:name}).getByRole('button',{name:'Review application',exact:true}).click();
 await mkdir(new URL('../.local/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.local/admin-approved.png',import.meta.url).pathname,fullPage:true});
 await api('/auth/logout',{},provider.token);const login=await api('/auth/login',{phone,password});assert.equal(login.profile.application.status,'approved');await api('/auth/logout',{},login.token);
 console.log('PASS: real HTTP signup → signed MinIO uploads/downloads → browser admin changes → resubmit → browser approval → publish/search/detail/unpublish → logout/login persistence.');
}finally{await browser.close();}
