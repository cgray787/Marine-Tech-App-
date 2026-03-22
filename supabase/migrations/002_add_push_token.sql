-- Add push_token column for push notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token text;
