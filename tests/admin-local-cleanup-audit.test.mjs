import assert from "node:assert/strict";
import { test } from "node:test";
import { missingCleanupAuditKeys } from "../scripts/admin-local-cleanup-audit.mjs";

test("cleanup audit reports key names only when local dependencies are missing", () => {
  const missing = missingCleanupAuditKeys({ TEST_DATABASE_URL: "postgresql://127.0.0.1/test" });
  assert.ok(missing.includes("FILE_STORAGE_ENDPOINT"));
  assert.equal(missing.some((key) => key.includes("postgresql://")), false);
});
