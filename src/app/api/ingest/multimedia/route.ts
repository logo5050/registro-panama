import { supabaseAdmin } from '@/lib/supabase';
import { extractBusinessName, generatePublicSummary, generateReviewJsonLd } from '@/lib/ai';
import { NextResponse } from 'next/server';

/**
 * Multimedia Ingestion API
 * Objective: Frictionless, conversational reporting via WhatsApp/Instagram.
 * 
 * Flow:
 * 1. Receive multimedia report (social handle, complaint text, evidence URLs).
 * 2. AI Entity Resolution: Use Claude to extract business name from text.
 * 3. AI Public Summary: Generate a neutral, safe summary.
 * 4. Data Vault: Move raw evidence to private_data.
 * 5. SEO: Generate JSON-LD for discoverability.
 * 6. Store with 'pending' status for moderation.
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      social_handle, 
      complaint_text, 
      evidence_urls, 
      metadata 
    } = body;

    // --- Validation ---
    if (!complaint_text && (!evidence_urls || evidence_urls.length === 0)) {
      return NextResponse.json({ 
        error: 'Missing report content. Provide text or evidence URLs.' 
      }, { status: 400 });
    }

    // --- 1. AI Business Resolution ---
    let extractedBusinessName = await extractBusinessName(complaint_text || '');
    let business_id = null;

    if (extractedBusinessName) {
      const { data: business } = await supabaseAdmin
        .from('businesses')
        .select('id, name')
        .ilike('name', `%${extractedBusinessName}%`)
        .limit(1)
        .single();
      
      if (business) {
        business_id = business.id;
        extractedBusinessName = business.name; // Use official name if found
      }
    }

    // --- 2. AI Public Summary ---
    const public_summary = await generatePublicSummary(complaint_text || 'Reporte de evidencia multimedia.');

    // --- 3. Data Vault (Privacy) ---
    const private_data = {
      raw_complaint: complaint_text,
      raw_evidence_urls: evidence_urls || [],
      social_handle,
      metadata: metadata || {},
      ocr_data: {}, // Future vision processing
      timestamp: new Date().toISOString()
    };

    // --- 4. SEO & JSON-LD ---
    const jsonLd = generateReviewJsonLd(
      extractedBusinessName || 'Empresa por identificar',
      public_summary,
      new Date().toISOString()
    );

    // --- 5. Precedent Calculation (Lead Scoring) ---
    const { data: similarEvents } = await supabaseAdmin
      .from('events')
      .select('id')
      .textSearch('summary_es', complaint_text || '', {
        type: 'websearch',
        config: 'spanish'
      })
      .limit(5);

    const precedentCount = similarEvents?.length || 0;
    const lead_score = (precedentCount > 0 ? 0.5 : 0.1) + (evidence_urls?.length > 0 ? 0.4 : 0);

    // --- 6. Database Storage ---
    const { data: report, error: insertError } = await supabaseAdmin
      .from('multimedia_reports')
      .insert({
        business_id,
        entity_name_manual: !business_id ? extractedBusinessName : null,
        social_handle,
        complaint_text, // Kept for audit, but not shown publicly
        evidence_urls: evidence_urls || [],
        public_summary,
        private_data,
        lead_score,
        status: 'pending' // Ready for Moderation Dashboard
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting multimedia report:', insertError);
      throw insertError;
    }

    // --- 7. Final Response ---
    return NextResponse.json({
      success: true,
      report_id: report.id,
      public_summary,
      jsonLd,
      message: `Reporte recibido y enviado a moderación.`
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Multimedia Ingestion API Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
