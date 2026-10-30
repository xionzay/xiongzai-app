-- Expand the catalog while preserving listing IDs, imported drafts, and all
-- historical order snapshots. Old published products need a product review.
ALTER TABLE listings DROP CONSTRAINT listings_game_check;
ALTER TABLE listings ADD CONSTRAINT listings_game_check CHECK(game IN ('peaceElite','deltaForce','honorOfKings','valorant'));
ALTER TABLE listings
 ADD COLUMN service_type text NOT NULL DEFAULT 'companion' CHECK(service_type IN ('companion','coaching')),
 ADD COLUMN review_status text NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','pending','approved','changes_requested')),
 ADD COLUMN review_reason text,
 ADD COLUMN review_submitted_at timestamptz,
 ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN reviewer_id uuid REFERENCES users(id);
UPDATE listings SET status='draft',publication_consent_at=NULL,revision=revision+1,updated_at=now() WHERE status='published';
ALTER TABLE listings ADD CONSTRAINT listings_published_review_check CHECK(status<>'published' OR review_status='approved');
CREATE INDEX listings_review_queue ON listings(review_status,updated_at DESC,id DESC);
CREATE INDEX listings_catalog_price ON listings(game,service_type,price_fen,id) WHERE status='published' AND review_status='approved';

-- Also invalidate product approval for a legacy writer during deployment.
-- Keep these additive columns/guard if rolling back application code. Do not
-- remove game/service facts once new catalog records have been created.
CREATE FUNCTION invalidate_listing_product_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.title,NEW.description,NEW.game,NEW.service_type,NEW.mode,NEW.category,NEW.price_fen,NEW.photo_media_ids)
    IS DISTINCT FROM ROW(OLD.title,OLD.description,OLD.game,OLD.service_type,OLD.mode,OLD.category,OLD.price_fen,OLD.photo_media_ids) THEN
  NEW.status:='draft'; NEW.review_status:='draft'; NEW.review_reason:=NULL;
  NEW.review_submitted_at:=NULL; NEW.reviewed_at:=NULL; NEW.reviewer_id:=NULL; NEW.application_id:=NULL; NEW.publication_consent_at:=NULL;
  NEW.revision:=GREATEST(NEW.revision,OLD.revision+1);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER listings_invalidate_product_review BEFORE UPDATE OF title,description,game,service_type,mode,category,price_fen,photo_media_ids ON listings
 FOR EACH ROW EXECUTE FUNCTION invalidate_listing_product_review();
