import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { AppError, errorCodes, policyTypes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { PolicyGovernanceService } from "./policy-governance.service.js";

const policyType = z.enum(policyTypes);
const policyId = z.uuid();
const listSchema = z.object({ policy_type: policyType.optional(), status: z.enum(["DRAFT", "PUBLISHED", "RETIRED"]).optional() });
const createSchema = z.object({ policy_type: policyType, title: z.string().trim().min(2).max(200), content: z.string().trim().min(1).max(200_000), reason: z.string().trim().min(2).max(1000) });
const editSchema = z.object({ title: z.string().trim().min(2).max(200), content: z.string().trim().min(1).max(200_000), version: z.string().min(20).max(100), reason: z.string().trim().min(2).max(1000) });
const publishSchema = z.object({ effective_at: z.iso.datetime({ offset: true }), requires_reacceptance: z.boolean().default(false), version: z.string().min(20).max(100), reason: z.string().trim().min(2).max(1000) });
const decisionSchema = z.object({ version: z.string().min(20).max(100), reason: z.string().trim().min(2).max(1000) });

@Controller("admin-api/v1/policies")
@RequireMfa()
export class AdminPolicyController {
  constructor(private readonly service: PolicyGovernanceService) {}

  @Get() @RequirePermissions("policy.read")
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.service.list({ policyType: query.policy_type, status: query.status }); }

  @Get("versions/:policyVersionId") @RequirePermissions("policy.read")
  detail(@Param("policyVersionId", new ZodValidationPipe(policyId)) id: string) { return this.service.detail(id); }

  @Get(":policyType/versions") @RequirePermissions("policy.read")
  history(@Param("policyType", new ZodValidationPipe(policyType)) type: z.infer<typeof policyType>) { return this.service.history(type); }

  @Post() @RequirePermissions("policy.manage")
  create(@Req() request: AdminRequest, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.service.createDraft(principal(request), { policyType: body.policy_type, title: body.title, content: body.content, reason: body.reason }, metadata(request));
  }

  @Patch(":policyVersionId") @RequirePermissions("policy.manage")
  edit(@Req() request: AdminRequest, @Param("policyVersionId", new ZodValidationPipe(policyId)) id: string, @Body(new ZodValidationPipe(editSchema)) body: z.infer<typeof editSchema>) {
    return this.service.editDraft(principal(request), id, body, metadata(request));
  }

  @Post(":policyVersionId/publish") @RequirePermissions("policy.manage")
  publish(@Req() request: AdminRequest, @Param("policyVersionId", new ZodValidationPipe(policyId)) id: string, @Body(new ZodValidationPipe(publishSchema)) body: z.infer<typeof publishSchema>) {
    return this.service.publish(principal(request), id, { effectiveAt: new Date(body.effective_at), requiresReacceptance: body.requires_reacceptance, version: body.version, reason: body.reason }, metadata(request));
  }

  @Post(":policyVersionId/retire") @RequirePermissions("policy.manage")
  retire(@Req() request: AdminRequest, @Param("policyVersionId", new ZodValidationPipe(policyId)) id: string, @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>) {
    return this.service.retire(principal(request), id, body, metadata(request));
  }
}

type AdminRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: AdminRequest) { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal.sub; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
