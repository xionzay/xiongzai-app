-- Custom SQL migration file, put your code below! --
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "ledger_transactions"
  ADD CONSTRAINT "ledger_transactions_reversal_fk"
  FOREIGN KEY ("reversal_of_transaction_id")
  REFERENCES "ledger_transactions"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "order_slot_reservations"
  ADD CONSTRAINT "order_slot_reservations_no_overlap"
  EXCLUDE USING gist (
    "seller_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" IN ('HELD', 'CONFIRMED'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_order_reference_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_user_id uuid;
  sku_product_id uuid;
BEGIN
  SELECT "user_id" INTO profile_user_id
  FROM "seller_profiles"
  WHERE "id" = NEW."seller_id";

  IF profile_user_id IS DISTINCT FROM NEW."seller_user_id" THEN
    RAISE EXCEPTION 'order seller_user_id does not match seller profile';
  END IF;

  SELECT "product_id" INTO sku_product_id
  FROM "product_skus"
  WHERE "id" = NEW."sku_id";

  IF sku_product_id IS DISTINCT FROM NEW."product_id" THEN
    RAISE EXCEPTION 'order sku does not belong to product';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "orders_reference_integrity_trigger"
AFTER INSERT OR UPDATE
ON "orders"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_order_reference_integrity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_payment_order_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_amount bigint;
BEGIN
  SELECT "payable_amount_cent" INTO expected_amount
  FROM "orders"
  WHERE "id" = NEW."order_id";

  IF expected_amount IS DISTINCT FROM NEW."amount_cent" THEN
    RAISE EXCEPTION 'payment amount does not match order payable amount';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "payments_order_amount_trigger"
AFTER INSERT OR UPDATE
ON "payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_payment_order_amount();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_refund_reference_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_order_id uuid;
  order_paid bigint;
  order_refunded bigint;
BEGIN
  SELECT "order_id" INTO payment_order_id
  FROM "payments"
  WHERE "id" = NEW."payment_id";

  IF payment_order_id IS DISTINCT FROM NEW."order_id" THEN
    RAISE EXCEPTION 'refund payment does not belong to order';
  END IF;

  SELECT "paid_amount_cent", "refunded_amount_cent"
    INTO order_paid, order_refunded
  FROM "orders"
  WHERE "id" = NEW."order_id";

  IF NEW."status" = 'REFUNDED' THEN
    order_refunded := order_refunded - COALESCE(NEW."approved_amount_cent", 0);
  END IF;

  IF NEW."requested_amount_cent" > order_paid - order_refunded THEN
    RAISE EXCEPTION 'refund requested amount exceeds remaining paid amount';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "refunds_reference_integrity_trigger"
AFTER INSERT OR UPDATE
ON "refunds"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_refund_reference_integrity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_order_refund_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_order_id uuid;
  recorded_total bigint;
  successful_total bigint;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    target_order_id := COALESCE(NEW."id", OLD."id");
  ELSE
    target_order_id := COALESCE(NEW."order_id", OLD."order_id");
  END IF;

  SELECT "refunded_amount_cent" INTO recorded_total
  FROM "orders"
  WHERE "id" = target_order_id;

  SELECT COALESCE(SUM("approved_amount_cent"), 0) INTO successful_total
  FROM "refunds"
  WHERE "order_id" = target_order_id
    AND "status" = 'REFUNDED';

  IF recorded_total IS DISTINCT FROM successful_total THEN
    RAISE EXCEPTION 'order refunded amount does not equal successful refund total';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "orders_refund_total_trigger"
AFTER INSERT OR UPDATE
ON "orders"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_order_refund_total();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "refunds_order_total_trigger"
AFTER INSERT OR UPDATE OR DELETE
ON "refunds"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_order_refund_total();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id uuid;
  transaction_status ledger_transaction_status;
  debit_total bigint;
  credit_total bigint;
  entry_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'ledger_entries' THEN
    target_transaction_id := COALESCE(NEW."transaction_id", OLD."transaction_id");
  ELSE
    target_transaction_id := COALESCE(NEW."id", OLD."id");
  END IF;

  SELECT "status" INTO transaction_status
  FROM "ledger_transactions"
  WHERE "id" = target_transaction_id;

  IF transaction_status = 'POSTED' THEN
    SELECT
      COALESCE(SUM("amount_cent") FILTER (WHERE "side" = 'DEBIT'), 0),
      COALESCE(SUM("amount_cent") FILTER (WHERE "side" = 'CREDIT'), 0),
      COUNT(*)
      INTO debit_total, credit_total, entry_count
    FROM "ledger_entries"
    WHERE "transaction_id" = target_transaction_id;

    IF entry_count < 2 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'posted ledger transaction % is unbalanced', target_transaction_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ledger_entries_balance_trigger"
AFTER INSERT OR UPDATE OR DELETE
ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_ledger_transaction_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ledger_transactions_balance_trigger"
AFTER INSERT OR UPDATE
ON "ledger_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_ledger_transaction_balanced();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "order_status_logs_append_only"
BEFORE UPDATE OR DELETE ON "order_status_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "refund_logs_append_only"
BEFORE UPDATE OR DELETE ON "refund_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "complaint_logs_append_only"
BEFORE UPDATE OR DELETE ON "complaint_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "withdrawal_logs_append_only"
BEFORE UPDATE OR DELETE ON "withdrawal_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "seller_review_logs_append_only"
BEFORE UPDATE OR DELETE ON "seller_review_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "product_review_logs_append_only"
BEFORE UPDATE OR DELETE ON "product_review_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "support_case_logs_append_only"
BEFORE UPDATE OR DELETE ON "support_case_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "admin_operation_logs_append_only"
BEFORE UPDATE OR DELETE ON "admin_operation_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_posted_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'PENDING'
     AND NEW."status" = 'POSTED'
     AND (to_jsonb(NEW) - 'status' - 'posted_at') = (to_jsonb(OLD) - 'status' - 'posted_at') THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'POSTED'
     AND NEW."status" = 'REVERSED'
     AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PENDING' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'posted ledger transaction is immutable; create a reversal transaction instead';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_transactions_protect_posted"
BEFORE UPDATE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION protect_posted_ledger_transaction();
--> statement-breakpoint
CREATE TRIGGER "ledger_transactions_no_delete"
BEFORE DELETE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
