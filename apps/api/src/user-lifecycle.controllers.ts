import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { z } from "zod";
import type { FastifyRequest } from "fastify";
import { requestContext } from "@xiongzai/observability";
import { RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { UserLifecycleService } from "./user-lifecycle.service.js";

const uuid = z.uuid();
const version = z.object({ version: z.number().int().nonnegative() });
const phoneCreate = z.object({ new_phone: z.string().trim().min(11).max(20) });
const phoneVerify = z.object({ code: z.string().regex(/^\d{6}$/u), version: z.number().int().nonnegative() });
const phoneCancel = z.object({ status: z.enum(["PENDING_OLD_VERIFICATION", "PENDING_NEW_VERIFICATION", "READY"]), version: z.number().int().nonnegative() });
const cancellationCreate = z.object({ reason: z.string().trim().min(2).max(500) });
const cancellationStatus = z.enum(["REQUESTED", "CANCELLED", "PROCESSING", "COMPLETED", "REJECTED"]).optional();
const adminCancellationList = z.object({
  status: cancellationStatus,
  cursor: z.string().trim().min(1).max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["created_desc", "created_asc"]).default("created_desc"),
});
const adminReject = z.object({ version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(500) });
const phoneStatus = z.enum(["PENDING_OLD_VERIFICATION", "PENDING_NEW_VERIFICATION", "READY", "COMPLETED", "CANCELLED", "EXPIRED"]);
const exportStatus = z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "EXPIRED"]);
const adminLifecycleList = z.object({
  cursor: z.string().trim().min(1).max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["created_desc", "created_asc"]).default("created_desc"),
});
const adminPhoneList = adminLifecycleList.extend({ status: phoneStatus.optional() });
const adminExportList = adminLifecycleList.extend({ status: exportStatus.optional() });

@Controller("api/v1/me")
export class UserLifecycleController {
  constructor(private readonly service: UserLifecycleService) {}

  @Post("phone-change-requests")
  createPhone(@Req() request: UserRequest, @Headers("idempotency-key") key: string | undefined, @Body(new ZodValidationPipe(phoneCreate)) body: z.infer<typeof phoneCreate>) { return this.service.createPhoneChange(principal(request).sub, body.new_phone, idempotencyKey(key), metadata(request)); }
  @Get("phone-change-requests") listPhones(@Req() request: UserRequest) { return this.service.listPhoneChanges(principal(request).sub); }
  @Post("phone-change-requests/:id/old-code/send") @HttpCode(202)
  sendOld(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.sendPhoneChangeCode(principal(request).sub, id, "old", metadata(request)); }
  @Post("phone-change-requests/:id/old-code/verify")
  verifyOld(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(phoneVerify)) body: z.infer<typeof phoneVerify>) { return this.service.verifyPhoneChangeCode(principal(request).sub, id, "old", body.code, body.version, metadata(request)); }
  @Post("phone-change-requests/:id/new-code/send") @HttpCode(202)
  sendNew(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.sendPhoneChangeCode(principal(request).sub, id, "new", metadata(request)); }
  @Post("phone-change-requests/:id/new-code/verify")
  verifyNew(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(phoneVerify)) body: z.infer<typeof phoneVerify>) { return this.service.verifyPhoneChangeCode(principal(request).sub, id, "new", body.code, body.version, metadata(request)); }
  @Post("phone-change-requests/:id/cancel")
  cancelPhone(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(phoneCancel)) body: z.infer<typeof phoneCancel>) { return this.service.cancelPhoneChange(principal(request).sub, id, body.status, body.version, metadata(request)); }

  @Post("data-exports")
  createExport(@Req() request: UserRequest, @Headers("idempotency-key") key: string | undefined) { return this.service.createDataExport(principal(request).sub, idempotencyKey(key), metadata(request)); }
  @Get("data-exports") listExports(@Req() request: UserRequest) { return this.service.listDataExports(principal(request).sub); }
  @Get("data-exports/:id/download") download(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.dataExportDownload(principal(request).sub, id); }

  @Post("account-cancellations")
  createCancellation(@Req() request: UserRequest, @Headers("idempotency-key") key: string | undefined, @Body(new ZodValidationPipe(cancellationCreate)) body: z.infer<typeof cancellationCreate>) { return this.service.createCancellation(principal(request).sub, body.reason, idempotencyKey(key), metadata(request)); }
  @Get("account-cancellations/eligibility")
  cancellationEligibility(@Req() request: UserRequest) { return this.service.cancellationEligibility(principal(request).sub); }
  @Get("account-cancellations") listCancellations(@Req() request: UserRequest) { return this.service.listCancellations(principal(request).sub); }
  @Post("account-cancellations/:id/revoke")
  revokeCancellation(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(version)) body: z.infer<typeof version>) { return this.service.cancelCancellation(principal(request).sub, id, body.version, metadata(request)); }
}

@Controller("admin-api/v1")
@RequireMfa()
export class AdminUserLifecycleMonitorController {
  constructor(private readonly service: UserLifecycleService) {}
  @Get("phone-change-requests") @RequirePermissions("user.read")
  phones(@Query(new ZodValidationPipe(adminPhoneList)) query: z.infer<typeof adminPhoneList>) { return this.service.adminListPhoneChanges(query); }
  @Get("phone-change-requests/:id") @RequirePermissions("user.read")
  phone(@Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.adminPhoneChangeDetail(id); }
  @Get("data-export-jobs") @RequirePermissions("user.read")
  exports(@Query(new ZodValidationPipe(adminExportList)) query: z.infer<typeof adminExportList>) { return this.service.adminListDataExports(query); }
  @Get("data-export-jobs/:id") @RequirePermissions("user.read")
  export(@Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.adminDataExportDetail(id); }
}

@Controller("admin-api/v1/account-cancellations")
@RequireMfa()
export class AdminAccountCancellationController {
  constructor(private readonly service: UserLifecycleService) {}
  @Get() @RequirePermissions("user.read")
  list(@Query(new ZodValidationPipe(adminCancellationList)) query: z.infer<typeof adminCancellationList>) { return this.service.adminListCancellations(query); }
  @Get(":id") @RequirePermissions("user.read")
  detail(@Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.adminCancellationDetail(id); }
  @Post(":id/reject") @RequirePermissions("user.status.manage")
  reject(@Req() request: UserRequest, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(adminReject)) body: z.infer<typeof adminReject>) { return this.service.adminRejectCancellation(principal(request).sub, id, body.version, body.reason, metadata(request)); }
}

type UserRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: UserRequest) { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal; }
function idempotencyKey(value: string | undefined) { const key = value?.trim(); if (!key || key.length > 160) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "缺少或无效的 Idempotency-Key", statusCode: 400 }); return key; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
