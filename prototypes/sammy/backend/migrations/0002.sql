CREATE TABLE listings (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL, description text NOT NULL, game text NOT NULL CHECK(game='peaceElite'),
 mode text NOT NULL CHECK(mode IN ('duo','squad')), category text NOT NULL CHECK(category IN ('relaxed','ranked')),
 price_fen integer NOT NULL CHECK(price_fen BETWEEN 100 AND 100000), photo_media_ids jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), application_id uuid REFERENCES applications(id),
 publication_consent_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'published' OR (application_id IS NOT NULL AND publication_consent_at IS NOT NULL))
);
CREATE INDEX listings_owner ON listings(owner_id);
CREATE INDEX listings_public ON listings(id DESC) WHERE status='published';
