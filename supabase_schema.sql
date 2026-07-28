-- ==========================================
-- OG BEATZ - COMPLETE SYSTEM DATABASES SCHEMA
-- ==========================================
-- PostgreSQL for Supabase SQL Editor
-- This script contains all tables, constraints, indexes, 
-- Row Level Security (RLS) setup, and realistic seed data.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------
-- 1. DATABASE TABLES DESIGN
-- --------------------------------------------------

-- A) Tracks Table
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'OGBeatz',
  duration INTEGER NOT NULL DEFAULT 0,
  bpm INTEGER NOT NULL DEFAULT 120,
  key_signature TEXT NOT NULL DEFAULT 'C Major',
  file_url TEXT,
  image_url TEXT,
  size BIGINT NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'audio/mpeg',
  plays INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  lyrics TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'processing', 'error')) DEFAULT 'processing',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- B) Playlists Table
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  track_ids UUID[] DEFAULT '{}',
  start_color TEXT DEFAULT '#f97316',
  end_color TEXT DEFAULT '#ea580c',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- C) Clients Table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  company TEXT,
  status TEXT CHECK (status IN ('online', 'offline', 'away')) DEFAULT 'offline',
  last_active TIMESTAMPTZ DEFAULT NOW(),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D) Share Links Table
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  recipient_email TEXT,
  download_enabled BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E) Activities Table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  "user" TEXT DEFAULT 'Anonymous',
  action TEXT,
  target TEXT,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- F) Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  recipient_id TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT false
);

-- G) Promo Videos Table
CREATE TABLE IF NOT EXISTS promo_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  style TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'error')) DEFAULT 'processing',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  video_data JSONB DEFAULT '{}'::jsonb,
  thumbnail_data JSONB DEFAULT '{}'::jsonb
);

-- H) Promo Packs Table
CREATE TABLE IF NOT EXISTS promo_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  youtube_copy TEXT,
  instagram_copy TEXT,
  generic_copy TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- I) Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  artist_name TEXT DEFAULT 'OG BEATZ',
  bio TEXT,
  email TEXT,
  avatar_url TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- J) Todos Table
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- --------------------------------------------------
-- 2. SCHEMATIC PERFORMANCE INDEXES
-- --------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks (bpm);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links (token);
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages (client_id);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_promo_videos_track_id ON promo_videos (track_id);


-- --------------------------------------------------
-- 3. AUTOMATED DB TRIGGERS & FUNCTIONS
-- --------------------------------------------------

-- Function to update client last-active timestamp
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

-- Trigger to record online ping when client sends messages or initiates activities
DROP TRIGGER IF EXISTS trigger_client_message_ping ON messages;
CREATE TRIGGER trigger_client_message_ping
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_client_active_time();

DROP TRIGGER IF EXISTS trigger_client_activity_ping ON activities;
CREATE TRIGGER trigger_client_activity_ping
AFTER INSERT ON activities
FOR EACH ROW EXECUTE FUNCTION update_client_active_time();


-- --------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) & ACCESS CONTROL
-- --------------------------------------------------

-- Disable Row Level Security (RLS) on all tables to ensure unrestricted database sandbox access
ALTER TABLE tracks DISABLE ROW LEVEL SECURITY;
ALTER TABLE playlists DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE share_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE promo_videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE promo_packs DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE todos DISABLE ROW LEVEL SECURITY;

-- Grant massive database-level permissions on public schema to all connected user roles
-- This ensures that 'anon', 'authenticated', and native roles can query and write to any tables.
GRANT ALL ON SCHEMA public TO public, postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO public, postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO public, postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO public, postgres, anon, authenticated, service_role;

-- --------------------------------------------------
-- 4.1. SUPABASE STORAGE BUCKETS & POLICIES SETUP
-- --------------------------------------------------
-- Provision storage buckets for audios, cover arts, and messaging delivery files
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('track-artwork', 'track-artwork', true),
  ('track-audio', 'track-audio', true),
  ('artwork', 'artwork', true),
  ('tracks', 'tracks', true),
  ('deliveries', 'deliveries', true)
ON CONFLICT (id) DO NOTHING;

-- Grant massive access to storage tables for flawless application reads & writes
GRANT ALL ON TABLE storage.buckets TO public, postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE storage.objects TO public, postgres, anon, authenticated, service_role;

-- Associate "Public Direct Access" as backup failsafe policies in case RLS is ever enabled
DO $$
BEGIN
    -- Remove any old limiting policies
    DROP POLICY IF EXISTS "Public Access" ON tracks;
    DROP POLICY IF EXISTS "Public Access" ON playlists;
    DROP POLICY IF EXISTS "Public Access" ON clients;
    DROP POLICY IF EXISTS "Public Access" ON share_links;
    DROP POLICY IF EXISTS "Public Access" ON activities;
    DROP POLICY IF EXISTS "Public Access" ON messages;
    DROP POLICY IF EXISTS "Public Access" ON promo_videos;
    DROP POLICY IF EXISTS "Public Access" ON promo_packs;
    DROP POLICY IF EXISTS "Public Access" ON profiles;
    DROP POLICY IF EXISTS "Public Access" ON todos;

    -- Create new fully-permissive policies for ALL operations and ALL roles
    CREATE POLICY "Public Access" ON tracks FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON playlists FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON clients FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON share_links FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON activities FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON messages FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON promo_videos FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON promo_packs FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON profiles FOR ALL TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public Access" ON todos FOR ALL TO public USING (true) WITH CHECK (true);

    -- Setup fully-permissive storage policies on storage.objects for unrestricted file upload/download
    DROP POLICY IF EXISTS "Public Storage Read" ON storage.objects;
    CREATE POLICY "Public Storage Read" ON storage.objects FOR SELECT TO public USING (true);

    DROP POLICY IF EXISTS "Public Storage Insert" ON storage.objects;
    CREATE POLICY "Public Storage Insert" ON storage.objects FOR INSERT TO public WITH CHECK (true);

    DROP POLICY IF EXISTS "Public Storage Update" ON storage.objects;
    CREATE POLICY "Public Storage Update" ON storage.objects FOR UPDATE TO public USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public Storage Delete" ON storage.objects;
    CREATE POLICY "Public Storage Delete" ON storage.objects FOR DELETE TO public USING (true);
END $$;


-- --------------------------------------------------
-- 5. REALISTIC MASTER SEED DATA (OG BEATZ)
-- --------------------------------------------------

-- Ensure we empty existing seed rows safely to prevent duplicate primary keys
TRUNCATE TABLE todos RESTART IDENTITY CASCADE;
TRUNCATE TABLE profiles RESTART IDENTITY CASCADE;
TRUNCATE TABLE promo_packs RESTART IDENTITY CASCADE;
TRUNCATE TABLE promo_videos RESTART IDENTITY CASCADE;
TRUNCATE TABLE messages RESTART IDENTITY CASCADE;
TRUNCATE TABLE activities RESTART IDENTITY CASCADE;
TRUNCATE TABLE share_links RESTART IDENTITY CASCADE;
TRUNCATE TABLE clients RESTART IDENTITY CASCADE;
TRUNCATE TABLE playlists RESTART IDENTITY CASCADE;
TRUNCATE TABLE tracks RESTART IDENTITY CASCADE;

-- Insert Tracks
INSERT INTO tracks (id, name, artist, duration, bpm, key_signature, file_url, image_url, size, type, plays, likes, tags, status) VALUES
('b3017fc8-0ae5-4ad9-a612-da0eb226d181', 'Midnight Lounge', 'OGBeatz', 145, 82, 'A Minor', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=400', 3625140, 'audio/mpeg', 142, 45, '{"Lofi", "Ambient", "Jazz", "Late Night"}', 'ready'),
('a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc', 'Hyperdrive', 'OGBeatz', 188, 115, 'G Major', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=400', 4725450, 'audio/mpeg', 93, 22, '{"Synthwave", "Retro", "Futuristic", "Fast"}', 'ready'),
('8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41', 'Trap Lord', 'OGBeatz', 165, 140, 'C# Minor', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400', 4125300, 'audio/mpeg', 228, 97, '{"Trap", "Dark", "Hard", "Heavy 808"}', 'ready'),
('2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd', 'Soul Searching', 'OGBeatz', 152, 90, 'F Major', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&q=80&w=400', 3845010, 'audio/mpeg', 85, 34, '{"Boom Bap", "Soulful", "Vocal Chopped", "Classic"}', 'ready'),
('5c5e62f9-2b6d-4912-986c-2f963a7d2b45', 'Cyber City', 'OGBeatz', 174, 120, 'B Minor', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&q=80&w=400', 4381000, 'audio/mpeg', 119, 58, '{"Electronic", "Cyberpunk", "Heavysynth", "Aggressive"}', 'ready');

-- Insert Playlists
INSERT INTO playlists (id, name, description, track_ids, start_color, end_color, image_url) VALUES
('b42fbb1d-8422-4467-8501-c88f11762ebb', 'Lofi & Boom Bap Soul', 'Smooth vintage beats ideal for study sessions, relaxed reading, and vocal write-ups.', '{"b3017fc8-0ae5-4ad9-a612-da0eb226d181", "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd"}', '#3b82f6', '#1d4ed8', 'https://images.unsplash.com/photo-1453090927415-5f45085b65c0?auto=format&fit=crop&q=80&w=400'),
('51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc', 'Trap & Heavy Synthesis', 'Intense heavy-hitting trap music, retro wave, and synth soundtracks.', '{"a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc", "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41", "5c5e62f9-2b6d-4912-986c-2f963a7d2b45"}', '#ec4899', '#f43f5e', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=400');

-- Insert Clients
INSERT INTO clients (id, name, email, phone, avatar_url, company, status, last_active, tags) VALUES
('fa8d30e5-22b6-4acb-8f92-71cbe04663bc', 'Marcus Kane', 'marcus@defjam.com', '+1 (555) 234-5678', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200', 'Def Jam Recordings', 'online', NOW() - INTERVAL '3 minutes', '{"VIP", "A&R", "Major Label"}'),
('e6a4b3d7-89df-4cfa-8123-5d3c88abf41e', 'Clara Vance', 'clara.vance@soundrepublic.io', '+1 (555) 765-4321', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200', 'Sound Republic Publishing', 'away', NOW() - INTERVAL '45 minutes', '{"Publisher", "Sync Agent"}'),
('29b9f71c-3cd7-4eb3-8124-7ef001ab41eb', 'J-Flo Beats', 'jflo@independent.com', NULL, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200', 'Independent Artist', 'offline', NOW() - INTERVAL '1 day', '{"Vocalist", "Songwriter"}');

-- Insert Share Links
INSERT INTO share_links (id, token, track_id, playlist_id, client_id, recipient_email, download_enabled, expires_at, access_count) VALUES
('cb9fbb1d-8152-4467-8fa2-0c9f11652ecc', 'midnight_review_2026', 'b3017fc8-0ae5-4ad9-a612-da0eb226d181', NULL, 'fa8d30e5-22b6-4acb-8f92-71cbe04663bc', 'marcus@defjam.com', true, NOW() + INTERVAL '30 days', 8),
('1bf2fbab-81df-cfa2-ade1-cb9e44ffbfdd', 'lofi_tape_listening', NULL, 'b42fbb1d-8422-4467-8501-c88f11762ebb', 'e6a4b3d7-89df-4cfa-8123-5d3c88abf41e', 'clara.vance@soundrepublic.io', true, NOW() + INTERVAL '10 days', 3),
('92bf6ac2-c9df-1ba4-bd34-90aa44ee88ff', 'experimental_cyber_pack', '5c5e62f9-2b6d-4912-986c-2f963a7d2b45', NULL, NULL, 'music-licensing@netflix.com', false, NULL, 0);

-- Insert Activities
INSERT INTO activities (id, type, track_id, playlist_id, client_id, "user", action, target, details) VALUES
('cc13d7f8-31df-4bca-bd11-ef0db4623fc5', 'play', 'b3017fc8-0ae5-4ad9-a612-da0eb226d181', NULL, 'fa8d30e5-22b6-4acb-8f92-71cbe04663bc', 'Marcus Kane', 'Streamed reference mix', 'Midnight Lounge', 'Listened to 100% of the audio review draft.'),
('f712ac23-1d04-4bda-aee3-bc01f893cdba', 'download', 'b3017fc8-0ae5-4ad9-a612-da0eb226d181', NULL, 'fa8d30e5-22b6-4acb-8f92-71cbe04663bc', 'Marcus Kane', 'Downloaded raw audio file', 'Midnight Lounge', 'Downloaded file (MIME: audio/mpeg, Size: 3.6MB)'),
('23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4', 'play', NULL, 'b42fbb1d-8422-4467-8501-c88f11762ebb', 'e6a4b3d7-89df-4cfa-8123-5d3c88abf41e', 'Clara Vance', 'Streamed reference mix', 'Lofi & Boom Bap Soul', 'Played Soul Searching track inside the tape review portal.');

-- Insert Messages
INSERT INTO messages (id, client_id, content, direction, timestamp, is_read) VALUES
('1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc', 'fa8d30e5-22b6-4acb-8f92-71cbe04663bc', 'Yo OG! Clean mixing on Midnight Lounge. I love the sax loop. Do you have the tracking stems ready?', 'inbound', NOW() - INTERVAL '10 minutes', false),
('88fdcae3-2cd7-42cf-be91-23caefdf01ab', 'fa8d30e5-22b6-4acb-8f92-71cbe04663bc', 'Thanks Marcus! Stems are completely consolidated. I can upload them into your secure link right now.', 'outbound', NOW() - INTERVAL '8 minutes', true);

-- Insert Promo Videos
INSERT INTO promo_videos (id, track_id, playlist_id, video_url, thumbnail_url, style, status) VALUES
('bc1dfe8d-d9ff-411a-b0df-cf17faefdd11', '8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41', NULL, 'https://assets.mixkit.co/videos/preview/mixkit-waveform-of-music-audio-visualizer-background-41485-large.mp4', 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?auto=format&fit=crop&q=80&w=400', 'Cyberpunk Neon Visualizer', 'ready'),
('df1dafd1-bbd9-cfa1-aee2-cb02fa2be18d', '5c5e62f9-2b6d-4912-986c-2f963a7d2b45', NULL, 'https://assets.mixkit.co/videos/preview/mixkit-retro-futurism-car-ride-loop-42861-large.mp4', 'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&q=80&w=400', 'Retro Wave Drive loop', 'ready');

-- Insert Promo Social Copy Packs
INSERT INTO promo_packs (id, track_id, youtube_copy, instagram_copy, generic_copy) VALUES
('cc1dfbbd-d23f-42ae-beef-ec12dfae7bcd', '8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41', 
 '🔥 Dark Trap Beat Store - "Trap Lord" | Heavy 808 & Dark Synth (Prod. OGBeatz)
  Purchase stems or leasing licenses link in bio! Like, Comment, and Subscribe for more high-quality beats.', 
 '#trapbeat #darktrap #hiphopproduction #metroboomin #808bass #typebeat #flstudio #producercommunity', 
 'Hey man, I just finalized a heavy dark trap instrumental named "Trap Lord". Major dark energy vibe, heavy 808s. Check the stems at OG BEATZ portal if you think it fits Clara or Marcus! All ready for licensing.');

-- Insert Profiles
INSERT INTO profiles (id, name, artist_name, bio, email, avatar_url, social_links) VALUES
('cb9fba24-8141-cfa3-bdf2-cd9e11fcbcba', 'OG BEATZ Admin', 'OG BEATZ', 'Multi-platinum platinum-grade sound producer, mixing engineer, and audio director. Author of modern catalog beat tape reviews.', 'cdtfullsail@gmail.com', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=450', '{"instagram": "https://instagram.com/ogbeatz", "spotify": "https://open.spotify.com/artist/ogbeatz", "twitter": "https://twitter.com/ogbeatz"}');

-- Insert Todos
INSERT INTO todos (id, title, completed) VALUES
('b3abfa99-b1d9-cfa2-be12-9021eebbcf2b', 'Mix the low-end frequencies on Midnight Lounge Saxon tracks', false),
('cf12cbdb-2fdf-aef1-abdd-be01faefbbcc', 'Export high-quality WAV tracks stems for Marcus DefJam review', false),
('92bfbbaa-ade1-cb88-eb21-cb9efae9ffbf', 'Resolve audio compression issue inside Cyber City visualizer', true);

-- Verification Check
SELECT count(*) AS tracks_count FROM tracks;
SELECT count(*) AS clients_count FROM clients;
