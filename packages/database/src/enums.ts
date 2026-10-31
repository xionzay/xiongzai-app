import { pgEnum } from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["NORMAL", "DISABLED", "CANCELLED"]);
export const identityVerificationStatusEnum = pgEnum("identity_verification_status", [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
]);
export const deviceTypeEnum = pgEnum("device_type", ["WEB", "IOS", "ANDROID", "ADMIN_WEB"]);
export const policyStatusEnum = pgEnum("policy_status", ["DRAFT", "PUBLISHED", "RETIRED"]);
export const policyAcceptanceSceneEnum = pgEnum("policy_acceptance_scene", [
  "LOGIN",
  "ORDER_PAYMENT",
  "CHAT_ENTRY",
  "SELLER_ONBOARDING",
  "IDENTITY_VERIFICATION",
  "VOICE_SAMPLE_UPLOAD",
  "COMPLAINT_SUBMISSION",
  "LEGACY_UNSCOPED",
]);
export const policyConfirmationMethodEnum = pgEnum("policy_confirmation_method", ["ONLINE_CONFIRM"]);
export const phoneChangeRequestStatusEnum = pgEnum("phone_change_request_status", [
  "PENDING_OLD_VERIFICATION",
  "PENDING_NEW_VERIFICATION",
  "READY",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
]);
export const personalDataExportStatusEnum = pgEnum("personal_data_export_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
]);
export const accountCancellationStatusEnum = pgEnum("account_cancellation_status", [
  "REQUESTED",
  "CANCELLED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
]);

export const sellerStatusEnum = pgEnum("seller_status", [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "BANNED",
]);
export const sellerApplicationStatusEnum = pgEnum("seller_application_status", [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_SUPPLEMENT",
  "APPROVED",
  "REJECTED",
]);
export const sellerReviewActionEnum = pgEnum("seller_review_action", [
  "SUBMIT",
  "START_REVIEW",
  "REQUEST_SUPPLEMENT",
  "APPROVE",
  "REJECT",
  "SUSPEND",
  "RESTORE",
  "BAN",
]);
export const productStatusEnum = pgEnum("product_status", [
  "DRAFT",
  "PENDING_REVIEW",
  "ON_SALE",
  "REVIEW_REJECTED",
  "OFF_SALE",
  "ADMIN_OFF_SALE",
  "DELETED",
]);
export const productReviewActionEnum = pgEnum("product_review_action", [
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "SELLER_OFF_SALE",
  "SELLER_RESTORE",
  "ADMIN_OFF_SALE",
  "DELETE",
]);
export const skuStatusEnum = pgEnum("sku_status", ["ACTIVE", "INACTIVE", "DELETED"]);
export const favoriteTargetTypeEnum = pgEnum("favorite_target_type", ["SELLER", "PRODUCT"]);
export const availabilitySlotStatusEnum = pgEnum("availability_slot_status", ["OPEN", "BLOCKED", "CLOSED"]);
export const reservationStatusEnum = pgEnum("reservation_status", ["HELD", "CONFIRMED", "RELEASED", "EXPIRED"]);

export const conversationTypeEnum = pgEnum("conversation_type", ["CONSULTATION", "ORDER", "SUPPORT"]);
export const conversationMemberRoleEnum = pgEnum("conversation_member_role", ["BUYER", "SELLER", "USER", "ADMIN", "SYSTEM"]);
export const messageTypeEnum = pgEnum("message_type", ["TEXT", "SYSTEM", "STICKER", "IMAGE", "VOICE"]);
export const messageSendStatusEnum = pgEnum("message_send_status", ["SENT", "FAILED", "DELETED"]);
export const contentModerationStatusEnum = pgEnum("content_moderation_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "FLAGGED",
]);
export const supportCaseStatusEnum = pgEnum("support_case_status", [
  "WAITING",
  "SERVING",
  "TRANSFERRED",
  "CLOSED",
]);
export const supportPriorityEnum = pgEnum("support_priority", ["NORMAL", "MEDIUM", "HIGH", "URGENT"]);
export const supportCaseActionEnum = pgEnum("support_case_action", [
  "CREATED",
  "RECEIVED",
  "REPLIED",
  "TRANSFERRED",
  "PRIORITY_CHANGED",
  "BUSINESS_LINKED",
  "CLOSED",
  "REOPENED",
]);
export const relatedObjectTypeEnum = pgEnum("related_object_type", [
  "USER",
  "SELLER",
  "PRODUCT",
  "ORDER",
  "PAYMENT",
  "REFUND",
  "COMPLAINT",
  "REVIEW",
  "WITHDRAWAL",
  "CONVERSATION",
  "SUPPORT_CASE",
  "PLATFORM",
  "FEEDBACK",
  "ANNOUNCEMENT",
]);
export const notificationCategoryEnum = pgEnum("notification_category", ["ORDER", "ACCOUNT", "PLATFORM", "FEEDBACK"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["SUBMITTED", "PROCESSING", "REPLIED"]);
export const announcementStatusEnum = pgEnum("announcement_status", ["DRAFT", "PUBLISHED", "RETIRED"]);
export const notificationReadStatusEnum = pgEnum("notification_read_status", ["UNREAD", "READ"]);
export const deliveryChannelEnum = pgEnum("delivery_channel", ["IN_APP", "SMS", "PUSH"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["PENDING", "SENT", "FAILED", "SKIPPED"]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING_SERVICE",
  "PENDING_PAYMENT",
  "PENDING_ACCEPT",
  "ACCEPTED",
  "IN_SERVICE",
  "PENDING_BUYER_CONFIRM",
  "COMPLETED",
  "CANCELLED",
  "CLOSED",
  "SELLER_REJECTED",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "CREATED",
  "PAYING",
  "PAID",
  "FAILED",
  "CLOSED",
  "REFUNDING",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);
export const paymentChannelEnum = pgEnum("payment_channel", ["WECHAT_APP", "ALIPAY_APP", "MOCK"]);
export const afterSaleStatusEnum = pgEnum("after_sale_status", ["NONE", "IN_PROGRESS", "RESOLVED"]);
export const operatorRoleEnum = pgEnum("operator_role", ["BUYER", "SELLER", "ADMIN", "SYSTEM", "PAYMENT_PROVIDER"]);
export const refundStatusEnum = pgEnum("refund_status", [
  "REQUESTED",
  "SELLER_APPROVED",
  "SELLER_REJECTED",
  "NEGOTIATING",
  "PLATFORM_REVIEW",
  "REFUND_PROCESSING",
  "REFUNDED",
  "REJECTED",
  "CANCELLED",
]);
export const refundDecisionEnum = pgEnum("refund_decision", ["APPROVE", "REJECT"]);
export const complaintTargetTypeEnum = pgEnum("complaint_target_type", ["USER", "SELLER", "PRODUCT", "ORDER"]);
export const complaintStatusEnum = pgEnum("complaint_status", [
  "SUBMITTED",
  "ACCEPTED",
  "PROCESSING",
  "NEED_MORE_EVIDENCE",
  "COMPLETED",
  "CLOSED",
]);
export const reviewStatusEnum = pgEnum("review_status", ["PENDING", "PUBLIC", "HIDDEN"]);
export const ratingSubjectTypeEnum = pgEnum("rating_subject_type", ["SELLER", "PRODUCT"]);

export const ledgerOwnerTypeEnum = pgEnum("ledger_owner_type", ["PLATFORM", "SELLER", "CLEARING"]);
export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
  "PLATFORM_RECEIVABLE",
  "PLATFORM_COMMISSION",
  "SELLER_PENDING",
  "SELLER_AVAILABLE",
  "SELLER_WITHDRAWAL_LOCKED",
  "SELLER_AFTER_SALE_HELD",
  "SELLER_WITHDRAWN",
  "SELLER_LIABILITY",
  "REFUND_CLEARING",
]);
export const ledgerTransactionTypeEnum = pgEnum("ledger_transaction_type", [
  "ORDER_COMPLETED",
  "INCOME_AVAILABLE",
  "REFUND",
  "WITHDRAWAL_LOCK",
  "WITHDRAWAL_COMPLETE",
  "WITHDRAWAL_RELEASE",
  "LIABILITY_CREATED",
  "LIABILITY_OFFSET",
  "REVERSAL",
  "ADJUSTMENT",
]);
export const ledgerTransactionStatusEnum = pgEnum("ledger_transaction_status", ["PENDING", "POSTED", "REVERSED"]);
export const ledgerSideEnum = pgEnum("ledger_side", ["DEBIT", "CREDIT"]);
export const sellerIncomeStatusEnum = pgEnum("seller_income_status", [
  "PENDING_SETTLEMENT",
  "AVAILABLE",
  "WITHDRAWAL_LOCKED",
  "WITHDRAWN",
  "REVERSED",
]);
export const sellerLiabilityStatusEnum = pgEnum("seller_liability_status", ["OPEN", "PARTIALLY_OFFSET", "SETTLED", "WAIVED"]);
export const payoutAccountTypeEnum = pgEnum("payout_account_type", ["WECHAT", "ALIPAY"]);
export const payoutVerificationStatusEnum = pgEnum("payout_verification_status", ["PENDING", "VERIFIED", "REJECTED", "REVOKED"]);
export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "CREATED",
  "RISK_REVIEW",
  "APPROVED",
  "PAYOUT_PROCESSING",
  "COMPLETED",
  "REJECTED",
  "FAILED",
  "CLOSED",
]);
export const riskStatusEnum = pgEnum("risk_status", ["CLEAR", "REVIEW", "BLOCKED", "RESOLVED"]);
export const reconciliationRunStatusEnum = pgEnum("reconciliation_run_status", ["RUNNING", "COMPLETED", "FAILED"]);
export const reconciliationItemStatusEnum = pgEnum("reconciliation_item_status", ["OPEN", "RESOLVED", "IGNORED"]);

export const fileTypeEnum = pgEnum("file_type", [
  "REVIEW_IMAGE",
  "CHAT_IMAGE", "CHAT_VOICE",
  "ORDER_FULFILLMENT_IMAGE",
  "ORDER_FULFILLMENT_VIDEO",
  "USER_AVATAR",
  "SELLER_AVATAR",
  "SELLER_COVER",
  "PRODUCT_IMAGE",
  "VOICE_SAMPLE",
  "PAYMENT_PAYLOAD",
  "COMPLAINT_EVIDENCE",
  "ADMIN_EVIDENCE",
  "DATA_EXPORT",
  "ANNOUNCEMENT_IMAGE",
]);
export const fileUploadStatusEnum = pgEnum("file_upload_status", ["PENDING", "UPLOADED", "VERIFIED", "FAILED", "DELETED"]);
export const fileVisibilityEnum = pgEnum("file_visibility", ["PUBLIC", "PRIVATE", "SIGNED"]);
export const fileUsageTypeEnum = pgEnum("file_usage_type", ["AVATAR", "COVER", "GALLERY", "VOICE", "EVIDENCE", "PAYLOAD", "EXPORT"]);
export const configStatusEnum = pgEnum("config_status", ["DRAFT", "ACTIVE", "RETIRED"]);

export const adminStatusEnum = pgEnum("admin_status", ["ACTIVE", "LOCKED", "DISABLED"]);
export const mfaTypeEnum = pgEnum("mfa_type", ["TOTP", "WEBAUTHN", "RECOVERY_CODE"]);
export const securityEventStatusEnum = pgEnum("security_event_status", ["OPEN", "RESOLVED", "IGNORED"]);
export const riskEventStatusEnum = pgEnum("risk_event_status", ["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["PENDING", "PROCESSING", "PUBLISHED", "FAILED"]);
export const inboxStatusEnum = pgEnum("inbox_status", ["PROCESSING", "COMPLETED", "FAILED"]);
export const idempotencyStatusEnum = pgEnum("idempotency_status", ["PROCESSING", "COMPLETED", "FAILED"]);
export const scheduledJobStatusEnum = pgEnum("scheduled_job_status", ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]);
