import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { observeProcessExit, stopTestProcess, waitForLocalHttp, waitForTestExit } from "../scripts/production-test-process.mjs";

function childProcess() {
  const child = new EventEmitter(); child.exitCode = null; child.signalCode = null; child.kills = [];
  child.kill = signal => { child.kills.push(signal); queueMicrotask(() => { child.signalCode = signal; child.emit("close", null, signal); }); return true; };
  return child;
}
test("shutdown observes close before SIGTERM and waits for resource release", async () => {
  const child = childProcess(), exited = observeProcessExit(child);
  assert.deepEqual(await stopTestProcess(child, exited), { code: null, signal: "SIGTERM" });
  assert.deepEqual(child.kills, ["SIGTERM"]); assert.equal(child.listenerCount("close"), 0);
});
test("an already-closed process is observed without waiting for an event that cannot fire again", async () => {
  const child = childProcess(); child.exitCode = 0;
  assert.deepEqual(await stopTestProcess(child, observeProcessExit(child)), { code: 0, signal: null });
  assert.deepEqual(child.kills, []);
});
test("spawn errors resolve safely without logging the original sensitive message", async () => {
  const child = childProcess(), exited = observeProcessExit(child);
  child.emit("error", Object.assign(new Error("private test diagnostic must not be emitted"), { code: "ENOENT" }));
  assert.deepEqual(await exited, { code: null, signal: null, errorCode: "ENOENT" });
});
test("a child that refuses to exit is force-stopped and the check still fails", async () => {
  const child = childProcess(); child.kill = signal => { child.kills.push(signal); return true; };
  await assert.rejects(waitForTestExit(child, observeProcessExit(child), 20), /did not stop/);
  assert.deepEqual(child.kills, ["SIGKILL"]);
});
test("readiness requires 200, not a 503 health page, and cancels the unsuccessful response body", async () => {
  let calls = 0, cancelled = 0;
  const response = await waitForLocalHttp("http://127.0.0.1:12345/health/live", childProcess(), 1000, async () => {
    calls++; return calls === 1 ? { status: 503, body: { cancel: async () => { cancelled++; } } } : { status: 200 };
  });
  assert.equal(response.status, 200); assert.equal(calls, 2); assert.equal(cancelled, 1);
});
test("readiness refuses external or credential-bearing targets before making a request", async () => {
  for (const target of ["http://external.invalid/health", "http://local-test-value@127.0.0.1/health"]) {
    let calls = 0;
    await assert.rejects(waitForLocalHttp(target, childProcess(), 100, async () => { calls++; }), error => !error.message.includes(target) && /loopback/.test(error.message));
    assert.equal(calls, 0);
  }
});
test("a child that exits before listening fails immediately without echoing process output", async () => {
  const child = childProcess(); child.exitCode = 1;
  await assert.rejects(waitForLocalHttp("http://127.0.0.1:12345/health/live", child), /exited before readiness/);
});
test("even a late HTTP 200 cannot silently extend the startup deadline", async () => {
  let cancelled = false;
  await assert.rejects(waitForLocalHttp("http://127.0.0.1:12345/health/live", childProcess(), 10, async () => {
    await new Promise(resolve => setTimeout(resolve, 40));
    return { status: 200, body: { cancel: async () => { cancelled = true; } } };
  }), /readiness deadline exceeded/);
  assert.equal(cancelled, true);
});
test("a hung local HTTP attempt receives an abort signal and cannot outlive the existing startup budget", async () => {
  let aborted = false;
  await assert.rejects(waitForLocalHttp("http://127.0.0.1:12345/health/live", childProcess(), 100, async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
  })), /readiness deadline exceeded/);
  assert.equal(aborted, true);
});
test("a real unhealthy local child is awaited and its listener is closed even when readiness fails", async () => {
  const child = spawn(process.execPath, ["--input-type=module", "-e", 'import http from "node:http"; const s=http.createServer((_,r)=>{r.writeHead(503);r.end("unhealthy local fixture");});s.listen(0,"127.0.0.1",()=>console.log(s.address().port));'], { env: {}, stdio: ["ignore", "pipe", "ignore"] });
  const exited = observeProcessExit(child);
  let port;
  try {
    port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("local fixture did not start")), 20_000);
      child.stdout.once("data", chunk => { clearTimeout(timer); const value = Number(chunk.toString().trim()); if (Number.isInteger(value)) resolve(value); else reject(new Error("invalid local port")); });
      void exited.then(() => { clearTimeout(timer); reject(new Error("local fixture exited before listening")); });
    });
    await assert.rejects(waitForLocalHttp(`http://127.0.0.1:${port}/health/live`, child, 100), /readiness deadline exceeded/);
  } finally {
    const result = await stopTestProcess(child, exited);
    assert.equal(result.signal === "SIGTERM" || result.code === 0, true);
  }
  await assert.rejects(fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(1000) }));
});
