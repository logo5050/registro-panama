import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/webhooks/messaging
 * 
 * Receive incoming JSON payloads from WhatsApp/Instagram APIs, 
 * parse the complaint, and save it as a ConfidentialReport.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    // Generic parser for different sources (WhatsApp/Instagram)
    // In a real scenario, this would have logic for Meta Graph API / Twilio
    const source = payload.source || 'WhatsApp'; // WhatsApp, Instagram
    const sender = payload.sender || payload.from || 'Unknown';
    const text = payload.text || payload.message || payload.body || '';
    const evidenceUrls = payload.attachments || payload.media || [];
    
    // 1. Try to find business if mentioned in text (Simplified NLP)
    // In a real app, use a dedicated NER (Named Entity Recognition)
    let businessId = null;
    let entityNameManual = 'Mencionado en mensaje';
    
    if (text) {
      const match = text.match(/en\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      if (match) {
        entityNameManual = match[1];
        
        const { data: business } = await supabaseAdmin
          .from('businesses')
          .select('id')
          .ilike('name', `%${entityNameManual}%`)
          .limit(1)
          .single();
        
        if (business) businessId = business.id;
      }
    }

    // 2. Save report
    const { data, error } = await supabaseAdmin
      .from('multimedia_reports')
      .insert({
        business_id: businessId,
        entity_name_manual: entityNameManual,
        complaint_text: text,
        social_handle: sender,
        evidence_urls: Array.isArray(evidenceUrls) ? evidenceUrls : [evidenceUrls],
        source: source as 'WhatsApp' | 'Instagram',
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, reportId: data.id });

  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
