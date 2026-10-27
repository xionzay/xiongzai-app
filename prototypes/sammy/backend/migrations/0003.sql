ALTER TABLE users ADD COLUMN suspended boolean NOT NULL DEFAULT false, ADD COLUMN suspension_reason text, ADD COLUMN provider_suspended boolean NOT NULL DEFAULT false, ADD COLUMN provider_suspension_reason text;
ALTER TABLE listings ADD COLUMN moderation_blocked boolean NOT NULL DEFAULT false, ADD COLUMN moderation_reason text;
CREATE TABLE admin_actions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, target_id uuid NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX admin_actions_time ON admin_actions(created_at DESC,id DESC);
