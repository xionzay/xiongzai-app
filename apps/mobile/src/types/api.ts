import type { AfterSaleStatus, BuyerOrderAction, BuyerRefundAction, ComplaintStatus, CommunityNotificationCategory as NotificationCategory, CommunityRelatedObjectType as NotificationRelatedObjectType, ConversationMemberRole, ConversationType, MessageSendStatus, NotificationReadStatus, OrderStatus, PaymentStatus, PolicyAcceptanceScene, PolicyConfirmationMethod, PolicyType, RefundStatus, RelatedObjectType, ReviewStatus, StoredPolicyAcceptanceScene, SupportCaseStatus, SupportPriority } from "@xiongzai/contracts";

export type { AfterSaleStatus, BuyerOrderAction, BuyerRefundAction, ComplaintStatus, OrderStatus, PaymentStatus, PolicyAcceptanceScene, PolicyConfirmationMethod, PolicyType, RefundStatus, ReviewStatus, StoredPolicyAcceptanceScene };
export type { ConversationMemberRole, ConversationType, MessageSendStatus, NotificationCategory, NotificationReadStatus, NotificationRelatedObjectType, RelatedObjectType, SupportCaseStatus, SupportPriority };

export type UserStatus = "NORMAL" | "DISABLED" | "CANCELLED";

export interface IdentityVerification {
  id: string;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "REVOKED";
  legal_name_mask: string;
  document_mask: string;
  rejection_reason: string | null;
  version: number;
}

export interface Viewer {
  id: string;
  phone_mask: string;
  status: UserStatus;
  profile_initialized: boolean;
  version: number;
  profile: {
    nickname: string;
    avatar_file_id: string | null;
    bio: string | null;
    public_user_no: string;
    version: number;
  } | null;
  identity_verification: IdentityVerification | null;
  created_at?: string;
}

export type MobilePlatform = "IOS" | "ANDROID";

export interface MobileTokenResponse {
  token_type: "Bearer";
  access_token: string;
  access_token_expires_in_seconds: number;
  refresh_token: string;
  refresh_token_expires_in_seconds: number;
  session_id: string;
  user: Viewer;
}

export interface ApiFieldError {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  request_id?: string;
  field_errors?: ApiFieldError[];
}

export type PhoneChangeStatus = "PENDING_OLD_VERIFICATION" | "PENDING_NEW_VERIFICATION" | "READY" | "COMPLETED" | "CANCELLED" | "EXPIRED";
export interface PhoneChangeRequestApiView {
  id: string;
  old_phone_mask: string;
  new_phone_mask: string;
  status: PhoneChangeStatus;
  expires_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  version: number;
  created_at: string;
}

export type PersonalDataExportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "EXPIRED";
export interface PersonalDataExportApiView {
  id: string;
  status: PersonalDataExportStatus;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
  failure_code: string | null;
  version: number;
}

export interface PersonalDataExportDownloadApiView {
  id: string;
  download_url: string;
  download_expires_at: string;
  sha256: string;
  size_bytes: string;
}

export type AccountCancellationStatus = "REQUESTED" | "CANCELLED" | "PROCESSING" | "COMPLETED" | "REJECTED";
export interface AccountCancellationApiView {
  id: string;
  user_id: string;
  status: AccountCancellationStatus;
  reason: string;
  requested_at: string;
  waiting_period_ends_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  version: number;
}

export interface AccountCancellationEligibilityApiView {
  eligible: boolean;
  blocker_codes: string[];
  waiting_period_seconds: number;
  checked_at: string;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface CompanionApiView {
  public_product_count?: number;
  main_games?: import("@xiongzai/contracts").ProductGame[];
  id: string;
  user_id: string;
  status: string;
  seller_nickname: string;
  seller_avatar_file_id: string | null;
  cover_file_id: string | null;
  voice_file_id?: string | null;
  voice_duration_ms?: number | null;
  introduction: string | null;
  game_rank: string | null;
  preferred_mode: string | null;
  play_style: string | null;
  accepting_orders: boolean;
  rating_avg: string;
  review_count: number;
  completed_order_count: number;
  favorite_count: number;
  version: number;
}

export interface CompanionDetailApiView extends CompanionApiView {
  services: ServiceApiView[];
}

export interface ServiceApiView {
  game?: import("@xiongzai/contracts").ProductGame;
  pricing_mode?: "SINGLE" | "MULTI";
  fulfillment_seconds?: number | null;
  id: string;
  seller_id: string;
  title: string;
  description: string;
  service_time_description: string | null;
  cover_file_id: string | null;
  min_price_cent: string;
  sold_count: number;
  rating_avg: string;
  review_count: number;
  status: string;
  version: number;
  seller?: CompanionApiView;
}

export interface ServiceSkuApiView {
  id: string;
  product_id: string;
  sku_name: string;
  description: string | null;
  price_cent: string;
  duration_minutes: number | null;
  status: "ACTIVE" | "INACTIVE" | "DELETED";
  sort_order: number;
  version: number;
}

export interface ServiceImageApiView {
  image_kind?: "GALLERY" | "DETAIL";
  id: string;
  product_id: string;
  file_id: string;
  sort_order: number;
  is_cover: boolean;
}

export interface ServiceDetailApiView extends ServiceApiView {
  seller: CompanionApiView;
  skus: ServiceSkuApiView[];
  images: ServiceImageApiView[];
}

export interface AvailabilityApiView {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "OPEN" | "BLOCKED" | "CLOSED";
  version: number;
}

export interface ReviewApiView {
  images?: import("@xiongzai/contracts/after-sale-client").ReviewImage[];
  refund_label?: "FULLY_REFUNDED" | null;
  id: string;
  order_id?: string;
  product_id: string;
  seller_id: string;
  rating: number;
  content: string | null;
  anonymous: boolean;
  display_nickname: string;
  service_title: string;
  sku_name: string;
  created_at: string;
}

export type FavoriteTargetType = "SELLER" | "PRODUCT";

export interface FavoriteApiView {
  id: string;
  target_type: FavoriteTargetType;
  seller_id: string | null;
  product_id: string | null;
  created_at: string;
}

export interface PublicFileApiView {
  id: string;
  content_url: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
}

export interface CompanionVoiceAccessApiView {
  file_id: string;
  mime_type: string;
  duration_ms: number | null;
  access: { url: string; expires_at: string | null };
}

export type FileType = "REVIEW_IMAGE" | "USER_AVATAR" | "SELLER_AVATAR" | "SELLER_COVER" | "PRODUCT_IMAGE" | "VOICE_SAMPLE" | "PAYMENT_PAYLOAD" | "COMPLAINT_EVIDENCE" | "ADMIN_EVIDENCE" | "ORDER_FULFILLMENT_IMAGE" | "ORDER_FULFILLMENT_VIDEO" | "CHAT_IMAGE" | "CHAT_VOICE";
export type FileUploadStatus = "PENDING" | "UPLOADED" | "VERIFIED" | "FAILED" | "DELETED";
export type FileModerationStatus = "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
export type FileVisibility = "PUBLIC" | "PRIVATE" | "SIGNED";

export interface FilePolicyApiView {
  maximum_count?: number;
  temporary_test_configuration?: boolean;
  file_type: FileType;
  mime_types: string[];
  maximum_bytes: number;
  visibility: FileVisibility;
  minimum_duration_ms: number | null;
  maximum_duration_ms: number | null;
}

export interface FileApiView {
  id: string;
  owner_user_id: string | null;
  file_type: FileType;
  mime_type: string;
  size_bytes: string | number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  upload_status: FileUploadStatus;
  moderation_status: FileModerationStatus;
  visibility: FileVisibility;
  created_at: string;
  updated_at: string;
}

export type RecoverableFileApiView = Omit<FileApiView, "owner_user_id"> & { bound_order_id?: string | null; bound_message_id?: string | null };

export interface FileUploadRequestApiView {
  file: FileApiView;
  upload: {
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expires_at: string;
  };
}

export interface OwnedFileApiView extends FileApiView {
  access: { url: string; expires_at: string | null };
}

export interface OrderDraftApi {
  product_id: string;
  sku_id?: string;
  slot_id?: string;
  quantity: number;
  service_starts_at?: string;
  buyer_note?: string | null;
  expected_payable_amount_cent?: string;
}

export interface OrderPreviewApiView {
  rule_version?: string;
  game?: import("@xiongzai/contracts").ProductGame;
  fulfillment_seconds?: number | null;
  product_id: string;
  product_title: string;
  product_image_file_id: string | null;
  seller_id: string;
  seller_name: string;
  sku_id: string;
  sku_name: string;
  sku_price_cent: string;
  sku_duration_minutes: number | null;
  quantity: number;
  total_amount_cent: string;
  discount_cent: string;
  payable_amount_cent: string;
  commission_rate_bps: number;
  platform_fee_cent: string;
  seller_income_cent: string;
  service_starts_at: string | null;
  service_ends_at: string | null;
}

export interface PaymentApiView {
  id: string;
  payment_no: string;
  order_id: string;
  channel: import("@xiongzai/contracts").PaymentChannel;
  amount_cent: string;
  currency: string;
  status: PaymentStatus;
  provider_transaction_id: string | null;
  paid_at: string | null;
  closed_at: string | null;
  version: number;
  created_at: string;
  client_payload?: Record<string, unknown>;
}

export interface OrderApiView {
  rule_version?: string;
  game?: import("@xiongzai/contracts").ProductGame;
  fulfillment_seconds?: number | null;
  fulfillment_due_at?: string | null;
  fulfillment_evidence?: { file_id: string; kind: "IMAGE" | "VIDEO" }[];
  evidence_review_pending?: boolean;
  receipt_extension_used?: boolean;
  last_reminded_at?: string | null;
  review_deadline_at?: string | null;
  id: string;
  order_no: string;
  buyer_id: string;
  seller_user_id: string;
  seller_id: string;
  product_id: string;
  sku_id: string;
  product_title: string;
  product_image: string;
  product_description: string;
  seller_name: string;
  seller_avatar: string | null;
  sku_name: string;
  sku_description: string | null;
  sku_price_cent: string;
  sku_duration_minutes: number | null;
  quantity: number;
  total_amount_cent: string;
  discount_cent: string;
  payable_amount_cent: string;
  paid_amount_cent: string;
  refunded_amount_cent: string;
  commission_rate_bps: number;
  platform_fee_cent: string;
  seller_income_cent: string;
  service_starts_at: string | null;
  service_ends_at: string | null;
  buyer_note: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  after_sale_status: AfterSaleStatus;
  expires_at: string;
  auto_confirm_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  reviewed?: boolean;
  available_actions?: BuyerOrderAction[];
  seller_available_actions?: SellerOrderAction[];
  buyer?: { nickname: string; avatar_file_id: string | null };
}

export type SellerOrderAction = "ACCEPT" | "REJECT" | "START" | "COMPLETE" | "PROCESS_REFUND" | "CONTACT_BUYER";

export interface OrderDetailApiView extends OrderApiView {
  after_sale_capabilities?: { basic_refund: boolean; platform_refund_review: boolean; remedy_fulfillment: boolean; negotiated_receipt_clock: boolean; automatic_liability_ruling: boolean };
  available_actions: BuyerOrderAction[];
  available_refund_amount_cent: string;
  reservation: { id: string; slot_id: string; starts_at: string; ends_at: string; status: string; expires_at: string | null; released_at: string | null; version: number } | null;
  payments: PaymentApiView[];
  after_sale_cases?: {id:string;state:string;version:number;case_type:string;deadline_at:string|null}[];
  refunds: RefundSummaryApiView[];
  complaints: ComplaintSummaryApiView[];
  review: { id: string; status: ReviewStatus; rating: number; created_at: string } | null;
  status_logs: { old_status: string | null; new_status: string; action: string; remark: string | null; created_at: string }[];
}

export interface RefundSummaryApiView { case_id?: string | null; case_version?: number; case_state?: string; id: string; refund_no: string; status: RefundStatus; requested_amount_cent: string; approved_amount_cent: string | null; version: number; created_at: string }
export interface RefundApiView extends RefundSummaryApiView { order_id: string; payment_id: string; reason_code: string; reason_text: string; description: string | null; seller_decision: string | null; seller_reason: string | null; admin_decision: string | null; admin_reason: string | null; provider_refund_no: string | null; escalated_at: string | null; completed_at: string | null; updated_at: string; available_actions: BuyerRefundAction[]; logs: { id: string; old_status: RefundStatus | null; new_status: RefundStatus; operator_role: string; action: string; reason: string | null; created_at: string }[] }
export interface ComplaintSummaryApiView { id: string; complaint_no: string; status: ComplaintStatus; complaint_type: string; version: number; created_at: string }
export interface ComplaintApiView extends ComplaintSummaryApiView { target_type: "USER" | "SELLER" | "PRODUCT" | "ORDER"; order_id: string | null; description: string; admin_result: string | null; processed_at: string | null; completed_at: string | null; updated_at: string; logs: { id: string; old_status: ComplaintStatus | null; new_status: ComplaintStatus; operator_role: string; action: string; reason: string | null; created_at: string }[]; evidences: { id: string; file_id: string; description: string | null; created_at: string }[] }
export interface MyReviewApiView extends ReviewApiView { order_id: string; buyer_id: string; status: ReviewStatus; hidden_at: string | null; hidden_reason: string | null }

export interface ConversationApiView { id: string; conversation_no: string; conversation_type: ConversationType; product_id: string | null; order_id: string | null; last_message_preview: string | null; last_message_at: string | null; unread_count: number; member_role: ConversationMemberRole; version: number; created_at: string; can_send: boolean; send_block_reason: string | null; counterpart: { user_id: string | null; kind: "SELLER" | "BUYER" | "PLATFORM"; nickname: string; avatar_file_id: string | null; seller_id: string | null; account_status: UserStatus }; support_case: { id: string; case_no: string; status: SupportCaseStatus; version: number } | null }
export interface MessageApiView { id: string; conversation_id: string; client_message_id: string; sequence_no: string; sender_user_id: string | null; sender_admin_id: string | null; sender_role: ConversationMemberRole; message_type: "TEXT" | "SYSTEM" | "STICKER" | "IMAGE" | "VOICE"; media_file_id?: string; sticker?: import("@xiongzai/contracts").BearSticker; content: string; send_status: MessageSendStatus; moderation_status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED"; created_at: string; read_by_recipient: boolean }
export interface SupportCaseApiView { id: string; case_no: string; requester_id: string; conversation_id: string; topic: string; priority: SupportPriority; status: SupportCaseStatus; queue_key: string; assigned_admin_id: string | null; related_type: RelatedObjectType | null; related_id: string | null; source_page: string | null; first_response_at: string | null; closed_at: string | null; close_reason: string | null; version: number; created_at: string; updated_at: string }
export interface SupportCaseDetailApiView extends SupportCaseApiView { assigned_admin: { id: string; display_name: string } | null; logs: { id: string; action: string; old_status: SupportCaseStatus | null; new_status: SupportCaseStatus; old_queue_key: string | null; new_queue_key: string | null; reason: string | null; created_at: string }[] }
export interface NotificationApiView { id: string; category: NotificationCategory; notification_type: string; title: string; content_template_id: string; content_variables: Record<string, unknown>; related_type: NotificationRelatedObjectType | null; related_id: string | null; read_status: NotificationReadStatus; read_at: string | null; created_at: string }
export interface PublicUserApiView {
  id: string;
  nickname: string;
  avatar_file_id: string | null;
  bio: string | null;
  public_user_no: string;
  online_status: "ONLINE" | "OFFLINE" | null;
  following_count: number;
  public_review_count: number;
  public_reviews: { id: string; rating: number; content: string | null; seller_name: string; service_title: string; created_at: string }[];
  created_at: string;
}

export interface PrivacySettingsApiView { show_online_status: boolean; show_public_profile: boolean; personalized_recommendations: boolean; version: number; updated_at: string }
export interface SessionApiView { id: string; device_id_mask: string; device_type: "WEB" | "IOS" | "ANDROID"; current: boolean; expires_at: string; revoked_at: string | null; last_used_at: string; created_at: string }
export interface PolicyApiView { id: string; policy_type: PolicyType; title: string; content: string; version_no: number; published_at: string }
export interface PolicyAcceptanceApiView { policy_version_id: string; policy_type: PolicyType; title: string; version_no: number; published_at: string; acceptance_scene: StoredPolicyAcceptanceScene; confirmation_method: PolicyConfirmationMethod; accepted_at: string }

export type SellerStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED" | "BANNED";
export type SellerApplicationStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "NEEDS_SUPPLEMENT" | "APPROVED" | "REJECTED";
export type SellerProductStatus = "DRAFT" | "PENDING_REVIEW" | "ON_SALE" | "REVIEW_REJECTED" | "OFF_SALE" | "ADMIN_OFF_SALE" | "DELETED";
export interface SellerApplicationApiView { id: string; seller_id: string; version_no: number; status: SellerApplicationStatus; submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null; required_fields: string[] | null; version: number; created_at: string; revision_kind?: "INITIAL_ONBOARDING" | "PROFILE_UPDATE" }
export interface SellerProfileRevisionApiView extends SellerApplicationApiView { revision_kind: "PROFILE_UPDATE"; snapshot: { seller_nickname: string; seller_avatar_file_id: string | null; cover_file_id: string | null; introduction: string | null; game_rank: string | null; kd: string | null; preferred_mode: string | null; play_style: string | null; game_experience: string | null; voice_file_id: string | null; voice_duration_ms: number | null } }
export interface SellerProfileApiView { id: string; user_id: string; status: SellerStatus; seller_nickname: string; seller_avatar_file_id: string | null; cover_file_id: string | null; introduction: string | null; game_rank: string | null; kd: string | null; preferred_mode: string | null; play_style: string | null; game_experience: string | null; voice_file_id: string | null; voice_duration_ms: number | null; accepting_orders: boolean; rating_avg: string; review_count: number; completed_order_count: number; favorite_count: number; approved_at: string | null; suspended_reason: string | null; version: number; created_at: string; updated_at: string; latest_application?: SellerApplicationApiView | null; pending_profile_revision?: SellerProfileRevisionApiView | null }
export interface SellerServiceApiView { game?:import("@xiongzai/contracts").ProductGame; pricing_mode?:"SINGLE"|"MULTI"; fulfillment_seconds?:number|null; id: string; seller_id: string; title: string; description: string; service_time_description: string | null; cover_file_id: string | null; status: SellerProductStatus; rejection_reason: string | null; rating_avg: string; review_count: number; sold_count: number; min_price_cent: string; current_version_no: number; submitted_at: string | null; approved_at: string | null; version: number; created_at: string; updated_at: string }
export interface SellerServiceDetailApiView extends SellerServiceApiView { seller: SellerProfileApiView; skus: ServiceSkuApiView[]; images: ServiceImageApiView[] }
export interface SellerFinanceSummaryApiView { after_sale_held_cent?: string; pending_recovery_cent?: string; seller_id: string; total_earned_cent: string; pending_cent: string; available_cent: string; locked_cent: string; withdrawn_cent: string; liability_cent: string; withdrawal_paused: boolean; withdrawal_pause_reason: "LIABILITY" | "RISK" | null }
export interface SellerOverviewApiView { seller: SellerProfileApiView; service_counts: Partial<Record<SellerProductStatus, number>>; order_counts: Partial<Record<OrderStatus, number>>; finance: SellerFinanceSummaryApiView }

export type SellerIncomeStatus = "PENDING_SETTLEMENT" | "AVAILABLE" | "WITHDRAWAL_LOCKED" | "WITHDRAWN" | "REVERSED";
export interface SellerIncomeApiView { id: string; order_id: string; order_no: string; service_title: string; completed_at: string | null; order_amount_cent: string; platform_fee_cent: string; seller_amount_cent: string; available_amount_cent: string; locked_amount_cent: string; withdrawn_amount_cent: string; reversed_amount_cent: string; status: SellerIncomeStatus; settlement_available_at: string; available_at: string | null; version: number; created_at: string }
export interface SellerLiabilityApiView { id: string; liability_no: string; refund_id: string; original_amount_cent: string; outstanding_amount_cent: string; status: "OPEN" | "PARTIALLY_OFFSET" | "SETTLED" | "WAIVED"; risk_hold: boolean; settled_at: string | null; version: number; created_at: string }
export interface PayoutAccountApiView { id: string; account_type: "WECHAT" | "ALIPAY"; display_mask: string; verification_status: "PENDING" | "VERIFIED" | "REJECTED"; is_default: boolean; last_verified_at: string | null; version: number; created_at: string }
export type WithdrawalStatus = "CREATED" | "RISK_REVIEW" | "APPROVED" | "PAYOUT_PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED" | "CLOSED";
export interface WithdrawalApiView { id: string; withdrawal_no: string; seller_id: string; payout_account_id: string; amount_cent: string; fee_cent: string; actual_amount_cent: string; status: WithdrawalStatus; risk_status: string; reject_reason: string | null; provider_payout_no: string | null; processing_at: string | null; completed_at: string | null; failed_at: string | null; version: number; created_at: string; updated_at: string }
export interface WithdrawalDetailApiView extends WithdrawalApiView { payout_account: PayoutAccountApiView; logs: { id: string; old_status: WithdrawalStatus | null; new_status: WithdrawalStatus; operator_role: string; action: string; reason: string | null; created_at: string }[] }
export interface WithdrawalPolicyApiView { fee_bps: number; min_amount_cent: string; max_amount_cent: string }
export interface WithdrawalPreviewApiView { amount_cent: string; fee_cent: string; actual_amount_cent: string; available_cent: string; min_amount_cent: string; max_amount_cent: string; payout_account: PayoutAccountApiView }
