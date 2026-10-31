CREATE TABLE "after_sale_case_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"actor_user_id" uuid,
	"actor_admin_id" uuid,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "after_sale_case_events_actor_valid" CHECK (NOT ("after_sale_case_events"."actor_user_id" IS NOT NULL AND "after_sale_case_events"."actor_admin_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "after_sale_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"state" varchar(32) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"deadline_at" timestamp with time zone,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "after_sale_cases_kind_valid" CHECK ("after_sale_cases"."kind" IN ('NORMAL','REMEDY','SPECIAL')),
	CONSTRAINT "after_sale_cases_state_valid" CHECK ("after_sale_cases"."state" IN ('S01','S02','S03','S04','S05','R01','R02','P01','P02','P03','P04','EXECUTION_PENDING','F01','F02','F06','REMEDY_COMPLETED')),
	CONSTRAINT "after_sale_cases_version_valid" CHECK ("after_sale_cases"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "after_sale_case_events" ADD CONSTRAINT "after_sale_case_events_case_id_after_sale_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."after_sale_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale_case_events" ADD CONSTRAINT "after_sale_case_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale_case_events" ADD CONSTRAINT "after_sale_case_events_actor_admin_id_admin_accounts_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale_cases" ADD CONSTRAINT "after_sale_cases_id_refunds_id_fk" FOREIGN KEY ("id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_sale_cases" ADD CONSTRAINT "after_sale_cases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "after_sale_case_events_version_uq" ON "after_sale_case_events" USING btree ("case_id","version");--> statement-breakpoint
CREATE INDEX "after_sale_cases_order_idx" ON "after_sale_cases" USING btree ("order_id","created_at");
--> statement-breakpoint
CREATE TRIGGER after_sale_case_events_append_only BEFORE UPDATE OR DELETE ON after_sale_case_events
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE FUNCTION guard_after_sale_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM refunds r WHERE r.id=NEW.id AND r.order_id=NEW.order_id) THEN
    RAISE EXCEPTION 'case refund/order mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.version<>OLD.version+1 THEN
      RAISE EXCEPTION 'case lifecycle version invalid' USING ERRCODE='23514';
    END IF;
    IF (NEW.data->>'modifications')::integer < (OLD.data->>'modifications')::integer OR
       (NEW.data->>'negotiation_rounds')::integer < (OLD.data->>'negotiation_rounds')::integer OR
       (OLD.data->>'platform_entered')::boolean AND NOT (NEW.data->>'platform_entered')::boolean THEN
      RAISE EXCEPTION 'case consumed allowance cannot reset' USING ERRCODE='23514';
    END IF;
    IF (NEW.data->'original_status') IS DISTINCT FROM (OLD.data->'original_status') OR
       (NEW.data->'paused_at') IS DISTINCT FROM (OLD.data->'paused_at') OR
       (NEW.data->'original_fulfillment_due_at') IS DISTINCT FROM (OLD.data->'original_fulfillment_due_at') OR
       (NEW.data->'receipt_remaining_ms') IS DISTINCT FROM (OLD.data->'receipt_remaining_ms') THEN
      RAISE EXCEPTION 'case original clock is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER after_sale_case_guard BEFORE INSERT OR UPDATE ON after_sale_cases
FOR EACH ROW EXECUTE FUNCTION guard_after_sale_case();
--> statement-breakpoint
-- No role receives this elevated permission implicitly.
INSERT INTO permissions(id,permission_key)
VALUES('019a3800-0000-7000-8000-000000000019','refund.review.supervisor')
ON CONFLICT(permission_key) DO NOTHING;
