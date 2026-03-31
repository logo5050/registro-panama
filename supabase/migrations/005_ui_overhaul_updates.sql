-- Migration 005: UI Overhaul Updates
-- This migration aligns the schema with the new "Registro Panamá" requirements.

-- 1. Update business_status enum (mapping existing to new labels)
-- We'll add the new values first
ALTER TYPE business_status ADD VALUE IF NOT EXISTS 'Limpio';
ALTER TYPE business_status ADD VALUE IF NOT EXISTS 'Bajo Observación';
ALTER TYPE business_status ADD VALUE IF NOT EXISTS 'En Vigilancia';
ALTER TYPE business_status ADD VALUE IF NOT EXISTS 'Sancionada';

-- 2. Update existing businesses to use new status labels
UPDATE businesses SET status = 'En Vigilancia' WHERE status = 'watchlist';
UPDATE businesses SET status = 'Limpio' WHERE status = 'verified';
UPDATE businesses SET status = 'Limpio' WHERE status = 'geo_glass_client'; -- Defaulting clients to clean for now

-- 3. Enhance multimedia_reports table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_source') THEN
        CREATE TYPE report_source AS ENUM ('Web', 'WhatsApp', 'Instagram');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type') THEN
        CREATE TYPE report_type AS ENUM ('Práctica Comercial Injusta', 'Falla de Servicio Grave');
    END IF;
END $$;

ALTER TABLE multimedia_reports 
ADD COLUMN IF NOT EXISTS report_type report_type,
ADD COLUMN IF NOT EXISTS source report_source DEFAULT 'Web',
ADD COLUMN IF NOT EXISTS entity_name_manual TEXT;

-- 4. Update events table for new categories if needed
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'RESOLUCIÓN JUDICIAL';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'REPORTE CIUDADANO';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'INFRACCIÓN ACODECO';

-- 5. Ensure storage bucket for evidence exists (from migration 003, but double check)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('complaints-evidence', 'complaints-evidence', true)
ON CONFLICT (id) DO NOTHING;
