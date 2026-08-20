import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as relations from "./relations.js";
import * as tables from "./schema.js";

export const databaseSchema = { ...tables, ...relations };

export type Database = NodePgDatabase<typeof databaseSchema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DatabaseClient {
  db: Database;
  pool: Pool;
  close: () => Promise<void>;
}

export function createDatabaseClient(config: PoolConfig | string): DatabaseClient {
  const pool = new Pool(typeof config === "string" ? { connectionString: config } : config);
  const db = drizzle(pool, { schema: databaseSchema });

  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

export function createDatabaseClientFromEnv(): DatabaseClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the PostgreSQL database client.");
  }

  return createDatabaseClient({
    connectionString: databaseUrl,
    application_name: process.env.DATABASE_APPLICATION_NAME ?? "xiongzai",
    max: readPositiveInteger("DATABASE_MAX_CONNECTIONS", 10),
    idleTimeoutMillis: readPositiveInteger("DATABASE_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: readPositiveInteger("DATABASE_CONNECTION_TIMEOUT_MS", 5_000),
  });
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
