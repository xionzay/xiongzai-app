import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { DatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import { AppModule } from "./app.module.js";
import { loadApiConfig, type ApiConfig } from "./config.js";
import type { PaymentProvider } from "./payment-provider.js";
import type { PayoutProvider } from "./payout-provider.js";
import type { SmsProvider } from "./sms-provider.js";

export async function createApiApp(options: { config?: ApiConfig; databaseClient?: DatabaseClient; logger?: JsonLogger; smsProvider?: SmsProvider; paymentProvider?: PaymentProvider; payoutProvider?: PayoutProvider } = {}): Promise<NestFastifyApplication> {
  const config = options.config ?? loadApiConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({ config, databaseClient: options.databaseClient, logger: options.logger, smsProvider: options.smsProvider, paymentProvider: options.paymentProvider, payoutProvider: options.payoutProvider }),
    new FastifyAdapter({ logger: false, trustProxy: true }),
    { bufferLogs: false, logger: false },
  );
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
