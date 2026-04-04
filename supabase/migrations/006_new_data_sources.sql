-- Migration 006: Add new data source event types and update enum
-- Sources: ASEP (utilities), SBP (banking), ACODECO Open Data (CSV datasets)

-- Add new event types to the enum
-- Note: Supabase enums can be extended with ALTER TYPE ... ADD VALUE
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'asep_resolution';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'sbp_sanction';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'acodeco_open_data';

-- Add sector field to events for cross-source categorization
ALTER TABLE events ADD COLUMN IF NOT EXISTS sector TEXT;

-- Index on sector for filtered queries
CREATE INDEX IF NOT EXISTS idx_events_sector ON events (sector);

-- Add scrape source tracking
ALTER TABLE scrape_logs ADD COLUMN IF NOT EXISTS scraper_version TEXT;

-- Insert new valid sources for scrape_logs
COMMENT ON TABLE scrape_logs IS 'Tracks automation runs. Sources: acodeco, judiciary, news, asep, sbp, datos_abiertos';
