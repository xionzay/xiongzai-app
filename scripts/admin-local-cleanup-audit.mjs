import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../packages/database/node_modules/pg/lib/index.js";
import { MinioStorageProvider } from "../apps/api/dist/index.js";

const requiredKeys = [
  "TEST_DATABASE_URL", "FILE_STORAGE_ENDPOINT", "FILE_STORAGE_REGION", "FILE_STORAGE_ACCESS_KEY_ID",
  "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET",
];

export function missingCleanupAuditKeys(environment) {
  return requiredKeys.filter((key) => !environment[key]);
}

export async function auditLocalCleanup(environment = process.env) {
  const missing = missingCleanupAuditKeys(environment);
  if (missing.length) throw new Error(`缺少配置键：${missing.join(", ")}`);
  ensureLoopbackKey("TEST_DATABASE_URL", environment.TEST_DATABASE_URL);
  const referenceDatabaseUrl = environment.DATABASE_URL ?? environment.TEST_DATABASE_URL;
  ensureLoopbackKey(environment.DATABASE_URL ? "DATABASE_URL" : "TEST_DATABASE_URL", referenceDatabaseUrl);
  ensureLoopbackKey("FILE_STORAGE_ENDPOINT", environment.FILE_STORAGE_ENDPOINT);

  const client = new pg.Client({ connectionString: environment.TEST_DATABASE_URL, application_name: "xiongzai-admin-cleanup-readonly-audit" });
  await client.connect();
  let temporarySchemas;
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname LIKE 'xiongzai\\_%' ESCAPE '\\'");
    temporarySchemas = result.rows[0]?.count ?? -1;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }

  const referenceClient = new pg.Client({ connectionString: referenceDatabaseUrl, application_name: "xiongzai-admin-cleanup-reference-audit" });
  await referenceClient.connect();
  const referencedObjects = new Set();
  try {
    await referenceClient.query("BEGIN READ ONLY");
    const result = await referenceClient.query("SELECT bucket, object_key FROM files");
    for (const row of result.rows) referencedObjects.add(`${row.bucket}\0${row.object_key}`);
  } finally {
    await referenceClient.query("ROLLBACK").catch(() => undefined);
    await referenceClient.end();
  }

  const storage = new MinioStorageProvider({
    endpoint: environment.FILE_STORAGE_ENDPOINT,
    region: environment.FILE_STORAGE_REGION,
    accessKeyId: environment.FILE_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: environment.FILE_STORAGE_SECRET_ACCESS_KEY,
  });
  let testObjects = 0;
  for (const bucket of [environment.FILE_PUBLIC_BUCKET, environment.FILE_PRIVATE_BUCKET, environment.FILE_QUARANTINE_BUCKET]) {
    let cursor;
    do {
      const page = await storage.listObjects({ bucket, cursor, limit: 100 });
      testObjects += page.objects.filter((object) => !referencedObjects.has(`${bucket}\0${object.objectKey}`)).length;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  return { temporarySchemas, testObjects };
}

function ensureLoopbackKey(key, value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error(`无效配置键：${key}`); }
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!(hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(hostname))) throw new Error(`必须是本机地址的配置键：${key}`);
}

async function main() {
  const result = await auditLocalCleanup();
  process.stdout.write(`${JSON.stringify({ temporary_schemas: result.temporarySchemas, minio_test_objects: result.testObjects })}\n`);
  if (result.temporarySchemas !== 0 || result.testObjects !== 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "本地测试清理审计失败"}\n`); process.exitCode = 1; });
}
