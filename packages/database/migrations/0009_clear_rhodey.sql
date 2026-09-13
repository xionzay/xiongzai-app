ALTER TABLE "reviews" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "initial_review_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "initial_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "final_review_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "final_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_initial_review_admin_id_admin_accounts_id_fk" FOREIGN KEY ("initial_review_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_final_review_admin_id_admin_accounts_id_fk" FOREIGN KEY ("final_review_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_dual_review_admins" CHECK ("withdrawals"."final_review_admin_id" IS NULL OR ("withdrawals"."initial_review_admin_id" IS NOT NULL AND "withdrawals"."final_review_admin_id" <> "withdrawals"."initial_review_admin_id"));--> statement-breakpoint
INSERT INTO "permissions" ("id", "permission_key", "description", "high_risk") VALUES
  ('00000000-0000-4000-8000-000000000009', 'finance.export', '导出权限范围内的脱敏财务 CSV', true),
  ('00000000-0000-4000-8000-000000000010', 'withdrawal.review.initial', '提现初审与驳回', true),
  ('00000000-0000-4000-8000-000000000011', 'withdrawal.review.final', '提现独立最终复核并触发打款', true)
ON CONFLICT ("permission_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_source."role_id", permission_target."id"
FROM (
  SELECT "roles"."id" AS "role_id", "permissions"."permission_key"
  FROM "roles"
  LEFT JOIN "role_permissions" ON "role_permissions"."role_id" = "roles"."id"
  LEFT JOIN "permissions" ON "permissions"."id" = "role_permissions"."permission_id"
  WHERE "roles"."role_key" = 'super_admin' OR "permissions"."permission_key" IN ('finance.manage', 'withdrawal.manage')
) AS role_source
CROSS JOIN "permissions" AS permission_target
WHERE (role_source."permission_key" = 'finance.manage' AND permission_target."permission_key" = 'finance.export')
   OR (role_source."permission_key" = 'withdrawal.manage' AND permission_target."permission_key" IN ('withdrawal.review.initial', 'withdrawal.review.final'))
   OR (role_source."permission_key" IS NULL AND permission_target."permission_key" IN ('finance.export', 'withdrawal.review.initial', 'withdrawal.review.final'))
ON CONFLICT DO NOTHING;
