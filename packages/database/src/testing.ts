import { createDatabaseClient, type DatabaseClient } from "./client.js";
import { uuidv7 } from "./ids.js";

const LOCAL_TEST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validateLocalTestDatabaseUrl(
  databaseUrl: string,
  applicationUrl = process.env.DATABASE_URL,
): string {
  let testUrl: URL;
  try {
    testUrl = new URL(databaseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(testUrl.protocol)) {
    throw new Error("TEST_DATABASE_URL must use the postgres or postgresql protocol.");
  }
  if (!LOCAL_TEST_HOSTS.has(testUrl.hostname)) {
    throw new Error("TEST_DATABASE_URL must point to a local PostgreSQL host.");
  }

  const testDatabaseName = decodeURIComponent(testUrl.pathname.slice(1));
  if (!testDatabaseName || !testDatabaseName.toLowerCase().includes("test")) {
    throw new Error("TEST_DATABASE_URL database name must contain 'test'.");
  }

  if (applicationUrl) {
    let appUrl: URL;
    try {
      appUrl = new URL(applicationUrl);
    } catch {
      throw new Error("DATABASE_URL must be a valid PostgreSQL URL when validating the test database.");
    }
    const sameServer = appUrl.hostname === testUrl.hostname && effectivePort(appUrl) === effectivePort(testUrl);
    const appDatabaseName = decodeURIComponent(appUrl.pathname.slice(1));
    if (sameServer && appDatabaseName === testDatabaseName) {
      throw new Error("TEST_DATABASE_URL must use a database independent from DATABASE_URL.");
    }
  }

  return databaseUrl;
}

export function createTestDatabaseClient(databaseUrl = process.env.TEST_DATABASE_URL): DatabaseClient {
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");
  }
  const validatedDatabaseUrl = validateLocalTestDatabaseUrl(databaseUrl);
  return createDatabaseClient({
    connectionString: validatedDatabaseUrl,
    application_name: `xiongzai-database-test-${uuidv7()}`,
    max: 4,
  });
}

function effectivePort(url: URL): string {
  return url.port || "5432";
}
