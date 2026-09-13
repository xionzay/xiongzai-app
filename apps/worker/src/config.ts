import { z } from "zod";

const schema = z.object({
  databaseUrl: z.url(),
  workerId: z.string().min(1).max(128),
  pollIntervalMs: z.number().int().min(100).max(60_000),
  batchSize: z.number().int().min(1).max(100),
  maxAttempts: z.number().int().min(1).max(100),
  publisherMode: z.enum(["log"]),
  environment: z.enum(["development", "test", "staging", "production"]),
}).superRefine((value, context) => {
  if (["staging", "production"].includes(value.environment) && value.publisherMode === "log") {
    context.addIssue({ code: "custom", message: "Protected environments require a real EventPublisher adapter.", path: ["publisherMode"] });
  }
  if (["staging", "production"].includes(value.environment) && isLoopbackDatabase(value.databaseUrl)) {
    context.addIssue({ code: "custom", message: "Protected environments reject loopback databases.", path: ["databaseUrl"] });
  }
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = schema.safeParse({
    databaseUrl: env.DATABASE_URL,
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 1_000),
    batchSize: Number(env.WORKER_BATCH_SIZE ?? 20),
    maxAttempts: Number(env.OUTBOX_MAX_ATTEMPTS ?? 8),
    publisherMode: env.EVENT_PUBLISHER_MODE ?? "log",
    environment: env.DEPLOYMENT_ENV ?? env.NODE_ENV ?? "development",
  });
  if (!result.success) throw new Error(`Invalid Worker configuration: ${result.error.issues.map((issue) => issue.path[0] === "databaseUrl" ? "DATABASE_URL" : issue.path[0] === "publisherMode" ? "EVENT_PUBLISHER_MODE" : String(issue.path[0] ?? "CONFIGURATION")).join(", ")}`);
  return result.data;
}

function isLoopbackDatabase(connectionString: string): boolean {
  const hostname = new URL(connectionString).hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  return hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
}
