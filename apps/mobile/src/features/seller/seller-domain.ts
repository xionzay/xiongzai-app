import { z } from "zod";
import { sellerApplicationMissingFields } from "@xiongzai/contracts/commerce";
import type { SellerProductStatus, SellerProfileApiView, SellerStatus } from "@/types/api";

export const sellerProfileSchema = z.object({
  sellerNickname: z.string().trim().min(2, "陪玩昵称至少 2 个字").max(32),
  introduction: z.string().trim().max(1000),
  gameRank: z.string().trim().max(64),
  kd: z.string().trim().refine(value => !value || /^\d{1,3}(\.\d{1,2})?$/u.test(value), "K/D 格式不正确"),
  preferredMode: z.string().trim().max(64),
  playStyle: z.string().trim().max(128),
  gameExperience: z.string().trim().max(500)
});
export type SellerProfileValues = z.infer<typeof sellerProfileSchema>;
export function sellerProfileTextPayload(values: SellerProfileValues) {
  const optional = (value: string) => value.trim() || null;
  return { seller_nickname: values.sellerNickname.trim(), introduction: optional(values.introduction), game_rank: optional(values.gameRank), kd: optional(values.kd), preferred_mode: optional(values.preferredMode), play_style: optional(values.playStyle), game_experience: optional(values.gameExperience) };
}

export const sellerServiceSchema = z.object({ title: z.string().trim().min(5, "标题至少 5 个字").max(40, "标题最多 40 个字"), description: z.string().trim().min(20, "详情至少 20 个字").max(1000) });
export const sellerSkuSchema = z.object({ skuName: z.string().trim().min(1, "请输入规格名称").max(30), description: z.string().trim().max(100), priceYuan: z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u, "请输入最多两位小数的金额").refine((value) => yuanToCent(value) !== null && BigInt(yuanToCent(value)!) > 0n, "金额必须大于 0"), durationMinutes: z.string().trim().regex(/^\d+$/u, "请输入分钟数").refine((value) => Number(value) >= 1 && Number(value) <= 1440, "时长应为 1–1440 分钟") });
export type SellerServiceValues = z.infer<typeof sellerServiceSchema>;
export type SellerSkuValues = z.infer<typeof sellerSkuSchema>;

export function yuanToCent(value: string): string | null { const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(value.trim()); if (!match) return null; return (BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString(); }
export function centToYuanInput(value: string) { const amount = BigInt(value); return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`; }

export type SellerEntry = "APPLY" | "EDIT_DRAFT" | "WAITING" | "SUPPLEMENT" | "REJECTED" | "CENTER" | "SUSPENDED" | "BANNED";
export function sellerEntry(status: SellerStatus | "NOT_APPLIED", applicationStatus?: string | null): SellerEntry { if (status === "NOT_APPLIED") return "APPLY"; if (status === "APPROVED") return "CENTER"; if (status === "SUSPENDED") return "SUSPENDED"; if (status === "BANNED") return "BANNED"; if (applicationStatus === "NEEDS_SUPPLEMENT") return "SUPPLEMENT"; if (status === "REJECTED" || applicationStatus === "REJECTED") return "REJECTED"; if (status === "PENDING_REVIEW") return "WAITING"; return "EDIT_DRAFT"; }
export function canEnterSellerCenter(status: SellerStatus | "NOT_APPLIED") { return status === "APPROVED"; }
export function shouldReloadSellerAfterConflict(code: string) { return code === "RESOURCE_VERSION_CONFLICT"; }
export function missingSellerApplicationFields(profile: SellerProfileApiView) {
  const labels = { seller_avatar_file_id: "陪玩头像", introduction: "主页介绍", preferred_mode: "擅长模式" };
  return sellerApplicationMissingFields(profile).map(key => labels[key]);
}

export type SellerServiceAction = "EDIT" | "SUBMIT" | "VIEW_REVIEW" | "OFF_SALE" | "DELETE";
export function sellerServiceActions(status: SellerProductStatus): SellerServiceAction[] { const matrix: Record<SellerProductStatus, SellerServiceAction[]> = { DRAFT: ["EDIT", "SUBMIT", "DELETE"], PENDING_REVIEW: ["VIEW_REVIEW"], ON_SALE: ["VIEW_REVIEW", "OFF_SALE"], REVIEW_REJECTED: ["VIEW_REVIEW", "EDIT", "SUBMIT"], OFF_SALE: ["EDIT", "SUBMIT", "DELETE"], ADMIN_OFF_SALE: ["VIEW_REVIEW"], DELETED: [] }; return matrix[status]; }
export function canSubmitSellerService(skus: { status: "ACTIVE" | "INACTIVE" | "DELETED" }[]) { return skus.some((sku) => sku.status === "ACTIVE"); }
export function isSellerIdentityForUser(userId: string, seller: Pick<SellerProfileApiView, "user_id">) { return seller.user_id === userId; }
export function sellerBuyerCacheKeys(sellerId: string, productId?: string) { return [["home", "catalog"], ["discovery"], ["favorites"], ["companion", sellerId], ...(productId ? [["service", productId]] : [])] as const; }
