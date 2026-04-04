/**
 * Judiciary Scraper — Registro Panamá
 *
 * Scrapes the Órgano Judicial de Panamá for court rulings
 * involving businesses (commercial disputes, sanctions, etc.)
 *
 * Source: https://www.organojudicial.gob.pa
 *
 * Note: The Órgano Judicial website is notoriously difficult to scrape.
 * Their system uses dynamic loading and session-based access.
 * This scraper focuses on the public-facing press releases and
 * published rulings that are more accessible.
 *
 * Runs weekly via GitHub Actions.
 */

import * as cheerio from 'cheerio';
import { batchIngest, logScrapeResult } from './lib/ingest.mjs';
import { extractBusinessName, requireAnthropicKey } from './lib/extract-entity.mjs';

const BACKFILL = process.argv.includes('--backfill');
const MAX_BACKFILL_PAGES = parseInt(process.env.BACKFILL_MAX_PAGES || '30', 10);
const MAX_ARTICLES = BACKFILL ? 200 : 15;

const OJ_BASE = 'https://www.organojudicial.gob.pa';
const OJ_NEWS = `${OJ_BASE}/noticias`;

// Keywords related to commercial court rulings
const COURT_KEYWORDS = [
  'sentencia', 'fallo', 'resolución', 'demanda', 'embargo',
  'quiebra', 'liquidación', 'concurso', 'arbitraje',
  'competencia desleal', 'propiedad industrial', 'marca',
  'contrato', 'sociedad anónima', 'responsabilidad',
  'indemnización', 'incumplimiento'
];

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RegistroPanama/1.0 (Public Business Registry; +https://registro-panama.vercel.app)',
        'Accept': 'text/html',
        'Accept-Language': 'es-PA,es;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.error(`  Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

async function scrapeJudiciaryNews() {
  console.log('🔍 Scraping Órgano Judicial news...');

  const html = await fetchPage(OJ_NEWS);
  if (!html) {
    console.error('Could not fetch Órgano Judicial page');
    return [];
  }

  const $ = cheerio.load(html);
  const articles = [];

  // Try multiple selector patterns
  const selectors = [
    'article', '.views-row', '.node', '.post',
    'div[class*="noticia"]', 'div[class*="news"]',
    '.field-content', 'li[class*="item"]'
  ];

  let $items = $([]);
  for (const sel of selectors) {
    $items = $(sel);
    if ($items.length > 0) break;
  }

  if ($items.length > 0) {
    $items.each((_, el) => {
      const title = $(el).find('h2, h3, h4, .title, a').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';
      const text = $(el).text().toLowerCase();
      const isRelevant = COURT_KEYWORDS.some(k => text.includes(k));

      if (title && isRelevant) {
        articles.push({
          title,
          url: link.startsWith('http') ? link : `${OJ_BASE}${link}`,
        });
      }
    });
  }

  // Fallback: link scanning
  if (articles.length === 0) {
    console.log('  Using link-based fallback parser...');
    $('a').each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (text.length > 15 && COURT_KEYWORDS.some(k => text.toLowerCase().includes(k))) {
        articles.push({
          title: text,
          url: href.startsWith('http') ? href : `${OJ_BASE}${href}`,
        });
      }
    });
  }

  console.log(`  Found ${articles.length} relevant judiciary articles`);
  return articles;
}

async function parseArticle(article) {
  const html = await fetchPage(article.url);
  if (!html) return null;

  const $ = cheerio.load(html);

  const bodySelectors = [
    'article', '.field--name-body', '.content', '.entry-content',
    'div[class*="body"]', 'div[class*="content"]', 'main'
  ];

  let bodyText = '';
  for (const sel of bodySelectors) {
    bodyText = $(sel).first().text().trim();
    if (bodyText.length > 100) break;
  }

  if (!bodyText) bodyText = $('body').text().trim();

  // Extract business/entity name
  const namePatterns = [
    /(?:contra|demandante|demandado|empresa|sociedad)\s+["']?([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s,\.&]+?)["']?(?:\s*,|\s+(?:S\.A\.|Inc\.|Corp\.|Ltda\.|por|fue|ha))/i,
    /(?:sociedad anónima|S\.A\.)\s+["']?([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s,\.&]+?)["']?/i,
  ];

  let businessName = null;
  for (const pattern of namePatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      businessName = match[1].trim().replace(/\s+/g, ' ');
      break;
    }
  }

  // AI fallback: use Claude to extract entity if regex failed
  if (!businessName && useAI) {
    try {
      businessName = await extractBusinessName(
        `${article.title} ${bodyText.substring(0, 1000)}`,
        'judiciary'
      );
    } catch {
      businessName = null;
    }
  }

  if (!businessName) return null;

  return {
    name: businessName,
    category: 'Legal',
    event_type: 'court_ruling',
    source_url: article.url,
    summary_es: `Resolución judicial: ${article.title.substring(0, 200)}`,
    summary_en: `Court ruling: ${article.title.substring(0, 200)}`,
    raw_data: {
      scraper: 'judiciary',
      scraped_at: new Date().toISOString(),
      article_title: article.title,
    },
  };
}

// Track if AI is available
let useAI = false;

/**
 * Scrape paginated judiciary news for backfill mode.
 */
async function scrapeJudiciaryBackfill() {
  const allArticles = [];
  let consecutiveEmpty = 0;

  for (let page = 1; page <= MAX_BACKFILL_PAGES; page++) {
    const url = page === 1 ? OJ_NEWS : `${OJ_NEWS}/page/${page}/`;
    console.log(`  📄 ${url}`);

    const html = await fetchPage(url);
    if (!html) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
      continue;
    }

    const $ = cheerio.load(html);
    const pageArticles = [];

    const selectors = [
      'article', '.views-row', '.node', '.post',
      'div[class*="noticia"]', 'div[class*="news"]',
      '.field-content', 'li[class*="item"]'
    ];

    let $items = $([]);
    for (const sel of selectors) {
      $items = $(sel);
      if ($items.length > 0) break;
    }

    if ($items.length > 0) {
      $items.each((_, el) => {
        const title = $(el).find('h2, h3, h4, .title, a').first().text().trim();
        const link = $(el).find('a').first().attr('href') || '';
        const text = $(el).text().toLowerCase();
        // In backfill, be more permissive — grab anything that might be business-related
        const isRelevant = BACKFILL
          ? COURT_KEYWORDS.some(k => text.includes(k)) || text.includes('empresa') || text.includes('s.a.')
          : COURT_KEYWORDS.some(k => text.includes(k));

        if (title && isRelevant) {
          pageArticles.push({
            title,
            url: link.startsWith('http') ? link : `${OJ_BASE}${link}`,
          });
        }
      });
    }

    if (pageArticles.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) {
        console.log(`    ⏭️  2 consecutive empty pages — stopping`);
        break;
      }
    } else {
      consecutiveEmpty = 0;
      allArticles.push(...pageArticles);
      console.log(`    Found ${pageArticles.length} articles`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  return allArticles;
}

// ——— Main ———
async function main() {
  console.log(`⚖️  Judiciary Scraper — Registro Panamá${BACKFILL ? ' (BACKFILL MODE)' : ''}`);
  console.log('========================================\n');

  useAI = !!process.env.ANTHROPIC_API_KEY;
  if (useAI) {
    console.log('🤖 AI entity extraction enabled\n');
  }

  const articles = BACKFILL ? await scrapeJudiciaryBackfill() : await scrapeJudiciaryNews();

  // Deduplicate by URL
  const seen = new Set();
  const unique = articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  console.log(`\n📊 Total unique articles: ${unique.length}`);

  const events = [];

  for (const article of unique.slice(0, MAX_ARTICLES)) {
    console.log(`  📄 Parsing: ${article.title.substring(0, 60)}...`);
    const event = await parseArticle(article);
    if (event) events.push(event);
    await new Promise(r => setTimeout(r, BACKFILL ? 2000 : 1500));
  }

  if (events.length === 0) {
    console.log('\n⚠️  No parseable court ruling events found this run.');
    console.log('   The judiciary site may require manual review.');
    process.exit(0);
  }

  const result = await batchIngest(events);
  logScrapeResult('Judiciary', { ...result, total: events.length });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
