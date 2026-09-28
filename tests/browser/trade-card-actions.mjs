import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/v1/**',r=>{if(r.request().method()!=='GET')writes.push(r.request().url());return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],next_cursor:null})});});
const screen=()=>page.locator('.v31-screen');const card=id=>page.locator(`[data-order-id="${id}"]`);
const tab=name=>screen().getByRole('tab',{name,exact:true}).click();
const back=()=>screen().getByRole('button',{name:'返回上一页',exact:true}).click();
const btn=(c,name)=>c.getByRole('button',{name,exact:true});
try {
 await page.goto('http://127.0.0.1:3001/?preview=trade-v31',{waitUntil:'networkidle'});
 await mkdir('.local/trade-card-actions',{recursive:true});
 for(const name of ['待付款','待服务','服务中','待收货','待评价','售后中','已完成']){
  await tab(name);assert(await page.locator('.v31-buyer-card').count()>0,name);
  await expect(screen().getByRole('button',{name:'订单详情',exact:true})).toHaveCount(0);
  for(const width of [375,390,430]){await page.setViewportSize({width,height:844});assert(await screen().evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert(await page.locator('.v31-card-actions').evaluateAll(ns=>ns.every(n=>n.scrollWidth<=n.clientWidth+1)));}
  await page.setViewportSize({width:390,height:844});await page.locator('.phone-shell').screenshot({path:`.local/trade-card-actions/${name}.png`});
 }
 await tab('待服务');await btn(card('XZ310001'),'催服务').click();await expect(btn(card('XZ310001'),'已催服务')).toBeDisabled();await expect(screen().getByRole('heading',{level:1})).toHaveText('我的订单');
 await btn(card('XZ310001'),'联系商家').click();await expect(screen()).toContainText('关联订单 XZ310001');await screen().getByLabel('发送给商家的消息').fill('请确认服务内容');await btn(screen(),'发送预览').click();await expect(screen().getByLabel('商家会话')).toContainText('请确认服务内容');await back();
 // Header/blank space hits the stretched card link, not just the product image.
 const header=await card('XZ310001').locator('header').boundingBox();await page.mouse.click(header.x+20,header.y+10);await expect(screen().getByRole('heading',{level:1})).toHaveText('订单详情');await expect(screen()).toContainText('订单 XZ310001');await back();
 await tab('待付款');await btn(card('XZ310008'),'取消订单').click();await expect(page.getByRole('dialog')).toBeVisible();await btn(page.getByRole('dialog'),'暂不操作').click();await expect(card('XZ310008')).toBeVisible();await btn(card('XZ310008'),'立即付款').click();await expect(screen().getByRole('heading',{level:1})).toHaveText('确认订单');await back();
 await tab('待收货');await card('XZ310013').getByRole('button',{name:'更多操作 XZ310013'}).click();await expect(page.getByRole('dialog')).toBeInViewport();await btn(page.getByRole('dialog'),'延长收货').click();await btn(page.getByRole('dialog'),'确认').click();
 await card('XZ310013').getByRole('button',{name:'更多操作 XZ310013'}).click();await expect(btn(page.getByRole('dialog'),'延长收货')).toHaveCount(0);await page.keyboard.press('Escape');
 // A different order still owns its extension. Confirmation must target its own id.
 await card('XZ310003').getByRole('button',{name:'更多操作 XZ310003'}).click();await expect(btn(page.getByRole('dialog'),'延长收货')).toBeVisible();await btn(page.getByRole('dialog'),'取消').click();
 await btn(card('XZ310003'),'确认收货').click();await btn(page.getByRole('dialog'),'确认').click();await expect(card('XZ310003')).toHaveCount(0);await expect(card('XZ310013')).toBeVisible();
 await tab('待评价');await btn(card('XZ310003'),'去评价').click();await expect(screen().getByRole('heading',{level:1})).toHaveText('评价服务');await back();
 await tab('售后中');await btn(card('XZ310005'),'回应方案').click();await expect(screen()).toContainText('补充履约方案');await back();
 await btn(card('XZ310006'),'补充证据').click();await expect(screen().getByRole('heading',{level:1})).toHaveText('履约凭证');await back();
 await btn(card('XZ310015'),'申请平台介入').click();await expect(screen().getByRole('heading',{level:1})).toHaveText('申请平台介入');await back();
 await btn(card('XZ310010'),'查看退款进度').click();await expect(screen()).toContainText('等待渠道回执');await back();
 await tab('已完成');await expect(btn(card('XZ310017'),'查看评价')).toHaveCount(0);await btn(card('XZ310016'),'查看评价').click();await expect(screen()).toContainText('沟通耐心');await expect(btn(screen(),'提交评价')).toHaveCount(0);
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS: seven status tabs, 375/390/430 layouts, whole-card detail link, reminder cooldown, local chat, targeted confirmations, shared extension quota, aftersale actions, no expired review action, zero API writes.');
}finally{await browser.close();}
