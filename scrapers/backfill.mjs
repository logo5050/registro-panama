#!/usr/bin/env node

/**
 * Backfill Runner — Registro Panamá
 *
 * Orchestrates all scrapers in --backfill mode to pull historical data.
 * Uses Claude Haiku for AI entity extraction across all sources.
 *
 * Usage:
 *   cd scrapers && npm install
 *   node backfill.mjs                    # Run all scrapers
 *   node backfill.mjs --only asep,sbp    # Run specific scrapers
 *   node backfill.mjs --dry-run          # Parse but don't ingest
 *   node backfill.mjs --max-pages 10     # Limit pagination depth
 *
 * Environment:
 *   INGEST_API_URL     — Ingest endpoint (required unless --dry-run)
 *   INGEST_SECRET      — Bearer token (required unless --dry-run)
 *   ANTHROPIC_API_KEY  — Claude API key (required for AI extraction)
 *   BACKFILL_MAX_PAGES — Override max pagination depth (default: per-scraper)
 *   BACKFILL_MAX_EVENTS — Override max events for Datos Abiertos (default: 5000)
 *   BACKFILL_START_YEAR — Override SBP start year (default: 2010)
 *
 * Estimated cost: ~$0.50–$2.00 for a full backfill (Claude Haiku is cheap)
 * Estimated time: 30–90 minutes depending on pagination depth
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ——— CLI Args ———
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyFlag = args.find(a => a.startsWith('--only'));
const onlyIdx = args.indexOf('--only');
const onlySources = onlyIdx >= 0 && args[onlyIdx + 1]
  ? args[onlyIdx + 1].split(',').map(s => s.trim().toLowerCase())
  : null;

const maxPagesFlag = args.indexOf('--max-pages');
const maxPages = maxPagesFlag >= 0 && args[maxPagesFlag + 1]
  ? args[maxPagesFlag + 1]
  : null;

// ——— Scraper Definitions ———
// Order: structured data first (fast, no AI), then AI-dependent scrapers.
// ACODECO is excluded by default because it already runs weekly and uses
// Claude Vision for PDF edictos (expensive). Use --only acodeco to include it.
const SCRAPERS = [
  {
    id: 'datos-abiertos',
    name: 'Datos Abiertos (ACODECO Open Data)',
    script: 'datos-abiertos.mjs',
    needsAI: false,
    description: 'CSV datasets from Panama Open Data Portal — richest structured data',
    estimatedTime: '5–15 min',
    defaultEnabled: true,
  },
  {
    id: 'sbp',
    name: 'SBP (Banking Sanctions)',
    script: 'sbp.mjs',
    needsAI: false,
    description: 'Historical banking sanctions from Superintendencia de Bancos',
    estimatedTime: '3–10 min',
    defaultEnabled: true,
  },
  {
    id: 'asep',
    name: 'ASEP (Utility Resolutions)',
    script: 'asep.mjs',
    needsAI: true,
    description: 'Telecom, electricity, water sanctions — deep WordPress pagination',
    estimatedTime: '10–30 min',
    defaultEnabled: true,
  },
  {
    id: 'acodeco',
    name: 'ACODECO (Consumer Protection)',
    script: 'acodeco.mjs',
    needsAI: true,
    description: 'Deep crawl edictos/resoluciones with PDF Vision — already runs weekly, opt-in only',
    estimatedTime: '15–45 min (uses Claude Vision for PDFs — higher cost)',
    defaultEnabled: false, // Already runs weekly; uses expensive PDF vision
  },
  {
    id: 'judiciary',
    name: 'Judiciary (Court Rulings)',
    script: 'judiciary.mjs',
    needsAI: true,
    description: 'Commercial court rulings — AI extraction for company names',
    estimatedTime: '5–20 min',
    defaultEnabled: true,
  },
  {
    id: 'news',
    name: 'Panama Business News',
    script: 'news.mjs',
    needsAI: true,
    description: 'La Estrella + Capital Financiero archive crawl',
    estimatedTime: '10–25 min',
    defaultEnabled: true,
  },
];

// ——— Helpers ———
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

async function runScraper(scraper) {
  const scriptPath = path.join(__dirname, scraper.script);

  const env = {
    ...process.env,
    // Pass through all env vars + backfill overrides
    ...(maxPages ? { BACKFILL_MAX_PAGES: maxPages } : {}),
  };

  // In dry-run mode, we'd need to modify the scrapers to support it
  // For now, just run them normally — the ingest API deduplicates anyway
  if (DRY_RUN) {
    console.log(`  ⏭️  DRY RUN — would run: node ${scraper.script} --backfill`);
    return { success: true, duration: 0, output: 'dry run' };
  }

  const start = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, '--backfill'], {
      cwd: __dirname,
      env,
      timeout: 20 * 60 * 1000, // 20 min max per scraper
      maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
    });

    const duration = Date.now() - start;
    const output = stdout + (stderr ? `\n${stderr}` : '');

    // Extract stats from output
    const ingestedMatch = output.match(/Ingested:\s*(\d+)/);
    const failedMatch = output.match(/Failed:\s*(\d+)/);
    const ingested = ingestedMatch ? parseInt(ingestedMatch[1]) : '?';
    const failed = failedMatch ? parseInt(failedMatch[1]) : '?';

    return { success: true, duration, ingested, failed, output };
  } catch (err) {
    const duration = Date.now() - start;
    return {
      success: false,
      duration,
      error: err.message,
      output: (err.stdout || '') + (err.stderr || ''),
    };
  }
}

// ——— Main ———
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        🔄 REGISTRO PANAMÁ — HISTORICAL BACKFILL            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Validate environment
  const hasAPI = !!process.env.INGEST_API_URL && !!process.env.INGEST_SECRET;
  const hasAI = !!process.env.ANTHROPIC_API_KEY;

  if (!DRY_RUN && !hasAPI) {
    console.error('❌ INGEST_API_URL and INGEST_SECRET are required (or use --dry-run)');
    process.exit(1);
  }

  if (!hasAI) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — AI-dependent scrapers will have limited extraction');
    console.warn('   Set it for best results: export ANTHROPIC_API_KEY=sk-ant-...\n');
  }

  // Filter scrapers
  let scrapersToRun;
  if (onlySources) {
    // --only flag: run exactly what the user asked for (including opt-in scrapers)
    scrapersToRun = SCRAPERS.filter(s => onlySources.includes(s.id));
    if (scrapersToRun.length === 0) {
      console.error(`❌ No matching scrapers for: ${onlySources.join(', ')}`);
      console.error(`   Available: ${SCRAPERS.map(s => s.id).join(', ')}`);
      process.exit(1);
    }
  } else {
    // Default: only run scrapers marked defaultEnabled
    // ACODECO already runs weekly + uses expensive PDF Vision, so it's opt-in
    scrapersToRun = SCRAPERS.filter(s => s.defaultEnabled);
    const skippedOptIn = SCRAPERS.filter(s => !s.defaultEnabled);
    if (skippedOptIn.length > 0) {
      console.log(`ℹ️  Opt-in scrapers not included by default:`);
      skippedOptIn.forEach(s => {
        console.log(`   - ${s.name} (use --only ${s.id} to include)`);
      });
      console.log(`   To run everything: node backfill.mjs --only ${SCRAPERS.map(s => s.id).join(',')}`);
      console.log('');
    }
  }

  // Skip AI scrapers if no key
  if (!hasAI) {
    const skipped = scrapersToRun.filter(s => s.needsAI);
    if (skipped.length > 0) {
      console.log(`⏭️  Skipping AI-dependent scrapers (no ANTHROPIC_API_KEY):`);
      skipped.forEach(s => console.log(`   - ${s.name}`));
      console.log('');
      scrapersToRun = scrapersToRun.filter(s => !s.needsAI);
    }
  }

  // Print plan
  console.log(`📋 Backfill plan (${scrapersToRun.length} scrapers):`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (maxPages) console.log(`   Max pages: ${maxPages}`);
  console.log('');

  scrapersToRun.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.name}`);
    console.log(`      ${s.description}`);
    console.log(`      Est. time: ${s.estimatedTime}`);
  });
  console.log('');

  // Run scrapers sequentially
  const results = [];
  const totalStart = Date.now();

  for (let i = 0; i < scrapersToRun.length; i++) {
    const scraper = scrapersToRun[i];
    const progress = `[${i + 1}/${scrapersToRun.length}]`;

    console.log('─'.repeat(60));
    console.log(`${progress} 🚀 Starting: ${scraper.name}`);
    console.log('─'.repeat(60));

    const result = await runScraper(scraper);
    results.push({ scraper, ...result });

    if (result.success) {
      console.log(`\n✅ ${scraper.name} completed in ${formatDuration(result.duration)}`);
      if (result.ingested !== '?') {
        console.log(`   Ingested: ${result.ingested} | Failed: ${result.failed}`);
      }
    } else {
      console.error(`\n❌ ${scraper.name} FAILED after ${formatDuration(result.duration)}`);
      console.error(`   Error: ${result.error}`);
    }
    console.log('');

    // Breather between scrapers (be nice to the servers)
    if (i < scrapersToRun.length - 1) {
      console.log('⏳ Waiting 5s before next scraper...\n');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Summary
  const totalDuration = Date.now() - totalStart;
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalIngested = results.reduce((sum, r) => sum + (typeof r.ingested === 'number' ? r.ingested : 0), 0);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 BACKFILL SUMMARY                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   Total time:    ${formatDuration(totalDuration)}`);
  console.log(`   Scrapers:      ${succeeded} succeeded, ${failed} failed`);
  console.log(`   Total ingested: ${totalIngested} events`);
  console.log('');

  results.forEach(r => {
    const icon = r.success ? '✅' : '❌';
    const stats = r.success
      ? `${formatDuration(r.duration)} | ${r.ingested ?? '?'} ingested`
      : `FAILED: ${r.error?.substring(0, 60)}`;
    console.log(`   ${icon} ${r.scraper.name}: ${stats}`);
  });

  console.log('');

  if (failed > 0) {
    console.log('💡 To re-run only failed scrapers:');
    const failedIds = results.filter(r => !r.success).map(r => r.scraper.id).join(',');
    console.log(`   node backfill.mjs --only ${failedIds}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💀 Backfill runner fatal error:', err);
  process.exit(1);
});
