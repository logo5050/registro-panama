/**
 * ACODECO Backfill Scraper — Registro Panamá
 *
 * Pulls the COMPLETE ACODECO post archive via WordPress REST API.
 * Downloads PDFs from edicto posts and extracts text for AI entity extraction.
 *
 * What it fetches:
 *   - 892 total posts (as of March 2026)
 *   - ~688 are official EDICTO sanction orders (PDF-based)
 *   - Archive goes back to October 2024
 *
 * Run once from your terminal:
 *   cd scrapers && npm install
 *   set NODE_TLS_REJECT_UNAUTHORIZED=0
 *   INGEST_SECRET=PanamaRegistry2026SecureToken \
 *   INGEST_API_URL=https://registro-panama.vercel.app/api/ingest-event \
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   node backfill-acodeco.mjs
 *
 * Optional flags:
 *   --dry-run          Print what would be ingested without posting
 *   --start-page=3     Resume from a specific page if interrupted
 *   --year=2025        Only ingest posts from a specific year
 */

import { batchIngest, logScrapeResult } from './lib/ingest.mjs';
import { extractBusinessFromACODECO, extractBusinessFromPDF, requireAnthropicKey, logExtractionStats } from './lib/extract-entity.mjs';

const ACODECO_API = 'https://www.acodeco.gob.pa/inicio/wp-json/wp/v2/posts';
const PER_PAGE = 100;
const DELAY_MS = 1500; // Be polite — 1.5s between API pages
const PDF_DELAY_MS = 500; // Delay between PDF downloads

// Parse CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const START_PAGE = parseInt(args.find(a => a.startsWith('--start-page='))?.split('=')[1] || '1');
const YEAR_FILTER = args.find(a => a.startsWith('--year='))?.split('=')[1] || null;

/**
 * Determine the event type based on post content.
 */
function classifyPost(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  if (text.includes('edicto') || text.includes('expediente')) return 'acodeco_infraction';
  if (text.includes('sanciona') || text.includes('multa') || text.includes('sancionó')) return 'acodeco_infraction';
  if (text.includes('sanción') || text.includes('infracción') || text.includes('resolución')) return 'acodeco_infraction';
  return 'news_mention';
}

/**
 * Extract PDF URL from WordPress post HTML content.
 *
 * ACODECO uses pdfjs-viewer-for-elementor plugin which embeds PDFs as:
 *   <iframe src=".../pdfjs/web/viewer.html?file=ACTUAL_PDF_URL">
 *
 * The real PDF is in the ?file= query parameter, NOT the iframe src itself.
 */
function extractPdfUrl(htmlContent) {
  // Pattern 1: pdfjs viewer — extract the ?file= parameter (this is the actual PDF)
  const viewerMatch = htmlContent.match(/[?&]file=([^"'&\s]+\.pdf[^"'&\s]*)/i);
  if (viewerMatch) {
    // Decode any URL encoding
    return decodeURIComponent(viewerMatch[1]);
  }

  // Pattern 2: Direct wp-content/uploads PDF link
  const uploadsMatch = htmlContent.match(/(https?:\/\/[^"'\s]+wp-content\/uploads\/[^"'\s]+\.pdf)/i);
  if (uploadsMatch) return uploadsMatch[1];

  // Pattern 3: Direct href to a .pdf file
  const hrefMatch = htmlContent.match(/href=["']([^"']+\.pdf)["']/i);
  if (hrefMatch) return hrefMatch[1];

  return null;
}

/**
 * Download a PDF and extract its text content.
 * Returns the extracted text or null on failure.
 */
/**
 * Normalize a PDF URL: resolve relative paths and encode special characters
 * in the filename (e.g. ° → %C2%B0) so the server returns 200, not 404.
 */
function normalizePdfUrl(url) {
  // Resolve relative URLs
  if (url.startsWith('/')) {
    url = `https://www.acodeco.gob.pa${url}`;
  }
  try {
    const parsed = new URL(url);
    // Re-encode each path segment to handle ° and other special chars
    parsed.pathname = parsed.pathname
      .split('/')
      .map(seg => encodeURIComponent(decodeURIComponent(seg)))
      .join('/');
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Download a PDF and return the raw buffer for Claude Vision.
 */
async function downloadPdf(pdfUrl) {
  try {
    pdfUrl = normalizePdfUrl(pdfUrl);
    const resp = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'RegistroPanama/1.0 (Public Registry; +https://registro-panama.vercel.app)' },
    });
    if (!resp.ok) {
      console.warn(`    📄 PDF download failed: HTTP ${resp.status}`);
      return null;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    // Verify it's a real PDF
    if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF')) {
      console.warn(`    📄 Not a valid PDF (bad header)`);
      return null;
    }
    return buffer;
  } catch (err) {
    console.warn(`    📄 PDF download error: ${err.message}`);
    return null;
  }
}

/**
 * Fetch one page of posts from the ACODECO WordPress REST API.
 */
async function fetchPage(page) {
  const url = `${ACODECO_API}?per_page=${PER_PAGE}&page=${page}&orderby=date&order=asc`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'RegistroPanama/1.0 (Public Registry; +https://registro-panama.vercel.app)',
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    if (resp.status === 400) return { posts: [], totalPages: 0 }; // Past last page
    throw new Error(`API error: HTTP ${resp.status} on page ${page}`);
  }

  const totalPages = parseInt(resp.headers.get('X-WP-TotalPages') || '0');
  const total = parseInt(resp.headers.get('X-WP-Total') || '0');
  const posts = await resp.json();
  return { posts, totalPages, total };
}

// Stats
let pdfDownloaded = 0;
let pdfFailed = 0;
let pdfSkipped = 0;

/**
 * Convert a WordPress post to a Registro Panama event object.
 * For edicto posts (PDF-based): downloads PDF → sends to Claude Vision.
 * For news posts (HTML text): sends text to Claude text extraction.
 */
async function postToEvent(post) {
  const title = post.title?.rendered || '';
  const rawContent = post.content?.rendered || '';
  const htmlStripped = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const date = post.date?.split('T')[0] || new Date().toISOString().split('T')[0];
  const link = post.link || `https://www.acodeco.gob.pa/inicio/?p=${post.id}`;

  let businessName = null;

  // Strategy: if it's an edicto with a PDF, use Claude Vision on the PDF
  const isEdicto = htmlStripped.length < 200 || title.toLowerCase().includes('edicto');
  const pdfUrl = isEdicto ? extractPdfUrl(rawContent) : null;

  if (pdfUrl) {
    await new Promise(r => setTimeout(r, PDF_DELAY_MS));
    const pdfBuffer = await downloadPdf(pdfUrl);
    if (pdfBuffer) {
      pdfDownloaded++;
      // Send raw PDF to Claude Vision — reads scanned images natively
      businessName = await extractBusinessFromPDF(title, pdfBuffer);
    } else {
      pdfFailed++;
    }
  } else if (isEdicto) {
    pdfSkipped++;
  }

  // Fallback: for non-edicto posts or if PDF extraction failed, use text extraction
  if (!businessName && htmlStripped.length > 50) {
    businessName = await extractBusinessFromACODECO(title, htmlStripped);
  }

  if (!businessName) return null;

  const eventType = classifyPost(title, htmlStripped);

  return {
    name: businessName,
    category: 'Regulación / Consumer Protection',
    event_type: eventType,
    source_url: link,
    summary_es: title.substring(0, 300),
    summary_en: `ACODECO: ${title.substring(0, 280)}`,
    raw_data: {
      scraper: 'backfill-acodeco',
      wp_post_id: post.id,
      post_date: date,
      content_excerpt: htmlStripped.substring(0, 400),
    },
  };
}

// ——— Main ———
async function main() {
  requireAnthropicKey();
  console.log('🏛️  ACODECO Backfill Scraper — Registro Panamá');
  console.log('================================================');
  console.log('📄 PDF extraction enabled — will download edicto PDFs\n');
  if (DRY_RUN) console.log('🔍 DRY RUN MODE — nothing will be posted\n');
  if (YEAR_FILTER) console.log(`📅 Year filter: ${YEAR_FILTER}\n`);
  if (START_PAGE > 1) console.log(`▶️  Resuming from page ${START_PAGE}\n`);

  // Get total count first
  const { totalPages, total } = await fetchPage(1);
  console.log(`📊 Total ACODECO posts: ${total}`);
  console.log(`📄 Total pages to fetch: ${totalPages} (${PER_PAGE} per page)\n`);

  let allEvents = [];
  let skipped = 0;
  let pagesFetched = 0;

  for (let page = START_PAGE; page <= totalPages; page++) {
    console.log(`  Fetching page ${page}/${totalPages}...`);

    const { posts } = await fetchPage(page);
    pagesFetched++;

    for (const post of posts) {
      // Apply year filter if set
      if (YEAR_FILTER && !post.date.startsWith(YEAR_FILTER)) {
        skipped++;
        continue;
      }

      const event = await postToEvent(post);
      if (event) {
        allEvents.push(event);
      } else {
        skipped++;
      }
    }

    console.log(`    → ${allEvents.length} events collected so far (${skipped} skipped)`);
    console.log(`    📄 PDFs: ${pdfDownloaded} downloaded, ${pdfFailed} failed, ${pdfSkipped} no PDF link`);

    // Polite delay between pages
    if (page < totalPages) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n✅ Fetched ${pagesFetched} pages`);
  console.log(`📋 Events ready to ingest: ${allEvents.length}`);
  console.log(`⏭️  Skipped (no business name or filtered): ${skipped}`);
  console.log(`📄 PDF stats: ${pdfDownloaded} parsed, ${pdfFailed} failed, ${pdfSkipped} no link\n`);

  if (allEvents.length === 0) {
    console.log('No events to ingest. Done.');
    return;
  }

  if (DRY_RUN) {
    console.log('📋 Sample events (first 10):');
    allEvents.slice(0, 10).forEach((e, i) => {
      console.log(`\n  [${i + 1}] ${e.name}`);
      console.log(`       Type: ${e.event_type}`);
      console.log(`       Summary: ${e.summary_es.substring(0, 80)}...`);
      console.log(`       URL: ${e.source_url}`);
    });
    console.log('\n✅ Dry run complete. Run without --dry-run to ingest.');
    return;
  }

  logExtractionStats();
  console.log('🚀 Starting ingestion...\n');
  const result = await batchIngest(allEvents, 300); // 300ms between requests
  logScrapeResult('ACODECO Backfill', { ...result, total: allEvents.length });
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
