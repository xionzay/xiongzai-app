import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { issueAccessToken } from "@xiongzai/auth";
import { createDatabaseClient, validateLocalTestDatabaseUrl } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import pg from "pg";
import { createApiApp, loadApiConfig } from "../dist/index.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const databaseUrl = enabled ? validateLocalTestDatabaseUrl(process.env.TEST_DATABASE_URL) : "postgresql://test:test@127.0.0.1/test";
const schemaName = `xiongzai_community_${randomUUID().replaceAll("-", "")}`;
const config = loadApiConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl,
  ...Object.fromEntries(["USER_TOKEN_SECRET", "ADMIN_TOKEN_SECRET", "INTERNAL_TOKEN_SECRET", "CURSOR_SIGNING_SECRET", "PII_ENCRYPTION_KEY", "PII_HMAC_KEY", "AUTH_HMAC_KEY"].map(key => [key, randomBytes(32).toString("hex")])),
  FILE_STORAGE_PROVIDER: "injected", SMS_PROVIDER_MODE: "injected", FEEDBACK_MAX_CHARACTERS: "2000", FEEDBACK_HOURLY_LIMIT: "5",
});
const logs = [], objects = new Map();
let client, app, user, stranger, admin, readonly, noMfa, legacyAdmin;
let schemaCreated = false;
const permissions = ["feedback.read", "feedback.manage", "feedback.reply", "announcement.read", "announcement.manage", "announcement.publish", "file.read", "file.manage", "file.review"];
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,8,0,0,0,8]);
const storage = {
  async createUploadRequest(input) { return { url: `http://127.0.0.1:9000/${input.bucket}/${input.objectKey}`, method: "PUT", headers: {}, expiresAt: new Date(Date.now()+60000) }; },
  async headObject(input) { return objects.get(`${input.bucket}/${input.objectKey}`); },
  async readObject(input) { return objects.get(`${input.bucket}/${input.objectKey}`); },
  async createDownloadUrl(input) { return { url: `http://127.0.0.1:9000/${input.bucket}/${input.objectKey}?synthetic-grant=1`, expiresAt: new Date(Date.now()+input.expiresInSeconds*1000) }; },
  async copyObject(input) { objects.set(`${input.destination.bucket}/${input.destination.objectKey}`, objects.get(`${input.source.bucket}/${input.source.objectKey}`)); },
  async deleteObject(input) { objects.delete(`${input.bucket}/${input.objectKey}`); },
};

before(async () => {
  if (!enabled) return;
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  await client.query(`SET search_path TO "${schemaName}", public`);
  const journal = JSON.parse(await readFile(new URL("../../../packages/database/migrations/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    const source = (await readFile(new URL(`../../../packages/database/migrations/${entry.tag}.sql`, import.meta.url), "utf8")).replaceAll('"public".', `"${schemaName}".`);
    for (const statement of source.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) await client.query(statement);
  }
  const database = createDatabaseClient({ connectionString: databaseUrl, options: `-c search_path=${schemaName},public`, max: 8, application_name: "xiongzai-community-isolated-test" });
  app = await createApiApp({ config, databaseClient: database, smsProvider: { sendCode: async () => {} }, objectStorageProvider: storage, logger: new JsonLogger("community-test", value => logs.push(value)) });
  user = await seedUser(); stranger = await seedUser();
  admin = await seedAdmin(permissions); readonly = await seedAdmin(["feedback.read", "announcement.read"]);
  noMfa = await seedAdmin(permissions, false); legacyAdmin = await seedAdmin(["support.read", "support.reply", "support.manage"]);
});
after(async () => {
  await app?.close();
  if (client) { if (schemaCreated) await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`); await client.end(); }
});
const check = (name, fn) => test(name, { skip: !enabled }, fn);
const request = (account, method, url, payload, key, headers = {}) => app.inject({ method, url, headers: { ...(account ? { authorization: `Bearer ${account.token}` } : {}), ...(key ? { "idempotency-key": key } : {}), ...headers }, ...(payload === undefined ? {} : { payload }) });
function expect(response, status, code) { assert.equal(response.statusCode, status, `HTTP ${status} expected, got ${response.statusCode} (${response.json().code ?? "success"})`); if (code) assert.equal(response.json().code, code); return response.json(); }
const submit = (account = user, content = "本地测试功能建议", client_request_id = randomUUID()) => request(account, "POST", "/api/v1/feedback", { content, client_request_id });
const change = version => ({ version, reason: "本地人工测试操作" });
const draft = cover => ({ title: "本地安全公告测试", content: "这是一条独立的纯文字本地公告，不代表奖励承诺。", ...(cover ? { cover_file_id: cover } : {}), reason: "本地草稿测试" });

check("feedback requires auth, rejects whitespace and forbidden fields without echoing input", async () => {
  expect(await request(null, "POST", "/api/v1/feedback", { content: "test", client_request_id: randomUUID() }), 401);
  expect(await submit(user, " \n "), 400, "VALIDATION_FAILED");
  expect(await submit(user, "字".repeat(2001)), 400, "FEEDBACK_CONTENT_TOO_LONG");
  const rejected = await request(user, "POST", "/api/v1/feedback", { content: "private-input-sentinel", client_request_id: randomUUID(), user_id: stranger.id });
  expect(rejected, 400); assert.ok(!rejected.body.includes("private-input-sentinel"));
  const policy = expect(await request(user, "GET", "/api/v1/feedback/policy"), 200);
  assert.equal(policy.max_characters, 2000); assert.equal(policy.hourly_limit, 5); assert.equal(policy.response_sla, null);
});

check("feedback duplicate and concurrent submissions create exactly one independent record and event", async () => {
  const requestId = randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, () => submit(user, "请改进功能提示", requestId)));
  const ids = results.map(result => expect(result, 201).id);
  assert.equal(new Set(ids).size, 1);
  const counts = await client.query("SELECT (SELECT count(*) FROM feedbacks WHERE id=$1)::int feedbacks,(SELECT count(*) FROM outbox_events WHERE aggregate_id=$1)::int events,(SELECT count(*) FROM support_cases)::int cases,(SELECT count(*) FROM conversations)::int conversations", [ids[0]]);
  assert.deepEqual(counts.rows[0], { feedbacks: 1, events: 1, cases: 0, conversations: 0 });
  expect(await submit(user, "不同内容", requestId), 409, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(expect(await request(user, "GET", `/api/v1/feedback/requests/${requestId}`), 200).id, ids[0]);
  expect(await request(stranger, "GET", `/api/v1/feedback/requests/${requestId}`), 404, "FEEDBACK_NOT_FOUND");
  expect(await request(stranger, "GET", `/api/v1/feedback/${ids[0]}`), 404, "FEEDBACK_NOT_FOUND");
  assert.match(results[0].headers["cache-control"], /no-store/);
});

check("feedback per-user DB rate limit survives concurrent distinct requests and allows replay", async () => {
  const limited = await seedUser(), requestId = randomUUID();
  const first = expect(await submit(limited, "先提交一条", requestId), 201);
  const responses = await Promise.all(Array.from({ length: 7 }, () => submit(limited)));
  assert.equal(responses.filter(response => response.statusCode === 201).length, 4);
  assert.equal(responses.filter(response => response.statusCode === 429).length, 3);
  assert.equal(expect(await submit(limited, "先提交一条", requestId), 201).id, first.id);
  assert.equal(expect(await submit(stranger), 201).status, "SUBMITTED");
});

check("feedback cursors preserve microsecond order and cannot cross users or admin filters", async () => {
  const account = await seedUser();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (let index = 0; index < ids.length; index++) await client.query("INSERT INTO feedbacks(id,user_id,client_request_id,content,created_at) VALUES($1,$2,$3,'分页测试',$4)", [ids[index], account.id, randomUUID(), `2026-01-01T00:00:00.00000${index+1}Z`]);
  let cursor, seen = [];
  do {
    const page = expect(await request(account, "GET", `/api/v1/feedback?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), 200);
    seen.push(...page.items.map(item => item.id)); cursor = page.next_cursor;
    if (cursor) expect(await request(user, "GET", `/api/v1/feedback?cursor=${encodeURIComponent(cursor)}`), 400, "VALIDATION_FAILED");
  } while (cursor);
  assert.deepEqual(seen, ids.toReversed());
  expect(await request(account, "GET", "/api/v1/feedback?limit=101"), 400);
  expect(await request(account, "GET", "/api/v1/feedback?cursor=tampered"), 400);
  const adminPage = expect(await request(admin, "GET", "/admin-api/v1/feedback?status=SUBMITTED&limit=1"), 200);
  expect(await request(admin, "GET", `/admin-api/v1/feedback?status=REPLIED&cursor=${encodeURIComponent(adminPage.next_cursor)}`), 400);
});

check("dedicated permissions and MFA protect feedback; Bearer writes do not use cookie CSRF", async () => {
  expect(await request(legacyAdmin, "GET", "/admin-api/v1/feedback"), 403, "ADMIN_PERMISSION_DENIED");
  expect(await request(noMfa, "GET", "/admin-api/v1/feedback"), 403, "ADMIN_MFA_REQUIRED");
  const feedback = expect(await submit(), 201);
  expect(await request(readonly, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, { ...change(0), reply: "不允许" }, randomUUID()), 403);
  expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/process`, change(0)), 400);
  const processed = expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/process`, change(0), randomUUID(), { origin: "http://untrusted.invalid" }), 201);
  assert.equal(processed.status, "PROCESSING"); assert.equal(processed.version, 1);
});

check("reply atomically persists current state, one private notification, audit and Outbox; replay does not send twice", async () => {
  const feedback = expect(await submit(), 201), key = randomUUID();
  const payload = { ...change(0), reply: "official-reply-private-sentinel" };
  const response = expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, payload, key), 201);
  assert.equal(response.status, "REPLIED"); assert.equal(response.processing_records.length, 1);
  const replay = expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, payload, key), 201);
  assert.equal(replay.version, 1);
  expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, { ...payload, reply: "改变原回复" }, key), 409, "IDEMPOTENCY_KEY_CONFLICT");
  const notice = expect(await request(user, "GET", "/api/v1/notifications?category=FEEDBACK"), 200).items.find(item => item.related_id === feedback.id);
  assert.equal(notice.related_type, "FEEDBACK"); assert.equal(notice.content_variables.feedback_id, feedback.id);
  expect(await request(stranger, "GET", `/api/v1/notifications/${notice.id}`), 404);
  expect(await request(user, "POST", `/api/v1/notifications/${notice.id}/read`), 201);
  assert.equal(expect(await request(user, "GET", `/api/v1/feedback/${feedback.id}`), 200).version, 1);
  const counts = (await client.query("SELECT (SELECT count(*) FROM notifications WHERE related_id=$1)::int notifications,(SELECT count(*) FROM delivery_logs WHERE notification_id=$2)::int deliveries,(SELECT count(*) FROM outbox_events WHERE aggregate_id=$1 AND event_type='FeedbackReplied')::int events,(SELECT count(*) FROM admin_operation_logs WHERE target_id=$1)::int audits", [feedback.id, notice.id])).rows[0];
  assert.deepEqual(counts, { notifications: 1, deliveries: 1, events: 1, audits: 1 });
  const audit = await client.query("SELECT before_json,after_json,reason FROM admin_operation_logs WHERE target_id=$1", [feedback.id]);
  const outbox = await client.query("SELECT payload_json FROM outbox_events WHERE aggregate_id=$1", [feedback.id]);
  assert.ok(!JSON.stringify([audit.rows, outbox.rows, notice, logs]).includes(payload.reply));
});

check("parallel replies with different keys and stale versions permit one winner", async () => {
  const account = await seedUser(), feedback = expect(await submit(account), 201);
  const results = await Promise.all(Array.from({ length: 4 }, () => request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, { ...change(0), reply: "已记录建议" }, randomUUID())));
  assert.equal(results.filter(result => result.statusCode === 201).length, 1);
  assert.equal(results.filter(result => result.statusCode === 409 && result.json().code === "RESOURCE_VERSION_CONFLICT").length, 3);
  expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/process`, change(1), randomUUID()), 409, "FEEDBACK_STATUS_INVALID");
  await assert.rejects(client.query("UPDATE feedbacks SET content='覆盖',version=version+1 WHERE id=$1", [feedback.id]), error => error.code === "23514");
  await assert.rejects(client.query("DELETE FROM feedbacks WHERE id=$1", [feedback.id]), error => error.code === "23514");
});

check("feedback reply rolls back on downstream notification failure", async () => {
  const account = await seedUser(), feedback = expect(await submit(account), 201);
  await client.query("CREATE FUNCTION reject_test_feedback_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.notification_type='FEEDBACK_REPLIED' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");
  await client.query("CREATE TRIGGER reject_test_feedback_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_test_feedback_notice()");
  const key = randomUUID(), payload = { ...change(0), reply: "回滚测试回复" };
  try {
    expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, payload, key), 500, "INTERNAL_ERROR");
    assert.equal(expect(await request(account, "GET", `/api/v1/feedback/${feedback.id}`), 200).status, "SUBMITTED");
    assert.equal((await client.query("SELECT count(*)::int n FROM admin_operation_logs WHERE target_id=$1", [feedback.id])).rows[0].n, 0);
  } finally { await client.query("DROP TRIGGER reject_test_feedback_notice ON notifications"); await client.query("DROP FUNCTION reject_test_feedback_notice()"); }
  expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, payload, key), 201);
});

check("feedback notifications are opt-in for old clients including counts and mark-all", async () => {
  const account = await seedUser(), feedback = expect(await submit(account), 201);
  expect(await request(admin, "POST", `/admin-api/v1/feedback/${feedback.id}/reply`, { ...change(0), reply: "新的反馈通知" }, randomUUID()), 201);
  assert.equal(expect(await request(account, "GET", "/api/v1/notifications"), 200).items.length, 0);
  assert.equal(expect(await request(account, "GET", "/api/v1/notifications/unread-count"), 200).unread_count, 0);
  assert.equal(expect(await request(account, "POST", "/api/v1/notifications/read-all"), 201).updated_count, 0);
  assert.equal(expect(await request(account, "GET", "/api/v1/notifications?include_feedback=true"), 200).items.length, 1);
  assert.equal(expect(await request(account, "GET", "/api/v1/notifications/unread-count?include_feedback=true"), 200).unread_count, 1);
  assert.equal(expect(await request(account, "GET", "/api/v1/notifications?include_feedback=false"), 200).items.length, 0);
  assert.equal(expect(await request(account, "POST", "/api/v1/notifications/read-all?include_feedback=true"), 201).updated_count, 1);
  assert.equal(expect(await request(account, "GET", "/api/v1/notifications/unread-count?include_feedback=true"), 200).unread_count, 0);
});

check("disabled users and revoked sessions cannot submit or read private feedback", async () => {
  const blocked = await seedUser(), revoked = await seedUser();
  await client.query("UPDATE users SET status='DISABLED' WHERE id=$1", [blocked.id]);
  // Existing SessionAuthorizationService deliberately invalidates disabled-user sessions.
  expect(await submit(blocked), 401, "AUTH_SESSION_INVALID");
  await client.query("UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1", [revoked.id]);
  expect(await request(revoked, "GET", "/api/v1/feedback"), 401, "AUTH_SESSION_INVALID");
  expect(await request(user, "GET", "/api/v1/feedback", undefined, undefined, { authorization: "Bearer invalid-token-sentinel" }), 401);
  assert.ok(!JSON.stringify(logs).includes("invalid-token-sentinel"));
});

check("announcements draft creation is idempotent, private and never a personal notification", async () => {
  const key = randomUUID(), payload = draft();
  const results = await Promise.all(Array.from({ length: 4 }, () => request(admin, "POST", "/admin-api/v1/announcements", payload, key)));
  const ids = results.map(response => expect(response, 201).id);
  assert.equal(new Set(ids).size, 1);
  expect(await request(null, "GET", `/api/v1/announcements/${ids[0]}`), 404);
  expect(await request(null, "GET", `/api/v1/announcements/${ids[0]}/cover`), 404);
  assert.ok(!expect(await request(null, "GET", "/api/v1/announcements"), 200).items.some(item => item.id === ids[0]));
  assert.equal((await client.query("SELECT count(*)::int n FROM notifications WHERE related_id=$1", [ids[0]])).rows[0].n, 0);
  expect(await request(admin, "POST", `/admin-api/v1/announcements/${ids[0]}/publish`, change(0), randomUUID()), 409, "ANNOUNCEMENT_COVER_REQUIRED");
});

check("announcement image upload is admin-only and must be verified then manually approved", async () => {
  const input = { file_type: "ANNOUNCEMENT_IMAGE", mime_type: "image/png", size_bytes: png.length, sha256: createHash("sha256").update(png).digest("hex") };
  expect(await request(user, "POST", "/api/v1/files/uploads", input), 403, "FILE_TYPE_NOT_ALLOWED");
  const uploaded = expect(await request(admin, "POST", "/admin-api/v1/files/uploads", input), 201);
  expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(uploaded.file.id), randomUUID()), 409, "ANNOUNCEMENT_COVER_INVALID");
  await fillObject(uploaded.file.id);
  expect(await request(admin, "POST", `/admin-api/v1/files/${uploaded.file.id}/complete`), 201);
  expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(uploaded.file.id), randomUUID()), 409, "ANNOUNCEMENT_COVER_INVALID");
  expect(await request(admin, "POST", `/admin-api/v1/files/${uploaded.file.id}/moderation`, { decision: "APPROVED", reason: "人工检查测试封面" }), 201);
  const created = expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(uploaded.file.id), randomUUID()), 201);
  assert.equal(created.cover_file_id, uploaded.file.id);
  expect(await request(null, "GET", `/api/v1/files/${uploaded.file.id}`), 404);
});

check("admin cover selector filters actual file purpose and binds it to cursor scope", async () => {
  await seedCover(); await seedCover(); await seedCover({ file_type: "PRODUCT_IMAGE" });
  const path = "/admin-api/v1/files?file_type=ANNOUNCEMENT_IMAGE&upload_status=VERIFIED&moderation_status=APPROVED&limit=1";
  const first = expect(await request(admin, "GET", path), 200);
  assert.equal(first.items.length, 1); assert.equal(first.items[0].file_type, "ANNOUNCEMENT_IMAGE"); assert.ok(first.next_cursor);
  const second = expect(await request(admin, "GET", `${path}&cursor=${encodeURIComponent(first.next_cursor)}`), 200);
  assert.equal(second.items[0].file_type, "ANNOUNCEMENT_IMAGE"); assert.notEqual(second.items[0].id, first.items[0].id);
  expect(await request(admin, "GET", `${path.replace("ANNOUNCEMENT_IMAGE", "PRODUCT_IMAGE")}&cursor=${encodeURIComponent(first.next_cursor)}`), 400, "VALIDATION_FAILED");
  expect(await request(admin, "GET", "/admin-api/v1/files?file_type=UNKNOWN_PURPOSE"), 400);
  expect(await request(readonly, "GET", path), 403);
  for (const field of ["bucket", "object_key", "url"]) assert.equal(field in first.items[0], false);
});

check("announcement rejects arbitrary URLs, wrong-purpose, owned, deleted and unapproved cover files", async () => {
  expect(await request(admin, "POST", "/admin-api/v1/announcements", { ...draft(), cover_url: "https://untrusted.invalid/asset" }, randomUUID()), 400);
  for (const overrides of [{ file_type: "PRODUCT_IMAGE" }, { owner_user_id: user.id }, { moderation_status: "REJECTED" }, { deleted_at: new Date() }, { visibility: "PUBLIC" }]) {
    const id = await seedCover(overrides);
    expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(id), randomUUID()), 409, "ANNOUNCEMENT_COVER_INVALID");
  }
  expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(randomUUID()), randomUUID()), 409);
});

check("announcement editing uses CAS, approved cover binding, audit and scoped permissions", async () => {
  const cover = await seedCover(), created = expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(cover), randomUUID()), 201);
  expect(await request(noMfa, "POST", `/admin-api/v1/announcements/${created.id}/publish`, change(0), randomUUID()), 403, "ADMIN_MFA_REQUIRED");
  expect(await request(readonly, "POST", `/admin-api/v1/announcements/${created.id}/publish`, change(0), randomUUID()), 403, "ADMIN_PERMISSION_DENIED");
  const results = await Promise.all(Array.from({ length: 3 }, () => request(admin, "POST", `/admin-api/v1/announcements/${created.id}/edit`, { ...draft(cover), title: "编辑后的本地标题", version: 0 }, randomUUID())));
  assert.equal(results.filter(response => response.statusCode === 201).length, 1);
  assert.equal(results.filter(response => response.statusCode === 409).length, 2);
  const detail = expect(await request(admin, "GET", `/admin-api/v1/announcements/${created.id}`), 200);
  assert.equal(detail.title, "编辑后的本地标题"); assert.equal(detail.version, 1); assert.equal(detail.processing_records.length, 2);
  assert.equal((await client.query("SELECT count(*)::int n FROM file_usages WHERE target_id=$1 AND deleted_at IS NULL", [created.id])).rows[0].n, 1);
});

check("published announcement is public and immutable; retire hides it; replay cannot resurrect it", async () => {
  const cover = await seedCover(), created = expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(cover), randomUUID()), 201);
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 4 }, () => request(admin, "POST", `/admin-api/v1/announcements/${created.id}/publish`, change(0), key)));
  for (const response of results) assert.equal(expect(response, 201).version, 1);
  const visible = expect(await request(null, "GET", `/api/v1/announcements/${created.id}`), 200);
  assert.equal(visible.title, created.title); assert.ok(visible.published_at); assert.ok(!("created_by_admin_id" in visible));
  const grant = expect(await request(null, "GET", visible.cover_access_path), 200);
  assert.ok(grant.access.expires_at); assert.equal(grant.file_id, cover);
  expect(await request(admin, "POST", `/admin-api/v1/announcements/${created.id}/edit`, { ...draft(cover), version: 1 }, randomUUID()), 409, "ANNOUNCEMENT_STATUS_INVALID");
  await assert.rejects(client.query("UPDATE announcements SET content='覆盖已发布',version=version+1 WHERE id=$1", [created.id]), error => error.code === "23514");
  expect(await request(admin, "POST", `/admin-api/v1/announcements/${created.id}/retire`, change(1), randomUUID()), 201);
  assert.equal(expect(await request(admin, "POST", `/admin-api/v1/announcements/${created.id}/publish`, change(0), key), 201).status, "RETIRED");
  expect(await request(null, "GET", `/api/v1/announcements/${created.id}`), 404);
  expect(await request(null, "GET", visible.cover_access_path), 404);
  assert.equal((await client.query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='AnnouncementPublished'", [created.id])).rows[0].n, 1);
});

check("announcement cursors cannot leak admin drafts and cover links require active binding", async () => {
  const page = expect(await request(admin, "GET", "/admin-api/v1/announcements?limit=1"), 200);
  expect(await request(null, "GET", `/api/v1/announcements?cursor=${encodeURIComponent(page.next_cursor)}`), 400);
  const cover = await seedCover(), created = expect(await request(admin, "POST", "/admin-api/v1/announcements", draft(cover), randomUUID()), 201);
  expect(await request(admin, "POST", `/admin-api/v1/announcements/${created.id}/publish`, change(0), randomUUID()), 201);
  await client.query("UPDATE file_usages SET deleted_at=now() WHERE target_id=$1", [created.id]);
  expect(await request(null, "GET", `/api/v1/announcements/${created.id}/cover`), 404);
});

check("error envelopes and logs never echo credentials or private feedback bodies", async () => {
  const marker = "private-free-text-sentinel", account = await seedUser(), reqId = randomUUID();
  expect(await submit(account, marker, reqId), 201);
  const error = await submit(account, `${marker}-changed`, reqId);
  const body = expect(error, 409, "IDEMPOTENCY_KEY_CONFLICT");
  assert.ok(body.request_id); assert.ok(Array.isArray(body.field_errors)); assert.ok(error.headers["x-request-id"]);
  const serialized = JSON.stringify([logs, body]);
  for (const value of [marker, account.token, admin.token, config.authHmacKey, config.userTokenSecret]) assert.ok(!serialized.includes(value), "sensitive data must remain absent");
});

async function seedUser() {
  const id = randomUUID(), sessionId = randomUUID();
  await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'synthetic-encrypted',$2,'***')", [id, randomBytes(32).toString("hex")]);
  await client.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,device_id,device_type,ip,user_agent,expires_at) VALUES($1,$2,$3,'synthetic-device','WEB','127.0.0.1','community-test',now()+interval '1 hour')", [sessionId, id, randomBytes(32).toString("hex")]);
  const token = issueAccessToken({ sub: id, principal_type: "user", token_use: "access", session_id: sessionId }, { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, expiresInSeconds: 3600 });
  return { id, token };
}
async function seedAdmin(keys, mfa = true) {
  const id = randomUUID(), sessionId = randomUUID(), roleId = randomUUID();
  await client.query("INSERT INTO admin_accounts(id,username,display_name,password_hash) VALUES($1,$2,'本地测试管理员','unused')", [id, `test-${id}`]);
  await client.query("INSERT INTO admin_sessions(id,admin_id,session_token_hash,ip,user_agent,expires_at) VALUES($1,$2,$3,'127.0.0.1','community-test',now()+interval '1 hour')", [sessionId, id, randomBytes(32).toString("hex")]);
  await client.query("INSERT INTO roles(id,role_key,name) VALUES($1,$2,'测试角色')", [roleId, `role-${roleId}`]);
  await client.query("INSERT INTO admin_roles(admin_id,role_id) VALUES($1,$2)", [id, roleId]);
  for (const key of keys) {
    const permission = await client.query("INSERT INTO permissions(id,permission_key) VALUES($1,$2) ON CONFLICT(permission_key) DO UPDATE SET permission_key=excluded.permission_key RETURNING id", [randomUUID(), key]);
    await client.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)", [roleId, permission.rows[0].id]);
  }
  const token = issueAccessToken({ sub: id, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: mfa }, { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, expiresInSeconds: 3600 });
  return { id, token };
}
async function fillObject(id) {
  const row = (await client.query("SELECT bucket,object_key FROM files WHERE id=$1", [id])).rows[0];
  objects.set(`${row.bucket}/${row.object_key}`, { body: png, contentType: "image/png", sizeBytes: png.length, metadata: { sha256: createHash("sha256").update(png).digest("hex"), "size-bytes": String(png.length) } });
}
async function seedCover(overrides = {}) {
  const id = randomUUID(), fields = { id, bucket: "synthetic-private", object_key: `test/${id}`, file_type: "ANNOUNCEMENT_IMAGE", mime_type: "image/png", size_bytes: png.length, sha256: createHash("sha256").update(png).digest("hex"), upload_status: "VERIFIED", moderation_status: "APPROVED", visibility: "SIGNED", ...overrides };
  await client.query(`INSERT INTO files (${Object.keys(fields).join(",")}) VALUES (${Object.keys(fields).map((_,index) => `$${index+1}`).join(",")})`, Object.values(fields));
  await fillObject(id); return id;
}
