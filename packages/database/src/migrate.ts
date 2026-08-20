import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDatabaseClientFromEnv } from "./client.js";

const client = createDatabaseClientFromEnv();

try {
  await migrate(client.db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
} finally {
  await client.close();
}
