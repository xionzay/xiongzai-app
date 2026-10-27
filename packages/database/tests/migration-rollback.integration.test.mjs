import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { validateLocalTestDatabaseUrl } from "../dist/testing.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("0009 local admin completion migration has a working isolated rollback", { skip: !databaseUrl }, async () => {
  const schemaName = `xiongzai_rollback_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: validateLocalTestDatabaseUrl(databaseUrl) });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await runForward(client, schemaName, "0000_initial_schema.sql");
    await runForward(client, schemaName, "0009_clear_rhodey.sql");

    const before = await columns(client, schemaName);
    assert.ok(before.includes("reviews.deleted_at"));
    assert.ok(before.includes("withdrawals.initial_review_admin_id"));

    const rollback = await readFile(new URL("../migrations/rollback/0009_clear_rhodey.down.sql", import.meta.url), "utf8");
    await client.query(rollback);

    const after = await columns(client, schemaName);
    assert.equal(after.includes("reviews.deleted_at"), false);
    assert.equal(after.includes("withdrawals.initial_review_admin_id"), false);
    const permissions = await client.query("SELECT permission_key FROM permissions WHERE permission_key IN ('finance.export', 'withdrawal.review.initial', 'withdrawal.review.final')");
    assert.equal(permissions.rowCount, 0);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  }
});

async function runForward(client, schemaName, fileName) {
  let source = await readFile(new URL(`../migrations/${fileName}`, import.meta.url), "utf8");
  source = source.replaceAll('"public".', `"${schemaName}".`);
  for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await client.query(statement);
}

async function columns(client, schemaName) {
  const result = await client.query(
    "SELECT table_name || '.' || column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('reviews', 'withdrawals')",
    [schemaName],
  );
  return result.rows.map((row) => row.name);
}

test("order execution version upgrade preserves history and rollback refuses nonlegacy orders", { skip: !databaseUrl }, async () => {
  const schemaName = `xiongzai_rules_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: validateLocalTestDatabaseUrl(databaseUrl) });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await runForward(client, schemaName, "0000_initial_schema.sql");
    await runForward(client, schemaName, "0001_core_invariants.sql");
    const [buyer, sellerUser, seller, product, sku, order] = Array.from({ length: 6 }, () => randomUUID());
    await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'cipher','buyer-hash','138****0001'),($2,'cipher','seller-hash','138****0002')", [buyer, sellerUser]);
    await client.query("INSERT INTO seller_profiles(id,user_id,seller_nickname) VALUES($1,$2,'历史卖家')", [seller, sellerUser]);
    await client.query("INSERT INTO products(id,seller_id,title,description,min_price_cent) VALUES($1,$2,'历史商品','快照不能改变',10000)", [product, seller]);
    await client.query("INSERT INTO product_skus(id,product_id,sku_name,price_cent,duration_minutes) VALUES($1,$2,'历史规格',10000,60)", [sku, product]);
    await client.query(`INSERT INTO orders(id,order_no,buyer_id,seller_user_id,seller_id,product_id,sku_id,
      product_title_snapshot,product_image_snapshot,product_description_snapshot,seller_name_snapshot,
      sku_name_snapshot,sku_price_cent_snapshot,sku_duration_minutes_snapshot,quantity,total_amount_cent,
      payable_amount_cent,commission_rate_bps_snapshot,platform_fee_cent,seller_income_cent,
      service_starts_at,service_ends_at,expires_at)
      VALUES($1,'HISTORY-1',$2,$3,$4,$5,$6,'历史商品','','快照不能改变','历史卖家','历史规格',10000,60,1,
      10000,10000,1000,1000,9000,now()+interval '1 day',now()+interval '1 day 1 hour',now()+interval '15 minutes')`,
    [order, buyer, sellerUser, seller, product, sku]);
    const before = (await client.query("SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1", [order])).rows[0].row;
    await runForward(client, schemaName, "0010_order_rule_versions.sql");
    const after = (await client.query("SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1", [order])).rows[0].row;
    assert.equal(after.transaction_rule_version, 1);
    delete after.transaction_rule_version;
    assert.deepEqual(after, before);
    await assert.rejects(client.query("UPDATE orders SET transaction_rule_version=2 WHERE id=$1", [order]), /rule version is immutable/);
    const futureId = randomUUID();
    await assert.rejects(client.query("INSERT INTO orders SELECT (jsonb_populate_record(NULL::orders,to_jsonb(o)||$2::jsonb)).* FROM orders o WHERE id=$1", [order, JSON.stringify({ id: futureId, order_no: "FUTURE-1", transaction_rule_version: 0 })]), /orders_rule_version_positive/);
    await client.query("INSERT INTO orders SELECT (jsonb_populate_record(NULL::orders,to_jsonb(o)||$2::jsonb)).* FROM orders o WHERE id=$1", [order, JSON.stringify({ id: futureId, order_no: "FUTURE-1", transaction_rule_version: 2 })]);
    const rollback = await readFile(new URL("../migrations/rollback/0010_order_rule_versions.down.sql", import.meta.url), "utf8");
    await assert.rejects(client.query(rollback), /nonlegacy orders exist/);
    await client.query("ROLLBACK");
    const preserved = await client.query("SELECT transaction_rule_version FROM orders WHERE id=$1", [futureId]);
    assert.equal(preserved.rows[0].transaction_rule_version, 2);
    await assert.rejects(client.query("UPDATE orders SET transaction_rule_version=1 WHERE id=$1", [futureId]), /rule version is immutable/);
    // Remove only this isolated synthetic fixture to exercise the legacy-only rollback.
    await client.query("DELETE FROM orders WHERE id=$1", [futureId]);
    await client.query(rollback);
    const rolledBack = (await client.query("SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1", [order])).rows[0].row;
    assert.deepEqual(rolledBack, before);
    await runForward(client, schemaName, "0010_order_rule_versions.sql");
    assert.equal((await client.query("SELECT transaction_rule_version FROM orders WHERE id=$1", [order])).rows[0].transaction_rule_version, 1);
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  }
});

test("service catalog expansion preserves legacy data and refuses lossy rollback", { skip: !databaseUrl }, async () => {
  const schemaName = `xiongzai_catalog_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: validateLocalTestDatabaseUrl(databaseUrl) });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await runForward(client, schemaName, "0000_initial_schema.sql");
    const [user, seller, product, sku] = Array.from({ length: 4 }, () => randomUUID());
    await client.query("INSERT INTO users(id,phone_ciphertext,phone_hash,phone_mask) VALUES($1,'cipher','catalog-hash','138****0001')", [user]);
    await client.query("INSERT INTO seller_profiles(id,user_id,seller_nickname) VALUES($1,$2,'历史陪玩')", [seller, user]);
    await client.query("INSERT INTO products(id,seller_id,title,description) VALUES($1,$2,'历史服务','保留服务详情')", [product, seller]);
    await client.query("INSERT INTO product_skus(id,product_id,sku_name,price_cent,duration_minutes) VALUES($1,$2,'历史规格',2500,45)", [sku, product]);
    const before = (await client.query("SELECT to_jsonb(p) AS row FROM products p WHERE id=$1", [product])).rows[0].row;
    await runForward(client, schemaName, "0011_service_categories.sql");
    const after = (await client.query("SELECT to_jsonb(p) AS row FROM products p WHERE id=$1", [product])).rows[0].row;
    assert.equal(after.category_id, null); assert.equal(after.category_snapshot, null); assert.deepEqual(after.attributes, {});
    delete after.category_id; delete after.category_snapshot; delete after.attributes; assert.deepEqual(after, before);
    const legacySku = (await client.query("SELECT billing_unit,unit_count,duration_minutes FROM product_skus WHERE id=$1", [sku])).rows[0];
    assert.deepEqual(legacySku, { billing_unit: "SESSION", unit_count: 1, duration_minutes: 45 });
    await assert.rejects(client.query("UPDATE product_skus SET billing_unit='HOUR',unit_count=2 WHERE id=$1", [sku]), /product_skus_billing_valid/);
    const category = randomUUID();
    await client.query("INSERT INTO service_categories(id,name) VALUES($1,'指导')", [category]);
    const rollback = await readFile(new URL("../migrations/rollback/0011_service_categories.down.sql", import.meta.url), "utf8");
    await assert.rejects(client.query(rollback), /new catalog facts exist/);
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT name FROM service_categories WHERE id=$1", [category])).rows[0].name, "指导");
    await client.query("DELETE FROM service_categories WHERE id=$1", [category]); // Isolated test fixture only.
    await client.query(rollback);
    assert.equal((await client.query("SELECT to_jsonb(p) AS row FROM products p WHERE id=$1", [product])).rows[0].row.title, before.title);
    await runForward(client, schemaName, "0011_service_categories.sql");
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  }
});
