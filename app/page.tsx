"use client";
import { ConnectedProductForm } from "./seller-workbench/ConnectedProductForm";
import { OrderCouponPicker } from "./OrderCouponPicker";
import { PRODUCT_GAMES, publicGames, offersCompanion, noticeGroup } from "./product-decisions";
import { FeedbackPage, CouponCenter, GameFilter, ChatPlusPanel } from "./ProductDecisionPages";
import { CartoonSelect } from "./ui/CartoonSelect";
import { usePanelDismiss } from "./ui/usePanelDismiss";
import { BuyerIdentity } from "./BuyerIdentity";
import { mineOrderIcon } from "./buyer-mine-model";
import { CartoonIcon } from "./ui/CartoonIcon";
import { createSamples } from "./trade-v31/model";

import { ConversationList, type InboxEntry, type InboxSearchState } from "./ConversationList";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { TradeWorkspace, useTradePreview, tradeCatalog, type TradePageId, type TradeView } from "./trade-v31/TradeWorkspace";
import { ProductActions, ProductBackButton, ProductDescription } from "./ProductDetailUi";
import { PurchaseSpecSheet } from "./PurchaseSpecSheet";
import { SellerSearch, SellerSearchIcon } from "./seller-workbench/SellerUi";
import { SellerWorkbench, useMerchantPreview } from "./seller-workbench/SellerWorkbench";
import { LocalCatalogPreview, RatingBadge } from "./LocalCatalogPreview";
import { previewCompanions, previewServices, previewHotServices, type PreviewEntry } from "./local-catalog-data";
import { buyerOrderTabs, sellerOrderTabs, buyerOrderEntries, commerceOrderLabel, matchesOrderTab, sellerFulfillmentAction } from "./commerce-model";
import { merchantPeriods, merchantMetrics, type MerchantPeriod } from "./merchant-model";
import { UI_REFINEMENT } from "./ui-refinement";
import { HomeAnnouncementCarousel } from "./HomeAnnouncementCarousel";
import { useAppCanvas } from "./useAppCanvas";
import { useUserUiMotion, useSheetAccessibility, useHomeModeMotion } from "./useUserUiMotion";
import { PublicStorefront } from "./storefront/PublicStorefront";
import { ProfileEditor } from "./storefront/ProfileEditor";
import type { ListState as StorefrontListState, Profile as StorefrontProfile, Product as StorefrontProduct } from "./storefront/model";
import { CatalogImage, DEFAULT_PLAYER_IMAGE, DEFAULT_SERVICE_IMAGE } from "./CatalogImage";
import { StateBear } from "./BearStateImage";
import { financeBearScene } from "./bear-state-config";
import { RequestErrorBear, DemoStateNotice } from "./BearStatusSupport";
import { EmojiText, useEmojiClipboard } from "./chat-stickers/StandardEmoji";
import { BearStickerImage, PendingBearStickers, useBearStickerSender } from "./chat-stickers/BearStickers";
import type { BearSticker } from "../packages/contracts/src/bear-stickers";
import { StickerToggle, StickerTray, StickerChatPreview, StickerDemoMessages, useStickerChat } from "./chat-stickers/StickerChat";

type BuyerPage = "feedback" | "quickMatch" | "buyerSellerIdentity" | "splash" | "auth" | "profileSetup" | "agreementDetail" | "policyCenter" | "policyAcceptances" | "sellerPolicyConfirm" | "authGuard" | "home" | "announcementDetail" | "search" | "searchResults" | "companion" | "service" | "serviceUnavailable" | "specs" | "bookingSchedule" | "checkout" | "payment" | "paymentProcessing" | "paymentResult" | "paymentFailure" | "paymentCancelled" | "paymentClosed" | "paymentTimeout" | "paymentExceptions" | "orders" | "orderPendingPayment" | "orderDetail" | "orderAccepted" | "orderInService" | "orderPendingConfirm" | "orderCompleted" | "orderReviewed" | "orderCancelled" | "orderSellerRejected" | "orderAfterSale" | "orderRefunded" | "refundApply" | "refundDetail" | "refundRejected" | "refundPlatform" | "refundProcessing" | "refundCompleted" | "refundClosed" | "complaint" | "complaintDetail" | "complaintEvidence" | "complaintCompleted" | "complaintClosed" | "review" | "allReviews" | "reviewDetail" | "reviewStates" | "messages" | "notifications" | "notificationDetail" | "chat" | "chatStates" | "customerService" | "mine" | "buyerProfile" | "favorites" | "coupons" | "editProfile" | "privacySecurity" | "phoneSecurity" | "privacySettings" | "dataExport" | "accountCancellation" | "rules" | "settings" | "transactionStates" | "globalStates" | "mediaWorkflow" | "permissionCenter" | "emptySearch" | "emptyOrders" | "emptyMessages" | "emptyFavorites" | "emptyIncome" | "restrictedAccess" | "apply" | "sellerApplyForm" | "sellerApplyStatus" | "sellerApplyReview" | "sellerApplySupplement" | "sellerApplyRejected" | "sellerApplySuspended";
type SellerPage = "sellerMine" | "sellerMessages" | "sellerChat" | "seller" | "sellerProfile" | "sellerServices" | "sellerPublish" | "sellerServiceEdit" | "serviceAuditDetail" | "sellerOrders" | "sellerOrderDetail" | "sellerOrderAccepted" | "sellerOrderInService" | "sellerOrderPendingConfirm" | "sellerOrderCompleted" | "sellerOrderClosed" | "sellerOrderRefunded" | "sellerRefund" | "sellerEarnings" | "incomeDetails" | "withdraw" | "payoutAccounts" | "withdrawals" | "withdrawalDetail" | "sellerStateMatrix";
type PageId = BuyerPage | SellerPage | TradePageId;
const isSellerThemePage = (page: PageId) => page.startsWith("seller") || ["serviceAuditDetail", "incomeDetails", "withdraw", "payoutAccounts", "withdrawals", "withdrawalDetail", "emptyIncome"].includes(page);
const sharedThemePages: PageId[] = ["settings", "editProfile", "privacySecurity", "phoneSecurity", "privacySettings", "dataExport", "accountCancellation", "permissionCenter", "policyCenter", "policyAcceptances", "agreementDetail", "rules", "notifications", "notificationDetail", "announcementDetail", "customerService"];

type Tone = "orange" | "lime" | "violet" | "blue";
type EarningsRange = "今日" | "昨日" | "本周" | "本月" | "本年" | "累计";
type PaymentOutcome = "success" | "failed" | "cancelled" | "closed" | "timeout";
type BuyerOrderState = "pendingPayment" | "pendingAccept" | "accepted" | "inService" | "pendingConfirm" | "completed" | "reviewed" | "cancelled" | "sellerRejected" | "afterSale" | "refunded";
type RefundState = "pending" | "rejected" | "platform" | "processing" | "completed" | "closed";
type ComplaintState = "processing" | "evidence" | "completed" | "closed";
type SellerApplicationState = "approved" | "reviewing" | "supplement" | "rejected" | "suspended";
type SellerOrderState = "pending" | "accepted" | "inService" | "pendingConfirm" | "completed" | "closed" | "refunded";
type AnnouncementKind = "reportTrade" | "antiFraud";

type Companion = { gender?: "男" | "女"; avatarFileId?: string | null; coverFileId?: string | null; id: number | string; name: string; image: string; level: number; rank: string; rating: string; completed: number; services: number; tags: string[]; online?: boolean; favoriteCount?: number; reviewCount?: number; introduction?: string | null; kd?: string | null; voiceFileId?: string | null; voiceDurationMs?: number | null };
type Service = { reviewCount?:number; gameCategory?:string; coverFileId?: string | null; sellerAvatarFileId?: string | null; id: number | string; sellerId: number | string; sellerName?: string; sellerImage?: string; title: string; cover: string; priceCent: string; sold: number; rating: string; tone: Tone; tags: string[]; subtitle: string };
type SellerApiView = { id: string; seller_nickname: string; seller_avatar_file_id: string | null; cover_file_id: string | null; introduction: string | null; game_rank: string | null; kd?: string | null; game_experience?: string | null; preferred_mode: string | null; play_style: string | null; voice_file_id: string | null; voice_duration_ms: number | null; accepting_orders: boolean; rating_avg: string; review_count: number; completed_order_count: number; favorite_count: number; version: number };
type ProductApiView = { game_category?:string; id: string; seller_id: string; title: string; description: string; service_time_description: string | null; cover_file_id: string | null; min_price_cent: string; sold_count: number; rating_avg: string; review_count: number; status: string; version: number; seller?: SellerApiView; skus?: Array<{ id: string; sku_name: string; price_cent: string; duration_minutes: number; status: string }> };
type AvailabilityApiView = { id: string; starts_at: string; ends_at: string; status: string; version: number };
type BookingSelection = { slotId: string; startsAt: string; label: string };
type OrderApiView = { rule_version?: string; can_review?: boolean; available_actions?: string[]; review_deadline_at?: string | null; id: string; order_no: string; buyer_id: string; seller_user_id: string; seller_id: string; product_id: string; sku_id: string; product_title: string; product_image: string; product_description: string; seller_name: string; seller_avatar: string | null; sku_name: string; sku_description: string | null; sku_price_cent: string; sku_duration_minutes: number; quantity: number; total_amount_cent: string; discount_cent: string; payable_amount_cent: string; paid_amount_cent: string; refunded_amount_cent: string; platform_fee_cent: string; seller_income_cent: string; service_starts_at: string; service_ends_at: string; buyer_note: string | null; status: string; payment_status: string; after_sale_status: string; expires_at: string; auto_confirm_at: string | null; version: number; created_at: string; updated_at: string };
type PaymentApiView = { id: string; payment_no: string; order_id: string; amount_cent: string; status: string; version: number };
type ConversationApiView = { counterpart?: { nickname: string; avatar_file_id?: string | null }; id: string; conversation_no: string; conversation_type: "CONSULTATION" | "ORDER" | "SUPPORT"; product_id: string | null; order_id: string | null; last_message_preview: string | null; last_message_at: string | null; unread_count: number; member_role: string; can_send?: boolean; send_block_reason?: string | null; version: number; created_at: string };
type MessageApiView = { id: string; conversation_id: string; client_message_id: string; sequence_no: string; sender_user_id: string | null; sender_admin_id: string | null; sender_role: string; message_type: "TEXT" | "SYSTEM" | "STICKER"; sticker?: BearSticker; read_by_recipient?: boolean; content: string; send_status: string; moderation_status: string; created_at: string };
type SupportCaseApiView = { id: string; case_no: string; requester_id: string; conversation_id: string; topic: string; priority: string; status: "WAITING" | "SERVING" | "TRANSFERRED" | "CLOSED"; queue_key: string; assigned_admin_id: string | null; related_type: string | null; related_id: string | null; first_response_at: string | null; closed_at: string | null; close_reason: string | null; version: number; created_at: string };
type NotificationApiView = { id: string; category: "ORDER" | "ACCOUNT" | "PLATFORM"; notification_type: string; title: string; content_template_id: string; content_variables: Record<string, unknown>; related_type: string | null; related_id: string | null; read_status: "UNREAD" | "READ"; read_at: string | null; created_at: string };
type RefundApiView = { id: string; refund_no: string; order_id: string; requested_amount_cent: string; approved_amount_cent: string | null; reason_code: string; reason_text: string; description: string | null; seller_decision: "APPROVE" | "REJECT" | null; seller_reason: string | null; admin_decision: "APPROVE" | "REJECT" | null; admin_reason: string | null; status: "REQUESTED" | "SELLER_APPROVED" | "SELLER_REJECTED" | "NEGOTIATING" | "PLATFORM_REVIEW" | "REFUND_PROCESSING" | "REFUNDED" | "REJECTED" | "CANCELLED"; provider_refund_no: string | null; version: number; created_at: string; updated_at: string; logs?: Array<{ id: string; action: string; reason: string | null; new_status: string; created_at: string }> };
type ComplaintApiView = { id: string; complaint_no: string; reporter_id: string; target_type: string; order_id: string | null; complaint_type: string; description: string; status: "SUBMITTED" | "ACCEPTED" | "PROCESSING" | "NEED_MORE_EVIDENCE" | "COMPLETED" | "CLOSED"; assigned_admin_id: string | null; admin_result: string | null; processed_at: string | null; completed_at: string | null; version: number; created_at: string; logs?: Array<{ id: string; action: string; reason: string | null; new_status: string; created_at: string }>; evidences?: Array<{ id: string; file_id: string; description: string | null; created_at: string }> };
type ReviewApiView = { id: string; order_id: string; product_id: string; seller_id: string; buyer_id: string; rating: number; content: string | null; anonymous: boolean; status: "PENDING" | "PUBLIC" | "HIDDEN"; display_nickname: string; service_title: string; sku_name: string; hidden_at: string | null; hidden_reason: string | null; created_at: string };
type FinanceSummaryApi = { seller_id:string; pending_cent:string; available_cent:string; locked_cent:string; withdrawn_cent:string; liability_cent:string; withdrawal_paused:boolean };
type IncomeApiView = { id:string; order_id:string; seller_amount_cent:string; available_amount_cent:string; locked_amount_cent:string; withdrawn_amount_cent:string; reversed_amount_cent:string; status:string; settlement_available_at:string; created_at:string };
type LiabilityApiView = { id:string;liability_no:string;refund_id:string;original_amount_cent:string;outstanding_amount_cent:string;status:string;risk_hold:boolean;created_at:string };
type PayoutAccountApiView = { id:string; account_type:"WECHAT"|"ALIPAY"; display_mask:string; verification_status:string; is_default:boolean; version:number; created_at:string };
type WithdrawalApiView = { id:string; withdrawal_no:string; payout_account_id:string; amount_cent:string; fee_cent:string; actual_amount_cent:string; status:string; reject_reason:string|null; provider_payout_no:string|null; version:number; created_at:string; updated_at:string; logs?:Array<{id:string;action:string;reason:string|null;new_status:string;created_at:string}> };
type CursorResponse<T> = { items: T[]; next_cursor: string | null };
type IdentityView = { id: string; status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "REVOKED"; legal_name_mask: string; document_mask: string; rejection_reason: string | null; version: number };
type Viewer = { id: string; phone_mask: string; status: string; profile_initialized: boolean; version: number; profile: { nickname: string; avatar_file_id: string | null; bio: string | null; public_user_no: string; version: number } | null; identity_verification: IdentityView | null };
type PrivacyView = { show_online_status: boolean; show_public_profile: boolean; personalized_recommendations: boolean; version: number };
type PolicyView = { id: string; policy_type: string; title: string; content: string; version_no: number; published_at?: string; effective_at?: string; requires_reacceptance?: boolean };
type PolicyAcceptanceView = { policy_version_id: string; policy_type: string; title: string; version_no: number; published_at: string; acceptance_scene: string; confirmation_method: string; accepted_at: string };
type PolicyAcceptanceScene = "LOGIN" | "ORDER_PAYMENT" | "CHAT_ENTRY" | "SELLER_ONBOARDING" | "IDENTITY_VERIFICATION" | "VOICE_SAMPLE_UPLOAD" | "COMPLAINT_SUBMISSION";
type PhoneChangeView = { id:string;old_phone_mask:string;new_phone_mask:string;status:"PENDING_OLD_VERIFICATION"|"PENDING_NEW_VERIFICATION"|"READY"|"COMPLETED"|"CANCELLED"|"EXPIRED";expires_at:string;completed_at:string|null;cancelled_at:string|null;version:number;created_at:string };
type DataExportView = { id:string;status:"PENDING"|"PROCESSING"|"COMPLETED"|"FAILED"|"EXPIRED";requested_at:string;started_at:string|null;finished_at:string|null;expires_at:string;failure_code:string|null;version:number };
type CancellationView = { id:string;user_id:string;status:"REQUESTED"|"CANCELLED"|"PROCESSING"|"COMPLETED"|"REJECTED";reason:string;requested_at:string;waiting_period_ends_at:string;cancelled_at:string|null;completed_at:string|null;rejected_at:string|null;rejection_reason:string|null;version:number };
type CancellationEligibilityView = { eligible:boolean;blocker_codes:string[];waiting_period_seconds:number;checked_at:string };

class ApiClientError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly fieldErrors?: { field: string; message: string }[]) { super(message); }
}

function apiBaseUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:3002/api/v1";
  const host = window.location.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(host)) {
    const api = new URL(window.location.origin); api.port = "3002"; api.pathname = "/api/v1"; return api.toString().replace(/\/$/u, "");
  }
  return "/api/v1";
}

async function apiRequest<T>(path: string, init: RequestInit = {}, retryAfterRefresh = true): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  const canRefresh = !["/auth/sms/send", "/auth/sms/login", "/auth/token/refresh"].includes(path);
  if (response.status === 401 && retryAfterRefresh && canRefresh) {
    const refreshed = await fetch(`${apiBaseUrl()}/auth/token/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) return apiRequest<T>(path, init, false);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new ApiClientError(String(body.code ?? "HTTP_ERROR"), String(body.message ?? "请求失败，请稍后重试"), response.status, body.field_errors as { field: string; message: string }[] | undefined);
  return body as T;
}

function useScenePolicies(scene: PolicyAcceptanceScene) {
  const [policies, setPolicies] = useState<PolicyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const rows = await apiRequest<PolicyView[]>(`/policies/current?scene=${encodeURIComponent(scene)}`);
      if (!rows.length) throw new ApiClientError("POLICY_CONFIGURATION_INCOMPLETE", "当前场景的本地测试协议尚未发布", 503);
      setPolicies(rows);
    } catch (cause) {
      setPolicies([]); setError(apiMessage(cause));
    } finally { setLoading(false); }
  }, [scene]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { policies, loading, error, retry: load };
}

async function acceptSelectedPolicies(scene: PolicyAcceptanceScene, policyIds: string[]) {
  if (!policyIds.length) throw new ApiClientError("POLICY_NOT_ACCEPTED", "请先逐份阅读并确认协议", 400);
  return apiRequest<{ accepted_policy_version_ids: string[] }>("/policies/acceptances", {
    method: "POST",
    body: JSON.stringify({ acceptance_scene: scene, confirmation_method: "ONLINE_CONFIRM", policy_version_ids: policyIds }),
  });
}

function deviceId() {
  const key = "xiongzai_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function apiMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  return "暂时无法连接服务，请稍后重试";
}

function companionFromApi(row: SellerApiView): Companion {
  return { id: row.id, name: row.seller_nickname, image: DEFAULT_PLAYER_IMAGE, avatarFileId: row.seller_avatar_file_id, coverFileId: row.cover_file_id, level: 1, rank: row.game_rank ?? "和平精英陪玩", rating: row.rating_avg, completed: row.completed_order_count, services: 0, tags: [row.preferred_mode, row.play_style].filter((value): value is string => Boolean(value)), online: row.accepting_orders, favoriteCount: row.favorite_count, reviewCount: row.review_count, introduction: row.introduction, kd: row.kd, voiceFileId: row.voice_file_id, voiceDurationMs: row.voice_duration_ms };
}

function serviceFromApi(row: ProductApiView, index = 0): Service {
  return { id: row.id, gameCategory:row.game_category, reviewCount:row.review_count, sellerId: row.seller_id, sellerName: row.seller?.seller_nickname ?? "陪玩", sellerImage: DEFAULT_PLAYER_IMAGE, sellerAvatarFileId: row.seller?.seller_avatar_file_id, title: row.title, cover: DEFAULT_SERVICE_IMAGE, coverFileId: row.cover_file_id, priceCent: row.min_price_cent, sold: row.sold_count, rating: row.rating_avg, tone: (["orange", "lime", "violet", "blue"] as Tone[])[index % 4], tags: [row.game_category ?? publicGames(row.title)[0], "平台保障"].filter((v):v is string=>!!v), subtitle: row.service_time_description ?? row.description.slice(0, 36) };
}

function yuanToCent(value: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(value.trim());
  if (!match) return null;
  return (BigInt(match[1]!) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString();
}

function formatCent(cent: string): string {
  const negative = cent.startsWith("-"); const digits = negative ? cent.slice(1) : cent; const padded = digits.padStart(3, "0");
  return `${negative ? "-" : ""}${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

function compareCent(left: string, right: string): number {
  const leftCent = BigInt(left); const rightCent = BigInt(right);
  return leftCent === rightCent ? 0 : leftCent < rightCent ? -1 : 1;
}

const companions: Companion[] = [
  { id: 1, name: "鹿野", image: "/assets/player-luye.png", level: 28, rank: "无敌战神", rating: "5.0", completed: 1863, services: 6, tags: ["经典大神", "青受音", "稳定上分"], online: true },
  { id: 2, name: "小悠", image: "/assets/player-xiaoyou.png", level: 25, rank: "超级王牌", rating: "4.9", completed: 976, services: 4, tags: ["萝莉音", "娱乐陪玩", "话多不冷场"], online: true },
  { id: 3, name: "Kirito", image: "/assets/player-kirito.png", level: 28, rank: "最强王者", rating: "4.9", completed: 1523, services: 8, tags: ["地铁大神", "技术型", "教学耐心"], online: true },
  { id: 4, name: "苏苏", image: "/assets/player-susu.png", level: 26, rank: "荣耀王者", rating: "4.9", completed: 628, services: 5, tags: ["御姐音", "上分型", "心态稳定"] },
];

const services: Service[] = [
  { id: 1, sellerId: 3, title: "经典模式排位上分｜稳定沟通", cover: "/assets/product-hero.png", priceCent: "2500", sold: 1523, rating: "4.9", tone: "orange", tags: ["经典模式", "技术上分"], subtitle: "按局计费 · 可自选单双排" },
  { id: 2, sellerId: 1, title: "地铁逃生带飞｜摸金教学", cover: "/assets/home-hero.png", priceCent: "3500", sold: 893, rating: "5.0", tone: "lime", tags: ["地铁逃生", "路线教学"], subtitle: "装备规划 · 撤离路线讲解" },
  { id: 3, sellerId: 2, title: "欢乐四排｜萝莉音不冷场", cover: "/assets/publish-arcade.png", priceCent: "2000", sold: 668, rating: "4.9", tone: "violet", tags: ["娱乐陪玩", "萝莉音"], subtitle: "轻松娱乐 · 全程有话聊" },
  { id: 4, sellerId: 4, title: "巅峰赛冲分｜高效听指挥", cover: "/assets/player-poster.png", priceCent: "4500", sold: 437, rating: "4.9", tone: "blue", tags: ["巅峰赛", "上分型"], subtitle: "明确报点 · 复盘提升" },
];

const pageMeta: Array<{ page: PageId; no: string; title: string; note: string }> = [
  { page: "home", no: "01", title: "买家首页", note: "推荐、陪玩与服务三种浏览模式" },
  { page: "companion", no: "02", title: "陪玩主页", note: "公开资料、试音、评价和全部服务" },
  { page: "service", no: "03", title: "服务详情", note: "服务就是商品，可反向进入陪玩主页" },
  { page: "orders", no: "04", title: "购买订单", note: "买家端只查看我购买的订单" },
  { page: "mine", no: "05", title: "我的", note: "收藏分类、设置与陪玩中心入口" },
  { page: "seller", no: "06", title: "陪玩中心", note: "审核卖家专属的经营与履约空间" },
];

const pageCatalog: Array<{ group: string; items: Array<{ page: PageId; title: string }> }> = [
  ...(["buyer", "seller"] as const).map(role => ({ group: `${role === "buyer" ? "买家端" : "卖家端"} · V3.1 交易售后`, items: tradeCatalog.filter(item => role === "buyer" || !["Checkout", "Apply", "Review"].includes(item.suffix)).map(item => ({ page: `${role}Trade${item.suffix}` as PageId, title: `${role === "buyer" ? "买家" : "卖家"} · ${item.title}` })) })),
  { group: "买家端 · 账号与发现", items: [{ page: "splash", title: "启动页" }, { page: "auth", title: "登录注册" }, { page: "profileSetup", title: "资料初始化" }, { page: "policyCenter", title: "协议与隐私中心" }, { page: "agreementDetail", title: "协议详情与版本" }, { page: "policyAcceptances", title: "我的接受记录" }, { page: "sellerPolicyConfirm", title: "陪玩入驻协议确认" }, { page: "authGuard", title: "游客登录拦截" }, { page: "home", title: "首页" }, { page: "announcementDetail", title: "公告详情" }, { page: "search", title: "搜索" }, { page: "searchResults", title: "搜索结果" }] },
  { group: "买家端 · 陪玩与服务", items: [{ page: "companion", title: "陪玩主页" }, { page: "service", title: "服务详情" }, { page: "serviceUnavailable", title: "服务不可购买" }, { page: "specs", title: "规格选择" }, { page: "bookingSchedule", title: "预约时间" }, { page: "favorites", title: "我的收藏" }, { page: "allReviews", title: "全部评价" }, { page: "reviewDetail", title: "已提交评价" }, { page: "reviewStates", title: "评价审核状态" }, { page: "messages", title: "消息列表" }, { page: "notifications", title: "系统通知" }, { page: "notificationDetail", title: "通知详情" }, { page: "chat", title: "文字聊天" }, { page: "chatStates", title: "消息发送全状态" }, { page: "customerService", title: "平台客服" }] },
  { group: "买家端 · 交易与售后", items: [{ page: "checkout", title: "确认订单" }, { page: "payment", title: "支付" }, { page: "paymentResult", title: "支付结果" }, { page: "paymentExceptions", title: "支付异常处理" }, { page: "orders", title: "购买订单" }, { page: "orderDetail", title: "订单详情" }, { page: "orderAccepted", title: "订单·待开始" }, { page: "refundApply", title: "申请退款" }, { page: "refundDetail", title: "退款详情" }, { page: "complaint", title: "投诉介入" }, { page: "complaintDetail", title: "投诉详情" }, { page: "review", title: "评价服务" }, { page: "transactionStates", title: "交易完整状态" }] },
  { group: "买家端 · 个人中心", items: [{ page: "mine", title: "我的" }, { page: "buyerProfile", title: "买家公开主页" }, { page: "coupons", title: "优惠券占位" }, { page: "editProfile", title: "编辑资料" }, { page: "privacySecurity", title: "隐私与安全" }, { page: "rules", title: "平台规则" }, { page: "settings", title: "设置" }] },
  { group: "陪玩中心 · 入驻与经营", items: [{ page: "sellerApplyForm", title: "陪玩申请" }, { page: "sellerApplyStatus", title: "申请状态" }, { page: "seller", title: "经营概览" }, { page: "sellerProfile", title: "主页管理" }, { page: "sellerMessages", title: "卖家消息" }, { page: "sellerChat", title: "卖家聊天" }, { page: "companion", title: "公开主页预览" }, { page: "sellerPublish", title: "发布服务" }, { page: "sellerServices", title: "服务管理" }, { page: "sellerServiceEdit", title: "编辑服务" }] },
  { group: "陪玩中心 · 订单与收益", items: [{ page: "sellerOrders", title: "卖家订单" }, { page: "sellerOrderDetail", title: "卖家订单详情" }, { page: "sellerMine", title: "卖家我的" }, { page: "sellerEarnings", title: "收益中心" }, { page: "incomeDetails", title: "收益明细" }, { page: "withdraw", title: "收益提现" }, { page: "payoutAccounts", title: "收款账户管理" }, { page: "withdrawals", title: "提现记录" }, { page: "sellerStateMatrix", title: "陪玩中心完整状态" }] },
  { group: "新增 · 支付结果全状态", items: [{ page: "paymentProcessing", title: "支付处理中" }, { page: "paymentResult", title: "支付成功" }, { page: "paymentFailure", title: "支付失败" }, { page: "paymentCancelled", title: "用户取消支付" }, { page: "paymentClosed", title: "订单已关闭" }, { page: "paymentTimeout", title: "支付确认超时" }] },
  { group: "新增 · 买家订单详情全状态", items: [{ page: "orderPendingPayment", title: "订单·待付款" }, { page: "orderDetail", title: "订单·待接单" }, { page: "orderAccepted", title: "订单·已接单待开始" }, { page: "orderInService", title: "订单·服务中" }, { page: "orderPendingConfirm", title: "订单·待确认" }, { page: "orderCompleted", title: "订单·完成待评价" }, { page: "orderReviewed", title: "订单·已评价" }, { page: "orderCancelled", title: "订单·已取消" }, { page: "orderSellerRejected", title: "订单·陪玩拒单" }, { page: "orderAfterSale", title: "订单·售后中" }, { page: "orderRefunded", title: "订单·已退款" }] },
  { group: "新增 · 退款与投诉全状态", items: [{ page: "refundDetail", title: "退款·等待陪玩" }, { page: "refundRejected", title: "退款·陪玩拒绝" }, { page: "refundPlatform", title: "退款·平台介入" }, { page: "refundProcessing", title: "退款·渠道处理中" }, { page: "refundCompleted", title: "退款·已完成" }, { page: "refundClosed", title: "退款·已关闭" }, { page: "complaintDetail", title: "投诉·处理中" }, { page: "complaintEvidence", title: "投诉·补充证据" }, { page: "complaintCompleted", title: "投诉·处理完成" }, { page: "complaintClosed", title: "投诉·已关闭" }] },
  { group: "新增 · 隐私安全二级页面", items: [{ page: "phoneSecurity", title: "手机号与安全验证" }, { page: "privacySettings", title: "隐私设置" }, { page: "dataExport", title: "个人数据下载" }, { page: "accountCancellation", title: "注销账号" }] },
  { group: "新增 · 陪玩申请全状态", items: [{ page: "sellerApplyReview", title: "申请·审核中" }, { page: "sellerApplySupplement", title: "申请·补充资料" }, { page: "sellerApplyRejected", title: "申请·审核未通过" }, { page: "sellerApplyStatus", title: "申请·审核通过" }, { page: "sellerApplySuspended", title: "申请·资格暂停" }] },
  { group: "新增 · 陪玩经营全状态", items: [{ page: "serviceAuditDetail", title: "服务审核详情" }, { page: "sellerOrderAccepted", title: "卖家订单·待开始" }, { page: "sellerOrderInService", title: "卖家订单·服务中" }, { page: "sellerOrderPendingConfirm", title: "卖家订单·待确认" }, { page: "sellerOrderCompleted", title: "卖家订单·已完成" }, { page: "sellerOrderClosed", title: "卖家订单·已关闭" }, { page: "sellerOrderRefunded", title: "卖家订单·已退款" }, { page: "sellerRefund", title: "卖家退款处理" }, { page: "withdrawalDetail", title: "提现记录详情" }] },
  { group: "全局 · 页面状态与反馈", items: [{ page: "mediaWorkflow", title: "图片上传与裁剪" }, { page: "permissionCenter", title: "系统权限说明" }, { page: "globalStates", title: "加载·失败·断网总览" }, { page: "emptySearch", title: "空搜索结果" }, { page: "emptyOrders", title: "空订单" }, { page: "emptyMessages", title: "空消息" }, { page: "emptyFavorites", title: "空收藏" }, { page: "emptyIncome", title: "空收益" }, { page: "restrictedAccess", title: "权限与受限状态" }] },
];

function StatusBar() { return null; }

function IconButton({ children, label, onClick, badge }: { children: React.ReactNode; label: string; onClick?: () => void; badge?: number }) {
  return <button type="button" className="icon-button" aria-label={label} onClick={onClick}>{children}{badge ? <em>{badge}</em> : null}</button>;
}

function AppIcon({ kind, className = "" }: { kind: string; className?: string }) {
  return <i aria-hidden="true" className={`app-cartoon-icon ${className}`}><CartoonIcon kind={kind} /></i>;
}

type RatingStarState = "StarOutline" | "StarFilled";
const RATING_STAR_PATH = "M50 7 L62 36 L93 39 L69 59 L78 90 L50 73 L22 90 L31 59 L7 39 L38 36 Z";
const RATING_STAR_COLOR = "#ffb319";

function RatingStar({ selected }: { selected: boolean }) {
  const state: RatingStarState = selected ? "StarFilled" : "StarOutline";
  return <svg className="rating-star-svg" data-state={state} viewBox="0 0 100 100" aria-hidden="true"><path d={RATING_STAR_PATH} fill={state === "StarFilled" ? RATING_STAR_COLOR : "transparent"} stroke={RATING_STAR_COLOR} strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function CompanionFavoriteIcon({ selected }: { selected: boolean }) {
  const color = "#ff5a1f";
  return <span className="companion-action-icon" aria-hidden="true"><svg className="companion-favorite-svg" data-state={selected ? "filled" : "outline"} viewBox="0 0 100 100"><path d={RATING_STAR_PATH} fill={selected ? color : "transparent"} stroke={color} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" /></svg></span>;
}

function CompanionMessageIcon() {
  return <span className="companion-action-icon" aria-hidden="true"><svg className="companion-message-svg" viewBox="0 0 100 100"><path d="M50 10C73 10 90 25 90 47C90 68 73 83 51 83C44 83 38 82 32 80L14 88L20 69C14 62 11 54 11 46C11 25 28 10 50 10Z" fill="transparent" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="34" cy="47" r="4.6" fill="currentColor" /><circle cx="50" cy="47" r="4.6" fill="currentColor" /><circle cx="66" cy="47" r="4.6" fill="currentColor" /></svg></span>;
}

function Header({ title, subtitle, back, actions, variant = "page" }: { title: string; subtitle?: string; back?: () => void; actions?: React.ReactNode; variant?: "page" | "identity" | "centered" }) {
  if (variant === "centered") {
    return <header className="screen-header page-titlebar" aria-label={title}><div className="header-title">{back ? <IconButton label="返回" onClick={back}><CartoonIcon kind="back" /></IconButton> : null}</div><h1>{title}</h1><div className="header-actions">{actions}</div></header>;
  }
  const showIdentity = variant === "identity";
  const className = showIdentity ? "screen-header" : `screen-header page-toolbar${!back && !actions ? " page-toolbar-empty" : ""}`;
  return <header className={className} aria-label={title}><div className="header-title">{back ? <IconButton label="返回" onClick={back}><CartoonIcon kind="back" /></IconButton> : null}{showIdentity ? <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div> : null}</div><div className="header-actions">{actions}</div></header>;
}

function ChatSendIcon() {
  return <svg className="chat-send-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Avatar({ companion, size = "md", fallbackSrc }: { companion: Companion; size?: "sm" | "md" | "lg"; fallbackSrc?: string }) {
  return <span className={`avatar avatar-${size}`}><CatalogImage src={companion.image} fileId={companion.avatarFileId} fallbackSrc={fallbackSrc} kind="avatar" alt={`${companion.name}头像`} />{typeof companion.id === "string" && companion.online ? <i aria-label="在线" /> : null}</span>;
}

function BuyerNav({ page, go, unreadCount = 0 }: { page: PageId; go: (page: PageId) => void; unreadCount?: number }) {
  const items = [{ page: "home" as PageId, kind: "home", label: "首页" }, { page: "orders" as PageId, kind: "order", label: "订单" }, { page: "messages" as PageId, kind: "message", label: "消息", badge: unreadCount }, { page: "mine" as PageId, kind: "mine", label: "我的" }];
  return <nav className="bottom-nav buyer-nav" aria-label="买家端主导航">{items.map((item) => <button type="button" key={item.label} className={page === item.page || (page === "chat" && item.page === "messages") ? "active" : ""} aria-current={page === item.page ? "page" : undefined} onClick={() => go(item.page)}><AppIcon kind={item.kind} /><span>{item.label}</span>{item.badge ? <em>{item.badge}</em> : null}</button>)}</nav>;
}

function SellerNav({ page, go }: { page: PageId; go: (page: PageId) => void }) {
  const items = [{ page: "seller" as PageId, kind: "home", label: "首页" }, { page: "sellerOrders" as PageId, kind: "order", label: "订单" }, { page: "sellerMessages" as PageId, kind: "message", label: "消息" }, { page: "sellerMine" as PageId, kind: "mine", label: "我的" }];
  const active = ["sellerServices", "sellerPublish", "sellerServiceEdit"].includes(page) ? "seller" : page === "sellerEarnings" ? "sellerMine" : page;
  return <nav className="bottom-nav seller-nav" aria-label="陪玩中心导航">{items.map((item) => <button type="button" key={item.label} className={active === item.page ? "active" : ""} aria-current={active === item.page ? "page" : undefined} onClick={() => go(item.page)}><AppIcon kind={item.kind} /><span>{item.label}</span></button>)}</nav>;
}

function SectionTitle({ title, note, action, onAction, icon }: { title: string; note?: string; action?: string; onAction?: () => void; icon?: "flame" | "crown" }) {
  return <div className="section-title"><div><b>{icon ? <img className="home-heading-icon" src={`/assets/home-${icon}.svg`} alt="" aria-hidden="true" width={26} height={26} /> : null}{title}</b>{note ? <span>{note}</span> : null}</div>{action ? <button type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function PolicyChecklist({ title, scene, selectedIds, onChange, go, note }: { title: string; scene: PolicyAcceptanceScene; selectedIds: string[]; onChange: (ids: string[]) => void; go: (page: PageId) => void; note: string }) {
  const { policies, loading, error, retry } = useScenePolicies(scene);
  useEffect(() => { onChange([]); }, [scene, onChange]);
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  return <section className={`paper-panel policy-confirm-block ${error ? "load-failed" : ""}`} data-scene={scene}>
    <SectionTitle title={title} note={note} />
    {loading ? <div className="policy-loading" role="status"><i /><span><b>正在加载本地测试协议</b><small>加载完成前不能继续</small></span></div> : error ? <div className="policy-load-error" role="alert"><i>!</i><span><b>协议加载失败，当前操作已阻止</b><small>{error}</small></span><button type="button" onClick={() => void retry()}>重新加载</button></div> : <div className="policy-check-list">{policies.map((policy) => {
      const checked = selectedIds.includes(policy.id);
      return <article className={checked ? "checked" : ""} key={policy.id}><button type="button" className="policy-checkbox" role="checkbox" aria-checked={checked} aria-label={`确认${policy.title}`} onClick={() => toggle(policy.id)}><i>{checked ? "✓" : ""}</i></button><button type="button" className="policy-copy" onClick={() => go("agreementDetail")}><span><b>{policy.title}</b><small>V{policy.version_no} · 本地测试草案</small></span><em>查看全文 ›</em></button></article>;
    })}</div>}
    <p className="policy-explicit-note">不会默认勾选。勾选表示你已阅读当前版本，并同意在本地测试环境按所示场景使用。</p>
  </section>;
}

function ConfirmDialog({ title, text, confirmText = "确认", tone = "blue", onCancel, onConfirm }: { title: string; text: string; confirmText?: string; tone?: "blue" | "danger"; onCancel: () => void; onConfirm: () => void }) {
  const { closing, dismiss } = usePanelDismiss(onCancel);
  return <div className={`flow-overlay${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={title}><section className="flow-dialog"><span className={`dialog-mark ${tone}`}><CartoonIcon kind={tone === "danger" ? "shield" : "check"} /></span><h2>{title}</h2><p>{text}</p><div><button type="button" onClick={dismiss}>暂不操作</button><button type="button" className={tone === "danger" ? "danger" : ""} onClick={onConfirm}>{confirmText}</button></div></section></div>;
}

function LoadingState({ title = "正在加载", detail = "稍等一下，精彩内容马上就好", compact = false, eventKey }: { title?: string; detail?: string; compact?: boolean; eventKey?: string }) {
  return <section className={`branded-loading${compact ? " is-compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
    <div className="loading-bear-wrap"><StateBear scene="loading" size={compact ? 88 : 128} eventKey={eventKey} /></div>
    <div className="loading-copy"><b>{title}</b><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span></div>
    <p>{detail}</p>
    <div className="loading-progress" aria-hidden="true"><i /></div>
  </section>;
}

function CompanionCard({ companion, go, wide = false, homeSummary = false, actionLabel = "看主页 ›", onOpen }: { companion: Companion; go: (page: PageId) => void; wide?: boolean; homeSummary?: boolean; actionLabel?: string; onOpen?: (companion: Companion) => void }) {
  if (homeSummary) return <button type="button" className="shop-card wide home-summary-card" onClick={() => onOpen ? onOpen(companion) : go("companion")}><span className="shop-photo"><CatalogImage src={companion.image} fileId={companion.avatarFileId} kind="avatar" alt={companion.name}/></span><span className="shop-copy"><b className="home-companion-heading"><span>{companion.name}</span>{companion.reviewCount ? <RatingBadge rating={companion.rating} fiveStars/> : <small>暂无评价</small>}</b><p className="home-companion-intro">{companion.introduction?.trim() || "暂未填写介绍"}</p><strong>{companion.services} 件商品 · {companion.completed} 单</strong></span></button>;
  const games = publicGames(`${companion.tags.join(' ')} ${companion.introduction ?? ''}`);
  return <button type="button" className={`shop-card ${wide ? 'wide' : ''}${homeSummary ? ' home-summary-card' : ''}`} onClick={() => onOpen ? onOpen(companion) : go('companion')}><span className="shop-photo"><CatalogImage src={companion.image} fileId={companion.avatarFileId} kind="avatar" alt={companion.name}/></span><span className="shop-copy"><b>{companion.name}</b><p className="home-companion-intro">{companion.introduction?.trim() || '暂未填写介绍'}</p><small>{companion.reviewCount ? `${companion.rating} 分 · ${companion.reviewCount} 条评价` : '暂无评价'}</small><span>{games.map(game=><i key={game}>{game}</i>)}</span><strong>{companion.services} 件商品</strong></span>{!homeSummary && <em className="shop-arrow" aria-label={actionLabel}>›</em>}</button>;
}

function QuickMatchScreen({go,companionItems,onOpen,loading,error,retry}:{go:(page:PageId)=>void;companionItems:Companion[];onOpen:(c:Companion)=>void;loading:boolean;error:string;retry:()=>void}) {
  const [game,setGame]=useState<string>(PRODUCT_GAMES[0]);
  const rows=companionItems.filter(c=>offersCompanion(c.introduction) && publicGames(`${c.tags.join(' ')} ${c.introduction ?? ''}`).includes(game as typeof PRODUCT_GAMES[number]));
  return <div className="app-screen decision-page"><Header title="快速匹配" variant="centered" back={()=>go('home')}/><p>选择游戏，看看哪些店铺公开提供陪玩；进入店铺了解商品后再联系。</p><GameFilter value={game} onChange={setGame} all={false}/>{loading?<p role="status">正在读取店铺…</p>:error?<p role="alert">{error}<button onClick={retry}>重试</button></p>:<div className="shop-list">{rows.map(c=><CompanionCard key={c.id} companion={c} go={go} wide onOpen={onOpen}/>)}{!rows.length&&<p>暂无公开介绍中明确提供该游戏陪玩的店铺，可尝试其他游戏。</p>}</div>}</div>;
}

function ServiceCard({ service, go, compact = false, onOpen }: { service: Service; go: (page: PageId) => void; compact?: boolean; onOpen?: (service: Service) => void }) {
  const catalogSeller = companions.find((item) => item.id === service.sellerId); const sellerName = service.sellerName ?? catalogSeller?.name ?? "陪玩"; const sellerImage = service.sellerImage ?? catalogSeller?.image ?? "/assets/player-kirito.png";
  return <button type="button" className={`product-card ${compact ? "compact" : ""}`} onClick={() => onOpen ? onOpen(service) : go("service")}><span className="product-cover"><CatalogImage src={service.cover} fileId={service.coverFileId} alt={service.title} /><i>{service.tags[0]}</i></span><span className="product-copy"><b>{service.title}</b><small>{service.subtitle}</small><span>{service.tags.map((tag) => <i key={tag}>{tag}</i>)}</span><em><strong>¥{formatCent(service.priceCent)}<small>起</small></strong><span>已售 {service.sold}</span></em><span className="product-seller"><CatalogImage src={sellerImage} fileId={service.sellerAvatarFileId} kind="avatar" alt="" /><b>{sellerName}</b><i>{service.reviewCount ? `★ ${service.rating}` : "暂无评价"}</i></span></span></button>;
}

function SortBar({ options, active, direction, onSelect }: { options: string[]; active: string; direction: "asc" | "desc"; onSelect: (item: string) => void }) {
  return <div className="service-sort sort-bar" aria-label="排序方式">{options.map((item) => <button type="button" className={active === item ? "active" : ""} onClick={() => onSelect(item)} key={item}>{item}{active === item && item !== "综合" ? <i>{direction === "desc" ? "↓" : "↑"}</i> : null}</button>)}</div>;
}

function SplashScreen({ go }: { go: (page: PageId) => void }) {
  return <div className="app-screen splash-screen"><div className="splash-orbit"><i /><i /><i /></div><div className="splash-brand"><img src="/assets/xiongzai-logo.png" alt="熊崽电竞" /><span>让每一位玩家享受游戏的乐趣</span></div><div className="splash-showcase"><article><span className="splash-person-icon"><img src="/assets/ui-person-outline.jpg" alt="真人陪玩" /></span><span><b>真人陪玩</b><small>公开主页 · 声音名片</small></span></article><article><AppIcon kind="shield" /><span><b>平台保障</b><small>支付、退款与售后</small></span></article><article><AppIcon kind="service" /><span><b>自选服务</b><small>按规格和时间下单</small></span></article></div><button type="button" className="splash-enter" onClick={() => go("auth")}>开始使用</button><p className="splash-foot">找陪玩 · 选服务 · 安心下单</p></div>;
}

function AuthScreen({ go, notify, onAuthenticated }: { go: (page: PageId) => void; notify: (message: string) => void; onAuthenticated: (viewer: Viewer) => void }) {
  const [mode, setMode] = useState<"登录" | "注册">("登录"); const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [acceptedPolicyIds, setAcceptedPolicyIds] = useState<string[]>([]); const [countdown, setCountdown] = useState(0); const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false); const { policies, loading: policyLoading, error: policyError, retry: retryPolicies } = useScenePolicies("LOGIN");
  useEffect(() => { if (countdown <= 0) return; const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000); return () => window.clearTimeout(timer); }, [countdown]);
  const validPhone = /^1\d{10}$/.test(phone);
  const requestCode = async () => { if (!validPhone) { setError("请输入正确的 11 位手机号码"); return; } setError(""); try { const result = await apiRequest<{ retry_after_seconds: number }>("/auth/sms/send", { method: "POST", body: JSON.stringify({ phone }) }); setCountdown(result.retry_after_seconds); notify("验证码已发送"); } catch (cause) { setError(apiMessage(cause)); } };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!validPhone) { setError("请输入正确的 11 位手机号码"); return; } if (!/^\d{6}$/.test(code)) { setError("请输入正确的 6 位短信验证码"); return; } if (!policies.length || policies.some((policy) => !acceptedPolicyIds.includes(policy.id))) { setError("请逐份阅读并确认当前登录场景要求的协议"); return; } setError(""); setSubmitting(true); try { const result = await apiRequest<{ user: Viewer }>("/auth/sms/login", { method: "POST", body: JSON.stringify({ phone, code, device_id: deviceId(), device_type: "WEB", policy_version_ids: acceptedPolicyIds }) }); onAuthenticated(result.user); go(result.user.profile_initialized ? "home" : "profileSetup"); } catch (cause) { setError(apiMessage(cause)); } finally { setSubmitting(false); } };
  return <div className="app-screen auth-screen"><Header title="欢迎来到熊崽电竞" subtitle="手机号验证码登录更安全" back={() => go("splash")} /><div className="auth-logo"><img src="/assets/xiongzai-icon.png" alt="熊崽电竞" /><b>和靠谱的队友，一起玩</b></div><div className="auth-tabs"><button type="button" className={mode === "登录" ? "active" : ""} onClick={() => setMode("登录")}>登录</button><button type="button" className={mode === "注册" ? "active" : ""} onClick={() => setMode("注册")}>注册</button></div><form className="auth-form" onSubmit={submit}><label><span>手机号码</span><div className={error.includes("手机") ? "invalid" : ""}><b>+86</b><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="tel" placeholder="请输入手机号码" aria-label="手机号码" /></div></label><label><span>短信验证码</span><div className={error.includes("验证码") ? "invalid" : ""}><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="请输入 6 位验证码" aria-label="短信验证码" /><button type="button" disabled={countdown > 0 || submitting} onClick={() => void requestCode()}>{countdown > 0 ? `${countdown}s 后重发` : "获取验证码"}</button></div></label>{error ? <p className="form-error" role="alert">{error}</p> : null}{policyError ? <div className="auth-policy-error" role="alert"><b>协议加载失败，暂时无法登录或注册</b><span>{policyError}</span><button type="button" onClick={() => void retryPolicies()}>重新加载协议</button></div> : null}<button type="submit" className="auth-submit" disabled={submitting || policyLoading || Boolean(policyError) || !policies.length}>{submitting ? "正在安全登录…" : policyLoading ? "正在加载协议…" : mode === "登录" ? "登录熊崽电竞" : "注册并继续"}</button><div className="agreement-check"><span>请逐份阅读并在线确认当前版本（默认不勾选）：</span>{policies.map((policy) => { const checked = acceptedPolicyIds.includes(policy.id); return <label key={policy.id}><input type="checkbox" checked={checked} onChange={() => setAcceptedPolicyIds((current) => checked ? current.filter((id) => id !== policy.id) : [...current, policy.id])} /><button type="button" onClick={() => go("agreementDetail")}>《{policy.title}》V{policy.version_no}</button></label>; })}</div></form><button type="button" className="guest-enter" onClick={() => go("home")}>先逛逛，稍后登录</button></div>;
}

function ProfileSetupScreen({ go, notify, viewer, onUpdated }: { go: (page: PageId) => void; notify: (message: string) => void; viewer: Viewer | null; onUpdated: (viewer: Viewer) => void }) {
  const [nickname, setNickname] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => { if (!viewer || nickname.trim().length < 2) { notify(viewer ? "昵称至少需要 2 个字符" : "请先完成登录"); return; } setSaving(true); try { const updated = await apiRequest<Viewer>("/me/profile", { method: "PATCH", body: JSON.stringify({ nickname: nickname.trim(), version: viewer.profile?.version ?? 0, user_version: viewer.version }) }); onUpdated(updated); notify("个人资料已保存"); go("home"); } catch (cause) { notify(apiMessage(cause)); } finally { setSaving(false); } };
  return <div className="app-screen profile-setup-screen"><Header title="完善个人资料" subtitle="只需两步，开启游戏服务交易" back={() => go("auth")} /><div className="setup-progress"><i className="active" /><i /></div><section className="setup-avatar"><button type="button" onClick={() => notify("选择头像图片")}><img src="/assets/xiongzai-icon.png" alt="熊崽默认头像" /><em>更换头像</em></button><p>头像会展示在订单和聊天中，也可以立即更换</p></section><section className="form-panel setup-form"><label><span>昵称</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} placeholder="请输入昵称" /></label><small>{nickname.length}/16 · 请勿填写手机号或联系方式</small></section><section className="paper-panel setup-notice"><AppIcon kind="shield" /><span><b>隐私保护</b><small>手机号仅用于登录与交易安全，不会展示给其他用户。</small></span></section><button type="button" className="full-primary" disabled={saving} onClick={() => void save()}>{saving ? "正在保存…" : "完成，进入首页"}</button></div>;
}

const SEARCH_KEYWORD_DICTIONARY = [
  "和平精英", "经典四排", "经典模式", "地铁逃生", "排位上分", "技术上分", "娱乐陪玩", "地铁护航",
  "稳定沟通", "耐心教学", "单排", "双排", "四排", "上分", "带飞", "护航", "开黑", "陪练", "教学",
  "报点", "沟通", "娱乐", "声音", "萝莉音", "御姐音", "青受音"
];
const SEARCH_KEYWORD_STOPWORDS = new Set(["平台保障", "平台认证", "职业认证", "已认证", "已上架", "推荐服务", "热门服务", "审核通过"]);

function shortSearchKeywords(values: string[]) {
  const keywords: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    const compact = candidate.normalize("NFKC").replace(/\s+/g, "").replace(/^[，。！？、｜|·:：;；“”"'《》【】()[\]{}_-]+|[，。！？、｜|·:：;；“”"'《》【】()[\]{}_-]+$/g, "");
    const length = Array.from(compact).length;
    if (length < 2 || length > 4 || !/^[\u3400-\u9fff]+$/.test(compact) || SEARCH_KEYWORD_STOPWORDS.has(compact) || seen.has(compact)) return;
    if (keywords.some((item) => item.includes(compact))) return;
    for (let index = keywords.length - 1; index >= 0; index -= 1) {
      if (!compact.includes(keywords[index]!)) continue;
      seen.delete(keywords[index]!);
      keywords.splice(index, 1);
    }
    seen.add(compact);
    keywords.push(compact);
  };

  for (const value of values) {
    if (!value) continue;
    add(value);
    const compact = value.normalize("NFKC").replace(/\s+/g, "");
    for (const term of SEARCH_KEYWORD_DICTIONARY) if (compact.includes(term)) add(term);
  }
  return keywords.slice(0, 6);
}

function SearchScreen({ go, onSearch, companionItems, serviceItems }: { go: (page: PageId) => void; onSearch: (scope: "陪玩" | "服务", query: string) => void; companionItems: Companion[]; serviceItems: Service[] }) {
  const [query, setQuery] = useState(""); const [scope, setScope] = useState<"陪玩" | "服务">("陪玩"); const [scopeOpen, setScopeOpen] = useState(false);
  const hot = shortSearchKeywords(scope === "陪玩" ? companionItems.flatMap((item) => [item.name, ...item.tags]) : serviceItems.flatMap((item) => [...item.tags, item.title, item.subtitle]));
  const submit = (event: FormEvent) => { event.preventDefault(); const keyword = query.trim(); if (keyword) onSearch(scope, keyword); };
  return <div className="app-screen search-screen"><Header title="搜索" subtitle="先选择陪玩或服务，再输入关键词" back={() => go("home")} /><form className="search-input-row" onSubmit={submit}><div className={`search-scope-select ${scopeOpen ? "open" : ""}`}><button type="button" className="search-scope-current" aria-haspopup="listbox" aria-expanded={scopeOpen} onClick={() => setScopeOpen(!scopeOpen)}>{scope === "陪玩" ? "店铺" : "商品"}<i /></button>{scopeOpen ? <div className="search-scope-menu" role="listbox">{(["陪玩", "服务"] as const).map((item) => <button type="button" className={scope === item ? "active" : ""} onClick={() => { setScope(item); setScopeOpen(false); }} key={item}>{item === "陪玩" ? "店铺" : "商品"}<i>{scope === item ? "✓" : ""}</i></button>)}</div> : null}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={scope === "陪玩" ? "搜索店铺名称或ID" : "搜索商品名称或关键词"} aria-label={`搜索${scope}关键词`} /><button type="submit" disabled={!query.trim()}>搜索</button></form><section className="paper-panel hot-search"><SectionTitle title="当前可搜索关键词" /><div>{hot.map((item, index) => <button type="button" key={item} onClick={() => onSearch(scope, item)}><i>{index + 1}</i>{item}</button>)}</div>{hot.length === 0 ? <p>暂无合适的短关键词，可直接输入搜索</p> : null}</section><section className="home-section search-recommend"><SectionTitle title="高评价内容" note={scope === "陪玩" ? "已通过审核的店铺" : "已上架的商品"} />{scope === "陪玩" ? <div className="shop-list">{companionItems.slice(0, 2).map((item) => <CompanionCard key={item.id} companion={item} go={go} wide />)}</div> : <div className="product-grid">{serviceItems.slice(0, 2).map((item) => <ServiceCard key={item.id} service={item} go={go} />)}</div>}</section></div>;
}

function SearchResultsScreen({ go, scope, query, companionItems, serviceItems, onCompanionOpen, onServiceOpen, loading = false, error = "", onRetry }: { go: (page: PageId) => void; scope: "陪玩" | "服务"; query: string; companionItems: Companion[]; serviceItems: Service[]; onCompanionOpen: (item: Companion) => void; onServiceOpen: (item: Service) => void; loading?: boolean; error?: string; onRetry?: () => void }) {
  const [sort, setSort] = useState("综合"); const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const choose = (item: string) => { if (item === sort && item !== "综合") setDirection(direction === "desc" ? "asc" : "desc"); else { setSort(item); setDirection(item === "价格" ? "asc" : "desc"); } };
  const normalized = query.toLocaleLowerCase("zh-CN"); const matchingCompanions = companionItems.filter((item) => [item.name, item.rank, ...item.tags].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized))); const matchingServices = serviceItems.filter((item) => [item.title, item.subtitle, ...item.tags].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized))); const count = scope === "陪玩" ? matchingCompanions.length : matchingServices.length;
  return <div className="app-screen search-results-screen"><Header title={`${scope === "陪玩" ? "店铺" : "商品"}搜索结果`} subtitle={`“${query}” 的相关${scope}`} back={() => go("search")} /><button type="button" className="result-search" onClick={() => go("search")}><i>⌕</i><span>{query}</span><em>修改</em></button><div className="result-scope-label"><b>{scope === "陪玩" ? "店铺" : "商品"}</b><span>共找到 {count} {scope === "陪玩" ? "家店铺" : "件商品"}</span></div><SortBar options={scope === "陪玩" ? ["综合", "好评", "销量"] : ["综合", "销量", "价格"]} active={sort} direction={direction} onSelect={choose} /><section className="search-result-content">{scope === "陪玩" ? <div className="shop-list">{matchingCompanions.map((item) => <CompanionCard key={item.id} companion={item} go={go} wide onOpen={onCompanionOpen} />)}</div> : <div className="product-grid">{matchingServices.map((item) => <ServiceCard key={item.id} service={item} go={go} onOpen={onServiceOpen} />)}</div>}{error ? <section className="paper-panel live-data-state"><RequestErrorBear message={error} hasContent={count > 0} /><b>搜索结果加载失败</b><p>{error}</p>{onRetry ? <button type="button" onClick={onRetry}>重新加载</button> : null}</section> : loading ? <LoadingState title={`正在搜索${scope}`} detail={`正在为你匹配“${query}”相关内容`} compact /> : count === 0 ? <ContextStateScreen go={go} kind="search" embedded /> : null}</section></div>;
}

const homeAnnouncements = [
  { id: "reportTrade" as const, src: "/assets/announcements/report-off-platform.png", alt: "举报脱离平台交易，核实奖励当月平台流水百分之二十" },
  { id: "antiFraud" as const, src: "/assets/announcements/anti-fraud.png", alt: "熊崽电竞防诈骗，只认平台订单，拒绝私下转账" },
] as const;

const homeShortcuts: Array<{ label: string; icon: string; image?: string } & ({ page: PageId; message?: never } | { message: string; page?: never })> = [
  { label: "快速匹配", icon: "quick-match", page: "quickMatch" },
  { label: "领券中心", icon: "coupon-center", page: "coupons" },
  { label: "平台规则", icon: "app-rules", page: "rules" },
  { label: "意见反馈", icon: "feedback", page: "feedback" },
  { label: "官方通知", icon: "official-notices", page: "notifications" },
];

function HomeShortcuts({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <nav className="home-shortcuts" aria-label="首页快捷功能">
    {homeShortcuts.map((item) => <button type="button" className="home-shortcut" key={item.icon} onClick={() => item.page ? go(item.page) : notify(item.message)}>
      <img src={item.image ?? `/assets/home-shortcuts/${item.icon}.png`} width={256} height={256} alt="" draggable={false} />
      <span>{item.label}</span>
    </button>)}
  </nav>;
}

// Preview assets are only presented on this local development host, never as real accounts.
const subscribeLocalPreview = () => () => {};
const getLocalPreview = () => ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const getServerPreview = () => false;
const homeCompanionPreviews: Companion[] = previewCompanions;

function HomeCompanionPreviews({ go, onOpen }: { go: (page: PageId) => void; onOpen?: (item: Companion) => void }) {
  return <div className="shop-list home-companion-list" aria-label="陪玩卡片展示列表">
    {homeCompanionPreviews.map((companion) => <CompanionCard key={companion.id} companion={companion} go={go} wide homeSummary onOpen={onOpen} />)}
  </div>;
}

const homeHotSalePreviews = previewHotServices;

function HomeHotSale({ localPreview, services, onOpen, onMore }: { localPreview: boolean; services: Service[]; onOpen?: (item: Service) => void; onMore: () => void; notify: (message: string) => void }) {
  if (!localPreview && services.length === 0) return null;
  return <section className="home-hot-sale" aria-label="熊崽热卖">
    <SectionTitle icon="flame" title="熊崽热卖" action="更多 ›" onAction={onMore} />
    <div className="home-hot-sale-grid">
      {localPreview ? homeHotSalePreviews.map((item) => <button type="button" className="home-hot-sale-item" key={item.cover} aria-label={`${item.title}，展示样例，¥${formatCent(item.priceCent)}`} onClick={() => onOpen?.(item)}>
        <img src={item.cover} width={1200} height={1200} alt={item.title} decoding="async" />
        <strong><small>¥</small>{formatCent(item.priceCent)}</strong>
      </button>) : services.slice(0, 4).map((item) => <button type="button" className="home-hot-sale-item" key={item.id} aria-label={`${item.title}，¥${formatCent(item.priceCent)}`} onClick={() => onOpen?.(item)}>
        <CatalogImage src={item.cover} fileId={item.coverFileId} alt={item.title} kind="service" />
        <strong><small>¥</small>{formatCent(item.priceCent)}</strong>
      </button>)}
    </div>
  </section>;
}

function HomeScreen({ go, notify, active = true, onAnnouncementOpen, unreadCount = 0, companionItems = [], serviceItems = [], onCompanionOpen, onServiceOpen, loading = false, error = "", onRetry }: { active?: boolean; onAnnouncementOpen: (kind: AnnouncementKind) => void; go: (page: PageId) => void; notify: (message: string) => void; unreadCount?: number; companionItems?: Companion[]; serviceItems?: Service[]; onCompanionOpen?: (item: Companion) => void; onServiceOpen?: (item: Service) => void; loading?: boolean; error?: string; onRetry?: () => void }) {
  const [game, setGame] = useState("全部");
  const [mode, setMode] = useState<"推荐" | "店铺" | "商品">("推荐"); const [companionSort, setCompanionSort] = useState("综合"); const [serviceSort, setServiceSort] = useState("综合"); const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const localPreview = useSyncExternalStore(subscribeLocalPreview, getLocalPreview, getServerPreview);
  const showAvatarPreview = localPreview && mode === "推荐";
  if (localPreview) { companionItems = previewCompanions; serviceItems = previewServices; }
  const homeRef = useRef<HTMLDivElement>(null);
  useHomeModeMotion(homeRef, mode);
  const chooseSort = (item: string, current: string, setCurrent: (value: string) => void) => { if (item === current && item !== "综合") setDirection(direction === "desc" ? "asc" : "desc"); else { setCurrent(item); setDirection(item === "价格" ? "asc" : "desc"); } };
  const sortedCompanions = [...companionItems].sort((a, b) => companionSort === "好评" ? (Number(a.rating) - Number(b.rating)) * (direction === "desc" ? -1 : 1) : companionSort === "销量" ? (a.completed - b.completed) * (direction === "desc" ? -1 : 1) : 0);
  const sortedServices = serviceItems.filter(item => game === "全部" || publicGames(item.gameCategory || item.title).includes(game as typeof PRODUCT_GAMES[number])).sort((a, b) => serviceSort === "销量" ? (a.sold - b.sold) * (direction === "desc" ? -1 : 1) : serviceSort === "价格" ? compareCent(a.priceCent, b.priceCent) * (direction === "desc" ? -1 : 1) : 0);
  return <div ref={homeRef} className="app-screen home-screen" aria-busy={loading}><StatusBar /><div className="home-command-bar">
    <button type="button" className="home-search-field" aria-label="搜索店铺/商品" onClick={() => go("search")}>
      <CartoonIcon kind="search" />
      <span>搜索店铺/商品</span><strong>搜索</strong>
    </button>
    <nav className="home-mode-tabs" aria-label="首页浏览模式">{(["推荐", "店铺", "商品"] as const).map((item) => <button type="button" className={mode === item ? "active" : ""} aria-current={mode === item ? "page" : undefined} onClick={() => setMode(item)} key={item}>{item}</button>)}</nav>
  </div>
    {mode === "推荐" ? <HomeAnnouncementCarousel items={homeAnnouncements} active={active && mode === "推荐"} onOpen={onAnnouncementOpen} /> : null}
    {mode === "推荐" ? <HomeShortcuts go={go} notify={notify} /> : null}
    {mode === "推荐" ? <HomeHotSale localPreview={localPreview} services={serviceItems} onOpen={onServiceOpen} onMore={() => setMode("商品")} notify={notify} /> : null}
    {!localPreview && loading && companionItems.length + serviceItems.length === 0 ? <LoadingState title="正在加载商品与店铺" detail="商品与店铺资料正在加载" /> : null}{!localPreview && error ? <section className="paper-panel live-data-state failed"><RequestErrorBear message={error} hasContent={companionItems.length + serviceItems.length > 0} /><b>加载失败</b><p>{error}</p><button type="button" disabled={loading} onClick={onRetry}>重试</button></section> : null}
    {!localPreview && loading && companionItems.length + serviceItems.length > 0 ? <p className="catalog-refresh-status" role="status">正在更新，已保留当前内容…</p> : null}
    {!localPreview && !loading && !error && (mode === "商品" ? serviceItems.length === 0 : companionItems.length === 0) ? <ContextStateScreen go={go} kind="search" embedded /> : null}
    {mode === "推荐" && (showAvatarPreview || companionItems.length > 0) ? <section className="home-section home-companion-section">
      <SectionTitle icon="crown" title="热门店铺" note={showAvatarPreview ? undefined : "发现合拍的游戏伙伴"} action="更多 ›" onAction={() => setMode("店铺")} />
      {<div className="shop-list home-companion-list">{companionItems.map((item) => <CompanionCard key={item.id} companion={item} go={go} wide homeSummary onOpen={onCompanionOpen} />)}</div>}
      <p className="home-companion-end">{showAvatarPreview ? "已展示全部 6 家样例店铺" : "已展示全部店铺"}</p>
    </section> : null}
    {mode === "店铺" ? <><SortBar options={["综合", "好评", "销量"]} active={companionSort} direction={direction} onSelect={(item) => chooseSort(item, companionSort, setCompanionSort)} /><section className="home-section listing-section"><SectionTitle title="全部店铺" note={localPreview ? `${companionItems.length} 家店铺` : `${companionItems.filter((item) => item.online).length} 家接待中`} /><div className="shop-list home-companion-list">{sortedCompanions.map((item) => <CompanionCard key={item.id} companion={item} go={go} wide homeSummary onOpen={onCompanionOpen} />)}</div></section></> : null}
    {mode === "商品" ? <><GameFilter value={game} onChange={setGame}/><SortBar options={["综合", "销量", "价格"]} active={serviceSort} direction={direction} onSelect={(item) => chooseSort(item, serviceSort, setServiceSort)} /><section className="home-section listing-section"><SectionTitle title="全部商品" note="查看商品内容、规格和价格" /><div className="product-grid">{sortedServices.map((item) => <ServiceCard key={item.id} service={item} go={go} onOpen={onServiceOpen} />)}</div></section></> : null}
    <BuyerNav page="home" go={go} unreadCount={unreadCount} />
  </div>;
}

function AnnouncementDetailScreen({ go, kind, backPage = "notifications" }: { backPage?: PageId; go: (page: PageId) => void; kind: AnnouncementKind }) {
  const report = kind === "reportTrade";
  return <div className={`app-screen announcement-detail-screen ${report ? "report-announcement" : "anti-fraud-announcement"}`}><StatusBar /><Header title="公告详情" subtitle="熊崽电竞平台公告 · 本地测试草案" back={() => go(backPage)} /><article className="announcement-article">
    <section className="announcement-detail-hero"><img src={report ? "/assets/announcements/report-detail-hero.png" : "/assets/announcements/anti-fraud-detail-hero.png"} alt={report ? "熊崽阻止脱离平台交易" : "熊崽识别诈骗消息"} /><div><span>{report ? "交易安全" : "防诈骗提醒"}</span><h1>{report ? <>拒绝私下交易<br />举报核实有奖励</> : <>只认平台订单<br />拒绝私下转账</>}</h1><p>{report ? "保护每一笔订单，让服务和权益都有记录" : "不泄露验证码，不点击陌生链接"}</p></div></section>
    <div className="announcement-meta"><span>{report ? "熊崽电竞交易安全中心" : "熊崽电竞安全中心"}</span><time>2026-09-04</time></div>
    {report ? <section className="announcement-copy-card"><p className="announcement-lead">在平台认识、下单或沟通后，若陪玩以“价格更低”“转账更方便”等理由，引导您通过平台外方式付款，请不要转账，并保存相关证据。</p><h2>举报奖励规则</h2><div className="announcement-reward"><b>核实后奖励 <strong>20%</strong></b><p>按被举报陪玩当月平台已结算服务流水的 20% 计算，由平台审核后统一发放。</p></div><h2>请保留这些信息</h2><ol className="announcement-steps"><li><i>1</i><span>完整聊天记录和对方引导私下交易的内容</span></li><li><i>2</i><span>相关订单编号、对方昵称或平台账号</span></li><li><i>3</i><span>收款码、转账要求等有效凭证，请先遮挡隐私</span></li></ol><aside className="announcement-warning">同一违规行为仅奖励首位有效举报人；重复、恶意或伪造举报不予奖励。最终认定与发放结果以平台审核为准。</aside></section> : <section className="announcement-copy-card"><p className="announcement-lead">所有陪玩服务必须通过熊崽电竞平台下单和支付。脱离平台付款后，平台无法核验交易，也无法提供订单、退款和售后保障。</p><h2>请牢记四个“不要”</h2><div className="announcement-security-grid"><div><b>不要私下转账</b><span>拒绝红包、收款码或其他平台外付款。</span></div><div><b>不要透露验证码</b><span>平台客服不会索要密码或短信验证码。</span></div><div><b>不要点陌生链接</b><span>不要下载陌生 App，也不要共享屏幕。</span></div><div><b>不要代充或解封</b><span>任何“低价充值、账号解封”都需警惕。</span></div></div><h2>遇到异常这样处理</h2><ol className="announcement-steps"><li><i>1</i><span>立即停止付款和继续沟通</span></li><li><i>2</i><span>保存聊天、账号、订单和支付凭证</span></li><li><i>3</i><span>通过平台客服提交举报和处理申请</span></li></ol><aside className="announcement-emergency">如已发生资金损失，请立即联系支付平台止付，并视情况拨打 110 报警。</aside></section>}
    <footer className="announcement-draft-note">本公告为本地测试草案，正式上线内容以平台最终发布版本为准。</footer>
  </article></div>;
}


function ProductReviewPreview({id,onAll}:{id?:string;onAll:()=>void}) {
 const [rows,setRows]=useState<ReviewApiView[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!id)return;const c=new AbortController();void apiRequest<CursorResponse<ReviewApiView>>(`/products/${id}/reviews?limit=2`,{signal:c.signal}).then(r=>setRows(r.items)).catch(e=>{if(!c.signal.aborted)setError(apiMessage(e))}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[id,retry]);
 return <section className="paper-panel service-review"><SectionTitle title="商品评价" action="查看全部 ›" onAction={onAll}/>{loading?<p>正在读取评价…</p>:error?<p role="alert">{error}<button onClick={()=>{setLoading(true);setError('');setRetry(n=>n+1)}}>重试</button></p>:rows.length?rows.map(r=><article key={r.id}><b>{r.display_nickname} · {r.rating} 分</b><p>{r.content||'未填写文字评价'}</p></article>):<p>暂无评价</p>}</section>;
}

function ServiceScreen({ go, notify, selected, setSelected, serviceItems = [], companionItems = [], selectedServiceId, onDetail, quantity, setQuantity }: { go: (page: PageId) => void; notify: (message: string) => void; selected: number; setSelected: (value: number) => void; serviceItems?: Service[]; companionItems?: Companion[]; selectedServiceId?: string | number; onDetail?: (detail: ProductApiView | null) => void; quantity:number; setQuantity:(n:number)=>void }) {
  const screen = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [favorite, setFavorite] = useState(false); const [apiDetail, setApiDetail] = useState<ProductApiView | null>(null); const service = serviceItems.find((item) => item.id === selectedServiceId) ?? serviceItems[0]; const seller = apiDetail?.seller ? companionFromApi(apiDetail.seller) : service ? companionItems.find((item) => item.id === service.sellerId) : undefined;
  const serviceId = typeof service?.id === "string" ? service.id : null;
  useEffect(() => { if (service && typeof service.id === "string") void apiRequest<ProductApiView>(`/services/${service.id}`).then((detail) => { setApiDetail(detail); onDetail?.(detail); }).catch(() => { setApiDetail(null); onDetail?.(null); }); else onDetail?.(null); }, [service, onDetail]);
  useEffect(() => {
    let active = true;
    if (!serviceId) return () => { active = false; };
    void apiRequest<{ favorited: boolean }>(`/favorites/PRODUCT/${serviceId}`).then((result) => {
      if (active) setFavorite(result.favorited);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [serviceId]);
  if (!service || !seller) return <ContextStateScreen go={go} kind="search" />;
  const apiSpecs = apiDetail?.skus?.filter((item) => item.status === "ACTIVE").map((item, index) => ({ id: item.id, name: item.sku_name, priceCent: item.price_cent, sold: 0, tone: ["orange", "lime", "violet"][index % 3] }));
  const specs = apiSpecs?.length ? apiSpecs : [{ name: "经典模式单排一局", priceCent: service.priceCent, sold: service.sold, tone: "orange" }, { name: "经典模式双排一局", priceCent: service.priceCent, sold: 0, tone: "lime" }, { name: "经典模式三排一局", priceCent: service.priceCent, sold: 0, tone: "violet" }];
  const toggleFavorite = async () => { if (!serviceId) { setFavorite(!favorite); return; } try { const result = await apiRequest<{ favorited: boolean }>(`/favorites/PRODUCT/${serviceId}`, { method: favorite ? "DELETE" : "PUT" }); setFavorite(result.favorited); notify(result.favorited ? "已收藏服务" : "已取消收藏服务"); } catch (cause) { if (cause instanceof ApiClientError && cause.status === 401) { notify("请先登录后收藏服务"); go("auth"); return; } notify(apiMessage(cause)); } };
  return <div ref={screen} className="app-screen service-screen product-page">
    <div className="product-hero"><CatalogImage className="service-main-image" src={service.cover} fileId={service.coverFileId} alt={service.title} /><ProductBackButton onBack={() => go("home")} /></div><section className="service-title-card"><div><span>{service.tags.map((tag) => <i key={tag}>{tag}</i>)}</span><h2>{service.title}</h2><p>{service.subtitle}</p></div><strong>¥{formatCent(service.priceCent)}<small>起</small></strong><em>已售 {service.sold} · {apiDetail?.review_count ? `★ ${service.rating}` : "暂无评价"}</em></section>
    <button type="button" className="service-store-card" onClick={() => go("companion")}><Avatar companion={{ ...seller, online: false }} size="md" /><span><b>{seller.name} 的店铺主页</b><small>{seller.rank} · {seller.reviewCount ? `★ ${seller.rating}` : "暂无评价"} · {seller.online ? "接待中" : "暂停接待"}</small><em>{seller.tags.join(" · ")}</em></span><strong>进主页 ›</strong></button>
    <ProductDescription description={apiDetail?.description || service.subtitle} gameCategory={service.title.includes("三角洲行动") ? "三角洲行动" : /和平精英|地铁逃生/.test(service.title) ? "和平精英" : "待补充"} />
    <ProductReviewPreview id={apiDetail?.id} onAll={()=>go("allReviews")}/>
    <ProductActions favorite={favorite} onStore={() => go("companion")} onFavorite={() => void toggleFavorite()} onContact={() => { if (apiDetail) go("chat"); else notify("商品资料加载中，请稍后重试"); }} onBuy={() => setSheetOpen(true)} unavailable={!apiSpecs?.length} />
    {sheetOpen && apiSpecs?.length ? <PurchaseSpecSheet anchor={screen} title={service.title} cover={service.cover} seller={seller.name} specs={apiSpecs} quantity={quantity} onQuantity={setQuantity} selected={Math.min(selected, apiSpecs.length - 1)} onSelect={setSelected} onClose={() => setSheetOpen(false)} onConfirm={() => { setSheetOpen(false); go("checkout"); }} /> : null}
  </div>;
}

function SpecsScreen({ go, selected, setSelected, product }: { go: (page: PageId) => void; selected: number; setSelected: (value: number) => void; product: ProductApiView | null }) {
  const apiSpecs = product?.skus?.filter((item) => item.status === "ACTIVE") ?? [];
  const specs = apiSpecs.map((item) => ({ id: item.id, name: item.sku_name, priceCent: item.price_cent, duration: item.duration_minutes }));
  const current = specs[Math.min(selected, specs.length - 1)];
  if (!product || !current) return <ContextStateScreen go={go} kind="search" />;
  return <div className="app-screen specs-screen"><Header title="选择服务规格" subtitle="确认本次购买的服务内容" back={() => go("service")} /><section className="spec-service-brief"><CatalogImage src="/assets/product-hero.png" alt={product.title} /><span><b className="spec-brief-title">{product.title}</b><small><strong>{product.seller?.seller_nickname ?? "已认证陪玩"}</strong><em>★ {product.seller?.rating_avg ?? "0.00"} · 平台保障交易</em></small></span></section><section className="paper-panel spec-full-list"><SectionTitle title="可选规格" note="价格由陪玩自主设置" />{specs.map((spec, index) => <button type="button" className={`spec-full ticket-${["orange", "lime", "violet"][index % 3]} ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)} key={`${spec.id}-${spec.name}`}><span><b>{spec.name}</b><small>约 {spec.duration} 分钟</small></span><strong>¥{formatCent(spec.priceCent)}</strong><i>{selected === index ? "✓" : ""}</i></button>)}</section><section className="paper-panel spec-help"><AppIcon kind="shield" /><span><b>平台交易保障</b><small>下单后由陪玩接单；未履约可按规则申请退款或平台介入。</small></span></section><div className="checkout-bar"><span>已选 <b>¥{formatCent(current.priceCent)}</b></span><button type="button" onClick={() => go("checkout")}>确认规格</button></div></div>;
}

function CheckoutScreen({ go, selected, product, quantity = 1 }: { go: (page: PageId) => void; selected: number; selectedTime: BookingSelection | null; product: ProductApiView | null; onOrderCreated: (order: OrderApiView) => void; notify: (message: string) => void; quantity?:number }) {
 const specs=product?.skus?.filter(s=>s.status==='ACTIVE')??[],sku=specs[selected]??specs[0];
 if(!product||!sku)return <ContextStateScreen go={go} kind="search"/>;
 return <div className="app-screen decision-page"><Header title="确认订单" variant="centered" back={()=>go('service')}/><h2>{product.title}</h2><p>{product.seller?.seller_nickname} · {sku.sku_name} × {quantity}</p><p>商品金额 ¥{formatCent(String(Number(sku.price_cent)*quantity))}</p><p>{product.service_time_description || '完成时限尚未由接口返回，请先联系卖家核实。'}</p><OrderCouponPicker /><p>具体需求通过聊天与卖家沟通。</p><button className="decision-row" onClick={()=>go('chat')}>联系卖家 ›</button><p className="decision-info" role="status">当前正式下单接口仍要求旧预约字段，新版无预约下单尚未接通。页面不会伪造预约时间或创建假订单。</p><button className="full-primary" disabled>暂无法提交订单</button></div>;
}

function AgreementDetailScreen({ go }: { go: (page: PageId) => void }) {
  const [tab, setTab] = useState<"用户协议" | "隐私政策" | "交易规则">("用户协议");
  const [policies, setPolicies] = useState<PolicyView[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setPolicies(await apiRequest<PolicyView[]>("/policies/current")); } catch (cause) { setPolicies([]); setError(apiMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const copy = {
    用户协议: ["账号与使用", "用户应使用本人手机号注册并妥善保管账号。平台提供陪玩服务信息展示、订单、支付保障、聊天与售后能力。", "用户不得发布违法违规内容、诱导线下交易、冒用他人身份或破坏平台正常交易秩序。"],
    隐私政策: ["个人信息保护", "手机号用于登录与交易安全；实名认证、收款账户和订单资料仅在必要范围内处理，不在公开主页展示。", "头像、昵称、聊天、评价及上传材料将用于业务服务、内容安全审核和争议处理。"],
    交易规则: ["平台内交易", "买家选择服务规格与预约时间后付款，陪玩接单并在约定时间开始服务。服务完成后由买家确认，平台再进行结算。", "退款与投诉以订单状态、平台聊天和双方材料为依据；严禁绕过平台付款或交换联系方式。"],
  } as const;
  const typeByTab = { 用户协议: "USER_SERVICE_AGREEMENT", 隐私政策: "PRIVACY_POLICY", 交易规则: "ORDER_PAYMENT_REFUND_RULES" } as const;
  const current = policies.find((item) => item.policy_type === typeByTab[tab]);
  return <div className="app-screen agreement-screen"><Header title={tab} subtitle="熊崽电竞本地测试协议草案" back={() => go("policyCenter")} /><div className="agreement-tabs">{(["用户协议", "隐私政策", "交易规则"] as const).map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>{loading ? <section className="policy-document-state"><i className="policy-spinner" /><h2>正在加载协议</h2><p>协议正文加载完成前不会显示确认操作。</p></section> : error ? <section className="policy-document-state failed" role="alert"><RequestErrorBear message={error} size={96} /><h2>协议加载失败</h2><p>{error}</p><button type="button" onClick={() => void load()}>重新加载</button></section> : <><section className="policy-version-card"><div><span>当前版本</span><b>V{current?.version_no ?? "—"}</b></div><div><span>协议性质</span><b>本地测试草案</b></div><div><span>生效时间</span><b>{current?.effective_at ? new Date(current.effective_at).toLocaleDateString("zh-CN") : "以测试环境发布记录为准"}</b></div><div><span>重新确认</span><b>{current?.requires_reacceptance ? "需要" : "版本更新时提示"}</b></div></section><article className="paper-panel agreement-document"><h2>{current?.title ?? copy[tab][0]}</h2><p>{current?.content ?? copy[tab][1]}</p>{current ? null : <><h3>用户责任与平台保障</h3><p>{copy[tab][2]}</p></>}<h3>版本与通知</h3><p>协议更新后，平台将通过应用内提示或系统通知说明主要变化。涉及实名信息、声音名片公开试听或交易权益的变更，需要用户重新明确确认。</p><aside>本页面仅用于本地功能测试，不构成正式线上法律文本。</aside></article></>}<button type="button" className="full-primary" disabled={loading || Boolean(error)} onClick={() => go("policyCenter")}>阅读完成</button></div>;
}

function PolicyCenterScreen({ go }: { go: (page: PageId) => void }) {
  const [policies, setPolicies] = useState<PolicyView[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const rows = await apiRequest<PolicyView[]>("/policies/current"); if (!rows.length) throw new ApiClientError("POLICY_CONFIGURATION_INCOMPLETE", "当前没有可用的本地测试协议", 503); setPolicies(rows); } catch (cause) { setPolicies([]); setError(apiMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const displayType = (type: string) => ({ USER_SERVICE_AGREEMENT: "用户与账号", PRIVACY_POLICY: "隐私与信息处理", ORDER_PAYMENT_REFUND_RULES: "交易、支付与退款", SELLER_ONBOARDING_AGREEMENT: "陪玩入驻", IDENTITY_VERIFICATION_NOTICE: "实名信息处理", VOICE_SAMPLE_PUBLIC_AUTHORIZATION: "声音名片公开试听" } as Record<string, string>)[type] ?? "平台规则";
  return <div className="app-screen policy-center-screen"><Header title="协议与隐私中心" subtitle="查看当前版本、使用场景与接受记录" back={() => go("settings")} /><section className="policy-center-hero"><AppIcon kind="shield" /><span><b>你的确认由你决定</b><small>协议不会默认勾选；敏感信息与公开试听分别确认。</small></span></section>{loading ? <section className="policy-document-state compact"><i className="policy-spinner" /><h2>正在加载协议目录</h2></section> : error ? <section className="policy-document-state failed compact" role="alert"><RequestErrorBear message={error} size={96} /><h2>协议目录加载失败</h2><p>{error}</p><button type="button" onClick={() => void load()}>重新加载</button></section> : <section className="policy-center-list">{policies.map((policy) => <button type="button" onClick={() => go("agreementDetail")} key={policy.id}><i>{displayType(policy.policy_type).slice(0, 1)}</i><span><b>{policy.title}</b><small>{displayType(policy.policy_type)} · V{policy.version_no} · 本地测试草案</small></span><em>›</em></button>)}</section>}<section className="settings-group policy-center-actions"><button type="button" onClick={() => go("policyAcceptances")}><span><b>我的接受记录</b><small>查看已确认的协议版本、场景与时间</small></span><em>›</em></button><button type="button" onClick={() => go("sellerPolicyConfirm")}><span><b>陪玩入驻协议确认</b><small>预览入驻、实名和声音名片的分区确认</small></span><em>›</em></button></section><p className="policy-center-foot">本中心仅展示本地测试草案；正式上线前需由法务与隐私负责人审定。</p></div>;
}

function PolicyAcceptancesScreen({ go }: { go: (page: PageId) => void }) {
  const [rows, setRows] = useState<PolicyAcceptanceView[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setRows(await apiRequest<PolicyAcceptanceView[]>("/policies/acceptances")); } catch (cause) { setRows([]); setError(apiMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const sceneCopy: Record<string, string> = { LOGIN: "登录注册", ORDER_PAYMENT: "订单支付", CHAT_ENTRY: "平台聊天", SELLER_ONBOARDING: "陪玩入驻", IDENTITY_VERIFICATION: "实名信息处理", VOICE_SAMPLE_UPLOAD: "声音名片公开试听", COMPLAINT_SUBMISSION: "投诉提交" };
  return <div className="app-screen policy-acceptances-screen"><Header title="我的接受记录" subtitle="记录一经生成只追加、不覆盖" back={() => go("policyCenter")} />{loading ? <section className="policy-document-state compact"><i className="policy-spinner" /><h2>正在读取接受记录</h2></section> : error ? <section className="policy-document-state failed compact" role="alert"><RequestErrorBear message={error} size={96} /><h2>接受记录加载失败</h2><p>{error}</p><button type="button" onClick={() => void load()}>重新加载</button></section> : rows.length ? <section className="acceptance-record-list">{rows.map((row) => <article key={`${row.policy_version_id}-${row.acceptance_scene}`}><i>✓</i><span><b>{row.title}</b><small>V{row.version_no} · {sceneCopy[row.acceptance_scene] ?? row.acceptance_scene}</small><em>{new Date(row.accepted_at).toLocaleString("zh-CN")} · 在线确认</em></span><button type="button" onClick={() => go("agreementDetail")}>查看 ›</button></article>)}</section> : <section className="policy-document-state empty compact"><i>○</i><h2>暂无接受记录</h2><p>你明确确认协议后，版本、场景和时间会显示在这里。</p></section>}<section className="paper-panel acceptance-record-note"><AppIcon kind="shield" /><span><b>为什么保留记录？</b><small>用于证明你在特定业务场景确认的协议版本，不会用新版本覆盖历史记录。</small></span></section></div>;
}

function SellerPolicyConfirmScreen({ go }: { go: (page: PageId) => void }) {
  const [sellerIds, setSellerIds] = useState<string[]>([]); const [identityIds, setIdentityIds] = useState<string[]>([]); const [voiceIds, setVoiceIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  return <div className="app-screen seller-policy-confirm-screen"><Header title="陪玩入驻协议确认" subtitle="三类用途分别确认，不合并授权" back={() => go("policyCenter")} /><PolicyChecklist title="陪玩入驻与平台经营" scene="SELLER_ONBOARDING" selectedIds={sellerIds} onChange={setSellerIds} go={go} note="必需" /><PolicyChecklist title="实名信息处理" scene="IDENTITY_VERIFICATION" selectedIds={identityIds} onChange={setIdentityIds} go={go} note="单独确认" /><PolicyChecklist title="声音名片公开试听" scene="VOICE_SAMPLE_UPLOAD" selectedIds={voiceIds} onChange={setVoiceIds} go={go} note="上传声音时确认" />{notice ? <p className="form-error" role="alert">{notice}</p> : null}<button type="button" className="full-primary" onClick={() => { if (!sellerIds.length || !identityIds.length || !voiceIds.length) { setNotice("请分别阅读并确认三个区域的当前协议；不会替你默认勾选"); return; } setNotice(""); go("sellerApplyForm"); }}>确认完成，返回入驻申请</button></div>;
}

function AuthGuardScreen({ go }: { go: (page: PageId) => void }) {
  return <div className="app-screen auth-guard-screen"><Header title="登录后继续" subtitle="游客可以浏览，交易操作需要登录" back={() => go("home")} /><section className="guard-preview"><img src={services[0].cover} alt={services[0].title} /><span><b>{services[0].title}</b><small>收藏、咨询、下单和查看订单需要账号</small></span></section><div className="guard-dim" /><section className="guard-sheet bear-state-card"><StateBear scene="authGuard" /><h2>登录后使用完整功能</h2><p>登录后可收藏陪玩、发起咨询、支付订单并同步交易和售后记录。</p><button type="button" onClick={() => go("auth")}>手机号登录 / 注册</button><button type="button" className="text-action" onClick={() => go("home")}>继续浏览</button></section></div>;
}

function BookingScheduleScreen({ go, onConfirm, product, selected }: { go: (page: PageId) => void; onConfirm: (value: BookingSelection) => void; product: ProductApiView | null; selected: number }) {
  const sku = product?.skus?.filter((item) => item.status === "ACTIVE")[selected];
  const [choices, setChoices] = useState<BookingSelection[]>([]); const [choice, setChoice] = useState<BookingSelection | null>(null); const [loading, setLoading] = useState(Boolean(product?.seller_id && sku));
  useEffect(() => {
    if (!product?.seller_id || !sku) return;
    void apiRequest<AvailabilityApiView[]>(`/companions/${product.seller_id}/availability`).then((rows) => {
      const durationMs = sku.duration_minutes * 60_000; const now = Date.now() + 5 * 60_000; const generated: BookingSelection[] = [];
      for (const row of rows) { let cursor = Math.max(new Date(row.starts_at).getTime(), now); cursor = Math.ceil(cursor / 1_800_000) * 1_800_000; const end = new Date(row.ends_at).getTime(); while (cursor + durationMs <= end && generated.length < 32) { const date = new Date(cursor); generated.push({ slotId: row.id, startsAt: date.toISOString(), label: date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }) }); cursor += Math.max(durationMs, 1_800_000); } }
      setChoices(generated); setChoice(generated[0] ?? null);
    }).catch(() => { setChoices([]); setChoice(null); }).finally(() => setLoading(false));
  }, [product?.seller_id, sku?.id, sku?.duration_minutes]);
  return <div className="app-screen booking-screen"><Header title="选择预约时间" subtitle={`仅展示 ${product?.seller?.seller_nickname ?? "陪玩"} 可接单的时间`} back={() => go("checkout")} /><section className="booking-player"><Avatar companion={companions[2]} size="md" /><span><b>{product?.seller?.seller_nickname ?? "Kirito"} · 在线接单</b><small>当前规格服务约 {sku?.duration_minutes ?? 40} 分钟</small></span></section><section className="paper-panel booking-slots"><SectionTitle title="可预约时段" note={loading ? "正在加载…" : "下单后由陪玩确认"} /><div>{choices.map((item) => <button type="button" className={choice?.startsAt === item.startsAt ? "active" : ""} onClick={() => setChoice(item)} key={`${item.slotId}-${item.startsAt}`}><b>{item.label}</b><small>可预约</small></button>)}</div>{!loading && choices.length === 0 ? <p>陪玩近期没有开放可接单时段</p> : null}</section><section className="paper-panel booking-rule"><AppIcon kind="shield" /><span><b>预约保护</b><small>正式创建订单时数据库会再次检查时段；并发冲突会提示重新选择。</small></span></section><div className="booking-confirm"><span>已选 <b>{choice?.label ?? "尚未选择"}</b></span><button type="button" disabled={!choice} onClick={() => { if (choice) { onConfirm(choice); go("checkout"); } }}>确认时间</button></div></div>;
}

function ServiceUnavailableScreen({ go }: { go: (page: PageId) => void }) {
  const [reason, setReason] = useState<"暂停接单" | "服务下架" | "审核中" | "时段约满">("暂停接单");
  const notes = { 暂停接单: "陪玩暂时关闭新订单，可以收藏后等待恢复。", 服务下架: "服务已由陪玩下架，历史订单不受影响。", 审核中: "服务重要信息已修改，正在等待平台重新审核。", 时段约满: "该服务当前暂不可预约，可以查看该陪玩的其他服务。" };
  return <div className="app-screen unavailable-screen"><Header title="服务暂不可购买" subtitle="保留详情，明确说明不可购买原因" back={() => go("service")} /><section className="unavailable-product"><img src={services[0].cover} alt={services[0].title} /><span><b>{services[0].title}</b><small>¥25.00 起 · Kirito</small></span><em>{reason}</em></section><div className="unavailable-reasons">{(["暂停接单", "服务下架", "审核中", "时段约满"] as const).map((item) => <button type="button" className={reason === item ? "active" : ""} onClick={() => setReason(item)} key={item}>{item}</button>)}</div><section className="unavailable-notice bear-state-card"><StateBear scene="serviceUnavailable" eventKey={reason} /><h2>{reason}</h2><p>{notes[reason]}</p></section><section className="paper-panel unavailable-actions"><button type="button" onClick={() => go("companion")}>查看陪玩其他服务 <em>›</em></button><button type="button" onClick={() => go("favorites")}>加入收藏，恢复后提醒 <em>›</em></button></section><div className="disabled-purchase-bar"><button type="button" onClick={() => go("chat")}>咨询陪玩</button><button type="button" disabled>当前不可购买</button></div></div>;
}

function PaymentExceptionsScreen({ go }: { go: (page: PageId) => void }) {
  const [state, setState] = useState<"价格变化" | "服务失效" | "渠道异常">("价格变化");
  const config = { 价格变化: ["订单金额已更新", "服务价格由 ¥25.00 调整为 ¥28.00，请确认后重新支付。", "确认新价格"], 服务失效: ["当前服务不可购买", "陪玩已暂停接单，本次测试支付未发起，也不会产生真实扣款。", "查看其他服务"], 渠道异常: ["测试支付渠道暂时不可用", "微信测试支付暂时繁忙，可以稍后重试或切换支付宝测试支付。", "更换支付方式"] };
  return <div className="app-screen payment-exception-screen"><Header title="支付异常处理" subtitle="支付前再次核对金额与服务状态" back={() => go("payment")} /><div className="exception-tabs">{(["价格变化", "服务失效", "渠道异常"] as const).map((item) => <button type="button" className={state === item ? "active" : ""} onClick={() => setState(item)} key={item}>{item}</button>)}</div><section className="exception-hero"><span>!</span><h2>{config[state][0]}</h2><p>{config[state][1]}</p></section><section className="paper-panel exception-order"><div><span>订单服务</span><b>{services[0].title}</b></div><div><span>陪玩</span><b>Kirito</b></div><div><span>原订单金额</span><b>¥25.00</b></div>{state === "价格变化" ? <div className="changed"><span>最新金额</span><b>¥28.00</b></div> : null}</section><div className="dual-actions exception-actions"><button type="button" onClick={() => go("orders")}>稍后处理</button><button type="button" onClick={() => go(state === "服务失效" ? "home" : "payment")}>{config[state][2]}</button></div></div>;
}

function MediaWorkflowScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [stage, setStage] = useState<"选择图片" | "裁剪预览" | "上传中" | "上传失败" | "审核中">("裁剪预览");
  const next = () => { setStage("上传中"); window.setTimeout(() => { setStage("审核中"); notify("图片上传成功，已进入内容审核"); }, 900); };
  return <div className="app-screen media-workflow-screen"><Header title="图片上传与裁剪" subtitle="头像、封面、服务主图和证据共用" back={() => go("sellerApplyForm")} /><div className="media-stage-tabs">{(["选择图片", "裁剪预览", "上传中", "上传失败", "审核中"] as const).map((item) => <button type="button" className={stage === item ? "active" : ""} onClick={() => setStage(item)} key={item}>{item}</button>)}</div><section className={`media-canvas stage-${stage}`}><CatalogImage kind="avatar" src="/assets/player-kirito.png" alt="1:1 图片预览" /><span className="crop-frame"><i /><i /><i /><i /></span>{stage === "上传中" ? <div className="upload-progress"><b>68%</b><span><i /></span><small>正在安全上传…</small></div> : null}{stage === "上传失败" ? <div className="upload-failure"><b>上传失败</b><small>网络连接中断，请保留当前裁剪后重试</small></div> : null}{stage === "审核中" ? <div className="upload-review"><b>✓ 已提交审核</b><small>审核通过后自动更新展示</small></div> : null}</section><section className="paper-panel media-guidance"><div><span>图片比例</span><b>1:1 正方形</b></div><div><span>支持格式</span><b>JPG、PNG</b></div><div><span>文件大小</span><b>不超过 10MB</b></div></section><div className="media-actions">{stage === "上传失败" ? <><button type="button" onClick={() => setStage("裁剪预览")}>重新选择</button><button type="button" onClick={next}>重试上传</button></> : stage === "审核中" ? <button type="button" onClick={() => go("sellerApplyForm")}>完成</button> : <><button type="button" onClick={() => setStage("选择图片")}>更换图片</button><button type="button" onClick={next}>确认并上传</button></>}</div></div>;
}

function PermissionCenterScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [allowed, setAllowed] = useState<Record<string, boolean>>({ 相册: false, 麦克风: false, 通知: true });
  const rows = [{ name: "相册", icon: "▧", note: "上传头像、服务主图和售后证据时使用" }, { name: "麦克风", icon: "●", note: "录制或更新陪玩的声音名片时使用" }, { name: "通知", icon: "◉", note: "接收接单、预约、退款和审核结果提醒" }];
  return <div className="app-screen permission-center-screen"><Header title="系统权限" subtitle="仅在使用对应功能时申请" back={() => go("settings")} /><DemoStateNotice /><section className="permission-intro bear-state-card"><StateBear scene="permissionCenter" /><span><b>权限由你控制</b><small>拒绝权限不会影响浏览，可在需要时再次开启。</small></span></section><section className="permission-list">{rows.map((item) => <article key={item.name}><i>{item.icon}</i><span><b>{item.name}权限</b><small>{item.note}</small></span><button type="button" className={allowed[item.name] ? "allowed" : ""} onClick={() => { setAllowed((current) => ({ ...current, [item.name]: !current[item.name] })); notify(`${item.name}权限已${allowed[item.name] ? "关闭" : "允许"}`); }}>{allowed[item.name] ? "已允许" : "去开启"}</button></article>)}</section><section className="paper-panel permission-note"><b>隐私说明</b><p>熊崽电竞不会在未授权时访问设备内容，也不会将相册、录音用于与当前功能无关的用途。</p></section></div>;
}

function ChatStatesScreen({ go }: { go: (page: PageId) => void }) {
  const [failed, setFailed] = useState(true); const [retrying, setRetrying] = useState(false);
  const retry = () => { setRetrying(true); window.setTimeout(() => { setRetrying(false); setFailed(false); }, 700); };
  return <div className="app-screen chat-states-screen"><Header title="消息发送全状态" subtitle="发送中、已发送、失败重试与已读" back={() => go("chat")} /><section className="chat-state-demo"><article><span>正在确认预约时间</span><small>发送中…</small></article><article><span>好的，今晚 20:00 见</span><small>已发送</small></article><article className={failed ? "failed" : "sent"}><span>开局前我会把段位发给你</span><small>{retrying ? "正在重试…" : failed ? "发送失败" : "已读"}</small>{failed && !retrying ? <button type="button" onClick={retry}>点击重试</button> : null}</article></section><section className="paper-panel chat-state-rule"><SectionTitle title="消息状态规则" /><p>只有最后一条自己发送的消息展示“已读/未读”。发送失败保留原文字，点击即可重试，不要求重新输入。</p></section></div>;
}

function ReviewStatesScreen({ go }: { go: (page: PageId) => void }) {
  const [state, setState] = useState<"审核中" | "已公开" | "已隐藏">("审核中");
  const config = { 审核中: ["评价正在审核", "预计数分钟内完成，审核期间仅自己可见。"], 已公开: ["评价已公开", "其他玩家可以在服务评价和你的公开主页查看。"], 已隐藏: ["评价已隐藏", "评价记录会保留且不可编辑；同一订单不能重新提交第二条评价。"] };
  return <div className="app-screen review-states-screen"><Header title="评价状态" subtitle="真实订单评价的发布与治理状态" back={() => go("reviewDetail")} /><div className="review-state-tabs">{(["审核中", "已公开", "已隐藏"] as const).map((item) => <button type="button" className={state === item ? "active" : ""} onClick={() => setState(item)} key={item}>{item}</button>)}</div><section className={`review-status-hero status-${state}`}><span>{state === "已公开" ? "✓" : state === "已隐藏" ? "!" : "…"}</span><h2>{config[state][0]}</h2><p>{config[state][1]}</p></section><section className="paper-panel review-state-content"><div className="published-stars">{[1, 2, 3, 4, 5].map((item) => <RatingStar selected key={item} />)}</div><p>技术靠谱，沟通舒服，服务和描述一致。</p><small>评价内容以当前订单的服务端记录为准</small></section></div>;
}

function PaymentScreen({ go, selected, notify, order, onPaid }: { go: (page: PageId) => void; selected: number; notify: (message: string) => void; order: OrderApiView | null; onPaid: (order: OrderApiView, payment: PaymentApiView) => void }) {
  void selected; const [channel, setChannel] = useState<"微信支付" | "支付宝" | null>(null); const [paying, setPaying] = useState(false); const [idempotencyKey, setIdempotencyKey] = useState(""); const [policyIds, setPolicyIds] = useState<string[]>([]);
  const { policies, loading: policyLoading, error: policyError, retry: retryPolicies } = useScenePolicies("ORDER_PAYMENT");
  const price = order ? formatCent(order.payable_amount_cent) : "0.00";
  const policiesAccepted = policies.length > 0 && policies.every((policy) => policyIds.includes(policy.id));
  const pay = async () => { if (!order) { notify("请先创建订单"); return; } if (!channel) { notify("请选择微信支付或支付宝"); return; } if (policyError || !policiesAccepted) { notify(policyError ? "协议加载失败，已禁止继续支付" : "请逐份阅读并确认交易协议"); return; } const key = idempotencyKey || `payment-${window.crypto.randomUUID()}`; setIdempotencyKey(key); setPaying(true); try { await acceptSelectedPolicies("ORDER_PAYMENT", policyIds); const paymentChannel = channel === "微信支付" ? "WECHAT_APP" : "ALIPAY_APP"; const payment = await apiRequest<PaymentApiView>("/payments", { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ order_id: order.id, payment_channel: paymentChannel }) }); notify("测试支付渠道正在确认结果"); const result = await apiRequest<{ order: OrderApiView; payment: PaymentApiView }>(`/payments/${payment.id}/mock-confirm`, { method: "POST" }); onPaid(result.order, result.payment); go("paymentResult"); } catch (cause) { notify(apiMessage(cause)); } finally { setPaying(false); } };
  if (!order) return <ContextStateScreen go={go} kind="orders" />;
  return <div className="app-screen payment-screen"><Header title="测试收银台" subtitle={`请在 ${new Date(order.expires_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前完成支付`} back={() => go("checkout")} /><section className="payment-test-banner"><i>TEST</i><span><b>本地测试支付</b><small>微信和支付宝均由测试渠道模拟，不会发起真实扣款。</small></span></section><section className="payment-amount"><span>订单应付</span><b>¥{price}</b><small>熊崽电竞平台交易保障</small></section><section className="paper-panel payment-order"><span><b>{order.product_title}</b><small>订单号 {order.order_no}</small></span><em>¥{price}</em></section><section className="payment-methods"><SectionTitle title="选择测试支付方式" note="请主动选择" />{["微信支付", "支付宝"].map((item, index) => <button type="button" className={channel === item ? "selected" : ""} aria-pressed={channel === item} onClick={() => { setChannel(item as "微信支付" | "支付宝"); setIdempotencyKey(""); }} key={item}><i className={index === 0 ? "wechat" : "alipay"}>{index === 0 ? "微" : "支"}</i><span><b>{item}<em>测试</em></b><small>{index === 0 ? "模拟微信 App 支付结果" : "模拟支付宝 App 支付结果"}</small></span><strong>{channel === item ? "✓" : ""}</strong></button>)}</section><section className={`paper-panel payment-policy-confirm ${policyError ? "load-failed" : ""}`}>{policyLoading ? <div className="policy-loading"><i /><span><b>正在加载交易协议</b><small>完成前不能支付</small></span></div> : policyError ? <div className="policy-load-error" role="alert"><i>!</i><span><b>协议加载失败，已禁止继续支付</b><small>{policyError}</small></span><button type="button" onClick={() => void retryPolicies()}>重新加载</button></div> : policies.map((policy) => { const checked = policyIds.includes(policy.id); return <label key={policy.id}><input type="checkbox" checked={checked} onChange={() => setPolicyIds((current) => checked ? current.filter((id) => id !== policy.id) : [...current, policy.id])} /><span>我已阅读并同意<button type="button" onClick={() => go("agreementDetail")}>《{policy.title}》V{policy.version_no}</button></span></label>; })}<small>不会默认勾选；确认记录与本次订单支付场景关联。</small></section><section className="paper-panel payment-security"><AppIcon kind="shield" /><p>付款资金由平台保障。服务完成并经买家确认后，平台再结算给陪玩。</p></section><button type="button" className="pay-button" disabled={paying || !channel || policyLoading || Boolean(policyError) || !policiesAccepted} onClick={() => void pay()}>{paying ? "正在确认测试支付…" : !channel ? "请选择测试支付方式" : !policiesAccepted ? "请确认交易协议" : `确认测试支付 ¥${price}`}</button></div>;
}

function PaymentProcessingScreen({ go, selected }: { go: (page: PageId) => void; selected: number }) {
  const prices = [25, 45, 65]; const [checking, setChecking] = useState(false);
  const check = () => { setChecking(true); window.setTimeout(() => go("paymentResult"), 700); };
  return <div className="app-screen payment-processing-screen"><Header title="正在确认测试支付" subtitle="请勿重复操作或关闭页面" back={() => go("orders")} /><div className="payment-result-environment"><i>TEST</i><span>本地测试支付处理中</span></div><DemoStateNotice payment /><section className="payment-processing-hero bear-state-card"><StateBear scene="paymentProcessing" /><h1>支付处理中</h1><p>正在向测试支付渠道确认结果，通常只需几秒</p><b>¥{prices[selected]}.00</b></section><section className="paper-panel payment-progress-card"><div><span>订单编号</span><b>XZ202608180001</b></div><div><span>支付方式</span><b>微信测试支付</b></div><div><span>当前状态</span><b className="processing-text">测试渠道确认中</b></div></section><section className="paper-panel payment-security"><AppIcon kind="shield" /><p>支付结果以平台服务端查询为准。本地测试不会产生真实扣款；离开本页后仍可在订单中查看结果。</p></section><div className="result-actions processing-actions"><button type="button" onClick={() => go("orders")}>稍后查看订单</button><button type="button" disabled={checking} onClick={check}>{checking ? "正在查询…" : "查询支付结果"}</button></div></div>;
}

function PaymentResultScreen({ go, order, payment: suppliedPayment, outcome: requestedOutcome = "success", preview = false }: { go: (page: PageId) => void; order: OrderApiView | null; payment: PaymentApiView | null; outcome?: PaymentOutcome; preview?: boolean }) {
  const payment = suppliedPayment?.order_id === order?.id ? suppliedPayment : null;
  const outcome: PaymentOutcome = preview ? requestedOutcome : payment?.status === "FAILED" ? "failed" : payment?.status === "CLOSED" ? "closed" : ["PAID", "REFUNDING", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment?.status ?? order?.payment_status ?? "") ? "success" : order?.status === "CLOSED" ? "closed" : order?.status === "CANCELLED" || requestedOutcome === "cancelled" ? "cancelled" : "timeout";
  const config: Record<PaymentOutcome, { icon: string; title: string; note: string; detail: string; tone: string }> = {
    success: { icon: "✓", title: "支付成功", note: "陪玩已收到新订单提醒，请等待接单", detail: "支付时间 20:06:18", tone: "success" },
    failed: { icon: "!", title: "支付失败", note: "支付渠道返回失败，请核对订单结果后再决定是否重新支付", detail: "失败原因：支付渠道暂时繁忙", tone: "failed" },
    cancelled: { icon: "×", title: "已取消支付", note: "订单仍在待付款状态，倒计时结束前可以继续支付", detail: "取消时间 20:06:18", tone: "cancelled" },
    closed: { icon: "⏳", title: "订单已关闭", note: "订单超过付款时间，原支付意图已经失效", detail: "关闭时间 20:21:00", tone: "closed" },
    timeout: { icon: "⌛", title: "支付确认超时", note: "暂未收到测试渠道最终结果，请先查询订单状态", detail: "查询超时：测试渠道未响应", tone: "timeout" },
  };
  const current = preview ? config[outcome] : {
    ...config[outcome],
    ...(order?.status === "CANCELLED" && outcome === "cancelled" ? { title: "订单已取消", note: "该订单已取消，请在订单详情中查看取消原因和后续处理。" } : {}),
    ...(outcome === "closed" ? { note: "该订单已关闭，具体关闭原因请查看订单详情。" } : {}),
    detail: outcome === "timeout" ? "尚未确认最终支付结果，请先查询订单状态。" : `支付状态：${payment?.status ?? order?.payment_status ?? "待确认"}；订单状态：${order?.status ?? "待确认"}。具体原因请查看订单详情或联系平台客服。`,
  };
  if (!order && !preview) return <ContextStateScreen go={go} kind="orders" />;
  return <div className={`app-screen payment-result-screen outcome-${current.tone}`}>{preview ? <DemoStateNotice payment /> : null}<div className="payment-result-environment"><i>TEST</i><span>本地测试支付结果</span></div><div className="result-hero bear-state-card"><StateBear scene={outcome === "success" ? "paymentResult" : outcome === "failed" ? "paymentFailure" : outcome === "cancelled" ? "paymentCancelled" : outcome === "closed" ? "paymentClosed" : "paymentTimeout"} eventKey={`${payment?.id ?? order?.id ?? "demo"}:${outcome}`} /><h1>{current.title}</h1><p>{current.note}</p><b>¥{formatCent(order?.payable_amount_cent ?? "2500")}</b></div><section className="paper-panel result-order-info"><div><span>订单编号</span><b>{order?.order_no ?? "演示订单 XZ-DEMO-001"}</b></div><div><span>支付单号</span><b>{payment?.payment_no ?? "等待创建"}</b></div><div><span>服务陪玩</span><b>{order?.seller_name ?? "示例陪玩"}</b></div><div><span>预约时间</span><b>{order ? new Date(order.service_starts_at).toLocaleString("zh-CN") : "示例预约时间"}</b></div><div><span>结果信息</span><b>{outcome === "success" ? `服务端支付状态：${order?.payment_status ?? "设计稿示例"}` : current.detail}</b></div></section>{outcome === "success" ? <section className="result-tips"><AppIcon kind="message" /><span><b>可以先联系陪玩</b><small>在平台内确认段位、时间和服务预期</small></span><button type="button" onClick={() => go("chat")}>去沟通</button></section> : <section className="paper-panel result-recovery"><AppIcon kind="shield" /><span><b>{outcome === "closed" ? "订单不再接受付款" : outcome === "timeout" ? "不要重复发起支付" : "请以订单中的支付状态为准"}</b><small>{outcome === "closed" ? "如仍需要该服务，请重新选择规格创建订单。" : outcome === "timeout" ? "先返回订单查询状态；若仍不明确，再联系平台客服。" : "若已扣款但页面未更新，请稍后刷新订单或联系客服。"}</small></span></section>}<div className="result-actions">{outcome === "success" ? <><button type="button" onClick={() => go("home")}>返回首页</button><button type="button" onClick={() => go("orderDetail")}>查看订单</button></> : outcome === "closed" ? <><button type="button" onClick={() => go("orders")}>查看订单</button><button type="button" onClick={() => go("service")}>重新下单</button></> : outcome === "timeout" ? <><button type="button" onClick={() => go("customerService")}>联系平台客服</button><button type="button" onClick={() => go("orders")}>查询订单状态</button></> : <><button type="button" onClick={() => go("orders")}>查看订单</button><button type="button" onClick={() => go("payment")}>重新支付</button></>}</div></div>;
}

type BuyerUiAction = {code:string;label:string;target?:PageId;primary?:boolean};
function apiBuyerActions(order:OrderApiView):BuyerUiAction[] {
  const actions: Record<string,BuyerUiAction> = {
    PAY:{code:'PAY',label:'立即付款',target:'payment',primary:true}, CANCEL:{code:'CANCEL',label:'取消订单'},
    CONFIRM_COMPLETE:{code:'CONFIRM_COMPLETE',label:'确认收货',primary:true},
    REQUEST_REFUND:{code:'REQUEST_REFUND',label:'申请售后',target:'refundApply'}, VIEW_REFUND:{code:'VIEW_REFUND',label:'查看售后',target:'refundDetail'},
    CREATE_COMPLAINT:{code:'CREATE_COMPLAINT',label:'平台介入',target:'complaint'},
    CREATE_REVIEW:{code:'CREATE_REVIEW',label:'去评价',target:'review',primary:true},VIEW_REVIEW:{code:'VIEW_REVIEW',label:'查看评价',target:'reviewDetail'},
  };
  return ([{code:'CONTACT',label:'联系商家',target:'chat'},...(order.available_actions??[]).filter(c=>actions[c] && (c!=='CREATE_REVIEW'||matchesOrderTab(order,'待评价'))).map(c=>actions[c])] as BuyerUiAction[]).sort((a,b)=>Number(!!a.primary)-Number(!!b.primary));
}
type BuyerOrderListState = { filter: string; query: string; searchOpen: boolean; scroll: number };
function OrdersScreen({ go, notify, unreadCount = 0, onSelect, preview = false, initialFilter = "", listState, onShop }: { onShop?: (id: string) => void; listState?: React.MutableRefObject<BuyerOrderListState>; initialFilter?: string; go: (page: PageId) => void; notify: (message: string) => void; unreadCount?: number; onSelect: (order: OrderApiView) => void; preview?: boolean }) {
  const screen = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(!initialFilter ? listState?.current.query ?? "" : "");
  const [searchOpen, setSearchOpen] = useState(!initialFilter && Boolean(listState?.current.searchOpen));
  const [filter, setFilter] = useState(initialFilter || listState?.current.filter || "全部"); const [liveOrders, setLiveOrders] = useState<OrderApiView[]>([]); const [loading, setLoading] = useState(!preview); const [loadError, setLoadError] = useState("");
  const reload = useCallback(async () => { if (preview) return; setLoading(true); setLoadError(""); try { const result = await apiRequest<CursorResponse<OrderApiView>>("/orders?limit=50"); setLiveOrders(result.items); } catch (cause) { if (navigator.onLine !== false) setLiveOrders([]); setLoadError(apiMessage(cause)); } finally { setLoading(false); } }, [preview]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  useLayoutEffect(() => { if (!loading && screen.current && listState && !initialFilter) screen.current.scrollTop = listState.current.scroll; }, [loading]);
  const remember = () => { if (listState) listState.current = { filter, query, searchOpen, scroll: screen.current?.scrollTop ?? 0 }; };
  useEffect(() => { if (listState) listState.current = { ...listState.current, filter, query, searchOpen }; }, [filter, query, searchOpen, listState]);
  const [pending, setPending] = useState<{order:OrderApiView;code:string}|null>(null);
  const [working, setWorking] = useState(false); const commitLock=useRef(false);
  const commitPending=async()=>{if(!pending||commitLock.current)return;commitLock.current=true;setWorking(true);try{await apiRequest(`/orders/${pending.order.id}/${pending.code==='CANCEL'?'cancel':'confirm'}`,{method:'POST',body:JSON.stringify({version:pending.order.version,...(pending.code==='CANCEL'?{reason:'买家主动取消订单'}:{})})});setPending(null);await reload();}catch(e){notify(apiMessage(e));await reload();}finally{commitLock.current=false;setWorking(false)}};
  const actual = liveOrders.map((order) => ({ raw: order, status: buyerOrderLabel(order), title: order.product_title, seller: order.seller_name, priceCent: order.payable_amount_cent, action: order.status === "PENDING_PAYMENT" ? "去支付" : order.status === "PENDING_BUYER_CONFIRM" ? "确认完成" : "查看详情", detailPage: buyerOrderPage(order.status) }));
  const rows = actual;
  const visible = rows.filter((item) => matchesOrderTab(item.raw, filter) && `${item.title} ${item.seller} ${item.raw.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const open = (order: typeof rows[number], target = order.detailPage) => { remember(); onSelect(order.raw); go(target); };
  return <div ref={screen} onScroll={remember} className="app-screen orders-screen"><StatusBar /><Header variant="centered" title="我的订单" actions={<button className="seller-search-trigger" aria-label="搜索订单" aria-expanded={searchOpen} onClick={() => setSearchOpen(value => !value)}><SellerSearchIcon /></button>} /><div className="buyer-order-search"><SellerSearch open={searchOpen} query={query} onChange={setQuery} onClose={() => setSearchOpen(false)} label="搜索订单" placeholder="搜索商品、店铺或订单号" /><button className="buyer-refresh" disabled={loading} onClick={() => void reload()}>刷新订单</button></div>{preview ? <DemoStateNotice /> : null}<div className="order-filter big-order-filter">{buyerOrderTabs.map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>{loading ? <section className="paper-panel live-data-state"><b>正在加载订单…</b></section> : loadError ? <section className="paper-panel live-data-state failed"><RequestErrorBear message={loadError} hasContent={liveOrders.length > 0} /><b>订单加载失败</b><p>{loadError}</p><button type="button" onClick={() => void reload()}>重试</button></section> : null}{(!loading && !loadError) || liveOrders.length > 0 ? <section className="buyer-order-list">{visible.map((order, index) => { const cover = ["/assets/product-hero.png", "/assets/home-hero.png", "/assets/publish-arcade.png", "/assets/player-poster.png"][index % 4]!; return <article className="buyer-order-card" key={order.raw.id} role="link" tabIndex={0} aria-label={`打开订单 ${order.raw.order_no}`} onKeyDown={event=>{if(event.target===event.currentTarget&&event.key==="Enter")open(order)}} onClick={event => { if (!(event.target as HTMLElement).closest("button,a,details")) open(order); }}><div className="buyer-order-head"><button type="button" onClick={() => onShop?.(order.raw.seller_id)}>{order.seller} ›</button><b>{order.status}</b></div><button type="button" className="buyer-order-product" onClick={() => open(order)}><CatalogImage src={order.raw.product_image || cover} alt={order.title} /><span><b>{order.title}</b><small>{order.raw.sku_name} · ×{order.raw.quantity}</small>{order.raw.rule_version !== "V3.1" && <small>预约 {new Date(order.raw.service_starts_at).toLocaleString("zh-CN")}</small>}</span><strong><small>{order.raw.payment_status === "CREATED" ? "待支付" : "买家实付"}</small>¥{formatCent(order.raw.payment_status === "CREATED" ? order.raw.payable_amount_cent : order.raw.paid_amount_cent)}</strong></button><div className="buyer-order-actions">{apiBuyerActions(order.raw).length>3 && <details className="decision-more"><summary>更多</summary>{apiBuyerActions(order.raw).slice(0,-3).map(a=><button key={a.code} onClick={()=>a.target?open(order,a.target):setPending({order:order.raw,code:a.code})}>{a.label}</button>)}</details>}{apiBuyerActions(order.raw).slice(-3).map(a=><button key={a.code} className={a.primary?'primary':''} onClick={()=>a.target?open(order,a.target):setPending({order:order.raw,code:a.code})}>{a.label}</button>)}</div></article>; })}</section> : null}{!loading && !loadError && visible.length === 0 ? <ContextStateScreen go={go} kind="orders" embedded /> : null}<button type="button" className="support-entry" onClick={() => go("customerService")}><AppIcon kind="shield" /><div><b>售后与平台介入</b><small>退款申请 · 投诉 · 交易纠纷</small></div><em>›</em></button>{pending && <ConfirmDialog title={pending.code==='CANCEL'?'确认取消订单？':'确认收货？'} text={pending.code==='CANCEL'?'取消后关闭此订单。':'请核对交付结果。确认后结束普通售后阶段，资金按规则结算。'} confirmText={working?'处理中…':'确认'} onCancel={()=>{if(!working)setPending(null)}} onConfirm={()=>void commitPending()}/>}<BuyerNav page="orders" go={go} unreadCount={unreadCount} /></div>;
}

function buyerOrderLabel(order: OrderApiView) { return commerceOrderLabel(order); }
function buyerOrderPage(status: string): PageId { return ({ PENDING_PAYMENT: "orderPendingPayment", PENDING_ACCEPT: "orderDetail", ACCEPTED: "orderAccepted", IN_SERVICE: "orderInService", PENDING_BUYER_CONFIRM: "orderPendingConfirm", COMPLETED: "orderCompleted", CANCELLED: "orderCancelled", CLOSED: "orderCancelled", SELLER_REJECTED: "orderSellerRejected" } as Record<string, PageId>)[status] ?? "orderDetail"; }

function OrderTimeline({ active = 1 }: { active?: number }) {
  return <div className="order-timeline">{["已付款", "陪玩接单", "开始服务", "买家确认"].map((item, index) => <span className={index <= active ? "done" : ""} key={item}><i>{index < active ? "✓" : index + 1}</i><b>{item}</b></span>)}</div>;
}

function OrderDetailScreen({ go, notify, state = "pendingAccept", order: initialOrder, onUpdated, onShop }:  { go: (page: PageId) => void; notify: (message: string) => void; state?: BuyerOrderState; order?: OrderApiView | null; onShop?: (id:string)=>void; onUpdated?: (order: OrderApiView) => void }) {
  const [confirm, setConfirm] = useState<"cancel" | "complete" | null>(null);
  const [order,setOrder]=useState(initialOrder),[loadError,setLoadError]=useState('');const commitLock=useRef(false);
  useEffect(()=>{if(!initialOrder)return;const c=new AbortController();void apiRequest<OrderApiView>(`/orders/${initialOrder.id}`,{signal:c.signal}).then(setOrder).catch(e=>{if(!c.signal.aborted)setLoadError(apiMessage(e))});return()=>c.abort()},[initialOrder?.id]);
  if (!order) return <ContextStateScreen go={go} kind="orders" />;
  const config: Record<BuyerOrderState, { label: string; title: string; note: string; active: number }> = {
    pendingPayment: { label: "待付款", title: "请在支付超时前完成支付", note: "超时未支付订单将自动关闭，不会产生扣款", active: 0 },
    pendingAccept: { label: "等待陪玩接单", title: "等待陪玩响应", note: "超时未接单将按平台规则自动取消并原路退款", active: 1 },
    accepted: { label: "陪玩已接单 · 待开始", title: "已锁定预约时间", note: "陪玩已锁定本次预约时段，开始服务前可以继续确认段位和需求", active: 1 },
    inService: { label: "服务进行中", title: "已按约定时间开始服务", note: "如遇履约问题，请保留平台聊天记录并及时联系陪玩", active: 2 },
    pendingConfirm: { label: "等待确认完成", title: "请确认本次服务结果", note: "确认后订单完成，平台将进入收益结算", active: 3 },
    completed: { label: "订单已完成", title: "本次服务等待评价", note: "每个完成订单只能提交一次真实评价", active: 4 },
    reviewed: { label: "订单已完成", title: "评价已提交并公开", note: "可以查看评价详情或再次查看该服务", active: 4 },
    cancelled: { label: "订单已取消", title: "未进入服务，不会产生结算", note: "如仍需要该服务，可以重新查看服务详情", active: 0 },
    sellerRejected: { label: "陪玩未接单", title: "退款已自动发起", note: "款项将按原支付方式退回，请在退款详情查看进度", active: 1 },
    afterSale: { label: "售后处理中", title: "退款申请等待处理", note: "请在退款详情查看陪玩响应和平台处理进度", active: 2 },
    refunded: { label: "订单已退款", title: "退款指令已完成", note: "预计 24 小时内原路到账，具体以支付渠道为准", active: 2 },
  };
  const statusState = order.payment_status === "REFUNDED" ? "refunded" : order.after_sale_status !== "NONE" ? "afterSale" : ({ PENDING_PAYMENT: "pendingPayment", PENDING_ACCEPT: "pendingAccept", ACCEPTED: "accepted", IN_SERVICE: "inService", PENDING_BUYER_CONFIRM: "pendingConfirm", COMPLETED: "completed", CANCELLED: "cancelled", CLOSED: "cancelled", SELLER_REJECTED: "sellerRejected" } as Record<string, BuyerOrderState>)[order.status] ?? state;
  const current = order.rule_version === "V3.1" ? ({
    pendingAccept: {label:"待服务",title:"等待卖家开始服务",note:"完成期限从付款时起算，开始服务不会重置期限",active:1},
    accepted: {label:"待服务",title:"等待卖家开始服务",note:"具体需求可在平台聊天中沟通",active:1},
    pendingConfirm: {label:"待收货",title:"请核对交付结果",note:"凭证、验收期限及可用操作以订单当前状态为准",active:3},
    completed: {label:"已完成",title:"本次交易已结束",note:matchesOrderTab(order,"待评价")?"可在评价窗口内提交真实评价":"评价入口按当前资格显示，不生成自动好评",active:4},
    refunded: {label:"已退款",title:"退款结果已更新",note:"到账结果以支付渠道及退款详情为准",active:2},
  } as Partial<typeof config>)[statusState] ?? config[statusState] : config[statusState]; const actualPrice = formatCent(order.payable_amount_cent);
  const commit = async (kind: "cancel" | "confirm") => { if(commitLock.current)return;commitLock.current=true;try { const updated = await apiRequest<OrderApiView>(`/orders/${order.id}/${kind}`, { method: "POST", body: JSON.stringify(kind === "cancel" ? { version: order.version, reason: "买家主动取消订单" } : { version: order.version }) }); onUpdated?.(updated); setConfirm(null); notify(kind === "cancel" ? "订单已取消" : "订单已确认完成"); go(kind === "cancel" ? "orderCancelled" : "orderCompleted"); } catch (cause) { setConfirm(null); notify(apiMessage(cause)); } finally {commitLock.current=false;} };
  const seller = { id: order.seller_id, name: order.seller_name, image: "/assets/player-kirito.png", level: 1, rank: "平台认证陪玩", rating: "0.00", completed: 0, services: 0, tags: [] };
  return <div className={`app-screen order-detail-screen order-state-${statusState}`}><Header title="订单详情" subtitle={`订单号 ${order.order_no}`} back={() => go("orders")} actions={<IconButton label="更多操作" onClick={() => go("complaint")}>•••</IconButton>} /><section className="order-status-hero"><span>{current.label}</span><h2>{current.title}</h2><p>{current.note}</p></section>{order.rule_version !== "V3.1" && <OrderTimeline active={current.active} />}<button type="button" className="order-seller-card" onClick={() => onShop?.(order.seller_id)}><Avatar companion={seller} size="md" /><span><b>{order.seller_name}</b><small>请通过平台沟通交易</small></span><em>查看店铺 ›</em></button><section className="checkout-service order-detail-product"><CatalogImage src="/assets/product-hero.png" alt={order.product_title} /><span><b>{order.product_title}</b><small>{order.sku_name} · 约 {order.sku_duration_minutes * order.quantity} 分钟</small>{order.rule_version !== "V3.1" && <em>{new Date(order.service_starts_at).toLocaleString("zh-CN")}</em>}</span><strong>¥{actualPrice}</strong></section><section className="paper-panel order-facts">{order.buyer_note && <div><span>历史订单备注</span><b>{order.buyer_note}</b></div>}<div><span>下单时间</span><b>{new Date(order.created_at).toLocaleString("zh-CN")}</b></div><div><span>支付状态</span><b>{order.payment_status}</b></div><div><span>{order.payment_status === "CREATED" ? "待支付" : "买家实付"}</span><b>¥{formatCent(order.payment_status === "CREATED" ? order.payable_amount_cent : order.paid_amount_cent)}</b></div></section><section className="paper-panel order-protection"><AppIcon kind="shield" /><span><b>{["cancelled", "refunded"].includes(statusState) ? "订单记录由平台安全留存" : "平台交易保障中"}</b><small>请勿绕过平台交易，聊天记录可作为售后处理依据。</small></span></section><div className="order-detail-actions">{loadError && <p role="alert">{loadError}</p>}{apiBuyerActions(order).map(a=><button className={a.primary?"primary":""} type="button" key={a.code} onClick={()=>a.target?go(a.target):setConfirm(a.code==="CANCEL"?"cancel":"complete")}>{a.label}</button>)}</div>{confirm === "cancel" ? <ConfirmDialog title="确认取消订单？" text="取消后当前订单将关闭，如仍需服务需要重新下单。" confirmText="确认取消" tone="danger" onCancel={() => setConfirm(null)} onConfirm={() => void commit("cancel")} /> : null}{confirm === "complete" ? <ConfirmDialog title="确认服务已完成？" text="确认完成后订单进入结算，并可以对本次服务进行评价。" confirmText="确认完成" onCancel={() => setConfirm(null)} onConfirm={() => void commit("confirm")} /> : null}</div>;
}

function RefundApplyScreen({ go, notify, order, onCreated }: { go: (page: PageId) => void; notify: (message: string) => void; order: OrderApiView | null; onCreated: (refund: RefundApiView) => void }) {
  const reasons = ["陪玩长时间未接单", "预约时间无法履约", "服务与描述不符", "双方协商一致", "其他原因"];
  const [reason, setReason] = useState(reasons[0]); const [reasonOpen, setReasonOpen] = useState(false); const [description, setDescription] = useState(""); const [submitting, setSubmitting] = useState(false);
  const maximum = order ? BigInt(order.paid_amount_cent) - BigInt(order.refunded_amount_cent ?? "0") : 0n;
  const submit = async () => { if (!order || maximum <= 0n || submitting) { notify(order ? "当前订单没有可退金额" : "请先选择真实订单"); return; } setSubmitting(true); try { const refund = await apiRequest<RefundApiView>("/refunds", { method: "POST", headers: { "idempotency-key": `refund-ui-${window.crypto.randomUUID()}` }, body: JSON.stringify({ order_id: order.id, amount_cent: maximum.toString(), reason_code: "SERVICE_ISSUE", reason_text: reason, description }) }); onCreated(refund); notify("退款申请已提交"); go("refundDetail"); } catch (error) { notify(apiMessage(error)); } finally { setSubmitting(false); } };
  return <div className="app-screen refund-apply-screen"><Header title="申请退款" subtitle={`订单 ${order?.order_no ?? "尚未选择"}`} back={() => go("orderDetail")} /><section className="refund-amount"><span>本次最多可退</span><b>¥{formatCent(maximum.toString())}</b><small>退款将原路返回支付账户</small></section><section className="form-panel refund-form"><div className="refund-reason-field"><span>退款原因</span><button type="button" className={reasonOpen ? "open" : ""} aria-expanded={reasonOpen} onClick={() => setReasonOpen(!reasonOpen)}><b>{reason}</b><i /></button>{reasonOpen ? <div className="refund-reason-menu" role="listbox">{reasons.map((item) => <button type="button" className={reason === item ? "active" : ""} onClick={() => { setReason(item); setReasonOpen(false); }} key={item}><span>{item}</span><i>{reason === item ? "✓" : ""}</i></button>)}</div> : null}</div><label><span>补充说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="请描述退款原因，便于陪玩和平台处理" /><em>{description.length}/200</em></label></section><section className="paper-panel refund-rule"><SectionTitle title="退款规则" /><p>同一订单可存在多次历史部分退款，但同时只能处理一笔；累计退款不会超过实付金额。</p></section><button type="button" className="full-primary" disabled={!order || maximum <= 0n || submitting} onClick={() => void submit()}>{submitting ? "正在提交…" : "提交退款申请"}</button></div>;
}

function RefundDetailScreen({ go, notify, state = "pending", refund, onUpdated }: { go: (page: PageId) => void; notify: (message: string) => void; state?: RefundState; refund: RefundApiView | null; onUpdated: (refund: RefundApiView) => void }) {
  const config: Record<RefundState, { title: string; note: string; step: number; status: string }> = {
    pending: { title: "等待陪玩处理", note: "陪玩处理后，退款进度会在这里更新。", step: 2, status: "等待响应" },
    rejected: { title: "陪玩拒绝退款", note: "陪玩已提交拒绝原因，你可以补充说明或申请平台介入。", step: 2, status: "已拒绝" },
    platform: { title: "平台处理中", note: "平台专员正在核验订单、聊天和双方提交的材料。", step: 2, status: "平台介入" },
    processing: { title: "退款处理中", note: "退款指令已提交支付渠道，预计 24h 内更新到账结果。", step: 3, status: "渠道处理中" },
    completed: { title: "退款已完成", note: `¥${formatCent(refund?.approved_amount_cent ?? refund?.requested_amount_cent ?? "2500")} 已按原支付方式退回，到账时间以支付渠道为准。`, step: 3, status: "已完成" },
    closed: { title: "退款申请已关闭", note: "本次申请已撤销或平台判定不支持退款，可查看处理依据。", step: 2, status: "已关闭" },
  };
  const derived: RefundState = refund?.status === "SELLER_REJECTED" || refund?.status === "REJECTED" ? "rejected" : refund?.status === "PLATFORM_REVIEW" || refund?.status === "NEGOTIATING" ? "platform" : refund?.status === "REFUND_PROCESSING" || refund?.status === "SELLER_APPROVED" ? "processing" : refund?.status === "REFUNDED" ? "completed" : refund?.status === "CANCELLED" ? "closed" : refund ? "pending" : state; const current = config[derived];
  const refresh = async () => { if (!refund) return; try { const updated = await apiRequest<RefundApiView>(`/refunds/${refund.id}`); onUpdated(updated); notify("退款进度已刷新"); } catch (error) { notify(apiMessage(error)); } };
  const escalate = async () => { if (!refund) return; try { const updated = await apiRequest<RefundApiView>(`/refunds/${refund.id}/escalate`, { method: "POST", body: JSON.stringify({ version: refund.version, reason: "买家申请平台介入核验退款争议" }) }); onUpdated(updated); notify("已申请平台介入"); } catch (error) { notify(apiMessage(error)); } };
  return <div className={`app-screen refund-detail-screen refund-state-${derived}`}><Header title="退款详情" subtitle={`退款单 ${refund?.refund_no ?? "—"}`} back={() => go("orderAfterSale")} />{!refund ? <DemoStateNotice /> : null}<section className="after-sale-hero bear-state-card">{financeBearScene("refund", refund?.status ?? ({ pending: "REQUESTED", rejected: "SELLER_REJECTED", platform: "PLATFORM_REVIEW", processing: "REFUND_PROCESSING", completed: "REFUNDED", closed: "CANCELLED" } as const)[state]) ? <StateBear scene={financeBearScene("refund", refund?.status ?? ({ pending: "REQUESTED", rejected: "SELLER_REJECTED", platform: "PLATFORM_REVIEW", processing: "REFUND_PROCESSING", completed: "REFUNDED", closed: "CANCELLED" } as const)[state])!} eventKey={`${refund?.id ?? "demo"}:${refund?.status ?? state}`} /> : null}<span><h2>{current.title}</h2><p>{current.note}</p></span></section><div className="after-sale-steps"><span className="done"><i>✓</i><b>买家申请</b><small>{refund ? new Date(refund.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—"}</small></span><span className={current.step >= 2 ? "active" : ""}><i>{current.step > 2 ? "✓" : "2"}</i><b>陪玩/平台处理</b><small>{current.status}</small></span><span className={current.step >= 3 ? "active" : ""}><i>{derived === "completed" ? "✓" : "3"}</i><b>退款结果</b><small>{derived === "completed" ? "已完成" : "预计 24h 内"}</small></span></div><section className="paper-panel refund-summary"><div><span>退款金额</span><b>¥{formatCent(refund?.approved_amount_cent ?? refund?.requested_amount_cent ?? "2500")}</b></div><div><span>退款原因</span><b>{refund?.reason_text ?? "—"}</b></div><div><span>退款方式</span><b>原支付方式退回</b></div><div><span>当前状态</span><b>{current.status}</b></div></section>{derived === "rejected" ? <section className="paper-panel rejection-reason"><SectionTitle title="处理意见" /><p>{refund?.seller_reason ?? refund?.admin_reason ?? "退款申请暂未通过"}</p></section> : null}<section className="paper-panel process-log"><SectionTitle title="处理记录" />{refund?.logs?.slice().reverse().map((log) => <div key={log.id}><i /><span><b>{log.action}</b><small>{new Date(log.created_at).toLocaleString("zh-CN")} · {log.reason}</small></span></div>) ?? <div><i /><span><b>{refund ? "退款申请已提交" : `示例：${current.title}`}</b><small>{refund ? "等待服务端返回完整处理记录" : "仅展示状态视觉，未执行实际退款"}</small></span></div>}</section><div className="after-sale-actions">{derived === "rejected" && refund?.status === "SELLER_REJECTED" ? <button type="button" onClick={() => void escalate()}>申请平台介入</button> : derived === "platform" ? <button type="button" onClick={() => go("customerService")}>联系客服</button> : derived === "processing" ? <button type="button" onClick={() => void refresh()}>刷新退款进度</button> : <button type="button" onClick={() => go("orders")}>返回订单</button>}</div></div>;
}

function ComplaintScreen({ go, notify, order, onCreated }: { go: (page: PageId) => void; notify: (message: string) => void; order: OrderApiView | null; onCreated: (complaint: ComplaintApiView) => void }) {
  const types = ["服务与描述不符", "陪玩未按约定履约", "诱导线下交易", "不文明沟通", "其他问题"];
  const [type, setType] = useState(types[0]); const [typeOpen, setTypeOpen] = useState(false); const [text, setText] = useState(""); const [submitting, setSubmitting] = useState(false);
  const submit = async () => { if (!order || text.trim().length < 5 || submitting) { notify(order ? "请至少填写 5 个字的问题说明" : "请先选择关联订单"); return; } setSubmitting(true); try { const complaint = await apiRequest<ComplaintApiView>("/complaints", { method: "POST", body: JSON.stringify({ target_type: "ORDER", target_id: order.id, complaint_type: type, description: text.trim(), file_ids: [] }) }); onCreated(complaint); notify("投诉已提交，平台将在 24 小时内处理"); go("complaintDetail"); } catch (error) { notify(apiMessage(error)); } finally { setSubmitting(false); } };
  return <div className="app-screen complaint-screen"><Header title="投诉与平台介入" subtitle="平台将在 24 小时内受理" back={() => go("orderDetail")} /><section className="form-panel complaint-form"><div className="complaint-type-field"><span>投诉类型</span><button type="button" className={typeOpen ? "open" : ""} aria-expanded={typeOpen} onClick={() => setTypeOpen(!typeOpen)}><b>{type}</b><i /></button>{typeOpen ? <div className="complaint-type-menu" role="listbox">{types.map((item) => <button type="button" className={type === item ? "active" : ""} onClick={() => { setType(item); setTypeOpen(false); }} key={item}><span>{item}</span><i>{type === item ? "✓" : ""}</i></button>)}</div> : null}</div><label><span>问题说明</span><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={500} placeholder="请说明问题发生的时间、过程和诉求" /><em>{text.length}/500</em></label><div className="evidence-uploader"><span>证据材料</span><button type="button" onClick={() => notify("请先通过统一文件上传流程取得已验证文件，再在投诉详情补充")}>＋ 上传图片</button><small>最多 6 张，平台也会依法调取关联订单与聊天记录</small></div></section><section className="paper-panel complaint-notice"><AppIcon kind="shield" /><span><b>请如实提交</b><small>恶意投诉或伪造材料可能影响账号正常使用。</small></span></section><button type="button" className="full-primary" disabled={!order || text.trim().length < 5 || submitting} onClick={() => void submit()}>{submitting ? "正在提交…" : "提交平台处理"}</button></div>;
}

function ReviewScreen({ go, notify, order, onCreated }: { go: (page: PageId) => void; notify: (message: string) => void; order: OrderApiView | null; onCreated: (review: ReviewApiView) => void }) {
  const [rating, setRating] = useState(0); const [content, setContent] = useState(""); const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false); const publish = async () => { if (!order || !matchesOrderTab(order,"待评价") || rating < 1 || submitting) { notify(order ? "请选择 1–5 星评分" : "请先选择已完成订单"); return; } setSubmitting(true); try { const review = await apiRequest<ReviewApiView>("/reviews", { method: "POST", body: JSON.stringify({ order_id: order.id, rating, content, anonymous }) }); onCreated(review); notify("评价发布成功，评价不可编辑"); go("reviewDetail"); } catch (error) { notify(apiMessage(error)); } finally { setSubmitting(false); } };
  return <div className="app-screen review-screen"><Header title="评价服务" subtitle="真实评价帮助其他玩家选择" back={() => go("orders")} /><section className="review-service"><img src={services[2].cover} alt={order?.product_title ?? services[2].title} /><span><b>{order?.product_title ?? services[2].title}</b><small>{order ? `陪玩：${order.seller_name} · ${order.sku_name}` : "请选择已完成订单"}</small></span></section><section className="paper-panel rating-panel"><b>本次服务体验如何？</b><div>{[1, 2, 3, 4, 5].map((star) => <button type="button" className={star <= rating ? "active" : ""} onClick={() => setRating(star)} aria-label={`${star}星`} key={star}><RatingStar selected={star <= rating} /></button>)}</div><p>{rating ? ["很差", "较差", "一般", "满意", "非常满意"][rating - 1] : "请选择评分"}</p></section><section className="form-panel review-form"><label><span>评价内容（选填）</span><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={300} placeholder="分享本次服务体验，帮助其他玩家做选择" /><em>{content.length}/300</em></label><p className="decision-info">图片评价为选填；当前评价接口尚不接收图片，暂只能提交星级和文字。</p><div className="review-tags">{["技术靠谱", "准时接单", "沟通舒服", "耐心教学"].map((item) => <button type="button" onClick={() => setContent((current) => `${current}${current ? " " : ""}${item}`.slice(0, 300))} key={item}>{item}</button>)}</div><label className="anonymous-review"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /><span>匿名展示评价</span></label></section><button type="button" className="full-primary" disabled={!order || !matchesOrderTab(order,"待评价") || rating < 1 || submitting} onClick={() => void publish()}>{submitting ? "正在发布…" : "发布评价"}</button></div>;
}

async function loadCursorItems<T>(endpoint: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page: CursorResponse<T> = await apiRequest(`${endpoint}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}

function MessagesScreen({ go, unreadCount, onOpen, seller = false, searchState }: { searchState?: React.MutableRefObject<InboxSearchState & { scroll: number }>; seller?: boolean; go: (page: PageId) => void; unreadCount: number; onOpen: (conversation: ConversationApiView, matchMessageId?: string) => void }) {
  const screen = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<ConversationApiView[]>([]);
  const [loaded, setLoaded] = useState(false); const [loadError, setLoadError] = useState("");
  useLayoutEffect(() => { if (loaded && screen.current && searchState) screen.current.scrollTop = searchState.current.scroll; }, [loaded, searchState]);
  const history = useRef(new Map<string, MessageApiView[]>());
  useEffect(() => { let active = true; void loadCursorItems<ConversationApiView>("/conversations").then(items => { if (active) { setConversations(items); setLoaded(true); } }).catch(cause => { if (active) { setLoadError(apiMessage(cause)); setLoaded(true); } }); return () => { active = false; }; }, []);
  const visible = conversations.filter(item => item.conversation_type !== "SUPPORT" && (seller ? item.member_role === "SELLER" : item.member_role !== "SELLER"));
  const entries: InboxEntry[] = visible.map(item => ({ id: item.id, name: item.counterpart?.nickname || (item.conversation_type === "ORDER" ? "订单会话" : "服务咨询"), avatar: DEFAULT_PLAYER_IMAGE, preview: item.last_message_preview ?? "会话已创建", time: item.last_message_at, unread: item.unread_count }));
  const search = async (keyword: string): Promise<InboxEntry[]> => {
    // Read all cursor pages only when requested; never mark messages read during search.
    const missing = visible.filter(item => !history.current.has(item.id));
    for (let offset = 0; offset < missing.length; offset += 4) {
      await Promise.all(missing.slice(offset, offset + 4).map(async item => {
        const rows = await loadCursorItems<MessageApiView>(`/conversations/${item.id}/messages`);
        history.current.set(item.id, rows);
      }));
    }
    const query = keyword.toLocaleLowerCase();
    return entries.flatMap(entry => {
      if (entry.name.toLocaleLowerCase().includes(query)) return [entry];
      const hit = history.current.get(entry.id)?.find(message => message.send_status !== 'DELETED' && message.content.toLocaleLowerCase().includes(query));
      return hit ? [{ ...entry, match: hit.content, matchMessageId: hit.id, time: hit.created_at }] : [];
    });
  };
  return <div ref={screen} onScroll={() => { if (searchState && screen.current) searchState.current.scroll = screen.current.scrollTop; }} className="app-screen messages-screen"><ConversationList initialSearch={searchState?.current} onSearchStateChange={searchState ? next => { searchState.current = { ...searchState.current, ...next }; } : undefined} seller={seller} entries={entries} search={search} loading={!loaded} error={loadError} onOpen={(id, matchMessageId) => { const conversation = visible.find(item => item.id === id); if (conversation) onOpen(conversation, matchMessageId); }} empty="暂无会话，从服务或订单详情发起聊天。" />{seller ? <SellerNav page="sellerMessages" go={go} /> : <BuyerNav page="messages" go={go} unreadCount={unreadCount} />}</div>;
}

function ChatScreen({ go, notify, viewer, conversation: initialConversation, order, product, onConversation, seller = false, searchMessageId }: { searchMessageId?: string; seller?: boolean; go: (page: PageId) => void; notify: (message: string) => void; viewer: Viewer | null; conversation: ConversationApiView | null; order: OrderApiView | null; product: ProductApiView | null; onConversation: (conversation: ConversationApiView) => void }) {
  const sendKey = useRef({content:"",key:""}); const sendLock=useRef(false); const [sendError,setSendError]=useState("");
  const [text, setText] = useState(""); const [conversation, setConversation] = useState(initialConversation); const [messages, setMessages] = useState<MessageApiView[]>([]); const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(Boolean(viewer)); const [loadError, setLoadError] = useState("");
  const messagePane = useRef<HTMLElement>(null); const viewerId = viewer?.id;
  useEmojiClipboard(messagePane);
  const stickerInput = useRef<HTMLInputElement>(null);
  const bear = useBearStickerSender(`chat:${viewerId}:${conversation?.id}`, conversation?.member_role === "SELLER" ? "seller" : "buyer", Boolean(viewer && conversation && conversation.can_send !== false && !sending && !loading && !loadError), async (id, key) => {
    if (!conversation || sendLock.current) throw new Error("请等待当前消息发送完成");
    sendLock.current = true; setSending(true);
    try { const message = await apiRequest<MessageApiView>(`/conversations/${conversation.id}/messages`, { method: "POST", body: JSON.stringify({ client_message_id: key, message_type: "STICKER", sticker_id: id }) }); setMessages(rows => rows.some(row => row.id === message.id) ? rows : [...rows, message]); }
    finally { sendLock.current = false; setSending(false); }
  });
  const stickers = useStickerChat(`chat:${viewerId ?? "guest"}:${conversation?.id ?? "none"}`, messagePane, stickerInput, { value: text, onChange: setText, disabled: !viewer || !conversation || sending || loading }, bear);
  const loadMessages = useCallback(async (id: string) => { const items = searchMessageId ? await loadCursorItems<MessageApiView>(`/conversations/${id}/messages`) : (await apiRequest<CursorResponse<MessageApiView>>(`/conversations/${id}/messages?limit=100`)).items; const rows = [...items].reverse(); setMessages(rows); const last = rows.at(-1); if (last) await apiRequest(`/conversations/${id}/read`, { method: "POST", body: JSON.stringify({ last_read_sequence_no: last.sequence_no }) }); }, [searchMessageId]);
  useEffect(() => {
    let active = true;
    if (!viewerId) { setConversation(null); setMessages([]); setLoading(false); setLoadError(""); return; }
    setLoading(true); setLoadError("");
    void (async () => {
      try {
        let selected = initialConversation;
        if (!selected && order) selected = await apiRequest<ConversationApiView>("/conversations/orders", { method: "POST", body: JSON.stringify({ order_id: order.id }) });
        else if (!selected && product) selected = await apiRequest<ConversationApiView>("/conversations/consultations", { method: "POST", body: JSON.stringify({ product_id: product.id }) });
        else if (!selected) selected = (await apiRequest<CursorResponse<ConversationApiView>>("/conversations?limit=20")).items.find((item) => item.conversation_type !== "SUPPORT" && (seller ? item.member_role === "SELLER" : item.member_role !== "SELLER")) ?? null;
        if (!active) return;
        if (selected) selected = await apiRequest<ConversationApiView>(`/conversations/${selected.id}`);
        if (!active) return;
        setConversation(selected);
        if (!selected) { setMessages([]); return; }
        onConversation(selected); await loadMessages(selected.id);
      } catch (error) { if (active) { setLoadError(apiMessage(error)); notify(apiMessage(error)); } }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initialConversation?.id, order, product, viewerId, seller, loadMessages, notify, onConversation]);
  const searchLocated = useRef(false);
  useEffect(() => {
    if (!messages.length || !messagePane.current) return;
    const hit = searchMessageId && !searchLocated.current ? [...messagePane.current.querySelectorAll<HTMLElement>('[data-message-id]')].find(element => element.dataset.messageId === searchMessageId) : null;
    if (hit) { hit.scrollIntoView({ block: 'center', behavior: 'instant' }); searchLocated.current = true; }
    else messagePane.current.scrollTop = messagePane.current.scrollHeight;
  }, [messages.length, searchMessageId]);
  useEffect(() => {
    if (!conversation || loading || !viewerId) return;
    let running = false;
    const timer = window.setInterval(() => { if (running || sendLock.current || document.hidden) return; running = true; void loadMessages(conversation.id).catch(() => {}).finally(() => { running = false; }); }, 3000);
    return () => window.clearInterval(timer);
  }, [conversation, loading, viewerId, loadMessages]);
  const send = async () => { const content = text.trim(); if (!content || !conversation || sendLock.current) return; sendLock.current=true;setSendError(""); if(sendKey.current.content!==content) sendKey.current={content,key:`chat-${window.crypto.randomUUID()}`}; setSending(true); try { const message = await apiRequest<MessageApiView>(`/conversations/${conversation.id}/messages`, { method: "POST", body: JSON.stringify({ client_message_id: sendKey.current.key, content }) }); setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); setText(""); sendKey.current={content:"",key:""}; notify("消息已发送"); } catch (error) { setSendError(apiMessage(error)); } finally { sendLock.current=false;setSending(false); } };
  const lastMineIndex = messages.reduce((last, message, index) => message.sender_user_id === viewerId ? index : last, -1);
  const service = product ? serviceFromApi(product) : order ? { title: order.product_title, cover: order.product_image } : null;
  const companionName = seller ? (order ? `买家 ${order.buyer_id.slice(0, 8)}` : "买家") : product?.seller?.seller_nickname ?? order?.seller_name ?? "陪玩";
  const myInitial = Array.from(viewer?.profile?.nickname || "我")[0];
  const companionInitial = Array.from(companionName)[0];
  return <div className="app-screen chat-screen">
    <div className="chat-topbar">
      <Header variant="identity" title={seller ? (order ? companionName : "买家会话") : product?.seller?.seller_nickname ?? order?.seller_name ?? (conversation?.conversation_type === "ORDER" ? "订单会话" : "服务咨询")} subtitle={conversation?.conversation_type === "ORDER" ? "订单会话 · 平台内沟通" : "服务咨询 · 平台内沟通"} back={() => go("messages")} actions={<IconButton label={seller ? "买家主页" : "陪玩主页"} onClick={() => go(seller ? "buyerProfile" : "companion")}><span className="chat-person-avatar" aria-hidden="true">{companionInitial}</span></IconButton>} />
      <div className="chat-notice"><AppIcon kind="shield" /><span>请在平台内沟通，保障交易安全</span></div>
    </div>
    <section className="chat-messages chat-scroll-content" ref={messagePane} aria-label="聊天记录" aria-busy={loading}>
      {messages.length === 0 ? <div className="chat-empty-state" role="status">
        {loading ? <StateBear scene="loading" size={96} /> : loadError ? <RequestErrorBear message={loadError} size={96} /> : <StateBear scene={!viewer ? "authGuard" : "messages"} size={96} />}
        <h2>{loading ? "正在加载消息" : loadError ? "消息暂未加载" : !viewer ? "登录后开始聊天" : conversation ? "还没有消息" : "暂未选择会话"}</h2>
        <p>{loading ? "请稍候…" : loadError || (!viewer ? "与陪玩沟通需求，聊天记录会保存在这里。" : conversation ? "可以先聊聊你的游戏和服务需求。" : "从服务详情发起咨询，或从订单进入会话。")}</p>
        {!loading && !viewer ? <button type="button" onClick={() => go("auth")}>去登录</button> : !loading && (!conversation || loadError) ? <button type="button" onClick={() => go("messages")}>返回消息</button> : null}
      </div> : null}
      {messages.map((message, index) => {
        if (message.message_type === "SYSTEM") return <div className="chat-system-message" key={message.id} data-message-id={message.id} data-search-match={message.id === searchMessageId || undefined}><span><EmojiText text={message.content}/></span></div>;
        const mine = message.sender_user_id === viewerId;
        return <div className={`${mine ? "message mine" : "message theirs"}${mine && index === lastMineIndex ? " last-sent" : ""}${message.message_type === "STICKER" ? " bear-v3-message" : ""}`} key={message.id} data-message-id={message.id} data-search-match={message.id === searchMessageId || undefined}>
          {!mine ? <button type="button" className="chat-avatar-button" aria-label={seller ? "查看买家主页" : "查看陪玩主页"} onClick={() => go(seller ? "buyerProfile" : "companion")}><span className="chat-person-avatar" aria-hidden="true">{companionInitial}</span></button> : null}
          <span><p>{message.message_type === "STICKER" ? <BearStickerImage id={message.sticker?.id}/> : <EmojiText text={message.content}/>}</p>{mine && index === lastMineIndex ? <small className="read-receipt read">{message.read_by_recipient ? "已读" : "已发送"}</small> : null}</span>
          {mine ? <button type="button" className="chat-avatar-button" aria-label={seller ? "查看我的主页" : "查看买家主页"} onClick={() => go(seller ? "sellerProfile" : "buyerProfile")}><span className="chat-person-avatar chat-person-avatar-self" aria-hidden="true">{myInitial}</span></button> : null}
        </div>;
      })}
      <PendingBearStickers sender={bear}/>
    </section>
    <div className="chat-compose-dock">
      {sendError&&<p role="alert">发送失败：{sendError}<button disabled={sending} onClick={()=>void send()}>重试</button></p>}
      {service ? <div className="chat-product"><img src={service.cover} alt="咨询中的服务" /><span><b>{service.title}</b><small>{order ? "关联订单服务" : "正在咨询的服务"}</small></span><button type="button" onClick={() => go("service")}>查看 ›</button></div> : null}
      <div className="chat-input has-stickers"><input ref={stickerInput} onFocus={stickers.closePanel} aria-label="输入文字消息" value={text} disabled={!viewer || !conversation || sending || loading} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !stickers.composer.isComposing()) void send(); }} placeholder={!viewer ? "登录后发送消息" : conversation ? "输入消息…" : "请先选择一个会话"} /><StickerToggle control={stickers} /><ChatPlusPanel items={[...(product&&conversation?.product_id===product.id?[{id:product.id,title:product.title,kind:'PRODUCT' as const,onOpen:()=>go('service')}]:[]),...(order&&conversation?.order_id===order.id?[{id:order.id,title:order.product_title,subtitle:order.order_no,kind:'ORDER' as const,onOpen:()=>go(order.seller_user_id===viewerId?'sellerOrderDetail':'orderDetail')}]:[])]} /><button type="button" aria-label={sending ? "正在发送消息" : "发送消息"} aria-busy={sending} disabled={!viewer || !conversation || sending || loading || !text.trim()} onClick={() => void send()}>{sending ? <span aria-hidden="true">…</span> : <ChatSendIcon />}</button></div>
      <StickerTray control={stickers} />
    </div>
    <StickerChatPreview control={stickers} />
  </div>;
}

function CustomerServiceScreen({ go, notify, viewer, order, initialConversationId, seller = false }: { seller?: boolean; go: (page: PageId) => void; notify: (message: string) => void; viewer: Viewer | null; order: OrderApiView | null; initialConversationId?: string | null }) {
  const sendLock = useRef(false), sendKey = useRef({ content: "", key: "", conversationId: "" });
  const [sendError, setSendError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [supportCases, setSupportCases] = useState<SupportCaseApiView[]>([]);
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId);
  const [text, setText] = useState(""); const [supportCase, setSupportCase] = useState<SupportCaseApiView | null>(null); const [messages, setMessages] = useState<MessageApiView[]>([]); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(viewer)); const [loadError, setLoadError] = useState("");
  const messagePane = useRef<HTMLElement>(null); const viewerId = viewer?.id;
  useEmojiClipboard(messagePane);
  const stickerInput = useRef<HTMLInputElement>(null);
  const bear = useBearStickerSender(`support:${viewerId}:${activeConversationId ?? "current"}`, seller ? "seller" : "buyer", Boolean(viewer && !busy && !loading && !loadError && supportCase?.status !== "CLOSED"), async (id, key) => {
    if (sendLock.current) throw new Error("请等待当前消息发送完成");
    sendLock.current = true; setBusy(true);
    try {
      if (!supportCase) {
        const created = await apiRequest<SupportCaseApiView>("/support-cases", { method: "POST", body: JSON.stringify({ topic: "平台客服咨询", priority: "NORMAL", queue_key: "general", source_page: "customerService", related_type: order ? "ORDER" : undefined, related_id: order?.id, initial_sticker_id: id, client_message_id: key }) });
        setSupportCase(created); setSupportCases(rows => rows.some(row => row.id === created.id) ? rows : [created, ...rows]);
        const items = (await loadCursorItems<MessageApiView>(`/conversations/${created.conversation_id}/messages`)).reverse(); setMessages(items);
      } else {
        const message = await apiRequest<MessageApiView>(`/conversations/${supportCase.conversation_id}/messages`, { method: "POST", body: JSON.stringify({ client_message_id: key, message_type: "STICKER", sticker_id: id }) });
        setMessages(rows => rows.some(row => row.id === message.id) ? rows : [...rows, message]);
      }
    } finally { sendLock.current = false; setBusy(false); }
  });
  const stickers = useStickerChat(`support:${viewerId ?? "guest"}:${supportCase?.id ?? "none"}`, messagePane, stickerInput, { value: text, onChange: setText, disabled: !viewer || busy || loading || Boolean(loadError) || supportCase?.status === "CLOSED" }, bear);
  const loadMessages = useCallback(async (conversationId: string) => {
    const rows = (await loadCursorItems<MessageApiView>(`/conversations/${conversationId}/messages`)).reverse();
    setMessages(rows);
    const last = rows.at(-1);
    if (last) await apiRequest(`/conversations/${conversationId}/read`, { method: "POST", body: JSON.stringify({ last_read_sequence_no: last.sequence_no }) });
  }, []);
  useEffect(() => {
    let active = true;
    if (!viewerId) { setSupportCase(null); setMessages([]); setLoading(false); setLoadError(""); return; }
    setLoading(true); setLoadError("");
    setMessages([]);
    void loadCursorItems<SupportCaseApiView>("/support-cases").then(async (items) => {
      if (!active) return;
      setSupportCases(items);
      const selected = activeConversationId ? items.find((item) => item.conversation_id === activeConversationId) : items.find((item) => item.status !== "CLOSED") ?? items[0] ?? null;
      if (activeConversationId && !selected) throw new Error("未找到对应的客服工单，请返回消息列表重试");
      setSupportCase(selected ?? null);
      if (selected) await loadMessages(selected.conversation_id);
    }).catch((cause) => { if (active) { setLoadError(apiMessage(cause)); notify(apiMessage(cause)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [viewerId, activeConversationId, loadMessages, notify]);
  useEffect(() => { if (messages.length && messagePane.current) messagePane.current.scrollTop = messagePane.current.scrollHeight; }, [messages.length]);
  useEffect(() => {
    if (!supportCase || loading || !viewerId) return;
    let running = false;
    const timer = window.setInterval(() => { if (running || sendLock.current || document.hidden) return; running = true; void loadMessages(supportCase.conversation_id).catch(() => {}).finally(() => { running = false; }); }, 3000);
    return () => window.clearInterval(timer);
  }, [supportCase, loading, viewerId, loadMessages]);
  const createCase = async (content: string) => { const created = await apiRequest<SupportCaseApiView>("/support-cases", { method: "POST", body: JSON.stringify({ topic: content.slice(0, 100), priority: "NORMAL", queue_key: "general", related_type: order ? "ORDER" : undefined, related_id: order?.id, source_page: "customerService", initial_message: content }) }); setSupportCase(created); setSupportCases((current) => [created, ...current]); await loadMessages(created.conversation_id); return created; };
  const send = async (content = text) => {
    const messageText = content.trim();
    if (!messageText || busy || sendLock.current || !viewer || loading || loadError) return;
    if (supportCase?.status === "CLOSED") { notify("请先重新打开客服工单"); return; }
    sendLock.current = true; setBusy(true); setSendError("");
    try {
      if (!supportCase) await createCase(messageText);
      else {
        if (sendKey.current.content !== messageText || sendKey.current.conversationId !== supportCase.conversation_id) sendKey.current = { content: messageText, conversationId: supportCase.conversation_id, key: `support-${window.crypto.randomUUID()}` };
        const message = await apiRequest<MessageApiView>(`/conversations/${supportCase.conversation_id}/messages`, { method: "POST", body: JSON.stringify({ client_message_id: sendKey.current.key, content: messageText }) });
        setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
      }
      setText(""); sendKey.current = { content: "", key: "", conversationId: "" };
    } catch (error) { setText(messageText); setSendError(apiMessage(error)); }
    finally { sendLock.current = false; setBusy(false); }
  };
  const reopen = async () => { if (!supportCase || busy) return; setBusy(true); try { const reopened = await apiRequest<SupportCaseApiView>(`/support-cases/${supportCase.id}/reopen`, { method: "POST", body: JSON.stringify({ version: supportCase.version, reason: "用户需要继续咨询" }) }); setSupportCase(reopened); await loadMessages(reopened.conversation_id); notify("客服工单已重新打开"); } catch (error) { notify(apiMessage(error)); } finally { setBusy(false); } };
  const human = supportCase?.status === "SERVING"; const waiting = supportCase && ["WAITING", "TRANSFERRED"].includes(supportCase.status); const closed = supportCase?.status === "CLOSED";
  const unavailable = !viewer || busy || loading || Boolean(loadError);
  const myInitial = Array.from(viewer?.profile?.nickname || "我")[0];
  return <div className="app-screen customer-service-screen">
    <div className="chat-topbar">
      <Header variant="identity" title="平台客服" subtitle={human ? "人工客服 · 服务中" : waiting ? "等待客服接入" : closed ? "本次工单已结束" : "订单与账号问题"} back={() => go("messages")} actions={<IconButton label="客服记录" onClick={() => setHistoryOpen((open) => !open)}><AppIcon kind="order" /></IconButton>} />
      <div className="chat-notice"><AppIcon kind="shield" /><span>请勿发送密码、验证码等敏感信息</span></div>
    </div>
    {historyOpen ? <section className="support-history" aria-label="客服历史记录"><b>客服记录</b>{supportCases.length ? supportCases.map((item) => <button type="button" key={item.id} disabled={loading || busy} aria-current={supportCase?.id === item.id ? "true" : undefined} onClick={() => { setText(""); setActiveConversationId(item.conversation_id); setHistoryOpen(false); }}><span>{item.topic}</span><small>{item.case_no} · {item.status === "CLOSED" ? "已结束" : "处理中"}</small></button>) : <p>暂无客服记录</p>}<button type="button" onClick={() => setHistoryOpen(false)}>收起记录</button></section> : null}
    <section className="chat-scroll-content" ref={messagePane} aria-label="客服会话" aria-busy={loading}>
      <section className={`customer-service-status ${waiting ? "bear-state-card has-waiting-bear" : ""}`}>{waiting ? <StateBear scene="supportWaiting" eventKey={`${supportCase.id}:${supportCase.status}`} /> : <img src="/assets/xiongzai-icon.png" alt="熊崽电竞平台客服" />}<span><b>{human ? "人工客服已接入" : waiting ? "已进入人工客服队列" : closed ? "本次客服会话已结束" : "有什么可以帮你？"}</b><small>{human ? "可继续补充问题与处理诉求" : waiting ? "你可以先补充问题和订单信息" : closed ? "需要继续咨询时，可重新打开工单" : "选择常见问题，或直接描述你的情况"}</small></span></section>
      <section className="customer-order-card"><span><b>关联订单</b><small>{order?.order_no ?? "尚未关联"}</small></span>{order ? <div><img src={order.product_image} alt={order.product_title} /><p><b>{order.product_title}</b><small>订单金额 ¥{formatCent(order.payable_amount_cent)}</small></p><button type="button" onClick={() => go("orderDetail")}>查看 ›</button></div> : <p className="customer-order-empty">如涉及订单，可在消息中填写订单号。</p>}</section>
      <div className="customer-quick-issues" aria-label="常见问题">{["支付或扣款问题", "订单与履约问题", "退款/投诉进度", "账号与实名认证"].map((item) => <button type="button" disabled={unavailable || closed} key={item} onClick={() => void send(item)}>{item}</button>)}</div>
      <section className="customer-chat-list" aria-label="客服聊天记录">
        {messages.length === 0 ? <div className="chat-empty-state" role="status">{!waiting ? loading ? <StateBear scene="loading" size={96} /> : loadError ? <RequestErrorBear message={loadError} size={96} /> : <StateBear scene={!viewer ? "authGuard" : "supportEmpty"} size={96} /> : null}<h2>{loading ? "正在加载客服记录" : loadError ? "客服记录暂未加载" : !viewer ? "登录后联系客服" : closed ? "暂未加载到聊天记录" : "说说你遇到的问题"}</h2><p>{loading ? "请稍候…" : loadError || (!viewer ? "登录后可以描述问题并查看处理进度。" : closed ? "重新打开工单后可以继续咨询。" : supportCase ? "可以继续补充问题，客服会在工单内处理。" : "发送第一条消息后，将创建你的客服工单。")}</p>{!loading && !viewer ? <button type="button" onClick={() => go("auth")}>去登录</button> : !loading && loadError ? <button type="button" onClick={() => go("messages")}>返回消息</button> : null}</div> : null}
        {messages.map((message) => {
          if (message.message_type === "SYSTEM") return <div className="chat-system-message" key={message.id}><span><EmojiText text={message.content}/></span></div>;
          const mine = message.sender_user_id === viewerId;
          return <div className={`${mine ? "customer-message mine" : "customer-message service"}${message.message_type === "STICKER" ? " bear-v3-message" : ""}`} key={message.id}>{mine ? null : <img src="/assets/xiongzai-icon.png" alt="平台客服" />}<p>{message.message_type === "STICKER" ? <BearStickerImage id={message.sticker?.id}/> : <EmojiText text={message.content}/>}</p>{mine ? <span className="chat-person-avatar chat-person-avatar-self" aria-label="我的头像">{myInitial}</span> : null}</div>;
        })}
        <PendingBearStickers sender={bear}/>
      </section>
    </section>
    <div className="chat-compose-dock">
      {sendError && <p role="alert">发送失败：{sendError}<button type="button" disabled={busy || loading || Boolean(loadError)} onClick={() => void send()}>重试</button></p>}
      <div className="customer-transfer"><span><b>{human ? "人工客服服务中" : waiting ? "等待人工客服" : closed ? "需要继续咨询？" : "需要进一步协助？"}</b><small>资金与争议问题由人工处理</small></span><button type="button" className={human ? "connected" : ""} disabled={unavailable || human || Boolean(waiting)} onClick={() => closed ? void reopen() : void send("请求人工客服协助")}>{human ? "已接入" : waiting ? "排队中" : closed ? "重新打开" : "转人工"}</button></div>
      <div className="customer-chat-input has-stickers"><input ref={stickerInput} onFocus={stickers.closePanel} aria-label="输入客服问题" value={text} disabled={unavailable || closed} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !stickers.composer.isComposing()) void send(); }} placeholder={!viewer ? "登录后发送问题" : closed ? "请先重新打开客服工单" : "输入问题或订单号…"} /><StickerToggle control={stickers} /><button type="button" aria-label={busy ? "正在发送客服问题" : "发送客服问题"} aria-busy={busy} disabled={unavailable || closed || !text.trim()} onClick={() => void send()}>{busy ? <span aria-hidden="true">…</span> : <ChatSendIcon />}</button></div>
      <StickerTray control={stickers} />
    </div>
    <StickerChatPreview control={stickers} />
  </div>;
}

function FavoritesScreen({ go, onCompanionOpen, onServiceOpen, preview = false }: { go: (page: PageId) => void; onCompanionOpen?: (item: Companion) => void; onServiceOpen?: (item: Service) => void; preview?: boolean }) {
  const [tab, setTab] = useState<"陪玩" | "服务">("陪玩");
  const [favoriteCompanions, setFavoriteCompanions] = useState<Companion[]>([]); const [favoriteServices, setFavoriteServices] = useState<Service[]>([]); const [loading, setLoading] = useState(!preview); const [loadError, setLoadError] = useState("");
  const reload = useCallback(async () => { if (preview) return; setLoading(true); setLoadError(""); try { const page = await apiRequest<CursorResponse<{ target_type: "SELLER" | "PRODUCT"; seller_id: string | null; product_id: string | null }>>("/favorites?limit=100"); const sellerRows = await Promise.all(page.items.filter((row) => row.seller_id).map((row) => apiRequest<SellerApiView>(`/companions/${row.seller_id}`))); const productRows = await Promise.all(page.items.filter((row) => row.product_id).map((row) => apiRequest<ProductApiView>(`/services/${row.product_id}`))); setFavoriteCompanions(sellerRows.map(companionFromApi)); setFavoriteServices(productRows.map(serviceFromApi)); } catch (cause) { if (navigator.onLine !== false) { setFavoriteCompanions([]); setFavoriteServices([]); } setLoadError(apiMessage(cause)); } finally { setLoading(false); } }, [preview]);
  useEffect(() => { const timer = window.setTimeout(() => { void reload(); }, 0); return () => window.clearTimeout(timer); }, [reload]);
  const companionRows = favoriteCompanions; const serviceRows = favoriteServices;
  return <div className="app-screen favorites-screen"><StatusBar /><Header title="我的收藏" subtitle="陪玩和服务分别收藏" back={() => go("mine")} />{preview ? <DemoStateNotice /> : null}<div className="segmented favorite-tabs"><button type="button" className={tab === "陪玩" ? "active" : ""} onClick={() => setTab("陪玩")}>收藏的陪玩 {companionRows.length}</button><button type="button" className={tab === "服务" ? "active" : ""} onClick={() => setTab("服务")}>收藏的服务 {serviceRows.length}</button></div>{loading ? <section className="paper-panel live-data-state"><b>正在加载收藏…</b></section> : loadError ? <section className="paper-panel live-data-state failed"><RequestErrorBear message={loadError} hasContent={companionRows.length + serviceRows.length > 0} /><b>收藏加载失败</b><p>{loadError}</p><button type="button" onClick={() => void reload()}>重试</button></section> : null}{(!loading && !loadError) || companionRows.length + serviceRows.length > 0 ? <section className="favorite-content">{tab === "陪玩" ? <div className="shop-list favorite-companion-list">{companionRows.map((item) => <CompanionCard key={item.id} companion={item} go={go} wide actionLabel="查看陪玩主页 ›" onOpen={onCompanionOpen} />)}</div> : <div className="product-grid">{serviceRows.map((item) => <ServiceCard key={item.id} service={item} go={go} onOpen={onServiceOpen} />)}</div>}{(tab === "陪玩" ? companionRows : serviceRows).length === 0 ? <ContextStateScreen go={go} kind="favorites" embedded /> : null}</section> : null}</div>;
}

function MineScreen({ go, unreadCount = 0, viewer, onOrders, scrollState }: { scrollState?: { current: number }; onOrders: (filter: string) => void; go: (page: PageId) => void; unreadCount?: number; viewer: Viewer | null; v31?: boolean }) {
  const openAccount = (target: PageId) => go(viewer ? target : "auth");
  return <div className="app-screen mine-screen buyer-mine" ref={node => { if (node && scrollState) node.scrollTop = scrollState.current; }} onScroll={event => { if (scrollState && event.target === event.currentTarget) scrollState.current = event.currentTarget.scrollTop; }}><StatusBar />
    <div className="mine-sky"><Header variant="centered" title="我的" actions={<IconButton label="设置" onClick={() => go("settings")}><AppIcon kind="setting" /></IconButton>} />
      <button type="button" className="mine-profile mine-profile-edit" aria-label={viewer ? "编辑个人资料" : "登录账号"} onClick={() => openAccount("editProfile")}>
        <Avatar companion={{ ...companions[0]!, name: viewer?.profile?.nickname ?? "熊崽玩家", image: "/assets/xiongzai-icon.png", avatarFileId: viewer?.profile?.avatar_file_id, online: false }} fallbackSrc="/assets/xiongzai-icon.png" size="lg" />
        <span className="mine-profile-copy"><b>{viewer?.profile?.nickname ?? "登录熊崽电竞"}</b><span>{!viewer ? "登录后查看订单与个人资料" : !viewer.profile?.public_user_no || viewer.profile.public_user_no.startsWith("LOCAL-") ? "查看与编辑个人资料" : `账号：${viewer.profile.public_user_no}`}</span></span><span className="mine-profile-chevron" aria-hidden="true">›</span>
      </button>
    </div>
    <section className="paper-panel commerce-my-orders"><SectionTitle title="我的订单" action="全部订单 ›" onAction={() => viewer ? onOrders("全部") : go("auth")} /><div className="commerce-order-entries">{buyerOrderEntries.map((item) => <button type="button" key={item.label} onClick={() => viewer ? onOrders(item.label) : go("auth")}><AppIcon kind={mineOrderIcon[item.label] ?? item.icon} /><span>{item.label}</span></button>)}</div></section>
    <section className="mine-grid buyer-assets">
      <button type="button" onClick={() => openAccount("favorites")}><AppIcon kind="favorite" className="mine-asset-icon" /><b>我的收藏</b><span>店铺与商品</span></button>
      <button type="button" onClick={() => go("coupons")}><span className="mine-asset-icon" aria-hidden="true"><img src="/assets/home-shortcuts/coupon-center.png" alt="" /></span><b>优惠券</b><span>前往领券中心</span></button>
    </section>
    <section className="mine-menu">
      <button type="button" onClick={() => openAccount("messages")}><AppIcon kind="message" className="menu-symbol" /><span><b>消息</b><small>{viewer ? unreadCount > 0 ? `${unreadCount} 条未读` : "查看会话" : "登录后查看会话"}</small></span><em aria-hidden="true">›</em></button>
      <button type="button" onClick={() => go("rules")}><AppIcon kind="mine-rules" className="menu-symbol" /><span><b>平台规则</b><small>交易、售后与评价说明</small></span><em aria-hidden="true">›</em></button>
      <button className="decision-row" onClick={() => go("customerService")}><AppIcon kind="service" /><span><b>平台客服</b></span><em>›</em></button><BuyerIdentity request={apiRequest} userId={viewer?.id} onOpen={() => go("buyerSellerIdentity")} onNavigate={target => go(target as PageId)} />
    </section>
    <BuyerNav page="mine" go={go} unreadCount={unreadCount} />
  </div>;
}

function EditProfileScreen({ go, notify, viewer, onUpdated, buyerMode = false }: { buyerMode?: boolean; go: (page: PageId) => void; notify: (message: string) => void; viewer: Viewer | null; onUpdated: (viewer: Viewer) => void }) {
  const [nickname, setNickname] = useState(viewer?.profile?.nickname ?? "熊崽玩家 K"); const [saving, setSaving] = useState(false);
  const save = async () => { if (!viewer) { go("auth"); return; } setSaving(true); try { const updated = await apiRequest<Viewer>("/me/profile", { method: "PATCH", body: JSON.stringify({ nickname: nickname.trim(), bio: viewer.profile?.bio ?? null, avatar_file_id: viewer.profile?.avatar_file_id ?? null, version: viewer.profile?.version ?? 0, user_version: viewer.version }) }); onUpdated(updated); notify("个人资料已保存"); go("mine"); } catch (cause) { notify(apiMessage(cause)); } finally { setSaving(false); } };
  return <div className="app-screen edit-profile-screen"><Header title="编辑个人资料" subtitle="公开资料将在陪玩和聊天中展示" back={() => go("mine")} /><section className="edit-avatar"><button type="button" onClick={() => notify(buyerMode ? "个人头像上传暂未接通；当前头像会保留，昵称可以正常保存" : "选择新头像")}>{buyerMode ? <CatalogImage kind="avatar" fileId={viewer?.profile?.avatar_file_id} fallbackSrc="/assets/xiongzai-icon.png" alt="当前头像" /> : <img src={companions[0].image} alt="当前头像" />}<i>更换</i></button><p>支持 JPG、PNG，建议使用清晰头像</p></section><section className="settings-group profile-fields"><div className="profile-nickname-field"><label htmlFor="profile-nickname"><b>昵称</b><small>2–16 个字符</small></label><input id="profile-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} /></div><button type="button" onClick={() => go("phoneSecurity")}><span><b>手机号码</b><small>用于登录与交易安全</small></span><em>{viewer?.phone_mask ?? "未登录"} ›</em></button></section><section className="paper-panel profile-privacy"><AppIcon kind="shield" /><span><b>资料安全</b><small>手机号码不会公开展示；昵称与头像需通过内容安全检查。</small></span></section><button type="button" className="full-primary" disabled={saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存资料"}</button></div>;
}

function RulesScreen({ go, backPage = "mine" }: { go: (page: PageId) => void; backPage?: PageId }) {
  const [open, setOpen] = useState("交易规则"); const rules = [{ title: "交易规则", note: "下单、接单、履约与确认", body: "所有交易必须在熊崽电竞平台完成。陪玩接单前确认规格和时间，服务完成后买家确认，平台再进行收益结算。" }, { title: "退款规则", note: "不同订单状态的退款条件", body: "待接单可申请全额退款；服务中退款需双方协商；争议订单可申请平台介入，按订单、聊天和履约证据处理。" }, { title: "陪玩服务规范", note: "文明沟通与禁止行为", body: "严禁外挂、代充、线下交易、引流和不文明服务。违规服务会被下架，严重情况暂停或终止陪玩身份。" }, { title: "评价与投诉", note: "真实评价和平台治理", body: "评价需来自真实完成订单。平台可隐藏违规评价；恶意投诉、伪造材料等行为将按平台规则处理。" }, { title: "隐私与账号安全", note: "数据使用和账号保护", body: "手机号、支付和身份信息仅用于登录、交易安全和依法合规处理，不向普通用户公开。" }];
  return <div className="app-screen rules-screen"><Header title="平台规则与售后" subtitle="下单前请了解交易与退款规则" back={() => go(backPage)} /><section className="rules-hero"><AppIcon kind="shield" /><span><h2>熊崽电竞平台保障</h2><p>平台内支付 · 订单留痕 · 退款与投诉介入</p></span></section><section className="rules-list">{rules.map((rule) => <article className={open === rule.title ? "open" : ""} key={rule.title}><button type="button" onClick={() => setOpen(open === rule.title ? "" : rule.title)}><span><b>{rule.title}</b><small>{rule.note}</small></span><em>{open === rule.title ? "−" : "+"}</em></button>{open === rule.title ? <p>{rule.body}</p> : null}</article>)}</section><button type="button" className="support-entry rules-support" onClick={() => go("customerService")}><AppIcon kind="message" /><div><b>仍然需要帮助？</b><small>联系平台客服处理订单与账号问题</small></div><em>›</em></button></div>;
}

function SettingsScreen({ go, notify, onLoggedOut, buyerViewer }: { buyerViewer?: Viewer | null; go: (page: PageId) => void; notify: (message: string) => void; onLoggedOut: () => void }) {
  const logout = async () => { try { await apiRequest("/auth/logout", { method: "POST" }); } catch (cause) { if (!(cause instanceof ApiClientError && cause.status === 401)) { notify(apiMessage(cause)); return; } } onLoggedOut(); notify("已退出登录"); window.setTimeout(() => go("auth"), 500); };
  return <div className="app-screen settings-screen"><StatusBar /><Header title="设置" subtitle="账号、隐私与身份" back={() => go("mine")} />{buyerViewer !== undefined ? <section className="mine-menu buyer-settings-identity"><BuyerIdentity request={apiRequest} userId={buyerViewer?.id} onOpen={() => go("buyerSellerIdentity")} onNavigate={target => go(target as PageId)} /></section> : <section className="seller-identity-card"><img src="/assets/xiongzai-icon.png" alt="熊崽电竞陪玩认证" /><div><span>SELLER IDENTITY</span><h2>陪玩身份</h2><p>通过审核后，才可以拥有陪玩主页、发布服务并处理卖家订单。</p><b>当前状态：审核已通过</b></div><button type="button" onClick={() => go("seller")}>进入陪玩中心</button></section>}<section className="settings-group identity-settings">{buyerViewer === undefined && <button type="button" onClick={() => go("sellerApplyStatus")}><span><b>申请成为陪玩</b><small>查看申请资料和审核记录</small></span><em>已通过 ›</em></button>}<button type="button" onClick={() => go("editProfile")}><span><b>个人资料</b><small>头像、昵称、手机号</small></span><em>›</em></button><button type="button" onClick={() => go("privacySecurity")}><span><b>隐私与安全</b><small>手机号、实名认证、隐私设置</small></span><em>›</em></button><button type="button" onClick={() => go("policyCenter")}><span><b>协议与隐私中心</b><small>当前版本、接受记录与入驻确认</small></span><em>›</em></button><button type="button" onClick={() => go("rules")}><span><b>平台规则</b><small>交易、退款、评价规范</small></span><em>›</em></button><button type="button" onClick={() => void logout()}><span><b>退出登录</b></span><em>›</em></button></section></div>;
}

function SellerApplyFormScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nickname, setNickname] = useState(""); const [intro, setIntro] = useState(""); const [rank, setRank] = useState(""); const [kd, setKd] = useState(""); const [experience, setExperience] = useState(""); const [submitting, setSubmitting] = useState(false);
  const [voicePrepared] = useState(false); const [games,setGames]=useState<string[]>([]); const [voicePolicyIds, setVoicePolicyIds] = useState<string[]>([]); const [sellerPolicyIds, setSellerPolicyIds] = useState<string[]>([]); const [identityPolicyIds, setIdentityPolicyIds] = useState<string[]>([]);
  const submitApplication = async () => {
    if (nickname.trim().length < 2 || intro.trim().length < 2 || !games.length) { notify("请填写店铺名称、主页介绍并选择主营游戏"); return; }
    if (!sellerPolicyIds.length || !identityPolicyIds.length || (voicePrepared && !voicePolicyIds.length)) { notify("请分别阅读并确认入驻、实名信息和声音名片对应协议"); return; }
    setSubmitting(true);
    try {
      let seller: SellerApiView;
      try {
        const current = await apiRequest<SellerApiView>("/seller/profile");
        seller = await apiRequest<SellerApiView>("/seller/profile", { method: "PATCH", body: JSON.stringify({ seller_nickname: nickname.trim(), introduction: intro.trim(), game_rank: rank.trim() || null, kd: kd.trim() || null, game_experience: experience.trim() || null, preferred_mode: games.join("、"), accepting_orders: false, version: current.version }) });
      } catch (cause) {
        if (!(cause instanceof ApiClientError && cause.code === "SELLER_NOT_FOUND")) throw cause;
        seller = await apiRequest<SellerApiView>("/seller/profile", { method: "POST", body: JSON.stringify({ seller_nickname: nickname.trim(), introduction: intro.trim(), game_rank: rank.trim() || null, kd: kd.trim() || null, game_experience: experience.trim() || null, preferred_mode: games.join("、"), accepting_orders: false }) });
      }
      await acceptSelectedPolicies("SELLER_ONBOARDING", sellerPolicyIds);
      await acceptSelectedPolicies("IDENTITY_VERIFICATION", identityPolicyIds);
      if (voicePrepared) await acceptSelectedPolicies("VOICE_SAMPLE_UPLOAD", voicePolicyIds);
      await apiRequest("/seller/applications", { method: "POST", body: JSON.stringify({ version: seller.version }) });
      notify("陪玩申请已提交审核"); go("sellerApplyReview");
    } catch (cause) { notify(apiMessage(cause)); } finally { setSubmitting(false); }
  };
  return <div className="app-screen seller-apply-form-screen">
    <Header title="申请开设店铺" subtitle={`第 ${step} 步，共 3 步`} back={() => step === 1 ? go("settings") : setStep((step - 1) as 1 | 2)} />
    <div className="apply-progress"><span className={step >= 1 ? "active" : ""}><i>1</i><b>基本资料</b></span><span className={step >= 2 ? "active" : ""}><i>2</i><b>游戏与声音</b></span><span className={step >= 3 ? "active" : ""}><i>3</i><b>确认提交</b></span></div>
    {step === 1 ? <>
      <section className="form-panel apply-form">
        <div className="form-field apply-media-field"><span>陪玩头像</span><button type="button" className="apply-media-upload" onClick={() => go("mediaWorkflow")}><CatalogImage kind="avatar" src="/assets/player-kirito.png" alt="陪玩头像 1:1 预览" /><i>＋ 上传头像</i></button></div>
        <label htmlFor="seller-nickname"><span>店铺名称</span><input id="seller-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} placeholder="请输入店铺名称" /></label>
        <label htmlFor="seller-introduction"><span>主页介绍</span><textarea id="seller-introduction" value={intro} onChange={(event) => setIntro(event.target.value)} placeholder="介绍擅长模式、服务风格和沟通特点" maxLength={300} /></label>
        <div className="form-field apply-media-field"><span>主页封面（选填）</span><button type="button" className="apply-media-upload" onClick={() => go("mediaWorkflow")}><CatalogImage src="/assets/player-poster.png" alt="陪玩主页封面 1:1 预览" /><i>＋ 上传封面</i></button></div>
      </section>
      <section className="paper-panel apply-agreement"><AppIcon kind="shield" /><span><b>陪玩准入说明</b><small>申请资料仅用于平台审核。审核通过后才可创建主页、发布服务和处理订单。</small></span></section>
      <button type="button" className="full-primary" onClick={() => setStep(2)}>下一步</button>
    </> : step === 2 ? <>
      <section className="form-panel apply-form">
        <fieldset><legend>主营游戏（可多选）</legend>{PRODUCT_GAMES.map(game=><label key={game}><input type="checkbox" checked={games.includes(game)} onChange={e=>setGames(current=>e.target.checked?[...current,game]:current.filter(g=>g!==game))}/>{game}</label>)}</fieldset><label htmlFor="seller-rank"><span>游戏段位（选填）</span><input id="seller-rank" value={rank} onChange={(event) => setRank(event.target.value)} placeholder="填写当前段位和星级" /></label>
        <label htmlFor="seller-kd"><span>K/D（选填）</span><input id="seller-kd" value={kd} onChange={(event) => setKd(event.target.value)} placeholder="填写当前 K/D" /></label>
        <label htmlFor="seller-experience"><span>游戏经验与擅长玩法（选填）</span><textarea id="seller-experience" value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="由陪玩自行填写擅长模式、玩法和经验" /></label>
        <div className="form-field"><span>游戏资料截图</span><button type="button" onClick={() => go("mediaWorkflow")}>＋ 上传截图</button></div>
        <div className="form-field voice-workflow-field"><span>声音名片（选填）</span><p>此申请页尚未接通音频上传，可不上传声音名片继续申请。</p></div>
      </section>
      {voicePrepared ? <PolicyChecklist title="声音名片公开试听确认" scene="VOICE_SAMPLE_UPLOAD" selectedIds={voicePolicyIds} onChange={setVoicePolicyIds} go={go} note="单独确认" /> : <section className="paper-panel voice-consent-placeholder"><b>声音名片公开试听需要单独确认</b><p>完成录制或上传后，才会出现对应协议；不上传声音名片不会替你授权。</p></section>}
      <button type="button" className="full-primary" disabled={voicePrepared && !voicePolicyIds.length} onClick={() => setStep(3)}>下一步</button>
    </> : <>
      <section className="paper-panel application-review-card"><SectionTitle title="确认申请资料" note="提交后进入平台审核" /><div><span>店铺名称</span><b>{nickname || "尚未填写"}</b></div><div><span>主页介绍</span><b>{intro || "尚未填写"}</b></div><div><span>主营游戏</span><b>{games.join("、") || "未选择"}</b></div><div><span>选填游戏资料</span><b>{rank || "未填写"} · K/D {kd || "--"}</b></div><div><span>游戏经验</span><b>{experience || "尚未填写"}</b></div><div><span>声音名片</span><b>未上传（选填）</b></div></section>
      <PolicyChecklist title="陪玩入驻与平台经营协议" scene="SELLER_ONBOARDING" selectedIds={sellerPolicyIds} onChange={setSellerPolicyIds} go={go} note="必需" />
      <PolicyChecklist title="实名信息处理确认" scene="IDENTITY_VERIFICATION" selectedIds={identityPolicyIds} onChange={setIdentityPolicyIds} go={go} note="单独确认" />
      <section className="paper-panel apply-agreement"><AppIcon kind="shield" /><span><b>提交即生成审核快照</b><small>三类确认分别记录版本和场景；审核中不能发布服务。</small></span></section>
      <div className="dual-actions application-submit-actions"><button type="button" onClick={() => setStep(2)}>返回修改</button><button type="button" disabled={submitting} onClick={() => void submitApplication()}>{submitting ? "正在提交…" : "提交平台审核"}</button></div>
    </>}
  </div>;
}
function ApplyScreen({ go, notify, state = "approved" }: { go: (page: PageId) => void; notify: (message: string) => void; state?: SellerApplicationState }) {
  const config: Record<SellerApplicationState, { icon: string; title: string; note: string; tone: string; reason?: string }> = {
    approved: { icon: "✓", title: "陪玩身份审核已通过", note: "你已经可以创建公开陪玩主页、发布服务和处理卖家订单。", tone: "approved" },
    reviewing: { icon: "…", title: "申请资料审核中", note: "资料已提交，正在等待平台审核，请留意系统通知。", tone: "reviewing" },
    supplement: { icon: "!", title: "需要补充申请资料", note: "请按审核意见修改指定字段后重新提交。", tone: "supplement", reason: "游戏资料截图不完整；声音名片存在明显环境噪音。" },
    rejected: { icon: "×", title: "本次申请未通过", note: "可以查看审核原因，修改资料后重新提交新版本。", tone: "rejected", reason: "申请资料无法证明当前游戏段位，请上传个人主页完整截图。" },
    suspended: { icon: "!", title: "陪玩资格已暂停", note: "暂停期间无法进入经营功能、发布服务或接取新订单。", tone: "suspended", reason: "近期履约异常率超过平台规则阈值，请在申诉期内补充说明。" },
  };
  const current = config[state];
  return <div className={`app-screen apply-screen application-state-${current.tone}`}><StatusBar /><Header title="陪玩申请状态" subtitle="审核通过后开启陪玩中心" back={() => go("settings")} /><div className="apply-progress"><span className="done"><i>✓</i><b>基本资料</b></span><span className="done"><i>✓</i><b>游戏资料</b></span><span className="active"><i>3</i><b>平台审核</b></span></div><DemoStateNotice /><section className="paper-panel apply-status bear-state-card"><StateBear scene={state === "approved" ? "sellerApplyStatus" : state === "reviewing" ? "sellerApplyReview" : state === "supplement" ? "sellerApplySupplement" : state === "rejected" ? "sellerApplyRejected" : "sellerApplySuspended"} /><h2>{current.title}</h2><p>{current.note}</p>{state === "approved" ? <button type="button" onClick={() => go("seller")}>进入陪玩中心</button> : state === "reviewing" ? <button type="button" disabled>审核中，请耐心等待</button> : state === "suspended" ? <button type="button" onClick={() => notify("申诉入口已打开")}>提交申诉</button> : <button type="button" onClick={() => go("sellerApplyForm")}>修改并重新提交</button>}</section>{current.reason ? <section className="paper-panel application-reason"><SectionTitle title={state === "suspended" ? "暂停原因" : "审核意见"} note="2026-08-19 20:06" /><p>{current.reason}</p></section> : null}<section className="paper-panel apply-info"><SectionTitle title="已提交资料" note="版本 V2" /><div><span>真实姓名认证</span><b>已完成</b></div><div><span>和平精英资料</span><b>无敌战神 · 52 星</b></div><div><span>声音名片</span><b>15 秒 · 已提交</b></div>{["supplement", "rejected"].includes(state) ? <button type="button" onClick={() => go("sellerApplyForm")}>按审核意见修改资料</button> : null}</section><button type="button" className="secondary-full" onClick={() => notify("已展开历次审核版本与处理记录")}>查看审核记录</button></div>;
}

function MerchantIdentity({ profile, go }: { profile: SellerApiView | null; go: (page: PageId) => void }) {
  return <header className="merchant-identity"><button type="button" onClick={() => go("sellerProfile")} aria-label="查看陪玩资料"><CatalogImage fileId={profile?.seller_avatar_file_id} src={DEFAULT_PLAYER_IMAGE} kind="avatar" alt="陪玩头像" /><span><b>{profile?.seller_nickname ?? "陪玩中心"}</b><small>{profile ? profile.accepting_orders ? "正在接单 · 陪玩卖家" : "休息中 · 陪玩卖家" : "正在加载资料…"}</small></span><em>›</em></button><IconButton label="返回买家端" onClick={() => go("mine")}><AppIcon kind="home" /></IconButton></header>;
}
function SellerCenterScreen({ go, onOrders }: { go: (page: PageId) => void; onOrders: (tab: string) => void }) {
  const [profile, setProfile] = useState<SellerApiView | null>(null);
  const [orders, setOrders] = useState<OrderApiView[]>([]); const [products, setProducts] = useState<ProductApiView[]>([]);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState("");
  const reload = useCallback(async () => { setLoading(true); setLoadError(""); try {
    const [seller, rows, services] = await Promise.all([apiRequest<SellerApiView>("/seller/profile"), loadCursorItems<OrderApiView>("/seller/orders"), apiRequest<ProductApiView[]>("/seller/services")]);
    setProfile(seller); setOrders(rows); setProducts(services);
  } catch (cause) { setLoadError(apiMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void reload(); }, [reload]);
  const today = merchantMetrics(orders, "今日");
  return <div className="app-screen seller-screen"><div className="merchant-brand-header"><StatusBar /><div className="merchant-brand-caption">熊崽电竞 · 卖家端</div><MerchantIdentity profile={profile} go={go} /></div>
    {loading || loadError ? <section className="paper-panel live-data-state"><b>{loading ? "正在加载经营数据…" : "经营数据加载失败"}</b>{loadError && <><p>{loadError}</p><button type="button" onClick={() => void reload()}>重试</button></>}</section> : <>
    <section className="paper-panel merchant-overview" aria-label="订单待办和今日经营数据">
      <SectionTitle title="今日经营" />
      <div className="merchant-daily-grid"><button type="button" onClick={() => go("sellerMine")}><b>¥{formatCent(today.turnoverCent)}</b><span>今日营业额</span></button><button type="button" onClick={() => go("sellerMine")}><b>{today.orderCount}</b><span>今日订单数</span></button></div>
      <div className="merchant-order-shortcuts">{["待付款", "新订单", "服务中", "待确认", "售后"].map(tab => <button type="button" onClick={() => onOrders(tab)} key={tab}><b>{orders.filter(order => matchesOrderTab(order, tab, "seller")).length}</b><span>{tab === "新订单" ? "待接单" : tab === "售后" ? "退款售后" : tab}</span></button>)}</div>
    </section>
    <button type="button" className="paper-panel merchant-product-entry" aria-label="商品管理" onClick={() => go("sellerServices")}><AppIcon kind="service" className="seller-tool-icon" /><span><b>商品管理</b><small>发布商品 · 上架 / 下架</small></span><span className="merchant-product-count">{products.filter(row => row.status === "ON_SALE").length} 个在售</span><em>›</em></button>
    </>}<button type="button" className="secondary-full" onClick={() => go("sellerTradeOrders")}>V3.1 订单履约与售后 ›</button><SellerNav page="seller" go={go} /></div>;
}
function SellerMineScreen({ go, onPreview }: { go: (page: PageId) => void; onPreview: () => void }) {
  const [profile, setProfile] = useState<SellerApiView | null>(null); const [summary, setSummary] = useState<FinanceSummaryApi | null>(null);
  const [orders, setOrders] = useState<OrderApiView[]>([]); const [range, setRange] = useState<MerchantPeriod>("今日");
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try {
    const [profile, summary, orders] = await Promise.all([apiRequest<SellerApiView>("/seller/profile"), apiRequest<FinanceSummaryApi>("/seller/finance/summary"), loadCursorItems<OrderApiView>("/seller/orders")]);
    setProfile(profile); setSummary(summary); setOrders(orders);
  } catch (cause) { setError(apiMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const metrics = merchantMetrics(orders, range);
  return <div className="app-screen seller-mine-screen"><StatusBar /><MerchantIdentity profile={profile} go={go} />
    {loading || error ? <section className="paper-panel live-data-state"><b>{loading ? "正在加载账户与经营数据…" : "数据加载失败"}</b>{error && <><p>{error}</p><button type="button" onClick={() => void load()}>重试</button></>}</section> : <>
    <section className="earnings-balance merchant-balance"><span>可提现金额</span><b>¥{formatCent(summary!.available_cent)}</b><button type="button" disabled={summary!.withdrawal_paused} onClick={() => go("withdraw")}>{summary!.withdrawal_paused ? "提现暂停" : "提现"}</button><button type="button" onClick={() => go("sellerEarnings")}>资金明细 ›</button></section>
    <section className="paper-panel merchant-period-card"><SectionTitle title="经营数据" /><div className="merchant-period-tabs" role="tablist" aria-label="营业额统计时段">{merchantPeriods.map(period => <button type="button" role="tab" aria-selected={range === period} onClick={() => setRange(period)} key={period}>{period}</button>)}</div><div className="merchant-metrics"><div><b>¥{formatCent(metrics.turnoverCent)}</b><span>{range}营业额</span></div><div><b>{metrics.orderCount}</b><span>{range}订单数</span></div><div><b>¥{formatCent(metrics.refundCent)}</b><span>订单已退金额</span></div></div><small className="merchant-metric-note">按下单时间统计 · 营业额为已付金额，未扣退款和平台费用</small></section>
    <section className="paper-panel merchant-account-links"><button type="button" onClick={onPreview}><AppIcon kind="mine" /><span>预览主页</span><em>›</em></button>{[["wallet", "收益明细", "sellerEarnings"], ["withdraw", "提现记录", "withdrawals"], ["wallet", "收款账户", "payoutAccounts"], ["mine", "主页资料", "sellerProfile"], ["setting", "账号设置", "settings"], ["service", "平台客服", "customerService"]].map(([icon, label, page]) => <button type="button" onClick={() => go(page as PageId)} key={label}><AppIcon kind={icon} /><span>{label}</span><em>›</em></button>)}</section>
    </>}<button type="button" className="secondary-full" onClick={() => go("sellerTradeFunds")}>V3.1 退款、冻结与结算明细 ›</button><SellerNav page="sellerMine" go={go} /></div>;
}

function SellerServicesScreen({ go, notify, tab, setTab, submittedServiceTitle }: { go: (page: PageId) => void; notify: (message: string) => void; tab: string; setTab: (tab: string) => void; submittedServiceTitle: string }) {
  const [working, setWorking] = useState("");
  const [confirmation, setConfirmation] = useState<ProductApiView | null>(null);
  const [expanded, setExpanded] = useState<ProductApiView | null>(null);
  const [apiServices, setApiServices] = useState<ProductApiView[]>([]); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState("");
  const reload = useCallback(async () => { setLoading(true); setLoadError(""); try { setApiServices(await apiRequest<ProductApiView[]>("/seller/services")); } catch (cause) { if (navigator.onLine !== false) setApiServices([]); setLoadError(apiMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload, submittedServiceTitle]);
  const changeListing = async (row: ProductApiView) => {
    setWorking(row.id); setConfirmation(null);
    try { await apiRequest(`/seller/services/${row.id}/${row.status === "ON_SALE" ? "off-sale" : "submit-review"}`, { method: "POST", body: JSON.stringify({ version: row.version }) });
      notify(row.status === "ON_SALE" ? "商品已下架" : "商品已提交审核，通过后上架"); await reload();
    } catch (cause) { notify(apiMessage(cause)); } finally { setWorking(""); }
  };
  const viewDetails = async (row: ProductApiView) => { setWorking(row.id); try { setExpanded(await apiRequest<ProductApiView>(`/seller/services/${row.id}`)); } catch(cause) { notify(apiMessage(cause)); } finally { setWorking(""); } };
  const tabStatuses: Record<string, string[]> = { "出售中": ["ON_SALE"], "审核中": ["PENDING_REVIEW", "REVIEW_REJECTED"], "已下架": ["OFF_SALE", "ADMIN_OFF_SALE", "DELETED"], "草稿箱": ["DRAFT"] };
  const visibleRows = apiServices.filter((item) => tabStatuses[tab]?.includes(item.status)); const counts = Object.fromEntries(Object.entries(tabStatuses).map(([name, statuses]) => [name, apiServices.filter((item) => statuses.includes(item.status)).length]));
  return <div className="app-screen seller-services-screen"><StatusBar /><Header title="商品管理" variant="centered" back={() => go("seller")} actions={<button type="button" className="seller-add" onClick={() => go("sellerPublish")}>＋ 发布商品</button>} /><div className="segmented seller-service-tabs">{["出售中", "审核中", "已下架", "草稿箱"].map((name) => <button type="button" className={tab === name ? "active" : ""} onClick={() => setTab(name)} key={name}>{name} {counts[name] ?? 0}</button>)}</div>{loading ? <section className="paper-panel live-data-state"><b>正在加载服务…</b></section> : loadError ? <section className="paper-panel live-data-state failed"><RequestErrorBear message={loadError} hasContent={apiServices.length > 0} /><b>服务加载失败</b><p>{loadError}</p><button type="button" onClick={() => void reload()}>重试</button></section> : null}{(!loading && !loadError) || apiServices.length > 0 ? <section className="seller-service-list">{visibleRows.map((row, index) => { const service = serviceFromApi(row, index); const rejected = row.status === "REVIEW_REJECTED"; const statusLabel = ({ DRAFT: "草稿", PENDING_REVIEW: "审核中", REVIEW_REJECTED: "审核未通过", ON_SALE: "出售中", OFF_SALE: "已下架", ADMIN_OFF_SALE: "平台下架", DELETED: "已删除" } as Record<string, string>)[row.status] ?? row.status; return <article className={rejected ? "audit-rejected" : ""} key={row.id}><CatalogImage src={service.cover} fileId={service.coverFileId} alt={service.title} /><div><b>{service.title}</b><small>¥{formatCent(service.priceCent)} 起 · {service.sold} 单</small><span>{statusLabel}</span></div><div className="merchant-product-actions"><button type="button" disabled={working === row.id} onClick={() => void viewDetails(row)}>商品详情</button>{["ON_SALE", "OFF_SALE", "DRAFT", "REVIEW_REJECTED"].includes(row.status) && <button type="button" disabled={working === row.id} onClick={() => setConfirmation(row)}>{working === row.id ? "处理中…" : row.status === "ON_SALE" ? "下架商品" : row.status === "OFF_SALE" ? "重新上架" : "提交审核"}</button>}</div></article>; })}</section> : null}{!loading && !loadError && visibleRows.length === 0 ? <ContextStateScreen go={go} kind="services" embedded /> : null}{tab === "已下架" ? <button type="button" className="empty-helper" onClick={() => notify("服务重新上架后需平台审核")}>了解重新上架规则</button> : null}{expanded && <section className="paper-panel merchant-product-details"><SectionTitle title={expanded.title} action="收起" onAction={() => setExpanded(null)} /><p>{expanded.description}</p>{expanded.skus?.map(sku => <div key={sku.id}><span>{sku.sku_name} · {sku.duration_minutes} 分钟</span><b>¥{formatCent(sku.price_cent)}</b></div>)}</section>}{confirmation && <ConfirmDialog title={confirmation.status === "ON_SALE" ? "下架这个商品？" : "提交商品审核？"} text={confirmation.status === "ON_SALE" ? "下架后买家无法继续购买，已有订单不受影响。" : "商品通过平台审核后才会对买家展示。"} confirmText="确认" onCancel={() => setConfirmation(null)} onConfirm={() => void changeListing(confirmation)} />}<SellerNav page="sellerServices" go={go} /></div>;
}

function SellerPublishScreen({ go }: { go:(page:PageId)=>void;notify:(message:string)=>void;onSubmitted:(title:string)=>void }) {return <ConnectedProductForm back={()=>go("sellerServices")}/>;}
function SellerServiceEditScreen({go}: {go:(page:PageId)=>void;notify:(message:string)=>void}) {return <div className="app-screen decision-page"><Header title="编辑商品" back={()=>go("sellerServices")}/><p>请从商品管理选择具体商品。当前正式接口的新版商品字段保存尚未接通，不显示虚构商品或保存成功。</p><button onClick={()=>go("sellerServices")}>返回商品管理</button></div>;}

function ServiceAuditDetailScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  return <div className="app-screen service-audit-detail-screen"><DemoStateNotice /><Header title="服务审核详情" subtitle="审核单 SH202608190028" back={() => go("sellerServices")} /><section className="audit-state-card rejected"><span>!</span><div><h2>审核未通过</h2><p>请修改后重新提交，原服务不会展示给买家。</p></div></section><section className="checkout-service audit-service-card"><img src={services[3].cover} alt={services[3].title} /><span><b>{services[3].title}</b><small>¥45.00 起 · 4 个服务规格</small><em>提交时间：2026-08-19 18:36</em></span></section><section className="paper-panel audit-reason-panel"><SectionTitle title="审核意见" note="内容安全审核" /><h3>服务说明包含外部联系方式</h3><p>“添加微信后进群约时间”不符合平台交易规则。请删除微信、QQ、手机号、群聊等站外联系方式，服务沟通需在平台内完成。</p><div><span>需修改字段</span><b>服务详情</b></div><div><span>审核时间</span><b>2026-08-19 19:02</b></div></section><section className="paper-panel audit-rule-note"><AppIcon kind="shield" /><span><b>修改后将重新进入审核队列</b><small>预计 1 个工作日内完成审核，审核中不可出售。</small></span></section><div className="sticky-double-actions"><button type="button" onClick={() => notify("已展开平台内容规范")}>查看审核规则</button><button type="button" onClick={() => go("sellerServiceEdit")}>修改服务</button></div></div>;
}

function SellerOrdersScreen({ go, notify, onSelect, initialFilter = "全部" }: { initialFilter?: string; go: (page: PageId) => void; notify: (message: string) => void; onSelect: (order: OrderApiView) => void }) {
  const [tab, setTab] = useState(initialFilter); const [orders, setOrders] = useState<OrderApiView[]>([]); const [working, setWorking] = useState(""); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState("");
  const reload = useCallback(async () => { setLoading(true); setLoadError(""); try { setOrders(await loadCursorItems<OrderApiView>("/seller/orders")); } catch (cause) { if (navigator.onLine !== false) setOrders([]); setLoadError(apiMessage(cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const action = async (order: OrderApiView) => { const path = sellerFulfillmentAction(order); if (!path) { onSelect(order); go(sellerOrderPage(order.status)); return; } setWorking(order.id); try { const updated = await apiRequest<OrderApiView>(`/seller/orders/${order.id}/${path}`, { method: "POST", body: JSON.stringify({ version: order.version }) }); onSelect(updated); notify(path === "accept" ? "接单成功，预约时段继续锁定" : path === "start" ? "服务已开始" : "已提交完成，等待买家确认"); await reload(); } catch (cause) { notify(apiMessage(cause)); } finally { setWorking(""); } };
  const rows = orders.map((order) => ({ buyer: `买家 ${order.buyer_id.slice(0, 8)}`, status: sellerOrderLabel(order), title: order.product_title, action: ({ accept: "接单", start: "开始服务", complete: "完成服务" } as Record<string, string>)[sellerFulfillmentAction(order) ?? ""] ?? "查看详情", priceCent: order.payable_amount_cent, page: sellerOrderPage(order.status), raw: order })); const visible = rows.filter((order) => matchesOrderTab(order.raw, tab, "seller"));
  return <div className="app-screen seller-orders-screen"><StatusBar /><Header title="订单管理" variant="centered" back={() => go("seller")} /><div className="order-filter seller-order-filter">{sellerOrderTabs.map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>{loading ? <section className="paper-panel live-data-state"><b>正在加载卖家订单…</b></section> : loadError ? <section className="paper-panel live-data-state failed"><RequestErrorBear message={loadError} hasContent={orders.length > 0} /><b>卖家订单加载失败</b><p>{loadError}</p><button type="button" onClick={() => void reload()}>重试</button></section> : null}{(!loading && !loadError) || orders.length > 0 ? <section className="buyer-order-list seller-buyer-order-list">{visible.map((order, orderIndex) => { const cover = ["/assets/product-hero.png", "/assets/home-hero.png", "/assets/publish-arcade.png", "/assets/player-poster.png"][orderIndex % 4]!; const buyer = { id: order.raw.buyer_id, name: order.buyer, image: "/assets/player-luye.png", level: 1, rank: "平台买家", rating: "5.0", completed: 0, services: 0, tags: [] }; return <article className="buyer-order-card seller-buyer-order-card" key={order.raw.id}><div className="seller-order-buyer"><Avatar companion={buyer} size="md" /><span><b>{order.buyer}</b><small>订单备注：{order.raw.buyer_note ?? "未填写"}</small></span><em>{order.status}</em></div><button type="button" className="buyer-order-product seller-order-product-card" onClick={() => { onSelect(order.raw); go(order.page); }}><CatalogImage src={order.raw.product_image || cover} alt={order.title} /><span><b>{order.title}</b><small>{order.raw.sku_name} · ×{order.raw.quantity}</small>{order.raw.rule_version !== "V3.1" && <small>预约 {new Date(order.raw.service_starts_at).toLocaleString("zh-CN")}</small>}</span><strong>¥{formatCent(order.priceCent)}</strong></button><div className="buyer-order-actions seller-buyer-order-actions"><button type="button" className="contact-buyer" onClick={() => { onSelect(order.raw); go("chat"); }}>联系买家</button><button type="button" disabled={working === order.raw.id} onClick={() => void action(order.raw)}>{working === order.raw.id ? "处理中…" : order.action}</button></div></article>; })}</section> : null}{!loading && !loadError && visible.length === 0 ? <ContextStateScreen go={go} kind="sellerOrders" embedded /> : null}<SellerNav page="sellerOrders" go={go} /></div>;
}

function sellerOrderLabel(order: OrderApiView) { return commerceOrderLabel(order, "seller"); }
function sellerOrderPage(status: string): SellerPage { return ({ PENDING_ACCEPT: "sellerOrderDetail", ACCEPTED: "sellerOrderAccepted", IN_SERVICE: "sellerOrderInService", PENDING_BUYER_CONFIRM: "sellerOrderPendingConfirm", COMPLETED: "sellerOrderCompleted", CLOSED: "sellerOrderClosed", CANCELLED: "sellerOrderClosed", SELLER_REJECTED: "sellerOrderClosed" } as Record<string, SellerPage>)[status] ?? "sellerOrderDetail"; }

function SellerOrderDetailScreen({ go, notify, state = "pending", order, onUpdated }: { go: (page: PageId) => void; notify: (message: string) => void; state?: SellerOrderState; order: OrderApiView | null; onUpdated: (order: OrderApiView) => void }) {
  const [dialog, setDialog] = useState<"accept" | "reject" | "start" | "complete" | "">("");
  if (!order) return <ContextStateScreen go={go} kind="orders" />;
  const config: Record<SellerOrderState, { label: string; title: string; note: string; active: number; amount: string }> = {
    pending: { label: "新订单 · 等待接单", title: "等待接单", note: "请核对预约时间与服务内容后处理订单。", active: 1, amount: "¥22.50" },
    accepted: { label: "已接单 · 等待开始", title: "预约明天 20:00", note: "预约时段已经锁定。请在与买家确认需求后，按时点击开始服务。", active: 1, amount: "¥22.50" },
    inService: { label: "服务中", title: "今晚 20:00 已开始", note: "请按约定提供服务。服务结束后由陪玩发起完成确认。", active: 2, amount: "¥22.50" },
    pendingConfirm: { label: "等待买家确认", title: "已提交完成", note: "买家将在 24 小时内确认；超时无异议将自动完成。", active: 3, amount: "¥22.50" },
    completed: { label: "订单已完成", title: "收益已结算", note: "本单陪玩收入已转入可提现余额。", active: 4, amount: "¥22.50" },
    closed: { label: "订单已关闭", title: "未产生收入", note: "订单因超时未接单或双方取消而关闭。", active: 1, amount: "¥0.00" },
    refunded: { label: "订单已退款", title: "退款 ¥25.00", note: "退款已原路退回买家，本单不计入陪玩收入。", active: 4, amount: "−¥22.50" },
  };
  const actualState = order.payment_status === "REFUNDED" ? "refunded" : ({ PENDING_ACCEPT: "pending", ACCEPTED: "accepted", IN_SERVICE: "inService", PENDING_BUYER_CONFIRM: "pendingConfirm", COMPLETED: "completed", CLOSED: "closed", SELLER_REJECTED: "closed" } as Record<string, SellerOrderState>)[order.status] ?? state; const afterSaleActive = order.after_sale_status !== "NONE" && order.payment_status !== "REFUNDED"; const unpaid = order.status === "PENDING_PAYMENT";
  const current = unpaid ? { ...config.pending, label: "待付款", title: "等待买家付款", note: "付款完成后可接单，当前无需安排服务。", active: 0 } : afterSaleActive ? { ...config[actualState], label: "售后处理中", title: "请先处理售后", note: "当前订单正在处理售后，履约操作暂不可用。" } : config[actualState];
  const commit = async () => { if (!dialog || unpaid || order.payment_status !== "PAID") return; const path = dialog === "accept" ? "accept" : dialog === "reject" ? "reject" : dialog === "start" ? "start" : "complete"; try { const updated = await apiRequest<OrderApiView>(`/seller/orders/${order.id}/${path}`, { method: "POST", body: JSON.stringify(path === "reject" ? { version: order.version, reason: "陪玩无法履约当前预约" } : { version: order.version }) }); onUpdated(updated); setDialog(""); notify(path === "accept" ? "接单成功" : path === "reject" ? "订单已拒绝" : path === "start" ? "服务已开始" : "已提交完成"); go(sellerOrderPage(updated.status)); } catch (cause) { setDialog(""); notify(apiMessage(cause)); } };
  const buyer = { id: order.buyer_id, name: `买家 ${order.buyer_id.slice(0, 8)}`, image: "/assets/player-luye.png", level: 1, rank: "平台买家", rating: "0.00", completed: 0, services: 0, tags: [] };
  return <div className={`app-screen seller-order-detail-screen seller-order-state-${actualState}`}><Header title="卖家订单详情" subtitle={`订单 ${order.order_no}`} back={() => go("sellerOrders")} /><section className="seller-order-status"><span>{current.label}</span><h2>{current.title}</h2><p>{current.note}</p></section>{order.rule_version !== "V3.1" && <OrderTimeline active={current.active} />}<section className="paper-panel buyer-contact-card"><Avatar companion={buyer} size="md" /><span><b>{buyer.name}</b><small>{new Date(order.service_starts_at).toLocaleString("zh-CN")} · 平台内文字沟通</small></span><button type="button" onClick={() => go("chat")}>联系买家</button></section><section className="checkout-service seller-order-product"><CatalogImage src="/assets/product-hero.png" alt={order.product_title} /><span><b>{order.product_title}</b><small>{order.sku_name} · 约 {order.sku_duration_minutes * order.quantity} 分钟</small><em>备注：{order.buyer_note ?? "未填写"}</em></span><strong>¥{formatCent(order.payable_amount_cent)}</strong></section><section className="paper-panel order-facts"><div><span>陪玩收入</span><b>¥{formatCent(order.seller_income_cent)}</b></div><div><span>平台服务费</span><b>¥{formatCent(order.platform_fee_cent)}</b></div><div><span>下单时间</span><b>{new Date(order.created_at).toLocaleString("zh-CN")}</b></div><div><span>期望时间</span><b>{new Date(order.service_starts_at).toLocaleString("zh-CN")}</b></div></section><section className="paper-panel seller-action-note"><AppIcon kind="shield" /><span><b>履约操作将记录在订单时间线</b><small>平台内沟通和状态操作会作为售后处理依据。</small></span></section>{unpaid ? <div className="seller-order-actions single"><button type="button" onClick={() => go("sellerOrders")}>返回订单列表</button></div> : afterSaleActive ? <div className="seller-order-actions"><button type="button" onClick={() => go("chat")}>联系买家</button><button type="button" onClick={() => go("customerService")}>联系平台客服</button></div> : actualState === "pending" ? <div className="seller-order-actions"><button type="button" onClick={() => setDialog("reject")}>拒绝订单</button><button type="button" onClick={() => setDialog("accept")}>确认接单</button></div> : actualState === "accepted" ? <div className="seller-order-actions"><button type="button" onClick={() => go("chat")}>联系买家</button><button type="button" onClick={() => setDialog("start")}>开始服务</button></div> : actualState === "inService" ? <div className="seller-order-actions"><button type="button" onClick={() => go("chat")}>联系买家</button><button type="button" onClick={() => setDialog("complete")}>完成服务</button></div> : actualState === "pendingConfirm" ? <div className="seller-order-actions"><button type="button" onClick={() => go("chat")}>联系买家</button><button type="button" onClick={() => notify("已提醒买家确认服务")}>提醒确认</button></div> : <div className="seller-order-actions single"><button type="button" onClick={() => go(actualState === "refunded" ? "sellerRefund" : "sellerOrders")}>查看完整记录</button></div>}{dialog ? <ConfirmDialog title={dialog === "accept" ? "确认接下订单？" : dialog === "reject" ? "确认拒绝订单？" : dialog === "start" ? "确认开始服务？" : "确认服务已完成？"} text="本次操作会使用当前订单版本执行，并写入状态日志与 Outbox。" confirmText="确认操作" tone={dialog === "reject" ? "danger" : "blue"} onCancel={() => setDialog("")} onConfirm={() => void commit()} /> : null}</div>;
}

function SellerRefundScreen({ go, notify, refund, onUpdated }: { go: (page: PageId) => void; notify: (message: string) => void; refund: RefundApiView | null; onUpdated: (refund: RefundApiView) => void }) {
  const [action, setAction] = useState<"agree" | "reject" | "">(""); const [reason, setReason] = useState("");
  useEffect(() => { if (refund) return; void apiRequest<RefundApiView[]>("/seller/refunds").then((rows) => { if (rows[0]) onUpdated(rows[0]); }).catch(() => undefined); }, [refund, onUpdated]);
  const decide = async (decision: "APPROVE" | "REJECT", decisionReason: string) => { if (!refund) { notify("暂无待处理退款"); return; } try { const updated = await apiRequest<RefundApiView>(`/seller/refunds/${refund.id}/decision`, { method: "POST", body: JSON.stringify({ version: refund.version, decision, reason: decisionReason }) }); onUpdated(updated); setAction(""); notify(decision === "APPROVE" ? "已同意退款，支付渠道处理中" : "已提交拒绝意见，等待买家处理"); go(decision === "APPROVE" ? "sellerOrderRefunded" : "sellerOrders"); } catch (error) { notify(apiMessage(error)); } };
  return <div className="app-screen seller-refund-screen"><Header title="处理退款" subtitle={`退款单 ${refund?.refund_no ?? "—"}`} back={() => go("sellerOrders")} /><section className="refund-countdown"><span>{refund?.status === "REQUESTED" ? "待陪玩处理" : refund?.status ?? "暂无待处理退款"}</span><b>请及时处理</b><p>陪玩处理、平台介入和渠道退款均会保留状态日志。</p></section><section className="checkout-service seller-order-product"><img src={services[0].cover} alt={services[0].title} /><span><b>{services[0].title}</b><small>关联订单 {refund?.order_id ?? "—"}</small><em>申请退款 ¥{formatCent(refund?.requested_amount_cent ?? "0")}</em></span></section><section className="paper-panel seller-refund-facts"><SectionTitle title="买家退款申请" note={refund ? new Date(refund.created_at).toLocaleString("zh-CN") : "—"} /><div><span>退款金额</span><b>¥{formatCent(refund?.requested_amount_cent ?? "0")}</b></div><div><span>退款原因</span><b>{refund?.reason_text ?? "—"}</b></div><div><span>买家说明</span><b>{refund?.description ?? "未补充说明"}</b></div></section>{action === "reject" ? <section className="form-panel seller-reject-form"><label><span>拒绝退款原因</span><CartoonSelect aria-label="退款原因" value={reason} onChange={(event) => setReason(event.target.value)}><option value="">请选择原因</option><option>已按约定完成服务</option><option>买家未按约定配合</option><option>其他原因</option></CartoonSelect></label></section> : null}<section className="paper-panel seller-refund-rule"><AppIcon kind="shield" /><span><b>请根据实际履约情况处理</b><small>拒绝退款后买家可申请平台介入，平台将核验聊天记录和订单状态。</small></span></section><div className="seller-order-actions"><button type="button" disabled={refund?.status !== "REQUESTED"} onClick={() => setAction("reject")}>拒绝退款</button><button type="button" disabled={refund?.status !== "REQUESTED"} onClick={() => setAction("agree")}>同意退款</button></div>{action === "agree" ? <ConfirmDialog title="确认同意退款？" text={`确认后 ¥${formatCent(refund?.requested_amount_cent ?? "0")} 将提交原支付渠道。`} confirmText="同意并退款" onCancel={() => setAction("")} onConfirm={() => void decide("APPROVE", "陪玩同意退款申请")} /> : null}{action === "reject" && reason ? <ConfirmDialog title="确认拒绝退款？" text="拒绝原因将同步给买家。若买家申请平台介入，请配合补充证据。" confirmText="提交拒绝" tone="danger" onCancel={() => setAction("")} onConfirm={() => void decide("REJECT", reason)} /> : null}</div>;
}

function SellerEarningsScreen({ go }: { go: (page: PageId) => void }) {
  const now = new Date(); const todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; const [range, setRange] = useState<EarningsRange>("本周"); const [customStart, setCustomStart] = useState(""); const [customEnd, setCustomEnd] = useState(todayValue);
  const [summary,setSummary]=useState<FinanceSummaryApi|null>(null); const [incomeRows,setIncomeRows]=useState<IncomeApiView[]>([]); const [loadError,setLoadError]=useState("");
  const load=useCallback(async()=>{setLoadError("");try{const [nextSummary,nextIncomes]=await Promise.all([apiRequest<FinanceSummaryApi>("/seller/finance/summary"),apiRequest<IncomeApiView[]>("/seller/finance/incomes")]);setSummary(nextSummary);setIncomeRows(nextIncomes);}catch(cause){setLoadError(apiMessage(cause));}},[]); useEffect(()=>{void Promise.resolve().then(load);},[load]);
  const earliestIncome = incomeRows.length ? incomeRows.reduce((earliest, row) => new Date(row.created_at) < earliest ? new Date(row.created_at) : earliest, new Date(incomeRows[0].created_at)) : new Date(now.getFullYear(), 0, 1); const earliestValue = `${earliestIncome.getFullYear()}-${String(earliestIncome.getMonth() + 1).padStart(2, "0")}-${String(earliestIncome.getDate()).padStart(2, "0")}`; const effectiveStart = customStart || earliestValue; const customDatesValid = Boolean(effectiveStart && customEnd && effectiveStart <= customEnd);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const startOfYesterday = new Date(startOfToday.getTime()-86_400_000); const startOfWeek = new Date(startOfToday.getTime()-6*86_400_000); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); const startOfYear = new Date(now.getFullYear(), 0, 1); const customStartDate = new Date(`${effectiveStart}T00:00:00`); const customEndDate = new Date(`${customEnd}T23:59:59.999`);
  const selectedRows=incomeRows.filter((row)=>{const created=new Date(row.created_at);if(range==="今日")return created>=startOfToday;if(range==="昨日")return created>=startOfYesterday&&created<startOfToday;if(range==="本周")return created>=startOfWeek;if(range==="本月")return created>=startOfMonth;if(range==="本年")return created>=startOfYear;return customDatesValid&&created>=customStartDate&&created<=customEndDate;}); const amountCent=selectedRows.reduce((total,row)=>total+BigInt(row.seller_amount_cent),0n); const averageCent=selectedRows.length?amountCent/BigInt(selectedRows.length):0n;
  if(loadError && (!summary || navigator.onLine !== false))return <div className="app-screen seller-earnings-screen"><Header title="收益中心" back={()=>go("seller")}/><section className="paper-panel live-data-state failed"><RequestErrorBear message={loadError} /><b>收益数据加载失败</b><p>{loadError}</p><button type="button" onClick={()=>void load()}>重试</button></section></div>;
  return <div className="app-screen seller-earnings-screen"><StatusBar /><Header title="收益中心" subtitle="按时间查看真实收益" back={() => go("sellerMine")} actions={<IconButton label="提现记录" onClick={() => go("withdrawals")}><AppIcon kind="order" /></IconButton>} />{loadError ? <section className="paper-panel live-data-state"><RequestErrorBear message={loadError} hasContent /><b>收益数据未更新</b><p>{loadError}</p><button type="button" onClick={() => void load()}>重试</button></section> : null}<section className="earnings-balance"><span>可提现金额</span><b>¥{formatCent(summary?.available_cent??"0")}</b><button type="button" disabled={summary?.withdrawal_paused} onClick={() => go("withdraw")}>{summary?.withdrawal_paused?"提现暂停":"提现"}</button><small>待结算 ¥{formatCent(summary?.pending_cent??"0")} · 欠款 ¥{formatCent(summary?.liability_cent??"0")}</small></section><div className="earnings-range-tabs">{(["今日", "昨日", "本周", "本月", "本年", "累计"] as EarningsRange[]).map((item) => <button type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)} key={item}>{item}</button>)}</div>{range === "累计" ? <section className="earnings-date-range" aria-label="累计收益日期范围"><b className="earnings-date-range-title"><i>日</i><span>自定义累计区间</span></b><label><span>开始日期</span><input type="date" value={effectiveStart} max={customEnd || todayValue} onChange={(event) => setCustomStart(event.target.value)} /></label><i>至</i><label><span>结束日期</span><input type="date" value={customEnd} min={effectiveStart} max={todayValue} onChange={(event) => setCustomEnd(event.target.value)} /></label><small className={customDatesValid ? "" : "invalid"}>{customDatesValid ? `${formatChineseDate(effectiveStart)} 至 ${formatChineseDate(customEnd)}` : "开始日期不能晚于结束日期"}</small></section> : null}<section className="earnings-summary"><div><span>{range === "累计" ? "区间" : range}收益</span><b>¥{formatCent(amountCent.toString())}</b><small>{selectedRows.length} 笔已完成收益</small></div><div><span>平均单笔</span><b>¥{formatCent(averageCent.toString())}</b><small>按当前筛选计算</small></div><div><span>锁定中</span><b>¥{formatCent(summary?.locked_cent??"0")}</b><small>等待平台或渠道处理</small></div></section><section className="paper-panel income-list"><SectionTitle title="收益明细" note={`${incomeRows.length} 笔`} action="全部 ›" onAction={() => go("incomeDetails")} />{summary && incomeRows.length === 0 ? <section className="bear-inline-empty"><StateBear scene="income" /><b>暂无收益明细</b></section> : null}{incomeRows.slice(0,3).map((income)=><div key={income.id}><span><b>订单 {income.order_id.slice(0,8)}</b><small>{income.status} · {new Date(income.created_at).toLocaleString("zh-CN")}</small></span><strong>+¥{formatCent(income.seller_amount_cent)}</strong></div>)}</section><SellerNav page="sellerEarnings" go={go} /></div>;
}

function formatChineseDate(value: string) { const [year, month, day] = value.split("-"); return `${year}年${month}月${day}日`; }

function IncomeDetailsScreen({ go }: { go: (page: PageId) => void }) {
  const [filter, setFilter] = useState("全部"); const [records,setRecords]=useState<IncomeApiView[]>([]); const [summary,setSummary]=useState<FinanceSummaryApi|null>(null);const [liabilities,setLiabilities]=useState<LiabilityApiView[]>([]); const [loaded,setLoaded]=useState(false); const [loadError,setLoadError]=useState("");
  useEffect(()=>{void Promise.all([apiRequest<IncomeApiView[]>("/seller/finance/incomes"),apiRequest<FinanceSummaryApi>("/seller/finance/summary"),apiRequest<LiabilityApiView[]>("/seller/finance/liabilities")]).then(([rows,next,debtRows])=>{setRecords(rows);setSummary(next);setLiabilities(debtRows);setLoaded(true);}).catch((cause)=>setLoadError(apiMessage(cause)));},[]);
  const visible=records.filter((item)=>filter==="全部"||(filter==="已结算"&&["AVAILABLE","WITHDRAWAL_LOCKED","WITHDRAWN"].includes(item.status))||(filter==="待结算"&&item.status==="PENDING_SETTLEMENT")||(filter==="退款"&&item.reversed_amount_cent!=="0"));
  return <div className="app-screen income-details-screen"><Header title="收益明细" subtitle="每笔收入与订单一一对应" back={() => go("sellerEarnings")} /><section className="income-total"><span>真实收益余额</span><b>¥{formatCent(summary?.available_cent??"0")}</b><small>锁定 ¥{formatCent(summary?.locked_cent??"0")} · 待结算 ¥{formatCent(summary?.pending_cent??"0")}</small></section>{liabilities.some(v=>v.outstanding_amount_cent!=="0")&&<section className="paper-panel ledger-note"><AppIcon kind="shield"/><span><b>有效欠款 ¥{formatCent(summary?.liability_cent??"0")}</b><small>已提现订单退款形成欠款，将按后续可用收益顺序抵扣。</small></span></section>}<div className="income-filters">{["全部", "已结算", "待结算", "退款"].map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>{loadError ? <section className="paper-panel live-data-state"><RequestErrorBear message={loadError} /><b>收益明细加载失败</b><p>{loadError}</p></section> : loaded && visible.length === 0 ? <section className="bear-inline-empty"><StateBear scene="income" eventKey={filter} /><b>暂无收益记录</b></section> : null}<section className="income-records">{visible.map((record) => <button type="button" onClick={() => go("sellerOrderDetail")} key={record.id}><span><b>订单 {record.order_id.slice(0,8)}</b><small>{new Date(record.created_at).toLocaleString("zh-CN")} · {record.status}</small></span><strong className={record.reversed_amount_cent!=="0"?"negative":""}>+¥{formatCent(record.seller_amount_cent)}</strong><em>›</em></button>)}</section><section className="paper-panel ledger-note"><AppIcon kind="shield" /><span><b>账务记录不可修改</b><small>退款或平台补偿会生成新的冲正记录，确保每笔资金变化可追溯。</small></span></section></div>;
}

function WithdrawScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [amount, setAmount] = useState(""); const [accounts,setAccounts]=useState<PayoutAccountApiView[]>([]); const [accountId,setAccountId]=useState(""); const [summary,setSummary]=useState<FinanceSummaryApi|null>(null); const [submitting,setSubmitting]=useState(false);
  useEffect(()=>{void Promise.all([apiRequest<PayoutAccountApiView[]>("/seller/payout-accounts"),apiRequest<FinanceSummaryApi>("/seller/finance/summary")]).then(([rows,next])=>{const supported=rows.filter((item)=>item.account_type==="WECHAT"||item.account_type==="ALIPAY");setAccounts(supported);setAccountId(supported.find(v=>v.is_default)?.id??supported[0]?.id??"");setSummary(next);}).catch(()=>undefined);},[]);
  const amountCent=yuanToCent(amount)??"0"; const estimatedFee=(BigInt(amountCent)*100n/10000n).toString(); const estimatedActual=(BigInt(amountCent)-BigInt(estimatedFee)).toString();
  const submit=async()=>{if(!accountId||BigInt(amountCent)<=0n){notify("请选择收款账户并填写正确金额");return;}setSubmitting(true);try{await apiRequest<WithdrawalApiView>("/seller/withdrawals",{method:"POST",headers:{"idempotency-key":`withdraw-${window.crypto.randomUUID()}`},body:JSON.stringify({payout_account_id:accountId,amount_cent:amountCent})});notify("提现申请已提交，收益已按 FIFO 锁定");go("withdrawals");}catch(error){notify(apiMessage(error));}finally{setSubmitting(false);}};
  return <div className="app-screen withdraw-screen">
    <Header title="收益提现" subtitle="本地测试仅支持微信、支付宝" back={() => go("sellerEarnings")} actions={<button type="button" className="preview-link" onClick={() => go("withdrawals")}>提现记录</button>} />
    <section className="test-channel-note" role="note"><b>TEST</b><span>微信与支付宝均为测试收款渠道，不会发起真实转账。</span></section>
    <section className="withdraw-balance"><span>可提现金额</span><b>¥{formatCent(summary?.available_cent??"0")}</b><small>{summary?.withdrawal_paused?`存在欠款 ¥${formatCent(summary.liability_cent)}，提现暂停`:"提现范围由当前平台配置校验"}</small></section>
    <section className="form-panel withdraw-form">
      <label htmlFor="withdraw-amount"><span>提现金额</span><div><b>¥</b><input id="withdraw-amount" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /><button type="button" onClick={() => setAmount(formatCent(summary?.available_cent??"0"))}>全部</button></div></label>
      <div className="form-field withdraw-account-field"><span>收款账户</span><div className="payment-account-switch">{accounts.map((item) => <button type="button" className={accountId === item.id ? "active" : ""} onClick={() => setAccountId(item.id)} key={item.id}><i>{item.account_type === "ALIPAY" ? "支" : "微"}</i><span><b>{item.account_type === "ALIPAY"?"支付宝":"微信"}</b><small>{item.display_mask} · {item.verification_status}</small></span><em>{accountId === item.id ? "✓" : ""}</em></button>)}</div><button type="button" className="manage-account" onClick={() => go("payoutAccounts")}>管理收款账户 ›</button></div>
    </section>
    <section className="paper-panel withdraw-fee"><div><span>提现金额</span><b>¥{formatCent(amountCent)}</b></div><div><span>手续费预估</span><b>¥{formatCent(estimatedFee)}</b></div><div><span>预计到账</span><b>¥{formatCent(estimatedActual.startsWith("-")?"0":estimatedActual)}</b></div></section>
    <section className="paper-panel withdraw-notice"><AppIcon kind="shield" /><span><b>预计 1–2 个工作日到账</b><small>提现申请需经过平台风控审核，处理结果会通过站内消息通知。</small></span></section>
    <button type="button" disabled={submitting||summary?.withdrawal_paused} className="full-primary" onClick={()=>void submit()}>{submitting?"提交中…":"确认提现"}</button>
  </div>;
}

function WithdrawalsScreen({ go }: { go: (page: PageId) => void }) {
  const [records,setRecords]=useState<WithdrawalApiView[]>([]);const [loaded,setLoaded]=useState(false);const [loadError,setLoadError]=useState("");useEffect(()=>{void apiRequest<WithdrawalApiView[]>("/seller/withdrawals").then((rows)=>{setRecords(rows);setLoaded(true);}).catch((cause)=>setLoadError(apiMessage(cause)));},[]);
  return <div className="app-screen withdrawals-screen"><Header title="提现记录" subtitle="查看申请进度与处理结果" back={() => go("sellerEarnings")} />{loadError ? <section className="paper-panel live-data-state"><RequestErrorBear message={loadError} /><b>提现记录加载失败</b><p>{loadError}</p></section> : loaded && records.length === 0 ? <section className="bear-inline-empty"><StateBear scene="withdrawals" /><b>暂无提现记录</b><p>发起提现后，可在这里查看申请进度。</p></section> : null}<section className="withdraw-record-list">{records.map((record) => <article key={record.id}><div><span>{record.status}</span><b>¥{formatCent(record.amount_cent)}</b><small>{new Date(record.created_at).toLocaleString("zh-CN")}</small></div><p>{record.reject_reason??`预计到账 ¥${formatCent(record.actual_amount_cent)}`}</p><button type="button" onClick={() => go(["FAILED","REJECTED","CLOSED"].includes(record.status) ? "withdraw" : "withdrawalDetail")}>{["FAILED","REJECTED","CLOSED"].includes(record.status) ? "重新申请" : "查看详情"}</button></article>)}</section><section className="paper-panel withdraw-help"><SectionTitle title="提现说明" /><p>处理中无法重复提交；到账或失败后会发送站内通知。失败时锁定收益会通过新账务交易释放。</p></section></div>;
}

function WithdrawalDetailScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [record,setRecord]=useState<WithdrawalApiView|null>(null);useEffect(()=>{void apiRequest<WithdrawalApiView[]>("/seller/withdrawals").then(async(rows)=>{if(rows[0])setRecord(await apiRequest<WithdrawalApiView>(`/seller/withdrawals/${rows[0].id}`));}).catch(()=>notify("提现详情加载失败"));},[notify]);
  return <div className="app-screen withdrawal-detail-screen"><Header title="提现记录详情" subtitle={`提现单 ${record?.withdrawal_no??"—"}`} back={() => go("withdrawals")} /><section className="withdrawal-detail-hero bear-state-card">{record && financeBearScene("withdrawal", record.status) ? <StateBear scene={financeBearScene("withdrawal", record.status)!} eventKey={`${record.id}:${record.status}`} /> : null}<span>{record?.status??"加载中"}</span><b>¥{formatCent(record?.amount_cent??"0")}</b><p>{record?.reject_reason??"资金状态以平台及渠道记录为准"}</p></section><section className="withdrawal-timeline">{record?.logs?.map((log,index)=><article className={index===record.logs!.length-1?"active":"done"} key={log.id}><i>{index+1}</i><span><b>{log.action}</b><small>{new Date(log.created_at).toLocaleString("zh-CN")} · {log.reason}</small></span></article>)}</section><section className="paper-panel withdrawal-detail-facts"><div><span>提现金额</span><b>¥{formatCent(record?.amount_cent??"0")}</b></div><div><span>手续费</span><b>¥{formatCent(record?.fee_cent??"0")}</b></div><div><span>预计到账</span><b>¥{formatCent(record?.actual_amount_cent??"0")}</b></div><div><span>渠道编号</span><b>{record?.provider_payout_no??"等待提交"}</b></div><div><span>申请时间</span><b>{record?new Date(record.created_at).toLocaleString("zh-CN"):"—"}</b></div><div><span>提现编号</span><b>{record?.withdrawal_no??"—"}</b></div></section><section className="paper-panel withdraw-help"><AppIcon kind="shield" /><span><b>资金状态以平台处理记录为准</b><small>提现失败会追加释放分录，不修改历史锁定记录。</small></span></section><button type="button" className="secondary-full" onClick={() => go("customerService")}>联系平台客服</button></div>;
}


function NotificationsScreen({ go, onSelect, onAnnouncementOpen, backPage = "messages" }: { onAnnouncementOpen: (kind: AnnouncementKind) => void; go: (page: PageId) => void; onSelect: (notification: NotificationApiView) => void; backPage?: PageId }) {
  const [tab, setTab] = useState("全部"); const [notices, setNotices] = useState<NotificationApiView[]>([]); const [loaded, setLoaded] = useState(false); const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { const controller = new AbortController(); void apiRequest<CursorResponse<NotificationApiView>>("/notifications?limit=50", { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setNotices(result.items); setLoaded(true); } }).catch((cause) => { if (!controller.signal.aborted) setLoadError(apiMessage(cause)); }); return () => controller.abort(); }, [retry]);
  const visible = tab === "全部" ? notices : notices.filter((item) => noticeGroup(item) === tab);
  const open = async (item: NotificationApiView) => { const selected = item.read_status === "READ" ? item : await apiRequest<NotificationApiView>(`/notifications/${item.id}/read`, { method: "POST" }).catch(() => item); setNotices((current) => current.map((row) => row.id === selected.id ? selected : row)); onSelect(selected); go("notificationDetail"); };
  return <div className="app-screen notification-screen"><Header variant="centered" title="官方通知" subtitle="订单、售后、账户与平台消息" back={() => go(backPage)} /><div className="notice-tabs">{["全部", "订单", "售后", "账户", "平台", "反馈"].map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>{tab === "全部" || tab === "平台" ? <section className="official-announcement-links" aria-label="平台公告">{homeAnnouncements.map((item) => <button type="button" key={item.id} onClick={() => onAnnouncementOpen(item.id)}><AppIcon kind="shield" /><span><b>{item.id === "reportTrade" ? "平台交易与举报说明" : "防诈骗安全提醒"}</b><small>平台公告 · 本地测试草案</small></span><em>›</em></button>)}</section> : null}<section className="notice-list">{visible.map((item) => <button type="button" className={item.read_status === "UNREAD" ? "unread" : ""} onClick={() => void open(item)} key={item.id}><i>{noticeGroup(item).slice(0, 1)}</i><span><b>{item.title}<time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></b><small>{String(item.content_variables.content ?? item.content_variables.message ?? "查看通知详情")}</small></span><em>›</em></button>)}</section>{loadError ? <section className="paper-panel live-data-state"><RequestErrorBear message={loadError} hasContent={notices.length > 0} /><b>通知暂未加载</b><p>{loadError}</p><button type="button" onClick={() => { setLoadError(""); setLoaded(false); setRetry(value => value + 1); }}>重新加载通知</button></section> : !loaded ? <section className="paper-panel live-data-state"><b>正在加载通知…</b></section> : null}{loaded && !loadError && visible.length === 0 ? <section className="paper-panel message-safety bear-inline-empty"><StateBear scene="messages" eventKey={tab} /><b>暂无通知</b><p>订单、账户与平台消息会显示在这里。</p></section> : null}</div>;
}

function NotificationDetailScreen({ go, notification, onTargetOpen }: { go: (page: PageId) => void; notification: NotificationApiView | null; onTargetOpen: (item: NotificationApiView, signal: AbortSignal) => Promise<void> }) {
  const [opening,setOpening]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null),lock=useRef(false);
  useEffect(()=>()=>request.current?.abort(),[]);
  const labels:Record<string,string>={ORDER:'查看订单',REFUND:'查看退款详情',COMPLAINT:'查看售后申诉',CONVERSATION:'查看会话'};
  const target=notification?.related_type?labels[notification.related_type]:null;
  const open=async()=>{if(!notification||!notification.related_id||lock.current)return;lock.current=true;setOpening(true);setError('');const c=new AbortController();request.current=c;try{await onTargetOpen(notification,c.signal)}catch(e){if(!c.signal.aborted)setError(apiMessage(e))}finally{lock.current=false;if(!c.signal.aborted)setOpening(false)}};
  return <div className="app-screen notification-detail-screen"><Header title="通知详情" subtitle={notification?`${noticeGroup(notification)}通知`:''} back={()=>go('notifications')}/><section className="paper-panel"><h1>{notification?.title??'尚未选择通知'}</h1><p>{notification?String(notification.content_variables.content??notification.content_variables.message??'请查看关联详情'):''}</p><small>{notification?new Date(notification.created_at).toLocaleString('zh-CN'):''}</small></section>{target?<button className="full-primary" disabled={opening||!notification?.related_id} onClick={()=>void open()}>{opening?'正在读取…':target}</button>:notification?.related_id?<p className="decision-info">此类通知的详情接口尚未接通，当前可查看通知原文。</p>:null}{error&&<p role="alert">{error}<button onClick={()=>void open()}>重试</button></p>}</div>;
}

function ComplaintDetailScreen({ go, notify, state = "processing", complaint, onUpdated }: { go: (page: PageId) => void; notify: (message: string) => void; state?: ComplaintState; complaint: ComplaintApiView | null; onUpdated: (complaint: ComplaintApiView) => void }) {
  const config: Record<ComplaintState, { title: string; note: string; handler: string }> = {
    processing: { title: "平台处理中", note: "预计 24 小时内给出首次处理结果", handler: "平台交易专员" },
    evidence: { title: "需要补充证据", note: "请在 12 小时内补充关键聊天或服务记录", handler: "平台交易专员" },
    completed: { title: "投诉处理完成", note: "平台已给出处理结论并同步关联订单", handler: "平台客服主管" },
    closed: { title: "投诉已关闭", note: "本次投诉已撤回或不符合受理条件", handler: "平台系统" },
  };
  const derived: ComplaintState = complaint?.status === "NEED_MORE_EVIDENCE" ? "evidence" : complaint?.status === "COMPLETED" ? "completed" : complaint?.status === "CLOSED" ? "closed" : state; const current = config[derived];
  const refresh = async () => { if (!complaint) return; try { const updated = await apiRequest<ComplaintApiView>(`/complaints/${complaint.id}`); onUpdated(updated); notify("投诉进度已刷新"); } catch (error) { notify(apiMessage(error)); } };
  return <div className={`app-screen complaint-detail-screen complaint-state-${derived}`}><Header title="投诉详情" subtitle={`投诉单 ${complaint?.complaint_no ?? "—"}`} back={() => go("orders")} /><section className="case-status"><AppIcon kind="shield" /><span><b>{current.title}</b><small>{current.note}</small></span></section><section className="paper-panel case-facts"><div><span>投诉类型</span><b>{complaint?.complaint_type ?? "—"}</b></div><div><span>关联订单</span><b>{complaint?.order_id ?? "—"}</b></div><div><span>提交时间</span><b>{complaint ? new Date(complaint.created_at).toLocaleString("zh-CN") : "—"}</b></div><div><span>当前处理人</span><b>{complaint?.assigned_admin_id ? "平台交易专员" : current.handler}</b></div></section>{derived === "completed" ? <section className="paper-panel case-decision"><SectionTitle title="平台处理结论" /><p>{complaint?.admin_result ?? "平台已完成核验"}</p><small>完整处理过程已写入不可修改日志。</small></section> : null}<section className="paper-panel case-evidence"><SectionTitle title="证据材料" note={`${complaint?.evidences?.length ?? 0} 份`} /><div>{complaint?.evidences?.map((evidence) => <span key={evidence.id}>{evidence.description ?? evidence.file_id}</span>)}</div></section><section className="paper-panel case-timeline"><SectionTitle title="处理记录" />{complaint?.logs?.slice().reverse().map((log) => <div key={log.id}><i /><span><b>{log.action}</b><small>{new Date(log.created_at).toLocaleString("zh-CN")} · {log.reason}</small></span></div>) ?? <div><i /><span><b>投诉已提交</b><small>等待平台受理</small></span></div>}</section><div className="dual-actions">{derived === "evidence" ? <><button type="button" onClick={() => notify("请通过统一上传流程选择已验证证据文件")}>上传证据</button><button type="button" onClick={() => void refresh()}>刷新状态</button></> : derived === "processing" ? <><button type="button" onClick={() => void refresh()}>刷新进度</button><button type="button" onClick={() => go("customerService")}>联系客服</button></> : <><button type="button" onClick={() => go("orders")}>返回订单</button><button type="button" onClick={() => void refresh()}>查看最新记录</button></>}</div></div>;
}

function AllReviewsScreen({ go, product }: { go: (page: PageId) => void; product: ProductApiView | null }) {
  const [filter, setFilter] = useState("全部"); const [reviewItems, setReviewItems] = useState<ReviewApiView[]>([]); const [loaded, setLoaded] = useState(false); const [loadError, setLoadError] = useState("");
  useEffect(() => { if (!product) return; let active = true; void apiRequest<CursorResponse<ReviewApiView>>(`/products/${product.id}/reviews?limit=100`).then((page) => { if (active) { setReviewItems(page.items); setLoaded(true); setLoadError(""); } }).catch((cause) => { if (active) { setReviewItems([]); setLoadError(apiMessage(cause)); } }); return () => { active = false; }; }, [product]);
  const visible = filter === "好评" ? reviewItems.filter((item) => item.rating >= 4) : reviewItems; const average = reviewItems.length ? (reviewItems.reduce((sum, item) => sum + item.rating, 0) / reviewItems.length).toFixed(1) : "0.0";
  return <div className="app-screen all-reviews-screen"><Header title="全部评价" subtitle="来自真实完成订单" back={() => go("service")} /><section className="review-overview"><div><b>{average}</b><span>★★★★★</span><small>{reviewItems.length} 条评价</small></div></section><div className="review-filter-tabs">{["全部", "最新", "好评"].map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>{loadError ? <section className="paper-panel live-data-state"><RequestErrorBear message={loadError} size={96} /><b>评价加载失败</b><p>{loadError}</p></section> : loaded && visible.length === 0 ? <section className="bear-inline-empty"><StateBear scene="reviews" eventKey={`${product?.id}:${filter}`} /><b>暂无评价</b></section> : null}<section className="review-feed">{visible.map((item) => <article key={item.id}><header><Avatar companion={companions[0]} size="sm" /><span><b>{item.display_nickname}</b><small>{"★".repeat(item.rating)} · 已购买服务</small></span><time>{new Date(item.created_at).toLocaleDateString("zh-CN")}</time></header><p>{item.content ?? "用户未填写文字评价"}</p><button type="button" onClick={() => go("service")}>{item.service_title} ›</button></article>)}</section></div>;
}

function ReviewDetailScreen({ go, notify, review }: { go: (page: PageId) => void; notify: (message: string) => void; review: ReviewApiView | null }) {
  return <div className="app-screen review-detail-screen"><Header title="我的评价" subtitle={review?.status === "HIDDEN" ? "已隐藏 · 不能重新评价" : "已发布 · 公开展示"} back={() => go("orders")} /><section className="review-service"><img src={services[2].cover} alt={review?.service_title ?? services[2].title} /><span><b>{review?.service_title ?? services[2].title}</b><small>{review?.sku_name ?? "订单服务规格"}</small></span></section><section className="paper-panel published-review"><div className="published-stars">{[1, 2, 3, 4, 5].map((item) => <RatingStar selected={item <= (review?.rating ?? 0)} key={item} />)}</div><b>{review ? `${review.rating} 星评价` : "暂无评价"}</b><p>{review?.content ?? "评价提交后不可编辑"}</p><small>{review ? `发布于 ${new Date(review.created_at).toLocaleString("zh-CN")}` : ""}</small></section><button type="button" className="full-primary" onClick={() => notify("评价提交后不可编辑；如有违规可由平台隐藏")}>评价规则</button></div>;
}

function PrivacySecurityScreen({ go, notify, viewer }: { go: (page: PageId) => void; notify: (message: string) => void; viewer: Viewer | null }) {
  void notify;
  const identityNote = viewer?.identity_verification?.status === "VERIFIED" ? "已认证" : viewer?.identity_verification?.status === "PENDING" ? "审核中" : viewer?.identity_verification?.status === "REJECTED" ? "未通过" : "未认证";
  const items: Array<[string, string, PageId]> = [["手机号码", viewer?.phone_mask ?? "未登录", "phoneSecurity"], ["实名认证", identityNote, "phoneSecurity"], ["隐私设置", "在线状态、个性化推荐", "privacySettings"], ["个人数据下载", "申请数据副本", "dataExport"]];
  return <div className="app-screen privacy-screen"><Header title="隐私与安全" subtitle="保护账号和个人数据" back={() => go("settings")} /><section className="security-hero"><AppIcon kind="shield" /><span><b>账号安全状态良好</b><small>建议定期核对手机号码与隐私设置</small></span></section><section className="settings-group security-list">{items.map(([title, note, target]) => <button type="button" onClick={() => go(target)} key={title}><span><b>{title}</b><small>{note}</small></span><em>›</em></button>)}</section><section className="settings-group danger-list"><button type="button" onClick={() => go("accountCancellation")}><span><b>注销账号</b><small>永久删除账号与个人资料</small></span><em>›</em></button></section></div>;
}

function PhoneSecurityScreen({ go, notify, viewer, onIdentityUpdated }: { go: (page: PageId) => void; notify: (message: string) => void; viewer: Viewer | null; onIdentityUpdated: (identity: IdentityView) => void }) {
  const [step, setStep] = useState<"overview" | "phone" | "identity">("overview"); const [code, setCode] = useState(""); const [phone, setPhone] = useState(""); const [legalName, setLegalName] = useState(""); const [documentNumber, setDocumentNumber] = useState(""); const [submitting, setSubmitting] = useState(false); const [phoneRows,setPhoneRows]=useState<PhoneChangeView[]>([]);const [phoneLoading,setPhoneLoading]=useState(false);
  const [identityPolicyIds, setIdentityPolicyIds] = useState<string[]>([]);
  const identity = viewer?.identity_verification; const identityLabel = identity?.status === "VERIFIED" ? "已认证" : identity?.status === "PENDING" ? "审核中" : identity?.status === "REJECTED" ? "未通过" : "未认证";
  const loadPhones=useCallback(async()=>{setPhoneLoading(true);try{setPhoneRows(await apiRequest<PhoneChangeView[]>("/me/phone-change-requests"));}catch(cause){notify(apiMessage(cause));}finally{setPhoneLoading(false);}},[notify]);
  useEffect(()=>{if(step==="phone")void loadPhones();},[loadPhones,step]);
  const activePhone=phoneRows.find((item)=>["PENDING_OLD_VERIFICATION","PENDING_NEW_VERIFICATION","READY"].includes(item.status))??null;
  const createPhone=async()=>{if(!/^1\d{10}$/u.test(phone)||submitting)return;setSubmitting(true);try{await apiRequest<PhoneChangeView>("/me/phone-change-requests",{method:"POST",headers:{"idempotency-key":window.crypto.randomUUID()},body:JSON.stringify({new_phone:phone})});setPhone("");await loadPhones();notify("换绑申请已创建，请先验证当前手机号");}catch(cause){notify(apiMessage(cause));}finally{setSubmitting(false);}};
  const sendPhoneCode=async()=>{if(!activePhone||submitting)return;const side=activePhone.status==="PENDING_OLD_VERIFICATION"?"old":"new";setSubmitting(true);try{await apiRequest(`/me/phone-change-requests/${activePhone.id}/${side}-code/send`,{method:"POST"});notify("开发验证码已发送，请使用本地测试配置中的验证码");}catch(cause){notify(apiMessage(cause));}finally{setSubmitting(false);}};
  const verifyPhone=async()=>{if(!activePhone||code.length!==6||submitting)return;const side=activePhone.status==="PENDING_OLD_VERIFICATION"?"old":"new";setSubmitting(true);try{const result=await apiRequest<PhoneChangeView>(`/me/phone-change-requests/${activePhone.id}/${side}-code/verify`,{method:"POST",body:JSON.stringify({code,version:activePhone.version})});setCode("");if(result.status==="COMPLETED"){notify("手机号换绑完成，旧会话已失效，请使用新手机号重新登录");go("auth");return;}await loadPhones();notify("当前手机号验证通过，请继续验证新手机号");}catch(cause){if(cause instanceof ApiClientError&&cause.status===409)await loadPhones();notify(apiMessage(cause));}finally{setSubmitting(false);}};
  const cancelPhone=async()=>{if(!activePhone||submitting)return;setSubmitting(true);try{await apiRequest(`/me/phone-change-requests/${activePhone.id}/cancel`,{method:"POST",body:JSON.stringify({status:activePhone.status,version:activePhone.version})});await loadPhones();notify("换绑申请已取消");}catch(cause){if(cause instanceof ApiClientError&&cause.status===409)await loadPhones();notify(apiMessage(cause));}finally{setSubmitting(false);}};
  const submitIdentity = async () => { if (!identityPolicyIds.length) { notify("请先阅读并确认实名信息处理规则"); return; } setSubmitting(true); try { await acceptSelectedPolicies("IDENTITY_VERIFICATION", identityPolicyIds); const result = await apiRequest<IdentityView>("/me/identity-verification", { method: "POST", body: JSON.stringify({ legal_name: legalName, document_number: documentNumber }) }); onIdentityUpdated(result); notify("本地测试实名认证已提交审核"); setStep("overview"); } catch (cause) { notify(apiMessage(cause)); } finally { setSubmitting(false); } };
  if (step === "overview") return <div className="app-screen security-subpage-screen"><Header title="手机号与实名认证" subtitle="高风险操作需要二次验证" back={() => go("privacySecurity")} /><section className="security-identity-card"><AppIcon kind="mine" /><span><b>{viewer?.profile?.nickname ?? "熊崽玩家 K"}</b><small>本地测试实名认证：{identityLabel}</small><em>手机号：{viewer?.phone_mask ?? "未登录"}</em></span></section><section className="settings-group security-action-list"><button type="button" onClick={() => setStep("phone")}><span><b>修改登录手机号</b><small>旧手机号和新手机号均需验证码确认</small></span><em>安全换绑 ›</em></button><button type="button" onClick={() => identity?.status === "VERIFIED" || identity?.status === "PENDING" ? notify(`${identity.legal_name_mask} · ${identity.document_mask}`) : setStep("identity")}><span><b>{identity ? "查看本地测试认证状态" : "提交本地测试实名认证"}</b><small>{identity ? `${identity.legal_name_mask} · ${identity.document_mask}` : "仅用于人工功能测试，请勿填写真实身份资料"}</small></span><em>{identityLabel} ›</em></button></section></div>;
  if (step === "identity") return <div className="app-screen security-subpage-screen"><Header title="提交实名认证" subtitle="仅用于交易安全与合规审核" back={() => setStep("overview")} /><section className="identity-test-warning"><b>本地测试提示</b><p>请勿填写真实证件资料；此页面仅验证信息处理确认与交互状态。</p></section><section className="form-panel security-verify-form"><label><span>真实姓名</span><div><input value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="请输入测试姓名" autoComplete="off" /></div></label><label><span>证件号码</span><div><input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.toUpperCase())} placeholder="请输入测试证件号码" autoComplete="off" /></div></label></section><section className="paper-panel security-copy"><b>敏感信息保护</b><p>姓名与证件号码会加密存储，页面和后台列表仅展示脱敏值。</p></section><PolicyChecklist title="实名信息处理确认" scene="IDENTITY_VERIFICATION" selectedIds={identityPolicyIds} onChange={setIdentityPolicyIds} go={go} note="单独确认" /><button type="button" className="full-primary" disabled={submitting || !identityPolicyIds.length || legalName.trim().length < 2 || documentNumber.trim().length < 6} onClick={() => void submitIdentity()}>{submitting ? "正在安全提交…" : "确认并提交审核"}</button></div>;
  return <div className="app-screen security-subpage-screen"><Header title="安全换绑手机号" subtitle="只显示脱敏手机号，完成后旧会话失效" back={() => setStep("overview")} />{phoneLoading?<section className="paper-panel security-copy"><b>正在读取换绑状态…</b></section>:activePhone?<><section className="paper-panel case-facts"><div><span>当前手机号</span><b>{activePhone.old_phone_mask}</b></div><div><span>新手机号</span><b>{activePhone.new_phone_mask}</b></div><div><span>当前步骤</span><b>{activePhone.status==="PENDING_OLD_VERIFICATION"?"验证当前手机号":"验证新手机号"}</b></div><div><span>过期时间</span><b>{new Date(activePhone.expires_at).toLocaleString("zh-CN")}</b></div></section><section className="form-panel security-verify-form"><label><span>短信验证码</span><div><input value={code} onChange={(event)=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} placeholder="请输入6位验证码" inputMode="numeric" /><button type="button" disabled={submitting} onClick={()=>void sendPhoneCode()}>发送验证码</button></div></label></section><div className="dual-actions"><button type="button" disabled={submitting||code.length!==6} onClick={()=>void verifyPhone()}>验证并继续</button><button type="button" disabled={submitting} onClick={()=>void cancelPhone()}>取消申请</button></div></>:<><section className="form-panel security-verify-form"><label><span>新手机号码</span><div><b>+86</b><input value={phone} onChange={(event)=>setPhone(event.target.value.replace(/\D/g,"").slice(0,11))} placeholder="请输入新的手机号码" inputMode="tel" /></div></label></section><button type="button" className="full-primary" disabled={submitting||!/^1\d{10}$/u.test(phone)} onClick={()=>void createPhone()}>{submitting?"正在创建…":"开始安全换绑"}</button></>}</div>;
}

function PrivacySettingsScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [settings, setSettings] = useState<PrivacyView | null>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { void apiRequest<PrivacyView>("/me/privacy-settings").then(setSettings).catch((cause) => notify(apiMessage(cause))); }, [notify]);
  const change = async (field: "show_online_status" | "personalized_recommendations" | "show_public_profile", title: string) => { if (!settings || saving) return; setSaving(true); try { const updated = await apiRequest<PrivacyView>("/me/privacy-settings", { method: "PATCH", body: JSON.stringify({ [field]: !settings[field], version: settings.version }) }); setSettings(updated); notify(`${title}已${updated[field] ? "开启" : "关闭"}`); } catch (cause) { notify(apiMessage(cause)); void apiRequest<PrivacyView>("/me/privacy-settings").then(setSettings).catch(() => undefined); } finally { setSaving(false); } };
  const rows: Array<[string, string, keyof Pick<PrivacyView, "show_online_status" | "personalized_recommendations" | "show_public_profile">]> = [["展示在线状态", "关闭后其他玩家看不到你的在线状态", "show_online_status"], ["个性化推荐", "根据浏览与交易偏好推荐陪玩和服务", "personalized_recommendations"], ["公开我的评价", "允许其他用户在买家主页查看公开评价", "show_public_profile"]];
  return <div className="app-screen security-subpage-screen"><Header title="隐私设置" subtitle="控制个人信息的公开范围" back={() => go("privacySecurity")} /><section className="settings-group privacy-switch-list">{rows.map(([title, note, field]) => { const value = settings?.[field] ?? true; return <div key={title}><span><b>{title}</b><small>{note}</small></span><button type="button" role="switch" aria-checked={value} className={value ? "switch-on" : ""} disabled={!settings || saving} onClick={() => void change(field, title)}><i /></button></div>; })}</section><section className="paper-panel security-copy"><b>隐私说明</b><p>手机号、实名认证姓名、订单、收藏和登录设备始终不会展示在公开主页。</p></section></div>;
}


function DataExportScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [rows,setRows]=useState<DataExportView[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{setRows(await apiRequest<DataExportView[]>("/me/data-exports"));}catch(cause){setRows([]);setError(apiMessage(cause));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);useEffect(()=>{if(!rows.some((item)=>item.status==="PENDING"||item.status==="PROCESSING"))return;const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer);},[load,rows]);
  const create=async()=>{if(busy)return;setBusy("create");try{await apiRequest<DataExportView>("/me/data-exports",{method:"POST",headers:{"idempotency-key":window.crypto.randomUUID()}});await load();notify("数据副本任务已提交");}catch(cause){notify(apiMessage(cause));}finally{setBusy(null);}};
  const download=async(row:DataExportView)=>{if(busy)return;setBusy(row.id);try{const result=await apiRequest<{download_url:string;download_expires_at:string}>(`/me/data-exports/${row.id}/download`);window.open(result.download_url,"_blank","noopener,noreferrer");notify("已打开短时安全下载地址");}catch(cause){notify(apiMessage(cause));}finally{setBusy(null);}};
  const labels:Record<DataExportView["status"],string>={PENDING:"排队中",PROCESSING:"生成中",COMPLETED:"可下载",FAILED:"生成失败",EXPIRED:"已过期"};const active=rows.some((item)=>item.status==="PENDING"||item.status==="PROCESSING");
  return <div className="app-screen security-subpage-screen"><Header title="个人数据下载" subtitle="真实任务进度与短时安全下载" back={() => go("privacySecurity")} /><section className="data-export-hero"><AppIcon kind="shield" /><h2>申请个人数据副本</h2><p>由本地后台任务生成账号资料、交易摘要、评价、聊天与协议接受记录；不包含密码、Token或完整账户。</p></section><section className="paper-panel export-scope"><SectionTitle title="数据范围" /><div><span>账号与公开资料</span><b>包含</b></div><div><span>订单与售后摘要</span><b>包含</b></div><div><span>聊天与协议记录</span><b>包含</b></div><div><span>敏感凭证</span><b>不包含</b></div></section>{loading?<section className="paper-panel security-copy"><b>正在读取任务…</b></section>:error?<section className="paper-panel security-copy"><b>任务读取失败</b><p>{error}</p><button type="button" onClick={()=>void load()}>重新加载</button></section>:<section className="paper-panel cancellation-checklist"><SectionTitle title="导出任务" note="生成中每5秒刷新" />{rows.length?rows.map((row)=><div key={row.id}><i>{row.status==="COMPLETED"?"✓":"•"}</i><span><b>{labels[row.status]}</b><small>{new Date(row.requested_at).toLocaleString("zh-CN")}{row.failure_code?` · ${row.failure_code}`:""}</small></span>{row.status==="COMPLETED"?<button type="button" disabled={busy!==null} onClick={()=>void download(row)}>下载</button>:null}</div>):<div><i>—</i><span><b>暂无任务</b><small>接口正常返回空列表</small></span></div>}</section>}<button type="button" className="full-primary" disabled={busy!==null||active} onClick={()=>void create()}>{busy==="create"?"正在提交…":active?"已有任务正在生成":"申请数据副本"}</button></div>;
}

function AccountCancellationScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [eligibility,setEligibility]=useState<CancellationEligibilityView|null>(null);const [rows,setRows]=useState<CancellationView[]>([]);const [reason,setReason]=useState("");const [confirmed,setConfirmed]=useState(false);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const [check,items]=await Promise.all([apiRequest<CancellationEligibilityView>("/me/account-cancellations/eligibility"),apiRequest<CancellationView[]>("/me/account-cancellations")]);setEligibility(check);setRows(items);}catch(cause){setEligibility(null);setRows([]);setError(apiMessage(cause));}finally{setLoading(false);}},[]);useEffect(()=>{void load();},[load]);
  const active=rows.find((item)=>item.status==="REQUESTED"||item.status==="PROCESSING")??null;const blockerLabels:Record<string,string>={ACTIVE_ORDER:"存在进行中的订单",ACTIVE_REFUND:"存在处理中的退款",ACTIVE_COMPLAINT:"存在处理中的投诉",ACTIVE_WITHDRAWAL:"存在未完成提现",SELLER_BALANCE:"陪玩账户仍有余额",SELLER_LIABILITY:"陪玩账户仍有待偿责任"};
  const apply=async()=>{if(busy||reason.trim().length<2||!confirmed)return;setBusy(true);try{await apiRequest<CancellationView>("/me/account-cancellations",{method:"POST",headers:{"idempotency-key":window.crypto.randomUUID()},body:JSON.stringify({reason:reason.trim()})});await load();notify("注销申请已受理，冷静期内可以撤销");}catch(cause){await load();notify(apiMessage(cause));}finally{setBusy(false);}};
  const revoke=async()=>{if(!active||busy)return;setBusy(true);try{await apiRequest(`/me/account-cancellations/${active.id}/revoke`,{method:"POST",body:JSON.stringify({version:active.version})});await load();notify("注销申请已撤销");}catch(cause){await load();notify(apiMessage(cause));}finally{setBusy(false);}};
  return <div className="app-screen account-cancellation-screen"><Header title="注销账号" subtitle="服务端条件检查、冷静期和撤销" back={() => go("privacySecurity")} /><section className="cancellation-warning"><span>!</span><h2>注销前请认真确认</h2><p>提交时服务端会再次核验未完成订单、售后、提现、余额和责任；历史交易证据按规则留存。</p></section>{loading?<section className="paper-panel security-copy"><b>正在核验注销条件…</b></section>:error?<section className="paper-panel security-copy"><b>条件读取失败</b><p>{error}</p><button type="button" onClick={()=>void load()}>重新加载</button></section>:<section className="paper-panel cancellation-checklist"><SectionTitle title="服务端实时条件" note={eligibility?new Date(eligibility.checked_at).toLocaleString("zh-CN"):undefined} />{eligibility?.blocker_codes.length?eligibility.blocker_codes.map((code)=><div key={code}><i>!</i><span><b>{blockerLabels[code]??"存在未完成业务"}</b><small>请先完成相关业务</small></span></div>):<div><i>✓</i><span><b>当前未发现阻塞条件</b><small>提交时仍会再次核验</small></span></div>}</section>}{active?<section className="paper-panel cancellation-checklist"><SectionTitle title="进行中的申请" /><div><i>•</i><span><b>{active.status==="REQUESTED"?"冷静期中":"处理中"}</b><small>冷静期结束：{new Date(active.waiting_period_ends_at).toLocaleString("zh-CN")}</small></span></div>{active.status==="REQUESTED"?<button type="button" className="full-primary" disabled={busy} onClick={()=>void revoke()}>{busy?"正在撤销…":"撤销注销申请"}</button>:null}</section>:<><section className="form-panel"><label><span>注销原因</span><textarea value={reason} onChange={(event)=>setReason(event.target.value)} maxLength={500} placeholder="请填写至少2个字的注销原因" /></label><label><input type="checkbox" checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)} />我已了解冷静期和账号注销影响</label></section><button type="button" className="full-primary danger-button" disabled={busy||!confirmed||reason.trim().length<2||!eligibility?.eligible} onClick={()=>void apply()}>{busy?"正在提交…":"申请注销账号"}</button></>}</div>;
}

function BuyerProfileScreen({ go }: { go: (page: PageId) => void }) {
  return <div className="app-screen buyer-profile-screen"><Header title="买家主页" subtitle="其他用户可见的公开资料" back={() => go("chat")} /><section className="buyer-public-hero"><Avatar companion={companions[0]} size="lg" /><div><h2>熊崽玩家 K</h2><p>ID：10086</p><span>喜欢轻松沟通，也会认真确认服务时间。</span></div></section><section className="buyer-public-stats"><div><b>12</b><span>关注</span></div><div><b>8</b><span>公开评价</span></div><div><b>162 天</b><span>加入平台</span></div></section><section className="paper-panel buyer-public-reviews"><SectionTitle title="公开评价" note="仅展示已公开内容" /><article><b>★★★★★ 服务很耐心</b><p>开局前沟通很顺畅，整体体验很好。</p><small>评价了 Kirito 的经典模式服务</small></article></section></div>;
}

function CouponsScreen({ go, backPage = "mine" }: { go: (page: PageId) => void; backPage?: PageId }) {
  return <div className="app-screen coupon-screen"><Header title="优惠券" subtitle="第一阶段暂不开放使用" back={() => go(backPage)} /><section className="coupon-summary"><span><b>暂未开放</b></span><small>优惠券入口保留，后续版本开放领取与核销</small></section><section className="empty-state coupon-empty"><span className="coupon-empty-icon"><img src="/assets/home-shortcuts/coupon-center.png" alt="优惠券" /></span><h2>优惠券功能暂未开放</h2><p>第一阶段订单按服务实际价格结算，不展示虚假优惠信息。</p><button type="button" onClick={() => go("home")}>去看看服务</button></section></div>;
}

function PayoutAccountsScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false); const [method, setMethod] = useState<"微信" | "支付宝">("微信");const [rows,setRows]=useState<PayoutAccountApiView[]>([]);const [holder,setHolder]=useState("");const [token,setToken]=useState("");
  const load=useCallback(()=>apiRequest<PayoutAccountApiView[]>("/seller/payout-accounts").then((items)=>setRows(items.filter((item)=>item.account_type==="WECHAT"||item.account_type==="ALIPAY"))),[]);useEffect(()=>{void load().catch(()=>undefined);},[load]);
  const create=async()=>{try{await apiRequest<PayoutAccountApiView>("/seller/payout-accounts",{method:"POST",body:JSON.stringify({account_type:method==="微信"?"WECHAT":"ALIPAY",holder_name:holder,account_token:token,is_default:rows.length===0})});await load();setSheetOpen(false);setHolder("");setToken("");notify("收款账户已加密保存并完成验证");}catch(error){notify(apiMessage(error));}};
  const makeDefault=async(row:PayoutAccountApiView)=>{try{await apiRequest(`/seller/payout-accounts/${row.id}/default`,{method:"POST",body:JSON.stringify({version:row.version})});await load();notify("已设为默认收款账户");}catch(error){notify(apiMessage(error));}};
  return <div className="app-screen payout-accounts-screen"><Header title="收款账户管理" subtitle="本地测试仅显示微信、支付宝" back={() => go("withdraw")} actions={<button type="button" className="preview-link" onClick={() => setSheetOpen(true)}>＋ 添加</button>} /><section className="test-channel-note" role="note"><b>TEST</b><span>账户用于本地提现流程测试，不会连接真实支付机构。</span></section><section className="account-list">{rows.map(row=><article key={row.id}><i>{row.account_type==="ALIPAY"?"支":"微"}</i><span><b>{row.account_type==="ALIPAY"?"支付宝":"微信"}</b><small>{row.display_mask} · {row.verification_status}</small></span>{row.is_default?<em>默认</em>:<button type="button" onClick={()=>void makeDefault(row)}>设为默认</button>}</article>)}</section><section className="paper-panel account-safety"><AppIcon kind="shield" /><span><b>收款账户安全</b><small>姓名和账户在应用层加密，页面只返回脱敏值。</small></span></section>{sheetOpen ? <div className="sheet-backdrop"><section className="account-sheet"><header><h2>添加测试收款账户</h2><button type="button" onClick={() => setSheetOpen(false)}><CartoonIcon kind="close" /></button></header><div className="account-method">{(["微信", "支付宝"] as const).map((item) => <button type="button" className={method === item ? "active" : ""} onClick={() => setMethod(item)} key={item}>{item}</button>)}</div><label><span>收款人姓名</span><input value={holder} onChange={event=>setHolder(event.target.value)} placeholder="请输入本人真实姓名" /></label><label><span>{method}测试账号</span><input value={token} onChange={event=>setToken(event.target.value)} placeholder={`请输入${method}测试账号`} /></label><button type="button" className="full-primary" onClick={()=>void create()}>验证并添加测试账户</button></section></div> : null}</div>;
}

const transactionStateGroups = {
  支付: [["待选择支付方式", "买家尚未确认测试支付渠道"], ["创建支付中", "平台正在创建测试支付单"], ["支付处理中", "等待测试渠道返回结果"], ["支付成功", "测试资金进入平台交易保障"], ["支付失败", "可重新选择方式支付"], ["已取消", "买家主动取消支付"], ["支付确认超时", "尚未获得明确支付结果，可刷新查询"], ["订单已关闭", "超时未支付，订单关闭"]],
  订单: [["待付款", "等待买家完成支付"], ["待接单", "等待陪玩确认服务"], ["待开始", "陪玩已接单并锁定预约时段"], ["服务中", "陪玩已开始履约"], ["待确认", "等待买家确认完成"], ["已完成", "订单完成并进入结算"], ["已取消", "未进入服务的订单已取消"], ["售后中", "退款或投诉处理中"], ["已退款", "款项已原路退回"]],
  退款: [["待陪玩处理", "陪玩需在 24 小时内响应"], ["陪玩拒绝", "买家可申请平台介入"], ["平台介入", "专员核验订单与证据"], ["退款处理中", "退款指令已提交支付渠道"], ["退款完成", "预计 24 小时内到账"], ["已关闭", "退款申请撤销或不成立"]],
};

function TransactionStatesScreen({ go }: { go: (page: PageId) => void }) {
  const [tab, setTab] = useState<keyof typeof transactionStateGroups>("支付");
  return <div className="app-screen state-matrix-screen"><Header title="交易完整状态" subtitle="支付、订单与退款全状态" back={() => go("orders")} /><div className="state-tabs">{(Object.keys(transactionStateGroups) as Array<keyof typeof transactionStateGroups>).map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><section className="state-list">{transactionStateGroups[tab].map(([title, note], index) => <article key={title}><i className={index === 3 ? "success" : index === 4 ? "danger" : ""}>{index + 1}</i><span><b>{title}</b><small>{note}</small></span><em>›</em></article>)}</section></div>;
}

const sellerStateGroups = {
  陪玩申请: [["草稿", "资料仅保存在本地"], ["已提交", "等待平台审核"], ["需补资料", "按提示补充或修改"], ["已通过", "可进入陪玩中心"], ["已拒绝", "可查看原因后重新申请"], ["已暂停", "陪玩身份暂不可用"]],
  服务管理: [["草稿", "服务尚未提交"], ["审核中", "平台正在审核内容"], ["审核未通过", "修改后可再次提交"], ["出售中", "买家可搜索并购买"], ["已下架", "卖家主动停止销售"], ["平台下架", "因规则问题暂停展示"]],
  卖家订单: [["新订单", "等待陪玩接单"], ["待开始", "已接单并锁定买家预约时段"], ["服务中", "陪玩正在履约"], ["待确认", "等待买家确认完成"], ["已完成", "订单进入收益结算"], ["售后处理中", "退款或投诉待处理"], ["退款完成", "订单资金已退回买家"]],
};

function SellerStateMatrixScreen({ go }: { go: (page: PageId) => void }) {
  const [tab, setTab] = useState<keyof typeof sellerStateGroups>("陪玩申请");
  return <div className="app-screen state-matrix-screen seller-state-screen"><Header title="陪玩中心完整状态" subtitle="入驻、服务与卖家订单" back={() => go("seller")} /><div className="state-tabs">{(Object.keys(sellerStateGroups) as Array<keyof typeof sellerStateGroups>).map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><section className="state-list">{sellerStateGroups[tab].map(([title, note], index) => <article key={title}><i className={title.includes("通过") || title.includes("出售") || title.includes("完成") ? "success" : title.includes("拒绝") || title.includes("下架") ? "danger" : ""}>{index + 1}</i><span><b>{title}</b><small>{note}</small></span><em>›</em></article>)}</section></div>;
}

type ContextStateKind = "search" | "orders" | "sellerOrders" | "messages" | "favorites" | "income" | "restricted" | "services";
function ContextStateScreen({ go, kind, embedded = false }: { go: (page: PageId) => void; kind: ContextStateKind; embedded?: boolean }) {
  const config: Record<ContextStateKind, { icon: string; title: string; note: string; action: string; target: PageId }> = {
    search: { icon: "⌕", title: "没有找到相关内容", note: "换个关键词，或切换“陪玩 / 服务”后重新搜索。", action: "重新搜索", target: "search" },
    sellerOrders: { icon: "□", title: "暂无卖家订单", note: "当前分类还没有订单，新的订单会显示在这里。", action: "查看服务管理", target: "sellerServices" },
    services: { icon: "□", title: "暂无服务", note: "当前分类暂无服务，已发布的其他服务不受影响。", action: "发布服务", target: "sellerPublish" },
    orders: { icon: "□", title: "还没有购买订单", note: "选择喜欢的陪玩服务，首笔订单会显示在这里。", action: "去看看服务", target: "home" },
    messages: { icon: "…", title: "暂时没有消息", note: "订单通知、平台公告和聊天会显示在这里。", action: "返回首页", target: "home" },
    favorites: { icon: "☆", title: "还没有收藏", note: "收藏喜欢的陪玩和服务，方便下次快速找到。", action: "去发现", target: "home" },
    income: { icon: "¥", title: "暂无收益记录", note: "完成服务并由买家确认后，收益明细会显示在这里。", action: "查看卖家订单", target: "sellerOrders" },
    restricted: { icon: "!", title: "当前功能暂不可用", note: "该入口需要完成登录、身份审核或系统权限授权后才能使用。", action: "查看解决方法", target: "settings" },
  };
  const current = config[kind];
  const body = <section className={`context-state-body bear-state-card context-state-${kind}`}><StateBear scene={kind} /><h2>{current.title}</h2><p>{current.note}</p><button type="button" onClick={() => go(current.target)}>{current.action}</button></section>;
  if (embedded) return body;
  return <div className="app-screen context-state-screen"><Header title={kind === "restricted" ? "访问受限" : "空状态"} subtitle="状态视觉预览" back={() => go(kind === "income" ? "sellerEarnings" : "home")} />{body}{kind === "restricted" ? <section className="paper-panel restricted-guide"><SectionTitle title="可能原因" /><div><i>1</i><span><b>尚未登录</b><small>登录后才能使用交易和个人功能</small></span></div><div><i>2</i><span><b>陪玩身份审核中</b><small>审核通过后开放经营功能</small></span></div><div><i>3</i><span><b>相册或麦克风权限未开启</b><small>可前往系统设置允许本应用访问</small></span></div></section> : null}</div>;
}

function GlobalStatesScreen({ go, notify }: { go: (page: PageId) => void; notify: (message: string) => void }) {
  const [state, setState] = useState<"加载中" | "空数据" | "加载失败" | "网络断开">("加载中"); const [replay, setReplay] = useState(0); const [overlay, setOverlay] = useState<"确认弹窗" | "底部弹层" | "">("");
  const stateCopy = { 加载中: ["正在加载", "请稍候，正在获取最新内容"], 空数据: ["这里还没有内容", "完成第一笔交易后，相关记录会显示在这里"], 加载失败: ["加载失败", "页面暂时无法加载，请稍后重试"], 网络断开: ["网络已断开", "检查网络连接后重新加载"] };
  return <div className="app-screen global-states-screen"><Header title="全局状态与反馈" subtitle="所有业务页面共用" back={() => go("home")} /><div className="state-tabs global-tabs">{(["加载中", "空数据", "加载失败", "网络断开"] as const).map((item) => <button type="button" className={state === item ? "active" : ""} onClick={() => setState(item)} key={item}>{item}</button>)}</div><DemoStateNotice />{state === "加载中" ? <LoadingState eventKey={String(replay)} /> : <section className={`global-state-visual bear-state-card state-${state}`}><StateBear scene={state === "空数据" ? "empty" : state === "加载失败" ? "error" : "offline"} eventKey={String(replay)} /><h2>{stateCopy[state][0]}</h2><p>{stateCopy[state][1]}</p><button type="button" onClick={() => setState("加载中")}>重新加载</button></section>}<div className="bear-preview-links"><button type="button" onClick={() => setReplay((value) => value + 1)}>重播当前动画</button><button type="button" onClick={() => go("emptyOrders")}>空订单</button><button type="button" onClick={() => go("emptyFavorites")}>空收藏</button><button type="button" onClick={() => go("paymentProcessing")}>支付处理中</button><button type="button" onClick={() => go("refundCompleted")}>退款完成</button></div><section className="paper-panel feedback-demo"><SectionTitle title="交互反馈" note="点击预览" /><div><button type="button" onClick={() => notify("操作成功")}>显示 Toast</button><button type="button" onClick={() => setOverlay("确认弹窗")}>确认弹窗</button><button type="button" onClick={() => setOverlay("底部弹层")}>底部弹层</button></div></section>{overlay ? <div className="demo-overlay"><section className={overlay === "底部弹层" ? "demo-sheet" : "demo-dialog"}><h2>{overlay}</h2><p>{overlay === "确认弹窗" ? "确认执行当前操作吗？" : "这里展示与当前任务相关的补充操作。"}</p><div><button type="button" onClick={() => setOverlay("")}>取消</button><button type="button" onClick={() => { setOverlay(""); notify("已确认"); }}>确认</button></div></section></div> : null}</div>;
}

export default function Home() {
  const [catalogPreview, setCatalogPreview] = useState<PreviewEntry | null>(null);
  const tradeStore = useTradePreview();
  const merchantPreview = useMerchantPreview();
  const [sellerNavigationRevision, setSellerNavigationRevision] = useState(0);
  const [sellerTradeEntry, setSellerTradeEntry] = useState<TradeView>("orders");
  const [legacyOrders, setLegacyOrders] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("preview") === "seller-workbench" && getLocalPreview()) setPage("seller");
    const sellerLink = params.get("seller");
    if (sellerLink && /^[0-9a-f-]{36}$/i.test(sellerLink)) { setSelectedCompanionId(sellerLink); setPage("companion"); }
    if (params.get("preview") === "trade-v31") setPage(params.get("role") === "seller" ? "sellerTradeOrders" : "buyerTradeOrders");
  }, []);
  const localCatalogEnabled = useSyncExternalStore(subscribeLocalPreview, getLocalPreview, getServerPreview);
  const [page, setPage] = useState<PageId>("home");
  const [messageRole, setMessageRole] = useState<"buyer" | "seller">("buyer");
  const [sharedThemeRole, setSharedThemeRole] = useState<"buyer" | "seller">("buyer");
  const sellerTheme = isSellerThemePage(page) || (sharedThemePages.includes(page) && sharedThemeRole === "seller");
  const buyerApiOrderList = useRef<BuyerOrderListState>({ filter: "全部", query: "", searchOpen: false, scroll: 0 });
  const [orderEntryFilter, setOrderEntryFilter] = useState("");
  const phoneRef = useRef<HTMLElement>(null);
  useAppCanvas(phoneRef);
  useUserUiMotion(phoneRef, page);
  useSheetAccessibility(phoneRef);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [toast, setToast] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [selectedSpec, setSelectedSpec] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedSupportConversationId, setSelectedSupportConversationId] = useState<string | null>(null);
  const [searchScope, setSearchScope] = useState<"陪玩" | "服务">("陪玩");
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [statePreview, setStatePreview] = useState(false);
  const [entryReturnPages, setEntryReturnPages] = useState<Record<"rules" | "coupons" | "notifications" | "buyerSellerIdentity", PageId>>({ rules: "mine", coupons: "mine", notifications: "messages", buyerSellerIdentity: "mine" });
  const mineScroll = useRef(0);
  const buyerOrderReturn = useRef<PageId>("home");
  const profileNavigationGuard = useRef<((next: () => void) => void) | null>(null);
  const registerProductNavigationGuard = useCallback((guard: ((next: () => void) => void) | null) => { profileNavigationGuard.current = guard; }, []);
  const navigate = useCallback((next: PageId) => {
    if (profileNavigationGuard.current) { profileNavigationGuard.current(() => navigate(next)); return; }
    if (next.startsWith("seller")) setSellerNavigationRevision(n => n + 1);
    setSharedThemeRole(isSellerThemePage(next) || (sharedThemePages.includes(next) && sellerTheme) ? "seller" : "buyer");
    const fromSeller = page.startsWith("seller") || (["notifications", "notificationDetail", "customerService"].includes(page) && sellerTheme);
    if (next === "messages" && fromSeller) next = "sellerMessages";
    if (next === "chat" && fromSeller) next = "sellerChat";
    if (next === "chat") setBuyerSearchMessageId(undefined);
    if (next === "sellerMessages" || next === "sellerChat") setMessageRole("seller");
    else if (next === "messages" || next === "chat") setMessageRole("buyer");
    if (["chat", "sellerChat"].includes(next) && !["messages", "sellerMessages"].includes(page)) setSelectedConversation(null);
    if (next === "sellerOrders") { setSellerOrderFilter(""); setSellerTradeEntry("orders"); }
    if (next === "orders") { setOrderEntryFilter(""); buyerOrderReturn.current = page === "mine" ? "mine" : "home"; }
    if (next === "auth" && ["mine", "buyerSellerIdentity"].includes(page)) storefrontLoginReturn.current = page;
    setCatalogPreview(null);
    if (next === "customerService") setSelectedSupportConversationId(null);
    if (next === "buyerSellerIdentity") {
      setEntryReturnPages(current => ({ ...current, buyerSellerIdentity: page }));
    } else if (next === "rules" || next === "coupons") {
      setEntryReturnPages((current) => ({ ...current, [next]: page === "home" ? "home" : "mine" }));
    } else if (next === "notifications" && page !== "notificationDetail") {
      setEntryReturnPages((current) => ({ ...current, notifications: page === "home" ? "home" : fromSeller ? "sellerMessages" : "messages" }));
    }
    setStatePreview(false);
    setPage(next);
  }, [page, messageRole, sellerTheme]);
  const [sellerOrderFilter, setSellerOrderFilter] = useState("");
  const sellerOrderReturn = useRef<PageId | null>(null);
  const [sellerServicesTab, setSellerServicesTab] = useState("出售中");
  const [submittedServiceTitle, setSubmittedServiceTitle] = useState("");
  const [selectedTime, setSelectedTime] = useState<BookingSelection | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductApiView | null>(null);
  const [currentOrder, setCurrentOrder] = useState<OrderApiView | null>(null);
  const [currentRefund, setCurrentRefund] = useState<RefundApiView | null>(null);
  const [currentComplaint, setCurrentComplaint] = useState<ComplaintApiView | null>(null);
  const [currentReview, setCurrentReview] = useState<ReviewApiView | null>(null);
  const [buyerSearchMessageId, setBuyerSearchMessageId] = useState<string>();
  const buyerInboxSearch = useRef<InboxSearchState & { scroll: number }>({ searching: false, query: "", searched: "", results: null, scroll: 0 });
  const [selectedConversation, setSelectedConversation] = useState<ConversationApiView | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<NotificationApiView | null>(null);
  const [currentPayment, setCurrentPayment] = useState<PaymentApiView | null>(null);
  const [liveCompanions, setLiveCompanions] = useState<Companion[]>([]);
  const [liveServices, setLiveServices] = useState<Service[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState("");
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | number>();
  const storefrontState = useRef<Record<string, StorefrontListState>>({});
  const storefrontReturn = useRef<PageId>("home");
  const storefrontLoginReturn = useRef<PageId | null>(null);
  const publicProductReturn = useRef(false);
  const publicChatReturn = useRef(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | number>();
  const [announcementReturn, setAnnouncementReturn] = useState<PageId>("notifications");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementKind>("reportTrade");
  useEffect(() => { void apiRequest<Viewer>("/me").then(setViewer).catch(() => setViewer(null)); }, []);
  const loadDiscovery = useCallback(async () => { setDiscoveryLoading(true); setDiscoveryError(""); try { const [sellerRows, productRows] = await Promise.all([apiRequest<CursorResponse<SellerApiView>>("/companions?limit=50"), apiRequest<CursorResponse<ProductApiView>>("/services?limit=50")]); const products = productRows.items.map(serviceFromApi); const serviceCounts = new Map<string, number>(); for (const product of products) serviceCounts.set(String(product.sellerId), (serviceCounts.get(String(product.sellerId)) ?? 0) + 1); setLiveCompanions(sellerRows.items.map((row) => ({ ...companionFromApi(row), services: serviceCounts.get(row.id) ?? 0 }))); setLiveServices(products); } catch (cause) { setDiscoveryError(apiMessage(cause)); } finally { setDiscoveryLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(loadDiscovery); }, [loadDiscovery]);
  useEffect(() => { if (!viewer) return; void Promise.all([loadCursorItems<ConversationApiView>("/conversations"), apiRequest<CursorResponse<NotificationApiView>>("/notifications?limit=50")]).then(([conversations]) => setUnreadCount(conversations.reduce((total, item) => total + item.unread_count, 0))).catch(() => setUnreadCount(0)); }, [viewer, page]);
  const notify = useCallback((message: string) => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(""), 2400); }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    const offline = () => notify("网络已断开，已加载的内容仍可查看");
    const online = () => notify("网络已恢复，可重试刚才的操作");
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [notify]);
  const openNotificationTarget = async (item:NotificationApiView, signal:AbortSignal) => {
    if(!item.related_id)throw new Error("通知未关联详情");
    const id=encodeURIComponent(item.related_id);
    if(item.related_type==='ORDER') {const row=await apiRequest<OrderApiView>(`/orders/${id}`,{signal});if(!signal.aborted){setCurrentOrder(row);navigate(row.seller_user_id===viewer?.id?'sellerOrderDetail':'orderDetail')}}
    else if(item.related_type==='REFUND') {const row=await apiRequest<RefundApiView>(`/refunds/${id}`,{signal});if(!signal.aborted){setCurrentRefund(row);navigate('refundDetail')}}
    else if(item.related_type==='COMPLAINT') {const row=await apiRequest<ComplaintApiView>(`/complaints/${id}`,{signal});if(!signal.aborted){setCurrentComplaint(row);navigate('complaintDetail')}}
    else if(item.related_type==='CONVERSATION'){const row=await apiRequest<ConversationApiView>(`/conversations/${id}`,{signal});if(!signal.aborted){if(row.conversation_type==='SUPPORT'){setSelectedSupportConversationId(row.id);navigate('customerService')}else{setSelectedConversation(row);setCurrentOrder(null);setSelectedProduct(null);navigate(row.member_role==='SELLER'?'sellerChat':'chat')}}}
    else throw new Error("此类通知的详情接口尚未接通");
  };
  useEffect(()=>{
    if(!['chat','sellerChat'].includes(page)||!selectedConversation)return;
    const c=new AbortController();
    if(selectedConversation.order_id)void apiRequest<OrderApiView>(`/orders/${encodeURIComponent(selectedConversation.order_id)}`,{signal:c.signal}).then(row=>{if(!c.signal.aborted){setCurrentOrder(row);setSelectedServiceId(row.product_id);setSelectedCompanionId(row.seller_id)}}).catch(e=>{if(!c.signal.aborted)notify(apiMessage(e))});
    if(selectedConversation.product_id)void apiRequest<ProductApiView>(`/services/${encodeURIComponent(selectedConversation.product_id)}`,{signal:c.signal}).then(row=>{if(!c.signal.aborted){setSelectedProduct(row);setSelectedServiceId(row.id);setSelectedCompanionId(row.seller_id)}}).catch(e=>{if(!c.signal.aborted)notify(apiMessage(e))});
    return()=>c.abort();
  },[selectedConversation?.id,page,notify]);
  const openCompanion = (item: Companion) => { storefrontReturn.current = page; publicProductReturn.current = false; if (getLocalPreview() && previewCompanions.some((row) => row.id === item.id)) { setCatalogPreview({ kind: "companion", id: String(item.id) }); setPage("companion"); return; } setCatalogPreview(null); setSelectedCompanionId(item.id); setPage("companion"); };
  const openService = (item: Service) => { storefrontReturn.current = page; if (getLocalPreview() && previewServices.some((row) => row.id === item.id)) { setCatalogPreview({ kind: "service", id: String(item.id) }); setPage("service"); return; } setCatalogPreview(null); setSelectedServiceId(item.id); setSelectedCompanionId(item.sellerId); setSelectedSpec(0); setSelectedTime(null); setSelectedProduct(null); setCurrentOrder(null); setPage("service"); };
  const previewOwnProfile = async () => {
    try { const profile = await apiRequest<StorefrontProfile>("/seller/profile"); storefrontReturn.current = "sellerMine"; setSelectedCompanionId(profile.id); setCatalogPreview(null); setPage("companion"); }
    catch (e) { notify(apiMessage(e)); if (e instanceof ApiClientError && e.status === 401) { storefrontLoginReturn.current = "sellerProfile"; setPage("auth"); } }
  };
  const openPublicProduct = (product: StorefrontProduct) => { publicProductReturn.current = true; const service = serviceFromApi({ ...product, description: product.description ?? "" }); setLiveServices(rows => [...rows.filter(row => row.id !== service.id), service]); openService(service); };
  const navigateSeller = (next: PageId) => {
    const target = ({ home: 'seller', orders: 'sellerOrders', messages: 'sellerMessages', mine: 'sellerMine' } as Partial<Record<PageId, PageId>>)[next] ?? next;
    // Tab navigation opens the tab root; returning from an order restores its originating screen.
    if (target === 'seller') merchantPreview.resetScreen('seller');
    if (target === 'sellerMine') merchantPreview.resetScreen('sellerMine');
    if (target === 'sellerMessages') merchantPreview.returnToRoot('sellerMessages', 'messages');
    sellerOrderReturn.current = null;
    navigate(target);
  };
  const common = { go: navigate, notify };
  const renderScreen = () => {
    const tradeMatch = /^(buyer|seller)Trade(.+)$/.exec(page);
    if (tradeMatch || (localCatalogEnabled && !legacyOrders && ["orders", "sellerOrders"].includes(page))) {
      const role = page.startsWith("seller") ? "seller" : "buyer";
      const suffix = tradeMatch?.[2];
      const entry = tradeCatalog.find(item => item.suffix === suffix)?.view as TradeView | undefined;
      return <TradeWorkspace key={`${page}:${role === "seller" ? `${sellerTradeEntry}:${sellerNavigationRevision}` : "orders"}`} role={role} store={tradeStore} entry={entry ?? (role === "seller" ? sellerTradeEntry : "orders")} suffix={suffix} initialFilter={role === "seller" ? sellerOrderFilter : orderEntryFilter}
        nav={role === "seller" ? <SellerNav page="sellerOrders" go={navigateSeller} /> : <BuyerNav page="orders" go={navigate} unreadCount={unreadCount} />}
        onExit={() => { const target = role === "seller" ? sellerOrderReturn.current ?? "seller" : buyerOrderReturn.current; sellerOrderReturn.current = null; navigate(target); }}
        onRole={nextRole => navigate(`${nextRole}TradeDetail`)}
        onShop={id => { const local = previewCompanions.find(c => c.id === id); if (local) openCompanion(local); else { storefrontReturn.current = page; setSelectedCompanionId(id); setPage("companion"); } }}
        onLegacy={() => { setLegacyOrders(true); navigate(role === "seller" ? "sellerOrders" : "orders"); }} />;
    }
    if (localCatalogEnabled && ["seller", "sellerMine", "sellerServices", "sellerPublish", "sellerServiceEdit", "sellerEarnings"].includes(page)) {
      return <SellerWorkbench key={`${page}:${sellerNavigationRevision}`} entry={page} merchant={merchantPreview} trade={tradeStore} registerNavigationGuard={registerProductNavigationGuard}
        nav={<SellerNav page={page} go={navigateSeller} />}
        go={target => {
          if (target === "sellerAftersales" || target.startsWith("orders:")) { setLegacyOrders(false); navigate("sellerOrders"); setSellerOrderFilter(target === "sellerAftersales" ? "售后中" : target.slice(7)); }
          else if (target === "sellerPublicPreview") void previewOwnProfile();
          else navigate(target as PageId);
        }}
        openOrder={(id, view) => { sellerOrderReturn.current = page; tradeStore.setSelected(id); setLegacyOrders(false); navigate("sellerOrders"); setSellerTradeEntry(view); }} />;
    }
    switch (page) {
      case "splash": return <SplashScreen go={navigate} />;
      case "auth": return <AuthScreen {...common} go={next => { if (next === "home" && storefrontLoginReturn.current) { const target = storefrontLoginReturn.current; storefrontLoginReturn.current = null; setPage(target); } else navigate(next); }} onAuthenticated={setViewer} />;
      case "profileSetup": return <ProfileSetupScreen {...common} go={next => { if (next === "home" && storefrontLoginReturn.current) { const target = storefrontLoginReturn.current; storefrontLoginReturn.current = null; setPage(target); } else navigate(next); }} viewer={viewer} onUpdated={setViewer} />;
      case "policyCenter": return <PolicyCenterScreen go={navigate} />;
      case "policyAcceptances": return <PolicyAcceptancesScreen go={navigate} />;
      case "sellerPolicyConfirm": return <SellerPolicyConfirmScreen go={navigate} />;
      case "agreementDetail": return <AgreementDetailScreen go={navigate} />;
      case "authGuard": return <AuthGuardScreen go={navigate} />;
      case "announcementDetail": return <AnnouncementDetailScreen go={navigate} kind={selectedAnnouncement} backPage={announcementReturn} />;
      case "search": return <SearchScreen go={navigate} companionItems={localCatalogEnabled ? previewCompanions : liveCompanions} serviceItems={localCatalogEnabled ? previewServices : liveServices} onSearch={(scope, query) => { setSearchScope(scope); setSearchQuery(query); setPage("searchResults"); }} />;
      case "searchResults": return <SearchResultsScreen loading={!localCatalogEnabled && discoveryLoading} error={localCatalogEnabled ? "" : discoveryError} onRetry={() => void loadDiscovery()} go={navigate} scope={searchScope} query={searchQuery} companionItems={localCatalogEnabled ? previewCompanions : liveCompanions} serviceItems={localCatalogEnabled ? previewServices : liveServices} onCompanionOpen={openCompanion} onServiceOpen={openService} />;
      case "companion": return <PublicStorefront key={String(selectedCompanionId ?? liveCompanions[0]?.id ?? "")} sellerId={String(selectedCompanionId ?? liveCompanions[0]?.id ?? "")} viewerId={viewer?.id} request={apiRequest} state={storefrontState} notify={notify}
        onBack={() => navigate(storefrontReturn.current)} onEdit={() => setPage("sellerProfile")} onProduct={openPublicProduct}
        onLogin={() => { storefrontLoginReturn.current = "companion"; setPage("auth"); }}
        onRules={() => { setEntryReturnPages(s => ({ ...s, rules: "companion" })); setPage("rules"); }}
        onContact={async id => { const conversation = await apiRequest<ConversationApiView>("/conversations/sellers", { method: "POST", body: JSON.stringify({ seller_id: id }) }); setCurrentOrder(null); setSelectedProduct(null); setSelectedConversation(conversation); setMessageRole("buyer"); publicChatReturn.current = true; setPage("chat"); }} />;
      case "service": return <ServiceScreen {...common} go={next => { if (publicProductReturn.current && next === "home") setPage("companion"); else navigate(next); }} selected={selectedSpec} setSelected={setSelectedSpec} companionItems={liveCompanions} serviceItems={liveServices} selectedServiceId={selectedServiceId} onDetail={setSelectedProduct} quantity={purchaseQuantity} setQuantity={setPurchaseQuantity} />;
      case "serviceUnavailable": return <ServiceUnavailableScreen go={navigate} />;
      case "specs": return <SpecsScreen go={navigate} selected={selectedSpec} setSelected={setSelectedSpec} product={selectedProduct} />;
      case "bookingSchedule": return <BookingScheduleScreen go={navigate} onConfirm={setSelectedTime} product={selectedProduct} selected={selectedSpec} />;
      case "checkout": return <CheckoutScreen {...common} selected={selectedSpec} selectedTime={selectedTime} product={selectedProduct} onOrderCreated={setCurrentOrder} quantity={purchaseQuantity} />;
      case "payment": return <PaymentScreen {...common} selected={selectedSpec} order={currentOrder} onPaid={(order, payment) => { setCurrentOrder(order); setCurrentPayment(payment); }} />;
      case "paymentResult": return <PaymentResultScreen go={navigate} preview={statePreview || !currentOrder} order={statePreview ? null : currentOrder} payment={statePreview ? null : currentPayment} />;
      case "paymentProcessing": return <PaymentProcessingScreen go={navigate} selected={selectedSpec} />;
      case "paymentFailure": return <PaymentResultScreen go={navigate} preview={statePreview || !currentOrder} order={statePreview ? null : currentOrder} payment={statePreview ? null : currentPayment} outcome="failed" />;
      case "paymentCancelled": return <PaymentResultScreen go={navigate} preview={statePreview || !currentOrder} order={statePreview ? null : currentOrder} payment={statePreview ? null : currentPayment} outcome="cancelled" />;
      case "paymentClosed": return <PaymentResultScreen go={navigate} preview={statePreview || !currentOrder} order={statePreview ? null : currentOrder} payment={statePreview ? null : currentPayment} outcome="closed" />;
      case "paymentTimeout": return <PaymentResultScreen go={navigate} preview={statePreview || !currentOrder} order={statePreview ? null : currentOrder} payment={statePreview ? null : currentPayment} outcome="timeout" />;
      case "paymentExceptions": return <PaymentExceptionsScreen go={navigate} />;
      case "orders": return <OrdersScreen key={orderEntryFilter} listState={buyerApiOrderList} initialFilter={orderEntryFilter} {...common} unreadCount={unreadCount} onSelect={setCurrentOrder} onShop={id => { storefrontReturn.current = "orders"; setSelectedCompanionId(id); setPage("companion"); }} />;
      case "orderDetail": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderPendingPayment": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="pendingPayment" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderAccepted": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="accepted" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderInService": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="inService" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderPendingConfirm": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="pendingConfirm" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderCompleted": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="completed" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderReviewed": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="reviewed" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderCancelled": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="cancelled" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderSellerRejected": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="sellerRejected" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderAfterSale": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="afterSale" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "orderRefunded": return <OrderDetailScreen {...common} onShop={id=>{storefrontReturn.current=page;setSelectedCompanionId(id);setPage("companion")}} state="refunded" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "refundApply": return <RefundApplyScreen {...common} order={currentOrder} onCreated={setCurrentRefund} />;
      case "refundDetail": return <RefundDetailScreen {...common} refund={statePreview ? null : currentRefund} onUpdated={setCurrentRefund} />;
      case "refundRejected": return <RefundDetailScreen {...common} state="rejected" refund={statePreview ? null : currentRefund} onUpdated={setCurrentRefund} />;
      case "refundPlatform": return <RefundDetailScreen {...common} state="platform" refund={statePreview ? null : currentRefund} onUpdated={setCurrentRefund} />;
      case "refundProcessing": return <RefundDetailScreen {...common} state="processing" refund={statePreview ? null : currentRefund} onUpdated={setCurrentRefund} />;
      case "refundCompleted": return <RefundDetailScreen {...common} state="completed" refund={statePreview ? null : currentRefund} onUpdated={setCurrentRefund} />;
      case "refundClosed": return <RefundDetailScreen {...common} state="closed" refund={statePreview ? null : currentRefund} onUpdated={setCurrentRefund} />;
      case "complaint": return <ComplaintScreen {...common} order={currentOrder} onCreated={setCurrentComplaint} />;
      case "complaintDetail": return <ComplaintDetailScreen {...common} complaint={currentComplaint} onUpdated={setCurrentComplaint} />;
      case "complaintEvidence": return <ComplaintDetailScreen {...common} state="evidence" complaint={currentComplaint} onUpdated={setCurrentComplaint} />;
      case "complaintCompleted": return <ComplaintDetailScreen {...common} state="completed" complaint={currentComplaint} onUpdated={setCurrentComplaint} />;
      case "complaintClosed": return <ComplaintDetailScreen {...common} state="closed" complaint={currentComplaint} onUpdated={setCurrentComplaint} />;
      case "review": return <ReviewScreen {...common} order={currentOrder} onCreated={setCurrentReview} />;
      case "allReviews": return <AllReviewsScreen key={selectedProduct?.id ?? "no-product"} go={navigate} product={selectedProduct} />;
      case "reviewDetail": return <ReviewDetailScreen {...common} review={currentReview} />;
      case "reviewStates": return <ReviewStatesScreen go={navigate} />;
      case "messages": return <MessagesScreen searchState={buyerInboxSearch} go={navigate} unreadCount={unreadCount} onOpen={(conversation, matchMessageId) => { setBuyerSearchMessageId(matchMessageId); setSelectedConversation(conversation); setPage("chat"); }} />;
      case "notifications": return <NotificationsScreen go={navigate} onSelect={setSelectedNotification} onAnnouncementOpen={(kind) => { setAnnouncementReturn("notifications"); setSelectedAnnouncement(kind); setPage("announcementDetail"); }} backPage={entryReturnPages.notifications} />;
      case "notificationDetail": return <NotificationDetailScreen go={navigate} notification={selectedNotification} onTargetOpen={openNotificationTarget} />;
      case "sellerMessages": return <MessagesScreen seller go={navigate} unreadCount={unreadCount} onOpen={(conversation) => { setMessageRole("seller"); setCurrentOrder(null); setSelectedProduct(null); setSelectedConversation(conversation); setPage("sellerChat"); }} />;
      case "sellerChat":
      case "chat": return <ChatScreen searchMessageId={page === "chat" ? buyerSearchMessageId : undefined} seller={page === "sellerChat"} {...common} go={next => { if (page === "chat" && next === "messages" && publicChatReturn.current) { publicChatReturn.current = false; setPage("companion"); } else navigate(next); }} viewer={viewer} conversation={selectedConversation} order={currentOrder} product={selectedProduct} onConversation={setSelectedConversation} />;
      case "chatStates": return <ChatStatesScreen go={navigate} />;
      case "customerService": return <CustomerServiceScreen {...common} seller={sellerTheme} viewer={viewer} order={currentOrder} initialConversationId={selectedSupportConversationId} />;
      case "buyerSellerIdentity": return <BuyerIdentity detail request={apiRequest} userId={viewer?.id} onBack={() => navigate(entryReturnPages.buyerSellerIdentity)} onNavigate={target => navigate(target as PageId)} />;
      case "mine": return <MineScreen {...common} scrollState={mineScroll} v31={localCatalogEnabled && !legacyOrders} onOrders={(filter) => { buyerOrderReturn.current = "mine"; setOrderEntryFilter(filter); setPage("orders"); }} unreadCount={unreadCount} viewer={viewer} />;
      case "buyerProfile": return <BuyerProfileScreen go={navigate} />;
      case "favorites": return <FavoritesScreen go={navigate} onCompanionOpen={openCompanion} onServiceOpen={openService} />;
      case "coupons": return <CouponCenter back={() => navigate(entryReturnPages.coupons)} />;
      case "feedback": return <FeedbackPage back={() => navigate("home")} />;
      case "quickMatch": return <QuickMatchScreen go={navigate} companionItems={localCatalogEnabled ? previewCompanions : liveCompanions} onOpen={openCompanion} loading={!localCatalogEnabled && discoveryLoading} error={localCatalogEnabled ? "" : discoveryError} retry={() => void loadDiscovery()} />;
      case "editProfile": return <EditProfileScreen {...common} buyerMode={!sellerTheme} viewer={viewer} onUpdated={setViewer} />;
      case "privacySecurity": return <PrivacySecurityScreen {...common} viewer={viewer} />;
      case "phoneSecurity": return <PhoneSecurityScreen {...common} viewer={viewer} onIdentityUpdated={(identity) => setViewer((current) => current ? { ...current, identity_verification: identity } : current)} />;
      case "privacySettings": return <PrivacySettingsScreen {...common} />;
      case "dataExport": return <DataExportScreen {...common} />;
      case "accountCancellation": return <AccountCancellationScreen {...common} />;
      case "rules": return <RulesScreen go={navigate} backPage={entryReturnPages.rules} />;
      case "settings": return <SettingsScreen {...common} buyerViewer={sellerTheme ? undefined : viewer} onLoggedOut={() => { setViewer(null); setUnreadCount(0); }} />;
      case "transactionStates": return <TransactionStatesScreen go={navigate} />;
      case "globalStates": return <GlobalStatesScreen {...common} />;
      case "mediaWorkflow": return <MediaWorkflowScreen {...common} />;
      case "permissionCenter": return <PermissionCenterScreen {...common} />;
      case "emptySearch": return <SearchResultsScreen go={navigate} scope={searchScope} query={searchQuery || "示例搜索"} companionItems={[]} serviceItems={[]} onCompanionOpen={openCompanion} onServiceOpen={openService} />;
      case "emptyOrders": return <OrdersScreen key="preview-empty-orders" go={navigate} notify={notify} onSelect={setCurrentOrder} preview />;
      case "emptyMessages": return <ContextStateScreen go={navigate} kind="messages" />;
      case "emptyFavorites": return <FavoritesScreen key="preview-empty-favorites" go={navigate} preview />;
      case "emptyIncome": return <ContextStateScreen go={navigate} kind="income" />;
      case "restrictedAccess": return <ContextStateScreen go={navigate} kind="restricted" />;
      case "apply":
      case "sellerApplyStatus": return <ApplyScreen {...common} state="approved" />;
      case "sellerApplyForm": return <SellerApplyFormScreen {...common} />;
      case "sellerApplyReview": return <ApplyScreen {...common} state="reviewing" />;
      case "sellerApplySupplement": return <ApplyScreen {...common} state="supplement" />;
      case "sellerApplyRejected": return <ApplyScreen {...common} state="rejected" />;
      case "sellerApplySuspended": return <ApplyScreen {...common} state="suspended" />;
      case "seller": return <SellerCenterScreen go={navigate} onOrders={(tab) => { navigate("sellerOrders"); setSellerOrderFilter(tab); }} />;
      case "sellerServices": return <SellerServicesScreen {...common} tab={sellerServicesTab} setTab={setSellerServicesTab} submittedServiceTitle={submittedServiceTitle} />;
      case "sellerPublish": return <SellerPublishScreen {...common} onSubmitted={(title) => { setSubmittedServiceTitle(title); setSellerServicesTab("审核中"); }} />;
      case "sellerServiceEdit": return <SellerServiceEditScreen {...common} />;
      case "serviceAuditDetail": return <ServiceAuditDetailScreen {...common} />;
      case "sellerOrders": return <SellerOrdersScreen {...common} initialFilter={sellerOrderFilter} onSelect={setCurrentOrder} />;
      case "sellerOrderDetail": return <SellerOrderDetailScreen {...common} order={currentOrder} onUpdated={setCurrentOrder} />;
      case "sellerOrderAccepted": return <SellerOrderDetailScreen {...common} state="accepted" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "sellerOrderInService": return <SellerOrderDetailScreen {...common} state="inService" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "sellerOrderPendingConfirm": return <SellerOrderDetailScreen {...common} state="pendingConfirm" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "sellerOrderCompleted": return <SellerOrderDetailScreen {...common} state="completed" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "sellerOrderClosed": return <SellerOrderDetailScreen {...common} state="closed" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "sellerOrderRefunded": return <SellerOrderDetailScreen {...common} state="refunded" order={currentOrder} onUpdated={setCurrentOrder} />;
      case "sellerRefund": return <SellerRefundScreen {...common} refund={currentRefund} onUpdated={setCurrentRefund} />;
      case "sellerMine": return <SellerMineScreen go={navigate} onPreview={() => void previewOwnProfile()} />;
      case "sellerEarnings": return <SellerEarningsScreen go={navigate} />;
      case "incomeDetails": return <IncomeDetailsScreen go={navigate} />;
      case "withdraw": return <WithdrawScreen {...common} />;
      case "payoutAccounts": return <PayoutAccountsScreen {...common} />;
      case "withdrawals": return <WithdrawalsScreen go={navigate} />;
      case "withdrawalDetail": return <WithdrawalDetailScreen {...common} />;
      case "sellerProfile": return <ProfileEditor request={apiRequest} notify={notify} onBack={() => navigate("sellerMine")} onLogin={() => { storefrontLoginReturn.current = "sellerProfile"; setPage("auth"); }} navigationGuard={profileNavigationGuard} onPreview={id => { storefrontReturn.current = "sellerProfile"; setSelectedCompanionId(id); setCatalogPreview(null); setPage("companion"); }} />;
      case "sellerStateMatrix": return <SellerStateMatrixScreen go={navigate} />;
      default: return null;
    }
  };
  const catalogItem = pageCatalog.flatMap((group) => group.items.map((item) => ({ ...item, group: group.group }))).find((item) => item.page === page);
  const catalogCount = pageCatalog.reduce((total, group) => total + group.items.length, 0);
  const meta = pageMeta.find((item) => item.page === page) ?? { page, no: "MVP", title: catalogItem?.title ?? "买家首页", note: catalogItem?.group ?? "完整 MVP 页面" };
  return <main className="site-stage"><aside className="brand-rail"><img className="rail-logo" src="/assets/xiongzai-logo.png" alt="熊崽电竞" /><span className="rail-tag">买家 App + 陪玩中心</span><div className="rail-copy"><span>{meta.no} / 06</span><h1>{meta.title}</h1><p>{meta.note}</p></div><nav className="page-picker" aria-label="核心页面">{pageMeta.map((item) => <button type="button" key={item.page} className={meta.page === item.page ? "active" : ""} onClick={() => navigate(item.page)}><span>{item.no}</span><b>{item.title}</b><em>↗</em></button>)}</nav><button type="button" className="trade-preview-entry" onClick={() => { setLegacyOrders(false); navigate("buyerTradeOrders"); }}>V3.1 交易与售后预览 ↗</button><button type="button" className="open-page-catalog" onClick={() => setCatalogOpen(true)}>查看全部 MVP 页面 <b>{catalogCount}</b></button><Link className="sticker-preview-entry" href="/sticker-preview" prefetch={false}>熊崽动态表情 · 本地交互预览 ↗</Link><div className="rail-slogan"><b>PLAY<br />WITH JOY!</b><span>找陪玩，选服务，安心下单</span></div></aside>{localCatalogEnabled && <details className="seller-preview-controls"><summary>设计预览 · 本地示例</summary><p>数据保存在此浏览器的本地预览中，不操作真实资金。商品图片仅在本地读取；保存待审核状态不会发送平台审核。</p><button onClick={() => { setLegacyOrders(true); navigate(sellerTheme ? 'sellerOrders' : 'orders'); }}>查看接口订单</button>{!sellerTheme && <button onClick={() => navigate("buyerTradeCheckout")}>预览下单流程</button>}{page.includes('Trade') || ['orders','sellerOrders'].includes(page) ? <button onClick={() => navigate(sellerTheme ? 'buyerTradeDetail' : 'sellerTradeDetail')}>{sellerTheme ? '切换到买家端预览' : '切换到卖家端预览'}</button> : null}</details>}{(tradeStore.storageError || merchantPreview.storageError) && <p role="alert" style={{position:'fixed',top:8,left:8,right:8,zIndex:10000,padding:12,background:'#fff0f0',color:'#9d2634'}}>{tradeStore.storageError || merchantPreview.storageError}</p>}<section ref={phoneRef} data-page-palette={sellerTheme ? "seller" : "buyer"} data-ui-refinement={UI_REFINEMENT.enabled ? "on" : "off"} data-ui-material={UI_REFINEMENT.material} className={`phone-shell user-motion${page === "sellerMessages" ? " page-messages" : page === "sellerChat" ? " page-chat" : ""}${["messages", "sellerMessages", "emptyMessages", "chat", "sellerChat", "chatStates", "customerService"].includes(page) ? "" : " user-theme"} page-${page}`} aria-label={`熊崽电竞 ${meta.title}预览`}><div className="home-retained" hidden={page !== "home"}><HomeScreen {...common} active={page === "home"} onAnnouncementOpen={(kind) => { setAnnouncementReturn("home"); setSelectedAnnouncement(kind); setPage("announcementDetail"); }} unreadCount={unreadCount} companionItems={liveCompanions} serviceItems={liveServices} onCompanionOpen={openCompanion} onServiceOpen={openService} loading={discoveryLoading} error={discoveryError} onRetry={() => void loadDiscovery()} /></div>{page !== "home" ? catalogPreview ? <LocalCatalogPreview key={`${catalogPreview.kind}:${catalogPreview.id}`} entry={catalogPreview} onClose={() => navigate(storefrontReturn.current)} onContact={() => notify("这是展示商品，暂不支持联系真实店铺客服")} onCheckout={item => {
          const now = Date.now();
          const newOrder = { ...createSamples(now)[7], id: `XZ31P${now}`, title: item.title, cover: item.cover, seller: item.seller, sellerId: item.sellerId, spec: item.spec, amount: item.amount, quantity: item.quantity, unitPrice: item.unitPrice, productId: item.productId, skuId: item.skuId, promiseHours: item.promiseHours, requiredFields: [], buyer: "本地预览买家", buyerId: "local-preview-buyer", ruleVersion: "V3.1", stage: "unpaid" as const, sale: undefined, refunded: 0, caseCount: 0, evidence: [], extensionUsed: false, paidAt: 0, promiseAt: 0, confirmAt: undefined, review: undefined, specialAppeal: undefined, specialEvidence: undefined, terminatedAt: undefined, reviewed: false, logs: [{ title: "确认商品规格", detail: "本地设计预览", at: now }] };
          tradeStore.setOrders(rows => [...rows, newOrder]); tradeStore.setSelected(newOrder.id); navigate("buyerTradeCheckout");
        }} /> : renderScreen() : null}<div className={`app-toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite" aria-atomic="true">{toast}</div></section>{catalogOpen ? <div className="page-catalog-backdrop" role="dialog" aria-modal="true" aria-label="全部 MVP 页面"><section className="page-catalog-panel"><header><div><span>{catalogCount} SCREENS</span><h2>完整 MVP 页面</h2><Link href="/sticker-preview" prefetch={false}>熊崽动态表情交互演示（未接入真实发送） ↗</Link><p>买家端、陪玩中心与全局状态已整合。V3 增强动效已接入；状态入口为设计稿演示，不代表真实业务结果。</p></div><button type="button" aria-label="关闭页面目录" onClick={() => setCatalogOpen(false)}><CartoonIcon kind="close" /></button></header><div>{pageCatalog.map((group) => <section key={group.group}><h3>{group.group}</h3><div>{group.items.map((item) => <button type="button" className={page === item.page ? "active" : ""} onClick={() => { const open = () => { setSharedThemeRole(isSellerThemePage(item.page) ? "seller" : "buyer"); setCatalogPreview(null); if (item.page === "sellerMessages" || item.page === "sellerChat") setMessageRole("seller"); setPage(item.page); setStatePreview(true); setCatalogOpen(false); }; if (profileNavigationGuard.current) { setCatalogOpen(false); profileNavigationGuard.current(open); } else open(); }} key={`${group.group}-${item.title}`}><span>{item.title}</span><em>›</em></button>)}</div></section>)}</div></section></div> : null}</main>;
}
