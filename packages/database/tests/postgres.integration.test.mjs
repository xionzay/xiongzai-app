import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import pg from "pg";
import { validateLocalTestDatabaseUrl } from "../dist/testing.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_test_${randomUUID().replaceAll("-", "")}`;
let client;

function splitMigration(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runMigration(fileName) {
  let sql = await readFile(new URL(`../migrations/${fileName}`, import.meta.url), "utf8");
  sql = sql.replaceAll('"public".', `"${schemaName}".`);

  for (const [index, statement] of splitMigration(sql).entries()) {
    try {
      await client.query(statement);
    } catch (error) {
      error.message = `${fileName} statement ${index + 1}: ${error.message}`;
      throw error;
    }
  }
}

before(async () => {
  if (!enabled) return;

  const validatedDatabaseUrl = validateLocalTestDatabaseUrl(databaseUrl);
  client = new pg.Client({ connectionString: validatedDatabaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);
  const journal = JSON.parse(await readFile(new URL("../migrations/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) await runMigration(`${entry.tag}.sql`);
});

after(async () => {
  if (!client) return;
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.end();
});

test("all migrations apply to an empty PostgreSQL 16 database", { skip: !enabled }, async () => {
  const result = await client.query(
    `SELECT count(*)::integer AS count
       FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    [schemaName],
  );

  assert.equal(result.rows[0].count, 78);
  const enums = await client.query(
    `SELECT count(*)::integer AS count
       FROM pg_type type
       JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = $1 AND type.typtype = 'e'`,
    [schemaName],
  );
  assert.equal(enums.rows[0].count, 70);
  const permission = await client.query("SELECT permission_key, high_risk FROM permissions WHERE permission_key='system_health.read'");
  assert.deepEqual(permission.rows, [{ permission_key: "system_health.read", high_risk: false }]);
  const localCompletionPermissions = await client.query("SELECT permission_key, high_risk FROM permissions WHERE permission_key IN ('finance.export', 'withdrawal.review.initial', 'withdrawal.review.final') ORDER BY permission_key");
  assert.deepEqual(localCompletionPermissions.rows, [
    { permission_key: "finance.export", high_risk: true },
    { permission_key: "withdrawal.review.final", high_risk: true },
    { permission_key: "withdrawal.review.initial", high_risk: true },
  ]);
});

test("critical constraints, partial indexes and deferred triggers exist", { skip: !enabled }, async () => {
  const exclusion = await client.query(
    `SELECT conname, contype
       FROM pg_constraint
      WHERE connamespace = $1::regnamespace
        AND conname = 'order_slot_reservations_no_overlap'`,
    [schemaName],
  );
  assert.deepEqual(exclusion.rows, [
    { conname: "order_slot_reservations_no_overlap", contype: "x" },
  ]);

  const deferredTriggers = await client.query(
    `SELECT count(*)::integer AS count
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND t.tgconstraint <> 0 AND t.tgdeferrable`,
    [schemaName],
  );
  assert.ok(deferredTriggers.rows[0].count >= 7);

  const indexes = await client.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = $1
        AND indexname IN (
          'refunds_one_active_per_order_uq',
          'payout_accounts_default_type_uq',
          'reviews_order_uq',
          'payment_events_provider_uq',
          'users_status_created_id_idx',
          'files_admin_queue_created_id_idx',
          'admin_operation_logs_created_id_idx',
          'risk_events_status_created_id_idx',
          'security_logs_status_created_id_idx'
          ,'phone_change_requests_one_active_user_uq'
          ,'personal_data_export_jobs_one_active_user_uq'
          ,'account_cancellation_requests_one_active_user_uq'
          ,'complaint_evidences_complaint_idx'
          ,'phone_change_requests_old_sms_code_uq'
          ,'phone_change_requests_new_sms_code_uq'
        )`,
    [schemaName],
  );
  assert.equal(indexes.rowCount, 15);
});

test("feedback and announcements have isolated identities, lifecycle constraints, history guards and ungranted permissions", { skip: !enabled }, async () => {
  const triggers = await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid IN ('feedbacks'::regclass,'announcements'::regclass) AND NOT tgisinternal ORDER BY tgname");
  assert.deepEqual(triggers.rows.map(row => row.tgname), ["announcements_protect_history", "feedbacks_protect_history"]);
  const required = ["feedbacks_user_request_uq", "feedbacks_user_created_idx", "feedbacks_status_created_idx", "announcements_status_created_idx"];
  const indexes = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname=ANY($2)", [schemaName, required]);
  assert.deepEqual(indexes.rows.map(row => row.indexname).sort(), required.sort());
  const permissionRows = await client.query("SELECT permission_key,high_risk FROM permissions WHERE permission_key LIKE 'feedback.%' OR permission_key LIKE 'announcement.%' ORDER BY permission_key");
  assert.deepEqual(permissionRows.rows, [
    { permission_key: "announcement.manage", high_risk: false }, { permission_key: "announcement.publish", high_risk: true }, { permission_key: "announcement.read", high_risk: false },
    { permission_key: "feedback.manage", high_risk: false }, { permission_key: "feedback.read", high_risk: false }, { permission_key: "feedback.reply", high_risk: true },
  ]);
  const grants = await client.query("SELECT count(*)::int n FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.permission_key LIKE 'feedback.%' OR p.permission_key LIKE 'announcement.%'");
  assert.equal(grants.rows[0].n, 0);
  const enumValues = await client.query("SELECT enum_range(NULL::notification_category)::text[] categories,enum_range(NULL::file_type)::text[] purposes");
  assert.ok(enumValues.rows[0].categories.includes("FEEDBACK"));
  assert.ok(enumValues.rows[0].purposes.includes("ANNOUNCEMENT_IMAGE"));
});

test("critical cursor and worker queries can use their composite indexes", { skip: !enabled }, async () => {
  await client.query("SET enable_seqscan = off");
  const probes = [
    ["orders_buyer_created_idx", "SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20", [randomUUID()]],
    ["orders_seller_created_idx", "SELECT * FROM orders WHERE seller_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20", [randomUUID()]],
    ["messages_conversation_created_idx", "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 100", [randomUUID()]],
    ["notifications_user_unread_idx", "SELECT * FROM notifications WHERE user_id = $1 AND read_status = 'UNREAD' ORDER BY created_at DESC LIMIT 50", [randomUUID()]],
    ["outbox_events_dispatch_idx", "SELECT * FROM outbox_events WHERE status = 'PENDING' AND available_at <= now() ORDER BY available_at LIMIT 100", []],
    ["scheduled_jobs_dispatch_idx", "SELECT * FROM scheduled_jobs WHERE status = 'PENDING' AND run_at <= now() ORDER BY run_at LIMIT 100", []],
    ["phone_change_requests_expiry_idx", "SELECT * FROM phone_change_requests WHERE status='PENDING_OLD_VERIFICATION' AND expires_at<=now() ORDER BY expires_at,id LIMIT 100", []],
    ["personal_data_export_jobs_dispatch_idx", "SELECT * FROM personal_data_export_jobs WHERE status='PENDING' ORDER BY created_at,id LIMIT 100", []],
    ["account_cancellation_requests_waiting_idx", "SELECT * FROM account_cancellation_requests WHERE status='REQUESTED' AND waiting_period_ends_at<=now() ORDER BY waiting_period_ends_at,id LIMIT 100", []],
    ["complaint_evidences_complaint_idx", "SELECT * FROM complaint_evidences WHERE complaint_id=$1 ORDER BY created_at,id LIMIT 20", [randomUUID()]],
  ];
  for (const [indexName, query, values] of probes) {
    const plan = await client.query(`EXPLAIN (FORMAT JSON) ${query}`, values);
    assert.match(JSON.stringify(plan.rows[0]["QUERY PLAN"]), new RegExp(indexName), `query cannot use ${indexName}`);
  }
  await client.query("RESET enable_seqscan");
});

test("phone hash and command/event idempotency keys are unique", { skip: !enabled }, async () => {
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  const phoneHash = "a".repeat(64);

  await client.query(
    `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
     VALUES ($1, 'ciphertext', $2, '138****0000')`,
    [firstUserId, phoneHash],
  );

  await assert.rejects(
    client.query(
      `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
       VALUES ($1, 'other-ciphertext', $2, '139****0000')`,
      [secondUserId, phoneHash],
    ),
    /users_phone_hash_uq/,
  );

  const idempotencyId = randomUUID();
  await client.query(
    `INSERT INTO idempotency_keys
       (id, scope, idempotency_key, request_hash, expires_at)
     VALUES ($1, 'create-order', 'same-command', $2, now() + interval '1 hour')`,
    [idempotencyId, "b".repeat(64)],
  );
  await assert.rejects(
    client.query(
      `INSERT INTO idempotency_keys
         (id, scope, idempotency_key, request_hash, expires_at)
       VALUES ($1, 'create-order', 'same-command', $2, now() + interval '1 hour')`,
      [randomUUID(), "b".repeat(64)],
    ),
    /idempotency_keys_scope_key_uq/,
  );

  const eventId = randomUUID();
  await client.query(
    `INSERT INTO inbox_events (id, event_id, consumer_name, payload_sha256)
     VALUES ($1, $2, 'notification-worker', $3)`,
    [randomUUID(), eventId, "c".repeat(64)],
  );
  await assert.rejects(
    client.query(
      `INSERT INTO inbox_events (id, event_id, consumer_name, payload_sha256)
       VALUES ($1, $2, 'notification-worker', $3)`,
      [randomUUID(), eventId, "c".repeat(64)],
    ),
    /inbox_events_consumer_event_uq/,
  );
});

test("business writes and Outbox events commit and roll back atomically", { skip: !enabled }, async () => {
  const rolledBackUserId = randomUUID();
  const rolledBackEventId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
     VALUES ($1, 'rollback-ciphertext', $2, '136****0000')`,
    [rolledBackUserId, randomUUID().replaceAll("-", "").padEnd(64, "0")],
  );
  await client.query(
    `INSERT INTO outbox_events
       (id, event_id, aggregate_type, aggregate_id, event_type, payload_json)
     VALUES ($1, $2, 'USER', $3, 'UserCreated', '{}')`,
    [randomUUID(), rolledBackEventId, rolledBackUserId],
  );
  await client.query("ROLLBACK");
  const rolledBack = await client.query(
    `SELECT
       (SELECT count(*)::integer FROM users WHERE id = $1) AS users,
       (SELECT count(*)::integer FROM outbox_events WHERE event_id = $2) AS events`,
    [rolledBackUserId, rolledBackEventId],
  );
  assert.deepEqual(rolledBack.rows[0], { users: 0, events: 0 });

  const committedUserId = randomUUID();
  const committedEventId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users (id, phone_ciphertext, phone_hash, phone_mask)
     VALUES ($1, 'commit-ciphertext', $2, '137****0000')`,
    [committedUserId, randomUUID().replaceAll("-", "").padEnd(64, "1")],
  );
  await client.query(
    `INSERT INTO outbox_events
       (id, event_id, aggregate_type, aggregate_id, event_type, payload_json)
     VALUES ($1, $2, 'USER', $3, 'UserCreated', '{}')`,
    [randomUUID(), committedEventId, committedUserId],
  );
  await client.query("COMMIT");
  const committed = await client.query(
    `SELECT
       (SELECT count(*)::integer FROM users WHERE id = $1) AS users,
       (SELECT count(*)::integer FROM outbox_events WHERE event_id = $2) AS events`,
    [committedUserId, committedEventId],
  );
  assert.deepEqual(committed.rows[0], { users: 1, events: 1 });
});

test("posted ledger transactions balance and remain append-only", { skip: !enabled }, async () => {
  const debitAccountId = randomUUID();
  const creditAccountId = randomUUID();

  await client.query(
    `INSERT INTO ledger_accounts
       (id, owner_type, system_key, account_type)
     VALUES
       ($1, 'PLATFORM', 'integration-debit', 'PLATFORM_RECEIVABLE'),
       ($2, 'PLATFORM', 'integration-credit', 'PLATFORM_COMMISSION')`,
    [debitAccountId, creditAccountId],
  );

  const balancedTransactionId = randomUUID();
  const debitEntryId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO ledger_transactions
       (id, transaction_no, transaction_type, source_type, source_id,
        idempotency_key, description, occurred_at)
     VALUES ($1, $2, 'ADJUSTMENT', 'PLATFORM', $3, $4, 'integration balance', now())`,
    [balancedTransactionId, `LT-${balancedTransactionId}`, randomUUID(), `ledger-${balancedTransactionId}`],
  );
  await client.query(
    `INSERT INTO ledger_entries
       (id, transaction_id, account_id, side, amount_cent)
     VALUES
       ($1, $2, $3, 'DEBIT', 100),
       ($4, $2, $5, 'CREDIT', 100)`,
    [debitEntryId, balancedTransactionId, debitAccountId, randomUUID(), creditAccountId],
  );
  await client.query(
    `UPDATE ledger_transactions SET status = 'POSTED', posted_at = now() WHERE id = $1`,
    [balancedTransactionId],
  );
  await client.query("COMMIT");

  await assert.rejects(
    client.query(`UPDATE ledger_entries SET amount_cent = 101 WHERE id = $1`, [debitEntryId]),
    /append-only/,
  );

  const unbalancedTransactionId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO ledger_transactions
       (id, transaction_no, transaction_type, source_type, source_id,
        idempotency_key, description, occurred_at)
     VALUES ($1, $2, 'ADJUSTMENT', 'PLATFORM', $3, $4, 'integration imbalance', now())`,
    [unbalancedTransactionId, `LT-${unbalancedTransactionId}`, randomUUID(), `ledger-${unbalancedTransactionId}`],
  );
  await client.query(
    `INSERT INTO ledger_entries
       (id, transaction_id, account_id, side, amount_cent)
     VALUES ($1, $2, $3, 'DEBIT', 100)`,
    [randomUUID(), unbalancedTransactionId, debitAccountId],
  );
  await client.query(
    `UPDATE ledger_transactions SET status = 'POSTED', posted_at = now() WHERE id = $1`,
    [unbalancedTransactionId],
  );
  await assert.rejects(client.query("COMMIT"), /unbalanced/);
  await client.query("ROLLBACK");
});

test("payment channels and payout account types reject values outside the fixed local scope", { skip: !enabled }, async () => {
  const paymentChannels = await client.query("SELECT enum_range(NULL::payment_channel)::text[] AS values");
  const payoutTypes = await client.query("SELECT enum_range(NULL::payout_account_type)::text[] AS values");
  assert.deepEqual(paymentChannels.rows[0].values, ["WECHAT_APP", "ALIPAY_APP", "MOCK"]);
  assert.deepEqual(payoutTypes.rows[0].values, ["WECHAT", "ALIPAY"]);
  for (const channel of ["WECHAT_APP", "ALIPAY_APP", "MOCK"]) {
    assert.equal((await client.query("SELECT $1::payment_channel AS channel", [channel])).rows[0].channel, channel);
  }
  await assert.rejects(client.query("SELECT 'BANK'::payout_account_type"), /invalid input value/);
  await assert.rejects(client.query("SELECT 'CARD'::payment_channel"), /invalid input value/);
});

test("voice samples enforce MIME and verified duration while retaining binding and deletion lifecycle", { skip: !enabled }, async () => {
  const userId = randomUUID();
  const sellerId = randomUUID();
  const voiceId = randomUUID();
  await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'voice-ciphertext',$2,'135****0000')", [userId, randomUUID().replaceAll("-", "").repeat(2)]);
  await client.query("INSERT INTO files(id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,duration_ms,sha256,upload_status,moderation_status,visibility) VALUES($1,$2,'test-media',$3,'VOICE_SAMPLE','audio/mp4',1024,15000,$4,'VERIFIED','APPROVED','SIGNED')", [voiceId, userId, `voice/${voiceId}`, "d".repeat(64)]);
  await client.query("INSERT INTO seller_profiles(id,user_id,seller_nickname,voice_file_id,voice_duration_ms) VALUES($1,$2,'声音测试陪玩',$3,15000)", [sellerId, userId, voiceId]);
  const usageId = randomUUID();
  await client.query("INSERT INTO file_usages(id,file_id,usage_type,target_type,target_id) VALUES($1,$2,'VOICE','SELLER',$3)", [usageId, voiceId, sellerId]);
  await assert.rejects(client.query("INSERT INTO files(id,bucket,object_key,file_type,mime_type,size_bytes,duration_ms,sha256,upload_status) VALUES($1,'test-media',$2,'VOICE_SAMPLE','video/mp4',1024,15000,$3,'VERIFIED')", [randomUUID(), `voice/${randomUUID()}`, "e".repeat(64)]), /files_voice_metadata_valid/);
  await assert.rejects(client.query("INSERT INTO files(id,bucket,object_key,file_type,mime_type,size_bytes,duration_ms,sha256,upload_status) VALUES($1,'test-media',$2,'VOICE_SAMPLE','audio/mpeg',1024,9999,$3,'VERIFIED')", [randomUUID(), `voice/${randomUUID()}`, "f".repeat(64)]), /files_voice_metadata_valid/);
  await client.query("UPDATE file_usages SET deleted_at=now() WHERE id=$1", [usageId]);
  await client.query("UPDATE seller_profiles SET voice_file_id=NULL,voice_duration_ms=NULL,version=version+1 WHERE id=$1", [sellerId]);
  await client.query("UPDATE files SET upload_status='DELETED',deleted_at=now() WHERE id=$1", [voiceId]);
  const lifecycle = await client.query("SELECT f.upload_status,f.deleted_at IS NOT NULL AS file_deleted,u.deleted_at IS NOT NULL AS usage_deleted,s.voice_file_id FROM files f JOIN file_usages u ON u.file_id=f.id JOIN seller_profiles s ON s.id=$2 WHERE f.id=$1", [voiceId, sellerId]);
  assert.deepEqual(lifecycle.rows[0], { upload_status: "DELETED", file_deleted: true, usage_deleted: true, voice_file_id: null });
});

test("policy versions, acceptances and business bindings preserve immutable version evidence", { skip: !enabled }, async () => {
  const sellerUserId = randomUUID();
  const buyerUserId = randomUUID();
  const unrelatedUserId = randomUUID();
  const sellerId = randomUUID();
  const unrelatedSellerId = randomUUID();
  const onboardingPolicyId = randomUUID();
  const voicePolicyId = randomUUID();
  const orderPolicyId = randomUUID();
  const draftPolicyId = randomUUID();
  const voiceFileId = randomUUID();
  const productId = randomUUID();
  const skuId = randomUUID();

  for (const [id, suffix] of [[sellerUserId, "1"], [buyerUserId, "2"], [unrelatedUserId, "3"]]) {
    await client.query(
      "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,$2,$3,$4)",
      [id, `policy-cipher-${suffix}`, suffix.repeat(64), `13${suffix}****0000`],
    );
  }

  for (const [id, policyType] of [
    [onboardingPolicyId, "SELLER_ONBOARDING_AGREEMENT"],
    [voicePolicyId, "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION"],
    [orderPolicyId, "ORDER_PAYMENT_REFUND_RULES"],
  ]) {
    await client.query(
      `INSERT INTO policy_versions
         (id,policy_type,title,content,version_no,status,published_at,effective_at,requires_reacceptance)
       VALUES($1,$2,$3,'本地数据库测试草案',1,'PUBLISHED',now() - interval '2 hours',now() - interval '1 hour',true)`,
      [id, policyType, `${policyType}（本地测试草案）`],
    );
  }
  await client.query(
    `INSERT INTO policy_versions
       (id,policy_type,title,content,version_no,status,requires_reacceptance)
     VALUES($1,'DRAFT_POLICY','待审核协议草案','本地数据库测试草案',1,'DRAFT',false)`,
    [draftPolicyId],
  );

  for (const [userId, policyId, scene] of [
    [sellerUserId, onboardingPolicyId, "SELLER_ONBOARDING"],
    [sellerUserId, voicePolicyId, "VOICE_SAMPLE_UPLOAD"],
    [buyerUserId, orderPolicyId, "ORDER_PAYMENT"],
  ]) {
    await client.query(
      `INSERT INTO user_policy_acceptances
         (user_id,policy_version_id,acceptance_scene,confirmation_method,ip,user_agent)
       VALUES($1,$2,$3,'ONLINE_CONFIRM','127.0.0.1','database-integration-test')`,
      [userId, policyId, scene],
    );
  }

  await client.query(
    `INSERT INTO files
       (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,duration_ms,sha256,upload_status,moderation_status,visibility)
     VALUES($1,$2,'test-media',$3,'VOICE_SAMPLE','audio/mpeg',1024,15000,$4,'VERIFIED','APPROVED','SIGNED')`,
    [voiceFileId, sellerUserId, `policy-voice/${voiceFileId}`, "9".repeat(64)],
  );
  await client.query(
    `INSERT INTO seller_profiles
       (id,user_id,seller_nickname,voice_file_id,voice_authorization_policy_version_id,voice_duration_ms)
     VALUES($1,$2,'协议关联测试陪玩',$3,$4,15000)`,
    [sellerId, sellerUserId, voiceFileId, voicePolicyId],
  );
  await client.query(
    `INSERT INTO seller_applications
       (id,seller_id,version_no,onboarding_policy_version_id,snapshot_json,status,submitted_at)
     VALUES($1,$2,1,$3,'{}'::jsonb,'SUBMITTED',now())`,
    [randomUUID(), sellerId, onboardingPolicyId],
  );

  await client.query(
    "INSERT INTO products(id,seller_id,title,description,min_price_cent) VALUES($1,$2,'协议订单服务','本地测试',2500)",
    [productId, sellerId],
  );
  await client.query(
    "INSERT INTO product_skus(id,product_id,sku_name,price_cent,duration_minutes) VALUES($1,$2,'60分钟',2500,60)",
    [skuId, productId],
  );
  await client.query(
    `INSERT INTO orders
       (id,order_no,buyer_id,seller_user_id,seller_id,product_id,sku_id,
        transaction_policy_version_id,refund_policy_version_id,
        product_title_snapshot,product_image_snapshot,product_description_snapshot,seller_name_snapshot,
        sku_name_snapshot,sku_price_cent_snapshot,sku_duration_minutes_snapshot,quantity,total_amount_cent,
        payable_amount_cent,commission_rate_bps_snapshot,platform_fee_cent,seller_income_cent,
        service_starts_at,service_ends_at,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,'协议订单服务','local://image','本地测试','协议关联测试陪玩',
       '60分钟',2500,60,1,2500,2500,2000,500,2000,now() + interval '1 day',now() + interval '1 day 1 hour',now() + interval '15 minutes')`,
    [randomUUID(), `POL${randomUUID().replaceAll("-", "")}`, buyerUserId, sellerUserId, sellerId, productId, skuId, orderPolicyId],
  );

  await assert.rejects(
    client.query("UPDATE policy_versions SET title='不应覆盖' WHERE id=$1", [orderPolicyId]),
    /published or accepted policy version is immutable/,
  );
  await assert.rejects(
    client.query("UPDATE user_policy_acceptances SET ip='127.0.0.2' WHERE user_id=$1 AND policy_version_id=$2", [buyerUserId, orderPolicyId]),
    /append-only/,
  );
  await assert.rejects(
    client.query(
      `INSERT INTO user_policy_acceptances
         (user_id,policy_version_id,acceptance_scene,confirmation_method,ip,user_agent)
       VALUES($1,$2,'LOGIN','ONLINE_CONFIRM','127.0.0.1','database-integration-test')`,
      [buyerUserId, draftPolicyId],
    ),
    /only an effective published policy version can be accepted/,
  );

  await client.query("INSERT INTO seller_profiles(id,user_id,seller_nickname) VALUES($1,$2,'未接受协议陪玩')", [unrelatedSellerId, unrelatedUserId]);
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO seller_applications
       (id,seller_id,version_no,onboarding_policy_version_id,snapshot_json,status,submitted_at)
     VALUES($1,$2,1,$3,'{}'::jsonb,'SUBMITTED',now())`,
    [randomUUID(), unrelatedSellerId, onboardingPolicyId],
  );
  await assert.rejects(client.query("COMMIT"), /no matching user acceptance/);
  await client.query("ROLLBACK");
});

test("cent amounts, versions, message counters and delivery identities use database-native constraints", { skip: !enabled }, async () => {
  const moneyColumns = await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND column_name LIKE '%_cent' ORDER BY table_name,column_name`, [schemaName]);
  assert.ok(moneyColumns.rowCount > 20);
  assert.deepEqual([...new Set(moneyColumns.rows.map((row) => row.data_type))], ["bigint"]);
  const versions = await client.query(`SELECT table_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema=$1 AND column_name='version' AND table_name=ANY($2::text[]) ORDER BY table_name`, [schemaName, ["orders", "payments", "refunds", "withdrawals"]]);
  assert.deepEqual(versions.rows, ["orders", "payments", "refunds", "withdrawals"].map((table_name) => ({ table_name, data_type: "integer", is_nullable: "NO" })));
  const requiredIndexes = ["idempotency_keys_scope_key_uq", "payments_idempotency_uq", "withdrawals_idempotency_uq", "messages_conversation_sequence_uq", "messages_user_client_uq", "messages_admin_client_uq", "notifications_idempotency_uq", "outbox_events_event_id_uq", "inbox_events_consumer_event_uq"];
  const indexes = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname=ANY($2::text[]) ORDER BY indexname", [schemaName, requiredIndexes]);
  assert.deepEqual(indexes.rows.map((row) => row.indexname).sort(), requiredIndexes.sort());
});

test("phone change requires one-time old/new SMS proofs and an atomic versioned user update", { skip: !enabled }, async () => {
  const userId = randomUUID();
  const requestId = randomUUID();
  const oldSmsCodeId = randomUUID();
  const newSmsCodeId = randomUUID();
  const oldHash = randomUUID().replaceAll("-", "").repeat(2);
  const newHash = randomUUID().replaceAll("-", "").repeat(2);

  await client.query(
    "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'old-phone-cipher',$2,'138****0001')",
    [userId, oldHash],
  );
  await client.query(
    `INSERT INTO sms_codes(id,phone_hash,purpose,code_hash,max_attempts,expires_at,consumed_at)
     VALUES
       ($1,$2,'PHONE_CHANGE_OLD',$3,5,now()+interval '10 minutes',now()),
       ($4,$5,'PHONE_CHANGE_NEW',$6,5,now()+interval '10 minutes',now())`,
    [oldSmsCodeId, oldHash, "1".repeat(64), newSmsCodeId, newHash, "2".repeat(64)],
  );
  await client.query(
    `INSERT INTO phone_change_requests
       (id,user_id,idempotency_key,old_phone_ciphertext,old_phone_hash,old_phone_mask,
        new_phone_ciphertext,new_phone_hash,new_phone_mask,user_version_at_request,expires_at)
     VALUES($1,$2,'phone-change-command','old-phone-cipher',$3,'138****0001',
       'new-phone-cipher',$4,'139****0002',0,now()+interval '1 hour')`,
    [requestId, userId, oldHash, newHash],
  );

  await assert.rejects(
    client.query(
      `INSERT INTO phone_change_requests
         (id,user_id,idempotency_key,old_phone_ciphertext,old_phone_hash,old_phone_mask,
          new_phone_ciphertext,new_phone_hash,new_phone_mask,user_version_at_request,expires_at)
       VALUES($1,$2,'second-active','old-phone-cipher',$3,'138****0001',
         'another-cipher',$4,'137****0003',0,now()+interval '1 hour')`,
      [randomUUID(), userId, oldHash, randomUUID().replaceAll("-", "").repeat(2)],
    ),
    /phone_change_requests_one_active_user_uq/,
  );
  await assert.rejects(
    client.query("UPDATE phone_change_requests SET old_attempt_count=1 WHERE id=$1", [requestId]),
    /version must increase by exactly one/,
  );

  await client.query(
    `UPDATE phone_change_requests
        SET status='PENDING_NEW_VERIFICATION',old_sms_code_id=$2,old_verified_at=now(),version=1,updated_at=now()
      WHERE id=$1`,
    [requestId, oldSmsCodeId],
  );
  await client.query(
    `UPDATE phone_change_requests
        SET status='READY',new_sms_code_id=$2,new_verified_at=now(),version=2,updated_at=now()
      WHERE id=$1`,
    [requestId, newSmsCodeId],
  );

  await client.query("BEGIN");
  await client.query(
    "UPDATE phone_change_requests SET status='COMPLETED',completed_at=now(),version=3,updated_at=now() WHERE id=$1",
    [requestId],
  );
  await assert.rejects(client.query("COMMIT"), /not atomically reflected on user/);
  await client.query("ROLLBACK");
  assert.equal((await client.query("SELECT status FROM phone_change_requests WHERE id=$1", [requestId])).rows[0].status, "READY");

  await client.query("BEGIN");
  await client.query(
    `UPDATE users
        SET phone_ciphertext='new-phone-cipher',phone_hash=$2,phone_mask='139****0002',version=1,updated_at=now()
      WHERE id=$1 AND version=0`,
    [userId, newHash],
  );
  await client.query(
    "UPDATE phone_change_requests SET status='COMPLETED',completed_at=now(),version=3,updated_at=now() WHERE id=$1",
    [requestId],
  );
  await client.query("COMMIT");
  assert.deepEqual(
    (await client.query("SELECT status,version FROM phone_change_requests WHERE id=$1", [requestId])).rows[0],
    { status: "COMPLETED", version: 3 },
  );
  const reuseUserId = randomUUID();
  const reuseOldHash = randomUUID().replaceAll("-", "").repeat(2);
  await client.query(
    "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'reuse-user-cipher',$2,'130****0010')",
    [reuseUserId, reuseOldHash],
  );
  await assert.rejects(
    client.query(
      `INSERT INTO phone_change_requests
         (id,user_id,idempotency_key,old_phone_ciphertext,old_phone_hash,old_phone_mask,
          new_phone_ciphertext,new_phone_hash,new_phone_mask,old_sms_code_id,status,
          user_version_at_request,old_verified_at,expires_at)
       VALUES($1,$2,'reused-sms-proof','reuse-user-cipher',$3,'130****0010',
         'reuse-new-cipher',$4,'130****0011',$5,'PENDING_NEW_VERIFICATION',0,now(),now()+interval '1 hour')`,
      [randomUUID(), reuseUserId, reuseOldHash, randomUUID().replaceAll("-", "").repeat(2), oldSmsCodeId],
    ),
    /phone_change_requests_old_sms_code_uq/,
  );
  await assert.rejects(client.query("DELETE FROM phone_change_requests WHERE id=$1", [requestId]), /append-only/);

  const phoneColumns = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='phone_change_requests'`,
    [schemaName],
  );
  assert.equal(phoneColumns.rows.some((row) => /plain|number|mobile/iu.test(row.column_name)), false);
});

test("personal data exports enforce one active job, file ownership and terminal lifecycle", { skip: !enabled }, async () => {
  const userId = randomUUID();
  const exportId = randomUUID();
  const fileId = randomUUID();
  const phoneHash = randomUUID().replaceAll("-", "").repeat(2);
  await client.query(
    "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'export-user-cipher',$2,'136****0004')",
    [userId, phoneHash],
  );
  await client.query(
    `INSERT INTO files
       (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility)
     VALUES($1,$2,'private-exports',$3,'DATA_EXPORT','application/zip',2048,$4,'VERIFIED','APPROVED','SIGNED')`,
    [fileId, userId, `exports/${fileId}.zip`, "3".repeat(64)],
  );
  await client.query(
    `INSERT INTO personal_data_export_jobs(id,user_id,idempotency_key,expires_at)
     VALUES($1,$2,'export-command',now()+interval '7 days')`,
    [exportId, userId],
  );
  await assert.rejects(
    client.query(
      `INSERT INTO personal_data_export_jobs(id,user_id,idempotency_key,expires_at)
       VALUES($1,$2,'another-active-export',now()+interval '7 days')`,
      [randomUUID(), userId],
    ),
    /personal_data_export_jobs_one_active_user_uq/,
  );
  await assert.rejects(
    client.query("UPDATE personal_data_export_jobs SET status='PROCESSING',started_at=now() WHERE id=$1", [exportId]),
    /version must increase by exactly one/,
  );
  await client.query(
    "UPDATE personal_data_export_jobs SET status='PROCESSING',started_at=now(),version=1,updated_at=now() WHERE id=$1",
    [exportId],
  );
  await client.query(
    `UPDATE personal_data_export_jobs
        SET status='COMPLETED',output_file_id=$2,finished_at=now(),version=2,updated_at=now()
      WHERE id=$1`,
    [exportId, fileId],
  );
  await assert.rejects(
    client.query("UPDATE personal_data_export_jobs SET version=3,updated_at=now() WHERE id=$1", [exportId]),
    /terminal personal data export job is immutable/,
  );
  await assert.rejects(
    client.query("UPDATE personal_data_export_jobs SET status='EXPIRED',version=3,updated_at=now() WHERE id=$1", [exportId]),
    /cannot expire before expires_at/,
  );
  const urlColumns = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='personal_data_export_jobs' AND column_name ILIKE '%url%'`,
    [schemaName],
  );
  assert.equal(urlColumns.rowCount, 0);
});

test("account cancellation enforces waiting period, audit linkage and atomic user cancellation", { skip: !enabled }, async () => {
  const userId = randomUUID();
  const requestId = randomUUID();
  const adminId = randomUUID();
  const operationLogId = randomUUID();
  await client.query(
    "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'cancel-user-cipher',$2,'135****0005')",
    [userId, randomUUID().replaceAll("-", "").repeat(2)],
  );
  await client.query(
    "INSERT INTO admin_accounts(id,username,display_name,password_hash) VALUES($1,$2,'注销测试管理员','not-a-real-password')",
    [adminId, `cancel-admin-${adminId}`],
  );
  await client.query(
    `INSERT INTO account_cancellation_requests
       (id,user_id,idempotency_key,reason,requested_at,waiting_period_ends_at)
     VALUES($1,$2,'cancel-command','本地测试注销',now()-interval '2 days',now()-interval '1 day')`,
    [requestId, userId],
  );
  await client.query(
    "UPDATE account_cancellation_requests SET status='PROCESSING',processing_at=now(),version=1,updated_at=now() WHERE id=$1",
    [requestId],
  );
  await client.query(
    `INSERT INTO admin_operation_logs
       (id,admin_id,action,target_type,target_id,reason,request_id,ip,user_agent)
     VALUES($1,$2,'ACCOUNT_CANCELLATION_COMPLETE','USER',$3,'本地测试审核','cancel-audit','127.0.0.1','database-test')`,
    [operationLogId, adminId, userId],
  );
  const completedAt = new Date();
  await client.query("BEGIN");
  await client.query(
    "UPDATE users SET status='CANCELLED',cancelled_at=$2,version=version+1,updated_at=now() WHERE id=$1",
    [userId, completedAt],
  );
  await client.query(
    `UPDATE account_cancellation_requests
        SET status='COMPLETED',completed_at=$2,decision_admin_operation_log_id=$3,version=2,updated_at=now()
      WHERE id=$1`,
    [requestId, completedAt, operationLogId],
  );
  await client.query("COMMIT");
  assert.equal((await client.query("SELECT status FROM account_cancellation_requests WHERE id=$1", [requestId])).rows[0].status, "COMPLETED");
  await assert.rejects(client.query("DELETE FROM account_cancellation_requests WHERE id=$1", [requestId]), /append-only/);

  const waitingUserId = randomUUID();
  const waitingRequestId = randomUUID();
  await client.query(
    "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'waiting-user-cipher',$2,'134****0006')",
    [waitingUserId, randomUUID().replaceAll("-", "").repeat(2)],
  );
  await client.query(
    `INSERT INTO account_cancellation_requests(id,user_id,idempotency_key,reason,waiting_period_ends_at)
     VALUES($1,$2,'future-cancel','等待期测试',now()+interval '1 day')`,
    [waitingRequestId, waitingUserId],
  );
  await assert.rejects(
    client.query(
      "UPDATE account_cancellation_requests SET status='PROCESSING',processing_at=now(),version=1,updated_at=now() WHERE id=$1",
      [waitingRequestId],
    ),
    /waiting period has not ended/,
  );
});

test("active lifecycle requests are concurrency-safe", { skip: !enabled }, async () => {
  const userId = randomUUID();
  await client.query(
    "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'concurrency-user-cipher',$2,'133****0007')",
    [userId, randomUUID().replaceAll("-", "").repeat(2)],
  );
  const first = await connectIsolatedClient();
  const second = await connectIsolatedClient();
  try {
    await first.query("BEGIN");
    await second.query("BEGIN");
    await first.query(
      `INSERT INTO personal_data_export_jobs(id,user_id,idempotency_key,expires_at)
       VALUES($1,$2,'concurrent-export-a',now()+interval '1 day')`,
      [randomUUID(), userId],
    );
    const competingInsert = second.query(
      `INSERT INTO personal_data_export_jobs(id,user_id,idempotency_key,expires_at)
       VALUES($1,$2,'concurrent-export-b',now()+interval '1 day')`,
      [randomUUID(), userId],
    );
    await new Promise((resolve) => setImmediate(resolve));
    await first.query("COMMIT");
    await assert.rejects(competingInsert, /personal_data_export_jobs_one_active_user_uq/);
    await second.query("ROLLBACK");
  } finally {
    await first.end();
    await second.end();
  }
});

test("complaint evidence remains append-only and is capped at twenty verified files", { skip: !enabled }, async () => {
  const reporterId = randomUUID();
  const targetId = randomUUID();
  const complaintId = randomUUID();
  for (const [id, mask] of [[reporterId, "132****0008"], [targetId, "131****0009"]]) {
    await client.query(
      "INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'evidence-user-cipher',$2,$3)",
      [id, randomUUID().replaceAll("-", "").repeat(2), mask],
    );
  }
  await client.query(
    `INSERT INTO complaints
       (id,complaint_no,reporter_id,target_type,target_user_id,complaint_type,description)
     VALUES($1,$2,$3,'USER',$4,'LOCAL_TEST','投诉补充证据测试')`,
    [complaintId, `CMP-${complaintId}`, reporterId, targetId],
  );

  let firstEvidenceId;
  for (let index = 0; index < 20; index += 1) {
    const fileId = randomUUID();
    const evidenceId = randomUUID();
    firstEvidenceId ??= evidenceId;
    await client.query(
      `INSERT INTO files
         (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility)
       VALUES($1,$2,'complaint-evidence',$3,'COMPLAINT_EVIDENCE','image/png',1024,$4,'VERIFIED','PENDING','PRIVATE')`,
      [fileId, reporterId, `complaints/${complaintId}/${fileId}.png`, index.toString(16).padStart(64, "0")],
    );
    await client.query(
      `INSERT INTO complaint_evidences(id,complaint_id,file_id,submitted_by_user_id,description)
       VALUES($1,$2,$3,$4,$5)`,
      [evidenceId, complaintId, fileId, reporterId, `第 ${index + 1} 份本地测试证据`],
    );
  }
  await assert.rejects(
    client.query("UPDATE complaint_evidences SET description='不允许覆盖' WHERE id=$1", [firstEvidenceId]),
    /append-only/,
  );

  const overflowFileId = randomUUID();
  await client.query(
    `INSERT INTO files
       (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,visibility)
     VALUES($1,$2,'complaint-evidence',$3,'COMPLAINT_EVIDENCE','image/png',1024,$4,'VERIFIED','PRIVATE')`,
    [overflowFileId, reporterId, `complaints/${complaintId}/${overflowFileId}.png`, "f".repeat(64)],
  );
  await assert.rejects(
    client.query(
      `INSERT INTO complaint_evidences(id,complaint_id,file_id,submitted_by_user_id)
       VALUES($1,$2,$3,$4)`,
      [randomUUID(), complaintId, overflowFileId, reporterId],
    ),
    /complaint evidence limit of 20 reached/,
  );

  const noActorComplaintId = randomUUID();
  const noActorFileId = randomUUID();
  await client.query(
    `INSERT INTO complaints
       (id,complaint_no,reporter_id,target_type,target_user_id,complaint_type,description)
     VALUES($1,$2,$3,'USER',$4,'LOCAL_TEST','提交人约束测试')`,
    [noActorComplaintId, `CMP-${noActorComplaintId}`, reporterId, targetId],
  );
  await client.query(
    `INSERT INTO files
       (id,owner_user_id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,visibility)
     VALUES($1,$2,'complaint-evidence',$3,'COMPLAINT_EVIDENCE','image/png',1024,$4,'VERIFIED','PRIVATE')`,
    [noActorFileId, reporterId, `complaints/${noActorComplaintId}/${noActorFileId}.png`, "e".repeat(64)],
  );
  await assert.rejects(
    client.query(
      "INSERT INTO complaint_evidences(id,complaint_id,file_id) VALUES($1,$2,$3)",
      [randomUUID(), noActorComplaintId, noActorFileId],
    ),
    /complaint_evidences_submitter_xor/,
  );
});

async function connectIsolatedClient() {
  const isolatedClient = new pg.Client({
    connectionString: validateLocalTestDatabaseUrl(databaseUrl),
    application_name: "xiongzai-lifecycle-concurrency-test",
  });
  await isolatedClient.connect();
  await isolatedClient.query(`SET search_path TO "${schemaName}", public`);
  return isolatedClient;
}
test("durable transfer intents enforce target, channel, amount and active-attempt uniqueness",{skip:!enabled},async()=>{
  const names=["transfer_target_valid","transfer_status_valid","transfer_values_valid","transfer_channel_valid"];
  const constraints=await client.query("SELECT conname FROM pg_constraint WHERE connamespace=$1::regnamespace AND conname=ANY($2::text[])",[schemaName,names]);
  assert.deepEqual(constraints.rows.map(x=>x.conname).sort(),names.sort());
  for(const [kind,channel,amount,status] of [["REFUND","ALIPAY_APP","0","READY"],["PAYOUT","BANK","100","READY"],["REFUND","WECHAT_APP","100","SUCCEEDED_FAKE"]]){
    await assert.rejects(client.query("INSERT INTO financial_transfer_operations(id,kind,channel,business_no,amount_cent,status,refund_id,withdrawal_id) VALUES($1,$2,$3,'synthetic',$4,$5,$6,$7)",[randomUUID(),kind,channel,amount,status,kind==="REFUND"?randomUUID():null,kind==="PAYOUT"?randomUUID():null]),error=>error.code==="23514");
  }
  const indexes=await client.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname IN ('transfer_refund_active_uq','transfer_withdrawal_active_uq')",[schemaName]);
  assert.equal(indexes.rows.length,2);for(const row of indexes.rows){assert.match(row.indexdef,/UNIQUE/);assert.match(row.indexdef,/FAILED/);assert.match(row.indexdef,/SUCCEEDED/);}
  const key=randomUUID(),reference="mock-refund-"+key;
  await client.query("INSERT INTO mock_transfer_results(id,kind,channel,idempotency_key,request_hash,provider_reference) VALUES($1,'REFUND','WECHAT_APP',$2,$3,$4)",[randomUUID(),key,"a".repeat(64),reference]);
  await assert.rejects(client.query("INSERT INTO mock_transfer_results(id,kind,channel,idempotency_key,request_hash,provider_reference) VALUES($1,'REFUND','WECHAT_APP',$2,$3,$4)",[randomUUID(),key,"b".repeat(64),reference]),error=>error.code==="23505");
  const columns=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='mock_transfer_results'",[schemaName]);
  assert.equal(columns.rows.some(row=>/account_token|password|secret|plaintext/.test(row.column_name)),false);
});
