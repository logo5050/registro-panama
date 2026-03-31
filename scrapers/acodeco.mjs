/**
 * ACODECO Scraper — Registro Panamá
 *
 * Scrapes the ACODECO (Autoridad de Protección al Consumidor) website
 * for consumer protection infractions and sanctions against businesses.
 *
 * Source: https://www.acodeco.gob.pa
 *
 * Strategy:
 * 1. Fetch the ACODECO news/press releases page
 * 2. Parse articles mentioning infractions, multas (fines), sanciones
 * 3. Extract business names and infraction details
 * 4. POST each finding to the Registro Panamá ingest API
 *
 * Runs weekly via GitHub Actions.
 */

import * as cheerio from 'cheerio';
import { batchIngest, logScrapeResult } from './lib/ingest.mjs';
import { extractBusinessFromACODECO, requireAnthropicKey, logExtractionStats } from './lib/extract-entity.mjs';

const ACODECO_BASE = 'https://www.acodeco.gob.pa';
const ACODECO_NEWS = `${ACODECO_BASE}/inicio/noticias/`;

// Keywords that indicate a business infraction
const INFRACTION_KEYWORDS = [
  'multa', 'sanción', 'infracción', 'resolución', 'sancionada',
  'multada', 'penalizada', 'amonestación', 'denuncia', 'violación'
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
    console.error(`Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Parse ACODECO news listing page for articles about infractions.
 */
async function scrapeAcodecoNews() {
  console.log('🔍 Scraping ACODECO news...');

  const html = await fetchPage(ACODECO_NEWS);
  if (!html) {
    console.error('Could not fetch ACODECO news page');
    return [];
  }

  const $ = cheerio.load(html);
  const articles = [];

  // ACODECO uses various article listing patterns. We try the most common ones.
  // Selectors may need adjustment as the site evolves.
  const selectors = [
    'article', '.noticia', '.post', '.entry',
    '.views-row', '.node--type-article',
    'div[class*="noticia"]', 'div[class*="news"]',
    'li[class*="item"]'
  ];

  let $items = $([]);
  for (const sel of selectors) {
    $items = $(sel);
    if ($items.length > 0) break;
  }

  // Fallback: find all links with infraction keywords
  if ($items.length === 0) {
    console.log('  Using link-based fallback parser...');
    $('a').each((_, el) => {
      const text = $(el).text().toLowerCase();
      const href = $(el).attr('href') || '';
      const hasKeyword = INFRACTION_KEYWORDS.some(k => text.includes(k));

      if (hasKeyword && href) {
        articles.push({
          title: $(el).text().trim(),
          url: href.startsWith('http') ? href : `${ACODECO_BASE}${href}`,
        });
      }
    });
  } else {
    $items.each((_, el) => {
      const title = $(el).find('h2, h3, h4, .title, a').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';
      const text = $(el).text().toLowerCase();
      const hasKeyword = INFRACTION_KEYWORDS.some(k => text.includes(k));

      if (title && hasKeyword) {
        articles.push({
          title,
          url: link.startsWith('http') ? link : `${ACODECO_BASE}${link}`,
        });
      }
    });
  }

  console.log(`  Found ${articles.length} potential infraction articles`);
  return articles;
}

/**
 * For each article, try to extract business name and infraction details.
 */
async function parseArticleDetails(article) {
  const html = await fetchPage(article.url);
  if (!html) return null;

  const $ = cheerio.load(html);

  // Get article body text
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

  // Try to find a date in the text (e.g. 15 de marzo de 2026)
  let eventDate = new Date().toISOString().split('T')[0];
  const dateMatch = bodyText.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/i);
  if (dateMatch) {
    const months = {
      enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
      julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
    };
    const day = dateMatch[1].padStart(2, '0');
    const month = months[dateMatch[2].toLowerCase()];
    const year = dateMatch[3];
    eventDate = `${year}-${month}-${day}`;
  }

  // Claude extracts the actual sanctioned business name from the article
  const businessName = await extractBusinessFromACODECO(article.title, bodyText);
  if (!businessName) return null;

  // Extract a summary (first 200 chars of body after cleaning)
  const cleanBody = bodyText.replace(/\s+/g, ' ').substring(0, 300);

  return {
    name: businessName,
    category: 'Comercio',
    event_type: 'acodeco_infraction',
    event_date: eventDate,
    source_url: article.url,
    summary_es: `ACODECO: ${article.title.substring(0, 200)}`,
    summary_en: `ACODECO infraction reported: ${article.title.substring(0, 200)}`,
    business_data: {},
    raw_data: {
      scraper: 'acodeco',
      scraped_at: new Date().toISOString(),
      article_title: article.title,
      body_excerpt: cleanBody,
    },
  };
}

// ——— Main ———
async function main() {
  requireAnthropicKey();
  console.log('🏛️  ACODECO Scraper — Registro Panamá');
  console.log('=====================================\n');

  const articles = await scrapeAcodecoNews();
  const events = [];

  for (const article of articles.slice(0, 20)) { // Limit to 20 articles per run
    console.log(`  📄 Parsing: ${article.title.substring(0, 60)}...`);
    const event = await parseArticleDetails(article);
    if (event) events.push(event);

    // Be polite: wait between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  if (events.length === 0) {
    console.log('\n⚠️  No parseable infraction events found this run.');
    console.log('   This is normal — ACODECO may not have new infractions this week.');
    process.exit(0);
  }

  logExtractionStats();
  const result = await batchIngest(events);
  logScrapeResult('ACODECO', { ...result, total: events.length });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
