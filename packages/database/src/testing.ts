import { createDatabaseClient, type DatabaseClient } from "./client.js";
import { uuidv7 } from "./ids.js";

export function createTestDatabaseClient(databaseUrl = process.env.TEST_DATABASE_URL): DatabaseClient {
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");
  }
  return createDatabaseClient({
    connectionString: databaseUrl,
    application_name: `xiongzai-database-test-${uuidv7()}`,
    max: 4,
  });
}
