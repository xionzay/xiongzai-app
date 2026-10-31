import { Body, Controller, Get, Headers, Param, Post, Query, Req } from "@nestjs/common";
import { AppError, complaintStatuses, errorCodes, paymentChannels, refundStatuses, reviewStatuses, reviewImageLimits, type PaymentChannel } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AfterSaleService } from "./after-sale.service.js";
import { Public, RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";

const uuid = z.uuid();
const bigintCent = z.string().regex(/^\d+$/u).transform(BigInt);
const versionReason = z.object({ version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(1000) });
const adminList = z.object({ status: z.string().optional(),keyword:z.string().trim().min(1).max(100).optional(),cursor:z.string().trim().min(1).max(4096).optional(),limit: z.coerce.number().int().min(1).max(100).optional(),sort:z.enum(["created_desc","created_asc"]).default("created_desc") });
const userList = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional(), order_id: uuid.optional() });
const refundCreate = z.object({ order_id: uuid, amount_cent: bigintCent, reason_code: z.string().trim().min(2).max(64), reason_text: z.string().trim().min(2).max(200), description: z.string().trim().max(2000).optional() });
const sellerDecision = versionReason.extend({ decision: z.enum(["APPROVE", "REJECT"]) });
const adminRefundDecision = sellerDecision.extend({ approved_amount_cent: bigintCent.optional() }).superRefine((value, context) => { if (value.decision === "APPROVE" && value.approved_amount_cent === undefined) context.addIssue({ code: "custom", path: ["approved_amount_cent"], message: "批准退款时必须填写退款金额" }); });
const refundCallback = z.object({ event_id: uuid, event_type: z.enum(["REFUND_SUCCEEDED", "REFUND_FAILED"]), refund_no: z.string().trim().min(8).max(64), provider_refund_no: z.string().trim().min(8).max(128), amount_cent: z.string().regex(/^\d+$/u) });
const callbackChannel = z.enum([...paymentChannels, "mock"]);
const complaintCreate = z.object({ target_type: z.enum(["USER", "SELLER", "PRODUCT", "ORDER"]), target_id: uuid, complaint_type: z.string().trim().min(2).max(64), description: z.string().trim().min(5).max(3000), file_ids: z.array(uuid).max(6).default([]) });
const evidenceCreate = z.object({ version: z.number().int().nonnegative(), file_id: uuid, description: z.string().trim().max(500).optional() });
const complaintAction = z.object({ version: z.number().int().nonnegative(), action: z.enum(["ACCEPT", "START_PROCESSING", "REQUEST_EVIDENCE", "COMPLETE", "CLOSE"]), reason: z.string().trim().min(2).max(1000), result: z.string().trim().max(3000).optional() });
const reviewCreate = z.object({ order_id: uuid, rating: z.number().int().min(1).max(5), content: z.string().trim().max(1000).optional(), anonymous: z.boolean().default(false), image_file_ids: z.array(uuid).max(reviewImageLimits.maximumCount).default([]) }).strict();
const reviewList = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional() });
const reviewModeration = z.object({ action: z.enum(["HIDE", "RESTORE", "SOFT_DELETE"]), version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(1000) });

@Controller("api/v1/refunds")
export class UserRefundController {
  constructor(private readonly service: AfterSaleService) {}
  @Post() create(@Req() request: UserRequest, @Headers("idempotency-key") key: string | undefined, @Body(new ZodValidationPipe(refundCreate)) body: z.infer<typeof refundCreate>) { return this.service.createRefund(principal(request), { orderId: body.order_id, amountCent: body.amount_cent, reasonCode: body.reason_code, reasonText: body.reason_text, description: body.description }, idempotencyKey(key), metadata(request)); }
  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(userList)) query: z.infer<typeof userList>) { return this.service.listUserRefunds(principal(request), query); }
  @Get(":refundId") detail(@Req() request: UserRequest, @Param("refundId", new ZodValidationPipe(uuid)) refundId: string) { return this.service.getUserRefund(principal(request), refundId); }
  @Post(":refundId/escalate") escalate(@Req() request: UserRequest, @Param("refundId", new ZodValidationPipe(uuid)) refundId: string, @Body(new ZodValidationPipe(versionReason)) body: z.infer<typeof versionReason>) { return this.service.escalateRefund(principal(request), refundId, body.version, body.reason, metadata(request)); }
}

@Controller("api/v1/seller/refunds")
export class SellerRefundController {
  constructor(private readonly service: AfterSaleService) {}
  @Get() list(@Req() request: UserRequest) { return this.service.listSellerRefunds(principal(request)); }
  @Get(":refundId") detail(@Req() request: UserRequest, @Param("refundId", new ZodValidationPipe(uuid)) refundId: string) { return this.service.getUserRefund(principal(request), refundId); }
  @Post(":refundId/decision") decide(@Req() request: UserRequest, @Param("refundId", new ZodValidationPipe(uuid)) refundId: string, @Body(new ZodValidationPipe(sellerDecision)) body: z.infer<typeof sellerDecision>) { return this.service.sellerDecide(principal(request), refundId, body, metadata(request)); }
}

@Controller("admin-api/v1/refunds")
@RequireMfa()
export class AdminRefundController {
  constructor(private readonly service: AfterSaleService) {}
  @Get() @RequirePermissions("refund.read") list(@Query(new ZodValidationPipe(adminList.extend({ status: z.enum(refundStatuses).optional() }))) query: z.infer<typeof adminList>&{status?:typeof refundStatuses[number]}) { return this.service.listAdminRefunds(query); }
  @Get(":refundId") @RequirePermissions("refund.read") detail(@Param("refundId", new ZodValidationPipe(uuid)) refundId: string) { return this.service.getAdminRefund(refundId); }
  @Post(":refundId/decision") @RequirePermissions("refund.manage") decide(@Req() request: UserRequest, @Param("refundId", new ZodValidationPipe(uuid)) refundId: string, @Body(new ZodValidationPipe(adminRefundDecision)) body: z.infer<typeof adminRefundDecision>) { return this.service.adminDecideRefund(principal(request), refundId, { version: body.version, decision: body.decision, approvedAmountCent: body.approved_amount_cent, reason: body.reason }, metadata(request)); }
}

@Controller("callbacks/v1/refunds")
export class RefundCallbackController {
  constructor(private readonly service: AfterSaleService) {}
  @Post(":paymentChannel") @Public() callback(@Req() request: FastifyRequest, @Param("paymentChannel", new ZodValidationPipe(callbackChannel)) paymentChannel: PaymentChannel | "mock", @Headers("x-payment-signature") signature: string | undefined, @Body(new ZodValidationPipe(refundCallback)) body: z.infer<typeof refundCallback>) { return this.service.processRefundCallback(paymentChannel, body, signature, metadata(request)); }
}

@Controller("api/v1/complaints")
export class UserComplaintController {
  constructor(private readonly service: AfterSaleService) {}
  @Post() create(@Req() request: UserRequest, @Body(new ZodValidationPipe(complaintCreate)) body: z.infer<typeof complaintCreate>) { return this.service.createComplaint(principal(request), { targetType: body.target_type, targetId: body.target_id, complaintType: body.complaint_type, description: body.description, fileIds: body.file_ids }, metadata(request)); }
  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(userList)) query: z.infer<typeof userList>) { return this.service.listUserComplaints(principal(request), query); }
  @Get(":complaintId") detail(@Req() request: UserRequest, @Param("complaintId", new ZodValidationPipe(uuid)) complaintId: string) { return this.service.getUserComplaint(principal(request), complaintId); }
  @Post(":complaintId/evidences") evidence(@Req() request: UserRequest, @Param("complaintId", new ZodValidationPipe(uuid)) complaintId: string, @Body(new ZodValidationPipe(evidenceCreate)) body: z.infer<typeof evidenceCreate>) { return this.service.addComplaintEvidence(principal(request), complaintId, body.version, body.file_id, body.description, metadata(request)); }
}

@Controller("admin-api/v1/complaints")
@RequireMfa()
export class AdminComplaintController {
  constructor(private readonly service: AfterSaleService) {}
  @Get() @RequirePermissions("complaint.read") list(@Query(new ZodValidationPipe(adminList.extend({ status: z.enum(complaintStatuses).optional() }))) query: z.infer<typeof adminList>&{status?:typeof complaintStatuses[number]}) { return this.service.listAdminComplaints(query); }
  @Get(":complaintId") @RequirePermissions("complaint.read") detail(@Param("complaintId", new ZodValidationPipe(uuid)) complaintId: string) { return this.service.getAdminComplaint(complaintId); }
  @Post(":complaintId/actions") @RequirePermissions("complaint.manage") action(@Req() request: UserRequest, @Param("complaintId", new ZodValidationPipe(uuid)) complaintId: string, @Body(new ZodValidationPipe(complaintAction)) body: z.infer<typeof complaintAction>) { return this.service.adminTransitionComplaint(principal(request), complaintId, body, metadata(request)); }
}

@Controller("api/v1/reviews")
export class UserReviewController {
  constructor(private readonly service: AfterSaleService) {}
  @Post() create(@Req() request: UserRequest, @Headers("idempotency-key") key: string | undefined, @Body(new ZodValidationPipe(reviewCreate)) body: z.infer<typeof reviewCreate>) { return this.service.createReview(principal(request), { orderId: body.order_id, rating: body.rating, content: body.content, anonymous: body.anonymous, imageFileIds: body.image_file_ids }, metadata(request), key === undefined ? undefined : idempotencyKey(key)); }
  @Get("me") mine(@Req() request: UserRequest, @Query(new ZodValidationPipe(userList)) query: z.infer<typeof userList>) { return this.service.listMyReviews(principal(request), query); }
  @Get(":reviewId") detail(@Req() request: UserRequest, @Param("reviewId", new ZodValidationPipe(uuid)) reviewId: string) { return this.service.getMyReview(principal(request), reviewId); }
}

@Controller("api/v1/products/:productId/reviews")
export class PublicReviewController {
  constructor(private readonly service: AfterSaleService) {}
  @Get() @Public() list(@Param("productId", new ZodValidationPipe(uuid)) productId: string, @Query(new ZodValidationPipe(reviewList)) query: z.infer<typeof reviewList>) { return this.service.listPublicReviews(productId, query); }
}

@Controller("api/v1/companions/:sellerId/reviews")
export class PublicSellerReviewController {
  constructor(private readonly service: AfterSaleService) {}
  @Get() @Public() list(@Param("sellerId", new ZodValidationPipe(uuid)) sellerId: string, @Query(new ZodValidationPipe(reviewList)) query: z.infer<typeof reviewList>) { return this.service.listPublicSellerReviews(sellerId, query); }
}

@Controller("admin-api/v1/reviews")
@RequireMfa()
export class AdminReviewController {
  constructor(private readonly service: AfterSaleService) {}
  @Get() @RequirePermissions("review.read") list(@Query(new ZodValidationPipe(adminList.extend({ status: z.enum(reviewStatuses).optional() }))) query: z.infer<typeof adminList>&{status?:typeof reviewStatuses[number]}) { return this.service.listAdminReviews(query); }
  @Get(":reviewId") @RequirePermissions("review.read") detail(@Param("reviewId",new ZodValidationPipe(uuid))reviewId:string){return this.service.getAdminReview(reviewId);}
  @Post(":reviewId/moderation") @RequirePermissions("review.manage") moderate(@Req() request: UserRequest, @Param("reviewId", new ZodValidationPipe(uuid)) reviewId: string, @Body(new ZodValidationPipe(reviewModeration)) body: z.infer<typeof reviewModeration>) { return this.service.moderateReview(principal(request), reviewId, body, metadata(request)); }
}

type UserRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: UserRequest) { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal.sub; }
function idempotencyKey(value: string | undefined) { if (!value || value.length < 8 || value.length > 128) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "Idempotency-Key 必须为 8 到 128 个字符", statusCode: 400 }); return value; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
