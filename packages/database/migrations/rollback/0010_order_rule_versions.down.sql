-- Prefer rolling back the application while keeping this additive migration.
-- Stop writers before removing the column; never discard newer-order routing facts.
BEGIN;
LOCK TABLE "orders" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "orders" WHERE "transaction_rule_version" <> 1) THEN
    RAISE EXCEPTION 'cannot remove transaction rule versions while nonlegacy orders exist';
  END IF;
END;
$$;
DROP TRIGGER "orders_rule_version_immutable" ON "orders";
DROP FUNCTION "orders_protect_rule_version"();
ALTER TABLE "orders" DROP CONSTRAINT "orders_rule_version_positive";
ALTER TABLE "orders" DROP COLUMN "transaction_rule_version";
COMMIT;
