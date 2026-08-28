CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'OGBeatz',
  duration INTEGER NOT NULL DEFAULT 0,
  bpm INTEGER NOT NULL DEFAULT 0,
  key_signature TEXT NOT NULL DEFAULT '',
  file_key TEXT,
  image_key TEXT,
  size BIGINT NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'audio/mpeg',
  plays INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  lyrics TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready','processing','error')) DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  track_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_color TEXT NOT NULL DEFAULT '#f97316',
  end_color TEXT NOT NULL DEFAULT '#ea580c',
  image_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  avatar_key TEXT,
  company TEXT,
  status TEXT NOT NULL CHECK (status IN ('online','offline','away')) DEFAULT 'offline',
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  recipient_email TEXT,
  download_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((track_id IS NOT NULL)::integer + (playlist_id IS NOT NULL)::integer = 1)
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  "user" TEXT NOT NULL DEFAULT 'Anonymous',
  action TEXT NOT NULL DEFAULT '',
  target TEXT,
  details TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  recipient_id TEXT,
  content TEXT NOT NULL,
  image_key TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT FALSE
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS promo_videos (
  id UUID PRIMARY KEY,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  video_key TEXT NOT NULL,
  thumbnail_key TEXT,
  style TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','ready','error')) DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT,
  title TEXT
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS promo_packs (
  id UUID PRIMARY KEY,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  youtube_copy TEXT,
  instagram_copy TEXT,
  generic_copy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  artist_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_key TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint

CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks (bpm);
-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks (created_at DESC);
-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links (token);
-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages (client_id);
-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities (timestamp DESC);
-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_promo_videos_track_id ON promo_videos (track_id);
-- statement-breakpoint

CREATE OR REPLACE FUNCTION update_client_active_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    UPDATE clients
    SET last_active = NOW(), status = 'online'
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- statement-breakpoint

DROP TRIGGER IF EXISTS trigger_client_message_ping ON messages;
-- statement-breakpoint

CREATE TRIGGER trigger_client_message_ping
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_client_active_time();
-- statement-breakpoint

DROP TRIGGER IF EXISTS trigger_client_activity_ping ON activities;
-- statement-breakpoint

CREATE TRIGGER trigger_client_activity_ping
AFTER INSERT ON activities
FOR EACH ROW EXECUTE FUNCTION update_client_active_time();
-- statement-breakpoint
