import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { announcementStatuses, feedbackStatuses } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { CommunityService } from "./community.service.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";

const uuid = z.uuid();
const plainText = (maximum: number) => z.string().trim().min(1).max(maximum * 2).refine(value => [...value].length <= maximum, "文字超过长度上限");
const feedback = z.object({ client_request_id: uuid, content: plainText(5000) }).strict();
const page = z.object({ cursor: z.string().min(1).max(4096).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const feedbackPage = page.extend({ status: z.enum(feedbackStatuses).optional() });
const announcementPage = page.extend({ status: z.enum(announcementStatuses).optional() });
const change = z.object({ version: z.number().int().nonnegative().max(2_147_483_647), reason: plainText(500) }).strict();
const replySchema = change.extend({ reply: plainText(5000) });
const draft = z.object({ title: plainText(120), content: plainText(20000), cover_file_id: uuid.nullable().optional(), reason: plainText(500) }).strict();
const edit = draft.extend({ version: change.shape.version });
const idempotency = new ZodValidationPipe(z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/u, "需要合法的 Idempotency-Key"));
type Request = FastifyRequest & AuthenticatedRequest;
function actor(request: Request) { return request.principal!.sub; }
function key(request: Request) { return idempotency.transform(request.headers["idempotency-key"]); }
function metadata(request: Request): RequestMetadata { const context = requestContext.get(); return { requestId: context?.requestId ?? "unknown", traceId: context?.traceId, ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000) }; }
function noStore(reply: FastifyReply) { reply.header("cache-control", "no-store, private"); }

@Controller("api/v1/feedback")
export class UserFeedbackController {
  constructor(private readonly service: CommunityService) {}
  @Get("policy") policy() { return this.service.feedbackPolicy(); }
  @Post() create(@Req() request: Request, @Res({ passthrough: true }) response: FastifyReply, @Body(new ZodValidationPipe(feedback)) body: z.infer<typeof feedback>) { noStore(response); return this.service.createFeedback(actor(request), body, metadata(request)); }
  @Get() list(@Req() request: Request, @Res({ passthrough: true }) response: FastifyReply, @Query(new ZodValidationPipe(page)) query: z.infer<typeof page>) { noStore(response); return this.service.listFeedback({ ...query, userId: actor(request) }); }
  @Get("requests/:requestId") byRequest(@Req() request: Request, @Res({ passthrough: true }) response: FastifyReply, @Param("requestId", new ZodValidationPipe(uuid)) requestId: string) { noStore(response); return this.service.feedbackByRequest(actor(request), requestId); }
  @Get(":id") detail(@Req() request: Request, @Res({ passthrough: true }) response: FastifyReply, @Param("id", new ZodValidationPipe(uuid)) id: string) { noStore(response); return this.service.feedbackDetail(actor(request), id); }
}

@Controller("admin-api/v1/feedback")
@RequireMfa()
export class AdminFeedbackController {
  constructor(private readonly service: CommunityService) {}
  @Get() @RequirePermissions("feedback.read") list(@Query(new ZodValidationPipe(feedbackPage)) query: z.infer<typeof feedbackPage>) { return this.service.listFeedback(query); }
  @Get(":id") @RequirePermissions("feedback.read") detail(@Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.adminFeedbackDetail(id); }
  @Post(":id/process") @RequirePermissions("feedback.read", "feedback.manage") process(@Req() request: Request, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(change)) body: z.infer<typeof change>) { return this.service.processFeedback(actor(request), id, body, key(request), metadata(request)); }
  @Post(":id/reply") @RequirePermissions("feedback.read", "feedback.reply") reply(@Req() request: Request, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(replySchema)) body: z.infer<typeof replySchema>) { return this.service.replyFeedback(actor(request), id, body, key(request), metadata(request)); }
}

@Controller("api/v1/announcements")
@Public()
export class PublicAnnouncementController {
  constructor(private readonly service: CommunityService) {}
  @Get() list(@Res({ passthrough: true }) response: FastifyReply, @Query(new ZodValidationPipe(page)) query: z.infer<typeof page>) { noStore(response); return this.service.listAnnouncements({ ...query, publicOnly: true }); }
  @Get(":id") detail(@Res({ passthrough: true }) response: FastifyReply, @Param("id", new ZodValidationPipe(uuid)) id: string) { noStore(response); return this.service.announcementDetail(id, true); }
  @Get(":id/cover") cover(@Res({ passthrough: true }) response: FastifyReply, @Param("id", new ZodValidationPipe(uuid)) id: string) { noStore(response); return this.service.announcementCover(id); }
}

@Controller("admin-api/v1/announcements")
@RequireMfa()
export class AdminAnnouncementController {
  constructor(private readonly service: CommunityService) {}
  @Get() @RequirePermissions("announcement.read") list(@Query(new ZodValidationPipe(announcementPage)) query: z.infer<typeof announcementPage>) { return this.service.listAnnouncements(query); }
  @Get(":id") @RequirePermissions("announcement.read") detail(@Param("id", new ZodValidationPipe(uuid)) id: string) { return this.service.announcementDetail(id); }
  @Post() @RequirePermissions("announcement.read", "announcement.manage") create(@Req() request: Request, @Body(new ZodValidationPipe(draft)) body: z.infer<typeof draft>) { return this.service.createAnnouncement(actor(request), body, key(request), metadata(request)); }
  @Post(":id/edit") @RequirePermissions("announcement.read", "announcement.manage") edit(@Req() request: Request, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(edit)) body: z.infer<typeof edit>) { return this.service.changeAnnouncement(actor(request), id, "EDIT", body, key(request), metadata(request)); }
  @Post(":id/publish") @RequirePermissions("announcement.read", "announcement.publish") publish(@Req() request: Request, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(change)) body: z.infer<typeof change>) { return this.service.changeAnnouncement(actor(request), id, "PUBLISH", body, key(request), metadata(request)); }
  @Post(":id/retire") @RequirePermissions("announcement.read", "announcement.publish") retire(@Req() request: Request, @Param("id", new ZodValidationPipe(uuid)) id: string, @Body(new ZodValidationPipe(change)) body: z.infer<typeof change>) { return this.service.changeAnnouncement(actor(request), id, "RETIRE", body, key(request), metadata(request)); }
}
