ALTER TYPE "public"."file_type" ADD VALUE 'REVIEW_IMAGE' BEFORE 'CHAT_IMAGE';--> statement-breakpoint
CREATE TABLE "review_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_images_position_valid" CHECK ("review_images"."position" BETWEEN 0 AND 29)
);
--> statement-breakpoint
ALTER TABLE "review_images" ADD CONSTRAINT "review_images_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_images" ADD CONSTRAINT "review_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_images_file_uq" ON "review_images" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_images_position_uq" ON "review_images" USING btree ("review_id","position");
--> statement-breakpoint
-- Review attachments are immutable evidence of what was published. All access is
-- through the review-aware API; files never move to a public visibility class.
CREATE FUNCTION review_image_metadata_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.file_type::text = 'REVIEW_IMAGE' AND
    (NEW.file_type IS DISTINCT FROM OLD.file_type OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
    RAISE EXCEPTION 'review image metadata invalid' USING ERRCODE='23514';
  END IF;
  IF NEW.file_type::text = 'REVIEW_IMAGE' AND
    (NEW.visibility::text <> 'PRIVATE' OR NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp') OR NEW.size_bytes NOT BETWEEN 1 AND 10485760) THEN
    RAISE EXCEPTION 'review image metadata invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER review_image_metadata_guard BEFORE INSERT OR UPDATE ON files FOR EACH ROW EXECUTE FUNCTION review_image_metadata_guard();
--> statement-breakpoint
CREATE FUNCTION review_image_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'review image bindings are immutable' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM reviews r JOIN files f ON f.id=NEW.file_id
    WHERE r.id=NEW.review_id AND f.owner_user_id=r.buyer_id AND f.file_type::text='REVIEW_IMAGE'
      AND f.visibility::text='PRIVATE' AND f.upload_status::text='VERIFIED' AND f.moderation_status::text='APPROVED' AND f.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'review image binding invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER review_image_binding_guard BEFORE INSERT OR UPDATE OR DELETE ON review_images FOR EACH ROW EXECUTE FUNCTION review_image_binding_guard();
