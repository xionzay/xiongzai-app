import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import type { ApiConfig } from "./config.js";
import { ZodValidationPipe } from "./http.js";
import { IdentityUserService, type RequestMetadata } from "./identity-user.service.js";
import { API_CONFIG } from "./tokens.js";

const phoneSchema = z.string().regex(/^1\d{10}$/u, "请输入正确的 11 位手机号码");
const smsSendSchema = z.object({ phone: phoneSchema });
const smsLoginSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/u, "请输入 6 位验证码"),
  device_id: z.string().min(8).max(128),
  device_type: z.enum(["WEB", "IOS", "ANDROID"]).default("WEB"),
});
const profileSchema = z.object({
  nickname: z.string().trim().min(2).max(16),
  bio: z.string().trim().max(280).nullable().optional(),
  avatar_file_id: z.uuid().nullable().optional(),
  version: z.number().int().nonnegative(),
  user_version: z.number().int().nonnegative(),
});
const privacySchema = z.object({
  show_online_status: z.boolean().optional(),
  show_public_profile: z.boolean().optional(),
  personalized_recommendations: z.boolean().optional(),
  version: z.number().int().nonnegative(),
}).refine((value) => Object.keys(value).some((key) => key !== "version"), { message: "至少修改一项隐私设置" });
const policyAcceptanceSchema = z.object({ policy_version_ids: z.array(z.uuid()).min(1).max(10) });
const identitySubmissionSchema = z.object({
  legal_name: z.string().trim().min(2).max(64),
  document_number: z.string().trim().min(6).max(32),
});
const identityListSchema = z.object({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "EXPIRED", "REVOKED"]).default("PENDING"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const identityReviewSchema = z.object({
  decision: z.enum(["VERIFIED", "REJECTED"]),
  version: z.number().int().nonnegative(),
  rejection_code: z.string().trim().min(1).max(64).optional(),
  rejection_reason: z.string().trim().min(1).max(1000).optional(),
  reason: z.string().trim().min(2).max(1000),
});

@Controller("api/v1/auth")
export class UserAuthController {
  constructor(
    private readonly identity: IdentityUserService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Post("sms/send")
  @Public()
  @HttpCode(202)
  sendSms(@Body(new ZodValidationPipe(smsSendSchema)) body: z.infer<typeof smsSendSchema>) {
    return this.identity.sendLoginCode(body.phone);
  }

  @Post("sms/login")
  @Public()
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(smsLoginSchema)) body: z.infer<typeof smsLoginSchema>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.identity.login({
      phone: body.phone, code: body.code, deviceId: body.device_id, deviceType: body.device_type,
    }, metadata(request));
    setSessionCookies(reply, result, this.config);
    return sessionResponse(result);
  }

  @Post("token/refresh")
  @Public()
  @HttpCode(200)
  async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = readCookie(request.headers.cookie, "xiongzai_refresh");
    if (!token) throw new AppError({ code: errorCodes.AUTH_REFRESH_INVALID, message: "缺少刷新凭证", statusCode: 401 });
    const result = await this.identity.refresh(token);
    setSessionCookies(reply, result, this.config);
    return sessionResponse(result);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: UserRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    const principal = requirePrincipal(request);
    await this.identity.logout(principal.sub, principal.session_id, metadata(request));
    clearSessionCookies(reply, this.config);
  }
}

@Controller("api/v1/me")
export class UserMeController {
  constructor(private readonly identity: IdentityUserService) {}

  @Get()
  getMe(@Req() request: UserRequest) {
    return this.identity.getMe(requirePrincipal(request).sub);
  }

  @Patch("profile")
  updateProfile(@Req() request: UserRequest, @Body(new ZodValidationPipe(profileSchema)) body: z.infer<typeof profileSchema>) {
    return this.identity.updateProfile(requirePrincipal(request).sub, {
      nickname: body.nickname, bio: body.bio, avatarFileId: body.avatar_file_id,
      version: body.version, userVersion: body.user_version,
    }, metadata(request));
  }

  @Get("privacy-settings")
  getPrivacy(@Req() request: UserRequest) {
    return this.identity.getPrivacySettings(requirePrincipal(request).sub);
  }

  @Patch("privacy-settings")
  updatePrivacy(@Req() request: UserRequest, @Body(new ZodValidationPipe(privacySchema)) body: z.infer<typeof privacySchema>) {
    return this.identity.updatePrivacySettings(requirePrincipal(request).sub, {
      showOnlineStatus: body.show_online_status,
      showPublicProfile: body.show_public_profile,
      personalizedRecommendations: body.personalized_recommendations,
      version: body.version,
    }, metadata(request));
  }

  @Get("sessions")
  sessions(@Req() request: UserRequest) {
    return this.identity.listSessions(requirePrincipal(request).sub);
  }

  @Delete("sessions/:sessionId")
  @HttpCode(204)
  async revokeSession(@Req() request: UserRequest, @Param("sessionId", new ZodValidationPipe(z.uuid())) sessionId: string): Promise<void> {
    await this.identity.revokeSession(requirePrincipal(request).sub, sessionId);
  }

  @Get("identity-verification")
  identityStatus(@Req() request: UserRequest) {
    return this.identity.getIdentity(requirePrincipal(request).sub);
  }

  @Post("identity-verification")
  submitIdentity(@Req() request: UserRequest, @Body(new ZodValidationPipe(identitySubmissionSchema)) body: z.infer<typeof identitySubmissionSchema>) {
    return this.identity.submitIdentity(requirePrincipal(request).sub, {
      legalName: body.legal_name, documentNumber: body.document_number,
    }, metadata(request));
  }
}

@Controller("api/v1/policies")
export class UserPolicyController {
  constructor(private readonly identity: IdentityUserService) {}

  @Get("current")
  @Public()
  current() {
    return this.identity.currentPolicies();
  }

  @Post("acceptances")
  accept(@Req() request: UserRequest, @Body(new ZodValidationPipe(policyAcceptanceSchema)) body: z.infer<typeof policyAcceptanceSchema>) {
    return this.identity.acceptPolicies(requirePrincipal(request).sub, body.policy_version_ids, metadata(request));
  }
}

@Controller("admin-api/v1/identity-verifications")
@RequireMfa()
export class AdminIdentityVerificationController {
  constructor(private readonly identity: IdentityUserService) {}

  @Get()
  @RequirePermissions("identity.read")
  list(@Query(new ZodValidationPipe(identityListSchema)) query: z.infer<typeof identityListSchema>) {
    return this.identity.listIdentities(query.status, query.limit);
  }

  @Post(":verificationId/review")
  @RequirePermissions("identity.review")
  review(
    @Req() request: UserRequest,
    @Param("verificationId", new ZodValidationPipe(z.uuid())) verificationId: string,
    @Body(new ZodValidationPipe(identityReviewSchema)) body: z.infer<typeof identityReviewSchema>,
  ) {
    return this.identity.reviewIdentity(requirePrincipal(request).sub, verificationId, {
      decision: body.decision, version: body.version, rejectionCode: body.rejection_code,
      rejectionReason: body.rejection_reason, reason: body.reason,
    }, metadata(request));
  }
}

type UserRequest = FastifyRequest & AuthenticatedRequest;

function requirePrincipal(request: UserRequest) {
  if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 });
  return request.principal;
}

function metadata(request: FastifyRequest): RequestMetadata {
  const context = requestContext.get();
  return {
    ip: request.ip.slice(0, 64),
    userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000),
    requestId: context?.requestId ?? "unknown",
    traceId: context?.traceId,
  };
}

function sessionResponse(result: {
  sessionId: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  user: unknown;
}) {
  return {
    session_id: result.sessionId,
    access_expires_at: result.accessExpiresAt,
    refresh_expires_at: result.refreshExpiresAt,
    token_transport: "http_only_cookie",
    user: result.user,
  };
}

function setSessionCookies(reply: FastifyReply, result: {
  accessToken: string;
  refreshToken: string;
}, config: ApiConfig): void {
  const secure = config.environment === "production";
  reply.header("set-cookie", [
    serializeCookie("xiongzai_access", result.accessToken, config.accessTokenTtlSeconds, "/", secure, "Lax"),
    serializeCookie("xiongzai_refresh", result.refreshToken, config.refreshTokenTtlSeconds, "/api/v1/auth", secure, "Strict"),
  ]);
}

function clearSessionCookies(reply: FastifyReply, config: ApiConfig): void {
  const secure = config.environment === "production";
  reply.header("set-cookie", [
    serializeCookie("xiongzai_access", "", 0, "/", secure, "Lax"),
    serializeCookie("xiongzai_refresh", "", 0, "/api/v1/auth", secure, "Strict"),
  ]);
}

function serializeCookie(name: string, value: string, maxAge: number, path: string, secure: boolean, sameSite: "Lax" | "Strict"): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure ? "; Secure" : ""}`;
}

function readCookie(source: string | undefined, name: string): string | undefined {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "u").exec(source ?? "");
  if (!match?.[1]) return undefined;
  try { return decodeURIComponent(match[1]); } catch { return undefined; }
}
