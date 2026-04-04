@AGENTS.md

# CLAUDE.md — Registro Panamá

## What This Is
Registro Panamá — A public business registry that makes Panamanian company data
easily accessible to AI platforms (ChatGPT, Gemini, Perplexity, Claude).
Complements GEO Glass by providing the structured local data that AI engines need.

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS 4
- Supabase PostgreSQL (shared instance with GEO Glass)
- GitHub Actions for automated scraping (FREE)
- Deploy: Vercel

## Commands
```
npm run dev          # Dev server
npm run build        # Production build
npm run lint         # Lint

# Scrapers (run from /scrapers directory)
cd scrapers && npm install
node acodeco.mjs     # Scrape ACODECO infractions
node news.mjs        # Scrape Panama business news
node judiciary.mjs   # Scrape judiciary rulings
node asep.mjs        # Scrape ASEP utility resolutions (telecom, electricity, water)
node sbp.mjs         # Scrape SBP banking sanctions
node datos-abiertos.mjs  # Scrape ACODECO open data (CSV datasets)

# Backfill: pull historical data (requires ANTHROPIC_API_KEY)
node backfill.mjs                    # Run all scrapers in backfill mode
node backfill.mjs --only asep,sbp    # Run specific scrapers only
node backfill.mjs --dry-run          # Parse without ingesting
node backfill.mjs --max-pages 10     # Limit pagination depth

# Individual scraper backfill (alternative to runner)
node acodeco.mjs --backfill          # Deep crawl ACODECO sections
node asep.mjs --backfill             # Paginate all ASEP categories
node sbp.mjs --backfill              # All years since 2010
node datos-abiertos.mjs --backfill   # All datasets, no event cap
node judiciary.mjs --backfill        # Deep crawl judiciary archive
node news.mjs --backfill             # Archive crawl news outlets
```

## Architecture

### Data Flow
```
GitHub Actions (cron) → Scraper scripts (cheerio)
  → POST /api/ingest-event (Bearer auth)
  → Supabase PostgreSQL (upsert business + insert event)
  → Next.js SSR pages + JSON-LD (Schema.org)
  → AI platforms read structured data
  → GEO Glass queries /api/businesses for audit enrichment
```

### Scraping Schedule (GitHub Actions)
- ACODECO: Every Monday 8am UTC
- News: Wednesday + Saturday 9am UTC
- Judiciary: Every Friday 8am UTC
- ASEP: Every Tuesday 8am UTC (utility resolutions — telecom, electricity, water)
- SBP: 1st of each month 8am UTC (banking sanctions)
- Datos Abiertos: 15th of each month 8am UTC (ACODECO CSV datasets from datosabiertos.gob.pa)
- All can be triggered manually via GitHub UI (workflow_dispatch)

### Key Files
- `src/app/api/ingest-event/route.ts` — Data ingestion endpoint (POST, Bearer auth)
- `src/app/api/businesses/route.ts` — Public JSON API (list, search, filter)
- `src/app/api/businesses/[slug]/route.ts` — Business detail JSON API
- `src/app/sitemap.ts` — Dynamic sitemap for all businesses
- `src/app/robots.ts` — AI-crawler-friendly robots.txt
- `src/app/page.tsx` — Homepage (server component)
- `src/app/registro/[slug]/page.tsx` — Business detail page (server component)
- `scrapers/` — Node.js scraper scripts + shared ingestion library
- `scrapers/backfill.mjs` — Orchestrator for historical data backfill (runs all scrapers with --backfill)
- `scrapers/lib/extract-entity.mjs` — AI entity extraction (Claude Haiku + Vision for PDFs)
- `supabase/schema.sql` — Full schema definition
- `supabase/migrations/` — Incremental migration files

### Database Schema
- **businesses** — Enriched with RUC, province, district, industry, founded_year, etc.
- **events** — With duplicate prevention (unique on business_id + event_type + source_url). Has `sector` column for cross-source categorization.
- **scrape_logs** — Tracks automation runs for monitoring. Includes `scraper_version` field.

### Event Types
- `acodeco_infraction` — ACODECO sanctions and infractions (HTML scrape)
- `court_ruling` — Judiciary rulings involving businesses
- `news_mention` — Business mentions in Panamanian news
- `license_granted` / `license_revoked` — Business license changes
- `ownership_change` — Changes in business ownership
- `sanction` — General sanctions
- `geo_audit_passed` — GEO Glass audit completion
- `asep_resolution` — ASEP utility resolutions (telecom, electricity, water)
- `sbp_sanction` — Superintendencia de Bancos banking sanctions
- `acodeco_open_data` — ACODECO datasets from Panama's Open Data Portal (CKAN API)

### Data Sources
| Source | URL | Type | Frequency |
|--------|-----|------|-----------|
| ACODECO (HTML) | supermarket.gob.pa | HTML scrape (cheerio) | Weekly |
| Judiciary | organojudicial.gob.pa | HTML scrape (cheerio) | Weekly |
| News | Various Panamanian outlets | HTML scrape (cheerio) | 2x/week |
| ASEP | asep.gob.pa/category/resoluciones/ | HTML scrape (cheerio) | Weekly |
| SBP | superbancos.gob.pa/sanciones | HTML table scrape (cheerio) | Monthly |
| Datos Abiertos | datosabiertos.gob.pa (CKAN API) | CSV download + parse | Monthly |

## Critical Rules
- **Server components by default.** 'use client' only when needed.
- **All data comes from Supabase.** No hardcoded business data.
- **Ingest API requires Bearer token.** Never expose INGEST_SECRET client-side.
- **Scrapers run in /scrapers directory** with their own package.json.
- **Duplicate events are prevented** by the unique constraint on events table.
- **Schema.org JSON-LD on every business page** for AI discoverability.
- **robots.txt explicitly welcomes AI crawlers** (GPTBot, ClaudeBot, etc.)
- **Spanish is the primary language**, English secondary. Both on every page.

## GEO Glass Integration
- GEO Glass can query `GET /api/businesses?status=verified` during audits
- GEO Glass can query `GET /api/businesses/[slug]` for detailed business data
- Response includes Schema.org structured data for direct use
- Shared Supabase instance allows direct DB queries if needed

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
INGEST_SECRET=...
NEXT_PUBLIC_SITE_URL=https://registro-panama.vercel.app
```

### GitHub Actions Secrets (set in repo settings)
```
INGEST_API_URL=https://registro-panama.vercel.app/api/ingest-event
INGEST_SECRET=<same as .env.local>
ANTHROPIC_API_KEY=<optional, enables AI entity extraction in ASEP scraper>
```

## Common Pitfalls
- ❌ Don't hardcode business data — everything comes from the database
- ❌ Don't expose INGEST_SECRET in client-side code
- ❌ Don't modify scraper schedule without updating the workflow files
- ❌ Don't skip the migration file — run it against Supabase before deploying
- ❌ Don't make pages 'use client' — they should be server components
- ❌ Don't touch GEO Glass project files without explicit permission
