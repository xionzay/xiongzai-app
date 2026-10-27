CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),phone text NOT NULL UNIQUE,password_hash text NOT NULL,nickname text NOT NULL,bio text NOT NULL DEFAULT '',is_admin boolean NOT NULL DEFAULT false,
 avatar_media_id uuid,draft jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS media(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('avatar','voice')),status text NOT NULL CHECK(status IN ('pending','ready')),key text NOT NULL UNIQUE,mime text NOT NULL,bytes integer NOT NULL CHECK(bytes>0),duration_ms integer,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','changes_requested')),snapshot jsonb NOT NULL,agreement_version text NOT NULL,submitted_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,reviewer_id uuid REFERENCES users(id),reason text,
 CHECK((status='pending' AND reviewed_at IS NULL AND reviewer_id IS NULL) OR (status<>'pending' AND reviewed_at IS NOT NULL AND reviewer_id IS NOT NULL)),
 CHECK(status<>'changes_requested' OR length(trim(reason))>=5)
);
CREATE INDEX IF NOT EXISTS applications_owner_time ON applications(user_id,submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS applications_one_pending ON applications(user_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS rate_limits(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
