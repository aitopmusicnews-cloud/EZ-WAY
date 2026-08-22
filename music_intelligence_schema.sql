-- EZ-WAY Music Intelligence canonical per-track analysis store.
-- Run this in the same Supabase project as the existing tracks table.

CREATE TABLE IF NOT EXISTS track_analysis (
  track_id UUID PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  analyzer_version TEXT NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'error')) DEFAULT 'processing',
  error TEXT,
  source_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_track_analysis_status
  ON track_analysis(status);

CREATE INDEX IF NOT EXISTS idx_track_analysis_version
  ON track_analysis(analyzer_version);

-- Keep the same permissive policy posture as the current EZ-WAY schema.
ALTER TABLE track_analysis DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE track_analysis TO public, postgres, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public Access" ON track_analysis;
CREATE POLICY "Public Access" ON track_analysis
  FOR ALL TO public USING (true) WITH CHECK (true);
