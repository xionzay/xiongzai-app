import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1360,height:1000},reducedMotion:'reduce'});
const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/v1/**',route=>{if(route.request().method()!=='GET')writes.push(route.request().url());return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],next_cursor:null})});});
const screen=()=>page.locator('.v31-screen');
async function catalog(label){await page.setViewportSize({width:1360,height:1000});await page.getByRole('button',{name:/查看全部 MVP 页面/}).click();await page.locator('.page-catalog-panel').getByRole('button',{name:label+' ›',exact:true}).click();await expect(screen()).toBeVisible();}
const labels=['订单列表','订单详情与履约','履约凭证与追加','售后处理与协商','补充履约与验收','补充履约待验收','二次申诉与新证据','拒绝退款与介入窗口','平台介入与举证','判责结果与两级申诉','渠道退款进度','终结后特殊申诉','资金冻结与结算明细','V3.1 规则快照'];
try{
 await page.goto('http://127.0.0.1:3001/',{waitUntil:'networkidle'});
 for(const role of ['买家','卖家'])for(const label of labels){await catalog(`${role} · ${label}`);await page.setViewportSize({width:375,height:844});await expect(screen()).not.toContainText('NaN');assert(await screen().evaluate(n=>n.scrollWidth<=n.clientWidth+1),`${role} ${label} overflow`);const palette=await page.locator('.phone-shell').getAttribute('data-page-palette');assert.equal(palette,role==='买家'?'buyer':'seller');}
 await catalog('买家 · 二次申诉与新证据');await screen().getByRole('button',{name:'不认可，提交申诉',exact:true}).click();await screen().getByLabel('具体原因').fill('补充新证据');await screen().getByRole('button',{name:'提交申请',exact:true}).click();await expect(screen().getByRole('alert')).toContainText('新证据');
 await catalog('买家 · 订单列表');await screen().getByRole('button',{name:'首页',exact:true}).click();await page.setViewportSize({width:390,height:844});
 await page.locator('.home-hot-grid button, .home-hot-sale-grid button').first().count().then(async count=>{if(!count){await page.locator('.home-companion-list .shop-card').first().click();await page.locator('.preview-product-grid button').first().click();}else await page.locator('.home-hot-grid button, .home-hot-sale-grid button').first().click();});
 const title=await page.locator('.preview-product-heading h2').innerText();
 await page.locator('.preview-bottom .primary-action').click();
 const dialog=page.getByRole('dialog',{name:'选择服务规格',exact:true});await expect(dialog).toBeVisible();
 await dialog.locator('.purchase-spec-options button').nth(1).click();await dialog.getByRole('button',{name:'增加数量',exact:true}).click();
 const spec=await dialog.locator('.purchase-spec-options button[aria-pressed="true"] span').innerText();const total=await dialog.locator('.purchase-spec-footer strong').innerText();
 await dialog.getByRole('button',{name:'确认规格，下一步',exact:true}).click();await expect(screen()).toContainText(title);await expect(screen()).toContainText(spec);await expect(screen()).toContainText(total);await expect(screen()).toContainText('× 2');
 await mkdir('.local/trade-v31',{recursive:true});await page.locator('.phone-shell').screenshot({path:'.local/trade-v31/catalog-checkout.png'});
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(writes.length,0);
 await writeFile('.local/trade-v31/catalog-results.json',JSON.stringify({pass:true,catalogChecks:labels.length*2,errors,writes,productSelection:{title,spec,total}},null,2));
 console.log(`PASS ${labels.length*2} catalog screens, correct role palettes, second appeal evidence requirement, selected product/SKU/quantity/price transferred to checkout.`);
}finally{await browser.close();}
