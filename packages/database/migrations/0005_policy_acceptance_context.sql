CREATE TYPE "public"."policy_acceptance_scene" AS ENUM('LOGIN', 'ORDER_PAYMENT', 'CHAT_ENTRY', 'SELLER_ONBOARDING', 'IDENTITY_VERIFICATION', 'VOICE_SAMPLE_UPLOAD', 'COMPLAINT_SUBMISSION', 'LEGACY_UNSCOPED');--> statement-breakpoint
CREATE TYPE "public"."policy_confirmation_method" AS ENUM('ONLINE_CONFIRM');--> statement-breakpoint
ALTER TABLE "user_policy_acceptances" ADD COLUMN "acceptance_scene" "policy_acceptance_scene" DEFAULT 'LEGACY_UNSCOPED' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_policy_acceptances" ADD COLUMN "confirmation_method" "policy_confirmation_method" DEFAULT 'ONLINE_CONFIRM' NOT NULL;--> statement-breakpoint
CREATE INDEX "user_policy_acceptances_scene_idx" ON "user_policy_acceptances" USING btree ("user_id","acceptance_scene","accepted_at");
