import assert from "node:assert/strict";
import { test } from "node:test";
import { sellerBusinessPeriod } from "../dist/seller-business-period.js";

test("seller statistics use Beijing midnight, Monday weeks and calendar boundaries", () => {
  const now = new Date("2026-03-01T16:00:00.001Z"); // Monday March 2 in Beijing
  for (const [period, start, end] of [
    ["TODAY", "2026-03-01T16:00:00.000Z", now.toISOString()],
    ["YESTERDAY", "2026-02-28T16:00:00.000Z", "2026-03-01T16:00:00.000Z"],
    ["WEEK", "2026-03-01T16:00:00.000Z", now.toISOString()],
    ["MONTH", "2026-02-28T16:00:00.000Z", now.toISOString()],
    ["YEAR", "2025-12-31T16:00:00.000Z", now.toISOString()],
    ["ALL", null, now.toISOString()],
  ]) {
    const range = sellerBusinessPeriod(period, now);
    assert.equal(range.start?.toISOString() ?? null, start);
    assert.equal(range.end.toISOString(), end);
  }
  assert.equal(sellerBusinessPeriod("WEEK", new Date("2026-03-01T15:59:59Z")).start.toISOString(), "2026-02-22T16:00:00.000Z");
  assert.equal(sellerBusinessPeriod("YESTERDAY", new Date("2024-03-01T00:00:00Z")).start.toISOString(), "2024-02-28T16:00:00.000Z");
});
