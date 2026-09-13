import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const clientPath = resolve(workspaceRoot, ".local/minio/bin/mc");
const corsPath = resolve(import.meta.dirname, "minio-quarantine-cors.xml");
const config = parseEnv(await readFile(resolve(workspaceRoot, ".env.backend.local"), "utf8"));
const required = ["FILE_STORAGE_ENDPOINT", "FILE_STORAGE_ACCESS_KEY_ID", "FILE_STORAGE_SECRET_ACCESS_KEY", "FILE_PUBLIC_BUCKET", "FILE_PRIVATE_BUCKET", "FILE_QUARANTINE_BUCKET"];
for (const key of required) if (!config[key]) throw new Error(`Missing ${key} in the ignored backend environment file.`);
if (config.FILE_STORAGE_PROVIDER !== "minio") throw new Error("FILE_STORAGE_PROVIDER must be minio before local configuration.");
await access(clientPath);

const health = await fetch(`${config.FILE_STORAGE_ENDPOINT.replace(/\/+$/u, "")}/minio/health/ready`).catch(() => null);
if (!health?.ok) throw new Error("Local MinIO is not ready on the configured loopback endpoint.");

const aliasUrl = new URL(config.FILE_STORAGE_ENDPOINT);
aliasUrl.username = config.FILE_STORAGE_ACCESS_KEY_ID;
aliasUrl.password = config.FILE_STORAGE_SECRET_ACCESS_KEY;
const commandEnv = { ...process.env, MC_HOST_xiongzai: aliasUrl.toString() };
const buckets = [config.FILE_QUARANTINE_BUCKET, config.FILE_PUBLIC_BUCKET, config.FILE_PRIVATE_BUCKET];
for (const bucket of buckets) {
  await run(["mb", "--ignore-existing", `xiongzai/${bucket}`], commandEnv);
  await run(["anonymous", "set", "none", `xiongzai/${bucket}`], commandEnv);
}
await run(["cors", "set", `xiongzai/${config.FILE_QUARANTINE_BUCKET}`, corsPath], commandEnv);
await run(["cors", "get", `xiongzai/${config.FILE_QUARANTINE_BUCKET}`], commandEnv);

console.log(JSON.stringify({ minio: "ready", buckets, quarantine_cors: "configured", anonymous_access: "disabled" }, null, 2));

async function run(args, env) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(clientPath, args, { cwd: workspaceRoot, env, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`MinIO client command failed: ${args[0]} ${args[1] ?? ""}`.trim())));
  });
}

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/u).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
