import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// Valid event types — must match the database enum
const VALID_EVENT_TYPES = [
  'acodeco_infraction',
  'court_ruling',
  'geo_audit_passed',
  'news_mention',
  'license_granted',
  'license_revoked',
  'ownership_change',
  'sanction',
  // New data sources (2026)
  'asep_resolution',       // ASEP telecom/electricity/water rulings
  'sbp_sanction',          // Superintendencia de Bancos sanctions
  'acodeco_open_data',     // ACODECO datasets from datosabiertos.gob.pa
] as const;

type EventType = typeof VALID_EVENT_TYPES[number];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, ''); // trim leading/trailing hyphens
}

export async function POST(req: Request) {
  // --- Auth ---
  const authHeader = req.headers.get('Authorization');
  const secret = process.env.INGEST_SECRET;

  // Fail-closed: reject if secret is missing, too short, or doesn't match
  if (!secret || secret.length < 16) {
    console.error('INGEST_SECRET is not configured or too short (min 16 chars)');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      name,
      category,
      event_type,
      event_date,
      source_url,
      summary_es,
      summary_en,
      description_es,
      description_en,
      // New enriched fields
      business_data,
      raw_data,
    } = body;

    // --- Validation ---
    if (!name || !event_type || !source_url) {
      return NextResponse.json({
        error: 'Missing required fields: name, event_type, source_url',
      }, { status: 400 });
    }

    if (!VALID_EVENT_TYPES.includes(event_type as EventType)) {
      return NextResponse.json({
        error: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
      }, { status: 400 });
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({
        error: 'Business name must be at least 2 characters',
      }, { status: 400 });
    }

    const slug = generateSlug(name.trim());
    if (!slug) {
      return NextResponse.json({
        error: 'Could not generate a valid slug from the business name',
      }, { status: 400 });
    }

    // --- Upsert Business ---
    const businessRecord: Record<string, unknown> = {
      name: name.trim(),
      slug,
      category: category || null,
      description_es: description_es || null,
      description_en: description_en || null,
    };

    // Merge any extra business fields (ruc, province, etc.)
    if (business_data && typeof business_data === 'object') {
      const allowedFields = [
        'ruc', 'dv', 'registro_publico', 'province', 'district',
        'corregimiento', 'industry', 'founded_year', 'employee_range',
        'phone', 'email', 'website', 'source_url',
      ];
      for (const field of allowedFields) {
        if (business_data[field] !== undefined && business_data[field] !== null) {
          businessRecord[field] = business_data[field];
        }
      }
    }

    // Update scrape timestamp
    businessRecord.last_scraped_at = new Date().toISOString();

    const { data: business, error: bError } = await supabaseAdmin
      .from('businesses')
      .upsert(businessRecord, { onConflict: 'slug' })
      .select()
      .single();

    if (bError) {
      console.error('Business Upsert Error:', bError);
      throw bError;
    }

    // --- Insert Event (with duplicate prevention) ---
    const { error: eError } = await supabaseAdmin
      .from('events')
      .upsert(
        {
          business_id: business.id,
          event_type,
          event_date: event_date || new Date().toISOString().split('T')[0],
          source_url,
          summary_es: summary_es || `Evento registrado: ${name}`,
          summary_en: summary_en || `Event recorded: ${name}`,
          raw_data: raw_data || null,
        },
        { onConflict: 'business_id,event_type,source_url' }
      );

    if (eError) {
      console.error('Event Upsert Error:', eError);
      throw eError;
    }

    return NextResponse.json({
      success: true,
      message: 'Business event ingested successfully',
      slug,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Ingestion API Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
