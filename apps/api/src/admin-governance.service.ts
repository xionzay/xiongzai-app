import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import { decodeCursor, encodeCursor, normalizePageSize, AppError, errorCodes } from "@xiongzai/contracts";
import {
  adminAccounts, adminMfaFactors, adminOperationLogs, adminRoles, adminSessions, authSessions,
  complaints, orders, payments, permissions, platformConfigs, products, refunds, riskEvents, rolePermissions, roles,
  securityLogs, sellerApplications, sellerProfiles, userProfiles, users, uuidv7, type DatabaseClient, type DatabaseTransaction,
} from "@xiongzai/database";
import { issueAccessToken, verifyAccessToken } from "@xiongzai/auth";
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { SensitiveDataProtector } from "./sensitive-data.js";
import { API_CONFIG, DATABASE_CLIENT } from "./tokens.js";

const scrypt = promisify(nodeScrypt);
const ADMIN_LOGIN_LIMIT = 5;
const ADMIN_LOCK_MS = 15 * 60 * 1000;
const ADMIN_CHALLENGE_TTL_SECONDS = 300;

type AdminPrincipal = { sub: string; session_id: string };

@Injectable()
export class AdminGovernanceService {
  private readonly protector: SensitiveDataProtector;
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient, @Inject(API_CONFIG) private readonly config: ApiConfig) {
    this.protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  }

  async login(username: string, password: string, metadata: RequestMetadata) {
    const normalized = username.normalize("NFKC").trim().toLowerCase();
    const [account] = await this.database.db.select().from(adminAccounts).where(eq(adminAccounts.username, normalized)).limit(1);
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

  async listAdmins() {
    const rows = await this.database.db.select({ id: adminAccounts.id, username: adminAccounts.username, displayName: adminAccounts.displayName, status: adminAccounts.status, mfaRequired: adminAccounts.mfaRequired, version: adminAccounts.version, lastLoginAt: adminAccounts.lastLoginAt, roleKey: roles.roleKey, roleName: roles.name })
      .from(adminAccounts).leftJoin(adminRoles, eq(adminRoles.adminId, adminAccounts.id)).leftJoin(roles, eq(roles.id, adminRoles.roleId)).orderBy(asc(adminAccounts.username));
    const grouped = new Map<string, Record<string, unknown> & { roles: Array<{ key: string; name: string }> }>();
    for (const row of rows) { const item = grouped.get(row.id) ?? { id: row.id, username: row.username, display_name: row.displayName, status: row.status, mfa_required: row.mfaRequired, version: row.version, last_login_at: row.lastLoginAt, roles: [] }; if (row.roleKey && !item.roles.some((role) => role.key === row.roleKey)) item.roles.push({ key: row.roleKey, name: row.roleName! }); grouped.set(row.id, item); }
    return [...grouped.values()];
  }

  async listRoles() {
    const rows = await this.database.db.select({ id: roles.id, key: roles.roleKey, name: roles.name, description: roles.description, permission: permissions.permissionKey })
      .from(roles).leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id)).leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).orderBy(asc(roles.roleKey));
    const grouped = new Map<string, { id: string; key: string; name: string; description: string | null; permissions: string[] }>();
    for (const row of rows) { const item = grouped.get(row.id) ?? { id: row.id, key: row.key, name: row.name, description: row.description, permissions: [] }; if (row.permission) item.permissions.push(row.permission); grouped.set(row.id, item); }
    return [...grouped.values()];
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

  async assignRoles(admin: AdminPrincipal, targetAdminId: string, roleIds: string[], reason: string, metadata: RequestMetadata) {
    if (targetAdminId === admin.sub && roleIds.length === 0) throw new AppError({ code: "RBAC_SELF_LOCKOUT", message: "不能移除自己的全部角色", statusCode: 409 });
    return this.database.db.transaction(async (tx) => {
      const existing = await tx.select({ roleId: adminRoles.roleId }).from(adminRoles).where(eq(adminRoles.adminId, targetAdminId));
      const valid = roleIds.length ? await tx.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds)) : [];
      if (valid.length !== new Set(roleIds).size) throw notFound("角色不存在");
      await tx.delete(adminRoles).where(eq(adminRoles.adminId, targetAdminId));
      if (roleIds.length) await tx.insert(adminRoles).values([...new Set(roleIds)].map((roleId) => ({ adminId: targetAdminId, roleId, grantedByAdminId: admin.sub })));
      await this.audit(tx, admin.sub, "RBAC_ADMIN_ROLES_UPDATED", "PLATFORM", targetAdminId, reason, { role_ids: existing.map((r) => r.roleId) }, { role_ids: roleIds }, metadata);
      return { admin_id: targetAdminId, role_ids: roleIds };
    });
  }

  async listUsers(input: { cursor?: string; limit?: number; keyword?: string; status?: "NORMAL" | "DISABLED" | "CANCELLED" }) {
    const limit = normalizePageSize(input.limit, 20); const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const predicates = [input.status ? eq(users.status, input.status) : undefined, input.keyword ? or(ilike(users.phoneMask, `%${input.keyword}%`), ilike(userProfiles.nickname, `%${input.keyword}%`), ilike(userProfiles.publicUserNo, `%${input.keyword}%`)) : undefined, cursor ? or(lt(users.createdAt, new Date(cursor.sort_value)), and(eq(users.createdAt, new Date(cursor.sort_value)), lt(users.id, cursor.id))) : undefined].filter(Boolean);
    const rows = await this.database.db.select({ id: users.id, phoneMask: users.phoneMask, status: users.status, profileInitialized: users.profileInitialized, lastActiveAt: users.lastActiveAt, version: users.version, createdAt: users.createdAt, nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, sellerId: sellerProfiles.id, sellerStatus: sellerProfiles.status })
      .from(users).leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt))).leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id)).where(predicates.length ? and(...predicates as never[]) : undefined).orderBy(desc(users.createdAt), desc(users.id)).limit(limit + 1);
    return page(rows, limit, this.config.cursorSigningSecret, (row) => ({ id: row.id, public_user_no: row.publicUserNo, nickname: row.nickname ?? "未初始化用户", phone_mask: row.phoneMask, status: row.status, profile_initialized: row.profileInitialized, seller_id: row.sellerId, seller_status: row.sellerStatus, version: row.version, last_active_at: row.lastActiveAt, created_at: row.createdAt }));
  }

  async setUserStatus(admin: AdminPrincipal, userId: string, input: { currentStatus: "NORMAL" | "DISABLED" | "CANCELLED"; nextStatus: "NORMAL" | "DISABLED"; version: number; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx.update(users).set({ status: input.nextStatus, version: sql`${users.version} + 1`, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.status, input.currentStatus), eq(users.version, input.version))).returning();
      if (!updated) throw conflict("VERSION_CONFLICT", "用户状态已变化，请刷新后重试");
      if (input.nextStatus === "DISABLED") await tx.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      await this.audit(tx, admin.sub, "USER_STATUS_CHANGED", "USER", userId, input.reason, { status: input.currentStatus, version: input.version }, { status: input.nextStatus, version: updated.version }, metadata);
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  async listSellers() { return this.database.db.select({ id: sellerProfiles.id, user_id: sellerProfiles.userId, seller_nickname: sellerProfiles.sellerNickname, status: sellerProfiles.status, accepting_orders: sellerProfiles.acceptingOrders, rating_avg: sellerProfiles.ratingAvg, completed_order_count: sellerProfiles.completedOrderCount, version: sellerProfiles.version, created_at: sellerProfiles.createdAt }).from(sellerProfiles).orderBy(desc(sellerProfiles.createdAt)).limit(101); }
  async listProducts() { return this.database.db.select({ id: products.id, seller_id: products.sellerId, title: products.title, status: products.status, min_price_cent: products.minPriceCent, sold_count: products.soldCount, rating_avg: products.ratingAvg, version: products.version, created_at: products.createdAt }).from(products).where(isNull(products.deletedAt)).orderBy(desc(products.createdAt)).limit(101); }

  async listOrders(input: { cursor?: string; limit?: number; keyword?: string; status?: string }) {
    const limit = normalizePageSize(input.limit, 20); const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const predicates = [input.keyword ? or(ilike(orders.orderNo, `%${input.keyword}%`), ilike(orders.productTitleSnapshot, `%${input.keyword}%`), ilike(orders.sellerNameSnapshot, `%${input.keyword}%`)) : undefined, input.status ? sql`${orders.status}::text = ${input.status}` : undefined, cursor ? or(lt(orders.createdAt, new Date(cursor.sort_value)), and(eq(orders.createdAt, new Date(cursor.sort_value)), lt(orders.id, cursor.id))) : undefined].filter(Boolean);
    const rows = await this.database.db.select().from(orders).where(predicates.length ? and(...predicates as never[]) : undefined).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit + 1);
    return page(rows, limit, this.config.cursorSigningSecret, orderView);
  }

  async orderDetail(orderId: string) {
    const [order] = await this.database.db.select().from(orders).where(or(eq(orders.id, orderId), eq(orders.orderNo, orderId))).limit(1); if (!order) throw notFound("订单不存在");
    const paymentRows = await this.database.db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt));
    return { ...orderView(order), payments: paymentRows.map(paymentView) };
  }
  async listPayments(input: { limit?: number; status?: string }) { const limit = normalizePageSize(input.limit, 20); const rows = await this.database.db.select({ payment: payments, orderNo: orders.orderNo }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(input.status ? sql`${payments.status}::text = ${input.status}` : undefined).orderBy(desc(payments.createdAt)).limit(limit); return rows.map((row) => ({ ...paymentView(row.payment), order_no: row.orderNo })); }

  async listRiskEvents() { return this.database.db.select().from(riskEvents).orderBy(desc(riskEvents.createdAt)).limit(100); }
  async createRisk(admin: AdminPrincipal, input: { riskType: string; severity: "NORMAL" | "MEDIUM" | "HIGH" | "URGENT"; targetType: typeof riskEvents.$inferInsert.targetType; targetId: string; ruleKey: string; details: Record<string, unknown>; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => { const [created] = await tx.insert(riskEvents).values({ id: uuidv7(), riskType: input.riskType, severity: input.severity, targetType: input.targetType, targetId: input.targetId, ruleKey: input.ruleKey, detailsJson: input.details, status: "OPEN", assignedAdminId: admin.sub }).returning(); await this.audit(tx, admin.sub, "RISK_EVENT_CREATED", input.targetType, input.targetId, input.reason, null, created!, metadata); return riskView(created!); });
  }
  async resolveRisk(admin: AdminPrincipal, id: string, input: { version: number; resolution: string; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => { const [before] = await tx.select().from(riskEvents).where(eq(riskEvents.id, id)).limit(1); if (!before) throw notFound("风险事件不存在"); const [updated] = await tx.update(riskEvents).set({ status: "RESOLVED", assignedAdminId: admin.sub, resolution: input.resolution, resolvedAt: new Date(), version: sql`${riskEvents.version} + 1`, updatedAt: new Date() }).where(and(eq(riskEvents.id, id), eq(riskEvents.version, input.version))).returning(); if (!updated) throw conflict("VERSION_CONFLICT", "风险事件已被其他管理员处理"); await this.audit(tx, admin.sub, "RISK_EVENT_RESOLVED", before.targetType, before.targetId, input.reason, before, updated, metadata); return riskView(updated); });
  }
  listSecurityLogs() { return this.database.db.select().from(securityLogs).orderBy(desc(securityLogs.createdAt)).limit(100); }
  listOperationLogs() { return this.database.db.select({ id: adminOperationLogs.id, admin_id: adminOperationLogs.adminId, action: adminOperationLogs.action, target_type: adminOperationLogs.targetType, target_id: adminOperationLogs.targetId, reason: adminOperationLogs.reason, before_json: adminOperationLogs.beforeJson, after_json: adminOperationLogs.afterJson, request_id: adminOperationLogs.requestId, trace_id: adminOperationLogs.traceId, ip: adminOperationLogs.ip, user_agent: adminOperationLogs.userAgent, created_at: adminOperationLogs.createdAt, admin_name: adminAccounts.displayName }).from(adminOperationLogs).innerJoin(adminAccounts, eq(adminAccounts.id, adminOperationLogs.adminId)).orderBy(desc(adminOperationLogs.createdAt)).limit(100); }

  listConfigs() { return this.database.db.select({ id: platformConfigs.id, config_key: platformConfigs.configKey, value_json: platformConfigs.valueJson, version_no: platformConfigs.versionNo, status: platformConfigs.status, effective_at: platformConfigs.effectiveAt, created_by_admin_id: platformConfigs.createdByAdminId, created_at: platformConfigs.createdAt }).from(platformConfigs).orderBy(asc(platformConfigs.configKey), desc(platformConfigs.versionNo)); }
  async publishConfig(admin: AdminPrincipal, input: { key: string; value: unknown; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(platformConfigs).where(eq(platformConfigs.configKey, input.key)).orderBy(desc(platformConfigs.versionNo)).limit(1).for("update");
      if (current?.status === "ACTIVE") await tx.update(platformConfigs).set({ status: "RETIRED" }).where(eq(platformConfigs.id, current.id));
      const [created] = await tx.insert(platformConfigs).values({ id: uuidv7(), configKey: input.key, valueJson: input.value as Record<string, unknown>, versionNo: (current?.versionNo ?? 0) + 1, status: "ACTIVE", effectiveAt: new Date(), createdByAdminId: admin.sub }).returning();
      await this.audit(tx, admin.sub, "PLATFORM_CONFIG_PUBLISHED", "PLATFORM", created!.id, input.reason, current ?? null, created!, metadata); return configView(created!);
    });
  }

  async globalSearch(query: string) {
    const pattern = `%${query}%`;
    const [userRows, orderRows, sellerRows, productRows] = await Promise.all([
      this.database.db.select({ id: users.id, title: userProfiles.nickname, subtitle: userProfiles.publicUserNo }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(or(ilike(userProfiles.nickname, pattern), ilike(userProfiles.publicUserNo, pattern), ilike(users.phoneMask, pattern))).limit(5),
      this.database.db.select({ id: orders.id, title: orders.orderNo, subtitle: orders.productTitleSnapshot }).from(orders).where(or(ilike(orders.orderNo, pattern), ilike(orders.productTitleSnapshot, pattern))).limit(5),
      this.database.db.select({ id: sellerProfiles.id, title: sellerProfiles.sellerNickname, subtitle: sellerProfiles.gameRank }).from(sellerProfiles).where(ilike(sellerProfiles.sellerNickname, pattern)).limit(5),
      this.database.db.select({ id: products.id, title: products.title, subtitle: sellerProfiles.sellerNickname }).from(products).innerJoin(sellerProfiles, eq(sellerProfiles.id, products.sellerId)).where(ilike(products.title, pattern)).limit(5),
    ]);
    return [...userRows.map((v) => ({ module: "users", ...v })), ...orderRows.map((v) => ({ module: "orders", ...v })), ...sellerRows.map((v) => ({ module: "sellers", ...v })), ...productRows.map((v) => ({ module: "services", ...v }))];
  }

  async dashboard() {
    const [trade, orderCount, userCount, sellerQueue, productQueue, refundQueue, complaintQueue, openRisks] = await Promise.all([
      this.database.db.select({ value: sql<string>`coalesce(sum(${orders.paidAmountCent}), 0)::text` }).from(orders),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(orders), this.database.db.select({ value: sql<number>`count(*)::int` }).from(users),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(sellerApplications).where(inArray(sellerApplications.status,["SUBMITTED","UNDER_REVIEW"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(products).where(eq(products.status,"PENDING_REVIEW")),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(refunds).where(inArray(refunds.status,["REQUESTED","NEGOTIATING","PLATFORM_REVIEW","REFUND_PROCESSING"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(complaints).where(inArray(complaints.status,["SUBMITTED","ACCEPTED","PROCESSING","NEED_MORE_EVIDENCE"])),
      this.database.db.select({ value: sql<number>`count(*)::int` }).from(riskEvents).where(eq(riskEvents.status,"OPEN")),
    ]);
    return { paid_gmv_cent:trade[0]?.value??"0", order_count:orderCount[0]?.value??0, user_count:userCount[0]?.value??0, pending_seller_reviews:sellerQueue[0]?.value??0, pending_product_reviews:productQueue[0]?.value??0, active_refunds:refundQueue[0]?.value??0, active_complaints:complaintQueue[0]?.value??0, open_risk_events:openRisks[0]?.value??0, generated_at:new Date() };
  }

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
function page<T extends { id: string; createdAt: Date }, V>(rows: T[], limit: number, secret: string, view: (row: T) => V) { const items = rows.slice(0, limit); const last = items.at(-1); return { items: items.map(view), next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id }, secret) : null }; }
function orderView(row: typeof orders.$inferSelect) { return { id: row.id, order_no: row.orderNo, buyer_id: row.buyerId, seller_user_id: row.sellerUserId, seller_id: row.sellerId, product_id: row.productId, product_title: row.productTitleSnapshot, seller_name: row.sellerNameSnapshot, sku_name: row.skuNameSnapshot, quantity: row.quantity, payable_amount_cent: row.payableAmountCent, paid_amount_cent: row.paidAmountCent, refunded_amount_cent: row.refundedAmountCent, status: row.status, payment_status: row.paymentStatus, after_sale_status: row.afterSaleStatus, service_starts_at: row.serviceStartsAt, service_ends_at: row.serviceEndsAt, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function paymentView(row: typeof payments.$inferSelect) { return { id: row.id, order_id: row.orderId, payment_no: row.paymentNo, channel: row.channel, provider_transaction_id: row.providerTransactionId, amount_cent: row.amountCent, refunded_amount_cent: row.refundedAmountCent, currency: row.currency, status: row.status, paid_at: row.paidAt, closed_at: row.closedAt, version: row.version, created_at: row.createdAt }; }
function riskView(row: typeof riskEvents.$inferSelect) { return { id: row.id, risk_type: row.riskType, severity: row.severity, target_type: row.targetType, target_id: row.targetId, rule_key: row.ruleKey, details_json: row.detailsJson, status: row.status, assigned_admin_id: row.assignedAdminId, resolution: row.resolution, resolved_at: row.resolvedAt, version: row.version, created_at: row.createdAt }; }
function configView(row: typeof platformConfigs.$inferSelect) { return { id: row.id, config_key: row.configKey, value_json: row.valueJson, version_no: row.versionNo, status: row.status, effective_at: row.effectiveAt, created_by_admin_id: row.createdByAdminId, created_at: row.createdAt }; }
function invalidMfa() { return new AppError({ code: errorCodes.ADMIN_MFA_REQUIRED, message: "动态验证码无效或已过期", statusCode: 401 }); }
function conflict(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function notFound(message: string) { return new AppError({ code: "RESOURCE_NOT_FOUND", message, statusCode: 404 }); }
