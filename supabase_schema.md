# OG BEATZ — Database Schematic & Setup Manual

This handbook details the complete PostgreSQL database schematic, table dictionary, security policies, and step-by-step onboarding guidelines designed for **OG BEATZ**. Use this model with **Supabase** or any **PostgreSQL** cloud server.

---

## 1. Relational Database Architecture

```
                       ┌──────────────┐
                       │   profiles   │
                       └──────────────┘
                       ┌──────────────┐
                       │    todos     │
                       └──────────────┘

  ┌────────────────────────────────────────────────────────┐
  │                      activities                        │
  └────┬──────────────────────┬──────────────────────┬─────┘
       │ (References)         │ (References)         │ (References)
       ▼                      ▼                      ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   tracks     │ ◄─────┤  share_links ├──────►│   clients    │
└──────┬───────┘       └──┬───────────┘       └──────┬───────
       │                  │                          │
       │ (References)     │ (References)             │ (References)
       ▼                  ▼                          ▼
┌──────────────┐   ┌──────────────┐           ┌──────────────┐
│ promo_videos │   │  playlists   │           │   messages   │
└──────────────┘   └──────────────┘           └──────────────┘
┌──────────────┐
│ promo_packs  │
└──────────────┘
```

---

## 2. Comprehensive Table Data-Dictionary

### A) `tracks`
Main catalog mapping metadata and audio resources for beat drafts, samples, and reference mix audio files.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Unique row identifier. |
| `name` | `TEXT` | *None* | `NOT NULL` | Audio track name. |
| `artist` | `TEXT` | `'OGBeatz'` | `NOT NULL` | Artist credit label. |
| `duration` | `INTEGER` | `0` | `NOT NULL` | Length in seconds. |
| `bpm` | `INTEGER` | `120` | `NOT NULL` | Beats Per Minute speed. |
| `key_signature` | `TEXT` | `'C Major'` | `NOT NULL` | Musical harmonic scale signature key. |
| `file_url` | `TEXT` | `NULL` | | Secured source URL of the mp3/wav audio file. |
| `image_url` | `TEXT` | `NULL` | | Track visual artwork cover image URL. |
| `size` | `BIGINT` | `0` | `NOT NULL` | Audio file footprint in bytes. |
| `type` | `TEXT` | `'audio/mpeg'` | `NOT NULL` | File MIME Type (e.g. `audio/wav`). |
| `plays` | `INTEGER` | `0` | `NOT NULL` | Play metric counter. |
| `likes` | `INTEGER` | `0` | `NOT NULL` | Likes metric counter. |
| `tags` | `TEXT[]` | `'{}'` | | Search descriptors or style classification list. |
| `lyrics` | `TEXT` | `NULL` | | Embedded textual lyrics, transcriptions, or song notes. |
| `status` | `TEXT` | `'processing'` | `CHECK IN ('ready', 'processing', 'error')` | Streaming transcoder processing status. |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Timestamp when metadata row was made. |

---

### B) `playlists`
Collections grouping list of tracks meant for collective beat-tape listening portfolios.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Unique ID. |
| `name` | `TEXT` | *None* | `NOT NULL` | Title of the playlist tape. |
| `description`| `TEXT` | `NULL` | | Concept info details markdown card description. |
| `track_ids` | `UUID[]` | `'{}'` | | Set of ordered foreign key tracks identifiers. |
| `start_color`| `TEXT` | `'#f97316'` | | Theme hex color start. |
| `end_color` | `TEXT` | `'#ea580c'` | | Theme hex color end. |
| `image_url` | `TEXT` | `NULL` | | Main catalog card artwork thumbnail link. |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Timestamp when compilation tape was created. |

---

### C) `clients`
Artists, legal managers, label executives, or reviewers authorized to stream and review audio files.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Unique identifier. |
| `name` | `TEXT` | *None* | `NOT NULL` | Display/Legal name of representative client. |
| `email` | `TEXT` | *None* | `UNIQUE NOT NULL`| Verified communication contact email address. |
| `phone` | `TEXT` | `NULL` | | Phone verification number (SMS compatible). |
| `avatar_url` | `TEXT` | `NULL` | | Stylized thumbnail icon visual image link. |
| `company` | `TEXT` | `NULL` | | Music label imprint/publishing company affiliate. |
| `status` | `TEXT` | `'offline'` | `CHECK IN ('online', 'offline', 'away')` | Real-time active status signal state. |
| `last_active`| `TIMESTAMPTZ`| `NOW()` | | Timestamp of last recorded database touch points. |
| `tags` | `TEXT[]` | `'{}'` | | Label groupings (e.g., VIP, Indie). |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Record setup timestamp. |

---

### E) `share_links`
Secure link access tokens that resolve custom track lists or playlists for particular review clients.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Unique primary key. |
| `token` | `TEXT` | *None* | `UNIQUE NOT NULL`| Cryptographically clean hash token string in URL. |
| `track_id` | `UUID` | `NULL` | `REFERENCES tracks(id) ON DELETE CASCADE` | Link to single review track (if set). |
| `playlist_id`| `UUID` | `NULL` | `REFERENCES playlists(id) ON DELETE CASCADE` | Link to beat-tape compilation playlist (if set). |
| `client_id` | `UUID` | `NULL` | `REFERENCES clients(id) ON DELETE CASCADE` | The designated client allowed access. |
| `recipient_email`| `TEXT`| `NULL` | | Alternative backup target email placeholder. |
| `download_enabled`| `BOOLEAN`| `true` | | If true, user can download source WAV/MP3 files. |
| `expires_at` | `TIMESTAMPTZ`| `NULL` | ... | Configured expiration. After this date, URL is disabled. |
| `access_count`| `INTEGER` | `0` | | Dynamic counter increments every loader trigger. |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Link creation date. |

---

### F) `activities`
Continuous system metric log recording client actions, streams, pings, and downloads.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Telemetry event entry tracking row. |
| `type` | `TEXT` | *None* | `NOT NULL` | Metric type: `play`, `download`, `share`, `message`. |
| `track_id` | `UUID` | `NULL` | `REFERENCES tracks(id) ON DELETE SET NULL` | Reference target track row identifier. |
| `playlist_id`| `UUID` | `NULL` | `REFERENCES playlists(id) ON DELETE SET NULL` | Reference target playlist compilation ID. |
| `client_id` | `UUID` | `NULL` | `REFERENCES clients(id) ON DELETE SET NULL` | Reference caller client ID (null if unauthenticated). |
| `user` | `TEXT` | `'Anonymous'` | | Human label identifier. |
| `action` | `TEXT` | `NULL` | | Clear text explanation of the action. |
| `target` | `TEXT` | `NULL` | | Reference name/key indicating target of action. |
| `details` | `TEXT` | `NULL` | | Additional tech contextual information. |
| `timestamp` | `TIMESTAMPTZ`| `NOW()` | | Precise event occurrence timestamp. |

---

### G) `messages`
Review collaboration chat, serving comments, requests, and structural notes on track frames.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Unique message tracking identification key. |
| `client_id` | `UUID` | `NULL` | `REFERENCES clients(id) ON DELETE CASCADE`| Connection mapping to designated client profile. |
| `recipient_id`| `TEXT`| `NULL` | | Recipient scope ID. |
| `content` | `TEXT` | *None* | `NOT NULL` | Communication message body. |
| `image_url` | `TEXT` | `NULL` | | Screenshot link attachments or graphic elements. |
| `direction` | `TEXT` | *None* | `CHECK IN ('inbound', 'outbound')` | Inbound (from client) vs. Outbound (from producer). |
| `timestamp` | `TIMESTAMPTZ`| `NOW()` | | Dispatch event timing timestamp. |
| `is_read` | `BOOLEAN` | `false` | | Message read receipt indicator. |

---

### H) `promo_videos`
Social-media promotional files generated from catalog audio components.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Video asset key identifier. |
| `track_id` | `UUID` | `NULL` | `REFERENCES tracks(id) ON DELETE CASCADE`| Source audio reference track. |
| `playlist_id`| `UUID` | `NULL` | `REFERENCES playlists(id) ON DELETE CASCADE`| Source compilations tape. |
| `video_url` | `TEXT` | *None* | `NOT NULL` | Visual final video payload storage URL. |
| `thumbnail_url`| `TEXT` | `NULL`| | Visual thumbnail cover poster image URL. |
| `style` | `TEXT` | *None* | `NOT NULL` | Video visual rendering theme (e.g. Cyberwave). |
| `status` | `TEXT` | `'processing'` | `CHECK IN ('processing', 'ready', 'error')` | Visual rendering worker node process status. |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Visual build start date. |
| `video_data` | `JSONB` | `'{}'::jsonb` | | Dynamic options (resolution, layers, fonts). |
| `thumbnail_data`| `JSONB`| `'{}'::jsonb` | | Static coordinate points. |

---

### I) `promo_packs`
AI-generated social-media copy templates and promotional hashtags for multi-channel posts.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Unique row key. |
| `track_id` | `UUID` | `NULL` | `REFERENCES tracks(id) ON DELETE CASCADE`| Source track reference. |
| `youtube_copy`| `TEXT` | `NULL` | | Ready description for YouTube beats promotion. |
| `instagram_copy`| `TEXT`| `NULL` | | Ready copy and curated tags for Instagram posts. |
| `generic_copy`| `TEXT` | `NULL` | | Pitch templates meant for direct agent outreach emails. |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Creation date. |

---

### J) `profiles`
The primary administration configuration storing producer credentials, billing info, and custom brand profiles.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Admin user profile record key. |
| `name` | `TEXT` | `NULL` | | Administrative legal name. |
| `artist_name`| `TEXT` | `'OG BEATZ'` | | Producer imprint/studio signature. |
| `bio` | `TEXT` | `NULL` | | Studio bio / background credentials pitch. |
| `email` | `TEXT` | `NULL` | | Direct administrative contact email. |
| `avatar_url` | `TEXT` | `NULL` | | Profiling image poster thumbnail. |
| `social_links`| `JSONB` | `'{}'::jsonb` | | JSON mapping for Twitter, Spotify, Instagram handles. |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Administrative profile setup date. |

---

### K) `todos`
Interactive checklist, listing review task notes and studio engineering adjustments.

| Column | PG Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `uuid_generate_v4()` | `PRIMARY KEY` | Checklist task entry identifier. |
| `title` | `TEXT` | *None* | `NOT NULL` | Description of action steps required. |
| `completed` | `BOOLEAN` | `false`| | Task resolution checked status index. |
| `created_at` | `TIMESTAMPTZ`| `NOW()` | | Checklist item entry date. |

---

## 2.1. Supabase Storage Buckets Setup

To allow the application to upload and stream media assets, two public storage buckets are automatically provisioned in the schema:

| Bucket ID | Access Level | Description |
| :--- | :--- | :--- |
| `track-artwork` | **Public** | Artwork images and covers for tracks and playlists. |
| `track-audio` | **Public** | MP3 or WAV audio stream files for catalog listen reviews. |

### Storage Security Policies
By default, Row Level Security is configured with fully-permissive public policies on `storage.objects` inside these buckets to guarantee frictionless uploads, updates, reading, and deletion:
1. **SELECT**: Anyone can fetch and stream audio/artwork files (`USING (true)`).
2. **INSERT**: Anyone can upload new assets (`WITH CHECK (true)`).
3. **UPDATE**: Anyone can update existing assets (`USING (true) WITH CHECK (true)`).
4. **DELETE**: Anyone can clean up inactive assets (`USING (true)`).

---

## 3. Step-by-Step Onboarding Setup Map

Configure this database on a live **Supabase** instance or standard **PostgreSQL** instance:

### Step 1: Open Supabase Project Database
1. Go to your [Supabase Dashboard](https://supabase.com).
2. Create or select a project (e.g., **OG BEATZ**).
3. Select **SQL Editor** on the left-hand navigation sidebar menu.

### Step 2: Paste and Execute Setup SQL
1. Open the file [`/supabase_schema.sql`](./supabase_schema.sql) in this workspace.
2. Select and copy its entire contents.
3. Paste the code into the Supabase SQL editor workspace.
4. Click **Run** on the lower right to compile the tables, triggers, indexes, and full seed portfolios.

### Step 3: Link Client Environment Variables
Copy your public API authentication parameters into your frontend workspace `.env` configuration file:

```env
# Create .env or update existing configurations in the application root directory
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-client-safe-public-anon-key-here
```

---

## 4. Advanced Automation Mechanisms

### Database Triggers for Active Tracking
Our schema binds an automated PostgreSQL trigger to monitor message transmissions and telemetry streams. When a client initiates database logs via `activities` or submits review annotations via `messages`, the system executes:

```sql
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
```

This automated trigger keeps track of active user engagement seamlessly on the server side, ensuring real-time dashboard indicators are consistently accurate without requiring redundant web client requests.
