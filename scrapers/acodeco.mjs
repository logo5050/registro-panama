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
import { extractBusinessFromACODECO, extractBusinessFromPDF, requireAnthropicKey, logExtractionStats } from './lib/extract-entity.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BACKFILL = process.argv.includes('--backfill');
const MAX_BACKFILL_PAGES = parseInt(process.env.BACKFILL_MAX_PAGES || '30', 10);
const MAX_ARTICLES = BACKFILL ? 500 : 20;

const ACODECO_BASE = 'https://www.acodeco.gob.pa';
const ACODECO_NEWS = `${ACODECO_BASE}/inicio/noticias/`;

// Additional ACODECO pages to scrape in backfill mode
const ACODECO_SECTIONS = [
  `${ACODECO_BASE}/inicio/noticias/`,
  `${ACODECO_BASE}/inicio/edictos/`,
  `${ACODECO_BASE}/inicio/resoluciones/`,
  `${ACODECO_BASE}/inicio/sanciones/`,
];

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
 * Download a PDF file and return its Buffer.
 */
async function fetchPdfBuffer(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RegistroPanama/1.0 (Public Business Registry; +https://registro-panama.vercel.app)',
        'Accept': 'application/pdf,*/*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(`    Failed to download PDF ${url}: ${err.message}`);
    return null;
  }
}

/**
 * For each article, try to extract business name and infraction details.
 *
 * Strategy (ordered by reliability):
 * 1. Find PDF links on the page → send to Claude Vision (best for edictos)
 * 2. Extract full body text → send to Claude text extraction (up to 3000 chars)
 * 3. Fall back to title-only extraction
 */
async function parseArticleDetails(article) {
  const html = await fetchPage(article.url);
  if (!html) return null;

  const $ = cheerio.load(html);

  // ——— Strategy 1: Find and process PDF links (most edictos are PDFs) ———
  const pdfLinks = [];
  $('a[href$=".pdf"], a[href*=".pdf?"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href) {
      const fullUrl = href.startsWith('http') ? href : `${ACODECO_BASE}${href}`;
      pdfLinks.push(fullUrl);
    }
  });
  // Also check for embedded PDFs (iframes, objects, embeds)
  $('iframe[src*=".pdf"], embed[src*=".pdf"], object[data*=".pdf"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data') || '';
    if (src) {
      const fullUrl = src.startsWith('http') ? src : `${ACODECO_BASE}${src}`;
      pdfLinks.push(fullUrl);
    }
  });

  let businessName = null;

  if (pdfLinks.length > 0) {
    console.log(`    📎 Found ${pdfLinks.length} PDF(s) — using Claude Vision`);
    // Try the first PDF (usually the edicto itself)
    const pdfBuffer = await fetchPdfBuffer(pdfLinks[0]);
    if (pdfBuffer && pdfBuffer.length > 0 && pdfBuffer.length < 20 * 1024 * 1024) {
      try {
        businessName = await extractBusinessFromPDF(article.title, pdfBuffer);
        if (businessName) {
          console.log(`    🤖 Vision extracted: "${businessName}"`);
        }
      } catch (err) {
        console.warn(`    ⚠️  PDF vision failed: ${err.message}`);
      }
    }
  }

  // ——— Strategy 2: Full body text extraction (send up to 3000 chars) ———
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

  // If PDF vision didn't find a name, try text extraction with MORE content
  if (!businessName) {
    // Send up to 3000 chars (was implicitly limited before)
    businessName = await extractBusinessFromACODECO(article.title, bodyText.substring(0, 3000));
  }

  // ——— Strategy 3: Title-only as last resort ———
  if (!businessName && bodyText.length < 50) {
    console.log(`    ⚠️  Very short body text (${bodyText.length} chars) — title-only extraction`);
    businessName = await extractBusinessFromACODECO(article.title, article.title);
  }

  if (!businessName) return null;

  // Extract a summary (first 500 chars of body after cleaning)
  const cleanBody = bodyText.replace(/\s+/g, ' ').substring(0, 500);

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

/**
 * Scrape a paginated section of ACODECO (for backfill).
 * Paginates through /page/2/, /page/3/ etc until empty.
 */
async function scrapeAcodecoSection(baseUrl) {
  const allArticles = [];
  let consecutiveEmpty = 0;

  for (let page = 1; page <= MAX_BACKFILL_PAGES; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;
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

    if ($items.length === 0) {
      // Fallback: link scanning
      $('a').each((_, el) => {
        const text = $(el).text().toLowerCase();
        const href = $(el).attr('href') || '';
        const hasKeyword = INFRACTION_KEYWORDS.some(k => text.includes(k));
        if (hasKeyword && href && text.length > 15) {
          pageArticles.push({
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

        if (title && (hasKeyword || BACKFILL)) {
          pageArticles.push({
            title,
            url: link.startsWith('http') ? link : `${ACODECO_BASE}${link}`,
          });
        }
      });
    }

    if (pageArticles.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) {
        console.log(`    ⏭️  2 consecutive empty pages — done with this section`);
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
  requireAnthropicKey();
  console.log(`🏛️  ACODECO Scraper — Registro Panamá${BACKFILL ? ' (BACKFILL MODE)' : ''}`);
  console.log('=====================================\n');

  let articles;

  if (BACKFILL) {
    // Deep crawl all ACODECO sections
    articles = [];
    for (const section of ACODECO_SECTIONS) {
      console.log(`\n🔍 Scraping section: ${section}`);
      const sectionArticles = await scrapeAcodecoSection(section);
      articles.push(...sectionArticles);
    }
    // Deduplicate by URL
    const seen = new Set();
    articles = articles.filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
    console.log(`\n📊 Total unique articles across all sections: ${articles.length}`);
  } else {
    articles = await scrapeAcodecoNews();
  }

  const events = [];

  for (const article of articles.slice(0, MAX_ARTICLES)) {
    console.log(`  📄 Parsing: ${article.title.substring(0, 60)}...`);
    const event = await parseArticleDetails(article);
    if (event) events.push(event);

    // Be polite: wait between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  if (events.length === 0) {
    console.log('\nℹ️  No parseable infraction events found this run.');
    logScrapeResult('ACODECO', { ingested: 0, failed: 0, total: 0 });
    return;
  }

  logExtractionStats();
  const result = await batchIngest(events);
  logScrapeResult('ACODECO', { ...result, total: events.length });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
