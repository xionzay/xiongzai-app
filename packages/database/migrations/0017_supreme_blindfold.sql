CREATE TABLE "financial_transfer_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"refund_id" uuid,
	"withdrawal_id" uuid,
	"channel" varchar(32) NOT NULL,
	"business_no" varchar(128) NOT NULL,
	"amount_cent" bigint NOT NULL,
	"status" varchar(32) DEFAULT 'READY' NOT NULL,
	"provider_reference" varchar(160),
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(64),
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_target_valid" CHECK (("financial_transfer_operations"."kind"='REFUND' AND "financial_transfer_operations"."refund_id" IS NOT NULL AND "financial_transfer_operations"."withdrawal_id" IS NULL) OR ("financial_transfer_operations"."kind"='PAYOUT' AND "financial_transfer_operations"."withdrawal_id" IS NOT NULL AND "financial_transfer_operations"."refund_id" IS NULL)),
	CONSTRAINT "transfer_status_valid" CHECK ("financial_transfer_operations"."status" IN ('READY','PROCESSING','UNKNOWN','MANUAL_REVIEW','SUCCEEDED','FAILED')),
	CONSTRAINT "transfer_values_valid" CHECK ("financial_transfer_operations"."amount_cent">0 AND "financial_transfer_operations"."attempts">=0 AND "financial_transfer_operations"."max_attempts">0 AND "financial_transfer_operations"."version">=0),
	CONSTRAINT "transfer_channel_valid" CHECK (("financial_transfer_operations"."kind"='REFUND' AND "financial_transfer_operations"."channel" IN ('WECHAT_APP','ALIPAY_APP')) OR ("financial_transfer_operations"."kind"='PAYOUT' AND "financial_transfer_operations"."channel" IN ('WECHAT','ALIPAY')))
);
--> statement-breakpoint
CREATE TABLE "mock_transfer_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"channel" varchar(32) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"provider_reference" varchar(160) NOT NULL,
	"status" varchar(16) DEFAULT 'PROCESSING' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_transfer_status_valid" CHECK ("mock_transfer_results"."status" IN ('PROCESSING','UNKNOWN','SUCCEEDED','FAILED')),
	CONSTRAINT "mock_transfer_kind_valid" CHECK ("mock_transfer_results"."kind" IN ('REFUND','PAYOUT'))
);
--> statement-breakpoint
ALTER TABLE "financial_transfer_operations" ADD CONSTRAINT "financial_transfer_operations_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transfer_operations" ADD CONSTRAINT "financial_transfer_operations_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_refund_active_uq" ON "financial_transfer_operations" USING btree ("refund_id") WHERE "financial_transfer_operations"."status" NOT IN ('FAILED','SUCCEEDED');--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_withdrawal_active_uq" ON "financial_transfer_operations" USING btree ("withdrawal_id") WHERE "financial_transfer_operations"."status" NOT IN ('FAILED','SUCCEEDED');--> statement-breakpoint
CREATE INDEX "transfer_due_idx" ON "financial_transfer_operations" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_transfer_key_uq" ON "mock_transfer_results" USING btree ("kind","channel","idempotency_key");