DROP INDEX "policy_status_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transaction_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD COLUMN "effective_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD COLUMN "requires_reacceptance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "policy_versions"
SET
  "published_at" = COALESCE("published_at", "created_at"),
  "effective_at" = COALESCE("effective_at", "published_at", "created_at")
WHERE "status" <> 'DRAFT';--> statement-breakpoint
ALTER TABLE "seller_applications" ADD COLUMN "onboarding_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "voice_authorization_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_transaction_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("transaction_policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_refund_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("refund_policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_onboarding_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("onboarding_policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_voice_authorization_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("voice_authorization_policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_status_idx" ON "policy_versions" USING btree ("status","effective_at","published_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_policy_versions_complete" CHECK (("orders"."transaction_policy_version_id" IS NULL AND "orders"."refund_policy_version_id" IS NULL) OR ("orders"."transaction_policy_version_id" IS NOT NULL AND "orders"."refund_policy_version_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_version_no_positive" CHECK ("policy_versions"."version_no" > 0);--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_published_timestamps_present" CHECK ("policy_versions"."status" = 'DRAFT' OR ("policy_versions"."published_at" IS NOT NULL AND "policy_versions"."effective_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "user_policy_acceptances" ADD CONSTRAINT "user_policy_acceptances_evidence_present" CHECK (length(btrim("user_policy_acceptances"."ip")) > 0 AND length(btrim("user_policy_acceptances"."user_agent")) > 0);--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_policy_version_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_acceptance boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM "user_policy_acceptances"
    WHERE "policy_version_id" = OLD."id"
  ) INTO has_acceptance;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' OR has_acceptance THEN
      RAISE EXCEPTION 'published or accepted policy version is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" <> 'DRAFT' OR has_acceptance THEN
    IF NEW."policy_type" IS DISTINCT FROM OLD."policy_type"
       OR NEW."title" IS DISTINCT FROM OLD."title"
       OR NEW."content" IS DISTINCT FROM OLD."content"
       OR NEW."version_no" IS DISTINCT FROM OLD."version_no"
       OR NEW."published_at" IS DISTINCT FROM OLD."published_at"
       OR NEW."effective_at" IS DISTINCT FROM OLD."effective_at"
       OR NEW."requires_reacceptance" IS DISTINCT FROM OLD."requires_reacceptance"
       OR NEW."created_by_admin_id" IS DISTINCT FROM OLD."created_by_admin_id"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'published or accepted policy version is immutable';
    END IF;

    IF NEW."status" = OLD."status"
       OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'RETIRED') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invalid policy version status transition';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "policy_versions_protect_history"
BEFORE UPDATE OR DELETE ON "policy_versions"
FOR EACH ROW EXECUTE FUNCTION protect_policy_version_history();--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_policy_acceptance_eligibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_status policy_status;
  target_effective_at timestamptz;
BEGIN
  SELECT "status", "effective_at"
    INTO target_status, target_effective_at
  FROM "policy_versions"
  WHERE "id" = NEW."policy_version_id";

  IF target_status IS DISTINCT FROM 'PUBLISHED'
     OR target_effective_at IS NULL
     OR target_effective_at > NEW."accepted_at" THEN
    RAISE EXCEPTION 'only an effective published policy version can be accepted';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "user_policy_acceptances_validate_policy"
BEFORE INSERT ON "user_policy_acceptances"
FOR EACH ROW EXECUTE FUNCTION enforce_policy_acceptance_eligibility();--> statement-breakpoint
CREATE TRIGGER "user_policy_acceptances_append_only"
BEFORE UPDATE OR DELETE ON "user_policy_acceptances"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_user_policy_acceptance(
  binding_user_id uuid,
  binding_policy_version_id uuid,
  binding_scene policy_acceptance_scene,
  expected_policy_type text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual_policy_type text;
BEGIN
  SELECT pv."policy_type"
    INTO actual_policy_type
  FROM "policy_versions" pv
  INNER JOIN "user_policy_acceptances" acceptance
    ON acceptance."policy_version_id" = pv."id"
  WHERE pv."id" = binding_policy_version_id
    AND acceptance."user_id" = binding_user_id
    AND acceptance."acceptance_scene" = binding_scene;

  IF actual_policy_type IS NULL THEN
    RAISE EXCEPTION 'policy version binding has no matching user acceptance';
  END IF;

  IF actual_policy_type IS DISTINCT FROM expected_policy_type THEN
    RAISE EXCEPTION 'policy version binding has unexpected policy type';
  END IF;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_business_policy_version_bindings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  binding_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'seller_applications' THEN
    IF NEW."onboarding_policy_version_id" IS NOT NULL THEN
      SELECT "user_id" INTO binding_user_id
      FROM "seller_profiles"
      WHERE "id" = NEW."seller_id";

      PERFORM assert_user_policy_acceptance(
        binding_user_id,
        NEW."onboarding_policy_version_id",
        'SELLER_ONBOARDING',
        'SELLER_ONBOARDING_AGREEMENT'
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'seller_profiles' THEN
    IF NEW."voice_authorization_policy_version_id" IS NOT NULL THEN
      PERFORM assert_user_policy_acceptance(
        NEW."user_id",
        NEW."voice_authorization_policy_version_id",
        'VOICE_SAMPLE_UPLOAD',
        'VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION'
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'orders' THEN
    IF NEW."transaction_policy_version_id" IS NOT NULL THEN
      PERFORM assert_user_policy_acceptance(
        NEW."buyer_id",
        NEW."transaction_policy_version_id",
        'ORDER_PAYMENT',
        'ORDER_PAYMENT_REFUND_RULES'
      );
      PERFORM assert_user_policy_acceptance(
        NEW."buyer_id",
        NEW."refund_policy_version_id",
        'ORDER_PAYMENT',
        'ORDER_PAYMENT_REFUND_RULES'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "seller_applications_policy_binding_trigger"
AFTER INSERT OR UPDATE ON "seller_applications"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_business_policy_version_bindings();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "seller_profiles_voice_policy_binding_trigger"
AFTER INSERT OR UPDATE ON "seller_profiles"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_business_policy_version_bindings();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "orders_policy_binding_trigger"
AFTER INSERT OR UPDATE ON "orders"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_business_policy_version_bindings();
