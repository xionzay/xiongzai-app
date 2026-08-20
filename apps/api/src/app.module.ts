import { Inject, Injectable, MiddlewareConsumer, Module, type DynamicModule, type NestModule, type OnApplicationShutdown } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { createDatabaseClient, type DatabaseClient } from "@xiongzai/database";
import { JsonLogger } from "@xiongzai/observability";
import { AuthenticationGuard } from "./auth.guard.js";
import type { ApiConfig } from "./config.js";
import { HealthController } from "./health.controller.js";
import { AdminIdentityVerificationController, UserAuthController, UserMeController, UserPolicyController } from "./identity-user.controllers.js";
import { IdentityUserService } from "./identity-user.service.js";
import { ApiExceptionFilter, ApiSerializationInterceptor } from "./http.js";
import { HttpContextMiddleware } from "./http-context.middleware.js";
import { SessionAuthorizationService } from "./session-authorization.service.js";
import { AdminSellerProductController, CompanionDiscoveryController, FavoriteController, SellerController, ServiceDiscoveryController } from "./seller-product.controllers.js";
import { SellerProductService } from "./seller-product.service.js";
import { DevelopmentSmsProvider, type SmsProvider } from "./sms-provider.js";
import { MockPaymentProvider, type PaymentProvider } from "./payment-provider.js";
import { BuyerOrderController, PaymentCallbackController, PaymentController, SellerOrderController } from "./order-payment.controllers.js";
import { OrderPaymentService } from "./order-payment.service.js";
import { API_CONFIG, API_LOGGER, DATABASE_CLIENT, PAYMENT_PROVIDER, SMS_PROVIDER } from "./tokens.js";
import { AdminConversationEvidenceController, AdminSupportCaseController, UserConversationController, UserNotificationController, UserSupportCaseController } from "./chat-support-notification.controllers.js";
import { ChatSupportNotificationService } from "./chat-support-notification.service.js";
import { AdminComplaintController, AdminRefundController, AdminReviewController, PublicReviewController, RefundCallbackController, SellerRefundController, UserComplaintController, UserRefundController, UserReviewController } from "./after-sale.controllers.js";
import { AfterSaleService } from "./after-sale.service.js";
import { AdminFinanceController, AdminWithdrawalController, PayoutCallbackController, SellerFinanceController, SellerPayoutAccountController, SellerWithdrawalController } from "./finance.controllers.js";
import { FinanceService } from "./finance.service.js";
import { MockPayoutProvider, type PayoutProvider } from "./payout-provider.js";
import { PAYOUT_PROVIDER } from "./tokens.js";
import { AdminAuthController, AdminCatalogController, AdminOrderGovernanceController, AdminPaymentGovernanceController, AdminPlatformGovernanceController, AdminRbacController, AdminUserGovernanceController } from "./admin-governance.controllers.js";
import { AdminGovernanceService } from "./admin-governance.service.js";

export interface ApiDependencies {
  config: ApiConfig;
  databaseClient?: DatabaseClient;
  logger?: JsonLogger;
  smsProvider?: SmsProvider;
  paymentProvider?: PaymentProvider;
  payoutProvider?: PayoutProvider;
}

@Injectable()
class DatabaseShutdownService implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}
  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}

@Module({})
export class AppModule implements NestModule {
  static register(dependencies: ApiDependencies): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController, UserAuthController, UserMeController, UserPolicyController, AdminIdentityVerificationController,
        SellerController, CompanionDiscoveryController, ServiceDiscoveryController, FavoriteController, AdminSellerProductController,
        BuyerOrderController, SellerOrderController, PaymentController, PaymentCallbackController,
        UserConversationController, UserSupportCaseController, UserNotificationController, AdminSupportCaseController, AdminConversationEvidenceController,
        UserRefundController, SellerRefundController, AdminRefundController, RefundCallbackController,
        UserComplaintController, AdminComplaintController, UserReviewController, PublicReviewController, AdminReviewController,
        SellerFinanceController, SellerPayoutAccountController, SellerWithdrawalController, AdminFinanceController, AdminWithdrawalController, PayoutCallbackController,
        AdminAuthController, AdminRbacController, AdminUserGovernanceController, AdminCatalogController, AdminOrderGovernanceController, AdminPaymentGovernanceController, AdminPlatformGovernanceController,
      ],
      providers: [
        { provide: API_CONFIG, useValue: dependencies.config },
        { provide: DATABASE_CLIENT, useFactory: () => dependencies.databaseClient ?? createDatabaseClient({
          connectionString: dependencies.config.databaseUrl,
          application_name: "xiongzai-api",
          max: dependencies.config.databaseMaxConnections,
          connectionTimeoutMillis: dependencies.config.databaseConnectionTimeoutMs,
        }) },
        { provide: API_LOGGER, useValue: dependencies.logger ?? new JsonLogger("api") },
        {
          provide: SMS_PROVIDER,
          useFactory: () => {
            if (dependencies.smsProvider) return dependencies.smsProvider;
            if (dependencies.config.smsProviderMode === "development") return new DevelopmentSmsProvider();
            throw new Error("An injected SMS provider is required.");
          },
        },
        {
          provide: PAYMENT_PROVIDER,
          useFactory: () => {
            if (dependencies.paymentProvider) return dependencies.paymentProvider;
            if (dependencies.config.paymentProviderMode === "mock") return new MockPaymentProvider(dependencies.config.paymentWebhookSecret);
            throw new Error("An injected payment provider is required.");
          },
        },
        {
          provide: PAYOUT_PROVIDER,
          useFactory: () => {
            if (dependencies.payoutProvider) return dependencies.payoutProvider;
            if (dependencies.config.payoutProviderMode === "mock" || dependencies.config.environment !== "production") return new MockPayoutProvider(dependencies.config.payoutWebhookSecret ?? dependencies.config.paymentWebhookSecret);
            throw new Error("An injected payout provider is required.");
          },
        },
        HttpContextMiddleware,
        DatabaseShutdownService,
        SessionAuthorizationService,
        IdentityUserService,
        SellerProductService,
        OrderPaymentService,
        ChatSupportNotificationService,
        AfterSaleService,
        FinanceService,
        AdminGovernanceService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: ApiSerializationInterceptor },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpContextMiddleware).forRoutes("*");
  }
}
