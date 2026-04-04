import { supabaseAdmin } from '@/lib/supabase';
import { identifyLaw45Violations, draftDemandLetter } from '@/lib/ai';
import { NextRequest, NextResponse } from 'next/server';

/* ─── Constants ─── */
const AUDIT_SECRET = process.env.INGEST_SECRET; // reuse the same server secret for now

/**
 * POST /api/reports/audit
 *
 * AI Audit Service — matches a consumer complaint with Law 45 precedents
 * and drafts a demand letter.
 *
 * Protected: requires Bearer token (same INGEST_SECRET used by scrapers).
 * In production this would be triggered AFTER Stripe payment confirmation
 * via a webhook, not called directly by the client.
 */
export async function POST(req: NextRequest) {
  try {
    // ─── Auth: Bearer token required ───
    const authHeader = req.headers.get('authorization');
    if (!AUDIT_SECRET || AUDIT_SECRET.length < 16) {
      console.error('INGEST_SECRET is not configured or too short');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    if (!authHeader || authHeader !== `Bearer ${AUDIT_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const reportId: string | undefined = body.report_id;

    if (!reportId || typeof reportId !== 'string') {
      return NextResponse.json({ error: 'Missing report_id' }, { status: 400 });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportId)) {
      return NextResponse.json({ error: 'Invalid report_id format' }, { status: 400 });
    }

    // ─── Check if audit already exists (prevent duplicate AI spend) ───
    const { data: existing } = await supabaseAdmin
      .from('multimedia_reports')
      .select('premium_report')
      .eq('id', reportId)
      .single();

    if (existing?.premium_report) {
      return NextResponse.json({
        success: true,
        premium_report: existing.premium_report,
        message: 'Auditoría ya existente — retornando resultado previo.',
      });
    }

    // 1. Fetch report details
    const { data: report, error: reportError } = await supabaseAdmin
      .from('multimedia_reports')
      .select('*, businesses(name)')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const businessName = report.businesses?.name || report.entity_name_manual || 'Empresa por Identificar';
    const complaintText = report.complaint_text || report.public_summary || '';

    if (!complaintText.trim()) {
      return NextResponse.json({ error: 'Report has no complaint text to analyze' }, { status: 400 });
    }

    // 2. Identify Law 45 Violations
    const violations = await identifyLaw45Violations(complaintText);

    // 3. Find Matching Precedents (from events table)
    const { data: similarEvents } = await supabaseAdmin
      .from('events')
      .select('summary_es, source_url, event_date')
      .textSearch('summary_es', complaintText, {
        type: 'websearch',
        config: 'spanish',
      })
      .limit(3);

    // 4. Draft Demand Letter
    const demandLetterDraft = await draftDemandLetter(complaintText, businessName, violations);

    const premiumReport = {
      law_45_articles: violations,
      matching_precedents: similarEvents?.map((e) => ({
        summary: e.summary_es,
        date: e.event_date,
        url: e.source_url,
      })) || [],
      demand_letter_draft: demandLetterDraft,
      ai_assessment_summary: `Basado en nuestro análisis, su queja coincide con ${similarEvents?.length || 0} precedentes históricos de ACODECO y viola ${violations.length} artículos de la Ley 45.`,
      generated_at: new Date().toISOString(),
    };

    // 5. Save to Database
    const { error: updateError } = await supabaseAdmin
      .from('multimedia_reports')
      .update({ premium_report: premiumReport })
      .eq('id', reportId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      premium_report: premiumReport,
      message: 'Auditoría legal generada exitosamente.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Audit API Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
