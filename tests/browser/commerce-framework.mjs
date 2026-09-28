import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const out='.local/seller-four-tabs'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const product={id:'test-product',seller_id:'test-seller',title:'三角洲行动 · 战术陪练',description:'耐心沟通，团队配合',cover_file_id:null,min_price_cent:'2800',sold_count:0,rating_avg:'5.0',review_count:0,status:'ON_SALE',version:1};
const seller={id:'test-seller',seller_nickname:'晚风',seller_avatar_file_id:null,cover_file_id:null,introduction:'一起轻松开黑',game_rank:'王牌',preferred_mode:'组队',play_style:'耐心',accepting_orders:true,rating_avg:'5.0',review_count:0,completed_order_count:0,favorite_count:0,version:1};
const order={id:'test-order',order_no:'PREVIEW0001',buyer_id:'test-buyer',seller_user_id:'test-user',seller_id:'test-seller',product_id:product.id,sku_id:'test-sku',product_title:product.title,product_image:'/assets/home-hot-sale/cover-03.jpg',seller_name:'晚风',seller_avatar:null,sku_name:'60分钟套餐',sku_duration_minutes:60,quantity:1,payable_amount_cent:'5600',paid_amount_cent:'5600',seller_income_cent:'5040',platform_fee_cent:'560',status:'PENDING_ACCEPT',payment_status:'PAID',after_sale_status:'NONE',service_starts_at:'2026-09-26T12:00:00Z',created_at:'2026-09-26T10:00:00Z',buyer_note:null,version:1};
const conversation={id:'test-conversation',conversation_no:'C001',conversation_type:'ORDER',order_id:order.id,product_id:product.id,last_message_preview:'请确认服务时间',last_message_at:'2026-09-26T10:00:00Z',unread_count:0,member_role:'SELLER',version:1};
const orders=[order,{...order,id:'pending-payment',status:'PENDING_PAYMENT',payment_status:'UNPAID'},{...order,id:'closed',status:'CLOSED'},{...order,id:'refunded',payment_status:'REFUNDED',after_sale_status:'REFUNDED'}];
let mutations=[];let published=null;let uploadBytes=0;
await page.route('**/mock-product-upload',async route=>{uploadBytes=route.request().postDataBuffer()?.length??0;await route.fulfill({status:200,body:''});});
await page.route('**/api/v1/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1','');let body={};
 if(req.method()!=='GET') {
  mutations.push(path);
  if(path.endsWith('/off-sale')){product.status='OFF_SALE';product.version++;body=product;}
  else if(path.endsWith('/submit-review')){product.status='PENDING_REVIEW';product.version++;body=product;}
  else if(path==='/files/uploads')body={file:{id:'cover-test'},upload:{url:'http://127.0.0.1:3001/mock-product-upload',headers:{}}};
  else if(path==='/files/cover-test/complete')body={id:'cover-test',upload_status:'VERIFIED',moderation_status:'APPROVED'};
  else if(path==='/seller/services'){published=req.postDataJSON();body={...product,id:'published-test'};}
  else body={};
 }
 else if(path==='/me') body={id:'test-user',profile:{nickname:'预览用户',public_user_no:'10086'}};
 else if(path==='/companions') body={items:[seller],next_cursor:null};
 else if(path==='/services') body={items:[product],next_cursor:null};
 else if(path==='/seller/profile') body=seller;
 else if(path==='/seller/finance/summary') body={available_cent:'128600',pending_cent:'16800'};
 else if(path==='/seller/services') body=[product];
 else if(path.startsWith('/seller/services/')) body={...product,skus:[{id:'sku-test',sku_name:'60分钟套餐',price_cent:'2800',duration_minutes:60}]};
 else if(path==='/orders'||path==='/seller/orders') body={items:orders,next_cursor:null};
 else if(path==='/conversations') body={items:[conversation],next_cursor:null};
 else if(path.endsWith('/messages')) body={items:[{id:'msg',sender_user_id:'test-buyer',message_type:'TEXT',content:'请确认服务时间',sequence_no:'1',created_at:'2026-09-26T10:00:00Z'}],next_cursor:null};
 else if(path==='/notifications') body={items:[],next_cursor:null};
 else body={items:[],next_cursor:null};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
const visible=()=>page.locator('.app-screen:visible');
async function catalog(label){
 await page.setViewportSize({width:1360,height:1000});
 await page.locator('.open-page-catalog').click();
 await page.locator('.page-catalog-panel').getByRole('button',{name:label+' ›',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
}
async function capture(name){
 for(const width of [375,390,430]){
  await page.setViewportSize({width,height:844});
  const layout=await visible().evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));
  assert(layout.scroll<=layout.width+1,`${name} overflow at ${width}: ${JSON.stringify(layout)}`);
  if(width===390)await page.locator('.phone-shell').screenshot({path:`${out}/${name}.png`});
 }
}
try{
 await page.goto('http://127.0.0.1:3001/',{waitUntil:'networkidle'});
 await expect(page.locator('.home-shortcut')).toHaveCount(5);
 await capture('home');
 // Real local catalog controls, without backend writes.
 await page.locator('.home-companion-list .shop-card').first().click();
 await expect(page.locator('.preview-product-grid button')).toHaveCount(3);
 await page.getByRole('tab',{name:'评价',exact:true}).click();await expect(visible()).toContainText('暂无订单评价');
 await page.getByRole('tab',{name:'全部服务',exact:true}).click();await capture('companion');
 await page.locator('.preview-product-grid button').first().click();await capture('service');
 await page.locator('.preview-bottom .primary-action').click();
 await page.locator('.preview-sku-list button').nth(1).click();
 await page.getByRole('button',{name:'增加数量',exact:true}).click();await capture('specs');
 await page.getByRole('button',{name:'确认规格',exact:true}).click();await expect(visible()).toContainText('2 份');
 await page.getByRole('button',{name:'完成预览',exact:true}).click();
 await visible().getByRole('button',{name:'我的',exact:true}).click();await capture('mine');
 await page.locator('.commerce-order-entries').getByRole('button',{name:'待付款',exact:true}).click();
 await expect(page.locator('.buyer-order-card')).toHaveCount(1);await expect(page.locator('.buyer-order-head')).toContainText('待付款');
 await page.locator('.order-filter').getByRole('button',{name:'全部',exact:true}).click();await expect(page.locator('.buyer-order-card')).toHaveCount(4);await capture('orders');
 await catalog('经营概览');await expect(page.locator('.merchant-overview')).toBeVisible();
 await expect(page.locator('.seller-nav button')).toHaveText(['首页','订单','消息','我的']);
 await expect(visible()).not.toContainText('可提现');
 await expect(page.locator('.merchant-identity')).toContainText('晚风');
 await capture('seller');
 await page.locator('.seller-nav').getByRole('button',{name:'我的',exact:true}).click();
 await expect(page.locator('.merchant-balance')).toContainText('1286.00');
 await expect(page.locator('.merchant-identity')).toContainText('晚风');
 await page.getByRole('tab',{name:'昨日',exact:true}).click();await expect(visible()).toContainText('昨日营业额');
 await page.getByRole('tab',{name:'本周',exact:true}).click();await expect(visible()).toContainText('本周营业额');await capture('seller-mine');
 await page.locator('.seller-nav').getByRole('button',{name:'首页',exact:true}).click();
 await page.getByRole('button',{name:'商品管理',exact:true}).click();
 await expect(page.getByRole('button',{name:'下架商品',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'下架商品',exact:true}).click();await expect(page.getByText('下架这个商品？')).toBeVisible();
 await page.getByRole('button',{name:'暂不操作',exact:true}).click();await capture('seller-products');
 await page.getByRole('button',{name:'下架商品',exact:true}).click();await page.getByRole('button',{name:'确认',exact:true}).click();
 await page.getByRole('button',{name:'已下架 1',exact:true}).click();await expect(page.getByRole('button',{name:'重新上架',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'重新上架',exact:true}).click();await page.getByRole('button',{name:'确认',exact:true}).click();
 await page.getByRole('button',{name:'审核中 1',exact:true}).click();await expect(page.locator('.seller-service-list')).toContainText('审核中');
 await page.getByRole('button',{name:'＋ 发布商品',exact:true}).click();
 await expect(page.getByRole('button',{name:'上传主图',exact:true})).toBeVisible();
 await expect(page.getByLabel('规格1名称')).toBeVisible();await capture('seller-publish');
 await page.getByLabel('选择商品主图').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVf8AAAAASUVORK5CYII=','base64')});
 await expect(page.locator('.seller-publish-screen').getByRole('status')).toContainText('主图审核已通过');assert(uploadBytes>0);
 await page.getByPlaceholder('输入服务标题',{exact:true}).fill('测试陪玩服务商品');
 await page.getByPlaceholder('介绍服务内容、沟通方式和注意事项').fill('一起组队娱乐，耐心沟通，按预约时间提供陪玩服务。');
 await page.getByLabel('规格1名称').fill('一小时');await page.getByLabel('规格1价格').fill('28');
 await page.getByRole('button',{name:'提交审核',exact:true}).click();
 await expect(page.locator('.seller-services-screen')).toBeVisible();
 assert.equal(published.cover_file_id,'cover-test');assert.equal(published.title,'测试陪玩服务商品');
 await page.locator('.seller-nav').getByRole('button',{name:'订单',exact:true}).click();
 await expect(page.locator('.seller-buyer-order-card')).toHaveCount(4);
 await page.locator('.order-filter').getByRole('button',{name:'待付款',exact:true}).click();
 await expect(page.locator('.seller-buyer-order-card')).toHaveCount(1);
 await page.locator('.seller-buyer-order-actions').getByRole('button',{name:'查看详情',exact:true}).click();
 await expect(page.locator('.seller-order-status')).toContainText('等待买家付款');
 await expect(page.getByRole('button',{name:'确认接单',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'返回订单列表',exact:true}).click();
 await page.locator('.order-filter').getByRole('button',{name:'已关闭',exact:true}).click();await expect(page.locator('.seller-buyer-order-card')).toHaveCount(1);
 await page.locator('.order-filter').getByRole('button',{name:'售后',exact:true}).click();await expect(page.locator('.seller-buyer-order-card')).toHaveCount(1);
 await expect(page.locator('.seller-buyer-order-actions').getByRole('button',{name:'查看详情',exact:true})).toBeVisible();
 await capture('seller-orders');
 await page.locator('.seller-nav').getByRole('button',{name:'聊天',exact:true}).click();
 await expect(page.locator('.phone-shell')).toHaveClass(/page-sellerMessages/);await capture('seller-messages');
 await page.locator('.message-list button').click();await expect(page.locator('.chat-screen')).toBeVisible();
 assert(!(await page.locator('.phone-shell').getAttribute('class')).includes('user-theme'));
 const sellerChatStyle=await page.locator('.chat-screen').evaluate(n=>({background:getComputedStyle(n).backgroundImage,composer:getComputedStyle(n.querySelector('.chat-input')).height}));
 await page.locator('.chat-topbar').getByRole('button',{name:'返回',exact:true}).click();await expect(page.locator('.seller-nav')).toBeVisible();
 await catalog('消息列表');await page.locator('.message-list button').click();
 const buyerChatStyle=await page.locator('.chat-screen').evaluate(n=>({background:getComputedStyle(n).backgroundImage,composer:getComputedStyle(n.querySelector('.chat-input')).height}));
 assert.deepEqual(sellerChatStyle,buyerChatStyle);
 assert(mutations.every(p=>p.endsWith('/read')||p.startsWith('/seller/services')||p.startsWith('/files/')),'unexpected business write');
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({status:'passed',widths:[375,390,430],chatStyleParity:true,mutationsIntercepted:mutations,errors},null,2));
 console.log('PASS: responsive commerce pages, specs, order filters, seller chat return, buyer/seller chat style parity; all APIs intercepted');
}catch(error){await page.screenshot({path:`${out}/failure.png`}); console.log((await page.locator('body').innerText()).slice(0,2200)); console.log(errors);throw error;}finally{await browser.close();}
