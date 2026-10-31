ALTER TABLE "products" DROP CONSTRAINT "products_fulfillment_valid";--> statement-breakpoint
CREATE UNIQUE INDEX "file_usages_order_evidence_uq" ON "file_usages" USING btree ("file_id") WHERE "file_usages"."target_type" = 'ORDER' AND "file_usages"."usage_type" = 'EVIDENCE' AND "file_usages"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_fulfillment_metadata_valid" CHECK ("files"."file_type"::text NOT IN ('ORDER_FULFILLMENT_IMAGE','ORDER_FULFILLMENT_VIDEO') OR ("files"."visibility" = 'PRIVATE' AND ("files"."file_type"::text = 'ORDER_FULFILLMENT_IMAGE' AND "files"."mime_type" IN ('image/jpeg','image/png','image/webp') OR "files"."file_type"::text = 'ORDER_FULFILLMENT_VIDEO' AND "files"."mime_type" = 'video/mp4' AND ("files"."upload_status" <> 'VERIFIED' OR "files"."duration_ms" > 0))));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_fulfillment_valid" CHECK (("products"."game" IS NULL AND "products"."fulfillment_seconds" IS NULL) OR ("products"."game" IS NOT NULL AND "products"."fulfillment_seconds" IS NOT NULL AND "products"."fulfillment_seconds" BETWEEN 1 AND 604800));--> statement-breakpoint
-- Existing evidence may only be extended, never replaced or removed. New endpoints
-- submit once; a future supplementary-fulfillment phase must append to this history.
CREATE FUNCTION stage_one_order_evidence_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.fulfillment_evidence_json) <> 'array' THEN
    RAISE EXCEPTION 'Order evidence must be an array' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(OLD.fulfillment_evidence_json) > jsonb_array_length(NEW.fulfillment_evidence_json)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(OLD.fulfillment_evidence_json) WITH ORDINALITY AS old_item(value, position)
                WHERE NEW.fulfillment_evidence_json->(old_item.position::integer - 1) IS DISTINCT FROM old_item.value) THEN
    RAISE EXCEPTION 'Order evidence is append-only' USING ERRCODE = '23514';
  END IF;
  IF OLD.receipt_extension_used AND NOT NEW.receipt_extension_used THEN
    RAISE EXCEPTION 'Order receipt extension cannot be reset' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER stage_one_order_evidence_append_only_guard BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION stage_one_order_evidence_append_only();
