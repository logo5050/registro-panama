/**
 * Shared ingestion client for all scrapers.
 * Posts scraped data to the Registro Panamá ingest API.
 */

const API_URL = process.env.INGEST_API_URL || 'https://registro-panama.vercel.app/api/ingest-event';
const INGEST_SECRET = process.env.INGEST_SECRET;

if (!INGEST_SECRET) {
  console.error('❌ INGEST_SECRET environment variable is required');
  process.exit(1);
}

/**
 * Send a single business event to the ingest API.
 * @param {Object} event - The event data
 * @param {string} event.name - Business name
 * @param {string} event.category - Business category
 * @param {string} event.event_type - One of the event_type enum values
 * @param {string} event.source_url - URL where the data was found
 * @param {string} event.summary_es - Spanish summary
 * @param {string} event.summary_en - English summary
 * @param {Object} [event.business_data] - Extra business fields (ruc, province, etc.)
 * @returns {Promise<{success: boolean, slug?: string, error?: string}>}
 */
export async function ingestEvent(event) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INGEST_SECRET}`,
      },
      body: JSON.stringify(event),
    });

    const data = await res.json();

    if (!res.ok) {
      const detailStr = data.details ? ` | Detail: ${data.details}` : '';
      const codeStr = data.code ? ` (Code: ${data.code})` : '';
      console.error(`  ❌ Failed to ingest "${event.name}": ${data.error}${detailStr}${codeStr}`);
      return { success: false, error: data.error, details: data.details, code: data.code };
    }

    console.log(`  ✅ Ingested: ${event.name} → /registro/${data.slug}`);
    return { success: true, slug: data.slug };
  } catch (err) {
    console.error(`  ❌ Network error for "${event.name}": ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Normalize date strings to YYYY-MM-DD for Postgres.
 * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, and YYYY.
 * @param {string} dateStr - The date string to normalize
 * @returns {string|null} - Normalized date or null if unparseable
 */
export function normalizeDate(dateStr) {
  if (!dateStr) return null;
  
  // Remove any leading/trailing whitespace
  const clean = dateStr.toString().trim();
  if (!clean) return null;

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Handle YYYY/MM/DD or YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const [_, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Handle just YYYY
  if (/^\d{4}$/.test(clean)) {
    return `${clean}-01-01`;
  }

  // Fallback to ISO if possible, otherwise return null to use current date
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}

  return null;
}

/**
 * Batch ingest multiple events with rate limiting.
 * @param {Object[]} events - Array of event objects
 * @param {number} [delayMs=500] - Delay between requests to avoid rate limits
 * @returns {Promise<{ingested: number, failed: number}>}
 */
export async function batchIngest(events, delayMs = 500) {
  let ingested = 0;
  let failed = 0;

  for (const event of events) {
    const result = await ingestEvent(event);
    if (result.success) ingested++;
    else failed++;

    // Rate limit between requests
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { ingested, failed };
}

/**
 * Log scrape run results to console (and optionally to the API).
 */
export function logScrapeResult(source, { ingested, failed, total }) {
  console.log(`\n📊 ${source} scrape complete:`);
  console.log(`   Found: ${total} | Ingested: ${ingested} | Failed: ${failed}`);
}
