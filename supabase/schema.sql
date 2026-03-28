-- =============================================================
-- Registro Panamá — Database Schema v2
-- Public business registry for AI platform discoverability
-- =============================================================

-- 1. Enums
CREATE TYPE business_status AS ENUM ('verified', 'watchlist', 'geo_glass_client');
CREATE TYPE event_type AS ENUM (
  'acodeco_infraction',
  'court_ruling',
  'geo_audit_passed',
  'news_mention',
  'license_granted',
  'license_revoked',
  'ownership_change',
  'sanction'
);

-- 2. Businesses Table (enriched)
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT,
    status business_status DEFAULT 'watchlist',

    -- Panama-specific identifiers
    ruc TEXT,                          -- Registro Único de Contribuyente (tax ID)
    dv TEXT,                           -- Dígito Verificador
    registro_publico TEXT,             -- Public Registry number

    -- Location
    province TEXT,                     -- e.g. 'Panamá', 'Chiriquí', 'Coclé'
    district TEXT,
    corregimiento TEXT,

    -- Business details
    industry TEXT,                     -- CIIU industry code or label
    founded_year INTEGER,
    employee_range TEXT,               -- e.g. '1-10', '11-50', '51-200', '200+'
    phone TEXT,
    email TEXT,
    website TEXT,

    -- Descriptions (bilingual)
    description_es TEXT,
    description_en TEXT,

    -- Metadata
    source_url TEXT,                   -- Where we first found this business
    last_scraped_at TIMESTAMPTZ,      -- Last time data was refreshed
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Events Table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    event_type event_type NOT NULL,
    event_date DATE DEFAULT CURRENT_DATE,
    source_url TEXT NOT NULL,
    summary_es TEXT NOT NULL,
    summary_en TEXT NOT NULL,
    raw_data JSONB,                   -- Original scraped data for audit trail
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Prevent duplicate events
    UNIQUE(business_id, event_type, source_url)
);

-- 4. Scrape Logs (track automation runs)
CREATE TABLE scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,             -- e.g. 'acodeco', 'judiciary', 'news'
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
    records_found INTEGER DEFAULT 0,
    records_ingested INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- 5. Indexes for performance
CREATE INDEX idx_businesses_slug ON businesses(slug);
CREATE INDEX idx_businesses_province ON businesses(province);
CREATE INDEX idx_businesses_category ON businesses(category);
CREATE INDEX idx_businesses_status ON businesses(status);
CREATE INDEX idx_businesses_ruc ON businesses(ruc);
CREATE INDEX idx_events_business_id ON events(business_id);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_event_date ON events(event_date DESC);
CREATE INDEX idx_scrape_logs_source ON scrape_logs(source);

-- 6. RLS Policies (Security)
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- Public Read Access (for SSR/SEO/AI crawlers)
CREATE POLICY "Public Read Businesses" ON businesses FOR SELECT USING (true);
CREATE POLICY "Public Read Events" ON events FOR SELECT USING (true);
CREATE POLICY "Public Read Scrape Logs" ON scrape_logs FOR SELECT USING (true);

-- Service Role Write Access (for scrapers/API)
CREATE POLICY "Service Insert Businesses" ON businesses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY "Service Update Businesses" ON businesses FOR UPDATE
  USING (auth.role() = 'service_role');
CREATE POLICY "Service Insert Events" ON events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY "Service Insert Scrape Logs" ON scrape_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service Update Scrape Logs" ON scrape_logs FOR UPDATE
  USING (auth.role() = 'service_role');

-- 7. Auto-update updated_at on businesses
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
