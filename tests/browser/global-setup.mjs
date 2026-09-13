import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabaseClient } from "../../packages/database/dist/index.js";
import { JsonLogger } from "../../packages/observability/dist/index.js";
import pg from "../../packages/database/node_modules/pg/lib/index.js";
import { createApiApp, hashAdminPassword, loadApiConfig, MinioStorageProvider, SensitiveDataProtector } from "../../apps/api/dist/index.js";

const requiredLocalEnvironment = [
  "TEST_DATABASE_URL", "FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID",
  "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET",
];

export default async function globalSetup() {
  const missing = requiredLocalEnvironment.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Admin browser E2E requires local test settings: ${missing.join(", ")}`);

  const schemaName = `xiongzai_admin_browser_${randomUUID().replaceAll("-", "")}`;
  const migrationClient = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, application_name: "xiongzai-admin-browser-setup" });
  await migrationClient.connect();
  await migrationClient.query(`CREATE SCHEMA "${schemaName}"`);
  await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  for (const name of ["0000_initial_schema.sql", "0001_core_invariants.sql", "0002_admin_stage2_permissions.sql", "0003_admin_query_performance.sql", "0004_payment_channels_voice_constraints.sql", "0005_policy_acceptance_context.sql", "0006_policy_version_bindings.sql", "0007_user_lifecycle_requests.sql", "0008_user_lifecycle_invariants.sql", "0009_clear_rhodey.sql"]) await runMigration(migrationClient, schemaName, name);

  let app;
  let database;
  let storage;
  const setupObjects = [];
  try {
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

    const fixtures = await seedFixtures(migrationClient, config, storage, setupObjects);
    app = await createApiApp({ config, databaseClient: database, objectStorageProvider: storage, smsProvider: { sendCode: async () => undefined }, logger: new JsonLogger("admin-browser-e2e", () => undefined) });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("Admin browser E2E could not determine the local API port");
    fixtures.browserEnvironment.E2E_API_PORT = String(address.port);

    for (const [key, value] of Object.entries(fixtures.browserEnvironment)) process.env[key] = value;

    return async () => {
      const location = await migrationClient.query("SELECT bucket, object_key FROM files WHERE id=$1", [fixtures.fileId]).catch(() => ({ rows: [] }));
      await app.close();
      const exactObjects = [...setupObjects, ...location.rows.map((row) => ({ bucket: row.bucket, objectKey: row.object_key })), fixtures.originalObject];
      await deleteAndVerifyExactObjects(storage, exactObjects);
      await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      const remaining = await migrationClient.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1", [schemaName]);
      if (remaining.rows[0]?.count !== 0) throw new Error("Admin browser E2E temporary schema cleanup verification failed");
      await migrationClient.end();
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    if (!app) await database?.close().catch(() => undefined);
    for (const object of setupObjects) await storage?.deleteObject(object).catch(() => undefined);
    await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
    await migrationClient.end().catch(() => undefined);
    throw error;
  }
}

async function seedFixtures(client, config, storage, setupObjects) {
  const totpSecret = base32(randomBytes(20));
  const protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  const adminVariants = {
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

  return {
    fileId,
    originalObject,
    browserEnvironment: {
      E2E_TOTP_SECRET: totpSecret,
      E2E_FULL_USERNAME: adminVariants.full.username,
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
      E2E_TARGET_USER_ID: userIds.at(-1),
      E2E_ACCOUNT_CANCELLATION_ID: accountCancellationId,
      E2E_ACCOUNT_CANCELLATION_USER_ID: userIds[6],
      E2E_POLICY_USER_ID: userIds[1],
      E2E_ORDER_ID: orderId,
      E2E_IDENTITY_VERIFICATION_ID: identityVerificationId,
      E2E_POLICY_DRAFT_ID: draftPrivacyPolicyId,
      E2E_POLICY_TRANSACTION_ID: transactionPolicyId,
      E2E_FILE_ID: fileId,
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
