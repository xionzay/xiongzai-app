CREATE TYPE "public"."admin_status" AS ENUM('ACTIVE', 'LOCKED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."after_sale_status" AS ENUM('NONE', 'IN_PROGRESS', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."availability_slot_status" AS ENUM('OPEN', 'BLOCKED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('SUBMITTED', 'ACCEPTED', 'PROCESSING', 'NEED_MORE_EVIDENCE', 'COMPLETED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."complaint_target_type" AS ENUM('USER', 'SELLER', 'PRODUCT', 'ORDER');--> statement-breakpoint
CREATE TYPE "public"."config_status" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."content_moderation_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');--> statement-breakpoint
CREATE TYPE "public"."conversation_member_role" AS ENUM('BUYER', 'SELLER', 'USER', 'ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('CONSULTATION', 'ORDER', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('IN_APP', 'SMS', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('WEB', 'IOS', 'ANDROID', 'ADMIN_WEB');--> statement-breakpoint
CREATE TYPE "public"."favorite_target_type" AS ENUM('SELLER', 'PRODUCT');--> statement-breakpoint
CREATE TYPE "public"."file_type" AS ENUM('USER_AVATAR', 'SELLER_AVATAR', 'SELLER_COVER', 'PRODUCT_IMAGE', 'VOICE_SAMPLE', 'PAYMENT_PAYLOAD', 'COMPLAINT_EVIDENCE', 'ADMIN_EVIDENCE');--> statement-breakpoint
CREATE TYPE "public"."file_upload_status" AS ENUM('PENDING', 'UPLOADED', 'VERIFIED', 'FAILED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."file_usage_type" AS ENUM('AVATAR', 'COVER', 'GALLERY', 'VOICE', 'EVIDENCE', 'PAYLOAD');--> statement-breakpoint
CREATE TYPE "public"."file_visibility" AS ENUM('PUBLIC', 'PRIVATE', 'SIGNED');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."identity_verification_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_type" AS ENUM('PLATFORM_RECEIVABLE', 'PLATFORM_COMMISSION', 'SELLER_PENDING', 'SELLER_AVAILABLE', 'SELLER_WITHDRAWAL_LOCKED', 'SELLER_WITHDRAWN', 'SELLER_LIABILITY', 'REFUND_CLEARING');--> statement-breakpoint
CREATE TYPE "public"."ledger_owner_type" AS ENUM('PLATFORM', 'SELLER', 'CLEARING');--> statement-breakpoint
CREATE TYPE "public"."ledger_side" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_status" AS ENUM('PENDING', 'POSTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_type" AS ENUM('ORDER_COMPLETED', 'INCOME_AVAILABLE', 'REFUND', 'WITHDRAWAL_LOCK', 'WITHDRAWAL_COMPLETE', 'WITHDRAWAL_RELEASE', 'LIABILITY_CREATED', 'LIABILITY_OFFSET', 'REVERSAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."message_send_status" AS ENUM('SENT', 'FAILED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."mfa_type" AS ENUM('TOTP', 'WEBAUTHN', 'RECOVERY_CODE');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('ORDER', 'ACCOUNT', 'PLATFORM');--> statement-breakpoint
CREATE TYPE "public"."notification_read_status" AS ENUM('UNREAD', 'READ');--> statement-breakpoint
CREATE TYPE "public"."operator_role" AS ENUM('BUYER', 'SELLER', 'ADMIN', 'SYSTEM', 'PAYMENT_PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'PENDING_ACCEPT', 'ACCEPTED', 'IN_SERVICE', 'PENDING_BUYER_CONFIRM', 'COMPLETED', 'CANCELLED', 'CLOSED', 'SELLER_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'PAYING', 'PAID', 'FAILED', 'CLOSED', 'REFUNDING', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payout_account_type" AS ENUM('WECHAT', 'ALIPAY');--> statement-breakpoint
CREATE TYPE "public"."payout_verification_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('DRAFT', 'PUBLISHED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."product_review_action" AS ENUM('SUBMIT', 'APPROVE', 'REJECT', 'SELLER_OFF_SALE', 'SELLER_RESTORE', 'ADMIN_OFF_SALE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'ON_SALE', 'REVIEW_REJECTED', 'OFF_SALE', 'ADMIN_OFF_SALE', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."rating_subject_type" AS ENUM('SELLER', 'PRODUCT');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_item_status" AS ENUM('OPEN', 'RESOLVED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."refund_decision" AS ENUM('APPROVE', 'REJECT');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('REQUESTED', 'SELLER_APPROVED', 'SELLER_REJECTED', 'NEGOTIATING', 'PLATFORM_REVIEW', 'REFUND_PROCESSING', 'REFUNDED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."related_object_type" AS ENUM('USER', 'SELLER', 'PRODUCT', 'ORDER', 'PAYMENT', 'REFUND', 'COMPLAINT', 'REVIEW', 'WITHDRAWAL', 'CONVERSATION', 'SUPPORT_CASE', 'PLATFORM');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('PENDING', 'PUBLIC', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."risk_event_status" AS ENUM('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('CLEAR', 'REVIEW', 'BLOCKED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."scheduled_job_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."security_event_status" AS ENUM('OPEN', 'RESOLVED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."seller_application_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_SUPPLEMENT', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."seller_income_status" AS ENUM('PENDING_SETTLEMENT', 'AVAILABLE', 'WITHDRAWAL_LOCKED', 'WITHDRAWN', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."seller_liability_status" AS ENUM('OPEN', 'PARTIALLY_OFFSET', 'SETTLED', 'WAIVED');--> statement-breakpoint
CREATE TYPE "public"."seller_review_action" AS ENUM('SUBMIT', 'START_REVIEW', 'REQUEST_SUPPLEMENT', 'APPROVE', 'REJECT', 'SUSPEND', 'RESTORE', 'BAN');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BANNED');--> statement-breakpoint
CREATE TYPE "public"."sku_status" AS ENUM('ACTIVE', 'INACTIVE', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."support_case_action" AS ENUM('CREATED', 'RECEIVED', 'REPLIED', 'TRANSFERRED', 'PRIORITY_CHANGED', 'BUSINESS_LINKED', 'CLOSED', 'REOPENED');--> statement-breakpoint
CREATE TYPE "public"."support_case_status" AS ENUM('WAITING', 'SERVING', 'TRANSFERRED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."support_priority" AS ENUM('NORMAL', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('NORMAL', 'DISABLED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('CREATED', 'RISK_REVIEW', 'APPROVED', 'PAYOUT_PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"status" "admin_status" DEFAULT 'ACTIVE' NOT NULL,
	"mfa_required" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_mfa_factors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"factor_type" "mfa_type" NOT NULL,
	"secret_ciphertext" text,
	"credential_id_hash" char(64),
	"label" varchar(64),
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_operation_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" varchar(128) NOT NULL,
	"target_type" "related_object_type" NOT NULL,
	"target_id" uuid,
	"reason" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"request_id" varchar(128) NOT NULL,
	"trace_id" varchar(128),
	"ip" varchar(64) NOT NULL,
	"user_agent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"admin_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by_admin_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_pk" PRIMARY KEY("admin_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"session_token_hash" char(64) NOT NULL,
	"ip" varchar(64) NOT NULL,
	"user_agent" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" char(64) NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"device_type" "device_type" NOT NULL,
	"ip" varchar(64) NOT NULL,
	"user_agent" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_evidences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"complaint_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_by_admin_id" uuid,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"complaint_id" uuid NOT NULL,
	"old_status" "complaint_status",
	"new_status" "complaint_status" NOT NULL,
	"operator_user_id" uuid,
	"operator_admin_id" uuid,
	"operator_role" "operator_role" NOT NULL,
	"action" varchar(64) NOT NULL,
	"reason" text,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"complaint_no" varchar(64) NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" "complaint_target_type" NOT NULL,
	"target_user_id" uuid,
	"target_seller_id" uuid,
	"target_product_id" uuid,
	"order_id" uuid,
	"complaint_type" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"status" "complaint_status" DEFAULT 'SUBMITTED' NOT NULL,
	"assigned_admin_id" uuid,
	"admin_result" text,
	"processed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_target_present" CHECK (("complaints"."target_type" = 'USER' AND "complaints"."target_user_id" IS NOT NULL) OR ("complaints"."target_type" = 'SELLER' AND "complaints"."target_seller_id" IS NOT NULL) OR ("complaints"."target_type" = 'PRODUCT' AND "complaints"."target_product_id" IS NOT NULL) OR ("complaints"."target_type" = 'ORDER' AND "complaints"."order_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid,
	"admin_id" uuid,
	"role" "conversation_member_role" NOT NULL,
	"last_read_sequence_no" bigint DEFAULT 0 NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "conversation_members_identity_xor" CHECK ((CASE WHEN "conversation_members"."user_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "conversation_members"."admin_id" IS NULL THEN 0 ELSE 1 END) = 1),
	CONSTRAINT "conversation_members_unread_nonnegative" CHECK ("conversation_members"."unread_count" >= 0 AND "conversation_members"."last_read_sequence_no" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_no" varchar(64) NOT NULL,
	"conversation_type" "conversation_type" NOT NULL,
	"product_id" uuid,
	"order_id" uuid,
	"last_message_id" uuid,
	"last_message_preview" varchar(200),
	"last_message_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"status" "delivery_status" DEFAULT 'PENDING' NOT NULL,
	"provider_message_id" varchar(160),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_attempts_nonnegative" CHECK ("delivery_logs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" "favorite_target_type" NOT NULL,
	"seller_id" uuid,
	"product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_target_matches" CHECK (("favorites"."target_type" = 'SELLER' AND "favorites"."seller_id" IS NOT NULL AND "favorites"."product_id" IS NULL) OR ("favorites"."target_type" = 'PRODUCT' AND "favorites"."product_id" IS NOT NULL AND "favorites"."seller_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "file_usages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"usage_type" "file_usage_type" NOT NULL,
	"target_type" "related_object_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid,
	"bucket" varchar(128) NOT NULL,
	"object_key" text NOT NULL,
	"file_type" "file_type" NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"sha256" char(64) NOT NULL,
	"upload_status" "file_upload_status" DEFAULT 'PENDING' NOT NULL,
	"moderation_status" "content_moderation_status" DEFAULT 'PENDING' NOT NULL,
	"visibility" "file_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_size_positive" CHECK ("files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" varchar(64) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status" "idempotency_status" DEFAULT 'PROCESSING' NOT NULL,
	"response_code" integer,
	"response_body_json" jsonb,
	"resource_type" "related_object_type",
	"resource_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_resource_pair" CHECK (("idempotency_keys"."resource_type" IS NULL) = ("idempotency_keys"."resource_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "identity_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_reference" varchar(128) NOT NULL,
	"legal_name_ciphertext" text NOT NULL,
	"legal_name_hash" char(64) NOT NULL,
	"legal_name_mask" varchar(64) NOT NULL,
	"document_ciphertext" text NOT NULL,
	"document_hash" char(64) NOT NULL,
	"document_mask" varchar(64) NOT NULL,
	"status" "identity_verification_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_code" varchar(64),
	"rejection_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"consumer_name" varchar(128) NOT NULL,
	"status" "inbox_status" DEFAULT 'PROCESSING' NOT NULL,
	"payload_sha256" char(64) NOT NULL,
	"processing_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_type" "ledger_owner_type" NOT NULL,
	"seller_id" uuid,
	"system_key" varchar(64),
	"account_type" "ledger_account_type" NOT NULL,
	"currency" char(3) DEFAULT 'CNY' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_owner_matches" CHECK (("ledger_accounts"."owner_type" = 'SELLER' AND "ledger_accounts"."seller_id" IS NOT NULL AND "ledger_accounts"."system_key" IS NULL) OR ("ledger_accounts"."owner_type" IN ('PLATFORM','CLEARING') AND "ledger_accounts"."seller_id" IS NULL AND "ledger_accounts"."system_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" "ledger_side" NOT NULL,
	"amount_cent" bigint NOT NULL,
	"currency" char(3) DEFAULT 'CNY' NOT NULL,
	"memo" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_positive" CHECK ("ledger_entries"."amount_cent" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_no" varchar(64) NOT NULL,
	"transaction_type" "ledger_transaction_type" NOT NULL,
	"status" "ledger_transaction_status" DEFAULT 'PENDING' NOT NULL,
	"source_type" "related_object_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"reversal_of_transaction_id" uuid,
	"description" varchar(500) NOT NULL,
	"trace_id" varchar(128),
	"occurred_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_not_self_reversal" CHECK ("ledger_transactions"."reversal_of_transaction_id" IS NULL OR "ledger_transactions"."reversal_of_transaction_id" <> "ledger_transactions"."id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_message_id" varchar(128) NOT NULL,
	"sequence_no" bigint NOT NULL,
	"sender_user_id" uuid,
	"sender_admin_id" uuid,
	"sender_role" "conversation_member_role" NOT NULL,
	"message_type" "message_type" DEFAULT 'TEXT' NOT NULL,
	"content" text NOT NULL,
	"send_status" "message_send_status" DEFAULT 'SENT' NOT NULL,
	"moderation_status" "content_moderation_status" DEFAULT 'PENDING' NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sequence_positive" CHECK ("messages"."sequence_no" > 0),
	CONSTRAINT "messages_sender_valid" CHECK (("messages"."sender_role" = 'SYSTEM' AND "messages"."sender_user_id" IS NULL AND "messages"."sender_admin_id" IS NULL) OR ("messages"."sender_role" = 'ADMIN' AND "messages"."sender_admin_id" IS NOT NULL AND "messages"."sender_user_id" IS NULL) OR ("messages"."sender_role" IN ('BUYER','SELLER','USER') AND "messages"."sender_user_id" IS NOT NULL AND "messages"."sender_admin_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"notification_type" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content_template_id" varchar(128) NOT NULL,
	"content_variables_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"related_type" "related_object_type",
	"related_id" uuid,
	"read_status" "notification_read_status" DEFAULT 'UNREAD' NOT NULL,
	"read_at" timestamp with time zone,
	"idempotency_key" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_related_pair" CHECK (("notifications"."related_type" IS NULL) = ("notifications"."related_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "order_slot_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"slot_id" uuid,
	"seller_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'HELD' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_reservation_time_valid" CHECK ("order_slot_reservations"."ends_at" > "order_slot_reservations"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "order_status_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"old_status" "order_status",
	"new_status" "order_status" NOT NULL,
	"operator_user_id" uuid,
	"operator_admin_id" uuid,
	"operator_role" "operator_role" NOT NULL,
	"action" varchar(64) NOT NULL,
	"remark" text,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_no" varchar(40) NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"product_title_snapshot" varchar(120) NOT NULL,
	"product_image_snapshot" text NOT NULL,
	"product_description_snapshot" text NOT NULL,
	"seller_name_snapshot" varchar(32) NOT NULL,
	"seller_avatar_snapshot" text,
	"sku_name_snapshot" varchar(100) NOT NULL,
	"sku_description_snapshot" varchar(500),
	"sku_price_cent_snapshot" bigint NOT NULL,
	"sku_duration_minutes_snapshot" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_amount_cent" bigint NOT NULL,
	"discount_cent" bigint DEFAULT 0 NOT NULL,
	"payable_amount_cent" bigint NOT NULL,
	"paid_amount_cent" bigint DEFAULT 0 NOT NULL,
	"refunded_amount_cent" bigint DEFAULT 0 NOT NULL,
	"commission_rate_bps_snapshot" integer NOT NULL,
	"platform_fee_cent" bigint NOT NULL,
	"seller_income_cent" bigint NOT NULL,
	"service_starts_at" timestamp with time zone NOT NULL,
	"service_ends_at" timestamp with time zone NOT NULL,
	"buyer_note" varchar(500),
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"after_sale_status" "after_sale_status" DEFAULT 'NONE' NOT NULL,
	"cancel_reason" text,
	"seller_reject_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"auto_confirm_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"service_started_at" timestamp with time zone,
	"seller_completed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_distinct_parties" CHECK ("orders"."buyer_id" <> "orders"."seller_user_id"),
	CONSTRAINT "orders_quantity_positive" CHECK ("orders"."quantity" > 0),
	CONSTRAINT "orders_sku_price_positive" CHECK ("orders"."sku_price_cent_snapshot" > 0),
	CONSTRAINT "orders_discount_disabled" CHECK ("orders"."discount_cent" = 0),
	CONSTRAINT "orders_amounts_nonnegative" CHECK ("orders"."total_amount_cent" >= 0 AND "orders"."payable_amount_cent" >= 0 AND "orders"."paid_amount_cent" >= 0 AND "orders"."refunded_amount_cent" >= 0 AND "orders"."platform_fee_cent" >= 0 AND "orders"."seller_income_cent" >= 0),
	CONSTRAINT "orders_payable_formula" CHECK ("orders"."payable_amount_cent" = "orders"."total_amount_cent" - "orders"."discount_cent"),
	CONSTRAINT "orders_paid_cap" CHECK ("orders"."paid_amount_cent" <= "orders"."payable_amount_cent"),
	CONSTRAINT "orders_refunded_cap" CHECK ("orders"."refunded_amount_cent" <= "orders"."paid_amount_cent"),
	CONSTRAINT "orders_commission_bps_valid" CHECK ("orders"."commission_rate_bps_snapshot" BETWEEN 0 AND 10000),
	CONSTRAINT "orders_split_formula" CHECK ("orders"."platform_fee_cent" + "orders"."seller_income_cent" = "orders"."payable_amount_cent"),
	CONSTRAINT "orders_service_time_valid" CHECK ("orders"."service_ends_at" > "orders"."service_starts_at")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload_json" jsonb NOT NULL,
	"trace_id" varchar(128),
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_attempts_nonnegative" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"provider_event_id" varchar(160) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"payload_file_id" uuid,
	"payload_sha256" char(64) NOT NULL,
	"processing_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_no" varchar(64) NOT NULL,
	"channel" varchar(32) NOT NULL,
	"provider_transaction_id" varchar(128),
	"idempotency_key" varchar(128) NOT NULL,
	"amount_cent" bigint NOT NULL,
	"refunded_amount_cent" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'CNY' NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"provider_payload_file_id" uuid,
	"paid_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cent" > 0),
	CONSTRAINT "payments_refunded_cap" CHECK ("payments"."refunded_amount_cent" >= 0 AND "payments"."refunded_amount_cent" <= "payments"."amount_cent")
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"account_type" "payout_account_type" NOT NULL,
	"holder_name_ciphertext" text NOT NULL,
	"holder_name_hash" char(64) NOT NULL,
	"account_token_ciphertext" text NOT NULL,
	"account_token_hash" char(64) NOT NULL,
	"display_mask" varchar(128) NOT NULL,
	"verification_status" "payout_verification_status" DEFAULT 'PENDING' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"permission_key" varchar(128) NOT NULL,
	"description" text,
	"high_risk" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_key" varchar(128) NOT NULL,
	"value_json" jsonb NOT NULL,
	"version_no" integer NOT NULL,
	"status" "config_status" DEFAULT 'DRAFT' NOT NULL,
	"effective_at" timestamp with time zone,
	"created_by_admin_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_configs_version_positive" CHECK ("platform_configs"."version_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_type" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"version_no" integer NOT NULL,
	"status" "policy_status" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"show_online_status" boolean DEFAULT true NOT NULL,
	"show_public_profile" boolean DEFAULT true NOT NULL,
	"personalized_recommendations" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_review_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"product_version_id" uuid,
	"action" "product_review_action" NOT NULL,
	"old_status" "product_status",
	"new_status" "product_status" NOT NULL,
	"admin_id" uuid,
	"operator_user_id" uuid,
	"reason" text,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_skus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"sku_name" varchar(100) NOT NULL,
	"description" varchar(500),
	"price_cent" bigint NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "sku_status" DEFAULT 'ACTIVE' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_skus_price_positive" CHECK ("product_skus"."price_cent" > 0),
	CONSTRAINT "product_skus_duration_positive" CHECK ("product_skus"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_version_positive" CHECK ("product_versions"."version_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"service_time_description" varchar(200),
	"cover_file_id" uuid,
	"status" "product_status" DEFAULT 'DRAFT' NOT NULL,
	"rejection_reason" text,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"min_price_cent" bigint DEFAULT 0 NOT NULL,
	"current_version_no" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_min_price_nonnegative" CHECK ("products"."min_price_cent" >= 0),
	CONSTRAINT "products_rating_valid" CHECK ("products"."rating_avg" >= 0 AND "products"."rating_avg" <= 5)
);
--> statement-breakpoint
CREATE TABLE "rating_aggregates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" "rating_subject_type" NOT NULL,
	"seller_id" uuid,
	"product_id" uuid,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" bigint DEFAULT 0 NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"star_1_count" integer DEFAULT 0 NOT NULL,
	"star_2_count" integer DEFAULT 0 NOT NULL,
	"star_3_count" integer DEFAULT 0 NOT NULL,
	"star_4_count" integer DEFAULT 0 NOT NULL,
	"star_5_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_aggregates_target_matches" CHECK (("rating_aggregates"."subject_type" = 'SELLER' AND "rating_aggregates"."seller_id" IS NOT NULL AND "rating_aggregates"."product_id" IS NULL) OR ("rating_aggregates"."subject_type" = 'PRODUCT' AND "rating_aggregates"."product_id" IS NOT NULL AND "rating_aggregates"."seller_id" IS NULL)),
	CONSTRAINT "rating_aggregates_values_valid" CHECK ("rating_aggregates"."rating_count" >= 0 AND "rating_aggregates"."rating_sum" >= 0 AND "rating_aggregates"."rating_avg" >= 0 AND "rating_aggregates"."rating_avg" <= 5)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"mismatch_type" varchar(64) NOT NULL,
	"business_type" "related_object_type" NOT NULL,
	"business_id" uuid,
	"provider_reference" varchar(160),
	"platform_amount_cent" bigint,
	"provider_amount_cent" bigint,
	"status" "reconciliation_item_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" text,
	"resolved_by_admin_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_no" varchar(64) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"statement_date" timestamp with time zone NOT NULL,
	"status" "reconciliation_run_status" DEFAULT 'RUNNING' NOT NULL,
	"source_file_id" uuid,
	"total_item_count" integer DEFAULT 0 NOT NULL,
	"mismatch_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"refund_id" uuid NOT NULL,
	"old_status" "refund_status",
	"new_status" "refund_status" NOT NULL,
	"operator_user_id" uuid,
	"operator_admin_id" uuid,
	"operator_role" "operator_role" NOT NULL,
	"action" varchar(64) NOT NULL,
	"reason" text,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"refund_no" varchar(64) NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"requested_amount_cent" bigint NOT NULL,
	"approved_amount_cent" bigint,
	"reason_code" varchar(64) NOT NULL,
	"reason_text" varchar(200) NOT NULL,
	"description" text,
	"seller_decision" "refund_decision",
	"seller_reason" text,
	"admin_decision" "refund_decision",
	"admin_reason" text,
	"assigned_admin_id" uuid,
	"status" "refund_status" DEFAULT 'REQUESTED' NOT NULL,
	"provider_refund_no" varchar(128),
	"seller_processed_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_requested_positive" CHECK ("refunds"."requested_amount_cent" > 0),
	CONSTRAINT "refunds_approved_valid" CHECK ("refunds"."approved_amount_cent" IS NULL OR ("refunds"."approved_amount_cent" > 0 AND "refunds"."approved_amount_cent" <= "refunds"."requested_amount_cent"))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"content" varchar(1000),
	"anonymous" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'PENDING' NOT NULL,
	"display_nickname_snapshot" varchar(32) NOT NULL,
	"service_title_snapshot" varchar(120) NOT NULL,
	"sku_name_snapshot" varchar(100) NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by_admin_id" uuid,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_valid" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "risk_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"risk_type" varchar(128) NOT NULL,
	"severity" "support_priority" NOT NULL,
	"target_type" "related_object_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"rule_key" varchar(128) NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "risk_event_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_admin_id" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role_key" varchar(64) NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_key" varchar(160) NOT NULL,
	"job_type" varchar(128) NOT NULL,
	"target_type" "related_object_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "scheduled_job_status" DEFAULT 'PENDING' NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(128),
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_jobs_attempts_valid" CHECK ("scheduled_jobs"."attempts" >= 0 AND "scheduled_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "security_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"admin_id" uuid,
	"event_type" varchar(128) NOT NULL,
	"status" "security_event_status" DEFAULT 'OPEN' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"resolved_by_admin_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_logs_risk_score_valid" CHECK ("security_logs"."risk_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "seller_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"status" "seller_application_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"required_fields_json" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_application_version_positive" CHECK ("seller_applications"."version_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "seller_availability_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "availability_slot_status" DEFAULT 'OPEN' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_slots_time_valid" CHECK ("seller_availability_slots"."ends_at" > "seller_availability_slots"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "seller_incomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"ledger_transaction_id" uuid NOT NULL,
	"order_amount_cent" bigint NOT NULL,
	"platform_fee_cent" bigint NOT NULL,
	"seller_amount_cent" bigint NOT NULL,
	"available_amount_cent" bigint DEFAULT 0 NOT NULL,
	"locked_amount_cent" bigint DEFAULT 0 NOT NULL,
	"withdrawn_amount_cent" bigint DEFAULT 0 NOT NULL,
	"reversed_amount_cent" bigint DEFAULT 0 NOT NULL,
	"status" "seller_income_status" DEFAULT 'PENDING_SETTLEMENT' NOT NULL,
	"settlement_available_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_incomes_amounts_valid" CHECK ("seller_incomes"."order_amount_cent" > 0 AND "seller_incomes"."platform_fee_cent" >= 0 AND "seller_incomes"."seller_amount_cent" > 0 AND "seller_incomes"."platform_fee_cent" + "seller_incomes"."seller_amount_cent" = "seller_incomes"."order_amount_cent"),
	CONSTRAINT "seller_income_buckets_nonnegative" CHECK ("seller_incomes"."available_amount_cent" >= 0 AND "seller_incomes"."locked_amount_cent" >= 0 AND "seller_incomes"."withdrawn_amount_cent" >= 0 AND "seller_incomes"."reversed_amount_cent" >= 0),
	CONSTRAINT "seller_income_buckets_cap" CHECK ("seller_incomes"."available_amount_cent" + "seller_incomes"."locked_amount_cent" + "seller_incomes"."withdrawn_amount_cent" + "seller_incomes"."reversed_amount_cent" <= "seller_incomes"."seller_amount_cent")
);
--> statement-breakpoint
CREATE TABLE "seller_liabilities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"liability_no" varchar(64) NOT NULL,
	"seller_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"ledger_transaction_id" uuid NOT NULL,
	"original_amount_cent" bigint NOT NULL,
	"outstanding_amount_cent" bigint NOT NULL,
	"status" "seller_liability_status" DEFAULT 'OPEN' NOT NULL,
	"risk_hold" boolean DEFAULT true NOT NULL,
	"settled_at" timestamp with time zone,
	"waived_at" timestamp with time zone,
	"waived_by_admin_id" uuid,
	"waived_reason" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_liabilities_amount_valid" CHECK ("seller_liabilities"."original_amount_cent" > 0 AND "seller_liabilities"."outstanding_amount_cent" >= 0 AND "seller_liabilities"."outstanding_amount_cent" <= "seller_liabilities"."original_amount_cent")
);
--> statement-breakpoint
CREATE TABLE "seller_liability_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"liability_id" uuid NOT NULL,
	"income_id" uuid NOT NULL,
	"ledger_transaction_id" uuid NOT NULL,
	"amount_cent" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_liability_allocation_positive" CHECK ("seller_liability_allocations"."amount_cent" > 0)
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "seller_status" DEFAULT 'DRAFT' NOT NULL,
	"seller_nickname" varchar(32) NOT NULL,
	"seller_avatar_file_id" uuid,
	"cover_file_id" uuid,
	"introduction" varchar(1000),
	"game_rank" varchar(64),
	"kd" numeric(6, 2),
	"preferred_mode" varchar(64),
	"play_style" varchar(128),
	"game_experience" varchar(500),
	"voice_file_id" uuid,
	"voice_duration_ms" integer,
	"accepting_orders" boolean DEFAULT false NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"completed_order_count" integer DEFAULT 0 NOT NULL,
	"favorite_count" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"suspended_reason" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_voice_duration_valid" CHECK ("seller_profiles"."voice_duration_ms" IS NULL OR "seller_profiles"."voice_duration_ms" BETWEEN 10000 AND 30000),
	CONSTRAINT "seller_rating_valid" CHECK ("seller_profiles"."rating_avg" >= 0 AND "seller_profiles"."rating_avg" <= 5)
);
--> statement-breakpoint
CREATE TABLE "seller_review_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"action" "seller_review_action" NOT NULL,
	"old_status" "seller_application_status",
	"new_status" "seller_application_status" NOT NULL,
	"admin_id" uuid,
	"reason" text,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_hash" char(64) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"code_hash" char(64) NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_attempts_valid" CHECK ("sms_codes"."attempt_count" >= 0 AND "sms_codes"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "support_case_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"support_case_id" uuid NOT NULL,
	"action" "support_case_action" NOT NULL,
	"old_status" "support_case_status",
	"new_status" "support_case_status" NOT NULL,
	"old_queue_key" varchar(64),
	"new_queue_key" varchar(64),
	"operator_admin_id" uuid,
	"operator_user_id" uuid,
	"reason" text,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_no" varchar(64) NOT NULL,
	"requester_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"topic" varchar(120) NOT NULL,
	"priority" "support_priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "support_case_status" DEFAULT 'WAITING' NOT NULL,
	"queue_key" varchar(64) NOT NULL,
	"assigned_admin_id" uuid,
	"related_type" "related_object_type",
	"related_id" uuid,
	"source_page" varchar(128),
	"first_response_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_cases_related_pair" CHECK (("support_cases"."related_type" IS NULL) = ("support_cases"."related_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"device_type" "device_type" NOT NULL,
	"push_token_ciphertext" text,
	"push_token_hash" char(64),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_policy_acceptances" (
	"user_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(64) NOT NULL,
	"user_agent" text NOT NULL,
	CONSTRAINT "user_policy_acceptances_pk" PRIMARY KEY("user_id","policy_version_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nickname" varchar(32) NOT NULL,
	"avatar_file_id" uuid,
	"bio" varchar(280),
	"public_user_no" varchar(32) NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_ciphertext" text NOT NULL,
	"phone_hash" char(64) NOT NULL,
	"phone_mask" varchar(32) NOT NULL,
	"status" "user_status" DEFAULT 'NORMAL' NOT NULL,
	"profile_initialized" boolean DEFAULT false NOT NULL,
	"last_active_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_income_allocations" (
	"withdrawal_id" uuid NOT NULL,
	"income_id" uuid NOT NULL,
	"amount_cent" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawal_income_allocations_pk" PRIMARY KEY("withdrawal_id","income_id"),
	CONSTRAINT "withdrawal_income_allocation_positive" CHECK ("withdrawal_income_allocations"."amount_cent" > 0)
);
--> statement-breakpoint
CREATE TABLE "withdrawal_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"withdrawal_id" uuid NOT NULL,
	"old_status" "withdrawal_status",
	"new_status" "withdrawal_status" NOT NULL,
	"operator_admin_id" uuid,
	"operator_role" "operator_role" NOT NULL,
	"action" varchar(64) NOT NULL,
	"reason" text,
	"external_evidence_file_id" uuid,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"withdrawal_no" varchar(64) NOT NULL,
	"seller_id" uuid NOT NULL,
	"payout_account_id" uuid NOT NULL,
	"lock_ledger_transaction_id" uuid NOT NULL,
	"amount_cent" bigint NOT NULL,
	"fee_cent" bigint DEFAULT 0 NOT NULL,
	"actual_amount_cent" bigint NOT NULL,
	"status" "withdrawal_status" DEFAULT 'CREATED' NOT NULL,
	"risk_status" "risk_status" DEFAULT 'CLEAR' NOT NULL,
	"reject_reason" text,
	"idempotency_key" varchar(160) NOT NULL,
	"provider_payout_no" varchar(128),
	"assigned_admin_id" uuid,
	"processing_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawals_amount_positive" CHECK ("withdrawals"."amount_cent" > 0 AND "withdrawals"."fee_cent" >= 0 AND "withdrawals"."actual_amount_cent" > 0),
	CONSTRAINT "withdrawals_amount_formula" CHECK ("withdrawals"."actual_amount_cent" = "withdrawals"."amount_cent" - "withdrawals"."fee_cent")
);
--> statement-breakpoint
ALTER TABLE "admin_mfa_factors" ADD CONSTRAINT "admin_mfa_factors_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_operation_logs" ADD CONSTRAINT "admin_operation_logs_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_granted_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("granted_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_evidences" ADD CONSTRAINT "complaint_evidences_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_evidences" ADD CONSTRAINT "complaint_evidences_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_evidences" ADD CONSTRAINT "complaint_evidences_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_evidences" ADD CONSTRAINT "complaint_evidences_submitted_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("submitted_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_logs" ADD CONSTRAINT "complaint_logs_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_logs" ADD CONSTRAINT "complaint_logs_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_logs" ADD CONSTRAINT "complaint_logs_operator_admin_id_admin_accounts_id_fk" FOREIGN KEY ("operator_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_target_seller_id_seller_profiles_id_fk" FOREIGN KEY ("target_seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_admin_id_admin_accounts_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_usages" ADD CONSTRAINT "file_usages_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_admin_id_admin_accounts_id_fk" FOREIGN KEY ("sender_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_slot_reservations" ADD CONSTRAINT "order_slot_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_slot_reservations" ADD CONSTRAINT "order_slot_reservations_slot_id_seller_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."seller_availability_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_slot_reservations" ADD CONSTRAINT "order_slot_reservations_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_operator_admin_id_admin_accounts_id_fk" FOREIGN KEY ("operator_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sku_id_product_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."product_skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payload_file_id_files_id_fk" FOREIGN KEY ("payload_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_payload_file_id_files_id_fk" FOREIGN KEY ("provider_payload_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_configs" ADD CONSTRAINT "platform_configs_created_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_created_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_settings" ADD CONSTRAINT "privacy_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_logs" ADD CONSTRAINT "product_review_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_logs" ADD CONSTRAINT "product_review_logs_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_logs" ADD CONSTRAINT "product_review_logs_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_logs" ADD CONSTRAINT "product_review_logs_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_aggregates" ADD CONSTRAINT "rating_aggregates_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_aggregates" ADD CONSTRAINT "rating_aggregates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_resolved_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_source_file_id_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_logs" ADD CONSTRAINT "refund_logs_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_logs" ADD CONSTRAINT "refund_logs_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_logs" ADD CONSTRAINT "refund_logs_operator_admin_id_admin_accounts_id_fk" FOREIGN KEY ("operator_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_assigned_admin_id_admin_accounts_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("hidden_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_assigned_admin_id_admin_accounts_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_logs" ADD CONSTRAINT "security_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_logs" ADD CONSTRAINT "security_logs_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_logs" ADD CONSTRAINT "security_logs_resolved_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_reviewed_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_availability_slots" ADD CONSTRAINT "seller_availability_slots_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_incomes" ADD CONSTRAINT "seller_incomes_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_incomes" ADD CONSTRAINT "seller_incomes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_incomes" ADD CONSTRAINT "seller_incomes_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_liabilities" ADD CONSTRAINT "seller_liabilities_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_liabilities" ADD CONSTRAINT "seller_liabilities_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_liabilities" ADD CONSTRAINT "seller_liabilities_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_liabilities" ADD CONSTRAINT "seller_liabilities_waived_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("waived_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_liability_allocations" ADD CONSTRAINT "seller_liability_allocations_liability_id_seller_liabilities_id_fk" FOREIGN KEY ("liability_id") REFERENCES "public"."seller_liabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_liability_allocations" ADD CONSTRAINT "seller_liability_allocations_income_id_seller_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."seller_incomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_liability_allocations" ADD CONSTRAINT "seller_liability_allocations_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_seller_avatar_file_id_files_id_fk" FOREIGN KEY ("seller_avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_voice_file_id_files_id_fk" FOREIGN KEY ("voice_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_review_logs" ADD CONSTRAINT "seller_review_logs_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_review_logs" ADD CONSTRAINT "seller_review_logs_application_id_seller_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."seller_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_review_logs" ADD CONSTRAINT "seller_review_logs_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_logs" ADD CONSTRAINT "support_case_logs_support_case_id_support_cases_id_fk" FOREIGN KEY ("support_case_id") REFERENCES "public"."support_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_logs" ADD CONSTRAINT "support_case_logs_operator_admin_id_admin_accounts_id_fk" FOREIGN KEY ("operator_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_logs" ADD CONSTRAINT "support_case_logs_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assigned_admin_id_admin_accounts_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_policy_acceptances" ADD CONSTRAINT "user_policy_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_policy_acceptances" ADD CONSTRAINT "user_policy_acceptances_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_income_allocations" ADD CONSTRAINT "withdrawal_income_allocations_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_income_allocations" ADD CONSTRAINT "withdrawal_income_allocations_income_id_seller_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."seller_incomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_logs" ADD CONSTRAINT "withdrawal_logs_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_logs" ADD CONSTRAINT "withdrawal_logs_operator_admin_id_admin_accounts_id_fk" FOREIGN KEY ("operator_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_logs" ADD CONSTRAINT "withdrawal_logs_external_evidence_file_id_files_id_fk" FOREIGN KEY ("external_evidence_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_payout_account_id_payout_accounts_id_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_lock_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("lock_ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_assigned_admin_id_admin_accounts_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_accounts_username_uq" ON "admin_accounts" USING btree ("username");--> statement-breakpoint
CREATE INDEX "admin_accounts_status_idx" ON "admin_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_mfa_admin_idx" ON "admin_mfa_factors" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_operation_logs_target_idx" ON "admin_operation_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_operation_logs_admin_idx" ON "admin_operation_logs" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_operation_logs_request_idx" ON "admin_operation_logs" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_uq" ON "admin_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_uq" ON "auth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_evidence_file_uq" ON "complaint_evidences" USING btree ("complaint_id","file_id");--> statement-breakpoint
CREATE INDEX "complaint_evidences_complaint_idx" ON "complaint_evidences" USING btree ("complaint_id","created_at");--> statement-breakpoint
CREATE INDEX "complaint_logs_complaint_idx" ON "complaint_logs" USING btree ("complaint_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_complaint_no_uq" ON "complaints" USING btree ("complaint_no");--> statement-breakpoint
CREATE INDEX "complaints_status_created_idx" ON "complaints" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "complaints_order_idx" ON "complaints" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_members_user_uq" ON "conversation_members" USING btree ("conversation_id","user_id") WHERE "conversation_members"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_members_admin_uq" ON "conversation_members" USING btree ("conversation_id","admin_id") WHERE "conversation_members"."admin_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_no_uq" ON "conversations" USING btree ("conversation_no");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_order_type_uq" ON "conversations" USING btree ("order_id","conversation_type") WHERE "conversations"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_last_message_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_logs_notification_channel_uq" ON "delivery_logs" USING btree ("notification_id","channel");--> statement-breakpoint
CREATE INDEX "delivery_logs_status_idx" ON "delivery_logs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_seller_uq" ON "favorites" USING btree ("user_id","seller_id") WHERE "favorites"."seller_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_product_uq" ON "favorites" USING btree ("user_id","product_id") WHERE "favorites"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_usages_target_uq" ON "file_usages" USING btree ("file_id","usage_type","target_type","target_id") WHERE "file_usages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "file_usages_target_idx" ON "file_usages" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_bucket_object_uq" ON "files" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_key_uq" ON "idempotency_keys" USING btree ("scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_provider_reference_uq" ON "identity_verifications" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "identity_user_status_idx" ON "identity_verifications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "identity_document_hash_idx" ON "identity_verifications" USING btree ("document_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_events_consumer_event_uq" ON "inbox_events" USING btree ("event_id","consumer_name");--> statement-breakpoint
CREATE INDEX "inbox_events_status_idx" ON "inbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_seller_uq" ON "ledger_accounts" USING btree ("seller_id","account_type","currency") WHERE "ledger_accounts"."seller_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_system_uq" ON "ledger_accounts" USING btree ("system_key","account_type","currency") WHERE "ledger_accounts"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_transaction_account_side_uq" ON "ledger_entries" USING btree ("transaction_id","account_id","side");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_created_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_no_uq" ON "ledger_transactions" USING btree ("transaction_no");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_idempotency_uq" ON "ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_reversal_uq" ON "ledger_transactions" USING btree ("reversal_of_transaction_id") WHERE "ledger_transactions"."reversal_of_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ledger_transactions_source_idx" ON "ledger_transactions" USING btree ("source_type","source_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_uq" ON "messages" USING btree ("conversation_id","sequence_no");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_user_client_uq" ON "messages" USING btree ("sender_user_id","client_message_id") WHERE "messages"."sender_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_admin_client_uq" ON "messages" USING btree ("sender_admin_id","client_message_id") WHERE "messages"."sender_admin_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_idempotency_uq" ON "notifications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_slot_reservations_order_uq" ON "order_slot_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_slot_reservations_seller_idx" ON "order_slot_reservations" USING btree ("seller_id","starts_at","status");--> statement-breakpoint
CREATE INDEX "order_status_logs_order_idx" ON "order_status_logs" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_no_uq" ON "orders" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "orders_buyer_created_idx" ON "orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_seller_created_idx" ON "orders" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status","created_at");--> statement-breakpoint
CREATE INDEX "orders_service_time_idx" ON "orders" USING btree ("seller_id","service_starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_id_uq" ON "outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "outbox_events_dispatch_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_uq" ON "payment_events" USING btree ("channel","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payment_no_uq" ON "payments" USING btree ("payment_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_uq" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_tx_uq" ON "payments" USING btree ("channel","provider_transaction_id") WHERE "payments"."provider_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_token_uq" ON "payout_accounts" USING btree ("seller_id","account_token_hash") WHERE "payout_accounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_default_type_uq" ON "payout_accounts" USING btree ("seller_id","account_type") WHERE "payout_accounts"."is_default" = true AND "payout_accounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payout_accounts_seller_idx" ON "payout_accounts" USING btree ("seller_id","verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_uq" ON "permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_configs_key_version_uq" ON "platform_configs" USING btree ("config_key","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_configs_one_active_uq" ON "platform_configs" USING btree ("config_key") WHERE "platform_configs"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "platform_configs_status_idx" ON "platform_configs" USING btree ("status","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_type_version_uq" ON "policy_versions" USING btree ("policy_type","version_no");--> statement-breakpoint
CREATE INDEX "policy_status_idx" ON "policy_versions" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_sort_uq" ON "product_images" USING btree ("product_id","sort_order") WHERE "product_images"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_cover_uq" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_cover" = true AND "product_images"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "product_review_logs_product_idx" ON "product_review_logs" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_skus_product_status_idx" ON "product_skus" USING btree ("product_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_versions_product_version_uq" ON "product_versions" USING btree ("product_id","version_no");--> statement-breakpoint
CREATE INDEX "products_seller_status_idx" ON "products" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "products_status_approved_idx" ON "products" USING btree ("status","approved_at");--> statement-breakpoint
CREATE INDEX "products_price_idx" ON "products" USING btree ("min_price_cent");--> statement-breakpoint
CREATE INDEX "products_sold_idx" ON "products" USING btree ("sold_count");--> statement-breakpoint
CREATE INDEX "products_rating_idx" ON "products" USING btree ("rating_avg");--> statement-breakpoint
CREATE UNIQUE INDEX "rating_aggregates_seller_uq" ON "rating_aggregates" USING btree ("seller_id") WHERE "rating_aggregates"."seller_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rating_aggregates_product_uq" ON "rating_aggregates" USING btree ("product_id") WHERE "rating_aggregates"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "reconciliation_items_run_status_idx" ON "reconciliation_items" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "reconciliation_items_business_idx" ON "reconciliation_items" USING btree ("business_type","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_runs_no_uq" ON "reconciliation_runs" USING btree ("run_no");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_runs_provider_date_uq" ON "reconciliation_runs" USING btree ("provider","statement_date");--> statement-breakpoint
CREATE INDEX "refund_logs_refund_idx" ON "refund_logs" USING btree ("refund_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_refund_no_uq" ON "refunds" USING btree ("refund_no");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_no_uq" ON "refunds" USING btree ("provider_refund_no") WHERE "refunds"."provider_refund_no" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_one_active_per_order_uq" ON "refunds" USING btree ("order_id") WHERE "refunds"."status" IN ('REQUESTED','SELLER_APPROVED','SELLER_REJECTED','NEGOTIATING','PLATFORM_REVIEW','REFUND_PROCESSING');--> statement-breakpoint
CREATE INDEX "refunds_status_created_idx" ON "refunds" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_uq" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reviews_product_status_idx" ON "reviews" USING btree ("product_id","status","created_at");--> statement-breakpoint
CREATE INDEX "reviews_seller_status_idx" ON "reviews" USING btree ("seller_id","status","created_at");--> statement-breakpoint
CREATE INDEX "risk_events_status_severity_idx" ON "risk_events" USING btree ("status","severity","created_at");--> statement-breakpoint
CREATE INDEX "risk_events_target_idx" ON "risk_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_uq" ON "roles" USING btree ("role_key");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_jobs_key_uq" ON "scheduled_jobs" USING btree ("job_key");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_dispatch_idx" ON "scheduled_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "security_logs_status_idx" ON "security_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "security_logs_user_idx" ON "security_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_applications_version_uq" ON "seller_applications" USING btree ("seller_id","version_no");--> statement-breakpoint
CREATE INDEX "seller_applications_queue_idx" ON "seller_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "seller_slots_lookup_idx" ON "seller_availability_slots" USING btree ("seller_id","status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_incomes_order_uq" ON "seller_incomes" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_incomes_ledger_tx_uq" ON "seller_incomes" USING btree ("ledger_transaction_id");--> statement-breakpoint
CREATE INDEX "seller_incomes_seller_status_idx" ON "seller_incomes" USING btree ("seller_id","status","settlement_available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_liabilities_no_uq" ON "seller_liabilities" USING btree ("liability_no");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_liabilities_refund_uq" ON "seller_liabilities" USING btree ("refund_id");--> statement-breakpoint
CREATE INDEX "seller_liabilities_seller_status_idx" ON "seller_liabilities" USING btree ("seller_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_liability_allocation_uq" ON "seller_liability_allocations" USING btree ("liability_id","income_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_liability_allocation_tx_uq" ON "seller_liability_allocations" USING btree ("ledger_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_profiles_user_uq" ON "seller_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seller_profiles_status_idx" ON "seller_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seller_profiles_discovery_idx" ON "seller_profiles" USING btree ("status","accepting_orders","rating_avg");--> statement-breakpoint
CREATE INDEX "seller_review_logs_application_idx" ON "seller_review_logs" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_codes_lookup_idx" ON "sms_codes" USING btree ("phone_hash","purpose","expires_at");--> statement-breakpoint
CREATE INDEX "support_case_logs_case_idx" ON "support_case_logs" USING btree ("support_case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_cases_no_uq" ON "support_cases" USING btree ("case_no");--> statement-breakpoint
CREATE UNIQUE INDEX "support_cases_conversation_uq" ON "support_cases" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "support_cases_queue_idx" ON "support_cases" USING btree ("queue_key","status","priority","created_at");--> statement-breakpoint
CREATE INDEX "support_cases_assignee_idx" ON "support_cases" USING btree ("assigned_admin_id","status");--> statement-breakpoint
CREATE INDEX "support_cases_related_idx" ON "support_cases" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_devices_user_device_uq" ON "user_devices" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "user_devices_push_hash_idx" ON "user_devices" USING btree ("push_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_public_no_uq" ON "user_profiles" USING btree ("public_user_no");--> statement-breakpoint
CREATE INDEX "user_profiles_nickname_idx" ON "user_profiles" USING btree ("nickname");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_hash_uq" ON "users" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_last_active_idx" ON "users" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "withdrawal_income_allocations_income_idx" ON "withdrawal_income_allocations" USING btree ("income_id");--> statement-breakpoint
CREATE INDEX "withdrawal_logs_withdrawal_idx" ON "withdrawal_logs" USING btree ("withdrawal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_no_uq" ON "withdrawals" USING btree ("withdrawal_no");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_idempotency_uq" ON "withdrawals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_lock_tx_uq" ON "withdrawals" USING btree ("lock_ledger_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_provider_no_uq" ON "withdrawals" USING btree ("provider_payout_no") WHERE "withdrawals"."provider_payout_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "withdrawals_seller_created_idx" ON "withdrawals" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_status_created_idx" ON "withdrawals" USING btree ("status","created_at");