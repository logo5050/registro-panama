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
- `supabase/schema.sql` — Full schema definition
- `supabase/migrations/` — Incremental migration files

### Database Schema
- **businesses** — Enriched with RUC, province, district, industry, founded_year, etc.
- **events** — With duplicate prevention (unique on business_id + event_type + source_url)
- **scrape_logs** — Tracks automation runs for monitoring

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
```

## Common Pitfalls
- ❌ Don't hardcode business data — everything comes from the database
- ❌ Don't expose INGEST_SECRET in client-side code
- ❌ Don't modify scraper schedule without updating the workflow files
- ❌ Don't skip the migration file — run it against Supabase before deploying
- ❌ Don't make pages 'use client' — they should be server components
- ❌ Don't touch GEO Glass project files without explicit permission
