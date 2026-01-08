-- Migration: Add provider column to messages table
-- This allows tracking which API provider (gemini/openai) was used for each message

-- Add provider column (nullable, can be 'gemini' or 'openai')
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS provider TEXT;

-- Add check constraint to ensure only valid providers
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_provider_check;

ALTER TABLE messages
ADD CONSTRAINT messages_provider_check 
CHECK (provider IS NULL OR provider IN ('gemini', 'openai'));

-- Create index for faster queries filtering by provider
CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider);

-- Optional: Add comment to document the column
COMMENT ON COLUMN messages.provider IS 'The API provider used for this message: gemini or openai';

