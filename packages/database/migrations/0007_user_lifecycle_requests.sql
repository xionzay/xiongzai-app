CREATE TYPE "public"."account_cancellation_status" AS ENUM('REQUESTED', 'CANCELLED', 'PROCESSING', 'COMPLETED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."personal_data_export_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."phone_change_request_status" AS ENUM('PENDING_OLD_VERIFICATION', 'PENDING_NEW_VERIFICATION', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."file_type" ADD VALUE 'DATA_EXPORT';--> statement-breakpoint
ALTER TYPE "public"."file_usage_type" ADD VALUE 'EXPORT';--> statement-breakpoint
CREATE TABLE "account_cancellation_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"status" "account_cancellation_status" DEFAULT 'REQUESTED' NOT NULL,
	"reason" varchar(500) NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"waiting_period_ends_at" timestamp with time zone NOT NULL,
	"processing_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_reason" varchar(500),
	"decision_admin_operation_log_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_cancellation_requests_reason_present" CHECK (length(btrim("account_cancellation_requests"."reason")) > 0),
	CONSTRAINT "account_cancellation_requests_version_valid" CHECK ("account_cancellation_requests"."version" >= 0),
	CONSTRAINT "account_cancellation_requests_waiting_valid" CHECK ("account_cancellation_requests"."waiting_period_ends_at" > "account_cancellation_requests"."requested_at"),
	CONSTRAINT "account_cancellation_requests_state_consistent" CHECK (("account_cancellation_requests"."status" = 'REQUESTED' AND "account_cancellation_requests"."processing_at" IS NULL AND "account_cancellation_requests"."cancelled_at" IS NULL AND "account_cancellation_requests"."completed_at" IS NULL AND "account_cancellation_requests"."rejected_at" IS NULL AND "account_cancellation_requests"."rejection_reason" IS NULL AND "account_cancellation_requests"."decision_admin_operation_log_id" IS NULL) OR ("account_cancellation_requests"."status" = 'CANCELLED' AND "account_cancellation_requests"."cancelled_at" IS NOT NULL AND "account_cancellation_requests"."completed_at" IS NULL AND "account_cancellation_requests"."rejected_at" IS NULL AND "account_cancellation_requests"."rejection_reason" IS NULL AND "account_cancellation_requests"."decision_admin_operation_log_id" IS NULL) OR ("account_cancellation_requests"."status" = 'PROCESSING' AND "account_cancellation_requests"."processing_at" IS NOT NULL AND "account_cancellation_requests"."cancelled_at" IS NULL AND "account_cancellation_requests"."completed_at" IS NULL AND "account_cancellation_requests"."rejected_at" IS NULL AND "account_cancellation_requests"."rejection_reason" IS NULL) OR ("account_cancellation_requests"."status" = 'COMPLETED' AND "account_cancellation_requests"."processing_at" IS NOT NULL AND "account_cancellation_requests"."cancelled_at" IS NULL AND "account_cancellation_requests"."completed_at" IS NOT NULL AND "account_cancellation_requests"."rejected_at" IS NULL AND "account_cancellation_requests"."rejection_reason" IS NULL) OR ("account_cancellation_requests"."status" = 'REJECTED' AND "account_cancellation_requests"."cancelled_at" IS NULL AND "account_cancellation_requests"."completed_at" IS NULL AND "account_cancellation_requests"."rejected_at" IS NOT NULL AND "account_cancellation_requests"."rejection_reason" IS NOT NULL AND length(btrim("account_cancellation_requests"."rejection_reason")) > 0 AND "account_cancellation_requests"."decision_admin_operation_log_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "personal_data_export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"status" "personal_data_export_status" DEFAULT 'PENDING' NOT NULL,
	"output_file_id" uuid,
	"failure_code" varchar(64),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_data_export_jobs_version_valid" CHECK ("personal_data_export_jobs"."version" >= 0),
	CONSTRAINT "personal_data_export_jobs_expiry_valid" CHECK ("personal_data_export_jobs"."expires_at" > "personal_data_export_jobs"."requested_at"),
	CONSTRAINT "personal_data_export_jobs_state_consistent" CHECK (("personal_data_export_jobs"."status" = 'PENDING' AND "personal_data_export_jobs"."started_at" IS NULL AND "personal_data_export_jobs"."finished_at" IS NULL AND "personal_data_export_jobs"."output_file_id" IS NULL AND "personal_data_export_jobs"."failure_code" IS NULL) OR ("personal_data_export_jobs"."status" = 'PROCESSING' AND "personal_data_export_jobs"."started_at" IS NOT NULL AND "personal_data_export_jobs"."finished_at" IS NULL AND "personal_data_export_jobs"."failure_code" IS NULL) OR ("personal_data_export_jobs"."status" = 'COMPLETED' AND "personal_data_export_jobs"."started_at" IS NOT NULL AND "personal_data_export_jobs"."finished_at" IS NOT NULL AND "personal_data_export_jobs"."output_file_id" IS NOT NULL AND "personal_data_export_jobs"."failure_code" IS NULL) OR ("personal_data_export_jobs"."status" = 'FAILED' AND "personal_data_export_jobs"."finished_at" IS NOT NULL AND "personal_data_export_jobs"."failure_code" IS NOT NULL AND length(btrim("personal_data_export_jobs"."failure_code")) > 0) OR ("personal_data_export_jobs"."status" = 'EXPIRED' AND "personal_data_export_jobs"."finished_at" IS NOT NULL AND "personal_data_export_jobs"."output_file_id" IS NOT NULL AND "personal_data_export_jobs"."failure_code" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "phone_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"old_phone_ciphertext" text NOT NULL,
	"old_phone_hash" char(64) NOT NULL,
	"old_phone_mask" varchar(32) NOT NULL,
	"new_phone_ciphertext" text NOT NULL,
	"new_phone_hash" char(64) NOT NULL,
	"new_phone_mask" varchar(32) NOT NULL,
	"old_sms_code_id" uuid,
	"new_sms_code_id" uuid,
	"status" "phone_change_request_status" DEFAULT 'PENDING_OLD_VERIFICATION' NOT NULL,
	"old_attempt_count" integer DEFAULT 0 NOT NULL,
	"new_attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"user_version_at_request" integer NOT NULL,
	"old_verified_at" timestamp with time zone,
	"new_verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_change_requests_distinct_phones" CHECK ("phone_change_requests"."old_phone_hash" <> "phone_change_requests"."new_phone_hash"),
	CONSTRAINT "phone_change_requests_sensitive_values_present" CHECK (length(btrim("phone_change_requests"."old_phone_ciphertext")) > 0 AND length(btrim("phone_change_requests"."new_phone_ciphertext")) > 0 AND length(btrim("phone_change_requests"."old_phone_hash")) = 64 AND length(btrim("phone_change_requests"."new_phone_hash")) = 64 AND length(btrim("phone_change_requests"."old_phone_mask")) > 0 AND length(btrim("phone_change_requests"."new_phone_mask")) > 0),
	CONSTRAINT "phone_change_requests_attempts_valid" CHECK ("phone_change_requests"."old_attempt_count" BETWEEN 0 AND "phone_change_requests"."max_attempts" AND "phone_change_requests"."new_attempt_count" BETWEEN 0 AND "phone_change_requests"."max_attempts" AND "phone_change_requests"."max_attempts" > 0),
	CONSTRAINT "phone_change_requests_versions_valid" CHECK ("phone_change_requests"."version" >= 0 AND "phone_change_requests"."user_version_at_request" >= 0),
	CONSTRAINT "phone_change_requests_expiry_valid" CHECK ("phone_change_requests"."expires_at" > "phone_change_requests"."created_at"),
	CONSTRAINT "phone_change_requests_sms_verification_pairs" CHECK (("phone_change_requests"."old_sms_code_id" IS NULL) = ("phone_change_requests"."old_verified_at" IS NULL) AND ("phone_change_requests"."new_sms_code_id" IS NULL) = ("phone_change_requests"."new_verified_at" IS NULL) AND ("phone_change_requests"."old_sms_code_id" IS NULL OR "phone_change_requests"."new_sms_code_id" IS NULL OR "phone_change_requests"."old_sms_code_id" <> "phone_change_requests"."new_sms_code_id")),
	CONSTRAINT "phone_change_requests_state_consistent" CHECK (("phone_change_requests"."status" = 'PENDING_OLD_VERIFICATION' AND "phone_change_requests"."old_verified_at" IS NULL AND "phone_change_requests"."new_verified_at" IS NULL AND "phone_change_requests"."completed_at" IS NULL AND "phone_change_requests"."cancelled_at" IS NULL) OR ("phone_change_requests"."status" = 'PENDING_NEW_VERIFICATION' AND "phone_change_requests"."old_verified_at" IS NOT NULL AND "phone_change_requests"."new_verified_at" IS NULL AND "phone_change_requests"."completed_at" IS NULL AND "phone_change_requests"."cancelled_at" IS NULL) OR ("phone_change_requests"."status" = 'READY' AND "phone_change_requests"."old_verified_at" IS NOT NULL AND "phone_change_requests"."new_verified_at" IS NOT NULL AND "phone_change_requests"."completed_at" IS NULL AND "phone_change_requests"."cancelled_at" IS NULL) OR ("phone_change_requests"."status" = 'COMPLETED' AND "phone_change_requests"."old_verified_at" IS NOT NULL AND "phone_change_requests"."new_verified_at" IS NOT NULL AND "phone_change_requests"."completed_at" IS NOT NULL AND "phone_change_requests"."cancelled_at" IS NULL) OR ("phone_change_requests"."status" = 'CANCELLED' AND "phone_change_requests"."completed_at" IS NULL AND "phone_change_requests"."cancelled_at" IS NOT NULL) OR ("phone_change_requests"."status" = 'EXPIRED' AND "phone_change_requests"."completed_at" IS NULL AND "phone_change_requests"."cancelled_at" IS NULL))
);
--> statement-breakpoint
DROP INDEX "complaint_evidences_complaint_idx";--> statement-breakpoint
ALTER TABLE "account_cancellation_requests" ADD CONSTRAINT "account_cancellation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_cancellation_requests" ADD CONSTRAINT "account_cancellation_requests_decision_admin_operation_log_id_admin_operation_logs_id_fk" FOREIGN KEY ("decision_admin_operation_log_id") REFERENCES "public"."admin_operation_logs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_data_export_jobs" ADD CONSTRAINT "personal_data_export_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_data_export_jobs" ADD CONSTRAINT "personal_data_export_jobs_output_file_id_files_id_fk" FOREIGN KEY ("output_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_change_requests" ADD CONSTRAINT "phone_change_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_change_requests" ADD CONSTRAINT "phone_change_requests_old_sms_code_id_sms_codes_id_fk" FOREIGN KEY ("old_sms_code_id") REFERENCES "public"."sms_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_change_requests" ADD CONSTRAINT "phone_change_requests_new_sms_code_id_sms_codes_id_fk" FOREIGN KEY ("new_sms_code_id") REFERENCES "public"."sms_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_cancellation_requests_user_idempotency_uq" ON "account_cancellation_requests" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "account_cancellation_requests_one_active_user_uq" ON "account_cancellation_requests" USING btree ("user_id") WHERE "account_cancellation_requests"."status" IN ('REQUESTED','PROCESSING');--> statement-breakpoint
CREATE UNIQUE INDEX "account_cancellation_requests_decision_log_uq" ON "account_cancellation_requests" USING btree ("decision_admin_operation_log_id") WHERE "account_cancellation_requests"."decision_admin_operation_log_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "account_cancellation_requests_user_created_idx" ON "account_cancellation_requests" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "account_cancellation_requests_waiting_idx" ON "account_cancellation_requests" USING btree ("status","waiting_period_ends_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_data_export_jobs_user_idempotency_uq" ON "personal_data_export_jobs" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_data_export_jobs_one_active_user_uq" ON "personal_data_export_jobs" USING btree ("user_id") WHERE "personal_data_export_jobs"."status" IN ('PENDING','PROCESSING');--> statement-breakpoint
CREATE UNIQUE INDEX "personal_data_export_jobs_output_file_uq" ON "personal_data_export_jobs" USING btree ("output_file_id") WHERE "personal_data_export_jobs"."output_file_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "personal_data_export_jobs_user_created_idx" ON "personal_data_export_jobs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "personal_data_export_jobs_dispatch_idx" ON "personal_data_export_jobs" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "personal_data_export_jobs_expiry_idx" ON "personal_data_export_jobs" USING btree ("status","expires_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_change_requests_user_idempotency_uq" ON "phone_change_requests" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_change_requests_one_active_user_uq" ON "phone_change_requests" USING btree ("user_id") WHERE "phone_change_requests"."status" IN ('PENDING_OLD_VERIFICATION','PENDING_NEW_VERIFICATION','READY');--> statement-breakpoint
CREATE UNIQUE INDEX "phone_change_requests_one_active_new_phone_uq" ON "phone_change_requests" USING btree ("new_phone_hash") WHERE "phone_change_requests"."status" IN ('PENDING_OLD_VERIFICATION','PENDING_NEW_VERIFICATION','READY');--> statement-breakpoint
CREATE INDEX "phone_change_requests_user_created_idx" ON "phone_change_requests" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "phone_change_requests_expiry_idx" ON "phone_change_requests" USING btree ("status","expires_at","id");--> statement-breakpoint
CREATE INDEX "complaint_evidences_complaint_idx" ON "complaint_evidences" USING btree ("complaint_id","created_at","id");--> statement-breakpoint
ALTER TABLE "complaint_evidences" ADD CONSTRAINT "complaint_evidences_submitter_xor" CHECK ((CASE WHEN "complaint_evidences"."submitted_by_user_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "complaint_evidences"."submitted_by_admin_id" IS NULL THEN 0 ELSE 1 END) = 1);
