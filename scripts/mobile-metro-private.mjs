import http from "node:http";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream";
import { pathToFileURL } from "node:url";
import { privateHost } from "./mobile-local-lan.mjs";

// Metro stays on IPv4 loopback even when the computer also has public IPv6.
// This bridge exposes only packager traffic on one explicitly selected private IP.
export function createPrivateMetroBridge({ host, port = 8082, upstreamPort = 8081 }) {
  if (host !== "127.0.0.1" && !privateHost(host)) throw new Error("Invalid local key: MOBILE_LAN_HOST");
  const sockets = new Set();
  const remember = socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); };
  const allowed = (req, upgrade = false) => {
    const expected = `${host}:${port || req.socket.localPort}`;
    const remote = req.socket.remoteAddress?.replace(/^::ffff:/u, "");
    const origin = req.headers.origin;
    if (req.headers.host !== expected || !(privateHost(remote ?? "") || remote === "127.0.0.1") || origin && origin !== `http://${expected}`) return false;
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) return false;
    const pathname = new URL(req.url, "http://local.invalid").pathname;
    return upgrade ? req.method === "GET" && ["/hot", "/message"].includes(pathname) : ["GET", "HEAD"].includes(req.method) &&
      (pathname === "/" || pathname === "/status" || /^(?:\/[^?]*\.bundle|\/assets\/.*|\/node_modules\/.*|\/_expo\/.*)$/u.test(pathname));
  };
  const headers = req => {
    const result = { ...req.headers };
    for (const key of Object.keys(result)) if (key === "forwarded" || key.startsWith("x-forwarded-") || ["authorization", "cookie"].includes(key)) delete result[key];
    return result;
  };
  const server = http.createServer((req, res) => {
    if (!allowed(req)) { res.writeHead(403, { "cache-control": "no-store" }); res.end("LOCAL_METRO_FORBIDDEN"); return; }
    const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, method: req.method, path: req.url, headers: headers(req) }, incoming => {
      res.writeHead(incoming.statusCode ?? 502, { ...incoming.headers, "cache-control": "no-store" });
      res.once("close", () => incoming.destroy());
      pipeline(incoming, res, () => upstream.destroy());
    });
    upstream.setTimeout(120_000, () => upstream.destroy(new Error("local_metro_timeout")));
    upstream.once("error", () => { if (!res.headersSent) { res.writeHead(502); res.end("LOCAL_METRO_UNAVAILABLE"); } else res.destroy(); });
    res.once("close", () => upstream.destroy());
    req.once("aborted", () => upstream.destroy());
    upstream.end();
  });
  server.on("connection", remember);
  server.on("upgrade", (req, socket, head) => {
    if (!allowed(req, true)) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    const upstream = net.connect({ host: "127.0.0.1", port: upstreamPort }); remember(upstream);
    upstream.once("connect", () => {
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers(req)).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.once("error", () => socket.destroy()); socket.once("error", () => upstream.destroy());
    socket.once("close", () => upstream.destroy()); upstream.once("close", () => socket.destroy());
  });
  server.closeBridge = async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); };
  return server;
}

export async function startPrivateMetro(host) {
  if (!privateHost(host) || !Object.values(networkInterfaces()).flat().some(item => item?.address === host && !item.internal)) throw new Error("Invalid local key: MOBILE_LAN_HOST");
  // Refuse port conflicts; never stop or reuse an unknown Metro process.
  for (const [address, port] of [["127.0.0.1", 8081], [host, 8082]]) await new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.once("error", () => reject(new Error("Local Metro port unavailable"))); probe.listen(port, address, () => probe.close(resolve));
  });
  const bridge = createPrivateMetroBridge({ host });
  await new Promise((resolve, reject) => { bridge.once("error", reject); bridge.listen(8082, host, resolve); });
  const child = spawn(process.execPath, ["node_modules/expo/bin/cli", "start", "--dev-client", "--host", "localhost", "--port", "8081"], {
    cwd: new URL("../apps/mobile/", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1", NODE_OPTIONS: "--dns-result-order=ipv4first", EXPO_OFFLINE: "1", EXPO_NO_TELEMETRY: "1", EXPO_NO_DOCTOR: "1", EXPO_NO_DEPENDENCY_VALIDATION: "1", EXPO_NO_DOTENV: "1",
      EXPO_PUBLIC_APP_ENV: "test", EXPO_PUBLIC_ENABLE_MOCK_PAYMENT: "true", EXPO_PUBLIC_API_BASE_URL: `http://${host}:3003/api/v1`, EXPO_PACKAGER_PROXY_URL: `http://${host}:8082` }
  });
  // No raw Metro logs (bundles/errors can contain runtime URLs or credentials).
  let diagnostics = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { diagnostics = (diagnostics + String(chunk)).slice(-2_000_000); });
  console.log(`私网开发客户端：http://${host}:8082；Metro 仅回环 127.0.0.1:8081；请仅在可信本地 Wi-Fi 使用。`);
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    child.kill("SIGTERM"); await bridge.closeBridge();
    await Promise.race([new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); }), new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  };
  child.once("error", () => { console.error("LOCAL_METRO_START_FAILED"); process.exitCode = 1; void close(); });
  child.once("exit", code => { if (!closing) { console.error("LOCAL_METRO_STOPPED"); process.exitCode = code || 1; void close(); } });
  return { close, child, bridge, diagnostics: () => diagnostics };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const stack = await startPrivateMetro(process.argv[process.argv.indexOf("--host") + 1]);
    process.once("SIGINT", () => void stack.close()); process.once("SIGTERM", () => void stack.close());
  } catch { console.error("LOCAL_METRO_START_FAILED: check MOBILE_LAN_HOST and local ports"); process.exitCode = 1; }
}
