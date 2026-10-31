ALTER TYPE "public"."file_type" ADD VALUE 'ORDER_FULFILLMENT_IMAGE' BEFORE 'USER_AVATAR';--> statement-breakpoint
ALTER TYPE "public"."file_type" ADD VALUE 'ORDER_FULFILLMENT_VIDEO' BEFORE 'USER_AVATAR';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'PENDING_SERVICE' BEFORE 'PENDING_PAYMENT';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "sku_duration_minutes_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "service_starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "service_ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_skus" ALTER COLUMN "duration_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "game_snapshot" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_seconds_snapshot" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_evidence_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "evidence_review_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receipt_extension_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "image_kind" varchar(16) DEFAULT 'GALLERY' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "game" varchar(32);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fulfillment_seconds" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pricing_mode" varchar(16) DEFAULT 'MULTI' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rule_flow_valid" CHECK (("orders"."fulfillment_seconds_snapshot" IS NULL AND "orders"."game_snapshot" IS NULL AND "orders"."service_starts_at" IS NOT NULL AND "orders"."service_ends_at" IS NOT NULL AND "orders"."sku_duration_minutes_snapshot" IS NOT NULL) OR ("orders"."rule_version" = 'V3.1' AND "orders"."fulfillment_seconds_snapshot" IS NOT NULL AND "orders"."fulfillment_seconds_snapshot" BETWEEN 1 AND 604800 AND "orders"."game_snapshot" IS NOT NULL AND "orders"."game_snapshot" IN ('PEACE_ELITE','DELTA_FORCE','HONOR_OF_KINGS','VALORANT') AND "orders"."service_starts_at" IS NULL AND "orders"."service_ends_at" IS NULL));--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_kind_valid" CHECK ("product_images"."image_kind" IN ('GALLERY','DETAIL') AND (NOT "product_images"."is_cover" OR "product_images"."image_kind" = 'GALLERY'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_game_valid" CHECK ("products"."game" IS NULL OR "products"."game" IN ('PEACE_ELITE','DELTA_FORCE','HONOR_OF_KINGS','VALORANT'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_fulfillment_valid" CHECK (("products"."game" IS NULL AND "products"."fulfillment_seconds" IS NULL) OR ("products"."game" IS NOT NULL AND "products"."fulfillment_seconds" BETWEEN 1 AND 604800));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pricing_mode_valid" CHECK ("products"."pricing_mode" IN ('SINGLE','MULTI'));