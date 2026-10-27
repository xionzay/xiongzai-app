CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_details_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "product_skus" ADD COLUMN "billing_unit" varchar(16) DEFAULT 'SESSION' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_skus" ADD COLUMN "unit_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_name_uq" ON "service_categories" USING btree ("name");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_billing_valid" CHECK ("product_skus"."billing_unit" IN ('SESSION', 'MATCH', 'HOUR') AND "product_skus"."unit_count" BETWEEN 1 AND 1000 AND ("product_skus"."billing_unit" <> 'HOUR' OR "product_skus"."duration_minutes" = "product_skus"."unit_count" * 60));