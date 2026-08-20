import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { ChatSupportNotificationService } from "./chat-support-notification.service.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";

const uuid = z.uuid();
const listSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional() });
const consultationSchema = z.object({ product_id: uuid });
const orderConversationSchema = z.object({ order_id: uuid });
const messageSchema = z.object({ client_message_id: z.string().trim().min(8).max(128), content: z.string().trim().min(1).max(500) });
const readSchema = z.object({ last_read_sequence_no: z.string().regex(/^\d+$/u).transform(BigInt) });
const priorities = ["NORMAL", "MEDIUM", "HIGH", "URGENT"] as const;
const supportStatuses = ["WAITING", "SERVING", "TRANSFERRED", "CLOSED"] as const;
const relatedTypes = ["ORDER", "PAYMENT", "REFUND", "COMPLAINT", "WITHDRAWAL"] as const;
const supportCreateSchema = z.object({ topic: z.string().trim().min(2).max(120), priority: z.enum(priorities).default("NORMAL"), queue_key: z.string().trim().min(2).max(64).default("general"), related_type: z.enum(relatedTypes).optional(), related_id: uuid.optional(), source_page: z.string().trim().max(128).optional(), initial_message: z.string().trim().min(1).max(500) }).refine((value) => (value.related_type === undefined) === (value.related_id === undefined), { message: "关联业务类型和编号必须同时填写", path: ["related_id"] });
const versionReasonSchema = z.object({ version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(1000) });
const versionSchema = z.object({ version: z.number().int().nonnegative() });
const transferSchema = versionReasonSchema.extend({ queue_key: z.string().trim().min(2).max(64) });
const adminListSchema = z.object({ status: z.enum(supportStatuses).optional(), queue_key: z.string().trim().min(1).max(64).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });
const evidenceSchema = z.object({ reason: z.string().trim().min(4).max(1000) });
const notificationListSchema = listSchema.extend({ category: z.enum(["ORDER", "ACCOUNT", "PLATFORM"]).optional() });

@Controller("api/v1/conversations")
export class UserConversationController {
  constructor(private readonly service: ChatSupportNotificationService) {}
  @Post("consultations") createConsultation(@Req() request: UserRequest, @Body(new ZodValidationPipe(consultationSchema)) body: z.infer<typeof consultationSchema>) { return this.service.createConsultation(principal(request), body.product_id, metadata(request)); }
  @Post("orders") createOrder(@Req() request: UserRequest, @Body(new ZodValidationPipe(orderConversationSchema)) body: z.infer<typeof orderConversationSchema>) { return this.service.createOrderConversation(principal(request), body.order_id, metadata(request)); }
  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.service.listUserConversations(principal(request), query); }
  @Get(":conversationId/messages") messages(@Req() request: UserRequest, @Param("conversationId", new ZodValidationPipe(uuid)) conversationId: string, @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.service.listUserMessages(principal(request), conversationId, query); }
  @Post(":conversationId/messages") send(@Req() request: UserRequest, @Param("conversationId", new ZodValidationPipe(uuid)) conversationId: string, @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>) { return this.service.sendUserMessage(principal(request), conversationId, { clientMessageId: body.client_message_id, content: body.content }, metadata(request)); }
  @Post(":conversationId/read") read(@Req() request: UserRequest, @Param("conversationId", new ZodValidationPipe(uuid)) conversationId: string, @Body(new ZodValidationPipe(readSchema)) body: z.infer<typeof readSchema>) { return this.service.markUserRead(principal(request), conversationId, body.last_read_sequence_no); }
}

@Controller("api/v1/support-cases")
export class UserSupportCaseController {
  constructor(private readonly service: ChatSupportNotificationService) {}
  @Post() create(@Req() request: UserRequest, @Body(new ZodValidationPipe(supportCreateSchema)) body: z.infer<typeof supportCreateSchema>) { return this.service.createSupportCase(principal(request), { topic: body.topic, priority: body.priority, queueKey: body.queue_key, relatedType: body.related_type, relatedId: body.related_id, sourcePage: body.source_page, initialMessage: body.initial_message }, metadata(request)); }
  @Get() list(@Req() request: UserRequest) { return this.service.listUserSupportCases(principal(request)); }
  @Get(":caseId") detail(@Req() request: UserRequest, @Param("caseId", new ZodValidationPipe(uuid)) caseId: string) { return this.service.getUserSupportCase(principal(request), caseId); }
  @Post(":caseId/reopen") reopen(@Req() request: UserRequest, @Param("caseId", new ZodValidationPipe(uuid)) caseId: string, @Body(new ZodValidationPipe(versionReasonSchema)) body: z.infer<typeof versionReasonSchema>) { return this.service.reopenUserSupportCase(principal(request), caseId, body.version, body.reason, metadata(request)); }
}

@Controller("api/v1/notifications")
export class UserNotificationController {
  constructor(private readonly service: ChatSupportNotificationService) {}
  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(notificationListSchema)) query: z.infer<typeof notificationListSchema>) { return this.service.listNotifications(principal(request), query); }
  @Get(":notificationId") detail(@Req() request: UserRequest, @Param("notificationId", new ZodValidationPipe(uuid)) notificationId: string) { return this.service.getNotification(principal(request), notificationId); }
  @Post(":notificationId/read") read(@Req() request: UserRequest, @Param("notificationId", new ZodValidationPipe(uuid)) notificationId: string) { return this.service.markNotificationRead(principal(request), notificationId); }
  @Post("read-all") readAll(@Req() request: UserRequest) { return this.service.markAllNotificationsRead(principal(request)); }
}

@Controller("admin-api/v1/support-cases")
@RequireMfa()
export class AdminSupportCaseController {
  constructor(private readonly service: ChatSupportNotificationService) {}
  @Get() @RequirePermissions("support.read") list(@Query(new ZodValidationPipe(adminListSchema)) query: z.infer<typeof adminListSchema>) { return this.service.listAdminSupportCases({ status: query.status, queueKey: query.queue_key, limit: query.limit }); }
  @Get(":caseId") @RequirePermissions("support.read") detail(@Param("caseId", new ZodValidationPipe(uuid)) caseId: string) { return this.service.getAdminSupportCase(caseId); }
  @Get(":caseId/messages") @RequirePermissions("support.read") messages(@Req() request: UserRequest, @Param("caseId", new ZodValidationPipe(uuid)) caseId: string, @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.service.listAdminSupportMessages(principal(request), caseId, query); }
  @Post(":caseId/receive") @RequirePermissions("support.manage") receive(@Req() request: UserRequest, @Param("caseId", new ZodValidationPipe(uuid)) caseId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.receiveSupportCase(principal(request), caseId, body.version, metadata(request)); }
  @Post(":caseId/transfer") @RequirePermissions("support.manage") transfer(@Req() request: UserRequest, @Param("caseId", new ZodValidationPipe(uuid)) caseId: string, @Body(new ZodValidationPipe(transferSchema)) body: z.infer<typeof transferSchema>) { return this.service.transferSupportCase(principal(request), caseId, { version: body.version, queueKey: body.queue_key, reason: body.reason }, metadata(request)); }
  @Post(":caseId/reply") @RequirePermissions("support.reply") reply(@Req() request: UserRequest, @Param("caseId", new ZodValidationPipe(uuid)) caseId: string, @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>) { return this.service.replySupportCase(principal(request), caseId, { clientMessageId: body.client_message_id, content: body.content }, metadata(request)); }
  @Post(":caseId/close") @RequirePermissions("support.manage") close(@Req() request: UserRequest, @Param("caseId", new ZodValidationPipe(uuid)) caseId: string, @Body(new ZodValidationPipe(versionReasonSchema)) body: z.infer<typeof versionReasonSchema>) { return this.service.closeSupportCase(principal(request), caseId, body.version, body.reason, metadata(request)); }
}

@Controller("admin-api/v1/conversations")
@RequireMfa()
export class AdminConversationEvidenceController {
  constructor(private readonly service: ChatSupportNotificationService) {}
  @Get() @RequirePermissions("conversation.evidence.read") list(@Query(new ZodValidationPipe(z.object({ limit:z.coerce.number().int().min(1).max(100).default(50) }))) query:{limit:number}) { return this.service.listOrderConversations(query.limit); }
  @Post(":conversationId/evidence-view") @RequirePermissions("conversation.evidence.read") view(@Req() request: UserRequest, @Param("conversationId", new ZodValidationPipe(uuid)) conversationId: string, @Body(new ZodValidationPipe(evidenceSchema)) body: z.infer<typeof evidenceSchema>) { return this.service.auditOrderConversationView(principal(request), conversationId, body.reason, metadata(request)); }
}

type UserRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: UserRequest) { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal.sub; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
