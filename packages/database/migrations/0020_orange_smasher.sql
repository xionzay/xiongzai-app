ALTER TYPE "public"."ledger_account_type" ADD VALUE 'SELLER_AFTER_SALE_HELD' BEFORE 'SELLER_WITHDRAWN';--> statement-breakpoint
CREATE TABLE "after_sale_fund_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"income_id" uuid NOT NULL,
	"amount_cent" bigint NOT NULL,
	"source_bucket" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'HELD' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "after_sale_hold_valid" CHECK ("after_sale_fund_holds"."amount_cent" > 0 AND "after_sale_fund_holds"."source_bucket" IN ('PENDING','AVAILABLE') AND "after_sale_fund_holds"."status" IN ('HELD','RELEASED') AND "after_sale_fund_holds"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "seller_incomes" DROP CONSTRAINT "seller_income_buckets_nonnegative";--> statement-breakpoint
ALTER TABLE "seller_incomes" DROP CONSTRAINT "seller_income_buckets_cap";--> statement-breakpoint
ALTER TABLE "seller_incomes" ADD COLUMN "after_sale_held_cent" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "after_sale_fund_holds" ADD CONSTRAINT "after_sale_fund_holds_case_id_after_sale_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."after_sale_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale_fund_holds" ADD CONSTRAINT "after_sale_fund_holds_income_id_seller_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."seller_incomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "after_sale_holds_case_idx" ON "after_sale_fund_holds" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "after_sale_holds_income_idx" ON "after_sale_fund_holds" USING btree ("income_id","status");--> statement-breakpoint
ALTER TABLE "seller_incomes" ADD CONSTRAINT "seller_income_buckets_nonnegative" CHECK ("seller_incomes"."available_amount_cent" >= 0 AND "seller_incomes"."locked_amount_cent" >= 0 AND "seller_incomes"."after_sale_held_cent" >= 0 AND "seller_incomes"."withdrawn_amount_cent" >= 0 AND "seller_incomes"."reversed_amount_cent" >= 0);--> statement-breakpoint
ALTER TABLE "seller_incomes" ADD CONSTRAINT "seller_income_buckets_cap" CHECK ("seller_incomes"."available_amount_cent" + "seller_incomes"."locked_amount_cent" + "seller_incomes"."after_sale_held_cent" + "seller_incomes"."withdrawn_amount_cent" + "seller_incomes"."reversed_amount_cent" <= "seller_incomes"."seller_amount_cent");
--> statement-breakpoint
CREATE FUNCTION guard_after_sale_fund_hold() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'case fund history cannot be deleted'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.case_id<>OLD.case_id OR NEW.income_id<>OLD.income_id OR NEW.amount_cent<>OLD.amount_cent OR NEW.source_bucket<>OLD.source_bucket OR OLD.status<>'HELD' OR NEW.status<>'RELEASED' OR NEW.version<>OLD.version+1) THEN
    RAISE EXCEPTION 'invalid case fund lifecycle';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM after_sale_cases c JOIN orders o ON o.id=c.order_id JOIN seller_incomes i ON i.id=NEW.income_id WHERE c.id=NEW.case_id AND c.kind='SPECIAL' AND o.seller_id=i.seller_id) THEN
    RAISE EXCEPTION 'case fund owner mismatch';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER after_sale_fund_hold_guard BEFORE INSERT OR UPDATE OR DELETE ON after_sale_fund_holds FOR EACH ROW EXECUTE FUNCTION guard_after_sale_fund_hold();
--> statement-breakpoint
CREATE FUNCTION check_after_sale_fund_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE income_uuid uuid; expected bigint; actual bigint;
BEGIN
  IF TG_TABLE_NAME='seller_incomes' THEN income_uuid:=NEW.id; ELSE income_uuid:=NEW.income_id; END IF;
  SELECT after_sale_held_cent INTO expected FROM seller_incomes WHERE id=income_uuid;
  SELECT coalesce(sum(amount_cent),0) INTO actual FROM after_sale_fund_holds WHERE income_id=income_uuid AND status='HELD';
  IF expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'case fund balance mismatch'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER after_sale_fund_allocation_balance AFTER INSERT OR UPDATE ON after_sale_fund_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_after_sale_fund_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER after_sale_fund_income_balance AFTER INSERT OR UPDATE ON seller_incomes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_after_sale_fund_balance();
