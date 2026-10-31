import http from "node:http";
import { pipeline } from "node:stream";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";

export function privateHost(value) {
  return /^(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/u.test(value) && value.split(".").every(part => Number(part) <= 255);
}

/** Local-only streaming bridge. Signed Host and request target remain byte-for-byte intact. */
export function createLocalBridge({ host, port, upstreamPort, mode, buckets }) {
  if (!privateHost(host) && host !== "127.0.0.1") throw new Error("Invalid local key: MOBILE_LAN_HOST");
  return http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", "http://local.invalid");
    const expectedHost = `${host}:${port || res.socket.localPort}`;
    const bucket = target.pathname.split("/")[1];
    const signed = target.searchParams.has("X-Amz-Signature");
    const allowed = (req.url ?? "").startsWith("/") && !(req.url ?? "").startsWith("//") && (mode === "api" ? target.pathname.startsWith("/api/v1/") || (req.method === "GET" && ["/health/live", "/health/ready"].includes(target.pathname)) :
      ["GET", "HEAD", "PUT"].includes(req.method) && buckets.includes(bucket) && (signed || (bucket === buckets[0] && req.method === "GET")));
    if (req.headers.host !== expectedHost || !allowed) { res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" }); res.end('{"code":"LOCAL_BRIDGE_FORBIDDEN"}'); return; }
    const headers = { ...req.headers };
    for (const key of Object.keys(headers)) if (key === "forwarded" || key.startsWith("x-forwarded-")) delete headers[key];
    // Never log URLs, bodies, credentials or storage paths.
    const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers }, incoming => {
      res.writeHead(incoming.statusCode ?? 502, { ...incoming.headers, "cache-control": "no-store, private", "x-content-type-options": "nosniff" });
      res.once("close", () => incoming.destroy());
      pipeline(incoming, res, () => { upstream.destroy(); });
    });
    upstream.setTimeout(30_000, () => upstream.destroy(new Error("local_bridge_timeout")));
    upstream.on("error", () => { if (!res.headersSent) { res.writeHead(502, { "content-type": "application/json", "cache-control": "no-store" }); res.end('{"code":"LOCAL_BRIDGE_UNAVAILABLE"}'); } else res.destroy(); });
    req.once("aborted", () => upstream.destroy());
    res.once("close", () => upstream.destroy());
    pipeline(req, upstream, () => { if (req.aborted) upstream.destroy(); });
  });
}

export async function startLocalLan(host) {
  if (!privateHost(host) || !Object.values(networkInterfaces()).flat().some(item => item?.address === host && !item.internal)) throw new Error("Invalid local key: MOBILE_LAN_HOST");
  for (const key of ["DATABASE_URL", "TEST_DATABASE_URL", "FILE_STORAGE_ENDPOINT"]) {
    if (!process.env[key]) throw new Error("Missing local key: " + key);
    const endpoint = new URL(process.env[key]);
    if (!/^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/u.test(endpoint.hostname)) throw new Error("Invalid local key: " + key);
  }
  const { createApiApp, loadApiConfig } = await import("../apps/api/dist/index.js");
  // Share the existing local manual-test dataset with Web/admin. Automated tests keep
  // using isolated schemas in TEST_DATABASE_URL; its public schema is not an app dataset.
  const config = loadApiConfig({ ...process.env, DEPLOYMENT_ENV: "test", NODE_ENV: "test",
    API_HOST: "127.0.0.1", API_PORT: "3002", FILE_STORAGE_CLIENT_ENDPOINT: `http://${host}:9002`,
    PUBLIC_ASSET_BASE_URL: `http://${host}:9002`, SMS_PROVIDER_MODE: "development", PAYMENT_PROVIDER_MODE: "mock", PAYOUT_PROVIDER_MODE: "mock" });
  if (config.fileStorageProvider !== "minio") throw new Error("Invalid local key: FILE_STORAGE_PROVIDER");
  const app = await createApiApp({ config });
  const servers = [];
  try {
    await app.listen({ host: "127.0.0.1", port: 3002 });
    for (const [port, upstreamPort, mode] of [[3003, 3002, "api"], [9002, new URL(config.fileStorageEndpoint).port || 80, "media"]]) {
      const server = createLocalBridge({ host, port, upstreamPort, mode, buckets: [config.filePublicBucket, config.filePrivateBucket, config.fileQuarantineBucket] });
      servers.push(server); await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
    }
    console.log(`本地手机 API：http://${host}:3003/api/v1；媒体签名地址由服务端生成。PostgreSQL、MinIO、管理 API 保持回环监听。`);
    console.log("临时配置仅存在当前进程；Ctrl+C 关闭代理并恢复默认启动配置，无需修改 env 文件。");
  } catch (error) { for (const server of servers) server.close(); await app.close(); throw error; }
  const close = async () => { for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await app.close(); };
  return { close, app, servers };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.argv[process.argv.indexOf("--host") + 1];
  try { const stack = await startLocalLan(host); let closing = false; const close = async () => { if (closing) return; closing = true; await stack.close(); process.exit(0); }; process.once("SIGINT", close); process.once("SIGTERM", close); }
  catch (error) { console.error(/^Invalid (?:local|API)|^Missing local/.test(error?.message ?? "") ? error.message : "本地手机服务启动失败；检查本机端口、构建产物和本地依赖，不输出敏感配置。"); process.exitCode = 1; }
}
