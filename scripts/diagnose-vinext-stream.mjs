import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createRscRequestUrl } from "../node_modules/vinext/dist/server/app-rsc-cache-busting.js";

const port = Number(process.env.VINEXT_DIAGNOSTIC_PORT ?? 3102);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid VINEXT_DIAGNOSTIC_PORT");
await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once("error", () => reject(new Error("Local diagnostic port unavailable"))); probe.listen(port, "127.0.0.1", () => probe.close(resolve)); });
let output = "", lineBuffer = "", current = "startup";
const observed = [], serverErrors = [];
const child = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, WRANGLER_SEND_METRICS: "false", DO_NOT_TRACK: "1" }, stdio: ["ignore", "pipe", "pipe"] });
for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
  const text = String(chunk); output += text; lineBuffer += text;
  const lines = lineBuffer.split("\n"); lineBuffer = lines.pop();
  for (const line of lines) if (line.includes("[vinext] Server error:")) {
    serverErrors.push({ condition: current });
    if (line.includes("ERR_STREAM_UNABLE_TO_PIPE")) observed.push({ condition: current, code: "ERR_STREAM_UNABLE_TO_PIPE" });
  }
});
const conditions = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/admin`); await response.arrayBuffer(); if (response.ok) { ready = true; break; } } catch { /* startup only */ }
    if (child.exitCode !== null) throw new Error("Vinext production startup failed"); await delay(100);
  }
  if (!ready) throw new Error("Vinext production startup timeout");
  for (const pathname of ["/", "/admin", "/admin?module=serviceReview"]) for (const encoding of ["identity", "gzip", "br"]) for (const action of ["complete", "before-headers", "after-first-chunk", "head", "rsc-abort"]) {
    current = `${pathname} ${encoding} ${action}`;
    const result = await new Promise(resolve => {
      let done = false;
      const finish = status => { if (!done) { done = true; clearTimeout(timer); resolve(status); } };
      const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: action === "head" ? "HEAD" : "GET", headers: { "accept-encoding": encoding, ...(action === "rsc-abort" ? { rsc: "1" } : {}) } }, res => {
        res.on("data", () => { if (["after-first-chunk", "rsc-abort"].includes(action)) { req.destroy(); finish("intentional_disconnect"); } });
        res.on("end", () => finish(res.statusCode)); res.on("error", () => finish("intentional_disconnect"));
      });
      const timer = setTimeout(() => { req.destroy(); finish("timeout"); }, 5000);
      req.on("error", () => finish(action === "complete" || action === "head" ? "unexpected_error" : "intentional_disconnect")); req.end();
      if (action === "before-headers") setTimeout(() => { req.destroy(); finish("intentional_disconnect"); }, 1);
    });
    // Let delayed rendering finish before labeling the next deliberately disconnected request.
    conditions.push({ condition: current, result }); await delay(250);
  }
  await delay(500);
  // The baseline's RSC requests deliberately exercise the protocol's 307. This
  // optional pass also tests the real Flight payload with its valid cache key.
  const payloadResults = [];
  if (process.argv.includes("--rsc-payload")) {
    for (const pathname of ["/", "/admin", "/admin?module=serviceReview"]) for (const encoding of ["identity", "gzip", "br"]) for (const action of ["complete", "before-headers", "after-first-chunk"]) {
      current = `RSC payload ${pathname} ${encoding} ${action}`;
      const path = await createRscRequestUrl(pathname, new Headers({ rsc: "1" }));
      const result = await new Promise(resolve => {
        let done = false, bytes = 0;
        const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
        const req = http.request({ hostname: "127.0.0.1", port, path, headers: { rsc: "1", "accept-encoding": encoding } }, res => {
          const flight = (res.headers["content-type"] ?? "").startsWith("text/x-component");
          res.on("data", chunk => { bytes += chunk.length; if (action === "after-first-chunk") { req.destroy(); finish(flight && bytes > 0 ? "flight_disconnect" : "invalid_flight"); } });
          res.on("end", () => finish(res.statusCode === 200 && flight && bytes > 0 ? "flight_complete" : "invalid_flight"));
          res.on("error", () => finish(action === "complete" ? "unexpected_error" : "intentional_disconnect"));
        });
        const timer = setTimeout(() => { req.destroy(); finish("timeout"); }, 5000);
        req.on("error", () => finish(action === "complete" ? "unexpected_error" : "intentional_disconnect")); req.end();
        if (action === "before-headers") setTimeout(() => { req.destroy(); finish("intentional_disconnect"); }, 1);
      });
      payloadResults.push({ condition: current, result }); await delay(250);
    }
    await delay(500);
  }
  const frames = output.split("\n").filter(line => /^\s+at /.test(line)).map(line => line.replace(/https?:\/\/[^\s)]+/gu, "[redacted-url]").trim()).slice(0, 20);
  const sensitive = Object.entries(process.env).filter(([key, value]) => /SECRET|TOKEN|PASSWORD|DATABASE_URL|ENCRYPTION_KEY|ACCESS_KEY/iu.test(key) && value?.length > 7).filter(([, value]) => output.includes(value)).length;
  const redirect = row => row.condition.endsWith("rsc-abort") && row.result === 307;
  const report = { productionRequests: conditions.length, completed: conditions.filter(row => row.result === 200).length, protocolRedirects: conditions.filter(redirect).length, intentionalDisconnects: conditions.filter(row => row.result === "intentional_disconnect").length, unexpectedResults: conditions.filter(row => ![200, "intentional_disconnect"].includes(row.result) && !redirect(row)), rscPayloadRequests: payloadResults.length, flightComplete: payloadResults.filter(row => row.result === "flight_complete").length, flightDisconnects: payloadResults.filter(row => ["flight_disconnect", "intentional_disconnect"].includes(row.result)).length, unexpectedFlightResults: payloadResults.filter(row => !["flight_complete", "flight_disconnect", "intentional_disconnect"].includes(row.result)), streamWarnings: observed, serverErrors, frames, sensitiveValuesFound: sensitive };
  console.log(JSON.stringify(report));
  if (report.unexpectedResults.length || report.unexpectedFlightResults.length || serverErrors.length || sensitive) process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
