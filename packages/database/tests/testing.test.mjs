import assert from "node:assert/strict";
import { test } from "node:test";
import { validateLocalTestDatabaseUrl } from "../dist/testing.js";

test("local PostgreSQL test URL must be isolated and clearly named", () => {
  const testUrl = "postgresql://test_user:test_password@127.0.0.1:5432/xiongzai_database_test";
  const developmentUrl = "postgresql://app_user:app_password@127.0.0.1:5432/xiongzai_api_dev";
  assert.equal(validateLocalTestDatabaseUrl(testUrl, developmentUrl), testUrl);

  assert.throws(
    () => validateLocalTestDatabaseUrl(developmentUrl),
    /database name must contain 'test'/,
  );
  assert.throws(
    () => validateLocalTestDatabaseUrl(testUrl, "postgresql://other:secret@127.0.0.1/xiongzai_database_test"),
    /independent from DATABASE_URL/,
  );
  assert.throws(
    () => validateLocalTestDatabaseUrl("postgresql://test_user:secret@db.example.com/xiongzai_test"),
    /local PostgreSQL host/,
  );
});
