import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
export function createDatabase(connectionString:string) {
  const pool=new Pool({connectionString,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
  return {pool,db:drizzle(pool)};
}
export type Database=ReturnType<typeof createDatabase>['db'];
