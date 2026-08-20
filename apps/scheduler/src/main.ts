import { createDatabaseClient } from "@xiongzai/database";
import { FINANCE_JOB_TYPES, FinanceLedgerEngine, ORDER_JOB_TYPES, OrderJobProcessor } from "@xiongzai/application";
import { JsonLogger } from "@xiongzai/observability";
import { loadSchedulerConfig } from "./config.js";
import { DrizzleScheduledJobRepository, Scheduler } from "./scheduler.js";

const config = loadSchedulerConfig();
const logger = new JsonLogger("scheduler");
const database = createDatabaseClient({ connectionString: config.databaseUrl, application_name: config.schedulerId });
const scheduler = new Scheduler(new DrizzleScheduledJobRepository(database.db), logger, config.schedulerId, config.batchSize);
const orderJobs = new OrderJobProcessor(database.db);
const financeJobs = new FinanceLedgerEngine(database.db);
for (const jobType of Object.values(ORDER_JOB_TYPES)) {
  scheduler.register(jobType, (job) => orderJobs.process(job.jobType, job.targetId, `scheduled:${job.id}`).then(() => undefined));
}
scheduler.register(FINANCE_JOB_TYPES.INCOME_AVAILABLE, (job) => {
  const payload = job.payload as { income_id?: unknown };
  if (typeof payload.income_id !== "string") throw new Error("Finance income job is missing income_id.");
  return financeJobs.makeIncomeAvailable(payload.income_id).then(() => undefined);
});
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { stopping = true; });

logger.info("scheduler_started", { scheduler_id: config.schedulerId });
while (!stopping) {
  try {
    const count = await scheduler.runOnce();
    if (count === 0) await delay(config.pollIntervalMs);
  } catch (error) {
    logger.error("scheduler_iteration_failed", { error });
    await delay(config.pollIntervalMs);
  }
}
await database.close();
logger.info("scheduler_stopped", { scheduler_id: config.schedulerId });

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
