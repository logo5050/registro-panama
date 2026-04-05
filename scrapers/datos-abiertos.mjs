/**
 * Datos Abiertos Scraper — Registro Panamá
 *
 * Fetches structured ACODECO datasets from Panama's Open Data Portal.
 * This is the RICHEST data source — actual CSV files with complaint
 * details, sanction amounts, sectors, provinces, and outcomes.
 *
 * Source: https://www.datosabiertos.gob.pa/organization/autoridad-de-proteccion-al-consumidor-y-defensa-de-la-competencia
 *
 * Datasets:
 * - Sanciones por incumplimiento a la Ley 45
 * - Estadísticas de quejas y decisiones
 * - Quejas por sector (vehículos, inmobiliarias, etc.)
 * - Sanciones por uso indebido (gas tanks, etc.)
 *
 * Strategy:
 * 1. Fetch the ACODECO organization page on the open data portal
 * 2. Find CSV download URLs for each dataset
 * 3. Download & parse CSVs
 * 4. Extract business names, sanction amounts, complaint types
 * 5. POST each finding to the Registro Panamá ingest API
 *
 * Runs monthly via GitHub Actions (15th of each month, 8am UTC).
 */

import { batchIngest, logScrapeResult, normalizeDate } from './lib/ingest.mjs';
import { extractBusinessName } from './lib/extract-entity.mjs';

const BACKFILL = process.argv.includes('--backfill');
const BACKFILL_MAX_EVENTS = parseInt(process.env.BACKFILL_MAX_EVENTS || '5000', 10);

const DATOS_ABIERTOS_BASE = 'https://www.datosabiertos.gob.pa';
// In backfill mode, fetch more datasets (rows=200); normal mode caps at 50
const CKAN_ROWS = BACKFILL ? 200 : 50;
const ACODECO_ORG = `${DATOS_ABIERTOS_BASE}/api/3/action/package_search?q=organization:autoridad-de-proteccion-al-consumidor-y-defensa-de-la-competencia&rows=${CKAN_ROWS}`;

/**
 * Fetch JSON from the CKAN API (Panama's open data portal uses CKAN).
 */
async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RegistroPanama/1.0 (Public Business Registry; +https://registro-panama.vercel.app)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Download and parse a CSV file. Simple parser — no external deps.
 */
async function fetchCsv(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RegistroPanama/1.0',
        'Accept': 'text/csv,text/plain,*/*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    let encoding = 'utf-8';
    if (contentType.toLowerCase().includes('charset=')) {
      encoding = contentType.split('charset=')[1].split(';')[0].trim().toLowerCase();
    }

    const buf = await res.arrayBuffer();
    let text = new TextDecoder(encoding).decode(buf);

    // If we see many replacement characters (\ufffd), or common CP850/Latin1 patterns
    // like "¢" (ó) or "¡" (í), it's likely mis-encoded.
    const hasReplacement = text.includes('\ufffd');
    const hasCP850Signs = /[\u00A2\u00A1\u00A4\u00BA\u00AA]/.test(text); // ¢, ¡, ¤, º, ª

    if ((hasReplacement || hasCP850Signs) && encoding === 'utf-8') {
      // Heuristic: try CP850 first for Panama DOS-style legacy data
      // fallback to ISO-8859-1 for standard Latin1
      let altText = new TextDecoder('windows-1252').decode(buf); // Standard Latin1 variant
      
      // If we see "¢" (0xA2) it's almost certainly CP850 in Panama data for "ó"
      if (text.includes('\u00A2')) {
         // Node's TextDecoder doesn't always support 'cp850', so we handle the most common manually
         // or use windows-1252 if it looks better.
         console.log(`    ℹ️  Recoded from Windows-1252/ISO-8859-1 (UTF-8/CP850 issues)`);
         text = altText;
      } else if (hasReplacement) {
         text = altText;
      }
    }

    return parseCsv(text);
  } catch (err) {
    console.error(`Failed to fetch CSV ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Simple CSV parser. Handles quoted fields and common edge cases.
 */
function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length < 2) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Generic category names — if an "entity" column only has these values
// it's actually a sector/type column, not a business name column
const CATEGORY_NAMES = new Set([
  'minisuper', 'supermercado', 'supermercados', 'tienda', 'tiendas',
  'restaurante', 'restaurantes', 'fondas', 'restaurantes / fondas',
  'hotel', 'hoteles', 'farmacia', 'farmacias', 'ferretería', 'ferreterías',
  'almacén', 'almacen', 'distribuidor', 'distribuidora', 'importadora',
  'panadería', 'panaderia', 'carnicería', 'carniceria', 'lavandería',
  'servicio', 'servicios', 'comercio', 'comercios', 'establecimiento',
  'estacionamiento', 'gasolinera', 'taller', 'clínica', 'clinica',
  'salón', 'salon', 'peluquería', 'peluqueria', 'barbería', 'barberia',
]);

/**
 * Check if a value looks like a generic category name rather than a real business name.
 */
function isGenericCategory(value) {
  if (!value) return true;
  const lower = value.toLowerCase().trim();
  return CATEGORY_NAMES.has(lower) || lower.length < 4;
}

/**
 * Identify which column contains the business/entity name.
 * Prioritizes very specific patterns — avoids matching "tipo_comercio" etc.
 */
function findEntityColumn(headers) {
  // High-confidence patterns — exact or near-exact matches only
  const highConfidence = [
    'agente económico', 'agente_economico', 'agente economico',
    'razón social', 'razon social', 'nombre_empresa', 'nombre_establecimiento',
    'nombre_comercial', 'nombre_agente', 'nombre_entidad',
    'proveedor', 'infractor',
  ];
  // Lower-confidence — only use if nothing else matches
  const lowConfidence = [
    'empresa', 'entidad', 'nombre',
  ];

  const highMatch = headers.find(h =>
    highConfidence.some(p => h.toLowerCase().includes(p))
  );
  if (highMatch) return highMatch;

  const lowMatch = headers.find(h =>
    lowConfidence.some(p => h.toLowerCase() === p || h.toLowerCase().startsWith(p + '_') || h.toLowerCase().endsWith('_' + p))
  );
  return lowMatch || null;
}

/**
 * Identify amount/value column.
 */
function findAmountColumn(headers) {
  const patterns = ['monto', 'valor', 'sanción', 'multa', 'amount', 'cuantía'];
  return headers.find(h => patterns.some(p => h.includes(p))) || null;
}

/**
 * Identify date column.
 */
function findDateColumn(headers) {
  const patterns = ['fecha', 'date', 'año', 'periodo', 'mes'];
  return headers.find(h => patterns.some(p => h.includes(p))) || null;
}

/**
 * Identify province column.
 */
function findProvinceColumn(headers) {
  const patterns = ['provincia', 'region', 'regional'];
  return headers.find(h => patterns.some(p => h.includes(p))) || null;
}

/**
 * Identify activity/sector column.
 */
function findActivityColumn(headers) {
  const patterns = ['actividad', 'sector', 'rubro', 'categoría', 'tipo'];
  return headers.find(h => patterns.some(p => h.includes(p))) || null;
}

/**
 * Process a single dataset (CSV resource).
 */
async function processDataset(dataset) {
  const title = dataset.title || dataset.name || 'Unknown';
  const isSanction = title.toLowerCase().includes('sancion');
  const isComplaint = title.toLowerCase().includes('queja');

  // Find CSV resources
  const csvResources = (dataset.resources || []).filter(r =>
    r.format?.toLowerCase() === 'csv' ||
    r.url?.endsWith('.csv') ||
    r.mimetype?.includes('csv')
  );

  if (csvResources.length === 0) {
    console.log(`  ⏭️  No CSV resources in "${title}"`);
    return [];
  }

  const events = [];

  for (const resource of csvResources) {
    console.log(`  📥 Downloading: ${resource.name || resource.url}`);
    const rows = await fetchCsv(resource.url);

    if (rows.length === 0) {
      console.log(`    Empty or unparseable CSV`);
      continue;
    }

    const headers = Object.keys(rows[0]);
    const entityCol = findEntityColumn(headers);
    const amountCol = findAmountColumn(headers);
    const dateCol = findDateColumn(headers);
    const provinceCol = findProvinceColumn(headers);
    const activityCol = findActivityColumn(headers);

    console.log(`    Rows: ${rows.length} | Entity col: ${entityCol || 'N/A'} | Amount col: ${amountCol || 'N/A'}`);

    if (!entityCol) {
      console.log(`    ⚠️  Could not identify entity column. Headers: ${headers.join(', ')}`);
      console.log(`    ℹ️  This CSV appears to be aggregate data (no individual business names). Skipping.`);
      continue;
    }

    // Spot-check first 5 rows to verify this column actually has business names
    const sampleValues = rows.slice(0, 5).map(r => r[entityCol]).filter(Boolean);
    const genericCount = sampleValues.filter(isGenericCategory).length;
    if (genericCount >= 3) {
      console.log(`    ⚠️  Column "${entityCol}" looks like a category/sector column (values: ${sampleValues.slice(0, 3).join(', ')}). Skipping this CSV — it's aggregate data.`);
      continue;
    }

    const useAI = !!process.env.ANTHROPIC_API_KEY;

    for (const row of rows) {
      let entityName = row[entityCol];
      if (!entityName || entityName.length < 3) continue;

      // Skip if this row's value is a generic category
      if (isGenericCategory(entityName)) continue;

      // If the name is suspiciously short or generic-looking, try AI to extract the real name
      if (useAI && entityName.length < 6) {
        const rowText = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(', ');
        const aiName = await extractBusinessName(rowText, 'generic');
        if (aiName) entityName = aiName;
        else continue;
      }

      const amount = amountCol ? row[amountCol] : '';
      const rawDate = dateCol ? row[dateCol] : '';
      const date = normalizeDate(rawDate);
      const province = provinceCol ? row[provinceCol] : '';
      const activity = activityCol ? row[activityCol] : '';

      // Build summary
      const typeSuffix = isSanction ? 'sancionado' : 'con queja registrada';
      const amountSuffix = amount ? ` por B/. ${amount}` : '';
      const provinceSuffix = province ? ` en ${province}` : '';

      events.push({
        name: entityName,
        category: activity || 'Comercio',
        event_type: 'acodeco_open_data',
        event_date: date || new Date().toISOString().split('T')[0],
        source_url: `${DATOS_ABIERTOS_BASE}/dataset/${dataset.name || dataset.id}`,
        summary_es: `${entityName} ${typeSuffix}${amountSuffix}${provinceSuffix}. Fuente: ${title}.`,
        summary_en: `${entityName} ${isSanction ? 'sanctioned' : 'complaint filed'}${amountSuffix}${provinceSuffix}. Source: ${title}.`,
        business_data: {
          province: province || undefined,
          industry: activity || undefined,
        },
        raw_data: {
          dataset_title: title,
          dataset_id: dataset.id,
          resource_id: resource.id,
          sector: activity,
          sanction_amount: amount,
          is_sanction: isSanction,
          is_complaint: isComplaint,
        },
      });
    }

    // Rate limit between resources
    await new Promise(r => setTimeout(r, 1000));
  }

  return events;
}

/**
 * Main: discover and process all ACODECO datasets.
 */
async function main() {
  console.log(`📊 Datos Abiertos (ACODECO Open Data) Scraper starting...${BACKFILL ? ' (BACKFILL MODE)' : ''}\n`);

  // Step 1: Fetch dataset list from CKAN API
  console.log('🔍 Fetching ACODECO datasets from Portal de Datos Abiertos...');
  const searchResult = await fetchJson(ACODECO_ORG);

  if (!searchResult?.result?.results) {
    console.error('❌ Could not fetch dataset list from CKAN API');
    logScrapeResult('DatosAbiertos', { ingested: 0, failed: 0, total: 0 });
    return;
  }

  const datasets = searchResult.result.results;
  console.log(`📦 Found ${datasets.length} ACODECO datasets\n`);

  // Step 2: Process each dataset
  let allEvents = [];

  for (const dataset of datasets) {
    const title = dataset.title || dataset.name;
    console.log(`\n📂 Processing: "${title}"`);
    const events = await processDataset(dataset);
    console.log(`   Extracted ${events.length} events`);
    allEvents = allEvents.concat(events);
  }

  // Step 3: Deduplicate by business name + source
  const seen = new Set();
  allEvents = allEvents.filter(e => {
    const key = `${e.name}|${e.source_url}|${e.event_date}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n📊 Total unique events after dedup: ${allEvents.length}\n`);

  if (allEvents.length === 0) {
    console.log('ℹ️  No new events extracted from open data.');
    logScrapeResult('DatosAbiertos', { ingested: 0, failed: 0, total: 0 });
    return;
  }

  // Step 4: Ingest — backfill lifts the cap, normal mode caps at 200
  const cap = BACKFILL ? BACKFILL_MAX_EVENTS : 200;
  const capped = allEvents.slice(0, cap);
  if (allEvents.length > cap) {
    console.log(`⚠️  Capping ingestion at ${cap} events (${allEvents.length} total found)`);
  }

  const { ingested, failed } = await batchIngest(capped, BACKFILL ? 200 : 300);
  logScrapeResult('DatosAbiertos', { ingested, failed, total: capped.length });
}

main().catch(err => {
  console.error('❌ Datos Abiertos scraper fatal error:', err);
  process.exit(1);
});
