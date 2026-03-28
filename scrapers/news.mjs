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
 * Extract business name from article for association.
 * For news mentions, we use the article title as the summary
 * and attempt to find a business name.
 */
function articleToEvent(article) {
  // Try to extract a business name from the title
  const titlePatterns = [
    /^([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s&\.]+?)\s*(?:anuncia|inaugura|lanza|abre|cierra|adquiere|invierte|expande|recibe|firma|gana|pierde|enfrenta)/i,
    /(?:de|para|con|en)\s+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s&\.]{3,30}?)(?:\s*$|\s+(?:en|de|por|para))/i,
  ];

  let businessName = null;
  for (const pattern of titlePatterns) {
    const match = article.title.match(pattern);
    if (match) {
      businessName = match[1].trim();
      break;
    }
  }

  // If we can't identify a specific business, create a general market event
  // using a sanitized version of the title
  if (!businessName) {
    businessName = article.title.substring(0, 60).replace(/[^\w\sáéíóúñÁÉÍÓÚÑ&.,-]/g, '').trim();
    if (!businessName || businessName.length < 5) return null;
  }

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

  const events = unique
    .map(articleToEvent)
    .filter(Boolean)
    .slice(0, 30); // Limit per run

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
