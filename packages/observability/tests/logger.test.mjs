import assert from "node:assert/strict";
import test from "node:test";
import { JsonLogger, requestContext } from "../dist/index.js";

test("structured logs include request context and redact secrets", () => {
  const lines = [];
  const logger = new JsonLogger("api", (line) => lines.push(line));
  requestContext.run({ requestId: "req-1", traceId: "trace-1" }, () => {
    logger.info("handled", { amount: 12n, authorization: "Bearer private", nested: { phone: "13800000000", sms_code: "246810", legal_name: "张三" } });
    logger.error("failed", { error: new Error("手机号 13800000000 验证失败") });
  });
  const log = JSON.parse(lines[0]);
  assert.equal(log.service, "api");
  assert.equal(log.request_id, "req-1");
  assert.equal(log.trace_id, "trace-1");
  assert.equal(log.amount, "12");
  assert.equal(log.authorization, "[REDACTED]");
  assert.equal(log.nested.phone, "[REDACTED]");
  assert.equal(log.nested.sms_code, "[REDACTED]");
  assert.equal(log.nested.legal_name, "[REDACTED]");
  assert.equal(lines[1].includes("13800000000"), false);
});
