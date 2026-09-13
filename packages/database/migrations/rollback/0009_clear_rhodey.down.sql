-- Manual local rollback for 0009_clear_rhodey.sql.
-- Stop API/scheduler processes and back up the local database before running.
-- The preferred application rollback is to keep these additive columns in place;
-- run this full schema rollback only when the review metadata is no longer needed.
BEGIN;

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id"
  FROM "permissions"
  WHERE "permission_key" IN (
    'finance.export',
    'withdrawal.review.initial',
    'withdrawal.review.final'
  )
);

DELETE FROM "permissions"
WHERE "permission_key" IN (
  'finance.export',
  'withdrawal.review.initial',
  'withdrawal.review.final'
);

ALTER TABLE "withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_dual_review_admins";
ALTER TABLE "withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_final_review_admin_id_admin_accounts_id_fk";
ALTER TABLE "withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_initial_review_admin_id_admin_accounts_id_fk";
ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "final_reviewed_at";
ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "final_review_admin_id";
ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "initial_reviewed_at";
ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "initial_review_admin_id";
ALTER TABLE "reviews" DROP COLUMN IF EXISTS "version";
ALTER TABLE "reviews" DROP COLUMN IF EXISTS "deleted_at";

COMMIT;
