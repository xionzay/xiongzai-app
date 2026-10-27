import assert from "node:assert/strict";
import test from "node:test";
import { assertLegacyOrderRules, LEGACY_APPOINTMENT_RULE_VERSION } from "../dist/index.js";

test("legacy rule routing requires an explicit supported execution version", () => {
  assert.doesNotThrow(() => assertLegacyOrderRules({ transactionRuleVersion: LEGACY_APPOINTMENT_RULE_VERSION }));
  for (const transactionRuleVersion of [2, 99, 0, -1, undefined, null, NaN, "1"]) {
    assert.throws(() => assertLegacyOrderRules({ transactionRuleVersion }), {
      code: "ORDER_RULE_VERSION_UNSUPPORTED", statusCode: 409,
    });
  }
});
