-- Migration 003: Multimedia Reports & Storage for Consumer Intelligence
-- This migration adds the infrastructure for frictionless, conversational reporting.

-- 1. Create the multimedia_reports table
CREATE TABLE IF NOT EXISTS multimedia_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    social_handle TEXT,                -- Instagram/WhatsApp handle
    complaint_text TEXT,               -- Original message or user-provided text
    transcription TEXT,                -- AI Transcription (Whisper) of audio/video
    evidence_urls TEXT[] DEFAULT '{}', -- Array of Supabase Storage links
    ai_legal_assessment JSONB,        -- AI output: probability, similar cases, Law 45 context
    status TEXT DEFAULT 'pending',     -- pending, processed, failed, reviewed
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE multimedia_reports ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for multimedia_reports
-- Allow public (anonymous) to submit complaints
CREATE POLICY "Public Insert Multimedia Reports" ON multimedia_reports FOR INSERT
  WITH CHECK (true);

-- Allow public to read reports (for the business detail page)
CREATE POLICY "Public Read Multimedia Reports" ON multimedia_reports FOR SELECT
  USING (true);

-- Service Role has full access for processing
CREATE POLICY "Service Full Access Multimedia Reports" ON multimedia_reports
  USING (auth.role() = 'service_role');

-- 4. Storage Bucket for Evidence
-- Note: This requires the storage schema to exist (default in Supabase)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('complaints-evidence', 'complaints-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS Policies
-- Allow public upload to the evidence bucket
CREATE POLICY "Public Upload Evidence" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'complaints-evidence');

-- Allow public to view evidence
CREATE POLICY "Public Read Evidence" ON storage.objects FOR SELECT
  USING (bucket_id = 'complaints-evidence');

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_multimedia_reports_business_id ON multimedia_reports(business_id);
CREATE INDEX IF NOT EXISTS idx_multimedia_reports_status ON multimedia_reports(status);
CREATE INDEX IF NOT EXISTS idx_multimedia_reports_created_at ON multimedia_reports(created_at DESC);

-- 7. Auto-update updated_at trigger
CREATE TRIGGER multimedia_reports_updated_at
  BEFORE UPDATE ON multimedia_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
