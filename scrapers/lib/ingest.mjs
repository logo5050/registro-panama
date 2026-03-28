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
      console.error(`  ❌ Failed to ingest "${event.name}": ${data.error}`);
      return { success: false, error: data.error };
    }

    console.log(`  ✅ Ingested: ${event.name} → /registro/${data.slug}`);
    return { success: true, slug: data.slug };
  } catch (err) {
    console.error(`  ❌ Network error for "${event.name}": ${err.message}`);
    return { success: false, error: err.message };
  }
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
