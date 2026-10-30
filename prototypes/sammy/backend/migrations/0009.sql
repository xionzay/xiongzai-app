ALTER TABLE messages ADD COLUMN snapshot jsonb;
CREATE INDEX IF NOT EXISTS notifications_conversation_unread ON notifications(user_id,object_id) WHERE kind='conversation' AND read_at IS NULL;
