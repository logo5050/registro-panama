/**
 * SBP Scraper — Registro Panamá
 *
 * Scrapes the Superintendencia de Bancos de Panamá (SBP) website
 * for published banking sanctions (fines > B/. 5,000).
 *
 * Source: https://www.superbancos.gob.pa/sanciones
 *
 * Legal basis: Article 189 of the Banking Law mandates public disclosure
 * of sanctions including entity name, type, and amount.
 *
 * Strategy:
 * 1. Fetch the sanctions page (HTML table)
 * 2. Parse rows: entity name, sanction type, amount, date, legal basis
 * 3. POST each finding to the Registro Panamá ingest API
 *
 * Runs monthly via GitHub Actions (1st of each month, 8am UTC).
 */

import * as cheerio from 'cheerio';
import { batchIngest, logScrapeResult, normalizeDate } from './lib/ingest.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BACKFILL = process.argv.includes('--backfill');
const BACKFILL_START_YEAR = parseInt(process.env.BACKFILL_START_YEAR || '2010', 10);

const SBP_SANCTIONS_URL = 'https://superbancos.gob.pa/es/supervisados-y-registros/sanciones';
const SBP_SANCTIONS_EN = 'https://superbancos.gob.pa/en/supervised-and-registries/sanctions';

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
 * Parse the SBP sanctions page.
 * The page contains a table or structured list of sanctioned entities.
 */
async function scrapeSanctions() {
  console.log('🏦 Scraping SBP sanctions page...');

  // Try Spanish page first, fall back to English
  let html = await fetchPage(SBP_SANCTIONS_URL);
  let language = 'es';

  if (!html) {
    console.log('  Falling back to English page...');
    html = await fetchPage(SBP_SANCTIONS_EN);
    language = 'en';
  }

  if (!html) {
    console.error('Could not fetch SBP sanctions page');
    return [];
  }

  const $ = cheerio.load(html);
  const sanctions = [];

  // Strategy 1: Parse HTML tables
  $('table').each((_, table) => {
    const $table = $(table);
    const headers = [];

    // Extract headers
    $table.find('thead th, tr:first-child th, tr:first-child td').each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    // If no clear headers, skip this table
    if (headers.length < 2) return;

    // Parse rows
    $table.find('tbody tr, tr').each((idx, row) => {
      if (idx === 0 && headers.length > 0) return; // skip header row

      const cells = [];
      $(row).find('td').each((_, td) => {
        cells.push($(td).text().trim());
      });

      if (cells.length < 2) return;

      // Try to identify columns by header name
      const entityIdx = headers.findIndex(h =>
        h.includes('entidad') || h.includes('entity') || h.includes('nombre') ||
        h.includes('sujeto') || h.includes('name') || h.includes('banco')
      );
      const amountIdx = headers.findIndex(h =>
        h.includes('monto') || h.includes('amount') || h.includes('multa') ||
        h.includes('sanción') || h.includes('cuantía')
      );
      const dateIdx = headers.findIndex(h =>
        h.includes('fecha') || h.includes('date') || h.includes('año') || h.includes('year')
      );
      const typeIdx = headers.findIndex(h =>
        h.includes('tipo') || h.includes('type') || h.includes('concepto') || h.includes('régimen')
      );

      const entity = cells[entityIdx >= 0 ? entityIdx : 0] || '';
      const amount = cells[amountIdx >= 0 ? amountIdx : 1] || '';
      const date = cells[dateIdx >= 0 ? dateIdx : 2] || '';
      const sanctionType = cells[typeIdx >= 0 ? typeIdx : 3] || 'Sanción bancaria';

      if (entity.length > 2) {
        sanctions.push({
          entity: entity.replace(/\s+/g, ' '),
          amount,
          date,
          sanctionType,
          language,
        });
      }
    });
  });

  // Strategy 2: If no tables, try structured div/list patterns
  if (sanctions.length === 0) {
    console.log('  No tables found, trying structured content fallback...');

    // Look for repeated patterns in the page
    $('.view-content .views-row, .sancion-item, .field-content, article').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 10) return;

      // Try to extract entity name (usually the first bold or heading)
      const entityMatch = $(el).find('strong, h3, h4, .field--name-title').first().text().trim();
      if (entityMatch) {
        sanctions.push({
          entity: entityMatch,
          amount: '',
          date: '',
          sanctionType: 'Sanción bancaria',
          language,
        });
      }
    });
  }

  // Strategy 3: Parse year-filtered pages (SBP has year filter)
  // In backfill mode: scan ALL years from BACKFILL_START_YEAR to now
  // In normal mode: only check current + previous year if nothing found yet
  const shouldTryYears = BACKFILL || sanctions.length === 0;

  if (shouldTryYears) {
    const startYear = BACKFILL ? BACKFILL_START_YEAR : currentYear - 1;
    console.log(`  ${BACKFILL ? '🔄 BACKFILL:' : ''} Trying year-specific pages (${startYear}–${currentYear})...`);

    // SBP often uses different path structures, try a few common ones
    const pathPatterns = [
      'es/supervisados-y-registros/sanciones',
      'es/sanciones',
      'es/transparencia/sanciones',
    ];

    for (const path of pathPatterns) {
      const baseUrl = `https://superbancos.gob.pa/${path}`;
      console.log(`    🔍 Testing pattern: ${baseUrl}...`);
      
      for (let year = currentYear; year >= startYear; year--) {
        const yearUrl = `${baseUrl}?field_year_sancion_value=${year}`;
        const yearHtml = await fetchPage(yearUrl);
        if (!yearHtml) continue;

        const $y = cheerio.load(yearHtml);
        let yearCount = 0;

        $y('table tbody tr, .views-row').each((_, el) => {
          const cells = [];
          $y(el).find('td').each((__, td) => cells.push($y(td).text().trim()));
          if (cells.length >= 2 && cells[0].length > 2 && !cells[0].toLowerCase().includes('entidad')) {
            sanctions.push({
              entity: cells[0],
              amount: cells[1] || '',
              date: `${year}`,
              sanctionType: cells[2] || 'Sanción bancaria',
              language,
            });
            yearCount++;
          }
        });

        if (yearCount > 0) {
          console.log(`      ✅ Found ${yearCount} sanctions for ${year} using pattern ${path}`);
        }
        await new Promise(r => setTimeout(r, BACKFILL ? 1000 : 500));
      }
      
      if (sanctions.length > 0) break; // If we found data with one pattern, stop
    }
  }

  return sanctions;
}

/**
 * Main: scrape SBP sanctions and ingest.
 */
async function main() {
  console.log(`🏦 SBP (Superintendencia de Bancos) Scraper starting...${BACKFILL ? ' (BACKFILL MODE)' : ''}\n`);

  const sanctions = await scrapeSanctions();

  console.log(`\n📊 Total sanctions found: ${sanctions.length}\n`);

  if (sanctions.length === 0) {
    console.log('ℹ️  No sanctions found on SBP page.');
    logScrapeResult('SBP', { ingested: 0, failed: 0, total: 0 });
    return;
  }

  // Deduplicate by entity + amount
  const seen = new Set();
  const unique = sanctions.filter(s => {
    const key = `${s.entity}|${s.amount}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Transform to ingest format
  const events = unique.map(s => ({
    name: s.entity,
    category: 'Banca y Finanzas',
    event_type: 'sbp_sanction',
    event_date: normalizeDate(s.date) || new Date().toISOString().split('T')[0],
    source_url: SBP_SANCTIONS_URL,
    summary_es: `Sanción bancaria contra ${s.entity}${s.amount ? ` por ${s.amount}` : ''}. ${s.sanctionType}.`,
    summary_en: `Banking sanction against ${s.entity}${s.amount ? ` for ${s.amount}` : ''}. Published by Superintendencia de Bancos de Panamá.`,
    business_data: {
      industry: 'Banca y Finanzas',
    },
    raw_data: {
      sector: 'banca',
      sanction_amount: s.amount,
      sanction_type: s.sanctionType,
    },
  }));

  const { ingested, failed } = await batchIngest(events, 500);
  logScrapeResult('SBP', { ingested, failed, total: events.length });
}

main().catch(err => {
  console.error('❌ SBP scraper fatal error:', err);
  process.exit(1);
});
