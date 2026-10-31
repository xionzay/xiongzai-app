import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { createPrivateMetroBridge } from "../scripts/mobile-metro-private.mjs";

test("private Metro bridge rejects wildcard/public interfaces", () => {
  for (const host of ["0.0.0.0", "::", "8.8.8.8", "2001:db8::1"]) assert.throws(() => createPrivateMetroBridge({ host }));
});
test("private Metro bridge streams bundle/manifest, blocks management, credentials and cross-origin traffic", async () => {
  let headers;
  const upstream = http.createServer((req, res) => { headers = req.headers; res.end("local-packager-data"); });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const bridge = createPrivateMetroBridge({ host: "127.0.0.1", port: 0, upstreamPort: upstream.address().port });
  await new Promise(resolve => bridge.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${bridge.address().port}`;
  try {
    for (const path of ["/", "/status", "/node_modules/expo-router/entry.bundle?platform=ios"]) {
      const result = await fetch(base + path, { headers: { authorization: "synthetic-local-only", cookie: "synthetic=local", "x-forwarded-for": "8.8.8.8" } });
      assert.equal(result.status, 200); assert.equal(await result.text(), "local-packager-data");
      assert.equal(result.headers.get("cache-control"), "no-store");
      assert.equal(headers.authorization, undefined); assert.equal(headers.cookie, undefined); assert.equal(headers["x-forwarded-for"], undefined);
    }
    for (const path of ["/admin-api/v1/auth/session", "/api/v1/me", "/inspector/debug", "//attacker.invalid/"]) assert.equal((await fetch(base + path)).status, 403);
    assert.equal((await fetch(base + "/", { method: "POST" })).status, 403);
    assert.equal((await fetch(base + "/", { headers: { origin: "https://attacker.invalid" } })).status, 403);
    const wrongHost = await new Promise(resolve => { http.get(base + "/", { headers: { host: "attacker.invalid" } }, res => { res.resume(); res.once("end", () => resolve(res.statusCode)); }); });
    assert.equal(wrongHost, 403);
  } finally { await bridge.closeBridge(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
});
test("private Metro hot-reload upgrade retains bidirectional transport and shutdown closes sockets", async () => {
  const upstream = http.createServer();
  const peers = new Set();
  upstream.on("upgrade", (_req, socket) => { peers.add(socket); socket.once("close", () => peers.delete(socket)); socket.on("end", () => socket.end()); socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"); socket.on("data", bytes => socket.write(bytes)); });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const bridge = createPrivateMetroBridge({ host: "127.0.0.1", port: 0, upstreamPort: upstream.address().port });
  await new Promise(resolve => bridge.listen(0, "127.0.0.1", resolve));
  let socket;
  try {
    const port = bridge.address().port;
    const result = await new Promise((resolve, reject) => {
      socket = net.connect({ host: "127.0.0.1", port }); let received = "", sent = false;
      socket.on("connect", () => socket.write(`GET /hot HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`));
      socket.on("error", reject); socket.on("data", bytes => { received += bytes.toString(); if (!sent && received.includes("101 Switching")) { sent = true; socket.write("synthetic-hot-reload"); } if (received.includes("synthetic-hot-reload")) resolve(received); });
    });
    assert.match(result, /101 Switching/);
    const closed = new Promise(resolve => socket.once("close", resolve)); await bridge.closeBridge(); await closed; assert.equal(socket.destroyed, true);
  } finally { socket?.destroy(); if (bridge.listening) await bridge.closeBridge(); for (const peer of peers) peer.destroy(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
});
