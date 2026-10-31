import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import { OrderJobProcessor, FinanceLedgerEngine, ensureSellerLedgerAccount, postLedgerTransaction } from "@xiongzai/application";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient, orders, sellerIncomes, validateLocalTestDatabaseUrl } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { eq } from "drizzle-orm";
import { createApiApp, loadApiConfig, MockPaymentProvider, AfterSaleService, PaymentProviderRouter, DrizzleMockTransferStore, MinioStorageProvider } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL ? validateLocalTestDatabaseUrl(process.env.TEST_DATABASE_URL) : undefined;
const enabled = Boolean(databaseUrl);
const realMinioEnabled = enabled && ["FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID", "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET"].every(key => Boolean(process.env[key]));
const schemaName = `xiongzai_after_sale_${randomUUID().replaceAll("-", "")}`;
const webhookSecret = "after-sale-webhook-secret-at-least-32-bytes";
let migrationClient;
let database;
let app;
let buyer;
let seller;
let admin;
let sellerProfileId;
let productId;
let skuId;
let paymentProvider;

class TrackingPaymentProvider extends MockPaymentProvider {
  refundCalls = [];
  loseNextResponse=false;
  async createRefund(input) { this.refundCalls.push(input.refundNo); const result=await super.createRefund(input);if(this.loseNextResponse){this.loseNextResponse=false;throw new Error("synthetic response loss");}return result; }
}

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "after-sale-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "after-sale-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "after-sale-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "after-sale-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "after-sale-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "after-sale-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "after-sale-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", PAYMENT_PROVIDER_MODE: "mock",
  PAYMENT_WEBHOOK_SECRET: webhookSecret, ACCESS_TOKEN_TTL_SECONDS: "300", REFRESH_TOKEN_TTL_SECONDS: "3600", API_CORS_ORIGINS: "http://localhost:3001",
});

before(async () => {
  if (!enabled) return;
  migrationClient = new pg.Client({ connectionString: databaseUrl }); await migrationClient.connect(); await migrationClient.query(`CREATE SCHEMA "${schemaName}"`); await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql"); await runMigration("0001_core_invariants.sql"); await runMigration("0004_payment_channels_voice_constraints.sql"); await runMigration("0005_policy_acceptance_context.sql"); await runMigration("0006_policy_version_bindings.sql"); await runMigration("0007_user_lifecycle_requests.sql"); await runMigration("0008_user_lifecycle_invariants.sql"); await runMigration("0009_clear_rhodey.sql"); await runMigration("0010_order_rule_version.sql");
  await applyStageOneMigrations(migrationClient, schemaName); database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-after-sale-test", options: `-c search_path=${schemaName},public`, max: 12 });
  paymentProvider = new TrackingPaymentProvider(webhookSecret);
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async () => {} }, paymentProviders:[paymentProvider,new MockPaymentProvider(webhookSecret,"ALIPAY_APP")], objectStorageProvider:{async readObjectStream(){return {body:Readable.from([Buffer.alloc(1024)]),contentType:"image/png",contentLength:1024,totalSize:1024,range:null,metadata:{}};}}, logger: new JsonLogger("after-sale-test", () => {}) });
  buyer = await seedUser("buyer"); seller = await seedUser("seller"); admin = await seedAdmin("after-sale", ["refund.read", "refund.manage", "complaint.read", "complaint.manage", "review.read", "review.manage"]); await seedCatalog();
  for (const [key, value] of [["order.payment_timeout_seconds", 300], ["order.accept_timeout_seconds", 300], ["order.auto_confirm_seconds", 300], ["finance.commission_rate_bps", 1000], ["finance.settlement_delay_seconds", 0]]) {
    await migrationClient.query("INSERT INTO platform_configs (id,config_key,value_json,version_no,status,effective_at,created_by_admin_id) VALUES ($1,$2,$3,1,'ACTIVE',now(),$4)", [randomUUID(), key, { value }, admin.id]);
  }
});

after(async () => { if (!enabled) return; await app?.close(); await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`); await migrationClient.end(); });

test("two historical partial refunds update cumulative amounts atomically and a duplicate callback is harmless", { skip: !enabled }, async () => {
  const firstOrder = await seedCompletedOrder(10_000n);
  const first = await createRefund(firstOrder.orderId, 3_000n, "第一次部分退款");
  const approved = await userRequest(seller, "POST", `/api/v1/seller/refunds/${first.id}/decision`, { version: first.version, decision: "APPROVE", reason: "同意退还未履约部分" });
  assert.equal(approved.statusCode, 201, approved.body); assert.equal(approved.json().status, "REFUND_PROCESSING");
  const callback = refundCallback(approved.json(), 3_000n); const callbackFirst = await callbackRequest(callback); const callbackReplay = await callbackRequest(callback);
  assert.equal(callbackFirst.statusCode, 201, callbackFirst.body); const newEventReplay = await callbackRequest({...callback,event_id:randomUUID()}); assert.equal(newEventReplay.statusCode,201,newEventReplay.body); assert.equal(newEventReplay.json().duplicate,true); assert.equal(callbackFirst.json().refund.status, "REFUNDED"); assert.equal(callbackReplay.json().duplicate, true);

  const second = await createRefund(firstOrder.orderId, 2_000n, "第二次部分退款");
  const rejected = await userRequest(seller, "POST", `/api/v1/seller/refunds/${second.id}/decision`, { version: second.version, decision: "REJECT", reason: "需要平台核验" });
  const escalated = await userRequest(buyer, "POST", `/api/v1/refunds/${second.id}/escalate`, { version: rejected.json().version, reason: "申请平台介入核验服务记录" });
  const adminApproved = await adminRequest(admin, "POST", `/admin-api/v1/refunds/${second.id}/decision`, { version: escalated.json().version, decision: "APPROVE", approved_amount_cent: "2000", reason: "核验后支持部分退款" });
  assert.equal(adminApproved.statusCode, 201, adminApproved.body); assert.equal(adminApproved.json().status, "REFUND_PROCESSING");
  const secondCallback = await callbackRequest(refundCallback(adminApproved.json(), 2_000n)); assert.equal(secondCallback.statusCode, 201, secondCallback.body);

  const totals = await migrationClient.query("SELECT o.refunded_amount_cent::text AS order_refunded, o.payment_status, p.refunded_amount_cent::text AS payment_refunded, p.status AS payment_status, (SELECT count(*) FROM refunds WHERE order_id = o.id AND status = 'REFUNDED')::integer AS completed_refunds FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1", [firstOrder.orderId]);
  assert.deepEqual(totals.rows[0], { order_refunded: "5000", payment_status: "PARTIALLY_REFUNDED", payment_refunded: "5000", completed_refunds: 2 });
  const duplicateFacts = await migrationClient.query("SELECT (SELECT count(*) FROM inbox_events WHERE event_id = $1)::integer AS inbox, (SELECT count(*) FROM refund_logs WHERE refund_id = $2 AND action = 'CHANNEL_REFUND_SUCCEEDED')::integer AS success_logs", [callback.event_id, first.id]);
  assert.deepEqual(duplicateFacts.rows[0], { inbox: 1, success_logs: 1 });
  const audit = await migrationClient.query("SELECT count(*)::integer AS count FROM admin_operation_logs WHERE target_id = $1 AND action = 'REFUND_APPROVE'", [second.id]); assert.equal(audit.rows[0].count, 1);
});

test("finance retains GMV during real partial, full, failed and duplicate refund callbacks", { skip: !enabled }, async () => {
  const reader=await seedAdmin("finance-statistics",["finance.read","dashboard.read"]);const day=new Date().toISOString().slice(0,10);
  const summary=async channel=>{const response=await adminRequest(reader,"GET",`/admin-api/v1/finance/summary?from=${day}&to=${day}&channel=${channel}`);assert.equal(response.statusCode,200);return response.json();};
  const dashboard=async()=>{const response=await adminRequest(reader,"GET",`/admin-api/v1/governance/dashboard?from=${day}&to=${day}`);assert.equal(response.statusCode,200);return response.json();};
  const before=await summary("WECHAT_APP"),overviewBefore=await dashboard();const order=await seedCompletedOrder(20000n);
  const check=async refund=>{const value=await summary("WECHAT_APP");assert.equal(BigInt(value.gmv_cent)-BigInt(before.gmv_cent),20000n);assert.equal(BigInt(value.received_cent)-BigInt(before.received_cent),20000n-refund);assert.equal(BigInt(value.refund_cent)-BigInt(before.refund_cent),refund);assert.equal(BigInt(value.wechat_mock_cent)-BigInt(before.wechat_mock_cent),20000n);const overview=await dashboard();assert.equal(BigInt(overview.paid_gmv_cent)-BigInt(overviewBefore.paid_gmv_cent),20000n);};
  const approve=async amount=>{const refund=await createRefund(order.orderId,amount,"财务口径回归");const response=await userRequest(seller,"POST",`/api/v1/seller/refunds/${refund.id}/decision`,{version:refund.version,decision:"APPROVE",reason:"本地测试同意退款"});assert.equal(response.statusCode,201);return response.json();};
  await check(0n);const partial=await approve(5000n);await check(0n);
  const processing=await adminRequest(reader,"GET",`/admin-api/v1/finance/summary?from=${day}&to=${day}&channel=WECHAT_APP&status=REFUNDING`);assert.ok(BigInt(processing.json().gmv_cent)>=20000n);
  const callback=refundCallback(partial,5000n);assert.equal((await callbackRequest(callback)).statusCode,201);await check(5000n);assert.equal((await callbackRequest(callback)).json().duplicate,true);assert.equal((await callbackRequest({...callback,event_id:randomUUID()})).json().duplicate,true);await check(5000n);
  const failure=await approve(1000n);await check(5000n);assert.equal((await callbackRequest({...refundCallback(failure,1000n),event_type:"REFUND_FAILED"})).statusCode,201);await check(5000n);
  const failedDetail=(await adminRequest(admin,"GET",`/admin-api/v1/refunds/${failure.id}`)).json();const rejected=await adminRequest(admin,"POST",`/admin-api/v1/refunds/${failure.id}/decision`,{version:failedDetail.version,decision:"REJECT",reason:"关闭失败申请后重新申请剩余金额"});assert.equal(rejected.statusCode,201);
  const full=await approve(15000n);await check(5000n);assert.equal((await callbackRequest(refundCallback(full,15000n))).statusCode,201);await check(20000n);
  const other=await summary("ALIPAY_APP");assert.equal(other.gmv_cent,"0");assert.equal(other.received_cent,"0");assert.match(other.scope,/筛选仅适用于支付指标/u);
});

test("concurrent refund requests allow one active flow and cumulative refunds cannot exceed paid amount", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(4_000n);
  const [left, right] = await Promise.all([
    userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(order.orderId, 1_000n, "并发申请 A"), { "idempotency-key": `refund-race-a-${randomUUID()}` }),
    userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(order.orderId, 1_000n, "并发申请 B"), { "idempotency-key": `refund-race-b-${randomUUID()}` }),
  ]);
  assert.deepEqual([left.statusCode, right.statusCode].sort(), [201, 409], `${left.body}\n${right.body}`);
  const excessiveOrder = await seedCompletedOrder(2_500n); const excessive = await userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(excessiveOrder.orderId, 2_501n, "超过实付"), { "idempotency-key": `refund-excess-${randomUUID()}` });
  assert.equal(excessive.statusCode, 409); assert.equal(excessive.json().code, "REFUND_AMOUNT_EXCEEDS_REMAINING");
});

test("invalid or concurrent refund approvals cannot duplicate provider side effects", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(4_000n);
  const refund = await createRefund(order.orderId, 1_000n, "渠道调用并发保护");
  const callsBefore = paymentProvider.refundCalls.length;
  const nonOwner = await userRequest(buyer, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version, decision: "APPROVE", reason: "非归属卖家不能批准" });
  assert.equal(nonOwner.statusCode, 404, nonOwner.body);
  const stale = await userRequest(seller, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version + 1, decision: "APPROVE", reason: "过期版本不能批准" });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(paymentProvider.refundCalls.length, callsBefore);
  const [left, right] = await Promise.all([
    userRequest(seller, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version, decision: "APPROVE", reason: "并发批准 A" }),
    userRequest(seller, "POST", `/api/v1/seller/refunds/${refund.id}/decision`, { version: refund.version, decision: "APPROVE", reason: "并发批准 B" }),
  ]);
  assert.deepEqual([left.statusCode, right.statusCode].sort(), [201, 409], `${left.body}\n${right.body}`);
  assert.equal(paymentProvider.refundCalls.length, callsBefore + 1);
});

test("complaints retain evidence, SLA transitions, immutable logs and administrator audit", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(3_000n); const firstFile = await seedEvidenceFile("first"); const secondFile = await seedEvidenceFile("second");
  const created = await userRequest(buyer, "POST", "/api/v1/complaints", { target_type: "ORDER", target_id: order.orderId, complaint_type: "履约争议", description: "陪玩没有按照预约时间完成服务，需要平台核验。", file_ids: [firstFile] });
  assert.equal(created.statusCode, 201, created.body);
  const accepted = await adminAction(created.json(), "ACCEPT", "客服已受理投诉"); const processing = await adminAction(accepted.json(), "START_PROCESSING", "开始核验订单与聊天记录"); const needEvidence = await adminAction(processing.json(), "REQUEST_EVIDENCE", "请补充预约时间截图");
  const evidence = await userRequest(buyer, "POST", `/api/v1/complaints/${created.json().id}/evidences`, { version: needEvidence.json().version, file_id: secondFile, description: "补充预约时间截图" });
  assert.equal(evidence.statusCode, 201, evidence.body); assert.equal(evidence.json().complaint.status, "PROCESSING");
  const completed = await adminAction(evidence.json().complaint, "COMPLETE", "证据核验完成", "确认存在履约异常，投诉成立"); assert.equal(completed.json().status, "COMPLETED");
  const adminDetail = await adminRequest(admin, "GET", `/admin-api/v1/complaints/${created.json().id}`); assert.equal(adminDetail.statusCode, 200, adminDetail.body); assert.equal(adminDetail.json().target_user_id, seller.id); assert.equal(adminDetail.json().target_seller_id, sellerProfileId); assert.equal(adminDetail.json().target_product_id, productId); assert.equal(adminDetail.json().order_id, order.orderId); assert.equal(adminDetail.json().evidences.length, 2);
  const adminList = await adminRequest(admin, "GET", `/admin-api/v1/complaints?keyword=${encodeURIComponent(created.json().complaint_no)}`); assert.equal(adminList.statusCode, 200, adminList.body); assert.deepEqual({user:adminList.json().items[0].target_user_id,seller:adminList.json().items[0].target_seller_id,product:adminList.json().items[0].target_product_id},{user:seller.id,seller:sellerProfileId,product:productId});
  const unchanged = await migrationClient.query("SELECT (SELECT status FROM users WHERE id=$1) user_status,(SELECT status FROM seller_profiles WHERE id=$2) seller_status,(SELECT status FROM products WHERE id=$3) product_status", [buyer.id, sellerProfileId, productId]); assert.deepEqual(unchanged.rows[0], { user_status: "NORMAL", seller_status: "APPROVED", product_status: "ON_SALE" });
  const detail = await userRequest(buyer, "GET", `/api/v1/complaints/${created.json().id}`); assert.equal(detail.json().evidences.length, 2); assert.deepEqual(detail.json().logs.map((log) => log.action), ["COMPLAINT_SUBMITTED", "COMPLAINT_ACCEPT", "COMPLAINT_START_PROCESSING", "COMPLAINT_REQUEST_EVIDENCE", "EVIDENCE_ADDED", "COMPLAINT_COMPLETE"]);
  const immutable = await migrationClient.query("UPDATE complaint_logs SET reason = 'tampered' WHERE complaint_id = $1", [created.json().id]).then(() => null, (error) => error); assert.match(String(immutable?.message), /append-only/);
  const audit = await migrationClient.query("SELECT count(*)::integer AS count FROM admin_operation_logs WHERE target_id = $1", [created.json().id]); assert.equal(audit.rows[0].count, 4);
});

test("complaint evidence requires approved verified private files and rejects pending, owner, purpose and visibility mismatches", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(3_200n);
  const pendingPrivate = await seedEvidenceFile("pending-private", { moderationStatus: "PENDING" });
  const pending = await userRequest(buyer, "POST", "/api/v1/complaints", { target_type: "ORDER", target_id: order.orderId, complaint_type: "待审证据", description: "待审投诉证据不能绑定到投诉记录。", file_ids: [pendingPrivate] });
  assert.equal(pending.statusCode, 404, pending.body);
  assert.equal(pending.json().code, "EVIDENCE_FILE_NOT_FOUND");
  const approvedPrivate = await seedEvidenceFile("approved-private");
  const created = await userRequest(buyer, "POST", "/api/v1/complaints", { target_type: "ORDER", target_id: order.orderId, complaint_type: "证据校验", description: "验证投诉证据的审核、用途、所有权和私有访问边界。", file_ids: [approvedPrivate] });
  assert.equal(created.statusCode, 201, created.body);
  const usage = await migrationClient.query("SELECT usage_type, target_type, target_id FROM file_usages WHERE file_id = $1 AND deleted_at IS NULL", [approvedPrivate]);
  assert.deepEqual(usage.rows, [{ usage_type: "EVIDENCE", target_type: "COMPLAINT", target_id: created.json().id }]);
  assert.equal((await userRequest(seller, "GET", `/api/v1/files/${approvedPrivate}/access`)).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: `/api/v1/files/${approvedPrivate}` })).statusCode, 404);

  const foreign = await seedEvidenceFile("foreign", { ownerUserId: seller.id });
  const publicEvidence = await seedEvidenceFile("public", { visibility: "PUBLIC" });
  const wrongPurpose = await seedEvidenceFile("wrong-purpose", { fileType: "PRODUCT_IMAGE" });
  for (const fileId of [foreign, publicEvidence, wrongPurpose]) {
    const rejected = await userRequest(buyer, "POST", "/api/v1/complaints", { target_type: "ORDER", target_id: order.orderId, complaint_type: "错误证据", description: "此请求必须因证据文件边界不匹配而被拒绝。", file_ids: [fileId] });
    assert.equal(rejected.statusCode, 404, rejected.body);
    assert.equal(rejected.json().code, "EVIDENCE_FILE_NOT_FOUND");
  }
});

test("the database complaint evidence cap is returned as an explicit business error", { skip: !enabled }, async () => {
  const order = await seedCompletedOrder(3_300n);
  const first = await seedEvidenceFile("limit-0");
  const created = await userRequest(buyer, "POST", "/api/v1/complaints", { target_type: "ORDER", target_id: order.orderId, complaint_type: "证据上限", description: "验证数据库证据上限能够转换成统一业务错误。", file_ids: [first] });
  assert.equal(created.statusCode, 201, created.body);
  let complaint = created.json();
  for (let index = 1; index < 20; index += 1) {
    const fileId = await seedEvidenceFile(`limit-${index}`);
    const response = await userRequest(buyer, "POST", `/api/v1/complaints/${complaint.id}/evidences`, { version: complaint.version, file_id: fileId, description: `第 ${index + 1} 条证据` });
    assert.equal(response.statusCode, 201, response.body);
    complaint = response.json().complaint;
  }
  const overflowFile = await seedEvidenceFile("limit-overflow");
  const overflow = await userRequest(buyer, "POST", `/api/v1/complaints/${complaint.id}/evidences`, { version: complaint.version, file_id: overflowFile, description: "第 21 条证据" });
  assert.equal(overflow.statusCode, 409, overflow.body);
  assert.equal(overflow.json().code, "COMPLAINT_EVIDENCE_LIMIT_REACHED");
  const count = await migrationClient.query("SELECT count(*)::integer AS count FROM complaint_evidences WHERE complaint_id=$1", [complaint.id]);
  assert.equal(count.rows[0].count, 20);
});

test("reviews are order-unique, validate 1-5, and hiding/restoring recomputes rating aggregates", { skip: !enabled }, async () => {
  const orderFive = await seedCompletedOrder(2_000n); const orderOne = await seedCompletedOrder(2_000n);
  const invalid = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 6, content: "无效评分", anonymous: false }); assert.equal(invalid.statusCode, 400);
  const five = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 5, content: "技术稳定，沟通顺畅。", anonymous: false }); const one = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderOne.orderId, rating: 1, content: "本次服务没有达到预期。", anonymous: true });
  assert.equal(five.statusCode, 201, five.body); assert.equal(one.statusCode, 201, one.body);
  const adminDetail = await adminRequest(admin, "GET", `/admin-api/v1/reviews/${five.json().id}`); assert.equal(adminDetail.statusCode, 200, adminDetail.body); assert.equal(adminDetail.json().id, five.json().id); assert.equal(adminDetail.json().content, "技术稳定，沟通顺畅。"); assert.doesNotMatch(JSON.stringify(adminDetail.json()), /phone_ciphertext|password|token|secret|bucket|object_key|presigned/iu);
  assert.equal((await adminRequest(admin, "GET", `/admin-api/v1/reviews/${randomUUID()}`)).statusCode, 404);
  const duplicate = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 4, content: "再次评价", anonymous: false }); assert.equal(duplicate.statusCode, 409); assert.equal(duplicate.json().code, "REVIEW_ALREADY_EXISTS");
  const sellerPage = await app.inject({ method: "GET", url: `/api/v1/companions/${sellerProfileId}/reviews?limit=1` }); assert.equal(sellerPage.statusCode, 200, sellerPage.body); assert.equal(sellerPage.json().items.length, 1); assert.ok(sellerPage.json().next_cursor);
  const sellerNext = await app.inject({ method: "GET", url: `/api/v1/companions/${sellerProfileId}/reviews?limit=1&cursor=${encodeURIComponent(sellerPage.json().next_cursor)}` }); assert.equal(sellerNext.statusCode, 200, sellerNext.body); assert.equal(sellerNext.json().items.length, 1); assert.notEqual(sellerNext.json().items[0].id, sellerPage.json().items[0].id);
  const wrongReviewScope = await app.inject({ method: "GET", url: `/api/v1/products/${productId}/reviews?cursor=${encodeURIComponent(sellerPage.json().next_cursor)}` }); assert.equal(wrongReviewScope.statusCode, 400);
  assert.deepEqual(await aggregate(), { rating_count: 2, rating_sum: "6", rating_avg: "3.00", star_1_count: 1, star_5_count: 1 });
  const hidden = await adminRequest(admin, "POST", `/admin-api/v1/reviews/${five.json().id}/moderation`, { action: "HIDE", version: five.json().version, reason: "评价包含需要复核的内容" }); assert.equal(hidden.statusCode, 201, hidden.body); assert.deepEqual(await aggregate(), { rating_count: 1, rating_sum: "1", rating_avg: "1.00", star_1_count: 1, star_5_count: 0 });
  const afterHiddenDuplicate = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderFive.orderId, rating: 3, content: "隐藏后再次评价", anonymous: false }); assert.equal(afterHiddenDuplicate.statusCode, 409);
  const restored = await adminRequest(admin, "POST", `/admin-api/v1/reviews/${five.json().id}/moderation`, { action: "RESTORE", version: hidden.json().version, reason: "复核后确认内容合规" }); assert.equal(restored.statusCode, 201, restored.body); assert.deepEqual(await aggregate(), { rating_count: 2, rating_sum: "6", rating_avg: "3.00", star_1_count: 1, star_5_count: 1 });
  const softDeleted = await adminRequest(admin, "POST", `/admin-api/v1/reviews/${five.json().id}/moderation`, { action: "SOFT_DELETE", version: restored.json().version, reason: "确认属于违规评价，永久隐藏但保留订单证据" }); assert.equal(softDeleted.statusCode, 201, softDeleted.body); assert.ok(softDeleted.json().deleted_at); assert.deepEqual(await aggregate(), { rating_count: 1, rating_sum: "1", rating_avg: "1.00", star_1_count: 1, star_5_count: 0 });
  const retainedBuyerEvidence = await userRequest(buyer, "GET", `/api/v1/reviews/${five.json().id}`); assert.equal(retainedBuyerEvidence.statusCode, 200); assert.ok(retainedBuyerEvidence.json().deleted_at);
  const publicAfterDelete = await app.inject({ method: "GET", url: `/api/v1/products/${productId}/reviews?limit=100` }); assert.equal(publicAfterDelete.statusCode, 200); assert.equal(publicAfterDelete.json().items.some((item) => item.id === five.json().id), false);
  const restoreDeleted = await adminRequest(admin, "POST", `/admin-api/v1/reviews/${five.json().id}/moderation`, { action: "RESTORE", version: softDeleted.json().version, reason: "软删除后不得直接恢复" }); assert.equal(restoreDeleted.statusCode, 409);
  const audit = await migrationClient.query("SELECT action FROM admin_operation_logs WHERE target_id = $1 ORDER BY created_at", [five.json().id]); assert.deepEqual(audit.rows.map((row) => row.action), ["REVIEW_HIDE", "REVIEW_RESTORE", "REVIEW_SOFT_DELETE"]);
});

test("buyer after-sale lists use scoped signed cursors and order detail exposes server actions", { skip: !enabled }, async () => {
  const first = await seedCompletedOrder(3_000n); const second = await seedCompletedOrder(4_000n);
  await createRefund(first.orderId, 500n, "分页退款一"); await createRefund(second.orderId, 600n, "分页退款二");
  for (const [orderId, suffix] of [[first.orderId, "一"], [second.orderId, "二"]]) {
    const complaint = await userRequest(buyer, "POST", "/api/v1/complaints", { target_type: "ORDER", target_id: orderId, complaint_type: "分页投诉", description: `用于验证投诉签名分页${suffix}`, file_ids: [] }); assert.equal(complaint.statusCode, 201, complaint.body);
    const review = await userRequest(buyer, "POST", "/api/v1/reviews", { order_id: orderId, rating: 5, content: `用于验证评价签名分页${suffix}`, anonymous: false }); assert.equal(review.statusCode, 201, review.body);
  }
  for (const path of ["/api/v1/refunds", "/api/v1/complaints", "/api/v1/reviews/me"]) {
    const page = await userRequest(buyer, "GET", `${path}?limit=1`); assert.equal(page.statusCode, 200, page.body); assert.equal(page.json().items.length, 1); assert.ok(page.json().next_cursor);
    const next = await userRequest(buyer, "GET", `${path}?limit=1&cursor=${encodeURIComponent(page.json().next_cursor)}`); assert.equal(next.statusCode, 200, next.body); assert.notEqual(next.json().items[0].id, page.json().items[0].id);
  }
  const refundCursor = (await userRequest(buyer, "GET", "/api/v1/refunds?limit=1")).json().next_cursor;
  const wrongScope = await userRequest(buyer, "GET", `/api/v1/complaints?cursor=${encodeURIComponent(refundCursor)}`); assert.equal(wrongScope.statusCode, 400, wrongScope.body);
  const reviewList = await userRequest(buyer, "GET", `/api/v1/reviews/me?order_id=${first.orderId}`); const reviewDetail = await userRequest(buyer, "GET", `/api/v1/reviews/${reviewList.json().items[0].id}`); assert.equal(reviewDetail.statusCode, 200, reviewDetail.body); assert.equal(reviewDetail.json().order_id, first.orderId);
  const orderDetail = await userRequest(buyer, "GET", `/api/v1/orders/${first.orderId}`); assert.equal(orderDetail.statusCode, 200, orderDetail.body); assert.ok(orderDetail.json().available_actions.includes("VIEW_REFUND")); assert.ok(orderDetail.json().available_actions.includes("VIEW_REVIEW")); assert.equal(orderDetail.json().available_actions.includes("CREATE_REVIEW"), false);
});

test("active after-sale blocks seller completion, buyer confirmation and auto-confirm settlement", { skip: !enabled }, async () => {
  const {orderId} = await seedCompletedOrder(6000n);
  await migrationClient.query("UPDATE orders SET status='IN_SERVICE',completed_at=NULL WHERE id=$1", [orderId]);
  await createRefund(orderId, 1000n, "服务未完成");
  const blocked = await userRequest(seller,"POST",`/api/v1/seller/orders/${orderId}/complete`,{version:1});
  assert.equal(blocked.statusCode,409,blocked.body);
  await migrationClient.query("UPDATE orders SET status='PENDING_BUYER_CONFIRM',auto_confirm_at=now()-interval '1 second' WHERE id=$1",[orderId]);
  const confirm = await userRequest(buyer,"POST",`/api/v1/orders/${orderId}/confirm`,{version:1});
  assert.equal(confirm.statusCode,409,confirm.body);
  const processor = new OrderJobProcessor(database.db);
  assert.equal(await processor.process('ORDER_AUTO_CONFIRM',orderId,'blocked-confirm'),false);
  const result = await migrationClient.query("SELECT status,(SELECT count(*)::int FROM seller_incomes WHERE order_id=$1) AS income FROM orders WHERE id=$1",[orderId]);
  assert.equal(result.rows[0].status,'PENDING_BUYER_CONFIRM');assert.equal(result.rows[0].income,0);
});
test("automatic confirmation waits on the order lock and rechecks a committed after-sale", { skip: !enabled }, async () => {
  const {orderId}=await seedCompletedOrder(6000n);
  await migrationClient.query("UPDATE orders SET status='PENDING_BUYER_CONFIRM',completed_at=NULL,auto_confirm_at=now()-interval '1 second' WHERE id=$1",[orderId]);
  await migrationClient.query('BEGIN');
  try {
    await migrationClient.query("SELECT id FROM orders WHERE id=$1 FOR UPDATE",[orderId]);
    const pending=new OrderJobProcessor(database.db).process('ORDER_AUTO_CONFIRM',orderId,'race-confirm');
    await migrationClient.query("UPDATE orders SET after_sale_status='IN_PROGRESS',version=version+1 WHERE id=$1",[orderId]);
    await migrationClient.query('COMMIT');
    assert.equal(await pending,false);
    const facts=await migrationClient.query("SELECT count(*)::int AS count FROM seller_incomes WHERE order_id=$1",[orderId]);assert.equal(facts.rows[0].count,0);
  } catch(error) { await migrationClient.query('ROLLBACK');throw error; }
});

test("pending settlement cannot release during after-sale and only the unreversed remainder becomes available", { skip: !enabled }, async () => {
  const {orderId}=await seedCompletedOrder(6000n);
  const engine = new FinanceLedgerEngine(database.db);
  const income = await database.db.transaction(async tx => { const [order] = await tx.select().from(orders).where(eq(orders.id,orderId)).for("update"); return engine.recordOrderCompleted(tx,order,"test-pending-income"); });
  let refund=await createRefund(orderId,1000n,"待结算退款");
  assert.equal(await engine.makeIncomeAvailable(income.id),false);
  const approved=await userRequest(seller,"POST",`/api/v1/seller/refunds/${refund.id}/decision`,{version:refund.version,decision:"APPROVE",reason:"同意申请"});
  assert.equal(approved.statusCode,201,approved.body);refund=approved.json();
  const result=await callbackRequest(refundCallback(refund,1000n));assert.equal(result.statusCode,201,result.body);
  assert.equal(await engine.makeIncomeAvailable(income.id),true);
  assert.equal(await engine.makeIncomeAvailable(income.id),false);
  const facts=await migrationClient.query("SELECT available_amount_cent::text,reversed_amount_cent::text FROM seller_incomes WHERE id=$1",[income.id]);
  // These are legacy orders: preserve their snapshotted proportional fee policy.
  assert.deepEqual(facts.rows[0],{available_amount_cent:"4500",reversed_amount_cent:"900"});
});

async function createRefund(orderId, amount, reason) { const response = await userRequest(buyer, "POST", "/api/v1/refunds", refundPayload(orderId, amount, reason), { "idempotency-key": `refund-${randomUUID()}` }); assert.equal(response.statusCode, 201, response.body); return response.json(); }
function refundPayload(orderId, amount, reason) { return { order_id: orderId, amount_cent: amount.toString(), reason_code: "SERVICE_ISSUE", reason_text: reason, description: "集成测试退款申请" }; }
function refundCallback(refund, amount) { return { event_id: randomUUID(), event_type: "REFUND_SUCCEEDED", refund_no: refund.refund_no, provider_refund_no: refund.provider_refund_no, amount_cent: amount.toString() }; }
async function callbackRequest(payload) { const provider = new MockPaymentProvider(webhookSecret); return app.inject({ method: "POST", url: "/callbacks/v1/refunds/mock", headers: { "x-payment-signature": provider.signRefund(payload) }, payload }); }
async function adminAction(complaint, action, reason, result) { return adminRequest(admin, "POST", `/admin-api/v1/complaints/${complaint.id}/actions`, { version: complaint.version, action, reason, ...(result ? { result } : {}) }); }
async function aggregate() { const result = await migrationClient.query("SELECT rating_count, rating_sum::text, rating_avg::text, star_1_count, star_5_count FROM rating_aggregates WHERE product_id = $1", [productId]); return result.rows[0]; }

// Database integration uses synthetic completed orders and injected storage;
// this does not claim real MinIO upload or a complete user transaction journey.
test("review images validate ownership, purpose, moderation, count, unique binding and atomic rollback", {skip:!enabled}, async()=>{
  const order=await seedCompletedOrder(3000n);
  const image=await seedEvidenceFile("review-ok",{fileType:"REVIEW_IMAGE"});
  const foreign=await seedEvidenceFile("review-foreign",{fileType:"REVIEW_IMAGE",ownerUserId:seller.id});
  const pending=await seedEvidenceFile("review-pending",{fileType:"REVIEW_IMAGE",moderationStatus:"PENDING"});
  const rejected=await seedEvidenceFile("review-rejected",{fileType:"REVIEW_IMAGE",moderationStatus:"REJECTED"});
  const wrong=await seedEvidenceFile("review-purpose");
  const create=ids=>userRequest(buyer,"POST","/api/v1/reviews",{order_id:order.orderId,rating:4,anonymous:true,image_file_ids:ids});
  for(const id of [foreign,pending,rejected,wrong,randomUUID()]){const result=await create([image,id]);assert.equal(result.statusCode,404);assert.equal(result.json().code,"REVIEW_IMAGE_UNAVAILABLE");}
  assert.equal((await create([image,image])).json().code,"REVIEW_IMAGES_INVALID");
  assert.equal((await create(Array.from({length:31},()=>randomUUID()))).statusCode,400);
  assert.equal((await userRequest(buyer,"POST","/api/v1/reviews",{order_id:order.orderId,rating:4,image_urls:["https://invalid.example/not-an-upload.png"]})).statusCode,400);
  assert.equal((await migrationClient.query("SELECT count(*)::int AS n FROM reviews WHERE order_id=$1",[order.orderId])).rows[0].n,0);
  const key=`review-${randomUUID()}`,payload={order_id:order.orderId,rating:4,anonymous:true,image_file_ids:[image]};
  const result=await userRequest(buyer,"POST","/api/v1/reviews",payload,{"idempotency-key":key});assert.equal(result.statusCode,201,result.body);
  assert.equal(result.json().images[0].file_id,image);
  const ownedImages=await userRequest(buyer,"GET","/api/v1/me/files?file_type=REVIEW_IMAGE&limit=100");
  assert.equal(ownedImages.statusCode,200);
  assert.equal(ownedImages.json().items.find(item=>item.id===image).bound_review_id,result.json().id);
  assert.equal(ownedImages.json().items.find(item=>item.id===pending).bound_review_id,null);
  assert.ok(!ownedImages.json().items.some(item=>item.id===foreign));
  const replay=await userRequest(buyer,"POST","/api/v1/reviews",payload,{"idempotency-key":key});assert.deepEqual(replay.json(),result.json());
  assert.equal((await userRequest(buyer,"POST","/api/v1/reviews",{...payload,rating:2},{"idempotency-key":key})).statusCode,409);
  const second=await seedCompletedOrder(3000n);assert.equal((await userRequest(buyer,"POST","/api/v1/reviews",{...payload,order_id:second.orderId})).json().code,"REVIEW_IMAGE_ALREADY_BOUND");
  await assert.rejects(migrationClient.query("UPDATE review_images SET position=2 WHERE review_id=$1",[result.json().id]),/immutable/);
  await assert.rejects(migrationClient.query("UPDATE files SET visibility='PUBLIC' WHERE id=$1",[image]),/metadata invalid/);
  await assert.rejects(migrationClient.query("UPDATE files SET file_type='PRODUCT_IMAGE',visibility='PUBLIC' WHERE id=$1",[image]),/metadata invalid/);
  await assert.rejects(migrationClient.query("UPDATE files SET owner_user_id=$2 WHERE id=$1",[image,seller.id]),/metadata invalid/);
  assert.equal((await userRequest(buyer,"DELETE",`/api/v1/files/${image}`)).statusCode,409);
});

test("review image local count boundary and concurrent cross-order binding preserve one owner",{skip:!enabled},async()=>{
  const boundaryOrder=await seedCompletedOrder(3000n);
  const images=[];for(let index=0;index<30;index++)images.push(await seedEvidenceFile(`review-count-${index}`,{fileType:"REVIEW_IMAGE"}));
  const boundary=await userRequest(buyer,"POST","/api/v1/reviews",{order_id:boundaryOrder.orderId,rating:4,image_file_ids:images});
  assert.equal(boundary.statusCode,201);assert.deepEqual(boundary.json().images.map(image=>image.file_id),images);
  const shared=await seedEvidenceFile("review-concurrent",{fileType:"REVIEW_IMAGE"});const first=await seedCompletedOrder(3000n),second=await seedCompletedOrder(3000n);
  const responses=await Promise.all([first,second].map(order=>userRequest(buyer,"POST","/api/v1/reviews",{order_id:order.orderId,rating:4,image_file_ids:[shared]})));
  assert.deepEqual(responses.map(response=>response.statusCode).sort(),[201,409]);
  assert.equal(responses.find(response=>response.statusCode===409).json().code,"REVIEW_IMAGE_ALREADY_BOUND");
  const bindings=await migrationClient.query("SELECT (SELECT count(*)::int FROM review_images WHERE file_id=$1) AS images,(SELECT count(*)::int FROM file_usages WHERE file_id=$1 AND deleted_at IS NULL) AS usages",[shared]);assert.deepEqual(bindings.rows[0],{images:1,usages:1});
});

test("rating recomputation remains compatible with concurrent foreign-key readers", {skip:!enabled}, async()=>{
  const reviewDatabase=createDatabaseClient({connectionString:databaseUrl,application_name:"review-lock-compatibility",options:`-c search_path=${schemaName},public -c lock_timeout=500ms -c statement_timeout=3s`,max:2});
  const service=new AfterSaleService(reviewDatabase,config,new PaymentProviderRouter([paymentProvider]));
  try {
    for(const [table,id] of [["seller_profiles",sellerProfileId],["products",productId]]){
      const order=await seedCompletedOrder(3000n);
      await migrationClient.query("BEGIN");
      try {
        // FK inserts hold KEY SHARE until commit. Rating updates must serialize
        // with other writers without waiting for these non-mutating readers.
        await migrationClient.query(`SELECT id FROM ${table} WHERE id=$1 FOR KEY SHARE`,[id]);
        let created;
        try {
          created=await service.createReview(buyer.id,{orderId:order.orderId,rating:4,anonymous:true},{ip:"127.0.0.1",userAgent:"isolated-review-lock-test",requestId:randomUUID()});
        } catch(error) {
          let cause=error;let code="UNKNOWN";
          for(let depth=0;cause&&depth<6;depth++,cause=cause.cause)if(typeof cause.code==="string"&&/^[0-9A-Z]{5}$/u.test(cause.code))code=cause.code;
          assert.fail(`Review publication blocked by a foreign-key reader (${code})`);
        }
        assert.equal(created.status,"PUBLIC");
      } finally { await migrationClient.query("ROLLBACK"); }
    }
  } finally { await reviewDatabase.close(); }
});

test("concurrent reviews with distinct images publish once and retain exact rating aggregates", {skip:!enabled}, async()=>{
  const fixtures=[];
  for(let index=0;index<3;index++)fixtures.push({order:await seedCompletedOrder(3000n),image:await seedEvidenceFile(`review-independent-${index}`,{fileType:"REVIEW_IMAGE"}),rating:index+2});
  const responses=await Promise.all(fixtures.map(({order,image,rating})=>userRequest(buyer,"POST","/api/v1/reviews",{order_id:order.orderId,rating,image_file_ids:[image]})));
  assert.deepEqual(responses.map(response=>response.statusCode),[201,201,201]);
  for(const {order,image} of fixtures){
    const facts=await migrationClient.query("SELECT (SELECT count(*)::int FROM reviews WHERE order_id=$1) AS reviews,(SELECT count(*)::int FROM review_images WHERE file_id=$2) AS images,(SELECT count(*)::int FROM file_usages WHERE file_id=$2 AND deleted_at IS NULL) AS usages",[order.orderId,image]);
    assert.deepEqual(facts.rows[0],{reviews:1,images:1,usages:1});
  }
  for(const [column,id] of [["seller_id",sellerProfileId],["product_id",productId]]){
    const facts=await migrationClient.query(`SELECT (SELECT count(*)::int FROM reviews WHERE ${column}=$1 AND status='PUBLIC') AS expected_count,(SELECT coalesce(sum(rating),0)::text FROM reviews WHERE ${column}=$1 AND status='PUBLIC') AS expected_sum,rating_count,rating_sum::text FROM rating_aggregates WHERE ${column}=$1`,[id]);
    assert.equal(facts.rows.length,1);assert.equal(facts.rows[0].rating_count,facts.rows[0].expected_count);assert.equal(facts.rows[0].rating_sum,facts.rows[0].expected_sum);
  }
});

test("review image public streams stop on hide/delete, are no-store and do not expose storage grants",{skip:!enabled},async()=>{
  const order=await seedCompletedOrder(3000n);const image=await seedEvidenceFile("review-visibility",{fileType:"REVIEW_IMAGE"});
  const created=await userRequest(buyer,"POST","/api/v1/reviews",{order_id:order.orderId,rating:5,anonymous:true,image_file_ids:[image]});assert.equal(created.statusCode,201,created.body);
  const row=created.json(),url=row.images[0].content_path;
  const response=await app.inject({method:"GET",url});assert.equal(response.statusCode,200);assert.equal(response.rawPayload.length,1024);assert.match(response.headers["cache-control"],/no-store/);assert.equal(response.headers["x-content-type-options"],"nosniff");
  const list=await app.inject({method:"GET",url:`/api/v1/products/${productId}/reviews`});const item=list.json().items.find(x=>x.id===row.id);assert.equal(item.buyer_id,null);assert.deepEqual(item.images,row.images);assert.doesNotMatch(JSON.stringify(item),/object_key|bucket|signed=/);
  const my=await userRequest(buyer,"GET",`/api/v1/reviews/${row.id}`);assert.deepEqual(my.json().images,row.images);
  const management=await adminRequest(admin,"GET",`/admin-api/v1/reviews/${row.id}`);assert.deepEqual(management.json().images,row.images);
  assert.equal((await app.inject({method:"GET",url:`/api/v1/files/${image}`})).statusCode,404);
  assert.equal((await userRequest(seller,"GET",`/api/v1/files/${image}/review-preview`)).statusCode,404);
  const access=await userRequest(buyer,"GET",`/api/v1/files/${image}/access`);assert.equal(access.json().access.kind,"API_PROXY");assert.doesNotMatch(access.body,/signed=|object_key/);
  const hidden=await adminRequest(admin,"POST",`/admin-api/v1/reviews/${row.id}/moderation`,{version:row.version,action:"HIDE",reason:"本地图片可见性测试"});assert.equal(hidden.statusCode,201);
  assert.equal((await app.inject({method:"GET",url})).statusCode,404);
  assert.equal((await app.inject({method:"GET",url:`/api/v1/products/${productId}/reviews`})).json().items.some(x=>x.id===row.id),false);
  const restored=await adminRequest(admin,"POST",`/admin-api/v1/reviews/${row.id}/moderation`,{version:hidden.json().version,action:"RESTORE",reason:"恢复本地测试评价"});assert.equal(restored.statusCode,201);assert.equal((await app.inject({method:"GET",url})).statusCode,200);
  const removed=await adminRequest(admin,"POST",`/admin-api/v1/reviews/${row.id}/moderation`,{version:restored.json().version,action:"SOFT_DELETE",reason:"永久隐藏测试评价"});assert.equal(removed.statusCode,201);assert.equal((await app.inject({method:"GET",url})).statusCode,404);
});

test("review images cannot reopen the first-termination seven-day window",{skip:!enabled},async()=>{
  const order=await seedCompletedOrder(3000n);const image=await seedEvidenceFile("review-expired",{fileType:"REVIEW_IMAGE"});
  // Explicit time-boundary fixture, not a user/API workflow.
  await migrationClient.query("UPDATE orders SET rule_version='V3.1',completed_at=now()-interval '7 days' WHERE id=$1",[order.orderId]);
  const result=await userRequest(buyer,"POST","/api/v1/reviews",{order_id:order.orderId,rating:5,image_file_ids:[image]});assert.equal(result.json().code,"REVIEW_WINDOW_EXPIRED");
});

test("review refund badge uses successful cumulative facts, not approval or partial refunds",{skip:!enabled},async()=>{
  const order=await seedCompletedOrder(3000n);
  const review=(await userRequest(buyer,"POST","/api/v1/reviews",{order_id:order.orderId,rating:3})).json();
  const label=async()=>{const response=await app.inject({method:"GET",url:`/api/v1/products/${productId}/reviews?limit=100`});return response.json().items.find(item=>item.id===review.id).refund_label;};
  assert.equal(await label(),null);
  for(const amount of [1000n,2000n]){
    const created=await createRefund(order.orderId,amount,"评价退款标签接口回归");
    const approved=await userRequest(seller,"POST",`/api/v1/seller/refunds/${created.id}/decision`,{version:created.version,decision:"APPROVE",reason:"合成本地退款"});assert.equal(approved.statusCode,201);
    assert.equal(await label(),null);
    const callback=await callbackRequest(refundCallback(approved.json(),amount));assert.equal(callback.statusCode,201);
    assert.equal(await label(),amount===2000n?"FULLY_REFUNDED":null);
  }
});

test("review image upload and explicit moderation use real local MinIO; public access is revoked on hide", {skip:!realMinioEnabled}, async()=>{
  assert.ok(["127.0.0.1","localhost","[::1]"].includes(new URL(process.env.FILE_STORAGE_ENDPOINT).hostname),"Local MinIO required");
  const storage=new MinioStorageProvider({endpoint:process.env.FILE_STORAGE_ENDPOINT,region:process.env.FILE_STORAGE_REGION,accessKeyId:process.env.FILE_STORAGE_ACCESS_KEY_ID,secretAccessKey:process.env.FILE_STORAGE_SECRET_ACCESS_KEY});
  const realDatabase=createDatabaseClient({connectionString:databaseUrl,application_name:"stage-three-review-minio",options:`-c search_path=${schemaName},public`,max:2});
  const realApp=await createApiApp({config:{...config,fileStorageProvider:"minio",filePublicBucket:process.env.FILE_PUBLIC_BUCKET,filePrivateBucket:process.env.FILE_PRIVATE_BUCKET,fileQuarantineBucket:process.env.FILE_QUARANTINE_BUCKET,publicAssetBaseUrl:undefined},databaseClient:realDatabase,smsProvider:{sendCode:async()=>{}},objectStorageProvider:storage,logger:new JsonLogger("stage-three-review-minio",()=>{})});
  const locations=[];
  const request=(actor,method,url,payload)=>realApp.inject({method,url,headers:{authorization:`Bearer ${actor.token}`},...(payload===undefined?{}:{payload})});
  try {
    const reviewer=await seedAdmin("review-file",["file.read","file.review","review.read","review.manage"]);
    // Synthetic completed order fixture: this verifies the real media/API chain,
    // not the preceding payment/fulfillment journey or a human moderation decision.
    const order=await seedCompletedOrder(3000n);
    const bytes=Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082","hex");
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const policies=await realApp.inject({method:"GET",url:"/api/v1/files/policies"});
    const policy=policies.json().find(p=>p.file_type==="REVIEW_IMAGE");assert.equal(policy.maximum_count,30);assert.equal(policy.temporary_test_configuration,true);assert.equal(policy.visibility,"PRIVATE");
    const uploadResponse=await request(buyer,"POST","/api/v1/files/uploads",{file_type:"REVIEW_IMAGE",mime_type:"image/png",size_bytes:bytes.length,sha256});
    assert.equal(uploadResponse.statusCode,201,"upload request rejected; credentials suppressed");
    const id=uploadResponse.json().file.id,upload=uploadResponse.json().upload;
    locations.push((await migrationClient.query("SELECT bucket,object_key FROM files WHERE id=$1",[id])).rows[0]);
    assert.ok(["127.0.0.1","localhost","[::1]"].includes(new URL(upload.url).hostname));
    assert.equal((await fetch(upload.url,{method:upload.method,headers:upload.headers,body:bytes})).ok,true);
    const completed=await request(buyer,"POST",`/api/v1/files/${id}/complete`);assert.equal(completed.statusCode,201);assert.equal(completed.json().upload_status,"VERIFIED");assert.equal(completed.json().moderation_status,"PENDING");
    const payload={order_id:order.orderId,rating:4,image_file_ids:[id]};
    assert.equal((await request(buyer,"POST","/api/v1/reviews",payload)).json().code,"REVIEW_IMAGE_UNAVAILABLE");
    assert.equal((await request(buyer,"GET",`/api/v1/files/${id}/review-preview`)).statusCode,404);
    assert.equal((await request(reviewer,"POST",`/admin-api/v1/files/${id}/moderation`,{decision:"APPROVED",reason:"合成图片本地审核接口测试，非真实人工验收"})).statusCode,201);
    const destination=(await migrationClient.query("SELECT bucket,object_key FROM files WHERE id=$1",[id])).rows[0];locations.push(destination);assert.equal(destination.bucket,process.env.FILE_PRIVATE_BUCKET);
    const created=await request(buyer,"POST","/api/v1/reviews",payload);assert.equal(created.statusCode,201);const review=created.json();
    const preview=await realApp.inject({method:"GET",url:review.images[0].content_path});assert.equal(preview.statusCode,200);assert.equal(createHash("sha256").update(preview.rawPayload).digest("hex"),sha256);
    assert.equal((await realApp.inject({method:"GET",url:`/api/v1/files/${id}`})).statusCode,404);
    assert.equal((await request(reviewer,"POST",`/admin-api/v1/reviews/${review.id}/moderation`,{version:review.version,action:"HIDE",reason:"合成评价公开撤回测试"})).statusCode,201);
    assert.equal((await realApp.inject({method:"GET",url:review.images[0].content_path})).statusCode,404);
  } finally {
    try {
      for(const location of locations){await storage.deleteObject({bucket:location.bucket,objectKey:location.object_key});await assert.rejects(storage.headObject({bucket:location.bucket,objectKey:location.object_key}));}
    } finally {await realApp.close();}
  }
});

// Isolated state-machine integration fixtures start at a synthetic paid order;
// these are not claimed as a login-to-payment/API user journey.
async function seedCaseOrder(amount=10000n){
  const fixture=await seedCompletedOrder(amount);
  await migrationClient.query("UPDATE orders SET status='PENDING_SERVICE',completed_at=NULL,rule_version='V3.1',game_snapshot='PEACE_ELITE',service_starts_at=NULL,service_ends_at=NULL,sku_duration_minutes_snapshot=NULL,fulfillment_seconds_snapshot=86400,fulfillment_due_at=now()+interval '1 day' WHERE id=$1",[fixture.orderId]);
  return fixture;
}
const caseMetadata={ip:"127.0.0.1",userAgent:"case-integration",requestId:"case-integration"};
function caseService(){return new AfterSaleService(database,config,new PaymentProviderRouter([paymentProvider]));}
async function openCase(service,amount=3000n){const order=await seedCaseOrder();const row=await service.cases.create(buyer.id,{orderId:order.orderId,amountCent:amount,reasonCode:"LOCAL_TEST",reasonText:"临时本地售后原因"},`case-${randomUUID()}`,caseMetadata);return {order,row};}
async function actCase(service,actor,row,command){return service.cases.act(actor,row.id,row.version,command,caseMetadata);}

test("V3.1 cases preserve clock and consumed limits, isolate permissions and invalidate old jobs",{skip:!enabled},async()=>{
  const service=caseService();const opened=await openCase(service);let row=opened.row;
  const paused=row.paused_at,oldDeadline=row.deadline_at,oldVersion=row.version;
  const offer={kind:"REFUND",amount_cent:"2000",retained_amount_cent:"8000",recognized_delivery:"部分交付",remaining_obligations_terminated:true};
  row=await actCase(service,{userId:seller.id},row,{action:"OFFER",offer});assert.equal(row.state,"S02");
  for(let i=0;i<2;i++){row=await actCase(service,{userId:buyer.id},row,{action:"MODIFY",amountCent:3000n,reasonCode:"LOCAL_TEST",reasonText:"修正本地说明"});assert.equal(row.paused_at,paused);assert.equal(row.negotiation_rounds,1);}
  await assert.rejects(actCase(service,{userId:buyer.id},row,{action:"MODIFY",amountCent:3000n,reasonCode:"LOCAL_TEST",reasonText:"超过次数"}),error=>error.code==="CASE_MODIFICATION_LIMIT");
  assert.equal(await service.cases.timeout(row.id,{case_version:oldVersion,deadline_at:oldDeadline.toISOString()},new Date(oldDeadline.getTime()+1)),false);
  const outsider=await seedUser("case-outsider");await assert.rejects(service.cases.get({userId:outsider.id},row.id),error=>error.code==="CASE_NOT_FOUND");
  row=await actCase(service,{userId:buyer.id},row,{action:"WITHDRAW",reason:"测试撤回"});assert.equal(row.state,"S04");
  const facts=(await migrationClient.query("SELECT status,after_sale_status,fulfillment_due_at,receipt_extension_used FROM orders WHERE id=$1",[opened.order.orderId])).rows[0];assert.equal(facts.status,"PENDING_SERVICE");assert.equal(facts.after_sale_status,"RESOLVED");assert.equal(facts.receipt_extension_used,false);
  await assert.rejects(migrationClient.query("UPDATE after_sale_cases SET version=version+1,data=jsonb_set(data,'{negotiation_rounds}','0') WHERE id=$1",[row.id]),/allowance cannot reset/);
  await assert.rejects(migrationClient.query("DELETE FROM after_sale_case_events WHERE case_id=$1",[row.id]),/append-only/);
});

test("case offers never accept silence: first expiry waits, second expiry enters platform and stops withdrawal",{skip:!enabled},async()=>{
  const service=caseService();let {row}=await openCase(service);
  const offer={kind:"REFUND",amount_cent:"2000",retained_amount_cent:"8000",recognized_delivery:"部分交付",remaining_obligations_terminated:true};
  row=await actCase(service,{userId:seller.id},row,{action:"OFFER",offer});
  const firstAt=new Date(row.deadline_at.getTime()+1);await service.cases.timeout(row.id,{case_version:row.version,deadline_at:row.deadline_at.toISOString()},firstAt);
  row=await service.cases.get({userId:buyer.id},row.id);assert.equal(row.state,"S05");
  row=await actCase(service,{userId:seller.id},row,{action:"OFFER",offer});
  await service.cases.timeout(row.id,{case_version:row.version,deadline_at:row.deadline_at.toISOString()},new Date(row.deadline_at.getTime()+1));
  row=await service.cases.get({userId:buyer.id},row.id);assert.equal(row.state,"P01");assert.equal(row.negotiation_rounds,2);
  await assert.rejects(actCase(service,{userId:buyer.id},row,{action:"WITHDRAW",reason:"介入后不能撤销"}),error=>error.code==="CASE_WITHDRAW_FORBIDDEN");
  const operations=await migrationClient.query("SELECT count(*)::int AS n FROM financial_transfer_operations WHERE refund_id=$1",[row.id]);assert.equal(operations.rows[0].n,0);
});

test("case timeout approval persists original-channel intent before Mock submission and callback settles once",{skip:!enabled},async()=>{
  const service=caseService();let {row}=await openCase(service);const calls=paymentProvider.refundCalls.length;
  assert.equal(await service.cases.timeout(row.id,{case_version:row.version,deadline_at:row.deadline_at.toISOString()},new Date(row.deadline_at.getTime()+1)),true);
  assert.equal(paymentProvider.refundCalls.length,calls);
  row=await service.cases.get({userId:buyer.id},row.id);assert.equal(row.state,"EXECUTION_PENDING");
  const operation=(await migrationClient.query("SELECT id,channel,status FROM financial_transfer_operations WHERE refund_id=$1",[row.id])).rows[0];assert.equal(operation.channel,"WECHAT_APP");
  await service.recoverRefund(operation.id);row=await service.cases.get({userId:buyer.id},row.id);assert.equal(row.state,"F01");
  const refund=(await userRequest(buyer,"GET",`/api/v1/refunds/${row.id}`)).json();
  const callback=refundCallback(refund,3000n);assert.equal((await callbackRequest(callback)).statusCode,201);assert.equal((await callbackRequest({...callback,event_id:randomUUID()})).json().duplicate,true);
  assert.equal((await service.cases.get({userId:buyer.id},row.id)).state,"F02");
  const balances=await migrationClient.query("SELECT count(*)::int AS n FROM ledger_transactions t WHERE (SELECT coalesce(sum(CASE WHEN side='DEBIT' THEN amount_cent ELSE -amount_cent END),0) FROM ledger_entries WHERE transaction_id=t.id)<>0");assert.equal(balances.rows[0].n,0);
});

test("remedy keeps the same frozen case, requires five approved screenshots and shares one extension",{skip:!enabled},async()=>{
  const service=caseService();const opened=await openCase(service);let row=opened.row;
  row=await actCase(service,{userId:seller.id},row,{action:"OFFER",offer:{kind:"REMEDY",content:"补齐服务",quantity:"一份",standard:"按原商品描述核验",fulfillment_seconds:86400}});
  row=await actCase(service,{userId:buyer.id},row,{action:"RESPOND",offerId:row.offer.id,accept:true});assert.equal(row.state,"R01");
  const ids=[];for(let i=0;i<5;i++)ids.push(await seedEvidenceFile(`remedy-${i}`,{fileType:"ORDER_FULFILLMENT_IMAGE",ownerUserId:seller.id}));
  await assert.rejects(actCase(service,{userId:seller.id},row,{action:"SUBMIT_REMEDY",fileIds:ids.slice(0,4)}),error=>error.code==="ORDER_EVIDENCE_IMAGES_REQUIRED");
  row=await actCase(service,{userId:seller.id},row,{action:"SUBMIT_REMEDY",fileIds:ids});assert.equal(row.state,"R02");assert.equal(row.id,opened.row.id);
  let facts=(await migrationClient.query("SELECT after_sale_status,version FROM orders WHERE id=$1",[opened.order.orderId])).rows[0];assert.equal(facts.after_sale_status,"IN_PROGRESS");
  assert.equal((await userRequest(buyer,"POST",`/api/v1/orders/${opened.order.orderId}/confirm`,{version:facts.version})).statusCode,409);
  const before=row.deadline_at;row=await actCase(service,{userId:buyer.id},row,{action:"EXTEND_REMEDY"});assert.equal(row.deadline_at-before,86400000);
  await assert.rejects(actCase(service,{userId:buyer.id},row,{action:"EXTEND_REMEDY"}),error=>error.code==="ORDER_EXTENSION_EXHAUSTED");
  const results=await Promise.allSettled([actCase(service,{userId:buyer.id},row,{action:"CONFIRM_REMEDY"}),actCase(service,{userId:buyer.id},row,{action:"CONFIRM_REMEDY"})]);assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  facts=(await migrationClient.query("SELECT o.status,o.after_sale_status,(SELECT count(*)::int FROM seller_incomes WHERE order_id=o.id) AS income FROM orders o WHERE id=$1",[opened.order.orderId])).rows[0];assert.deepEqual(facts,{status:"COMPLETED",after_sale_status:"RESOLVED",income:1});
});

test("versioned platform decisions require two explicit acceptances, and appeals fence old execution",{skip:!enabled},async()=>{
  const service=caseService();let {row}=await openCase(service);
  row=await actCase(service,{userId:buyer.id},row,{action:"ESCALATE",reason:"请求平台核验"});
  row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"MATERIALS_COMPLETE"});
  const decision={outcome:"REFUND",amount_cent:"2000",facts:"核对本地合成订单",evidence_file_ids:[],rule_basis:"V3.1 B17",liability:"部分未履约",reason:"合成裁决测试",remaining_obligations:"剩余义务终止",execution_conditions:"有效裁决后沿原渠道退款"};
  row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"DECIDE",decision});
  const oldVersion=row.version,oldDeadline=row.deadline_at,decisionId=row.decision.id;
  row=await actCase(service,{userId:buyer.id},row,{action:"ACCEPT_DECISION",decisionId});assert.equal(row.state,"P02");
  row=await actCase(service,{userId:seller.id},row,{action:"APPEAL",decisionId,reason:"请求复核事实",fileIds:[]});assert.equal(row.state,"P03");
  assert.equal(await service.cases.timeout(row.id,{case_version:oldVersion,deadline_at:oldDeadline.toISOString()},new Date(oldDeadline.getTime()+1)),false);
  row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"MATERIALS_COMPLETE"});
  await assert.rejects(actCase(service,{adminId:admin.id,supervisor:false},row,{action:"DECIDE",decision}),error=>error.code==="CASE_REVIEWER_SEPARATION");
  const second=await seedAdmin("case-reviewer",["refund.manage"]);
  row=await actCase(service,{adminId:second.id,supervisor:false},row,{action:"DECIDE",decision});
  await assert.rejects(actCase(service,{userId:seller.id},row,{action:"APPEAL",decisionId:row.decision.id,reason:"没有新证据",fileIds:[]}),error=>error.code==="CASE_NEW_EVIDENCE_REQUIRED");
  const ordinary=await userRequest(seller,"POST",`/api/v1/seller/refunds/${row.id}/decision`,{version:0,decision:"APPROVE",reason:"不能绕过裁决"});assert.equal(ordinary.json().code,"CASE_ACTION_REQUIRED");
});

test("special award waits for the whole amount, recovers from future income and refunds once on original channel",{skip:!enabled},async()=>{
  // Historical completed/withdrawn fixture, not a claimed login-to-withdrawal API journey.
  const previous={seller,sellerProfileId,productId,skuId};
  seller=await seedUser("special-funding-seller");await seedCatalog();
  try {
    const order=await seedCompletedOrder(20000n);
    await migrationClient.query("UPDATE orders SET rule_version='V3.1',game_snapshot='PEACE_ELITE',service_starts_at=NULL,service_ends_at=NULL,sku_duration_minutes_snapshot=NULL,fulfillment_seconds_snapshot=86400 WHERE id=$1",[order.orderId]);
    const ledger=new FinanceLedgerEngine(database.db);
    const [orderRow]=await database.db.select().from(orders).where(eq(orders.id,order.orderId));
    const income=await database.db.transaction(tx=>ledger.recordOrderCompleted(tx,orderRow));
    await database.db.transaction(async tx=>{
      const pending=await ensureSellerLedgerAccount(tx,sellerProfileId,"SELLER_PENDING"),withdrawn=await ensureSellerLedgerAccount(tx,sellerProfileId,"SELLER_WITHDRAWN");
      await postLedgerTransaction(tx,{transactionType:"ADJUSTMENT",sourceType:"ORDER",sourceId:order.orderId,idempotencyKey:`fixture:withdrawn:${order.orderId}`,description:"Historical withdrawn balance fixture, not API evidence",entries:[{accountId:pending.id,side:"DEBIT",amountCent:12000n,memo:"fixture"},{accountId:withdrawn.id,side:"CREDIT",amountCent:12000n,memo:"fixture"}]});
      await tx.update(sellerIncomes).set({withdrawnAmountCent:12000n,version:income.version+1}).where(eq(sellerIncomes.id,income.id));
    });
    const service=caseService(),evidence=await seedEvidenceFile("special-contact");
    let row=await service.cases.createSpecial(admin.id,{orderId:order.orderId,amountCent:20000n,reasonCode:"LOCAL_SERIOUS",reasonText:"客服已核验严重问题和首次联系凭证",contactAt:new Date(),fileIds:[evidence]},`special-${randomUUID()}`,caseMetadata);
    assert.equal(row.state,"P01");assert.equal(row.funding.held_cent,"6000");assert.equal(row.funding.commission_reserved_cent,"2000");assert.equal(row.funding.funding_gap_cent,"12000");
    row=await actCase(service,{adminId:admin.id,supervisor:true},row,{action:"MATERIALS_COMPLETE"});
    row=await actCase(service,{adminId:admin.id,supervisor:true},row,{action:"DECIDE",decision:{outcome:"REFUND",amount_cent:"20000",facts:"合成历史提现订单",evidence_file_ids:[evidence],rule_basis:"V3.1特殊申诉与追偿",liability:"商家责任",reason:"核验支持整笔退款",remaining_obligations:"已终止",execution_conditions:"足额后才发原渠道，不垫付、不拆分"}});
    const decisionId=row.decision.id;row=await actCase(service,{userId:buyer.id},row,{action:"ACCEPT_DECISION",decisionId});
    row=await actCase(service,{userId:seller.id},row,{action:"ACCEPT_DECISION",decisionId});assert.equal(row.state,"EXECUTION_PENDING");
    const summary=await userRequest(seller,"GET","/api/v1/seller/finance/summary");assert.equal(summary.statusCode,200,summary.body);assert.equal(summary.json().pending_recovery_cent,"12000");assert.equal(summary.json().withdrawal_paused,true);
    const blocked=await userRequest(buyer,"POST","/api/v1/orders/preview",{product_id:productId,sku_id:skuId,quantity:1,service_starts_at:new Date(Date.now()+86400000).toISOString()});assert.equal(blocked.json().code,"SELLER_PENDING_RECOVERY");
    assert.equal((await migrationClient.query("SELECT count(*)::int AS n FROM financial_transfer_operations WHERE refund_id=$1",[row.id])).rows[0].n,0);
    assert.equal((await migrationClient.query("SELECT refunded_amount_cent::text AS n FROM orders WHERE id=$1",[order.orderId])).rows[0].n,"0");
    const future=await seedCompletedOrder(15000n);const [futureRow]=await database.db.select().from(orders).where(eq(orders.id,future.orderId));await database.db.transaction(tx=>ledger.recordOrderCompleted(tx,futureRow));
    const responses=await Promise.allSettled([actCase(service,{adminId:admin.id,supervisor:true},row,{action:"RECHECK_FUNDING",reason:"核验后续收益回款"}),actCase(service,{adminId:admin.id,supervisor:true},row,{action:"RECHECK_FUNDING",reason:"并发核验后续收益"})]);assert.equal(responses.filter(item=>item.status==="fulfilled").length,1);
    row=await service.cases.get({userId:buyer.id},row.id);assert.equal(row.funding.funding_gap_cent,"0");
    const operations=await migrationClient.query("SELECT channel,amount_cent::text AS amount FROM financial_transfer_operations WHERE refund_id=$1",[row.id]);assert.deepEqual(operations.rows,[{channel:"WECHAT_APP",amount:"20000"}]);
    await service.driveCaseRefund(row.id);const refund=(await userRequest(buyer,"GET",`/api/v1/refunds/${row.id}`)).json();
    const response=await callbackRequest(refundCallback(refund,20000n));assert.equal(response.statusCode,201,response.body);
    assert.equal((await callbackRequest({...refundCallback(refund,20000n),event_id:randomUUID()})).json().duplicate,true);
    const facts=(await migrationClient.query("SELECT o.completed_at=$2::timestamptz AS original_time,o.refunded_amount_cent::text AS refunded,(SELECT outstanding_amount_cent::text FROM seller_liabilities WHERE refund_id=$3) AS debt,(SELECT sum(after_sale_held_cent)::text FROM seller_incomes WHERE seller_id=o.seller_id) AS held FROM orders o WHERE o.id=$1",[order.orderId,orderRow.completedAt,row.id])).rows[0];
    assert.deepEqual(facts,{original_time:true,refunded:"20000",debt:"0",held:"0"});
    assert.equal((await migrationClient.query("SELECT count(*)::int AS n FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING sum(CASE WHEN side='DEBIT' THEN amount_cent ELSE -amount_cent END)<>0) unbalanced")).rows[0].n,0);
  } finally {({seller,sellerProfileId,productId,skuId}=previous);}
});

test("special intake rejects expired contact and unapproved evidence; no-refund closes only its hold",{skip:!enabled},async()=>{
  const order=await seedCompletedOrder(3000n);await migrationClient.query("UPDATE orders SET rule_version='V3.1',game_snapshot='PEACE_ELITE',service_starts_at=NULL,service_ends_at=NULL,sku_duration_minutes_snapshot=NULL,fulfillment_seconds_snapshot=86400,completed_at=now()-interval '8 days' WHERE id=$1",[order.orderId]);
  const service=caseService(),evidence=await seedEvidenceFile("special-no-refund"),[original]=await database.db.select().from(orders).where(eq(orders.id,order.orderId));
  const input={orderId:order.orderId,amountCent:1000n,reasonCode:"LOCAL_SERIOUS",reasonText:"人工核验联系记录",contactAt:new Date(),fileIds:[evidence]};
  await assert.rejects(service.cases.createSpecial(admin.id,input,`special-${randomUUID()}`,caseMetadata),error=>error.code==="CASE_SPECIAL_CONTACT_EXPIRED");
  input.contactAt=new Date(original.completedAt.getTime()+3600000);
  const pending=await seedEvidenceFile("special-unapproved",{moderationStatus:"PENDING"});
  await assert.rejects(service.cases.createSpecial(admin.id,{...input,fileIds:[pending]},`special-${randomUUID()}`,caseMetadata),error=>error.code==="CASE_EVIDENCE_INVALID");
  let row=await service.cases.createSpecial(admin.id,input,`special-${randomUUID()}`,caseMetadata);
  row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"MATERIALS_COMPLETE"});
  row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"DECIDE",decision:{outcome:"NO_REFUND",amount_cent:"0",facts:"证据不支持诉求",evidence_file_ids:[evidence],rule_basis:"V3.1特殊申诉",liability:"无可认定商家责任",reason:"不支持特殊退款",remaining_obligations:"原交易终结不恢复履约",execution_conditions:"仅释放本案资金"}});
  const decisionId=row.decision.id;row=await actCase(service,{userId:buyer.id},row,{action:"ACCEPT_DECISION",decisionId});row=await actCase(service,{userId:seller.id},row,{action:"ACCEPT_DECISION",decisionId});assert.equal(row.state,"F06");
  const [current]=await database.db.select().from(orders).where(eq(orders.id,order.orderId));assert.equal(current.status,"COMPLETED");assert.equal(current.completedAt.getTime(),original.completedAt.getTime());assert.equal(current.refundedAmountCent,0n);
});

test("case HTTP actions enforce identity, strict input, idempotency and bounded private history",{skip:!enabled},async()=>{
  const order=await seedCaseOrder(),key=`case-http-${randomUUID()}`;
  const payload={order_id:order.orderId,amount_cent:"1000",reason_code:"LOCAL_TEST",reason_text:"本地接口回归"};
  const response=await userRequest(buyer,"POST","/api/v1/after-sale/cases",payload,{"idempotency-key":key});assert.equal(response.statusCode,201,response.body);const row=response.json();
  assert.equal((await userRequest(buyer,"POST","/api/v1/after-sale/cases",payload,{"idempotency-key":key})).json().id,row.id);
  const outsider=await seedUser("case-http-outsider");assert.equal((await userRequest(outsider,"GET",`/api/v1/after-sale/cases/${row.id}/history`)).statusCode,404);
  const actionKey=`case-act-${randomUUID()}`,command={action:"ESCALATE",version:row.version,reason:"核验接口权限"};
  assert.equal((await userRequest(buyer,"POST",`/api/v1/after-sale/cases/${row.id}/actions`,{...command,supervisor:true},{"idempotency-key":actionKey})).statusCode,400);
  const action=await userRequest(buyer,"POST",`/api/v1/after-sale/cases/${row.id}/actions`,command,{"idempotency-key":actionKey});assert.equal(action.statusCode,201,action.body);
  const replay=await userRequest(buyer,"POST",`/api/v1/after-sale/cases/${row.id}/actions`,command,{"idempotency-key":actionKey});assert.equal(replay.statusCode,201);assert.equal(replay.json().current_case.version,action.json().current_case.version);
  const other=await openCase(caseService());const conflict=await userRequest(buyer,"POST",`/api/v1/after-sale/cases/${other.row.id}/actions`,{...command,version:other.row.version},{"idempotency-key":actionKey});assert.equal(conflict.json().code,"IDEMPOTENCY_KEY_CONFLICT");
  const reader=await seedAdmin("case-read-only",["refund.read"]);assert.equal((await userRequest(reader,"POST",`/admin-api/v1/after-sale/cases/${row.id}/actions`,{action:"MATERIALS_COMPLETE",version:action.json().current_case.version,reason:"无写权限"},{"idempotency-key":randomUUID()})).statusCode,403);
  const events=await userRequest(buyer,"GET",`/api/v1/after-sale/cases/${row.id}/history`);assert.equal(events.statusCode,200);assert.deepEqual(events.json().items.map(item=>item.action),["CREATE","ESCALATE"]);
  assert.equal((await userRequest(buyer,"GET",`/api/v1/after-sale/cases/${row.id}/history?after_version=-2`)).statusCode,400);
  const detail=await userRequest(buyer,"GET",`/api/v1/orders/${order.orderId}`);assert.equal(detail.json().after_sale_cases[0].id,row.id);assert.equal(detail.json().after_sale_capabilities.versioned_cases,true);
  assert.equal((await userRequest(outsider,"GET","/api/v1/after-sale/cases")).json().items.length,0);
  assert.equal((await userRequest(buyer,"GET","/api/v1/after-sale/cases?limit=101")).statusCode,400);
  const proof=await seedEvidenceFile("private-unredacted-case-evidence");
  const evidence=await userRequest(buyer,"POST",`/api/v1/after-sale/cases/${row.id}/actions`,{action:"ADD_EVIDENCE",version:action.json().current_case.version,file_ids:[proof]},{"idempotency-key":randomUUID()});assert.equal(evidence.statusCode,201,evidence.body);
  assert.equal((await userRequest(seller,"GET",`/api/v1/files/after-sale-evidence/${row.id}/${proof}/access`)).statusCode,404);
  const administrative=await userRequest(admin,"GET",`/admin-api/v1/after-sale/cases/${row.id}`);
  assert.ok(administrative.json().available_actions.includes("MARK_EVIDENCE_SHAREABLE"));
  assert.ok(!evidence.json().current_case.available_actions.includes("MARK_EVIDENCE_SHAREABLE"));
  const deniedRead=await userRequest(reader,"GET",`/admin-api/v1/after-sale/cases/${row.id}`);
  assert.ok(!deniedRead.json().available_actions.includes("MARK_EVIDENCE_SHAREABLE"));
  const unconfirmed=await userRequest(admin,"POST",`/admin-api/v1/after-sale/cases/${row.id}/actions`,{action:"MARK_EVIDENCE_SHAREABLE",version:evidence.json().current_case.version,file_ids:[proof],sensitive_information_obscured:false,reason:"不能自动确认隐私遮挡"},{"idempotency-key":randomUUID()});assert.equal(unconfirmed.statusCode,400);
  const mark=await userRequest(admin,"POST",`/admin-api/v1/after-sale/cases/${row.id}/actions`,{action:"MARK_EVIDENCE_SHAREABLE",version:evidence.json().current_case.version,file_ids:[proof],sensitive_information_obscured:true,reason:"人工核验本地合成材料已遮挡敏感信息"},{"idempotency-key":randomUUID()});assert.equal(mark.statusCode,201,mark.body);assert.deepEqual(mark.json().current_case.counterparty_visible_evidence_ids,[proof]);
  assert.ok(!mark.json().current_case.available_actions.includes("MARK_EVIDENCE_SHAREABLE"));
});

test("second appeal requires new evidence and supervisor, is final, and no-refund remedy keeps frozen clock",{skip:!enabled},async()=>{
  const service=caseService();let {row}=await openCase(service);
  row=await actCase(service,{userId:buyer.id},row,{action:"ESCALATE",reason:"请求核验"});row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"MATERIALS_COMPLETE"});
  const decision={outcome:"NO_REFUND",amount_cent:"0",facts:"第一次核验",evidence_file_ids:[],rule_basis:"V3.1两级复核",liability:"证据不足",reason:"暂不支持退款",remaining_obligations:"恢复原履约",execution_conditions:"等候申诉期或双方接受"};
  row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"DECIDE",decision});row=await actCase(service,{userId:buyer.id},row,{action:"APPEAL",decisionId:row.decision.id,reason:"第一次复核",fileIds:[]});
  const reviewer=await seedAdmin("case-final-reviewer",["refund.manage"]);row=await actCase(service,{adminId:reviewer.id,supervisor:false},row,{action:"MATERIALS_COMPLETE"});row=await actCase(service,{adminId:reviewer.id,supervisor:false},row,{action:"DECIDE",decision});
  const proof=await seedEvidenceFile("new-second-appeal");row=await actCase(service,{userId:buyer.id},row,{action:"APPEAL",decisionId:row.decision.id,reason:"新证据第二次复核",fileIds:[proof]});assert.equal(row.state,"P04");
  row=await actCase(service,{adminId:reviewer.id,supervisor:false},row,{action:"MATERIALS_COMPLETE"});await assert.rejects(actCase(service,{adminId:reviewer.id,supervisor:false},row,{action:"DECIDE",decision}),error=>error.code==="CASE_SUPERVISOR_REQUIRED");
  row=await actCase(service,{adminId:reviewer.id,supervisor:true},row,{action:"DECIDE",decision:{...decision,evidence_file_ids:[proof]}});assert.equal(row.state,"S04");await assert.rejects(actCase(service,{userId:buyer.id},row,{action:"APPEAL",decisionId:row.decision.id,reason:"不能第三次申诉",fileIds:[proof]}),error=>error.code==="CASE_STATE_INVALID");
  ({row}=await openCase(service));row=await actCase(service,{userId:seller.id},row,{action:"OFFER",offer:{kind:"REMEDY",content:"继续原案交付",quantity:"一份",standard:"原商品标准",fulfillment_seconds:3600}});row=await actCase(service,{userId:buyer.id},row,{action:"RESPOND",offerId:row.offer.id,accept:true});
  const evidence=[];for(let index=0;index<5;index++)evidence.push(await seedEvidenceFile(`remedy-reject-${index}`,{fileType:"ORDER_FULFILLMENT_IMAGE",ownerUserId:seller.id}));row=await actCase(service,{userId:seller.id},row,{action:"SUBMIT_REMEDY",fileIds:evidence});
  const deadline=row.deadline_at;row=await actCase(service,{userId:buyer.id},row,{action:"ESCALATE",reason:"再次争议继续本案"});row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"MATERIALS_COMPLETE"});row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"DECIDE",decision});const id=row.decision.id;row=await actCase(service,{userId:buyer.id},row,{action:"ACCEPT_DECISION",decisionId:id});row=await actCase(service,{userId:seller.id},row,{action:"ACCEPT_DECISION",decisionId:id});assert.equal(row.state,"R02");assert.ok(row.deadline_at>=deadline);assert.equal((await migrationClient.query("SELECT after_sale_status FROM orders WHERE id=$1",[row.order_id])).rows[0].after_sale_status,"IN_PROGRESS");
});

test("overdue remedy review blocks auto-settlement without exhausting the original deadline",{skip:!enabled},async()=>{
  const service=caseService();let {row}=await openCase(service);row=await actCase(service,{userId:seller.id},row,{action:"OFFER",offer:{kind:"REMEDY",content:"补齐交付",quantity:"一份",standard:"原商品约定",fulfillment_seconds:3600}});row=await actCase(service,{userId:buyer.id},row,{action:"RESPOND",offerId:row.offer.id,accept:true});
  const ids=[];for(let i=0;i<5;i++)ids.push(await seedEvidenceFile(`review-block-${i}`,{fileType:"ORDER_FULFILLMENT_IMAGE",ownerUserId:seller.id}));row=await actCase(service,{userId:seller.id},row,{action:"SUBMIT_REMEDY",fileIds:ids});
  // Explicit review-hold fault injection, not an API approval simulation.
  await migrationClient.query("UPDATE orders SET evidence_review_pending=true,version=version+1 WHERE id=$1",[row.order_id]);
  const payload={case_version:row.version,deadline_at:row.deadline_at.toISOString()},now=new Date(row.deadline_at.getTime()+1);
  assert.equal(await service.cases.timeout(row.id,payload,now),false);assert.equal(await service.cases.timeout(row.id,payload,now),false);
  assert.equal((await migrationClient.query("SELECT count(*)::int AS n FROM scheduled_jobs WHERE target_id=$1 AND job_key LIKE '%review-recheck%'",[row.id])).rows[0].n,1);
  assert.equal((await service.cases.get({userId:buyer.id},row.id)).deadline_at.getTime(),row.deadline_at.getTime());
  assert.equal((await migrationClient.query("SELECT count(*)::int AS n FROM seller_incomes WHERE order_id=$1",[row.order_id])).rows[0].n,0);
  await migrationClient.query("UPDATE orders SET evidence_review_pending=false,version=version+1 WHERE id=$1",[row.order_id]);
  assert.equal(await service.cases.timeout(row.id,payload,now),true);assert.equal(await service.cases.timeout(row.id,payload,now),false);
});

test("new-case definitive failure retries the approved amount only and fences a late old callback",{skip:!enabled},async()=>{
  const service=caseService();let {row}=await openCase(service);
  row=await actCase(service,{userId:seller.id},row,{action:"APPROVE",reason:"同意当前申请"});await service.driveCaseRefund(row.id);
  row=await service.cases.get({userId:buyer.id},row.id);await assert.rejects(actCase(service,{adminId:admin.id,supervisor:false},row,{action:"RETRY_REFUND",reason:"处理中不得重发"}),error=>error.code==="CASE_STATE_INVALID");
  const processing=(await userRequest(buyer,"GET",`/api/v1/refunds/${row.id}`)).json(),failed={...refundCallback(processing,3000n),event_type:"REFUND_FAILED"};assert.equal((await callbackRequest(failed)).statusCode,201);
  row=await service.cases.get({userId:buyer.id},row.id);assert.equal(row.state,"EXECUTION_PENDING");
  row=await actCase(service,{adminId:admin.id,supervisor:false},row,{action:"RETRY_REFUND",reason:"原渠道明确失败，保持原金额安全重试"});await service.driveCaseRefund(row.id);
  const retried=(await userRequest(buyer,"GET",`/api/v1/refunds/${row.id}`)).json();assert.notEqual(retried.provider_refund_no,processing.provider_refund_no);assert.equal(retried.approved_amount_cent,"3000");
  assert.equal((await callbackRequest({...failed,event_id:randomUUID()})).statusCode,409);assert.equal((await callbackRequest(refundCallback(retried,3000n))).statusCode,201);
  assert.equal((await service.cases.get({userId:buyer.id},row.id)).state,"F02");
});

async function seedCompletedOrder(amount) {
  const orderId = randomUUID(); const paymentId = randomUUID(); const orderNo = `XZAS${randomUUID().replaceAll("-", "").slice(0, 24)}`; const paymentNo = `PAYAS${randomUUID().replaceAll("-", "").slice(0, 24)}`; const platformFee = amount / 10n;
  await migrationClient.query("INSERT INTO orders (id, order_no, buyer_id, seller_user_id, seller_id, product_id, sku_id, product_title_snapshot, product_image_snapshot, product_description_snapshot, seller_name_snapshot, sku_name_snapshot, sku_description_snapshot, sku_price_cent_snapshot, sku_duration_minutes_snapshot, quantity, total_amount_cent, discount_cent, payable_amount_cent, paid_amount_cent, commission_rate_bps_snapshot, platform_fee_cent, seller_income_cent, service_starts_at, service_ends_at, expires_at, status, payment_status, after_sale_status, paid_at, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'售后测试服务','','服务快照','售后测试陪玩','一小时服务','测试规格',$8,60,1,$8,0,$8,$8,1000,$9,$10,now()-interval '2 hours',now()-interval '1 hour',now()-interval '3 hours','COMPLETED','PAID','NONE',now()-interval '3 hours',now()-interval '30 minutes')", [orderId, orderNo, buyer.id, seller.id, sellerProfileId, productId, skuId, amount.toString(), platformFee.toString(), (amount - platformFee).toString()]);
  await migrationClient.query("INSERT INTO payments (id, order_id, payment_no, channel, provider_transaction_id, idempotency_key, amount_cent, status, paid_at) VALUES ($1,$2,$3,'WECHAT_APP',$4,$5,$6,'PAID',now()-interval '3 hours')", [paymentId, orderId, paymentNo, `tx-${randomUUID()}`, `payment-${randomUUID()}`, amount.toString()]); return { orderId, paymentId };
}

async function seedCatalog() { sellerProfileId = randomUUID(); productId = randomUUID(); skuId = randomUUID(); await migrationClient.query("INSERT INTO seller_profiles (id,user_id,status,seller_nickname,accepting_orders,approved_at) VALUES ($1,$2,'APPROVED','售后测试陪玩',true,now())", [sellerProfileId, seller.id]); await migrationClient.query("INSERT INTO products (id,seller_id,title,description,status,min_price_cent,approved_at) VALUES ($1,$2,'售后测试服务','退款投诉评价集成测试','ON_SALE',2000,now())", [productId, sellerProfileId]); await migrationClient.query("INSERT INTO product_skus (id,product_id,sku_name,description,price_cent,duration_minutes,status) VALUES ($1,$2,'一小时服务','测试规格',2000,60,'ACTIVE')", [skuId, productId]); }
async function seedEvidenceFile(label, options = {}) { const id = randomUUID(); await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility) VALUES ($1,$2,'test',$3,$4,'image/png',1024,$5,'VERIFIED',$6,$7)", [id, options.ownerUserId ?? buyer.id, `evidence/${label}-${id}.png`, options.fileType ?? "COMPLAINT_EVIDENCE", randomUUID().replaceAll("-", "").repeat(2), options.moderationStatus ?? "APPROVED", options.visibility ?? "PRIVATE"]); return id; }
async function seedUser(label) { const id = randomUUID(); const sessionId = randomUUID(); await migrationClient.query("INSERT INTO users (id,phone_ciphertext,phone_hash,phone_mask,profile_initialized) VALUES ($1,'encrypted',$2,'138****0000',true)", [id, randomUUID().replaceAll("-", "").repeat(2)]); await migrationClient.query("INSERT INTO user_profiles (user_id,public_user_no,nickname) VALUES ($1,$2,$3)", [id, `U${randomUUID().replaceAll("-", "").slice(0, 14)}`, `测试用户${label}`]); await migrationClient.query("INSERT INTO auth_sessions (id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES ($1,$2,$3,$4,'WEB','127.0.0.1','integration-test',now()+interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2), `device-${label}`]); const token = issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 }); return { id, token }; }
async function seedAdmin(label, permissionKeys) { const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID(); await migrationClient.query("INSERT INTO admin_accounts (id,username,display_name,password_hash) VALUES ($1,$2,$3,'not-used')", [id, `${label}-${id}`, `管理员 ${label}`]); await migrationClient.query("INSERT INTO admin_sessions (id,admin_id,session_token_hash,ip,user_agent,expires_at) VALUES ($1,$2,$3,'127.0.0.1','integration-test',now()+interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]); await migrationClient.query("INSERT INTO roles (id,role_key,name) VALUES ($1,$2,$3)", [roleId, `role-${label}-${roleId}`, `角色 ${label}`]); await migrationClient.query("INSERT INTO admin_roles (admin_id,role_id) VALUES ($1,$2)", [id, roleId]); for (const key of permissionKeys) { const permission = await migrationClient.query("INSERT INTO permissions (id,permission_key) VALUES ($1,$2) ON CONFLICT (permission_key) DO UPDATE SET permission_key=excluded.permission_key RETURNING id", [randomUUID(), key]); await migrationClient.query("INSERT INTO role_permissions (role_id,permission_id) VALUES ($1,$2)", [roleId, permission.rows[0].id]); } const token = issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 }); return { id, token }; }
function userRequest(account, method, url, payload, extraHeaders = {}) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}`, ...extraHeaders }, ...(payload === undefined ? {} : { payload }) }); }
function adminRequest(account, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }

test('V3.1 successful partial refund terminates service, settles the remainder and expires review after seven days',{skip:!enabled},async()=>{
  const order=await seedCompletedOrder(10000n);
  await migrationClient.query("UPDATE orders SET rule_version='V3.1',status='IN_SERVICE',completed_at=NULL WHERE id=$1",[order.orderId]);
  const created=await userRequest(buyer,'POST','/api/v1/refunds',{order_id:order.orderId,amount_cent:'2000',reason_code:'PARTIAL',reason_text:'部分服务未交付'},{'idempotency-key':`v31-${randomUUID()}`});
  assert.equal(created.statusCode,201,created.body);
  const approved=await userRequest(seller,'POST',`/api/v1/seller/refunds/${created.json().id}/decision`,{version:created.json().version,decision:'APPROVE',reason:'认可已交付部分并终止剩余义务'});
  assert.equal(approved.statusCode,201,approved.body);
  const completed=await callbackRequest(refundCallback(approved.json(),2000n));
  assert.equal(completed.statusCode,201,completed.body);
  const facts=await migrationClient.query("SELECT status,completed_at FROM orders WHERE id=$1",[order.orderId]);
  assert.equal(facts.rows[0].status,'COMPLETED');assert(facts.rows[0].completed_at);
  const income=await migrationClient.query("SELECT platform_fee_cent::text fee,seller_amount_cent::text gross,reversed_amount_cent::text refunded FROM seller_incomes WHERE order_id=$1",[order.orderId]);
  assert.deepEqual(income.rows,[{fee:'0',gross:'10000',refunded:'2000'}]);
  const incomeId=(await migrationClient.query('SELECT id FROM seller_incomes WHERE order_id=$1',[order.orderId])).rows[0].id;
  const engine=new FinanceLedgerEngine(database.db);
  assert.equal(await engine.makeIncomeAvailable(incomeId),true);
  assert.equal(await engine.makeIncomeAvailable(incomeId),false);
  assert.equal((await migrationClient.query('SELECT available_amount_cent::text amount FROM seller_incomes WHERE id=$1',[incomeId])).rows[0].amount,'8000');
  await migrationClient.query("UPDATE orders SET completed_at=now()-interval '8 days' WHERE id=$1",[order.orderId]);
  const review=await userRequest(buyer,'POST','/api/v1/reviews',{order_id:order.orderId,rating:5,content:'已超期',anonymous:false});
  assert.equal(review.statusCode,409);assert.equal(review.json().code,'REVIEW_WINDOW_EXPIRED');
  const reapply=await userRequest(buyer,'POST','/api/v1/refunds',{order_id:order.orderId,amount_cent:'1000',reason_code:'PARTIAL',reason_text:'交易已终结'},{'idempotency-key':`v31-reapply-${randomUUID()}`});
  assert.equal(reapply.statusCode,409);assert.equal(reapply.json().code,'REFUND_REQUIRES_SUPPORT_CASE');
});
import { applyStageOneMigrations } from "./stage-one-migrations.mjs";
test("refund response loss and callback loss recover by original channel after provider restart",{skip:!enabled},async()=>{
  const manager=await seedAdmin("transfer-manager",["finance.read","finance.manage"]);
  for(const channel of ["WECHAT_APP","ALIPAY_APP"]){
    const order=await seedCompletedOrder(5000n);
    // Channel belongs to this synthetic starting fixture; subsequent lifecycle uses APIs.
    await migrationClient.query("UPDATE payments SET channel=$2 WHERE order_id=$1",[order.orderId,channel]);
    if(channel==="WECHAT_APP")paymentProvider.loseNextResponse=true;
    const refund=await createRefund(order.orderId,1000n,"丢失响应或回调恢复");
    const approval=await userRequest(seller,"POST",`/api/v1/seller/refunds/${refund.id}/decision`,{version:refund.version,decision:"APPROVE",reason:"同意退款"});
    assert.equal(approval.statusCode,201,approval.body);
    assert.equal(approval.json().status,channel==="WECHAT_APP"?"SELLER_APPROVED":"REFUND_PROCESSING");
    const operation=(await migrationClient.query("SELECT * FROM financial_transfer_operations WHERE refund_id=$1",[refund.id])).rows[0];
    assert.equal(operation.channel,channel);assert.equal(operation.status,channel==="WECHAT_APP"?"UNKNOWN":"PROCESSING");
    const result=await adminRequest(manager,"POST",`/admin-api/v1/finance/transfers/${operation.id}/mock-result`,{version:operation.version,status:"SUCCEEDED",reason:"模拟渠道成功，回调丢失"});assert.equal(result.statusCode,201,result.body);
    await migrationClient.query("UPDATE financial_transfer_operations SET next_run_at=now()-interval '1 second' WHERE id=$1",[operation.id]);
    const store=new DrizzleMockTransferStore(database,config.authHmacKey);let submissions=0;
    const providers=["WECHAT_APP","ALIPAY_APP"].map(value=>{const provider=new MockPaymentProvider(webhookSecret,value).bindTransferStore(store);provider.createRefund=async()=>{submissions++;throw new Error("must query existing transfer");};return provider;});
    await new AfterSaleService(database,config,new PaymentProviderRouter(providers)).recoverRefund(operation.id);
    assert.equal(submissions,0);
    const facts=(await migrationClient.query("SELECT r.status,p.refunded_amount_cent::text amount,p.channel FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.id=$1",[refund.id])).rows[0];assert.deepEqual(facts,{status:"REFUNDED",amount:"1000",channel});
    const duplicate=await callbackRequest(refundCallback(approval.json(),1000n));assert.equal(duplicate.statusCode,201,duplicate.body);assert.equal(duplicate.json().duplicate,true);
    const opposite=await callbackRequest({...refundCallback(approval.json(),1000n),event_type:"REFUND_FAILED"});assert.equal(opposite.statusCode,409);
  }
});

test("definitive refund failure replay is harmless and safe retry creates a new attempt on original channel",{skip:!enabled},async()=>{
  const order=await seedCompletedOrder(6000n);const refund=await createRefund(order.orderId,2000n,"明确失败后复核重试");
  const approved=await userRequest(seller,"POST",`/api/v1/seller/refunds/${refund.id}/decision`,{version:refund.version,decision:"APPROVE",reason:"同意退款"});
  const failed={...refundCallback(approved.json(),2000n),event_type:"REFUND_FAILED"};
  const first=await callbackRequest(failed);assert.equal(first.statusCode,201);
  const replay=await callbackRequest({...failed,event_id:randomUUID()});assert.equal(replay.statusCode,201,replay.body);assert.equal(replay.json().duplicate,true);
  const retried=await adminRequest(admin,"POST",`/admin-api/v1/refunds/${refund.id}/decision`,{version:first.json().refund.version,decision:"APPROVE",approved_amount_cent:"2000",reason:"明确失败后授权重试"});
  assert.equal(retried.statusCode,201,retried.body);assert.notEqual(retried.json().provider_refund_no,approved.json().provider_refund_no);
  const stale=await callbackRequest({...failed,event_id:randomUUID()});assert.equal(stale.statusCode,409);
  const success=await callbackRequest(refundCallback(retried.json(),2000n));assert.equal(success.statusCode,201);
  const attempts=(await migrationClient.query("SELECT status,channel,amount_cent::text amount FROM financial_transfer_operations WHERE refund_id=$1 ORDER BY created_at,id",[refund.id])).rows;
  assert.deepEqual(attempts,[{status:"FAILED",channel:"WECHAT_APP",amount:"2000"},{status:"SUCCEEDED",channel:"WECHAT_APP",amount:"2000"}]);
});
