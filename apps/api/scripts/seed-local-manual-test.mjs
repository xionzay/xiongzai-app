import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createDatabaseClient, uuidv7 } from "@xiongzai/database";
import {
  hashAdminPassword,
  loadApiConfig,
  MinioStorageProvider,
  SensitiveDataProtector,
} from "../dist/index.js";

if (process.env.NODE_ENV === "production" || process.env.DEPLOYMENT_ENV === "production") {
  throw new Error("生产环境禁止运行本地人工测试 Seed。");
}

const required = [
  "DATABASE_URL",
  "PII_ENCRYPTION_KEY",
  "PII_HMAC_KEY",
  "AUTH_HMAC_KEY",
  "MANUAL_TEST_ADMIN_USERNAME",
  "MANUAL_TEST_ADMIN_PASSWORD",
  "MANUAL_TEST_ADMIN_TOTP_SECRET",
  "MANUAL_TEST_BUYER_PHONE",
  "MANUAL_TEST_PENDING_SELLER_PHONE",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`缺少环境变量 ${name}`);
}
const approvedSellerPhone = process.env.MANUAL_TEST_APPROVED_SELLER_PHONE ?? process.env.MANUAL_TEST_SELLER_PHONE;
if (!approvedSellerPhone) throw new Error("缺少环境变量 MANUAL_TEST_APPROVED_SELLER_PHONE（兼容 MANUAL_TEST_SELLER_PHONE）。");

const config = loadApiConfig();
const expectedMigrationCount = (await readdir(new URL("../../../packages/database/migrations/", import.meta.url)))
  .filter((name) => /^\d{4}_.+\.sql$/u.test(name)).length;
assertLocalDevelopment(config.databaseUrl);
if (config.smsProviderMode !== "development" || config.paymentProviderMode !== "mock" || config.payoutProviderMode !== "mock") {
  throw new Error("人工测试 Seed 只允许 development 短信、Mock 支付和 Mock 打款 Provider。");
}
if (config.fileStorageProvider !== "minio") throw new Error("本地声音名片 Seed 需要本地 MinIO。");

const ids = {
  approvedApplication: "019a0000-0000-7000-8000-000000000701",
  approvedReview: "019a0000-0000-7000-8000-000000000702",
  pendingApplication: "019a0000-0000-7000-8000-000000000703",
  product: "019a0000-0000-7000-8000-000000000501",
  productVersion: "019a0000-0000-7000-8000-000000000502",
  productReview: "019a0000-0000-7000-8000-000000000503",
  sku60: "019a0000-0000-7000-8000-000000000504",
  sku120: "019a0000-0000-7000-8000-000000000505",
  availability: "019a0000-0000-7000-8000-000000000506",
  voiceFile: "019a0000-0000-7000-8000-000000000401",
  voiceUsage: "019a0000-0000-7000-8000-000000000402",
  sellerAvatarFile: "019a0000-0000-7000-8000-000000000410",
  sellerCoverFile: "019a0000-0000-7000-8000-000000000411",
  productCoverFile: "019a0000-0000-7000-8000-000000000412",
  sellerAvatarUsage: "019a0000-0000-7000-8000-000000000420",
  sellerCoverUsage: "019a0000-0000-7000-8000-000000000421",
  productCoverUsage: "019a0000-0000-7000-8000-000000000422",
  productImage: "019a0000-0000-7000-8000-000000000423",
  admin: "019a0000-0000-7000-8000-000000000301",
  adminMfa: "019a0000-0000-7000-8000-000000000302",
  role: "019a0000-0000-7000-8000-000000000303",
  wechatPayout: "019a0000-0000-7000-8000-000000000601",
  alipayPayout: "019a0000-0000-7000-8000-000000000602",
};

const protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
const phones = {
  buyer: protector.normalizePhone(process.env.MANUAL_TEST_BUYER_PHONE),
  approvedSeller: protector.normalizePhone(approvedSellerPhone),
  pendingSeller: protector.normalizePhone(process.env.MANUAL_TEST_PENDING_SELLER_PHONE),
};
if (new Set(Object.values(phones)).size !== 3) throw new Error("三个人工测试手机号必须互不相同。");

const username = process.env.MANUAL_TEST_ADMIN_USERNAME.normalize("NFKC").trim().toLowerCase();
const totpSecret = process.env.MANUAL_TEST_ADMIN_TOTP_SECRET.replaceAll(" ", "").toUpperCase();
if (!/^[a-z][a-z0-9_.-]{2,63}$/u.test(username)) throw new Error("MANUAL_TEST_ADMIN_USERNAME 格式无效。");
if (!/^[A-Z2-7]{16,128}$/u.test(totpSecret)) throw new Error("MANUAL_TEST_ADMIN_TOTP_SECRET 必须是 Base32 字符串。");

const permissionKeys = [
  "dashboard.read", "system_health.read", "admin.read", "admin.manage", "role.read", "role.manage",
  "user.read", "user.status.manage", "identity.read", "identity.review", "seller.read",
  "seller_application.read", "seller_application.review", "seller.status.manage", "product.read", "product.review",
  "file.read", "file.manage", "file.review", "order.read", "payment.read", "refund.read", "refund.manage",
  "complaint.read", "complaint.manage", "review.read", "review.manage", "support.read", "support.manage",
  "support.reply", "conversation.evidence.read", "finance.read", "finance.manage", "withdrawal.read",
  "withdrawal.manage", "risk.read", "risk.manage", "security_log.read", "admin_log.read", "config.read",
  "config.manage", "global_search.read",
];

const voice = mp3Sample(15);
const voiceSha256 = createHash("sha256").update(voice).digest("hex");
const voiceObjectKey = "manual-test/voice/approved-seller.mp3";
const storage = new MinioStorageProvider({
  endpoint: config.fileStorageEndpoint,
  region: config.fileStorageRegion,
  accessKeyId: config.fileStorageAccessKeyId,
  secretAccessKey: config.fileStorageSecretAccessKey,
});
const upload = await storage.createUploadRequest({
  bucket: config.filePrivateBucket,
  objectKey: voiceObjectKey,
  contentType: "audio/mpeg",
  sizeBytes: voice.byteLength,
  sha256: voiceSha256,
  expiresInSeconds: 120,
});
const uploadResponse = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: voice });
if (!uploadResponse.ok) throw new Error(`本地声音名片上传失败（HTTP ${uploadResponse.status}）。`);

const imageAssets = {
  sellerAvatar: await prepareImageAsset("../../mobile/assets/player-kirito.png", "manual-test/images/approved-seller-avatar.png", "SELLER_AVATAR", 106, 145),
  sellerCover: await prepareImageAsset("../../mobile/assets/player-poster.png", "manual-test/images/approved-seller-cover.png", "SELLER_COVER", 394, 410),
  productCover: await prepareImageAsset("../../mobile/assets/product-hero.png", "manual-test/images/approved-product-cover.png", "PRODUCT_IMAGE", 461, 284),
};
for (const asset of Object.values(imageAssets)) await uploadPublicImage(asset);

const database = createDatabaseClient({
  connectionString: config.databaseUrl,
  application_name: "xiongzai-local-manual-test-seed",
  max: 1,
});
const connection = await database.pool.connect();
try {
  const databaseInfo = await connection.query("select current_database() as name, inet_server_addr()::text as host");
  if (databaseInfo.rows[0]?.name !== "xiongzai_api_dev") throw new Error("数据库运行时校验失败：只能写入 xiongzai_api_dev。");

  await connection.query("begin");
  const passwordHash = await hashAdminPassword(process.env.MANUAL_TEST_ADMIN_PASSWORD);
  const adminId = await upsertAdmin(connection, passwordHash);
  const roleId = await upsertRoleAndPermissions(connection);
  await connection.query(
    `insert into admin_roles (admin_id, role_id, granted_by_admin_id)
     values ($1, $2, null) on conflict (admin_id, role_id) do nothing`,
    [adminId, roleId],
  );

  const buyerId = await upsertUser(connection, phones.buyer, "本地测试买家", "LOCAL-BUYER-2026");
  const approvedUserId = await upsertUser(connection, phones.approvedSeller, "本地测试陪玩", "LOCAL-SELLER-2026");
  const pendingUserId = await upsertUser(connection, phones.pendingSeller, "待审核测试陪玩", "LOCAL-PENDING-2026");

  await upsertIdentity(connection, approvedUserId, "本地测试陪玩", "LOCALTESTSELLER2026A", "approved-seller");
  await upsertIdentity(connection, pendingUserId, "待审核测试陪玩", "LOCALTESTSELLER2026B", "pending-seller");

  const voiceFileId = await upsertVoiceFile(connection, approvedUserId);
  const sellerAvatarFileId = await upsertImageFile(connection, approvedUserId, ids.sellerAvatarFile, imageAssets.sellerAvatar);
  const sellerCoverFileId = await upsertImageFile(connection, approvedUserId, ids.sellerCoverFile, imageAssets.sellerCover);
  const productCoverFileId = await upsertImageFile(connection, approvedUserId, ids.productCoverFile, imageAssets.productCover);
  const approvedSellerId = await upsertSeller(connection, approvedUserId, "APPROVED", "本地测试陪玩", voiceFileId, sellerAvatarFileId, sellerCoverFileId);
  const pendingSellerId = await upsertSeller(connection, pendingUserId, "PENDING_REVIEW", "待审核测试陪玩", null);

  await connection.query(
    `insert into file_usages (id, file_id, usage_type, target_type, target_id, deleted_at)
     values ($1, $2, 'VOICE', 'SELLER', $3, null)
     on conflict (file_id, usage_type, target_type, target_id) where deleted_at is null
     do update set deleted_at = null`,
    [ids.voiceUsage, voiceFileId, approvedSellerId],
  );
  await upsertFileUsage(connection, ids.sellerAvatarUsage, sellerAvatarFileId, "AVATAR", "SELLER", approvedSellerId);
  await upsertFileUsage(connection, ids.sellerCoverUsage, sellerCoverFileId, "COVER", "SELLER", approvedSellerId);

  await upsertSellerApplications(connection, adminId, approvedSellerId, pendingSellerId, voiceFileId);
  await upsertProduct(connection, adminId, approvedUserId, approvedSellerId, productCoverFileId);
  await upsertFileUsage(connection, ids.productCoverUsage, productCoverFileId, "COVER", "PRODUCT", ids.product);
  await upsertPayoutAccounts(connection, approvedSellerId);
  await upsertPlatformConfigs(connection, adminId);
  await connection.query("commit");

  const verification = await verifySeed(connection, {
    buyerId,
    approvedUserId,
    pendingUserId,
    approvedSellerId,
    pendingSellerId,
    adminId,
    productId: ids.product,
    voiceFileId,
    sellerAvatarFileId,
    sellerCoverFileId,
    productCoverFileId,
  });
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
} catch (error) {
  await connection.query("rollback").catch(() => undefined);
  throw error;
} finally {
  connection.release();
  await database.close();
}

function assertLocalDevelopment(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) throw new Error("人工测试 Seed 禁止连接非本机数据库。");
  if (decodeURIComponent(parsed.pathname.slice(1)) !== "xiongzai_api_dev") throw new Error("人工测试 Seed 只能写入 xiongzai_api_dev。");
}

async function upsertAdmin(connection, passwordHash) {
  const result = await connection.query(
    `insert into admin_accounts
       (id, username, display_name, password_hash, status, mfa_required, failed_login_count, locked_until, version, updated_at)
     values ($1, $2, '本地人工测试管理员', $3, 'ACTIVE', true, 0, null, 0, now())
     on conflict (username) do update set
       display_name = excluded.display_name, password_hash = excluded.password_hash, status = 'ACTIVE',
       mfa_required = true, failed_login_count = 0, locked_until = null, version = 0, updated_at = now()
     returning id`,
    [ids.admin, username, passwordHash],
  );
  const adminId = result.rows[0].id;
  await connection.query(
    `insert into admin_mfa_factors
       (id, admin_id, factor_type, secret_ciphertext, credential_id_hash, label, verified_at, revoked_at)
     values ($1, $2, 'TOTP', $3, null, '本地人工测试 TOTP', now(), null)
     on conflict (id) do update set admin_id = excluded.admin_id, factor_type = 'TOTP',
       secret_ciphertext = excluded.secret_ciphertext, label = excluded.label, verified_at = now(), revoked_at = null`,
    [ids.adminMfa, adminId, protector.encrypt("admin-mfa", totpSecret)],
  );
  return adminId;
}

async function upsertRoleAndPermissions(connection) {
  const role = await connection.query(
    `insert into roles (id, role_key, name, description, updated_at)
     values ($1, 'manual_test_super_admin', '本地人工测试超级管理员', '仅供本机人工验收', now())
     on conflict (role_key) do update set name = excluded.name, description = excluded.description, updated_at = now()
     returning id`,
    [ids.role],
  );
  const roleId = role.rows[0].id;
  for (const key of permissionKeys) {
    const permission = await connection.query(
      `insert into permissions (id, permission_key, description, high_risk)
       values ($1, $2::varchar, $2::text, $3)
       on conflict (permission_key) do update set description = excluded.description, high_risk = excluded.high_risk
       returning id`,
      [uuidv7(), key, key.endsWith("manage") || key.includes("evidence") || key.includes("review")],
    );
    await connection.query(
      `insert into role_permissions (role_id, permission_id) values ($1, $2)
       on conflict (role_id, permission_id) do nothing`,
      [roleId, permission.rows[0].id],
    );
  }
  return roleId;
}

async function upsertUser(connection, phone, nickname, publicUserNo) {
  const result = await connection.query(
    `insert into users
       (id, phone_ciphertext, phone_hash, phone_mask, status, profile_initialized, version, updated_at)
     values ($1, $2, $3, $4, 'NORMAL', true, 0, now())
     on conflict (phone_hash) do update set phone_ciphertext = excluded.phone_ciphertext,
       phone_mask = excluded.phone_mask, status = 'NORMAL', profile_initialized = true, cancelled_at = null,
       version = 0, updated_at = now()
     returning id`,
    [uuidv7(), protector.encrypt("phone", phone), protector.piiHash("phone", phone), protector.maskPhone(phone)],
  );
  const userId = result.rows[0].id;
  await connection.query(
    `insert into user_profiles (user_id, nickname, bio, public_user_no, deleted_at, version, updated_at)
     values ($1, $2, '仅供本地人工测试', $3, null, 0, now())
     on conflict (user_id) do update set nickname = excluded.nickname, bio = excluded.bio,
       public_user_no = excluded.public_user_no, deleted_at = null, version = 0, updated_at = now()`,
    [userId, nickname, publicUserNo],
  );
  await connection.query(
    `insert into privacy_settings
       (user_id, show_online_status, show_public_profile, personalized_recommendations, version, updated_at)
     values ($1, true, true, true, 0, now())
     on conflict (user_id) do update set show_online_status = true, show_public_profile = true,
       personalized_recommendations = true, version = 0, updated_at = now()`,
    [userId],
  );
  return userId;
}

async function upsertIdentity(connection, userId, name, document, suffix) {
  const normalizedName = protector.normalizeLegalName(name);
  const normalizedDocument = protector.normalizeDocument(document);
  await connection.query(
    `insert into identity_verifications
       (id, user_id, provider, provider_reference, legal_name_ciphertext, legal_name_hash, legal_name_mask,
        document_ciphertext, document_hash, document_mask, status, submitted_at, verified_at, version, updated_at)
     values ($1, $2, 'LOCAL_MANUAL_TEST', $3, $4, $5, $6, $7, $8, $9, 'VERIFIED', now(), now(), 0, now())
     on conflict (provider, provider_reference) do update set
       user_id = excluded.user_id, legal_name_ciphertext = excluded.legal_name_ciphertext,
       legal_name_hash = excluded.legal_name_hash, legal_name_mask = excluded.legal_name_mask,
       document_ciphertext = excluded.document_ciphertext, document_hash = excluded.document_hash,
       document_mask = excluded.document_mask, status = 'VERIFIED', rejection_code = null,
       rejection_reason = null, verified_at = now(), version = 0, updated_at = now()`,
    [
      uuidv7(), userId, `local-manual-${suffix}`,
      protector.encrypt("legal-name", normalizedName), protector.piiHash("legal-name", normalizedName), protector.maskLegalName(normalizedName),
      protector.encrypt("identity-document", normalizedDocument), protector.piiHash("identity-document", normalizedDocument), protector.maskDocument(normalizedDocument),
    ],
  );
}

async function upsertVoiceFile(connection, ownerUserId) {
  const result = await connection.query(
    `insert into files
       (id, owner_user_id, bucket, object_key, file_type, mime_type, size_bytes, duration_ms, sha256,
        upload_status, moderation_status, visibility, deleted_at, updated_at)
     values ($1, $2, $3, $4, 'VOICE_SAMPLE', 'audio/mpeg', $5, 15000, $6,
       'VERIFIED', 'APPROVED', 'SIGNED', null, now())
     on conflict (bucket, object_key) do update set owner_user_id = excluded.owner_user_id,
       file_type = 'VOICE_SAMPLE', mime_type = 'audio/mpeg', size_bytes = excluded.size_bytes,
       duration_ms = 15000, sha256 = excluded.sha256, upload_status = 'VERIFIED',
       moderation_status = 'APPROVED', visibility = 'SIGNED', deleted_at = null, updated_at = now()
     returning id`,
    [ids.voiceFile, ownerUserId, config.filePrivateBucket, voiceObjectKey, BigInt(voice.byteLength).toString(), voiceSha256],
  );
  return result.rows[0].id;
}

async function prepareImageAsset(relativePath, objectKey, fileType, width, height) {
  const bytes = await readFile(new URL(relativePath, import.meta.url));
  return { bytes, objectKey, fileType, width, height, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function uploadPublicImage(asset) {
  const request = await storage.createUploadRequest({
    bucket: config.filePublicBucket,
    objectKey: asset.objectKey,
    contentType: asset.mimeType,
    sizeBytes: asset.bytes.byteLength,
    sha256: asset.sha256,
    expiresInSeconds: 120,
  });
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: asset.bytes });
  if (!response.ok) throw new Error(`本地测试图片上传失败（${asset.objectKey}，HTTP ${response.status}）。`);
}

async function upsertImageFile(connection, ownerUserId, fileId, asset) {
  const result = await connection.query(
    `insert into files
       (id, owner_user_id, bucket, object_key, file_type, mime_type, size_bytes, width, height, sha256,
        upload_status, moderation_status, visibility, deleted_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VERIFIED', 'APPROVED', 'PUBLIC', null, now())
     on conflict (bucket, object_key) do update set owner_user_id = excluded.owner_user_id,
       file_type = excluded.file_type, mime_type = excluded.mime_type, size_bytes = excluded.size_bytes,
       width = excluded.width, height = excluded.height, sha256 = excluded.sha256,
       upload_status = 'VERIFIED', moderation_status = 'APPROVED', visibility = 'PUBLIC',
       deleted_at = null, updated_at = now()
     returning id`,
    [fileId, ownerUserId, config.filePublicBucket, asset.objectKey, asset.fileType, asset.mimeType, String(asset.bytes.byteLength), asset.width, asset.height, asset.sha256],
  );
  return result.rows[0].id;
}

async function upsertFileUsage(connection, usageId, fileId, usageType, targetType, targetId) {
  await connection.query(
    `insert into file_usages (id, file_id, usage_type, target_type, target_id, deleted_at)
     values ($1, $2, $3, $4, $5, null)
     on conflict (file_id, usage_type, target_type, target_id) where deleted_at is null
     do update set deleted_at = null`,
    [usageId, fileId, usageType, targetType, targetId],
  );
}

async function upsertSeller(connection, userId, status, nickname, voiceFileId, sellerAvatarFileId = null, coverFileId = null) {
  const approved = status === "APPROVED";
  const result = await connection.query(
    `insert into seller_profiles
       (id, user_id, status, seller_nickname, seller_avatar_file_id, cover_file_id, introduction, game_rank, kd, preferred_mode, play_style,
        game_experience, voice_file_id, voice_duration_ms, accepting_orders, rating_avg, review_count,
        completed_order_count, favorite_count, approved_at, suspended_reason, version, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, '超级王牌', '4.20', '经典四排', '陪伴沟通型',
       '和平精英本地人工验收资料', $8, $9, $10, '5.00', 0, 0, 0, $11, null, 0, now())
     on conflict (user_id) do update set status = excluded.status, seller_nickname = excluded.seller_nickname,
       seller_avatar_file_id = excluded.seller_avatar_file_id, cover_file_id = excluded.cover_file_id,
       introduction = excluded.introduction, game_rank = excluded.game_rank, kd = excluded.kd,
       preferred_mode = excluded.preferred_mode, play_style = excluded.play_style,
       game_experience = excluded.game_experience, voice_file_id = excluded.voice_file_id,
       voice_duration_ms = excluded.voice_duration_ms, accepting_orders = excluded.accepting_orders,
       approved_at = excluded.approved_at, suspended_reason = null, version = 0, updated_at = now()
     returning id`,
    [
      uuidv7(), userId, status, nickname,
      sellerAvatarFileId, coverFileId,
      approved ? "本地人工验收专用陪玩服务，支持订单、聊天、售后与提现全链路。" : "本地人工验收专用待审核资料。",
      voiceFileId, voiceFileId ? 15000 : null, approved, approved ? new Date() : null,
    ],
  );
  return result.rows[0].id;
}

async function upsertSellerApplications(connection, adminId, approvedSellerId, pendingSellerId, voiceFileId) {
  const approvedSnapshot = {
    seller_nickname: "本地测试陪玩", introduction: "本地人工验收专用陪玩服务，支持订单、聊天、售后与提现全链路。",
    game_rank: "超级王牌", kd: "4.20", preferred_mode: "经典四排", play_style: "陪伴沟通型",
    game_experience: "和平精英本地人工验收资料", voice_file_id: voiceFileId, voice_duration_ms: 15000,
  };
  await connection.query(
    `insert into seller_applications
       (id, seller_id, version_no, snapshot_json, status, submitted_at, reviewed_by_admin_id, reviewed_at, version, updated_at)
     values ($1, $2, 1, $3::jsonb, 'APPROVED', now(), $4, now(), 0, now())
     on conflict (seller_id, version_no) do nothing`,
    [ids.approvedApplication, approvedSellerId, JSON.stringify(approvedSnapshot), adminId],
  );
  const approved = await connection.query(
    "select id from seller_applications where seller_id = $1 and version_no = 1",
    [approvedSellerId],
  );
  await connection.query(
    `insert into seller_review_logs
       (id, seller_id, application_id, action, old_status, new_status, admin_id, reason, request_id)
     values ($1, $2, $3, 'APPROVE', 'SUBMITTED', 'APPROVED', $4, '本地人工测试数据', 'manual-test-seed-seller-approved')
     on conflict (id) do nothing`,
    [ids.approvedReview, approvedSellerId, approved.rows[0].id, adminId],
  );
  const pendingSnapshot = {
    seller_nickname: "待审核测试陪玩", introduction: "本地人工验收专用待审核资料。", game_rank: "皇冠",
    kd: "3.10", preferred_mode: "经典四排", play_style: "战术协作型", game_experience: "待后台审核",
    voice_file_id: null, voice_duration_ms: null,
  };
  await connection.query(
    `insert into seller_applications
       (id, seller_id, version_no, snapshot_json, status, submitted_at, version, updated_at)
     values ($1, $2, 1, $3::jsonb, 'SUBMITTED', now(), 0, now())
     on conflict (seller_id, version_no) do nothing`,
    [ids.pendingApplication, pendingSellerId, JSON.stringify(pendingSnapshot)],
  );
}

async function upsertProduct(connection, adminId, sellerUserId, sellerId, productCoverFileId) {
  await connection.query(
    `insert into products
       (id, seller_id, title, description, service_time_description, cover_file_id, status, rating_avg, review_count,
        sold_count, min_price_cent, current_version_no, submitted_at, approved_at, deleted_at, version, updated_at)
     values ($1, $2, '本地测试｜和平精英陪玩', '用于本地人工验收的已审核上架服务。', '每日可预约', $3,
       'ON_SALE', '5.00', 0, 0, 2500, 1, now(), now(), null, 0, now())
     on conflict (id) do update set seller_id = excluded.seller_id, title = excluded.title,
       description = excluded.description, service_time_description = excluded.service_time_description,
       cover_file_id = excluded.cover_file_id,
       status = 'ON_SALE', min_price_cent = 2500, current_version_no = 1,
       approved_at = now(), deleted_at = null, version = 0, updated_at = now()`,
    [ids.product, sellerId, productCoverFileId],
  );
  const snapshot = {
    title: "本地测试｜和平精英陪玩", description: "用于本地人工验收的已审核上架服务。",
    service_time_description: "每日可预约", cover_file_id: productCoverFileId, skus: [
      { id: ids.sku60, name: "畅玩 1 小时", price_cent: "2500", duration_minutes: 60 },
      { id: ids.sku120, name: "畅玩 2 小时", price_cent: "4500", duration_minutes: 120 },
    ],
  };
  await connection.query(
    `insert into product_versions (id, product_id, version_no, snapshot_json, submitted_by_user_id, submitted_at)
     values ($1, $2, 1, $3::jsonb, $4, now())
     on conflict (product_id, version_no) do nothing`,
    [ids.productVersion, ids.product, JSON.stringify(snapshot), sellerUserId],
  );
  const version = await connection.query("select id from product_versions where product_id = $1 and version_no = 1", [ids.product]);
  await connection.query(
    `insert into product_images (id, product_id, file_id, sort_order, is_cover, deleted_at)
     values ($1, $2, $3, 0, true, null)
     on conflict (product_id) where is_cover = true and deleted_at is null
     do update set file_id = excluded.file_id, sort_order = 0, deleted_at = null`,
    [ids.productImage, ids.product, productCoverFileId],
  );
  await connection.query(
    `insert into product_review_logs
       (id, product_id, product_version_id, action, old_status, new_status, admin_id, reason, request_id)
     values ($1, $2, $3, 'APPROVE', 'PENDING_REVIEW', 'ON_SALE', $4, '本地人工测试数据', 'manual-test-seed-product-approved')
     on conflict (id) do nothing`,
    [ids.productReview, ids.product, version.rows[0].id, adminId],
  );
  await connection.query(
    `insert into product_skus
       (id, product_id, sku_name, description, price_cent, duration_minutes, status, sort_order, deleted_at, version, updated_at)
     values
       ($1, $3, '畅玩 1 小时', '单次 60 分钟', 2500, 60, 'ACTIVE', 1, null, 0, now()),
       ($2, $3, '畅玩 2 小时', '单次 120 分钟', 4500, 120, 'ACTIVE', 2, null, 0, now())
     on conflict (id) do update set product_id = excluded.product_id, sku_name = excluded.sku_name,
       description = excluded.description, price_cent = excluded.price_cent, duration_minutes = excluded.duration_minutes,
       status = 'ACTIVE', sort_order = excluded.sort_order, deleted_at = null, version = 0, updated_at = now()`,
    [ids.sku60, ids.sku120, ids.product],
  );
  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  startsAt.setUTCMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  await connection.query(
    `insert into seller_availability_slots (id, seller_id, starts_at, ends_at, status, version, updated_at)
     values ($1, $2, $3, $4, 'OPEN', 0, now())
     on conflict (id) do update set seller_id = excluded.seller_id, starts_at = excluded.starts_at,
       ends_at = excluded.ends_at, status = 'OPEN', version = 0, updated_at = now()`,
    [ids.availability, sellerId, startsAt, endsAt],
  );
}

async function upsertPayoutAccounts(connection, sellerId) {
  const holder = protector.normalizeLegalName("本地测试陪玩");
  const accounts = [
    { id: ids.wechatPayout, type: "WECHAT", token: "wx-local-manual-2002", isDefault: true },
    { id: ids.alipayPayout, type: "ALIPAY", token: "ali-local-manual-2002", isDefault: false },
  ];
  for (const account of accounts) {
    const token = protector.normalizePayoutValue(account.token);
    await connection.query(
      `insert into payout_accounts
         (id, seller_id, account_type, holder_name_ciphertext, holder_name_hash, account_token_ciphertext,
          account_token_hash, display_mask, verification_status, is_default, last_verified_at, deleted_at, version, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'VERIFIED', $9, now(), null, 0, now())
       on conflict (id) do update set seller_id = excluded.seller_id, account_type = excluded.account_type,
         holder_name_ciphertext = excluded.holder_name_ciphertext, holder_name_hash = excluded.holder_name_hash,
         account_token_ciphertext = excluded.account_token_ciphertext, account_token_hash = excluded.account_token_hash,
         display_mask = excluded.display_mask, verification_status = 'VERIFIED', is_default = excluded.is_default,
         last_verified_at = now(), deleted_at = null, version = 0, updated_at = now()`,
      [
        account.id, sellerId, account.type, protector.encrypt("payout-holder", holder), protector.piiHash("payout-holder", holder),
        protector.encrypt("payout-account", token), protector.piiHash("payout-account", token), protector.maskPayoutAccount(token), account.isDefault,
      ],
    );
  }
}

async function upsertPlatformConfigs(connection, adminId) {
  const values = new Map([
    ["order.payment_timeout_seconds", 300], ["order.accept_timeout_seconds", 300],
    ["order.auto_confirm_seconds", 300], ["finance.commission_rate_bps", 1000],
    ["finance.settlement_delay_seconds", 0], ["finance.withdrawal_fee_bps", 100],
    ["finance.withdrawal_min_cent", 1], ["finance.withdrawal_max_cent", 1_000_000],
  ]);
  for (const [key, value] of values) {
    const active = await connection.query(
      "select id from platform_configs where config_key = $1 and status = 'ACTIVE' for update",
      [key],
    );
    if (active.rows[0]) {
      await connection.query(
        "update platform_configs set value_json = $2::jsonb, effective_at = now() where id = $1",
        [active.rows[0].id, JSON.stringify({ value })],
      );
      continue;
    }
    const version = await connection.query(
      "select coalesce(max(version_no), 0) + 1 as version_no from platform_configs where config_key = $1",
      [key],
    );
    await connection.query(
      `insert into platform_configs
         (id, config_key, value_json, version_no, status, effective_at, created_by_admin_id)
       values ($1, $2, $3::jsonb, $4, 'ACTIVE', now(), $5)`,
      [uuidv7(), key, JSON.stringify({ value }), Number(version.rows[0].version_no), adminId],
    );
  }
}

async function verifySeed(connection, expected) {
  const rows = await connection.query(
    `select
       (select count(*)::int from users where id = any($1::uuid[])) as users,
       (select count(*)::int from identity_verifications where user_id = any($2::uuid[]) and status = 'VERIFIED') as verified_identities,
       (select count(*)::int from seller_profiles where id = any($3::uuid[])) as sellers,
       (select count(*)::int from product_skus where product_id = $4 and status = 'ACTIVE' and deleted_at is null) as skus,
       (select count(*)::int from seller_availability_slots where seller_id = $5 and status = 'OPEN') as open_slots,
       (select count(*)::int from payout_accounts where seller_id = $5 and deleted_at is null) as payout_accounts,
       (select count(*)::int from payout_accounts where seller_id = $5 and account_type not in ('WECHAT', 'ALIPAY')) as invalid_payout_accounts,
       (select count(*)::int from files f join file_usages u on u.file_id = f.id
          where f.id = $6 and f.file_type = 'VOICE_SAMPLE' and f.mime_type = 'audio/mpeg'
            and f.duration_ms between 10000 and 30000 and f.upload_status = 'VERIFIED'
            and f.moderation_status = 'APPROVED' and f.visibility = 'SIGNED'
            and f.deleted_at is null and u.usage_type = 'VOICE' and u.target_type = 'SELLER' and u.deleted_at is null) as voice_bindings,
       (select count(*)::int from files f join file_usages u on u.file_id = f.id
          where f.id = any($7::uuid[]) and f.file_type in ('SELLER_AVATAR', 'SELLER_COVER', 'PRODUCT_IMAGE')
            and f.mime_type = 'image/png' and f.width > 0 and f.height > 0 and f.upload_status = 'VERIFIED'
            and f.moderation_status = 'APPROVED' and f.visibility = 'PUBLIC' and f.deleted_at is null
            and u.usage_type in ('AVATAR', 'COVER') and u.deleted_at is null) as image_bindings,
       (select count(*)::int from admin_accounts a join admin_mfa_factors m on m.admin_id = a.id
          where a.id = $8 and a.status = 'ACTIVE' and m.factor_type = 'TOTP' and m.verified_at is not null and m.revoked_at is null) as admin_mfa,
       (select count(*)::int from role_permissions rp join admin_roles ar on ar.role_id = rp.role_id where ar.admin_id = $8) as admin_permissions,
       (select count(*)::int from platform_configs where status = 'ACTIVE' and config_key = any($9::text[])) as active_configs,
       (select count(*)::int from drizzle.__drizzle_migrations) as migrations`,
    [
      [expected.buyerId, expected.approvedUserId, expected.pendingUserId],
      [expected.approvedUserId, expected.pendingUserId],
      [expected.approvedSellerId, expected.pendingSellerId],
      expected.productId, expected.approvedSellerId, expected.voiceFileId,
      [expected.sellerAvatarFileId, expected.sellerCoverFileId, expected.productCoverFileId], expected.adminId,
      [
        "order.payment_timeout_seconds", "order.accept_timeout_seconds", "order.auto_confirm_seconds",
        "finance.commission_rate_bps", "finance.settlement_delay_seconds", "finance.withdrawal_fee_bps",
        "finance.withdrawal_min_cent", "finance.withdrawal_max_cent",
      ],
    ],
  );
  const summary = rows.rows[0];
  const expectedValues = {
    users: 3, verified_identities: 2, sellers: 2, skus: 2, open_slots: 1,
    payout_accounts: 2, invalid_payout_accounts: 0, voice_bindings: 1, image_bindings: 3,
    admin_mfa: 1, admin_permissions: permissionKeys.length, active_configs: 8, migrations: expectedMigrationCount,
  };
  for (const [key, value] of Object.entries(expectedValues)) {
    if (summary[key] !== value) throw new Error(`人工测试 Seed 校验失败：${key} 预期 ${value}，实际 ${summary[key]}`);
  }
  return { status: "ok", database: "xiongzai_api_dev", provider_modes: { sms: "development", payment: "mock", payout: "mock" }, ...summary };
}

function mp3Sample(seconds) {
  const frameLength = 417;
  const frameCount = Math.ceil(seconds * 44_100 / 1_152);
  const bytes = new Uint8Array(frameLength * frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    bytes.set([0xff, 0xfb, 0x90, 0x00], index * frameLength);
  }
  return bytes;
}
