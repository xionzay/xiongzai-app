import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "../packages/database/node_modules/pg/lib/index.js";
import { readMigrationStatus, validateReadonlyMigrationTarget } from "./migration-status.mjs";

// Read-only physical schema checks; never accepts an external database.
validateReadonlyMigrationTarget(process.env.DATABASE_URL);
const journal=JSON.parse(await readFile(new URL("../packages/database/migrations/meta/_journal.json",import.meta.url),"utf8"));
const last=journal.entries.at(-1);
const snapshot=JSON.parse(await readFile(new URL(`../packages/database/migrations/meta/${String(last.idx).padStart(4,"0")}_snapshot.json`,import.meta.url),"utf8"));
const client=new pg.Client({connectionString:process.env.DATABASE_URL,application_name:"stage-one-schema-readonly"});
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='5s'");
  const columns=(await client.query("SELECT c.relname AS table_name,a.attname AS column_name,a.attnotnull AS not_null,format_type(a.atttypid,a.atttypmod) AS data_type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped")).rows;
  const actual=new Map(columns.map(c=>[`${c.table_name}.${c.column_name}`,c]));
  const expected=Object.values(snapshot.tables).flatMap(t=>Object.values(t.columns).map(c=>({table:t.name,...c})));
  assert.equal(columns.length,expected.length,"Physical column count drift");
  const normalize=t=>t.replace(/^character varying/u,"varchar").replace(/^character\(/u,"char(").replace(/^numeric\((\d+), (\d+)\)$/u,"numeric($1,$2)").replaceAll('"',"");
  for(const col of expected){const found=actual.get(`${col.table}.${col.name}`);assert.ok(found,`Missing schema column ${col.table}.${col.name}`);assert.equal(found.not_null,col.notNull,`Nullability drift ${col.table}.${col.name}`);assert.equal(normalize(found.data_type),normalize(col.type),`Type drift ${col.table}.${col.name}`);}
  const enums=(await client.query("SELECT t.typname AS name,array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' GROUP BY t.typname")).rows;
  assert.equal(enums.length,Object.keys(snapshot.enums).length);
  for(const type of Object.values(snapshot.enums))assert.deepEqual(enums.find(e=>e.name===type.name)?.values,type.values,`Enum drift ${type.name}`);
  const checks=(await client.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c' AND convalidated")).rows.map(r=>r.conname);
  for(const table of Object.values(snapshot.tables))for(const name of Object.keys(table.checkConstraints))assert.ok(checks.includes(name),`Missing check ${name}`);
  const indexes=(await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map(r=>r.indexname);
  for(const table of Object.values(snapshot.tables))for(const name of Object.keys(table.indexes))assert.ok(indexes.includes(name),`Missing index ${name}`);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='stage_one_order_evidence_append_only_guard' AND tgrelid='orders'::regclass AND tgenabled='O'")).rows[0].count,1);
  const status=await readMigrationStatus(process.env.DATABASE_URL);assert.equal(status.current,true);
  console.log(JSON.stringify({physical_schema_checked:true,tables:Object.keys(snapshot.tables).length,columns:columns.length,enums:enums.length,validated_checks:checks.length,indexes:indexes.length,migrations:status.appliedCount,evidence_append_only_guard:true}));
} finally {await client.query("ROLLBACK").catch(()=>undefined);await client.end();}
