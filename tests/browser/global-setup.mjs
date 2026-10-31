import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabaseClient } from "../../packages/database/dist/index.js";
import { JsonLogger } from "../../packages/observability/dist/index.js";
import pg from "../../packages/database/node_modules/pg/lib/index.js";
import { createApiApp, hashAdminPassword, loadApiConfig, MinioStorageProvider, SensitiveDataProtector } from "../../apps/api/dist/index.js";
import { issueAccessToken } from "../../packages/auth/dist/index.js";
import { localMinioCorsClient, prepareLocalTestCors } from "./helpers/local-minio-cors.mjs";

const requiredLocalEnvironment = [
  "TEST_DATABASE_URL", "FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID",
  "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET",
];

export default async function globalSetup() {
  const missing = requiredLocalEnvironment.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Admin browser E2E requires local test settings: ${missing.join(", ")}`);
  for (const key of ["TEST_DATABASE_URL", "FILE_STORAGE_ENDPOINT"]) { const host = new URL(process.env[key]).hostname.replace(/^\[|\]$/gu, ""); if (!/^(localhost|127(?:\.\d{1,3}){3}|::1)$/u.test(host)) throw new Error(`Local browser E2E invalid key: ${key}`); }

  const schemaName = `xiongzai_admin_browser_${randomUUID().replaceAll("-", "")}`;
  const migrationClient = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, application_name: "xiongzai-admin-browser-setup" });
  await migrationClient.connect();

  let app;
  let database;
  let storage;
  let restoreCors;
  const setupObjects = [];
  try {
    await migrationClient.query(`CREATE SCHEMA "${schemaName}"`);
    await migrationClient.query(`SET search_path TO "${schemaName}", public`);
    const journal = JSON.parse(await readFile(new URL("../../packages/database/migrations/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries) await runMigration(migrationClient, schemaName, `${entry.tag}.sql`);
    database = createDatabaseClient({ connectionString: process.env.TEST_DATABASE_URL, application_name: "xiongzai-admin-browser-api", options: `-c search_path=${schemaName},public`, max: 8 });
    const runtimeSecret = () => randomBytes(32).toString("base64url");
    const config = loadApiConfig({
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      API_HOST: "127.0.0.1",
      API_PORT: "3002",
      DATABASE_MAX_CONNECTIONS: "8",
      USER_TOKEN_SECRET: runtimeSecret(),
      ADMIN_TOKEN_SECRET: runtimeSecret(),
      INTERNAL_TOKEN_SECRET: runtimeSecret(),
      CURSOR_SIGNING_SECRET: runtimeSecret(),
      PII_ENCRYPTION_KEY: runtimeSecret(),
      PII_HMAC_KEY: runtimeSecret(),
      AUTH_HMAC_KEY: runtimeSecret(),
      PAYMENT_WEBHOOK_SECRET: runtimeSecret(),
      PAYOUT_WEBHOOK_SECRET: runtimeSecret(),
      SMS_PROVIDER_MODE: "injected",
      PAYMENT_PROVIDER_MODE: "mock",
      PAYOUT_PROVIDER_MODE: "mock",
      ACCESS_TOKEN_TTL_SECONDS: "300",
      REFRESH_TOKEN_TTL_SECONDS: "3600",
      API_CORS_ORIGINS: process.env.ADMIN_E2E_FRONTEND_ORIGIN ?? "http://127.0.0.1:3101",
      FILE_STORAGE_PROVIDER: "minio",
    });
    storage = new MinioStorageProvider({
      endpoint: config.fileStorageEndpoint,
      region: config.fileStorageRegion,
      accessKeyId: config.fileStorageAccessKeyId,
      secretAccessKey: config.fileStorageSecretAccessKey,
    });
    restoreCors = await prepareLocalTestCors(localMinioCorsClient(storage, config.fileQuarantineBucket), process.env.ADMIN_E2E_FRONTEND_ORIGIN);

    const fixtures = await seedFixtures(migrationClient, config, storage, setupObjects);
    if (process.env.STAGE_TWO_E2E === "1") Object.assign(fixtures.browserEnvironment, await seedCommerceActors(migrationClient, config));
    const trackedStorage = new Proxy(storage, { get(target, key) { const method = target[key]; if (typeof method !== "function") return method; return (...args) => { if (key === "createUploadRequest") setupObjects.push({ bucket: args[0].bucket, objectKey: args[0].objectKey }); if (key === "copyObject") setupObjects.push({ ...args[0].destination }); return method.apply(target, args); }; } });
    app = await createApiApp({ config, databaseClient: database, objectStorageProvider: trackedStorage, smsProvider: { sendCode: async () => undefined }, logger: new JsonLogger("admin-browser-e2e", () => undefined) });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("Admin browser E2E could not determine the local API port");
    fixtures.browserEnvironment.E2E_API_PORT = String(address.port);
    // Per-run synthetic key, only inherited by the Node test process for signed Mock callbacks.
    // Never persisted, logged, or passed to a browser page.
    if (process.env.STAGE_TWO_E2E === "1") fixtures.browserEnvironment.E2E_PAYMENT_WEBHOOK_SECRET = config.paymentWebhookSecret;

    if (process.env.STAGE_TWO_E2E !== "1") {
      // Explicit isolated database fixture, not a human/UI purchase. Case transitions below use real authenticated APIs.
      fixtures.browserEnvironment.E2E_ADMIN_CASE_ID = await prepareAdminCase(migrationClient, app, config, fixtures.browserEnvironment.E2E_ORDER_ID);
    }

    for (const [key, value] of Object.entries(fixtures.browserEnvironment)) process.env[key] = value;

    return async () => {
      try {
      const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fixtures.fileId]).catch(() => ({ rows: [] }));
      await app.close();
      const exactObjects = [...setupObjects, ...location.rows.map((row) => ({ bucket: row.bucket, objectKey: row.object_key })), fixtures.originalObject];
      await deleteAndVerifyExactObjects(storage, exactObjects);
      await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      const remaining = await migrationClient.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1", [schemaName]);
      if (remaining.rows[0]?.count !== 0) throw new Error("Admin browser E2E temporary schema cleanup verification failed");
      console.log("[local browser cleanup] temporary schemas: 0; tracked MinIO objects: 0");
      await migrationClient.end();
      } finally {
        if (restoreCors) { await restoreCors(); console.log("[local browser cleanup] original MinIO CORS restored and verified"); }
      }
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    if (!app) await database?.close().catch(() => undefined);
    for (const object of setupObjects) await storage?.deleteObject(object).catch(() => undefined);
    await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
    await migrationClient.end().catch(() => undefined);
    if (restoreCors) await restoreCors();
    throw error;
  }
}

async function seedCommerceActors(client, config) {
  const protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  const result = {};
  for (const role of ["BUYER", "SELLER", "LEGACY_BUYER", "LEGACY_SELLER"]) {
    const id = randomUUID(), session = randomUUID();
    await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask,profile_initialized) VALUES($1,'synthetic',$2,'138****0000',true)", [id, createHash("sha256").update(id).digest("hex")]);
    await client.query("INSERT INTO user_profiles(user_id,nickname,public_user_no) VALUES($1,$2,$3)", [id, role === "BUYER" ? "三端联调买家" : "三端联调卖家", id.replaceAll("-","")]);
    await client.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES($1,$2,$3,$4,'WEB','127.0.0.1','local-stage-two',now()+interval '1 hour')", [session, id, createHash("sha256").update(session).digest("hex"), session]);
    const document = "000000199001010000";
    await client.query("INSERT INTO identity_verifications(id,user_id,provider,provider_reference,legal_name_ciphertext,legal_name_hash,legal_name_mask,document_ciphertext,document_hash,document_mask,status,verified_at) VALUES($1,$2,'MANUAL_REVIEW',$3,$4,$5,'测*',$6,$7,'********0000','VERIFIED',now())", [randomUUID(), id, randomUUID(), protector.encrypt("legal-name","合成测试"), protector.piiHash("legal-name","合成测试"), protector.encrypt("identity-document", document), protector.piiHash("identity-document",document)]);
    result["E2E_STAGE_"+role+"_ID"] = id;
    result["E2E_STAGE_"+role+"_ACCESS"] = issueAccessToken({sub:id,principal_type:"user",token_use:"access",session_id:session},{secret:config.userTokenSecret,issuer:config.tokenIssuer,audience:config.userTokenAudience,expiresInSeconds:3600});
  }
  const seller = randomUUID();
  await client.query("INSERT INTO seller_profiles(id,user_id,status,seller_nickname,introduction,accepting_orders,approved_at) VALUES($1,$2,'APPROVED','三端联调测试店铺','只用于隔离本地测试，非真实业务',true,now())", [seller, result.E2E_STAGE_SELLER_ID]);
  result.E2E_STAGE_SELLER_PROFILE_ID = seller;
  const legacyOrder = randomUUID(), legacySeller = randomUUID();
  await client.query("INSERT INTO seller_profiles(id,user_id,status,seller_nickname,introduction,accepting_orders,approved_at) VALUES($1,$2,'APPROVED','隔离旧预约店铺','只用于存量兼容测试',true,now())", [legacySeller,result.E2E_STAGE_LEGACY_SELLER_ID]);
  await client.query("INSERT INTO user_policy_acceptances(user_id,policy_version_id,acceptance_scene,confirmation_method,ip,user_agent) SELECT $1,transaction_policy_version_id,'ORDER_PAYMENT','ONLINE_CONFIRM','127.0.0.1','isolated-legacy-fixture' FROM orders WHERE order_no='BROWSER-ORDER-001'",[result.E2E_STAGE_LEGACY_BUYER_ID]);
  // Isolated read-only compatibility fixture: V3.1 alone must not select fulfillment flow.
  await client.query(`INSERT INTO orders SELECT (jsonb_populate_record(NULL::orders,to_jsonb(source) || jsonb_build_object(
    'id',$1::text,'order_no','STAGE-TWO-LEGACY','buyer_id',$2::text,'seller_user_id',$3::text,'seller_id',$4::text,
    'product_title_snapshot','隔离旧预约订单','rule_version','V3.1','fulfillment_seconds_snapshot',NULL,
    'status','PENDING_ACCEPT','completed_at',NULL,'service_starts_at','2026-10-11T08:00:00Z','service_ends_at','2026-10-11T09:00:00Z',
    'paid_at',now(),'expires_at',now()+interval '1 day','created_at',now(),'updated_at',now()
  ))).* FROM orders source WHERE source.order_no='BROWSER-ORDER-001'`, [legacyOrder,result.E2E_STAGE_LEGACY_BUYER_ID,result.E2E_STAGE_LEGACY_SELLER_ID,legacySeller]);
  result.E2E_STAGE_LEGACY_ORDER_ID = legacyOrder;
  for (const [key,value] of [["order.payment_timeout_seconds",900],["order.accept_timeout_seconds",900],["order.auto_confirm_seconds",259200],["finance.settlement_delay_seconds",0]]) await client.query("INSERT INTO platform_configs(id,config_key,value_json,version_no,status,effective_at,created_by_admin_id) VALUES($1,$2,$3,1,'ACTIVE',now(),(SELECT id FROM admin_accounts LIMIT 1)) ON CONFLICT DO NOTHING", [randomUUID(), key, {value}]);
  return result;
}

async function prepareAdminCase(client, app, config, sourceOrderId) {
  const orderId = randomUUID(), paymentId = randomUUID();
  const inserted = await client.query(`INSERT INTO orders SELECT (jsonb_populate_record(NULL::orders,to_jsonb(source) || jsonb_build_object(
    'id',$1::text,'order_no',$2::text,'rule_version','V3.1','fulfillment_seconds_snapshot',86400,'game_snapshot','PEACE_ELITE',
    'status','IN_SERVICE','after_sale_status','NONE','completed_at',NULL,'refunded_at',NULL,
    'refunded_amount_cent',0,'service_starts_at',NULL,'service_ends_at',NULL,'version',0,
    'fulfillment_due_at',now()+interval '1 day','paid_at',now(),'created_at',now(),'updated_at',now()
  ))).* FROM orders source WHERE source.id=$3 RETURNING buyer_id,seller_user_id,paid_amount_cent`, [orderId, `LC-${randomUUID()}`, sourceOrderId]);
  const order = inserted.rows[0]; if (!order) throw new Error("Isolated case source fixture is missing");
  await client.query("INSERT INTO payments(id,order_id,payment_no,channel,idempotency_key,amount_cent,status,paid_at) VALUES($1,$2,$3,'WECHAT_APP',$4,$5,'PAID',now())", [paymentId, orderId, `LP-${randomUUID()}`, randomUUID(), order.paid_amount_cent]);
  const sessionId = randomUUID();
  await client.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES($1,$2,$3,$4,'WEB','127.0.0.1','isolated-admin-case-fixture',now()+interval '1 hour')", [sessionId, order.buyer_id, createHash("sha256").update(sessionId).digest("hex"), sessionId]);
  const access = issueAccessToken({ sub: order.buyer_id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 3600 });
  const create = await app.inject({ method: "POST", url: "/api/v1/after-sale/cases", headers: { authorization: `Bearer ${access}`, "idempotency-key": randomUUID() }, payload: { order_id: orderId, amount_cent: "5000", reason_code: "LOCAL_TEST", reason_text: "隔离浏览器案件，仅用于平台材料与裁决回归" } });
  if (create.statusCode !== 201) throw new Error(`Isolated case creation failed (${create.statusCode}, ${create.json().code})`);
  const created = create.json();
  const escalate = await app.inject({ method: "POST", url: `/api/v1/after-sale/cases/${created.id}/actions`, headers: { authorization: `Bearer ${access}`, "idempotency-key": randomUUID() }, payload: { action: "ESCALATE", version: created.version, reason: "隔离浏览器请求平台核验" } });
  if (escalate.statusCode !== 201) throw new Error(`Isolated case escalation failed (${escalate.statusCode}, ${escalate.json().code})`);
  return created.id;
}

async function seedFixtures(client, config, storage, setupObjects) {
  const totpSecret = base32(randomBytes(20));
  const protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  const adminVariants = {
    communityRead: { username: `browser-community-${randomUUID().slice(0,8)}`, password: randomPassword(), displayName: "浏览器反馈公告只读员", permissions: ["feedback.read", "announcement.read"] },
    orderAudit: { username: `browser-order-${randomUUID().slice(0,8)}`, password: randomPassword(), displayName:"浏览器订单审计员", permissions:["order.read","complaint.read"] },
    governanceOnly: { username: `browser-governance-${randomUUID().slice(0,8)}`, password:randomPassword(), displayName:"浏览器治理审计员", permissions:["complaint.read","user.status.manage"] },
    financeRead: { username: `browser-finance-read-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器财务只读员（本地隔离测试超长管理员名称显示边界验收）", permissions: ["dashboard.read", "finance.read"] },
    financeExport: { username: `browser-finance-export-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器导出审计员", permissions: ["dashboard.read", "finance.export"] },
    rbacTarget: { username: `browser-rbac-target-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器角色测试管理员", permissions: ["dashboard.read"] },
    full: { username: `browser-full-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器全权管理员", permissions: fullPermissions },
    viewer: { username: `browser-view-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器总览观察员", permissions: ["dashboard.read"] },
    userRead: { username: `browser-user-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器用户审计员", permissions: ["dashboard.read", "user.read"] },
    operationsRead: { username: `browser-ops-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器运营只读员", permissions: readOnlyOperationPermissions },
    withdrawalInitial: { username: `browser-wd-initial-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器提现初审员", permissions: ["withdrawal.read", "withdrawal.review.initial"] },
    withdrawalFinal: { username: `browser-wd-final-${randomUUID().slice(0, 8)}`, password: randomPassword(), displayName: "浏览器提现复核员", permissions: ["withdrawal.read", "withdrawal.review.final"] },
  };
  for (const [variant, account] of Object.entries(adminVariants)) {
    account.id = randomUUID();
    const roleId = randomUUID();
    await client.query("INSERT INTO admin_accounts(id,username,display_name,password_hash) VALUES($1,$2,$3,$4)", [account.id, account.username, account.displayName, await hashAdminPassword(account.password)]);
    await client.query("INSERT INTO admin_mfa_factors(id,admin_id,factor_type,secret_ciphertext,verified_at) VALUES($1,$2,'TOTP',$3,now())", [randomUUID(), account.id, protector.encrypt("admin-mfa", totpSecret)]);
    await client.query("INSERT INTO roles(id,role_key,name,description) VALUES($1,$2,$3,'仅用于独立本地浏览器测试')", [roleId, `browser_${variant}_${roleId.slice(0, 8)}`, `${account.displayName}角色`]);
    await client.query("INSERT INTO admin_roles(admin_id,role_id) VALUES($1,$2)", [account.id, roleId]);
    for (const permissionKey of account.permissions) {
      const permission = await client.query("INSERT INTO permissions(id,permission_key,description,high_risk) VALUES($1,$2,'本地浏览器测试权限',$3) ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description RETURNING id", [randomUUID(), permissionKey, /manage|review|reply/u.test(permissionKey)]);
      await client.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [roleId, permission.rows[0].id]);
    }
  }

  // Keep existing fixture roles on their original first page while exercising
  // identical microsecond timestamps across multiple pages of extra roles.
  for (let index = 0; index < 105; index++) await client.query("INSERT INTO roles(id,role_key,name,created_at) VALUES($1,$2,$3,'2020-01-01T00:00:00.000123Z')", [randomUUID(), `browser_paged_role_${index}`, `分页运营角色${index}`]);
  const userIds = [];
  for (let index = 1; index <= 27; index += 1) {
    const id = randomUUID();
    userIds.push(id);
    const label = String(index).padStart(2, "0");
    const createdAt = new Date(Date.UTC(2026, 7, 1, 0, 0, index));
    await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask,status,profile_initialized,created_at,updated_at) VALUES($1,'browser-test-ciphertext',$2,$3,'NORMAL',true,$4,$4)", [id, createHash("sha256").update(`browser-phone-${id}`).digest("hex"), `138****${label.padStart(4, "0")}`, createdAt]);
    await client.query("INSERT INTO user_profiles(user_id,nickname,public_user_no,created_at,updated_at) VALUES($1,$2,$3,$4,$4)", [id, `浏览器用户 ${label}`, `BROWSER-${label}`, createdAt]);
  }

  const accountCancellationId = randomUUID();
  await client.query("INSERT INTO account_cancellation_requests(id,user_id,idempotency_key,status,reason,requested_at,waiting_period_ends_at,created_at,updated_at) VALUES($1,$2,$3,'REQUESTED','浏览器账号注销人工审核','2026-08-17T00:00:00Z','2026-09-17T00:00:00Z','2026-08-17T00:00:00Z','2026-08-17T00:00:00Z')", [accountCancellationId, userIds[6], `browser-cancellation-${randomUUID()}`]);

  const onboardingPolicyId = randomUUID();
  const voicePolicyId = randomUUID();
  const transactionPolicyId = randomUUID();
  const draftPrivacyPolicyId = randomUUID();
  await client.query(
    `INSERT INTO policy_versions(id,policy_type,title,content,version_no,status,published_at,effective_at,requires_reacceptance,created_by_admin_id,created_at) VALUES
     ($1,'SELLER_ONBOARDING_AGREEMENT','陪玩入驻协议','本地浏览器测试入驻协议正文',1,'PUBLISHED','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z',false,$5,'2026-08-01T00:00:00Z'),
     ($2,'VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION','声音名片公开播放授权','本地浏览器测试声音授权正文',1,'PUBLISHED','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z',false,$5,'2026-08-01T00:00:00Z'),
     ($3,'ORDER_PAYMENT_REFUND_RULES','订单支付退款规则','本地浏览器测试交易规则正文',1,'PUBLISHED','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z',true,$5,'2026-08-01T00:00:00Z'),
     ($4,'PRIVACY_POLICY','本地隐私政策草稿','仅用于本地页面和发布闭环验证',1,'DRAFT',null,null,false,$5,'2026-08-02T00:00:00Z')`,
    [onboardingPolicyId, voicePolicyId, transactionPolicyId, draftPrivacyPolicyId, adminVariants.full.id],
  );
  await client.query("INSERT INTO user_policy_acceptances(user_id,policy_version_id,acceptance_scene,confirmation_method,accepted_at,ip,user_agent) VALUES($1,$2,'SELLER_ONBOARDING','ONLINE_CONFIRM','2026-08-03T00:00:00Z','127.0.0.1','browser-e2e'),($1,$3,'VOICE_SAMPLE_UPLOAD','ONLINE_CONFIRM','2026-08-03T00:01:00Z','127.0.0.1','browser-e2e'),($4,$5,'ORDER_PAYMENT','ONLINE_CONFIRM','2026-08-03T00:02:00Z','127.0.0.1','browser-e2e'),($6,$5,'ORDER_PAYMENT','ONLINE_CONFIRM','2026-08-03T00:03:00Z','127.0.0.1','browser-e2e')", [userIds[0], onboardingPolicyId, voicePolicyId, userIds[1], transactionPolicyId, userIds[4]]);

  const identityVerificationId = randomUUID();
  const identityLegalName = "浏览器实名测试人";
  const identityDocument = "110101199001011234";
  await client.query(
    "INSERT INTO identity_verifications(id,user_id,provider,provider_reference,legal_name_ciphertext,legal_name_hash,legal_name_mask,document_ciphertext,document_hash,document_mask,status,submitted_at,created_at,updated_at) VALUES($1,$2,'MANUAL_REVIEW',$3,$4,$5,$6,$7,$8,$9,'PENDING','2026-08-09T00:00:00Z','2026-08-09T00:00:00Z','2026-08-09T00:00:00Z')",
    [identityVerificationId, userIds[2], `browser-identity-${identityVerificationId}`, protector.encrypt("legal-name", identityLegalName), protector.piiHash("legal-name", identityLegalName), protector.maskLegalName(identityLegalName), protector.encrypt("identity-document", identityDocument), protector.piiHash("identity-document", identityDocument), protector.maskDocument(identityDocument)],
  );

  const sellerId = randomUUID();
  const rejectedSellerId = randomUUID();
  const sellerApplicationId = randomUUID();
  const rejectedSellerApplicationId = randomUUID();
  const productId = randomUUID();
  const rejectedProductId = randomUUID();
  const skuId = randomUUID();
  const orderId = randomUUID();
  const secondOrderId = randomUUID();
  const reviewId = randomUUID();
  const voiceFileId = randomUUID();
  const sellerAvatarFileId = randomUUID();
  const sellerCoverFileId = randomUUID();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const sha256 = createHash("sha256").update(png).digest("hex");
  const sellerAvatarObject = { bucket: config.filePublicBucket, objectKey: `browser-e2e/seller-avatar/${sellerAvatarFileId}.png` };
  const sellerCoverObject = { bucket: config.filePublicBucket, objectKey: `browser-e2e/seller-cover/${sellerCoverFileId}.png` };
  setupObjects.push(sellerAvatarObject, sellerCoverObject);
  await uploadBrowserObject(storage, sellerAvatarObject, png, sha256);
  await uploadBrowserObject(storage, sellerCoverObject, png, sha256);
  await client.query("INSERT INTO files(id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,width,height,sha256,upload_status,moderation_status,visibility,created_at,updated_at) VALUES($1,$2,$3,$4,'SELLER_AVATAR','image/png',$5,1,1,$6,'VERIFIED','APPROVED','PUBLIC','2026-08-09T00:00:00Z','2026-08-09T00:00:00Z'),($7,$2,$8,$9,'SELLER_COVER','image/png',$5,1,1,$6,'VERIFIED','APPROVED','PUBLIC','2026-08-09T00:00:00Z','2026-08-09T00:00:00Z')", [sellerAvatarFileId, userIds[0], sellerAvatarObject.bucket, sellerAvatarObject.objectKey, png.byteLength, sha256, sellerCoverFileId, sellerCoverObject.bucket, sellerCoverObject.objectKey]);
  await client.query("INSERT INTO files(id,bucket,object_key,file_type,mime_type,size_bytes,duration_ms,sha256,upload_status,moderation_status,visibility,created_at,updated_at) VALUES($1,$2,$3,'VOICE_SAMPLE','audio/mpeg',1024,15000,$4,'VERIFIED','APPROVED','PRIVATE','2026-08-09T00:00:00Z','2026-08-09T00:00:00Z')", [voiceFileId, config.filePrivateBucket, `browser/voice/${voiceFileId}.mp3`, createHash("sha256").update(`browser-voice-${voiceFileId}`).digest("hex")]);
  await client.query("INSERT INTO seller_profiles(id,user_id,status,seller_nickname,seller_avatar_file_id,cover_file_id,introduction,game_rank,kd,preferred_mode,play_style,game_experience,voice_file_id,voice_duration_ms,voice_authorization_policy_version_id,accepting_orders,created_at,updated_at) VALUES($1,$2,'PENDING_REVIEW','浏览器陪玩',$3,$4,'本地浏览器真实详情测试','无敌战神','3.25','经典模式','团队指挥','多个赛季稳定上分并擅长团队配合。',$5,15000,$6,false,'2026-08-10T00:00:00Z','2026-08-10T00:00:00Z')", [sellerId, userIds[0], sellerAvatarFileId, sellerCoverFileId, voiceFileId, voicePolicyId]);
  await client.query("INSERT INTO seller_applications(id,seller_id,version_no,onboarding_policy_version_id,snapshot_json,status,submitted_at,created_at,updated_at) VALUES($1,$2,1,$3,$4,'SUBMITTED','2026-08-11T00:00:00Z','2026-08-11T00:00:00Z','2026-08-11T00:00:00Z')", [sellerApplicationId, sellerId, onboardingPolicyId, { seller_nickname: "浏览器陪玩", seller_avatar_file_id: sellerAvatarFileId, cover_file_id: sellerCoverFileId, introduction: "本地浏览器真实详情测试", game_rank: "无敌战神", kd: "3.25", preferred_mode: "经典模式", play_style: "团队指挥", game_experience: "多个赛季稳定上分并擅长团队配合。", voice_file_id: voiceFileId, voice_duration_ms: 15000 }]);
  await client.query("INSERT INTO seller_profiles(id,user_id,status,seller_nickname,introduction,game_rank,preferred_mode,accepting_orders,created_at,updated_at) VALUES($1,$2,'PENDING_REVIEW','浏览器待驳回陪玩','本地浏览器驳回闭环','王牌','四排',false,'2026-08-10T00:03:00Z','2026-08-10T00:03:00Z')", [rejectedSellerId, userIds[3]]);
  await client.query("INSERT INTO seller_applications(id,seller_id,version_no,snapshot_json,status,submitted_at,created_at,updated_at) VALUES($1,$2,1,$3,'SUBMITTED','2026-08-11T00:03:00Z','2026-08-11T00:03:00Z','2026-08-11T00:03:00Z')", [rejectedSellerApplicationId, rejectedSellerId, { seller_nickname: "浏览器待驳回陪玩", game_rank: "王牌", preferred_mode: "四排" }]);
  await client.query("INSERT INTO products(id,seller_id,title,description,status,min_price_cent,submitted_at,created_at,updated_at) VALUES($1,$2,'浏览器真实服务','仅用于本地浏览器详情验证','PENDING_REVIEW',10000,'2026-08-12T00:00:00Z','2026-08-12T00:00:00Z','2026-08-12T00:00:00Z')", [productId, sellerId]);
  await client.query("INSERT INTO products(id,seller_id,title,description,status,min_price_cent,submitted_at,created_at,updated_at) VALUES($1,$2,'浏览器待驳回服务','仅用于本地浏览器服务驳回闭环','PENDING_REVIEW',12000,'2026-08-12T00:03:00Z','2026-08-12T00:03:00Z','2026-08-12T00:03:00Z')", [rejectedProductId, sellerId]);
  await client.query("INSERT INTO product_skus(id,product_id,sku_name,price_cent,duration_minutes,status,created_at,updated_at) VALUES($1,$2,'一小时陪玩',10000,60,'ACTIVE','2026-08-12T00:00:00Z','2026-08-12T00:00:00Z')", [skuId, productId]);
  await client.query(
    `INSERT INTO orders(id,order_no,buyer_id,seller_user_id,seller_id,product_id,sku_id,transaction_policy_version_id,refund_policy_version_id,product_title_snapshot,product_image_snapshot,product_description_snapshot,seller_name_snapshot,sku_name_snapshot,sku_price_cent_snapshot,sku_duration_minutes_snapshot,quantity,total_amount_cent,discount_cent,payable_amount_cent,paid_amount_cent,refunded_amount_cent,commission_rate_bps_snapshot,platform_fee_cent,seller_income_cent,service_starts_at,service_ends_at,status,payment_status,expires_at,paid_at,completed_at,created_at,updated_at)
     VALUES($1,'BROWSER-ORDER-001',$2,$3,$4,$5,$6,$7,$7,'浏览器真实服务','local-browser-fixture','本地浏览器详情验证','浏览器陪玩','一小时陪玩',10000,60,1,10000,0,10000,10000,0,1000,1000,9000,'2026-08-13T00:00:00Z','2026-08-13T01:00:00Z','COMPLETED','PAID','2026-08-12T01:00:00Z','2026-08-12T00:10:00Z','2026-08-13T01:10:00Z','2026-08-12T00:00:00Z','2026-08-13T01:10:00Z')`,
    [orderId, userIds[1], userIds[0], sellerId, productId, skuId, transactionPolicyId],
  );
  await client.query(
    `INSERT INTO orders(id,order_no,buyer_id,seller_user_id,seller_id,product_id,sku_id,transaction_policy_version_id,refund_policy_version_id,product_title_snapshot,product_image_snapshot,product_description_snapshot,seller_name_snapshot,sku_name_snapshot,sku_price_cent_snapshot,sku_duration_minutes_snapshot,quantity,total_amount_cent,discount_cent,payable_amount_cent,paid_amount_cent,refunded_amount_cent,commission_rate_bps_snapshot,platform_fee_cent,seller_income_cent,service_starts_at,service_ends_at,status,payment_status,expires_at,paid_at,completed_at,created_at,updated_at)
     VALUES($1,'BROWSER-ORDER-002',$2,$3,$4,$5,$6,$7,$7,'浏览器真实服务','local-browser-fixture','本地浏览器退款拒绝验证','浏览器陪玩','一小时陪玩',10000,60,1,10000,0,10000,10000,0,1000,1000,9000,'2026-08-13T02:00:00Z','2026-08-13T03:00:00Z','COMPLETED','PAID','2026-08-12T03:00:00Z','2026-08-12T02:10:00Z','2026-08-13T03:10:00Z','2026-08-12T02:00:00Z','2026-08-13T03:10:00Z')`,
    [secondOrderId, userIds[4], userIds[0], sellerId, productId, skuId, transactionPolicyId],
  );
  await client.query("INSERT INTO reviews(id,order_id,product_id,seller_id,buyer_id,rating,content,anonymous,status,display_nickname_snapshot,service_title_snapshot,sku_name_snapshot,created_at) VALUES($1,$2,$3,$4,$5,5,'浏览器真实评价内容',false,'PUBLIC','浏览器用户 02','浏览器真实服务','一小时陪玩','2026-08-14T00:00:00Z')", [reviewId, orderId, productId, sellerId, userIds[1]]);

  const firstPaymentId = randomUUID(); const secondPaymentId = randomUUID();
  await client.query("INSERT INTO payments(id,order_id,payment_no,channel,provider_transaction_id,idempotency_key,amount_cent,status,paid_at) VALUES($1,$2,'BROWSER-PAY-001','WECHAT_APP',$3,$4,10000,'PAID','2026-08-12T00:10:00Z')", [firstPaymentId, orderId, `browser-pay-${randomUUID()}`, `browser-pay-key-${randomUUID()}`]);
  await client.query("INSERT INTO payments(id,order_id,payment_no,channel,provider_transaction_id,idempotency_key,amount_cent,status,paid_at) VALUES($1,$2,'BROWSER-PAY-002','ALIPAY_APP',$3,$4,10000,'PAID','2026-08-12T02:10:00Z')", [secondPaymentId, secondOrderId, `browser-pay-${randomUUID()}`, `browser-pay-key-${randomUUID()}`]);
  const approvedRefundId = randomUUID(); const rejectedRefundId = randomUUID();
  await client.query("INSERT INTO refunds(id,refund_no,order_id,payment_id,applicant_id,requested_amount_cent,reason_code,reason_text,description,status,created_at,updated_at) VALUES($1,'BROWSER-REFUND-APPROVE',$2,$3,$4,6000,'SERVICE_QUALITY','浏览器批准退款','真实 Mock 渠道退款闭环','PLATFORM_REVIEW','2026-08-14T01:00:00Z','2026-08-14T01:00:00Z')", [approvedRefundId, orderId, firstPaymentId, userIds[1]]);
  await client.query("INSERT INTO refunds(id,refund_no,order_id,payment_id,applicant_id,requested_amount_cent,reason_code,reason_text,description,status,created_at,updated_at) VALUES($1,'BROWSER-REFUND-REJECT',$2,$3,$4,5000,'SERVICE_QUALITY','浏览器驳回退款','真实拒绝退款闭环','PLATFORM_REVIEW','2026-08-14T01:01:00Z','2026-08-14T01:01:00Z')", [rejectedRefundId, secondOrderId, secondPaymentId, userIds[4]]);

  const complaintId = randomUUID();
  await client.query("INSERT INTO complaints(id,complaint_no,reporter_id,target_type,order_id,complaint_type,description,status,created_at,updated_at) VALUES($1,'BROWSER-COMPLAINT-001',$2,'ORDER',$3,'SERVICE_DISPUTE','浏览器真实投诉状态闭环','SUBMITTED','2026-08-14T02:00:00Z','2026-08-14T02:00:00Z')", [complaintId, userIds[1], orderId]);

  const supportConversationId = randomUUID(); const supportCaseId = randomUUID();
  await client.query("INSERT INTO conversations(id,conversation_no,conversation_type,last_message_preview,last_message_at,created_at,updated_at) VALUES($1,'BROWSER-SUPPORT-CONV-001','SUPPORT','用户请求人工客服','2026-08-14T03:00:00Z','2026-08-14T03:00:00Z','2026-08-14T03:00:00Z')", [supportConversationId]);
  await client.query("INSERT INTO conversation_members(conversation_id,user_id,role) VALUES($1,$2,'USER')", [supportConversationId, userIds[5]]);
  await client.query("INSERT INTO messages(id,conversation_id,client_message_id,sequence_no,sender_user_id,sender_role,message_type,content,send_status,moderation_status,created_at) VALUES($1,$2,'browser-support-message-001',1,$3,'USER','TEXT','用户请求人工客服','SENT','APPROVED','2026-08-14T03:00:00Z')", [randomUUID(), supportConversationId, userIds[5]]);
  await client.query("INSERT INTO messages(id,conversation_id,client_message_id,sequence_no,sender_user_id,sender_role,message_type,content,send_status,moderation_status,created_at) SELECT gen_random_uuid(),$1,'browser-history-'||n,n,$2,'USER','TEXT','本地历史客服消息 '||n,'SENT','APPROVED','2026-08-14T03:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(2,123) n",[supportConversationId,userIds[5]]);
  await client.query("INSERT INTO support_cases(id,case_no,requester_id,conversation_id,topic,priority,status,queue_key,source_page,created_at,updated_at) VALUES($1,'BROWSER-SUPPORT-001',$2,$3,'浏览器真实客服闭环','HIGH','WAITING','general','/orders','2026-08-14T03:00:00Z','2026-08-14T03:00:00Z')", [supportCaseId, userIds[5], supportConversationId]);

  const payoutAccountId = randomUUID();
  const payoutToken = "browser-payout-account-001"; const payoutHolder = "浏览器收款人";
  await client.query("INSERT INTO payout_accounts(id,seller_id,account_type,holder_name_ciphertext,holder_name_hash,account_token_ciphertext,account_token_hash,display_mask,verification_status,is_default,last_verified_at) VALUES($1,$2,'ALIPAY',$3,$4,$5,$6,$7,'VERIFIED',true,now())", [payoutAccountId, sellerId, protector.encrypt("payout-holder", payoutHolder), protector.piiHash("payout-holder", payoutHolder), protector.encrypt("payout-account", payoutToken), protector.piiHash("payout-account", payoutToken), protector.maskPayoutAccount(payoutToken)]);
  const approvedWithdrawalId = randomUUID(); const rejectedWithdrawalId = randomUUID();
  const availableLedgerAccountId = randomUUID(); const lockedLedgerAccountId = randomUUID();
  await client.query("INSERT INTO ledger_accounts(id,owner_type,seller_id,account_type) VALUES($1,'SELLER',$2,'SELLER_AVAILABLE'),($3,'SELLER',$2,'SELLER_WITHDRAWAL_LOCKED')", [availableLedgerAccountId, sellerId, lockedLedgerAccountId]);
  for (const [withdrawalId, withdrawalNo, amount, fee] of [[approvedWithdrawalId, "BROWSER-WITHDRAW-APPROVE", 5000, 50], [rejectedWithdrawalId, "BROWSER-WITHDRAW-REJECT", 4000, 40]]) {
    const lockTransactionId = randomUUID();
    await client.query("INSERT INTO ledger_transactions(id,transaction_no,transaction_type,status,source_type,source_id,idempotency_key,description,occurred_at) VALUES($1,$2,'WITHDRAWAL_LOCK','PENDING','WITHDRAWAL',$3,$4,'浏览器提现锁定夹具',now())", [lockTransactionId, `BROWSER-LOCK-${withdrawalNo}`, withdrawalId, `browser-lock-${withdrawalId}`]);
    await client.query("INSERT INTO ledger_entries(id,transaction_id,account_id,side,amount_cent,memo) VALUES($1,$2,$3,'DEBIT',$4,'浏览器测试减少可用收益'),($5,$2,$6,'CREDIT',$4,'浏览器测试锁定提现收益')", [randomUUID(), lockTransactionId, availableLedgerAccountId, amount, randomUUID(), lockedLedgerAccountId]);
    await client.query("UPDATE ledger_transactions SET status='POSTED',posted_at=now() WHERE id=$1", [lockTransactionId]);
    await client.query("INSERT INTO withdrawals(id,withdrawal_no,seller_id,payout_account_id,lock_ledger_transaction_id,amount_cent,fee_cent,actual_amount_cent,status,risk_status,idempotency_key,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'CREATED','CLEAR',$9,now(),now())", [withdrawalId, withdrawalNo, sellerId, payoutAccountId, lockTransactionId, amount, fee, amount - fee, `browser-withdrawal-${withdrawalId}`]);
  }

  const configKey = "browser.operations";
  await client.query("INSERT INTO platform_configs(id,config_key,value_json,version_no,status,effective_at,created_by_admin_id,created_at) VALUES($1,$2,$3,1,'ACTIVE','2026-08-14T04:00:00Z',$4,'2026-08-14T04:00:00Z')", [randomUUID(), configKey, { enabled: false }, adminVariants.full.id]);
  await client.query("INSERT INTO platform_configs(id,config_key,value_json,version_no,status,effective_at,created_by_admin_id,created_at) VALUES($1,'finance.commission_rate_bps',$2,1,'ACTIVE','2026-08-14T04:00:00Z',$3,'2026-08-14T04:00:00Z')", [randomUUID(), { value: 900 }, adminVariants.full.id]);

  const riskId = randomUUID();
  const securityId = randomUUID();
  await client.query("INSERT INTO risk_events(id,risk_type,severity,target_type,target_id,rule_key,status,created_at,updated_at) VALUES($1,'BROWSER_RISK','HIGH','USER',$2,'browser_real_risk','OPEN','2026-08-15T00:00:00Z','2026-08-15T00:00:00Z')", [riskId, userIds[2]]);
  await client.query("INSERT INTO security_logs(id,admin_id,event_type,status,risk_score,metadata_json,ip,user_agent,created_at) VALUES($1,$2,'BROWSER_SECURITY_EVENT','OPEN',65,'{}','127.0.0.1','browser-e2e','2026-08-15T00:01:00Z')", [securityId, adminVariants.full.id]);
  await client.query("INSERT INTO admin_operation_logs(id,admin_id,action,target_type,target_id,reason,request_id,ip,user_agent,created_at) VALUES($1,$2,'BROWSER_E2E_SEEDED','USER',$3,'独立本地浏览器测试数据','browser-e2e-seed','127.0.0.1','browser-e2e','2026-08-15T00:02:00Z')", [randomUUID(), adminVariants.full.id, userIds[2]]);

  const fileId = randomUUID();
  const originalObject = { bucket: config.fileQuarantineBucket, objectKey: `pending/browser-e2e/${fileId}.png` };
  setupObjects.push(originalObject);
  const upload = await storage.createUploadRequest({ ...originalObject, contentType: "image/png", sizeBytes: png.byteLength, sha256, expiresInSeconds: 60 });
  const uploaded = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: png });
  if (!uploaded.ok) throw new Error("Local MinIO browser fixture upload failed");
  await client.query("INSERT INTO files(id,bucket,object_key,file_type,mime_type,size_bytes,width,height,sha256,upload_status,moderation_status,visibility,created_at,updated_at) VALUES($1,$2,$3,'PRODUCT_IMAGE','image/png',$4,1,1,$5,'VERIFIED','PENDING','PRIVATE','2026-08-16T00:00:00Z','2026-08-16T00:00:00Z')", [fileId, originalObject.bucket, originalObject.objectKey, png.byteLength, sha256]);
  await client.query("INSERT INTO product_images(id,product_id,file_id,sort_order,is_cover) VALUES($1,$2,$3,0,true)", [randomUUID(), productId, fileId]);
  await client.query("UPDATE products SET cover_file_id=$1 WHERE id=$2", [fileId, productId]);
  // Separate synthetic private review image, never a real user's upload.
  const reviewFileId = randomUUID();
  const reviewObject = { bucket: config.fileQuarantineBucket, objectKey: `pending/browser-e2e/${reviewFileId}.png` };
  setupObjects.push(reviewObject);
  await storage.copyObject({ source: originalObject, destination: reviewObject });
  await client.query("INSERT INTO files(id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,width,height,sha256,upload_status,moderation_status,visibility) VALUES($1,$2,$3,$4,'REVIEW_IMAGE','image/png',$5,1,1,$6,'VERIFIED','PENDING','PRIVATE')", [reviewFileId, userIds[0], reviewObject.bucket, reviewObject.objectKey, png.byteLength, sha256]);
  // Independent read-only new-product fixture; never convert the legacy approval fixture.
  await client.query("INSERT INTO products(id,seller_id,title,description,status,game,fulfillment_seconds,pricing_mode,min_price_cent) VALUES($1,$2,'本地契约商品','隔离中文与筛选验收，未提交审核','DRAFT','VALORANT',90061,'SINGLE',19995)",[randomUUID(),sellerId]);

  const communitySession = randomUUID();
  await client.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES($1,$2,$3,$4,'WEB','127.0.0.1','isolated-community-browser',now()+interval '1 hour')", [communitySession,userIds[0],createHash("sha256").update(communitySession).digest("hex"),communitySession]);
  return {
    fileId,
    originalObject,
    browserEnvironment: {
      E2E_COMMUNITYREAD_USERNAME: adminVariants.communityRead.username,
      E2E_COMMUNITYREAD_PASSWORD: adminVariants.communityRead.password,
      E2E_COMMUNITY_USER_ACCESS: issueAccessToken({sub:userIds[0],principal_type:"user",token_use:"access",session_id:communitySession},{secret:config.userTokenSecret,issuer:config.tokenIssuer,audience:config.userTokenAudience,expiresInSeconds:3600}),
      E2E_TOTP_SECRET: totpSecret,
      E2E_FULL_USERNAME: adminVariants.full.username,
      E2E_ORDERAUDIT_USERNAME: adminVariants.orderAudit.username,
      E2E_ORDERAUDIT_PASSWORD: adminVariants.orderAudit.password,
      E2E_GOVERNANCEONLY_USERNAME: adminVariants.governanceOnly.username,
      E2E_GOVERNANCEONLY_PASSWORD: adminVariants.governanceOnly.password,
      E2E_FULL_PASSWORD: adminVariants.full.password,
      E2E_VIEWER_USERNAME: adminVariants.viewer.username,
      E2E_VIEWER_PASSWORD: adminVariants.viewer.password,
      E2E_USER_READ_USERNAME: adminVariants.userRead.username,
      E2E_USER_READ_PASSWORD: adminVariants.userRead.password,
      E2E_OPERATIONS_READ_USERNAME: adminVariants.operationsRead.username,
      E2E_OPERATIONS_READ_PASSWORD: adminVariants.operationsRead.password,
      E2E_WITHDRAWAL_INITIAL_USERNAME: adminVariants.withdrawalInitial.username,
      E2E_WITHDRAWAL_INITIAL_PASSWORD: adminVariants.withdrawalInitial.password,
      E2E_WITHDRAWAL_FINAL_USERNAME: adminVariants.withdrawalFinal.username,
      E2E_WITHDRAWAL_FINAL_PASSWORD: adminVariants.withdrawalFinal.password,
      E2E_FINANCEREAD_USERNAME: adminVariants.financeRead.username,
      E2E_FINANCEREAD_PASSWORD: adminVariants.financeRead.password,
      E2E_FINANCEEXPORT_USERNAME: adminVariants.financeExport.username,
      E2E_FINANCEEXPORT_PASSWORD: adminVariants.financeExport.password,
      E2E_RBAC_TARGET_ID: adminVariants.rbacTarget.id,
      E2E_TARGET_USER_ID: userIds.at(-1),
      E2E_ACCOUNT_CANCELLATION_ID: accountCancellationId,
      E2E_ACCOUNT_CANCELLATION_USER_ID: userIds[6],
      E2E_POLICY_USER_ID: userIds[1],
      E2E_ORDER_ID: orderId,
      E2E_IDENTITY_VERIFICATION_ID: identityVerificationId,
      E2E_POLICY_DRAFT_ID: draftPrivacyPolicyId,
      E2E_POLICY_TRANSACTION_ID: transactionPolicyId,
      E2E_FILE_ID: fileId,
      E2E_REVIEW_FILE_ID: reviewFileId,
      E2E_SELLER_ID: sellerId,
      E2E_REJECTED_SELLER_ID: rejectedSellerId,
      E2E_SELLER_APPLICATION_ID: sellerApplicationId,
      E2E_REJECTED_SELLER_APPLICATION_ID: rejectedSellerApplicationId,
      E2E_PRODUCT_ID: productId,
      E2E_REJECTED_PRODUCT_ID: rejectedProductId,
      E2E_REVIEW_ID: reviewId,
      E2E_APPROVED_REFUND_ID: approvedRefundId,
      E2E_REJECTED_REFUND_ID: rejectedRefundId,
      E2E_COMPLAINT_ID: complaintId,
      E2E_SUPPORT_CASE_ID: supportCaseId,
      E2E_APPROVED_WITHDRAWAL_ID: approvedWithdrawalId,
      E2E_REJECTED_WITHDRAWAL_ID: rejectedWithdrawalId,
      E2E_CONFIG_KEY: configKey,
      E2E_RISK_ID: riskId,
      E2E_RISK_TARGET_ID: userIds[2],
      E2E_SECURITY_ID: securityId,
    },
  };
}

const fullPermissions = [
  "feedback.read", "feedback.manage", "feedback.reply", "announcement.read", "announcement.manage", "announcement.publish",
  "dashboard.read", "system_health.read", "admin.read", "admin.manage", "role.read", "role.manage", "user.read", "user.status.manage",
  "identity.read", "identity.review", "seller_application.read", "seller_application.review", "seller.read", "seller.status.manage", "product.read", "product.review", "order.read", "payment.read",
  "refund.read", "refund.manage", "complaint.read", "complaint.manage", "support.read", "support.manage", "support.reply", "conversation.evidence.read",
  "review.read", "review.manage", "finance.read", "finance.manage", "finance.export", "withdrawal.read", "withdrawal.manage", "withdrawal.review.initial", "withdrawal.review.final", "file.read", "file.review", "file.manage",
  "policy.read", "policy.manage", "risk.read", "risk.manage", "security_log.read", "admin_log.read", "config.read", "config.manage", "global_search.read",
];

const readOnlyOperationPermissions = [
  "dashboard.read", "identity.read", "seller_application.read", "seller.read", "product.read", "payment.read", "refund.read", "complaint.read", "support.read",
  "withdrawal.read", "policy.read", "risk.read", "config.read", "admin_log.read",
];

function randomPassword() {
  return `Browser-${randomBytes(18).toString("base64url")}!`;
}

function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

async function runMigration(client, schemaName, fileName) {
  let source = await readFile(new URL(`../../packages/database/migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await client.query(statement);
}

async function uploadBrowserObject(storage, location, body, sha256) {
  const upload = await storage.createUploadRequest({ ...location, contentType: "image/png", sizeBytes: body.byteLength, sha256, expiresInSeconds: 60 });
  const uploaded = await fetch(upload.url, { method: upload.method, headers: upload.headers, body });
  if (!uploaded.ok) throw new Error("Local MinIO browser fixture upload failed");
}

async function deleteAndVerifyExactObjects(storage, locations) {
  const unique = [...new Map(locations.map((location) => [`${location.bucket}\0${location.objectKey}`, location])).values()];
  for (const location of unique) await storage.deleteObject(location);
  for (const location of unique) {
    let missing = false;
    try { await storage.headObject(location); }
    catch (error) { missing = error?.code === "FILE_OBJECT_NOT_FOUND"; }
    if (!missing) throw new Error("Admin browser E2E exact MinIO object cleanup verification failed");
  }
}
