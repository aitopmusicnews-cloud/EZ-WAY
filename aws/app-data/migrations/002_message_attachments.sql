ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
-- statement-breakpoint
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_key TEXT;
-- statement-breakpoint
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
-- statement-breakpoint
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;
-- statement-breakpoint
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT NOT NULL DEFAULT 0;
