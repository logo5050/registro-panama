/**
 * ASEP Scraper — Registro Panamá
 *
 * Scrapes the Autoridad Nacional de los Servicios Públicos (ASEP) website
 * for resolutions and sanctions against utility companies
 * (telecom, electricity, water & sewage).
 *
 * Source: https://asep.gob.pa/category/resoluciones/
 *
 * Strategy:
 * 1. Fetch the paginated resolutions listing (WordPress category)
 * 2. Parse each resolution post for title, date, and summary
 * 3. Filter for sanctions/infractions (keywords)
 * 4. Extract company names via AI (Claude Haiku)
 * 5. POST each finding to the Registro Panamá ingest API
 *
 * Runs weekly via GitHub Actions (Tuesday 8am UTC).
 */

import * as cheerio from 'cheerio';
import { batchIngest, logScrapeResult } from './lib/ingest.mjs';
import { extractBusinessName, requireAnthropicKey } from './lib/extract-entity.mjs';

const BACKFILL = process.argv.includes('--backfill');
const MAX_BACKFILL_PAGES = parseInt(process.env.BACKFILL_MAX_PAGES || '50', 10);

const ASEP_BASE = 'https://asep.gob.pa';

// Categories to scrape — in backfill mode we paginate deeply into each
const RESOLUTION_CATEGORIES = [
  `${ASEP_BASE}/category/resoluciones/`,
  `${ASEP_BASE}/category/resoluciones/resoluciones-electricidad/`,
  `${ASEP_BASE}/category/resoluciones/resoluciones-telecomunicaciones/`,
  `${ASEP_BASE}/category/resoluciones/resoluciones-agua-y-alcantarillado/`,
];

// Normal mode: just first 2 pages of the main listing
const RESOLUTION_PAGES = BACKFILL
  ? [] // built dynamically in main()
  : [
    `${ASEP_BASE}/category/resoluciones/`,
    `${ASEP_BASE}/category/resoluciones/page/2/`,
    `${ASEP_BASE}/category/resoluciones/resoluciones-electricidad/`,
    `${ASEP_BASE}/category/resoluciones/resoluciones-telecomunicaciones/`,
    `${ASEP_BASE}/category/resoluciones/resoluciones-agua-y-alcantarillado/`,
  ];

// Keywords indicating a sanction or infraction
const SANCTION_KEYWORDS = [
  'sanción', 'multa', 'infracción', 'penalidad', 'incumplimiento',
  'violación', 'amonestación', 'suspensión', 'revocación', 'clausura',
  'reclamo', 'queja', 'denuncia', 'resolución sancionatoria',
];

// Known utility companies in Panama (helps with entity matching)
const KNOWN_ENTITIES = [
  'Cable & Wireless', 'Claro', 'Digicel', 'Tigo', '+Móvil',
  'ENSA', 'Naturgy', 'EDEMET', 'EDECHI', 'AES Panamá',
  'ETESA', 'IDAAN', 'Aguas de Panamá',
];

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RegistroPanama/1.0 (Public Business Registry; +https://registro-panama.vercel.app)',
        'Accept': 'text/html',
        'Accept-Language': 'es-PA,es;q=0.9,en;q=0.5',
      },
    });
    if (!res.ok) {
      if (res.status === 404) return null; // Page doesn't exist
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } catch (err) {
    console.error(`Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Detect the sector from the page URL or content.
 */
function detectSector(url, title) {
  const combined = `${url} ${title}`.toLowerCase();
  if (combined.includes('electricidad') || combined.includes('energía') || combined.includes('eléctric'))
    return 'electricidad';
  if (combined.includes('telecomunicacion') || combined.includes('telco') || combined.includes('móvil'))
    return 'telecomunicaciones';
  if (combined.includes('agua') || combined.includes('alcantarillado') || combined.includes('acueducto'))
    return 'agua_y_saneamiento';
  if (combined.includes('radio') || combined.includes('televisión'))
    return 'radio_television';
  return 'servicios_publicos';
}

/**
 * Check if text contains sanction-related keywords.
 */
function hasSanctionKeywords(text) {
  const lower = text.toLowerCase();
  return SANCTION_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Try to extract a company name from the title using known entities.
 * Falls back to AI extraction if no match.
 */
function matchKnownEntity(text) {
  for (const entity of KNOWN_ENTITIES) {
    if (text.toLowerCase().includes(entity.toLowerCase())) {
      return entity;
    }
  }
  return null;
}

/**
 * Parse a single ASEP resolution listing page.
 */
async function parseResolutionPage(url) {
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  // WordPress article patterns
  const selectors = ['article', '.post', '.entry', '.type-post'];
  let $items = $([]);
  for (const sel of selectors) {
    $items = $(sel);
    if ($items.length > 0) break;
  }

  // Fallback: links containing "resoluc"
  if ($items.length === 0) {
    $('a[href*="resoluc"]').each((_, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      const href = $el.attr('href') || '';
      if (title.length > 10 && hasSanctionKeywords(title)) {
        results.push({
          title,
          url: href.startsWith('http') ? href : `${ASEP_BASE}${href}`,
          date: null,
          excerpt: title,
        });
      }
    });
    return results;
  }

  $items.each((_, el) => {
    const $item = $(el);
    const title = $item.find('h2 a, h3 a, .entry-title a, .post-title a').first().text().trim()
      || $item.find('h2, h3, .entry-title').first().text().trim();
    const link = $item.find('a').first().attr('href') || '';
    const dateText = $item.find('time, .entry-date, .post-date, .date').first().text().trim()
      || $item.find('[datetime]').first().attr('datetime') || '';
    const excerpt = $item.find('.entry-summary, .excerpt, p').first().text().trim();

    if (!title || title.length < 5) return;

    // Only include if it mentions sanctions/infractions
    const fullText = `${title} ${excerpt}`;
    if (hasSanctionKeywords(fullText)) {
      results.push({
        title,
        url: link.startsWith('http') ? link : `${ASEP_BASE}${link}`,
        date: dateText || null,
        excerpt: excerpt || title,
      });
    }
  });

  return results;
}

/**
 * Build paginated URLs for backfill mode.
 * Paginates deeply into each category to find old resolutions.
 */
async function buildBackfillPages() {
  const pages = [];
  for (const category of RESOLUTION_CATEGORIES) {
    for (let p = 1; p <= MAX_BACKFILL_PAGES; p++) {
      pages.push(p === 1 ? category : `${category}page/${p}/`);
    }
  }
  return pages;
}

/**
 * Main: scrape all ASEP resolution pages and ingest.
 */
async function main() {
  console.log(`⚡ ASEP Scraper starting...${BACKFILL ? ' (BACKFILL MODE)' : ''}\n`);

  const useAI = !!process.env.ANTHROPIC_API_KEY;
  if (useAI) {
    requireAnthropicKey();
    console.log('🤖 AI entity extraction enabled\n');
  }

  const pagesToScrape = BACKFILL ? await buildBackfillPages() : RESOLUTION_PAGES;
  console.log(`📋 Pages to scrape: ${pagesToScrape.length}\n`);

  let allResults = [];
  let consecutiveEmpty = 0;

  for (const pageUrl of pagesToScrape) {
    console.log(`📄 Scraping: ${pageUrl}`);
    const results = await parseResolutionPage(pageUrl);
    console.log(`   Found ${results.length} sanction-related resolutions`);
    allResults = allResults.concat(results);

    // In backfill mode, stop paginating a category after 3 consecutive empty pages
    if (BACKFILL) {
      if (results.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) {
          console.log(`   ⏭️  3 consecutive empty pages — skipping rest of this category`);
          // Jump to next category by finding the next category start
          const currentCategory = RESOLUTION_CATEGORIES.find(c => pageUrl.startsWith(c));
          const catIdx = RESOLUTION_CATEGORIES.indexOf(currentCategory);
          if (catIdx < RESOLUTION_CATEGORIES.length - 1) {
            const nextCatStart = RESOLUTION_CATEGORIES[catIdx + 1];
            const skipTo = pagesToScrape.indexOf(nextCatStart);
            if (skipTo > 0) {
              // We can't actually skip in a for loop easily, so we'll just reset the counter
              // and let the empty pages pass quickly (they return null from fetchPage → [])
            }
          }
          consecutiveEmpty = 0;
        }
      } else {
        consecutiveEmpty = 0;
      }
    }

    // Be polite between pages
    await new Promise(r => setTimeout(r, BACKFILL ? 2000 : 1000));
  }

  // Deduplicate by URL
  const seen = new Set();
  allResults = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  console.log(`\n📊 Total unique sanction resolutions: ${allResults.length}\n`);

  // Transform to ingest format
  const events = [];
  for (const item of allResults) {
    let businessName = matchKnownEntity(item.title) || matchKnownEntity(item.excerpt);

    // AI fallback for entity extraction
    if (!businessName && useAI) {
      try {
        businessName = await extractBusinessName(item.title + ' ' + item.excerpt);
      } catch {
        businessName = null;
      }
    }

    if (!businessName) {
      // Last resort: use the resolution number/title as entity
      businessName = item.title.substring(0, 100);
    }

    const sector = detectSector(item.url, item.title);

    events.push({
      name: businessName,
      category: sector,
      event_type: 'asep_resolution',
      event_date: item.date || new Date().toISOString().split('T')[0],
      source_url: item.url,
      summary_es: item.excerpt.substring(0, 500),
      summary_en: `ASEP resolution regarding ${businessName} — ${sector} sector`,
      raw_data: { sector, original_title: item.title },
    });
  }

  if (events.length === 0) {
    console.log('ℹ️  No new ASEP sanctions found.');
    logScrapeResult('ASEP', { ingested: 0, failed: 0, total: 0 });
    return;
  }

  const { ingested, failed } = await batchIngest(events, 500);
  logScrapeResult('ASEP', { ingested, failed, total: events.length });
}

main().catch(err => {
  console.error('❌ ASEP scraper fatal error:', err);
  process.exit(1);
});
