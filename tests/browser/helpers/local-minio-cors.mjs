import { createHash } from "node:crypto";

function localOrigin(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error("Local CORS test origin is invalid: ADMIN_E2E_FRONTEND_ORIGIN"); }
  if (url.protocol !== "http:" || !/^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/u.test(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Local CORS test origin is invalid: ADMIN_E2E_FRONTEND_ORIGIN");
  return url.origin;
}

/** Add exactly one local test origin to existing PUT rules, preserving every other setting. */
export function addLocalTestOrigin(xml, value) {
  const origin = localOrigin(value);
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<CORSConfiguration\b/u.test(xml)) throw new Error("Local MinIO test requires an existing CORS configuration");
  let found = false;
  const next = xml.replace(/<CORSRule\b[^>]*>[\s\S]*?<\/CORSRule>/gu, rule => {
    if (!/<AllowedMethod>PUT<\/AllowedMethod>/u.test(rule)) return rule;
    found = true;
    if (rule.includes(`<AllowedOrigin>${origin}</AllowedOrigin>`) || rule.includes("<AllowedOrigin>*</AllowedOrigin>")) return rule;
    return rule.replace("</CORSRule>", `<AllowedOrigin>${origin}</AllowedOrigin></CORSRule>`);
  });
  if (!found) throw new Error("Local MinIO test requires an existing PUT CORS rule");
  return next;
}

/** Configuration changes are test-only, reversible and guarded against concurrent overwrites. */
export async function prepareLocalTestCors(client, origin) {
  localOrigin(origin);
  const original = await client.read();
  const next = addLocalTestOrigin(original, origin);
  if (next === original) return async () => { if (await client.read() !== original) throw new Error("Local MinIO CORS changed concurrently"); return true; };
  if (await client.read() !== original) throw new Error("Local MinIO CORS changed concurrently before test setup");
  let applied;
  try { await client.write(next); applied = await client.read(); if (corsSignature(applied) !== corsSignature(next)) throw new Error("Local MinIO CORS setup verification failed"); }
  catch {
    const current = await client.read();
    if (current !== original && corsSignature(current) !== corsSignature(next)) throw new Error("Local MinIO CORS changed concurrently; refusing uncertain setup rollback");
    await client.write(original);
    if (await client.read() !== original) throw new Error("Local MinIO CORS restoration verification failed");
    throw new Error("Local MinIO test CORS verification failed; original configuration restored");
  }
  let restored = false;
  return async () => {
    if (restored) return true;
    if (await client.read() !== applied) throw new Error("Local MinIO CORS changed concurrently; refusing to overwrite it");
    await client.write(original);
    if (await client.read() !== original) throw new Error("Local MinIO CORS restoration verification failed");
    restored = true;
    return true;
  };
}

function corsSignature(xml) {
  const names = new Set(["AllowedOrigin", "AllowedMethod", "AllowedHeader", "ExposeHeader", "MaxAgeSeconds", "ID"]);
  const rules = [...xml.matchAll(/<CORSRule\b[^>]*>([\s\S]*?)<\/CORSRule>/gu)].map(([, rule]) => {
    const values = [];
    const remainder = rule.replace(/<([A-Za-z]+)>([\s\S]*?)<\/\1>/gu, (_, name, value) => {
      if (!names.has(name)) throw new Error("Unsupported local MinIO CORS structure");
      values.push([name, value]); return "";
    });
    if (remainder.trim()) throw new Error("Unsupported local MinIO CORS structure");
    return values.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  });
  if (!rules.length) throw new Error("Unsupported local MinIO CORS structure");
  return JSON.stringify(rules);
}

/** Reuse the workspace's SigV4 signer; never print or persist signed URLs or credentials. */
export function localMinioCorsClient(storage, bucket) {
  const send = async (method, body) => {
    const headers = body === undefined ? {} : { "content-type": "application/xml", "content-md5": createHash("md5").update(body).digest("base64") };
    // Test coupling is deliberate: the existing signer is not a public administrator operation.
    const url = new URL(storage.presign(method, { bucket, objectKey: "" }, 60, headers, { cors: "" }));
    if (url.protocol !== "http:" || !/^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/u.test(url.hostname)) throw new Error("Local MinIO CORS requires a loopback FILE_STORAGE_ENDPOINT");
    const response = await fetch(url, { method, headers, ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) { const code = (await response.text()).match(/<Code>([A-Za-z]+)<\/Code>/u)?.[1] ?? "UNKNOWN"; throw new Error(`Local MinIO CORS ${method} failed (${response.status}, ${code}); check FILE_QUARANTINE_BUCKET`); }
    return response.text();
  };
  return { read: () => send("GET"), write: body => send("PUT", body) };
}
