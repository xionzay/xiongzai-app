CREATE TYPE "public"."payment_channel" AS ENUM('WECHAT_APP', 'ALIPAY_APP', 'MOCK');--> statement-breakpoint
ALTER TABLE "payment_events" ALTER COLUMN "channel" SET DATA TYPE "public"."payment_channel" USING "channel"::"public"."payment_channel";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "channel" SET DATA TYPE "public"."payment_channel" USING "channel"::"public"."payment_channel";--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_voice_metadata_valid" CHECK ("files"."file_type" <> 'VOICE_SAMPLE' OR ("files"."mime_type" IN ('audio/aac', 'audio/mp4', 'audio/mpeg') AND ("files"."upload_status" <> 'VERIFIED' OR "files"."duration_ms" BETWEEN 10000 AND 30000)));
