/**
 * Capital Financiero Backfill Scraper — Registro Panamá
 *
 * Pulls business-relevant articles from Capital Financiero via WordPress REST API.
 * 63,794 total posts going back to 2010 — we filter smartly so we don't pull noise.
 *
 * Strategy: Search for specific high-value keywords (ACODECO, multa, sanción, empresa)
 * rather than pulling everything. This gives us targeted, credibility-relevant articles.
 *
 * Run once from your terminal:
 *   cd scrapers && npm install
 *   INGEST_SECRET=PanamaRegistry2026SecureToken \
 *   INGEST_API_URL=https://registro-panama.vercel.app/api/ingest-event \
 *   node backfill-news.mjs
 *
 * Optional flags:
 *   --dry-run          Print what would be ingested without posting
 *   --year=2025        Only pull articles from a specific year (default: 2024+)
 *   --keyword=acodeco  Only run one specific keyword search
 */

import { batchIngest, logScrapeResult } from './lib/ingest.mjs';
import { extractBusinessFromNews, requireAnthropicKey, logExtractionStats } from './lib/extract-entity.mjs';

const CF_API = 'https://elcapitalfinanciero.com/wp-json/wp/v2/posts';
const PER_PAGE = 100;
const DELAY_MS = 2000; // Capital Financiero is a commercial site — be extra polite

// Parse CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const YEAR_FILTER = args.find(a => a.startsWith('--year='))?.split('=')[1] || null;
const KEYWORD_FILTER = args.find(a => a.startsWith('--keyword='))?.split('=')[1] || null;

// Default: only pull from 2024 onwards unless --year specified
const START_YEAR = YEAR_FILTER ? parseInt(YEAR_FILTER) : 2024;
const AFTER_DATE = `${START_YEAR}-01-01T00:00:00`;

// High-value keyword searches — each captures different types of business events
const KEYWORD_SEARCHES = [
  { keyword: 'acodeco',        category: 'Regulación',      event_type: 'acodeco_infraction' },
  { keyword: 'multa empresa',  category: 'Regulación',      event_type: 'acodeco_infraction' },
  { keyword: 'sancionada',     category: 'Regulación',      event_type: 'sanction' },
  { keyword: 'quiebra',        category: 'Legal / Finanzas', event_type: 'court_ruling' },
  { keyword: 'liquidación empresa', category: 'Legal',      event_type: 'court_ruling' },
  { keyword: 'fraude empresa', category: 'Legal',            event_type: 'court_ruling' },
  { keyword: 'inauguración',   category: 'Noticias',        event_type: 'news_mention' },
  { keyword: 'nueva empresa',  category: 'Noticias',        event_type: 'news_mention' },
  { keyword: 'inversión Panamá', category: 'Noticias',      event_type: 'news_mention' },
  { keyword: 'cierra empresa', category: 'Noticias',        event_type: 'news_mention' },
];

// Business name extraction is now handled by Claude — see lib/extract-entity.mjs

/**
 * Fetch articles for a specific keyword and date range.
 */
async function fetchByKeyword({ keyword, category, event_type }) {
  console.log(`\n  🔍 Keyword: "${keyword}" (from ${START_YEAR}+)...`);
  const events = [];
  let page = 1;
  let totalPages = 1;
  let totalFound = 0;

  while (page <= totalPages) {
    const params = new URLSearchParams({
      per_page: PER_PAGE,
      page,
      search: keyword,
      after: AFTER_DATE,
      orderby: 'date',
      order: 'desc',
      _fields: 'id,date,title,excerpt,content,link',
    });

    const resp = await fetch(`${CF_API}?${params}`, {
      headers: {
        'User-Agent': 'RegistroPanama/1.0 (Public Registry; +https://registro-panama.vercel.app)',
        'Accept': 'application/json',
      },
    });

    if (!resp.ok) {
      if (resp.status === 400) break;
      console.error(`    ⚠️  HTTP ${resp.status} on page ${page}`);
      break;
    }

    if (page === 1) {
      totalPages = parseInt(resp.headers.get('X-WP-TotalPages') || '1');
      totalFound = parseInt(resp.headers.get('X-WP-Total') || '0');
      console.log(`    Found ${totalFound} articles (${totalPages} pages)`);
    }

    const posts = await resp.json();

    for (const post of posts) {
      const title = post.title?.rendered || '';
      const excerpt = (post.excerpt?.rendered || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const content = (post.content?.rendered || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 500);
      const date = post.date?.split('T')[0];
      const link = post.link;

      // Claude extracts the actual business name from the article
      const businessName = await extractBusinessFromNews(title, excerpt + ' ' + content);
      if (!businessName) continue;

      events.push({
        name: businessName,
        category,
        event_type,
        event_date: date,
        source_url: link,
        summary_es: title.substring(0, 300),
        summary_en: `Capital Financiero: ${title.substring(0, 280)}`,
        raw_data: {
          scraper: 'backfill-news',
          source: 'Capital Financiero',
          wp_post_id: post.id,
          post_date: date,
          keyword_matched: keyword,
        },
      });
    }

    page++;
    if (page <= totalPages) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`    → ${events.length} usable events extracted`);
  return events;
}

// ——— Main ———
async function main() {
  requireAnthropicKey();
  console.log('📰 Capital Financiero Backfill Scraper — Registro Panamá');
  console.log('==========================================================');
  if (DRY_RUN) console.log('🔍 DRY RUN MODE — nothing will be posted\n');
  console.log(`📅 Pulling articles from ${START_YEAR} onwards`);
  if (KEYWORD_FILTER) console.log(`🔎 Keyword filter: "${KEYWORD_FILTER}"\n`);

  const searches = KEYWORD_FILTER
    ? KEYWORD_SEARCHES.filter(s => s.keyword === KEYWORD_FILTER)
    : KEYWORD_SEARCHES;

  if (searches.length === 0) {
    console.error(`No matching keyword: "${KEYWORD_FILTER}"`);
    process.exit(1);
  }

  const allEvents = [];
  const seenUrls = new Set(); // Deduplicate across keyword searches

  for (const search of searches) {
    const events = await fetchByKeyword(search);
    for (const event of events) {
      if (!seenUrls.has(event.source_url)) {
        seenUrls.add(event.source_url);
        allEvents.push(event);
      }
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  logExtractionStats();
  console.log(`\n✅ Total unique events collected: ${allEvents.length}`);

  if (allEvents.length === 0) {
    console.log('No events to ingest. Done.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n📋 Sample events (first 5):');
    allEvents.slice(0, 5).forEach((e, i) => {
      console.log(`\n  [${i + 1}] ${e.name}`);
      console.log(`       Type: ${e.event_type}`);
      console.log(`       Summary: ${e.summary_es.substring(0, 80)}...`);
      console.log(`       URL: ${e.source_url}`);
    });
    console.log('\n✅ Dry run complete. Run without --dry-run to ingest.');
    return;
  }

  console.log('\n🚀 Starting ingestion...\n');
  const result = await batchIngest(allEvents, 400);
  logScrapeResult('Capital Financiero Backfill', { ...result, total: allEvents.length });
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
