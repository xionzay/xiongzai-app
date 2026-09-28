import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const out='.local/trade-v31';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors=[],mutations=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/v1/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname;if(req.method()!=='GET')mutations.push(p);let data={items:[],next_cursor:null};if(p.endsWith('/me'))data={id:'buyer',profile:{nickname:'熊崽玩家'}};if(p.endsWith('/seller/profile'))data={seller_nickname:'晚风',accepting_orders:true};if(p.endsWith('/seller/services'))data=[];if(p.endsWith('/seller/finance/summary'))data={available_cent:'10000',pending_cent:'0',locked_cent:'0'};await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
const screen=()=>page.locator('.v31-screen');
const click=async name=>screen().getByRole('button',{name,exact:true}).click();
async function catalog(name){await page.setViewportSize({width:1360,height:1000});await page.getByRole('button',{name:/查看全部 MVP 页面/}).click();await page.locator('.page-catalog-panel').getByRole('button',{name:name+' ›',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(screen()).toBeVisible();}
async function capture(name){for(const width of [375,390,430]){await page.setViewportSize({width,height:844});const v=await screen().evaluate(el=>({w:el.clientWidth,s:el.scrollWidth}));if(v.s>v.w+1){console.log(await screen().evaluate(n=>Array.from(n.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>n.getBoundingClientRect().right+1).map(e=>({tag:e.tagName,cls:e.className,w:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,15)));await page.locator('.phone-shell').screenshot({path:`${out}/overflow.png`});}assert(v.s<=v.w+1,`${name} overflow ${JSON.stringify(v)}`);if(width===390)await page.locator('.phone-shell').screenshot({path:`${out}/${name}.png`});}await page.setViewportSize({width:390,height:844});}
try{
 await page.goto('http://127.0.0.1:3001/',{waitUntil:'networkidle'});
 await page.locator('.home-screen .buyer-nav').getByRole('button',{name:'订单',exact:true}).click();await expect(screen()).toContainText('V3.1 交互预览');await capture('buyer-orders');
 await screen().getByRole('tab',{name:'待服务',exact:true}).click();await screen().locator('.v31-card-open').first().click();await capture('buyer-detail');
 await click('申请售后');await click('提交售后申请');await expect(screen().getByRole('alert')).toContainText('原因');
 await screen().getByLabel('售后原因').selectOption('未按约定完成服务');await click('提交售后申请');await expect(screen()).toContainText('待卖家处理');await capture('buyer-aftersale');
 await click('卖家视角');await click('查看售后');await click('提出协商方案');await click('补充履约');await screen().getByLabel('具体方案').fill('补充剩余 1 局陪练');await capture('seller-proposal');await click('发送协商方案');
 await click('买家视角');await click('查看售后');await click('同意方案');await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await expect(screen()).toContainText('补充履约中');await capture('buyer-remedy');
 await click('卖家视角');await click('查看售后');await click('提交补充履约完成');await click('提交完成，进入验收');await expect(screen().getByRole('alert')).toContainText('5 张');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVf8AAAAASUVORK5CYII=','base64');
 await screen().getByLabel('选择证据文件').setInputFiles(Array.from({length:5},(_,i)=>({name:`evidence-${i}.png`,mimeType:'image/png',buffer:png})));await capture('seller-evidence');await click('提交完成，进入验收');await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
 await click('买家视角');await expect(screen()).toContainText('补充履约待验收');await click('延长收货');await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await expect(screen().getByRole('button',{name:'延长收货',exact:true})).toBeDisabled();await capture('buyer-receipt');
 await click('确认收货');await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await click('评价服务');await click('提交评价');await expect(screen()).toContainText('已完成');
 await catalog('买家 · 判责结果与两级申诉');await capture('buyer-ruling');await click('不认可，提交申诉');await screen().getByLabel('具体原因').fill('希望核验新的交付时间记录');await click('提交申请');await expect(screen()).toContainText('第 1 级复核');
 for(const [name,file] of [['卖家 · 订单列表','seller-orders'],['卖家 · 售后处理与协商','seller-aftersale'],['买家 · 平台介入与举证','buyer-platform'],['买家 · 渠道退款进度','buyer-refund'],['卖家 · 资金冻结与结算明细','seller-funds'],['买家 · 终结后特殊申诉','buyer-special'],['买家 · V3.1 规则快照','buyer-rules']]){await catalog(name);await capture(file);}
 await catalog('买家 · 确认订单与支付');await capture('checkout');await screen().getByRole('checkbox').check();await click('模拟付款 ¥60.00');await expect(screen()).toContainText('待服务');
 await page.setViewportSize({width:844,height:390});assert(await screen().evaluate(n=>n.scrollWidth<=n.clientWidth+1));
 assert.equal(mutations.length,0,`preview mutated API: ${mutations}`);assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(`${out}/results.json`,JSON.stringify({pass:true,errors,mutations},null,2));console.log('PASS: buyer/seller V3.1 flow, evidence, remediation, receipt extension, review, appeal, checkout; 375/390/430 and landscape; zero API mutations.');
}finally{await browser.close();}
