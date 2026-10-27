import { randomBytes } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const backendEnvPath = resolve(workspaceRoot, ".env.backend.local");
const minioEnvPath = resolve(workspaceRoot, ".env.minio.local");

const minioSource = await readOptional(minioEnvPath);
const minioValues = parseEnv(minioSource);
const accessKeyId = minioValues.MINIO_ROOT_USER || `xiongzai-local-${randomBytes(8).toString("hex")}`;
const secretAccessKey = minioValues.MINIO_ROOT_PASSWORD || randomBytes(36).toString("base64url");
const lanHost = validatePrivateLanHost(process.env.LOCAL_LAN_HOST);
const minioBindHost = lanHost ? "0.0.0.0" : "127.0.0.1";
const storageHost = lanHost ?? "127.0.0.1";

await writeSecure(minioEnvPath, upsertEnv(minioSource, {
  MINIO_ROOT_USER: accessKeyId,
  MINIO_ROOT_PASSWORD: secretAccessKey,
  MINIO_ADDRESS: `${minioBindHost}:9000`,
  MINIO_CONSOLE_ADDRESS: "127.0.0.1:9001",
  MINIO_VOLUMES: resolve(workspaceRoot, ".local/minio-data"),
}));

const backendSource = await readOptional(backendEnvPath);
await writeSecure(backendEnvPath, upsertEnv(backendSource, {
  API_HOST: lanHost ? "0.0.0.0" : "127.0.0.1",
  FILE_STORAGE_PROVIDER: "minio",
  FILE_STORAGE_ENDPOINT: `http://${storageHost}:9000`,
  FILE_STORAGE_REGION: "us-east-1",
  FILE_STORAGE_ACCESS_KEY_ID: accessKeyId,
  FILE_STORAGE_SECRET_ACCESS_KEY: secretAccessKey,
  FILE_PUBLIC_BUCKET: "xiongzai-dev-public-media",
  FILE_PRIVATE_BUCKET: "xiongzai-dev-private-media",
  FILE_QUARANTINE_BUCKET: "xiongzai-dev-quarantine-media",
  FILE_PUBLIC_ASSET_PATH_MODE: "bucket-and-key",
}));

console.log("Ignored local MinIO environment files are ready with mode 0600; no secret values were printed.");

function validatePrivateLanHost(value) {
  const host = value?.trim();
  if (!host) return null;
  const privateIpv4 = /^(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/u;
  if (!privateIpv4.test(host) || host.split(".").some((part) => Number(part) > 255)) throw new Error("LOCAL_LAN_HOST 必须是有效的私有局域网 IPv4 地址");
  return host;
}

async function readOptional(path) {
  try { return await readFile(path, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return "# Local-only configuration. Never commit this file.\n"; throw error; }
}

function parseEnv(source) {
  const result = {};
  for (const line of source.split(/\r?\n/u)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

function upsertEnv(source, updates) {
  const remaining = new Map(Object.entries(updates));
  const lines = source.replace(/\s*$/u, "").split(/\r?\n/u).map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) return line;
    const key = line.slice(0, separator);
    if (!remaining.has(key)) return line;
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  return `${lines.join("\n")}\n`;
}

async function writeSecure(path, contents) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}
