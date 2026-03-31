import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/reports
 * 
 * Accept form-data (handling text fields and file upload for evidence).
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const entityName = formData.get('entityName') as string;
    const reportType = formData.get('reportType') as string;
    const description = formData.get('description') as string;
    const source = (formData.get('source') as string) || 'Web';
    const evidenceFile = formData.get('evidenceFile') as File | null;

    let evidenceUrl = null;

    // 1. Upload evidence if file exists
    if (evidenceFile && evidenceFile.size > 0) {
      const fileExt = evidenceFile.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `user-submissions/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('complaints-evidence')
        .upload(filePath, evidenceFile);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('complaints-evidence')
        .getPublicUrl(filePath);

      evidenceUrl = publicUrlData.publicUrl;
    }

    // 2. Try to find existing business by name
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .ilike('name', entityName)
      .limit(1)
      .single();

    // 3. Save to multimedia_reports
    const { data, error } = await supabaseAdmin
      .from('multimedia_reports')
      .insert({
        business_id: business?.id || null,
        entity_name_manual: entityName,
        report_type: reportType,
        complaint_text: description,
        evidence_urls: evidenceUrl ? [evidenceUrl] : [],
        source: source,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, reportId: data.id });

  } catch (error: any) {
    console.error('Error submitting report:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
