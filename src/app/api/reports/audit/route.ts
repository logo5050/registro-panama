import { supabaseAdmin } from '@/lib/supabase';
import { identifyLaw45Violations, draftDemandLetter } from '@/lib/ai';
import { NextResponse } from 'next/server';

/**
 * $5.00 AI Audit Service
 * Objective: Match consumer complaint with legal precedents and draft demand letter.
 */
export async function POST(req: Request) {
  try {
    const { report_id } = await req.json();

    if (!report_id) {
      return NextResponse.json({ error: 'Missing report_id' }, { status: 400 });
    }

    // 1. Fetch report details
    const { data: report, error: reportError } = await supabaseAdmin
      .from('multimedia_reports')
      .select('*, businesses(name)')
      .eq('id', report_id)
      .single();

    if (reportError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const businessName = report.businesses?.name || report.entity_name_manual || 'Empresa por Identificar';
    const complaintText = report.complaint_text || report.public_summary;

    // 2. Identify Law 45 Violations
    const violations = await identifyLaw45Violations(complaintText);

    // 3. Find Matching Precedents (from events table)
    const { data: similarEvents } = await supabaseAdmin
      .from('events')
      .select('summary_es, source_url, event_date')
      .textSearch('summary_es', complaintText, {
        type: 'websearch',
        config: 'spanish'
      })
      .limit(3);

    // 4. Draft Demand Letter
    const demand_letter_draft = await draftDemandLetter(complaintText, businessName, violations);

    const premium_report = {
      law_45_articles: violations,
      matching_precedents: similarEvents?.map(e => ({
        summary: e.summary_es,
        date: e.event_date,
        url: e.source_url
      })),
      demand_letter_draft,
      ai_assessment_summary: `Basado en nuestro análisis, su queja coincide con ${similarEvents?.length || 0} precedentes históricos de ACODECO y viola ${violations.length} artículos de la Ley 45.`,
      generated_at: new Date().toISOString()
    };

    // 5. Save to Database
    const { error: updateError } = await supabaseAdmin
      .from('multimedia_reports')
      .update({ premium_report })
      .eq('id', report_id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      premium_report,
      message: 'Auditoría legal generada exitosamente.'
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Audit API Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
