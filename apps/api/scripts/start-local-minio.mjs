import { access, mkdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const binaryPath = resolve(workspaceRoot, ".local/minio/bin/minio");
const config = parseEnv(await readFile(resolve(workspaceRoot, ".env.minio.local"), "utf8"));
for (const key of ["MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "MINIO_ADDRESS", "MINIO_CONSOLE_ADDRESS", "MINIO_VOLUMES", "MINIO_LICENSE_PATH"]) {
  if (!config[key]) throw new Error(`Missing ${key} in the ignored MinIO environment file.`);
}
const licensePath = resolve(config.MINIO_LICENSE_PATH);
const allowedLicenseDirectory = `${resolve(workspaceRoot, ".local/minio/license")}/`;
if (!licensePath.startsWith(allowedLicenseDirectory)) {
  throw new Error("MINIO_LICENSE_PATH must point inside the ignored .local/minio/license directory.");
}
await access(binaryPath);
await access(licensePath);
const licenseMode = (await stat(licensePath)).mode & 0o777;
if ((licenseMode & 0o077) !== 0) {
  throw new Error("The local MinIO license file must not be readable or writable by group/others (use mode 0600).");
}
await mkdir(config.MINIO_VOLUMES, { recursive: true, mode: 0o700 });

const child = spawn(binaryPath, [
  "server",
  config.MINIO_VOLUMES,
  "--address", config.MINIO_ADDRESS,
  "--console-address", config.MINIO_CONSOLE_ADDRESS,
  "--license", licensePath,
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
