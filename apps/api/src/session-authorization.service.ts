import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AccessTokenClaims } from "@xiongzai/auth";
import {
  adminAccounts,
  adminRoles,
  adminSessions,
  authSessions,
  permissions,
  rolePermissions,
  users,
  type DatabaseClient,
} from "@xiongzai/database";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { DATABASE_CLIENT } from "./tokens.js";

@Injectable()
export class SessionAuthorizationService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async authorize(claims: AccessTokenClaims): Promise<{ permissions: string[]; accountMfaRequired: boolean }> {
    if (claims.principal_type === "service") return { permissions: claims.permissions ?? [], accountMfaRequired: false };
    if (claims.principal_type === "user") {
      const [active] = await this.database.db.select({ id: authSessions.id }).from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(and(
          eq(authSessions.id, claims.session_id),
          eq(authSessions.userId, claims.sub),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
          eq(users.status, "NORMAL"),
        )).limit(1);
      if (!active) throw invalidSession();
      return { permissions: [], accountMfaRequired: false };
    }

    const [active] = await this.database.db.select({ mfaRequired: adminAccounts.mfaRequired }).from(adminSessions)
      .innerJoin(adminAccounts, eq(adminAccounts.id, adminSessions.adminId))
      .where(and(
        eq(adminSessions.id, claims.session_id),
        eq(adminSessions.adminId, claims.sub),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date()),
        eq(adminAccounts.status, "ACTIVE"),
      )).limit(1);
    if (!active) throw invalidSession();

    const grants = await this.database.db.select({ permission: permissions.permissionKey })
      .from(adminRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, adminRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(adminRoles.adminId, claims.sub));
    return { permissions: grants.map((grant) => grant.permission), accountMfaRequired: active.mfaRequired };
  }
}

function invalidSession(): AppError {
  return new AppError({ code: errorCodes.AUTH_SESSION_INVALID, message: "登录会话已失效，请重新登录", statusCode: 401 });
}
