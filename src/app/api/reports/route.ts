import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

/* ─── Constants ─── */
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4', 'mov']);
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

const VALID_REPORT_TYPES = new Set([
  'Práctica Comercial Injusta',
  'Falla de Servicio Grave',
]);

const VALID_SOURCES = new Set(['Web', 'WhatsApp', 'Instagram']);

/* ─── Helpers ─── */

function sanitize(input: string, maxLength: number): string {
  return input
    .trim()
    .slice(0, maxLength)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * POST /api/reports
 *
 * Accept form-data with text fields and an optional evidence file upload.
 * Validates all inputs, restricts file types, and caps file size.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // ─── Extract & validate text fields ───
    const rawEntityName = formData.get('entityName');
    const rawReportType = formData.get('reportType');
    const rawDescription = formData.get('description');
    const rawSource = formData.get('source');

    if (!rawEntityName || typeof rawEntityName !== 'string' || !rawEntityName.trim()) {
      return NextResponse.json({ error: 'entityName is required' }, { status: 400 });
    }
    if (!rawDescription || typeof rawDescription !== 'string' || !rawDescription.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const entityName = sanitize(rawEntityName as string, MAX_NAME_LENGTH);
    const description = sanitize(rawDescription as string, MAX_TEXT_LENGTH);

    const reportType = typeof rawReportType === 'string' && VALID_REPORT_TYPES.has(rawReportType)
      ? rawReportType
      : 'Práctica Comercial Injusta';

    const source = typeof rawSource === 'string' && VALID_SOURCES.has(rawSource)
      ? rawSource
      : 'Web';

    // ─── Validate & upload evidence file ───
    const evidenceFile = formData.get('evidenceFile') as File | null;
    let evidenceUrl: string | null = null;

    if (evidenceFile && evidenceFile.size > 0) {
      // Check file size
      if (evidenceFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
          { status: 400 },
        );
      }

      // Check file extension
      const fileName = evidenceFile.name || '';
      const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_EXTENSIONS.has(fileExt)) {
        return NextResponse.json(
          { error: `File type .${fileExt} is not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
          { status: 400 },
        );
      }

      // Check MIME type
      const mimeType = evidenceFile.type || '';
      if (!ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
        return NextResponse.json(
          { error: `MIME type ${mimeType} is not allowed.` },
          { status: 400 },
        );
      }

      // Upload with a safe random filename (prevents path traversal)
      const safeName = `${uuidv4()}.${fileExt}`;
      const filePath = `user-submissions/${safeName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('complaints-evidence')
        .upload(filePath, evidenceFile);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return NextResponse.json({ error: 'Failed to upload evidence file.' }, { status: 500 });
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('complaints-evidence')
        .getPublicUrl(filePath);

      evidenceUrl = publicUrlData.publicUrl;
    }

    // ─── Try to find existing business by name ───
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .ilike('name', `%${escapeLike(entityName)}%`)
      .limit(1)
      .single();

    // ─── Save report ───
    const { data, error } = await supabaseAdmin
      .from('multimedia_reports')
      .insert({
        business_id: business?.id || null,
        entity_name_manual: entityName,
        report_type: reportType,
        complaint_text: description,
        evidence_urls: evidenceUrl ? [evidenceUrl] : [],
        source,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, reportId: data.id });
  } catch (error: unknown) {
    console.error('Error submitting report:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
