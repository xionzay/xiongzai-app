import { Body, Controller, Get, Headers, Param, Post, Query, Req } from "@nestjs/common";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, type AuthenticatedRequest } from "./auth.guard.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { OrderPaymentService } from "./order-payment.service.js";

const uuid = z.uuid();
const orderDraftSchema = z.object({ product_id: uuid, sku_id: uuid, slot_id: uuid, quantity: z.number().int().min(1).max(20), service_starts_at: z.coerce.date(), buyer_note: z.string().trim().max(500).nullable().optional() });
const versionSchema = z.object({ version: z.number().int().nonnegative() });
const reasonSchema = versionSchema.extend({ reason: z.string().trim().min(2).max(1000) });
const orderStatuses = ["PENDING_PAYMENT", "PENDING_ACCEPT", "ACCEPTED", "IN_SERVICE", "PENDING_BUYER_CONFIRM", "COMPLETED", "CANCELLED", "CLOSED", "SELLER_REJECTED"] as const;
const listSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional(), status: z.enum(orderStatuses).optional() });
const paymentCreateSchema = z.object({ order_id: uuid });
const callbackSchema = z.object({ event_id: z.string().trim().min(8).max(160), event_type: z.enum(["PAYMENT_SUCCEEDED", "PAYMENT_FAILED"]), payment_no: z.string().trim().min(8).max(64), provider_transaction_id: z.string().trim().min(8).max(128), amount_cent: z.string().regex(/^\d+$/u) });

@Controller("api/v1/orders")
export class BuyerOrderController {
  constructor(private readonly service: OrderPaymentService) {}
  @Post("preview") preview(@Req() request: UserRequest, @Body(new ZodValidationPipe(orderDraftSchema)) body: z.infer<typeof orderDraftSchema>) { return this.service.preview(principal(request), draft(body)); }
  @Post() create(@Req() request: UserRequest, @Headers("idempotency-key") key: string | undefined, @Body(new ZodValidationPipe(orderDraftSchema)) body: z.infer<typeof orderDraftSchema>) { return this.service.createOrder(principal(request), draft(body), idempotencyKey(key), metadata(request)); }
  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.service.listBuyerOrders(principal(request), query); }
  @Get(":orderId") detail(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string) { return this.service.getOrder(principal(request), orderId); }
  @Post(":orderId/cancel") cancel(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string, @Body(new ZodValidationPipe(reasonSchema)) body: z.infer<typeof reasonSchema>) { return this.service.cancelOrder(principal(request), orderId, body.version, body.reason, metadata(request)); }
  @Post(":orderId/confirm") confirm(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.buyerConfirm(principal(request), orderId, body.version, metadata(request)); }
}

@Controller("api/v1/seller/orders")
export class SellerOrderController {
  constructor(private readonly service: OrderPaymentService) {}
  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.service.listSellerOrders(principal(request), query); }
  @Get(":orderId") detail(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string) { return this.service.getOrder(principal(request), orderId); }
  @Post(":orderId/accept") accept(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.sellerAccept(principal(request), orderId, body.version, metadata(request)); }
  @Post(":orderId/reject") reject(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string, @Body(new ZodValidationPipe(reasonSchema)) body: z.infer<typeof reasonSchema>) { return this.service.sellerReject(principal(request), orderId, body.version, body.reason, metadata(request)); }
  @Post(":orderId/start") start(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.startService(principal(request), orderId, body.version, metadata(request)); }
  @Post(":orderId/complete") complete(@Req() request: UserRequest, @Param("orderId", new ZodValidationPipe(uuid)) orderId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.completeService(principal(request), orderId, body.version, metadata(request)); }
}

@Controller("api/v1/payments")
export class PaymentController {
  constructor(private readonly service: OrderPaymentService) {}
  @Post() create(@Req() request: UserRequest, @Headers("idempotency-key") key: string | undefined, @Body(new ZodValidationPipe(paymentCreateSchema)) body: z.infer<typeof paymentCreateSchema>) { return this.service.createPayment(principal(request), body.order_id, idempotencyKey(key), metadata(request)); }
  @Get(":paymentId") detail(@Req() request: UserRequest, @Param("paymentId", new ZodValidationPipe(uuid)) paymentId: string) { return this.service.getPayment(principal(request), paymentId); }
  @Post(":paymentId/mock-confirm") mockConfirm(@Req() request: UserRequest, @Param("paymentId", new ZodValidationPipe(uuid)) paymentId: string) { return this.service.mockConfirm(principal(request), paymentId, metadata(request)); }
}

@Controller("callbacks/v1/payments")
export class PaymentCallbackController {
  constructor(private readonly service: OrderPaymentService) {}
  @Post("mock") @Public() callback(@Req() request: FastifyRequest, @Headers("x-payment-signature") signature: string | undefined, @Body(new ZodValidationPipe(callbackSchema)) body: z.infer<typeof callbackSchema>) { return this.service.processPaymentCallback(body, signature, metadata(request)); }
}

type UserRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: UserRequest) { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal.sub; }
function idempotencyKey(value: string | undefined) { if (!value || value.length < 8 || value.length > 128) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "Idempotency-Key 必须为 8 到 128 个字符", statusCode: 400 }); return value; }
function draft(body: z.infer<typeof orderDraftSchema>) { return { productId: body.product_id, skuId: body.sku_id, slotId: body.slot_id, quantity: body.quantity, serviceStartsAt: body.service_starts_at, buyerNote: body.buyer_note }; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
