/**
 * ACODECO Backfill Scraper — Registro Panamá
 *
 * Pulls the COMPLETE ACODECO post archive via WordPress REST API.
 * Uses clean JSON — no HTML scraping needed.
 *
 * What it fetches:
 *   - 892 total posts (as of March 2026)
 *   - 688 are official EDICTO sanction orders
 *   - Archive goes back to October 2024
 *
 * Run once from your terminal:
 *   cd scrapers && npm install
 *   INGEST_SECRET=PanamaRegistry2026SecureToken \
 *   INGEST_API_URL=https://registro-panama.vercel.app/api/ingest-event \
 *   node backfill-acodeco.mjs
 *
 * Optional flags:
 *   --dry-run          Print what would be ingested without posting
 *   --start-page=3     Resume from a specific page if interrupted
 *   --year=2025        Only ingest posts from a specific year
 */

import { batchIngest, logScrapeResult } from './lib/ingest.mjs';
import { extractBusinessFromACODECO, requireAnthropicKey, logExtractionStats } from './lib/extract-entity.mjs';

const ACODECO_API = 'https://www.acodeco.gob.pa/inicio/wp-json/wp/v2/posts';
const PER_PAGE = 100;
const DELAY_MS = 1500; // Be polite — 1.5s between API pages

// Parse CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const START_PAGE = parseInt(args.find(a => a.startsWith('--start-page='))?.split('=')[1] || '1');
const YEAR_FILTER = args.find(a => a.startsWith('--year='))?.split('=')[1] || null;

// Keywords that indicate this post is about a specific business infraction
const INFRACTION_KEYWORDS = [
  'sanciona', 'sancionó', 'sanción', 'multa', 'multó', 'multada',
  'advierte', 'infracción', 'resolución', 'edicto', 'expediente',
  'investigación', 'denuncia', 'embargo', 'decomiso', 'cierre',
  'clausura', 'publicidad engañosa', 'irregularidad', 'incumplimiento',
  'consumidor', 'agente económico'
];

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

// Business name extraction is now handled by Claude — see lib/extract-entity.mjs

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

/**
 * Convert a WordPress post to a Registro Panama event object.
 * Now uses Claude for entity extraction — returns a Promise.
 */
async function postToEvent(post) {
  const title = post.title?.rendered || '';
  const rawContent = post.content?.rendered || '';
  const content = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const date = post.date?.split('T')[0] || new Date().toISOString().split('T')[0];
  const link = post.link || `https://www.acodeco.gob.pa/inicio/?p=${post.id}`;

  // Claude extracts the actual sanctioned business name
  const businessName = await extractBusinessFromACODECO(title, content);
  if (!businessName) return null;

  const eventType = classifyPost(title, content);

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
      content_excerpt: content.substring(0, 400),
    },
  };
}

// ——— Main ———
async function main() {
  requireAnthropicKey();
  console.log('🏛️  ACODECO Backfill Scraper — Registro Panamá');
  console.log('================================================');
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

    // Polite delay between pages
    if (page < totalPages) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n✅ Fetched ${pagesFetched} pages`);
  console.log(`📋 Events ready to ingest: ${allEvents.length}`);
  console.log(`⏭️  Skipped (no business name or filtered): ${skipped}\n`);

  if (allEvents.length === 0) {
    console.log('No events to ingest. Done.');
    return;
  }

  if (DRY_RUN) {
    console.log('📋 Sample events (first 5):');
    allEvents.slice(0, 5).forEach((e, i) => {
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
