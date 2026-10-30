-- Separate platform-owned showcase profiles from real provider submissions.
-- Showcase listings are browse-only and carry no provider application/review claim.
ALTER TABLE users ADD COLUMN is_showcase boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN is_showcase boolean NOT NULL DEFAULT false;

-- 0002 created this unnamed check as listings_check. Replace it so only an
-- explicitly marked showcase row can be visible without publication consent.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_check;
ALTER TABLE listings ADD CONSTRAINT listings_publication_check CHECK (
 status <> 'published' OR
 (is_showcase AND application_id IS NULL AND publication_consent_at IS NULL AND review_status='draft') OR
 (NOT is_showcase AND application_id IS NOT NULL AND publication_consent_at IS NOT NULL AND review_status='approved')
);
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_published_review_check;

CREATE INDEX listings_showcase_public ON listings(game,service_type,id)
 WHERE is_showcase=true AND status='published' AND moderation_blocked=false;
