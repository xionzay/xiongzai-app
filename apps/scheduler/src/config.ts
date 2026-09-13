import { z } from "zod";

const schema = z.object({
  databaseUrl: z.url(),
  schedulerId: z.string().min(1).max(128),
  pollIntervalMs: z.number().int().min(100).max(60_000),
  batchSize: z.number().int().min(1).max(100),
  environment: z.enum(["development", "test", "staging", "production"]),
}).superRefine((value, context) => {
  if (["staging", "production"].includes(value.environment) && isLoopbackDatabase(value.databaseUrl)) {
    context.addIssue({ code: "custom", message: "Protected environments reject loopback databases.", path: ["databaseUrl"] });
  }
});

export type SchedulerConfig = z.infer<typeof schema>;

export function loadSchedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const result = schema.safeParse({
    databaseUrl: env.DATABASE_URL,
    schedulerId: env.SCHEDULER_ID ?? `scheduler-${process.pid}`,
    pollIntervalMs: Number(env.SCHEDULER_POLL_INTERVAL_MS ?? 1_000),
    batchSize: Number(env.SCHEDULER_BATCH_SIZE ?? 20),
    environment: env.DEPLOYMENT_ENV ?? env.NODE_ENV ?? "development",
  });
  if (!result.success) throw new Error(`Invalid Scheduler configuration: ${result.error.issues.map((issue) => issue.path[0] === "databaseUrl" ? "DATABASE_URL" : String(issue.path[0] ?? "CONFIGURATION")).join(", ")}`);
  return result.data;
}

function isLoopbackDatabase(connectionString: string): boolean {
  const hostname = new URL(connectionString).hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  return hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
}
