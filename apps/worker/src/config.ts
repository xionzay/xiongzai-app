import { z } from "zod";

const schema = z.object({
  databaseUrl: z.url(),
  workerId: z.string().min(1).max(128),
  pollIntervalMs: z.number().int().min(100).max(60_000),
  batchSize: z.number().int().min(1).max(100),
  publisherMode: z.enum(["log"]),
  environment: z.enum(["development", "test", "production"]),
}).superRefine((value, context) => {
  if (value.environment === "production" && value.publisherMode === "log") {
    context.addIssue({ code: "custom", message: "Production requires a real EventPublisher adapter.", path: ["publisherMode"] });
  }
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = schema.safeParse({
    databaseUrl: env.DATABASE_URL,
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 1_000),
    batchSize: Number(env.WORKER_BATCH_SIZE ?? 20),
    publisherMode: env.EVENT_PUBLISHER_MODE ?? "log",
    environment: env.NODE_ENV ?? "development",
  });
  if (!result.success) throw new Error(`Invalid Worker configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  return result.data;
}
