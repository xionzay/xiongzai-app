import { createDatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import { loadWorkerConfig } from "./config.js";
import { DrizzleOutboxRepository, LoggingPublisher, OutboxWorker } from "./outbox-worker.js";

const config = loadWorkerConfig();
const logger = new JsonLogger("worker");
const database = createDatabaseClient({ connectionString: config.databaseUrl, application_name: config.workerId });
const worker = new OutboxWorker(new DrizzleOutboxRepository(database.db, { maxAttempts: config.maxAttempts }), new LoggingPublisher(logger), logger, config.batchSize);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { stopping = true; });
}

logger.info("worker_started", { worker_id: config.workerId });
while (!stopping) {
  try {
    const count = await worker.runOnce();
    if (count === 0) await delay(config.pollIntervalMs);
  } catch {
    logger.error("worker_iteration_failed", { error_category: "worker_iteration_failure" });
    await delay(config.pollIntervalMs);
  }
}
await database.close();
logger.info("worker_stopped", { worker_id: config.workerId });

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
