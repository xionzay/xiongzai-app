import { setTimeout as delay } from "node:timers/promises";

// Observe before issuing SIGTERM: an already-exited child cannot miss its exit
// event. Resolve spawn errors rather than creating an unhandled rejection.
export function observeProcessExit(child) {
  return new Promise(resolve => {
    const finish = value => { child.removeListener("error", onError); child.removeListener("close", onClose); resolve(value); };
    const onError = error => finish({ code: null, signal: null, errorCode: error.code ?? "SPAWN_ERROR" });
    const onClose = (code, signal) => finish({ code, signal });
    child.once("error", onError); child.once("close", onClose);
    if (child.exitCode !== null || child.signalCode !== null) finish({ code: child.exitCode, signal: child.signalCode });
  });
}

export async function stopTestProcess(child, exited, timeoutMs = 10_000) {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  return waitForTestExit(child, exited, timeoutMs);
}

export async function waitForTestExit(child, exited, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([exited, new Promise((_, reject) => {
      timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("local artifact process did not stop")); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export async function waitForLocalHttp(url, child, timeoutMs = 20_000, request = fetch) {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.username || target.password || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("local artifact requires a loopback HTTP target");
  const deadline = performance.now() + timeoutMs;
  let lastFailure = "connection_unavailable";
  while (performance.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("local artifact exited before readiness");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("local readiness deadline", "TimeoutError")), Math.max(1, Math.ceil(deadline - performance.now())));
    try {
      const response = await request(url, { signal: controller.signal });
      if (performance.now() >= deadline) { await response.body?.cancel(); lastFailure = "request_timeout"; break; }
      if (response.status === 200) return response;
      lastFailure = `HTTP_${response.status}`;
      await response.body?.cancel();
    } catch (cause) { lastFailure = cause?.name === "TimeoutError" || cause?.name === "AbortError" ? "request_timeout" : "connection_unavailable"; }
    finally { clearTimeout(timer); }
    const remaining = deadline - performance.now();
    if (remaining > 0) await delay(Math.min(100, remaining));
  }
  // Never echo child output, credentials or raw network errors into test logs.
  throw new Error(`local artifact readiness deadline exceeded (${lastFailure})`);
}
