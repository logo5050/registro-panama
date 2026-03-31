-- Migration 004: Phase 2 Premium Engine & 80/20 Open Data Model
-- This migration evolves the multimedia_reports table and adds lawyer infrastructure.

-- 1. Evolve multimedia_reports for the 80/20 model
ALTER TABLE multimedia_reports 
ADD COLUMN IF NOT EXISTS public_summary TEXT,           -- 80% public data
ADD COLUMN IF NOT EXISTS private_data JSONB DEFAULT '{}', -- 20% raw evidence/PII
ADD COLUMN IF NOT EXISTS premium_report JSONB DEFAULT '{}', -- Unlocked B2C content
ADD COLUMN IF NOT EXISTS lead_score DECIMAL DEFAULT 0;   -- B2B lead valuation

-- 2. Create Lawyer Profiles table
-- Note: user_id references auth.users which is standard in Supabase
CREATE TABLE IF NOT EXISTS lawyer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    id_number TEXT UNIQUE NOT NULL, -- Cédula de identidad personal
    bar_number TEXT UNIQUE NOT NULL, -- Certificado de Idoneidad
    verified BOOLEAN DEFAULT false,
    specialties TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Report Purchases table (Stripe integration)
CREATE TABLE IF NOT EXISTS report_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- User who bought (optional)
    report_id UUID REFERENCES multimedia_reports(id) ON DELETE CASCADE,
    purchase_type TEXT CHECK (purchase_type IN ('b2c_audit', 'b2b_lead')),
    stripe_session_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE lawyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_purchases ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Lawyer Profiles
CREATE POLICY "Public Read Verified Lawyers" ON lawyer_profiles 
  FOR SELECT USING (verified = true);

CREATE POLICY "Lawyers Manage Own Profile" ON lawyer_profiles
  USING (auth.uid() = user_id);

-- 6. RLS Policies for Purchases
CREATE POLICY "Users View Own Purchases" ON report_purchases
  FOR SELECT USING (auth.uid() = user_id);

-- 7. Advanced RLS for multimedia_reports (Private Data Protection)
-- The public can see the record, but we'll use conditional logic in the API/View
-- for private_data and premium_report fields.
DROP POLICY IF EXISTS "Public Read Multimedia Reports" ON multimedia_reports;
CREATE POLICY "Public Read Multimedia Reports Summary" ON multimedia_reports
  FOR SELECT USING (true);

-- 8. Trigger for updated_at on lawyer_profiles
CREATE TRIGGER lawyer_profiles_updated_at
  BEFORE UPDATE ON lawyer_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 9. Indexing for Lead Search
CREATE INDEX IF NOT EXISTS idx_multimedia_reports_lead_score ON multimedia_reports(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_lawyer_profiles_verified ON lawyer_profiles(verified);
