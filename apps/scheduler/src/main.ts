import { createDatabaseClient } from "@xiongzai/database";
import { FINANCE_JOB_TYPES, FinanceLedgerEngine, ORDER_JOB_TYPES, OrderJobProcessor } from "@xiongzai/application";
import { JsonLogger } from "@xiongzai/observability";
import { AliyunOssStorageProvider, DisabledObjectStorageProvider, FILE_LIFECYCLE_JOB_TYPES, FileLifecycleService, loadApiConfig, MinioStorageProvider, USER_LIFECYCLE_JOB_TYPES, UserLifecycleJobProcessor, type ObjectStorageProvider } from "@xiongzai/api";
import { loadSchedulerConfig } from "./config.js";
import { DrizzleScheduledJobRepository, Scheduler } from "./scheduler.js";
import { AfterSaleService, FinanceService, FinancialRecoveryService, DrizzleMockTransferStore, MockPaymentProvider, MockPayoutProvider, PaymentProviderRouter, TRANSFER_RECOVERY_JOB, DurableTransfers, AFTER_SALE_CASE_DEADLINE } from "@xiongzai/api";

const config = loadSchedulerConfig();
const apiConfig = loadApiConfig();
const logger = new JsonLogger("scheduler");
const database = createDatabaseClient({ connectionString: config.databaseUrl, application_name: config.schedulerId });
const scheduler = new Scheduler(new DrizzleScheduledJobRepository(database.db), logger, config.schedulerId, config.batchSize);
const storage = storageProvider(apiConfig);
const fileLifecycle = new FileLifecycleService(database, apiConfig, storage, logger);
const userLifecycle = new UserLifecycleJobProcessor(database, apiConfig, storage);
const orderJobs = new OrderJobProcessor(database.db);
const financeJobs = new FinanceLedgerEngine(database.db);
if(["development","test"].includes(apiConfig.environment)){
  const store=new DrizzleMockTransferStore(database,apiConfig.authHmacKey);
  const providers=new PaymentProviderRouter(["WECHAT_APP","ALIPAY_APP"].map(channel=>new MockPaymentProvider(apiConfig.paymentWebhookSecret,channel as "WECHAT_APP"|"ALIPAY_APP").bindTransferStore(store)));
  const payout=new MockPayoutProvider(apiConfig.payoutWebhookSecret??apiConfig.paymentWebhookSecret).bindTransferStore(store);
  const afterSale=new AfterSaleService(database,apiConfig,providers);
  const recovery=new FinancialRecoveryService(database,apiConfig,new FinanceService(database,apiConfig,payout),afterSale);
  scheduler.register(AFTER_SALE_CASE_DEADLINE,job=>afterSale.processCaseDeadline(job.targetId,job.payload as {case_version?:unknown;deadline_at?:unknown}));
  scheduler.register(TRANSFER_RECOVERY_JOB,job=>recovery.dispatch(job.targetId));
}
for (const jobType of Object.values(ORDER_JOB_TYPES)) {
  scheduler.register(jobType, (job) => orderJobs.process(job.jobType, job.targetId, `scheduled:${job.id}`, job.payload as { order_version?: unknown; deadline_at?: unknown; hours?: unknown }).then(() => undefined));
}
scheduler.register(FINANCE_JOB_TYPES.INCOME_AVAILABLE, (job) => {
  const payload = job.payload as { income_id?: unknown };
  if (typeof payload.income_id !== "string") throw new Error("Finance income job is missing income_id.");
  return financeJobs.makeIncomeAvailable(payload.income_id).then(() => undefined);
});
for (const jobType of Object.values(FILE_LIFECYCLE_JOB_TYPES)) {
  scheduler.register(jobType, (job) => fileLifecycle.handleClaimedJob(job));
}
for (const jobType of Object.values(USER_LIFECYCLE_JOB_TYPES)) {
  scheduler.register(jobType, (job) => userLifecycle.process(job.jobType, job.targetId, `scheduled:${job.id}`));
}
let stopping = false;
let nextFileSweepAt = 0;

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { stopping = true; });

logger.info("scheduler_started", { scheduler_id: config.schedulerId });
while (!stopping) {
  try {
    if (Date.now() >= nextFileSweepAt) {
      if(["development","test"].includes(apiConfig.environment))await new DurableTransfers(database).enqueueDue();
      await fileLifecycle.enqueueDueJobs();
      const metrics = await fileLifecycle.metrics();
      logger.info("file_lifecycle_metrics", { pending_delete_count: metrics.pendingDeletes, retry_count: metrics.retrying, permanent_failure_count: metrics.permanentFailures, expired_upload_count: metrics.expiredUploads });
      nextFileSweepAt = Date.now() + apiConfig.fileLifecycleSweepIntervalSeconds * 1_000;
    }
    const count = await scheduler.runOnce();
    if (count === 0) await delay(config.pollIntervalMs);
  } catch {
    logger.error("scheduler_iteration_failed", { error_category: "scheduler_iteration_failure" });
    await delay(config.pollIntervalMs);
  }
}
await database.close();
logger.info("scheduler_stopped", { scheduler_id: config.schedulerId });

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function storageProvider(config: ReturnType<typeof loadApiConfig>): ObjectStorageProvider {
  if (config.fileStorageProvider === "minio") return new MinioStorageProvider({ endpoint: config.fileStorageEndpoint!, region: config.fileStorageRegion, accessKeyId: config.fileStorageAccessKeyId!, secretAccessKey: config.fileStorageSecretAccessKey! });
  if (config.fileStorageProvider === "aliyun-oss") return new AliyunOssStorageProvider({ endpoint: config.fileStorageEndpoint!, region: config.fileStorageRegion, accessKeyId: config.fileStorageAccessKeyId!, accessKeySecret: config.fileStorageSecretAccessKey! });
  return new DisabledObjectStorageProvider();
}
