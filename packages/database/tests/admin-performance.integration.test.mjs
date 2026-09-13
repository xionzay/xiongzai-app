import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import pg from "pg";
import { validateLocalTestDatabaseUrl } from "../dist/testing.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const schemaName = `xiongzai_admin_perf_${randomUUID().replaceAll("-", "")}`;
const rowCount = 15_000;
let client;

before(async () => {
  if (!enabled) return;
  const validatedDatabaseUrl = validateLocalTestDatabaseUrl(databaseUrl);
  client = new pg.Client({ connectionString: validatedDatabaseUrl, application_name: "xiongzai-admin-performance-test" });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);
  await runMigration("0000_initial_schema.sql");
  await runMigration("0001_core_invariants.sql");
  await runMigration("0002_admin_stage2_permissions.sql");
  await seedRepresentativeRows();
  await client.query("ANALYZE users, files, admin_operation_logs, risk_events, security_logs");
  await client.query("SET max_parallel_workers_per_gather = 0");
});

after(async () => {
  if (!client) return;
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.end();
});

test("evidence-backed admin indexes replace sort-heavy plans for representative keyset queries", { skip: !enabled }, async () => {
  const probes = await queryProbes();
  const beforePlans = new Map();
  for (const probe of probes) {
    await explain(probe);
    beforePlans.set(probe.name, await explain(probe));
  }

  await runMigration("0003_admin_query_performance.sql");
  await client.query("ANALYZE users, files, admin_operation_logs, risk_events, security_logs");

  for (const probe of probes) {
    await explain(probe);
    const afterPlan = await explain(probe);
    const beforePlan = beforePlans.get(probe.name);
    assert.ok(beforePlan);
    assert.equal(planIndexes(beforePlan).includes(probe.indexName), false, `${probe.name} unexpectedly had the stage-three index before migration`);
    assert.ok(planIndexes(afterPlan).includes(probe.indexName), `${probe.name} did not use ${probe.indexName}`);
    assert.equal(planNodes(afterPlan).includes("Sort"), false, `${probe.name} still performs an explicit sort after migration`);
    process.stdout.write(`${JSON.stringify({ type: "admin_query_plan", query: probe.name, rows: rowCount, before: planSummary(beforePlan), after: planSummary(afterPlan) })}\n`);
  }

  const sizes = await client.query(
    `SELECT indexrelname AS index_name, pg_relation_size(indexrelid)::bigint::text AS size_bytes
       FROM pg_stat_user_indexes
      WHERE schemaname = $1 AND indexrelname = ANY($2::text[])
      ORDER BY indexrelname`,
    [schemaName, probes.map((probe) => probe.indexName)],
  );
  assert.equal(sizes.rowCount, probes.length);
  process.stdout.write(`${JSON.stringify({ type: "admin_index_sizes", rows: rowCount, indexes: sizes.rows })}\n`);
});

test("ascending and descending keyset pages are stable without duplicate or missing rows", { skip: !enabled }, async () => {
  const verify = async (direction) => {
    const operator = direction === "ASC" ? ">" : "<";
    const first = await client.query(`SELECT id, created_at FROM users WHERE status='NORMAL' ORDER BY created_at ${direction}, id ${direction} LIMIT 20`);
    assert.equal(first.rowCount, 20);
    const last = first.rows.at(-1);
    const second = await client.query(`SELECT id, created_at FROM users WHERE status='NORMAL' AND (created_at,id) ${operator} ($1,$2) ORDER BY created_at ${direction}, id ${direction} LIMIT 20`, [last.created_at, last.id]);
    const expected = await client.query(`SELECT id FROM users WHERE status='NORMAL' ORDER BY created_at ${direction}, id ${direction} LIMIT 40`);
    const combined = [...first.rows, ...second.rows].map((row) => row.id);
    assert.equal(new Set(combined).size, 40);
    assert.deepEqual(combined, expected.rows.map((row) => row.id));
  };
  await verify("DESC");
  await verify("ASC");
});

async function queryProbes() {
  const cursor = async (table, predicate) => {
    const result = await client.query(`SELECT created_at, id FROM ${table} WHERE ${predicate} ORDER BY created_at DESC, id DESC OFFSET 1000 LIMIT 1`);
    assert.equal(result.rowCount, 1, `missing representative cursor for ${table}`);
    return result.rows[0];
  };
  const usersCursor = await cursor("users", "status='NORMAL'");
  const filesCursor = await cursor("files", "upload_status='VERIFIED' AND moderation_status='PENDING' AND deleted_at IS NULL");
  const operationCursor = await cursor("admin_operation_logs", "true");
  const riskCursor = await cursor("risk_events", "status='OPEN'");
  const securityCursor = await cursor("security_logs", "status='OPEN'");
  return [
    { name: "users_status_keyset", indexName: "users_status_created_id_idx", sql: "SELECT id FROM users WHERE status='NORMAL' AND (created_at,id)<($1,$2) ORDER BY created_at DESC,id DESC LIMIT 21", values: [usersCursor.created_at, usersCursor.id] },
    { name: "files_review_queue_keyset", indexName: "files_admin_queue_created_id_idx", sql: "SELECT id FROM files WHERE upload_status='VERIFIED' AND moderation_status='PENDING' AND deleted_at IS NULL AND (created_at,id)<($1,$2) ORDER BY created_at DESC,id DESC LIMIT 21", values: [filesCursor.created_at, filesCursor.id] },
    { name: "operation_logs_keyset", indexName: "admin_operation_logs_created_id_idx", sql: "SELECT id FROM admin_operation_logs WHERE (created_at,id)<($1,$2) ORDER BY created_at DESC,id DESC LIMIT 21", values: [operationCursor.created_at, operationCursor.id] },
    { name: "risk_status_keyset", indexName: "risk_events_status_created_id_idx", sql: "SELECT id FROM risk_events WHERE status='OPEN' AND (created_at,id)<($1,$2) ORDER BY created_at DESC,id DESC LIMIT 21", values: [riskCursor.created_at, riskCursor.id] },
    { name: "security_status_keyset", indexName: "security_logs_status_created_id_idx", sql: "SELECT id FROM security_logs WHERE status='OPEN' AND (created_at,id)<($1,$2) ORDER BY created_at DESC,id DESC LIMIT 21", values: [securityCursor.created_at, securityCursor.id] },
  ];
}

async function explain(probe) {
  const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${probe.sql}`, probe.values);
  return result.rows[0]["QUERY PLAN"][0];
}

function walkPlans(node, result = []) {
  result.push(node);
  for (const child of node.Plans ?? []) walkPlans(child, result);
  return result;
}

function planIndexes(plan) {
  return walkPlans(plan.Plan).flatMap((node) => typeof node["Index Name"] === "string" ? [node["Index Name"]] : []);
}

function planNodes(plan) {
  return walkPlans(plan.Plan).map((node) => node["Node Type"]);
}

function planSummary(plan) {
  return {
    nodes: planNodes(plan),
    indexes: planIndexes(plan),
    execution_ms: Number(plan["Execution Time"].toFixed(3)),
    shared_hit_blocks: walkPlans(plan.Plan).reduce((sum, node) => sum + (node["Shared Hit Blocks"] ?? 0), 0),
    shared_read_blocks: walkPlans(plan.Plan).reduce((sum, node) => sum + (node["Shared Read Blocks"] ?? 0), 0),
  };
}

async function seedRepresentativeRows() {
  const adminId = randomUUID();
  await client.query("INSERT INTO admin_accounts(id,username,display_name,password_hash) VALUES($1,'performance-admin','性能测试管理员','not-a-login-secret')", [adminId]);
  await client.query(
    `INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask,status,created_at,updated_at)
     SELECT md5('user-'||g)::uuid, 'test-ciphertext', md5('phone-a-'||g)||md5('phone-b-'||g), '138****0000',
            CASE g%3 WHEN 0 THEN 'NORMAL'::user_status WHEN 1 THEN 'DISABLED'::user_status ELSE 'CANCELLED'::user_status END,
            timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second', timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second'
       FROM generate_series(1,$1) g`,
    [rowCount],
  );
  await client.query(
    `INSERT INTO files(id,bucket,object_key,file_type,mime_type,size_bytes,sha256,upload_status,moderation_status,visibility,deleted_at,created_at,updated_at)
     SELECT md5('file-'||g)::uuid, 'test-quarantine', 'pending/performance/'||g, 'PRODUCT_IMAGE', 'image/png', 1024,
            md5('file-a-'||g)||md5('file-b-'||g),
            CASE WHEN g%2=0 THEN 'VERIFIED'::file_upload_status ELSE 'UPLOADED'::file_upload_status END,
            CASE WHEN g%4<2 THEN 'PENDING'::content_moderation_status ELSE 'APPROVED'::content_moderation_status END,
            'PRIVATE', CASE WHEN g%20=0 THEN now() ELSE NULL END,
            timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second', timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second'
       FROM generate_series(1,$1) g`,
    [rowCount],
  );
  await client.query(
    `INSERT INTO admin_operation_logs(id,admin_id,action,target_type,target_id,reason,request_id,ip,user_agent,created_at)
     SELECT md5('operation-'||g)::uuid, $2, 'PERFORMANCE_PROBE', 'USER', md5('target-'||g)::uuid, '本地查询计划测试', 'perf-'||g, '127.0.0.1', 'test',
            timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second'
       FROM generate_series(1,$1) g`,
    [rowCount, adminId],
  );
  await client.query(
    `INSERT INTO risk_events(id,risk_type,severity,target_type,target_id,rule_key,status,created_at,updated_at)
     SELECT md5('risk-'||g)::uuid, 'PERFORMANCE_PROBE', CASE g%4 WHEN 0 THEN 'NORMAL'::support_priority WHEN 1 THEN 'MEDIUM'::support_priority WHEN 2 THEN 'HIGH'::support_priority ELSE 'URGENT'::support_priority END,
            'USER', md5('risk-target-'||g)::uuid, 'local_plan_probe', CASE WHEN g%2=0 THEN 'OPEN'::risk_event_status ELSE 'RESOLVED'::risk_event_status END,
            timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second', timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second'
       FROM generate_series(1,$1) g`,
    [rowCount],
  );
  await client.query(
    `INSERT INTO security_logs(id,event_type,status,risk_score,metadata_json,created_at)
     SELECT md5('security-'||g)::uuid, 'PERFORMANCE_PROBE', CASE WHEN g%2=0 THEN 'OPEN'::security_event_status ELSE 'RESOLVED'::security_event_status END,
            g%101, '{}'::jsonb, timestamptz '2026-01-01 00:00:00+00' + g*interval '1 second'
       FROM generate_series(1,$1) g`,
    [rowCount],
  );
}

async function runMigration(fileName) {
  let source = await readFile(new URL(`../migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await client.query(statement);
}
