import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1360,height:1000},reducedMotion:'reduce'});
const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
const seller={id:'sheet-seller',seller_nickname:'晚风',seller_avatar_file_id:null,cover_file_id:null,introduction:'一起开黑',game_rank:'王牌',preferred_mode:'组队',play_style:'耐心',accepting_orders:true,rating_avg:'5.0',review_count:0,completed_order_count:0,favorite_count:0,version:1};
const product={id:'sheet-product',seller_id:seller.id,title:'战术陪练 · 规格弹窗验证',description:'一起开黑',cover_file_id:null,min_price_cent:'2800',sold_count:0,rating_avg:'5.0',review_count:0,status:'ON_SALE',version:1,seller,skus:[{id:'sku-1',sku_name:'30分钟',price_cent:'2800',duration_minutes:30,status:'ACTIVE'},{id:'sku-2',sku_name:'60分钟',price_cent:'5600',duration_minutes:60,status:'ACTIVE'},{id:'sku-off',sku_name:'已停用规格',price_cent:'100',duration_minutes:1,status:'DISABLED'}]};
await page.route('**/api/v1/**',route=>{const req=route.request();if(req.method()!=='GET')writes.push(req.url());const path=new URL(req.url()).pathname.replace('/api/v1','');let body={items:[],next_cursor:null};if(path==='/companions')body={items:[seller],next_cursor:null};if(path==='/services')body={items:[product],next_cursor:null};if(path===`/services/${product.id}`)body=product;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
try {
 await page.goto('http://127.0.0.1:3001/',{waitUntil:'networkidle'});
 await page.locator('.page-picker').getByRole('button',{name:/服务详情/}).click();
 await page.setViewportSize({width:390,height:844});
 const buy=page.locator('.service-actions .primary-action');await expect(buy).toBeEnabled();await buy.click();
 const dialog=page.getByRole('dialog',{name:'选择服务规格',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.locator('.purchase-spec-options button')).toHaveCount(2);
 await dialog.locator('.purchase-spec-options button').nth(1).click();await expect(dialog.locator('.purchase-spec-footer strong')).toHaveText('¥56.00');
 await dialog.getByRole('button',{name:'关闭规格弹窗',exact:true}).click();await expect(page.locator('.service-screen')).toBeVisible();
 await page.locator('.service-screen .preview-spec-entry').click();await expect(dialog.locator('[aria-pressed="true"]')).toContainText('60分钟');
 await dialog.getByRole('button',{name:'确认规格，下一步',exact:true}).click();await expect(page.locator('.checkout-screen')).toContainText('60分钟');await expect(page.locator('.checkout-screen')).toContainText('¥56.00');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS: API product opens same sheet, excludes disabled SKUs, preserves chosen SKU, passes correct price to checkout, zero writes.');
}finally{await browser.close();}
