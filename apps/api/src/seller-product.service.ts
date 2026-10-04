import { Inject, Injectable } from "@nestjs/common";
import { OutboxService } from "@xiongzai/application";
import { AppError, decodeCursor, encodeCursor, errorCodes, normalizePageSize } from "@xiongzai/contracts";
import {
  adminOperationLogs,
  favorites,
  fileUsages,
  files,
  identityVerifications,
  policyVersions,
  productImages,
  productReviewLogs,
  productSkus,
  products,
  productVersions,
  sellerApplications,
  sellerAvailabilitySlots,
  sellerProfiles,
  sellerReviewLogs,
  uuidv7,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@xiongzai/database";
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import { IdentityUserService, type RequestMetadata } from "./identity-user.service.js";
import { API_CONFIG, DATABASE_CLIENT } from "./tokens.js";

type SellerProfileInput = {
  sellerNickname: string;
  sellerAvatarFileId?: string | null;
  coverFileId?: string | null;
  introduction?: string | null;
  gameRank?: string | null;
  kd?: string | null;
  preferredMode?: string | null;
  playStyle?: string | null;
  gameExperience?: string | null;
  voiceFileId?: string | null;
  voiceDurationMs?: number | null;
  acceptingOrders?: boolean;
};

type ProductInput = { title: string; description: string; serviceTimeDescription?: string | null; coverFileId?: string | null };
type SellerReviewAction = "START_REVIEW" | "REQUEST_SUPPLEMENT" | "APPROVE" | "REJECT";
type ProductReviewAction = "APPROVE" | "REJECT" | "ADMIN_OFF_SALE" | "ADMIN_RESTORE" | "SOFT_DELETE";

@Injectable()
export class SellerProductService {
  private readonly outbox = new OutboxService();

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly identity: IdentityUserService,
  ) {}

  async getMySeller(userId: string) {
    const seller = await this.requireSellerByUser(userId);
    const [latestApplication] = await this.database.db.select().from(sellerApplications)
      .where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo)).limit(1);
    const latestSnapshot = latestApplication ? safeJson(latestApplication.snapshotJson) : null;
    const pendingProfileRevision = latestApplication && isProfileRevision(latestSnapshot) && ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "NEEDS_SUPPLEMENT", "REJECTED"].includes(latestApplication.status)
      ? profileRevisionView(latestApplication, latestSnapshot)
      : null;
    return { ...sellerView(seller), latest_application: latestApplication ? { ...applicationView(latestApplication), revision_kind: snapshotKind(latestSnapshot) } : null, pending_profile_revision: pendingProfileRevision };
  }

  async getSellerOverview(userId: string) {
    const seller = await this.requireApprovedSeller(userId);
    const counts = await this.database.db.select({ status: products.status, count: sql<number>`count(*)::int` }).from(products).where(eq(products.sellerId, seller.id)).groupBy(products.status);
    return { profile: sellerView(seller), service_counts: Object.fromEntries(counts.map((row) => [row.status, row.count])) };
  }

  async createSeller(userId: string, input: SellerProfileInput) {
    const existing = await this.database.db.select({ id: sellerProfiles.id }).from(sellerProfiles)
      .where(eq(sellerProfiles.userId, userId)).limit(1);
    if (existing[0]) throw conflict("SELLER_ALREADY_EXISTS", "陪玩资料已经创建");
    return this.database.db.transaction(async (tx) => {
      const voiceDurationMs = await this.validateSellerFiles(tx, userId, input);
      const voiceAuthorizationPolicyVersionId = await this.resolveVoiceAuthorizationPolicyVersionId(tx, userId, input.voiceFileId);
      const trustedInput = { ...input, voiceDurationMs };
      const id = uuidv7();
      const [row] = await tx.insert(sellerProfiles).values({
        id, userId, ...sellerInsert(trustedInput), voiceAuthorizationPolicyVersionId: voiceAuthorizationPolicyVersionId ?? null,
      }).returning();
      await this.syncSellerFileUsages(tx, id, row!);
      return sellerView(row!);
    });
  }

  async updateSeller(userId: string, input: SellerProfileInput & { version: number }) {
    const seller = await this.requireSellerByUser(userId);
    if (["PENDING_REVIEW", "BANNED"].includes(seller.status)) throw invalidState("当前陪玩状态不允许修改资料");
    if (["APPROVED", "SUSPENDED"].includes(seller.status)) {
      if (sellerPublicFieldsChanged(seller, input)) throw invalidState("已通过审核的公开资料必须提交资料变更审核，审核通过前不会替换买家可见主页");
      const [updated] = await this.database.db.update(sellerProfiles).set({ acceptingOrders: input.acceptingOrders ?? seller.acceptingOrders, updatedAt: new Date(), version: sql`${sellerProfiles.version} + 1` })
        .where(and(eq(sellerProfiles.id, seller.id), eq(sellerProfiles.version, input.version))).returning();
      if (!updated) throw versionConflict();
      return sellerView(updated);
    }
    return this.database.db.transaction(async (tx) => {
      const voiceDurationMs = await this.validateSellerFiles(tx, userId, input);
      const voiceAuthorizationPolicyVersionId = await this.resolveVoiceAuthorizationPolicyVersionId(tx, userId, input.voiceFileId);
      const trustedInput = { ...input, ...(voiceDurationMs !== undefined ? { voiceDurationMs } : { voiceDurationMs: undefined }) };
      const [updated] = await tx.update(sellerProfiles).set({
        ...sellerInsert(trustedInput),
        ...(voiceAuthorizationPolicyVersionId !== undefined ? { voiceAuthorizationPolicyVersionId } : {}),
        updatedAt: new Date(), version: sql`${sellerProfiles.version} + 1`,
      }).where(and(eq(sellerProfiles.id, seller.id), eq(sellerProfiles.version, input.version))).returning();
      if (!updated) throw versionConflict();
      await this.syncSellerFileUsages(tx, seller.id, updated);
      return sellerView(updated);
    });
  }

  async saveSellerProfileRevision(userId: string, input: SellerProfileInput & { sellerVersion: number; applicationVersion?: number }) {
    const seller = await this.requireSellerByUser(userId);
    if (!["APPROVED", "SUSPENDED"].includes(seller.status)) throw invalidState("只有已通过审核的陪玩可以提交公开资料变更");
    if (seller.version !== input.sellerVersion) throw versionConflict();
    return this.database.db.transaction(async (tx) => {
      const voiceDurationMs = await this.validateSellerFiles(tx, userId, input);
      const voiceAuthorizationPolicyVersionId = await this.resolveVoiceAuthorizationPolicyVersionId(tx, userId, input.voiceFileId);
      const trustedInput = { ...input, voiceDurationMs };
      const snapshot = sellerRevisionSnapshot(trustedInput, voiceAuthorizationPolicyVersionId ?? null);
      assertSellerSnapshotComplete(snapshot);
      const [latest] = await tx.select().from(sellerApplications).where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo)).limit(1).for("update");
      if (latest && isProfileRevision(safeJson(latest.snapshotJson)) && ["SUBMITTED", "UNDER_REVIEW"].includes(latest.status)) throw invalidState("已有资料变更正在审核，请等待审核结果后再提交新版本");
      if (latest && ["DRAFT", "NEEDS_SUPPLEMENT"].includes(latest.status) && isProfileRevision(safeJson(latest.snapshotJson))) {
        if (input.applicationVersion === undefined || latest.version !== input.applicationVersion) throw versionConflict();
        const [updated] = await tx.update(sellerApplications).set({ snapshotJson: snapshot, status: "DRAFT", reviewedAt: null, reviewedByAdminId: null, rejectionReason: null, requiredFieldsJson: null, version: sql`${sellerApplications.version} + 1`, updatedAt: new Date() })
          .where(and(eq(sellerApplications.id, latest.id), eq(sellerApplications.version, input.applicationVersion), inArray(sellerApplications.status, ["DRAFT", "NEEDS_SUPPLEMENT"]))).returning();
        if (!updated) throw versionConflict();
        return profileRevisionView(updated, snapshot);
      }
      if (input.applicationVersion !== undefined) throw versionConflict();
      const [last] = await tx.select({ versionNo: sellerApplications.versionNo }).from(sellerApplications).where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo)).limit(1);
      const [lastApproved] = await tx.select({ onboardingPolicyVersionId: sellerApplications.onboardingPolicyVersionId }).from(sellerApplications).where(and(eq(sellerApplications.sellerId, seller.id), eq(sellerApplications.status, "APPROVED"))).orderBy(desc(sellerApplications.versionNo)).limit(1);
      const [created] = await tx.insert(sellerApplications).values({ id: uuidv7(), sellerId: seller.id, versionNo: (last?.versionNo ?? 0) + 1, onboardingPolicyVersionId: lastApproved?.onboardingPolicyVersionId ?? null, snapshotJson: snapshot, status: "DRAFT" }).returning();
      return profileRevisionView(created!, snapshot);
    });
  }

  async submitSellerProfileRevision(userId: string, applicationId: string, expectedVersion: number, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const seller = await this.lockSellerByUser(tx, userId);
      if (!["APPROVED", "SUSPENDED"].includes(seller.status)) throw invalidState("当前陪玩状态不能提交资料变更审核");
      const [application] = await tx.select().from(sellerApplications).where(and(eq(sellerApplications.id, applicationId), eq(sellerApplications.sellerId, seller.id))).limit(1).for("update");
      if (!application) throw notFound("SELLER_APPLICATION_NOT_FOUND", "资料变更申请不存在");
      const snapshot = safeJson(application.snapshotJson);
      if (!isProfileRevision(snapshot) || application.status !== "DRAFT") throw invalidState("当前申请不是可提交的资料变更草稿");
      if (application.version !== expectedVersion) throw versionConflict();
      assertSellerSnapshotComplete(snapshot);
      const [updated] = await tx.update(sellerApplications).set({ status: "SUBMITTED", submittedAt: new Date(), reviewedAt: null, reviewedByAdminId: null, rejectionReason: null, requiredFieldsJson: null, version: sql`${sellerApplications.version} + 1`, updatedAt: new Date() })
        .where(and(eq(sellerApplications.id, applicationId), eq(sellerApplications.version, expectedVersion), eq(sellerApplications.status, "DRAFT"))).returning();
      if (!updated) throw versionConflict();
      await tx.insert(sellerReviewLogs).values({ id: uuidv7(), sellerId: seller.id, applicationId, action: "SUBMIT", oldStatus: "DRAFT", newStatus: "SUBMITTED", requestId: metadata.requestId });
      await this.outbox.enqueue(tx, { aggregateType: "SELLER", aggregateId: seller.id, eventType: "SellerProfileRevisionSubmitted", payload: { seller_id: seller.id, application_id: applicationId, version_no: application.versionNo }, traceId: metadata.traceId });
      return profileRevisionView(updated, snapshot);
    });
  }

  async submitSellerApplication(userId: string, expectedVersion: number, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const seller = await this.lockSellerByUser(tx, userId);
      if (!["DRAFT", "REJECTED"].includes(seller.status)) throw invalidState("当前状态不能提交入驻审核");
      if (seller.version !== expectedVersion) throw versionConflict();
      assertSellerApplicationComplete(seller);
      const verified = await tx.select({ id: identityVerifications.id }).from(identityVerifications)
        .where(and(eq(identityVerifications.userId, userId), eq(identityVerifications.status, "VERIFIED"))).limit(1);
      if (!verified[0]) throw new AppError({ code: "SELLER_IDENTITY_REQUIRED", message: "请先完成实名认证", statusCode: 409 });
      await this.identity.requirePolicyAcceptances(tx, userId, "IDENTITY_VERIFICATION");
      const onboardingPolicies = await this.identity.requirePolicyAcceptances(tx, userId, "SELLER_ONBOARDING");
      const onboardingPolicy = onboardingPolicies.find((policy) => policy.policyType === "SELLER_ONBOARDING_AGREEMENT")!;
      const voiceAuthorizationPolicyVersionId = await this.resolveVoiceAuthorizationPolicyVersionId(tx, userId, seller.voiceFileId);
      const [last] = await tx.select({ versionNo: sellerApplications.versionNo }).from(sellerApplications)
        .where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo)).limit(1);
      const versionNo = (last?.versionNo ?? 0) + 1;
      const id = uuidv7();
      const snapshot = sellerSnapshot(seller);
      const [application] = await tx.insert(sellerApplications).values({
        id, sellerId: seller.id, versionNo, onboardingPolicyVersionId: onboardingPolicy.id,
        snapshotJson: snapshot, status: "SUBMITTED", submittedAt: new Date(),
      }).returning();
      const changed = await tx.update(sellerProfiles).set({
        status: "PENDING_REVIEW", voiceAuthorizationPolicyVersionId,
        version: sql`${sellerProfiles.version} + 1`, updatedAt: new Date(),
      })
        .where(and(eq(sellerProfiles.id, seller.id), eq(sellerProfiles.version, expectedVersion))).returning({ id: sellerProfiles.id });
      if (!changed[0]) throw versionConflict();
      await tx.insert(sellerReviewLogs).values({
        id: uuidv7(), sellerId: seller.id, applicationId: id, action: "SUBMIT", oldStatus: null,
        newStatus: "SUBMITTED", requestId: metadata.requestId,
      });
      await this.outbox.enqueue(tx, { aggregateType: "SELLER", aggregateId: seller.id, eventType: "SellerApplicationSubmitted", payload: { seller_id: seller.id, application_id: id, version_no: versionNo }, traceId: metadata.traceId });
      return applicationView(application!);
    });
  }

  async listMyApplications(userId: string) {
    const seller = await this.requireSellerByUser(userId);
    const rows = await this.database.db.select().from(sellerApplications).where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo));
    return rows.map(applicationView);
  }

  async listSellerApplications(input:{status?:typeof sellerApplications.$inferSelect.status;keyword?:string;cursor?:string;limit?:unknown;sort:"created_desc"|"created_asc"}) {
    const limit=normalizePageSize(input.limit,20);const scope=discoveryScope("admin-seller-applications",input.status,input.keyword,input.sort);const cursor=input.cursor?decodeCursor(input.cursor,this.config.cursorSigningSecret):undefined;assertCursorScope(cursor,scope);const ascending=input.sort==="created_asc";const cursorCondition=cursor?(ascending?or(gt(sellerApplications.createdAt,new Date(cursor.sort_value)),and(eq(sellerApplications.createdAt,new Date(cursor.sort_value)),gt(sellerApplications.id,cursor.id))):or(lt(sellerApplications.createdAt,new Date(cursor.sort_value)),and(eq(sellerApplications.createdAt,new Date(cursor.sort_value)),lt(sellerApplications.id,cursor.id)))):undefined;
    const rows = await this.database.db.select({ application: sellerApplications, seller: sellerProfiles }).from(sellerApplications)
      .innerJoin(sellerProfiles, eq(sellerApplications.sellerId, sellerProfiles.id))
      .where(and(input.status?eq(sellerApplications.status,input.status):undefined,input.keyword?or(ilike(sellerProfiles.sellerNickname,likePattern(input.keyword)),sql<boolean>`${sellerApplications.id}::text ILIKE ${likePattern(input.keyword)}`):undefined,cursorCondition)).orderBy(ascending?asc(sellerApplications.createdAt):desc(sellerApplications.createdAt),ascending?asc(sellerApplications.id):desc(sellerApplications.id)).limit(limit+1);
    return cursorPage(rows,limit,(row)=>row.application.createdAt.toISOString(),this.config.cursorSigningSecret,({application,seller})=>({...applicationView(application),seller:sellerView(seller),snapshot:safeJson(application.snapshotJson)}),scope);
  }

  async getAdminSellerApplication(applicationId:string) {
    const [row] = await this.database.db.select({application:sellerApplications,seller:sellerProfiles}).from(sellerApplications).innerJoin(sellerProfiles,eq(sellerApplications.sellerId,sellerProfiles.id)).where(eq(sellerApplications.id,applicationId)).limit(1);
    if(!row) throw notFound("SELLER_APPLICATION_NOT_FOUND","入驻申请不存在");
    const snapshot=safeJson(row.application.snapshotJson);const snapshotVoicePolicy=typeof snapshot.voice_authorization_policy_version_id==="string"?snapshot.voice_authorization_policy_version_id:null;
    const policyIds = [row.application.onboardingPolicyVersionId, snapshotVoicePolicy ?? (row.seller.voiceFileId ? row.seller.voiceAuthorizationPolicyVersionId : null)].filter((value): value is string => Boolean(value));
    const [logs, policyRows] = await Promise.all([
      this.database.db.select({id:sellerReviewLogs.id,action:sellerReviewLogs.action,old_status:sellerReviewLogs.oldStatus,new_status:sellerReviewLogs.newStatus,admin_id:sellerReviewLogs.adminId,reason:sellerReviewLogs.reason,request_id:sellerReviewLogs.requestId,created_at:sellerReviewLogs.createdAt}).from(sellerReviewLogs).where(eq(sellerReviewLogs.applicationId,applicationId)).orderBy(asc(sellerReviewLogs.createdAt)),
      policyIds.length ? this.database.db.select().from(policyVersions).where(inArray(policyVersions.id, policyIds)) : Promise.resolve([]),
    ]);
    const policiesById = new Map(policyRows.map((policy) => [policy.id, policyReferenceView(policy)]));
    return {
      ...applicationView(row.application), revision_kind:snapshotKind(snapshot), snapshot, seller:sellerView(row.seller), current_public_profile:sellerSnapshot(row.seller), logs,
      onboarding_policy: row.application.onboardingPolicyVersionId ? policiesById.get(row.application.onboardingPolicyVersionId) ?? null : null,
      voice_authorization_policy: snapshotVoicePolicy ? policiesById.get(snapshotVoicePolicy) ?? null : row.seller.voiceFileId && row.seller.voiceAuthorizationPolicyVersionId ? policiesById.get(row.seller.voiceAuthorizationPolicyVersionId) ?? null : null,
    };
  }

  async getAdminSeller(sellerId:string){const [seller]=await this.database.db.select().from(sellerProfiles).where(eq(sellerProfiles.id,sellerId)).limit(1);if(!seller)throw notFound("SELLER_NOT_FOUND","陪玩资料不存在");const [applications,logs,availability]=await Promise.all([this.database.db.select().from(sellerApplications).where(eq(sellerApplications.sellerId,sellerId)).orderBy(desc(sellerApplications.versionNo)).limit(100),this.database.db.select({id:sellerReviewLogs.id,application_id:sellerReviewLogs.applicationId,action:sellerReviewLogs.action,old_status:sellerReviewLogs.oldStatus,new_status:sellerReviewLogs.newStatus,admin_id:sellerReviewLogs.adminId,reason:sellerReviewLogs.reason,request_id:sellerReviewLogs.requestId,created_at:sellerReviewLogs.createdAt}).from(sellerReviewLogs).where(eq(sellerReviewLogs.sellerId,sellerId)).orderBy(desc(sellerReviewLogs.createdAt)).limit(100),this.database.db.select().from(sellerAvailabilitySlots).where(eq(sellerAvailabilitySlots.sellerId,sellerId)).orderBy(desc(sellerAvailabilitySlots.startsAt)).limit(100)]);return {...sellerView(seller),current_public_profile:sellerSnapshot(seller),applications:applications.map((row)=>({...applicationView(row),snapshot:safeJson(row.snapshotJson)})),availability_slots:availability.map(slotView),review_logs:logs};}

  async reviewSeller(adminId: string, applicationId: string, input: { action: SellerReviewAction; version: number; reason?: string; requiredFields?: string[] }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [application] = await tx.select().from(sellerApplications).where(eq(sellerApplications.id, applicationId)).limit(1).for("update");
      if (!application) throw notFound("SELLER_APPLICATION_NOT_FOUND", "入驻申请不存在");
      if (application.version !== input.version) throw versionConflict();
      const transition = sellerReviewTransition(application.status, input.action);
      if ((input.action === "REJECT" || input.action === "REQUEST_SUPPLEMENT") && !input.reason) throw validation("reason", "必须填写审核原因");
      const [seller] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.id, application.sellerId)).limit(1).for("update");
      if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩资料不存在");
      const snapshot=safeJson(application.snapshotJson);const profileRevision=isProfileRevision(snapshot);
      const now = new Date();
      const [updated] = await tx.update(sellerApplications).set({
        status: transition, reviewedByAdminId: adminId, reviewedAt: input.action === "START_REVIEW" ? null : now,
        rejectionReason: input.action === "REJECT" ? input.reason : null,
        requiredFieldsJson: input.action === "REQUEST_SUPPLEMENT" ? (input.requiredFields ?? []) : null,
        version: sql`${sellerApplications.version} + 1`, updatedAt: now,
      }).where(and(eq(sellerApplications.id, applicationId), eq(sellerApplications.version, input.version), eq(sellerApplications.status, application.status))).returning();
      if (!updated) throw versionConflict();
      if(profileRevision&&input.action==="APPROVE"){
        const revisionInput=sellerInputFromSnapshot(snapshot);const voiceDurationMs=await this.validateSellerFiles(tx,seller.userId,revisionInput);const voiceAuthorizationPolicyVersionId=await this.resolveVoiceAuthorizationPolicyVersionId(tx,seller.userId,revisionInput.voiceFileId);
        const [published]=await tx.update(sellerProfiles).set({...sellerInsert({...revisionInput,voiceDurationMs}),voiceAuthorizationPolicyVersionId:voiceAuthorizationPolicyVersionId??null,status:seller.status,acceptingOrders:seller.acceptingOrders,approvedAt:seller.approvedAt,version:sql`${sellerProfiles.version} + 1`,updatedAt:now}).where(eq(sellerProfiles.id,seller.id)).returning();
        if(!published)throw versionConflict();await this.syncSellerFileUsages(tx,seller.id,published);
      }else if(!profileRevision){
        const sellerStatus = input.action === "APPROVE" ? "APPROVED" : input.action === "REJECT" ? "REJECTED" : input.action === "REQUEST_SUPPLEMENT" ? "DRAFT" : seller.status;
        await tx.update(sellerProfiles).set({status:sellerStatus,approvedAt:input.action === "APPROVE" ? now : seller.approvedAt,acceptingOrders:input.action === "APPROVE" ? seller.acceptingOrders : false,version:sql`${sellerProfiles.version} + 1`,updatedAt:now}).where(eq(sellerProfiles.id,seller.id));
      }
      await tx.insert(sellerReviewLogs).values({ id: uuidv7(), sellerId: seller.id, applicationId, action: input.action, oldStatus: application.status, newStatus: transition, adminId, reason: input.reason, requestId: metadata.requestId });
      await this.audit(tx, adminId, `SELLER_REVIEW_${input.action}`, "SELLER", seller.id, input.reason ?? "审核状态流转", application, updated, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "SELLER", aggregateId: seller.id, eventType: `SellerApplication${pascal(input.action)}`, payload: { seller_id: seller.id, application_id: applicationId, status: transition }, traceId: metadata.traceId });
      return applicationView(updated);
    });
  }

  async changeSellerStatus(adminId: string, sellerId: string, input: { action: "SUSPEND" | "RESTORE" | "BAN"; version: number; reason: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [seller] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.id, sellerId)).limit(1).for("update");
      if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩资料不存在");
      if (seller.version !== input.version) throw versionConflict();
      const next = sellerStatusTransition(seller.status, input.action);
      const [latest] = await tx.select().from(sellerApplications).where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo)).limit(1);
      if (!latest) throw invalidState("陪玩没有可关联的审核申请");
      const [updated] = await tx.update(sellerProfiles).set({ status: next, acceptingOrders: input.action === "RESTORE" ? seller.acceptingOrders : false, suspendedReason: input.action === "RESTORE" ? null : input.reason, version: sql`${sellerProfiles.version} + 1`, updatedAt: new Date() })
        .where(and(eq(sellerProfiles.id, sellerId), eq(sellerProfiles.version, input.version))).returning();
      if (!updated) throw versionConflict();
      await tx.insert(sellerReviewLogs).values({ id: uuidv7(), sellerId, applicationId: latest.id, action: input.action, oldStatus: latest.status, newStatus: latest.status, adminId, reason: input.reason, requestId: metadata.requestId });
      await this.audit(tx, adminId, `SELLER_${input.action}`, "SELLER", sellerId, input.reason, seller, updated, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "SELLER", aggregateId: sellerId, eventType: `Seller${pascal(input.action)}`, payload: { seller_id: sellerId, status: next }, traceId: metadata.traceId });
      return sellerView(updated);
    });
  }

  async createProduct(userId: string, input: ProductInput) {
    const seller = await this.requireApprovedSeller(userId);
    await this.validateOwnedFiles(userId, input.coverFileId ? [input.coverFileId] : [], "PRODUCT_IMAGE");
    return this.database.db.transaction(async (tx) => {
      const id = uuidv7();
      const [row] = await tx.insert(products).values({ id, sellerId: seller.id, ...productInsert(input) }).returning();
      await this.syncProductCoverUsage(tx, id, row!.coverFileId);
      return productView(row!, seller);
    });
  }

  async updateProduct(userId: string, productId: string, input: ProductInput & { version: number }) {
    const seller = await this.requireApprovedSeller(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    if (!["DRAFT", "REVIEW_REJECTED", "OFF_SALE"].includes(product.status)) throw invalidState("当前服务状态不允许编辑");
    await this.validateOwnedFiles(userId, input.coverFileId ? [input.coverFileId] : [], "PRODUCT_IMAGE");
    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx.update(products).set({ ...productInsert(input), updatedAt: new Date(), version: sql`${products.version} + 1` })
        .where(and(eq(products.id, productId), eq(products.version, input.version), ne(products.status, "DELETED"))).returning();
      if (!updated) throw versionConflict();
      await this.syncProductCoverUsage(tx, productId, updated.coverFileId);
      return productView(updated, seller);
    });
  }

  async listMyProducts(userId: string) {
    const seller = await this.requireSellerByUser(userId);
    const rows = await this.database.db.select().from(products).where(eq(products.sellerId, seller.id)).orderBy(desc(products.updatedAt));
    return rows.map((row) => productView(row, seller));
  }

  async getMyProduct(userId: string, productId: string) {
    const seller = await this.requireSellerByUser(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    return this.productDetail(product, seller, true);
  }

  async addSku(userId: string, productId: string, input: { skuName: string; description?: string | null; priceCent: bigint; durationMinutes: number; sortOrder: number }) {
    const seller = await this.requireApprovedSeller(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    this.ensureProductEditable(product.status);
    const [sku] = await this.database.db.insert(productSkus).values({ id: uuidv7(), productId, ...input }).returning();
    await this.recalculateMinPrice(productId);
    return skuView(sku!);
  }

  async updateSku(userId: string, productId: string, skuId: string, input: { skuName?: string; description?: string | null; priceCent?: bigint; durationMinutes?: number; status?: "ACTIVE" | "INACTIVE" | "DELETED"; sortOrder?: number; version: number }) {
    const seller = await this.requireApprovedSeller(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    this.ensureProductEditable(product.status);
    const [updated] = await this.database.db.update(productSkus).set({
      ...(input.skuName !== undefined ? { skuName: input.skuName } : {}), ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priceCent !== undefined ? { priceCent: input.priceCent } : {}), ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.status !== undefined ? { status: input.status, deletedAt: input.status === "DELETED" ? new Date() : null } : {}), ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      version: sql`${productSkus.version} + 1`, updatedAt: new Date(),
    }).where(and(eq(productSkus.id, skuId), eq(productSkus.productId, productId), eq(productSkus.version, input.version))).returning();
    if (!updated) throw versionConflict();
    await this.recalculateMinPrice(productId);
    return skuView(updated);
  }

  async replaceImages(userId: string, productId: string, input: { version: number; images: Array<{ fileId: string; sortOrder: number; isCover: boolean }> }) {
    const seller = await this.requireApprovedSeller(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    this.ensureProductEditable(product.status);
    await this.validateOwnedFiles(userId, input.images.map((item) => item.fileId), "PRODUCT_IMAGE");
    return this.database.db.transaction(async (tx) => {
      await tx.update(productImages).set({ deletedAt: new Date() }).where(and(eq(productImages.productId, productId), isNull(productImages.deletedAt)));
      const rows = input.images.length ? await tx.insert(productImages).values(input.images.map((item) => ({ id: uuidv7(), productId, fileId: item.fileId, sortOrder: item.sortOrder, isCover: item.isCover }))).returning() : [];
      const cover = input.images.find((item) => item.isCover);
      const changed = await tx.update(products).set({ coverFileId: cover?.fileId ?? null, version: sql`${products.version} + 1`, updatedAt: new Date() }).where(and(eq(products.id, productId), eq(products.version, input.version))).returning({ id: products.id });
      if (!changed[0]) throw versionConflict();
      await this.syncProductFileUsages(tx, productId, input.images);
      return rows.map(imageView);
    });
  }

  async submitProduct(userId: string, productId: string, expectedVersion: number, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const seller = await this.lockApprovedSeller(tx, userId);
      const [product] = await tx.select().from(products).where(and(eq(products.id, productId), eq(products.sellerId, seller.id))).limit(1).for("update");
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "服务不存在");
      if (!["DRAFT", "REVIEW_REJECTED", "OFF_SALE"].includes(product.status)) throw invalidState("当前服务状态不能提交审核");
      if (product.version !== expectedVersion) throw versionConflict();
      const skus = await tx.select().from(productSkus).where(and(eq(productSkus.productId, productId), eq(productSkus.status, "ACTIVE"), isNull(productSkus.deletedAt))).orderBy(asc(productSkus.sortOrder));
      if (!skus.length) throw validation("skus", "至少需要一个启用的服务规格");
      const images = await tx.select().from(productImages).where(and(eq(productImages.productId, productId), isNull(productImages.deletedAt))).orderBy(asc(productImages.sortOrder));
      const [lastVersion] = await tx.select({ versionNo: productVersions.versionNo }).from(productVersions)
        .where(eq(productVersions.productId, productId)).orderBy(desc(productVersions.versionNo)).limit(1);
      const nextVersion = (lastVersion?.versionNo ?? 0) + 1;
      const versionId = uuidv7();
      await tx.insert(productVersions).values({ id: versionId, productId, versionNo: nextVersion, snapshotJson: productSnapshot(product, skus, images), submittedByUserId: userId });
      const [updated] = await tx.update(products).set({ status: "PENDING_REVIEW", currentVersionNo: nextVersion, submittedAt: new Date(), rejectionReason: null, minPriceCent: minPrice(skus), version: sql`${products.version} + 1`, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.version, expectedVersion), eq(products.status, product.status))).returning();
      if (!updated) throw versionConflict();
      await tx.insert(productReviewLogs).values({ id: uuidv7(), productId, productVersionId: versionId, action: product.status === "OFF_SALE" ? "SELLER_RESTORE" : "SUBMIT", oldStatus: product.status, newStatus: "PENDING_REVIEW", operatorUserId: userId, requestId: metadata.requestId });
      await this.outbox.enqueue(tx, { aggregateType: "PRODUCT", aggregateId: productId, eventType: "ProductSubmitted", payload: { product_id: productId, product_version_id: versionId, version_no: nextVersion }, traceId: metadata.traceId });
      return productView(updated, seller);
    });
  }

  async offSaleProduct(userId: string, productId: string, expectedVersion: number, metadata: RequestMetadata) {
    const seller = await this.requireApprovedSeller(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    if (product.status !== "ON_SALE") throw invalidState("只有在售服务可以下架");
    const [updated] = await this.database.db.transaction(async (tx) => {
      const changed = await tx.update(products).set({ status: "OFF_SALE", version: sql`${products.version} + 1`, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.status, "ON_SALE"), eq(products.version, expectedVersion))).returning();
      if (!changed[0]) throw versionConflict();
      await tx.insert(productReviewLogs).values({ id: uuidv7(), productId, action: "SELLER_OFF_SALE", oldStatus: "ON_SALE", newStatus: "OFF_SALE", operatorUserId: userId, requestId: metadata.requestId });
      await this.outbox.enqueue(tx, { aggregateType: "PRODUCT", aggregateId: productId, eventType: "ProductOffSale", payload: { product_id: productId }, traceId: metadata.traceId });
      return changed;
    });
    return productView(updated!, seller);
  }

  async deleteProduct(userId: string, productId: string, expectedVersion: number, metadata: RequestMetadata) {
    const seller = await this.requireApprovedSeller(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    if (["PENDING_REVIEW", "ON_SALE", "DELETED"].includes(product.status)) throw invalidState("请先下架服务，再执行删除");
    const [updated] = await this.database.db.transaction(async (tx) => {
      const changed = await tx.update(products).set({ status: "DELETED", deletedAt: new Date(), version: sql`${products.version} + 1`, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.version, expectedVersion), ne(products.status, "DELETED"))).returning();
      if (!changed[0]) throw versionConflict();
      await tx.insert(productReviewLogs).values({ id: uuidv7(), productId, action: "DELETE", oldStatus: product.status, newStatus: "DELETED", operatorUserId: userId, requestId: metadata.requestId });
      return changed;
    });
    return productView(updated!, seller);
  }

  async listProductReviews(input:{status?:typeof products.$inferSelect.status;keyword?:string;cursor?:string;limit?:unknown;sort:"created_desc"|"created_asc"}) {
    const limit = normalizePageSize(input.limit, 20);const scope=discoveryScope("admin-product-reviews",input.status,input.keyword,input.sort);const cursor=input.cursor?decodeCursor(input.cursor,this.config.cursorSigningSecret):undefined;assertCursorScope(cursor,scope);const ascending=input.sort==="created_asc";const cursorCondition=cursor?(ascending?or(gt(products.createdAt,new Date(cursor.sort_value)),and(eq(products.createdAt,new Date(cursor.sort_value)),gt(products.id,cursor.id))):or(lt(products.createdAt,new Date(cursor.sort_value)),and(eq(products.createdAt,new Date(cursor.sort_value)),lt(products.id,cursor.id)))):undefined;
    const rows = await this.database.db.select({ product: products, seller: sellerProfiles }).from(products)
      .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
      .where(and(input.status?eq(products.status,input.status):undefined,input.keyword?or(ilike(products.title,likePattern(input.keyword)),ilike(sellerProfiles.sellerNickname,likePattern(input.keyword)),sql<boolean>`${products.id}::text ILIKE ${likePattern(input.keyword)}`):undefined,cursorCondition))
      .orderBy(ascending?asc(products.createdAt):desc(products.createdAt),ascending?asc(products.id):desc(products.id)).limit(limit+1);
    return cursorPage(rows,limit,(row)=>row.product.createdAt.toISOString(),this.config.cursorSigningSecret,({product,seller})=>productView(product,seller),scope);
  }

  async getAdminProduct(productId:string){const [row]=await this.database.db.select({product:products,seller:sellerProfiles}).from(products).innerJoin(sellerProfiles,eq(products.sellerId,sellerProfiles.id)).where(eq(products.id,productId)).limit(1);if(!row)throw notFound("PRODUCT_NOT_FOUND","服务不存在");const [detail,logs]=await Promise.all([this.productDetail(row.product,row.seller,true),this.database.db.select({id:productReviewLogs.id,action:productReviewLogs.action,old_status:productReviewLogs.oldStatus,new_status:productReviewLogs.newStatus,admin_id:productReviewLogs.adminId,operator_user_id:productReviewLogs.operatorUserId,reason:productReviewLogs.reason,created_at:productReviewLogs.createdAt}).from(productReviewLogs).where(eq(productReviewLogs.productId,productId)).orderBy(desc(productReviewLogs.createdAt)).limit(100)]);return {...detail,review_logs:logs};}

  async reviewProduct(adminId: string, productId: string, input: { action: ProductReviewAction; version: number; reason?: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1).for("update");
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "服务不存在");
      if (product.version !== input.version) throw versionConflict();
      const allowed=input.action==="ADMIN_OFF_SALE"?["ON_SALE","OFF_SALE","REVIEW_REJECTED"].includes(product.status):input.action==="ADMIN_RESTORE"?product.status==="ADMIN_OFF_SALE":input.action==="SOFT_DELETE"?["DRAFT","REVIEW_REJECTED","OFF_SALE","ADMIN_OFF_SALE"].includes(product.status):product.status==="PENDING_REVIEW";
      if(!allowed)throw invalidState("当前服务状态不允许执行该审核或治理操作");
      if (input.action !== "APPROVE" && !input.reason) throw validation("reason", "必须填写审核或治理原因");
      const next = input.action === "APPROVE" || input.action === "ADMIN_RESTORE" ? "ON_SALE" : input.action === "REJECT" ? "REVIEW_REJECTED" : input.action==="SOFT_DELETE"?"DELETED":"ADMIN_OFF_SALE";
      const [version] = await tx.select().from(productVersions).where(and(eq(productVersions.productId, productId), eq(productVersions.versionNo, product.currentVersionNo))).limit(1);
      const [updated] = await tx.update(products).set({ status: next, rejectionReason: ["APPROVE","ADMIN_RESTORE"].includes(input.action) ? null : input.reason, approvedAt: input.action === "APPROVE" ? new Date() : product.approvedAt,deletedAt:input.action==="SOFT_DELETE"?new Date():input.action==="ADMIN_RESTORE"?null:product.deletedAt, version: sql`${products.version} + 1`, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.version, input.version), eq(products.status, product.status))).returning();
      if (!updated) throw versionConflict();
      await tx.insert(productReviewLogs).values({ id: uuidv7(), productId, productVersionId: version?.id, action: input.action==="SOFT_DELETE"?"DELETE":input.action==="ADMIN_RESTORE"?"SELLER_RESTORE":input.action, oldStatus: product.status, newStatus: next, adminId, reason: input.reason, requestId: metadata.requestId });
      await this.audit(tx, adminId, `PRODUCT_REVIEW_${input.action}`, "PRODUCT", productId, input.reason ?? "审核通过", product, updated, metadata);
      await this.outbox.enqueue(tx, { aggregateType: "PRODUCT", aggregateId: productId, eventType: `Product${pascal(input.action)}`, payload: { product_id: productId, status: next }, traceId: metadata.traceId });
      const [seller] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.id, product.sellerId)).limit(1);
      return productView(updated, seller!);
    });
  }

  async addAvailability(userId: string, input: { startsAt: Date; endsAt: Date; status: "OPEN" | "BLOCKED" | "CLOSED" }) {
    const seller = await this.requireApprovedSeller(userId);
    if (input.startsAt >= input.endsAt) throw validation("ends_at", "结束时间必须晚于开始时间");
    if (input.status === "OPEN") await this.assertNoOpenSlotOverlap(seller.id, input.startsAt, input.endsAt);
    const [row] = await this.database.db.insert(sellerAvailabilitySlots).values({ id: uuidv7(), sellerId: seller.id, ...input }).returning();
    return slotView(row!);
  }

  async listAvailability(userId: string) {
    const seller = await this.requireSellerByUser(userId);
    const rows = await this.database.db.select().from(sellerAvailabilitySlots).where(eq(sellerAvailabilitySlots.sellerId, seller.id)).orderBy(asc(sellerAvailabilitySlots.startsAt));
    return rows.map(slotView);
  }

  async listPublicAvailability(sellerId: string, from?: Date, to?: Date) {
    const [seller] = await this.database.db.select({ id: sellerProfiles.id }).from(sellerProfiles).where(and(eq(sellerProfiles.id, sellerId), eq(sellerProfiles.status, "APPROVED"), eq(sellerProfiles.acceptingOrders, true))).limit(1);
    if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩当前不可预约");
    const start = from && from > new Date() ? from : new Date();
    const end = to ?? new Date(start.getTime() + 14 * 86_400_000);
    if (end <= start || end.getTime() - start.getTime() > 60 * 86_400_000) throw validation("to", "查询结束时间必须晚于开始时间且范围不超过 60 天");
    const rows = await this.database.db.select().from(sellerAvailabilitySlots).where(and(
      eq(sellerAvailabilitySlots.sellerId, sellerId), eq(sellerAvailabilitySlots.status, "OPEN"),
      gt(sellerAvailabilitySlots.endsAt, start), lt(sellerAvailabilitySlots.startsAt, end),
    )).orderBy(asc(sellerAvailabilitySlots.startsAt));
    return rows.map(slotView);
  }

  async updateAvailability(userId: string, slotId: string, input: { startsAt?: Date; endsAt?: Date; status?: "OPEN" | "BLOCKED" | "CLOSED"; version: number }) {
    const seller = await this.requireApprovedSeller(userId);
    const [slot] = await this.database.db.select().from(sellerAvailabilitySlots).where(and(eq(sellerAvailabilitySlots.id, slotId), eq(sellerAvailabilitySlots.sellerId, seller.id))).limit(1);
    if (!slot) throw notFound("AVAILABILITY_NOT_FOUND", "可用时段不存在");
    const startsAt = input.startsAt ?? slot.startsAt; const endsAt = input.endsAt ?? slot.endsAt; const status = input.status ?? slot.status;
    if (startsAt >= endsAt) throw validation("ends_at", "结束时间必须晚于开始时间");
    if (status === "OPEN") await this.assertNoOpenSlotOverlap(seller.id, startsAt, endsAt, slotId);
    const [updated] = await this.database.db.update(sellerAvailabilitySlots).set({ startsAt, endsAt, status, version: sql`${sellerAvailabilitySlots.version} + 1`, updatedAt: new Date() })
      .where(and(eq(sellerAvailabilitySlots.id, slotId), eq(sellerAvailabilitySlots.version, input.version))).returning();
    if (!updated) throw versionConflict();
    return slotView(updated);
  }

  async removeAvailability(userId: string, slotId: string, version: number) {
    return this.updateAvailability(userId, slotId, { status: "CLOSED", version });
  }

  async listCompanions(input: { cursor?: string; limit?: unknown; acceptingOrders?: boolean; keyword?: string; sort: "comprehensive" | "rating" | "sales" }) {
    const limit = normalizePageSize(input.limit, 20);
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const keyword = input.keyword?.trim();
    const scope = discoveryScope("companions", input.sort, keyword, input.acceptingOrders);
    assertCursorScope(cursor, scope);
    const cursorCondition = !cursor ? undefined : input.sort === "rating"
      ? sql<boolean>`(${sellerProfiles.ratingAvg} < ${cursor.sort_value} OR (${sellerProfiles.ratingAvg} = ${cursor.sort_value} AND ${sellerProfiles.id} < ${cursor.id}))`
      : input.sort === "sales"
        ? sql<boolean>`(${sellerProfiles.completedOrderCount} < ${Number(cursor.sort_value)} OR (${sellerProfiles.completedOrderCount} = ${Number(cursor.sort_value)} AND ${sellerProfiles.id} < ${cursor.id}))`
        : or(lt(sellerProfiles.approvedAt, new Date(cursor.sort_value)), and(eq(sellerProfiles.approvedAt, new Date(cursor.sort_value)), lt(sellerProfiles.id, cursor.id)));
    const ordering = input.sort === "rating"
      ? [desc(sellerProfiles.ratingAvg), desc(sellerProfiles.id)]
      : input.sort === "sales"
        ? [desc(sellerProfiles.completedOrderCount), desc(sellerProfiles.id)]
        : [desc(sellerProfiles.approvedAt), desc(sellerProfiles.id)];
    const rows = await this.database.db.select().from(sellerProfiles).where(and(
      eq(sellerProfiles.status, "APPROVED"),
      input.acceptingOrders === undefined ? undefined : eq(sellerProfiles.acceptingOrders, input.acceptingOrders),
      keyword ? or(ilike(sellerProfiles.sellerNickname, likePattern(keyword)), ilike(sellerProfiles.introduction, likePattern(keyword)), ilike(sellerProfiles.gameRank, likePattern(keyword)), ilike(sellerProfiles.preferredMode, likePattern(keyword))) : undefined,
      cursorCondition,
    )).orderBy(...ordering).limit(limit + 1);
    return cursorPage(rows, limit, (row) => input.sort === "rating" ? row.ratingAvg : input.sort === "sales" ? String(row.completedOrderCount) : (row.approvedAt ?? row.createdAt).toISOString(), this.config.cursorSigningSecret, sellerView, scope);
  }

  async getCompanion(sellerId: string) {
    const [seller] = await this.database.db.select().from(sellerProfiles).where(and(eq(sellerProfiles.id, sellerId), eq(sellerProfiles.status, "APPROVED"))).limit(1);
    if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩主页不存在");
    const services = await this.database.db.select().from(products).where(and(eq(products.sellerId, sellerId), eq(products.status, "ON_SALE"), isNull(products.deletedAt))).orderBy(desc(products.approvedAt));
    const skus = services.length ? await this.database.db.select().from(productSkus).where(and(inArray(productSkus.productId, services.map(p => p.id)), eq(productSkus.status, "ACTIVE"), isNull(productSkus.deletedAt))).orderBy(asc(productSkus.sortOrder)) : [];
    return { ...publicSellerView(seller), services: services.map((product) => ({ ...productView(product), seller: publicSellerView(seller), skus: skus.filter(sku => sku.productId === product.id).map(skuView) })) };
  }

  async listProducts(input: { cursor?: string; limit?: unknown; sellerId?: string; keyword?: string; minPriceCent?: bigint; maxPriceCent?: bigint; sort: "comprehensive" | "sales" | "price_asc" | "price_desc" }) {
    const limit = normalizePageSize(input.limit, 20);
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const keyword = input.keyword?.trim();
    const scope = discoveryScope("services", input.sort, keyword, input.sellerId, input.minPriceCent, input.maxPriceCent);
    assertCursorScope(cursor, scope);
    const cursorCondition = !cursor ? undefined : input.sort === "sales"
      ? sql<boolean>`(${products.soldCount} < ${Number(cursor.sort_value)} OR (${products.soldCount} = ${Number(cursor.sort_value)} AND ${products.id} < ${cursor.id}))`
      : input.sort === "price_asc"
        ? sql<boolean>`(${products.minPriceCent} > ${BigInt(cursor.sort_value)} OR (${products.minPriceCent} = ${BigInt(cursor.sort_value)} AND ${products.id} > ${cursor.id}))`
        : input.sort === "price_desc"
          ? sql<boolean>`(${products.minPriceCent} < ${BigInt(cursor.sort_value)} OR (${products.minPriceCent} = ${BigInt(cursor.sort_value)} AND ${products.id} < ${cursor.id}))`
          : or(lt(products.approvedAt, new Date(cursor.sort_value)), and(eq(products.approvedAt, new Date(cursor.sort_value)), lt(products.id, cursor.id)));
    const ordering = input.sort === "sales"
      ? [desc(products.soldCount), desc(products.id)]
      : input.sort === "price_asc"
        ? [asc(products.minPriceCent), asc(products.id)]
        : input.sort === "price_desc"
          ? [desc(products.minPriceCent), desc(products.id)]
          : [desc(products.approvedAt), desc(products.id)];
    const rows = await this.database.db.select({ product: products, seller: sellerProfiles }).from(products).innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id)).where(and(
      eq(products.status, "ON_SALE"), isNull(products.deletedAt), eq(sellerProfiles.status, "APPROVED"),
      input.sellerId ? eq(products.sellerId, input.sellerId) : undefined,
      keyword ? or(ilike(products.title, likePattern(keyword)), ilike(products.description, likePattern(keyword)), ilike(sellerProfiles.sellerNickname, likePattern(keyword))) : undefined,
      input.minPriceCent !== undefined ? gte(products.minPriceCent, input.minPriceCent) : undefined,
      input.maxPriceCent !== undefined ? lte(products.minPriceCent, input.maxPriceCent) : undefined,
      cursorCondition,
    )).orderBy(...ordering).limit(limit + 1);
    return cursorPage(rows, limit, (row) => input.sort === "sales" ? String(row.product.soldCount) : input.sort === "price_asc" || input.sort === "price_desc" ? String(row.product.minPriceCent) : (row.product.approvedAt ?? row.product.createdAt).toISOString(), this.config.cursorSigningSecret, (row) => productView(row.product, row.seller), scope);
  }

  async getProduct(productId: string) {
    const [row] = await this.database.db.select({ product: products, seller: sellerProfiles }).from(products).innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
      .where(eq(products.id, productId)).limit(1);
    if (!row || row.product.deletedAt || row.product.status === "DELETED") throw notFound("PRODUCT_NOT_FOUND", "服务不存在或已删除");
    if (["DRAFT", "PENDING_REVIEW", "REVIEW_REJECTED"].includes(row.product.status)) throw conflict("PRODUCT_UNDER_REVIEW", "服务正在准备或审核中");
    if (["OFF_SALE", "ADMIN_OFF_SALE"].includes(row.product.status)) throw conflict("PRODUCT_OFF_SALE", "服务已下架");
    if (row.seller.status !== "APPROVED") throw conflict("SELLER_UNAVAILABLE", "陪玩当前不可提供服务");
    return this.productDetail(row.product, row.seller, false);
  }

  async addFavorite(userId: string, targetType: "SELLER" | "PRODUCT", targetId: string) {
    if (targetType === "SELLER") await this.getCompanion(targetId); else await this.getProduct(targetId);
    const inserted = await this.database.db.insert(favorites).values({ id: uuidv7(), userId, targetType, sellerId: targetType === "SELLER" ? targetId : null, productId: targetType === "PRODUCT" ? targetId : null }).onConflictDoNothing().returning();
    if (inserted[0] && targetType === "SELLER") await this.database.db.update(sellerProfiles).set({ favoriteCount: sql`${sellerProfiles.favoriteCount} + 1` }).where(eq(sellerProfiles.id, targetId));
    return { favorited: true, created: Boolean(inserted[0]) };
  }

  async removeFavorite(userId: string, targetType: "SELLER" | "PRODUCT", targetId: string) {
    const condition = targetType === "SELLER" ? eq(favorites.sellerId, targetId) : eq(favorites.productId, targetId);
    const deleted = await this.database.db.delete(favorites).where(and(eq(favorites.userId, userId), condition)).returning({ id: favorites.id });
    if (deleted[0] && targetType === "SELLER") await this.database.db.update(sellerProfiles).set({ favoriteCount: sql`greatest(${sellerProfiles.favoriteCount} - 1, 0)` }).where(eq(sellerProfiles.id, targetId));
    return { favorited: false, removed: Boolean(deleted[0]) };
  }

  async listFavorites(userId: string, input: { cursor?: string; limit?: unknown; target_type?: "SELLER" | "PRODUCT" }) {
    const limit = normalizePageSize(input.limit, 20);
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const scope = discoveryScope("favorites", input.target_type ?? "ALL", userId);
    assertCursorScope(cursor, scope);
    const rows = await this.database.db.select().from(favorites).where(and(
      eq(favorites.userId, userId),
      input.target_type ? eq(favorites.targetType, input.target_type) : undefined,
      cursor ? or(lt(favorites.createdAt, new Date(cursor.sort_value)), and(eq(favorites.createdAt, new Date(cursor.sort_value)), lt(favorites.id, cursor.id))) : undefined,
    )).orderBy(desc(favorites.createdAt), desc(favorites.id)).limit(limit + 1);
    return cursorPage(rows, limit, (row) => row.createdAt.toISOString(), this.config.cursorSigningSecret, favoriteView, scope);
  }

  async favoriteStatus(userId: string, targetType: "SELLER" | "PRODUCT", targetId: string) {
    const condition = targetType === "SELLER" ? eq(favorites.sellerId, targetId) : eq(favorites.productId, targetId);
    const [row] = await this.database.db.select({ id: favorites.id }).from(favorites).where(and(eq(favorites.userId, userId), condition)).limit(1);
    return { favorited: Boolean(row) };
  }

  private async productDetail(product: typeof products.$inferSelect, seller: typeof sellerProfiles.$inferSelect, includeUnavailable: boolean) {
    const skuCondition = includeUnavailable ? eq(productSkus.productId, product.id) : and(eq(productSkus.productId, product.id), eq(productSkus.status, "ACTIVE"), isNull(productSkus.deletedAt));
    const [skus, images] = await Promise.all([
      this.database.db.select().from(productSkus).where(skuCondition).orderBy(asc(productSkus.sortOrder)),
      this.database.db.select().from(productImages).where(and(eq(productImages.productId, product.id), isNull(productImages.deletedAt))).orderBy(asc(productImages.sortOrder)),
    ]);
    return { ...productView(product, seller), skus: skus.map(skuView), images: images.map(imageView) };
  }

  private async requireSellerByUser(userId: string) {
    const [seller] = await this.database.db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
    if (!seller) throw notFound("SELLER_NOT_FOUND", "尚未创建陪玩资料");
    return seller;
  }

  private async requireApprovedSeller(userId: string) {
    const seller = await this.requireSellerByUser(userId);
    if (seller.status !== "APPROVED") throw new AppError({ code: "SELLER_NOT_APPROVED", message: "只有已通过审核的陪玩可以管理服务", statusCode: 403 });
    return seller;
  }

  private async lockSellerByUser(tx: DatabaseTransaction, userId: string) {
    const [seller] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1).for("update");
    if (!seller) throw notFound("SELLER_NOT_FOUND", "尚未创建陪玩资料");
    return seller;
  }

  private async lockApprovedSeller(tx: DatabaseTransaction, userId: string) {
    const seller = await this.lockSellerByUser(tx, userId);
    if (seller.status !== "APPROVED") throw new AppError({ code: "SELLER_NOT_APPROVED", message: "只有已通过审核的陪玩可以管理服务", statusCode: 403 });
    return seller;
  }

  private async requireOwnedProduct(sellerId: string, productId: string) {
    const [product] = await this.database.db.select().from(products).where(and(eq(products.id, productId), eq(products.sellerId, sellerId))).limit(1);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "服务不存在");
    return product;
  }

  private ensureProductEditable(status: typeof products.$inferSelect.status) {
    if (!["DRAFT", "REVIEW_REJECTED", "OFF_SALE"].includes(status)) throw invalidState("只有草稿、审核驳回或已下架服务可以编辑规格和图片");
  }

  private async validateSellerFiles(tx: DatabaseTransaction, userId: string, input: SellerProfileInput): Promise<number | null | undefined> {
    const candidates = [
      input.sellerAvatarFileId ? { fileId: input.sellerAvatarFileId, fileType: "SELLER_AVATAR" as const, visibility: "PUBLIC" as const } : null,
      input.coverFileId ? { fileId: input.coverFileId, fileType: "SELLER_COVER" as const, visibility: "PUBLIC" as const } : null,
      input.voiceFileId ? { fileId: input.voiceFileId, fileType: "VOICE_SAMPLE" as const, visibility: "SIGNED" as const } : null,
    ].filter((item): item is NonNullable<typeof item> => item !== null);
    if (candidates.length) {
      const rows = await tx.select().from(files).where(and(inArray(files.id, candidates.map((candidate) => candidate.fileId)), eq(files.ownerUserId, userId), isNull(files.deletedAt)));
      if (rows.length !== candidates.length || candidates.some((candidate) => !rows.some((row) => row.id === candidate.fileId && row.fileType === candidate.fileType && row.visibility === candidate.visibility && row.uploadStatus === "VERIFIED" && row.moderationStatus === "APPROVED"))) {
        throw validation("file_id", "文件不存在、无权使用或尚未通过上传与内容审核");
      }
      if (input.voiceFileId) {
        const voice = rows.find((row) => row.id === input.voiceFileId);
        if (!voice?.durationMs || voice.durationMs < 10_000 || voice.durationMs > 30_000) throw validation("voice_file_id", "声音名片缺少有效的服务端音频时长");
        return voice.durationMs;
      }
    }
    return input.voiceFileId === null ? null : input.voiceFileId === undefined ? undefined : null;
  }

  private async resolveVoiceAuthorizationPolicyVersionId(
    tx: DatabaseTransaction,
    userId: string,
    voiceFileId: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (voiceFileId === undefined) return undefined;
    if (voiceFileId === null) return null;
    const policies = await this.identity.requirePolicyAcceptances(tx, userId, "VOICE_SAMPLE_UPLOAD");
    const authorization = policies.find((policy) => policy.policyType === "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION");
    if (!authorization) {
      throw new AppError({
        code: errorCodes.POLICY_NOT_FOUND,
        message: "声音名片公开播放授权协议未配置",
        statusCode: 503,
      });
    }
    return authorization.id;
  }

  private async validateOwnedFiles(userId: string, fileIds: string[], expectedType?: "SELLER_AVATAR" | "SELLER_COVER" | "VOICE_SAMPLE" | "PRODUCT_IMAGE") {
    const ids = [...new Set(fileIds.filter(Boolean))]; if (!ids.length) return;
    const rows = await this.database.db.select().from(files).where(and(inArray(files.id, ids), eq(files.ownerUserId, userId), isNull(files.deletedAt)));
    const expectedVisibility = expectedType === "VOICE_SAMPLE" ? "SIGNED" : "PUBLIC";
    if (rows.length !== ids.length || rows.some((row) => row.uploadStatus !== "VERIFIED" || row.moderationStatus !== "APPROVED" || row.visibility !== expectedVisibility || (expectedType && row.fileType !== expectedType))) {
      throw validation("file_id", "文件不存在、无权使用或尚未通过上传与内容审核");
    }
  }

  private async syncSellerFileUsages(tx: DatabaseTransaction, sellerId: string, input: Pick<typeof sellerProfiles.$inferSelect, "sellerAvatarFileId" | "coverFileId" | "voiceFileId">) {
    const bindings = [
      input.sellerAvatarFileId ? { fileId: input.sellerAvatarFileId, usageType: "AVATAR" as const } : null,
      input.coverFileId ? { fileId: input.coverFileId, usageType: "COVER" as const } : null,
      input.voiceFileId ? { fileId: input.voiceFileId, usageType: "VOICE" as const } : null,
    ].filter((item): item is { fileId: string; usageType: "AVATAR" | "COVER" | "VOICE" } => Boolean(item));
    const desired = new Map(bindings.map((binding) => [binding.usageType, binding.fileId]));
    const active = await tx.select({ id: fileUsages.id, fileId: fileUsages.fileId, usageType: fileUsages.usageType }).from(fileUsages)
      .where(and(eq(fileUsages.targetType, "SELLER"), eq(fileUsages.targetId, sellerId), isNull(fileUsages.deletedAt), inArray(fileUsages.usageType, ["AVATAR", "COVER", "VOICE"])));
    const preserved = new Set<string>();
    const obsoleteIds = active.filter((usage) => {
      const usageType = usage.usageType as "AVATAR" | "COVER" | "VOICE";
      if (desired.get(usageType) === usage.fileId && !preserved.has(usageType)) { preserved.add(usageType); return false; }
      return true;
    }).map((usage) => usage.id);
    if (obsoleteIds.length) await tx.update(fileUsages).set({ deletedAt: new Date() }).where(inArray(fileUsages.id, obsoleteIds));
    const additions = bindings.filter((binding) => !preserved.has(binding.usageType));
    if (additions.length) await tx.insert(fileUsages).values(additions.map((binding) => ({ id: uuidv7(), fileId: binding.fileId, usageType: binding.usageType, targetType: "SELLER" as const, targetId: sellerId })));
  }

  private async syncProductFileUsages(tx: DatabaseTransaction, productId: string, images: Array<{ fileId: string; isCover: boolean }>) {
    await tx.update(fileUsages).set({ deletedAt: new Date() }).where(and(eq(fileUsages.targetType, "PRODUCT"), eq(fileUsages.targetId, productId), isNull(fileUsages.deletedAt), inArray(fileUsages.usageType, ["COVER", "GALLERY"])));
    if (images.length) await tx.insert(fileUsages).values(images.map((image) => ({ id: uuidv7(), fileId: image.fileId, usageType: image.isCover ? "COVER" as const : "GALLERY" as const, targetType: "PRODUCT" as const, targetId: productId })));
  }

  private async syncProductCoverUsage(tx: DatabaseTransaction, productId: string, fileId?: string | null) {
    await tx.update(fileUsages).set({ deletedAt: new Date() }).where(and(eq(fileUsages.targetType, "PRODUCT"), eq(fileUsages.targetId, productId), eq(fileUsages.usageType, "COVER"), isNull(fileUsages.deletedAt)));
    if (fileId) await tx.insert(fileUsages).values({ id: uuidv7(), fileId, usageType: "COVER", targetType: "PRODUCT", targetId: productId });
  }

  private async recalculateMinPrice(productId: string) {
    const [row] = await this.database.db.select({ value: sql<bigint>`coalesce(min(${productSkus.priceCent}), 0)::bigint` }).from(productSkus)
      .where(and(eq(productSkus.productId, productId), eq(productSkus.status, "ACTIVE"), isNull(productSkus.deletedAt)));
    await this.database.db.update(products).set({ minPriceCent: row?.value ?? 0n, version: sql`${products.version} + 1`, updatedAt: new Date() }).where(eq(products.id, productId));
  }

  private async assertNoOpenSlotOverlap(sellerId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
    const [overlap] = await this.database.db.select({ id: sellerAvailabilitySlots.id }).from(sellerAvailabilitySlots).where(and(
      eq(sellerAvailabilitySlots.sellerId, sellerId), eq(sellerAvailabilitySlots.status, "OPEN"), lt(sellerAvailabilitySlots.startsAt, endsAt), gt(sellerAvailabilitySlots.endsAt, startsAt),
      excludeId ? ne(sellerAvailabilitySlots.id, excludeId) : undefined,
    )).limit(1);
    if (overlap) throw conflict("AVAILABILITY_OVERLAP", "可用时段与现有开放时段重叠");
  }

  private async audit(tx: DatabaseTransaction, adminId: string, action: string, targetType: "SELLER" | "PRODUCT", targetId: string, reason: string, before: unknown, after: unknown, metadata: RequestMetadata) {
    await tx.insert(adminOperationLogs).values({ id: uuidv7(), adminId, action, targetType, targetId, reason, beforeJson: safeJson(before), afterJson: safeJson(after), requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent });
  }
}

function sellerInsert(input: SellerProfileInput) {
  return {
    sellerNickname: input.sellerNickname, sellerAvatarFileId: input.sellerAvatarFileId, coverFileId: input.coverFileId,
    introduction: input.introduction, gameRank: input.gameRank, kd: input.kd, preferredMode: input.preferredMode,
    playStyle: input.playStyle, gameExperience: input.gameExperience, voiceFileId: input.voiceFileId,
    voiceDurationMs: input.voiceDurationMs, ...(input.acceptingOrders !== undefined ? { acceptingOrders: input.acceptingOrders } : {}),
  };
}
function assertSellerApplicationComplete(row: typeof sellerProfiles.$inferSelect) {
  const required: Array<[string, unknown]> = [["seller_avatar_file_id", row.sellerAvatarFileId], ["introduction", row.introduction], ["preferred_mode", row.preferredMode]];
  const missing = required.filter(([, value]) => value === null || value === undefined || value === "");
  if (missing.length) throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "陪玩申请资料不完整", statusCode: 400, fieldErrors: missing.map(([field]) => ({ field, code: "REQUIRED", message: "申请提交前必须完成此项资料" })) });
}
function productInsert(input: ProductInput) { return { title: input.title, description: input.description, serviceTimeDescription: input.serviceTimeDescription, coverFileId: input.coverFileId }; }
function sellerSnapshot(row: typeof sellerProfiles.$inferSelect) { return safeJson({ seller_nickname: row.sellerNickname, seller_avatar_file_id: row.sellerAvatarFileId, cover_file_id: row.coverFileId, introduction: row.introduction, game_rank: row.gameRank, kd: row.kd, preferred_mode: row.preferredMode, play_style: row.playStyle, game_experience: row.gameExperience, voice_file_id: row.voiceFileId, voice_duration_ms: row.voiceDurationMs }); }
function sellerRevisionSnapshot(input: SellerProfileInput, voiceAuthorizationPolicyVersionId:string|null){return safeJson({revision_kind:"PROFILE_UPDATE",seller_nickname:input.sellerNickname,seller_avatar_file_id:input.sellerAvatarFileId??null,cover_file_id:input.coverFileId??null,introduction:input.introduction??null,game_rank:input.gameRank??null,kd:input.kd??null,preferred_mode:input.preferredMode??null,play_style:input.playStyle??null,game_experience:input.gameExperience??null,voice_file_id:input.voiceFileId??null,voice_duration_ms:input.voiceDurationMs??null,voice_authorization_policy_version_id:voiceAuthorizationPolicyVersionId});}
function snapshotKind(snapshot:Record<string,unknown>|null){return snapshot?.revision_kind==="PROFILE_UPDATE"?"PROFILE_UPDATE":"INITIAL_ONBOARDING";}
function isProfileRevision(snapshot:Record<string,unknown>|null):snapshot is Record<string,unknown>{return snapshotKind(snapshot)==="PROFILE_UPDATE";}
function profileRevisionView(row:typeof sellerApplications.$inferSelect,snapshot:Record<string,unknown>){return {...applicationView(row),revision_kind:"PROFILE_UPDATE" as const,snapshot};}
function assertSellerSnapshotComplete(snapshot:Record<string,unknown>){const required=["seller_avatar_file_id","introduction","preferred_mode"] as const;const missing=required.filter((key)=>snapshot[key]===null||snapshot[key]===undefined||snapshot[key]==="");if(missing.length)throw new AppError({code:errorCodes.VALIDATION_FAILED,message:"陪玩资料变更申请不完整",statusCode:400,fieldErrors:missing.map((field)=>({field,code:"REQUIRED",message:"提交审核前必须完成此项资料"}))});}
function sellerInputFromSnapshot(snapshot:Record<string,unknown>):SellerProfileInput{return {sellerNickname:requiredSnapshotString(snapshot,"seller_nickname"),sellerAvatarFileId:nullableSnapshotString(snapshot,"seller_avatar_file_id"),coverFileId:nullableSnapshotString(snapshot,"cover_file_id"),introduction:nullableSnapshotString(snapshot,"introduction"),gameRank:nullableSnapshotString(snapshot,"game_rank"),kd:nullableSnapshotString(snapshot,"kd"),preferredMode:nullableSnapshotString(snapshot,"preferred_mode"),playStyle:nullableSnapshotString(snapshot,"play_style"),gameExperience:nullableSnapshotString(snapshot,"game_experience"),voiceFileId:nullableSnapshotString(snapshot,"voice_file_id"),voiceDurationMs:typeof snapshot.voice_duration_ms==="number"?snapshot.voice_duration_ms:null};}
function requiredSnapshotString(snapshot:Record<string,unknown>,key:string){const value=snapshot[key];if(typeof value!=="string"||!value.trim())throw validation(key,"审核快照字段无效");return value;}
function nullableSnapshotString(snapshot:Record<string,unknown>,key:string){const value=snapshot[key];if(value===null||value===undefined)return null;if(typeof value!=="string")throw validation(key,"审核快照字段无效");return value;}
function sellerPublicFieldsChanged(row:typeof sellerProfiles.$inferSelect,input:SellerProfileInput){const proposed={sellerNickname:input.sellerNickname,sellerAvatarFileId:input.sellerAvatarFileId===undefined?row.sellerAvatarFileId:input.sellerAvatarFileId,coverFileId:input.coverFileId===undefined?row.coverFileId:input.coverFileId,introduction:input.introduction===undefined?row.introduction:input.introduction,gameRank:input.gameRank===undefined?row.gameRank:input.gameRank,kd:input.kd===undefined?row.kd:input.kd,preferredMode:input.preferredMode===undefined?row.preferredMode:input.preferredMode,playStyle:input.playStyle===undefined?row.playStyle:input.playStyle,gameExperience:input.gameExperience===undefined?row.gameExperience:input.gameExperience,voiceFileId:input.voiceFileId===undefined?row.voiceFileId:input.voiceFileId,voiceDurationMs:input.voiceDurationMs===undefined?row.voiceDurationMs:input.voiceDurationMs};return Object.entries(proposed).some(([key,value])=>String(value??"")!==String(row[key as keyof typeof row]??""));}
function productSnapshot(product: typeof products.$inferSelect, skus: Array<typeof productSkus.$inferSelect>, images: Array<typeof productImages.$inferSelect>) { return safeJson({ product: productView(product), skus: skus.map(skuView), images: images.map(imageView) }); }
function safeJson(value: unknown): Record<string, unknown> { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as Record<string, unknown>; }
function sellerView(row: typeof sellerProfiles.$inferSelect) { return { id: row.id, user_id: row.userId, status: row.status, seller_nickname: row.sellerNickname, seller_avatar_file_id: row.sellerAvatarFileId, cover_file_id: row.coverFileId, introduction: row.introduction, game_rank: row.gameRank, kd: row.kd, preferred_mode: row.preferredMode, play_style: row.playStyle, game_experience: row.gameExperience, voice_file_id: row.voiceFileId, voice_duration_ms: row.voiceDurationMs, voice_authorization_policy_version_id: row.voiceAuthorizationPolicyVersionId, accepting_orders: row.acceptingOrders, rating_avg: row.ratingAvg, review_count: row.reviewCount, completed_order_count: row.completedOrderCount, favorite_count: row.favoriteCount, approved_at: row.approvedAt, suspended_reason: row.suspendedReason, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function applicationView(row: typeof sellerApplications.$inferSelect) { return { id: row.id, seller_id: row.sellerId, version_no: row.versionNo, onboarding_policy_version_id: row.onboardingPolicyVersionId, status: row.status, submitted_at: row.submittedAt, reviewed_at: row.reviewedAt, rejection_reason: row.rejectionReason, required_fields: row.requiredFieldsJson, version: row.version, created_at: row.createdAt }; }
function policyReferenceView(row: typeof policyVersions.$inferSelect) { return { id: row.id, policy_type: row.policyType, title: row.title, version_no: row.versionNo, status: row.status, effective_at: row.effectiveAt }; }
function productView(row: typeof products.$inferSelect, seller?: typeof sellerProfiles.$inferSelect) { return { id: row.id, seller_id: row.sellerId, title: row.title, description: row.description, service_time_description: row.serviceTimeDescription, cover_file_id: row.coverFileId, status: row.status, rejection_reason: row.rejectionReason, rating_avg: row.ratingAvg, review_count: row.reviewCount, sold_count: row.soldCount, min_price_cent: row.minPriceCent, current_version_no: row.currentVersionNo, submitted_at: row.submittedAt, approved_at: row.approvedAt, deleted_at:row.deletedAt, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt, ...(seller ? { seller: sellerView(seller) } : {}) }; }
function skuView(row: typeof productSkus.$inferSelect) { return { id: row.id, product_id: row.productId, sku_name: row.skuName, description: row.description, price_cent: row.priceCent, duration_minutes: row.durationMinutes, status: row.status, sort_order: row.sortOrder, version: row.version }; }
function imageView(row: typeof productImages.$inferSelect) { return { id: row.id, product_id: row.productId, file_id: row.fileId, sort_order: row.sortOrder, is_cover: row.isCover }; }
function slotView(row: typeof sellerAvailabilitySlots.$inferSelect) { return { id: row.id, starts_at: row.startsAt, ends_at: row.endsAt, status: row.status, version: row.version }; }
function minPrice(rows: Array<typeof productSkus.$inferSelect>) { return rows.reduce((min, row) => row.priceCent < min ? row.priceCent : min, rows[0]!.priceCent); }
function cursorPage<T, V>(rows: T[], limit: number, sortValue: (row: T) => string, secret: string, view: (row: T) => V, scope?: string) { const hasMore = rows.length > limit; const pageRows = rows.slice(0, limit); const last = pageRows.at(-1) as (T & { id?: string; product?: { id: string }; application?: { id:string } }) | undefined; const id = last && (last.id ?? last.product?.id ?? last.application?.id); return { items: pageRows.map(view), next_cursor: hasMore && last && id ? encodeCursor({ sort_value: sortValue(last), id, ...(scope ? { scope } : {}) }, secret) : null }; }
function favoriteView(row: typeof favorites.$inferSelect) { return { id: row.id, target_type: row.targetType, seller_id: row.sellerId, product_id: row.productId, created_at: row.createdAt }; }
function discoveryScope(...parts: unknown[]) { return parts.map((part) => part === undefined ? "" : String(part)).join(":"); }
function assertCursorScope(cursor: ReturnType<typeof decodeCursor> | undefined, scope: string) { if (cursor && cursor.scope !== scope) throw validation("cursor", "分页游标与当前筛选或排序条件不匹配"); }
function likePattern(value: string) { return `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`; }
function sellerReviewTransition(current: typeof sellerApplications.$inferSelect.status, action: SellerReviewAction) { const allowed: Record<SellerReviewAction, Array<typeof sellerApplications.$inferSelect.status>> = { START_REVIEW: ["SUBMITTED"], REQUEST_SUPPLEMENT: ["UNDER_REVIEW", "SUBMITTED"], APPROVE: ["UNDER_REVIEW", "SUBMITTED"], REJECT: ["UNDER_REVIEW", "SUBMITTED"] }; if (!allowed[action].includes(current)) throw invalidState("入驻申请状态不允许执行该审核动作"); return action === "START_REVIEW" ? "UNDER_REVIEW" as const : action === "REQUEST_SUPPLEMENT" ? "NEEDS_SUPPLEMENT" as const : action === "APPROVE" ? "APPROVED" as const : "REJECTED" as const; }
function sellerStatusTransition(current: typeof sellerProfiles.$inferSelect.status, action: "SUSPEND" | "RESTORE" | "BAN") { if (action === "SUSPEND" && current === "APPROVED") return "SUSPENDED" as const; if (action === "RESTORE" && current === "SUSPENDED") return "APPROVED" as const; if (action === "BAN" && ["APPROVED", "SUSPENDED"].includes(current)) return "BANNED" as const; throw invalidState("陪玩状态不允许执行该管理动作"); }
function pascal(value: string) { return value.toLowerCase().split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(""); }
function notFound(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 404 }); }
function conflict(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function invalidState(message: string) { return new AppError({ code: "RESOURCE_STATE_INVALID", message, statusCode: 409 }); }
function versionConflict() { return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: "数据已被其他操作更新，请刷新后重试", statusCode: 409 }); }
function validation(field: string, message: string) { return new AppError({ code: errorCodes.VALIDATION_FAILED, message: "请求参数校验失败", statusCode: 400, fieldErrors: [{ field, code: "INVALID", message }] }); }

function publicSellerView(row: typeof sellerProfiles.$inferSelect) {
  const { voice_authorization_policy_version_id, suspended_reason, ...publicFields } = sellerView(row);
  return publicFields;
}
