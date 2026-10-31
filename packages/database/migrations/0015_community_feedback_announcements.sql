CREATE TYPE "public"."announcement_status" AS ENUM('DRAFT', 'PUBLISHED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('SUBMITTED', 'PROCESSING', 'REPLIED');--> statement-breakpoint
ALTER TYPE "public"."file_type" ADD VALUE 'ANNOUNCEMENT_IMAGE';--> statement-breakpoint
ALTER TYPE "public"."notification_category" ADD VALUE 'FEEDBACK';--> statement-breakpoint
ALTER TYPE "public"."related_object_type" ADD VALUE 'FEEDBACK';--> statement-breakpoint
ALTER TYPE "public"."related_object_type" ADD VALUE 'ANNOUNCEMENT';--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"content" text NOT NULL,
	"cover_file_id" uuid,
	"status" "announcement_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_admin_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_content_valid" CHECK (length(trim("announcements"."title")) BETWEEN 1 AND 120 AND length(trim("announcements"."content")) BETWEEN 1 AND 20000),
	CONSTRAINT "announcements_version_valid" CHECK ("announcements"."version" >= 0),
	CONSTRAINT "announcements_lifecycle_valid" CHECK (("announcements"."status" = 'DRAFT' AND "announcements"."published_at" IS NULL AND "announcements"."retired_at" IS NULL) OR ("announcements"."status" = 'PUBLISHED' AND "announcements"."cover_file_id" IS NOT NULL AND "announcements"."published_at" IS NOT NULL AND "announcements"."retired_at" IS NULL) OR ("announcements"."status" = 'RETIRED' AND "announcements"."cover_file_id" IS NOT NULL AND "announcements"."published_at" IS NOT NULL AND "announcements"."retired_at" IS NOT NULL AND "announcements"."retired_at" >= "announcements"."published_at"))
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" "feedback_status" DEFAULT 'SUBMITTED' NOT NULL,
	"reply" text,
	"replied_by_admin_id" uuid,
	"replied_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedbacks_content_valid" CHECK (length(trim("feedbacks"."content")) BETWEEN 1 AND 5000),
	CONSTRAINT "feedbacks_version_valid" CHECK ("feedbacks"."version" >= 0),
	CONSTRAINT "feedbacks_reply_valid" CHECK (("feedbacks"."status" = 'REPLIED' AND "feedbacks"."reply" IS NOT NULL AND length(trim("feedbacks"."reply")) BETWEEN 1 AND 5000 AND "feedbacks"."replied_by_admin_id" IS NOT NULL AND "feedbacks"."replied_at" IS NOT NULL) OR ("feedbacks"."status" <> 'REPLIED' AND "feedbacks"."reply" IS NULL AND "feedbacks"."replied_by_admin_id" IS NULL AND "feedbacks"."replied_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_replied_by_admin_id_admin_accounts_id_fk" FOREIGN KEY ("replied_by_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_status_created_idx" ON "announcements" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedbacks_user_request_uq" ON "feedbacks" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "feedbacks_user_created_idx" ON "feedbacks" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "feedbacks_status_created_idx" ON "feedbacks" USING btree ("status","created_at","id");
--> statement-breakpoint
-- New capabilities are registered, never silently granted to existing roles.
INSERT INTO "permissions" ("id", "permission_key", "description", "high_risk") VALUES
('00000000-0000-4000-8000-000000001501', 'feedback.read', '读取独立意见反馈', false),
('00000000-0000-4000-8000-000000001502', 'feedback.manage', '标记独立反馈处理状态', false),
('00000000-0000-4000-8000-000000001503', 'feedback.reply', '回复独立意见反馈', true),
('00000000-0000-4000-8000-000000001504', 'announcement.read', '读取公告草稿与历史', false),
('00000000-0000-4000-8000-000000001505', 'announcement.manage', '创建及编辑公告草稿', false),
('00000000-0000-4000-8000-000000001506', 'announcement.publish', '发布及停用公共公告', true)
ON CONFLICT ("permission_key") DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION protect_feedback_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'feedback history cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.version <> OLD.version + 1
    OR NOT ((OLD.status = 'SUBMITTED' AND NEW.status IN ('PROCESSING','REPLIED')) OR (OLD.status = 'PROCESSING' AND NEW.status = 'REPLIED'))
  THEN RAISE EXCEPTION 'feedback history transition invalid' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER feedbacks_protect_history BEFORE UPDATE OR DELETE ON feedbacks FOR EACH ROW EXECUTE FUNCTION protect_feedback_history();
--> statement-breakpoint
CREATE FUNCTION protect_announcement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'announcement history cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by_admin_id IS DISTINCT FROM OLD.created_by_admin_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.version <> OLD.version + 1
    OR NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT','PUBLISHED')) OR (OLD.status = 'PUBLISHED' AND NEW.status = 'RETIRED'))
    OR (OLD.status <> 'DRAFT' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content OR NEW.cover_file_id IS DISTINCT FROM OLD.cover_file_id OR NEW.published_at IS DISTINCT FROM OLD.published_at))
  THEN RAISE EXCEPTION 'announcement history transition invalid' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER announcements_protect_history BEFORE UPDATE OR DELETE ON announcements FOR EACH ROW EXECUTE FUNCTION protect_announcement_history();
