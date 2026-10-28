-- M15 — Scrape progress table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS scrape_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword             TEXT NOT NULL,
  category_id         BIGINT NOT NULL,
  type_id             BIGINT NOT NULL,
  last_page           INTEGER DEFAULT 0,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (keyword, category_id, type_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_scrape_progress_context 
ON scrape_progress (keyword, category_id, type_id);
