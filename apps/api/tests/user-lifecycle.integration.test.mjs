import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig, SensitiveDataProtector, USER_LIFECYCLE_JOB_TYPES, UserLifecycleJobProcessor } from "../dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_lifecycle_${randomUUID().replaceAll("-", "")}`;
const deliveries = [];
const uploaded = new Map();
let migrationClient;
let database;
let app;
let server;
let uploadBase;

const config = loadApiConfig({
  NODE_ENV: "test", DATABASE_URL: databaseUrl ?? "postgresql://test:test@127.0.0.1:5432/test",
  USER_TOKEN_SECRET: "lifecycle-user-token-secret-at-least-32-bytes", ADMIN_TOKEN_SECRET: "lifecycle-admin-token-secret-at-least-32-bytes",
  INTERNAL_TOKEN_SECRET: "lifecycle-internal-token-secret-at-least-32-bytes", CURSOR_SIGNING_SECRET: "lifecycle-cursor-secret-at-least-32-bytes",
  PII_ENCRYPTION_KEY: "lifecycle-pii-encryption-key-at-least-32-bytes", PII_HMAC_KEY: "lifecycle-pii-hmac-key-at-least-32-bytes",
  AUTH_HMAC_KEY: "lifecycle-auth-hmac-key-at-least-32-bytes", SMS_PROVIDER_MODE: "injected", SMS_MINIMUM_INTERVAL_SECONDS: "1",
  FILE_STORAGE_PROVIDER: "injected", FILE_PRIVATE_BUCKET: "lifecycle-private", FILE_PUBLIC_BUCKET: "lifecycle-public", FILE_QUARANTINE_BUCKET: "lifecycle-quarantine",
});

const storage = {
  createUploadRequest: async ({ objectKey, contentType, sha256, sizeBytes }) => ({ url: `${uploadBase}/${encodeURIComponent(objectKey)}`, method: "PUT", headers: { "content-type": contentType, "x-test-sha256": sha256, "x-test-size": String(sizeBytes) }, expiresAt: new Date(Date.now() + 60_000) }),
  createDownloadUrl: async ({ objectKey, expiresInSeconds }) => ({ url: `http://download.test/${encodeURIComponent(objectKey)}?runtime=${randomUUID()}`, expiresAt: new Date(Date.now() + expiresInSeconds * 1_000) }),
};

before(async () => {
  if (!enabled) return;
  server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => { uploaded.set(decodeURIComponent(request.url.slice(1)), Buffer.concat(chunks)); response.writeHead(200).end(); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  uploadBase = `http://127.0.0.1:${server.address().port}`;
  migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  await migrationClient.query(`CREATE SCHEMA "${schemaName}"`);
  await migrationClient.query(`SET search_path TO "${schemaName}", public`);
  for (const file of ["0000_initial_schema.sql", "0001_core_invariants.sql", "0002_admin_stage2_permissions.sql", "0003_admin_query_performance.sql", "0004_payment_channels_voice_constraints.sql", "0005_policy_acceptance_context.sql", "0006_policy_version_bindings.sql", "0007_user_lifecycle_requests.sql", "0008_user_lifecycle_invariants.sql"]) await runMigration(file);
  database = createDatabaseClient({ connectionString: databaseUrl, application_name: "xiongzai-lifecycle-test", options: `-c search_path=${schemaName},public`, max: 4 });
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async (delivery) => deliveries.push({ ...delivery }) }, objectStorageProvider: storage, logger: new JsonLogger("lifecycle-test", () => {}) });
});

after(async () => {
  if (!enabled) return;
  await app?.close();
  await new Promise((resolve) => server.close(resolve));
  await migrationClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await migrationClient.end();
});

test("phone change uses separate SMS purposes, CAS completes atomically and revokes every session", { skip: !enabled }, async () => {
  const actor = await createUser("13900000001");
  const created = await app.inject({ method: "POST", url: "/api/v1/me/phone-change-requests", headers: auth(actor, { "idempotency-key": "phone-change-1" }), payload: { new_phone: "13900000002" } });
  assert.equal(created.statusCode, 201);
  const request = created.json();
  await expectStatus(app.inject({ method: "POST", url: `/api/v1/me/phone-change-requests/${request.id}/old-code/send`, headers: auth(actor) }), 202);
  const oldDelivery = deliveries.at(-1);
  assert.equal(oldDelivery.purpose, "PHONE_CHANGE_OLD");
  const oldVerified = await app.inject({ method: "POST", url: `/api/v1/me/phone-change-requests/${request.id}/old-code/verify`, headers: auth(actor), payload: { code: oldDelivery.code, version: request.version } });
  assert.equal(oldVerified.statusCode, 201);
  assert.equal(oldVerified.json().status, "PENDING_NEW_VERIFICATION");
  await expectStatus(app.inject({ method: "POST", url: `/api/v1/me/phone-change-requests/${request.id}/new-code/send`, headers: auth(actor) }), 202);
  const newDelivery = deliveries.at(-1);
  assert.equal(newDelivery.purpose, "PHONE_CHANGE_NEW");
  const completed = await app.inject({ method: "POST", url: `/api/v1/me/phone-change-requests/${request.id}/new-code/verify`, headers: auth(actor), payload: { code: newDelivery.code, version: oldVerified.json().version } });
  assert.equal(completed.statusCode, 201);
  assert.equal(completed.json().status, "COMPLETED");
  const facts = await migrationClient.query("SELECT u.phone_mask, u.version AS user_version, r.status, r.version, count(s.id) FILTER (WHERE s.revoked_at IS NULL)::integer AS active_sessions FROM users u JOIN phone_change_requests r ON r.user_id=u.id LEFT JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1 GROUP BY u.id,r.id", [actor.userId]);
  assert.equal(facts.rows[0].phone_mask, "139****0002");
  assert.equal(facts.rows[0].status, "COMPLETED");
  assert.equal(facts.rows[0].active_sessions, 0);
  const purposes = await migrationClient.query("SELECT purpose FROM sms_codes WHERE purpose LIKE 'PHONE_CHANGE_%' ORDER BY created_at");
  assert.deepEqual(purposes.rows.map((row) => row.purpose), ["PHONE_CHANGE_OLD", "PHONE_CHANGE_NEW"]);
  const event = await migrationClient.query("SELECT count(*)::integer AS count FROM outbox_events WHERE event_type='UserPhoneChanged' AND aggregate_id=$1", [actor.userId]);
  assert.equal(event.rows[0].count, 1);
});

test("data export is generated asynchronously as DATA_EXPORT with EXPORT binding and runtime-only URL", { skip: !enabled }, async () => {
  const actor = await createUser("13900000011");
  const created = await app.inject({ method: "POST", url: "/api/v1/me/data-exports", headers: auth(actor, { "idempotency-key": "export-1" }) });
  assert.equal(created.statusCode, 201);
  const processor = new UserLifecycleJobProcessor(database, config, storage);
  await processor.process(USER_LIFECYCLE_JOB_TYPES.DATA_EXPORT_GENERATE, created.json().id, "integration-export");
  const facts = await migrationClient.query("SELECT e.status,e.version,f.file_type,f.visibility,f.upload_status,u.usage_type,u.target_type FROM personal_data_export_jobs e JOIN files f ON f.id=e.output_file_id JOIN file_usages u ON u.file_id=f.id WHERE e.id=$1", [created.json().id]);
  assert.deepEqual(facts.rows[0], { status: "COMPLETED", version: 2, file_type: "DATA_EXPORT", visibility: "SIGNED", upload_status: "VERIFIED", usage_type: "EXPORT", target_type: "USER" });
  assert.equal(uploaded.size, 1);
  const body = JSON.parse([...uploaded.values()][0].toString("utf8"));
  assert.equal(body.account.phone, "139****0011");
  assert.equal(JSON.stringify(body).includes("13900000011"), false);
  const first = await app.inject({ method: "GET", url: `/api/v1/me/data-exports/${created.json().id}/download`, headers: auth(actor) });
  const second = await app.inject({ method: "GET", url: `/api/v1/me/data-exports/${created.json().id}/download`, headers: auth(actor) });
  assert.equal(first.statusCode, 200);
  assert.notEqual(first.json().download_url, second.json().download_url);
  const stored = await migrationClient.query("SELECT count(*)::integer AS count FROM files WHERE object_key LIKE '%runtime=%'");
  assert.equal(stored.rows[0].count, 0);

  const expiredExportId = randomUUID(); const expiredFileId = randomUUID();
  await migrationClient.query("INSERT INTO files (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility) VALUES ($1,$2,$3,$4,'DATA_EXPORT','application/json',2,$5,'VERIFIED','APPROVED','SIGNED')", [expiredFileId, actor.userId, config.filePrivateBucket, `data-exports/${actor.userId}/${expiredExportId}.json`, "b".repeat(64)]);
  await migrationClient.query("INSERT INTO file_usages (id,file_id,usage_type,target_type,target_id) VALUES ($1,$2,'EXPORT','USER',$3)", [randomUUID(), expiredFileId, actor.userId]);
  await migrationClient.query("INSERT INTO personal_data_export_jobs (id,user_id,idempotency_key,status,output_file_id,requested_at,started_at,finished_at,expires_at,version) VALUES ($1,$2,'expired-export','COMPLETED',$3,now()-interval '3 hours',now()-interval '2 hours',now()-interval '90 minutes',now()-interval '1 hour',2)", [expiredExportId, actor.userId, expiredFileId]);
  await processor.process(USER_LIFECYCLE_JOB_TYPES.DATA_EXPORT_EXPIRE, expiredExportId, "integration-expiry");
  const expired = await migrationClient.query("SELECT e.status,f.upload_status,f.deleted_at IS NOT NULL AS file_deleted,u.deleted_at IS NOT NULL AS usage_deleted,j.job_key FROM personal_data_export_jobs e JOIN files f ON f.id=e.output_file_id JOIN file_usages u ON u.file_id=f.id JOIN scheduled_jobs j ON j.target_id=f.id WHERE e.id=$1", [expiredExportId]);
  assert.deepEqual(expired.rows[0], { status: "EXPIRED", upload_status: "DELETED", file_deleted: true, usage_deleted: true, job_key: `file:delete:${expiredFileId}` });
});

test("account cancellation supports revoke and scheduler completion uses the exact same timestamp", { skip: !enabled }, async () => {
  const revocable = await createUser("13900000021");
  const created = await app.inject({ method: "POST", url: "/api/v1/me/account-cancellations", headers: auth(revocable, { "idempotency-key": "cancel-revoke-1" }), payload: { reason: "本地测试撤销" } });
  assert.equal(created.statusCode, 201);
  const revoked = await app.inject({ method: "POST", url: `/api/v1/me/account-cancellations/${created.json().id}/revoke`, headers: auth(revocable), payload: { version: created.json().version } });
  assert.equal(revoked.statusCode, 201);
  assert.equal(revoked.json().status, "CANCELLED");

  const actor = await createUser("13900000022");
  const requestId = randomUUID();
  await migrationClient.query("INSERT INTO account_cancellation_requests (id,user_id,idempotency_key,status,reason,requested_at,waiting_period_ends_at) VALUES ($1,$2,'due-test','REQUESTED','本地到期测试',now()-interval '2 hours',now()-interval '1 hour')", [requestId, actor.userId]);
  const processor = new UserLifecycleJobProcessor(database, config, storage);
  await processor.process(USER_LIFECYCLE_JOB_TYPES.ACCOUNT_CANCELLATION_COMPLETE, requestId, "integration-cancellation");
  const facts = await migrationClient.query("SELECT u.status,u.cancelled_at,r.status AS request_status,r.completed_at,(u.cancelled_at=r.completed_at) AS same_time,count(s.id) FILTER (WHERE s.revoked_at IS NULL)::integer AS active_sessions FROM users u JOIN account_cancellation_requests r ON r.user_id=u.id LEFT JOIN auth_sessions s ON s.user_id=u.id WHERE r.id=$1 GROUP BY u.id,r.id", [requestId]);
  assert.equal(facts.rows[0].status, "CANCELLED");
  assert.equal(facts.rows[0].request_status, "COMPLETED");
  assert.equal(facts.rows[0].same_time, true);
  assert.equal(facts.rows[0].active_sessions, 0);
});

test("admin account cancellation list and detail are masked while rejection requires permission, reason and latest version", { skip: !enabled }, async () => {
  const actor = await createUser("13900000031");
  await migrationClient.query("INSERT INTO user_profiles (user_id,nickname,public_user_no) VALUES ($1,'注销测试用户','XZ-CANCEL-001')", [actor.userId]);
  const created = await app.inject({ method: "POST", url: "/api/v1/me/account-cancellations", headers: auth(actor, { "idempotency-key": "admin-cancel-review-1" }), payload: { reason: "本地测试账号注销审核" } });
  assert.equal(created.statusCode, 201);

  const reader = await createAdmin(["user.read"]);
  const reviewer = await createAdmin(["user.read", "user.status.manage"]);
  const list = await app.inject({ method: "GET", url: "/admin-api/v1/account-cancellations?status=REQUESTED&keyword=XZ-CANCEL-001&limit=20&sort=created_desc", headers: adminAuth(reader) });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().items.length, 1);
  assert.equal(list.json().items[0].user.phone_mask, "139****0031");
  assert.equal(JSON.stringify(list.json()).includes("13900000031"), false);
  assert.equal("idempotency_key" in list.json().items[0], false);

  const detail = await app.inject({ method: "GET", url: `/admin-api/v1/account-cancellations/${created.json().id}`, headers: adminAuth(reader) });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.deepEqual(detail.json().blocker_codes, []);
  assert.equal(detail.json().version, created.json().version);

  const denied = await app.inject({ method: "POST", url: `/admin-api/v1/account-cancellations/${created.json().id}/reject`, headers: adminAuth(reader), payload: { version: created.json().version, reason: "无权限操作" } });
  assert.equal(denied.statusCode, 403);
  const missingReason = await app.inject({ method: "POST", url: `/admin-api/v1/account-cancellations/${created.json().id}/reject`, headers: adminAuth(reviewer), payload: { version: created.json().version } });
  assert.equal(missingReason.statusCode, 400);

  const rejected = await app.inject({ method: "POST", url: `/admin-api/v1/account-cancellations/${created.json().id}/reject`, headers: adminAuth(reviewer), payload: { version: created.json().version, reason: "用户仍需完成安全核验" } });
  assert.equal(rejected.statusCode, 201, rejected.body);
  assert.equal(rejected.json().status, "REJECTED");
  assert.equal(rejected.json().version, created.json().version + 1);
  const stale = await app.inject({ method: "POST", url: `/admin-api/v1/account-cancellations/${created.json().id}/reject`, headers: adminAuth(reviewer), payload: { version: created.json().version, reason: "重复拒绝" } });
  assert.equal(stale.statusCode, 409);
  const unsupportedApproval = await app.inject({ method: "POST", url: `/admin-api/v1/account-cancellations/${created.json().id}/approve`, headers: adminAuth(reviewer), payload: { version: rejected.json().version, reason: "不应存在" } });
  assert.equal(unsupportedApproval.statusCode, 404);

  const audit = await migrationClient.query("SELECT action,reason,before_json,after_json FROM admin_operation_logs WHERE target_id=$1 AND action='ACCOUNT_CANCELLATION_REJECTED'", [actor.userId]);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].reason, "用户仍需完成安全核验");
  assert.equal(audit.rows[0].before_json.version, created.json().version);
  assert.equal(audit.rows[0].after_json.version, created.json().version + 1);
});

test("admin phone-change and data-export monitoring is read-only, permission checked and masked", { skip: !enabled }, async () => {
  const actor = await createUser("13900000041");
  await migrationClient.query("INSERT INTO user_profiles (user_id,nickname,public_user_no) VALUES ($1,'生命周期监控用户','XZ-LIFE-001')", [actor.userId]);
  const phone = await app.inject({ method: "POST", url: "/api/v1/me/phone-change-requests", headers: auth(actor, { "idempotency-key": "monitor-phone-1" }), payload: { new_phone: "13900000042" } });
  const exported = await app.inject({ method: "POST", url: "/api/v1/me/data-exports", headers: auth(actor, { "idempotency-key": "monitor-export-1" }) });
  assert.equal(phone.statusCode, 201, phone.body); assert.equal(exported.statusCode, 201, exported.body);
  const reader = await createAdmin(["user.read"]); const denied = await createAdmin([]);
  assert.equal((await app.inject({ method: "GET", url: "/admin-api/v1/phone-change-requests?limit=20", headers: adminAuth(denied) })).statusCode, 403);
  const phoneList = await app.inject({ method: "GET", url: "/admin-api/v1/phone-change-requests?keyword=XZ-LIFE-001&limit=20", headers: adminAuth(reader) });
  assert.equal(phoneList.statusCode, 200, phoneList.body); assert.equal(phoneList.json().items[0].old_phone_mask, "139****0041"); assert.equal(phoneList.json().items[0].new_phone_mask, "139****0042");
  const phoneDetail = await app.inject({ method: "GET", url: `/admin-api/v1/phone-change-requests/${phone.json().id}`, headers: adminAuth(reader) });
  assert.equal(phoneDetail.statusCode, 200, phoneDetail.body);
  assert.equal(phoneDetail.json().security_history.length, 1);
  assert.equal(phoneDetail.json().security_history[0].event_type, "USER_PHONE_CHANGE_REQUESTED");
  assert.equal(typeof phoneDetail.json().security_history[0].request_id, "string");
  const exportList = await app.inject({ method: "GET", url: "/admin-api/v1/data-export-jobs?keyword=XZ-LIFE-001&limit=20", headers: adminAuth(reader) });
  assert.equal(exportList.statusCode, 200, exportList.body); assert.equal(exportList.json().items[0].id, exported.json().id);
  const exportDetail = await app.inject({ method: "GET", url: `/admin-api/v1/data-export-jobs/${exported.json().id}`, headers: adminAuth(reader) });
  assert.equal(exportDetail.statusCode, 200, exportDetail.body);
  const serialized = JSON.stringify({ phone: phoneDetail.json(), export: exportDetail.json() });
  assert.doesNotMatch(serialized, /1390000004[12]|ciphertext|phone_hash|idempotency_key|object_key|download_url|presigned/iu);
});

async function createUser(phone) {
  const protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  const userId = randomUUID(); const sessionId = randomUUID();
  await migrationClient.query("INSERT INTO users (id,phone_ciphertext,phone_hash,phone_mask) VALUES ($1,$2,$3,$4)", [userId, protector.encrypt("phone", phone), protector.piiHash("phone", phone), protector.maskPhone(phone)]);
  await migrationClient.query("INSERT INTO auth_sessions (id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES ($1,$2,$3,$4,'IOS','127.0.0.1','lifecycle-test',now()+interval '1 hour')", [sessionId, userId, createHashValue(`${userId}:${sessionId}`), `device-${sessionId}`]);
  const token = issueAccessToken({ sub: userId, principal_type: "user", token_use: "access", session_id: sessionId, jti: randomUUID() }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 300 });
  return { userId, sessionId, token };
}

async function createAdmin(permissionKeys) {
  const id = randomUUID(); const sessionId = randomUUID(); const roleId = randomUUID();
  await migrationClient.query("INSERT INTO admin_accounts (id,username,display_name,password_hash) VALUES ($1,$2,'账号生命周期管理员','not-used')", [id, `lifecycle-admin-${id}`]);
  await migrationClient.query("INSERT INTO admin_sessions (id,admin_id,session_token_hash,ip,user_agent,expires_at) VALUES ($1,$2,$3,'127.0.0.1','lifecycle-test',now()+interval '1 hour')", [sessionId, id, randomUUID().replaceAll("-", "").repeat(2)]);
  await migrationClient.query("INSERT INTO roles (id,role_key,name) VALUES ($1,$2,'账号生命周期角色')", [roleId, `lifecycle-role-${roleId}`]);
  await migrationClient.query("INSERT INTO admin_roles (admin_id,role_id) VALUES ($1,$2)", [id, roleId]);
  for (const key of permissionKeys) {
    const permission = await migrationClient.query("INSERT INTO permissions (id,permission_key) VALUES ($1,$2) ON CONFLICT (permission_key) DO UPDATE SET permission_key=excluded.permission_key RETURNING id", [randomUUID(), key]);
    await migrationClient.query("INSERT INTO role_permissions (role_id,permission_id) VALUES ($1,$2)", [roleId, permission.rows[0].id]);
  }
  return { id, token: issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: true }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 300 }) };
}

function createHashValue(value) { return Buffer.from(value).toString("hex").padEnd(64, "0").slice(0, 64); }
function auth(actor, extra = {}) { return { authorization: `Bearer ${actor.token}`, ...extra }; }
function adminAuth(actor) { return { authorization: `Bearer ${actor.token}` }; }
async function expectStatus(promise, expected) { const response = await promise; assert.equal(response.statusCode, expected, response.body); return response; }
function splitMigration(source) { return source.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
async function runMigration(fileName) { let source = await readFile(new URL(`../../../packages/database/migrations/${fileName}`, import.meta.url), "utf8"); source = source.replaceAll('"public".', `"${schemaName}".`); for (const statement of splitMigration(source)) await migrationClient.query(statement); }
