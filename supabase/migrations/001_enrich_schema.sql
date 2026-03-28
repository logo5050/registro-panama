-- Migration 001: Enrich schema for automation + GEO Glass integration
-- Run this against your existing Supabase database

-- 1. Add new event types
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'license_granted';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'license_revoked';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'ownership_change';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'sanction';

-- 2. Add new columns to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ruc TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS dv TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS registro_publico TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS corregimiento TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS employee_range TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;

-- 3. Add raw_data to events for audit trail
ALTER TABLE events ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- 4. Add unique constraint for duplicate prevention (ignore if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_business_id_event_type_source_url_key'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_business_id_event_type_source_url_key
      UNIQUE(business_id, event_type, source_url);
  END IF;
END $$;

-- 5. Create scrape_logs table
CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    records_found INTEGER DEFAULT 0,
    records_ingested INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- 6. Add indexes
CREATE INDEX IF NOT EXISTS idx_businesses_province ON businesses(province);
CREATE INDEX IF NOT EXISTS idx_businesses_ruc ON businesses(ruc);
CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_source ON scrape_logs(source);

-- 7. RLS for scrape_logs
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Scrape Logs" ON scrape_logs FOR SELECT USING (true);
CREATE POLICY "Service Insert Scrape Logs" ON scrape_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service Update Scrape Logs" ON scrape_logs FOR UPDATE
  USING (auth.role() = 'service_role');

-- 8. Service Role Update policy for businesses (scrapers need to update)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service Update Businesses' AND tablename = 'businesses'
  ) THEN
    CREATE POLICY "Service Update Businesses" ON businesses FOR UPDATE
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- 9. Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS businesses_updated_at ON businesses;
CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
