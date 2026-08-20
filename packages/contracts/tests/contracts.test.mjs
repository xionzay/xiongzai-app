import assert from "node:assert/strict";
import test from "node:test";
import { AppError, decodeCursor, encodeCursor, normalizePageSize, stringifyApiJson } from "../dist/index.js";

test("serializes bigint money as decimal strings and dates as UTC ISO strings", () => {
  const serialized = stringifyApiJson({ amount_cent: 9_007_199_254_740_993n, at: new Date("2026-08-20T12:00:00-07:00") });
  assert.equal(serialized, '{"amount_cent":"9007199254740993","at":"2026-08-20T19:00:00.000Z"}');
});

test("signed cursor round-trips and rejects tampering", () => {
  const secret = "cursor-test-secret-that-is-at-least-32-bytes";
  const cursor = encodeCursor({ sort_value: "2026-08-20T00:00:00.000Z", id: "01912345-0000-7000-8000-000000000001" }, secret);
  assert.equal(decodeCursor(cursor, secret).id, "01912345-0000-7000-8000-000000000001");
  assert.throws(() => decodeCursor(`${cursor}x`, secret), AppError);
});

test("page size is bounded", () => {
  assert.equal(normalizePageSize(undefined), 20);
  assert.equal(normalizePageSize("50"), 50);
  assert.throws(() => normalizePageSize(101), AppError);
});
