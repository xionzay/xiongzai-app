CREATE TABLE platform_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creator_id uuid NOT NULL REFERENCES users(id),
 updater_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL UNIQUE,
 request_hash text NOT NULL,
 title jsonb NOT NULL,
 body jsonb NOT NULL,
 published boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 last_reason text,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_announcements_public_time ON platform_announcements(published,updated_at DESC,id DESC);
