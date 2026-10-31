import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createLocalBridge, privateHost } from "../scripts/mobile-local-lan.mjs";

test("local device bridge refuses public/wildcard hosts and impossible private addresses", () => {
  for (const host of ["0.0.0.0", "example.invalid", "8.8.8.8", "192.168.1.256", "172.32.0.1"]) assert.equal(privateHost(host), false);
  for (const host of ["10.0.0.1", "192.168.1.3", "172.16.0.1"]) assert.equal(privateHost(host), true);
  assert.throws(() => createLocalBridge({ host: "0.0.0.0" }));
});
test("API bridge restricts management paths, preserves actual 401 and removes spoofed forwarding headers", async () => {
  let received;
  const upstream = http.createServer((req, res) => { received = req.headers; res.writeHead(401, { "content-type": "application/json" }); res.end('{"code":"AUTH_REQUIRED"}'); });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const bridge = createLocalBridge({ host: "127.0.0.1", port: 0, upstreamPort: upstream.address().port, mode: "api" });
  await new Promise(resolve => bridge.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${bridge.address().port}`;
    assert.equal((await fetch(base + "/admin-api/v1/auth/session")).status, 403);
    assert.equal((await fetch(base + "/api/v1/me", { headers: { "x-forwarded-for": "8.8.8.8", forwarded: "for=8.8.8.8" } })).status, 401);
    assert.equal(received["x-forwarded-for"], undefined); assert.equal(received.forwarded, undefined);
    const spoofed = await new Promise(resolve => { const req = http.get(base + "/api/v1/me", { headers: { host: "attacker.invalid" } }, response => { response.resume(); response.once("end", () => resolve(response.statusCode)); }); req.once("error", () => resolve(0)); });
    assert.equal(spoofed, 403);
  } finally { bridge.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise(resolve => bridge.close(resolve)), new Promise(resolve => upstream.close(resolve))]); }
});
