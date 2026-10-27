ALTER TABLE "orders" ADD COLUMN "transaction_rule_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rule_version_positive" CHECK ("orders"."transaction_rule_version" > 0);--> statement-breakpoint
CREATE FUNCTION "orders_protect_rule_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.transaction_rule_version IS DISTINCT FROM OLD.transaction_rule_version THEN
    RAISE EXCEPTION 'order transaction rule version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "orders_rule_version_immutable"
BEFORE UPDATE OF "transaction_rule_version" ON "orders"
FOR EACH ROW EXECUTE FUNCTION "orders_protect_rule_version"();
