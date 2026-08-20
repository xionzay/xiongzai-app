import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** Isolated D1 example helper. Production transaction code uses PostgreSQL. */
export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. This helper is only for the examples/d1 sample.",
    );
  }

  return drizzle(env.DB, { schema });
}
