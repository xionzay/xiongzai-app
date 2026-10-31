import assert from "node:assert/strict";
import { test } from "node:test";
import { backupChildEnvironment, validateBackupTarget } from "../scripts/backup-local-database.mjs";

test("local backup accepts only explicit local development targets", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(validateBackupTarget(`postgresql://test-only@${host}/xiongzai_api_dev`).pathname, "/xiongzai_api_dev");
  }
});

test("backup subprocess gets only validated connection settings, never ambient libpq overrides", () => {
  const env = backupChildEnvironment(validateBackupTarget("postgresql://test-only@127.0.0.1/xiongzai_api_dev"), "/local/test/lib");
  assert.equal(env.PGHOST, "127.0.0.1");
  assert.equal(env.PGDATABASE, "xiongzai_api_dev");
  assert.equal(env.PGOPTIONS, "-c default_transaction_read_only=on");
  for (const key of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "DATABASE_URL", "TEST_DATABASE_URL", "USER_TOKEN_SECRET"]) {
    assert.equal(key in env, false);
  }
});

test("local backup rejects remote, test, ambiguous and driver-overridden targets without leaking input", () => {
  const cases = [undefined, "invalid-secret-marker", "postgresql://test-only@example.invalid/xiongzai_api_dev", "postgresql://test-only@127.0.0.1/xiongzai_database_test", "postgresql://test-only@127.0.0.1/production", "postgresql://test-only@127.0.0.1/xiongzai_api_dev?host=example.invalid", "postgresql://test-only@127.0.0.1/xiongzai_api_dev#secret-marker", "https://localhost/xiongzai_api_dev"];
  for (const value of cases) {
    assert.throws(() => validateBackupTarget(value), error => /^BACKUP_[A-Z_]+$/u.test(error.message));
  }
});
