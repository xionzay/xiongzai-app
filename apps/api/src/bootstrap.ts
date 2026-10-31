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
import type { ObjectStorageProvider } from "./object-storage-provider.js";
import type { PreviewConcurrencyLimiter } from "./preview-concurrency-limiter.js";

export async function createApiApp(options: { config?: ApiConfig; databaseClient?: DatabaseClient; logger?: JsonLogger; smsProvider?: SmsProvider; paymentProvider?: PaymentProvider; paymentProviders?: readonly PaymentProvider[]; payoutProvider?: PayoutProvider; objectStorageProvider?: ObjectStorageProvider; previewConcurrencyLimiter?: PreviewConcurrencyLimiter } = {}): Promise<NestFastifyApplication> {
  const config = options.config ?? loadApiConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({ config, databaseClient: options.databaseClient, logger: options.logger, smsProvider: options.smsProvider, paymentProvider: options.paymentProvider, paymentProviders: options.paymentProviders, payoutProvider: options.payoutProvider, objectStorageProvider: options.objectStorageProvider, previewConcurrencyLimiter: options.previewConcurrencyLimiter }),
    new FastifyAdapter({
      logger: false,
      trustProxy: config.trustedProxyCidrs.length > 0 ? config.trustedProxyCidrs : false,
      bodyLimit: config.requestBodyLimitBytes,
    }),
    { bufferLogs: false, logger: false },
  );
  app.getHttpAdapter().getInstance().addHook("onRequest", (request, reply, done) => {
    if (request.raw.url?.split("?", 1)[0]?.startsWith("/admin-api/v1/")) {
      reply.header("cache-control", "no-store");
      reply.header("pragma", "no-cache");
    }
    done();
  });
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["x-request-id", "content-range", "accept-ranges", "content-disposition"],
  });
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
