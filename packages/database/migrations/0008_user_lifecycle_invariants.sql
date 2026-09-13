CREATE UNIQUE INDEX "phone_change_requests_old_sms_code_uq" ON "phone_change_requests" USING btree ("old_sms_code_id") WHERE "phone_change_requests"."old_sms_code_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_change_requests_new_sms_code_uq" ON "phone_change_requests" USING btree ("new_sms_code_id") WHERE "phone_change_requests"."new_sms_code_id" IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_user_lifecycle_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_status text := OLD."status"::text;
  new_status text := NEW."status"::text;
  transition_allowed boolean := false;
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'lifecycle request version must increase by exactly one';
  END IF;

  IF TG_TABLE_NAME = 'phone_change_requests' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
       OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
       OR NEW."old_phone_ciphertext" IS DISTINCT FROM OLD."old_phone_ciphertext"
       OR NEW."old_phone_hash" IS DISTINCT FROM OLD."old_phone_hash"
       OR NEW."old_phone_mask" IS DISTINCT FROM OLD."old_phone_mask"
       OR NEW."new_phone_ciphertext" IS DISTINCT FROM OLD."new_phone_ciphertext"
       OR NEW."new_phone_hash" IS DISTINCT FROM OLD."new_phone_hash"
       OR NEW."new_phone_mask" IS DISTINCT FROM OLD."new_phone_mask"
       OR NEW."max_attempts" IS DISTINCT FROM OLD."max_attempts"
       OR NEW."user_version_at_request" IS DISTINCT FROM OLD."user_version_at_request"
       OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'phone change request identity is immutable';
    END IF;

    IF NEW."old_attempt_count" < OLD."old_attempt_count"
       OR NEW."new_attempt_count" < OLD."new_attempt_count" THEN
      RAISE EXCEPTION 'phone change attempt counters cannot decrease';
    END IF;

    IF (OLD."old_sms_code_id" IS NOT NULL AND NEW."old_sms_code_id" IS DISTINCT FROM OLD."old_sms_code_id")
       OR (OLD."new_sms_code_id" IS NOT NULL AND NEW."new_sms_code_id" IS DISTINCT FROM OLD."new_sms_code_id") THEN
      RAISE EXCEPTION 'phone change SMS proof is immutable once recorded';
    END IF;

    IF old_status IN ('COMPLETED', 'CANCELLED', 'EXPIRED') THEN
      RAISE EXCEPTION 'terminal phone change request is immutable';
    END IF;

    IF old_status = new_status THEN
      transition_allowed := true;
    ELSIF old_status = 'PENDING_OLD_VERIFICATION'
          AND new_status IN ('PENDING_NEW_VERIFICATION', 'CANCELLED', 'EXPIRED') THEN
      transition_allowed := true;
    ELSIF old_status = 'PENDING_NEW_VERIFICATION'
          AND new_status IN ('READY', 'CANCELLED', 'EXPIRED') THEN
      transition_allowed := true;
    ELSIF old_status = 'READY'
          AND new_status IN ('COMPLETED', 'CANCELLED', 'EXPIRED') THEN
      transition_allowed := true;
    END IF;

    IF new_status = 'EXPIRED' AND clock_timestamp() < NEW."expires_at" THEN
      RAISE EXCEPTION 'phone change request cannot expire before expires_at';
    END IF;
  ELSIF TG_TABLE_NAME = 'personal_data_export_jobs' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
       OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
       OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at"
       OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'personal data export job identity is immutable';
    END IF;

    IF OLD."output_file_id" IS NOT NULL
       AND NEW."output_file_id" IS DISTINCT FROM OLD."output_file_id" THEN
      RAISE EXCEPTION 'personal data export output file cannot be replaced';
    END IF;

    IF old_status IN ('FAILED', 'EXPIRED') OR (old_status = 'COMPLETED' AND new_status = old_status) THEN
      RAISE EXCEPTION 'terminal personal data export job is immutable';
    END IF;

    IF old_status = new_status AND old_status IN ('PENDING', 'PROCESSING') THEN
      transition_allowed := true;
    ELSIF old_status = 'PENDING' AND new_status IN ('PROCESSING', 'FAILED', 'EXPIRED') THEN
      transition_allowed := true;
    ELSIF old_status = 'PROCESSING' AND new_status IN ('COMPLETED', 'FAILED', 'EXPIRED') THEN
      transition_allowed := true;
    ELSIF old_status = 'COMPLETED' AND new_status = 'EXPIRED' THEN
      transition_allowed := true;
    END IF;

    IF new_status = 'EXPIRED' AND clock_timestamp() < NEW."expires_at" THEN
      RAISE EXCEPTION 'personal data export job cannot expire before expires_at';
    END IF;
  ELSIF TG_TABLE_NAME = 'account_cancellation_requests' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
       OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
       OR NEW."reason" IS DISTINCT FROM OLD."reason"
       OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at"
       OR NEW."waiting_period_ends_at" IS DISTINCT FROM OLD."waiting_period_ends_at"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'account cancellation request identity is immutable';
    END IF;

    IF OLD."decision_admin_operation_log_id" IS NOT NULL
       AND NEW."decision_admin_operation_log_id" IS DISTINCT FROM OLD."decision_admin_operation_log_id" THEN
      RAISE EXCEPTION 'account cancellation audit link cannot be replaced';
    END IF;

    IF old_status IN ('CANCELLED', 'COMPLETED', 'REJECTED') THEN
      RAISE EXCEPTION 'terminal account cancellation request is immutable';
    END IF;

    IF old_status = new_status THEN
      transition_allowed := true;
    ELSIF old_status = 'REQUESTED' AND new_status IN ('CANCELLED', 'PROCESSING', 'REJECTED') THEN
      transition_allowed := true;
    ELSIF old_status = 'PROCESSING' AND new_status IN ('COMPLETED', 'REJECTED') THEN
      transition_allowed := true;
    END IF;

    IF old_status = 'REQUESTED' AND new_status = 'PROCESSING'
       AND clock_timestamp() < NEW."waiting_period_ends_at" THEN
      RAISE EXCEPTION 'account cancellation waiting period has not ended';
    END IF;
  END IF;

  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'invalid % status transition: % -> %', TG_TABLE_NAME, old_status, new_status;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "phone_change_requests_state_transition"
BEFORE UPDATE ON "phone_change_requests"
FOR EACH ROW EXECUTE FUNCTION enforce_user_lifecycle_update();
--> statement-breakpoint
CREATE TRIGGER "personal_data_export_jobs_state_transition"
BEFORE UPDATE ON "personal_data_export_jobs"
FOR EACH ROW EXECUTE FUNCTION enforce_user_lifecycle_update();
--> statement-breakpoint
CREATE TRIGGER "account_cancellation_requests_state_transition"
BEFORE UPDATE ON "account_cancellation_requests"
FOR EACH ROW EXECUTE FUNCTION enforce_user_lifecycle_update();
--> statement-breakpoint
CREATE TRIGGER "phone_change_requests_no_delete"
BEFORE DELETE ON "phone_change_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "personal_data_export_jobs_no_delete"
BEFORE DELETE ON "personal_data_export_jobs"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "account_cancellation_requests_no_delete"
BEFORE DELETE ON "account_cancellation_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_phone_change_request_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_row phone_change_requests%ROWTYPE;
  user_row users%ROWTYPE;
  old_code sms_codes%ROWTYPE;
  new_code sms_codes%ROWTYPE;
BEGIN
  SELECT * INTO request_row
  FROM "phone_change_requests"
  WHERE "id" = NEW."id";

  SELECT * INTO user_row
  FROM "users"
  WHERE "id" = request_row."user_id";

  IF request_row."status" = 'COMPLETED' THEN
    IF user_row."phone_hash" IS DISTINCT FROM request_row."new_phone_hash"
       OR user_row."phone_ciphertext" IS DISTINCT FROM request_row."new_phone_ciphertext"
       OR user_row."phone_mask" IS DISTINCT FROM request_row."new_phone_mask"
       OR user_row."version" IS DISTINCT FROM request_row."user_version_at_request" + 1 THEN
      RAISE EXCEPTION 'completed phone change request is not atomically reflected on user';
    END IF;
  ELSIF request_row."status" IN ('PENDING_OLD_VERIFICATION', 'PENDING_NEW_VERIFICATION', 'READY') THEN
    IF user_row."status" IS DISTINCT FROM 'NORMAL'
       OR user_row."phone_hash" IS DISTINCT FROM request_row."old_phone_hash"
       OR user_row."version" IS DISTINCT FROM request_row."user_version_at_request" THEN
      RAISE EXCEPTION 'phone change request no longer matches current user version';
    END IF;

    IF request_row."expires_at" <= clock_timestamp() THEN
      RAISE EXCEPTION 'expired phone change request cannot remain active';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "phone_hash" = request_row."new_phone_hash"
      AND "id" <> request_row."user_id"
  ) THEN
    RAISE EXCEPTION 'new phone hash is already bound to another user';
  END IF;

  IF request_row."old_sms_code_id" IS NOT NULL THEN
    SELECT * INTO old_code FROM "sms_codes" WHERE "id" = request_row."old_sms_code_id";
    IF old_code."id" IS NULL
       OR old_code."phone_hash" IS DISTINCT FROM request_row."old_phone_hash"
       OR old_code."purpose" IS DISTINCT FROM 'PHONE_CHANGE_OLD'
       OR old_code."consumed_at" IS NULL
       OR old_code."consumed_at" > old_code."expires_at"
       OR old_code."consumed_at" > request_row."old_verified_at" THEN
      RAISE EXCEPTION 'old phone SMS proof is invalid';
    END IF;
  END IF;

  IF request_row."new_sms_code_id" IS NOT NULL THEN
    SELECT * INTO new_code FROM "sms_codes" WHERE "id" = request_row."new_sms_code_id";
    IF new_code."id" IS NULL
       OR new_code."phone_hash" IS DISTINCT FROM request_row."new_phone_hash"
       OR new_code."purpose" IS DISTINCT FROM 'PHONE_CHANGE_NEW'
       OR new_code."consumed_at" IS NULL
       OR new_code."consumed_at" > new_code."expires_at"
       OR new_code."consumed_at" > request_row."new_verified_at" THEN
      RAISE EXCEPTION 'new phone SMS proof is invalid';
    END IF;
  END IF;

  IF request_row."completed_at" IS NOT NULL
     AND request_row."completed_at" > request_row."expires_at" THEN
    RAISE EXCEPTION 'phone change cannot complete after expiry';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "phone_change_requests_integrity_trigger"
AFTER INSERT OR UPDATE ON "phone_change_requests"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_phone_change_request_integrity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_personal_data_export_file()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  export_row personal_data_export_jobs%ROWTYPE;
  output_file files%ROWTYPE;
BEGIN
  SELECT * INTO export_row
  FROM "personal_data_export_jobs"
  WHERE "id" = NEW."id";

  IF export_row."output_file_id" IS NOT NULL THEN
    SELECT * INTO output_file FROM "files" WHERE "id" = export_row."output_file_id";

    IF output_file."id" IS NULL
       OR output_file."file_type" IS DISTINCT FROM 'DATA_EXPORT'
       OR output_file."owner_user_id" IS DISTINCT FROM export_row."user_id"
       OR output_file."visibility" NOT IN ('PRIVATE', 'SIGNED') THEN
      RAISE EXCEPTION 'personal data export output file is invalid';
    END IF;

    IF export_row."status" = 'COMPLETED'
       AND (output_file."upload_status" IS DISTINCT FROM 'VERIFIED' OR output_file."deleted_at" IS NOT NULL) THEN
      RAISE EXCEPTION 'completed personal data export requires a verified live file';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "personal_data_export_jobs_file_trigger"
AFTER INSERT OR UPDATE ON "personal_data_export_jobs"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_personal_data_export_file();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_account_cancellation_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_row account_cancellation_requests%ROWTYPE;
  user_row users%ROWTYPE;
  operation_log admin_operation_logs%ROWTYPE;
BEGIN
  SELECT * INTO request_row
  FROM "account_cancellation_requests"
  WHERE "id" = NEW."id";

  IF request_row."decision_admin_operation_log_id" IS NOT NULL THEN
    SELECT * INTO operation_log
    FROM "admin_operation_logs"
    WHERE "id" = request_row."decision_admin_operation_log_id";

    IF operation_log."id" IS NULL
       OR operation_log."target_type" IS DISTINCT FROM 'USER'
       OR operation_log."target_id" IS DISTINCT FROM request_row."user_id"
       OR operation_log."action" NOT LIKE 'ACCOUNT_CANCELLATION_%' THEN
      RAISE EXCEPTION 'account cancellation audit link is invalid';
    END IF;
  END IF;

  IF request_row."status" = 'COMPLETED' THEN
    SELECT * INTO user_row FROM "users" WHERE "id" = request_row."user_id";
    IF user_row."status" IS DISTINCT FROM 'CANCELLED'
       OR user_row."cancelled_at" IS DISTINCT FROM request_row."completed_at" THEN
      RAISE EXCEPTION 'completed account cancellation is not atomically reflected on user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "account_cancellation_requests_integrity_trigger"
AFTER INSERT OR UPDATE ON "account_cancellation_requests"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_account_cancellation_integrity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_complaint_evidence_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evidence_count integer;
BEGIN
  PERFORM 1 FROM "complaints" WHERE "id" = NEW."complaint_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complaint evidence references a missing complaint';
  END IF;

  SELECT count(*)::integer INTO evidence_count
  FROM "complaint_evidences"
  WHERE "complaint_id" = NEW."complaint_id";

  IF evidence_count >= 20 THEN
    RAISE EXCEPTION 'complaint evidence limit of 20 reached';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "complaint_evidences_limit_trigger"
BEFORE INSERT ON "complaint_evidences"
FOR EACH ROW EXECUTE FUNCTION validate_complaint_evidence_insert();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_complaint_evidence_file()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evidence_file files%ROWTYPE;
BEGIN
  SELECT * INTO evidence_file FROM "files" WHERE "id" = NEW."file_id";

  IF evidence_file."id" IS NULL
     OR evidence_file."file_type" IS DISTINCT FROM 'COMPLAINT_EVIDENCE'
     OR evidence_file."upload_status" IS DISTINCT FROM 'VERIFIED'
     OR evidence_file."deleted_at" IS NOT NULL THEN
    RAISE EXCEPTION 'complaint evidence requires a verified live evidence file';
  END IF;

  IF NEW."submitted_by_user_id" IS NOT NULL
     AND evidence_file."owner_user_id" IS DISTINCT FROM NEW."submitted_by_user_id" THEN
    RAISE EXCEPTION 'complaint evidence file owner does not match submitter';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "complaint_evidences_file_trigger"
AFTER INSERT ON "complaint_evidences"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_complaint_evidence_file();
--> statement-breakpoint
CREATE TRIGGER "complaint_evidences_append_only"
BEFORE UPDATE OR DELETE ON "complaint_evidences"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
