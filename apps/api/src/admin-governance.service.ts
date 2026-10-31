import { cursorColumns, cursorTimestamp, cursorTimeValue } from "./cursor-time.js";
import { todoCounts } from "./todo-counts.js";
import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import { decodeCursor, encodeCursor, normalizePageSize, AppError, errorCodes } from "@xiongzai/contracts";
import {
  adminAccounts, adminMfaFactors, adminOperationLogs, adminRoles, adminSessions, authSessions,
  complaints, files, identityVerifications, orders, orderStatusLogs, payments, permissions, platformConfigs, policyVersions, products, refunds, riskEvents, rolePermissions, roles,
  securityLogs, sellerApplications, sellerProfiles, supportCases, userProfiles, users, uuidv7, withdrawals, type DatabaseClient, type DatabaseTransaction,
  userPolicyAcceptances,
} from "@xiongzai/database";
import { issueAccessToken, verifyAccessToken } from "@xiongzai/auth";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, type SQLWrapper } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { SensitiveDataProtector } from "./sensitive-data.js";
import { API_CONFIG, DATABASE_CLIENT } from "./tokens.js";

const scrypt = promisify(nodeScrypt);
const ADMIN_LOGIN_LIMIT = 5;
const ADMIN_LOCK_MS = 15 * 60 * 1000;
const ADMIN_CHALLENGE_TTL_SECONDS = 300;
const CONFIG_DEFINITIONS = [
  { key:"finance.commission_rate_bps",label:"平台佣金比例",unit:"基点（100 = 1%）",minimum:0,maximum:5000 },
  { key:"order.payment_timeout_seconds",label:"待付款自动取消时间",unit:"秒",minimum:60,maximum:86400 },
  { key:"order.accept_reminder_seconds",label:"待接单提醒时间（未接入，禁止发布）",unit:"秒",minimum:60,maximum:86400 },
  { key:"order.accept_timeout_seconds",label:"待接单超时时间",unit:"秒",minimum:60,maximum:172800 },
  { key:"order.auto_confirm_seconds",label:"待确认自动完成时间",unit:"秒",minimum:60,maximum:2592000 },
  { key:"finance.settlement_delay_seconds",label:"收益结算等待时间",unit:"秒",minimum:0,maximum:2592000 },
  { key:"finance.withdrawal_min_cent",label:"最低提现金额",unit:"人民币分",minimum:1,maximum:100000000 },
  { key:"finance.withdrawal_max_cent",label:"最高提现金额",unit:"人民币分",minimum:1,maximum:1000000000 },
  { key:"product.image_max_count",label:"商品图及详情图合计限制",unit:"张",minimum:1,maximum:30 },
  { key:"product.image_max_bytes",label:"商品单张图片大小限制",unit:"字节",minimum:1024,maximum:10485760 },
] as const;

type AdminPrincipal = { sub: string; session_id: string };
type PageInput = { game?: typeof products.$inferSelect.game; after_sale_status?: typeof orders.$inferSelect.afterSaleStatus; cursor?: string; limit?: number; keyword?: string; status?: string; target_id?: string; sort?: "created_desc" | "created_asc" };

@Injectable()
export class AdminGovernanceService {
  private readonly protector: SensitiveDataProtector;
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient, @Inject(API_CONFIG) private readonly config: ApiConfig) {
    this.protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  }

  async login(username: string, password: string, metadata: RequestMetadata) {
    const normalized = username.normalize("NFKC").trim().toLowerCase();
    const [account] = await this.database.db.select(cursorColumns(adminAccounts)).from(adminAccounts).where(eq(adminAccounts.username, normalized)).limit(1);
    if (account?.status === "LOCKED" && account.lockedUntil && account.lockedUntil <= new Date()) {
      await this.database.db.update(adminAccounts).set({ status: "ACTIVE", failedLoginCount: 0, lockedUntil: null, version: sql`${adminAccounts.version} + 1`, updatedAt: new Date() }).where(eq(adminAccounts.id, account.id));
      account.status = "ACTIVE"; account.failedLoginCount = 0; account.lockedUntil = null;
    }
    const valid = account ? await verifyAdminPassword(password, account.passwordHash) : false;
    if (!account || !valid || account.status !== "ACTIVE" || (account.lockedUntil && account.lockedUntil > new Date())) {
      if (account && !valid) await this.recordFailedLogin(account.id, account.failedLoginCount, metadata);
      throw new AppError({ code: "ADMIN_LOGIN_INVALID", message: "管理员账号或密码错误", statusCode: 401 });
    }
    const factors = await this.database.db.select().from(adminMfaFactors).where(and(eq(adminMfaFactors.adminId, account.id), isNull(adminMfaFactors.revokedAt), isNull(adminMfaFactors.credentialIdHash)));
    if (account.mfaRequired && !factors.some((factor) => factor.factorType === "TOTP" && factor.verifiedAt && factor.secretCiphertext)) {
      throw new AppError({ code: "ADMIN_MFA_SETUP_REQUIRED", message: "管理员尚未配置有效的动态验证器", statusCode: 403 });
    }
    if (!account.mfaRequired) return { mfaRequired: false, session: await this.createSession(account.id, false, metadata) };
    const factor = factors.find((item) => item.factorType === "TOTP" && item.secretCiphertext)!;
    const challenge = issueAccessToken(
      { sub: account.id, principal_type: "admin", token_use: "access", session_id: factor.id, mfa_verified: false },
      { secret: this.config.adminTokenSecret, issuer: this.config.tokenIssuer, audience: this.config.adminTokenAudience, expiresInSeconds: ADMIN_CHALLENGE_TTL_SECONDS },
    );
    return { mfaRequired: true, challenge, challengeExpiresInSeconds: ADMIN_CHALLENGE_TTL_SECONDS };
  }

  async verifyMfa(challenge: string, code: string, metadata: RequestMetadata) {
    const claims = verifyAccessToken(challenge, { secret: this.config.adminTokenSecret, issuer: this.config.tokenIssuer, audience: this.config.adminTokenAudience, principalType: "admin" });
    if (claims.mfa_verified !== false) throw invalidMfa();
    const [factor] = await this.database.db.select().from(adminMfaFactors).where(and(eq(adminMfaFactors.id, claims.session_id), eq(adminMfaFactors.adminId, claims.sub), isNull(adminMfaFactors.revokedAt))).limit(1);
    if (!factor?.secretCiphertext || factor.factorType !== "TOTP" || !verifyTotp(this.protector.decrypt("admin-mfa", factor.secretCiphertext), code)) {
      await this.database.db.insert(securityLogs).values({ id: uuidv7(), adminId: claims.sub, eventType: "ADMIN_MFA_FAILED", status: "OPEN", riskScore: 50, metadataJson: {}, ip: metadata.ip, userAgent: metadata.userAgent });
      throw invalidMfa();
    }
    return this.createSession(claims.sub, true, metadata);
  }

  async session(adminId: string) {
    const [account] = await this.database.db.select({ id: adminAccounts.id, username: adminAccounts.username, displayName: adminAccounts.displayName, mfaRequired: adminAccounts.mfaRequired, status: adminAccounts.status }).from(adminAccounts).where(eq(adminAccounts.id, adminId)).limit(1);
    if (!account) throw notFound("管理员不存在");
    const grants = await this.database.db.select({ roleKey: roles.roleKey, roleName: roles.name, permissionKey: permissions.permissionKey })
      .from(adminRoles).innerJoin(roles, eq(roles.id, adminRoles.roleId)).leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id)).leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(eq(adminRoles.adminId, adminId));
    return { id: account.id, username: account.username, display_name: account.displayName, status: account.status, mfa_required: account.mfaRequired, roles: [...new Map(grants.map((g) => [g.roleKey, { key: g.roleKey, name: g.roleName }])).values()], permissions: [...new Set(grants.flatMap((g) => g.permissionKey ? [g.permissionKey] : []))] };
  }

  async logout(adminId: string, sessionId: string, metadata: RequestMetadata) {
    await this.database.db.transaction(async (tx) => {
      await tx.update(adminSessions).set({ revokedAt: new Date(), lastUsedAt: new Date() }).where(and(eq(adminSessions.id, sessionId), eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt)));
      await tx.insert(securityLogs).values({ id: uuidv7(), adminId, eventType: "ADMIN_LOGOUT", status: "RESOLVED", riskScore: 0, metadataJson: { session_id: sessionId }, ip: metadata.ip, userAgent: metadata.userAgent });
    });
  }

  async listAdmins(input: PageInput = {}) {
    const limit = normalizePageSize(input.limit, 20); const scope = `admin-accounts:${input.keyword ?? ""}:${input.status ?? ""}:${input.sort ?? "created_desc"}`; const cursor = this.scopedCursor(input.cursor, scope); const ascending = input.sort === "created_asc";
    const predicates = [
      input.keyword ? or(ilike(adminAccounts.username, `%${input.keyword}%`), ilike(adminAccounts.displayName, `%${input.keyword}%`)) : undefined,
      input.status ? sql`${adminAccounts.status}::text = ${input.status}` : undefined,
      cursor ? dateCursor(adminAccounts.createdAt, adminAccounts.id, cursor, ascending) : undefined,
    ].filter(Boolean);
    const accounts = await this.database.db.select({ id: adminAccounts.id, username: adminAccounts.username, displayName: adminAccounts.displayName, status: adminAccounts.status, mfaRequired: adminAccounts.mfaRequired, version: adminAccounts.version, lastLoginAt: adminAccounts.lastLoginAt, createdAt: cursorTimestamp(adminAccounts.createdAt) })
      .from(adminAccounts).where(predicates.length ? and(...predicates as never[]) : undefined).orderBy(ascending ? asc(adminAccounts.createdAt) : desc(adminAccounts.createdAt), ascending ? asc(adminAccounts.id) : desc(adminAccounts.id)).limit(limit + 1);
    const pageRows = accounts.slice(0, limit); const ids = pageRows.map((row) => row.id);
    const grants = ids.length ? await this.database.db.select({ adminId: adminRoles.adminId, roleKey: roles.roleKey, roleName: roles.name }).from(adminRoles).innerJoin(roles, eq(roles.id, adminRoles.roleId)).where(inArray(adminRoles.adminId, ids)).orderBy(asc(roles.roleKey)) : [];
    const byAdmin = new Map<string, Array<{ key: string; name: string }>>(); for (const grant of grants) byAdmin.set(grant.adminId, [...(byAdmin.get(grant.adminId) ?? []), { key: grant.roleKey, name: grant.roleName }]);
    const last = pageRows.at(-1); return { items: pageRows.map((row) => adminView(row, byAdmin.get(row.id) ?? [])), next_cursor: accounts.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope }, this.config.cursorSigningSecret) : null };
  }

  async adminDetail(adminId: string) {
    const [account] = await this.database.db.select({ id: adminAccounts.id, username: adminAccounts.username, displayName: adminAccounts.displayName, status: adminAccounts.status, mfaRequired: adminAccounts.mfaRequired, version: adminAccounts.version, lastLoginAt: adminAccounts.lastLoginAt }).from(adminAccounts).where(eq(adminAccounts.id, adminId)).limit(1);
    if (!account) throw notFound("管理员不存在");
    const [grants,history] = await Promise.all([
      this.database.db.select({ id: roles.id, key: roles.roleKey, name: roles.name }).from(adminRoles).innerJoin(roles, eq(roles.id, adminRoles.roleId)).where(eq(adminRoles.adminId, adminId)).orderBy(asc(roles.roleKey)),
      this.database.db.select({id:adminOperationLogs.id,admin_id:adminOperationLogs.adminId,action:adminOperationLogs.action,reason:adminOperationLogs.reason,before_json:adminOperationLogs.beforeJson,after_json:adminOperationLogs.afterJson,request_id:adminOperationLogs.requestId,created_at:adminOperationLogs.createdAt}).from(adminOperationLogs).where(and(eq(adminOperationLogs.targetId,adminId),eq(adminOperationLogs.action,"RBAC_ADMIN_ROLES_UPDATED"))).orderBy(desc(adminOperationLogs.createdAt)).limit(100),
    ]);
    return {...adminView(account, grants),role_change_history:history.map((row)=>({...row,before_json:safeJson(row.before_json),after_json:safeJson(row.after_json)}))};
  }

  async listRoles(input: PageInput = {}) {
    const limit = normalizePageSize(input.limit, 20); const scope = `admin-roles:${input.keyword ?? ""}:${input.sort ?? "created_desc"}`; const cursor = this.scopedCursor(input.cursor, scope); const ascending = input.sort === "created_asc";
    // Keep native chronological order; retain microseconds only at serialization.
    const createdAt = roles.createdAt;
    const predicates = [input.keyword ? or(ilike(roles.roleKey, `%${input.keyword}%`), ilike(roles.name, `%${input.keyword}%`)) : undefined, cursor ? dateCursor(createdAt, roles.id, cursor, ascending) : undefined].filter(Boolean);
    const base = await this.database.db.select({ id: roles.id, key: roles.roleKey, name: roles.name, description: roles.description, createdAt: cursorTimestamp(createdAt) }).from(roles).where(predicates.length ? and(...predicates as never[]) : undefined).orderBy(ascending ? asc(createdAt) : desc(createdAt), ascending ? asc(roles.id) : desc(roles.id)).limit(limit + 1);
    const pageRows = base.slice(0, limit); const ids = pageRows.map((row) => row.id);
    const grants = ids.length ? await this.database.db.select({ roleId: rolePermissions.roleId, permission: permissions.permissionKey }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(inArray(rolePermissions.roleId, ids)).orderBy(asc(permissions.permissionKey)) : [];
    const byRole = new Map<string, string[]>(); for (const grant of grants) byRole.set(grant.roleId, [...(byRole.get(grant.roleId) ?? []), grant.permission]);
    const last = pageRows.at(-1); return { items: pageRows.map((row) => roleView(row, byRole.get(row.id) ?? [])), next_cursor: base.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope }, this.config.cursorSigningSecret) : null };
  }

  async roleDetail(roleId: string) {
    const [role] = await this.database.db.select({ id: roles.id, key: roles.roleKey, name: roles.name, description: roles.description }).from(roles).where(eq(roles.id, roleId)).limit(1); if (!role) throw notFound("角色不存在");
    const grants = await this.database.db.select({ permission: permissions.permissionKey }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(eq(rolePermissions.roleId, roleId)).orderBy(asc(permissions.permissionKey)); return roleView(role, grants.map((row) => row.permission));
  }

  listPermissions() { return this.database.db.select({ id: permissions.id, key: permissions.permissionKey, description: permissions.description, high_risk: permissions.highRisk }).from(permissions).orderBy(asc(permissions.permissionKey)); }

  async createRole(admin: AdminPrincipal, input: { key: string; name: string; description?: string; permissionKeys: string[]; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const selected = input.permissionKeys.length ? await tx.select().from(permissions).where(inArray(permissions.permissionKey, input.permissionKeys)) : [];
      if (selected.length !== new Set(input.permissionKeys).size) throw new AppError({ code: "RBAC_PERMISSION_UNKNOWN", message: "包含不存在的权限", statusCode: 400 });
      const id = uuidv7(); await tx.insert(roles).values({ id, roleKey: input.key, name: input.name, description: input.description });
      if (selected.length) await tx.insert(rolePermissions).values(selected.map((permission) => ({ roleId: id, permissionId: permission.id })));
      await this.audit(tx, admin.sub, "RBAC_ROLE_CREATED", "PLATFORM", id, input.reason, null, { role_key: input.key, permissions: input.permissionKeys }, metadata);
      return { id, key: input.key, name: input.name, permissions: input.permissionKeys };
    });
  }

  async assignRoles(admin: AdminPrincipal, targetAdminId: string, roleIds: string[], version: number, reason: string, metadata: RequestMetadata, confirmEmptyRoles = false) {
    if (targetAdminId === admin.sub && roleIds.length === 0) throw new AppError({ code: "RBAC_SELF_LOCKOUT", message: "不能移除自己的全部角色", statusCode: 409 });
    if (roleIds.length === 0 && !confirmEmptyRoles) throw new AppError({ code: "RBAC_EMPTY_ROLES_CONFIRMATION_REQUIRED", message: "清空角色需要明确确认，该管理员将失去所有业务权限", statusCode: 400 });
    return this.database.db.transaction(async (tx) => {
      // Serialize super-admin membership changes before taking account locks: two
      // concurrent removals must not both observe another available super-admin.
      const [superRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.roleKey, "super_admin")).limit(1).for("update");
      const [target] = await tx.select({id:adminAccounts.id,status:adminAccounts.status,version:adminAccounts.version}).from(adminAccounts).where(eq(adminAccounts.id,targetAdminId)).limit(1).for("update");
      if(!target)throw notFound("管理员不存在");
      if (target.version !== version) throw conflict("RESOURCE_VERSION_CONFLICT", "管理员角色版本已变化，请刷新后重试");
      const existing = await tx.select({ roleId: adminRoles.roleId }).from(adminRoles).where(eq(adminRoles.adminId, targetAdminId));
      const valid = roleIds.length ? await tx.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds)) : [];
      if (valid.length !== new Set(roleIds).size) throw notFound("角色不存在");
      const removesSuper=Boolean(superRole&&existing.some((item)=>item.roleId===superRole.id)&&!roleIds.includes(superRole.id));
      if(removesSuper){const activeSuperAdmins=await tx.select({id:adminAccounts.id}).from(adminRoles).innerJoin(adminAccounts,eq(adminAccounts.id,adminRoles.adminId)).where(and(eq(adminRoles.roleId,superRole!.id),eq(adminAccounts.status,"ACTIVE"))).for("update");if(activeSuperAdmins.length<=1)throw conflict("RBAC_LAST_SUPER_ADMIN","系统必须保留至少一个可用超级管理员");}
      await tx.delete(adminRoles).where(eq(adminRoles.adminId, targetAdminId));
      if (roleIds.length) await tx.insert(adminRoles).values([...new Set(roleIds)].map((roleId) => ({ adminId: targetAdminId, roleId, grantedByAdminId: admin.sub })));
      const [updated] = await tx.update(adminAccounts).set({ version: sql`${adminAccounts.version} + 1`, updatedAt: new Date() }).where(and(eq(adminAccounts.id, targetAdminId), eq(adminAccounts.version, version))).returning({ version: adminAccounts.version });
      if (!updated) throw conflict("RESOURCE_VERSION_CONFLICT", "管理员角色版本已变化，请刷新后重试");
      const assignedRoleIds = [...new Set(roleIds)];
      await this.audit(tx, admin.sub, "RBAC_ADMIN_ROLES_UPDATED", "PLATFORM", targetAdminId, reason, { role_ids: existing.map((r) => r.roleId), version }, { role_ids: assignedRoleIds, version: updated.version }, metadata);
      return { admin_id: targetAdminId, role_ids: assignedRoleIds, version: updated.version };
    });
  }

  async listUsers(input: { cursor?: string; limit?: number; keyword?: string; status?: "NORMAL" | "DISABLED" | "CANCELLED"; sort?: "created_desc" | "created_asc" }) {
    const limit = normalizePageSize(input.limit, 20); const scope = `admin-users:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort ?? "created_desc"}`; const cursor = this.scopedCursor(input.cursor, scope); const ascending = input.sort === "created_asc";
    const predicates = [input.status ? eq(users.status, input.status) : undefined, input.keyword ? or(ilike(users.phoneMask, `%${input.keyword}%`), ilike(userProfiles.nickname, `%${input.keyword}%`), ilike(userProfiles.publicUserNo, `%${input.keyword}%`)) : undefined, cursor ? dateCursor(users.createdAt, users.id, cursor, ascending) : undefined].filter(Boolean);
    const rows = await this.database.db.select({ id: users.id, phoneMask: users.phoneMask, status: users.status, profileInitialized: users.profileInitialized, lastActiveAt: users.lastActiveAt, version: users.version, createdAt: cursorTimestamp(users.createdAt), nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, sellerId: sellerProfiles.id, sellerStatus: sellerProfiles.status })
      .from(users).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt))).leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id)).where(predicates.length ? and(...predicates as never[]) : undefined).orderBy(ascending ? asc(users.createdAt) : desc(users.createdAt), ascending ? asc(users.id) : desc(users.id)).limit(limit + 1);
    return page(rows, limit, this.config.cursorSigningSecret, scope, userListView);
  }

  async userDetail(userId: string) {
    const [row] = await this.database.db.select({ id: users.id, phoneMask: users.phoneMask, status: users.status, profileInitialized: users.profileInitialized, lastActiveAt: users.lastActiveAt, version: users.version, createdAt: cursorTimestamp(users.createdAt), nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, bio: userProfiles.bio, avatarFileId: userProfiles.avatarFileId, sellerId: sellerProfiles.id, sellerStatus: sellerProfiles.status })
      .from(users).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt))).leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id)).where(eq(users.id, userId)).limit(1);
    if (!row) throw notFound("用户不存在");
    const [acceptances, identityRows, userRisks, securityHistory, governanceHistory] = await Promise.all([
      this.database.db.select({
        policyVersionId: userPolicyAcceptances.policyVersionId,
        policyType: policyVersions.policyType, title: policyVersions.title, versionNo: policyVersions.versionNo,
        acceptanceScene: userPolicyAcceptances.acceptanceScene, confirmationMethod: userPolicyAcceptances.confirmationMethod,
        acceptedAt: userPolicyAcceptances.acceptedAt,
      }).from(userPolicyAcceptances).innerJoin(policyVersions, eq(policyVersions.id, userPolicyAcceptances.policyVersionId))
        .where(eq(userPolicyAcceptances.userId, userId)).orderBy(desc(userPolicyAcceptances.acceptedAt)),
      this.database.db.select({ id: identityVerifications.id, status: identityVerifications.status, submittedAt: identityVerifications.submittedAt, verifiedAt: identityVerifications.verifiedAt, updatedAt: identityVerifications.updatedAt })
        .from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(desc(identityVerifications.createdAt)).limit(1),
      this.database.db.select({ id: riskEvents.id, riskType: riskEvents.riskType, severity: riskEvents.severity, status: riskEvents.status, ruleKey: riskEvents.ruleKey, resolution: riskEvents.resolution, createdAt: cursorTimestamp(riskEvents.createdAt), resolvedAt: riskEvents.resolvedAt })
        .from(riskEvents).where(and(eq(riskEvents.targetType, "USER"), eq(riskEvents.targetId, userId))).orderBy(desc(riskEvents.createdAt)).limit(50),
      this.database.db.select({ id: securityLogs.id, eventType: securityLogs.eventType, status: securityLogs.status, riskScore: securityLogs.riskScore, createdAt: cursorTimestamp(securityLogs.createdAt), resolvedAt: securityLogs.resolvedAt })
        .from(securityLogs).where(eq(securityLogs.userId, userId)).orderBy(desc(securityLogs.createdAt)).limit(50),
      this.database.db.select({ id: adminOperationLogs.id, action: adminOperationLogs.action, reason: adminOperationLogs.reason, beforeJson: adminOperationLogs.beforeJson, afterJson: adminOperationLogs.afterJson, requestId: adminOperationLogs.requestId, createdAt: cursorTimestamp(adminOperationLogs.createdAt) })
        .from(adminOperationLogs).where(and(eq(adminOperationLogs.targetType, "USER"), eq(adminOperationLogs.targetId, userId))).orderBy(desc(adminOperationLogs.createdAt)).limit(50),
    ]);
    const identity = identityRows[0];
    return {
      ...userListView(row), bio: row.bio, avatar_file_id: row.avatarFileId,
      identity_verification: identity ? { id: identity.id, status: identity.status, submitted_at: identity.submittedAt, reviewed_at: identity.verifiedAt ?? identity.updatedAt } : null,
      policy_acceptances: acceptances.map((acceptance) => ({
        policy_version_id: acceptance.policyVersionId, policy_type: acceptance.policyType,
        title: acceptance.title, version_no: acceptance.versionNo, acceptance_scene: acceptance.acceptanceScene,
        confirmation_method: acceptance.confirmationMethod, accepted_at: acceptance.acceptedAt,
      })),
      risk_history: userRisks.map((risk) => ({ id: risk.id, risk_type: risk.riskType, severity: risk.severity, status: risk.status, rule_key: risk.ruleKey, resolution: risk.resolution, created_at: risk.createdAt, resolved_at: risk.resolvedAt })),
      security_history: securityHistory.map((entry) => ({ id: entry.id, event_type: entry.eventType, status: entry.status, risk_score: entry.riskScore, created_at: entry.createdAt, resolved_at: entry.resolvedAt })),
      governance_history: governanceHistory.map((entry) => ({ id: entry.id, action: entry.action, reason: entry.reason, before: safeJson(entry.beforeJson), after: safeJson(entry.afterJson), request_id: entry.requestId, created_at: entry.createdAt })),
    };
  }

  async setUserStatus(admin: AdminPrincipal, userId: string, input: { currentStatus: "NORMAL" | "DISABLED" | "CANCELLED"; nextStatus: "NORMAL" | "DISABLED"; version: number; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      // Use the same user-row lock as cancellation; never trust a submitted status.
      const [current] = await tx.select({ status: users.status, cancelledAt: users.cancelledAt, version: users.version }).from(users).where(eq(users.id, userId)).limit(1).for("update");
      if (!current) throw notFound("用户不存在");
      if (current.status === "CANCELLED" || current.cancelledAt !== null) throw conflict("USER_CANCELLED", "已注销账号不能通过禁用或解禁恢复");
      if (current.status !== input.currentStatus || current.version !== input.version) throw conflict("VERSION_CONFLICT", "用户状态已变化，请刷新后重试");
      const [updated] = await tx.update(users).set({ status: input.nextStatus, version: sql`${users.version} + 1`, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.status, input.currentStatus), eq(users.version, input.version))).returning();
      if (!updated) throw conflict("VERSION_CONFLICT", "用户状态已变化，请刷新后重试");
      if (input.nextStatus === "DISABLED") await tx.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      await this.audit(tx, admin.sub, "USER_STATUS_CHANGED", "USER", userId, input.reason, { status: input.currentStatus, version: input.version }, { status: input.nextStatus, version: updated.version }, metadata);
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  async listSellers(input: PageInput = {}) {
    const limit = normalizePageSize(input.limit, 20); const scope = `admin-sellers:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort ?? "created_desc"}`; const cursor = this.scopedCursor(input.cursor, scope); const ascending = input.sort === "created_asc";
    const predicates = [input.status ? sql`${sellerProfiles.status}::text = ${input.status}` : undefined, input.keyword ? ilike(sellerProfiles.sellerNickname, `%${input.keyword}%`) : undefined, cursor ? dateCursor(sellerProfiles.createdAt, sellerProfiles.id, cursor, ascending) : undefined].filter(Boolean);
    const rows = await this.database.db.select({ id: sellerProfiles.id, user_id: sellerProfiles.userId, seller_nickname: sellerProfiles.sellerNickname, status: sellerProfiles.status, accepting_orders: sellerProfiles.acceptingOrders, rating_avg: sellerProfiles.ratingAvg, completed_order_count: sellerProfiles.completedOrderCount, version: sellerProfiles.version, createdAt: cursorTimestamp(sellerProfiles.createdAt), created_at: sellerProfiles.createdAt }).from(sellerProfiles).where(predicates.length ? and(...predicates as never[]) : undefined).orderBy(ascending ? asc(sellerProfiles.createdAt) : desc(sellerProfiles.createdAt), ascending ? asc(sellerProfiles.id) : desc(sellerProfiles.id)).limit(limit + 1);
    return page(rows, limit, this.config.cursorSigningSecret, scope, ({ createdAt, ...row }) => { void createdAt; return row; });
  }
  async listProducts(input: PageInput = {}) {
    const limit = normalizePageSize(input.limit, 20); const scope = `admin-products:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort ?? "created_desc"}:${input.game ?? ""}`; const cursor = this.scopedCursor(input.cursor, scope); const ascending = input.sort === "created_asc";
    const predicates = [input.game ? eq(products.game, input.game) : undefined, isNull(products.deletedAt), input.status ? sql`${products.status}::text = ${input.status}` : undefined, input.keyword ? ilike(products.title, `%${input.keyword}%`) : undefined, cursor ? dateCursor(products.createdAt, products.id, cursor, ascending) : undefined].filter(Boolean);
    const rows = await this.database.db.select({ id: products.id, seller_id: products.sellerId, title: products.title, game: products.game, pricing_mode: products.pricingMode, fulfillment_seconds: products.fulfillmentSeconds, status: products.status, min_price_cent: products.minPriceCent, sold_count: products.soldCount, rating_avg: products.ratingAvg, version: products.version, createdAt: cursorTimestamp(products.createdAt), created_at: products.createdAt }).from(products).where(and(...predicates as never[])).orderBy(ascending ? asc(products.createdAt) : desc(products.createdAt), ascending ? asc(products.id) : desc(products.id)).limit(limit + 1);
    return page(rows, limit, this.config.cursorSigningSecret, scope, ({ createdAt, ...row }) => { void createdAt; return row; });
  }

  async listOrders(input: PageInput) {
    const limit = normalizePageSize(input.limit, 20); const scope = `admin-orders:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort ?? "created_desc"}:${input.after_sale_status ?? ""}`; const cursor = this.scopedCursor(input.cursor, scope); const ascending = input.sort === "created_asc";
    const predicates = [input.after_sale_status ? eq(orders.afterSaleStatus, input.after_sale_status) : undefined, input.keyword ? or(ilike(orders.orderNo, `%${input.keyword}%`), ilike(orders.productTitleSnapshot, `%${input.keyword}%`), ilike(orders.sellerNameSnapshot, `%${input.keyword}%`)) : undefined, input.status ? sql`${orders.status}::text = ${input.status}` : undefined, cursor ? dateCursor(orders.createdAt, orders.id, cursor, ascending) : undefined].filter(Boolean);
    const rows = await this.database.db.select(cursorColumns(orders)).from(orders).where(predicates.length ? and(...predicates as never[]) : undefined).orderBy(ascending ? asc(orders.createdAt) : desc(orders.createdAt), ascending ? asc(orders.id) : desc(orders.id)).limit(limit + 1);
    return page(rows, limit, this.config.cursorSigningSecret, scope, orderView);
  }

  async orderDetail(orderId: string, admin?: AdminPrincipal) {
    const grants = new Set(admin ? (await this.session(admin.sub)).permissions : []);
    const [order] = await this.database.db.select(cursorColumns(orders)).from(orders).where(or(eq(orders.id, orderId), eq(orders.orderNo, orderId))).limit(1); if (!order) throw notFound("订单不存在");
    const policyIds = [order.transactionPolicyVersionId, order.refundPolicyVersionId].filter((value): value is string => Boolean(value));
    const [paymentRows, policyRows, statusRows, refundRows, complaintRows] = await Promise.all([
      this.database.db.select(cursorColumns(payments)).from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
      policyIds.length ? this.database.db.select().from(policyVersions).where(inArray(policyVersions.id, policyIds)) : Promise.resolve([]),
      this.database.db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, order.id)).orderBy(desc(orderStatusLogs.createdAt)),
      grants.has("refund.read") ? this.database.db.select({ id: refunds.id, refund_no: refunds.refundNo, status: refunds.status }).from(refunds).where(eq(refunds.orderId, order.id)).orderBy(desc(refunds.createdAt), desc(refunds.id)).limit(21) : [],
      grants.has("complaint.read") ? this.database.db.select({ id: complaints.id, complaint_no: complaints.complaintNo, status: complaints.status }).from(complaints).where(eq(complaints.orderId, order.id)).orderBy(desc(complaints.createdAt), desc(complaints.id)).limit(21) : [],
    ]);
    const policiesById = new Map(policyRows.map((policy) => [policy.id, policyReferenceView(policy)]));
    return {
      ...orderView(order), payments: paymentRows.map(paymentView),
      ...(grants.has("finance.read") ? { commission_rate_bps: order.commissionRateBpsSnapshot, platform_fee_cent: order.platformFeeCent.toString(), seller_income_cent: order.sellerIncomeCent.toString() } : {}),
      ...(grants.has("refund.read") ? { related_refunds: refundRows.slice(0, 20), related_refunds_has_more: refundRows.length > 20 } : {}),
      ...(grants.has("complaint.read") ? { related_complaints: complaintRows.slice(0, 20), related_complaints_has_more: complaintRows.length > 20 } : {}),
      status_logs: statusRows.map(row => ({ id: row.id, action: row.action, old_status: row.oldStatus, new_status: row.newStatus, operator_role: row.operatorRole, created_at: row.createdAt, request_id: row.requestId })),
      transaction_policy: order.transactionPolicyVersionId ? policiesById.get(order.transactionPolicyVersionId) ?? null : null,
      refund_policy: order.refundPolicyVersionId ? policiesById.get(order.refundPolicyVersionId) ?? null : null,
    };
  }
  async listPayments(input: PageInput) {
    const limit = normalizePageSize(input.limit, 20); const scope = `admin-payments:${input.status ?? ""}:${input.keyword ?? ""}:${input.sort ?? "created_desc"}`; const cursor = this.scopedCursor(input.cursor, scope); const ascending = input.sort === "created_asc";
    const predicates = [input.status ? sql`${payments.status}::text = ${input.status}` : undefined, input.keyword ? or(ilike(payments.paymentNo, `%${input.keyword}%`), ilike(orders.orderNo, `%${input.keyword}%`), ilike(userProfiles.nickname, `%${input.keyword}%`), ilike(userProfiles.publicUserNo, `%${input.keyword}%`)) : undefined, cursor ? dateCursor(payments.createdAt, payments.id, cursor, ascending) : undefined].filter(Boolean);
    const rows = await this.database.db.select({ id:payments.id, createdAt: cursorTimestamp(payments.createdAt), payment: payments, orderNo: orders.orderNo, buyerId: orders.buyerId, nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, phoneMask: users.phoneMask })
      .from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(users, eq(users.id, orders.buyerId)).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(predicates.length?and(...predicates as never[]):undefined).orderBy(ascending?asc(payments.createdAt):desc(payments.createdAt),ascending?asc(payments.id):desc(payments.id)).limit(limit+1);
    return page(rows,limit,this.config.cursorSigningSecret,scope,(row)=>({ ...paymentView(row.payment), order_no: row.orderNo, user: paymentUserView(row), provider_mode: this.config.paymentProviderMode }));
  }

  async paymentDetail(paymentId: string) {
    const [row] = await this.database.db.select({ payment: payments, orderNo: orders.orderNo, productTitle: orders.productTitleSnapshot, sellerName: orders.sellerNameSnapshot, buyerId: orders.buyerId, nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, phoneMask: users.phoneMask })
      .from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(users, eq(users.id, orders.buyerId)).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt))).where(eq(payments.id, paymentId)).limit(1);
    if (!row) throw notFound("支付单不存在");
    return { ...paymentView(row.payment), order_no: row.orderNo, product_title: row.productTitle, seller_name: row.sellerName, user: paymentUserView(row), provider_mode: this.config.paymentProviderMode };
  }

  async listRiskEvents(input: PageInput = {}) { const limit=normalizePageSize(input.limit,20);const scope=`admin-risks:${input.status??""}:${input.keyword??""}:${input.sort??"created_desc"}`;const cursor=this.scopedCursor(input.cursor,scope);const ascending=input.sort==="created_asc";const predicates=[input.status?sql`${riskEvents.status}::text = ${input.status}`:undefined,input.keyword?or(ilike(riskEvents.riskType,`%${input.keyword}%`),ilike(riskEvents.ruleKey,`%${input.keyword}%`)):undefined,cursor?dateCursor(riskEvents.createdAt,riskEvents.id,cursor,ascending):undefined].filter(Boolean);const rows=await this.database.db.select(cursorColumns(riskEvents)).from(riskEvents).where(predicates.length?and(...predicates as never[]):undefined).orderBy(ascending?asc(riskEvents.createdAt):desc(riskEvents.createdAt),ascending?asc(riskEvents.id):desc(riskEvents.id)).limit(limit+1);return page(rows,limit,this.config.cursorSigningSecret,scope,riskView); }
  async riskDetail(id:string){const [row]=await this.database.db.select(cursorColumns(riskEvents)).from(riskEvents).where(eq(riskEvents.id,id)).limit(1);if(!row)throw notFound("风险事件不存在");return riskView(row);}
  async createRisk(admin: AdminPrincipal, input: { riskType: string; severity: "NORMAL" | "MEDIUM" | "HIGH" | "URGENT"; targetType: typeof riskEvents.$inferInsert.targetType; targetId: string; ruleKey: string; details: Record<string, unknown>; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => { const [created] = await tx.insert(riskEvents).values({ id: uuidv7(), riskType: input.riskType, severity: input.severity, targetType: input.targetType, targetId: input.targetId, ruleKey: input.ruleKey, detailsJson: input.details, status: "OPEN", assignedAdminId: admin.sub }).returning(); await this.audit(tx, admin.sub, "RISK_EVENT_CREATED", input.targetType, input.targetId, input.reason, null, created!, metadata); return riskView(created!); });
  }
  async resolveRisk(admin: AdminPrincipal, id: string, input: { version: number; resolution: string; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => { const [before] = await tx.select(cursorColumns(riskEvents)).from(riskEvents).where(eq(riskEvents.id, id)).limit(1); if (!before) throw notFound("风险事件不存在"); const [updated] = await tx.update(riskEvents).set({ status: "RESOLVED", assignedAdminId: admin.sub, resolution: input.resolution, resolvedAt: new Date(), version: sql`${riskEvents.version} + 1`, updatedAt: new Date() }).where(and(eq(riskEvents.id, id), eq(riskEvents.version, input.version))).returning(); if (!updated) throw conflict("VERSION_CONFLICT", "风险事件已被其他管理员处理"); await this.audit(tx, admin.sub, "RISK_EVENT_RESOLVED", before.targetType, before.targetId, input.reason, before, updated, metadata); return riskView(updated); });
  }
  async listSecurityLogs(input:PageInput={}){const limit=normalizePageSize(input.limit,20);const scope=`admin-security:${input.status??""}:${input.keyword??""}:${input.sort??"created_desc"}`;const cursor=this.scopedCursor(input.cursor,scope);const ascending=input.sort==="created_asc";const predicates=[input.status?sql`${securityLogs.status}::text = ${input.status}`:undefined,input.keyword?ilike(securityLogs.eventType,`%${input.keyword}%`):undefined,cursor?dateCursor(securityLogs.createdAt,securityLogs.id,cursor,ascending):undefined].filter(Boolean);const rows=await this.database.db.select(cursorColumns(securityLogs)).from(securityLogs).where(predicates.length?and(...predicates as never[]):undefined).orderBy(ascending?asc(securityLogs.createdAt):desc(securityLogs.createdAt),ascending?asc(securityLogs.id):desc(securityLogs.id)).limit(limit+1);return page(rows,limit,this.config.cursorSigningSecret,scope,securityView);}
  async securityLogDetail(id:string){const [row]=await this.database.db.select(cursorColumns(securityLogs)).from(securityLogs).where(eq(securityLogs.id,id)).limit(1);if(!row)throw notFound("安全日志不存在");return securityView(row);}
  async listOperationLogs(input:PageInput={}){const limit=normalizePageSize(input.limit,20);const scope=`admin-operations:${input.keyword??""}:${input.target_id??""}:${input.sort??"created_desc"}`;const cursor=this.scopedCursor(input.cursor,scope);const ascending=input.sort==="created_asc";const predicates=[input.target_id?eq(adminOperationLogs.targetId,input.target_id):undefined,input.keyword?or(ilike(adminOperationLogs.action,`%${input.keyword}%`),ilike(adminOperationLogs.reason,`%${input.keyword}%`),ilike(adminAccounts.displayName,`%${input.keyword}%`)):undefined,cursor?dateCursor(adminOperationLogs.createdAt,adminOperationLogs.id,cursor,ascending):undefined].filter(Boolean);const rows=await this.database.db.select({ id: adminOperationLogs.id, admin_id: adminOperationLogs.adminId, action: adminOperationLogs.action, target_type: adminOperationLogs.targetType, target_id: adminOperationLogs.targetId, reason: adminOperationLogs.reason, before_json: adminOperationLogs.beforeJson, after_json: adminOperationLogs.afterJson, request_id: adminOperationLogs.requestId, trace_id: adminOperationLogs.traceId, ip: adminOperationLogs.ip, user_agent: adminOperationLogs.userAgent, createdAt: cursorTimestamp(adminOperationLogs.createdAt), created_at: adminOperationLogs.createdAt, admin_name: adminAccounts.displayName }).from(adminOperationLogs).innerJoin(adminAccounts, eq(adminAccounts.id, adminOperationLogs.adminId)).where(predicates.length?and(...predicates as never[]):undefined).orderBy(ascending?asc(adminOperationLogs.createdAt):desc(adminOperationLogs.createdAt),ascending?asc(adminOperationLogs.id):desc(adminOperationLogs.id)).limit(limit+1);return page(rows,limit,this.config.cursorSigningSecret,scope,operationView);}
  async operationLogDetail(id:string){const [row]=await this.database.db.select({ id: adminOperationLogs.id, admin_id: adminOperationLogs.adminId, action: adminOperationLogs.action, target_type: adminOperationLogs.targetType, target_id: adminOperationLogs.targetId, reason: adminOperationLogs.reason, before_json: adminOperationLogs.beforeJson, after_json: adminOperationLogs.afterJson, request_id: adminOperationLogs.requestId, trace_id: adminOperationLogs.traceId, ip: adminOperationLogs.ip, user_agent: adminOperationLogs.userAgent, createdAt: cursorTimestamp(adminOperationLogs.createdAt), created_at: adminOperationLogs.createdAt, admin_name: adminAccounts.displayName }).from(adminOperationLogs).innerJoin(adminAccounts, eq(adminAccounts.id, adminOperationLogs.adminId)).where(eq(adminOperationLogs.id,id)).limit(1);if(!row)throw notFound("操作日志不存在");return operationView(row);}

  listConfigs() { return this.database.db.select({ id: platformConfigs.id, config_key: platformConfigs.configKey, value_json: platformConfigs.valueJson, version_no: platformConfigs.versionNo, status: platformConfigs.status, effective_at: platformConfigs.effectiveAt, created_by_admin_id: platformConfigs.createdByAdminId, created_at: platformConfigs.createdAt }).from(platformConfigs).orderBy(asc(platformConfigs.configKey), desc(platformConfigs.versionNo)); }
  configDefinitions(){return CONFIG_DEFINITIONS.map((definition)=>({...definition,value_shape:{value:"integer"},editable:definition.key!=="order.accept_reminder_seconds",scope:definition.key==="finance.commission_rate_bps"?"仅旧预约规则；新商品订单固定 10%，不修改历史快照":definition.key==="order.auto_confirm_seconds"?"仅旧预约规则；新规则收货等待固定 72 小时":definition.key.startsWith("order.accept_")?"仅旧预约接单流程；新商品无需接单":definition.key==="product.image_max_count"?"新绑定的商品图及详情图合计；默认 30 张，不删除历史图片":definition.key==="product.image_max_bytes"?"商品图新上传、上传完成及图片绑定校验；默认/硬上限 10 MiB，不影响其他用途": "按现有服务端策略作用于后续业务，不改历史快照"}));}
  async publishConfig(admin: AdminPrincipal, input: { key: string; value: unknown; reason: string }, metadata: RequestMetadata) {
    const definition=CONFIG_DEFINITIONS.find((item)=>item.key===input.key);
    if(input.key==="order.accept_reminder_seconds")throw new AppError({code:"PLATFORM_CONFIG_NOT_IMPLEMENTED",message:"旧预约接单提醒任务尚未接入，不能发布该配置",statusCode:400});
    if(definition){const value=typeof input.value==="object"&&input.value!==null&&"value" in input.value?(typeof (input.value as {value:unknown}).value==="number"?(input.value as {value:number}).value:NaN):NaN;if(!Number.isSafeInteger(value)||value<definition.minimum||value>definition.maximum)throw new AppError({code:errorCodes.VALIDATION_FAILED,message:`${definition.label}必须是 ${definition.minimum} 到 ${definition.maximum} 之间的整数（${definition.unit}）`,statusCode:400});input={...input,value:{value}};}
    else {let serialized="";try{serialized=JSON.stringify(input.value);}catch{throw new AppError({code:errorCodes.VALIDATION_FAILED,message:"高级配置必须是可序列化 JSON",statusCode:400});}if(!serialized||serialized.length>20_000)throw new AppError({code:errorCodes.VALIDATION_FAILED,message:"高级配置 JSON 不能为空且不能超过 20000 字符",statusCode:400});}
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('admin-platform-config'))`);
      const [current] = await tx.select().from(platformConfigs).where(eq(platformConfigs.configKey, input.key)).orderBy(desc(platformConfigs.versionNo)).limit(1).for("update");
      if (["finance.withdrawal_min_cent", "finance.withdrawal_max_cent"].includes(input.key)) {
        const otherKey = input.key === "finance.withdrawal_min_cent" ? "finance.withdrawal_max_cent" : "finance.withdrawal_min_cent";
        const [other] = await tx.select({ value: platformConfigs.valueJson }).from(platformConfigs).where(and(eq(platformConfigs.configKey, otherKey), eq(platformConfigs.status, "ACTIVE"))).orderBy(desc(platformConfigs.versionNo)).limit(1);
        const n = (input.value as { value: number }).value, bound = (other?.value as { value?: number } | undefined)?.value;
        if (bound !== undefined && (input.key === "finance.withdrawal_min_cent" ? n > bound : n < bound)) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "最低提现金额不能高于最高提现金额", statusCode: 400 });
      }
      if (current?.status === "ACTIVE") await tx.update(platformConfigs).set({ status: "RETIRED" }).where(eq(platformConfigs.id, current.id));
      const [created] = await tx.insert(platformConfigs).values({ id: uuidv7(), configKey: input.key, valueJson: input.value as Record<string, unknown>, versionNo: (current?.versionNo ?? 0) + 1, status: "ACTIVE", effectiveAt: new Date(), createdByAdminId: admin.sub }).returning();
      await this.audit(tx, admin.sub, "PLATFORM_CONFIG_PUBLISHED", "PLATFORM", created!.id, input.reason, current ?? null, created!, metadata); return configView(created!);
    });
  }

  async globalSearch(admin: AdminPrincipal, query: string) {
    const grants = new Set((await this.session(admin.sub)).permissions);
    if (!grants.has("global_search.read")) throw new AppError({ code: errorCodes.ADMIN_PERMISSION_DENIED, message: "没有执行此操作的权限", statusCode: 403 });
    const pattern = `%${query}%`;
    const [userRows, orderRows, sellerRows, productRows] = await Promise.all([
      grants.has("user.read") ? this.database.db.select({ id: users.id, title: userProfiles.nickname, subtitle: userProfiles.publicUserNo }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(or(ilike(userProfiles.nickname, pattern), ilike(userProfiles.publicUserNo, pattern), ilike(users.phoneMask, pattern))).limit(5) : [],
      grants.has("order.read") ? this.database.db.select({ id: orders.id, title: orders.orderNo, subtitle: orders.productTitleSnapshot }).from(orders).where(or(ilike(orders.orderNo, pattern), ilike(orders.productTitleSnapshot, pattern))).limit(5) : [],
      grants.has("seller.read") ? this.database.db.select({ id: sellerProfiles.id, title: sellerProfiles.sellerNickname, subtitle: sellerProfiles.gameRank }).from(sellerProfiles).where(ilike(sellerProfiles.sellerNickname, pattern)).limit(5) : [],
      grants.has("product.read") ? this.database.db.select({ id: products.id, title: products.title, subtitle: sellerProfiles.sellerNickname }).from(products).innerJoin(sellerProfiles, eq(sellerProfiles.id, products.sellerId)).where(and(isNull(products.deletedAt), ilike(products.title, pattern))).limit(5) : [],
    ]);
    return [...userRows.map((v) => ({ module: "users", ...v })), ...orderRows.map((v) => ({ module: "orders", ...v })), ...sellerRows.map((v) => ({ module: "sellers", ...v })), ...productRows.map((v) => ({ module: "services", ...v }))];
  }

  async dashboard(from?: string, to?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const periodFrom = from ?? today; const periodTo = to ?? today;
    const rangeStart = new Date(`${periodFrom}T00:00:00.000Z`); const rangeEnd = new Date(`${periodTo}T00:00:00.000Z`); rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    const [trade, orderCount, userCount, newUsers, sellerCount, productCount, onSaleProducts, rangeOrders, rangeGmv, platformFee, refundAmount, identityQueue, sellerQueue, productQueue, refundQueue, complaintQueue, supportQueue, withdrawalQueue, fileQueue, openRisks, openSecurity] = await Promise.all([
      this.database.db.select({ value: sql<string>`coalesce(sum(${orders.paidAmountCent}), 0)::text` }).from(orders),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(orders), this.database.db.select({ value: sql<number>`count(*)::int` }).from(users),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(users).where(and(sql`${users.createdAt} >= ${rangeStart}`, sql`${users.createdAt} < ${rangeEnd}`)),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(sellerProfiles),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(products).where(isNull(products.deletedAt)),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(products).where(and(eq(products.status, "ON_SALE"), isNull(products.deletedAt))),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(orders).where(and(sql`${orders.createdAt} >= ${rangeStart}`, sql`${orders.createdAt} < ${rangeEnd}`)),
      this.database.db.select({ value: sql<string>`coalesce(sum(${orders.paidAmountCent}), 0)::text` }).from(orders).where(and(sql`${orders.paidAt} >= ${rangeStart}`, sql`${orders.paidAt} < ${rangeEnd}`)),
      this.database.db.select({ value: sql<string>`coalesce(sum(${orders.platformFeeCent}), 0)::text` }).from(orders).where(sql`${orders.completedAt} IS NOT NULL`),
      this.database.db.select({ value: sql<string>`coalesce(sum(${refunds.approvedAmountCent}), 0)::text` }).from(refunds).where(sql`${refunds.completedAt} IS NOT NULL`),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(identityVerifications).where(eq(identityVerifications.status,"PENDING")),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(sellerApplications).where(inArray(sellerApplications.status,["SUBMITTED","UNDER_REVIEW"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(products).where(eq(products.status,"PENDING_REVIEW")),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(refunds).where(inArray(refunds.status,["REQUESTED","NEGOTIATING","PLATFORM_REVIEW","REFUND_PROCESSING"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(complaints).where(inArray(complaints.status,["SUBMITTED","ACCEPTED","PROCESSING","NEED_MORE_EVIDENCE"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(supportCases).where(inArray(supportCases.status,["WAITING","TRANSFERRED"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(withdrawals).where(inArray(withdrawals.status,["CREATED","RISK_REVIEW"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(files).where(and(eq(files.uploadStatus,"VERIFIED"),eq(files.moderationStatus,"PENDING"),isNull(files.deletedAt))),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(riskEvents).where(eq(riskEvents.status,"OPEN")),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(securityLogs).where(eq(securityLogs.status,"OPEN")),
    ]);
    return {
      paid_gmv_cent:trade[0]?.value??"0", order_count:orderCount[0]?.value??0, user_count:userCount[0]?.value??0,
      registered_user_total:userCount[0]?.value??0, new_users_in_range:newUsers[0]?.value??0,
      seller_total:sellerCount[0]?.value??0, product_total:productCount[0]?.value??0, on_sale_product_count:onSaleProducts[0]?.value??0,
      orders_in_range:rangeOrders[0]?.value??0, gmv_in_range_cent:rangeGmv[0]?.value??"0",
      platform_commission_cent:platformFee[0]?.value??"0", refund_amount_cent:refundAmount[0]?.value??"0",
      pending_identity_reviews:identityQueue[0]?.value??0, pending_seller_reviews:sellerQueue[0]?.value??0, pending_product_reviews:productQueue[0]?.value??0,
      active_refunds:refundQueue[0]?.value??0, active_complaints:complaintQueue[0]?.value??0,
      waiting_support_cases:supportQueue[0]?.value??0, pending_withdrawals:withdrawalQueue[0]?.value??0,
      pending_files:fileQueue[0]?.value??0, open_risk_events:openRisks[0]?.value??0, open_security_events:openSecurity[0]?.value??0,
      statistics_from:periodFrom, statistics_to:periodTo, statistics_timezone:"UTC" as const,
      scopes:{ cumulative:"自平台本地数据库启用起累计；GMV 口径为订单实付金额", range:`${periodFrom} 至 ${periodTo}（UTC，自然日，含首尾）`, pending:"当前未结束且需要管理员处理的记录", commission:"已完成订单的平台佣金快照累计", refund:"已完成退款的批准金额累计" },
      generated_at:new Date(),
    };
  }

  async todos(adminId:string){const [session,dashboard]=await Promise.all([this.session(adminId),this.dashboard()]);const granted=new Set(session.permissions);const definitions=[
    {type:"identity_review",title:"待审核实名认证",count:dashboard.pending_identity_reviews,severity:"high",target_module:"identityReview",required_permission:"identity.read"},
    {type:"seller_review",title:"待审核陪玩申请",count:dashboard.pending_seller_reviews,severity:"medium",target_module:"sellerReview",required_permission:"seller_application.read"},
    {type:"product_review",title:"待审核服务",count:dashboard.pending_product_reviews,severity:"medium",target_module:"serviceReview",required_permission:"product.read"},
    {type:"refund",title:"待处理退款",count:dashboard.active_refunds,severity:"high",target_module:"refunds",required_permission:"refund.read"},
    {type:"complaint",title:"待处理投诉",count:dashboard.active_complaints,severity:"high",target_module:"complaints",required_permission:"complaint.read"},
    {type:"support",title:"待接入客服",count:dashboard.waiting_support_cases,severity:"medium",target_module:"support",required_permission:"support.read"},
    {type:"withdrawal",title:"待处理提现",count:dashboard.pending_withdrawals,severity:"high",target_module:"withdrawals",required_permission:"withdrawal.read"},
    {type:"file_review",title:"待审核文件",count:dashboard.pending_files,severity:"medium",target_module:"files",required_permission:"file.read"},
    {type:"risk",title:"开放风险事件",count:dashboard.open_risk_events,severity:"urgent",target_module:"logs",required_permission:"risk.read"},
    {type:"security",title:"开放安全异常",count:dashboard.open_security_events,severity:"urgent",target_module:"logs",required_permission:"security_log.read"},
  ];const items=definitions.filter((item)=>granted.has(item.required_permission)&&item.count>0);const counts=todoCounts(items);return {items,module_counts:Object.fromEntries(counts),total_count:[...counts.values()].reduce((sum,count)=>sum+count,0),updated_at:dashboard.generated_at,mode:"realtime_todos" as const};}

  async systemHealth(){
    const checkedAt=new Date();let databaseStatus:"healthy"|"unavailable"="healthy";
    let taskQueues:{worker:{source:"outbox_events";due_pending:number;processing:number;failed:number;latest_completed_at:string|null};scheduler:{source:"scheduled_jobs";due_pending:number;processing:number;failed:number;latest_completed_at:string|null};process_liveness:"NOT_MEASURED"}|null=null;
    try{
      const result=await Promise.race([this.database.db.execute(sql`
        SELECT
          (SELECT count(*)::int FROM outbox_events WHERE status='PENDING' AND available_at<=now()) AS worker_due_pending,
          (SELECT count(*)::int FROM outbox_events WHERE status='PROCESSING') AS worker_processing,
          (SELECT count(*)::int FROM outbox_events WHERE status='FAILED') AS worker_failed,
          (SELECT max(published_at) FROM outbox_events WHERE status='PUBLISHED') AS worker_latest_completed_at,
          (SELECT count(*)::int FROM scheduled_jobs WHERE status='PENDING' AND run_at<=now()) AS scheduler_due_pending,
          (SELECT count(*)::int FROM scheduled_jobs WHERE status='RUNNING') AS scheduler_processing,
          (SELECT count(*)::int FROM scheduled_jobs WHERE status='FAILED') AS scheduler_failed,
          (SELECT max(completed_at) FROM scheduled_jobs WHERE status='COMPLETED') AS scheduler_latest_completed_at
      `),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("health check timeout")),1500))]);
      const row=result.rows[0] as Record<string,unknown>|undefined;
      taskQueues={
        worker:{source:"outbox_events",due_pending:Number(row?.worker_due_pending??0),processing:Number(row?.worker_processing??0),failed:Number(row?.worker_failed??0),latest_completed_at:healthTime(row?.worker_latest_completed_at)},
        scheduler:{source:"scheduled_jobs",due_pending:Number(row?.scheduler_due_pending??0),processing:Number(row?.scheduler_processing??0),failed:Number(row?.scheduler_failed??0),latest_completed_at:healthTime(row?.scheduler_latest_completed_at)},
        process_liveness:"NOT_MEASURED",
      };
    }catch{databaseStatus="unavailable";}
    const checks:Array<{component:string;status:"healthy"|"unavailable"|"unknown"|"degraded"}>=[{component:"数据库",status:databaseStatus}];
    if(taskQueues){
      checks.push({component:`Worker任务队列（到期待处理${taskQueues.worker.due_pending}、处理中${taskQueues.worker.processing}、失败${taskQueues.worker.failed}；进程在线状态未测量）`,status:taskQueues.worker.failed>0?"unavailable":taskQueues.worker.due_pending>0?"degraded":"unknown"});
      checks.push({component:`Scheduler任务队列（到期待处理${taskQueues.scheduler.due_pending}、处理中${taskQueues.scheduler.processing}、失败${taskQueues.scheduler.failed}；进程在线状态未测量）`,status:taskQueues.scheduler.failed>0?"unavailable":taskQueues.scheduler.due_pending>0?"degraded":"unknown"});
    }
    return {status:databaseStatus==="healthy"?"healthy":"unavailable",checks,task_queues:taskQueues,checked_at:checkedAt};
  }

  async dashboardTrends(from:string,to:string){
    const result=await this.database.db.execute(sql`
      WITH days AS (SELECT generate_series(${from}::date, ${to}::date, interval '1 day')::date AS day),
      user_daily AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS new_users FROM users WHERE created_at>=${from}::date AND created_at<(${to}::date+1) GROUP BY 1),
      seller_daily AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS new_sellers FROM seller_profiles WHERE created_at>=${from}::date AND created_at<(${to}::date+1) GROUP BY 1),
      product_daily AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS new_products FROM products WHERE created_at>=${from}::date AND created_at<(${to}::date+1) AND deleted_at IS NULL GROUP BY 1),
      order_created AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS order_count FROM orders WHERE created_at>=${from}::date AND created_at<(${to}::date+1) GROUP BY 1),
      order_paid AS (SELECT (paid_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS paid_order_count FROM orders WHERE paid_at>=${from}::date AND paid_at<(${to}::date+1) GROUP BY 1),
      order_completed AS (SELECT (completed_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS completed_order_count,coalesce(sum(platform_fee_cent),0)::text AS platform_fee_cent FROM orders WHERE completed_at>=${from}::date AND completed_at<(${to}::date+1) GROUP BY 1),
      refund_created AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS refund_count FROM refunds WHERE created_at>=${from}::date AND created_at<(${to}::date+1) GROUP BY 1),
      refund_completed AS (SELECT (completed_at AT TIME ZONE 'UTC')::date AS day,coalesce(sum(approved_amount_cent),0)::text AS refund_amount_cent FROM refunds WHERE completed_at>=${from}::date AND completed_at<(${to}::date+1) GROUP BY 1),
      withdrawal_completed AS (SELECT (completed_at AT TIME ZONE 'UTC')::date AS day,coalesce(sum(actual_amount_cent),0)::text AS withdrawal_amount_cent FROM withdrawals WHERE completed_at>=${from}::date AND completed_at<(${to}::date+1) GROUP BY 1),
      complaint_daily AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS complaint_count FROM complaints WHERE created_at>=${from}::date AND created_at<(${to}::date+1) GROUP BY 1),
      support_daily AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS support_case_count FROM support_cases WHERE created_at>=${from}::date AND created_at<(${to}::date+1) GROUP BY 1)
      SELECT d.day::text AS date,coalesce(u.new_users,0)::int AS new_users,coalesce(s.new_sellers,0)::int AS new_sellers,coalesce(p.new_products,0)::int AS new_products,coalesce(oc.order_count,0)::int AS order_count,coalesce(op.paid_order_count,0)::int AS paid_order_count,coalesce(od.completed_order_count,0)::int AS completed_order_count,coalesce(rc.refund_count,0)::int AS refund_count,coalesce(ra.refund_amount_cent,'0')::text AS refund_amount_cent,coalesce(od.platform_fee_cent,'0')::text AS platform_fee_cent,coalesce(w.withdrawal_amount_cent,'0')::text AS withdrawal_amount_cent,coalesce(c.complaint_count,0)::int AS complaint_count,coalesce(sc.support_case_count,0)::int AS support_case_count
      FROM days d LEFT JOIN user_daily u USING(day) LEFT JOIN seller_daily s USING(day) LEFT JOIN product_daily p USING(day) LEFT JOIN order_created oc USING(day) LEFT JOIN order_paid op USING(day) LEFT JOIN order_completed od USING(day) LEFT JOIN refund_created rc USING(day) LEFT JOIN refund_completed ra USING(day) LEFT JOIN withdrawal_completed w USING(day) LEFT JOIN complaint_daily c USING(day) LEFT JOIN support_daily sc USING(day) ORDER BY d.day ASC
    `);
    return {from,to,granularity:"day" as const,timezone:"UTC",generated_at:new Date(),items:result.rows.map((row)=>({date:String(row.date),new_users:Number(row.new_users),new_sellers:Number(row.new_sellers),new_products:Number(row.new_products),order_count:Number(row.order_count),paid_order_count:Number(row.paid_order_count),completed_order_count:Number(row.completed_order_count),refund_count:Number(row.refund_count),refund_amount_cent:String(row.refund_amount_cent),platform_fee_cent:String(row.platform_fee_cent),withdrawal_amount_cent:String(row.withdrawal_amount_cent),complaint_count:Number(row.complaint_count),support_case_count:Number(row.support_case_count)})),omitted_metrics:[{key:"active_users",reason:"当前仅保存最近活跃时间，无法可靠重建历史每日活跃用户"}]};
  }

  private scopedCursor(value:string|undefined,scope:string){const cursor=value?decodeCursor(value,this.config.cursorSigningSecret):undefined;if(cursor&&cursor.scope!==scope)throw new AppError({code:errorCodes.VALIDATION_FAILED,message:"分页游标与当前筛选条件不匹配",statusCode:400});return cursor;}

  private async createSession(adminId: string, mfaVerified: boolean, metadata: RequestMetadata) {
    const sessionId = uuidv7(); const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000); const sessionSecret = randomBytes(48).toString("base64url");
    await this.database.db.transaction(async (tx) => { await tx.insert(adminSessions).values({ id: sessionId, adminId, sessionTokenHash: this.protector.authHash("admin-session", sessionSecret), ip: metadata.ip, userAgent: metadata.userAgent, expiresAt }); await tx.update(adminAccounts).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), version: sql`${adminAccounts.version} + 1`, updatedAt: new Date() }).where(eq(adminAccounts.id, adminId)); await tx.insert(securityLogs).values({ id: uuidv7(), adminId, eventType: "ADMIN_LOGIN_SUCCESS", status: "RESOLVED", riskScore: 0, metadataJson: { mfa_verified: mfaVerified, session_id: sessionId }, ip: metadata.ip, userAgent: metadata.userAgent }); });
    return { accessToken: issueAccessToken({ sub: adminId, principal_type: "admin", token_use: "access", session_id: sessionId, mfa_verified: mfaVerified }, { secret: this.config.adminTokenSecret, issuer: this.config.tokenIssuer, audience: this.config.adminTokenAudience, expiresInSeconds: this.config.accessTokenTtlSeconds }), sessionId, expiresAt, admin: await this.session(adminId) };
  }
  private async recordFailedLogin(adminId: string, count: number, metadata: RequestMetadata) { const next = count + 1; await this.database.db.transaction(async (tx) => { await tx.update(adminAccounts).set({ failedLoginCount: next, ...(next >= ADMIN_LOGIN_LIMIT ? { lockedUntil: new Date(Date.now() + ADMIN_LOCK_MS), status: "LOCKED" as const } : {}), version: sql`${adminAccounts.version} + 1`, updatedAt: new Date() }).where(eq(adminAccounts.id, adminId)); await tx.insert(securityLogs).values({ id: uuidv7(), adminId, eventType: "ADMIN_LOGIN_FAILED", status: "OPEN", riskScore: Math.min(100, next * 15), metadataJson: { failed_count: next }, ip: metadata.ip, userAgent: metadata.userAgent }); }); }
  private audit(tx: DatabaseTransaction, adminId: string, action: string, targetType: typeof riskEvents.$inferSelect.targetType, targetId: string | null, reason: string, before: unknown, after: unknown, metadata: RequestMetadata) { return tx.insert(adminOperationLogs).values({ id: uuidv7(), adminId, action, targetType, targetId, reason, beforeJson: before as Record<string, unknown> | null, afterJson: after as Record<string, unknown> | null, requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent }); }
}

export async function hashAdminPassword(password: string): Promise<string> { if (password.length < 12) throw new TypeError("Admin password must contain at least 12 characters."); const salt = randomBytes(16); const derived = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`; }
export async function verifyAdminPassword(password: string, encoded: string): Promise<boolean> { const [algorithm, saltPart, hashPart, extra] = encoded.split("$"); if (algorithm !== "scrypt" || !saltPart || !hashPart || extra) return false; try { const expected = Buffer.from(hashPart, "base64url"); const actual = await scrypt(password, Buffer.from(saltPart, "base64url"), expected.length) as Buffer; return expected.length === actual.length && timingSafeEqual(expected, actual); } catch { return false; } }
export function totpCode(secret: string, at = Date.now()): string { const counter = Math.floor(at / 30_000); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter)); const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest(); const offset = digest.at(-1)! & 0x0f; const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff); return String(binary % 1_000_000).padStart(6, "0"); }
function verifyTotp(secret: string, code: string, at = Date.now()) { return /^\d{6}$/u.test(code) && [-1, 0, 1].some((window) => { const candidate = Buffer.from(totpCode(secret, at + window * 30_000)); const supplied = Buffer.from(code); return candidate.length === supplied.length && timingSafeEqual(candidate, supplied); }); }
function decodeBase32(value: string) { const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const char of value.toUpperCase().replace(/=+$/u, "").replace(/\s+/gu, "")) { const index = alphabet.indexOf(char); if (index < 0) throw new TypeError("Invalid TOTP secret."); bits += index.toString(2).padStart(5, "0"); } const bytes: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes); }
function page<T extends { id: string; createdAt: Date }, V>(rows: T[], limit: number, secret: string, scope: string, view: (row: T) => V) { const items = rows.slice(0, limit); const last = items.at(-1); return { items: items.map(view), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope }, secret) : null }; }
function dateCursor(createdAt:SQLWrapper,id:SQLWrapper,cursor:{sort_value:string;id:string},ascending:boolean){const value=cursorTimeValue(cursor.sort_value);return ascending?or(gt(createdAt,value),and(eq(createdAt,value),gt(id,cursor.id))):or(lt(createdAt,value),and(eq(createdAt,value),lt(id,cursor.id)));}
function userListView(row:{id:string;publicUserNo:string|null;nickname:string|null;phoneMask:string;status:string;profileInitialized:boolean;sellerId:string|null;sellerStatus:string|null;version:number;lastActiveAt:Date|null;createdAt:Date}){return {id:row.id,public_user_no:row.publicUserNo,nickname:row.nickname??"未初始化用户",phone_mask:row.phoneMask,status:row.status,profile_initialized:row.profileInitialized,seller_id:row.sellerId,seller_status:row.sellerStatus,version:row.version,last_active_at:row.lastActiveAt,created_at:row.createdAt};}
function adminView(row:{id:string;username:string;displayName:string;status:string;mfaRequired:boolean;version:number;lastLoginAt:Date|null},grants:Array<{key:string;name:string}>){return {id:row.id,username:row.username,display_name:row.displayName,status:row.status,mfa_required:row.mfaRequired,version:row.version,last_login_at:row.lastLoginAt,roles:grants};}
function roleView(row:{id:string;key:string;name:string;description:string|null},permissionKeys:string[]){return {id:row.id,key:row.key,name:row.name,description:row.description,permissions:permissionKeys};}
function orderView(row: typeof orders.$inferSelect) { return { rule_version: row.ruleVersion, game: row.gameSnapshot, fulfillment_seconds: row.fulfillmentSecondsSnapshot, fulfillment_due_at: row.fulfillmentDueAt, auto_confirm_at: row.autoConfirmAt, receipt_extension_used: row.receiptExtensionUsed, last_reminded_at: row.lastRemindedAt, evidence_review_pending: row.evidenceReviewPending, fulfillment_evidence: row.fulfillmentEvidenceJson.map(({file_id,kind})=>({file_id,kind})), id: row.id, order_no: row.orderNo, buyer_id: row.buyerId, seller_user_id: row.sellerUserId, seller_id: row.sellerId, product_id: row.productId, product_title: row.productTitleSnapshot, seller_name: row.sellerNameSnapshot, sku_name: row.skuNameSnapshot, sku_id: row.skuId, sku_description: row.skuDescriptionSnapshot, sku_price_cent: row.skuPriceCentSnapshot, total_amount_cent: row.totalAmountCent, discount_cent: row.discountCent, quantity: row.quantity, payable_amount_cent: row.payableAmountCent, paid_amount_cent: row.paidAmountCent, refunded_amount_cent: row.refundedAmountCent, status: row.status, payment_status: row.paymentStatus, after_sale_status: row.afterSaleStatus, service_starts_at: row.serviceStartsAt, service_ends_at: row.serviceEndsAt, transaction_policy_version_id: row.transactionPolicyVersionId, refund_policy_version_id: row.refundPolicyVersionId, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function paymentView(row: typeof payments.$inferSelect) { return { id: row.id, order_id: row.orderId, payment_no: row.paymentNo, channel: row.channel, provider_transaction_id: row.providerTransactionId, amount_cent: row.amountCent, refunded_amount_cent: row.refundedAmountCent, currency: row.currency, status: row.status, paid_at: row.paidAt, closed_at: row.closedAt, version: row.version, created_at: row.createdAt }; }
function paymentUserView(row: { buyerId: string; nickname: string | null; publicUserNo: string | null; phoneMask: string }) { return { id: row.buyerId, nickname: row.nickname ?? "未设置昵称", public_user_no: row.publicUserNo, phone_mask: row.phoneMask }; }
function policyReferenceView(row: typeof policyVersions.$inferSelect) { return { id: row.id, policy_type: row.policyType, title: row.title, version_no: row.versionNo, status: row.status, effective_at: row.effectiveAt }; }
function riskView(row: typeof riskEvents.$inferSelect) { return { id: row.id, risk_type: row.riskType, severity: row.severity, target_type: row.targetType, target_id: row.targetId, rule_key: row.ruleKey, details_json: safeJson(row.detailsJson), status: row.status, assigned_admin_id: row.assignedAdminId, resolution: row.resolution, resolved_at: row.resolvedAt, version: row.version, created_at: row.createdAt }; }
function securityView(row:typeof securityLogs.$inferSelect){return {id:row.id,user_id:row.userId,admin_id:row.adminId,event_type:row.eventType,status:row.status,risk_score:row.riskScore,metadata_json:safeJson(row.metadataJson),ip:row.ip,user_agent:row.userAgent,resolved_by_admin_id:row.resolvedByAdminId,resolved_at:row.resolvedAt,created_at:row.createdAt};}
function healthTime(value:unknown){if(value instanceof Date)return value.toISOString();if(typeof value==="string"&&!Number.isNaN(new Date(value).getTime()))return new Date(value).toISOString();return null;}
function operationView(row:{id:string;admin_id:string;action:string;target_type:string;target_id:string|null;reason:string;before_json:unknown;after_json:unknown;request_id:string;trace_id:string|null;ip:string;user_agent:string;createdAt:Date;created_at:Date;admin_name:string}){return {id:row.id,admin_id:row.admin_id,admin_name:row.admin_name,action:row.action,target_type:row.target_type,target_id:row.target_id,reason:row.reason,before_json:safeJson(row.before_json),after_json:safeJson(row.after_json),request_id:row.request_id,trace_id:row.trace_id,ip:row.ip,user_agent:row.user_agent,created_at:row.created_at};}
const SENSITIVE_JSON_KEY=/(password|token|secret|cookie|authorization|ciphertext|connection|database|object_?key|bucket|presigned|signed_?url|account_?number|id_?number|real_?name)/iu;
function safeJson(value:unknown,depth=0):unknown{if(depth>8)return "[内容层级过深]";if(Array.isArray(value))return value.map((item)=>safeJson(item,depth+1));if(typeof value==="string"&&/^https?:\/\//iu.test(value)&&/(x-amz-|signature=|token=)/iu.test(value))return "[已隐藏的临时地址]";if(!value||typeof value!=="object")return value;return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([key])=>!SENSITIVE_JSON_KEY.test(key)).map(([key,item])=>[key,safeJson(item,depth+1)]));}
function configView(row: typeof platformConfigs.$inferSelect) { return { id: row.id, config_key: row.configKey, value_json: row.valueJson, version_no: row.versionNo, status: row.status, effective_at: row.effectiveAt, created_by_admin_id: row.createdByAdminId, created_at: row.createdAt }; }
function invalidMfa() { return new AppError({ code: errorCodes.ADMIN_MFA_REQUIRED, message: "动态验证码无效或已过期", statusCode: 401 }); }
function conflict(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function notFound(message: string) { return new AppError({ code: "RESOURCE_NOT_FOUND", message, statusCode: 404 }); }
