import { Inject, Injectable } from "@nestjs/common";
import { OutboxService } from "@xiongzai/application";
import { AppError, decodeCursor, encodeCursor, errorCodes, normalizePageSize } from "@xiongzai/contracts";
import {
  adminOperationLogs,
  favorites,
  files,
  identityVerifications,
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
import type { RequestMetadata } from "./identity-user.service.js";
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
type ProductReviewAction = "APPROVE" | "REJECT" | "ADMIN_OFF_SALE";

@Injectable()
export class SellerProductService {
  private readonly outbox = new OutboxService();

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async getMySeller(userId: string) {
    const seller = await this.requireSellerByUser(userId);
    const [latestApplication] = await this.database.db.select().from(sellerApplications)
      .where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo)).limit(1);
    return { ...sellerView(seller), latest_application: latestApplication ? applicationView(latestApplication) : null };
  }

  async createSeller(userId: string, input: SellerProfileInput) {
    const existing = await this.database.db.select({ id: sellerProfiles.id }).from(sellerProfiles)
      .where(eq(sellerProfiles.userId, userId)).limit(1);
    if (existing[0]) throw conflict("SELLER_ALREADY_EXISTS", "陪玩资料已经创建");
    await this.validateOwnedFiles(userId, sellerFileIds(input));
    const [row] = await this.database.db.insert(sellerProfiles).values({ id: uuidv7(), userId, ...sellerInsert(input) }).returning();
    return sellerView(row!);
  }

  async updateSeller(userId: string, input: SellerProfileInput & { version: number }) {
    const seller = await this.requireSellerByUser(userId);
    if (["PENDING_REVIEW", "BANNED"].includes(seller.status)) throw invalidState("当前陪玩状态不允许修改资料");
    await this.validateOwnedFiles(userId, sellerFileIds(input));
    const [updated] = await this.database.db.update(sellerProfiles).set({
      ...sellerInsert(input), updatedAt: new Date(), version: sql`${sellerProfiles.version} + 1`,
    }).where(and(eq(sellerProfiles.id, seller.id), eq(sellerProfiles.version, input.version))).returning();
    if (!updated) throw versionConflict();
    return sellerView(updated);
  }

  async submitSellerApplication(userId: string, expectedVersion: number, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const seller = await this.lockSellerByUser(tx, userId);
      if (!["DRAFT", "REJECTED"].includes(seller.status)) throw invalidState("当前状态不能提交入驻审核");
      if (seller.version !== expectedVersion) throw versionConflict();
      const verified = await tx.select({ id: identityVerifications.id }).from(identityVerifications)
        .where(and(eq(identityVerifications.userId, userId), eq(identityVerifications.status, "VERIFIED"))).limit(1);
      if (!verified[0]) throw new AppError({ code: "SELLER_IDENTITY_REQUIRED", message: "请先完成实名认证", statusCode: 409 });
      const [last] = await tx.select({ versionNo: sellerApplications.versionNo }).from(sellerApplications)
        .where(eq(sellerApplications.sellerId, seller.id)).orderBy(desc(sellerApplications.versionNo)).limit(1);
      const versionNo = (last?.versionNo ?? 0) + 1;
      const id = uuidv7();
      const snapshot = sellerSnapshot(seller);
      const [application] = await tx.insert(sellerApplications).values({
        id, sellerId: seller.id, versionNo, snapshotJson: snapshot, status: "SUBMITTED", submittedAt: new Date(),
      }).returning();
      const changed = await tx.update(sellerProfiles).set({ status: "PENDING_REVIEW", version: sql`${sellerProfiles.version} + 1`, updatedAt: new Date() })
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

  async listSellerApplications(status: string | undefined, limitRaw: unknown) {
    const limit = normalizePageSize(limitRaw, 50);
    const conditions = status ? [eq(sellerApplications.status, status as typeof sellerApplications.$inferSelect.status)] : [];
    const rows = await this.database.db.select({ application: sellerApplications, seller: sellerProfiles }).from(sellerApplications)
      .innerJoin(sellerProfiles, eq(sellerApplications.sellerId, sellerProfiles.id))
      .where(conditions[0]).orderBy(asc(sellerApplications.submittedAt), asc(sellerApplications.id)).limit(limit);
    return rows.map(({ application, seller }) => ({ ...applicationView(application), seller: sellerView(seller), snapshot: application.snapshotJson }));
  }

  async reviewSeller(adminId: string, applicationId: string, input: { action: SellerReviewAction; version: number; reason?: string; requiredFields?: string[] }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [application] = await tx.select().from(sellerApplications).where(eq(sellerApplications.id, applicationId)).limit(1).for("update");
      if (!application) throw notFound("SELLER_APPLICATION_NOT_FOUND", "入驻申请不存在");
      if (application.version !== input.version) throw versionConflict();
      const transition = sellerReviewTransition(application.status, input.action);
      if ((input.action === "REJECT" || input.action === "REQUEST_SUPPLEMENT") && !input.reason) throw validation("reason", "必须填写审核原因");
      const [seller] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.id, application.sellerId)).limit(1).for("update");
      if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩资料不存在");
      const now = new Date();
      const [updated] = await tx.update(sellerApplications).set({
        status: transition, reviewedByAdminId: adminId, reviewedAt: input.action === "START_REVIEW" ? null : now,
        rejectionReason: input.action === "REJECT" ? input.reason : null,
        requiredFieldsJson: input.action === "REQUEST_SUPPLEMENT" ? (input.requiredFields ?? []) : null,
        version: sql`${sellerApplications.version} + 1`, updatedAt: now,
      }).where(and(eq(sellerApplications.id, applicationId), eq(sellerApplications.version, input.version), eq(sellerApplications.status, application.status))).returning();
      if (!updated) throw versionConflict();
      const sellerStatus = input.action === "APPROVE" ? "APPROVED" : input.action === "REJECT" ? "REJECTED" : input.action === "REQUEST_SUPPLEMENT" ? "DRAFT" : seller.status;
      await tx.update(sellerProfiles).set({
        status: sellerStatus, approvedAt: input.action === "APPROVE" ? now : seller.approvedAt,
        acceptingOrders: input.action === "APPROVE" ? seller.acceptingOrders : false,
        version: sql`${sellerProfiles.version} + 1`, updatedAt: now,
      }).where(eq(sellerProfiles.id, seller.id));
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
    await this.validateOwnedFiles(userId, input.coverFileId ? [input.coverFileId] : []);
    const [row] = await this.database.db.insert(products).values({ id: uuidv7(), sellerId: seller.id, ...productInsert(input) }).returning();
    return productView(row!, seller);
  }

  async updateProduct(userId: string, productId: string, input: ProductInput & { version: number }) {
    const seller = await this.requireApprovedSeller(userId);
    const product = await this.requireOwnedProduct(seller.id, productId);
    if (!["DRAFT", "REVIEW_REJECTED", "OFF_SALE"].includes(product.status)) throw invalidState("当前服务状态不允许编辑");
    await this.validateOwnedFiles(userId, input.coverFileId ? [input.coverFileId] : []);
    const [updated] = await this.database.db.update(products).set({ ...productInsert(input), updatedAt: new Date(), version: sql`${products.version} + 1` })
      .where(and(eq(products.id, productId), eq(products.version, input.version), ne(products.status, "DELETED"))).returning();
    if (!updated) throw versionConflict();
    return productView(updated, seller);
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

  async listProductReviews(status: string | undefined, limitRaw: unknown) {
    const limit = normalizePageSize(limitRaw, 50);
    const rows = await this.database.db.select({ product: products, seller: sellerProfiles }).from(products)
      .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
      .where(status ? eq(products.status, status as typeof products.$inferSelect.status) : undefined)
      .orderBy(asc(products.submittedAt), asc(products.id)).limit(limit);
    return Promise.all(rows.map(async ({ product, seller }) => this.productDetail(product, seller, true)));
  }

  async reviewProduct(adminId: string, productId: string, input: { action: ProductReviewAction; version: number; reason?: string }, metadata: RequestMetadata) {
    return this.database.db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1).for("update");
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "服务不存在");
      if (product.version !== input.version) throw versionConflict();
      if (input.action === "ADMIN_OFF_SALE" ? product.status !== "ON_SALE" : product.status !== "PENDING_REVIEW") throw invalidState("当前服务状态不允许执行该审核操作");
      if ((input.action === "REJECT" || input.action === "ADMIN_OFF_SALE") && !input.reason) throw validation("reason", "必须填写审核原因");
      const next = input.action === "APPROVE" ? "ON_SALE" : input.action === "REJECT" ? "REVIEW_REJECTED" : "ADMIN_OFF_SALE";
      const [version] = await tx.select().from(productVersions).where(and(eq(productVersions.productId, productId), eq(productVersions.versionNo, product.currentVersionNo))).limit(1);
      const [updated] = await tx.update(products).set({ status: next, rejectionReason: input.action === "APPROVE" ? null : input.reason, approvedAt: input.action === "APPROVE" ? new Date() : product.approvedAt, version: sql`${products.version} + 1`, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.version, input.version), eq(products.status, product.status))).returning();
      if (!updated) throw versionConflict();
      await tx.insert(productReviewLogs).values({ id: uuidv7(), productId, productVersionId: version?.id, action: input.action, oldStatus: product.status, newStatus: next, adminId, reason: input.reason, requestId: metadata.requestId });
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

  async listCompanions(input: { cursor?: string; limit?: unknown; acceptingOrders?: boolean }) {
    const limit = normalizePageSize(input.limit, 20);
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const rows = await this.database.db.select().from(sellerProfiles).where(and(
      eq(sellerProfiles.status, "APPROVED"),
      input.acceptingOrders === undefined ? undefined : eq(sellerProfiles.acceptingOrders, input.acceptingOrders),
      cursor ? or(lt(sellerProfiles.approvedAt, new Date(cursor.sort_value)), and(eq(sellerProfiles.approvedAt, new Date(cursor.sort_value)), lt(sellerProfiles.id, cursor.id))) : undefined,
    )).orderBy(desc(sellerProfiles.approvedAt), desc(sellerProfiles.id)).limit(limit + 1);
    return cursorPage(rows, limit, (row) => row.approvedAt ?? row.createdAt, this.config.cursorSigningSecret, sellerView);
  }

  async getCompanion(sellerId: string) {
    const [seller] = await this.database.db.select().from(sellerProfiles).where(and(eq(sellerProfiles.id, sellerId), eq(sellerProfiles.status, "APPROVED"))).limit(1);
    if (!seller) throw notFound("SELLER_NOT_FOUND", "陪玩主页不存在");
    const services = await this.database.db.select().from(products).where(and(eq(products.sellerId, sellerId), eq(products.status, "ON_SALE"), isNull(products.deletedAt))).orderBy(desc(products.approvedAt));
    return { ...sellerView(seller), services: services.map((product) => productView(product, seller)) };
  }

  async listProducts(input: { cursor?: string; limit?: unknown; sellerId?: string; keyword?: string; minPriceCent?: bigint; maxPriceCent?: bigint }) {
    const limit = normalizePageSize(input.limit, 20);
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    const rows = await this.database.db.select({ product: products, seller: sellerProfiles }).from(products).innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id)).where(and(
      eq(products.status, "ON_SALE"), isNull(products.deletedAt), eq(sellerProfiles.status, "APPROVED"),
      input.sellerId ? eq(products.sellerId, input.sellerId) : undefined,
      input.keyword ? ilike(products.title, `%${input.keyword.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`) : undefined,
      input.minPriceCent !== undefined ? gte(products.minPriceCent, input.minPriceCent) : undefined,
      input.maxPriceCent !== undefined ? lte(products.minPriceCent, input.maxPriceCent) : undefined,
      cursor ? or(lt(products.approvedAt, new Date(cursor.sort_value)), and(eq(products.approvedAt, new Date(cursor.sort_value)), lt(products.id, cursor.id))) : undefined,
    )).orderBy(desc(products.approvedAt), desc(products.id)).limit(limit + 1);
    return cursorPage(rows, limit, (row) => row.product.approvedAt ?? row.product.createdAt, this.config.cursorSigningSecret, (row) => productView(row.product, row.seller));
  }

  async getProduct(productId: string) {
    const [row] = await this.database.db.select({ product: products, seller: sellerProfiles }).from(products).innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
      .where(and(eq(products.id, productId), eq(products.status, "ON_SALE"), isNull(products.deletedAt), eq(sellerProfiles.status, "APPROVED"))).limit(1);
    if (!row) throw notFound("PRODUCT_NOT_FOUND", "服务不存在或已下架");
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

  async listFavorites(userId: string, targetType?: "SELLER" | "PRODUCT") {
    const rows = await this.database.db.select().from(favorites).where(and(eq(favorites.userId, userId), targetType ? eq(favorites.targetType, targetType) : undefined)).orderBy(desc(favorites.createdAt));
    return rows.map((row) => ({ id: row.id, target_type: row.targetType, seller_id: row.sellerId, product_id: row.productId, created_at: row.createdAt }));
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

  private async validateOwnedFiles(userId: string, fileIds: string[], expectedType?: "PRODUCT_IMAGE") {
    const ids = [...new Set(fileIds.filter(Boolean))]; if (!ids.length) return;
    const rows = await this.database.db.select().from(files).where(and(inArray(files.id, ids), eq(files.ownerUserId, userId), isNull(files.deletedAt)));
    if (rows.length !== ids.length || rows.some((row) => row.uploadStatus !== "VERIFIED" || row.moderationStatus !== "APPROVED" || (expectedType && row.fileType !== expectedType))) {
      throw validation("file_id", "文件不存在、无权使用或尚未通过上传与内容审核");
    }
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
function sellerFileIds(input: SellerProfileInput) { return [input.sellerAvatarFileId, input.coverFileId, input.voiceFileId].filter((id): id is string => Boolean(id)); }
function productInsert(input: ProductInput) { return { title: input.title, description: input.description, serviceTimeDescription: input.serviceTimeDescription, coverFileId: input.coverFileId }; }
function sellerSnapshot(row: typeof sellerProfiles.$inferSelect) { return safeJson({ seller_nickname: row.sellerNickname, seller_avatar_file_id: row.sellerAvatarFileId, cover_file_id: row.coverFileId, introduction: row.introduction, game_rank: row.gameRank, kd: row.kd, preferred_mode: row.preferredMode, play_style: row.playStyle, game_experience: row.gameExperience, voice_file_id: row.voiceFileId, voice_duration_ms: row.voiceDurationMs }); }
function productSnapshot(product: typeof products.$inferSelect, skus: Array<typeof productSkus.$inferSelect>, images: Array<typeof productImages.$inferSelect>) { return safeJson({ product: productView(product), skus: skus.map(skuView), images: images.map(imageView) }); }
function safeJson(value: unknown): Record<string, unknown> { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as Record<string, unknown>; }
function sellerView(row: typeof sellerProfiles.$inferSelect) { return { id: row.id, user_id: row.userId, status: row.status, seller_nickname: row.sellerNickname, seller_avatar_file_id: row.sellerAvatarFileId, cover_file_id: row.coverFileId, introduction: row.introduction, game_rank: row.gameRank, kd: row.kd, preferred_mode: row.preferredMode, play_style: row.playStyle, game_experience: row.gameExperience, voice_file_id: row.voiceFileId, voice_duration_ms: row.voiceDurationMs, accepting_orders: row.acceptingOrders, rating_avg: row.ratingAvg, review_count: row.reviewCount, completed_order_count: row.completedOrderCount, favorite_count: row.favoriteCount, approved_at: row.approvedAt, suspended_reason: row.suspendedReason, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt }; }
function applicationView(row: typeof sellerApplications.$inferSelect) { return { id: row.id, seller_id: row.sellerId, version_no: row.versionNo, status: row.status, submitted_at: row.submittedAt, reviewed_at: row.reviewedAt, rejection_reason: row.rejectionReason, required_fields: row.requiredFieldsJson, version: row.version, created_at: row.createdAt }; }
function productView(row: typeof products.$inferSelect, seller?: typeof sellerProfiles.$inferSelect) { return { id: row.id, seller_id: row.sellerId, title: row.title, description: row.description, service_time_description: row.serviceTimeDescription, cover_file_id: row.coverFileId, status: row.status, rejection_reason: row.rejectionReason, rating_avg: row.ratingAvg, review_count: row.reviewCount, sold_count: row.soldCount, min_price_cent: row.minPriceCent, current_version_no: row.currentVersionNo, submitted_at: row.submittedAt, approved_at: row.approvedAt, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt, ...(seller ? { seller: sellerView(seller) } : {}) }; }
function skuView(row: typeof productSkus.$inferSelect) { return { id: row.id, product_id: row.productId, sku_name: row.skuName, description: row.description, price_cent: row.priceCent, duration_minutes: row.durationMinutes, status: row.status, sort_order: row.sortOrder, version: row.version }; }
function imageView(row: typeof productImages.$inferSelect) { return { id: row.id, product_id: row.productId, file_id: row.fileId, sort_order: row.sortOrder, is_cover: row.isCover }; }
function slotView(row: typeof sellerAvailabilitySlots.$inferSelect) { return { id: row.id, starts_at: row.startsAt, ends_at: row.endsAt, status: row.status, version: row.version }; }
function minPrice(rows: Array<typeof productSkus.$inferSelect>) { return rows.reduce((min, row) => row.priceCent < min ? row.priceCent : min, rows[0]!.priceCent); }
function cursorPage<T, V>(rows: T[], limit: number, sortValue: (row: T) => Date, secret: string, view: (row: T) => V) { const hasMore = rows.length > limit; const pageRows = rows.slice(0, limit); const last = pageRows.at(-1) as (T & { id?: string; product?: { id: string } }) | undefined; const id = last && (last.id ?? last.product?.id); return { items: pageRows.map(view), next_cursor: hasMore && last && id ? encodeCursor({ sort_value: sortValue(last).toISOString(), id }, secret) : null }; }
function sellerReviewTransition(current: typeof sellerApplications.$inferSelect.status, action: SellerReviewAction) { const allowed: Record<SellerReviewAction, Array<typeof sellerApplications.$inferSelect.status>> = { START_REVIEW: ["SUBMITTED"], REQUEST_SUPPLEMENT: ["UNDER_REVIEW", "SUBMITTED"], APPROVE: ["UNDER_REVIEW", "SUBMITTED"], REJECT: ["UNDER_REVIEW", "SUBMITTED"] }; if (!allowed[action].includes(current)) throw invalidState("入驻申请状态不允许执行该审核动作"); return action === "START_REVIEW" ? "UNDER_REVIEW" as const : action === "REQUEST_SUPPLEMENT" ? "NEEDS_SUPPLEMENT" as const : action === "APPROVE" ? "APPROVED" as const : "REJECTED" as const; }
function sellerStatusTransition(current: typeof sellerProfiles.$inferSelect.status, action: "SUSPEND" | "RESTORE" | "BAN") { if (action === "SUSPEND" && current === "APPROVED") return "SUSPENDED" as const; if (action === "RESTORE" && current === "SUSPENDED") return "APPROVED" as const; if (action === "BAN" && ["APPROVED", "SUSPENDED"].includes(current)) return "BANNED" as const; throw invalidState("陪玩状态不允许执行该管理动作"); }
function pascal(value: string) { return value.toLowerCase().split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(""); }
function notFound(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 404 }); }
function conflict(code: `${Uppercase<string>}_${Uppercase<string>}`, message: string) { return new AppError({ code, message, statusCode: 409 }); }
function invalidState(message: string) { return new AppError({ code: "RESOURCE_STATE_INVALID", message, statusCode: 409 }); }
function versionConflict() { return new AppError({ code: errorCodes.RESOURCE_VERSION_CONFLICT, message: "数据已被其他操作更新，请刷新后重试", statusCode: 409 }); }
function validation(field: string, message: string) { return new AppError({ code: errorCodes.VALIDATION_FAILED, message: "请求参数校验失败", statusCode: 400, fieldErrors: [{ field, code: "INVALID", message }] }); }
