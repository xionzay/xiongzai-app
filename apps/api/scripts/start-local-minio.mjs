import { access, mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const binaryPath = resolve(workspaceRoot, ".local/minio/bin/minio");
const config = parseEnv(await readFile(resolve(workspaceRoot, ".env.minio.local"), "utf8"));
for (const key of ["MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "MINIO_ADDRESS", "MINIO_CONSOLE_ADDRESS", "MINIO_VOLUMES"]) {
  if (!config[key]) throw new Error(`Missing ${key} in the ignored MinIO environment file.`);
}
await access(binaryPath);
await mkdir(config.MINIO_VOLUMES, { recursive: true, mode: 0o700 });

const child = spawn(binaryPath, [
  "server",
  config.MINIO_VOLUMES,
  "--address", config.MINIO_ADDRESS,
  "--console-address", config.MINIO_CONSOLE_ADDRESS,
], {
  cwd: workspaceRoot,
  env: { ...process.env, MINIO_ROOT_USER: config.MINIO_ROOT_USER, MINIO_ROOT_PASSWORD: config.MINIO_ROOT_PASSWORD },
  stdio: "inherit",
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  });
}

child.once("error", (error) => { throw error; });
child.once("exit", (code, signal) => {
  process.exitCode = stopping ? 0 : code ?? (signal ? 1 : 0);
});

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/u).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
