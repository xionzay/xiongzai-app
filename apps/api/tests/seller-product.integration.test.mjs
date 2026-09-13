import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_seller_product_${randomUUID().replaceAll("-", "")}`;
let migrationClient;
let database;
let app;
let user;
let admin;
let readOnlyAdmin;
let unconsentedVoiceUser;

const storage = {
  async createUploadRequest() { throw new Error("not used by seller-product integration test"); },
  async headObject() { throw new Error("not used by seller-product integration test"); },
  async readObject() { throw new Error("not used by seller-product integration test"); },
  async createDownloadUrl(input) { return { url: "https://voice.test/access/token?signed=1", expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000) }; },
  async copyObject() { throw new Error("not used by seller-product integration test"); },
  async deleteObject() {},
  async listObjects() { return { objects: [], nextCursor: null, truncated: false }; },
};

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "seller-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "seller-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "seller-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "seller-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "seller-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "seller-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "seller-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", SMS_DEVELOPMENT_CODE: "246810",
  SMS_CODE_TTL_SECONDS: "300", SMS_MAX_ATTEMPTS: "3", SMS_MINIMUM_INTERVAL_SECONDS: "1", ACCESS_TOKEN_TTL_SECONDS: "300",
  REFRESH_TOKEN_TTL_SECONDS: "3600", API_CORS_ORIGINS: "http://localhost:3001",
  PUBLIC_ASSET_BASE_URL: "https://cdn.example.test/assets",
});

before(async () => {
  if (!enabled) return;
  migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  await migrationClient.query(`CREATE SCHEMA "${schemaName}"`);
  await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql");
  await runMigration("0001_core_invariants.sql");
  await runMigration("0002_admin_stage2_permissions.sql");
  await runMigration("0003_admin_query_performance.sql");
  await runMigration("0004_payment_channels_voice_constraints.sql");
  await runMigration("0005_policy_acceptance_context.sql");
  await runMigration("0006_policy_version_bindings.sql");
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-seller-product-test", options: `-c search_path=${schemaName},public`, max: 4 });
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async () => {} }, objectStorageProvider: storage, logger: new JsonLogger("seller-product-test", () => {}) });
  user = await seedUser(true);
  await seedRequiredPolicies(user.id);
  unconsentedVoiceUser = await seedUser(false);
  admin = await seedAdmin(["seller_application.read", "seller_application.review", "seller.read", "seller.status.manage", "product.read", "product.review"]);
  readOnlyAdmin = await seedAdmin(["seller_application.read", "seller.read", "product.read"]);
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("seller application snapshots are immutable and admin review is permission-checked and audited", { skip: !enabled }, async () => {
  const unauthorized = await app.inject({ method: "GET", url: "/api/v1/seller/profile" });
  assert.equal(unauthorized.statusCode, 401);

  const created = await userRequest("POST", "/api/v1/seller/profile", {
    seller_nickname: "测试陪玩", introduction: "稳定沟通，全程平台内交易", game_rank: "无敌战神", kd: "6.80", preferred_mode: "经典模式", accepting_orders: true,
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().version, 0);

  const incomplete = await userRequest("POST", "/api/v1/seller/applications", { version: 0 });
  assert.equal(incomplete.statusCode, 400);
  assert.equal(incomplete.json().code, "VALIDATION_FAILED");
  assert.ok(incomplete.json().field_errors.some((item) => item.field === "seller_avatar_file_id"));
  const avatarId = await seedOwnedFile(user.id, "SELLER_AVATAR", "image/webp");
  const coverId = await seedOwnedFile(user.id, "SELLER_COVER", "image/webp");
  const voiceId = await seedOwnedFile(user.id, "VOICE_SAMPLE", "audio/mp4");
  const completed = await userRequest("PATCH", "/api/v1/seller/profile", {
    seller_nickname: "测试陪玩", seller_avatar_file_id: avatarId, cover_file_id: coverId, introduction: "稳定沟通，全程平台内交易", game_rank: "无敌战神", kd: "6.80", preferred_mode: "经典模式", play_style: "稳健配合", game_experience: "五年和平精英游戏经验", voice_file_id: voiceId, voice_duration_ms: 10_001, accepting_orders: false, version: 0,
  });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json().voice_duration_ms, 15_000);

  const submitted = await userRequest("POST", "/api/v1/seller/applications", { version: completed.json().version });
  assert.equal(submitted.statusCode, 201, submitted.body);
  assert.equal(submitted.json().version_no, 1);
  assert.ok(submitted.json().onboarding_policy_version_id);
  const boundPolicies = await migrationClient.query("SELECT sp.voice_authorization_policy_version_id, sa.onboarding_policy_version_id FROM seller_profiles sp JOIN seller_applications sa ON sa.seller_id = sp.id WHERE sa.id = $1", [submitted.json().id]);
  assert.ok(boundPolicies.rows[0].voice_authorization_policy_version_id);
  assert.equal(boundPolicies.rows[0].onboarding_policy_version_id, submitted.json().onboarding_policy_version_id);
  const applicationDetail = await adminRequest(readOnlyAdmin, "GET", `/admin-api/v1/seller-applications/${submitted.json().id}`);
  assert.equal(applicationDetail.statusCode, 200, applicationDetail.body);
  assert.equal(applicationDetail.json().id, submitted.json().id);
  assert.equal(applicationDetail.json().snapshot.seller_nickname, "测试陪玩");
  assert.doesNotMatch(JSON.stringify(applicationDetail.json()), /phone_ciphertext|password|token|secret|bucket|object_key|presigned/iu);
  assert.equal((await adminRequest(readOnlyAdmin, "GET", `/admin-api/v1/seller-applications/${randomUUID()}`)).statusCode, 404);
  const duplicate = await userRequest("POST", "/api/v1/seller/applications", { version: completed.json().version + 1 });
  assert.equal(duplicate.statusCode, 409);

  const denied = await adminRequest(readOnlyAdmin, "POST", `/admin-api/v1/seller-applications/${submitted.json().id}/review`, { action: "APPROVE", version: 0 });
  assert.equal(denied.statusCode, 403);
  const approved = await adminRequest(admin, "POST", `/admin-api/v1/seller-applications/${submitted.json().id}/review`, { action: "APPROVE", version: 0 });
  assert.equal(approved.statusCode, 201, approved.body);
  assert.equal(approved.json().status, "APPROVED");

  const seller = await userRequest("GET", "/api/v1/seller/profile");
  assert.equal(seller.json().user_id, user.id);
  const adminSeller = await adminRequest(readOnlyAdmin, "GET", `/admin-api/v1/sellers/${seller.json().id}`);
  assert.equal(adminSeller.statusCode, 200, adminSeller.body);
  assert.equal(adminSeller.json().id, seller.json().id);
  assert.ok(Array.isArray(adminSeller.json().applications));
  const genericSignedAccess = await app.inject({ method: "GET", url: `/api/v1/files/${voiceId}` });
  assert.equal(genericSignedAccess.statusCode, 404);
  const companionVoice = await app.inject({ method: "GET", url: `/api/v1/companions/${seller.json().id}/voice` });
  assert.equal(companionVoice.statusCode, 200, companionVoice.body);
  assert.equal(companionVoice.json().file_id, voiceId);
  assert.equal(companionVoice.json().duration_ms, 15_000);
  assert.match(companionVoice.json().access.url, /^https:\/\/voice\.test\//u);
  assert.equal(companionVoice.body.includes("seller-media"), false);
  assert.equal(companionVoice.body.includes("object_key"), false);
  const overview = await userRequest("GET", "/api/v1/seller/overview");
  assert.equal(overview.statusCode, 200, overview.body);
  assert.equal(overview.json().seller.user_id, user.id);
  assert.equal(overview.json().finance.available_cent, "0");
  const bypassAttempt = await userRequest("PATCH", "/api/v1/seller/profile", { ...sellerPublicInput(seller.json()), seller_nickname: "绕过审核的名字", accepting_orders: true, version: seller.json().version });
  assert.equal(bypassAttempt.statusCode, 409, bypassAttempt.body);
  assert.equal((await userRequest("GET", "/api/v1/seller/profile")).json().seller_nickname, "测试陪玩");
  const toggled = await userRequest("PATCH", "/api/v1/seller/profile", { ...sellerPublicInput(seller.json()), accepting_orders: true, version: seller.json().version });
  assert.equal(toggled.statusCode, 200, toggled.body);
  assert.equal(toggled.json().accepting_orders, true);
  const activeUsages = await migrationClient.query("SELECT file_id, usage_type FROM file_usages WHERE target_type = 'SELLER' AND target_id = $1 AND deleted_at IS NULL ORDER BY usage_type", [seller.json().id]);
  assert.deepEqual(activeUsages.rows, [{ file_id: avatarId, usage_type: "AVATAR" }, { file_id: coverId, usage_type: "COVER" }, { file_id: voiceId, usage_type: "VOICE" }]);

  const otherUser = await seedUser(true);
  const otherUserVoiceId = await seedOwnedFile(otherUser.id, "VOICE_SAMPLE", "audio/mpeg");
  const wrongPurposeId = await seedOwnedFile(user.id, "PRODUCT_IMAGE", "image/webp");
  const pendingVoiceId = await seedOwnedFile(user.id, "VOICE_SAMPLE", "audio/mpeg");
  const rejectedVoiceId = await seedOwnedFile(user.id, "VOICE_SAMPLE", "audio/mpeg");
  const deletedVoiceId = await seedOwnedFile(user.id, "VOICE_SAMPLE", "audio/mpeg");
  await migrationClient.query("UPDATE files SET moderation_status='PENDING' WHERE id=$1", [pendingVoiceId]);
  await migrationClient.query("UPDATE files SET moderation_status='REJECTED' WHERE id=$1", [rejectedVoiceId]);
  await migrationClient.query("UPDATE files SET deleted_at=now() WHERE id=$1", [deletedVoiceId]);
  for (const invalidVoiceFileId of [otherUserVoiceId, wrongPurposeId, pendingVoiceId, rejectedVoiceId, deletedVoiceId]) {
    const invalidBinding = await userRequest("PUT", "/api/v1/seller/profile-revisions/draft", { ...sellerPublicInput(toggled.json()), seller_nickname: "改名后的陪玩", voice_file_id: invalidVoiceFileId, seller_version: toggled.json().version });
    assert.equal(invalidBinding.statusCode, 400, invalidBinding.body);
    assert.equal(invalidBinding.json().code, "VALIDATION_FAILED");
    assert.ok(invalidBinding.json().field_errors.some((item) => item.field === "file_id"));
  }
  const unchangedAfterInvalidBindings = await userRequest("GET", "/api/v1/seller/profile");
  assert.equal(unchangedAfterInvalidBindings.json().voice_file_id, voiceId);
  assert.equal(unchangedAfterInvalidBindings.json().version, toggled.json().version);

  const replacementVoiceId = await seedOwnedFile(user.id, "VOICE_SAMPLE", "audio/mpeg", 18_000);
  const revisionDraft = await userRequest("PUT", "/api/v1/seller/profile-revisions/draft", { ...sellerPublicInput(toggled.json()), seller_nickname: "改名后的陪玩", introduction: "新的介绍仍在平台交易", voice_file_id: replacementVoiceId, voice_duration_ms: 29_999, seller_version: toggled.json().version });
  assert.equal(revisionDraft.statusCode, 200, revisionDraft.body);
  assert.equal(revisionDraft.json().revision_kind, "PROFILE_UPDATE");
  assert.equal(revisionDraft.json().snapshot.voice_duration_ms, 18_000);
  const staleDraft = await userRequest("PUT", "/api/v1/seller/profile-revisions/draft", { ...sellerPublicInput(toggled.json()), seller_nickname: "冲突名字", seller_version: toggled.json().version, application_version: revisionDraft.json().version + 1 });
  assert.equal(staleDraft.statusCode, 409, staleDraft.body);
  const beforeSubmitPublic = await app.inject({ method: "GET", url: `/api/v1/companions/${seller.json().id}` });
  assert.equal(beforeSubmitPublic.json().seller_nickname, "测试陪玩");
  const revisionSubmitted = await userRequest("POST", `/api/v1/seller/profile-revisions/${revisionDraft.json().id}/submit`, { version: revisionDraft.json().version });
  assert.equal(revisionSubmitted.statusCode, 201, revisionSubmitted.body);
  const pendingProfile = await userRequest("GET", "/api/v1/seller/profile");
  assert.equal(pendingProfile.json().seller_nickname, "测试陪玩");
  assert.equal(pendingProfile.json().pending_profile_revision.status, "SUBMITTED");
  const revisionDetail = await adminRequest(readOnlyAdmin, "GET", `/admin-api/v1/seller-applications/${revisionDraft.json().id}`);
  assert.equal(revisionDetail.json().revision_kind, "PROFILE_UPDATE");
  assert.equal(revisionDetail.json().current_public_profile.seller_nickname, "测试陪玩");
  assert.equal(revisionDetail.json().snapshot.seller_nickname, "改名后的陪玩");
  const revisionApproved = await adminRequest(admin, "POST", `/admin-api/v1/seller-applications/${revisionDraft.json().id}/review`, { action: "APPROVE", version: revisionSubmitted.json().version });
  assert.equal(revisionApproved.statusCode, 201, revisionApproved.body);
  const published = (await userRequest("GET", "/api/v1/seller/profile")).json();
  assert.equal(published.seller_nickname, "改名后的陪玩");
  assert.equal(published.voice_file_id, replacementVoiceId);
  assert.equal(published.accepting_orders, true);
  const voiceUsages = await migrationClient.query("SELECT file_id, deleted_at IS NULL AS active FROM file_usages WHERE target_type = 'SELLER' AND target_id = $1 AND usage_type = 'VOICE' ORDER BY created_at", [seller.json().id]);
  assert.deepEqual(voiceUsages.rows, [{ file_id: voiceId, active: false }, { file_id: replacementVoiceId, active: true }]);
  const replacedAccess = await app.inject({ method: "GET", url: `/api/v1/companions/${seller.json().id}/voice` });
  assert.equal(replacedAccess.json().file_id, replacementVoiceId);

  const rejectedDraft = await userRequest("PUT", "/api/v1/seller/profile-revisions/draft", { ...sellerPublicInput(published), seller_nickname: "不应公开的名字", seller_version: published.version });
  const rejectedSubmitted = await userRequest("POST", `/api/v1/seller/profile-revisions/${rejectedDraft.json().id}/submit`, { version: rejectedDraft.json().version });
  const rejectedReview = await adminRequest(admin, "POST", `/admin-api/v1/seller-applications/${rejectedDraft.json().id}/review`, { action: "REJECT", reason: "资料描述不符合平台要求", version: rejectedSubmitted.json().version });
  assert.equal(rejectedReview.statusCode, 201, rejectedReview.body);
  const afterReject = (await userRequest("GET", "/api/v1/seller/profile")).json();
  assert.equal(afterReject.seller_nickname, "改名后的陪玩");
  assert.equal(afterReject.status, "APPROVED");

  const snapshots = await migrationClient.query("SELECT snapshot_json, count(*) over()::integer AS count FROM seller_applications WHERE seller_id = $1 ORDER BY created_at ASC", [seller.json().id]);
  assert.equal(snapshots.rows[0].count, 3);
  assert.equal(snapshots.rows[0].snapshot_json.seller_nickname, "测试陪玩");
  const logs = await migrationClient.query("SELECT (SELECT count(*) FROM seller_review_logs)::integer AS review_count, (SELECT count(*) FROM admin_operation_logs WHERE target_type = 'SELLER')::integer AS audit_count");
  assert.equal(logs.rows[0].review_count, 6);
  assert.equal(logs.rows[0].audit_count, 3);
});

test("voice binding requires server-side playback authorization and unbinding clears the policy binding", { skip: !enabled }, async () => {
  const voiceId = await seedOwnedFile(unconsentedVoiceUser.id, "VOICE_SAMPLE", "audio/mp4", 16_000);
  const deniedCreate = await userRequestAs(unconsentedVoiceUser, "POST", "/api/v1/seller/profile", {
    seller_nickname: "未授权陪玩", voice_file_id: voiceId,
  });
  assert.equal(deniedCreate.statusCode, 409, deniedCreate.body);
  assert.equal(deniedCreate.json().code, "POLICY_ACCEPTANCE_REQUIRED");
  const rowsAfterDeniedCreate = await migrationClient.query("SELECT count(*)::integer AS count FROM seller_profiles WHERE user_id = $1", [unconsentedVoiceUser.id]);
  assert.equal(rowsAfterDeniedCreate.rows[0].count, 0);

  const created = await userRequestAs(unconsentedVoiceUser, "POST", "/api/v1/seller/profile", { seller_nickname: "未授权陪玩" });
  assert.equal(created.statusCode, 201, created.body);
  const deniedUpdate = await userRequestAs(unconsentedVoiceUser, "PATCH", "/api/v1/seller/profile", {
    seller_nickname: "未授权陪玩", voice_file_id: voiceId, version: created.json().version,
  });
  assert.equal(deniedUpdate.statusCode, 409, deniedUpdate.body);
  assert.equal(deniedUpdate.json().code, "POLICY_ACCEPTANCE_REQUIRED");
  const unchanged = await migrationClient.query("SELECT voice_file_id, voice_authorization_policy_version_id, version FROM seller_profiles WHERE id = $1", [created.json().id]);
  assert.equal(unchanged.rows[0].voice_file_id, null);
  assert.equal(unchanged.rows[0].voice_authorization_policy_version_id, null);
  assert.equal(unchanged.rows[0].version, created.json().version);
  const usagesAfterDeniedUpdate = await migrationClient.query("SELECT count(*)::integer AS count FROM file_usages WHERE target_type = 'SELLER' AND target_id = $1 AND usage_type = 'VOICE' AND deleted_at IS NULL", [created.json().id]);
  assert.equal(usagesAfterDeniedUpdate.rows[0].count, 0);

  const policy = await migrationClient.query("SELECT id FROM policy_versions WHERE policy_type = 'VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION' AND status = 'PUBLISHED' ORDER BY version_no DESC LIMIT 1");
  assert.ok(policy.rows[0]?.id);
  await migrationClient.query("INSERT INTO user_policy_acceptances (user_id, policy_version_id, acceptance_scene, confirmation_method, ip, user_agent) VALUES ($1, $2, 'VOICE_SAMPLE_UPLOAD', 'ONLINE_CONFIRM', '127.0.0.1', 'integration-test')", [unconsentedVoiceUser.id, policy.rows[0].id]);
  const bound = await userRequestAs(unconsentedVoiceUser, "PATCH", "/api/v1/seller/profile", {
    seller_nickname: "已授权陪玩", voice_file_id: voiceId, version: created.json().version,
  });
  assert.equal(bound.statusCode, 200, bound.body);
  assert.equal(bound.json().voice_file_id, voiceId);
  assert.equal(bound.json().voice_duration_ms, 16_000);
  const policyBinding = await migrationClient.query("SELECT voice_authorization_policy_version_id FROM seller_profiles WHERE id = $1", [created.json().id]);
  assert.equal(policyBinding.rows[0].voice_authorization_policy_version_id, policy.rows[0].id);
  const activeUsage = await migrationClient.query("SELECT file_id FROM file_usages WHERE target_type = 'SELLER' AND target_id = $1 AND usage_type = 'VOICE' AND deleted_at IS NULL", [created.json().id]);
  assert.deepEqual(activeUsage.rows, [{ file_id: voiceId }]);

  const unbound = await userRequestAs(unconsentedVoiceUser, "PATCH", "/api/v1/seller/profile", {
    seller_nickname: "已授权陪玩", voice_file_id: null, version: bound.json().version,
  });
  assert.equal(unbound.statusCode, 200, unbound.body);
  assert.equal(unbound.json().voice_file_id, null);
  assert.equal(unbound.json().voice_duration_ms, null);
  const cleared = await migrationClient.query("SELECT voice_authorization_policy_version_id FROM seller_profiles WHERE id = $1", [created.json().id]);
  assert.equal(cleared.rows[0].voice_authorization_policy_version_id, null);
  const activeAfterUnbind = await migrationClient.query("SELECT count(*)::integer AS count FROM file_usages WHERE target_type = 'SELLER' AND target_id = $1 AND usage_type = 'VOICE' AND deleted_at IS NULL", [created.json().id]);
  assert.equal(activeAfterUnbind.rows[0].count, 0);
});

test("product versions, bigint cents, SKU state and off-sale discovery rules work end to end", { skip: !enabled }, async () => {
  const created = await userRequest("POST", "/api/v1/seller/services", { title: "经典模式排位上分", description: "按局服务，稳定沟通，全程使用平台聊天。", service_time_description: "每天 18:00 后" });
  assert.equal(created.statusCode, 201, created.body);
  const productId = created.json().id;
  const sku = await userRequest("POST", `/api/v1/seller/services/${productId}/skus`, { sku_name: "单排一局", description: "约 30 分钟", price_cent: "2500", duration_minutes: 30, sort_order: 0 });
  assert.equal(sku.statusCode, 201, sku.body);
  assert.equal(sku.json().price_cent, "2500");
  const draft = await userRequest("GET", `/api/v1/seller/services/${productId}`);
  assert.equal(draft.json().min_price_cent, "2500");

  const firstImageId = await seedOwnedFile(user.id, "PRODUCT_IMAGE", "image/webp");
  const secondImageId = await seedOwnedFile(user.id, "PRODUCT_IMAGE", "image/png");
  const duplicateImages = await userRequest("PUT", `/api/v1/seller/services/${productId}/images`, { version: draft.json().version, images: [{ file_id: firstImageId, sort_order: 0, is_cover: true }, { file_id: firstImageId, sort_order: 1, is_cover: false }] });
  assert.equal(duplicateImages.statusCode, 400, duplicateImages.body);
  const images = await userRequest("PUT", `/api/v1/seller/services/${productId}/images`, { version: draft.json().version, images: [{ file_id: firstImageId, sort_order: 0, is_cover: true }, { file_id: secondImageId, sort_order: 1, is_cover: false }] });
  assert.equal(images.statusCode, 200, images.body);
  assert.deepEqual(images.json().map((item) => [item.file_id, item.sort_order, item.is_cover]), [[firstImageId, 0, true], [secondImageId, 1, false]]);
  const staleImages = await userRequest("PUT", `/api/v1/seller/services/${productId}/images`, { version: draft.json().version, images: [{ file_id: secondImageId, sort_order: 0, is_cover: true }] });
  assert.equal(staleImages.statusCode, 409, staleImages.body);
  const usages = await migrationClient.query("SELECT file_id, usage_type FROM file_usages WHERE target_type = 'PRODUCT' AND target_id = $1 AND deleted_at IS NULL ORDER BY usage_type", [productId]);
  assert.deepEqual(usages.rows, [{ file_id: firstImageId, usage_type: "COVER" }, { file_id: secondImageId, usage_type: "GALLERY" }]);
  const inUseDelete = await userRequest("DELETE", `/api/v1/files/${firstImageId}`);
  assert.equal(inUseDelete.statusCode, 409, inUseDelete.body);
  const imagedDraft = await userRequest("GET", `/api/v1/seller/services/${productId}`);

  const submitted = await userRequest("POST", `/api/v1/seller/services/${productId}/submit-review`, { version: imagedDraft.json().version });
  assert.equal(submitted.statusCode, 201, submitted.body);
  assert.equal(submitted.json().current_version_no, 1);
  const conflict = await userRequest("POST", `/api/v1/seller/services/${productId}/submit-review`, { version: submitted.json().version });
  assert.equal(conflict.statusCode, 409);
  const approved = await adminRequest(admin, "POST", `/admin-api/v1/products/${productId}/review`, { action: "APPROVE", version: submitted.json().version });
  assert.equal(approved.statusCode, 201, approved.body);
  assert.equal(approved.json().status, "ON_SALE");
  const adminProduct = await adminRequest(readOnlyAdmin, "GET", `/admin-api/v1/products/${productId}`);
  assert.equal(adminProduct.statusCode, 200, adminProduct.body);
  assert.equal(adminProduct.json().id, productId);
  assert.equal(adminProduct.json().skus[0].price_cent, "2500");
  assert.doesNotMatch(JSON.stringify(adminProduct.json()), /phone_ciphertext|password|token|secret|bucket|object_key|presigned/iu);

  const publicDetail = await app.inject({ method: "GET", url: `/api/v1/services/${productId}` });
  assert.equal(publicDetail.statusCode, 200, publicDetail.body);
  assert.equal(publicDetail.json().skus[0].price_cent, "2500");
  assert.deepEqual(publicDetail.json().images.map((item) => [item.file_id, item.sort_order, item.is_cover]), [[firstImageId, 0, true], [secondImageId, 1, false]]);
  const offSale = await userRequest("POST", `/api/v1/seller/services/${productId}/off-sale`, { version: approved.json().version });
  assert.equal(offSale.statusCode, 201, offSale.body);
  const unavailable = await app.inject({ method: "GET", url: `/api/v1/services/${productId}` });
  assert.equal(unavailable.statusCode, 409); assert.equal(unavailable.json().code, "PRODUCT_OFF_SALE");

  const removed = await userRequest("PUT", `/api/v1/seller/services/${productId}/images`, { version: offSale.json().version, images: [] });
  assert.equal(removed.statusCode, 200, removed.body);
  const activeAfterUnbind = await migrationClient.query("SELECT count(*)::integer AS count FROM file_usages WHERE target_type = 'PRODUCT' AND target_id = $1 AND deleted_at IS NULL", [productId]);
  assert.equal(activeAfterUnbind.rows[0].count, 0);
  const unboundDraft = await userRequest("GET", `/api/v1/seller/services/${productId}`);
  const updated = await userRequest("PATCH", `/api/v1/seller/services/${productId}`, { title: "经典模式双排上分", description: "更新后的服务说明，继续只在平台内沟通。", service_time_description: "周末全天", version: unboundDraft.json().version });
  assert.equal(updated.statusCode, 200, updated.body);
  const resubmitted = await userRequest("POST", `/api/v1/seller/services/${productId}/submit-review`, { version: updated.json().version });
  assert.equal(resubmitted.json().current_version_no, 2);
  const versions = await migrationClient.query("SELECT version_no, snapshot_json->'product'->>'title' AS title FROM product_versions WHERE product_id = $1 ORDER BY version_no", [productId]);
  assert.deepEqual(versions.rows.map((row) => [row.version_no, row.title]), [[1, "经典模式排位上分"], [2, "经典模式双排上分"]]);
  const audit = await migrationClient.query("SELECT count(*)::integer AS count FROM admin_operation_logs WHERE target_type = 'PRODUCT' AND target_id = $1", [productId]);
  assert.equal(audit.rows[0].count, 1);
});

test("favorites stay unique and availability rejects overlapping open slots", { skip: !enabled }, async () => {
  const productRows = await migrationClient.query("SELECT id, version FROM products ORDER BY created_at LIMIT 1");
  const productId = productRows.rows[0].id;
  const waiting = await adminRequest(admin, "POST", `/admin-api/v1/products/${productId}/review`, { action: "APPROVE", version: productRows.rows[0].version });
  assert.equal(waiting.statusCode, 201, waiting.body);

  const first = await userRequest("PUT", `/api/v1/favorites/PRODUCT/${productId}`);
  const duplicate = await userRequest("PUT", `/api/v1/favorites/PRODUCT/${productId}`);
  assert.equal(first.json().created, true);
  assert.equal(duplicate.json().created, false);
  const count = await migrationClient.query("SELECT count(*)::integer AS count FROM favorites WHERE user_id = $1 AND product_id = $2", [user.id, productId]);
  assert.equal(count.rows[0].count, 1);

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const slot = await userRequest("POST", "/api/v1/seller/availability", { starts_at: start.toISOString(), ends_at: end.toISOString(), status: "OPEN" });
  assert.equal(slot.statusCode, 201, slot.body);
  const overlap = await userRequest("POST", "/api/v1/seller/availability", { starts_at: new Date(start.getTime() + 600_000).toISOString(), ends_at: new Date(end.getTime() + 600_000).toISOString(), status: "OPEN" });
  assert.equal(overlap.statusCode, 409);
  const adjacent = await userRequest("POST", "/api/v1/seller/availability", { starts_at: end.toISOString(), ends_at: new Date(end.getTime() + 3_600_000).toISOString(), status: "OPEN" });
  assert.equal(adjacent.statusCode, 201, adjacent.body);
});

test("admin seller and service governance is versioned, audited and permanently preserves soft-deleted evidence", { skip: !enabled }, async () => {
  const governedUser=await seedUser(false);const sellerId=randomUUID();await migrationClient.query("INSERT INTO seller_profiles(id,user_id,status,seller_nickname,introduction,accepting_orders,approved_at) VALUES($1,$2,'APPROVED','治理测试陪玩','用于本地治理验收',true,now())",[sellerId,governedUser.id]);await migrationClient.query("INSERT INTO seller_applications(id,seller_id,version_no,snapshot_json,status,reviewed_at) VALUES($1,$2,1,$3,'APPROVED',now())",[randomUUID(),sellerId,JSON.stringify({seller_nickname:"治理测试陪玩"})]);
  const denied=await adminRequest(readOnlyAdmin,"POST",`/admin-api/v1/sellers/${sellerId}/status`,{action:"SUSPEND",version:0,reason:"只读角色不得操作"});assert.equal(denied.statusCode,403);
  const suspended=await adminRequest(admin,"POST",`/admin-api/v1/sellers/${sellerId}/status`,{action:"SUSPEND",version:0,reason:"投诉调查期间暂停接单"});assert.equal(suspended.statusCode,201,suspended.body);assert.equal(suspended.json().status,"SUSPENDED");
  const restored=await adminRequest(admin,"POST",`/admin-api/v1/sellers/${sellerId}/status`,{action:"RESTORE",version:suspended.json().version,reason:"调查完成，允许恢复"});assert.equal(restored.statusCode,201,restored.body);assert.equal(restored.json().status,"APPROVED");
  const stale=await adminRequest(admin,"POST",`/admin-api/v1/sellers/${sellerId}/status`,{action:"SUSPEND",version:suspended.json().version,reason:"过期版本不得覆盖"});assert.equal(stale.statusCode,409);
  const banned=await adminRequest(admin,"POST",`/admin-api/v1/sellers/${sellerId}/status`,{action:"BAN",version:restored.json().version,reason:"复核确认严重违规，执行封禁"});assert.equal(banned.statusCode,201,banned.body);assert.equal(banned.json().status,"BANNED");
  const sellerDetail=await adminRequest(admin,"GET",`/admin-api/v1/sellers/${sellerId}`);assert.equal(sellerDetail.statusCode,200,sellerDetail.body);assert.deepEqual(sellerDetail.json().review_logs.map((item)=>item.action).reverse(),["SUSPEND","RESTORE","BAN"]);assert.ok(sellerDetail.json().review_logs.every((item)=>item.reason&&item.request_id));

  const activeSellerUser=await seedUser(false);const activeSellerId=randomUUID();await migrationClient.query("INSERT INTO seller_profiles(id,user_id,status,seller_nickname,introduction,accepting_orders,approved_at) VALUES($1,$2,'APPROVED','服务治理陪玩','用于服务软删除验收',true,now())",[activeSellerId,activeSellerUser.id]);const productId=randomUUID();await migrationClient.query("INSERT INTO products(id,seller_id,title,description,status,min_price_cent,approved_at) VALUES($1,$2,'违规测试服务','仅用于本地治理验收','ON_SALE',1000,now())",[productId,activeSellerId]);
  const offSale=await adminRequest(admin,"POST",`/admin-api/v1/products/${productId}/review`,{action:"ADMIN_OFF_SALE",version:0,reason:"平台发现违规内容，强制下架"});assert.equal(offSale.statusCode,201,offSale.body);assert.equal(offSale.json().status,"ADMIN_OFF_SALE");
  const restoredProduct=await adminRequest(admin,"POST",`/admin-api/v1/products/${productId}/review`,{action:"ADMIN_RESTORE",version:offSale.json().version,reason:"整改完成，允许恢复"});assert.equal(restoredProduct.statusCode,201,restoredProduct.body);assert.equal(restoredProduct.json().status,"ON_SALE");
  const offSaleAgain=await adminRequest(admin,"POST",`/admin-api/v1/products/${productId}/review`,{action:"ADMIN_OFF_SALE",version:restoredProduct.json().version,reason:"再次发现明确违规"});assert.equal(offSaleAgain.statusCode,201,offSaleAgain.body);
  const softDeleted=await adminRequest(admin,"POST",`/admin-api/v1/products/${productId}/review`,{action:"SOFT_DELETE",version:offSaleAgain.json().version,reason:"软删除违规服务，保留历史订单证据"});assert.equal(softDeleted.statusCode,201,softDeleted.body);assert.equal(softDeleted.json().status,"DELETED");assert.ok(softDeleted.json().deleted_at);
  const stored=await migrationClient.query("SELECT status,deleted_at FROM products WHERE id=$1",[productId]);assert.equal(stored.rowCount,1);assert.equal(stored.rows[0].status,"DELETED");assert.ok(stored.rows[0].deleted_at);
  const logs=await migrationClient.query("SELECT action,reason,request_id FROM product_review_logs WHERE product_id=$1 ORDER BY created_at",[productId]);assert.deepEqual(logs.rows.map((row)=>row.action),["ADMIN_OFF_SALE","SELLER_RESTORE","ADMIN_OFF_SALE","DELETE"]);assert.ok(logs.rows.every((row)=>row.reason&&row.request_id));
});

test("discovery search, scoped sorting cursors, favorite paging and public files use real contracts", { skip: !enabled }, async () => {
  const currentSeller = await migrationClient.query("SELECT id FROM seller_profiles WHERE user_id = $1", [user.id]);
  const sellerId = currentSeller.rows[0].id;
  const secondUser = await seedUser(false); const secondSellerId = randomUUID();
  await migrationClient.query("INSERT INTO seller_profiles (id,user_id,status,seller_nickname,introduction,accepting_orders,rating_avg,completed_order_count,approved_at) VALUES ($1,$2,'APPROVED','搜索高手陪玩','擅长双排上分',true,'4.90',88,now())", [secondSellerId, secondUser.id]);
  const secondProductId = randomUUID();
  await migrationClient.query("INSERT INTO products (id,seller_id,title,description,status,rating_avg,sold_count,min_price_cent,approved_at) VALUES ($1,$2,'高端双排护航','真实搜索排序测试服务','ON_SALE','4.80',66,9900,now())", [secondProductId, secondSellerId]);

  const companionSearch = await app.inject({ method: "GET", url: "/api/v1/companions?keyword=%E6%90%9C%E7%B4%A2%E9%AB%98%E6%89%8B&sort=rating" });
  assert.equal(companionSearch.statusCode, 200, companionSearch.body); assert.equal(companionSearch.json().items[0].id, secondSellerId);
  const companionPage = await app.inject({ method: "GET", url: "/api/v1/companions?sort=rating&limit=1" });
  assert.ok(companionPage.json().next_cursor); assert.equal(companionPage.json().items[0].id, secondSellerId);
  const companionNext = await app.inject({ method: "GET", url: `/api/v1/companions?sort=rating&limit=1&cursor=${encodeURIComponent(companionPage.json().next_cursor)}` });
  assert.equal(companionNext.statusCode, 200, companionNext.body); assert.notEqual(companionNext.json().items[0].id, secondSellerId);
  const wrongScope = await app.inject({ method: "GET", url: `/api/v1/companions?sort=sales&limit=1&cursor=${encodeURIComponent(companionPage.json().next_cursor)}` });
  assert.equal(wrongScope.statusCode, 400); assert.equal(wrongScope.json().code, "VALIDATION_FAILED");

  const serviceSearch = await app.inject({ method: "GET", url: "/api/v1/services?keyword=%E6%8A%A4%E8%88%AA&sort=price_desc" });
  assert.equal(serviceSearch.statusCode, 200, serviceSearch.body); assert.equal(serviceSearch.json().items[0].id, secondProductId);
  const pricePage = await app.inject({ method: "GET", url: "/api/v1/services?sort=price_asc&limit=1" });
  assert.ok(pricePage.json().next_cursor); assert.notEqual(pricePage.json().items[0].id, secondProductId);

  await userRequest("PUT", `/api/v1/favorites/SELLER/${sellerId}`);
  const favoritePage = await userRequest("GET", "/api/v1/favorites?limit=1");
  assert.equal(favoritePage.statusCode, 200, favoritePage.body); assert.equal(favoritePage.json().items.length, 1); assert.ok(favoritePage.json().next_cursor);
  const favoriteNext = await userRequest("GET", `/api/v1/favorites?limit=1&cursor=${encodeURIComponent(favoritePage.json().next_cursor)}`);
  assert.equal(favoriteNext.json().items.length, 1); assert.notEqual(favoriteNext.json().items[0].id, favoritePage.json().items[0].id);
  const favoriteStatus = await userRequest("GET", `/api/v1/favorites/SELLER/${sellerId}`);
  assert.deepEqual(favoriteStatus.json(), { favorited: true });

  const fileId = randomUUID();
  await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility) VALUES ($1,$2,'public-media','products/cover image.webp','PRODUCT_IMAGE','image/webp',128,$3,'VERIFIED','APPROVED','PUBLIC')", [fileId, user.id, "a".repeat(64)]);
  const publicFile = await app.inject({ method: "GET", url: `/api/v1/files/${fileId}` });
  assert.equal(publicFile.statusCode, 200, publicFile.body); assert.equal(publicFile.json().content_url, "https://cdn.example.test/assets/public-media/products/cover%20image.webp");
});

async function seedUser(verified) {
  const id = randomUUID(); const sessionId = randomUUID();
  await migrationClient.query("INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask) VALUES ($1, 'encrypted', $2, '138****0000')", [id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO auth_sessions (id, user_id, refresh_token_hash, device_id, device_type, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, 'WEB', '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2), `seller-test-${id}`]);
  if (verified) await migrationClient.query("INSERT INTO identity_verifications (id, user_id, provider, provider_reference, legal_name_ciphertext, legal_name_hash, legal_name_mask, document_ciphertext, document_hash, document_mask, status, verified_at) VALUES ($1, $2, 'test', $3, 'encrypted', $4, '测*', 'encrypted', $5, '11**************22', 'VERIFIED', now())", [randomUUID(), id, randomUUID(), "c".repeat(64), "d".repeat(64)]);
  return { id, sessionId, token: issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 }) };
}

async function seedRequiredPolicies(userId) {
  const definitions = [
    ["SELLER_ONBOARDING_AGREEMENT", "陪玩入驻协议", "SELLER_ONBOARDING"],
    ["SELLER_FULFILLMENT_RULES", "陪玩履约规则", "SELLER_ONBOARDING"],
    ["SERVICE_FEE_SETTLEMENT_WITHDRAWAL_RULES", "服务费结算提现规则", "SELLER_ONBOARDING"],
    ["IDENTITY_INFORMATION_SEPARATE_CONSENT", "实名信息单独同意", "IDENTITY_VERIFICATION"],
    ["VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION", "声音名片公开播放授权", "VOICE_SAMPLE_UPLOAD"],
  ];
  for (const [type, title, scene] of definitions) {
    const id = randomUUID();
    await migrationClient.query("INSERT INTO policy_versions (id, policy_type, title, content, version_no, status, published_at, effective_at) VALUES ($1, $2, $3, $4, 1, 'PUBLISHED', now(), now())", [id, type, title, `${title}集成测试版本`]);
    await migrationClient.query("INSERT INTO user_policy_acceptances (user_id, policy_version_id, acceptance_scene, confirmation_method, ip, user_agent) VALUES ($1, $2, $3, 'ONLINE_CONFIRM', '127.0.0.1', 'integration-test')", [userId, id, scene]);
  }
}

async function seedOwnedFile(userId, fileType, mimeType, durationMs = fileType === "VOICE_SAMPLE" ? 15_000 : null) {
  const id = randomUUID();
  const visibility = fileType === "VOICE_SAMPLE" ? "SIGNED" : "PUBLIC";
  await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,duration_ms,upload_status,moderation_status,visibility) VALUES ($1,$2,'seller-media',$3,$4,$5,1024,$6,$7,'VERIFIED','APPROVED',$8)", [id, userId, `${fileType.toLowerCase()}/${id}`, fileType, mimeType, randomUUID().replaceAll("-", "").repeat(2), durationMs, visibility]);
  return id;
}

async function seedAdmin(permissionKeys) {
  const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID();
  await migrationClient.query("INSERT INTO admin_accounts (id, username, display_name, password_hash) VALUES ($1, $2, '业务审核员', 'not-used')", [id, `reviewer-${id}`]);
  await migrationClient.query("INSERT INTO admin_sessions (id, admin_id, session_token_hash, ip, user_agent, expires_at) VALUES ($1, $2, $3, '127.0.0.1', 'integration-test', now() + interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO roles (id, role_key, name) VALUES ($1, $2, '业务审核')", [roleId, `seller-product-${roleId}`]);
  await migrationClient.query("INSERT INTO admin_roles (admin_id, role_id) VALUES ($1, $2)", [id, roleId]);
  for (const key of permissionKeys) { const permission = await migrationClient.query("INSERT INTO permissions (id, permission_key) VALUES ($1, $2) ON CONFLICT (permission_key) DO UPDATE SET permission_key = excluded.permission_key RETURNING id", [randomUUID(), key]); await migrationClient.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleId, permission.rows[0].id]); }
  return { id, token: issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 }) };
}

function userRequest(method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${user.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function userRequestAs(account, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function adminRequest(account, method, url, payload) { return app.inject({ method, url, headers: { authorization: `Bearer ${account.token}` }, ...(payload === undefined ? {} : { payload }) }); }
function sellerPublicInput(profile) { return { seller_nickname: profile.seller_nickname, seller_avatar_file_id: profile.seller_avatar_file_id, cover_file_id: profile.cover_file_id, introduction: profile.introduction, game_rank: profile.game_rank, kd: profile.kd, preferred_mode: profile.preferred_mode, play_style: profile.play_style, game_experience: profile.game_experience, voice_file_id: profile.voice_file_id, voice_duration_ms: profile.voice_duration_ms }; }
function splitMigration(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
