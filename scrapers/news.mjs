/**
 * Panama Business News Scraper — Registro Panamá
 *
 * Scrapes major Panamanian news outlets for business-related articles:
 * - La Prensa (prensa.com)
 * - La Estrella de Panamá (laestrella.com.pa)
 * - TVN Noticias (tvn-2.com)
 * - Capital Financiero (capital.com.pa)
 *
 * Runs 2x/week via GitHub Actions.
 */

import * as cheerio from 'cheerio';
import { batchIngest, logScrapeResult } from './lib/ingest.mjs';
import { extractBusinessFromNews, requireAnthropicKey, logExtractionStats } from './lib/extract-entity.mjs';

const BACKFILL = process.argv.includes('--backfill');
const MAX_BACKFILL_PAGES = parseInt(process.env.BACKFILL_MAX_PAGES || '20', 10);
const MAX_ARTICLES = BACKFILL ? 200 : 30;

const SOURCES = [
  {
    name: 'La Estrella',
    url: 'https://www.laestrella.com.pa/economia',
    selectors: {
      articles: 'article, .story, div[class*="card"]',
      title: 'h2, h3, .headline, a',
      link: 'a',
    },
  },
  {
    name: 'Capital Financiero',
    url: 'https://elcapitalfinanciero.com/category/economia/',
    selectors: {
      articles: 'article, .post, .entry',
      title: 'h2, h3, .entry-title, a',
      link: 'a',
    },
  },
];

// Keywords indicating business events worth tracking
const BUSINESS_KEYWORDS = [
  'empresa', 'compañía', 'negocio', 'comercio', 'sociedad',
  'inauguración', 'apertura', 'cierre', 'quiebra', 'fusión',
  'adquisición', 'inversión', 'expansión', 'multa', 'sanción',
  'contrato', 'licitación', 'concesión', 'franquicia'
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.error(`  Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

async function scrapeSource(source) {
  console.log(`\n📰 Scraping ${source.name}...`);

  const html = await fetchPage(source.url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];

  $(source.selectors.articles).each((_, el) => {
    const title = $(el).find(source.selectors.title).first().text().trim();
    const href = $(el).find(source.selectors.link).first().attr('href') || '';
    const text = $(el).text().toLowerCase();

    const isRelevant = BUSINESS_KEYWORDS.some(k => text.includes(k));
    if (!title || !isRelevant) return;

    const fullUrl = href.startsWith('http') ? href : `${new URL(source.url).origin}${href}`;

    articles.push({
      title,
      url: fullUrl,
      source: source.name,
    });
  });

  // Fallback: scan all links if structured parsing fails
  if (articles.length === 0) {
    console.log(`  Using link-based fallback for ${source.name}...`);
    $('a').each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (text.length > 20 && BUSINESS_KEYWORDS.some(k => text.toLowerCase().includes(k))) {
        const fullUrl = href.startsWith('http') ? href : `${new URL(source.url).origin}${href}`;
        articles.push({ title: text, url: fullUrl, source: source.name });
      }
    });
  }

  console.log(`  Found ${articles.length} business-related articles from ${source.name}`);
  return articles;
}

/**
 * Scrape paginated archive pages for a single source (backfill mode).
 * WordPress sites use /page/N/, La Estrella may use different pagination.
 */
async function scrapeSourceBackfill(source) {
  console.log(`\n📰 BACKFILL: Scraping ${source.name} archive...`);
  const allArticles = [];
  let consecutiveEmpty = 0;
  const origin = new URL(source.url).origin;

  for (let page = 1; page <= MAX_BACKFILL_PAGES; page++) {
    const url = page === 1 ? source.url : `${source.url}page/${page}/`;
    console.log(`  📄 ${url}`);

    const html = await fetchPage(url);
    if (!html) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) {
        console.log(`    ⏭️  2 consecutive failures — done with ${source.name}`);
        break;
      }
      continue;
    }

    const $ = cheerio.load(html);
    const pageArticles = [];

    $(source.selectors.articles).each((_, el) => {
      const title = $(el).find(source.selectors.title).first().text().trim();
      const href = $(el).find(source.selectors.link).first().attr('href') || '';
      const text = $(el).text().toLowerCase();

      // In backfill mode, be more permissive — any article from business sections is relevant
      const isRelevant = BUSINESS_KEYWORDS.some(k => text.includes(k));
      if (!title || (!isRelevant && !BACKFILL)) return;
      // In backfill, still require SOME business signal
      if (BACKFILL && !isRelevant && !text.includes('s.a.') && !text.includes('panam')) return;

      const fullUrl = href.startsWith('http') ? href : `${origin}${href}`;
      pageArticles.push({ title, url: fullUrl, source: source.name });
    });

    // Fallback: link scanning
    if (pageArticles.length === 0) {
      $('a').each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr('href') || '';
        if (text.length > 20 && BUSINESS_KEYWORDS.some(k => text.toLowerCase().includes(k))) {
          const fullUrl = href.startsWith('http') ? href : `${origin}${href}`;
          pageArticles.push({ title: text, url: fullUrl, source: source.name });
        }
      });
    }

    if (pageArticles.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) {
        console.log(`    ⏭️  2 consecutive empty pages — done with ${source.name}`);
        break;
      }
    } else {
      consecutiveEmpty = 0;
      allArticles.push(...pageArticles);
      console.log(`    Found ${pageArticles.length} articles`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`  📊 Total from ${source.name}: ${allArticles.length} articles`);
  return allArticles;
}

/**
 * Convert an article to a Registro Panama event using Claude for entity extraction.
 */
async function articleToEvent(article) {
  const businessName = await extractBusinessFromNews(article.title, '');
  if (!businessName) return null;

  return {
    name: businessName,
    category: 'Noticias',
    event_type: 'news_mention',
    source_url: article.url,
    summary_es: article.title.substring(0, 300),
    summary_en: `News: ${article.title.substring(0, 300)}`,
    raw_data: {
      scraper: 'news',
      scraped_at: new Date().toISOString(),
      source_outlet: article.source,
    },
  };
}

// ——— Main ———
async function main() {
  requireAnthropicKey();
  console.log(`📰 Panama Business News Scraper${BACKFILL ? ' (BACKFILL MODE)' : ''}`);
  console.log('================================\n');

  const allArticles = [];

  for (const source of SOURCES) {
    const articles = BACKFILL
      ? await scrapeSourceBackfill(source)
      : await scrapeSource(source);
    allArticles.push(...articles);
    await new Promise(r => setTimeout(r, 2000));
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = allArticles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  console.log(`\n📊 Total unique articles: ${unique.length}`);

  // Process articles sequentially in backfill (rate limit friendly), parallel in normal mode
  const toProcess = unique.slice(0, MAX_ARTICLES);
  let events;

  if (BACKFILL) {
    events = [];
    for (const article of toProcess) {
      const event = await articleToEvent(article);
      if (event) events.push(event);
    }
  } else {
    const eventResults = await Promise.all(toProcess.map(articleToEvent));
    events = eventResults.filter(Boolean);
  }

  logExtractionStats();

  if (events.length === 0) {
    console.log('\n⚠️  No parseable business events found this run.');
    process.exit(0);
  }

  const result = await batchIngest(events);
  logScrapeResult('Panama News', { ...result, total: events.length });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
