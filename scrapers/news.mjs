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
  console.log('📰 Panama Business News Scraper');
  console.log('================================\n');

  const allArticles = [];

  for (const source of SOURCES) {
    const articles = await scrapeSource(source);
    allArticles.push(...articles);
    await new Promise(r => setTimeout(r, 2000)); // Polite delay between sources
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = allArticles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  console.log(`\n📊 Total unique articles: ${unique.length}`);

  // articleToEvent is now async (uses Claude)
  const eventResults = await Promise.all(unique.slice(0, 30).map(articleToEvent));
  const events = eventResults.filter(Boolean);

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
