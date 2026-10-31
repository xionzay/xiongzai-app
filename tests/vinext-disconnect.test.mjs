import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { sendWebResponse } from "../node_modules/vinext/dist/server/prod-server.js";

// Exercise the installed, formally patched framework, not a copied implementation.
const encodings = ["identity", "gzip", "br"];
async function fixture(run) {
  const results = [], tasks = [];
  const server = http.createServer((req, res) => {
    const task = run(req, res).then(value => results.push({ value }), error => results.push({ error }));
    tasks.push(task);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, results, tasks, async close() {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await Promise.all(tasks);
  } };
}
function request(port, encoding, method = "GET", abort = false) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = http.request({ host: "127.0.0.1", port, method, headers: { "accept-encoding": encoding } }, res => {
      res.on("data", chunk => { chunks.push(chunk); if (abort) { req.destroy(); resolve({ aborted: true }); } });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
      res.on("error", error => abort ? resolve({ aborted: true }) : reject(error));
    });
    req.on("error", error => abort ? resolve({ aborted: true }) : reject(error));
    req.end();
  });
}

for (const encoding of encodings) {
  test(`patched response: ${encoding} normal response remains complete`, async () => {
    const expected = "本地完整流响应".repeat(5000);
    const f = await fixture((req, res) => sendWebResponse(new Response(expected, { headers: { "content-type": "text/html" } }), req, res, true));
    try {
      const result = await request(f.port, encoding);
      const decoded = encoding === "gzip" ? gunzipSync(result.bytes) : encoding === "br" ? brotliDecompressSync(result.bytes) : result.bytes;
      assert.equal(result.status, 200); assert.equal(decoded.toString(), expected);
      await Promise.all(f.tasks); assert.equal(f.results[0].error, undefined);
    } finally { await f.close(); }
  });
  test(`patched response: ${encoding} HEAD cancels once without consuming body`, async () => {
    let cancelled = 0;
    const f = await fixture((req, res) => sendWebResponse(new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-type": "text/html" } }), req, res, true));
    try {
      const result = await request(f.port, encoding, "HEAD");
      assert.equal(result.status, 200); assert.equal(result.bytes.length, 0);
      await Promise.all(f.tasks); assert.equal(cancelled, 1); assert.equal(f.results[0].error, undefined);
    } finally { await f.close(); }
  });
  test(`patched response: ${encoding} disconnect before headers cancels once`, async () => {
    let cancelled = 0, closed = 0;
    let started;
    const entered = new Promise(resolve => { started = resolve; });
    const f = await fixture(async (req, res) => {
      started();
      await new Promise(resolve => res.once("close", () => { closed++; resolve(); }));
      await sendWebResponse(new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-type": "text/html" } }), req, res, true);
    });
    try {
      const req = http.get({ host: "127.0.0.1", port: f.port, headers: { "accept-encoding": encoding } });
      req.on("error", () => { /* Deliberate client abort; server errors are asserted independently. */ });
      await entered; req.destroy(); await Promise.all(f.tasks);
      assert.equal(cancelled, 1); assert.equal(closed, 1); assert.equal(f.results[0].error, undefined);
    } finally { await f.close(); }
  });
  test(`patched response: ${encoding} disconnect after first chunk releases source once`, async () => {
    let cancelled = 0, closed = 0, produced = 0;
    const f = await fixture(async (req, res) => {
      res.once("close", () => { closed++; });
      const body = new ReadableStream({
        async pull(controller) { await delay(10); if (cancelled) return; produced++; controller.enqueue(new Uint8Array(128 * 1024).fill(65)); },
        cancel() { cancelled++; }
      });
      await sendWebResponse(new Response(body, { headers: { "content-type": "text/html" } }), req, res, true);
    });
    try {
      assert.equal((await request(f.port, encoding, "GET", true)).aborted, true);
      await Promise.all(f.tasks); await delay(30);
      assert.equal(cancelled, 1); assert.equal(closed, 1); assert.equal(f.results[0].error, undefined);
      const after = produced; await delay(30); assert.equal(produced, after);
    } finally { await f.close(); }
  });
  test(`patched response: ${encoding} genuine source errors are not swallowed`, async () => {
    const failure = new Error("synthetic_source_failure");
    const f = await fixture(async (req, res) => {
      const body = new ReadableStream({ start(controller) { controller.error(failure); } });
      await sendWebResponse(new Response(body, { headers: { "content-type": "text/html" } }), req, res, true);
    });
    try {
      await assert.rejects(request(f.port, encoding)); await Promise.all(f.tasks);
      assert.equal(f.results[0].error, failure);
    } finally { await f.close(); }
  });
  test(`patched response: ${encoding} disconnect immediately after flushed headers cancels once`, async () => {
    let cancelled = 0;
    const f = await fixture(async (req, res) => {
      res.writeHead(200, { "content-type": "text/html" }); res.flushHeaders();
      await new Promise(resolve => res.once("close", resolve));
      await sendWebResponse(new Response(new ReadableStream({ cancel() { cancelled++; } })), req, res, true);
    });
    try {
      await new Promise((resolve, reject) => {
        const req = http.get({ host: "127.0.0.1", port: f.port, headers: { "accept-encoding": encoding, rsc: "1" } }, res => { assert.equal(res.statusCode, 200); req.destroy(); resolve(); });
        req.on("error", reject);
      });
      await Promise.all(f.tasks); assert.equal(cancelled, 1); assert.equal(f.results[0].error, undefined);
    } finally { await f.close(); }
  });
}
test("patched response exposes cancellation failures even on an already closed destination", async () => {
  const failure = new Error("synthetic_cancel_failure");
  for (const destination of [{ destroyed: true }, { writableEnded: true }]) {
    let cancelled = 0;
    const body = new ReadableStream({ cancel() { cancelled++; throw failure; } });
    await assert.rejects(sendWebResponse(new Response(body), { method: "GET" }, destination, true), error => error === failure);
    assert.equal(cancelled, 1);
  }
});
test("source ERR_STREAM_PREMATURE_CLOSE is a real error, not a fabricated client disconnect", async () => {
  const failure = Object.assign(new Error("synthetic_source_close"), { code: "ERR_STREAM_PREMATURE_CLOSE" });
  const f = await fixture((req, res) => sendWebResponse(new Response(new ReadableStream({ start(controller) { controller.error(failure); } })), req, res, false));
  try { await assert.rejects(request(f.port, "identity")); await Promise.all(f.tasks); assert.equal(f.results[0].error, failure); }
  finally { await f.close(); }
});
