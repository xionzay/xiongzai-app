import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { requestContext } from "@xiongzai/observability";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, RequireMfa, RequirePermissions, type AuthenticatedRequest } from "./auth.guard.js";
import { ZodValidationPipe } from "./http.js";
import type { RequestMetadata } from "./identity-user.service.js";
import { FinanceService } from "./finance.service.js";
import { OrderPaymentService } from "./order-payment.service.js";
import { SellerProductService } from "./seller-product.service.js";
import { FileStorageService } from "./file-storage.service.js";

const uuid = z.uuid();
const nullableUuid = z.uuid().nullable().optional();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const cents = z.string().regex(/^\d+$/u, "金额必须是非负整数分").transform((value) => BigInt(value)).refine((value) => value > 0n, "金额必须大于 0");
const sellerProfileSchema = z.object({
  seller_nickname: z.string().trim().min(2).max(32), seller_avatar_file_id: nullableUuid, cover_file_id: nullableUuid,
  introduction: optionalText(1000), game_rank: optionalText(64), kd: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/u).nullable().optional(),
  preferred_mode: optionalText(64), play_style: optionalText(128), game_experience: optionalText(500), voice_file_id: nullableUuid,
  voice_duration_ms: z.number().int().min(10_000).max(30_000).nullable().optional(), accepting_orders: z.boolean().optional(),
});
const sellerProfileUpdateSchema = sellerProfileSchema.extend({ version: z.number().int().nonnegative() });
const sellerProfileRevisionSchema = sellerProfileSchema.omit({ accepting_orders: true }).extend({ seller_version: z.number().int().nonnegative(), application_version: z.number().int().nonnegative().optional() });
const versionSchema = z.object({ version: z.number().int().nonnegative() });
const sellerReviewSchema = z.object({ action: z.enum(["START_REVIEW", "REQUEST_SUPPLEMENT", "APPROVE", "REJECT"]), version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(1000).optional(), required_fields: z.array(z.string().trim().min(1).max(64)).max(30).optional() });
const sellerStatusSchema = z.object({ action: z.enum(["SUSPEND", "RESTORE", "BAN"]), version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(1000) });
const productSchema = z.object({ title: z.string().trim().min(4).max(120), description: z.string().trim().min(10).max(5000), service_time_description: optionalText(200), cover_file_id: nullableUuid });
const productUpdateSchema = productSchema.extend({ version: z.number().int().nonnegative() });
const skuCreateSchema = z.object({ sku_name: z.string().trim().min(1).max(100), description: optionalText(500), price_cent: cents, duration_minutes: z.number().int().min(1).max(1440), sort_order: z.number().int().min(0).max(1000).default(0) });
const skuUpdateSchema = z.object({ sku_name: z.string().trim().min(1).max(100).optional(), description: optionalText(500), price_cent: cents.optional(), duration_minutes: z.number().int().min(1).max(1440).optional(), status: z.enum(["ACTIVE", "INACTIVE", "DELETED"]).optional(), sort_order: z.number().int().min(0).max(1000).optional(), version: z.number().int().nonnegative() }).refine((value) => Object.keys(value).some((key) => key !== "version"), "至少修改一个字段");
const imagesSchema = z.object({ version: z.number().int().nonnegative(), images: z.array(z.object({ file_id: uuid, sort_order: z.number().int().min(0).max(1000), is_cover: z.boolean().default(false) })).max(9) }).superRefine((value, context) => {
  if (new Set(value.images.map((item) => item.file_id)).size !== value.images.length) context.addIssue({ code: "custom", message: "同一文件不能重复绑定" });
  if (new Set(value.images.map((item) => item.sort_order)).size !== value.images.length) context.addIssue({ code: "custom", message: "图片排序值不能重复" });
  const covers = value.images.filter((item) => item.is_cover).length;
  if (value.images.length > 0 && covers !== 1) context.addIssue({ code: "custom", message: "有图片时必须且只能设置一张主图" });
});
const slotCreateSchema = z.object({ starts_at: z.coerce.date(), ends_at: z.coerce.date(), status: z.enum(["OPEN", "BLOCKED", "CLOSED"]).default("OPEN") });
const slotUpdateSchema = z.object({ starts_at: z.coerce.date().optional(), ends_at: z.coerce.date().optional(), status: z.enum(["OPEN", "BLOCKED", "CLOSED"]).optional(), version: z.number().int().nonnegative() });
const favoriteTargetSchema = z.enum(["SELLER", "PRODUCT"]);
const discoverySchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional(), accepting_orders: z.enum(["true", "false"]).transform((value) => value === "true").optional(), keyword: z.string().trim().min(1).max(60).optional(), sort: z.enum(["comprehensive", "rating", "sales"]).default("comprehensive") });
const availabilityQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const productListSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional(), seller_id: z.uuid().optional(), keyword: z.string().trim().min(1).max(60).optional(), min_price_cent: z.string().regex(/^\d+$/u).transform(BigInt).optional(), max_price_cent: z.string().regex(/^\d+$/u).transform(BigInt).optional(), sort: z.enum(["comprehensive", "sales", "price_asc", "price_desc"]).default("comprehensive") });
const favoriteListSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional(), target_type: favoriteTargetSchema.optional() });
const sellerReviewListSchema = z.object({ status: z.enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "NEEDS_SUPPLEMENT", "APPROVED", "REJECTED"]).optional(), keyword:z.string().trim().min(1).max(100).optional(),cursor:z.string().trim().min(1).max(4096).optional(),limit: z.coerce.number().int().min(1).max(100).optional(),sort:z.enum(["created_desc","created_asc"]).default("created_desc") });
const productReviewListSchema = z.object({ status: z.enum(["DRAFT", "PENDING_REVIEW", "ON_SALE", "REVIEW_REJECTED", "OFF_SALE", "ADMIN_OFF_SALE", "DELETED"]).optional(),keyword:z.string().trim().min(1).max(100).optional(),cursor:z.string().trim().min(1).max(4096).optional(),limit: z.coerce.number().int().min(1).max(100).optional(),sort:z.enum(["created_desc","created_asc"]).default("created_desc") });
const productReviewSchema = z.object({ action: z.enum(["APPROVE", "REJECT", "ADMIN_OFF_SALE", "ADMIN_RESTORE", "SOFT_DELETE"]), version: z.number().int().nonnegative(), reason: z.string().trim().min(2).max(1000).optional() });

@Controller("api/v1/seller")
export class SellerController {
  constructor(private readonly service: SellerProductService, private readonly orders: OrderPaymentService, private readonly finance: FinanceService) {}

  @Get("overview") async overview(@Req() request: UserRequest) { const userId = principal(request); const [seller, orders, finance] = await Promise.all([this.service.getSellerOverview(userId), this.orders.sellerOrderSummary(userId), this.finance.sellerSummary(userId)]); return { seller: seller.profile, service_counts: seller.service_counts, order_counts: orders, finance }; }
  @Get("profile") getProfile(@Req() request: UserRequest) { return this.service.getMySeller(principal(request)); }
  @Post("profile") createProfile(@Req() request: UserRequest, @Body(new ZodValidationPipe(sellerProfileSchema)) body: z.infer<typeof sellerProfileSchema>) { return this.service.createSeller(principal(request), sellerInput(body)); }
  @Patch("profile") updateProfile(@Req() request: UserRequest, @Body(new ZodValidationPipe(sellerProfileUpdateSchema)) body: z.infer<typeof sellerProfileUpdateSchema>) { return this.service.updateSeller(principal(request), { ...sellerInput(body), version: body.version }); }
  @Put("profile-revisions/draft") saveProfileRevision(@Req() request: UserRequest, @Body(new ZodValidationPipe(sellerProfileRevisionSchema)) body: z.infer<typeof sellerProfileRevisionSchema>) { return this.service.saveSellerProfileRevision(principal(request), { ...sellerInput(body), sellerVersion: body.seller_version, applicationVersion: body.application_version }); }
  @Post("profile-revisions/:applicationId/submit") submitProfileRevision(@Req() request: UserRequest, @Param("applicationId", new ZodValidationPipe(uuid)) applicationId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.submitSellerProfileRevision(principal(request), applicationId, body.version, metadata(request)); }
  @Post("applications") submitApplication(@Req() request: UserRequest, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.submitSellerApplication(principal(request), body.version, metadata(request)); }
  @Get("applications") applications(@Req() request: UserRequest) { return this.service.listMyApplications(principal(request)); }

  @Get("services") services(@Req() request: UserRequest) { return this.service.listMyProducts(principal(request)); }
  @Post("services") createService(@Req() request: UserRequest, @Body(new ZodValidationPipe(productSchema)) body: z.infer<typeof productSchema>) { return this.service.createProduct(principal(request), productInput(body)); }
  @Get("services/:productId") serviceDetail(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string) { return this.service.getMyProduct(principal(request), productId); }
  @Patch("services/:productId") updateService(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Body(new ZodValidationPipe(productUpdateSchema)) body: z.infer<typeof productUpdateSchema>) { return this.service.updateProduct(principal(request), productId, { ...productInput(body), version: body.version }); }
  @Post("services/:productId/submit-review") submitService(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.submitProduct(principal(request), productId, body.version, metadata(request)); }
  @Post("services/:productId/off-sale") offSale(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Body(new ZodValidationPipe(versionSchema)) body: z.infer<typeof versionSchema>) { return this.service.offSaleProduct(principal(request), productId, body.version, metadata(request)); }
  @Delete("services/:productId") removeService(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Query("version", new ZodValidationPipe(z.coerce.number().int().nonnegative())) version: number) { return this.service.deleteProduct(principal(request), productId, version, metadata(request)); }

  @Post("services/:productId/skus") createSku(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Body(new ZodValidationPipe(skuCreateSchema)) body: z.infer<typeof skuCreateSchema>) { return this.service.addSku(principal(request), productId, { skuName: body.sku_name, description: body.description, priceCent: body.price_cent, durationMinutes: body.duration_minutes, sortOrder: body.sort_order }); }
  @Patch("services/:productId/skus/:skuId") updateSku(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Param("skuId", new ZodValidationPipe(uuid)) skuId: string, @Body(new ZodValidationPipe(skuUpdateSchema)) body: z.infer<typeof skuUpdateSchema>) { return this.service.updateSku(principal(request), productId, skuId, { skuName: body.sku_name, description: body.description, priceCent: body.price_cent, durationMinutes: body.duration_minutes, status: body.status, sortOrder: body.sort_order, version: body.version }); }
  @Put("services/:productId/images") images(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Body(new ZodValidationPipe(imagesSchema)) body: z.infer<typeof imagesSchema>) { return this.service.replaceImages(principal(request), productId, { version: body.version, images: body.images.map((item) => ({ fileId: item.file_id, sortOrder: item.sort_order, isCover: item.is_cover })) }); }

  @Get("availability") availability(@Req() request: UserRequest) { return this.service.listAvailability(principal(request)); }
  @Post("availability") createAvailability(@Req() request: UserRequest, @Body(new ZodValidationPipe(slotCreateSchema)) body: z.infer<typeof slotCreateSchema>) { return this.service.addAvailability(principal(request), { startsAt: body.starts_at, endsAt: body.ends_at, status: body.status }); }
  @Patch("availability/:slotId") updateAvailability(@Req() request: UserRequest, @Param("slotId", new ZodValidationPipe(uuid)) slotId: string, @Body(new ZodValidationPipe(slotUpdateSchema)) body: z.infer<typeof slotUpdateSchema>) { return this.service.updateAvailability(principal(request), slotId, { startsAt: body.starts_at, endsAt: body.ends_at, status: body.status, version: body.version }); }
  @Delete("availability/:slotId") closeAvailability(@Req() request: UserRequest, @Param("slotId", new ZodValidationPipe(uuid)) slotId: string, @Query("version", new ZodValidationPipe(z.coerce.number().int().nonnegative())) version: number) { return this.service.removeAvailability(principal(request), slotId, version); }
}

@Controller("api/v1/companions")
export class CompanionDiscoveryController {
  constructor(private readonly service: SellerProductService, private readonly files: FileStorageService) {}
  @Get() @Public() list(@Query(new ZodValidationPipe(discoverySchema)) query: z.infer<typeof discoverySchema>) { return this.service.listCompanions({ cursor: query.cursor, limit: query.limit, acceptingOrders: query.accepting_orders, keyword: query.keyword, sort: query.sort }); }
  @Get(":sellerId/availability") @Public() availability(@Param("sellerId", new ZodValidationPipe(uuid)) sellerId: string, @Query(new ZodValidationPipe(availabilityQuerySchema)) query: z.infer<typeof availabilityQuerySchema>) { return this.service.listPublicAvailability(sellerId, query.from, query.to); }
  @Get(":sellerId/voice") @Public() voice(@Param("sellerId", new ZodValidationPipe(uuid)) sellerId: string) { return this.files.getCompanionVoiceAccess(sellerId); }
  @Get(":sellerId") @Public() detail(@Param("sellerId", new ZodValidationPipe(uuid)) sellerId: string) { return this.service.getCompanion(sellerId); }
}

@Controller("api/v1/services")
export class ServiceDiscoveryController {
  constructor(private readonly service: SellerProductService) {}
  @Get() @Public() list(@Query(new ZodValidationPipe(productListSchema)) query: z.infer<typeof productListSchema>) { return this.service.listProducts({ cursor: query.cursor, limit: query.limit, sellerId: query.seller_id, keyword: query.keyword, minPriceCent: query.min_price_cent, maxPriceCent: query.max_price_cent, sort: query.sort }); }
  @Get(":productId") @Public() detail(@Param("productId", new ZodValidationPipe(uuid)) productId: string) { return this.service.getProduct(productId); }
}

@Controller("api/v1/favorites")
export class FavoriteController {
  constructor(private readonly service: SellerProductService) {}
  @Get() list(@Req() request: UserRequest, @Query(new ZodValidationPipe(favoriteListSchema)) query: z.infer<typeof favoriteListSchema>) { return this.service.listFavorites(principal(request), query); }
  @Get(":targetType/:targetId") status(@Req() request: UserRequest, @Param("targetType", new ZodValidationPipe(favoriteTargetSchema)) targetType: "SELLER" | "PRODUCT", @Param("targetId", new ZodValidationPipe(uuid)) targetId: string) { return this.service.favoriteStatus(principal(request), targetType, targetId); }
  @Put(":targetType/:targetId") put(@Req() request: UserRequest, @Param("targetType", new ZodValidationPipe(favoriteTargetSchema)) targetType: "SELLER" | "PRODUCT", @Param("targetId", new ZodValidationPipe(uuid)) targetId: string) { return this.service.addFavorite(principal(request), targetType, targetId); }
  @Delete(":targetType/:targetId") remove(@Req() request: UserRequest, @Param("targetType", new ZodValidationPipe(favoriteTargetSchema)) targetType: "SELLER" | "PRODUCT", @Param("targetId", new ZodValidationPipe(uuid)) targetId: string) { return this.service.removeFavorite(principal(request), targetType, targetId); }
}

@Controller("api/v1/files")
export class PublicFileController {
  constructor(private readonly service: FileStorageService) {}
  @Get(":fileId") @Public() detail(@Param("fileId", new ZodValidationPipe(uuid)) fileId: string) { return this.service.getPublicFile(fileId); }
}

@Controller("admin-api/v1")
@RequireMfa()
export class AdminSellerProductController {
  constructor(private readonly service: SellerProductService) {}
  @Get("seller-applications") @RequirePermissions("seller_application.read") listSellerApplications(@Query(new ZodValidationPipe(sellerReviewListSchema)) query: z.infer<typeof sellerReviewListSchema>) { return this.service.listSellerApplications(query); }
  @Get("seller-applications/:applicationId") @RequirePermissions("seller_application.read") sellerApplication(@Param("applicationId",new ZodValidationPipe(uuid))applicationId:string){return this.service.getAdminSellerApplication(applicationId);}
  @Post("seller-applications/:applicationId/review") @RequirePermissions("seller_application.review") reviewSeller(@Req() request: UserRequest, @Param("applicationId", new ZodValidationPipe(uuid)) applicationId: string, @Body(new ZodValidationPipe(sellerReviewSchema)) body: z.infer<typeof sellerReviewSchema>) { return this.service.reviewSeller(principal(request), applicationId, { action: body.action, version: body.version, reason: body.reason, requiredFields: body.required_fields }, metadata(request)); }
  @Get("sellers/:sellerId") @RequirePermissions("seller.read") seller(@Param("sellerId",new ZodValidationPipe(uuid))sellerId:string){return this.service.getAdminSeller(sellerId);}
  @Post("sellers/:sellerId/status") @RequirePermissions("seller.status.manage") status(@Req() request: UserRequest, @Param("sellerId", new ZodValidationPipe(uuid)) sellerId: string, @Body(new ZodValidationPipe(sellerStatusSchema)) body: z.infer<typeof sellerStatusSchema>) { return this.service.changeSellerStatus(principal(request), sellerId, body, metadata(request)); }
  @Get("product-reviews") @RequirePermissions("product.read") listProductReviews(@Query(new ZodValidationPipe(productReviewListSchema)) query: z.infer<typeof productReviewListSchema>) { return this.service.listProductReviews(query); }
  @Get("products/:productId") @RequirePermissions("product.read") product(@Param("productId",new ZodValidationPipe(uuid))productId:string){return this.service.getAdminProduct(productId);}
  @Post("products/:productId/review") @RequirePermissions("product.review") reviewProduct(@Req() request: UserRequest, @Param("productId", new ZodValidationPipe(uuid)) productId: string, @Body(new ZodValidationPipe(productReviewSchema)) body: z.infer<typeof productReviewSchema>) { return this.service.reviewProduct(principal(request), productId, body, metadata(request)); }
}

type UserRequest = FastifyRequest & AuthenticatedRequest;
function principal(request: UserRequest) { if (!request.principal) throw new AppError({ code: errorCodes.AUTH_REQUIRED, message: "请先登录", statusCode: 401 }); return request.principal.sub; }
function metadata(request: FastifyRequest): RequestMetadata { const context = requestContext.get(); return { ip: request.ip.slice(0, 64), userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 2000), requestId: context?.requestId ?? "unknown", traceId: context?.traceId }; }
function sellerInput(body: z.infer<typeof sellerProfileSchema>) { return { sellerNickname: body.seller_nickname, sellerAvatarFileId: body.seller_avatar_file_id, coverFileId: body.cover_file_id, introduction: body.introduction, gameRank: body.game_rank, kd: body.kd, preferredMode: body.preferred_mode, playStyle: body.play_style, gameExperience: body.game_experience, voiceFileId: body.voice_file_id, voiceDurationMs: body.voice_duration_ms, acceptingOrders: body.accepting_orders }; }
function productInput(body: z.infer<typeof productSchema>) { return { title: body.title, description: body.description, serviceTimeDescription: body.service_time_description, coverFileId: body.cover_file_id }; }
