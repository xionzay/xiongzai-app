import { cursorColumns, cursorTimeValue } from "./cursor-time.js";
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AppError, decodeCursor, encodeCursor, normalizePageSize, reviewImageLimits, type ErrorCode } from "@xiongzai/contracts";
import { afterSaleCases, adminOperationLogs, announcements, conversationMembers, messages, users, fileUsages, files, orders, reviews, reviewImages, scheduledJobs, sellerProfiles, uuidv7, type DatabaseClient } from "@xiongzai/database";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { ApiConfig } from "./config.js";
import { inspectMedia } from "./file-inspector.js";
import type { RequestMetadata } from "./identity-user.service.js";
import type { ObjectStorageProvider } from "./object-storage-provider.js";
import type { PreviewConcurrencyLimiter, PreviewConcurrencyLease } from "./preview-concurrency-limiter.js";
import { API_CONFIG, DATABASE_CLIENT, OBJECT_STORAGE_PROVIDER, PREVIEW_CONCURRENCY_LIMITER } from "./tokens.js";
import { FILE_LIFECYCLE_JOB_TYPES, FileLifecycleService, staleDeleteJobKey } from "./file-lifecycle.service.js";
import { productImageLimits } from "./product-image-limits.js";

export const fileTypes = ["USER_AVATAR", "SELLER_AVATAR", "SELLER_COVER", "PRODUCT_IMAGE", "VOICE_SAMPLE", "PAYMENT_PAYLOAD", "COMPLAINT_EVIDENCE", "ADMIN_EVIDENCE", "ORDER_FULFILLMENT_IMAGE", "ORDER_FULFILLMENT_VIDEO", "ANNOUNCEMENT_IMAGE", "CHAT_IMAGE", "CHAT_VOICE", "REVIEW_IMAGE"] as const;
export type FileType = typeof fileTypes[number];

type Visibility = "PUBLIC" | "PRIVATE" | "SIGNED";
type ActorKind = "user" | "admin" | "service";
interface FilePolicy {
  fileType: FileType;
  mimeTypes: readonly string[];
  maximumBytes: number;
  visibility: Visibility;
  actors: readonly ActorKind[];
  minimumDurationMs?: number;
  maximumDurationMs?: number;
}

const policies: readonly FilePolicy[] = [
  { fileType:"REVIEW_IMAGE", mimeTypes:reviewImageLimits.mimeTypes, maximumBytes:reviewImageLimits.maximumBytes, visibility:"PRIVATE", actors:["user"] },
  imagePolicy("CHAT_IMAGE", 10, "PRIVATE", ["user"]),
  { fileType: "CHAT_VOICE", mimeTypes: ["audio/aac", "audio/mp4", "audio/mpeg"], maximumBytes: mebibytes(10), visibility: "PRIVATE", actors: ["user"], minimumDurationMs: 1_000, maximumDurationMs: 60_000 },
  // Keep drafts private; public announcement access issues short-lived grants.
  imagePolicy("ANNOUNCEMENT_IMAGE", 10, "SIGNED", ["admin"]),
  imagePolicy("ORDER_FULFILLMENT_IMAGE", 10, "PRIVATE", ["user"]),
  { fileType: "ORDER_FULFILLMENT_VIDEO", mimeTypes: ["video/mp4"], maximumBytes: mebibytes(100), visibility: "PRIVATE", actors: ["user"], minimumDurationMs: 1 },
  imagePolicy("USER_AVATAR", 5, "PUBLIC", ["user"]),
  imagePolicy("SELLER_AVATAR", 5, "PUBLIC", ["user"]),
  imagePolicy("SELLER_COVER", 10, "PUBLIC", ["user"]),
  imagePolicy("PRODUCT_IMAGE", 10, "PUBLIC", ["user"]),
  { fileType: "VOICE_SAMPLE", mimeTypes: ["audio/aac", "audio/mp4", "audio/mpeg"], maximumBytes: mebibytes(10), visibility: "SIGNED", actors: ["user"], minimumDurationMs: 10_000, maximumDurationMs: 30_000 },
  { fileType: "PAYMENT_PAYLOAD", mimeTypes: ["application/json", "text/plain"], maximumBytes: mebibytes(1), visibility: "PRIVATE", actors: ["service"] },
  imagePolicy("COMPLAINT_EVIDENCE", 10, "PRIVATE", ["user"]),
  { fileType: "ADMIN_EVIDENCE", mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"], maximumBytes: mebibytes(20), visibility: "PRIVATE", actors: ["admin"] },
];

@Injectable()
export class FileStorageService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    @Inject(PREVIEW_CONCURRENCY_LIMITER) private readonly previewLimiter: PreviewConcurrencyLimiter,
    private readonly lifecycle: FileLifecycleService,
  ) {}

  async listPolicies() {
    const limits = await productImageLimits(this.database.db);
    return policies.filter((policy) => policy.actors.includes("user")).map(policy => ({...policyView(policy.fileType === "PRODUCT_IMAGE" ? { ...policy, maximumBytes: limits.maximumBytes } : policy), ...(policy.fileType === "REVIEW_IMAGE" ? {maximum_count:reviewImageLimits.maximumCount,temporary_test_configuration:true} : {})}));
  }

  async requestUserUpload(userId: string, input: { fileType: FileType; mimeType: string; sizeBytes: number; sha256: string }) {
    return this.requestUpload("user", userId, input);
  }

  async requestAdminUpload(adminId: string, input: { fileType: FileType; mimeType: string; sizeBytes: number; sha256: string },metadata:RequestMetadata) {
    const result=await this.requestUpload("admin", null, input, adminId);
    await this.database.db.insert(adminOperationLogs).values({id:uuidv7(),adminId,action:"FILE_ADMIN_UPLOAD_REQUESTED",targetType:"PLATFORM",targetId:result.file.id,reason:"管理员上传平台证据",beforeJson:null,afterJson:{file_type:input.fileType,mime_type:input.mimeType,size_bytes:input.sizeBytes},requestId:metadata.requestId,traceId:metadata.traceId,ip:metadata.ip,userAgent:metadata.userAgent});
    return result;
  }

  async requestServiceUpload(input: { fileType: FileType; mimeType: string; sizeBytes: number; sha256: string }) {
    return this.requestUpload("service", null, input);
  }

  private async requestUpload(actor: ActorKind, ownerUserId: string | null, input: { fileType: FileType; mimeType: string; sizeBytes: number; sha256: string }, actorId?: string) {
    const basePolicy = requirePolicy(input.fileType, actor);
    const policy = input.fileType === "PRODUCT_IMAGE" ? { ...basePolicy, maximumBytes: (await productImageLimits(this.database.db)).maximumBytes } : basePolicy;
    const mimeType = input.mimeType.toLowerCase();
    if (!policy.mimeTypes.includes(mimeType)) throw fieldError("mime_type", "FILE_MIME_NOT_ALLOWED", "该用途不支持此文件格式");
    if (input.sizeBytes < 1 || input.sizeBytes > policy.maximumBytes) throw fieldError("size_bytes", "FILE_SIZE_NOT_ALLOWED", `文件大小必须在 1 到 ${policy.maximumBytes} 字节之间`);
    if (!/^[a-f0-9]{64}$/u.test(input.sha256)) throw fieldError("sha256", "FILE_HASH_INVALID", "SHA-256 必须是 64 位小写十六进制字符串");
    if (ownerUserId) {
      const since = new Date(Date.now() - 60 * 60 * 1_000);
      const [pending] = await this.database.db.select({ count: sql<number>`count(*)::int` }).from(files).where(and(eq(files.ownerUserId, ownerUserId), eq(files.uploadStatus, "PENDING"), gt(files.createdAt, since), isNull(files.deletedAt)));
      if ((pending?.count ?? 0) >= this.config.fileUploadHourlyLimit) throw new AppError({ code: "FILE_UPLOAD_RATE_LIMITED", message: "短时间内申请的上传任务过多，请稍后再试", statusCode: 429 });
    }
    const id = uuidv7();
    const now = new Date();
    const objectKey = `pending/${input.fileType.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
    const bucket = this.config.fileQuarantineBucket;
    const upload = await this.storage.createUploadRequest({ bucket, objectKey, contentType: mimeType, sizeBytes: input.sizeBytes, sha256: input.sha256, expiresInSeconds: this.config.fileUploadUrlTtlSeconds });
    const [row] = await this.database.db.insert(files).values({ id, ownerUserId, bucket, objectKey, fileType: input.fileType, mimeType, sizeBytes: BigInt(input.sizeBytes), sha256: input.sha256, visibility: policy.visibility }).returning();
    return { file: fileView(row), upload: { url: upload.url, method: upload.method, headers: upload.headers, expires_at: upload.expiresAt }, ...(actorId ? { requested_by_admin_id: actorId } : {}) };
  }

  async completeUserUpload(userId: string, fileId: string) { return this.completeUpload(fileId, { actor: "user", ownerUserId: userId }); }
  async completeAdminUpload(adminId:string,fileId: string,metadata:RequestMetadata) { const result=await this.completeUpload(fileId, { actor: "admin" });await this.database.db.insert(adminOperationLogs).values({id:uuidv7(),adminId,action:"FILE_ADMIN_UPLOAD_VERIFIED",targetType:"PLATFORM",targetId:fileId,reason:"管理员平台证据完成格式、大小与哈希校验",beforeJson:null,afterJson:{upload_status:result.upload_status,mime_type:result.mime_type,size_bytes:String(result.size_bytes)},requestId:metadata.requestId,traceId:metadata.traceId,ip:metadata.ip,userAgent:metadata.userAgent});return result; }
  async completeServiceUpload(fileId: string) { return this.completeUpload(fileId, { actor: "service" }); }

  private async completeUpload(fileId: string, owner: { actor: "user"; ownerUserId: string } | { actor: "admin" | "service" }) {
    const ownerCondition = owner.actor === "user" ? eq(files.ownerUserId, owner.ownerUserId) : isNull(files.ownerUserId);
    const [row] = await this.database.db.select(cursorColumns(files)).from(files).where(and(eq(files.id, fileId), ownerCondition, isNull(files.deletedAt))).limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND", "文件不存在或无权操作");
    const basePolicy = requirePolicy(row.fileType as FileType, owner.actor);
    const policy = row.fileType === "PRODUCT_IMAGE" ? { ...basePolicy, maximumBytes: (await productImageLimits(this.database.db)).maximumBytes } : basePolicy;
    if (row.uploadStatus === "VERIFIED") return fileView(row);
    if (row.uploadStatus !== "PENDING") throw conflict("FILE_UPLOAD_STATE_INVALID", "当前文件状态不能完成上传");
    if (row.createdAt.getTime() + this.config.fileUploadSessionTtlSeconds * 1_000 < Date.now()) throw new AppError({ code: "FILE_UPLOAD_EXPIRED", message: "上传任务已过期，请重新申请", statusCode: 410 });
    try {
      const head = await this.storage.headObject({ bucket: row.bucket, objectKey: row.objectKey });
      if (head.sizeBytes !== Number(row.sizeBytes)) throw invalid("FILE_SIZE_MISMATCH", "对象大小与上传申请不一致");
      if (head.contentType !== row.mimeType) throw invalid("FILE_MIME_MISMATCH", "对象存储记录的 MIME 类型与上传申请不一致");
      if (head.metadata.sha256 !== row.sha256) throw invalid("FILE_HASH_METADATA_MISMATCH", "对象缺少匹配的完整性元数据");
      if (head.metadata["size-bytes"] !== String(row.sizeBytes)) throw invalid("FILE_SIZE_METADATA_MISMATCH", "对象缺少匹配的大小元数据");
      const stored = await this.storage.readObject({ bucket: row.bucket, objectKey: row.objectKey, maximumBytes: policy.maximumBytes + 1 });
      if (stored.sizeBytes !== Number(row.sizeBytes)) throw invalid("FILE_SIZE_MISMATCH", "对象大小与上传申请不一致");
      if (stored.contentType !== row.mimeType) throw invalid("FILE_MIME_MISMATCH", "对象存储记录的 MIME 类型与上传申请不一致");
      if (stored.metadata.sha256 !== row.sha256) throw invalid("FILE_HASH_METADATA_MISMATCH", "对象缺少匹配的完整性元数据");
      if (stored.metadata["size-bytes"] !== String(row.sizeBytes)) throw invalid("FILE_SIZE_METADATA_MISMATCH", "对象缺少匹配的大小元数据");
      const actualHash = createHash("sha256").update(stored.body).digest("hex");
      if (actualHash !== row.sha256) throw invalid("FILE_HASH_MISMATCH", "文件内容的 SHA-256 与上传申请不一致");
      const inspected = inspectMedia(stored.body, row.mimeType);
      if (policy.minimumDurationMs !== undefined && (inspected.durationMs ?? 0) < policy.minimumDurationMs) throw invalid("FILE_DURATION_NOT_ALLOWED", `音频时长不能短于 ${policy.minimumDurationMs / 1_000} 秒`);
      if (policy.maximumDurationMs !== undefined && (inspected.durationMs ?? Number.MAX_SAFE_INTEGER) > policy.maximumDurationMs) throw invalid("FILE_DURATION_NOT_ALLOWED", `音频时长不能超过 ${policy.maximumDurationMs / 1_000} 秒`);
      const [updated] = await this.database.db.update(files).set({ uploadStatus: "VERIFIED", width: inspected.width, height: inspected.height, durationMs: inspected.durationMs, updatedAt: new Date() }).where(and(eq(files.id, fileId), eq(files.uploadStatus, "PENDING"))).returning();
      if (updated) return fileView(updated);
      const [current] = await this.database.db.select(cursorColumns(files)).from(files).where(eq(files.id, fileId)).limit(1);
      if (current?.uploadStatus === "VERIFIED") return fileView(current);
      throw conflict("FILE_UPLOAD_STATE_INVALID", "文件状态已发生变化");
    } catch (error) {
      if (error instanceof AppError && (error.code === "FILE_STORAGE_READ_FAILED" || error.code === "FILE_OBJECT_NOT_FOUND")) throw error;
      await this.database.db.update(files).set({ uploadStatus: "FAILED", updatedAt: new Date() }).where(and(eq(files.id, fileId), eq(files.uploadStatus, "PENDING")));
      await this.storage.deleteObject({ bucket: row.bucket, objectKey: row.objectKey }).catch(() => undefined);
      throw error;
    }
  }

  async getMyFile(userId: string, fileId: string) {
    const row = await this.requireOwned(userId, fileId);
    if (row.fileType === "REVIEW_IMAGE") return {...fileView(row), access:{kind:"API_PROXY",url:`/api/v1/files/${fileId}/review-preview`}};
    if (row.fileType === "CHAT_IMAGE" || row.fileType === "CHAT_VOICE") {
      const [message] = await this.database.db.select().from(messages).where(eq(messages.mediaFileId, fileId)).limit(1);
      if (message) return this.getChatMediaAccess(userId, message.conversationId, message.id);
    }
    return this.withAccess(row);
  }

  async getChatMediaAccess(userId: string, conversationId: string, messageId: string) {
    const [row] = await this.database.db.select({ file: files }).from(messages)
      .innerJoin(files, eq(files.id, messages.mediaFileId))
      .innerJoin(conversationMembers, eq(conversationMembers.conversationId, messages.conversationId))
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId), isNull(messages.deletedAt), eq(messages.moderationStatus, "APPROVED"),
        eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt), eq(users.status, "NORMAL"),
        isNull(files.deletedAt), eq(files.uploadStatus, "VERIFIED"), eq(files.moderationStatus, "APPROVED"), eq(files.visibility, "PRIVATE"),
        eq(files.ownerUserId, messages.senderUserId),
        or(and(eq(messages.messageType, "IMAGE"), eq(files.fileType, "CHAT_IMAGE")), and(eq(messages.messageType, "VOICE"), eq(files.fileType, "CHAT_VOICE")))
      )).limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND", "消息附件不存在、不可用或无权查看");
    // A signed grant is a bearer capability; keep revocation exposure bounded.
    const access = await this.storage.createDownloadUrl({ bucket: row.file.bucket, objectKey: row.file.objectKey, expiresInSeconds: Math.min(60, this.config.fileDownloadUrlTtlSeconds) });
    return { ...fileView(row.file), access: { url: access.url, expires_at: access.expiresAt, kind: "SIGNED" as const } };
  }

  async getOrderEvidenceAccess(userId: string, orderId: string, fileId: string) {
    const [row] = await this.database.db.select({ file:files }).from(files).innerJoin(fileUsages,eq(fileUsages.fileId,files.id)).innerJoin(orders,eq(orders.id,fileUsages.targetId)).where(and(
      eq(orders.id,orderId),or(eq(orders.buyerId,userId),eq(orders.sellerUserId,userId)),eq(files.id,fileId),eq(files.ownerUserId,orders.sellerUserId),eq(fileUsages.targetType,"ORDER"),eq(fileUsages.usageType,"EVIDENCE"),isNull(fileUsages.deletedAt),isNull(files.deletedAt),eq(files.uploadStatus,"VERIFIED"),eq(files.moderationStatus,"APPROVED"),eq(files.visibility,"PRIVATE"),inArray(files.fileType,["ORDER_FULFILLMENT_IMAGE","ORDER_FULFILLMENT_VIDEO"]),
    )).limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND","凭证不存在或无权查看");
    return this.withAccess(row.file);
  }

  async getAfterSaleEvidenceAccess(userId:string,caseId:string,fileId:string){
    const [row]=await this.database.db.select({file:files}).from(afterSaleCases).innerJoin(orders,eq(orders.id,afterSaleCases.orderId)).innerJoin(fileUsages,and(eq(fileUsages.targetId,afterSaleCases.id),eq(fileUsages.targetType,"REFUND"),eq(fileUsages.usageType,"EVIDENCE"),isNull(fileUsages.deletedAt))).innerJoin(files,eq(files.id,fileUsages.fileId)).where(and(eq(afterSaleCases.id,caseId),eq(files.id,fileId),or(eq(orders.buyerId,userId),eq(orders.sellerUserId,userId)),or(eq(files.ownerUserId,orders.buyerId),eq(files.ownerUserId,orders.sellerUserId)),or(eq(files.ownerUserId,userId),sql`(${afterSaleCases.data}->\'counterparty_visible_evidence_ids\') @> ${JSON.stringify([fileId])}::jsonb`),eq(files.fileType,"COMPLAINT_EVIDENCE"),eq(files.visibility,"PRIVATE"),eq(files.uploadStatus,"VERIFIED"),eq(files.moderationStatus,"APPROVED"),isNull(files.deletedAt))).limit(1);
    if(!row)throw notFound("FILE_NOT_FOUND","案件证据不存在或无权查看");
    const access=await this.storage.createDownloadUrl({bucket:row.file.bucket,objectKey:row.file.objectKey,expiresInSeconds:Math.min(60,this.config.fileDownloadUrlTtlSeconds)});
    return {file_id:row.file.id,access:{kind:"SIGNED",url:access.url,expires_at:access.expiresAt}};
  }

  async listMyFiles(userId: string, input: { fileType?: FileType; uploadStatus?: "PENDING" | "UPLOADED" | "VERIFIED" | "FAILED"; moderationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED"; cursor?: string; limit?: number }) {
    const limit = normalizePageSize(input.limit, 20);
    const scope = `my-files:${userId}:${input.fileType ?? "all"}:${input.uploadStatus ?? "all"}:${input.moderationStatus ?? "all"}`;
    const cursor = input.cursor ? decodeCursor(input.cursor, this.config.cursorSigningSecret) : undefined;
    if (cursor && cursor.scope !== scope) throw fieldError("cursor", "VALIDATION_FAILED", "分页游标与当前文件筛选不匹配");
    const rows = await this.database.db.select(cursorColumns(files)).from(files).where(and(
      eq(files.ownerUserId, userId),
      input.fileType ? eq(files.fileType, input.fileType) : undefined,
      input.uploadStatus ? eq(files.uploadStatus, input.uploadStatus) : undefined,
      input.moderationStatus ? eq(files.moderationStatus, input.moderationStatus) : undefined,
      isNull(files.deletedAt),
      cursor ? or(lt(files.createdAt, cursorTimeValue(cursor.sort_value)), and(eq(files.createdAt, cursorTimeValue(cursor.sort_value)), lt(files.id, cursor.id))) : undefined,
    )).orderBy(desc(files.createdAt), desc(files.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const evidenceIds = page.filter(row => row.fileType === "ORDER_FULFILLMENT_IMAGE" || row.fileType === "ORDER_FULFILLMENT_VIDEO").map(row => row.id);
    const bindings = evidenceIds.length ? await this.database.db.select({ file_id: fileUsages.fileId, order_id: fileUsages.targetId }).from(fileUsages).where(and(inArray(fileUsages.fileId, evidenceIds), eq(fileUsages.targetType, "ORDER"), eq(fileUsages.usageType, "EVIDENCE"), isNull(fileUsages.deletedAt))) : [];
    const orderByFile = new Map(bindings.map(binding => [binding.file_id, binding.order_id]));
    const chatIds = page.filter(row => row.fileType === "CHAT_IMAGE" || row.fileType === "CHAT_VOICE").map(row => row.id);
    const chatBindings = chatIds.length ? await this.database.db.select({ fileId: messages.mediaFileId, id: messages.id }).from(messages).where(inArray(messages.mediaFileId, chatIds)) : [];
    const messageByFile = new Map(chatBindings.map(binding => [binding.fileId, binding.id]));
    const reviewIds = page.filter(row => row.fileType === "REVIEW_IMAGE").map(row => row.id);
    const reviewBindings = reviewIds.length ? await this.database.db.select({fileId:fileUsages.fileId,reviewId:fileUsages.targetId}).from(fileUsages).where(and(inArray(fileUsages.fileId,reviewIds),eq(fileUsages.targetType,"REVIEW"),isNull(fileUsages.deletedAt))) : [];
    const reviewByFile = new Map(reviewBindings.map(binding=>[binding.fileId,binding.reviewId]));
    return {
      items: page.map(row => ({ ...myFileView(row), bound_order_id: orderByFile.get(row.id) ?? null, bound_message_id: messageByFile.get(row.id) ?? null, bound_review_id: reviewByFile.get(row.id) ?? null })),
      next_cursor: rows.length > limit && last ? encodeCursor({ sort_value: last.createdAt.toISOString(), id: last.id, scope }, this.config.cursorSigningSecret) : null,
    };
  }

  async getPublicFile(fileId: string) {
    const [row] = await this.database.db.select(cursorColumns(files)).from(files).where(and(eq(files.id, fileId), eq(files.uploadStatus, "VERIFIED"), eq(files.moderationStatus, "APPROVED"), eq(files.visibility, "PUBLIC"), isNull(files.deletedAt))).limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND", "公开文件不存在或尚未通过审核");
    const result = await this.withAccess(row);
    return { id: row.id, content_url: result.access.url, mime_type: row.mimeType, width: row.width, height: row.height, duration_ms: row.durationMs };
  }

  /** No presigned grants: every new request rechecks review visibility and binding. */
  async previewReviewImage(reviewId: string, fileId: string) {
    const find = () => this.database.db.select({file:files}).from(reviewImages)
      .innerJoin(reviews,eq(reviews.id,reviewImages.reviewId))
      .innerJoin(files,and(eq(files.id,reviewImages.fileId),eq(files.ownerUserId,reviews.buyerId)))
      .innerJoin(fileUsages,and(eq(fileUsages.fileId,files.id),eq(fileUsages.targetId,reviews.id),eq(fileUsages.targetType,"REVIEW"),eq(fileUsages.usageType,"GALLERY"),isNull(fileUsages.deletedAt)))
      .where(and(eq(reviews.id,reviewId),eq(files.id,fileId),eq(reviews.status,"PUBLIC"),isNull(reviews.deletedAt),eq(files.fileType,"REVIEW_IMAGE"),eq(files.visibility,"PRIVATE"),eq(files.uploadStatus,"VERIFIED"),eq(files.moderationStatus,"APPROVED"),isNull(files.deletedAt))).limit(1);
    const [row]=await find();
    if(!row) throw notFound("REVIEW_IMAGE_UNAVAILABLE","评价图片不存在或不可公开访问");
    const result=await this.readReviewImage(row.file);
    try { if(!(await find()).length) throw notFound("REVIEW_IMAGE_UNAVAILABLE","评价图片已停止公开"); }
    catch(error){result.body.destroy();throw error;}
    return result;
  }

  async previewOwnedReviewImage(userId:string,fileId:string) {
    const row=await this.requireOwned(userId,fileId);
    if(row.fileType!=="REVIEW_IMAGE"||row.visibility!=="PRIVATE"||row.uploadStatus!=="VERIFIED"||row.moderationStatus!=="APPROVED") throw notFound("REVIEW_IMAGE_UNAVAILABLE","评价图片未通过校验及审核");
    return this.readReviewImage(row);
  }

  private async readReviewImage(row:typeof files.$inferSelect) {
    if(!reviewImageLimits.mimeTypes.includes(row.mimeType)||row.sizeBytes<=0n||row.sizeBytes>BigInt(reviewImageLimits.maximumBytes))throw notFound("REVIEW_IMAGE_UNAVAILABLE","评价图片不符合安全限制");
    const lease=this.previewLimiter.acquire();
    if(!lease)throw new AppError({code:"FILE_PREVIEW_BUSY",message:"图片读取繁忙，请稍后重试",statusCode:429});
    try {
      const stream=await this.storage.readObjectStream({bucket:row.bucket,objectKey:row.objectKey,maximumBytes:Number(row.sizeBytes),timeoutMs:5000});
      if(stream.contentType!==row.mimeType||stream.totalSize!==Number(row.sizeBytes)||stream.contentLength!==Number(row.sizeBytes)||stream.range){stream.body.destroy();throw conflict("FILE_PREVIEW_METADATA_MISMATCH","图片存储信息发生变化");}
      bindLeaseToStream(stream.body,lease);
      return {body:stream.body,contentType:row.mimeType,contentLength:stream.contentLength};
    }catch(error){lease.release();throw error;}
  }

  async getAnnouncementCoverAccess(id: string) {
    const [row] = await this.database.db.select({ file: files }).from(announcements)
      .innerJoin(fileUsages, and(eq(fileUsages.targetId, announcements.id), eq(fileUsages.targetType, "ANNOUNCEMENT"), eq(fileUsages.usageType, "COVER"), eq(fileUsages.fileId, announcements.coverFileId), isNull(fileUsages.deletedAt)))
      .innerJoin(files, and(eq(files.id, announcements.coverFileId), eq(files.fileType, "ANNOUNCEMENT_IMAGE"), eq(files.uploadStatus, "VERIFIED"), eq(files.moderationStatus, "APPROVED"), eq(files.visibility, "SIGNED"), isNull(files.ownerUserId), isNull(files.deletedAt)))
      .where(and(eq(announcements.id, id), eq(announcements.status, "PUBLISHED"))).limit(1);
    if (!row) throw notFound("ANNOUNCEMENT_NOT_FOUND", "公告不存在或封面不可用");
    const result = await this.withAccess(row.file);
    return { file_id: row.file.id, access: result.access };
  }

  async getCompanionVoiceAccess(sellerId: string) {
    const [row] = await this.database.db.select({ file: files }).from(sellerProfiles)
      .innerJoin(fileUsages, and(
        eq(fileUsages.fileId, sellerProfiles.voiceFileId),
        eq(fileUsages.usageType, "VOICE"),
        eq(fileUsages.targetType, "SELLER"),
        eq(fileUsages.targetId, sellerProfiles.id),
        isNull(fileUsages.deletedAt),
      ))
      .innerJoin(files, and(
        eq(files.id, sellerProfiles.voiceFileId),
        eq(files.fileType, "VOICE_SAMPLE"),
        eq(files.visibility, "SIGNED"),
        eq(files.uploadStatus, "VERIFIED"),
        eq(files.moderationStatus, "APPROVED"),
        isNull(files.deletedAt),
      ))
      .where(and(eq(sellerProfiles.id, sellerId), eq(sellerProfiles.status, "APPROVED")))
      .limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND", "声音名片不存在或尚未通过审核");
    const result = await this.withAccess(row.file);
    return {
      file_id: row.file.id,
      mime_type: row.file.mimeType,
      duration_ms: row.file.durationMs,
      access: result.access,
    };
  }

  async getAdminFile(fileId: string) {
    const [row] = await this.database.db.select(cursorColumns(files)).from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt))).limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND", "文件不存在");
    const usages = await this.database.db.select({ order_id: orders.id, order_no: orders.orderNo }).from(fileUsages).innerJoin(orders, eq(orders.id, fileUsages.targetId)).where(and(eq(fileUsages.fileId, fileId), eq(fileUsages.targetType, "ORDER"), eq(fileUsages.usageType, "EVIDENCE"), isNull(fileUsages.deletedAt)));
    return { ...fileView(row), related_orders: usages };
  }

  async previewAdminFile(adminId: string, fileId: string, rangeHeader: string | undefined, metadata: RequestMetadata) {
    const [row] = await this.database.db.select(cursorColumns(files)).from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt))).limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND", "文件不存在");
    if (row.uploadStatus !== "VERIFIED") throw conflict("FILE_NOT_VERIFIED", "文件尚未完成上传校验，不能预览");
    if (!["PENDING", "APPROVED"].includes(row.moderationStatus)) throw new AppError({ code: "FILE_PREVIEW_NOT_ALLOWED", message: "当前文件状态不允许预览", statusCode: 403 });
    if (!isAdminPreviewMime(row.mimeType)) throw new AppError({ code: "FILE_PREVIEW_MIME_NOT_ALLOWED", message: "当前文件格式不支持后台预览", statusCode: 415 });
    const declaredSize = Number(row.sizeBytes);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > (row.fileType==="ORDER_FULFILLMENT_VIDEO" ? 100 : 20) * 1_024 * 1_024) throw new AppError({ code: "FILE_PREVIEW_SIZE_NOT_ALLOWED", message: "文件大小超出后台预览限制", statusCode: 413 });
    const range = parseByteRange(rangeHeader, declaredSize);
    const contentLength = range ? range.end - range.start + 1 : declaredSize;
    const lease = this.previewLimiter.acquire();
    if (!lease) throw new AppError({ code: "FILE_PREVIEW_BUSY", message: "文件预览请求较多，请稍后重试", statusCode: 429 });

    let releaseOnFailure: PreviewConcurrencyLease | null = lease;
    try {
      const stored = await this.storage.readObjectStream({ bucket: row.bucket, objectKey: row.objectKey, maximumBytes: contentLength, timeoutMs: 5_000, ...(range ? { range } : {}) });
      if (stored.totalSize !== declaredSize || stored.contentLength !== contentLength || stored.contentType !== row.mimeType || !sameRange(stored.range, range)) {
        stored.body.destroy();
        throw conflict("FILE_PREVIEW_METADATA_MISMATCH", "文件存储信息发生变化，暂时不能预览");
      }
      await this.database.db.insert(adminOperationLogs).values({
        id: uuidv7(), adminId, action: "FILE_PREVIEWED", targetType: "PLATFORM", targetId: fileId,
        reason: "管理员受控文件预览", beforeJson: null, afterJson: { mime_type: row.mimeType, range: range ? `${range.start}-${range.end}` : "full" },
        requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent,
      });
      bindLeaseToStream(stored.body, lease);
      releaseOnFailure = null;
      return {
        body: stored.body,
        contentLength,
        contentType: row.mimeType,
        totalSize: declaredSize,
        range,
        disposition: `inline; filename="admin-preview.${previewExtension(row.mimeType)}"`,
      };
    } finally {
      releaseOnFailure?.release();
    }
  }

  async deleteMyFile(userId: string, fileId: string) {
    return this.lifecycle.requestOwnedDeletion(userId, fileId);
  }

  async listForModeration(input: { fileType?: FileType; uploadStatus?: "PENDING" | "UPLOADED" | "VERIFIED" | "FAILED" | "DELETED"; moderationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";cursor?:string;limit?: number;sort:"created_desc"|"created_asc" }) {
    const limit=normalizePageSize(input.limit,20);const scope=`admin-files:${input.fileType??""}:${input.uploadStatus??""}:${input.moderationStatus??""}:${input.sort}`;const cursor=input.cursor?decodeCursor(input.cursor,this.config.cursorSigningSecret):undefined;if(cursor&&cursor.scope!==scope)throw new AppError({code:"VALIDATION_FAILED",message:"分页游标与当前文件筛选条件不匹配",statusCode:400});const ascending=input.sort==="created_asc";const cursorCondition=cursor?(ascending?or(gt(files.createdAt,cursorTimeValue(cursor.sort_value)),and(eq(files.createdAt,cursorTimeValue(cursor.sort_value)),gt(files.id,cursor.id))):or(lt(files.createdAt,cursorTimeValue(cursor.sort_value)),and(eq(files.createdAt,cursorTimeValue(cursor.sort_value)),lt(files.id,cursor.id)))):undefined;const rows=await this.database.db.select(cursorColumns(files)).from(files).where(and(input.fileType ? eq(files.fileType, input.fileType) : undefined, input.uploadStatus ? eq(files.uploadStatus, input.uploadStatus) : undefined, input.moderationStatus ? eq(files.moderationStatus, input.moderationStatus) : undefined, isNull(files.deletedAt),cursorCondition)).orderBy(ascending?asc(files.createdAt):desc(files.createdAt),ascending?asc(files.id):desc(files.id)).limit(limit+1);const page=rows.slice(0,limit);const last=page.at(-1);return {items:page.map(fileView),next_cursor:rows.length>limit&&last?encodeCursor({sort_value:last.createdAt.toISOString(),id:last.id,scope},this.config.cursorSigningSecret):null};
  }

  async moderate(adminId: string, fileId: string, decision: "APPROVED" | "REJECTED" | "FLAGGED", reason: string, metadata: RequestMetadata, continuousRecordingConfirmed?: boolean) {
    const [candidate] = await this.database.db.select(cursorColumns(files)).from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt))).limit(1);
    if (!candidate) throw notFound("FILE_NOT_FOUND", "文件不存在");
    if (candidate.fileType === "ORDER_FULFILLMENT_VIDEO" && decision === "APPROVED" && continuousRecordingConfirmed !== true) throw conflict("FILE_VIDEO_CONTINUITY_REVIEW_REQUIRED", "录屏需由审核员核验连续性并明确确认，格式校验不代表内容审核通过");
    if (candidate.uploadStatus !== "VERIFIED") throw conflict("FILE_NOT_VERIFIED", "文件尚未完成完整性校验");
    if (candidate.moderationStatus !== "PENDING") throw conflict("RESOURCE_VERSION_CONFLICT", "文件已被其他管理员处理，请刷新后查看最终审核结果");

    const destinationBucket = decision === "APPROVED"
      ? candidate.visibility === "PUBLIC" ? this.config.filePublicBucket : this.config.filePrivateBucket
      : candidate.bucket;
    const relocate = destinationBucket !== candidate.bucket;
    const destinationKey = relocate ? moderationObjectKey(candidate.fileType, candidate.id) : candidate.objectKey;
    if (relocate) {
      await this.storage.copyObject({ source: { bucket: candidate.bucket, objectKey: candidate.objectKey }, destination: { bucket: destinationBucket, objectKey: destinationKey } });
    }

    try {
      const result = await this.database.db.transaction(async (tx) => {
        const [row] = await tx.select(cursorColumns(files)).from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt))).limit(1).for("update");
        if (!row) throw notFound("FILE_NOT_FOUND", "文件不存在");
        if (row.uploadStatus !== "VERIFIED") throw conflict("FILE_NOT_VERIFIED", "文件尚未完成完整性校验");
        if (row.moderationStatus !== "PENDING" || row.bucket !== candidate.bucket || row.objectKey !== candidate.objectKey) {
          throw conflict("RESOURCE_VERSION_CONFLICT", "文件已被其他管理员处理，请刷新后查看最终审核结果");
        }
        const [updated] = await tx.update(files).set({ moderationStatus: decision, bucket: destinationBucket, objectKey: destinationKey, updatedAt: new Date() }).where(eq(files.id, fileId)).returning();
        const auditAction = decision === "APPROVED" ? "FILE_APPROVED" : decision === "REJECTED" ? "FILE_REJECTED" : "FILE_FLAGGED_ABNORMAL";
        await tx.insert(adminOperationLogs).values({ id: uuidv7(), adminId, action: auditAction, targetType: "PLATFORM", targetId: fileId, reason, beforeJson: { moderation_status: row.moderationStatus }, afterJson: { moderation_status: decision, ...(row.fileType==="ORDER_FULFILLMENT_VIDEO" ? { continuous_recording_confirmed: continuousRecordingConfirmed === true } : {}) }, requestId: metadata.requestId, traceId: metadata.traceId, ip: metadata.ip, userAgent: metadata.userAgent });
        let staleDeleteJobId: string | null = null;
        if (relocate) {
          staleDeleteJobId = uuidv7();
          await tx.insert(scheduledJobs).values({
            id: staleDeleteJobId,
            jobKey: staleDeleteJobKey(fileId, { bucket: candidate.bucket, objectKey: candidate.objectKey }),
            jobType: FILE_LIFECYCLE_JOB_TYPES.DELETE_STALE_OBJECT,
            targetType: "PLATFORM",
            targetId: fileId,
            payloadJson: { bucket: candidate.bucket, object_key: candidate.objectKey },
            runAt: new Date(),
            maxAttempts: this.config.fileLifecycleMaxAttempts,
          });
        }
        return { updated: updated!, staleDeleteJobId };
      });
      if (result.staleDeleteJobId) await this.lifecycle.runSpecificJob(result.staleDeleteJobId, "api-immediate-relocation-cleanup");
      return fileView(result.updated);
    } catch (error) {
      if (relocate) await this.storage.deleteObject({ bucket: destinationBucket, objectKey: destinationKey }).catch(() => undefined);
      throw error;
    }
  }

  private async requireOwned(userId: string, fileId: string) {
    const [row] = await this.database.db.select(cursorColumns(files)).from(files).where(and(eq(files.id, fileId), eq(files.ownerUserId, userId), isNull(files.deletedAt))).limit(1);
    if (!row) throw notFound("FILE_NOT_FOUND", "文件不存在或无权访问");
    return row;
  }

  private async withAccess(row: typeof files.$inferSelect) {
    if (row.uploadStatus !== "VERIFIED") throw conflict("FILE_NOT_VERIFIED", "文件尚未完成上传校验");
    if (row.visibility === "PUBLIC" && row.moderationStatus === "APPROVED" && this.config.publicAssetBaseUrl) {
      const path = (this.config.publicAssetPathMode === "key-only" ? row.objectKey.split("/") : [row.bucket, ...row.objectKey.split("/")]).map(encodeURIComponent).join("/");
      return { ...fileView(row), access: { url: `${this.config.publicAssetBaseUrl.replace(/\/$/u, "")}/${path}`, expires_at: null } };
    }
    const access = await this.storage.createDownloadUrl({ bucket: row.bucket, objectKey: row.objectKey, expiresInSeconds: this.config.fileDownloadUrlTtlSeconds });
    return { ...fileView(row), access: { url: access.url, expires_at: access.expiresAt } };
  }
}

function imagePolicy(fileType: FileType, maximumMebibytes: number, visibility: Visibility, actors: ActorKind[]): FilePolicy { return { fileType, mimeTypes: ["image/jpeg", "image/png", "image/webp"], maximumBytes: mebibytes(maximumMebibytes), visibility, actors }; }
function mebibytes(value: number): number { return value * 1_024 * 1_024; }
function requirePolicy(fileType: FileType, actor?: ActorKind): FilePolicy { const policy = policies.find((item) => item.fileType === fileType); if (!policy || (actor && !policy.actors.includes(actor))) throw new AppError({ code: "FILE_TYPE_NOT_ALLOWED", message: "当前身份不能上传此用途的文件", statusCode: 403 }); return policy; }
function policyView(policy: FilePolicy) { return { file_type: policy.fileType, mime_types: policy.mimeTypes, maximum_bytes: policy.maximumBytes, visibility: policy.visibility, minimum_duration_ms: policy.minimumDurationMs ?? null, maximum_duration_ms: policy.maximumDurationMs ?? null }; }
function moderationObjectKey(fileType: string, fileId: string): string { const now = new Date(); return `approved/${fileType.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${fileId}-${uuidv7()}`; }
function fileView(row: typeof files.$inferSelect) { return { id: row.id, owner_user_id: row.ownerUserId, file_type: row.fileType, mime_type: row.mimeType, size_bytes: row.sizeBytes, width: row.width, height: row.height, duration_ms: row.durationMs, upload_status: row.uploadStatus, moderation_status: row.moderationStatus, visibility: row.visibility, created_at: row.createdAt, updated_at: row.updatedAt }; }
function isAdminPreviewMime(value: string): boolean { return ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/aac", "audio/mp4", "video/mp4", "application/pdf"].includes(value); }
function previewExtension(value: string): string { return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/mp4": "m4a", "video/mp4": "mp4", "application/pdf": "pdf" } as Record<string, string>)[value] ?? "bin"; }
function parseByteRange(value: string | undefined, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || (!match[1] && !match[2])) throw new AppError({ code: "FILE_PREVIEW_RANGE_INVALID", message: "文件预览范围无效", statusCode: 416 });
  let start: number; let end: number;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix < 1) throw new AppError({ code: "FILE_PREVIEW_RANGE_INVALID", message: "文件预览范围无效", statusCode: 416 }); start = Math.max(size - suffix, 0); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) throw new AppError({ code: "FILE_PREVIEW_RANGE_INVALID", message: "文件预览范围无效", statusCode: 416 });
  return { start, end: Math.min(end, size - 1) };
}
function sameRange(left: { start: number; end: number } | null, right: { start: number; end: number } | null): boolean { return left === null ? right === null : right !== null && left.start === right.start && left.end === right.end; }
function bindLeaseToStream(stream: NodeJS.ReadableStream, lease: PreviewConcurrencyLease): void {
  const release = () => lease.release();
  stream.once("end", release);
  stream.once("close", release);
  stream.once("error", release);
}
function myFileView(row: typeof files.$inferSelect) { return { id: row.id, file_type: row.fileType, mime_type: row.mimeType, size_bytes: row.sizeBytes, width: row.width, height: row.height, duration_ms: row.durationMs, upload_status: row.uploadStatus, moderation_status: row.moderationStatus, visibility: row.visibility, created_at: row.createdAt, updated_at: row.updatedAt }; }
function fieldError(field: string, code: ErrorCode, message: string): AppError { return new AppError({ code, message, statusCode: 400, fieldErrors: [{ field, code, message }] }); }
function invalid(code: ErrorCode, message: string): AppError { return new AppError({ code, message, statusCode: 400 }); }
function conflict(code: ErrorCode, message: string): AppError { return new AppError({ code, message, statusCode: 409 }); }
function notFound(code: ErrorCode, message: string): AppError { return new AppError({ code, message, statusCode: 404 }); }
