import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, type CustomDecorator } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { extractBearerToken, hasPermissions, verifyAccessToken, type AccessTokenClaims, type PrincipalType } from "@xiongzai/auth";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { ApiConfig } from "./config.js";
import { SessionAuthorizationService } from "./session-authorization.service.js";
import { API_CONFIG } from "./tokens.js";

const PUBLIC_ROUTE = "xiongzai:public";
const AUTH_KIND = "xiongzai:auth-kind";
const AUTH_TRANSPORT = "xiongzai:auth-transport";
const PERMISSIONS = "xiongzai:permissions";
const MFA_REQUIRED = "xiongzai:mfa-required";

export const Public = (): CustomDecorator => SetMetadata(PUBLIC_ROUTE, true);
export const AuthenticateAs = (kind: PrincipalType): CustomDecorator => SetMetadata(AUTH_KIND, kind);
export const BearerOnly = (): CustomDecorator => SetMetadata(AUTH_TRANSPORT, "bearer");
export const RequirePermissions = (...permissions: string[]): CustomDecorator => SetMetadata(PERMISSIONS, permissions);
export const RequireMfa = (): CustomDecorator => SetMetadata(MFA_REQUIRED, true);

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  url: string;
  principal?: AccessTokenClaims;
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly sessions: SessionAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principalType = this.reflector.getAllAndOverride<PrincipalType>(AUTH_KIND, [context.getHandler(), context.getClass()]) ?? inferPrincipalType(request.url);
    if (!principalType) return true;
    const authTransport = this.reflector.getAllAndOverride<"bearer">(AUTH_TRANSPORT, [context.getHandler(), context.getClass()]);
    if (!authTransport && (principalType === "user" || principalType === "admin") && request.headers.authorization === undefined) {
      assertTrustedCookieRequest(request, this.config);
    }

    const token = authTransport === "bearer"
      ? extractBearerToken(request.headers.authorization)
      : principalType === "user"
        ? extractCookieOrBearerToken(request.headers.authorization, request.headers.cookie, "xiongzai_access")
        : principalType === "admin"
          ? extractCookieOrBearerToken(request.headers.authorization, request.headers.cookie, "xiongzai_admin_access")
          : extractBearerToken(request.headers.authorization);
    const claims = verifyAccessToken(token, verificationOptions(principalType, this.config));
    const authorization = await this.sessions.authorize(claims);
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    if (principalType === "admin" && !hasPermissions(authorization.permissions, required)) {
      throw new AppError({ code: errorCodes.ADMIN_PERMISSION_DENIED, message: "没有执行此操作的权限", statusCode: 403 });
    }
    const mfaRequired = this.reflector.getAllAndOverride<boolean>(MFA_REQUIRED, [context.getHandler(), context.getClass()]);
    if ((mfaRequired || (principalType === "admin" && authorization.accountMfaRequired)) && claims.mfa_verified !== true) {
      throw new AppError({ code: errorCodes.ADMIN_MFA_REQUIRED, message: "此操作需要二次身份验证", statusCode: 403 });
    }
    request.principal = claims;
    requestContext.setActor(claims.sub, claims.principal_type);
    return true;
  }
}

function assertTrustedCookieRequest(request: AuthenticatedRequest, config: ApiConfig): void {
  const method = request.method?.toUpperCase() ?? "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
  const origin = headerValue(request.headers.origin);
  const fetchSite = headerValue(request.headers["sec-fetch-site"]);
  const allowedOrigins = new Set(config.corsOrigins.map((value) => new URL(value).origin));
  const rejected = fetchSite === "cross-site"
    || origin === "null"
    || (origin !== undefined && !allowedOrigins.has(origin))
    || (fetchSite !== undefined && origin === undefined);
  if (rejected) {
    throw new AppError({ code: errorCodes.AUTH_CSRF_REJECTED, message: "请求来源不受信任", statusCode: 403 });
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function extractCookieOrBearerToken(authorization: string | string[] | undefined, cookie: string | string[] | undefined, cookieName: string): string {
  if (authorization !== undefined) return extractBearerToken(authorization);
  const source = typeof cookie === "string" ? cookie : "";
  const match = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`, "u").exec(source);
  if (!match?.[1]) return extractBearerToken(undefined);
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return extractBearerToken(undefined);
  }
}

function inferPrincipalType(url: string): PrincipalType | undefined {
  if (url.startsWith("/admin-api/v1")) return "admin";
  if (url.startsWith("/internal/v1")) return "service";
  if (url.startsWith("/api/v1")) return "user";
  return undefined;
}

function verificationOptions(principalType: PrincipalType, config: ApiConfig) {
  if (principalType === "user") return { secret: config.userTokenSecret, issuer: config.tokenIssuer, audience: config.userTokenAudience, principalType };
  if (principalType === "admin") return { secret: config.adminTokenSecret, issuer: config.tokenIssuer, audience: config.adminTokenAudience, principalType };
  return { secret: config.internalTokenSecret, issuer: config.tokenIssuer, audience: config.internalTokenAudience, principalType };
}
