import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import pg from "pg";
import { createDatabaseClient, validateLocalTestDatabaseUrl } from "@xiongzai/database";
import { issueAccessToken } from "@xiongzai/auth";
import { OrderJobProcessor, ORDER_JOB_TYPES } from "@xiongzai/application";
import { productGames } from "@xiongzai/contracts";
import { JsonLogger } from "@xiongzai/observability";
import { createApiApp, loadApiConfig, SensitiveDataProtector } from "../dist/index.js";
import { MockPaymentProvider } from "../dist/payment-provider.js";

const databaseUrl = process.env.TEST_DATABASE_URL ? validateLocalTestDatabaseUrl(process.env.TEST_DATABASE_URL) : undefined;
const schema = `xiongzai_stage_one_${randomUUID().replaceAll("-", "")}`;
const logs = [];
let client, database, app, seller, buyer, stranger, admin, sellerId, policyId;
const catalog = new Map();
const config = loadApiConfig({ NODE_ENV:"test",DATABASE_URL:databaseUrl ?? "postgresql://test:test@127.0.0.1/test",USER_TOKEN_SECRET:"stage-one-user-key-at-least-32-bytes",ADMIN_TOKEN_SECRET:"stage-one-admin-key-at-least-32-bytes",INTERNAL_TOKEN_SECRET:"stage-one-internal-key-at-least-32-bytes",CURSOR_SIGNING_SECRET:"stage-one-cursor-key-at-least-32-bytes",PII_ENCRYPTION_KEY:"stage-one-encryption-key-at-least-32",PII_HMAC_KEY:"stage-one-pii-hmac-key-at-least-32-bytes",AUTH_HMAC_KEY:"stage-one-auth-hmac-key-at-least-32",SMS_PROVIDER_MODE:"development",PAYMENT_PROVIDER_MODE:"mock",PAYOUT_PROVIDER_MODE:"mock" });

before(async()=>{
  if(!databaseUrl) return;
  client=new pg.Client({connectionString:databaseUrl}); await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}",public`);
  const journal=JSON.parse(await readFile(new URL("../../../packages/database/migrations/meta/_journal.json",import.meta.url),"utf8"));
  for(const entry of journal.entries){const source=(await readFile(new URL(`../../../packages/database/migrations/${entry.tag}.sql`,import.meta.url),"utf8")).replaceAll('"public".',`"${schema}".`);for(const statement of source.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean))await client.query(statement);}
  database=createDatabaseClient({connectionString:databaseUrl,application_name:"stage-one-e2e",options:`-c search_path=${schema},public`,max:8});
  const storage={copyObject:async()=>{},deleteObject:async()=>{},createDownloadUrl:async()=>({url:"http://127.0.0.1:9000/test-evidence?runtime-only=1",expiresAt:new Date(Date.now()+300000)})};
  app=await createApiApp({config,databaseClient:database,objectStorageProvider:storage,logger:new JsonLogger("stage-one-test",line=>logs.push(line))});
  seller=await user(true); buyer=await user(true); stranger=await user(false); admin=await seedAdmin();
  sellerId=randomUUID();await client.query("INSERT INTO seller_profiles(id,user_id,status,seller_nickname,accepting_orders,approved_at) VALUES($1,$2,'APPROVED','多游戏测试店铺',true,now())",[sellerId,seller.id]);
  policyId=randomUUID();await client.query("INSERT INTO policy_versions(id,policy_type,title,content,version_no,status,published_at,effective_at,created_by_admin_id) VALUES($1,'ORDER_PAYMENT_REFUND_RULES','本地交易草案','无电子签，本地测试',1,'PUBLISHED',now(),now(),$2)",[policyId,admin.id]);
  await client.query("INSERT INTO user_policy_acceptances(user_id,policy_version_id,acceptance_scene,confirmation_method,ip,user_agent) VALUES($1,$2,'ORDER_PAYMENT','ONLINE_CONFIRM','127.0.0.1','test')",[buyer.id,policyId]);
  for(const [key,value] of [["order.payment_timeout_seconds",300],["order.accept_timeout_seconds",300],["order.auto_confirm_seconds",300],["finance.commission_rate_bps",1200],["finance.settlement_delay_seconds",0]])await client.query("INSERT INTO platform_configs(id,config_key,value_json,version_no,status,effective_at,created_by_admin_id) VALUES($1,$2,$3,1,'ACTIVE',now(),$4)",[randomUUID(),key,{value},admin.id]);
});
after(async()=>{await app?.close();if(client){await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await client.end();}});

test("第一阶段：商品发布审核及新订单 API/PostgreSQL 闭环",{skip:!databaseUrl},async t=>{
  await t.test("四游戏、默认单价、首图与详情图保存，不强制段位声音或商品类型",async()=>{
    for(const game of productGames){
      const cover=await file("PRODUCT_IMAGE");
      const created=ok(await request(seller,"POST","/api/v1/seller/services",{game,title:`测试商品 ${game}`,description:"通过聊天沟通具体需求，按描述完成交付",fulfillment_seconds:604800,price_cent:"19995",cover_file_id:cover}));
      assert.equal(created.pricing_mode,"SINGLE");assert.equal(created.game,game);assert.equal(created.min_price_cent,"19995");
      const detail=ok(await request(seller,"GET",`/api/v1/seller/services/${created.id}`));assert.equal(detail.skus.length,1);assert.equal(detail.skus[0].duration_minutes,null);
      const gallery=await file("PRODUCT_IMAGE"), description=await file("PRODUCT_IMAGE");
      ok(await request(seller,"PUT",`/api/v1/seller/services/${created.id}/images`,{version:created.version,images:[{file_id:cover,sort_order:0,is_cover:true},{file_id:gallery,sort_order:1},{file_id:description,sort_order:2,image_kind:"DETAIL"}]}));
      const current=ok(await request(seller,"GET",`/api/v1/seller/services/${created.id}`));
      const submitted=ok(await request(seller,"POST",`/api/v1/seller/services/${created.id}/submit-review`,{version:current.version}));
      const edit=await request(seller,"PATCH",`/api/v1/seller/services/${created.id}/skus/${detail.skus[0].id}`,{version:0,price_cent:"1"});assert.equal(edit.statusCode,409);
      const published=ok(await request(admin,"POST",`/admin-api/v1/products/${created.id}/review`,{action:"APPROVE",version:submitted.version}));
      const publicDetail=ok(await request(null,"GET",`/api/v1/services/${created.id}`));assert.equal(publicDetail.game,game);assert.equal(publicDetail.images[2].image_kind,"DETAIL");
      assert.equal(publicDetail.skus[0].price_cent,"19995");catalog.set(game,{...published,skuId:detail.skus[0].id});
    }
    const filter=ok(await request(null,"GET","/api/v1/services?game=VALORANT"));assert.equal(filter.items.length,1);assert.equal(filter.items[0].game,"VALORANT");
  });
  await t.test("商品图片归属、用途、未审核文件、期限与首图顺序拒绝",async()=>{
    const p=catalog.get(productGames[0]);
    const off=ok(await request(seller,"POST",`/api/v1/seller/services/${p.id}/off-sale`,{version:p.version}));
    const unauthorized=await request(stranger,"PATCH",`/api/v1/seller/services/${p.id}`,{title:"越权修改商品",description:"不应该可以覆盖他人商品",version:off.version});assert.ok([403,404].includes(unauthorized.statusCode));
    for(const id of [await file("PRODUCT_IMAGE",stranger),await file("ORDER_FULFILLMENT_IMAGE"),await file("PRODUCT_IMAGE",seller,"PENDING")]){
      assert.equal((await request(seller,"PUT",`/api/v1/seller/services/${p.id}/images`,{version:off.version,images:[{file_id:id,sort_order:0,is_cover:true}]})).statusCode,400);
    }
    const image=await file("PRODUCT_IMAGE");assert.equal((await request(seller,"PUT",`/api/v1/seller/services/${p.id}/images`,{version:off.version,images:[{file_id:image,sort_order:1,is_cover:true},{file_id:await file("PRODUCT_IMAGE"),sort_order:0}]})).statusCode,400);
    assert.equal((await request(seller,"POST","/api/v1/seller/services",{game:"VALORANT",title:"不合法超期商品",description:"超过七天，不得发布",fulfillment_seconds:604801,price_cent:"1"})).statusCode,400);
    assert.equal((await request(null,"GET",`/api/v1/services/${p.id}`)).statusCode,409);
    const submitted=ok(await request(seller,"POST",`/api/v1/seller/services/${p.id}/submit-review`,{version:off.version}));p.version=ok(await request(admin,"POST",`/admin-api/v1/products/${p.id}/review`,{action:"APPROVE",version:submitted.version})).version;
  });
  await t.test("下架编辑封面与价格生成新审核版本，历史下单快照不被覆盖",async()=>{
    const p=catalog.get("HONOR_OF_KINGS"), oldOrder=await create("HONOR_OF_KINGS");
    const off=ok(await request(seller,"POST",`/api/v1/seller/services/${p.id}/off-sale`,{version:p.version}));
    const cover=await file("PRODUCT_IMAGE"), edited=ok(await request(seller,"PATCH",`/api/v1/seller/services/${p.id}`,{version:off.version,title:p.title,description:p.description,price_cent:"19996",cover_file_id:cover}));
    assert.equal(edited.min_price_cent,"19996");
    const detail=ok(await request(seller,"GET",`/api/v1/seller/services/${p.id}`));assert.equal(detail.images.filter(i=>i.image_kind==="GALLERY")[0].file_id,cover);assert.equal(detail.skus[0].price_cent,"19996");
    assert.equal((await request(null,"GET",`/api/v1/services/${p.id}`)).statusCode,409);
    const submitted=ok(await request(seller,"POST",`/api/v1/seller/services/${p.id}/submit-review`,{version:edited.version}));p.version=ok(await request(admin,"POST",`/admin-api/v1/products/${p.id}/review`,{action:"APPROVE",version:submitted.version})).version;
    assert.equal(ok(await request(buyer,"GET",`/api/v1/orders/${oldOrder.id}`)).sku_price_cent,"19995");
    assert.equal((await request(buyer,"POST","/api/v1/orders",{product_id:p.id,quantity:1,expected_payable_amount_cent:"19995"},`changed-${randomUUID()}`)).json().code,"ORDER_PRICE_CHANGED");
    const versions=await client.query("SELECT snapshot_json FROM product_versions WHERE product_id=$1 ORDER BY version_no",[p.id]);assert.equal(versions.rows[0].snapshot_json.product.min_price_cent,"19995");assert.equal(versions.rows[1].snapshot_json.product.min_price_cent,"19996");
  });
  await t.test("多规格使用已有 SKU 能力；不要求旧服务时长，必须选有效 SKU",async()=>{
    const p=catalog.get("DELTA_FORCE");let off=ok(await request(seller,"POST",`/api/v1/seller/services/${p.id}/off-sale`,{version:p.version}));
    const sku=ok(await request(seller,"POST",`/api/v1/seller/services/${p.id}/skus`,{sku_name:"另一规格",price_cent:"20000"}));assert.equal(sku.duration_minutes,null);
    off=ok(await request(seller,"GET",`/api/v1/seller/services/${p.id}`));const submitted=ok(await request(seller,"POST",`/api/v1/seller/services/${p.id}/submit-review`,{version:off.version}));p.version=ok(await request(admin,"POST",`/admin-api/v1/products/${p.id}/review`,{action:"APPROVE",version:submitted.version})).version;p.secondSkuId=sku.id;
    assert.equal((await request(buyer,"POST","/api/v1/orders/preview",{product_id:p.id,quantity:1})).json().code,"ORDER_SKU_REQUIRED");
    assert.equal((await request(buyer,"POST","/api/v1/orders/preview",{product_id:p.id,sku_id:randomUUID(),quantity:1})).json().code,"ORDER_SKU_UNAVAILABLE");
  });
  await t.test("卖家经营统计聚合真实订单，双渠道重试不重复，退款另列且不能越权",async()=>{
    const path="/api/v1/seller/finance/business-statistics?period=ALL";
    const read=async()=>ok(await request(seller,"GET",path));
    const before=await read();
    assert.equal(before.attribution,"ORDER_CREATED_AT");
    assert.equal(before.timezone,"Asia/Shanghai");
    assert.equal(before.start_at,null);
    let amount=0n;
    for(const channel of ["WECHAT_APP","ALIPAY_APP"]){
      const order=await create("PEACE_ELITE");
      const unpaid=await read();
      assert.equal(BigInt(unpaid.paid_amount_cent),BigInt(before.paid_amount_cent)+amount);
      const paid=await pay(order,channel);amount+=BigInt(paid.paid_amount_cent);
    }
    const paid=await read();
    assert.equal(BigInt(paid.created_order_count),BigInt(before.created_order_count)+2n);
    assert.equal(BigInt(paid.paid_order_count),BigInt(before.paid_order_count)+2n);
    assert.equal(BigInt(paid.paid_amount_cent),BigInt(before.paid_amount_cent)+amount);
    assert.equal(paid.refunded_amount_cent,before.refunded_amount_cent);
    assert.equal((await request(null,"GET",path)).statusCode,401);
    assert.equal((await request(buyer,"GET",path)).statusCode,404);
    assert.equal((await request(seller,"GET",path+`&seller_id=${randomUUID()}`)).statusCode,400);
    assert.equal((await request(seller,"GET","/api/v1/seller/finance/business-statistics?period=INVALID")).statusCode,400);
    for(const period of ["TODAY","YESTERDAY","WEEK","MONTH","YEAR"]){
      const response=await request(seller,"GET",`/api/v1/seller/finance/business-statistics?period=${period}`);
      assert.equal(response.statusCode,200);
      assert.equal(response.headers["cache-control"],"no-store, private");
      assert.equal(response.json().period,period);
      for(const field of ["created_order_count","paid_order_count","paid_amount_cent","refunded_amount_cent"])assert.match(response.json()[field],/^\d+$/u);
    }
  });
  await t.test("新单免预约、免接单、明确规则快照，佣金10%整数分四舍五入",async()=>{
    const p=catalog.get("PEACE_ELITE"), draft={product_id:p.id,quantity:1};
    const preview=ok(await request(buyer,"POST","/api/v1/orders/preview",draft));assert.equal(preview.rule_version,"V3.1");assert.equal(preview.platform_fee_cent,"2000");assert.equal(preview.service_starts_at,null);
    const key=`order-${randomUUID()}`, created=ok(await request(buyer,"POST","/api/v1/orders",draft,key));const replay=ok(await request(buyer,"POST","/api/v1/orders",draft,key));assert.equal(replay.id,created.id);assert.equal(created.transaction_policy_version_id,policyId);
    const reserved=await client.query("SELECT count(*)::int AS count FROM order_slot_reservations WHERE order_id=$1",[created.id]);assert.equal(reserved.rows[0].count,0);
    const paid=await pay(created,"WECHAT_APP");assert.equal(paid.status,"PENDING_SERVICE");assert.equal(new Date(paid.fulfillment_due_at)-new Date((await client.query("SELECT paid_at FROM orders WHERE id=$1",[paid.id])).rows[0].paid_at),604800000);
    assert.equal((await request(seller,"POST",`/api/v1/seller/orders/${paid.id}/accept`,{version:paid.version})).statusCode,409);
    assert.equal((await request(seller,"POST",`/api/v1/seller/orders/${paid.id}/reject`,{version:paid.version,reason:"新单禁止拒单"})).statusCode,409);
    const jobs=await client.query("SELECT count(*)::int AS count FROM scheduled_jobs WHERE target_id=$1 AND job_type='ORDER_ACCEPT_TIMEOUT'",[paid.id]);assert.equal(jobs.rows[0].count,0);
    assert.equal(await new OrderJobProcessor(database.db).process(ORDER_JOB_TYPES.ACCEPT_TIMEOUT,paid.id,"legacy-job"),false);
    assert.equal((await request(buyer,"POST","/api/v1/orders/preview",{...draft,slot_id:randomUUID()})).json().code,"ORDER_LEGACY_FIELDS_NOT_ALLOWED");
  });
  await t.test("实名、成年、协议、价格变化、下架和商品归属门禁",async()=>{
    const p=catalog.get("VALORANT"),draft={product_id:p.id,quantity:1};
    assert.equal((await request(stranger,"POST","/api/v1/orders/preview",draft)).json().code,"ORDER_IDENTITY_REQUIRED");
    const young=await user(true,true);assert.equal((await request(young,"POST","/api/v1/orders/preview",draft)).json().code,"ORDER_ADULT_VERIFICATION_REQUIRED");
    const adult=await user(true);assert.equal((await request(adult,"POST","/api/v1/orders/preview",draft)).json().code,"POLICY_ACCEPTANCE_REQUIRED");
    assert.equal((await request(seller,"POST","/api/v1/orders/preview",draft)).json().code,"ORDER_PARTIES_SAME");
    assert.equal((await request(buyer,"POST","/api/v1/orders",{...draft,expected_payable_amount_cent:"1"},`price-${randomUUID()}`)).json().code,"ORDER_PRICE_CHANGED");
    const created=await create("VALORANT");await client.query("UPDATE products SET status='OFF_SALE' WHERE id=$1",[p.id]);try{assert.equal((await request(buyer,"POST","/api/v1/payments",{order_id:created.id,payment_channel:"WECHAT_APP"},`off-${randomUUID()}`)).json().code,"ORDER_SERVICE_UNAVAILABLE");}finally{await client.query("UPDATE products SET status='ON_SALE' WHERE id=$1",[p.id]);}
  });
  for(const channel of ["WECHAT_APP","ALIPAY_APP"])await t.test(`${channel} 支付查询、失败重试、重复回调、关闭与原渠道保留`,async()=>{
    const created=await create("VALORANT"), key=`payment-${randomUUID()}`;
    let payment=ok(await request(buyer,"POST","/api/v1/payments",{order_id:created.id,payment_channel:channel},key));assert.equal(payment.channel,channel);
    assert.equal(ok(await request(buyer,"POST",`/api/v1/payments/${payment.id}/query`)).payment.channel,channel);
    assert.equal(ok(await request(buyer,"POST","/api/v1/payments",{order_id:created.id,payment_channel:channel},key)).id,payment.id);
    ok(await request(buyer,"POST",`/api/v1/payments/${payment.id}/mock-fail`));
    payment=ok(await request(buyer,"POST","/api/v1/payments",{order_id:created.id,payment_channel:channel},`retry-${randomUUID()}`));
    const first=ok(await request(buyer,"POST",`/api/v1/payments/${payment.id}/mock-confirm`));assert.equal(first.order.status,"PENDING_SERVICE");
    ok(await request(buyer,"POST",`/api/v1/payments/${payment.id}/mock-confirm`));assert.equal(ok(await request(buyer,"GET",`/api/v1/orders/${created.id}`)).version,first.order.version);
    const another=await create("VALORANT");payment=ok(await request(buyer,"POST","/api/v1/payments",{order_id:another.id,payment_channel:channel},`cancel-${randomUUID()}`));assert.equal(ok(await request(buyer,"POST",`/api/v1/payments/${payment.id}/mock-cancel`)).status,"CLOSED");assert.equal((await request(buyer,"POST",`/api/v1/payments/${payment.id}/mock-confirm`)).statusCode,409);
  });
  await t.test("新订单付款幂等键不能跨渠道或跨订单复用，拒绝后原付款仍可安全重试",async()=>{
    for(const channel of ["WECHAT_APP","ALIPAY_APP"]){
      const order=await create("VALORANT"),other=await create("VALORANT"),key=`channel-bound-${randomUUID()}`;
      const payment=ok(await request(buyer,"POST","/api/v1/payments",{order_id:order.id,payment_channel:channel},key));
      const alternate=channel==="WECHAT_APP"?"ALIPAY_APP":"WECHAT_APP";
      for(const input of [{order_id:order.id,payment_channel:alternate},{order_id:other.id,payment_channel:channel}]){
        const conflict=await request(buyer,"POST","/api/v1/payments",input,key);
        assert.equal(conflict.statusCode,409);
        assert.equal(conflict.json().code,"PAYMENT_IDEMPOTENCY_CONFLICT");
      }
      const replay=ok(await request(buyer,"POST","/api/v1/payments",{order_id:order.id,payment_channel:channel},key));
      assert.equal(replay.id,payment.id);assert.equal(replay.channel,channel);
      const rows=(await client.query("SELECT id,order_id,channel FROM payments WHERE order_id=ANY($1::uuid[])",[[order.id,other.id]])).rows;
      assert.equal(rows.length,1);assert.equal(rows[0].id,payment.id);assert.equal(rows[0].channel,channel);
      const paid=ok(await request(buyer,"POST",`/api/v1/payments/${payment.id}/mock-confirm`));
      assert.equal(paid.order.status,"PENDING_SERVICE");
      const untouched=ok(await request(buyer,"GET",`/api/v1/orders/${other.id}`));
      assert.equal(untouched.payment_status,"CREATED");assert.equal(untouched.status,"PENDING_PAYMENT");
      assert.equal(untouched.version,other.version);assert.equal(untouched.paid_amount_cent,"0");
    }
  });
  await t.test("截图数量与199.95/200元录屏边界、文件用途和归属",async()=>{
    const paid=await paidOrder("PEACE_ELITE"), started=await start(paid);const images=await evidence();
    assert.equal((await complete(started,images.slice(0,4))).statusCode,400);
    assert.equal((await complete(started,[...images.slice(0,4),await file("PRODUCT_IMAGE")])).json().code,"ORDER_EVIDENCE_INVALID");
    assert.equal((await complete(started,[...images.slice(0,4),await file("ORDER_FULFILLMENT_IMAGE",buyer)])).json().code,"ORDER_EVIDENCE_INVALID");
    const finished=ok(await complete(started,images));assert.equal(finished.status,"PENDING_BUYER_CONFIRM");assert.ok(Math.abs(new Date(finished.auto_confirm_at)-Date.now()-72*3600000)<10000);
    const high=await paidOrder("DELTA_FORCE","ALIPAY_APP",catalog.get("DELTA_FORCE").secondSkuId), highStart=await start(high), highImages=await evidence();
    assert.equal((await complete(highStart,highImages)).json().code,"ORDER_EVIDENCE_VIDEO_REQUIRED");
    const video=await file("ORDER_FULFILLMENT_VIDEO");assert.equal(ok(await complete(highStart,[...highImages,video])).status,"PENDING_BUYER_CONFIRM");
  });
  await t.test("一次24小时延期、过期版本任务失效、24小时催促冷却",async()=>{
    let paid=await paidOrder("PEACE_ELITE");paid=ok(await request(buyer,"POST",`/api/v1/orders/${paid.id}/remind`,{version:paid.version}));assert.equal((await request(buyer,"POST",`/api/v1/orders/${paid.id}/remind`,{version:paid.version})).json().code,"ORDER_REMIND_RATE_LIMITED");
    const receipt=ok(await complete(await start(paid),await evidence()));const before=receipt.auto_confirm_at;
    const extended=ok(await request(buyer,"POST",`/api/v1/orders/${receipt.id}/extend-receipt`,{version:receipt.version}));assert.equal(new Date(extended.auto_confirm_at)-new Date(before),86400000);assert.equal(extended.receipt_extension_used,true);
    assert.equal((await request(buyer,"POST",`/api/v1/orders/${receipt.id}/extend-receipt`,{version:extended.version})).json().code,"ORDER_EXTENSION_EXHAUSTED");
    await client.query("UPDATE orders SET auto_confirm_at=now()-interval '1 second' WHERE id=$1",[receipt.id]);const processor=new OrderJobProcessor(database.db);
    assert.equal(await processor.process(ORDER_JOB_TYPES.AUTO_CONFIRM,receipt.id,"old-version",{order_version:receipt.version,deadline_at:before}),false);
    const deadline=(await client.query("SELECT auto_confirm_at FROM orders WHERE id=$1",[receipt.id])).rows[0].auto_confirm_at.toISOString();
    assert.equal(await processor.process(ORDER_JOB_TYPES.AUTO_CONFIRM,receipt.id,"current-version",{order_version:extended.version,deadline_at:deadline}),true);
    assert.equal(await processor.process(ORDER_JOB_TYPES.AUTO_CONFIRM,receipt.id,"repeat",{order_version:extended.version,deadline_at:deadline}),false);
  });
  await t.test("买卖越权、非法跳转、并发确认只结算一次且复式账平衡",async()=>{
    const paid=await paidOrder("PEACE_ELITE");assert.equal((await complete(paid,await evidence())).statusCode,409);
    assert.equal((await request(stranger,"POST",`/api/v1/seller/orders/${paid.id}/start`,{version:paid.version})).statusCode,404);
    const receipt=ok(await complete(await start(paid),await evidence()));
    assert.equal((await request(seller,"POST",`/api/v1/orders/${paid.id}/confirm`,{version:receipt.version})).statusCode,404);
    const responses=await Promise.all([request(buyer,"POST",`/api/v1/orders/${paid.id}/confirm`,{version:receipt.version}),request(buyer,"POST",`/api/v1/orders/${paid.id}/confirm`,{version:receipt.version})]);assert.deepEqual(responses.map(r=>r.statusCode).sort(),[201,409]);
    const incomes=await client.query("SELECT count(*)::int AS count FROM seller_incomes WHERE order_id=$1",[paid.id]);assert.equal(incomes.rows[0].count,1);
    const balance=await client.query("SELECT count(*)::int AS count FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING sum(CASE WHEN side='DEBIT' THEN amount_cent ELSE -amount_cent END)<>0) b");assert.equal(balance.rows[0].count,0);
  });
  await t.test("真实退款申请冻结新订单，正常履约和自动结算被阻止",async()=>{
    const receipt=ok(await complete(await start(await paidOrder("PEACE_ELITE")),await evidence()));
    ok(await request(buyer,"POST","/api/v1/refunds",{order_id:receipt.id,amount_cent:"100",reason_code:"NOT_AS_DESCRIBED",reason_text:"本地售后冻结测试"},`refund-${randomUUID()}`));
    const current=ok(await request(buyer,"GET",`/api/v1/orders/${receipt.id}`));assert.equal(current.after_sale_status,"IN_PROGRESS");assert.equal((await request(buyer,"POST",`/api/v1/orders/${receipt.id}/confirm`,{version:current.version})).json().code,"ORDER_AFTER_SALE_ACTIVE");
    await client.query("UPDATE orders SET auto_confirm_at=now()-interval '1 second' WHERE id=$1",[receipt.id]);const deadline=(await client.query("SELECT auto_confirm_at FROM orders WHERE id=$1",[receipt.id])).rows[0].auto_confirm_at.toISOString();assert.equal(await new OrderJobProcessor(database.db).process(ORDER_JOB_TYPES.AUTO_CONFIRM,receipt.id,"frozen",{order_version:current.version,deadline_at:deadline}),false);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM seller_incomes WHERE order_id=$1",[receipt.id])).rows[0].count,0);
  });
  await t.test("绑定凭证双方可受控读取，外人不可读，不公开私有对象",async()=>{
    const images=await evidence(),receipt=ok(await complete(await start(await paidOrder("PEACE_ELITE")),images));
    const access=await request(buyer,"GET",`/api/v1/files/order-evidence/${receipt.id}/${images[0]}/access`);assert.equal(access.statusCode,200);assert.equal(access.headers["cache-control"],"no-store, private");
    assert.equal((await request(stranger,"GET",`/api/v1/files/order-evidence/${receipt.id}/${images[0]}/access`)).statusCode,404);
    assert.equal((await request(null,"GET",`/api/v1/files/${images[0]}`)).statusCode,404);
    const detail=ok(await request(admin,"GET",`/admin-api/v1/orders/${receipt.id}`));
    assert.equal(detail.fulfillment_seconds,receipt.fulfillment_seconds);
    assert.equal(detail.service_starts_at,null);
    assert.equal(detail.fulfillment_evidence.length,5);
    assert.ok(detail.status_logs.some(row=>row.new_status==="PENDING_BUYER_CONFIRM"));
    assert.ok(detail.status_logs.every(row=>!('operator_id' in row)));
    assert.doesNotMatch(JSON.stringify(detail),/sha256|object_key|ciphertext|access_token|X-Amz-Signature/u);
    const fileDetail=ok(await request(admin,"GET",`/admin-api/v1/files/${images[0]}/access`));
    assert.equal(fileDetail.related_orders[0].order_id,receipt.id);
    assert.deepEqual(Object.keys(fileDetail.related_orders[0]).sort(),["order_id","order_no"]);
    const owned=ok(await request(seller,"GET","/api/v1/me/files?file_type=ORDER_FULFILLMENT_IMAGE&limit=100"));
    assert.equal(owned.items.find(row=>row.id===images[0]).bound_order_id,receipt.id);
  });
  await t.test("已绑定图片和视频双方可读，未认证、错误订单及失效文件不能获得访问权限",async()=>{
    const images=await evidence(), video=await file("ORDER_FULFILLMENT_VIDEO");
    const receipt=ok(await complete(await start(await paidOrder("DELTA_FORCE","ALIPAY_APP",catalog.get("DELTA_FORCE").secondSkuId)),[...images,video]));
    for(const fileId of [images[0],video]){
      const path=`/api/v1/files/order-evidence/${receipt.id}/${fileId}/access`;
      for(const account of [buyer,seller]){const response=await request(account,"GET",path);assert.equal(response.statusCode,200);assert.equal(response.json().visibility,"PRIVATE");assert.equal(response.headers["cache-control"],"no-store, private");}
      assert.equal((await request(null,"GET",path)).statusCode,401);
      assert.equal((await request(stranger,"GET",path)).statusCode,404);
      assert.equal((await request(buyer,"GET",`/api/v1/files/order-evidence/${randomUUID()}/${fileId}/access`)).statusCode,404);
      const original=(await client.query("SELECT file_type FROM files WHERE id=$1",[fileId])).rows[0].file_type;
      try {
        await client.query("UPDATE files SET owner_user_id=$1 WHERE id=$2",[buyer.id,fileId]);
        assert.equal((await request(buyer,"GET",path)).statusCode,404);
        assert.equal((await request(seller,"GET",path)).statusCode,404);
        await client.query("UPDATE files SET owner_user_id=$1 WHERE id=$2",[seller.id,fileId]);
        for(const change of ["moderation_status='PENDING'","upload_status='FAILED'","deleted_at=now()","file_type='ADMIN_EVIDENCE'","file_type='ADMIN_EVIDENCE',visibility='PUBLIC'"]){
          await client.query(`UPDATE files SET ${change} WHERE id=$1`,[fileId]);
          assert.equal((await request(buyer,"GET",path)).statusCode,404);
          await client.query("UPDATE files SET file_type=$1,visibility='PRIVATE',moderation_status='APPROVED',upload_status='VERIFIED',deleted_at=NULL WHERE id=$2",[original,fileId]);
        }
      } finally {await client.query("UPDATE files SET file_type=$1,visibility='PRIVATE',moderation_status='APPROVED',upload_status='VERIFIED',deleted_at=NULL,owner_user_id=$3 WHERE id=$2",[original,fileId,seller.id]);}
    }
  });
  await t.test("支付超时与履约逾期只提醒，不产生伪造退款",async()=>{
    const created=await create("PEACE_ELITE");await client.query("UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1",[created.id]);const processor=new OrderJobProcessor(database.db);assert.equal(await processor.process(ORDER_JOB_TYPES.PAYMENT_TIMEOUT,created.id,"timeout"),true);
    const paid=await paidOrder("PEACE_ELITE");await client.query("UPDATE orders SET fulfillment_due_at=now()-interval '1 second' WHERE id=$1",[paid.id]);const deadline=(await client.query("SELECT fulfillment_due_at FROM orders WHERE id=$1",[paid.id])).rows[0].fulfillment_due_at.toISOString();assert.equal(await processor.process(ORDER_JOB_TYPES.FULFILLMENT_DUE,paid.id,"due",{deadline_at:deadline}),true);assert.equal(await processor.process(ORDER_JOB_TYPES.FULFILLMENT_DUE,paid.id,"due-repeat",{deadline_at:deadline}),false);assert.equal(ok(await request(buyer,"GET",`/api/v1/orders/${paid.id}`)).status,"PENDING_SERVICE");
  });
  await t.test("Token、证件、手机号和密钥不进入日志或统一错误",async()=>{
    const response=await request(stranger,"POST","/api/v1/orders/preview",{product_id:catalog.get("VALORANT").id,quantity:1});assert.ok(response.json().request_id);assert.doesNotMatch(response.body,/document_ciphertext|phone_ciphertext|secret|access_token/iu);
    for(const value of [buyer.token,seller.token,config.userTokenSecret,config.piiEncryptionKey]) assert.ok(!logs.join("\n").includes(value));
  });
  await t.test("录屏人工审核需明确核验连续性，未审核不得完成",async()=>{
    const video=await file("ORDER_FULFILLMENT_VIDEO",seller,"PENDING");
    const payload={decision:"APPROVED",reason:"本地人工核验录屏"};
    assert.equal((await request(admin,"POST",`/admin-api/v1/files/${video}/moderation`,payload)).json().code,"FILE_VIDEO_CONTINUITY_REVIEW_REQUIRED");
    assert.equal((await client.query("SELECT moderation_status FROM files WHERE id=$1",[video])).rows[0].moderation_status,"PENDING");
    ok(await request(admin,"POST",`/admin-api/v1/files/${video}/moderation`,{...payload,continuous_recording_confirmed:true}));
    const audit=await client.query("SELECT count(*)::int AS count FROM admin_operation_logs WHERE target_id=$1",[video]);assert.equal(audit.rows[0].count,1);
    await assert.rejects(client.query("UPDATE files SET duration_ms=NULL WHERE id=$1",[video]),error=>error.code==="23514");
  });
  await t.test("同文件及同字节换文件ID不可跨订单复用，凭证和已用延期不可覆盖",async()=>{
    const ids=await evidence(), first=ok(await complete(await start(await paidOrder("PEACE_ELITE")),ids));
    const second=await start(await paidOrder("PEACE_ELITE"));assert.equal((await complete(second,ids)).json().code,"ORDER_EVIDENCE_ALREADY_BOUND");
    const another=await evidence(),hash=(await client.query("SELECT sha256 FROM files WHERE id=$1",[ids[0]])).rows[0].sha256;await client.query("UPDATE files SET sha256=$1 WHERE id=$2",[hash,another[0]]);
    assert.equal((await complete(second,another)).json().code,"ORDER_EVIDENCE_DUPLICATE_CONTENT");
    await assert.rejects(client.query("UPDATE orders SET fulfillment_evidence_json='[]'::jsonb WHERE id=$1",[first.id]),error=>error.code==="23514");
    ok(await request(buyer,"POST",`/api/v1/orders/${first.id}/extend-receipt`,{version:first.version}));
    await assert.rejects(client.query("UPDATE orders SET receipt_extension_used=false WHERE id=$1",[first.id]),error=>error.code==="23514");
  });
  await t.test("24/2小时收货提醒幂等，证据核查冻结自动和人工收货",async()=>{
    const receipt=ok(await complete(await start(await paidOrder("PEACE_ELITE")),await evidence())), processor=new OrderJobProcessor(database.db);
    await client.query("UPDATE orders SET auto_confirm_at=now()+interval '1 hour' WHERE id=$1",[receipt.id]);
    const deadline=(await client.query("SELECT auto_confirm_at FROM orders WHERE id=$1",[receipt.id])).rows[0].auto_confirm_at.toISOString();
    for(const hours of [24,2]){const payload={deadline_at:deadline,order_version:receipt.version,hours};assert.equal(await processor.process(ORDER_JOB_TYPES.RECEIPT_REMINDER,receipt.id,"reminder",payload),true);assert.equal(await processor.process(ORDER_JOB_TYPES.RECEIPT_REMINDER,receipt.id,"repeat",payload),false);}
    await client.query("UPDATE orders SET evidence_review_pending=true,auto_confirm_at=now()-interval '1 second' WHERE id=$1",[receipt.id]);
    assert.equal((await request(buyer,"POST",`/api/v1/orders/${receipt.id}/confirm`,{version:receipt.version})).json().code,"ORDER_EVIDENCE_REVIEW_PENDING");
    const due=(await client.query("SELECT auto_confirm_at FROM orders WHERE id=$1",[receipt.id])).rows[0].auto_confirm_at.toISOString();assert.equal(await processor.process(ORDER_JOB_TYPES.AUTO_CONFIRM,receipt.id,"hold",{deadline_at:due,order_version:receipt.version}),false);
  });
  await t.test("售后驳回恢复至少24小时且不返还延期；退款按原渠道免服务费",async()=>{
    const receipt=ok(await complete(await start(await paidOrder("PEACE_ELITE")),await evidence()));
    ok(await request(buyer,"POST",`/api/v1/orders/${receipt.id}/extend-receipt`,{version:receipt.version}));
    await client.query("UPDATE orders SET auto_confirm_at=now()+interval '1 hour' WHERE id=$1",[receipt.id]);
    const refund=ok(await request(buyer,"POST","/api/v1/refunds",{order_id:receipt.id,amount_cent:"100",reason_code:"NOT_AS_DESCRIBED",reason_text:"本地驳回恢复测试"},`refund-${randomUUID()}`));
    assert.equal((await request(seller,"POST",`/api/v1/seller/refunds/${refund.id}/decision`,{version:refund.version,decision:"APPROVE",reason:"旧入口不能绕过案件"})).json().code,"CASE_ACTION_REQUIRED");
    await caseAction(buyer,refund.id,{action:"ESCALATE",reason:"申请平台核验交付"});
    await caseAction(admin,refund.id,{action:"MATERIALS_COMPLETE",reason:"双方材料齐全"},true);
    const decided=await caseAction(admin,refund.id,{action:"DECIDE",decision:{outcome:"NO_REFUND",amount_cent:"0",facts:"核验交付完整",evidence_file_ids:[],rule_basis:"V3.1普通案件不支持退款恢复时钟",liability:"证据不支持商家违约",reason:"恢复正常收货",remaining_obligations:"等待原履约验收",execution_conditions:"双方接受或申诉期满后生效"}},true);
    await caseAction(buyer,refund.id,{action:"ACCEPT_DECISION",decision_id:decided.decision.id});
    await caseAction(seller,refund.id,{action:"ACCEPT_DECISION",decision_id:decided.decision.id});
    const resumed=ok(await request(buyer,"GET",`/api/v1/orders/${receipt.id}`));assert.ok(new Date(resumed.auto_confirm_at)-Date.now()>86390000);assert.equal(resumed.receipt_extension_used,true);assert.equal(resumed.after_sale_status,"RESOLVED");assert.equal((await request(buyer,"POST",`/api/v1/orders/${receipt.id}/extend-receipt`,{version:resumed.version})).json().code,"ORDER_EXTENSION_EXHAUSTED");
    for(const channel of ["WECHAT_APP","ALIPAY_APP"]){
      const order=await paidOrder("PEACE_ELITE",channel),r=ok(await request(buyer,"POST","/api/v1/refunds",{order_id:order.id,amount_cent:"100",reason_code:"NOT_AS_DESCRIBED",reason_text:"本地原渠道退款测试"},`refund-${randomUUID()}`));
      const statsPath="/api/v1/seller/finance/business-statistics?period=ALL";
      const beforeRefund=ok(await request(seller,"GET",statsPath));
      await caseAction(seller,r.id,{action:"APPROVE",reason:"同意本地测试退款"});
      const processing=ok(await request(buyer,"GET",`/api/v1/refunds/${r.id}`));
      const payload={event_id:randomUUID(),event_type:"REFUND_SUCCEEDED",refund_no:processing.refund_no,provider_refund_no:processing.provider_refund_no,amount_cent:"100"},signature=new MockPaymentProvider(config.paymentWebhookSecret,channel).signRefund(payload);
      assert.equal((await app.inject({method:"POST",url:`/callbacks/v1/refunds/${channel==="WECHAT_APP"?"ALIPAY_APP":"WECHAT_APP"}`,headers:{"x-payment-signature":signature},payload})).statusCode,409);
      ok(await app.inject({method:"POST",url:`/callbacks/v1/refunds/${channel}`,headers:{"x-payment-signature":signature},payload}));
      ok(await app.inject({method:"POST",url:`/callbacks/v1/refunds/${channel}`,headers:{"x-payment-signature":signature},payload}));
      const afterRefund=ok(await request(seller,"GET",statsPath));
      assert.equal(afterRefund.paid_amount_cent,beforeRefund.paid_amount_cent);
      assert.equal(afterRefund.paid_order_count,beforeRefund.paid_order_count);
      assert.equal(BigInt(afterRefund.refunded_amount_cent),BigInt(beforeRefund.refunded_amount_cent)+100n);
      const income=(await client.query("SELECT platform_fee_cent,seller_amount_cent,reversed_amount_cent FROM seller_incomes WHERE order_id=$1",[order.id])).rows[0];assert.equal(income.platform_fee_cent,"0");assert.equal(income.seller_amount_cent,"19995");assert.equal(income.reversed_amount_cent,"100");
    }
    assert.equal((await client.query("SELECT count(*)::int AS count FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING sum(CASE WHEN side='DEBIT' THEN amount_cent ELSE -amount_cent END)<>0) b")).rows[0].count,0);
  });
  await t.test("两渠道退款回调丢失后通过真实管理 API 查单恢复，迟到回调不重复入账",async()=>{
    const manager=await seedAdmin(["finance.read","finance.manage"]);
    for(const channel of ["WECHAT_APP","ALIPAY_APP"]){
      const order=await paidOrder("PEACE_ELITE",channel);
      const refund=ok(await request(buyer,"POST","/api/v1/refunds",{order_id:order.id,amount_cent:"100",reason_code:"NOT_AS_DESCRIBED",reason_text:"回调丢失恢复测试"},`recover-refund-${randomUUID()}`));
      await caseAction(seller,refund.id,{action:"APPROVE",reason:"同意退款"});
      const processing=ok(await request(buyer,"GET",`/api/v1/refunds/${refund.id}`));
      const operation=ok(await request(manager,"GET","/admin-api/v1/finance/transfers")).find(row=>row.refund_id===refund.id);
      assert.ok(operation);assert.equal(operation.channel,channel);
      const result=ok(await request(manager,"POST",`/admin-api/v1/finance/transfers/${operation.id}/mock-result`,{version:operation.version,status:"SUCCEEDED",reason:"Mock 已退款但回调丢失"}));assert.equal(result.business_result_applied,false);
      const recovered=ok(await request(manager,"POST",`/admin-api/v1/finance/transfers/${operation.id}/recover`,{version:operation.version,reason:"查询原渠道退款"}));assert.equal(recovered.status,"SUCCEEDED");
      const payload={event_id:randomUUID(),event_type:"REFUND_SUCCEEDED",refund_no:processing.refund_no,provider_refund_no:processing.provider_refund_no,amount_cent:"100"};
      const signature=new MockPaymentProvider(config.paymentWebhookSecret,channel).signRefund(payload);
      const replay=ok(await app.inject({method:"POST",url:`/callbacks/v1/refunds/${channel}`,headers:{"x-payment-signature":signature},payload}));assert.equal(replay.duplicate,true);
      const facts=ok(await request(buyer,"GET",`/api/v1/orders/${order.id}`));assert.equal(facts.refunded_amount_cent,"100");assert.equal(facts.status,"COMPLETED");
    }
    assert.equal((await client.query("SELECT count(*)::int count FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING sum(CASE WHEN side='DEBIT' THEN amount_cent ELSE -amount_cent END)<>0) b")).rows[0].count,0);
  });
  await t.test("后台商品游戏筛选与微秒游标分页绑定查询条件",async()=>{
    const prefix="本地契约分页-"+randomUUID().slice(0,8);
    for(let i=0;i<27;i++)await client.query("INSERT INTO products(id,seller_id,title,description,game,fulfillment_seconds,pricing_mode,min_price_cent,status,created_at) VALUES($1,$2,$3,'隔离分页测试','VALORANT',90061,'SINGLE',19995,'DRAFT','2026-10-17T00:00:00.000123Z')",[randomUUID(),sellerId,prefix+i]);
    for(const path of ["/admin-api/v1/catalog/products","/admin-api/v1/product-reviews"])for(const sort of ["created_desc","created_asc"]){
      const query=`?game=VALORANT&keyword=${encodeURIComponent(prefix)}&limit=20&sort=${sort}`;
      const first=ok(await request(admin,"GET",path+query));assert.equal(first.items.length,20);
      const second=ok(await request(admin,"GET",path+query+"&cursor="+encodeURIComponent(first.next_cursor)));assert.equal(second.items.length,7);
      const all=[...first.items,...second.items];assert.equal(new Set(all.map(row=>row.id)).size,27);
      assert.ok(all.every(row=>row.game==="VALORANT"&&row.pricing_mode==="SINGLE"&&row.fulfillment_seconds===90061));
      assert.equal((await request(admin,"GET",path+query.replace("game=VALORANT","game=DELTA_FORCE")+"&cursor="+encodeURIComponent(first.next_cursor))).statusCode,400);
    }
  });
  await t.test("后台订单真实快照、资金与关联售后按权限返回，主状态和售后状态独立筛选",async()=>{
    const order=await paidOrder("DELTA_FORCE","WECHAT_APP",catalog.get("DELTA_FORCE").skuId);
    const refund=ok(await request(buyer,"POST","/api/v1/refunds",{order_id:order.id,amount_cent:"100",reason_code:"NOT_AS_DESCRIBED",reason_text:"隔离契约匹配测试"},`refund-${randomUUID()}`));
    const complaintId=randomUUID();
    await client.query("INSERT INTO complaints(id,complaint_no,reporter_id,target_type,order_id,complaint_type,description) VALUES($1,$2,$3,'ORDER',$4,'SERVICE_DISPUTE','隔离关联读取测试')",[complaintId,"ALIGN-"+randomUUID().slice(0,20),buyer.id,order.id]);
    const buyerView=ok(await request(buyer,"GET",`/api/v1/orders/${order.id}`));
    const adminView=ok(await request(admin,"GET",`/admin-api/v1/orders/${order.id}`));
    for(const key of ["game","fulfillment_seconds","sku_price_cent","paid_amount_cent","payable_amount_cent","refunded_amount_cent","commission_rate_bps","platform_fee_cent","seller_income_cent","version","after_sale_status"])assert.deepEqual(adminView[key],buyerView[key],key);
    assert.equal(adminView.related_refunds[0].id,refund.id);assert.equal(adminView.related_complaints[0].id,complaintId);
    const readonly=await seedAdmin(["order.read"]);
    const limited=ok(await request(readonly,"GET",`/admin-api/v1/orders/${order.id}`));
    for(const key of ["platform_fee_cent","seller_income_cent","commission_rate_bps","related_refunds","related_complaints"])assert.equal(key in limited,false,key);
    assert.equal((await request(null,"GET",`/admin-api/v1/orders/${order.id}`)).statusCode,401);
    const noOrder=await seedAdmin(["finance.read"]);
    assert.equal((await request(noOrder,"GET",`/admin-api/v1/orders/${order.id}`)).statusCode,403);
    const query=`/admin-api/v1/orders?keyword=${encodeURIComponent(order.order_no)}&status=${buyerView.status}&after_sale_status=IN_PROGRESS&limit=20`;
    const found=ok(await request(admin,"GET",query));assert.equal(found.items.length,1);assert.equal(found.items[0].id,order.id);
    assert.equal(ok(await request(admin,"GET",query.replace("after_sale_status=IN_PROGRESS","after_sale_status=NONE"))).items.length,0);
    assert.equal((await request(admin,"GET","/admin-api/v1/orders?after_sale_status=INVALID")).statusCode,400);
    const first=ok(await request(admin,"GET","/admin-api/v1/orders?limit=1&after_sale_status=IN_PROGRESS"));
    assert.ok(first.next_cursor);
    const reused=await request(admin,"GET","/admin-api/v1/orders?limit=1&after_sale_status=RESOLVED&cursor="+encodeURIComponent(first.next_cursor));
    assert.equal(reused.statusCode,400);
  });

});

function request(account,method,url,payload,key){return app.inject({method,url,headers:{...(account?{authorization:`Bearer ${account.token}`} : {}),...(key?{"idempotency-key":key}: {})},...(payload===undefined?{}:{payload})});}
function ok(response){assert.ok(response.statusCode>=200&&response.statusCode<300,response.body);return response.json();}
async function caseAction(actor,id,command,isAdmin=false){
  const base=isAdmin?"/admin-api/v1/after-sale/cases":"/api/v1/after-sale/cases";
  const current=ok(await request(actor,"GET",`${base}/${id}`));
  const result=ok(await request(actor,"POST",`${base}/${id}/actions`,{version:current.version,...command},`case-action-${randomUUID()}`));
  return result.current_case;
}
async function user(verified,minor=false){const id=randomUUID(),sid=randomUUID();await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'synthetic',$2,'138****0000')",[id,createHash("sha256").update(id).digest("hex")]);await client.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES($1,$2,$3,$4,'ANDROID','127.0.0.1','test',now()+interval '1 hour')",[sid,id,createHash("sha256").update(sid).digest("hex"),sid]);if(verified){const protector=new SensitiveDataProtector(config.piiEncryptionKey,config.piiHmacKey,config.authHmacKey);const doc=minor?"000000202001010000":"000000199001010000";await client.query("INSERT INTO identity_verifications(id,user_id,provider,provider_reference,legal_name_ciphertext,legal_name_hash,legal_name_mask,document_ciphertext,document_hash,document_mask,status,verified_at) VALUES($1,$2,'MANUAL_REVIEW',$3,$4,$5,'测*',$6,$7,'********0000','VERIFIED',now())",[randomUUID(),id,randomUUID(),protector.encrypt("legal-name","测试"),protector.piiHash("legal-name","测试"),protector.encrypt("identity-document",doc),protector.piiHash("identity-document",doc)]);}return{id,token:issueAccessToken({sub:id,principal_type:"user",token_use:"access",session_id:sid},{secret:config.userTokenSecret,issuer:config.tokenIssuer,audience:config.userTokenAudience,expiresInSeconds:600})};}
async function seedAdmin(keys=["product.read","product.review","file.read","file.review","refund.manage","refund.read","complaint.read","finance.read","order.read"]){const id=randomUUID(),sid=randomUUID(),role=randomUUID();await client.query("INSERT INTO admin_accounts(id,username,display_name,password_hash) VALUES($1,$2,'测试审核员','unused')",[id,id]);await client.query("INSERT INTO admin_sessions(id,admin_id,session_token_hash,ip,user_agent,expires_at) VALUES($1,$2,$3,'127.0.0.1','test',now()+interval '1 hour')",[sid,id,createHash("sha256").update(sid).digest("hex")]);await client.query("INSERT INTO roles(id,role_key,name) VALUES($1,$2,'测试审核角色')",[role,role]);await client.query("INSERT INTO admin_roles(admin_id,role_id) VALUES($1,$2)",[id,role]);for(const key of keys){const p=await client.query("INSERT INTO permissions(id,permission_key) VALUES($1,$2) ON CONFLICT(permission_key) DO UPDATE SET permission_key=excluded.permission_key RETURNING id",[randomUUID(),key]);await client.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",[role,p.rows[0].id]);}return{id,token:issueAccessToken({sub:id,principal_type:"admin",token_use:"access",session_id:sid,mfa_verified:true},{secret:config.adminTokenSecret,issuer:config.tokenIssuer,audience:config.adminTokenAudience,expiresInSeconds:600})};}
async function file(type,owner=seller,moderation="APPROVED"){const id=randomUUID(),image=type!=="ORDER_FULFILLMENT_VIDEO",publicFile=type==="PRODUCT_IMAGE";await client.query("INSERT INTO files(id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,duration_ms,upload_status,moderation_status,visibility) VALUES($1,$2,'local-test',$3,$4,$5,1024,$6,$7,'VERIFIED',$8,$9)",[id,owner.id,id,type,image?"image/png":"video/mp4",createHash("sha256").update(id).digest("hex"),image?null:10000,moderation,publicFile?"PUBLIC":"PRIVATE"]);return id;}
async function evidence(){return Promise.all(Array.from({length:5},()=>file("ORDER_FULFILLMENT_IMAGE")));}
async function create(game,skuId){return ok(await request(buyer,"POST","/api/v1/orders",{product_id:catalog.get(game).id,quantity:1,...(skuId?{sku_id:skuId}:{})},`order-${randomUUID()}`));}
async function pay(order,channel){const payment=ok(await request(buyer,"POST","/api/v1/payments",{order_id:order.id,payment_channel:channel},`payment-${randomUUID()}`));return ok(await request(buyer,"POST",`/api/v1/payments/${payment.id}/mock-confirm`)).order;}
async function paidOrder(game,channel="WECHAT_APP",skuId){return pay(await create(game,skuId),channel);}
async function start(order){return ok(await request(seller,"POST",`/api/v1/seller/orders/${order.id}/start`,{version:order.version}));}
async function complete(order,ids){return request(seller,"POST",`/api/v1/seller/orders/${order.id}/complete`,{version:order.version,evidence_file_ids:ids});}
