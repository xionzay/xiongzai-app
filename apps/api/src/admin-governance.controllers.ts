import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { AppError, errorCodes, productGames, orderStatuses, afterSaleStatuses } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { AdminGovernanceService } from "./admin-governance.service.js";
import { isProtectedEnvironment, type ApiConfig } from "./config.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { API_CONFIG } from "./tokens.js";
import { Inject } from "@nestjs/common";

const loginSchema = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(8).max(256) });
const mfaSchema = z.object({ code: z.string().regex(/^\d{6}$/u) });
const roleSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_.-]{2,63}$/u), name: z.string().trim().min(2).max(64), description: z.string().trim().max(500).optional(), permission_keys: z.array(z.string().min(1).max(128)).max(200), reason: z.string().trim().min(2).max(1000) });
const assignRolesSchema = z.object({ role_ids: z.array(z.uuid()).max(30), version: z.number().int().nonnegative(), confirm_empty_roles: z.boolean().default(false), reason: z.string().trim().min(2).max(1000) });
const pageSchema = z.object({
  cursor: z.string().trim().min(1).max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().min(1).max(100).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  target_id: z.uuid().optional(),
  sort: z.enum(["created_desc", "created_asc"]).default("created_desc"),
});
const productPageSchema = pageSchema.extend({ game: z.enum(productGames).optional() });
const orderPageSchema = pageSchema.extend({ status: z.enum(orderStatuses).optional(), after_sale_status: z.enum(afterSaleStatuses).optional() });
const userStatusSchema = z.object({ current_status: z.enum(["NORMAL", "DISABLED", "CANCELLED"]), next_status: z.enum(["NORMAL", "DISABLED"]), version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(1000) });
const riskSchema = z.object({ version: z.number().int().nonnegative(), resolution: z.string().trim().min(2).max(2000), reason: z.string().trim().min(2).max(1000) });
const createRiskSchema = z.object({ risk_type:z.string().trim().min(2).max(128), severity:z.enum(["NORMAL","MEDIUM","HIGH","URGENT"]), target_type:z.enum(["USER","SELLER","PRODUCT","ORDER","PAYMENT","REFUND","COMPLAINT","REVIEW","WITHDRAWAL","CONVERSATION","SUPPORT_CASE","PLATFORM"]), target_id:z.uuid(), rule_key:z.string().trim().min(2).max(128), details_json:z.record(z.string(),z.unknown()).default({}), reason:z.string().trim().min(2).max(1000) });
const configSchema = z.object({ config_key: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/u), value_json: z.unknown(), reason: z.string().trim().min(2).max(1000) });
const searchSchema = z.object({ q: z.string().trim().min(2).max(100) });
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "日期必须使用 YYYY-MM-DD");
const trendSchema = z.object({ from: dateText, to: dateText, granularity: z.literal("day").default("day") }).superRefine((value, context) => {
  const from = Date.parse(`${value.from}T00:00:00.000Z`); const to = Date.parse(`${value.to}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || new Date(from).toISOString().slice(0, 10) !== value.from || new Date(to).toISOString().slice(0, 10) !== value.to) context.addIssue({ code: "custom", message: "日期不存在" });
  else if (from > to) context.addIssue({ code: "custom", message: "开始日期不能晚于结束日期" });
  else if ((to - from) / 86_400_000 + 1 > 90) context.addIssue({ code: "custom", message: "日期范围最多为 90 个自然日" });
});
const dashboardSchema = z.object({ from: dateText.optional(), to: dateText.optional() }).superRefine((value, context) => {
  if (Boolean(value.from) !== Boolean(value.to)) context.addIssue({ code: "custom", message: "开始日期和结束日期必须同时提供" });
  if (!value.from || !value.to) return;
  const from = Date.parse(`${value.from}T00:00:00.000Z`); const to = Date.parse(`${value.to}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || new Date(from).toISOString().slice(0, 10) !== value.from || new Date(to).toISOString().slice(0, 10) !== value.to) context.addIssue({ code: "custom", message: "日期不存在" });
  else if (from > to) context.addIssue({ code: "custom", message: "开始日期不能晚于结束日期" });
  else if ((to - from) / 86_400_000 + 1 > 90) context.addIssue({ code: "custom", message: "日期范围最多为 90 个自然日" });
});

@Controller("admin-api/v1/auth")
export class AdminAuthController {
  constructor(private readonly service: AdminGovernanceService, @Inject(API_CONFIG) private readonly config: ApiConfig) {}
  @Post("login") @Public() @HttpCode(200)
  async login(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>) {
    const result = await this.service.login(body.username, body.password, metadata(request));
    if (result.mfaRequired) { reply.header("set-cookie", cookie("xiongzai_admin_challenge", result.challenge!, result.challengeExpiresInSeconds!, "/admin-api/v1/auth", this.config)); return { mfa_required: true, challenge_expires_in_seconds: result.challengeExpiresInSeconds }; }
    setAdminCookie(reply, result.session!, this.config); return response(result.session!);
  }
  @Post("mfa/verify") @Public() @HttpCode(200)
  async verify(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Body(new ZodValidationPipe(mfaSchema)) body: z.infer<typeof mfaSchema>) {
    const challenge = readCookie(request.headers.cookie, "xiongzai_admin_challenge"); if (!challenge) throw new AppError({ code: errorCodes.ADMIN_MFA_REQUIRED, message: "安全验证已过期，请重新登录", statusCode: 401 });
    const result = await this.service.verifyMfa(challenge, body.code, metadata(request)); reply.header("set-cookie", [cookie("xiongzai_admin_challenge", "", 0, "/admin-api/v1/auth", this.config), cookie("xiongzai_admin_access", result.accessToken, this.config.accessTokenTtlSeconds, "/", this.config)]); return response(result);
  }
  @Get("session") session(@Req() request: AdminRequest) { return this.service.session(principal(request).sub); }
  @Post("logout") @HttpCode(204) async logout(@Req() request: AdminRequest, @Res({ passthrough: true }) reply: FastifyReply) { const actor = principal(request); await this.service.logout(actor.sub, actor.session_id, metadata(request)); reply.header("set-cookie", cookie("xiongzai_admin_access", "", 0, "/", this.config)); }
}

@Controller("admin-api/v1/rbac") @RequireMfa()
export class AdminRbacController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get("admins") @RequirePermissions("admin.read") admins(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.service.listAdmins(query); }
  @Get("admins/:adminId") @RequirePermissions("admin.read") admin(@Param("adminId", new ZodValidationPipe(z.uuid())) adminId: string) { return this.service.adminDetail(adminId); }
  @Get("roles") @RequirePermissions("role.read") roles(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.service.listRoles(query); }
  @Get("roles/:roleId") @RequirePermissions("role.read") role(@Param("roleId", new ZodValidationPipe(z.uuid())) roleId: string) { return this.service.roleDetail(roleId); }
  @Get("permissions") @RequirePermissions("role.read") permissions() { return this.service.listPermissions(); }
  @Post("roles") @RequirePermissions("role.manage") createRole(@Req() request: AdminRequest, @Body(new ZodValidationPipe(roleSchema)) body: z.infer<typeof roleSchema>) { return this.service.createRole(principal(request), { key: body.key, name: body.name, description: body.description, permissionKeys: body.permission_keys, reason: body.reason }, metadata(request)); }
  @Patch("admins/:adminId/roles") @RequirePermissions("admin.manage", "role.manage") assign(@Req() request: AdminRequest, @Param("adminId", new ZodValidationPipe(z.uuid())) adminId: string, @Body(new ZodValidationPipe(assignRolesSchema)) body: z.infer<typeof assignRolesSchema>) { return this.service.assignRoles(principal(request), adminId, body.role_ids, body.version, body.reason, metadata(request), body.confirm_empty_roles); }
}

@Controller("admin-api/v1/users") @RequireMfa()
export class AdminUserGovernanceController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get() @RequirePermissions("user.read") list(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { const status = ["NORMAL", "DISABLED", "CANCELLED"].includes(query.status ?? "") ? query.status as "NORMAL" | "DISABLED" | "CANCELLED" : undefined; return this.service.listUsers({ cursor: query.cursor, limit: query.limit, keyword: query.keyword, status, sort: query.sort }); }
  @Get(":userId") @RequirePermissions("user.read") detail(@Param("userId", new ZodValidationPipe(z.uuid())) userId: string) { return this.service.userDetail(userId); }
  @Patch(":userId/status") @RequirePermissions("user.status.manage") status(@Req() request: AdminRequest, @Param("userId", new ZodValidationPipe(z.uuid())) userId: string, @Body(new ZodValidationPipe(userStatusSchema)) body: z.infer<typeof userStatusSchema>) { return this.service.setUserStatus(principal(request), userId, { currentStatus: body.current_status, nextStatus: body.next_status, version: body.version, reason: body.reason }, metadata(request)); }
}

@Controller("admin-api/v1/catalog") @RequireMfa()
export class AdminCatalogController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get("sellers") @RequirePermissions("seller.read") sellers(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.service.listSellers(query); }
  @Get("products") @RequirePermissions("product.read") products(@Query(new ZodValidationPipe(productPageSchema)) query: z.infer<typeof productPageSchema>) { return this.service.listProducts(query); }
}

@Controller("admin-api/v1/orders") @RequireMfa()
export class AdminOrderGovernanceController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get() @RequirePermissions("order.read") list(@Query(new ZodValidationPipe(orderPageSchema)) query: z.infer<typeof orderPageSchema>) { return this.service.listOrders(query); }
  @Get(":orderId") @RequirePermissions("order.read") detail(@Req() request: AdminRequest, @Param("orderId") orderId: string) { return this.service.orderDetail(orderId, principal(request)); }
}

@Controller("admin-api/v1/payments") @RequireMfa()
export class AdminPaymentGovernanceController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get() @RequirePermissions("payment.read") list(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.service.listPayments(query); }
  @Get(":paymentId") @RequirePermissions("payment.read") detail(@Param("paymentId", new ZodValidationPipe(z.uuid())) paymentId: string) { return this.service.paymentDetail(paymentId); }
}

@Controller("admin-api/v1/governance") @RequireMfa()
export class AdminPlatformGovernanceController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get("dashboard") @RequirePermissions("dashboard.read") dashboard(@Query(new ZodValidationPipe(dashboardSchema)) query: z.infer<typeof dashboardSchema>) { return this.service.dashboard(query.from, query.to); }
  @Get("dashboard/trends") @RequirePermissions("dashboard.read") trends(@Query(new ZodValidationPipe(trendSchema)) query: z.infer<typeof trendSchema>) { return this.service.dashboardTrends(query.from, query.to); }
  @Get("risk-events") @RequirePermissions("risk.read") risks(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.service.listRiskEvents(query); }
  @Get("risk-events/:id") @RequirePermissions("risk.read") risk(@Param("id", new ZodValidationPipe(z.uuid())) id: string) { return this.service.riskDetail(id); }
  @Post("risk-events") @RequirePermissions("risk.manage") createRisk(@Req() request: AdminRequest, @Body(new ZodValidationPipe(createRiskSchema)) body:z.infer<typeof createRiskSchema>) { return this.service.createRisk(principal(request), { riskType:body.risk_type, severity:body.severity, targetType:body.target_type, targetId:body.target_id, ruleKey:body.rule_key, details:body.details_json, reason:body.reason }, metadata(request)); }
  @Post("risk-events/:id/resolve") @RequirePermissions("risk.manage") resolve(@Req() request: AdminRequest, @Param("id", new ZodValidationPipe(z.uuid())) id: string, @Body(new ZodValidationPipe(riskSchema)) body: z.infer<typeof riskSchema>) { return this.service.resolveRisk(principal(request), id, body, metadata(request)); }
  @Get("security-logs") @RequirePermissions("security_log.read") security(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.service.listSecurityLogs(query); }
  @Get("security-logs/:id") @RequirePermissions("security_log.read") securityDetail(@Param("id", new ZodValidationPipe(z.uuid())) id: string) { return this.service.securityLogDetail(id); }
  @Get("operation-logs") @RequirePermissions("admin_log.read") operations(@Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.service.listOperationLogs(query); }
  @Get("operation-logs/:id") @RequirePermissions("admin_log.read") operation(@Param("id", new ZodValidationPipe(z.uuid())) id: string) { return this.service.operationLogDetail(id); }
  @Get("configs") @RequirePermissions("config.read") configs() { return this.service.listConfigs(); }
  @Get("config-definitions") @RequirePermissions("config.read") configDefinitions() { return this.service.configDefinitions(); }
  @Post("configs") @RequirePermissions("config.manage") publish(@Req() request: AdminRequest, @Body(new ZodValidationPipe(configSchema)) body: z.infer<typeof configSchema>) { return this.service.publishConfig(principal(request), { key: body.config_key, value: body.value_json, reason: body.reason }, metadata(request)); }
  @Get("search") @RequirePermissions("global_search.read") search(@Req() request: AdminRequest, @Query(new ZodValidationPipe(searchSchema)) query: z.infer<typeof searchSchema>) { return this.service.globalSearch(principal(request), query.q); }
}

@Controller("admin-api/v1/todos") @RequireMfa()
export class AdminTodoController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get() @RequirePermissions("dashboard.read") list(@Req() request: AdminRequest) { return this.service.todos(principal(request).sub); }
}

@Controller("admin-api/v1/system") @RequireMfa()
export class AdminSystemController {
  constructor(private readonly service: AdminGovernanceService) {}
  @Get("health") @RequirePermissions("system_health.read") health() { return this.service.systemHealth(); }
}

type AdminRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: AdminRequest) { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
function response(result: { sessionId: string; expiresAt: Date; admin: unknown }) { return { session_id: result.sessionId, expires_at: result.expiresAt, token_transport: "http_only_cookie", admin: result.admin }; }
function setAdminCookie(reply: FastifyReply, result: { accessToken: string }, config: ApiConfig) { reply.header("set-cookie", cookie("xiongzai_admin_access", result.accessToken, config.accessTokenTtlSeconds, "/", config)); }
function cookie(name: string, value: string, maxAge: number, path: string, config: ApiConfig) { return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${isProtectedEnvironment(config.environment) ? "; Secure" : ""}`; }
function readCookie(source: string | undefined, name: string) { const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "u").exec(source ?? ""); if (!match?.[1]) return undefined; try { return decodeURIComponent(match[1]); } catch { return undefined; } }
