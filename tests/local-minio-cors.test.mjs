import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addLocalTestOrigin, prepareLocalTestCors } from "./browser/helpers/local-minio-cors.mjs";

const xml = readFileSync(new URL("../apps/api/scripts/minio-quarantine-cors.xml", import.meta.url), "utf8");
const origin = "http://127.0.0.1:3101";
test("CORS setup only appends the exact loopback origin and preserves existing rules", () => {
  const next = addLocalTestOrigin(xml, origin);
  assert.equal(next.replace(`<AllowedOrigin>${origin}</AllowedOrigin>`, ""), xml);
  assert.equal(addLocalTestOrigin(next, origin), next);
  for (const value of ["https://example.invalid", "http://192.168.1.1:3101", "http://user:password@127.0.0.1:3101", "http://127.0.0.1:3101/path"]) assert.throws(() => addLocalTestOrigin(xml, value));
  assert.throws(() => addLocalTestOrigin("<CORSConfiguration />", origin));
});
test("CORS restoration is verified and idempotent without deleting buckets or objects", async () => {
  let current = xml; const writes = [];
  const restore = await prepareLocalTestCors({ read: async () => current, write: async value => { current = value; writes.push(value); } }, origin);
  assert.ok(current.includes(origin));
  assert.equal(await restore(), true); assert.equal(await restore(), true);
  assert.equal(current, xml); assert.equal(writes.length, 2);
});
test("CORS restoration refuses to overwrite another task's concurrent configuration", async () => {
  let current = xml;
  const restore = await prepareLocalTestCors({ read: async () => current, write: async value => { current = value; } }, origin);
  current += "<!-- separate task change -->";
  await assert.rejects(restore, /concurrently/);
  assert.ok(current.endsWith("<!-- separate task change -->"));
});
test("CORS setup verification failure restores and verifies the original configuration", async () => {
  let current = xml, reads = 0;
  await assert.rejects(prepareLocalTestCors({ read: async () => { if (++reads === 3) throw new Error("unit network failure"); return current; }, write: async value => { current = value; } }, origin), /original configuration restored/);
  assert.equal(current, xml);
});
test("an uncertain CORS write is read back and rolled back without overwriting unrelated state", async () => {
  let current = xml, writes = 0;
  await assert.rejects(prepareLocalTestCors({ read: async () => current, write: async value => { current = value; if (++writes === 1) throw new Error("unit response timeout after apply"); } }, origin), /original configuration restored/);
  assert.equal(current, xml); assert.equal(writes, 2);
});
