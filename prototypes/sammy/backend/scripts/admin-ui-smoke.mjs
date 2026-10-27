// UI-only proof: network is entirely intercepted; this does not verify PostgreSQL/API execution.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../../../package.json',import.meta.url)),{chromium}=require('@playwright/test');
const id='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const profile={id,nickname:'林间晚风',phone:'13800138000',bio:'耐心陪伴，轻松上分。',isAdmin:false,suspended:false,providerSuspended:false,createdAt:new Date().toISOString()};
const listing={id:sid,ownerId:id,title:'和平精英 · 轻松双排',description:'一起练习配合，享受游戏。',priceFen:3900,status:'published',moderationBlocked:false,revision:1,photoMediaIds:[]};
const mockOrder={id:'44444444-4444-4444-8444-444444444444',buyerId:id,sellerId:sid,status:'awaitingService',quantity:2,totalFen:7800,createdAt:new Date().toISOString(),service:{title:'模拟订单服务',description:'Saved snapshot'},rules:{version:'sammy-simulation-v1',text:{en:'Simulation only',zh:'仅为模拟'}},delivery:{gameName:'QA player',gameId:'player-123',note:'Proposal'}};
const history=[];
const application={id:'33333333-3333-4333-8333-333333333333',userId:id,status:'pending',submittedAt:new Date().toISOString(),agreementVersion:'prototype-hosted-v1',snapshot:{nickname:profile.nickname,bio:profile.bio,draft:{rank:'Ace',playStyle:'Calm',mode:'duo'}}};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://sammy-admin.test/**',async route=>{const u=new URL(route.request().url()),p=u.pathname;let data;
  if(['/admin','/admin/admin.js','/admin/admin.css','/admin/admin-cloud-world.webp','/admin/admin-cloud-bank.webp','/admin/admin-mascot.png'].includes(p)){const name=p==='/admin'?'admin.html':p.split('/').at(-1);return route.fulfill({contentType:name.endsWith('html')?'text/html':name.endsWith('js')?'application/javascript':name.endsWith('webp')?'image/webp':name.endsWith('png')?'image/png':'text/css',body:await readFile(new URL('../public/'+name,import.meta.url))});}
  if(p==='/v1/auth/login')data={token:'mock-session',profile:{isAdmin:true}};
  else if(p==='/v1/admin/overview')data={totals:{users:128,providers:24,pending:7,services:36,published:29,suspended:2}};
  else if(p==='/v1/admin/users'||p==='/v1/admin/providers')data={items:[profile],hasMore:false};
  else if(p==='/v1/admin/users/'+id)data={profile,applications:[{...application,status:'approved'}],listings:[listing],files:[]};
  else if(p==='/v1/admin/services')data={items:[{listing,nickname:profile.nickname,phone:profile.phone}],hasMore:false};
  else if(p==='/v1/admin/services/'+sid)data={listing,owner:profile,files:[]};
  else if(p.endsWith('/moderation')){const b=route.request().postDataJSON();listing.moderationBlocked=b.blocked;listing.revision++;listing.moderationReason=b.reason;history.push({id:'h1',action:'services.block',actor:'管理员',targetId:sid,reason:b.reason,createdAt:new Date().toISOString()});data={ok:true};}
  else if(p.endsWith('/status')){const b=route.request().postDataJSON();if(p.includes('/providers/'))profile.providerSuspended=b.suspended;else profile.suspended=b.suspended;data={ok:true};}
  else if(p==='/v1/admin/applications')data={applications:[{...application,nickname:profile.nickname}]};
  else if(p==='/v1/admin/applications/'+application.id)data={application,files:[]};
  else if(p.endsWith('/review')){const b=route.request().postDataJSON();application.status=b.decision;application.reason=b.reason;data={application};}
  else if(p==='/v1/admin/orders')data={items:[mockOrder],hasMore:false};
  else if(p==='/v1/admin/orders/'+mockOrder.id)data={order:mockOrder,attempts:[]};
  else if(p==='/v1/admin/history')data={items:history,hasMore:false};
  else if(p==='/v1/auth/logout')data={ok:true};
  else return route.fulfill({status:404,json:{error:'notFound'}});
  return route.fulfill({json:data});
 });
 await page.goto('http://sammy-admin.test/admin');
 await mkdir(new URL('../.local/',import.meta.url),{recursive:true});
 assert.equal(await page.locator('aside').isVisible(),false);assert.equal(await page.locator('main>header').isVisible(),false);
 await page.locator('.login-intro img').evaluate(img=>img.decode());
 assert.ok(await page.locator('.login-intro img').evaluate(img=>img.naturalWidth)>0);
 await page.screenshot({path:new URL('../.local/admin-login-zh.png',import.meta.url).pathname,fullPage:true});
 await page.getByRole('button',{name:'显示密码',exact:true}).click();assert.equal(await page.locator('#passwordInput').getAttribute('type'),'text');
 await page.locator('#loginLanguage').selectOption('en');await page.getByRole('button',{name:'Hide password',exact:true}).click();assert.equal(await page.locator('#passwordInput').getAttribute('type'),'password');
 await page.screenshot({path:new URL('../.local/admin-login-en.png',import.meta.url).pathname,fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../.local/admin-login-mobile.png',import.meta.url).pathname,fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.locator('#loginLanguage').selectOption('zh');
 await page.getByLabel('手机号').fill('13900000000');await page.getByLabel('密码',{exact:true}).fill('synthetic-ui-only-password');await page.getByRole('button',{name:'登录后台',exact:true}).click();await page.getByText('用户总数',{exact:true}).waitFor();
 await mkdir(new URL('../.local/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.local/admin-overview-zh.png',import.meta.url).pathname,fullPage:true});
 await page.getByRole('button',{name:'用户管理',exact:true}).click();await page.getByRole('button',{name:'查看详情',exact:true}).click();await page.getByRole('dialog').getByRole('textbox').fill('Synthetic account review reason');await page.getByRole('button',{name:'停用账号',exact:true}).click();await page.getByText('已停用',{exact:true}).waitFor();assert.equal(profile.suspended,true);
 await page.getByRole('button',{name:'陪玩管理',exact:true}).click();await page.getByRole('button',{name:'查看详情',exact:true}).click();await page.getByRole('dialog').getByRole('textbox').fill('Synthetic provider review reason');await page.getByRole('button',{name:'停用陪玩',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(profile.providerSuspended,true);
 await page.getByRole('button',{name:'服务管理',exact:true}).click();await page.getByRole('button',{name:'查看详情',exact:true}).click();await page.getByRole('dialog').getByRole('textbox').fill('Synthetic moderation reason');await page.getByRole('button',{name:'屏蔽服务',exact:true}).click();await page.getByText('已屏蔽',{exact:true}).waitFor();assert.equal(listing.moderationBlocked,true);
 await page.getByRole('button',{name:'入驻审核',exact:true}).click();await page.getByRole('button',{name:'审核申请',exact:true}).click();await page.getByRole('dialog').getByRole('textbox').fill('Please provide your introduction.');await page.getByRole('button',{name:'要求修改',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(application.status,'changes_requested');
 await page.getByRole('button',{name:'操作记录',exact:true}).click();await page.getByText('Synthetic moderation reason',{exact:true}).waitFor();
 await page.locator('#language').selectOption('en');await page.getByRole('heading',{name:'Action history',exact:true}).waitFor();await page.getByRole('button',{name:'Services',exact:true}).click();await page.getByRole('button',{name:'Inspect',exact:true}).click();await page.getByText('Synthetic moderation reason',{exact:true}).waitFor();await page.screenshot({path:new URL('../.local/admin-service-en.png',import.meta.url).pathname,fullPage:true});await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Orders',exact:true}).click();await page.getByRole('button',{name:'Inspect',exact:true}).click();await page.getByText('SIMULATED · no real payment',{exact:true}).waitFor();await page.screenshot({path:new URL('../.local/admin-order-en.png',import.meta.url).pathname,fullPage:true});await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../.local/admin-mobile-en.png',import.meta.url).pathname,fullPage:true});assert.deepEqual(errors,[]);console.log('PASS (mocked UI only): sign-in, overview, user/provider suspension, service moderation, application changes, history, language switch and responsive screenshots; no browser exceptions.');
}finally{await browser.close();}
