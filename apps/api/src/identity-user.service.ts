import { randomBytes, randomInt } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { issueAccessToken } from "@xiongzai/auth";
import { OutboxService } from "@xiongzai/application";
import {
  AppError, decodeCursor, encodeCursor, errorCodes, normalizePageSize, policyTypes,
  requiredPolicyTypes, type PolicyAcceptanceScene, type PolicyConfirmationMethod,
} from "@xiongzai/contracts";
import {
  adminOperationLogs,
  authSessions,
  favorites,
  fileUsages,
  files,
  identityVerifications,
  orders,
  policyVersions,
  privacySettings,
  reviews,
  securityLogs,
  smsCodes,
  userDevices,
  userPolicyAcceptances,
  userProfiles,
  users,
  uuidv7,
  type Database,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@xiongzai/database";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import { SensitiveDataProtector } from "./sensitive-data.js";
import type { SmsProvider } from "./sms-provider.js";
import { API_CONFIG, DATABASE_CLIENT, SMS_PROVIDER } from "./tokens.js";

export interface RequestMetadata {
  ip: string;
  userAgent: string;
  requestId: string;
  traceId?: string;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  sessionId: string;
  user: Awaited<ReturnType<IdentityUserService["getMe"]>>;
}

type SmsVerificationResult = { ok: true } | { ok: false; code: "INVALID" | "EXPIRED" | "ATTEMPTS" };

@Injectable()
export class IdentityUserService {
  private readonly protector: SensitiveDataProtector;
  private readonly outbox = new OutboxService();

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {
    this.protector = new SensitiveDataProtector(config.piiEncryptionKey, config.piiHmacKey, config.authHmacKey);
  }

  async sendLoginCode(rawPhone: string): Promise<{ expires_in_seconds: number; retry_after_seconds: number }> {
    const phone = this.protector.normalizePhone(rawPhone);
    const phoneHash = this.protector.piiHash("phone", phone);
    const minimumCreatedAt = new Date(Date.now() - this.config.smsMinimumIntervalSeconds * 1000);
    const [recent] = await this.database.db.select({ id: smsCodes.id }).from(smsCodes)
      .where(and(eq(smsCodes.phoneHash, phoneHash), eq(smsCodes.purpose, "LOGIN"), gt(smsCodes.createdAt, minimumCreatedAt)))
      .orderBy(desc(smsCodes.createdAt)).limit(1);
    if (recent) throw new AppError({ code: errorCodes.AUTH_SMS_RATE_LIMITED, message: "验证码发送过于频繁，请稍后重试", statusCode: 429 });

    const id = uuidv7();
    const code = this.config.smsProviderMode === "development"
      ? this.config.smsDevelopmentCode
      : String(randomInt(100_000, 1_000_000));
    const expiresAt = new Date(Date.now() + this.config.smsCodeTtlSeconds * 1000);
    await this.database.db.insert(smsCodes).values({
      id,
      phoneHash,
      purpose: "LOGIN",
      codeHash: this.smsCodeHash(phoneHash, code),
      maxAttempts: this.config.smsMaxAttempts,
      expiresAt,
    });
    try {
      await this.smsProvider.sendCode({ phone, code, expiresInSeconds: this.config.smsCodeTtlSeconds, purpose: "LOGIN" });
    } catch (cause) {
      await this.database.db.update(smsCodes).set({ consumedAt: new Date() }).where(eq(smsCodes.id, id));
      throw new AppError({ code: "AUTH_SMS_DELIVERY_FAILED", message: "短信发送失败，请稍后重试", statusCode: 503, cause });
    }
    return { expires_in_seconds: this.config.smsCodeTtlSeconds, retry_after_seconds: this.config.smsMinimumIntervalSeconds };
  }

  async login(input: {
    phone: string;
    code: string;
    deviceId: string;
    deviceType: "WEB" | "IOS" | "ANDROID";
    deviceName?: string;
    appVersion?: string;
    policyVersionIds: string[];
  }, metadata: RequestMetadata): Promise<SessionTokens> {
    const phone = this.protector.normalizePhone(input.phone);
    const phoneHash = this.protector.piiHash("phone", phone);
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTokenHash = this.protector.authHash("refresh-token", refreshToken);
    const sessionId = uuidv7();
    const refreshExpiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);

    const result = await this.database.db.transaction(async (transaction) => {
      const verification = await this.verifyLoginCode(transaction, phoneHash, input.code);
      if (!verification.ok) return { verification } as const;

      let [user] = await transaction.select().from(users).where(eq(users.phoneHash, phoneHash)).limit(1);
      let newUser = false;
      if (!user) {
        const inserted = await transaction.insert(users).values({
          id: uuidv7(),
          phoneCiphertext: this.protector.encrypt("phone", phone),
          phoneHash,
          phoneMask: this.protector.maskPhone(phone),
          lastActiveAt: new Date(),
        }).onConflictDoNothing().returning();
        [user] = inserted;
        if (!user) [user] = await transaction.select().from(users).where(eq(users.phoneHash, phoneHash)).limit(1);
        newUser = Boolean(inserted[0]);
      }
      if (!user || user.status !== "NORMAL") return { blocked: true } as const;

      await this.acceptPoliciesWithExecutor(
        transaction,
        user.id,
        "LOGIN",
        "ONLINE_CONFIRM",
        input.policyVersionIds,
        metadata,
      );

      await transaction.insert(privacySettings).values({ userId: user.id }).onConflictDoNothing();
      await transaction.insert(userDevices).values({
        id: uuidv7(), userId: user.id, deviceId: input.deviceId, deviceType: input.deviceType,
      }).onConflictDoUpdate({
        target: [userDevices.userId, userDevices.deviceId],
        set: { deviceType: input.deviceType, lastSeenAt: new Date(), revokedAt: null, updatedAt: new Date() },
      });
      await transaction.insert(authSessions).values({
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        deviceId: input.deviceId,
        deviceType: input.deviceType,
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        expiresAt: refreshExpiresAt,
      });
      await transaction.insert(securityLogs).values({
        id: uuidv7(), userId: user.id, eventType: "LOGIN_SUCCESS", status: "RESOLVED", riskScore: 0,
        metadataJson: {
          device_type: input.deviceType,
          client_kind: input.deviceName ? "MOBILE" : "WEB",
          new_user: newUser,
          ...(input.appVersion ? { app_version: input.appVersion } : {}),
        },
        ip: metadata.ip,
        userAgent: metadata.userAgent,
      });
      await this.outbox.enqueue(transaction, {
        aggregateType: "USER", aggregateId: user.id, eventType: newUser ? "UserRegistered" : "UserLoggedIn",
        payload: { user_id: user.id, session_id: sessionId, new_user: newUser }, traceId: metadata.traceId,
      });
      return { userId: user.id } as const;
    });

    if ("verification" in result && result.verification) this.throwSmsVerificationError(result.verification);
    if ("blocked" in result) throw new AppError({ code: errorCodes.USER_DISABLED, message: "账号当前不可登录", statusCode: 403 });

    const accessExpiresAt = new Date(Date.now() + this.config.accessTokenTtlSeconds * 1000);
    const accessToken = this.issueUserAccessToken(result.userId, sessionId);
    return {
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
      sessionId,
      user: await this.getMe(result.userId),
    };
  }

  async refresh(refreshToken: string, expectedDeviceId?: string): Promise<SessionTokens> {
    const oldHash = this.protector.authHash("refresh-token", refreshToken);
    const nextRefreshToken = randomBytes(48).toString("base64url");
    const nextHash = this.protector.authHash("refresh-token", nextRefreshToken);
    const now = new Date();
    const result = await this.database.db.transaction(async (transaction) => {
      const [session] = await transaction.select().from(authSessions)
        .where(eq(authSessions.refreshTokenHash, oldHash)).limit(1).for("update");
      if (!session || session.revokedAt || session.expiresAt <= now) return undefined;
      if (expectedDeviceId !== undefined) {
        if (session.deviceId !== expectedDeviceId || !["IOS", "ANDROID"].includes(session.deviceType)) return undefined;
        const [device] = await transaction.select({ id: userDevices.id }).from(userDevices).where(and(
          eq(userDevices.userId, session.userId),
          eq(userDevices.deviceId, expectedDeviceId),
          eq(userDevices.deviceType, session.deviceType),
          isNull(userDevices.revokedAt),
        )).limit(1).for("share");
        if (!device) return undefined;
      }
      const [user] = await transaction.select().from(users).where(eq(users.id, session.userId)).limit(1);
      if (!user || user.status !== "NORMAL") return undefined;
      const rotated = await transaction.update(authSessions).set({ refreshTokenHash: nextHash, lastUsedAt: now })
        .where(and(eq(authSessions.id, session.id), eq(authSessions.refreshTokenHash, oldHash), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id, userId: authSessions.userId, expiresAt: authSessions.expiresAt });
      return rotated[0];
    });
    if (!result) throw new AppError({ code: errorCodes.AUTH_REFRESH_INVALID, message: "刷新凭证无效或已撤销", statusCode: 401 });
    const accessExpiresAt = new Date(Date.now() + this.config.accessTokenTtlSeconds * 1000);
    return {
      accessToken: this.issueUserAccessToken(result.userId, result.id),
      refreshToken: nextRefreshToken,
      accessExpiresAt,
      refreshExpiresAt: result.expiresAt,
      sessionId: result.id,
      user: await this.getMe(result.userId),
    };
  }

  async logout(userId: string, sessionId: string, metadata: RequestMetadata): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      await transaction.update(authSessions).set({ revokedAt: new Date(), lastUsedAt: new Date() })
        .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      await transaction.insert(securityLogs).values({
        id: uuidv7(), userId, eventType: "LOGOUT", status: "RESOLVED", riskScore: 0,
        metadataJson: { session_id: sessionId }, ip: metadata.ip, userAgent: metadata.userAgent,
      });
    });
  }

  async listSessions(userId: string, currentSessionId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.database.db.select({
      id: authSessions.id, deviceId: authSessions.deviceId, deviceType: authSessions.deviceType,
      expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt, lastUsedAt: authSessions.lastUsedAt, createdAt: authSessions.createdAt,
    }).from(authSessions).where(eq(authSessions.userId, userId)).orderBy(desc(authSessions.lastUsedAt));
    return rows.map((row) => ({
      id: row.id, device_id_mask: maskDeviceId(row.deviceId), device_type: row.deviceType, current: row.id === currentSessionId,
      expires_at: row.expiresAt, revoked_at: row.revokedAt, last_used_at: row.lastUsedAt, created_at: row.createdAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.database.db.update(authSessions).set({ revokedAt: new Date() })
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    if (revoked.length === 0) {
      const [owned] = await this.database.db.select({ id: authSessions.id }).from(authSessions)
        .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId))).limit(1);
      if (!owned) throw new AppError({ code: "AUTH_SESSION_NOT_FOUND", message: "登录会话不存在", statusCode: 404 });
    }
  }

  async getMe(userId: string) {
    const [user] = await this.database.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new AppError({ code: errorCodes.USER_NOT_FOUND, message: "用户不存在", statusCode: 404 });
    const [profile] = await this.database.db.select().from(userProfiles).where(and(eq(userProfiles.userId, userId), isNull(userProfiles.deletedAt))).limit(1);
    const [identity] = await this.database.db.select({
      id: identityVerifications.id, status: identityVerifications.status, legalNameMask: identityVerifications.legalNameMask,
      documentMask: identityVerifications.documentMask, rejectionCode: identityVerifications.rejectionCode,
      rejectionReason: identityVerifications.rejectionReason, submittedAt: identityVerifications.submittedAt,
      verifiedAt: identityVerifications.verifiedAt, version: identityVerifications.version,
    }).from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(desc(identityVerifications.submittedAt)).limit(1);
    return {
      id: user.id,
      phone_mask: user.phoneMask,
      status: user.status,
      profile_initialized: user.profileInitialized,
      version: user.version,
      profile: profile ? {
        nickname: profile.nickname, avatar_file_id: profile.avatarFileId, bio: profile.bio,
        public_user_no: profile.publicUserNo, version: profile.version,
      } : null,
      identity_verification: identity ? this.identityView(identity) : null,
      created_at: user.createdAt,
    };
  }

  async getPublicProfile(userId: string) {
    const [row] = await this.database.db.select({ id: users.id, status: users.status, nickname: userProfiles.nickname, avatarFileId: userProfiles.avatarFileId, bio: userProfiles.bio, publicUserNo: userProfiles.publicUserNo, showPublicProfile: privacySettings.showPublicProfile, showOnlineStatus: privacySettings.showOnlineStatus, lastActiveAt: users.lastActiveAt, createdAt: users.createdAt })
      .from(users).innerJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt))).leftJoin(privacySettings, eq(privacySettings.userId, users.id)).where(eq(users.id, userId)).limit(1);
    if (!row || row.status !== "NORMAL" || row.showPublicProfile === false) throw new AppError({ code: "PUBLIC_PROFILE_NOT_FOUND", message: "用户公开主页不存在", statusCode: 404 });
    const [[following], [reviewSummary], publicReviews] = await Promise.all([
      this.database.db.select({ count: sql<number>`count(*)::integer` }).from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.targetType, "SELLER"))),
      this.database.db.select({ count: sql<number>`count(*)::integer` }).from(reviews).where(and(eq(reviews.buyerId, userId), eq(reviews.status, "PUBLIC"), eq(reviews.anonymous, false), isNull(reviews.hiddenAt))),
      this.database.db.select({ id: reviews.id, rating: reviews.rating, content: reviews.content, sellerName: orders.sellerNameSnapshot, serviceTitle: reviews.serviceTitleSnapshot, createdAt: reviews.createdAt })
        .from(reviews).innerJoin(orders, eq(orders.id, reviews.orderId))
        .where(and(eq(reviews.buyerId, userId), eq(reviews.status, "PUBLIC"), eq(reviews.anonymous, false), isNull(reviews.hiddenAt)))
        .orderBy(desc(reviews.createdAt), desc(reviews.id)).limit(3),
    ]);
    const onlineStatus = row.showOnlineStatus === false ? null : row.lastActiveAt && Date.now() - row.lastActiveAt.getTime() <= 5 * 60 * 1000 ? "ONLINE" : "OFFLINE";
    return {
      id: row.id, nickname: row.nickname, avatar_file_id: row.avatarFileId, bio: row.bio, public_user_no: row.publicUserNo,
      online_status: onlineStatus, following_count: following?.count ?? 0, public_review_count: reviewSummary?.count ?? 0,
      public_reviews: publicReviews.map((review) => ({ id: review.id, rating: review.rating, content: review.content, seller_name: review.sellerName, service_title: review.serviceTitle, created_at: review.createdAt })),
      created_at: row.createdAt,
    };
  }

  async updateProfile(userId: string, input: {
    nickname: string;
    bio?: string | null;
    avatarFileId?: string | null;
    version: number;
    userVersion: number;
  }, metadata: RequestMetadata) {
    await this.database.db.transaction(async (transaction) => {
      const [user] = await transaction.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
      if (!user) throw new AppError({ code: errorCodes.USER_NOT_FOUND, message: "用户不存在", statusCode: 404 });
      const [profile] = await transaction.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).for("update");
      if ((profile?.version ?? 0) !== input.version || user.version !== input.userVersion) throw versionConflict();
      if (input.avatarFileId) {
        const [avatar] = await transaction.select({ id: files.id }).from(files).where(and(eq(files.id, input.avatarFileId), eq(files.ownerUserId, userId), eq(files.fileType, "USER_AVATAR"), eq(files.uploadStatus, "VERIFIED"), eq(files.moderationStatus, "APPROVED"), isNull(files.deletedAt))).limit(1);
        if (!avatar) throw new AppError({ code: "PROFILE_AVATAR_INVALID", message: "头像文件不存在、无权使用或尚未通过审核", statusCode: 400, fieldErrors: [{ field: "avatar_file_id", code: "PROFILE_AVATAR_INVALID", message: "请选择已上传并审核通过的用户头像" }] });
      }

      if (profile) {
        const updated = await transaction.update(userProfiles).set({
          nickname: input.nickname,
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
          version: sql`${userProfiles.version} + 1`, updatedAt: new Date(), deletedAt: null,
        }).where(and(eq(userProfiles.userId, userId), eq(userProfiles.version, input.version))).returning({ userId: userProfiles.userId });
        if (updated.length !== 1) throw versionConflict();
      } else {
        await transaction.insert(userProfiles).values({
          userId, nickname: input.nickname, bio: input.bio, avatarFileId: input.avatarFileId,
          publicUserNo: `XZU${uuidv7().replaceAll("-", "").slice(-12).toUpperCase()}`,
        });
      }
      if (input.avatarFileId !== undefined) {
        await this.syncUserAvatarUsage(transaction, userId, input.avatarFileId);
      }
      const userUpdated = await transaction.update(users).set({
        profileInitialized: true, version: sql`${users.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(users.id, userId), eq(users.version, input.userVersion))).returning({ id: users.id });
      if (userUpdated.length !== 1) throw versionConflict();
      await this.outbox.enqueue(transaction, {
        aggregateType: "USER", aggregateId: userId, eventType: "UserProfileUpdated",
        payload: { user_id: userId }, traceId: metadata.traceId,
      });
    });
    return this.getMe(userId);
  }

  private async syncUserAvatarUsage(transaction: DatabaseTransaction, userId: string, fileId: string | null) {
    const active = await transaction.select({ id: fileUsages.id, fileId: fileUsages.fileId }).from(fileUsages).where(and(
      eq(fileUsages.targetType, "USER"),
      eq(fileUsages.targetId, userId),
      eq(fileUsages.usageType, "AVATAR"),
      isNull(fileUsages.deletedAt),
    ));
    const preserved = fileId ? active.find((usage) => usage.fileId === fileId) : undefined;
    const obsoleteIds = active.filter((usage) => usage.id !== preserved?.id).map((usage) => usage.id);
    if (obsoleteIds.length) {
      await transaction.update(fileUsages).set({ deletedAt: new Date() }).where(inArray(fileUsages.id, obsoleteIds));
    }
    if (fileId && !preserved) {
      await transaction.insert(fileUsages).values({
        id: uuidv7(), fileId, usageType: "AVATAR", targetType: "USER", targetId: userId,
      });
    }
  }

  async getPrivacySettings(userId: string) {
    const [settings] = await this.database.db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1);
    if (!settings) throw new AppError({ code: "PRIVACY_SETTINGS_NOT_FOUND", message: "隐私设置不存在", statusCode: 404 });
    return {
      show_online_status: settings.showOnlineStatus,
      show_public_profile: settings.showPublicProfile,
      personalized_recommendations: settings.personalizedRecommendations,
      version: settings.version,
      updated_at: settings.updatedAt,
    };
  }

  async updatePrivacySettings(userId: string, input: {
    showOnlineStatus?: boolean;
    showPublicProfile?: boolean;
    personalizedRecommendations?: boolean;
    version: number;
  }, metadata: RequestMetadata) {
    const updated = await this.database.db.transaction(async (transaction) => {
      const rows = await transaction.update(privacySettings).set({
        ...(input.showOnlineStatus !== undefined ? { showOnlineStatus: input.showOnlineStatus } : {}),
        ...(input.showPublicProfile !== undefined ? { showPublicProfile: input.showPublicProfile } : {}),
        ...(input.personalizedRecommendations !== undefined ? { personalizedRecommendations: input.personalizedRecommendations } : {}),
        version: sql`${privacySettings.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(privacySettings.userId, userId), eq(privacySettings.version, input.version))).returning();
      if (!rows[0]) throw versionConflict();
      await this.outbox.enqueue(transaction, {
        aggregateType: "USER", aggregateId: userId, eventType: "UserPrivacySettingsUpdated",
        payload: { user_id: userId, version: rows[0].version }, traceId: metadata.traceId,
      });
      return rows[0];
    });
    return {
      show_online_status: updated.showOnlineStatus,
      show_public_profile: updated.showPublicProfile,
      personalized_recommendations: updated.personalizedRecommendations,
      version: updated.version,
      updated_at: updated.updatedAt,
    };
  }

  async currentPolicies(scene?: PolicyAcceptanceScene) {
    if (scene) return (await this.latestPoliciesForScene(this.database.db, scene)).map(policyView);
    const now = new Date();
    const rows = await this.database.db.select({
      id: policyVersions.id, policyType: policyVersions.policyType, title: policyVersions.title,
      content: policyVersions.content, versionNo: policyVersions.versionNo, publishedAt: policyVersions.publishedAt,
      effectiveAt: policyVersions.effectiveAt, requiresReacceptance: policyVersions.requiresReacceptance,
    }).from(policyVersions).where(and(eq(policyVersions.status, "PUBLISHED"), lte(policyVersions.effectiveAt, now), inArray(policyVersions.policyType, policyTypes)))
      .orderBy(policyVersions.policyType, desc(policyVersions.versionNo));
    const latest = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!latest.has(row.policyType)) latest.set(row.policyType, row);
    return [...latest.values()].map(policyView);
  }

  async getPublishedPolicy(policyVersionId: string) {
    const [row] = await this.database.db.select({ id: policyVersions.id, policyType: policyVersions.policyType, title: policyVersions.title, content: policyVersions.content, versionNo: policyVersions.versionNo, publishedAt: policyVersions.publishedAt, effectiveAt: policyVersions.effectiveAt, requiresReacceptance: policyVersions.requiresReacceptance })
      .from(policyVersions).where(and(eq(policyVersions.id, policyVersionId), eq(policyVersions.status, "PUBLISHED"), lte(policyVersions.effectiveAt, new Date()))).limit(1);
    if (!row) throw new AppError({ code: errorCodes.POLICY_NOT_FOUND, message: "协议版本不存在或未发布", statusCode: 404 });
    return policyView(row);
  }

  async acceptPolicies(
    userId: string,
    scene: PolicyAcceptanceScene,
    confirmationMethod: PolicyConfirmationMethod,
    policyVersionIds: string[],
    metadata: RequestMetadata,
  ) {
    return this.acceptPoliciesWithExecutor(this.database.db, userId, scene, confirmationMethod, policyVersionIds, metadata);
  }

  async requirePolicyAcceptances(
    executor: Database | DatabaseTransaction,
    userId: string,
    scene: PolicyAcceptanceScene,
  ) {
    const required = await this.latestPoliciesForScene(executor, scene);
    const requiredIds = required.map((policy) => policy.id);
    const accepted = await executor.select({ policyVersionId: userPolicyAcceptances.policyVersionId })
      .from(userPolicyAcceptances)
      .where(and(
        eq(userPolicyAcceptances.userId, userId),
        eq(userPolicyAcceptances.acceptanceScene, scene),
        inArray(userPolicyAcceptances.policyVersionId, requiredIds),
      ));
    const acceptedIds = new Set(accepted.map((row) => row.policyVersionId));
    const missingIds = requiredIds.filter((id) => !acceptedIds.has(id));
    if (missingIds.length > 0) {
      throw new AppError({
        code: errorCodes.POLICY_ACCEPTANCE_REQUIRED,
        message: "请先确认当前业务场景所需协议",
        statusCode: 409,
        details: { acceptance_scene: scene, required_policy_version_ids: requiredIds, missing_policy_version_ids: missingIds },
      });
    }
    return required;
  }

  private async acceptPoliciesWithExecutor(
    executor: Database | DatabaseTransaction,
    userId: string,
    scene: PolicyAcceptanceScene,
    confirmationMethod: PolicyConfirmationMethod,
    policyVersionIds: string[],
    metadata: RequestMetadata,
  ) {
    const uniqueIds = [...new Set(policyVersionIds)];
    const required = await this.latestPoliciesForScene(executor, scene);
    const requiredIds = required.map((policy) => policy.id);
    if (uniqueIds.length !== requiredIds.length || requiredIds.some((id) => !uniqueIds.includes(id))) {
      throw new AppError({
        code: errorCodes.POLICY_ACCEPTANCE_MISMATCH,
        message: "提交的协议版本与当前场景要求不一致，请刷新协议后重新确认",
        statusCode: 409,
        details: { acceptance_scene: scene, required_policy_version_ids: requiredIds },
      });
    }
    await executor.insert(userPolicyAcceptances).values(uniqueIds.map((policyVersionId) => ({
      userId, policyVersionId, acceptanceScene: scene, confirmationMethod,
      ip: metadata.ip, userAgent: metadata.userAgent,
    }))).onConflictDoNothing();
    return { acceptance_scene: scene, confirmation_method: confirmationMethod, accepted_policy_version_ids: uniqueIds };
  }

  async listPolicyAcceptances(userId: string) {
    const rows = await this.database.db.select({ policyVersionId: userPolicyAcceptances.policyVersionId, acceptanceScene: userPolicyAcceptances.acceptanceScene, confirmationMethod: userPolicyAcceptances.confirmationMethod, acceptedAt: userPolicyAcceptances.acceptedAt, policyType: policyVersions.policyType, title: policyVersions.title, versionNo: policyVersions.versionNo, publishedAt: policyVersions.publishedAt })
      .from(userPolicyAcceptances).innerJoin(policyVersions, eq(policyVersions.id, userPolicyAcceptances.policyVersionId))
      .where(eq(userPolicyAcceptances.userId, userId)).orderBy(desc(userPolicyAcceptances.acceptedAt));
    return rows.map((row) => ({ policy_version_id: row.policyVersionId, policy_type: row.policyType, title: row.title, version_no: row.versionNo, published_at: row.publishedAt, acceptance_scene: row.acceptanceScene, confirmation_method: row.confirmationMethod, accepted_at: row.acceptedAt }));
  }

  private async latestPoliciesForScene(executor: Database | DatabaseTransaction, scene: PolicyAcceptanceScene) {
    const types = requiredPolicyTypes(scene);
    const rows = await executor.select({
      id: policyVersions.id, policyType: policyVersions.policyType, title: policyVersions.title,
      content: policyVersions.content, versionNo: policyVersions.versionNo, publishedAt: policyVersions.publishedAt,
      effectiveAt: policyVersions.effectiveAt, requiresReacceptance: policyVersions.requiresReacceptance,
    }).from(policyVersions).where(and(eq(policyVersions.status, "PUBLISHED"), lte(policyVersions.effectiveAt, new Date()), inArray(policyVersions.policyType, types)))
      .orderBy(policyVersions.policyType, desc(policyVersions.versionNo));
    const latest = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!latest.has(row.policyType)) latest.set(row.policyType, row);
    const missing = types.filter((type) => !latest.has(type));
    if (missing.length > 0) {
      throw new AppError({
        code: errorCodes.POLICY_CONFIGURATION_INCOMPLETE,
        message: "当前场景的本地测试协议尚未完整发布",
        statusCode: 503,
        details: { acceptance_scene: scene, missing_policy_types: missing },
      });
    }
    return types.map((type) => latest.get(type)!);
  }

  async submitIdentity(userId: string, input: { legalName: string; documentNumber: string }, metadata: RequestMetadata) {
    const legalName = this.protector.normalizeLegalName(input.legalName);
    const document = this.protector.normalizeDocument(input.documentNumber);
    const created = await this.database.db.transaction(async (transaction) => {
      await this.requirePolicyAcceptances(transaction, userId, "IDENTITY_VERIFICATION");
      const [active] = await transaction.select({ id: identityVerifications.id }).from(identityVerifications)
        .where(and(eq(identityVerifications.userId, userId), inArray(identityVerifications.status, ["PENDING", "VERIFIED"])))
        .orderBy(desc(identityVerifications.submittedAt)).limit(1).for("update");
      if (active) throw new AppError({ code: errorCodes.IDENTITY_ALREADY_ACTIVE, message: "已有处理中或已通过的实名认证", statusCode: 409 });
      const [verification] = await transaction.insert(identityVerifications).values({
        id: uuidv7(), userId, provider: "MANUAL_REVIEW", providerReference: `IDV-${uuidv7().replaceAll("-", "")}`,
        legalNameCiphertext: this.protector.encrypt("legal-name", legalName),
        legalNameHash: this.protector.piiHash("legal-name", legalName),
        legalNameMask: this.protector.maskLegalName(legalName),
        documentCiphertext: this.protector.encrypt("identity-document", document),
        documentHash: this.protector.piiHash("identity-document", document),
        documentMask: this.protector.maskDocument(document),
      }).returning({
        id: identityVerifications.id, status: identityVerifications.status, legalNameMask: identityVerifications.legalNameMask,
        documentMask: identityVerifications.documentMask, rejectionCode: identityVerifications.rejectionCode,
        rejectionReason: identityVerifications.rejectionReason, submittedAt: identityVerifications.submittedAt,
        verifiedAt: identityVerifications.verifiedAt, version: identityVerifications.version,
      });
      await this.outbox.enqueue(transaction, {
        aggregateType: "USER", aggregateId: userId, eventType: "IdentityVerificationSubmitted",
        payload: { user_id: userId, verification_id: verification.id }, traceId: metadata.traceId,
      });
      return verification;
    });
    return this.identityView(created);
  }

  async getIdentity(userId: string) {
    const [identity] = await this.database.db.select({
      id: identityVerifications.id, status: identityVerifications.status, legalNameMask: identityVerifications.legalNameMask,
      documentMask: identityVerifications.documentMask, rejectionCode: identityVerifications.rejectionCode,
      rejectionReason: identityVerifications.rejectionReason, submittedAt: identityVerifications.submittedAt,
      verifiedAt: identityVerifications.verifiedAt, version: identityVerifications.version,
    }).from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(desc(identityVerifications.submittedAt)).limit(1);
    return identity ? this.identityView(identity) : null;
  }

  async listIdentities(input: { status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "REVOKED"; cursor?: string; limit?: number; keyword?: string; sort: "created_desc" | "created_asc" }) {
    const limit = normalizePageSize(input.limit, 50);
    const scope = `admin-identities:${input.status}:${input.keyword ?? ""}:${input.sort}`;
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== scope) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "分页游标与实名认证筛选条件不匹配", statusCode: 400 });
    const ascending = input.sort === "created_asc";
    const cursorDate = cursor ? new Date(cursor.sort_value) : undefined;
    const keyword = input.keyword ? `%${input.keyword}%` : undefined;
    const rows = await this.database.db.select({
      id: identityVerifications.id, userId: identityVerifications.userId, status: identityVerifications.status,
      provider: identityVerifications.provider, providerReference: identityVerifications.providerReference,
      legalNameMask: identityVerifications.legalNameMask, documentMask: identityVerifications.documentMask,
      rejectionCode: identityVerifications.rejectionCode, rejectionReason: identityVerifications.rejectionReason,
      submittedAt: identityVerifications.submittedAt, verifiedAt: identityVerifications.verifiedAt, expiresAt: identityVerifications.expiresAt, version: identityVerifications.version,
      nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, phoneMask: users.phoneMask,
    }).from(identityVerifications)
      .innerJoin(users, eq(users.id, identityVerifications.userId))
      .leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(and(
        eq(identityVerifications.status, input.status),
        keyword ? or(ilike(userProfiles.nickname, keyword), ilike(userProfiles.publicUserNo, keyword), ilike(users.phoneMask, keyword), sql<boolean>`${identityVerifications.id}::text ILIKE ${keyword}`) : undefined,
        cursor && cursorDate ? ascending
          ? or(gt(identityVerifications.submittedAt, cursorDate), and(eq(identityVerifications.submittedAt, cursorDate), gt(identityVerifications.id, cursor.id)))
          : or(lt(identityVerifications.submittedAt, cursorDate), and(eq(identityVerifications.submittedAt, cursorDate), lt(identityVerifications.id, cursor.id)))
          : undefined,
      ))
      .orderBy(ascending ? asc(identityVerifications.submittedAt) : desc(identityVerifications.submittedAt), ascending ? asc(identityVerifications.id) : desc(identityVerifications.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.adminIdentityView(row)),
      next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.submittedAt.toISOString(), id: last.id, scope }, this.config.cursorSigningSecret) : null,
    };
  }

  async getAdminIdentity(verificationId: string) {
    const [row] = await this.database.db.select({
      id: identityVerifications.id, userId: identityVerifications.userId, status: identityVerifications.status,
      provider: identityVerifications.provider, providerReference: identityVerifications.providerReference,
      legalNameMask: identityVerifications.legalNameMask, documentMask: identityVerifications.documentMask,
      rejectionCode: identityVerifications.rejectionCode, rejectionReason: identityVerifications.rejectionReason,
      submittedAt: identityVerifications.submittedAt, verifiedAt: identityVerifications.verifiedAt, expiresAt: identityVerifications.expiresAt, version: identityVerifications.version,
      nickname: userProfiles.nickname, publicUserNo: userProfiles.publicUserNo, phoneMask: users.phoneMask,
    }).from(identityVerifications)
      .innerJoin(users, eq(users.id, identityVerifications.userId))
      .leftJoin(userProfiles, and(eq(userProfiles.userId, users.id), isNull(userProfiles.deletedAt)))
      .where(eq(identityVerifications.id, verificationId)).limit(1);
    if (!row) throw new AppError({ code: errorCodes.IDENTITY_NOT_FOUND, message: "实名认证记录不存在", statusCode: 404 });
    return this.adminIdentityView(row);
  }

  async reviewIdentity(adminId: string, verificationId: string, input: {
    decision: "VERIFIED" | "REJECTED";
    version: number;
    rejectionCode?: string;
    rejectionReason?: string;
    reason: string;
  }, metadata: RequestMetadata) {
    const reviewed = await this.database.db.transaction(async (transaction) => {
      const [current] = await transaction.select().from(identityVerifications)
        .where(eq(identityVerifications.id, verificationId)).limit(1).for("update");
      if (!current) throw new AppError({ code: errorCodes.IDENTITY_NOT_FOUND, message: "实名认证记录不存在", statusCode: 404 });
      if (current.version !== input.version) throw versionConflict();
      if (current.status !== "PENDING") throw new AppError({ code: errorCodes.IDENTITY_STATUS_INVALID, message: "当前实名认证状态不可审核", statusCode: 409 });
      if (input.decision === "REJECTED" && !input.rejectionReason) {
        throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "拒绝时必须填写原因", statusCode: 400 });
      }
      const rows = await transaction.update(identityVerifications).set({
        status: input.decision,
        rejectionCode: input.decision === "REJECTED" ? input.rejectionCode ?? "MANUAL_REJECTED" : null,
        rejectionReason: input.decision === "REJECTED" ? input.rejectionReason : null,
        verifiedAt: input.decision === "VERIFIED" ? new Date() : null,
        version: sql`${identityVerifications.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(identityVerifications.id, verificationId), eq(identityVerifications.status, "PENDING"), eq(identityVerifications.version, input.version),
      )).returning({
        id: identityVerifications.id, userId: identityVerifications.userId, status: identityVerifications.status,
        legalNameMask: identityVerifications.legalNameMask, documentMask: identityVerifications.documentMask,
        rejectionCode: identityVerifications.rejectionCode, rejectionReason: identityVerifications.rejectionReason,
        submittedAt: identityVerifications.submittedAt, verifiedAt: identityVerifications.verifiedAt, version: identityVerifications.version,
      });
      if (!rows[0]) throw versionConflict();
      await transaction.insert(adminOperationLogs).values({
        id: uuidv7(), adminId, action: `IDENTITY_${input.decision}`, targetType: "USER", targetId: current.userId,
        reason: input.reason, beforeJson: { verification_id: verificationId, status: current.status },
        afterJson: { verification_id: verificationId, status: rows[0].status, version: rows[0].version },
        requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent,
      });
      await this.outbox.enqueue(transaction, {
        aggregateType: "USER", aggregateId: current.userId, eventType: "IdentityVerificationReviewed",
        payload: { user_id: current.userId, verification_id: verificationId, status: rows[0].status }, traceId: metadata.traceId,
      });
      return rows[0];
    });
    return { user_id: reviewed.userId, ...this.identityView(reviewed) };
  }

  private async verifyLoginCode(transaction: DatabaseTransaction, phoneHash: string, code: string): Promise<SmsVerificationResult> {
    const [record] = await transaction.select().from(smsCodes)
      .where(and(eq(smsCodes.phoneHash, phoneHash), eq(smsCodes.purpose, "LOGIN")))
      .orderBy(desc(smsCodes.createdAt)).limit(1).for("update");
    if (!record || record.consumedAt) return { ok: false, code: "INVALID" };
    if (record.expiresAt <= new Date()) return { ok: false, code: "EXPIRED" };
    if (record.attemptCount >= record.maxAttempts) return { ok: false, code: "ATTEMPTS" };
    if (!this.protector.hashesEqual(record.codeHash, this.smsCodeHash(phoneHash, code))) {
      await transaction.update(smsCodes).set({ attemptCount: sql`${smsCodes.attemptCount} + 1` }).where(eq(smsCodes.id, record.id));
      return { ok: false, code: record.attemptCount + 1 >= record.maxAttempts ? "ATTEMPTS" : "INVALID" };
    }
    await transaction.update(smsCodes).set({ consumedAt: new Date() }).where(and(eq(smsCodes.id, record.id), isNull(smsCodes.consumedAt)));
    return { ok: true };
  }

  private throwSmsVerificationError(result: SmsVerificationResult): never {
    if (result.ok) throw new Error("Unexpected successful SMS result.");
    if (result.code === "EXPIRED") throw new AppError({ code: errorCodes.AUTH_SMS_CODE_EXPIRED, message: "验证码已过期", statusCode: 400 });
    if (result.code === "ATTEMPTS") throw new AppError({ code: errorCodes.AUTH_SMS_ATTEMPTS_EXCEEDED, message: "验证码错误次数过多，请重新获取", statusCode: 400 });
    throw new AppError({ code: errorCodes.AUTH_SMS_CODE_INVALID, message: "验证码错误或已使用", statusCode: 400 });
  }

  private issueUserAccessToken(userId: string, sessionId: string): string {
    return issueAccessToken(
      { sub: userId, principal_type: "user", token_use: "access", session_id: sessionId, jti: uuidv7() },
      { secret: this.config.userTokenSecret, issuer: this.config.tokenIssuer, audience: this.config.userTokenAudience, expiresInSeconds: this.config.accessTokenTtlSeconds },
    );
  }

  private smsCodeHash(phoneHash: string, code: string): string {
    return this.protector.authHash("sms-code", `${phoneHash}:LOGIN:${code}`);
  }

  private identityView(identity: {
    id: string;
    status: string;
    legalNameMask: string;
    documentMask: string;
    rejectionCode?: string | null;
    rejectionReason?: string | null;
    submittedAt: Date;
    verifiedAt?: Date | null;
    version: number;
  }) {
    return {
      id: identity.id, status: identity.status, legal_name_mask: identity.legalNameMask,
      document_mask: identity.documentMask, rejection_code: identity.rejectionCode ?? null,
      rejection_reason: identity.rejectionReason ?? null, submitted_at: identity.submittedAt,
      verified_at: identity.verifiedAt ?? null, version: identity.version,
    };
  }

  private adminIdentityView(identity: {
    id: string; userId: string; status: string; provider: string; providerReference: string;
    legalNameMask: string; documentMask: string; rejectionCode?: string | null; rejectionReason?: string | null;
    submittedAt: Date; verifiedAt?: Date | null; expiresAt?: Date | null; version: number;
    nickname?: string | null; publicUserNo?: string | null; phoneMask: string;
  }) {
    return {
      user_id: identity.userId,
      user: { nickname: identity.nickname ?? "未初始化用户", public_user_no: identity.publicUserNo ?? null, phone_mask: identity.phoneMask },
      provider: identity.provider, provider_reference: identity.providerReference,
      ...this.identityView(identity), expires_at: identity.expiresAt ?? null,
    };
  }
}

function versionConflict(): AppError {
  return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: "数据已被其他操作更新，请刷新后重试", statusCode: 409 });
}

function maskDeviceId(deviceId: string) { return `••••${deviceId.slice(-4)}`; }

function policyView(row: {
  id: string;
  policyType: string;
  title: string;
  content: string;
  versionNo: number;
  publishedAt: Date | null;
  effectiveAt: Date | null;
  requiresReacceptance: boolean;
}) {
  return {
    id: row.id,
    policy_type: row.policyType,
    title: row.title,
    content: row.content,
    version_no: row.versionNo,
    published_at: row.publishedAt,
    effective_at: row.effectiveAt,
    requires_reacceptance: row.requiresReacceptance,
  };
}
