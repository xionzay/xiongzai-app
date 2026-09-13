import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { FileStorageService, fileTypes } from "./file-storage.service.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";

const uuid = z.uuid();
const fileType = z.enum(fileTypes);
const uploadRequest = z.object({
  file_type: fileType,
  mime_type: z.string().trim().min(3).max(128).transform((value) => value.toLowerCase()),
  size_bytes: z.number().int().positive().max(20 * 1_024 * 1_024),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/u),
});
const moderationList = z.object({
  upload_status: z.enum(["PENDING", "UPLOADED", "VERIFIED", "FAILED", "DELETED"]).optional(),
  moderation_status: z.enum(["PENDING", "APPROVED", "REJECTED", "FLAGGED"]).optional(),
  cursor: z.string().trim().min(1).max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(["created_desc", "created_asc"]).default("created_desc"),
});
const moderation = z.object({ decision: z.enum(["APPROVED", "REJECTED", "FLAGGED"]), reason: z.string().trim().min(2).max(1000) });
const myFilesQuery = z.object({
  file_type: fileType.optional(),
  upload_status: z.enum(["PENDING", "UPLOADED", "VERIFIED", "FAILED"]).optional(),
  moderation_status: z.enum(["PENDING", "APPROVED", "REJECTED", "FLAGGED"]).optional(),
  cursor: z.string().trim().min(1).max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller("api/v1/files")
export class UserFileController {
  constructor(private readonly service: FileStorageService) {}

  @Get("policies") @Public() policies() { return this.service.listPolicies(); }
  @Post("uploads") requestUpload(@Req() request: UserRequest, @Body(new ZodValidationPipe(uploadRequest)) body: z.infer<typeof uploadRequest>) { return this.service.requestUserUpload(principal(request), { fileType: body.file_type, mimeType: body.mime_type, sizeBytes: body.size_bytes, sha256: body.sha256 }); }
  @Post(":fileId/complete") complete(@Req() request: UserRequest, @Param("fileId", new ZodValidationPipe(uuid)) fileId: string) { return this.service.completeUserUpload(principal(request), fileId); }
  @Get(":fileId/access") access(@Req() request: UserRequest, @Param("fileId", new ZodValidationPipe(uuid)) fileId: string) { return this.service.getMyFile(principal(request), fileId); }
  @Delete(":fileId") remove(@Req() request: UserRequest, @Param("fileId", new ZodValidationPipe(uuid)) fileId: string) { return this.service.deleteMyFile(principal(request), fileId); }
}

@Controller("api/v1/me/files")
export class MyFileController {
  constructor(private readonly service: FileStorageService) {}

  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(myFilesQuery)) query: z.infer<typeof myFilesQuery>) {
    return this.service.listMyFiles(principal(request), { fileType: query.file_type, uploadStatus: query.upload_status, moderationStatus: query.moderation_status, cursor: query.cursor, limit: query.limit });
  }
}

@Controller("admin-api/v1/files")
@RequireMfa()
export class AdminFileController {
  constructor(private readonly service: FileStorageService) {}

  @Get() @RequirePermissions("file.read") list(@Query(new ZodValidationPipe(moderationList)) query: z.infer<typeof moderationList>) { return this.service.listForModeration({ uploadStatus: query.upload_status, moderationStatus: query.moderation_status, cursor:query.cursor,limit: query.limit,sort:query.sort }); }
  @Post("uploads") @RequirePermissions("file.manage") requestUpload(@Req() request: AdminRequest, @Body(new ZodValidationPipe(uploadRequest)) body: z.infer<typeof uploadRequest>) { return this.service.requestAdminUpload(principal(request), { fileType: body.file_type, mimeType: body.mime_type, sizeBytes: body.size_bytes, sha256: body.sha256 },metadata(request)); }
  @Post(":fileId/complete") @RequirePermissions("file.manage") complete(@Req()request:AdminRequest,@Param("fileId", new ZodValidationPipe(uuid)) fileId: string) { return this.service.completeAdminUpload(principal(request),fileId,metadata(request)); }
  @Get(":fileId/access") @RequirePermissions("file.read") access(@Param("fileId", new ZodValidationPipe(uuid)) fileId: string) { return this.service.getAdminFile(fileId); }
  @Get(":fileId/preview") @RequirePermissions("file.read", "file.review") async preview(@Req() request: AdminRequest, @Res() reply: FastifyReply, @Param("fileId", new ZodValidationPipe(uuid)) fileId: string): Promise<void> {
    const result = await this.service.previewAdminFile(principal(request), fileId, headerValue(request.headers.range), metadata(request));
    reply.status(result.range ? 206 : 200);
    reply.header("accept-ranges", "bytes");
    reply.header("cache-control", "no-store, private");
    reply.header("content-disposition", result.disposition);
    reply.header("content-length", String(result.contentLength));
    reply.header("content-security-policy", "default-src 'none'; sandbox");
    reply.header("cross-origin-resource-policy", "same-origin");
    reply.header("content-type", result.contentType);
    reply.header("x-content-type-options", "nosniff");
    if (result.range) reply.header("content-range", `bytes ${result.range.start}-${result.range.end}/${result.totalSize}`);
    const destroyOnDisconnect = () => { if (!reply.raw.writableFinished) result.body.destroy(new Error("admin_preview_client_disconnected")); };
    const removeDisconnectHandler = () => reply.raw.off("close", destroyOnDisconnect);
    reply.raw.once("close", destroyOnDisconnect);
    result.body.once("close", removeDisconnectHandler);
    result.body.once("end", removeDisconnectHandler);
    await reply.send(result.body);
  }
  @Post(":fileId/moderation") @RequirePermissions("file.review") moderate(@Req() request: AdminRequest, @Param("fileId", new ZodValidationPipe(uuid)) fileId: string, @Body(new ZodValidationPipe(moderation)) body: z.infer<typeof moderation>) { return this.service.moderate(principal(request), fileId, body.decision, body.reason, metadata(request)); }
}

type UserRequest = FastifyRequest & AuthenticatedRequest;
type AdminRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: UserRequest): string { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal.sub; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
function headerValue(value: string | string[] | undefined): string | undefined { return typeof value === "string" ? value : value?.[0]; }
