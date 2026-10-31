import assert from "node:assert/strict";
import test from "node:test";
import { AdminGovernanceService } from "../dist/admin-governance.service.js";
import { cursorTimestamp, cursorTimeValue } from "../dist/cursor-time.js";
import { users, orders, sellerProfiles, products } from "@xiongzai/database";
import { PgDialect } from "drizzle-orm/pg-core";
import { FileStorageService } from "../dist/file-storage.service.js";

test("search never constructs a query for an unreadable module", async () => {
  for (const granted of [[], ["user.read"], ["order.read"], ["seller.read", "product.read"]]) {
    const service = Object.create(AdminGovernanceService.prototype), queried = [];
    service.session = async () => ({ permissions: ["global_search.read", ...granted] });
    const chain = { leftJoin() { return this; }, innerJoin() { return this; }, where() { return this; }, limit() { return []; } };
    service.database = { db: { select() { return { from(table) { queried.push(table); return chain; } }; } } };
    assert.deepEqual(await service.globalSearch({ sub: "synthetic-admin" }, "测试"), []);
    assert.deepEqual(queried, [["user.read", users], ["order.read", orders], ["seller.read", sellerProfiles], ["product.read", products]].filter(([key]) => granted.includes(key)).map(([, table]) => table));
  }
});

test("search without global permission rejects before a business query", async () => {
  const service = Object.create(AdminGovernanceService.prototype);
  service.session = async () => ({ permissions: ["user.read"] });
  service.database = { db: { select() { assert.fail("must not query"); } } };
  await assert.rejects(service.globalSearch({ sub: "synthetic-admin" }, "测试"), error => error.statusCode === 403 || error.code === "ADMIN_PERMISSION_DENIED");
});

test("cancelled status or cancellation marker rejects before any write or success audit", async () => {
  for (const current of [{ status: "CANCELLED", cancelledAt: new Date(), version: 0 }, { status: "NORMAL", cancelledAt: new Date(), version: 0 }]) {
    const service = Object.create(AdminGovernanceService.prototype);
    const chain = { from() { return this; }, where() { return this; }, limit() { return this; }, for() { return [current]; } };
    service.database = { db: { transaction: run => run({ select: () => chain, update: () => assert.fail("must not update") }) } };
    service.audit = () => assert.fail("must not success-audit");
    await assert.rejects(service.setUserStatus({ sub: "synthetic-admin" }, "synthetic-user", { currentStatus: "NORMAL", nextStatus: "NORMAL", version: 0, reason: "隔离测试" }, {}), error => error.code === "USER_CANCELLED");
  }
});

test("product upload rejects current configured size before storage and leaves other policies unchanged", async () => {
  const service=Object.create(FileStorageService.prototype);
  const query={from(){return this;},where(){return this;},orderBy(){return [{key:"product.image_max_bytes",value:{value:2048}}];}};
  service.database={db:{select:()=>query}};service.storage={createUploadRequest(){assert.fail("oversized file must not reach storage");}};
  await assert.rejects(service.requestUserUpload("synthetic-user",{fileType:"PRODUCT_IMAGE",mimeType:"image/png",sizeBytes:2049,sha256:"a".repeat(64)}),error=>error.code==="FILE_SIZE_NOT_ALLOWED");
  const policies=await service.listPolicies();assert.equal(policies.find(policy=>policy.file_type==="PRODUCT_IMAGE").maximum_bytes,2048);assert.equal(policies.find(policy=>policy.file_type==="USER_AVATAR").maximum_bytes,5*1024*1024);
});

test("cursor serialization and bound PostgreSQL comparison retain six fractional digits", () => {
  const value = "2026-08-20T00:00:00.000123Z";
  const date = cursorTimestamp(users.createdAt).decoder.mapFromDriverValue(value);
  assert.equal(date.toISOString(), value);
  assert.equal(JSON.stringify(date), JSON.stringify(value));
  const query = new PgDialect().sqlToQuery(cursorTimeValue(value));
  assert.deepEqual(query.params, [value]); assert.match(query.sql, /::timestamptz/u);
  for (const invalid of ["bad", "1", "2026-08-20", "2026-08-20T00:00:00.000123Z' OR TRUE"]) assert.throws(() => cursorTimeValue(invalid));
});
