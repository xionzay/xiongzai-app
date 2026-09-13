import assert from "node:assert/strict";
import { test } from "node:test";
import { JsonLogger } from "../packages/observability/dist/index.js";
import { scanLoggerSourceText, scanLoggerSources } from "../scripts/check-sensitive-logs.mjs";

test("static logger scan rejects sensitive fields and accepts approved identifiers", () => {
  assert.equal(scanLoggerSourceText('logger.info("bad", { token: value, object_key: key });').length, 2);
  assert.deepEqual(scanLoggerSourceText('logger.info("ok", { request_id: id, actor_id: actor, error_category: category });'), []);
});

test("service logger call sites contain no prohibited field names", async () => {
  const report = await scanLoggerSources();
  assert.ok(report.loggerCalls > 0);
  assert.deepEqual(report.violations, []);
});

test("structured logger redacts sensitive values recursively", () => {
  const canary = "sensitive-canary-value";
  const lines = [];
  const logger = new JsonLogger("redaction-test", (line) => lines.push(line));
  logger.info("redaction_contract", { password: canary, nested: { authorization: canary, phone: canary }, safe: "visible" });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes(canary), false);
  assert.equal(JSON.parse(lines[0]).safe, "visible");
});
