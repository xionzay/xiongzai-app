import { expect, test } from "@playwright/test";
import { totpCode, MockPaymentProvider } from "../../apps/api/dist/index.js";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const api = "http://127.0.0.1:3002";
const env = key => { if (!process.env[key]) throw new Error("Missing test key: "+key); return process.env[key]; };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
// Five distinct, valid synthetic screenshots. The backend rejects repeated content hashes.
function proofPng(index) {
  const crc = bytes => { let sum=0xffffffff; for(const byte of bytes){sum^=byte;for(let i=0;i<8;i++)sum=(sum>>>1)^(sum&1?0xedb88320:0);} return (sum^0xffffffff)>>>0; };
  const chunk = (name,data) => {const length=Buffer.alloc(4),checksum=Buffer.alloc(4),kind=Buffer.from(name);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,checksum]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([png.subarray(0,8),chunk("IHDR",ihdr),chunk("IDAT",deflateSync(Buffer.from([0,40*index,100,200]))),chunk("IEND",Buffer.alloc(0))]);
}
function syntheticRecording() {
  const directory=mkdtempSync(join(tmpdir(),"stage-two-recording-")),file=join(directory,"synthetic.mp4");
  try {
    const result=spawnSync("/usr/bin/swift",["tests/browser/fixtures/continuous-recording.swift",file],{timeout:30_000,stdio:"ignore"});
    if(result.status!==0) throw new Error("Local synthetic recording requires the existing Xcode Swift runtime; nothing is installed automatically");
    return readFileSync(file);
  } finally { try {unlinkSync(file);}catch{/* May not have been created. */} rmdirSync(directory); }
}

async function actor(browser, role) {
  const context=await browser.newContext({baseURL:process.env.ADMIN_E2E_FRONTEND_ORIGIN});
  await context.route("**/*",route=>{const url=new URL(route.request().url());return /^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/u.test(url.hostname) ? route.fallback() : route.abort();});
  await context.route(api+"/**",async route=>{const target=new URL(route.request().url());target.port=env("E2E_API_PORT");const response=await route.fetch({url:target.href});await route.fulfill({response});});
  // MinIO traffic uses actual local CORS responses; never fulfill storage requests or fabricate headers.
  if(role) await context.addCookies([{name:"xiongzai_access",value:env("E2E_STAGE_"+role+"_ACCESS"),domain:"127.0.0.1",path:"/",httpOnly:true,sameSite:"Lax"}]);
  context.setDefaultTimeout(12_000);
  const page=await context.newPage();
  page.on("response",async response=>{if(response.url().startsWith(api+"/") && response.status()>=400){const body=await response.json().catch(()=>({}));console.log("[stage-two] API "+new URL(response.url()).pathname+" "+response.status()+" "+(body.code??"unknown"));}});
  return {context,page};
}
async function request(page,path,method="GET",body) {
  const result=await page.evaluate(async ({base,path,method,body})=>{const r=await fetch(base+path,{method,credentials:"include",headers:{"content-type":"application/json",...(method==="POST"?{"idempotency-key":crypto.randomUUID()}: {})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};},{base:api,path,method,body});
  // Do not include response payloads or headers in assertion diagnostics.
  if(result.status>=400) throw new Error("Local API failed: "+method+" "+path+" "+result.status+" "+result.body.code);
  return result.body;
}
async function login(page) {
  await page.bringToFront();
  await page.goto("/admin");await page.getByLabel("账号").fill(env("E2E_FULL_USERNAME"));await page.getByLabel("密码").fill(env("E2E_FULL_PASSWORD"));await page.getByRole("button",{name:"安全登录"}).click();
  await page.getByLabel("动态验证码").fill(totpCode(env("E2E_TOTP_SECRET")));await page.getByRole("button",{name:"完成验证"}).click();await expect(page.getByRole("heading",{name:"数据总览"})).toBeVisible();
}
async function approvedFiles(admin,seller,purpose) {
  const rows=await request(seller,"/api/v1/me/files?file_type="+purpose+"&limit=100");
  for(const file of rows.items.filter(f=>f.moderation_status==="PENDING")) await request(admin,"/admin-api/v1/files/"+file.id+"/moderation","POST",{decision:"APPROVED",reason:"隔离本地三端自动化人工审核"});
  return rows.items;
}
async function confirmMockRefund(refund,channel) {
  const provider=new MockPaymentProvider(env('E2E_PAYMENT_WEBHOOK_SECRET'));
  const payload={event_id:randomUUID(),event_type:'REFUND_SUCCEEDED',refund_no:refund.refund_no,provider_refund_no:refund.provider_refund_no,amount_cent:refund.approved_amount_cent};
  for(const event of [payload,payload,{...payload,event_id:randomUUID()}]){
    const response=await fetch('http://127.0.0.1:'+env('E2E_API_PORT')+'/callbacks/v1/refunds/'+channel,{method:'POST',headers:{'content-type':'application/json','x-payment-signature':provider.signRefund(event)},body:JSON.stringify(event)});
    expect(response.status).toBe(201);await response.arrayBuffer();
  }
}
async function sellerOrders(page) {await page.bringToFront();await page.locator('nav[aria-label="核心页面"] button').filter({hasText:"陪玩中心"}).click();await page.getByRole("button",{name:"订单",exact:true}).first().click();}
async function closeActors(actors) {
  // A timed-out context can reject unrouteAll. Preserve the original failure and
  // still close every context; global teardown separately verifies database/object cleanup.
  await Promise.allSettled(actors.map(actor=>actor.context.unrouteAll({behavior:"ignoreErrors"})));
  await Promise.allSettled(actors.map(actor=>actor.context.close()));
}

for(const scenario of [
  {title:"三端联调单价商品",channel:"WECHAT_APP",price:"199.99",video:false,game:"PEACE_ELITE"},
  {title:"三端联调多规格商品",channel:"ALIPAY_APP",price:"200.00",video:true,game:"VALORANT"}
]) test("[stage-two Chrome + PostgreSQL + MinIO] "+scenario.channel+" product, evidence and receipt synchronize",async ({browser})=>{
  test.setTimeout(240_000); // Includes real file review, case adjudication, two-party acceptance and review-image UI.
  const seller=await actor(browser,"SELLER"),buyer=await actor(browser,"BUYER"),admin=await actor(browser);
  try {
    await login(admin.page);console.log("[stage-two] admin authenticated");
    await seller.page.bringToFront();await seller.page.goto("/");
    await seller.page.locator('nav[aria-label="核心页面"] button').filter({hasText:"陪玩中心"}).click();
    await seller.page.getByRole("button",{name:"商品管理",exact:true}).click();console.log("[stage-two] seller product editor");
    await seller.page.getByRole("button",{name:/发布商品$/}).click();
    await seller.page.getByLabel("商品标题").fill(scenario.title);
    await seller.page.getByLabel("商品说明").fill("本地隔离数据，付款后开始履约，真实 API 同步订单与文件。");
    await seller.page.getByRole("combobox",{name:"游戏",exact:true}).selectOption(scenario.game);
    await seller.page.getByLabel("支付后完成时限").fill("24");
    if(scenario.video){
      await seller.page.getByRole("combobox",{name:/定价模式/}).selectOption("MULTI");
      for(const [name,price] of [["标准交付",scenario.price],["扩展交付","201.00"]]){
        await seller.page.getByRole("button",{name:"添加规格"}).click();
        await seller.page.getByLabel("规格名称").last().fill(name);await seller.page.getByLabel("规格价格").last().fill(price);
      }
    }else await seller.page.getByLabel("默认价格").fill(scenario.price);
    const gallery=seller.page.locator(".connected-files").filter({has:seller.page.getByRole("heading",{name:"商品图（首张为封面）"})});
    await gallery.locator('input[type="file"]').setInputFiles({name:"stage-two-product.png",mimeType:"image/png",buffer:png});
    await expect(gallery.getByText(/上传、文件校验/)).toBeVisible();console.log("[stage-two] real MinIO upload complete");
    await approvedFiles(admin.page,seller.page,"PRODUCT_IMAGE");
    await gallery.getByRole("button",{name:"刷新人工审核状态"}).click();
    await gallery.locator('input[type="checkbox"]:enabled').first().check();
    await seller.page.getByRole("button",{name:"提交商品审核",exact:true}).click();
    await expect(seller.page.getByRole("alert")).toContainText("已提交商品审核");
    const rows=await request(seller.page,"/api/v1/seller/services?limit=100"),product=rows.find(p=>p.title===scenario.title);
    expect(Boolean(product)).toBe(true);
    await request(admin.page,"/admin-api/v1/products/"+product.id+"/review","POST",{action:"APPROVE",version:product.version,reason:"本地三端商品测试审核"});
    await buyer.page.bringToFront();await buyer.page.goto("/?seller="+env("E2E_STAGE_SELLER_PROFILE_ID"));
    await buyer.page.getByRole("button").filter({hasText:scenario.title}).click();
    await expect(buyer.page.getByText("付款后 24 小时内完成")).toBeVisible();
    await buyer.page.getByRole("button",{name:"立即购买"}).click();
    await buyer.page.getByRole("button",{name:/确认订单/}).click();
    const submit=buyer.page.getByRole("button",{name:"提交订单",exact:true});
    await expect(submit).toBeDisabled();
    await buyer.page.getByRole("checkbox").click();
    await buyer.page.getByRole("button",{name:"确认协议并获取服务端价格"}).click();
    await expect(submit).toBeEnabled();await submit.click();
    await buyer.page.getByRole("button",{name:scenario.channel==="WECHAT_APP"?"微信 App · Mock":"支付宝 App · Mock"}).click();
    await buyer.page.getByRole("button",{name:"创建付款 / 安全重试"}).click();
    const order=(await request(buyer.page,"/api/v1/orders?limit=100")).items[0];
    expect(order.payment_status).not.toBe("PAID");
    await buyer.page.getByRole("button",{name:"模拟成功",exact:true}).click();
    await expect(buyer.page.getByText("支付成功",{exact:true}).first()).toBeVisible();
    let current=await request(buyer.page,"/api/v1/orders/"+order.id);
    expect(current.status).toBe("PENDING_SERVICE");expect(current.service_starts_at).toBeNull();
    await buyer.page.locator('nav[aria-label="核心页面"] button').filter({hasText:"购买订单"}).click();
    await buyer.page.getByRole("button",{name:scenario.title}).click();
    await expect(buyer.page.getByRole("button",{name:"催服务",exact:true})).toBeVisible();
    await expect.poll(()=>buyer.page.locator(".order-detail-product img").evaluate(image=>image.complete&&image.naturalWidth>0&&!image.classList.contains("is-placeholder"))).toBe(true);
    await expect(buyer.page.locator(".order-detail-product em")).toHaveCount(0);
    await buyer.page.getByRole("button",{name:"催服务",exact:true}).click();
    await expect.poll(async()=>Boolean((await request(buyer.page,"/api/v1/orders/"+order.id)).last_reminded_at)).toBe(true);
    current=await request(buyer.page,"/api/v1/orders/"+order.id);
    expect(current.available_actions).not.toContain("REMIND_SELLER");
    const cooldown=await buyer.page.evaluate(async({base,id,version})=>{const response=await fetch(base+"/api/v1/orders/"+id+"/remind",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({version})});return{status:response.status,code:(await response.json()).code};},{base:api,id:order.id,version:current.version});
    expect(cooldown).toEqual({status:409,code:"ORDER_REMIND_RATE_LIMITED"});
    await expect(buyer.page.locator(".fulfillment-panel").getByRole("button",{name:"催服务",exact:true})).toHaveCount(0);
    await sellerOrders(seller.page);
    await seller.page.getByRole("button",{name:scenario.title}).click();
    await expect(seller.page.locator(".seller-order-status")).toContainText("待服务");
    await expect(seller.page.locator(".seller-order-status h2")).not.toContainText("预约");
    await expect.poll(()=>seller.page.locator(".seller-order-product img").evaluate(image=>image.complete&&image.naturalWidth>0&&!image.classList.contains("is-placeholder"))).toBe(true);
    await seller.page.getByRole("button",{name:"开始服务",exact:true}).click();
    await expect(seller.page.getByRole("dialog").getByRole("button",{name:"取消",exact:true})).toBeFocused();
    await seller.page.keyboard.press("Escape");
    await expect(seller.page.getByRole("dialog")).toHaveCount(0);
    expect((await request(seller.page,"/api/v1/seller/orders/"+order.id)).status).toBe("PENDING_SERVICE");
    await seller.page.getByRole("button",{name:"开始服务",exact:true}).click();
    await seller.page.getByRole("dialog").getByRole("button",{name:"确认操作"}).click();
    await expect(seller.page.getByText("操作已由服务端确认")).toBeVisible();
    const upload=seller.page.getByLabel("上传完成截图");
    await upload.setInputFiles(Array.from({length:5},(_,i)=>({name:"stage-proof-"+i+".png",mimeType:"image/png",buffer:proofPng(i+(scenario.video?5:0))})));
    await expect(seller.page.getByText(/格式和哈希校验已完成/)).toBeVisible();
    await expect(seller.page.getByRole("button",{name:"提交完成凭证",exact:true})).toBeDisabled();
    await approvedFiles(admin.page,seller.page,"ORDER_FULFILLMENT_IMAGE");
    await seller.page.getByRole("button",{name:"刷新人工审核状态"}).click();
    const eligibleProofs=seller.page.locator(".fulfillment-panel input[type=checkbox]:enabled");
    await expect(eligibleProofs).toHaveCount(5);
    for(const checkbox of await eligibleProofs.all()) await checkbox.check();
    if(scenario.video){
      await expect(seller.page.getByRole("button",{name:"提交完成凭证",exact:true})).toBeDisabled();
      const bytes=syntheticRecording();
      await seller.page.getByLabel("上传连续录屏").setInputFiles({name:"synthetic-continuous.mp4",mimeType:"video/mp4",buffer:bytes});
      await expect.poll(async()=>{const rows=await request(seller.page,"/api/v1/me/files?file_type=ORDER_FULFILLMENT_VIDEO&limit=100");return rows.items.filter(row=>row.upload_status==="VERIFIED"&&row.moderation_status==="PENDING").length;}).toBe(1);
      const video=(await request(seller.page,"/api/v1/me/files?file_type=ORDER_FULFILLMENT_VIDEO&limit=100")).items[0];
      await admin.page.bringToFront();await admin.page.goto("/admin?module=files");
      const fileRow=admin.page.getByRole("row").filter({hasText:video.id.slice(0,8)+"…"+video.id.slice(-4)});
      await fileRow.getByRole("button",{name:"查看 / 审核"}).click();
      const media=admin.page.locator('video[aria-label="订单连续录屏受控预览"]');
      await expect(media).toBeVisible();await expect.poll(()=>media.evaluate(v=>Number.isFinite(v.duration)&&v.duration>1&&v.videoWidth===64)).toBe(true);
      await media.evaluate(v=>v.play());await expect.poll(()=>media.evaluate(v=>v.currentTime)).toBeGreaterThan(0.15);await media.evaluate(v=>v.pause());
      await admin.page.getByRole("button",{name:"通过文件",exact:true}).click();
      const decision=admin.page.getByRole("dialog",{name:"确认文件审核"});
      await decision.locator("textarea").fill("合成连续录屏本地测试，核验播放与审核交互");
      const continuity=decision.getByRole("checkbox");await expect(continuity).not.toBeChecked();await expect(decision.getByRole("button",{name:"确认提交"})).toBeDisabled();
      await continuity.check();await decision.getByRole("button",{name:"确认提交"}).click();
      await expect(admin.page.getByText("文件已通过审核，结果已写入审计日志。")).toBeVisible();
      for(const [range,status] of [[undefined,200],["bytes=0-63",206],["bytes="+bytes.length+"-",416]]){
        const response=await admin.page.evaluate(async ({base,id,range})=>{const r=await fetch(base+"/admin-api/v1/files/"+id+"/preview",{credentials:"include",headers:range?{Range:range}:{}});await r.arrayBuffer();return{status:r.status,cache:r.headers.get("cache-control"),contentRange:r.headers.get("content-range")};},{base:api,id:video.id,range});
        expect(response.status).toBe(status);expect(response.cache).toContain("no-store");if(status===206)expect(response.contentRange).toBe("bytes 0-63/"+bytes.length);
      }
      await seller.page.bringToFront();await seller.page.getByRole("button",{name:"刷新人工审核状态"}).click();
      const videoChoice=seller.page.locator(".fulfillment-panel label").filter({hasText:video.id.slice(-8)}).getByRole("checkbox");
      await expect(videoChoice).toBeEnabled();await videoChoice.check();
    }
    await seller.page.getByRole("button",{name:"提交完成凭证",exact:true}).click();
    await seller.page.getByRole("dialog").getByRole("button",{name:"确认操作"}).click();
    await expect.poll(async()=>(await request(buyer.page,"/api/v1/orders/"+order.id)).status).toBe("PENDING_BUYER_CONFIRM");
    if(scenario.video){
      await seller.page.getByRole("button",{name:"查看连续录屏",exact:true}).click();
      const sellerMedia=seller.page.locator(".fulfillment-panel video");
      await expect(sellerMedia).toBeVisible();
      await expect.poll(()=>sellerMedia.evaluate(v=>Number.isFinite(v.duration)&&v.duration>1&&v.videoWidth===64)).toBe(true);
      await sellerMedia.evaluate(v=>v.play());await expect.poll(()=>sellerMedia.evaluate(v=>v.currentTime)).toBeGreaterThan(0.15);await sellerMedia.evaluate(v=>v.pause());
    }
    await buyer.page.bringToFront();await buyer.page.locator('nav[aria-label="核心页面"] button').filter({hasText:"购买订单"}).click();
    await buyer.page.getByRole("button",{name:scenario.title}).click();
    await buyer.page.getByRole("button",{name:"查看完成截图"}).first().click();
    await expect(buyer.page.locator(".fulfillment-panel img")).toBeVisible();
    await expect.poll(()=>buyer.page.locator(".fulfillment-panel img").evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    if(scenario.video){
      await buyer.page.getByRole("button",{name:"查看连续录屏",exact:true}).click();
      const buyerMedia=buyer.page.locator(".fulfillment-panel video");
      await expect(buyerMedia).toBeVisible();
      await expect.poll(()=>buyerMedia.evaluate(v=>Number.isFinite(v.duration)&&v.duration>1&&v.videoWidth===64)).toBe(true);
      await buyerMedia.evaluate(v=>v.play());await expect.poll(()=>buyerMedia.evaluate(v=>v.currentTime)).toBeGreaterThan(0.15);await buyerMedia.evaluate(v=>v.pause());
      // A genuine concurrent write, not a mocked 409 response: keep this tab on its old version.
      current=await request(buyer.page,"/api/v1/orders/"+order.id);
      await request(buyer.page,"/api/v1/orders/"+order.id+"/extend-receipt","POST",{version:current.version});
    }
    await buyer.page.getByRole("button",{name:"延长收货 24 小时"}).click();
    await buyer.page.getByRole("dialog").getByRole("button",{name:"确认操作"}).click();
    await expect.poll(async()=>(await request(buyer.page,"/api/v1/orders/"+order.id)).receipt_extension_used).toBe(true);
    if(scenario.video) await expect(buyer.page.locator(".fulfillment-panel").getByRole("alert")).toContainText("已重新读取服务端记录");
    await expect(buyer.page.locator(".fulfillment-panel").getByRole("button",{name:"延长收货 24 小时"})).toHaveCount(0);
    await buyer.page.getByRole("button",{name:"申请售后",exact:true}).click();
    await buyer.page.getByLabel("申请金额（整数分）").fill("100");
    await buyer.page.getByRole("button",{name:"提交退款申请",exact:true}).click();
    await expect(buyer.page.getByRole("heading",{name:"售后案件",exact:true})).toBeVisible();
    const refund=(await request(buyer.page,"/api/v1/refunds?order_id="+order.id+"&limit=20")).items[0];
    await buyer.page.locator('nav[aria-label="核心页面"] button').filter({hasText:"购买订单"}).click();
    await buyer.page.getByRole("button",{name:scenario.title}).click();
    await expect(buyer.page.locator(".fulfillment-panel").getByRole("status")).toContainText("结算暂停");
    await expect(buyer.page.locator(".fulfillment-panel").getByRole("button",{name:"确认收货",exact:true})).toHaveCount(0);
    const frozenOrder=await request(admin.page,"/admin-api/v1/orders/"+order.id);
    expect(frozenOrder.after_sale_status).toBe("IN_PROGRESS");
    await sellerOrders(seller.page);await seller.page.getByRole("button",{name:scenario.title}).click();
    await seller.page.getByRole("button",{name:"查看售后案件 "+refund.id.slice(-8),exact:true}).click();
    const sellerCase=seller.page.getByRole("region",{name:"售后案件"});
    await sellerCase.getByRole("button",{name:"驳回并举证",exact:true}).click();
    await sellerCase.getByLabel("操作说明",{exact:true}).fill("请求平台核验本地合成履约材料");
    const caseFiles=sellerCase.locator('.connected-files');
    await caseFiles.locator('input[type="file"]').setInputFiles({name:"synthetic-case-evidence.png",mimeType:"image/png",buffer:proofPng(6)});
    await expect(caseFiles.getByText(/上传、文件校验/)).toBeVisible();
    await approvedFiles(admin.page,seller.page,"COMPLAINT_EVIDENCE");
    await caseFiles.getByRole("button",{name:"刷新人工审核状态"}).click();
    await caseFiles.locator('input[type="checkbox"]:enabled').first().check();
    await sellerCase.getByRole("button",{name:"核对并准备提交"}).click();await sellerCase.getByRole("button",{name:"确认提交案件操作"}).click();
    await expect(sellerCase.getByRole('heading',{name:'商家已驳回'})).toBeVisible();
    await buyer.page.bringToFront();await buyer.page.getByRole("button",{name:"查看售后案件 "+refund.id.slice(-8),exact:true}).click();
    const buyerCase=buyer.page.getByRole("region",{name:"售后案件"});
    await buyerCase.getByRole("button",{name:"申请平台介入",exact:true}).click();await buyerCase.getByLabel("操作说明",{exact:true}).fill("请求平台核验合成交付");
    await buyerCase.getByRole("button",{name:"核对并准备提交"}).click();await buyerCase.getByRole("button",{name:"确认提交案件操作"}).click();
    await expect(buyerCase.getByRole('heading',{name:'平台处理中'})).toBeVisible();
    await admin.page.bringToFront();await admin.page.goto('/admin?module=refunds&refund_view=cases');
    await admin.page.getByRole('row').filter({hasText:refund.id}).getByRole('button',{name:'查看案件',exact:true}).click();
    const caseDetail=admin.page.getByRole('complementary',{name:'售后案件详情'});
    await caseDetail.getByRole('button',{name:'确认补证结束',exact:true}).click();
    let caseDialog=admin.page.getByRole('dialog');await caseDialog.locator('textarea').fill('本地合成案件材料已核验');await caseDialog.getByRole('button',{name:'确认提交案件操作'}).click();await expect(caseDialog).toHaveCount(0);
    await caseDetail.getByLabel('裁决结果',{exact:true}).selectOption('NO_REFUND');await caseDetail.getByLabel('裁决金额（整数分）',{exact:true}).fill('0');
    for(const label of ['已核验事实','适用规则','责任认定','剩余义务与终止范围','执行条件'])await caseDetail.getByLabel(label,{exact:true}).fill('本地合成材料核验；恢复原案收货，不代表真实争议处理');
    await caseDetail.getByRole('button',{name:'提交裁决',exact:true}).click();caseDialog=admin.page.getByRole('dialog');await caseDialog.locator('textarea').fill('合成材料已核验，等待双方对具体裁决回应');await caseDialog.getByRole('button',{name:'确认提交案件操作'}).click();await expect(caseDialog).toHaveCount(0);
    for(const [participant,panel] of [[buyer,buyerCase],[seller,sellerCase]]){
      await participant.page.bringToFront();await panel.getByRole('button',{name:'重新读取案件',exact:true}).click();await panel.getByRole('button',{name:'接受当前裁决',exact:true}).click();
      await panel.getByRole('button',{name:'核对并准备提交'}).click();await panel.getByRole('button',{name:'确认提交案件操作'}).click();
      await expect(panel.getByRole('status').first()).toContainText('服务端确认');
      if(participant===buyer)expect((await request(buyer.page,'/api/v1/orders/'+order.id)).after_sale_status).toBe('IN_PROGRESS');
    }
    await buyer.page.locator('nav[aria-label="核心页面"] button').filter({hasText:"购买订单"}).click();
    await buyer.page.getByRole("button",{name:scenario.title}).click();
    current=await request(buyer.page,"/api/v1/orders/"+order.id);
    expect(current.after_sale_status).toBe("RESOLVED");expect(current.receipt_extension_used).toBe(true);
    expect(new Date(current.auto_confirm_at).getTime()-Date.now()).toBeGreaterThan(86_390_000);
    expect((await request(buyer.page,"/api/v1/refunds/"+refund.id)).status).toBe("CANCELLED");
    expect((await request(buyer.page,"/api/v1/after-sale/cases/"+refund.id)).state).toBe("S04");
    await buyer.page.getByRole("button",{name:"确认收货",exact:true}).click();
    await buyer.page.getByRole("dialog").getByRole("button",{name:"确认操作"}).click();
    await expect.poll(async()=>(await request(buyer.page,"/api/v1/orders/"+order.id)).status).toBe("COMPLETED");
    const adminOrder=await request(admin.page,"/admin-api/v1/orders/"+order.id);
    expect(adminOrder.status).toBe("COMPLETED");expect(adminOrder.fulfillment_evidence.length).toBe(scenario.video?6:5);
    expect(adminOrder.receipt_extension_used).toBe(true);
    const snapshot=record=>Object.fromEntries(["id","version","status","payment_status","paid_amount_cent","fulfillment_due_at","auto_confirm_at","receipt_extension_used","after_sale_status","fulfillment_evidence"].map(key=>[key,record[key]]));
    for(const [actor,path] of [[buyer,"/api/v1/orders/"],[seller,"/api/v1/seller/orders/"]])expect(snapshot(await request(actor.page,path+order.id))).toEqual(snapshot(adminOrder));
    expect(adminOrder.paid_amount_cent).toBe(scenario.video?"20000":"19999");
    await buyer.page.getByRole('button',{name:'去评价',exact:true}).click();await buyer.page.getByRole('button',{name:'5星',exact:true}).click();
    await buyer.page.getByLabel('匿名展示评价').check();
    const reviewFiles=buyer.page.locator('.connected-files').filter({has:buyer.page.getByRole('heading',{name:'评价图片',exact:true})});
    await reviewFiles.locator('input[type="file"]').setInputFiles({name:'synthetic-review.png',mimeType:'image/png',buffer:proofPng(10)});
    await expect(reviewFiles.getByText(/上传、文件校验/)).toBeVisible();await expect(reviewFiles.locator('input[type="checkbox"]').first()).toBeDisabled();
    await approvedFiles(admin.page,buyer.page,'REVIEW_IMAGE');await reviewFiles.getByRole('button',{name:'刷新人工审核状态'}).click();await reviewFiles.locator('input[type="checkbox"]:enabled').first().check();
    await buyer.page.getByRole('button',{name:'发布评价',exact:true}).click();
    const visibleReview=buyer.page.getByRole('region',{name:'评价图片'}).getByRole('img');await expect(visibleReview).toBeVisible();await expect.poll(()=>visibleReview.evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    const review=(await request(buyer.page,'/api/v1/reviews/me?order_id='+order.id+'&limit=20')).items[0];expect(review.anonymous).toBe(true);expect(review.images).toHaveLength(1);
    await request(admin.page,'/admin-api/v1/reviews/'+review.id+'/moderation','POST',{action:'HIDE',version:review.version,reason:'本地合成评价隐藏权限回归'});
    const hiddenStatus=await buyer.page.evaluate(async({base,path})=>(await fetch(base+path,{credentials:'include',cache:'no-store'})).status,{base:api,path:review.images[0].content_path});expect(hiddenStatus).toBe(404);
    // A second actual purchase exercises a channel-success refund, not merely a no-refund adjudication.
    await buyer.page.goto('/?seller='+env('E2E_STAGE_SELLER_PROFILE_ID'));await buyer.page.getByRole('button').filter({hasText:scenario.title}).click();
    await buyer.page.getByRole('button',{name:'立即购买',exact:true}).click();await buyer.page.getByRole('button',{name:/确认订单/}).click();
    await buyer.page.getByRole('checkbox').check();await buyer.page.getByRole('button',{name:'确认协议并获取服务端价格'}).click();await buyer.page.getByRole('button',{name:'提交订单',exact:true}).click();
    await buyer.page.getByRole('button',{name:scenario.channel==='WECHAT_APP'?'微信 App · Mock':'支付宝 App · Mock'}).click();await buyer.page.getByRole('button',{name:'创建付款 / 安全重试'}).click();await buyer.page.getByRole('button',{name:'模拟成功',exact:true}).click();
    const refundable=(await request(buyer.page,'/api/v1/orders?limit=100')).items[0];expect(refundable.id).not.toBe(order.id);
    await buyer.page.locator('nav[aria-label="核心页面"] button').filter({hasText:'购买订单'}).click();await buyer.page.getByRole('button',{name:scenario.title}).first().click();
    await buyer.page.getByRole('button',{name:'申请售后',exact:true}).click();await buyer.page.getByRole('button',{name:'提交退款申请',exact:true}).click();
    const secondCase=buyer.page.getByRole('region',{name:'售后案件'});await expect(secondCase.getByRole('heading',{name:'待商家处理'})).toBeVisible();
    const secondRefund=(await request(buyer.page,'/api/v1/refunds?order_id='+refundable.id+'&limit=20')).items[0];
    await sellerOrders(seller.page);await seller.page.getByRole('button',{name:scenario.title}).first().click();await seller.page.getByRole('button',{name:'查看售后案件 '+secondRefund.id.slice(-8),exact:true}).click();
    const approval=seller.page.getByRole('region',{name:'售后案件'});await approval.getByRole('button',{name:'同意退款',exact:true}).click();await approval.getByLabel('操作说明',{exact:true}).fill('本地合成交易同意全额原渠道退款');await approval.getByRole('button',{name:'核对并准备提交'}).click();await approval.getByRole('button',{name:'确认提交案件操作'}).click();
    await expect.poll(async()=>(await request(buyer.page,'/api/v1/after-sale/cases/'+secondRefund.id)).state).toBe('F01');
    // No shared worker is started: the isolated Mock channel sends real signed callback HTTP requests.
    await confirmMockRefund(await request(buyer.page,'/api/v1/refunds/'+secondRefund.id),scenario.channel);
    await expect.poll(async()=>(await request(buyer.page,'/api/v1/after-sale/cases/'+secondRefund.id)).state).toBe('F02');
    await buyer.page.bringToFront();await secondCase.getByRole('button',{name:'重新读取案件'}).click();await expect(secondCase.getByRole('heading',{name:'实际退款已完成'})).toBeVisible();
    const refunded=await request(buyer.page,'/api/v1/refunds/'+secondRefund.id),refundedOrder=await request(buyer.page,'/api/v1/orders/'+refundable.id);
    expect(refunded.status).toBe('REFUNDED');expect(refunded.approved_amount_cent).toBe(refundable.payable_amount_cent);expect(refundedOrder.refunded_amount_cent).toBe(refundable.payable_amount_cent);
    expect(refundedOrder.payments.find(payment=>payment.id===refunded.payment_id).channel).toBe(scenario.channel);
    const balance=await request(seller.page,'/api/v1/seller/finance/summary');expect(balance.after_sale_held_cent).toBe('0');expect(balance.pending_recovery_cent).toBe('0');
    for(const actor of [buyer,seller]) expect(await actor.page.evaluate(()=>Object.entries(localStorage).some(([k,v])=>/token|runtime-only|X-Amz-Signature/i.test(k+v)))).toBe(false);
  } finally {await closeActors([buyer,seller,admin]);}
});

test("[stage-two Chrome isolated sessions] Web onboarding saves a minimal draft and binds a real manually-reviewed local avatar",async({browser})=>{
  const buyer=await actor(browser,"BUYER"),admin=await actor(browser);
  try{
    await login(admin.page);await buyer.page.goto("/");await buyer.page.bringToFront();
    await buyer.page.getByRole("navigation",{name:"买家端主导航"}).getByRole("button",{name:"我的",exact:true}).click();
    // Current approved identity entry lives under settings; still traverse the real qualification guard.
    await buyer.page.getByRole("button",{name:"设置",exact:true}).click();await buyer.page.getByRole("button",{name:/切换身份/}).click();await buyer.page.getByRole("button",{name:"申请入驻成为卖家",exact:true}).click();
    await expect(buyer.page.locator('header[aria-label="申请开设店铺"]')).toBeVisible();
    await expect(buyer.page.getByRole("textbox",{name:"店铺名称",exact:true})).toBeVisible();
    await buyer.page.locator("#seller-nickname").fill("本地三端入驻草稿");await buyer.page.getByRole("button",{name:"保存草稿",exact:true}).click();
    await expect(buyer.page.getByRole("status").filter({hasText:"草稿已保存，尚未提交审核"})).toBeVisible();
    const first=await request(buyer.page,"/api/v1/seller/profile");expect(first.status).toBe("DRAFT");expect(first.voice_file_id).toBeNull();expect(first.kd).toBeNull();
    await buyer.page.locator(".apply-media-upload").first().click();const picker=buyer.page.getByRole("dialog",{name:"编辑头像",exact:true});
    await picker.locator('input[type="file"]').setInputFiles({name:"local-onboarding.png",mimeType:"image/png",buffer:proofPng(2)});
    await expect(picker.getByRole("button",{name:"上传裁剪后的图片",exact:true})).toBeEnabled();await picker.getByRole("button",{name:"上传裁剪后的图片",exact:true}).click();
    await expect(picker.getByText("图片审核中",{exact:true})).toBeVisible();await expect(picker.getByRole("button",{name:"选用",exact:true})).toBeDisabled();
    // Synthetic test artwork only: use the existing admin moderation API, not an external scanner.
    const files=await approvedFiles(admin.page,buyer.page,"SELLER_AVATAR");expect(files.length).toBe(1);
    await picker.getByRole("button",{name:"刷新状态",exact:true}).click();await expect(picker.getByRole("button",{name:"选用",exact:true})).toBeEnabled();await picker.getByRole("button",{name:"选用",exact:true}).click();
    await buyer.page.locator("#seller-introduction").fill("本地三端入驻与真实文件绑定测试");await buyer.page.getByRole("button",{name:"下一步",exact:true}).click();await buyer.page.getByRole("checkbox",{name:"和平精英",exact:true}).check();
    const saved=buyer.page.waitForResponse(response=>response.url().endsWith("/api/v1/seller/profile")&&response.request().method()==="PATCH"&&response.status()===200);
    await buyer.page.getByRole("button",{name:"保存草稿",exact:true}).click();await saved;
    await expect(buyer.page.getByRole("status").filter({hasText:"草稿已保存，尚未提交审核"})).toBeVisible();
    const profile=await request(buyer.page,"/api/v1/seller/profile");expect(profile.version).toBeGreaterThan(first.version);expect(profile.seller_avatar_file_id).toBe(files[0].id);expect(profile.voice_file_id).toBeNull();
    const adminProfile=await request(admin.page,"/admin-api/v1/sellers/"+profile.id);expect(adminProfile.current_public_profile.seller_avatar_file_id).toBe(files[0].id);
    await buyer.page.screenshot({path:"test-results/admin-browser/web-onboarding-real-draft.png",fullPage:false});
  }finally{await closeActors([buyer,admin]);}
});

test("[stage-two Chrome] legacy V3.1 booking retains appointment and accept semantics",async({browser})=>{
  const buyer=await actor(browser,"LEGACY_BUYER"),seller=await actor(browser,"LEGACY_SELLER"),admin=await actor(browser);
  try{
    await buyer.page.bringToFront();await buyer.page.goto("/");
    await buyer.page.locator('nav[aria-label="核心页面"] button').filter({hasText:"购买订单"}).click();
    await buyer.page.getByRole("button",{name:"隔离旧预约订单"}).click();
    const current=await request(buyer.page,"/api/v1/orders/"+env("E2E_STAGE_LEGACY_ORDER_ID"));
    expect(current.rule_version).toBe("V3.1");expect(current.fulfillment_seconds).toBeNull();
    expect(current.status).toBe("PENDING_ACCEPT");expect(current.service_starts_at).toBeTruthy();
    await expect(buyer.page.locator(".fulfillment-panel")).toHaveCount(0);
    await expect(buyer.page.getByText("等待陪玩接单",{exact:true})).toBeVisible();
    const appointment = await buyer.page.evaluate(value=>new Date(value).toLocaleString("zh-CN"),current.service_starts_at); await expect(buyer.page.locator(".order-detail-product em")).toHaveText(appointment);
    await seller.page.goto("/");await sellerOrders(seller.page);
    await seller.page.getByRole("button",{name:"隔离旧预约订单"}).click();
    await expect(seller.page.locator(".fulfillment-panel")).toHaveCount(0);
    await login(admin.page);
    const adminOrder=await request(admin.page,"/admin-api/v1/orders/"+current.id);
    expect(adminOrder.fulfillment_seconds).toBeNull();expect(adminOrder.service_starts_at).toBe(current.service_starts_at);
  }finally{await closeActors([buyer,seller,admin]);}
});
