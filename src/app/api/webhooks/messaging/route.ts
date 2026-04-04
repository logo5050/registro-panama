import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

/* ─── ENV ─── */
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || '';

/* ─── Helpers ─── */

/**
 * Verify the X-Hub-Signature-256 header sent by Meta (WhatsApp / Instagram).
 * Returns true when the HMAC-SHA256 of the raw body matches the header.
 * If META_APP_SECRET is not configured, rejects ALL requests (fail-closed).
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!META_APP_SECRET) {
    console.error('META_APP_SECRET is not configured — rejecting webhook');
    return false;
  }
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', META_APP_SECRET)
    .update(rawBody, 'utf-8')
    .digest('hex');

  // Header format: "sha256=<hex>"
  const provided = signatureHeader.replace('sha256=', '');

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== provided.length) return false;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sanitize a string: trim, cap length, strip control characters.
 */
function sanitize(input: string, maxLength = 2000): string {
  return input
    .trim()
    .slice(0, maxLength)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Escape special Postgres LIKE/ILIKE pattern characters.
 */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/* ─── GET: Meta Webhook Verification Challenge ─── */

/**
 * GET /api/webhooks/messaging
 *
 * Meta sends a GET request when you first register the webhook URL.
 * You must echo back hub.challenge if hub.verify_token matches yours.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!WEBHOOK_VERIFY_TOKEN) {
    console.error('WEBHOOK_VERIFY_TOKEN not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/* ─── POST: Receive Complaint from WhatsApp / Instagram ─── */

/**
 * POST /api/webhooks/messaging
 *
 * Receives incoming messages from Meta's Graph API (WhatsApp Business
 * or Instagram Messaging). Validates HMAC signature, parses complaint,
 * and saves it as a multimedia_report.
 */
export async function POST(req: NextRequest) {
  try {
    // 0. Read raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    if (!verifyMetaSignature(rawBody, signature)) {
      console.warn('Webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // 1. Parse & sanitize fields
    const source = (['WhatsApp', 'Instagram'] as const).includes(payload.source)
      ? payload.source
      : 'WhatsApp';
    const sender = sanitize(payload.sender || payload.from || 'Unknown', 200);
    const text = sanitize(payload.text || payload.message || payload.body || '', 5000);
    const rawEvidence = payload.attachments || payload.media || [];
    const evidenceUrls: string[] = (Array.isArray(rawEvidence) ? rawEvidence : [rawEvidence])
      .filter((u: unknown) => typeof u === 'string' && u.startsWith('https://'))
      .slice(0, 10); // max 10 attachments

    if (!text && evidenceUrls.length === 0) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 });
    }

    // 2. Try to find business if mentioned in text (simplified NLP)
    let businessId = null;
    let entityNameManual = 'Mencionado en mensaje';

    if (text) {
      const match = text.match(/en\s+([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)*)/);
      if (match) {
        entityNameManual = sanitize(match[1], 200);

        const { data: business } = await supabaseAdmin
          .from('businesses')
          .select('id')
          .ilike('name', `%${escapeLike(entityNameManual)}%`)
          .limit(1)
          .single();

        if (business) businessId = business.id;
      }
    }

    // 3. Save report
    const { data, error } = await supabaseAdmin
      .from('multimedia_reports')
      .insert({
        business_id: businessId,
        entity_name_manual: entityNameManual,
        complaint_text: text,
        social_handle: sender,
        evidence_urls: evidenceUrls,
        source: source as 'WhatsApp' | 'Instagram',
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, reportId: data.id });
  } catch (error: unknown) {
    console.error('Webhook processing error:', error);
    // Return 200 to Meta even on internal errors — they retry on non-2xx
    // and aggressive retries can cause duplicate flood
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
