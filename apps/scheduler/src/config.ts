import { z } from "zod";

const schema = z.object({
  databaseUrl: z.url(),
  schedulerId: z.string().min(1).max(128),
  pollIntervalMs: z.number().int().min(100).max(60_000),
  batchSize: z.number().int().min(1).max(100),
});

export type SchedulerConfig = z.infer<typeof schema>;

export function loadSchedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const result = schema.safeParse({
    databaseUrl: env.DATABASE_URL,
    schedulerId: env.SCHEDULER_ID ?? `scheduler-${process.pid}`,
    pollIntervalMs: Number(env.SCHEDULER_POLL_INTERVAL_MS ?? 1_000),
    batchSize: Number(env.SCHEDULER_BATCH_SIZE ?? 20),
  });
  if (!result.success) throw new Error(`Invalid Scheduler configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  return result.data;
}
